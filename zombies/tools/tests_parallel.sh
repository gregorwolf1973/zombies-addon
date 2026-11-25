#!/usr/bin/env bash
# Alle (oder die genannten) Testdateien parallel, aber gefahrlos für den Rechner:
#  - ein gemeinsamer systemd-Scope: höchstens MAXMEM Speicher (Vorgabe 12G), keine Auslagerung,
#    OOMPolicy=continue (ein Ausreißer wird beendet, die anderen laufen weiter)
#  - höchstens CPUQUOTA (Vorgabe 800% = 8 Kerne), niedrige Priorität (nice 10)
#  - JOBS Dateien gleichzeitig (Vorgabe 4), jede mit eigenem Zeitlimit
# Aufruf (aus zombies/): tools/tests_parallel.sh [tests/a.test.mjs …]
# Ergebnis: eine Zeile je Datei in $ERGEBNIS (Vorgabe /tmp/zombies-tests-<pid>/_alle.txt), danach die roten.
set -u
JOBS=${JOBS:-4}; MAXMEM=${MAXMEM:-12G}; CPUQUOTA=${CPUQUOTA:-800%}; ZEIT=${ZEIT:-400}
AUS=${AUS:-/tmp/zombies-tests-$$}; mkdir -p "$AUS"; ERGEBNIS="$AUS/_alle.txt"; : > "$ERGEBNIS"
cd "$(dirname "$0")/.." || exit 1
if [ $# -gt 0 ]; then DATEIEN=("$@"); else DATEIEN=(tests/*.test.mjs); fi
export AUS ERGEBNIS ZEIT
lauf() {
  f=$1; t=$(basename "$f" .test.mjs)
  timeout "$ZEIT" node --test "$f" > "$AUS/$t.txt" 2>&1; rc=$?
  echo "$t rc=$rc $(grep -E '^ℹ (pass|fail)' "$AUS/$t.txt" | tr '\n' ' ')" >> "$ERGEBNIS"
}
export -f lauf
systemd-run --user --scope -q -p MemoryMax="$MAXMEM" -p MemorySwapMax=0 -p OOMPolicy=continue -p CPUQuota="$CPUQUOTA" \
  nice -n 10 bash -c 'printf "%s\n" "$@" | xargs -P '"$JOBS"' -I{} bash -c "lauf {}"' _ "${DATEIEN[@]}"
echo "Ergebnis: $ERGEBNIS ($(wc -l < "$ERGEBNIS") Dateien)"
grep -v " rc=0 " "$ERGEBNIS" || echo "alle grün"
