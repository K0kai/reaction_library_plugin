$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'installer\Setup.ps1') -LibraryOnly
$scratch=Join-Path $root ('.preview\storage-test-'+[Guid]::NewGuid().ToString('N'))
$base=Join-Path $scratch 'managed'
New-Item -ItemType Directory -Path $base -Force|Out-Null
$manifest=Read-Json (Join-Path $root 'installer\toolchain.json')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
$script:expansions=0
$script:installs=0
function Download-Verified($Url,$Path,$Hash,$Algorithm) { 'fixture'|Set-Content -LiteralPath $Path }
function Expand-Archive {
    param($LiteralPath,$DestinationPath)
    $script:expansions++
    if ($LiteralPath -match 'node-') {
        $folder=Join-Path $DestinationPath "node-v$($manifest.node.version)-win-x64"
        New-Item -ItemType Directory -Path $folder -Force|Out-Null
        'verified-node'|Set-Content -LiteralPath (Join-Path $folder 'node.exe')
        'npm'|Set-Content -LiteralPath (Join-Path $folder 'npm.cmd')
    } else {
        New-Item -ItemType Directory -Path (Join-Path $DestinationPath 'cmd') -Force|Out-Null
        'verified-git'|Set-Content -LiteralPath (Join-Path $DestinationPath 'cmd\git.exe')
    }
}
function Run($Program,$Arguments,$Directory) {
    $script:installs++
    $pnpmRoot=$Arguments[2]
    New-Item -ItemType Directory -Path (Join-Path $pnpmRoot 'node_modules\pnpm\bin') -Force|Out-Null
    'verified-pnpm'|Set-Content -LiteralPath (Join-Path $pnpmRoot 'node_modules\pnpm\bin\pnpm.cjs')
}
Prepare-Tools $manifest|Out-Null
$firstNode=$script:preparedTools.node
Prepare-Tools $manifest|Out-Null
Assert ($script:preparedTools.node -eq $firstNode) 'Tool cache path should be stable.'
Assert ($script:expansions -eq 2 -and $script:installs -eq 1) 'Verified tools should not be extracted or installed again.'
'tampered-node'|Set-Content -LiteralPath $firstNode
Prepare-Tools $manifest|Out-Null
Assert ((Get-Content -LiteralPath $firstNode) -eq 'verified-node') 'Changed tool should be repaired before reuse.'
Assert ($script:expansions -eq 4 -and $script:installs -eq 2) 'Changed tool inventory should force a clean extraction.'

# Custom source snapshots survive cleanup; dependencies, git, store and output do not.
$build=Join-Path $base 'builds\custom-build'
foreach($name in @('src','node_modules','.pnpm-store','.git','dist')) {
    $folder=Join-Path $build $name
    New-Item -ItemType Directory -Path $folder -Force|Out-Null
    'temporary'|Set-Content -LiteralPath (Join-Path $folder 'file.txt')
}
$outside=Join-Path $scratch 'original-media'
New-Item -ItemType Directory -Path $outside -Force|Out-Null
'original'|Set-Content -LiteralPath (Join-Path $outside 'keep.txt')
New-Item -ItemType Junction -Path (Join-Path $build 'node_modules\external-link') -Target $outside|Out-Null
$active=Join-Path $scratch 'active\dist'
New-Item -ItemType Directory -Path $active -Force|Out-Null
'active build'|Set-Content -LiteralPath (Join-Path $active 'renderer.js')
$backup=Join-Path $base 'backups\fixture'
New-Item -ItemType Directory -Path (Join-Path $backup 'dist') -Force|Out-Null
'rollback build'|Set-Content -LiteralPath (Join-Path $backup 'dist\renderer.js')
$held=Join-Path (Split-Path -Parent $active) ('dist.held-'+[Guid]::NewGuid().ToString('N'))
Copy-Tree (Join-Path $backup 'dist') $held
Save-Json (Join-Path $backup 'backup.json') @{status='installed';buildHashes=(Tree-Hashes (Join-Path $backup 'dist'));held=$held}
Save-Json (Join-Path $base 'current.json') @{target=$active;backup=$backup}
Complete-InstallCleanup ([pscustomobject]@{source='original-custom-source';dist=$active}) $build|Out-Null
Assert (Test-Path -LiteralPath (Join-Path $build 'src\file.txt')) 'Source snapshot was deleted.'
foreach($name in @('node_modules','.pnpm-store','.git','dist')) {Assert (-not(Test-Path -LiteralPath (Join-Path $build $name))) "Temporary folder was not deleted: $name"}
Assert ((Get-Content -LiteralPath (Join-Path $outside 'keep.txt')) -eq 'original') 'Cleanup followed a junction and touched original media.'
Assert ((Get-Content -LiteralPath (Join-Path $active 'renderer.js')) -eq 'active build') 'Active build was touched.'
Assert ((Get-Content -LiteralPath (Join-Path $backup 'dist\renderer.js')) -eq 'rollback build') 'Rollback backup was deleted.'
Assert (-not(Test-Path -LiteralPath $held)) 'Duplicate held output was not removed.'
Assert (Test-Path -LiteralPath $firstNode) 'Verified tools were deleted during cleanup.'
$failed=$false
try {Remove-ManagedPath $outside (Join-Path $base 'builds')}catch{$failed=$true}
Assert $failed 'Cleanup should reject paths outside the build root.'
Write-Output 'PASS: verified tool reuse, tamper repair, dependency/output cleanup, custom source/active build/backup preservation, junction safety, deletion containment.'
