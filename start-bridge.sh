#!/usr/bin/env bash
# Lance le bridge OpenCode Remote.
# Usage:  ./start-bridge.sh [--host 0.0.0.0] [--ports 47821,47311] [--token ...]
set -euo pipefail
cd "$(dirname "$0")/bridge"
if [ ! -d node_modules ]; then
  echo "[bridge] Installation des dépendances…"
  npm install --no-audit --no-fund
fi
exec node src/index.ts "$@"
