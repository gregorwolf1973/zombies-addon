#!/usr/bin/env bash
# Version in zombies/config.yaml setzen und einen CHANGELOG-Kopf mit heutigem Datum anlegen. Sonst nichts.
# Aufruf: tools/release.sh 0.81.0
set -euo pipefail
cd "$(dirname "$0")/.."
ver="${1:-}"
if ! [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "Aufruf: $0 <Version, z. B. 0.81.0>" >&2; exit 2; fi
if grep -q "^## $ver " zombies/CHANGELOG.md; then echo "CHANGELOG hat schon einen Eintrag für $ver" >&2; exit 1; fi
sed -i "s/^version: .*/version: \"$ver\"/" zombies/config.yaml
datum="$(date +%d.%m.%Y)"
tmp="$(mktemp)"
{ head -n 2 zombies/CHANGELOG.md; printf '## %s – %s\n\n- \n\n' "$ver" "$datum"; tail -n +3 zombies/CHANGELOG.md; } > "$tmp"
mv "$tmp" zombies/CHANGELOG.md
echo "Version $ver gesetzt, CHANGELOG-Kopf angelegt (Zeile mit '- ' ausfüllen)."
