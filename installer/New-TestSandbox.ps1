param([string]$PackageDirectory = (Join-Path $PSScriptRoot '..\releases'))
$ErrorActionPreference='Stop'
$directory=(Resolve-Path -LiteralPath $PackageDirectory).Path
$escaped=[Security.SecurityElement]::Escape($directory)
$configuration=@"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$escaped</HostFolder>
      <SandboxFolder>C:\SetupPackages</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
</Configuration>
"@
$output=Join-Path $directory 'ReactionLibrary-Test.wsb'
$configuration|Set-Content -LiteralPath $output -Encoding UTF8
Write-Output "Created $output. Open it on a PC with Windows Sandbox enabled, then copy the ZIP from C:\SetupPackages into the sandbox before extracting."
