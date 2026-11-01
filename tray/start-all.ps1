<#
  Starts the OpenCode Remote bridge (TLS) and the tray, both hidden.
  Runs from the Startup folder at logon; safe to run multiple times.

  The bridge itself waits for the OpenCode shared service, so this script does
  not fail when Windows starts it before OpenCode Desktop.
#>
$ErrorActionPreference = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot 'bridge'
$TrayScript = Join-Path $PSScriptRoot 'opencode-remote-tray.ps1'
$StateDir = Join-Path $env:USERPROFILE '.opencode-remote'
$ConfigFile = Join-Path $StateDir 'config.json'
$StateFile = Join-Path $StateDir 'state.json'
$LogFile = Join-Path $StateDir 'startup.log'
$ServiceFile = Join-Path $env:USERPROFILE '.local\state\opencode\service.json'

function Write-Log($message) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    try { Add-Content -Path $LogFile -Value $line -Encoding utf8 } catch { }
}

function Test-Bridge {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like '*src/index.ts*' }
}

function Test-Tray {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like '*-File*' -and $_.CommandLine -like '*opencode-remote-tray.ps1*' }
}

function Test-Service {
    if (-not (Test-Path $ServiceFile)) { return $false }
    try {
        $svc = Get-Content $ServiceFile -Raw | ConvertFrom-Json
        if (-not $svc.url) { return $false }
        $uri = [Uri]$svc.url
        $client = New-Object System.Net.Sockets.TcpClient
        $ok = $client.ConnectAsync($uri.Host, $uri.Port).Wait(800)
        $client.Close()
        return $ok
    } catch {
        return $false
    }
}

function Get-Token {
    if (Test-Path $ConfigFile) {
        try {
            $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            if ($cfg.token) { return [string]$cfg.token }
        } catch { }
    }
    if (Test-Path $StateFile) {
        try {
            $st = Get-Content $StateFile -Raw | ConvertFrom-Json
            if ($st.token) { return [string]$st.token }
        } catch { }
    }
    return $null
}

function Get-OpenCodeCli {
    $roots = @(
        (Join-Path $env:APPDATA 'ai.opencode.desktop\cli'),
        (Join-Path $env:LOCALAPPDATA 'Programs\@opencode-aidesktop\resources')
    )
    $candidates = @()
    foreach ($root in $roots) {
        if (Test-Path $root) {
            $candidates += Get-ChildItem $root -Recurse -Filter 'opencode-cli.exe' -ErrorAction SilentlyContinue
        }
    }
    if (-not $candidates) { return $null }
    return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
Write-Log '--- logon start ---'

# Give OpenCode Desktop a head start if it is registered for logon too.
for ($i = 0; $i -lt 5; $i++) {
    if (Test-Service) { break }
    Start-Sleep -Seconds 2
}

if (-not (Test-Service)) {
    # Headless shared service: the phone can reach OpenCode before the desktop
    # window is opened. The Desktop attaches to this same service later.
    $cli = Get-OpenCodeCli
    if ($cli) {
        Write-Log "Starting OpenCode service: $cli"
        Start-Process -FilePath $cli -ArgumentList @('serve', '--service') -WindowStyle Hidden
        for ($i = 0; $i -lt 20; $i++) {
            if (Test-Service) { break }
            Start-Sleep -Seconds 2
        }
    } else {
        Write-Log 'opencode-cli.exe not found; waiting for the Desktop instead'
    }
}

if (Test-Service) {
    Write-Log 'OpenCode service is up'
} else {
    Write-Log 'OpenCode service not up yet; the bridge will wait for it'
}

if (-not (Test-Bridge)) {
    $node = (Get-Command node).Source
    if (-not $node) { $node = 'node' }

    $token = Get-Token
    if ($token -and -not (Test-Path $ConfigFile)) {
        try {
            Set-Content -Path $ConfigFile -Value (@{ token = $token } | ConvertTo-Json -Compress) -Encoding ascii -NoNewline
        } catch { }
    }

    # Keep the transport the app was paired with (TLS by default).
    $tls = $true
    if (Test-Path $StateFile) {
        try {
            $st = Get-Content $StateFile -Raw | ConvertFrom-Json
            if ($null -ne $st.tls) { $tls = [bool]$st.tls }
        } catch { }
    }

    $arguments = @('src/index.ts')
    if ($tls) { $arguments += '--tls' }
    if ($token) { $arguments += @('--token', $token) }
    $arguments += @('--config-file', $ConfigFile)

    if ($token) { $tokenState = 'kept' } else { $tokenState = 'generated' }
    Write-Log ('Starting bridge (tls={0}, token={1})' -f $tls, $tokenState)

    Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $BridgeDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $StateDir 'bridge.log') `
        -RedirectStandardError (Join-Path $StateDir 'bridge.err.log')
    Start-Sleep -Seconds 3
} else {
    Write-Log 'Bridge already running'
}

if (-not (Test-Tray)) {
    Write-Log 'Starting tray'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', "`"$TrayScript`"") -WindowStyle Hidden
} else {
    Write-Log 'Tray already running'
}

Write-Log '--- done ---'
