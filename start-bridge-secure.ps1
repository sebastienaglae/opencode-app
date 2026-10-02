# Lance le bridge OpenCode Remote en HTTPS/WSS (certificat auto-signé).
# Usage:  .\start-bridge-secure.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot 'bridge')
if (-not (Test-Path 'node_modules')) {
  Write-Host '[bridge] Installation des dépendances…'
  npm install --no-audit --no-fund
}
node src/index.ts --tls @args
