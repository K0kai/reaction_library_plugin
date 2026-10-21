$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $root ('.preview\installer-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
. (Join-Path $root 'installer\Setup.ps1') -LibraryOnly
$base=Join-Path $scratch 'managed'
New-Item -ItemType Directory -Path $base -Force | Out-Null
$manifest=Read-Json (Join-Path $root 'installer\toolchain.json')
$env:VENCORD_USER_DATA_DIR=$null
$env:DISCORD_USER_DATA_DIR=$null
$env:APPDATA=Join-Path $scratch 'roaming'
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Expect-Failure($Action,$Message){$failed=$false;try{&$Action|Out-Null}catch{$failed=$true};Assert $failed $Message}
$node=(Get-Command node.exe).Source
$native=Join-Path $scratch 'native.cjs'
'process.stderr.write("warning");process.exit(Number(process.argv[2]))'|Set-Content -LiteralPath $native
Run $node @($native,'0') $scratch|Out-Null
Expect-Failure {Run $node @($native,'7') $scratch} 'Native failure was swallowed.'

function Write-LoaderFixture($Resources,$Dist) {
    New-Item -ItemType Directory -Path $Resources -Force|Out-Null
    $index='require('+($Dist+'\patcher.js'|ConvertTo-Json -Compress)+')'
    $textBytes=[Text.Encoding]::UTF8.GetBytes($index)
    $header=@{files=@{'index.js'=@{size=$textBytes.Length;offset='0'}}}|ConvertTo-Json -Depth 5 -Compress
    $headerBytes=[Text.Encoding]::UTF8.GetBytes($header)
    $aligned=($headerBytes.Length+3)-band(-bnot 3)
    $stream=New-Object IO.MemoryStream
    $writer=New-Object IO.BinaryWriter($stream)
    foreach($number in @(4,($aligned+8),($aligned+4),$headerBytes.Length)){$writer.Write([int]$number)}
    $writer.Write($headerBytes)
    for($i=$headerBytes.Length;$i -lt $aligned;$i++){$writer.Write([byte]0)}
    $writer.Write($textBytes);$writer.Flush()
    [IO.File]::WriteAllBytes((Join-Path $Resources 'app.asar'),$stream.ToArray())
    $writer.Dispose();$stream.Dispose()
    'original Discord archive'|Set-Content -LiteralPath (Join-Path $Resources '_app.asar')
}
function Write-DistFixture($Path,$Marker,$Custom=$false) {
    New-Item -ItemType Directory -Path $Path -Force|Out-Null
    "// Vencord $($manifest.vencordCommit.Substring(0,7))`n$Marker"|Set-Content -LiteralPath (Join-Path $Path 'patcher.js')
    foreach($file in @('renderer.js','preload.js','renderer.css')){$Marker|Set-Content -LiteralPath (Join-Path $Path $file)}
    $sources=@('../src/plugins/fakeNitro/index.tsx')
    if($Custom){$sources+= '../src/userplugins/friend/index.ts'}
    Save-Json (Join-Path $Path 'renderer.js.map') @{sources=$sources}
}
$dist=Join-Path $scratch 'existing\dist'
$resources=Join-Path $scratch 'Discord\app-1.0.0\resources'
Write-DistFixture $dist 'original-build'
Write-LoaderFixture $resources $dist
$settings=Join-Path $env:APPDATA 'Vencord\settings'
$themes=Join-Path $env:APPDATA 'Vencord\themes'
New-Item -ItemType Directory -Path $settings,$themes -Force|Out-Null
'enabled-builtins'|Set-Content -LiteralPath (Join-Path $settings 'settings.json')
'my-theme'|Set-Content -LiteralPath (Join-Path $themes 'custom.css')
$plan=Get-Plan $resources '' $manifest
Assert ((Plan-Summary $plan 'pt-BR') -match 'Configurações e temas permanecem') 'Portuguese installation summary is missing.'
Assert ($plan.dist -eq $dist) 'Wrong build detected.'
Assert ($plan.oldHash -eq $manifest.vencordCommit.Substring(0,7)) 'Version detection failed.'
$originalHashes=Tree-Hashes $dist
$originalLoaderHash=(Get-FileHash -LiteralPath (Join-Path $resources 'app.asar')).Hash
function Get-Process {return @([pscustomobject]@{ProcessName='Discord'})}
Expect-Failure {Assert-DiscordClosed} 'Running Discord should block installation.'
function Get-Process {return @()}
$unknown=Join-Path $scratch 'unknown-resources'
New-Item -ItemType Directory -Path $unknown -Force|Out-Null
Expect-Failure {Get-Plan $unknown '' $manifest} 'Unknown loader should be refused.'
Write-DistFixture $dist 'original-build' $true
Expect-Failure {Get-Plan $resources '' $manifest} 'Custom plugins without source should be refused.'
$source=Join-Path $scratch 'source'
New-Item -ItemType Directory -Path (Join-Path $source 'src\plugins'),(Join-Path $source 'src\userplugins\friend') -Force|Out-Null
'friend plugin source'|Set-Content -LiteralPath (Join-Path $source 'src\userplugins\friend\index.ts')
'{"packageManager":"pnpm@11.9.0"}'|Set-Content -LiteralPath (Join-Path $source 'package.json')
Save-Json (Join-Path $source 'tested-toolchain.json') $manifest
'local modification'|Set-Content -LiteralPath (Join-Path $source 'my-local-file.txt')
$customPlan=Get-Plan $resources $source $manifest
Assert ($customPlan.customFiles -eq 1) 'Custom plugin detection failed.'
$sourceCopy=Join-Path $scratch 'source-copy'
Copy-Source $source $sourceCopy
Assert ((Get-Content -LiteralPath (Join-Path $sourceCopy 'my-local-file.txt')) -eq 'local modification') 'Local changes were not preserved.'
Write-DistFixture $dist 'original-build'
$plan=Get-Plan $resources '' $manifest
$fixture=Join-Path $scratch 'download.zip'
'corrupt'|Set-Content -LiteralPath $fixture
Expect-Failure {Download-Verified 'https://example.test/tool.zip' $fixture ('0'*64)} 'Checksum failure should stop.'
$interrupted=Join-Path $scratch 'interrupted.zip'
function Invoke-WebRequest { param($Uri,$OutFile,$Headers,[switch]$UseBasicParsing,$TimeoutSec); 'partial'|Set-Content -LiteralPath $OutFile; throw 'Simulated interrupted download.' }
Expect-Failure {Download-Verified 'https://example.test/tool.zip' $interrupted ('0'*64)} 'Interrupted download should stop.'
Assert (-not (Test-Path -LiteralPath $interrupted) -and -not @(Get-ChildItem -LiteralPath $scratch -Filter 'interrupted.zip.download-*').Count) 'Interrupted download left a cached partial file.'
Remove-Item Function:\Invoke-WebRequest
$downloadRoot=Join-Path $base 'downloads'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
$goodDownload=Join-Path $scratch 'verified.zip'
'verified contents'|Set-Content -LiteralPath $goodDownload
$cachedDownload=Join-Path $downloadRoot 'cached.zip'
'stale partial contents'|Set-Content -LiteralPath $cachedDownload
$script:goodDownload=$goodDownload
function Invoke-WebRequest { param($Uri,$OutFile,$Headers,[switch]$UseBasicParsing,$TimeoutSec); Copy-Item -LiteralPath $script:goodDownload -Destination $OutFile }
Download-Verified 'https://example.test/tool.zip' $cachedDownload (Get-FileHash $goodDownload -Algorithm SHA256).Hash | Out-Null
Assert ((Get-FileHash $cachedDownload -Algorithm SHA256).Hash -eq (Get-FileHash $goodDownload -Algorithm SHA256).Hash) 'Changed cached download was not repaired.'
Remove-Item Function:\Invoke-WebRequest
Assert-Tree $dist $originalHashes
$changedPlan=Get-Plan $resources '' $manifest
'unexpected concurrent update'|Set-Content -LiteralPath (Join-Path $dist 'renderer.js')
Expect-Failure {Assert-PlanCurrent $changedPlan} 'An update during compilation should stop installation.'
Write-DistFixture $dist 'original-build'
$build=Join-Path $base 'builds\test-build'
Write-DistFixture (Join-Path $build 'dist') 'ReactionLibrary-new-build'
$newHashes=Tree-Hashes (Join-Path $build 'dist')
Apply-Build $plan $build $newHashes|Out-Null
Assert ((Get-Content -LiteralPath (Join-Path $dist 'renderer.js')) -eq 'ReactionLibrary-new-build') 'New build was not activated.'
Assert ((Get-Content -LiteralPath (Join-Path $settings 'settings.json')) -eq 'enabled-builtins') 'Installing changed built-in plugin settings.'
Assert ((Get-Content -LiteralPath (Join-Path $themes 'custom.css')) -eq 'my-theme') 'Installing changed themes.'
Assert ((Get-FileHash -LiteralPath (Join-Path $resources 'app.asar')).Hash -eq $originalLoaderHash) 'Discord loader was modified.'
Complete-InstallCleanup $plan $build|Out-Null
Assert (-not (Test-Path -LiteralPath $build)) 'Temporary stock build should be removed after installation.'
$backup=Get-RestorePoint
'settings-after-install'|Set-Content -LiteralPath (Join-Path $settings 'settings.json')
Restore-Backup $backup|Out-Null
Assert-Tree $dist $originalHashes
Assert ((Get-Content -LiteralPath (Join-Path $settings 'settings.json')) -eq 'enabled-builtins') 'Settings were not restored.'
Assert (Get-ChildItem (Join-Path $base 'rescued') -Recurse -File | Where-Object {(Get-Content -LiteralPath $_.FullName -Raw) -match 'settings-after-install'}) 'Newer settings were not rescued.'

# Upgrade preserves the first installed version as the next restore point.
$plan=Get-Plan $resources '' $manifest
Write-DistFixture (Join-Path $build 'dist') 'ReactionLibrary-new-build'
Apply-Build $plan $build $newHashes|Out-Null
$installedHashes=Tree-Hashes $dist
$marker=Read-Json (Join-Path $dist 'reaction-library-install.json')
New-Item -ItemType Directory -Path (Join-Path $build 'src\plugins') -Force|Out-Null
'{"packageManager":"pnpm@11.9.0"}'|Set-Content -LiteralPath (Join-Path $build 'package.json')
Save-Json (Join-Path $build 'tested-toolchain.json') $manifest
$updatePlan=Get-Plan $resources '' $manifest
Assert ($updatePlan.managedStock -and -not $updatePlan.source) 'Stock-origin helper updates should allow a new tested revision without inventing custom source.'
$updateBuild=Join-Path $base 'builds\update-build'
Write-DistFixture (Join-Path $updateBuild 'dist') 'ReactionLibrary-update'
Apply-Build $updatePlan $updateBuild (Tree-Hashes (Join-Path $updateBuild 'dist'))|Out-Null
Restore-Backup (Get-RestorePoint)|Out-Null
Assert-Tree $dist $installedHashes
Restore-Backup $marker.backup|Out-Null
Assert-Tree $dist $originalHashes

'tampered'|Set-Content -LiteralPath (Join-Path $backup 'dist\renderer.js')
Expect-Failure {Restore-Backup $backup} 'Corrupt restore snapshot should be refused.'
Assert-Tree $dist $originalHashes
$plan=Get-Plan $resources '' $manifest
$crashBackup=New-Backup $plan
Save-Json (Join-Path $base 'pending.json') @{backup=$crashBackup;phase='switching';target=$dist}
$held=Assert-Child ($dist+'.simulated-crash') (Split-Path -Parent $dist)
Move-Item -LiteralPath $dist -Destination $held
Assert ((Get-RestorePoint) -eq $crashBackup) 'Interrupted installation was not detected.'
Restore-Backup (Get-RestorePoint)|Out-Null
Assert-Tree $dist $originalHashes
'Discord was updated'|Set-Content -LiteralPath (Join-Path $resources '_app.asar')
Expect-Failure {Restore-Backup $crashBackup} 'Restore must refuse a changed Discord installation.'
Assert-Tree $dist $originalHashes
Write-Output 'PASS: native errors, process blocking, detection, custom source preservation, checksum failure, install, settings/themes preservation, restore/rescue, corrupt snapshots, interrupted-switch recovery, changed Discord refusal.'
Write-Output "Fixtures retained at $scratch"
