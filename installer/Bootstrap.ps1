# SPDX-License-Identifier: GPL-3.0-or-later
param([ValidateSet('en','pt-BR')][string]$Language = 'en', [string]$LauncherPath, [switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$releaseApi = 'https://api.github.com/repos/K0kai/reaction_library_plugin/releases/latest'
$assetBase = 'https://github.com/K0kai/reaction_library_plugin/releases/download/'
$zipName = 'ReactionLibrary-Windows-Setup.zip'
$hashName = "$zipName.sha256"
$setupBase = Join-Path $env:LOCALAPPDATA 'ReactionLibrarySetup'
$trustedPublisher = $null
if (-not $LibraryOnly) {
    $entryPath = if ($LauncherPath) { $LauncherPath } else { $MyInvocation.MyCommand.Path }
    if ($entryPath) {
        $entrySignature = Get-AuthenticodeSignature -LiteralPath $entryPath
        if ($entrySignature.Status -eq 'Valid') { $trustedPublisher = $entrySignature.SignerCertificate.Thumbprint }
        elseif ($entrySignature.Status -ne 'NotSigned') { throw 'The launcher signature is invalid or untrusted.' }
    }
}

function Assert-OrdinaryDirectory($Path) {
    $item = Get-Item -LiteralPath $Path -Force
    while ($item) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "A linked update folder is not supported: $($item.FullName)" }
        $item = $item.Parent
    }
}
function Remove-UpdateEntry($Entry) {
    if ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $Entry.Delete(); return }
    if ($Entry -is [IO.DirectoryInfo]) { foreach ($child in $Entry.GetFileSystemInfos()) { Remove-UpdateEntry $child } }
    elseif ($Entry.IsReadOnly) { $Entry.IsReadOnly = $false }
    $Entry.Delete()
}

