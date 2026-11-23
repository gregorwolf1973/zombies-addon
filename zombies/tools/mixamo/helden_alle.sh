#!/bin/sh
# Alle Helden rendern: sh helden_alle.sh <ausgabeordner> <port1,port2,...> [figuren...]   (Server auf 8830 im mixamo-Ordner, je Port ein Headless-Chrome, siehe LIESMICH)
# danach: PYTHONPATH=<pil> python3 helden_atlas_bauen.py <ausgabeordner> ../../client/grafik <ausgabeordner>/waffen.txt
O=$1; PORTS=$(echo $2 | tr ',' ' '); shift 2; FIGS=${*:-swatguy jennifer remy alex brute swat jody roth}
set -- $PORTS; N=$#; i=0
for f in $FIGS; do
  p=$(echo $PORTS | cut -d' ' -f$((i % N + 1))); i=$((i + 1))
  ( CDP_PORT=$p WARTE=900 node cdp.mjs "http://127.0.0.1:8830/held.html?fig=$f" $O/$f.txt >/dev/null 2>&1; python3 held_streifen.py $O/$f.txt $O $f 160 0 ) &
  [ $((i % N)) -eq 0 ] && wait
done
wait
CDP_PORT=$(echo $PORTS | cut -d' ' -f1) WARTE=300 node cdp.mjs "http://127.0.0.1:8830/held.html?waffen=1" $O/waffen.txt >/dev/null 2>&1
