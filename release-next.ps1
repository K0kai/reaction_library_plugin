# SPDX-License-Identifier: GPL-3.0-or-later
# Builds, verifies, commits, tags, pushes, and publishes the next patch release.
param(
    [string]$CommitMessage,
    [string]$NotesFile,
    [string]$Tag,
    [switch]$Resume,
    [switch]$Public,
    [string]$AcceptanceRecord,
    [string]$SigningCertificateThumbprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required. Run this script with pwsh, not powershell.exe.' }
$script:root = $PSScriptRoot
Set-Location -LiteralPath $script:root
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($Public -and (-not $AcceptanceRecord -or -not (Test-Path -LiteralPath $AcceptanceRecord))) {
    throw 'A public release requires -AcceptanceRecord pointing to the completed Windows VM acceptance record.'
}

function Run([string]$program, [string[]]$arguments) {
    & $program @arguments
    if ($LASTEXITCODE -ne 0) { throw "$program failed with exit code $LASTEXITCODE." }
}

function Github([string]$method, [string]$uri, $body = $null, [string]$file = '', [string]$contentType = '') {
    $params = @{ Method = $method; Uri = $uri; Headers = $script:headers; ErrorAction = 'Stop' }
    if ($null -ne $body) {
        $params.Body = ConvertTo-Json -InputObject $body -Depth 12
        $params.ContentType = 'application/json'
    }
    if ($file) {
        $params.InFile = $file
        $params.ContentType = $contentType
    }
    Invoke-RestMethod @params
}

function GithubCredential {
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'
    $lines = "protocol=https`nhost=github.com`n`n" | & git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'Git Credential Manager could not supply a GitHub credential.' }
    $password = @($lines | Where-Object { $_ -like 'password=*' } | Select-Object -First 1)
    if ($password.Count -ne 1) { throw 'No GitHub credential is available. Sign in with Git Credential Manager first.' }
    return $password[0].Substring(9)
}

function GitOutput([string[]]$arguments) {
    $output = & git @arguments
    if ($LASTEXITCODE -ne 0) { throw "git $($arguments -join ' ') failed." }
    return $output
}

function NextTag([string[]]$knownTags) {
    $versions = foreach ($known in $knownTags) {
        if ($known -match '^(v?)(\d+)\.(\d+)\.(\d+)$') {
            [pscustomobject]@{ Prefix = $Matches[1]; Version = [version]::new([int]$Matches[2], [int]$Matches[3], [int]$Matches[4]) }
        }
    }
    if (-not $versions) { throw 'No semantic version tag exists. Supply -Tag explicitly for the first release.' }
    $latest = $versions | Sort-Object Version -Descending | Select-Object -First 1
    return '{0}{1}.{2}.{3}' -f $latest.Prefix, $latest.Version.Major, $latest.Version.Minor, ($latest.Version.Build + 1)
}

$branch = (GitOutput @('branch', '--show-current') | Select-Object -First 1).Trim()
if ($branch -ne 'main') { throw "Release from main, not '$branch'." }
$remote = (GitOutput @('remote', 'get-url', 'origin') | Select-Object -First 1).Trim()
if ($remote -notmatch 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$') { throw 'origin must be a GitHub repository.' }
$repo = "$($Matches.owner)/$($Matches.repo)"
$api = "https://api.github.com/repos/$repo"
$token = GithubCredential
$script:headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'ReactionLibrary-Release'; 'X-GitHub-Api-Version' = '2022-11-28' }
Remove-Variable token

