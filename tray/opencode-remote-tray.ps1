<#
  OpenCode Remote — Windows tray helper (styled like the app).
  Tray icon -> opens a small window with the QR code, connection info and
  settings (token), plus start/stop/restart of the bridge.

  Usage:  powershell -ExecutionPolicy Bypass -File .\tray\opencode-remote-tray.ps1
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$StateDir = Join-Path $env:USERPROFILE '.opencode-remote'
$StateFile = Join-Path $StateDir 'state.json'
$ConfigFile = Join-Path $StateDir 'config.json'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot 'bridge'

$Bg = [System.Drawing.Color]::FromArgb(10, 10, 11)
$Surface = [System.Drawing.Color]::FromArgb(20, 20, 22)
$Fg = [System.Drawing.Color]::FromArgb(237, 237, 240)
$Muted = [System.Drawing.Color]::FromArgb(155, 155, 163)
$Accent = [System.Drawing.Color]::FromArgb(91, 157, 255)

function Get-State {
    if (Test-Path $StateFile) {
        try { return Get-Content $StateFile -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}

function Start-Bridge {
    param([switch]$Tls)
    $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*src/index.ts*' }
    if ($running) { return }
    $args = @('src/index.ts')
    if ($Tls) { $args += '--tls' }
    Start-Process -FilePath 'node' -ArgumentList $args -WorkingDirectory $BridgeDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

function Stop-Bridge {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*src/index.ts*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function New-Button($text, $accent) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text
    $b.Height = 38
    $b.FlatStyle = 'Flat'
    $b.FlatAppearance.BorderSize = 0
    $b.BackColor = if ($accent) { $Accent } else { $Surface }
    $b.ForeColor = if ($accent) { [System.Drawing.Color]::White } else { $Fg }
    $b.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $b.Cursor = 'Hand'
    return $b
}

function Show-Panel {
    $state = Get-State
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'OpenCode Remote'
    $form.Width = 440
    $form.Height = 700
    $form.StartPosition = 'CenterScreen'
    $form.BackColor = $Bg
    $form.ForeColor = $Fg

    $header = New-Object System.Windows.Forms.Label
    $header.Text = "OpenCode"
    $header.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
    $header.ForeColor = $Fg
    $header.Dock = 'Top'
    $header.Height = 44
    $header.Padding = '16,14,0,0'
    $form.Controls.Add($header)

    if (-not $state) {
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = "Aucun état trouvé.`nDémarrez le bridge puis rouvrez ce panneau."
        $lbl.Dock = 'Fill'
        $lbl.TextAlign = 'MiddleCenter'
        $lbl.ForeColor = $Muted
        $form.Controls.Add($lbl)
    } else {
        $info = New-Object System.Windows.Forms.Label
        $info.Text = "Hôte : $($state.host)`r`nPort : $($state.port)`r`nTLS : $($state.tls)"
        $info.Height = 70
        $info.Dock = 'Top'
        $info.ForeColor = $Muted
        $info.Padding = '16,0,16,0'
        $form.Controls.Add($info)

        if ($state.qr -and (Test-Path $state.qr)) {
            $pic = New-Object System.Windows.Forms.PictureBox
            $pic.Image = [System.Drawing.Image]::FromFile($state.qr)
            $pic.SizeMode = 'Zoom'
            $pic.BackColor = $Bg
            $pic.Height = 320
            $pic.Dock = 'Top'
            $form.Controls.Add($pic)
        }

        $tokenLbl = New-Object System.Windows.Forms.Label
        $tokenLbl.Text = 'Token du bridge'
        $tokenLbl.Dock = 'Top'
        $tokenLbl.Height = 22
        $tokenLbl.ForeColor = $Muted
        $tokenLbl.Padding = '16,8,0,0'
        $form.Controls.Add($tokenLbl)

        $tokenBox = New-Object System.Windows.Forms.TextBox
        $tokenBox.Text = $state.token
        $tokenBox.Dock = 'Top'
        $tokenBox.BackColor = $Surface
        $tokenBox.ForeColor = $Fg
        $tokenBox.BorderStyle = 'FixedSingle'
        $tokenBox.Font = New-Object System.Drawing.Font('Consolas', 9)
        $form.Controls.Add($tokenBox)

        $copy = New-Button "Copier le lien d'appairage" $true
        $copy.Dock = 'Top'
        $copy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText($state.link) })
        $form.Controls.Add($copy)

        $save = New-Button 'Enregistrer le token & redémarrer' $false
        $save.Dock = 'Top'
        $save.Add_Click({
            Set-Content -Path $ConfigFile -Value (@{ token = $tokenBox.Text } | ConvertTo-Json -Compress) -Encoding ascii -NoNewline
            Stop-Bridge; Start-Bridge
            [System.Windows.Forms.MessageBox]::Show('Bridge redémarré avec le nouveau token.')
        })
        $form.Controls.Add($save)

        $openQr = New-Button 'Ouvrir le QR (image)' $false
        $openQr.Dock = 'Top'
        $openQr.Add_Click({ if ($state.qr) { Start-Process $state.qr } })
        $form.Controls.Add($openQr)
    }

    $restart = New-Button 'Démarrer / redémarrer le bridge' $false
    $restart.Dock = 'Bottom'
    $restart.Add_Click({ Stop-Bridge; Start-Bridge; [System.Windows.Forms.MessageBox]::Show('Bridge (re)démarré.') })
    $form.Controls.Add($restart)

    [void]$form.ShowDialog()
    $form.Dispose()
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$iconPath = Join-Path $RepoRoot 'public\icon-192.png'
if (Test-Path $iconPath) {
    $notify.Icon = [System.Drawing.Icon]::FromHandle((New-Object System.Drawing.Bitmap $iconPath).GetHicon())
} else {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
}
$notify.Text = 'OpenCode Remote'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miPanel = $menu.Items.Add('QR code & paramètres…')
$miPanel.Add_Click({ Show-Panel })
$miCopy = $menu.Items.Add('Copier le lien')
$miCopy.Add_Click({ $s = Get-State; if ($s) { [System.Windows.Forms.Clipboard]::SetText($s.link) } })
$miStart = $menu.Items.Add('Démarrer le bridge')
$miStart.Add_Click({ Start-Bridge })
$miStartTls = $menu.Items.Add('Démarrer le bridge (TLS)')
$miStartTls.Add_Click({ Start-Bridge -Tls })
$miStop = $menu.Items.Add('Arrêter le bridge')
$miStop.Add_Click({ Stop-Bridge })
[void]$menu.Items.Add('-')
$miQuit = $menu.Items.Add('Quitter')
$miQuit.Add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Show-Panel })

$state = Get-State
if ($state) { $notify.ShowBalloonTip(4000, 'OpenCode Remote', "Bridge sur $($state.host):$($state.port)", 'Info') }

[System.Windows.Forms.Application]::Run()
