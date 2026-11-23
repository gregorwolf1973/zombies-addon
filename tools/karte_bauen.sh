#!/usr/bin/env bash
# Gesamtkette Kartenbau (siehe tools/karte_bauen.py): tools/karte_bauen.sh <karte> [--nur a,b] [--von x] [--bis y] [--neu-anlegen] [--ohne-laden] [--liste]
set -euo pipefail
exec python3 "$(dirname "$0")/karte_bauen.py" "$@"
