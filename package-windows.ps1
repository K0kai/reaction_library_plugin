# SPDX-License-Identifier: GPL-3.0-or-later
param([string]$SigningCertificateThumbprint)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$releaseRoot = Join-Path $root 'releases'
$stage = Join-Path $root ('.preview\windows-package-' + [Guid]::NewGuid().ToString('N'))
$package = Join-Path $stage 'ReactionLibrary-Setup'
New-Item -ItemType Directory -Path $package -Force | Out-Null
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$launcher = Join-Path $releaseRoot 'ReactionLibrary-Setup.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is required to package the launcher.' }
& $compiler /nologo /target:winexe /platform:x64 "/out:$launcher" "/resource:$(Join-Path $root 'installer\Bootstrap.ps1'),ReactionLibrary.Bootstrap.ps1" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $root 'installer\Launcher.cs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcher)) { throw 'The Windows launcher could not be built.' }
foreach ($file in @('Bootstrap.ps1','Setup.ps1','Safety.ps1','toolchain.json','README.txt','README.pt-BR.txt')) {
    Copy-Item -LiteralPath (Join-Path $root "installer\$file") -Destination $package
}
Copy-Item -LiteralPath (Join-Path $root 'vencord\reactionLibrary') -Destination $package -Recurse
$certificate = $null
if ($SigningCertificateThumbprint) {
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$SigningCertificateThumbprint"
    if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -lt (Get-Date) -or '1.3.6.1.5.5.7.3.3' -notin $certificate.EnhancedKeyUsageList.ObjectId.Value) { throw 'A valid code-signing certificate with its private key is required.' }
    foreach ($script in Get-ChildItem -LiteralPath $package -Filter '*.ps1') {
        $signature = Set-AuthenticodeSignature -LiteralPath $script.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
        if ($signature.Status -ne 'Valid') { throw "Signing failed: $($script.Name): $($signature.StatusMessage)" }
    }
    $launcherSignature = Set-AuthenticodeSignature -LiteralPath $launcher -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
    if ($launcherSignature.Status -ne 'Valid') { throw "Launcher signing failed: $($launcherSignature.StatusMessage)" }
}
Copy-Item -LiteralPath $launcher -Destination $package
$inventory = @{}
foreach ($file in Get-ChildItem -LiteralPath $package -Recurse -File) {
    $relative = $file.FullName.Substring($package.Length + 1)
    $inventory[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$inventory | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'payload-hashes.json') -Encoding UTF8
$output = Join-Path $releaseRoot 'ReactionLibrary-Windows-Setup.zip'
Compress-Archive -LiteralPath $package -DestinationPath $output -Force
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  ReactionLibrary-Windows-Setup.zip" | Set-Content -LiteralPath "$output.sha256" -Encoding ASCII
$launcherHash = (Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash.ToLowerInvariant()
"$launcherHash  ReactionLibrary-Setup.exe" | Set-Content -LiteralPath "$launcher.sha256" -Encoding ASCII
if ($certificate) {
    Add-Type -AssemblyName System.Security
    $content = New-Object Security.Cryptography.Pkcs.ContentInfo -ArgumentList (,[IO.File]::ReadAllBytes($output))
    $cms = New-Object Security.Cryptography.Pkcs.SignedCms -ArgumentList $content,$true
    $signer = New-Object Security.Cryptography.Pkcs.CmsSigner -ArgumentList $certificate
    $signer.DigestAlgorithm = New-Object Security.Cryptography.Oid('2.16.840.1.101.3.4.2.1')
    $cms.ComputeSignature($signer)
    [IO.File]::WriteAllBytes("$output.p7s", $cms.Encode())
    Write-Output "Signed with publisher certificate $($certificate.Thumbprint)"
} elseif (Test-Path -LiteralPath "$output.p7s") {
    Remove-Item -LiteralPath "$output.p7s"
}
Copy-Item -LiteralPath (Join-Path $root 'installer\Verify-Release.ps1') -Destination (Join-Path $releaseRoot 'Verify-Release.ps1') -Force
Write-Output "Created $output"
