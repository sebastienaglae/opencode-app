<#
  Removes the OpenCode Remote autostart shortcut.
#>
$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'OpenCode Remote.lnk'
if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "Autostart removed: $lnk"
} else {
    Write-Host "No autostart shortcut found."
}
