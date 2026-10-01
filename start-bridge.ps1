# Lance le bridge OpenCode Remote.
# Usage:  .\start-bridge.ps1 [--host 0.0.0.0] [--ports 47821,47311] [--token ...]
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot 'bridge')
if (-not (Test-Path 'node_modules')) {
  Write-Host '[bridge] Installation des dépendances…'
  npm install --no-audit --no-fund
}
node src/index.ts @args
