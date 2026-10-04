<#
  Registers OpenCode Remote to auto-start at Windows logon (current user).
  Creates a shortcut in the Startup folder pointing to tray\start-all.vbs.
#>
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $RepoRoot 'tray\start-all.vbs'
if (-not (Test-Path $vbs)) { throw "start-all.vbs not found at $vbs" }

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'OpenCode Remote.lnk'

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = 'wscript.exe'
$sc.Arguments = '"' + $vbs + '"'
$sc.WorkingDirectory = $RepoRoot
$sc.WindowStyle = 7
$sc.Description = 'OpenCode Remote (bridge + tray)'
$sc.Save()

Write-Host "Autostart installed: $lnk"
