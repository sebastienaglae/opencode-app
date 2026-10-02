<#
  OpenCode Remote — Windows tray helper (styled like the app).
  Tray icon -> panel with the QR code, connection info and settings.

  Usage:  powershell -ExecutionPolicy Bypass -File .\tray\opencode-remote-tray.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$StateDir = Join-Path $env:USERPROFILE '.opencode-remote'
$StateFile = Join-Path $StateDir 'state.json'
$ConfigFile = Join-Path $StateDir 'config.json'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot 'bridge'

$Bg = [System.Drawing.Color]::FromArgb(10, 10, 11)
$Surface = [System.Drawing.Color]::FromArgb(24, 24, 27)
$Fg = [System.Drawing.Color]::FromArgb(237, 237, 240)
$Muted = [System.Drawing.Color]::FromArgb(155, 155, 163)
$Accent = [System.Drawing.Color]::FromArgb(91, 157, 255)

function Get-State {
    if (Test-Path $StateFile) {
        try { return Get-Content $StateFile -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}

function Get-BridgeProcess {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*src/index.ts*' }
}

function Start-Bridge {
    param([switch]$Tls)
    if (Get-BridgeProcess) { return }
    $arguments = @('src/index.ts')
    if ($Tls) { $arguments += '--tls' }
    Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $BridgeDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

function Stop-Bridge {
    Get-BridgeProcess | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function New-Button($text, $accent) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text
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
    $form.ClientSize = New-Object System.Drawing.Size(440, 660)
    $form.StartPosition = 'CenterScreen'
    $form.BackColor = $Bg
    $form.ForeColor = $Fg
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false

    $header = New-Object System.Windows.Forms.Label
    $header.Text = 'OpenCode'
    $header.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
    $header.ForeColor = $Fg
    $header.Location = New-Object System.Drawing.Point(16, 12)
    $header.Size = New-Object System.Drawing.Size(400, 32)
    $form.Controls.Add($header)

    if ($state) {
        $info = New-Object System.Windows.Forms.Label
        $info.Text = "Hôte : $($state.host)     Port : $($state.port)     TLS : $($state.tls)"
        $info.ForeColor = $Muted
        $info.Location = New-Object System.Drawing.Point(16, 46)
        $info.Size = New-Object System.Drawing.Size(408, 20)
        $form.Controls.Add($info)

        if ($state.qr -and (Test-Path $state.qr)) {
            $pic = New-Object System.Windows.Forms.PictureBox
            $pic.Image = [System.Drawing.Image]::FromFile($state.qr)
            $pic.SizeMode = 'Zoom'
            $pic.BackColor = $Bg
            $pic.Location = New-Object System.Drawing.Point(16, 72)
            $pic.Size = New-Object System.Drawing.Size(408, 300)
            $form.Controls.Add($pic)
        }

        $tokenLbl = New-Object System.Windows.Forms.Label
        $tokenLbl.Text = 'Token du bridge'
        $tokenLbl.ForeColor = $Muted
        $tokenLbl.Location = New-Object System.Drawing.Point(16, 384)
        $tokenLbl.Size = New-Object System.Drawing.Size(408, 18)
        $form.Controls.Add($tokenLbl)

        $tokenBox = New-Object System.Windows.Forms.TextBox
        $tokenBox.Text = $state.token
        $tokenBox.BackColor = $Surface
        $tokenBox.ForeColor = $Fg
        $tokenBox.BorderStyle = 'FixedSingle'
        $tokenBox.Font = New-Object System.Drawing.Font('Consolas', 9)
        $tokenBox.Location = New-Object System.Drawing.Point(16, 404)
        $tokenBox.Size = New-Object System.Drawing.Size(408, 24)
        $form.Controls.Add($tokenBox)

        $copy = New-Button "Copier le lien d'appairage" $true
        $copy.Location = New-Object System.Drawing.Point(16, 440)
        $copy.Size = New-Object System.Drawing.Size(408, 36)
        $copy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText([string]$state.link) })
        $form.Controls.Add($copy)

        $save = New-Button 'Enregistrer le token & redémarrer' $false
        $save.Location = New-Object System.Drawing.Point(16, 484)
        $save.Size = New-Object System.Drawing.Size(408, 36)
        $save.Add_Click({
            Set-Content -Path $ConfigFile -Value (@{ token = $tokenBox.Text } | ConvertTo-Json -Compress) -Encoding ascii -NoNewline
            Stop-Bridge; Start-Bridge
            [System.Windows.Forms.MessageBox]::Show('Bridge redémarré avec le nouveau token.')
        })
        $form.Controls.Add($save)

        $openQr = New-Button 'Ouvrir le QR (image)' $false
        $openQr.Location = New-Object System.Drawing.Point(16, 528)
        $openQr.Size = New-Object System.Drawing.Size(408, 36)
        $openQr.Add_Click({ if ($state.qr) { Start-Process $state.qr } })
        $form.Controls.Add($openQr)
    } else {
        $empty = New-Object System.Windows.Forms.Label
        $empty.Text = "Aucun état trouvé.`nDémarrez le bridge puis rouvrez ce panneau."
        $empty.ForeColor = $Muted
        $empty.TextAlign = 'MiddleCenter'
        $empty.Location = New-Object System.Drawing.Point(16, 72)
        $empty.Size = New-Object System.Drawing.Size(408, 300)
        $form.Controls.Add($empty)
    }

    $restart = New-Button 'Démarrer / redémarrer le bridge' $false
    $restart.Location = New-Object System.Drawing.Point(16, 576)
    $restart.Size = New-Object System.Drawing.Size(408, 36)
    $restart.Add_Click({ Stop-Bridge; Start-Bridge; [System.Windows.Forms.MessageBox]::Show('Bridge (re)démarré.') })
    $form.Controls.Add($restart)

    [void]$form.ShowDialog()
    $form.Dispose()
}

$notify = New-Object System.Windows.Forms.NotifyIcon
try {
    $iconPath = Join-Path $RepoRoot 'public\icon-192.png'
    if (Test-Path $iconPath) {
        $bmp = New-Object System.Drawing.Bitmap $iconPath
        $notify.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    } else {
        $notify.Icon = [System.Drawing.SystemIcons]::Application
    }
} catch {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
}
$notify.Text = 'OpenCode Remote'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miPanel = $menu.Items.Add('QR code & paramètres…')
$miPanel.Add_Click({ Show-Panel })
$miCopy = $menu.Items.Add('Copier le lien')
$miCopy.Add_Click({ $s = Get-State; if ($s) { [System.Windows.Forms.Clipboard]::SetText([string]$s.link) } })
$miStart = $menu.Items.Add('Démarrer le bridge')
$miStart.Add_Click({ Start-Bridge })
$miStartTls = $menu.Items.Add('Démarrer le bridge (TLS)')
$miStartTls.Add_Click({ Start-Bridge -Tls })
$miStop = $menu.Items.Add('Arrêter le bridge')
$miStop.Add_Click({ Stop-Bridge })
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$miQuit = $menu.Items.Add('Quitter')
$miQuit.Add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Show-Panel })

$state = Get-State
if ($state) { $notify.ShowBalloonTip(4000, 'OpenCode Remote', "Bridge sur $($state.host):$($state.port)", 'Info') }

[System.Windows.Forms.Application]::Run()
