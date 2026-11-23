#!/bin/sh
# Alle Schleifen neu rendern: sh pruefe.sh <ausgabeordner>   (Server 8818 und Chrome 9333 müssen laufen, siehe LIESMICH.txt)
D=${1:-.}; H=$(dirname "$0")
for f in "Zombie Walk:walk" "Zombie Run:run" "Zombie Running:running"; do n=${f#*:}; f=${f%:*}
  node "$H/cdp.mjs" "http://127.0.0.1:8818/seite.html?datei=$(echo "$f"|sed 's/ /%20/g').fbx${EXTRA}" "$D/$n.txt" >/dev/null
  python3 "$H/zusammenbau.py" "$D/$n.txt" "$D/$n"
done
