#!/bin/sh
# Alle Figuren x 9 Clips rendern: sh alle.sh <ausgabeordner>  (Server ${SEITE_PORT:-8818} + Chrome ${CDP_PORT:-9333} laufen; PYTHONPATH=<pil>)
# crawl/dying brauchen größere Felder (liegende Figur ~3,8 m lang): feld=5 (200 px bei 40 px/m)
# tod2/tod3 = zusätzliche Sterbebewegungen (Mixamo „Falling Back Death“, „Dying“; FBX ohne Haut, Haut aus dying.fbx)
D=${1:-.}; H=$(dirname "$0"); S=${SEITE_PORT:-8818}
for f in ${FIGUREN:-warzombie copzombie zombiegirl yaku romero}; do for c in ${CLIPS:-walk run crawl idle attack neckbite dying tod2 tod3}; do
  X="&gross=2"; FP=160; Q="datei=$f/$c.fbx"
  case $c in attack|neckbite) X="$X&einmal=1";; dying) X="$X&einmal=1&feld=5&vx=0&px=64"; FP=200;; tod2|tod3) Q="datei=$f/dying.fbx&anim=$f/$c.fbx"; X="$X&einmal=1&feld=5&vx=0&px=64"; FP=200;; crawl) X="$X&feld=5&vx=0&px=64"; FP=200;; esac
  node "$H/cdp.mjs" "http://127.0.0.1:$S/seite.html?t=$$$c&$Q$X" "$D/${f}_$c.txt" >/dev/null 2>&1
  python3 "$H/zusammenbau.py" "$D/${f}_$c.txt" "$D/${f}_$c" $FP 2>&1 | tail -1
done; done
