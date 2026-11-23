#!/bin/sh
# Alle Figuren x 7 Clips rendern: sh alle.sh <ausgabeordner>  (Server 8818 + Chrome 9333 laufen; PYTHONPATH=<pil>)
# crawl/dying brauchen größere Felder (liegende Figur ~3,8 m lang): feld=5 (200 px bei 40 px/m)
D=${1:-.}; H=$(dirname "$0")
for f in ${FIGUREN:-warzombie copzombie zombiegirl yaku romero}; do for c in ${CLIPS:-walk run crawl idle attack neckbite dying}; do
  X="&gross=2"; FP=160; case $c in attack|neckbite) X="$X&einmal=1";; dying) X="$X&einmal=1&feld=5&vx=0&px=64"; FP=200;; crawl) X="$X&feld=5&vx=0&px=64"; FP=200;; esac
  node "$H/cdp.mjs" "http://127.0.0.1:8818/seite.html?t=$$$c&datei=$f/$c.fbx$X" "$D/${f}_$c.txt" >/dev/null 2>&1
  python3 "$H/zusammenbau.py" "$D/${f}_$c.txt" "$D/${f}_$c" $FP 2>&1 | tail -1
done; done
