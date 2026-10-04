<#
  Starts the OpenCode Remote bridge (TLS) and the tray, both hidden.
  Safe to run multiple times (won't duplicate processes).
#>
$ErrorActionPreference = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot 'bridge'
$TrayScript = Join-Path $PSScriptRoot 'opencode-remote-tray.ps1'

function Test-Bridge {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like '*src/index.ts*' }
}

function Test-Tray {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like '*-File*' -and $_.CommandLine -like '*opencode-remote-tray.ps1*' }
}

if (-not (Test-Bridge)) {
    $node = (Get-Command node).Source
    if (-not $node) { $node = 'node' }
    Start-Process -FilePath $node -ArgumentList @('src/index.ts', '--tls') -WorkingDirectory $BridgeDir -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

if (-not (Test-Tray)) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', "`"$TrayScript`"") -WindowStyle Hidden
}
