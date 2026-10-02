<#
  OpenCode Remote — Windows tray helper.
  Shows a system-tray icon to view the QR code / pairing link, and to start or
  stop the companion bridge. Reads the state written by the bridge at
  ~/.opencode-remote/state.json.

  Usage:  powershell -ExecutionPolicy Bypass -File .\tray\opencode-remote-tray.ps1
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$StateDir = Join-Path $env:USERPROFILE '.opencode-remote'
$StateFile = Join-Path $StateDir 'state.json'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot 'bridge'

function Get-State {
    if (Test-Path $StateFile) {
        try { return Get-Content $StateFile -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}

function Start-Bridge {
    $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*src/index.ts*' }
    if ($running) { return }
    Start-Process -FilePath 'node' -ArgumentList 'src/index.ts' -WorkingDirectory $BridgeDir -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

function Stop-Bridge {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*src/index.ts*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Show-Panel {
    $state = Get-State
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'OpenCode Remote'
    $form.Width = 460
    $form.Height = 620
    $form.StartPosition = 'CenterScreen'
    $form.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 11)
    $form.ForeColor = [System.Drawing.Color]::White

    if (-not $state) {
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = "Aucun état trouvé.`nLancez le bridge (bouton ci-dessous) puis rouvrez ce panneau."
        $lbl.Dock = 'Fill'
        $lbl.TextAlign = 'MiddleCenter'
        $form.Controls.Add($lbl)
    } else {
        $info = New-Object System.Windows.Forms.Label
        $info.Text = "Hôte : $($state.host)`nPort : $($state.port)`nToken : $($state.token)`nTLS : $($state.tls)"
        $info.Height = 80
        $info.Dock = 'Top'
        $info.Padding = '12,12,12,0'
        $form.Controls.Add($info)

        if ($state.qr -and (Test-Path $state.qr)) {
            $pic = New-Object System.Windows.Forms.PictureBox
            $pic.Image = [System.Drawing.Image]::FromFile($state.qr)
            $pic.SizeMode = 'Zoom'
            $pic.Height = 380
            $pic.Dock = 'Top'
            $form.Controls.Add($pic)
        }

        $copy = New-Object System.Windows.Forms.Button
        $copy.Text = "Copier le lien d'appairage"
        $copy.Height = 40
        $copy.Dock = 'Bottom'
        $copy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText($state.link); [System.Windows.Forms.MessageBox]::Show('Lien copié.') })
        $form.Controls.Add($copy)

        $openQr = New-Object System.Windows.Forms.Button
        $openQr.Text = 'Ouvrir le QR (image)'
        $openQr.Height = 40
        $openQr.Dock = 'Bottom'
        $openQr.Add_Click({ if ($state.qr) { Start-Process $state.qr } })
        $form.Controls.Add($openQr)
    }

    $restart = New-Object System.Windows.Forms.Button
    $restart.Text = 'Redémarrer le bridge'
    $restart.Height = 40
    $restart.Dock = 'Bottom'
    $restart.Add_Click({ Stop-Bridge; Start-Bridge; [System.Windows.Forms.MessageBox]::Show('Bridge redémarré.') })
    $form.Controls.Add($restart)

    [void]$form.ShowDialog()
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
$miPanel = $menu.Items.Add('QR code & réglages…')
$miPanel.Add_Click({ Show-Panel })
$miCopy = $menu.Items.Add('Copier le lien')
$miCopy.Add_Click({ $s = Get-State; if ($s) { [System.Windows.Forms.Clipboard]::SetText($s.link) } })
$miStart = $menu.Items.Add('Démarrer le bridge')
$miStart.Add_Click({ Start-Bridge })
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
