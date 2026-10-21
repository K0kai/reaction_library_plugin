# SPDX-License-Identifier: GPL-3.0-or-later
# Shared by the interactive helper and filesystem integration tests.
function Read-Json($Path) { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
function Save-Json($Path, $Value) {
    $temporary = "$Path.new"
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Full-Path($Path) { [IO.Path]::GetFullPath($Path).TrimEnd('\') }
function Assert-Child($Path, $Root) {
    $resolved = Full-Path $Path
    $parent = Full-Path $Root
    if (-not $resolved.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path is outside the expected folder: $resolved" }
    return $resolved
}
function Remove-ManagedPath($Path, $Root) {
    # Validate the complete absolute deletion target before any recursive work.
    $checked = Assert-Child $Path $Root
    if (-not (Test-Path -LiteralPath $checked)) { return }
    Assert-NoLinks (Split-Path -Parent $checked) -Shallow
    Remove-EntryNoFollow (Get-Item -LiteralPath $checked -Force)
}
function Remove-EntryNoFollow($Entry) {
    # Directory.Delete(false) removes a junction itself, never its target.
    if ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $Entry.Delete(); return }
    if ($Entry -is [IO.DirectoryInfo]) {
        foreach ($child in $Entry.GetFileSystemInfos()) { Remove-EntryNoFollow $child }
    } elseif ($Entry.IsReadOnly) { $Entry.IsReadOnly = $false }
    $Entry.Delete()
}
function Complete-InstallCleanup($Plan, $Build) {
    $buildPath = Assert-Child $Build (Join-Path $base 'builds')
    if ($Plan.dist -eq $buildPath -or $Plan.dist.StartsWith($buildPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup refused: the build folder contains active Vencord files.' }
    $state = Read-Json (Join-Path $base 'current.json')
    if ($state.target -ne $Plan.dist) { throw 'Cleanup refused: installation state changed.' }
    $record = Read-Json (Join-Path $state.backup 'backup.json')
    if ($record.status -ne 'installed') { throw 'Cleanup requires a successfully installed build.' }
    Assert-Tree (Join-Path $state.backup 'dist') $record.buildHashes
    if ($Plan.source) {
        foreach ($name in @('node_modules','.pnpm-store','.git','dist')) { Remove-ManagedPath (Join-Path $buildPath $name) $buildPath }
        Write-Output 'Removed temporary dependencies and compiled output; retained the custom source snapshot for updates.'
    } else {
        Remove-ManagedPath $buildPath (Join-Path $base 'builds')
        Write-Output 'Removed the temporary source build and its dependencies.'
    }
    if ($record.held -and (Test-Path -LiteralPath $record.held)) {
        if ([IO.Path]::GetFileName($record.held) -notmatch '^dist\.held-[0-9a-f]{32}$') { throw 'Unrecognized temporary build folder; cleanup stopped.' }
        Assert-Tree $record.held $record.buildHashes
        Remove-ManagedPath $record.held (Split-Path -Parent $Plan.dist)
    }
    Write-Output 'Verified tools and rollback backups were kept.'
}
function Assert-NoLinks($Path, [switch]$Shallow) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked paths are not supported: $Path" }
    $parent = $item.Parent
    if (-not $parent -and $item -is [IO.FileInfo]) { $parent = $item.Directory }
    while ($parent) {
        if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "A parent folder is a link: $($parent.FullName)" }
        $parent = $parent.Parent
    }
    if ($item.PSIsContainer -and -not $Shallow) {
        foreach ($child in Get-ChildItem -LiteralPath $Path -Force) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked paths are not supported: $($child.FullName)" }
            if ($child.PSIsContainer) { Assert-NoLinks $child.FullName }
        }
    }
}
function Copy-Tree($Source, $Destination) {
    Assert-NoLinks $Source
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force
    }
}
function Tree-Hashes($Root) {
    $result = @{}
    Assert-NoLinks $Root
    foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File -Force) {
        $relative = $file.FullName.Substring((Full-Path $Root).Length + 1)
        $result[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    return $result
}
function Assert-Tree($Root, $Expected) {
    $actual = Tree-Hashes $Root
    $entries = if ($Expected -is [Collections.IDictionary]) { @($Expected.Keys) } else { @($Expected.PSObject.Properties.Name) }
    if ($actual.Count -ne $entries.Count) { throw "Files changed in $Root. Refusing to continue." }
    foreach ($key in $entries) {
        $hash = if ($Expected -is [Collections.IDictionary]) { $Expected[$key] } else { $Expected.$key }
        if (-not $actual.ContainsKey($key) -or $actual[$key] -ne $hash) { throw "File changed: $key" }
    }
}
function Assert-DiscordClosed {
    $running = @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match '^(Discord|DiscordPTB|DiscordCanary|DiscordDevelopment|Vesktop|Dorion)$' })
    if ($running.Count) { throw 'Fully exit Discord and its tray icon before continuing. Setup will not close it for you.' }
}
function Read-Loader($Resources) {
    Assert-NoLinks $Resources
    $asar = Join-Path $Resources 'app.asar'
    $original = Join-Path $Resources '_app.asar'
    if (-not (Test-Path -LiteralPath $asar -PathType Leaf) -or -not (Test-Path -LiteralPath $original -PathType Leaf)) {
        throw 'A recognized existing Vencord installation is required. Stock Discord and other loader formats are not modified.'
    }
    $size = (Get-Item -LiteralPath $asar).Length
    if ($size -lt 16 -or $size -gt 65536) { throw 'Unrecognized Discord loader. Nothing was changed.' }
    $bytes = [IO.File]::ReadAllBytes($asar)
    $headerSize = [BitConverter]::ToUInt32($bytes, 4)
    $jsonSize = [BitConverter]::ToUInt32($bytes, 12)
    if ($jsonSize -gt 60000 -or (16 + $jsonSize) -gt $bytes.Length) { throw 'Invalid loader archive.' }
    $header = [Text.Encoding]::UTF8.GetString($bytes,16,$jsonSize) | ConvertFrom-Json
    $entry = $header.files.'index.js'
    if (-not $entry -or $entry.unpacked) { throw 'Unrecognized loader entry.' }
    $offset = 8L + $headerSize + [long]$entry.offset
    if ($offset -lt 16 -or $entry.size -lt 1 -or ($offset + $entry.size) -gt $bytes.Length) { throw 'Invalid loader index.' }
    $scriptText = [Text.Encoding]::UTF8.GetString($bytes,[int]$offset,[int]$entry.size)
    if ($scriptText -notmatch '^require\(("(?:[^"\\]|\\.)*")\);?\s*$') { throw 'Unrecognized Discord loader script.' }
    $patcher = $Matches[1] | ConvertFrom-Json
    if ($patcher -match '(?i)[\\/]Equicord[\\/]dist[\\/]desktop$') {
        if ($Language -eq 'pt-BR') { throw 'O carregador desta instalação do Discord aponta para um caminho do Equicord. Isso pode ser uma alteração antiga. Este instalador exige uma instalação existente e reconhecida do Vencord; ele não instala o Vencord em um Discord sem modificação.' }
        throw 'This Discord loader points to an Equicord path, possibly left by an earlier installation. This setup requires an existing recognized Vencord installation; it does not install Vencord on stock Discord.'
    }
    if (-not [IO.Path]::IsPathRooted($patcher) -or [IO.Path]::GetFileName($patcher) -ne 'patcher.js') { throw "Unrecognized Vencord build location. Loader points to: $patcher" }
    $dist = Split-Path -Parent $patcher
    if ([IO.Path]::GetFileName($dist) -ne 'dist') { throw 'Expected a Vencord dist folder.' }
    Assert-NoLinks $dist
    if (-not (Test-Path -LiteralPath $patcher -PathType Leaf)) { throw 'The existing Vencord build is missing. Repair Vencord first.' }
    $reader = [IO.File]::OpenText($patcher)
    try { $firstLine = $reader.ReadLine() } finally { $reader.Dispose() }
    if ($firstLine -notmatch '^// Vencord ([0-9a-f]{7,40})\s*$') { throw 'This build is not recognized as upstream Vencord.' }
    return [pscustomobject]@{ dist=(Full-Path $dist); hash=$Matches[1]; loaderHash=(Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash; originalHash=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash }
}
function Get-DiscordTargets {
    foreach ($name in @('Discord','DiscordPTB','DiscordCanary','DiscordDevelopment')) {
        $root = Join-Path $env:LOCALAPPDATA $name
        if (Test-Path -LiteralPath $root) {
            # Match the official installer's lexicographic app-folder selection.
            $app = Get-ChildItem -LiteralPath $root -Directory -Filter 'app-*' | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'resources') } | Sort-Object FullName -Descending | Select-Object -First 1
            if ($app) { [pscustomobject]@{ name=$name; resources=(Join-Path $app.FullName 'resources') } }
        }
    }
}
function Get-Plan($Resources, $SelectedSource, $Manifest) {
    $Resources = Full-Path $Resources
    $loader = Read-Loader $Resources
    $source = $SelectedSource
    $managed = Join-Path $loader.dist 'reaction-library-install.json'
    $managedInfo = if (Test-Path -LiteralPath $managed) { Read-Json $managed } else { $null }
    # Helper builds originating from stock Vencord can move to a new tested pin.
    # Builds carrying someone else's source require explicit source migration.
    $managedStock = $managedInfo -and $managedInfo.schema -eq 2 -and $managedInfo.preserveSource -eq $false -and -not $source
    if (-not $source -and $managedInfo -and -not $managedStock) { $source = $managedInfo.source }
    if (-not $source -and -not $managedStock -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $loader.dist) 'src\plugins'))) { $source = Split-Path -Parent $loader.dist }
    $mapPath = Join-Path $loader.dist 'renderer.js.map'
    if (-not (Test-Path -LiteralPath $mapPath)) { throw 'Vencord source map is missing; setup cannot safely identify custom plugins. Repair the existing build first.' }
    $map = Read-Json $mapPath
    if (-not $map.sources -or -not ($map.sources | Where-Object { $_ -match '(^|/)src/plugins/' })) { throw 'Unrecognized Vencord source map.' }
    if ($map.sources | Where-Object { $_ -match '(?i)equicord|betterdiscord' }) { throw 'This appears to be a different client mod. Only upstream Vencord is supported.' }
    $customFiles = @($map.sources | Where-Object { $_ -match '(^|/)src/userplugins/' })
    $needsSource = @($customFiles | Where-Object { -not $managedStock -or $_ -notmatch 'src/userplugins/reactionLibrary(/|\.tsx?$)' })
    if ($needsSource.Count -and -not $source) { throw 'Custom plugins were detected. Select the original Vencord source checkout so they can be preserved.' }
    if ($source) {
        $source = Full-Path $source
        if (-not (Test-Path -LiteralPath (Join-Path $source 'src\plugins')) -or -not (Test-Path -LiteralPath (Join-Path $source 'package.json'))) { throw 'The selected Vencord source folder is incomplete.' }
        if (-not $Manifest.vencordCommit.StartsWith($loader.hash)) { throw 'Custom/source builds must match the tested Vencord revision. Setup will not silently migrate custom code to another version.' }
        foreach ($file in $customFiles) {
            $relative = ($file -split '(?i)src/userplugins/',2)[1]
            if ($relative -match '(^|/)\.\.(/|$)' -or -not (Test-Path -LiteralPath (Join-Path $source ('src\userplugins\' + $relative)))) { throw "The selected source is missing a compiled custom-plugin file: $relative" }
        }
    }
    $data = if ($env:VENCORD_USER_DATA_DIR) { $env:VENCORD_USER_DATA_DIR } elseif ($env:DISCORD_USER_DATA_DIR) { Join-Path (Split-Path -Parent $env:DISCORD_USER_DATA_DIR) 'VencordData' } else { Join-Path $env:APPDATA 'Vencord' }
    if (-not [IO.Path]::IsPathRooted($data)) { throw 'The settings location must be an absolute path.' }
    $settingsPaths = @((Join-Path $data 'settings'),(Join-Path $data 'themes'))
    foreach ($path in $settingsPaths) { Assert-NoLinks $path }
    if ($loader.dist.StartsWith('\\') -or $Resources.StartsWith('\\') -or $data.StartsWith('\\')) { throw 'Network-share installations are not supported by the safe directory switch.' }
    return [pscustomobject]@{ resources=$Resources; dist=$loader.dist; oldHash=$loader.hash; newHash=$Manifest.vencordCommit; source=$source; managedStock=$managedStock; customFiles=$customFiles.Count; loaderHash=$loader.loaderHash; originalHash=$loader.originalHash; data=(Full-Path $data); distHashes=(Tree-Hashes $loader.dist) }
}
function Plan-Summary($Plan, $Language = 'en') {
    if ($Language -eq 'pt-BR') {
        $sourceText = if ($Plan.source) { "Preservar a origem e os plugins personalizados de: $($Plan.source)" } elseif ($Plan.managedStock) { 'Atualizar a instalação existente; nenhuma outra origem personalizada foi detectada.' } else { 'A instalação atual contém apenas plugins nativos do Vencord.' }
        return "Discord: $($Plan.resources)`r`nVencord: $($Plan.oldHash) -> $($Plan.newHash.Substring(0,7)) (revisão testada)`r`nLocal da compilação: $($Plan.dist)`r`n$sourceText`r`nConfigurações e temas permanecem em: $($Plan.data)`r`n`r`nO instalador fará cópias de segurança da compilação atual, do carregador, das configurações e dos temas. Depois, substituirá apenas os arquivos compilados do Vencord. O carregador do Discord e o código-fonte original permanecerão no lugar. A atualização automática do Vencord está desativada nesta compilação; use este instalador para atualizações testadas."
    }
    $sourceText = if ($Plan.source) { "Preserve source and custom plugins from: $($Plan.source)" } elseif ($Plan.managedStock) { 'Update the existing helper build; no additional custom source was detected.' } else { 'Existing build contains built-in Vencord plugins only.' }
    return "Discord: $($Plan.resources)`r`nVencord: $($Plan.oldHash) -> $($Plan.newHash.Substring(0,7)) (tested revision)`r`nBuild location: $($Plan.dist)`r`n$sourceText`r`nSettings/themes stay at: $($Plan.data)`r`n`r`nSetup will back up the current build, loader, settings, and themes, then replace only the compiled Vencord files. Discord's loader and the original source stay in place. Automatic Vencord updating is disabled in this build; use this helper for tested updates."
}
function Assert-PlanCurrent($Plan) {
    $current = Read-Loader $Plan.resources
    if ($current.dist -ne $Plan.dist -or $current.loaderHash -ne $Plan.loaderHash -or $current.originalHash -ne $Plan.originalHash) { throw 'Discord or its installation changed during setup. Start again.' }
    Assert-Tree $Plan.dist $Plan.distHashes
}
function New-Backup($Plan) {
    $backup = Join-Path $base ('backups\' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Tree $Plan.dist (Join-Path $backup 'dist')
    $buildHashes = Tree-Hashes (Join-Path $backup 'dist')
    Assert-Tree $Plan.dist $buildHashes
    New-Item -ItemType Directory -Path (Join-Path $backup 'loader') -Force | Out-Null
    foreach ($name in @('app.asar','_app.asar')) { Copy-Item -LiteralPath (Join-Path $Plan.resources $name) -Destination (Join-Path $backup 'loader') }
    $folders = @{}
    foreach ($name in @('settings','themes')) {
        $path = Join-Path $Plan.data $name
        $exists = Test-Path -LiteralPath $path
        if ($exists) { Copy-Tree $path (Join-Path $backup $name) }
        $folders[$name] = @{ existed=$exists; hashes=$(if ($exists) { Tree-Hashes (Join-Path $backup $name) } else { @{} }) }
    }
    $record = @{ schema=2; status='prepared'; plan=$Plan; buildHashes=$buildHashes; folders=$folders; created=(Get-Date).ToString('o') }
    Save-Json (Join-Path $backup 'backup.json') $record
    return $backup
}
function Switch-Directory($Target, $Prepared, $ExpectedRoot) {
    # All directory moves are checked in the same PowerShell process before mutation.
    $targetPath = Assert-Child $Target $ExpectedRoot
    $preparedPath = Assert-Child $Prepared $ExpectedRoot
    Assert-NoLinks $targetPath
    Assert-NoLinks $preparedPath
    $held = Assert-Child ($Target + '.held-' + [Guid]::NewGuid().ToString('N')) $ExpectedRoot
    $hadOriginal = Test-Path -LiteralPath $targetPath
    if ($hadOriginal) { Move-Item -LiteralPath $targetPath -Destination $held }
    try { Move-Item -LiteralPath $preparedPath -Destination $targetPath } catch {
        if ($hadOriginal) { Move-Item -LiteralPath $held -Destination $targetPath }
        throw
    }
    return $held
}
function Apply-Build($Plan, $Build, $ExpectedHashes) {
    Assert-DiscordClosed
    Assert-PlanCurrent $Plan
    Assert-Tree (Join-Path $Build 'dist') $ExpectedHashes
    $backup = New-Backup $Plan
    # A journal is durable before any active file moves, including a mid-switch crash.
    $journalPath = Join-Path $base 'pending.json'
    Save-Json $journalPath @{ backup=$backup; phase='switching'; target=$Plan.dist }
    $prepared = Join-Path (Split-Path -Parent $Plan.dist) ('dist.prepared-' + [Guid]::NewGuid().ToString('N'))
    Copy-Tree (Join-Path $Build 'dist') $prepared
    $sourceSnapshot = if ($Plan.source) { $Build } else { $null }
    Save-Json (Join-Path $prepared 'reaction-library-install.json') @{ schema=2; source=$sourceSnapshot; preserveSource=[bool]$Plan.source; backup=$backup; commit=$Plan.newHash }
    Assert-DiscordClosed
    Assert-PlanCurrent $Plan
    $held = Switch-Directory $Plan.dist $prepared (Split-Path -Parent $Plan.dist)
    try {
        $record = Read-Json (Join-Path $backup 'backup.json')
        $record.status = 'installed'
        $record | Add-Member -NotePropertyName held -NotePropertyValue $held -Force
        Save-Json (Join-Path $backup 'backup.json') $record
        Save-Json (Join-Path $base 'current.json') @{ schema=2; backup=$backup; build=$sourceSnapshot; target=$Plan.dist; installed=(Get-Date).ToString('o') }
        Save-Json $journalPath @{ backup=$backup; phase='complete'; target=$Plan.dist }
    } catch {
        # Restore from the verified snapshot even if final state recording failed.
        Restore-Backup $backup
        throw
    }
    Write-Output "Installed. Restart Discord and enable ReactionLibrary. Restore snapshot: $backup"
}
function Restore-Backup($Backup) {
    Assert-DiscordClosed
    $Backup = Assert-Child $Backup (Join-Path $base 'backups')
    Assert-NoLinks $Backup
    $record = Read-Json (Join-Path $Backup 'backup.json')
    $plan = $record.plan
    # A crash may leave dist absent; validate the loader without dereferencing dist.
    foreach ($pair in @(@('app.asar',$plan.loaderHash),@('_app.asar',$plan.originalHash))) {
        $path = Join-Path $plan.resources $pair[0]
        if (-not (Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $pair[1]) { throw 'Discord updated or its loader changed. Restore was stopped to avoid applying an old snapshot to a different installation.' }
    }
    if ([IO.Path]::GetFileName($plan.dist) -ne 'dist') { throw 'Invalid restore target.' }
    Assert-Tree (Join-Path $Backup 'dist') $record.buildHashes
    Assert-NoLinks (Split-Path -Parent $plan.dist) -Shallow
    # Validate all backup data before restoring anything.
    foreach ($name in @('settings','themes')) { if ($record.folders.$name.existed) { Assert-Tree (Join-Path $Backup $name) $record.folders.$name.hashes } }
    # Preserve settings changed since install before restoring their previous state.
    $rescue = Join-Path $base ('rescued\' + [Guid]::NewGuid().ToString('N'))
    foreach ($name in @('settings','themes')) { $path=Join-Path $plan.data $name; if (Test-Path -LiteralPath $path) { Copy-Tree $path (Join-Path $rescue $name) } }
    $restoreDist = Join-Path (Split-Path -Parent $plan.dist) ('dist.restore-' + [Guid]::NewGuid().ToString('N'))
    Copy-Tree (Join-Path $Backup 'dist') $restoreDist
    Assert-DiscordClosed
    $held = Switch-Directory $plan.dist $restoreDist (Split-Path -Parent $plan.dist)
    foreach ($name in @('settings','themes')) {
        $target = Join-Path $plan.data $name
        if ($record.folders.$name.existed) {
            $prepared = Join-Path $plan.data ($name + '.restore-' + [Guid]::NewGuid().ToString('N'))
            Copy-Tree (Join-Path $Backup $name) $prepared
            $null = Switch-Directory $target $prepared $plan.data
        } elseif (Test-Path -LiteralPath $target) {
            $checked = Assert-Child $target $plan.data
            Assert-NoLinks $checked
            $heldData = Assert-Child ($target + '.after-install-' + [Guid]::NewGuid().ToString('N')) $plan.data
            Move-Item -LiteralPath $checked -Destination $heldData
        }
    }
    $record.status = 'restored'
    Save-Json (Join-Path $Backup 'backup.json') $record
    Save-Json (Join-Path $base 'pending.json') @{ phase='restored'; backup=$Backup }
    Write-Output "Previous Vencord build, settings, and themes restored. Restart Discord. Newer settings were preserved at $rescue"
}
function Get-RestorePoint {
    $pending = Join-Path $base 'pending.json'
    if (Test-Path -LiteralPath $pending) {
        $journal = Read-Json $pending
        if ($journal.phase -eq 'switching') { return $journal.backup }
    }
    $statePath = Join-Path $base 'current.json'
    if (Test-Path -LiteralPath $statePath) {
        $state = Read-Json $statePath
        if ($state.schema -eq 2) {
            $record = Read-Json (Join-Path $state.backup 'backup.json')
            if ($record.status -eq 'restored') {
                $marker = Join-Path $record.plan.dist 'reaction-library-install.json'
                if (Test-Path -LiteralPath $marker) { return (Read-Json $marker).backup }
                throw 'The previous installation has already been restored.'
            }
            return $state.backup
        }
    }
    throw 'No verified restore snapshot is available from this installer.'
}
