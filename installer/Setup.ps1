# SPDX-License-Identifier: GPL-3.0-or-later
param([switch]$Worker, [string]$JobDirectory, [switch]$LibraryOnly, [switch]$PrepareOnly, [ValidateSet('en','pt-BR')][string]$Language = 'en')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = Join-Path $env:LOCALAPPDATA 'ReactionLibrarySetup'
. (Join-Path $PSScriptRoot 'Safety.ps1')

function Run($Program, $Arguments, $Directory) {
    Push-Location -LiteralPath $Directory
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Program @Arguments 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) { throw "A build step failed (exit $LASTEXITCODE). See the log above." }
    } finally { $ErrorActionPreference = $savedPreference; Pop-Location }
}
function Download-Verified($Url, $Path, $Hash, $Algorithm = 'SHA256', [switch]$Retried) {
    if (-not $Url.StartsWith('https://')) { throw 'Only HTTPS downloads are supported.' }
    Write-Output "Checking download: $([IO.Path]::GetFileName($Path))"
    $partial = $null
    try {
        $checkPath = $Path
        if (-not (Test-Path -LiteralPath $Path)) {
            $partial = "$Path.download-$([Guid]::NewGuid().ToString('N'))"
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $partial -Headers @{ 'User-Agent'='ReactionLibrarySetup' } -TimeoutSec 300
            $checkPath = $partial
        }
        if ($Algorithm -eq 'SHA512') {
            $hasher = [Security.Cryptography.SHA512]::Create()
            $stream = [IO.File]::OpenRead($checkPath)
            try { $actual = [Convert]::ToBase64String($hasher.ComputeHash($stream)) } finally { $stream.Dispose(); $hasher.Dispose() }
        } else { $actual = (Get-FileHash -LiteralPath $checkPath -Algorithm SHA256).Hash }
        if ($actual -cne $Hash -and -not ($Algorithm -eq 'SHA256' -and $actual.ToLowerInvariant() -eq $Hash.ToLowerInvariant())) {
            $cacheRoot = Join-Path $base 'downloads'
            if (-not $partial -and -not $Retried -and (Full-Path $Path).StartsWith((Full-Path $cacheRoot) + '\',[StringComparison]::OrdinalIgnoreCase)) {
                Write-Output "Cached download changed; fetching a clean copy: $([IO.Path]::GetFileName($Path))"
                Remove-ManagedPath $Path $cacheRoot
                Download-Verified $Url $Path $Hash $Algorithm -Retried
                return
            }
            throw "Download checksum mismatch: $Path. Remove this cached archive and retry."
        }
        if ($partial) { Move-Item -LiteralPath $partial -Destination $Path }
        Write-Output "Verified download: $([IO.Path]::GetFileName($Path))"
    } finally { if ($partial -and (Test-Path -LiteralPath $partial)) { Remove-Item -LiteralPath $partial -Force } }
}
function Verify-Payload {
    $inventory = Read-Json (Join-Path $PSScriptRoot 'payload-hashes.json')
    foreach ($property in $inventory.PSObject.Properties) {
        $file = Assert-Child (Join-Path $PSScriptRoot $property.Name) $PSScriptRoot
        if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $property.Value) { throw "The setup package is incomplete or changed: $($property.Name). Download and extract it again." }
    }
}
function Prepare-Tools($Manifest) {
    $fingerprintText = @($Manifest.node.version,$Manifest.node.sha256,$Manifest.git.version,$Manifest.git.sha256,$Manifest.pnpm.version,$Manifest.pnpm.sha512) -join '|'
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($fingerprintText)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    $Work = Join-Path $base "tools\$key"
    $receipt = Join-Path $Work 'verified-files.json'
    $reuse = $false
    if (Test-Path -LiteralPath $receipt) {
        try {
            $saved = Read-Json $receipt
            if ($saved.key -ne $key) { throw 'Toolchain changed.' }
            # Inventory is kept outside the files it verifies.
            Assert-Tree (Join-Path $Work 'files') $saved.hashes
            $reuse = $true
            Write-Output 'Reusing cached build tools; every cached file passed verification.'
        } catch { Write-Output 'Cached tools were incomplete or changed; rebuilding from verified downloads.' }
    }
    if (-not $reuse -and (Test-Path -LiteralPath $Work)) { Remove-ManagedPath $Work (Join-Path $base 'tools') }
    $files = Join-Path $Work 'files'
    $nodeRoot = Join-Path $files "node-v$($Manifest.node.version)-win-x64"
    $gitRoot = Join-Path $files 'git'
    $pnpmRoot = Join-Path $files 'pnpm'
    $node = Join-Path $nodeRoot 'node.exe'
    if (-not $reuse) {
        New-Item -ItemType Directory -Path $Work -Force | Out-Null
        $cache = Join-Path $base 'downloads'
        New-Item -ItemType Directory -Path $cache -Force | Out-Null
        $nodeZip = Join-Path $cache "node-$($Manifest.node.version)-x64.zip"
        Download-Verified $Manifest.node.url $nodeZip $Manifest.node.sha256
        Expand-Archive -LiteralPath $nodeZip -DestinationPath $files
        $gitZip = Join-Path $cache "mingit-$($Manifest.git.version).zip"
        Download-Verified $Manifest.git.url $gitZip $Manifest.git.sha256
        Expand-Archive -LiteralPath $gitZip -DestinationPath $gitRoot
        $pnpmArchive = Join-Path $cache "pnpm-$($Manifest.pnpm.version).tgz"
        Download-Verified $Manifest.pnpm.url $pnpmArchive $Manifest.pnpm.sha512 'SHA512'
        # Unpack the verified local package with scripts disabled.
        $env:PATH = "$nodeRoot;$(Join-Path $gitRoot 'cmd');$env:PATH"
        Run $node @((Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'),'install','--prefix',$pnpmRoot,'--offline','--ignore-scripts','--no-audit','--no-fund',$pnpmArchive) $Work
        Save-Json $receipt @{ key=$key; hashes=(Tree-Hashes $files) }
    }
    $env:PATH = "$nodeRoot;$(Join-Path $gitRoot 'cmd');$env:PATH"
    $script:preparedTools = @{ node=$node; git=(Join-Path $gitRoot 'cmd\git.exe'); pnpm=(Join-Path $pnpmRoot 'node_modules\pnpm\bin\pnpm.cjs') }
}
function Copy-Source($Source, $Destination) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($item.Name -in @('.git','node_modules','dist','.pnpm-store') -or $item.Name -match '^dist\.(prepared|restore|held)-') { continue }
        Assert-NoLinks $item.FullName
        Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force
    }
}
function Prepare-Build($Plan, $Manifest) {
    $build = Join-Path $base ('builds\' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $build -Force | Out-Null
    # Tools are separate from source so snapshots do not recursively copy previous tools.
    Prepare-Tools $Manifest
    $tools = $script:preparedTools
    if (-not $tools) { throw 'Build tools could not be prepared.' }
    $env:CI = 'true'
    $env:VENCORD_HASH = $Manifest.vencordCommit.Substring(0,7)
    $env:VENCORD_REMOTE = 'Vendicated/Vencord'
    if ($Plan.source) {
        if (Test-Path -LiteralPath (Join-Path $Plan.source '.git')) {
            $head = @(Run $tools.git @('-C',$Plan.source,'rev-parse','HEAD') $base)[-1]
            if ($head.Trim() -ne $Manifest.vencordCommit) { throw 'The selected source checkout does not match the tested Vencord commit.' }
        } elseif (-not (Test-Path -LiteralPath (Join-Path $Plan.source 'tested-toolchain.json')) -or (Read-Json (Join-Path $Plan.source 'tested-toolchain.json')).vencordCommit -ne $Manifest.vencordCommit) {
            throw 'The selected source snapshot has no matching tested revision record.'
        }
        Write-Output 'Taking a separate snapshot of the existing source, including local modifications.'
        Copy-Source $Plan.source $build
    } else {
        Write-Output 'Downloading the tested Vencord source revision.'
        Run $tools.git @('init',$build) $base
        Run $tools.git @('-C',$build,'remote','add','origin',$Manifest.vencordRepository) $base
        Run $tools.git @('-C',$build,'fetch','--depth','1','origin',$Manifest.vencordCommit) $base
        Run $tools.git @('-C',$build,'checkout','--detach','FETCH_HEAD') $base
    }
    $package = Read-Json (Join-Path $build 'package.json')
    if ($package.packageManager -ne "pnpm@$($Manifest.pnpm.version)") { throw 'Source requires a different package-manager version from the tested toolchain.' }
    $plugins = Join-Path $build 'src\userplugins'
    New-Item -ItemType Directory -Path $plugins -Force | Out-Null
    foreach ($name in @('reactionLibrary','reactionLibrary.ts','reactionLibrary.tsx')) {
        $old = Join-Path $plugins $name
        if (Test-Path -LiteralPath $old) {
            $checked = Assert-Child $old $build
            Assert-NoLinks $checked
            # Stage-only removal; the original source and active library stay intact.
            Remove-Item -LiteralPath $checked -Recurse -Force
        }
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'reactionLibrary') -Destination $plugins -Recurse
    Write-Output 'Installing locked dependencies and building with automatic Vencord updating disabled.'
    Run $tools.node @($tools.pnpm,'install','--frozen-lockfile','--store-dir',(Join-Path $build '.pnpm-store')) $build
    Run $tools.node @($tools.pnpm,'build','--disable-updater') $build
    Run $tools.node @((Join-Path $build 'node_modules\typescript\bin\tsc'),'--noEmit','--pretty','false') $build
    foreach ($file in @('patcher.js','preload.js','renderer.js','renderer.css','renderer.js.map')) {
        if (-not (Test-Path -LiteralPath (Join-Path $build "dist\$file"))) { throw "Incomplete build: $file" }
    }
    if (-not (Select-String -LiteralPath (Join-Path $build 'dist\renderer.js') -Pattern 'ReactionLibrary' -Quiet)) { throw 'ReactionLibrary is missing from the compiled build.' }
    $builtMap = Read-Json (Join-Path $build 'dist\renderer.js.map')
    if (-not ($builtMap.sources | Where-Object { $_ -match '(^|/)src/userplugins/reactionLibrary/index\.tsx$' })) { throw 'ReactionLibrary was not registered in the compiled Vencord build. No active files were changed.' }
    $oldMap = Read-Json (Join-Path $Plan.dist 'renderer.js.map')
    $builtPluginPaths = @($builtMap.sources | Where-Object { $_ -match '(^|/)src/plugins/' } | ForEach-Object { $_ -replace '^.*?(?=src/plugins/)', '' })
    $builtCustomPaths = @($builtMap.sources | Where-Object { $_ -match '(^|/)src/userplugins/' } | ForEach-Object { $_ -replace '^.*?(?=src/userplugins/)', '' })
    foreach ($sourceFile in $oldMap.sources) {
        if ($sourceFile -match '(^|/)src/plugins/' -and ($sourceFile -replace '^.*?(?=src/plugins/)', '') -notin $builtPluginPaths) { throw "An existing built-in plugin file would be missing from the new build: $sourceFile" }
        if ($sourceFile -match '(^|/)src/userplugins/' -and $sourceFile -notmatch 'src/userplugins/reactionLibrary(/|\.tsx?$)' -and ($sourceFile -replace '^.*?(?=src/userplugins/)', '') -notin $builtCustomPaths) { throw "An existing custom-plugin file would be missing from the new build: $sourceFile" }
    }
    '{}' | Set-Content -LiteralPath (Join-Path $build 'dist\package.json') -Encoding ASCII
    Save-Json (Join-Path $build 'tested-toolchain.json') $Manifest
    Write-Output "Build and type checking complete: $build"
    $script:preparedBuild = $build
}
function Invoke-SetupJob($Request) {
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Only Windows x64 is supported.' }
    New-Item -ItemType Directory -Path $base -Force | Out-Null
    Assert-NoLinks $base -Shallow
    $lock = [IO.File]::Open((Join-Path $base 'setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        if ($Request.action -eq 'restore') { Restore-Backup $Request.backup; return }
        Verify-Payload
        Assert-DiscordClosed
        $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot((Full-Path $base)))
        if ($drive.AvailableFreeSpace -lt 4GB) { throw 'At least 4 GB of free space is required before starting a build.' }
        $manifest = Read-Json (Join-Path $PSScriptRoot 'toolchain.json')
        $plan = Get-Plan $Request.resources $Request.source $manifest
        if ((Plan-Summary $plan $Request.language) -ne $Request.summary) { throw 'Installation details changed after review. Review the plan again.' }
        $pending = Join-Path $base 'pending.json'
        if ((Test-Path -LiteralPath $pending) -and (Read-Json $pending).phase -eq 'switching') { throw 'An earlier installation was interrupted. Use Restore previous installation first.' }
        Prepare-Build $plan $manifest
        $build = $script:preparedBuild
        $hashes = Tree-Hashes (Join-Path $build 'dist')
        if ($PrepareOnly) { Write-Output 'Validation only: no active files changed.'; return }
        Write-Output 'Build is ready. Close Discord if it was opened while building.'
        Apply-Build $plan $build $hashes
        try { Complete-InstallCleanup $plan $build } catch { Write-Output "Installation succeeded, but cleanup could not finish: $($_.Exception.Message). Rollback backups were kept." }
    } finally { $lock.Dispose() }
}

if ($LibraryOnly) { return }
if ($Worker) {
    try { Invoke-SetupJob (Read-Json (Join-Path $JobDirectory 'request.json')) *>&1 | Out-File -LiteralPath (Join-Path $JobDirectory 'progress.log') -Encoding UTF8; exit 0 }
    catch { "ERROR: $($_.Exception.Message)" | Out-File -LiteralPath (Join-Path $JobDirectory 'progress.log') -Append -Encoding UTF8; exit 1 }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$pt = $Language -eq 'pt-BR'
function L($English,$Portuguese) { if ($pt) { return $Portuguese }; return $English }
$form = New-Object Windows.Forms.Form
$form.Text = L 'Reaction Library - Vencord Setup' 'Reaction Library - Instalador do Vencord'
$form.Size = New-Object Drawing.Size(810,690)
$form.MinimumSize = $form.Size
$form.StartPosition = 'CenterScreen'
function Add-Control($Type,$X,$Y,$Width,$Height,$Text) {
    $control = New-Object "Windows.Forms.$Type"
    $control.SetBounds($X,$Y,$Width,$Height)
    $control.Text = $Text
    $form.Controls.Add($control)
    return $control
}
$intro = Add-Control Label 18 15 755 50 (L "Uses your existing Vencord installation. Builds separately and backs up before applying changes.`r`nWindows x64. Close Discord first. Allow 4 GB free during building; temporary build files are cleaned afterward." "Usa sua instalação atual do Vencord. Compila separadamente e faz cópia de segurança antes de alterar arquivos.`r`nWindows x64. Feche o Discord. Tenha 4 GB livres durante a compilação; os arquivos temporários serão removidos depois.")
$null = Add-Control Label 18 70 755 20 (L 'Discord resources folder (detected below; select another resources folder if needed):' 'Pasta de recursos do Discord (detectada abaixo; escolha outra se necessário):')
$target = Add-Control ComboBox 18 94 635 26 ''
$target.DropDownStyle = 'DropDown'
foreach ($found in Get-DiscordTargets) { [void]$target.Items.Add($found.resources) }
if ($target.Items.Count) { $target.SelectedIndex=0 }
$targetBrowse = Add-Control Button 663 92 110 29 (L 'Choose folder' 'Escolher pasta')
$null = Add-Control Label 18 132 755 20 (L 'Vencord source folder (auto-detected when available; required for custom plugins):' 'Pasta do código-fonte do Vencord (detectada se disponível; necessária para plugins personalizados):')
$source = Add-Control TextBox 18 156 635 26 ''
$sourceBrowse = Add-Control Button 663 154 110 29 (L 'Choose folder' 'Escolher pasta')
$targetBrowse.Add_Click({ $picker=New-Object Windows.Forms.FolderBrowserDialog; if ($picker.ShowDialog() -eq 'OK') {$target.Text=$picker.SelectedPath}; $picker.Dispose() })
$sourceBrowse.Add_Click({ $picker=New-Object Windows.Forms.FolderBrowserDialog; if ($picker.ShowDialog() -eq 'OK') {$source.Text=$picker.SelectedPath}; $picker.Dispose() })
$review = Add-Control Button 18 197 150 34 (L 'Review / Install' 'Revisar / Instalar')
$restore = Add-Control Button 178 197 215 34 (L 'Restore previous installation' 'Restaurar instalação anterior')
$latest = Add-Control Button 573 197 200 34 (L 'Get latest release' 'Obter versão mais recente')
$script:restartLatest = $false
$latest.Add_Click({
    $script:restartLatest = $true
    $form.Close()
})
$status = Add-Control Label 18 242 755 38 (L 'Ready. Changes require your approval after reviewing the detected installation.' 'Pronto. Revise a instalação detectada e aprove as alterações antes de continuar.')
$log = Add-Control TextBox 18 284 755 345 ''
$log.Multiline=$true; $log.ReadOnly=$true; $log.ScrollBars='Vertical'; $log.Anchor='Top, Bottom, Left, Right'
$timer=New-Object Windows.Forms.Timer
$timer.Interval=500
$script:workerProcess=$null
$script:jobPath=$null
function Start-JobWindow($Request) {
    $script:jobPath=Join-Path $base ('logs\'+[Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:jobPath -Force | Out-Null
    Save-Json (Join-Path $script:jobPath 'request.json') $Request
    $scriptFile=(Join-Path $PSScriptRoot 'Setup.ps1').Replace("'","''")
    $job=$script:jobPath.Replace("'","''")
    $command="& '$scriptFile' -Worker -JobDirectory '$job' -Language '$Language'"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $script:workerProcess=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru
    foreach ($control in @($review,$restore,$source,$target,$sourceBrowse,$targetBrowse)) {$control.Enabled=$false}
    $status.Text=L 'Working. Keep this window open. Discord must stay closed while changes are applied.' 'Em andamento. Mantenha esta janela aberta e o Discord fechado durante as alterações.'
    $timer.Start()
}
$review.Add_Click({
    try {
        if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {throw 'Only Windows x64 is supported.'}
        Verify-Payload
        Assert-DiscordClosed
        $manifest=Read-Json (Join-Path $PSScriptRoot 'toolchain.json')
        $plan=Get-Plan $target.Text $source.Text $manifest
        $summary=Plan-Summary $plan $Language
        if ([Windows.Forms.MessageBox]::Show($summary+"`r`n`r`n"+(L 'Build and install this version?' 'Compilar e instalar esta versão?'),(L 'Review changes' 'Revisar alterações'),'YesNo','Warning') -ne 'Yes') {return}
        Start-JobWindow @{action='install';resources=$target.Text;source=$source.Text;summary=$summary;language=$Language}
    } catch {[Windows.Forms.MessageBox]::Show($_.Exception.Message,(L 'Setup stopped' 'Instalação interrompida')) | Out-Null}
})
$restore.Add_Click({
    try {
        Assert-DiscordClosed
        $backup=Get-RestorePoint
        $record=Read-Json (Join-Path $backup 'backup.json')
        $message=if($pt){"Restaurar a compilação, as configurações e os temas salvos em $($record.created)?`r`nDestino: $($record.plan.dist)`r`nAs configurações atuais serão preservadas em uma pasta de resgate. O Discord deve estar fechado."}else{"Restore the build, settings, and themes saved on $($record.created)?`r`nTarget: $($record.plan.dist)`r`nCurrent settings will be preserved in a rescue folder. Discord must be closed."}
        if ([Windows.Forms.MessageBox]::Show($message,(L 'Restore previous installation' 'Restaurar instalação anterior'),'YesNo','Warning') -eq 'Yes') {Start-JobWindow @{action='restore';backup=$backup;language=$Language}}
    } catch {[Windows.Forms.MessageBox]::Show($_.Exception.Message,(L 'Restore stopped' 'Restauração interrompida')) | Out-Null}
})
$timer.Add_Tick({
    $file=Join-Path $script:jobPath 'progress.log'
    if (Test-Path -LiteralPath $file) {try {$text=[IO.File]::ReadAllText($file);if($log.Text -ne $text){$log.Text=$text;$log.SelectionStart=$log.TextLength;$log.ScrollToCaret()}}catch{}}
    if ($script:workerProcess.HasExited) {
        $timer.Stop()
        foreach ($control in @($review,$restore,$source,$target,$sourceBrowse,$targetBrowse)) {$control.Enabled=$true}
        $status.Text=if($script:workerProcess.ExitCode -eq 0){L 'Finished. See the log below, then restart Discord.' 'Concluído. Consulte o registro abaixo e reinicie o Discord.'}else{L 'Stopped. See the log. If files were already switched, use Restore previous installation.' 'Interrompido. Consulte o registro. Se os arquivos já foram trocados, use Restaurar instalação anterior.'}
    }
})
$form.Add_FormClosing({param($sender,$eventArgs);if($script:workerProcess -and -not $script:workerProcess.HasExited){$eventArgs.Cancel=$true;[Windows.Forms.MessageBox]::Show((L 'Setup is still running. Keep this window open until it finishes.' 'A instalação ainda está em andamento. Mantenha esta janela aberta até terminar.'))|Out-Null}})
[void]$form.ShowDialog()
$timer.Dispose();$form.Dispose()
if ($script:restartLatest) { & (Join-Path $PSScriptRoot 'Bootstrap.ps1') -Language $Language }