function Get-ReleaseAsset($Release, $Name) {
    $matches = @($Release.assets | Where-Object { $_.name -ceq $Name })
    if ($matches.Count -ne 1) { throw "The latest release must contain exactly one $Name asset." }
    $asset = $matches[0]
    if ($asset.state -ne 'uploaded' -or $asset.size -lt 1 -or $asset.size -gt 100MB) { throw "Invalid release asset: $Name" }
    if ($asset.digest -cnotmatch '^sha256:([0-9a-f]{64})$') { throw "The release does not provide a SHA-256 digest for $Name." }
    $expectedUrl = $assetBase + [Uri]::EscapeDataString($Release.tag_name) + '/' + $Name
    if ($asset.browser_download_url -cne $expectedUrl) { throw "Unexpected release download address for $Name." }
    return $asset
}
function Assert-Hash($Path, $Digest) {
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Digest -cnotmatch '^sha256:([0-9a-f]{64})$' -or $actual -cne $Matches[1]) { throw "Release checksum mismatch: $([IO.Path]::GetFileName($Path))" }
}
function Expand-CheckedPackage($ZipPath, $Destination) {
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $total = 0L
    try {
        if ($archive.Entries.Count -gt 100) { throw 'The setup ZIP contains too many entries.' }
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\','/')
            if (-not $name.StartsWith('ReactionLibrary-Setup/',[StringComparison]::Ordinal)) { throw "Unexpected path in setup ZIP: $name" }
            $relative = $name.Substring('ReactionLibrary-Setup/'.Length)
            if (-not $relative) { continue }
            $directory = $relative.EndsWith('/')
            $parts = @($relative.TrimEnd('/').Split('/'))
            if ($parts | Where-Object { -not $_ -or $_ -eq '.' -or $_ -eq '..' -or $_ -match '[<>:"|?*\x00-\x1f]' -or $_ -match '[. ]$' -or $_ -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)' }) { throw "Unsafe path in setup ZIP: $name" }
            if (-not $seen.Add($relative.TrimEnd('/'))) { throw "Duplicate path in setup ZIP: $name" }
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw "Link in setup ZIP: $name" }
            $total += $entry.Length
            if ($entry.Length -gt 100MB -or $total -gt 200MB) { throw 'The setup ZIP exceeds the extraction limit.' }
            $target = Join-Path $Destination ($parts -join [IO.Path]::DirectorySeparatorChar)
            $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
            if (-not [IO.Path]::GetFullPath($target).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw "Path escaped the setup folder: $name" }
            if ($directory) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target)
        }
    } finally { $archive.Dispose() }
    $package = $Destination
    $inventoryPath = Join-Path $package 'payload-hashes.json'
    if (-not (Test-Path -LiteralPath $inventoryPath -PathType Leaf)) { throw 'The setup ZIP has no payload inventory.' }
    $inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
    $files = @(Get-ChildItem -LiteralPath $package -Recurse -File)
    if ($files.Count -ne @($inventory.PSObject.Properties).Count + 1) { throw 'The setup ZIP contains unlisted or missing files.' }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($package.Length + 1)
        if ($relative -eq 'payload-hashes.json') { continue }
        $expected = $inventory.PSObject.Properties[$relative]
        if (-not $expected -or $expected.Value -cnotmatch '^[0-9a-f]{64}$') { throw "Unlisted file in setup ZIP: $relative" }
        if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected.Value) { throw "Changed file in setup ZIP: $relative" }
    }
    foreach ($required in @('Setup.ps1','Safety.ps1','reactionLibrary\index.tsx')) {
        if (-not (Test-Path -LiteralPath (Join-Path $package $required) -PathType Leaf)) { throw "The setup ZIP is missing $required." }
    }
    return $package
}
function Confirm-ReleasePublisher($Package) {
    $scripts = @('Setup.ps1','Safety.ps1','Bootstrap.ps1')
    $signatures = @($scripts | ForEach-Object { Get-AuthenticodeSignature -LiteralPath (Join-Path $Package $_) })
    if (@($signatures | Where-Object { $_.Status -eq 'Valid' }).Count -eq $scripts.Count) {
        $thumbprints = @($signatures | ForEach-Object { $_.SignerCertificate.Thumbprint } | Select-Object -Unique)
        if ($thumbprints.Count -ne 1) { throw 'The release scripts have different publishers.' }
        if ($trustedPublisher -and $thumbprints[0] -ne $trustedPublisher) { throw 'The release is not signed by the launcher publisher.' }
        if (-not $trustedPublisher) {
            Add-Type -AssemblyName System.Windows.Forms
            $subject = $signatures[0].SignerCertificate.Subject
            $message = if ($Language -eq 'pt-BR') { "Publicador verificado pelo Windows: $subject`r`nConfiar neste publicador e executar o instalador?" } else { "Windows verified this publisher: $subject`r`nTrust this publisher and run the setup?" }
            $title = if ($Language -eq 'pt-BR') { 'Confirmar publicador' } else { 'Confirm publisher' }
            if ([Windows.Forms.MessageBox]::Show($message,$title,'YesNo','Question') -ne 'Yes') { throw 'The publisher was not approved.' }
        }
        return
    }
    if ($trustedPublisher) { throw 'The signed launcher requires release scripts signed by the same publisher.' }
    if (@($signatures | Where-Object { $_.Status -ne 'NotSigned' }).Count) { throw 'A release script has an invalid or untrusted signature.' }
    Add-Type -AssemblyName System.Windows.Forms
    $message = if ($Language -eq 'pt-BR') {
        'Esta versão não tem assinatura de publicador. Os hashes do GitHub e do ZIP conferem, mas não comprovam a identidade do autor separadamente. Executar o instalador baixado?'
    } else {
        'This release has no publisher signature. The GitHub and ZIP hashes match, but they do not independently prove the author. Run the downloaded setup?'
    }
    $title = if ($Language -eq 'pt-BR') { 'Versão sem assinatura' } else { 'Unsigned release' }
    if ([Windows.Forms.MessageBox]::Show($message,$title,'YesNo','Warning') -ne 'Yes') { throw 'The unsigned release was not approved.' }
}
function Invoke-LatestSetup([switch]$ValidateOnly) {
    $headers = @{ Accept='application/vnd.github+json'; 'User-Agent'='ReactionLibrarySetup'; 'X-GitHub-Api-Version'='2022-11-28' }
    $release = Invoke-RestMethod -Uri $releaseApi -Headers $headers -UseBasicParsing -TimeoutSec 60
    if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$') { throw 'The latest GitHub release metadata is invalid.' }
    $zipAsset = Get-ReleaseAsset $release $zipName
    $hashAsset = Get-ReleaseAsset $release $hashName
    $updatesRoot = Join-Path $setupBase 'updates'
    New-Item -ItemType Directory -Path $updatesRoot -Force | Out-Null
    Assert-OrdinaryDirectory $updatesRoot
    $work = Join-Path $updatesRoot ([Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        $zip = Join-Path $work $zipName
        $hashFile = Join-Path $work $hashName
        Invoke-WebRequest -Uri $zipAsset.browser_download_url -Headers $headers -UseBasicParsing -OutFile $zip -TimeoutSec 300
        Invoke-WebRequest -Uri $hashAsset.browser_download_url -Headers $headers -UseBasicParsing -OutFile $hashFile -TimeoutSec 60
        if ((Get-Item -LiteralPath $zip).Length -ne $zipAsset.size -or (Get-Item -LiteralPath $hashFile).Length -ne $hashAsset.size) { throw 'A downloaded release asset has the wrong size.' }
        Assert-Hash $zip $zipAsset.digest
        Assert-Hash $hashFile $hashAsset.digest
        $line = (Get-Content -LiteralPath $hashFile -Raw).Trim()
        if ($line -cnotmatch ('^([0-9a-f]{64})  ' + [regex]::Escape($zipName) + '$') -or $Matches[1] -cne (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'The published SHA-256 file does not match the setup ZIP.' }
        $package = Expand-CheckedPackage $zip (Join-Path $work 'extracted')
        if ($ValidateOnly) { return }
        Confirm-ReleasePublisher $package
        Write-Output "Verified GitHub release $($release.tag_name). Opening its setup."
        & (Join-Path $package 'Setup.ps1') -Language $Language
    } finally {
        $root = [IO.Path]::GetFullPath($updatesRoot).TrimEnd('\') + '\'
        $target = [IO.Path]::GetFullPath($work)
        if ($target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $target)) {
            Assert-OrdinaryDirectory $updatesRoot
            Remove-UpdateEntry (Get-Item -LiteralPath $target -Force)
        }
    }
}

if (-not $LibraryOnly) {
    try { Invoke-LatestSetup }
    catch {
        Add-Type -AssemblyName System.Windows.Forms
        $title = if ($Language -eq 'pt-BR') { 'Atualização interrompida' } else { 'Update stopped' }
        [Windows.Forms.MessageBox]::Show($_.Exception.Message,$title) | Out-Null
        exit 1
    }
}