$releases = @(Github 'GET' "$api/releases?per_page=100")
if ($releases.Count -eq 1 -and $releases[0] -is [array]) { $releases = @($releases[0]) }
$remoteTags = @(GitOutput @('ls-remote', '--tags', 'origin') | ForEach-Object {
    if ($_ -match 'refs/tags/([^\^]+)$') { $Matches[1] }
})
if (-not $Tag) { $Tag = NextTag @($remoteTags + @($releases | ForEach-Object { $_.tag_name })) }
if ($Tag -notmatch '^v?\d+\.\d+\.\d+$') { throw 'Tag must be a numeric semantic version such as 1.0.3.' }
$existingRelease = @($releases | Where-Object tag_name -eq $Tag | Select-Object -First 1)
$existingTag = $Tag -in $remoteTags
if ($Resume) {
    if (-not $existingTag) { throw "Cannot resume: tag $Tag is not on origin." }
    if ($existingRelease.Count -and -not $existingRelease[0].draft) { throw "Release $Tag is already published." }
    if (GitOutput @('status', '--porcelain')) { throw 'The working tree must be clean to resume a release.' }
    $tagCommit = (GitOutput @('rev-list', '-n', '1', $Tag) | Select-Object -First 1).Trim()
    $head = (GitOutput @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    if ($tagCommit -ne $head) { throw "Tag $Tag does not point at HEAD." }
} else {
    if ($existingTag -or $existingRelease.Count) { throw "Tag or release $Tag already exists. Use -Resume only for an unpublished draft." }
    Write-Output "Preparing $Tag from $branch."
    $eslint = Join-Path $script:root '..\Equicord\node_modules\eslint\bin\eslint.js'
    if (-not (Test-Path -LiteralPath $eslint)) { throw 'Install the adjacent Equicord development dependencies first.' }
    Run 'node' @('build.mjs')
    Run 'node' @('check.mjs')
    Run 'node' @($eslint, 'src/*.js')
    Run 'node' @('--test', 'test/*.test.cjs')
    foreach ($test in @('installer.test.ps1', 'installer-storage.test.ps1', 'installer-bootstrap.test.ps1')) {
        Run 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "test/$test")
    }
    $packageArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'package-windows.ps1')
    if ($SigningCertificateThumbprint) { $packageArgs += @('-SigningCertificateThumbprint', $SigningCertificateThumbprint) }
    Run 'powershell' $packageArgs
    Run 'git' @('add', '-A')
    Run 'git' @('diff', '--cached', '--check')
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { throw 'There are no changes to release.' }
    if ($LASTEXITCODE -ne 1) { throw 'Could not inspect staged changes.' }
    if (-not $CommitMessage) { $CommitMessage = "Release $Tag" }
    Run 'git' @('commit', '-m', $CommitMessage)
    Run 'git' @('push', 'origin', $branch)
    Run 'git' @('tag', '-a', $Tag, '-m', "Reaction Library $Tag")
    Run 'git' @('push', 'origin', $Tag)
}

$notes = if ($NotesFile) { Get-Content -LiteralPath $NotesFile -Raw } else { $CommitMessage }
if (-not $notes) { $notes = "Reaction Library $Tag" }
if (-not $Public) { $notes += "`n`nPreview release: the clean Windows VM acceptance cycle in installer/RELEASING.md has not been recorded for this release." }
$release = if ($existingRelease.Count) { $existingRelease[0] } else {
    Github 'POST' "$api/releases" @{ tag_name = $Tag; target_commitish = $branch; name = $Tag; body = $notes; draft = $true; prerelease = (-not $Public) }
}
$assets = @('ReactionLibrary-Setup.exe', 'ReactionLibrary-Setup.exe.sha256', 'ReactionLibrary-Windows-Setup.zip', 'ReactionLibrary-Windows-Setup.zip.sha256')
if ($SigningCertificateThumbprint) { $assets += @('ReactionLibrary-Windows-Setup.zip.p7s', 'Verify-Release.ps1') }
foreach ($name in $assets) {
    $file = Join-Path $script:root "releases\$name"
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing release asset: $file" }
    if (@($release.assets | Where-Object name -eq $name).Count) { continue }
    $type = if ($name -like '*.zip') { 'application/zip' } elseif ($name -like '*.sha256' -or $name -like '*.ps1') { 'text/plain' } else { 'application/octet-stream' }
    $upload = $release.upload_url.Split('{')[0] + '?name=' + [uri]::EscapeDataString($name)
    $null = Github 'POST' $upload $null $file $type
    Write-Output "Uploaded $name"
}
$release = Github 'GET' "$api/releases/$($release.id)"
foreach ($name in $assets) {
    $asset = @($release.assets | Where-Object name -eq $name | Select-Object -First 1)
    if (-not $asset.Count) { throw "Release draft is missing $name." }
    $hash = (Get-FileHash -LiteralPath (Join-Path $script:root "releases\$name") -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($asset[0].digest -ne "sha256:$hash") { throw "GitHub's asset digest does not match $name. The release remains a draft." }
}
$release = Github 'PATCH' "$api/releases/$($release.id)" @{ draft = $false; prerelease = (-not $Public) }
Write-Output "Published $Tag at $($release.html_url)"
