$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'installer\Bootstrap.ps1') -LibraryOnly
function Assert($Condition,$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure($Action,$Message) { $failed=$false; try { & $Action | Out-Null } catch { $failed=$true }; Assert $failed $Message }
$zip=Join-Path $root 'releases\ReactionLibrary-Windows-Setup.zip'
$launcher=Join-Path $root 'releases\ReactionLibrary-Setup.exe'
$assembly=[Reflection.Assembly]::LoadFile($launcher)
Assert ('ReactionLibrary.Bootstrap.ps1' -in $assembly.GetManifestResourceNames()) 'The executable does not contain its bootstrap script.'
$launcherSource=Get-Content -LiteralPath (Join-Path $root 'installer\Launcher.cs') -Raw
Assert ($launcherSource.Contains('FileMode.CreateNew') -and $launcherSource.Contains('-File ') -and -not $launcherSource.Contains('-EncodedCommand')) 'The launcher must run the embedded bootstrap from a temporary file, not exceed the Windows command-line limit.'
Assert ($launcherSource.Contains('-DownloadOnly') -and $launcherSource.Contains('-Inspect') -and $launcherSource.Contains('-Worker')) 'The EXE must own download, review, and worker progress.'
Add-Type -AssemblyName System.Windows.Forms
$form=[Activator]::CreateInstance($assembly.GetType('LauncherForm'),$true)
try {
    $captions=@($form.Controls | ForEach-Object { $_.Text }) -join '|'
    Assert ($captions -match 'Revisar / Instalar|Review / Install' -and $captions -match 'Restaurar instalação anterior|Restore previous installation') 'The EXE has no install and restore controls.'
} finally { $form.Dispose() }
$digest='sha256:'+((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant())
Assert-Hash $zip $digest
Expect-Failure { Assert-Hash $zip ('sha256:' + ('0'*64)) } 'Changed ZIP passed its digest check.'
$scratch=Join-Path $root ('.preview\bootstrap-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$package=Expand-CheckedPackage $zip (Join-Path $scratch 'valid')
Assert (Test-Path -LiteralPath (Join-Path $package 'reactionLibrary\index.tsx')) 'Plugin entry point was not extracted.'
Assert (Test-Path -LiteralPath (Join-Path $package 'Bootstrap.ps1')) 'Bootstrap script was not extracted.'
Assert (-not @(Get-ChildItem -LiteralPath $package -Recurse -Filter '*.cmd' -File).Count) 'The EXE-only package includes a command launcher.'
$badZip=Join-Path $scratch 'traversal.zip'
$stream=[IO.File]::Open($badZip,[IO.FileMode]::CreateNew)
$archive=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Create)
try { $entry=$archive.CreateEntry('ReactionLibrary-Setup/../escape.txt'); $writer=New-Object IO.StreamWriter($entry.Open()); try { $writer.Write('bad') } finally { $writer.Dispose() } } finally { $archive.Dispose(); $stream.Dispose() }
Expect-Failure { Expand-CheckedPackage $badZip (Join-Path $scratch 'bad') } 'Traversal ZIP was accepted.'
$release=[pscustomobject]@{tag_name='v1.0.0';assets=@([pscustomobject]@{name=$zipName;state='uploaded';size=100;digest=$digest;browser_download_url=($assetBase+'v1.0.0/'+$zipName)})}
Assert ((Get-ReleaseAsset $release $zipName).digest -eq $digest) 'Valid release metadata was rejected.'
$release.assets[0].browser_download_url='https://example.test/malicious.zip'
Expect-Failure { Get-ReleaseAsset $release $zipName } 'Off-repository release URL was accepted.'
$hashFile=Join-Path $root 'releases\ReactionLibrary-Windows-Setup.zip.sha256'
$script:fixtureZip=$zip
$script:fixtureHashFile=$hashFile
$script:mockRelease=[pscustomobject]@{tag_name='v1.0.0';draft=$false;prerelease=$false;assets=@(
    [pscustomobject]@{name=$zipName;state='uploaded';size=(Get-Item $zip).Length;digest=$digest;browser_download_url=($assetBase+'v1.0.0/'+$zipName)},
    [pscustomobject]@{name=$hashName;state='uploaded';size=(Get-Item $hashFile).Length;digest=('sha256:'+((Get-FileHash $hashFile -Algorithm SHA256).Hash.ToLowerInvariant()));browser_download_url=($assetBase+'v1.0.0/'+$hashName)}
)}
function Invoke-RestMethod { param($Uri,$Headers,[switch]$UseBasicParsing,$TimeoutSec); return $script:mockRelease }
function Invoke-WebRequest { param($Uri,$Headers,[switch]$UseBasicParsing,$OutFile,$TimeoutSec); Copy-Item -LiteralPath $(if($Uri.EndsWith($hashName)){$script:fixtureHashFile}else{$script:fixtureZip}) -Destination $OutFile }
$setupBase=Join-Path $scratch 'managed'
Invoke-LatestSetup -ValidateOnly
Assert (-not @(Get-ChildItem -LiteralPath (Join-Path $setupBase 'updates') -Directory).Count) 'Validated download left temporary files.'
$DownloadOnly=$true
$ResultPath=Join-Path $scratch 'download-result.json'
Invoke-LatestSetup
$downloaded=Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
Assert ((Test-Path -LiteralPath (Join-Path $downloaded.package 'Setup.ps1')) -and $downloaded.publisher -eq 'unsigned') 'Download-only mode did not retain a verified setup package.'
$inspectJob=Join-Path $scratch 'inspect'
New-Item -ItemType Directory -Path $inspectJob -Force|Out-Null
'{"action":"detect"}'|Set-Content -LiteralPath (Join-Path $inspectJob 'request.json') -Encoding UTF8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $downloaded.package 'Setup.ps1') -Inspect -JobDirectory $inspectJob -Language pt-BR
Assert ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path $inspectJob 'response.json'))) 'Background setup inspection failed.'
Assert ((Get-Content -LiteralPath (Join-Path $inspectJob 'response.json') -Raw | ConvertFrom-Json).PSObject.Properties.Name -contains 'targets') 'The EXE did not receive detected Discord targets.'
Write-Output 'PASS: release metadata, SHA-256 checks, package inventory, traversal refusal, retained download, and background inspection.'
