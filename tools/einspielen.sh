#!/usr/bin/env bash
# Add-on auf das Zielsystem einspielen (Home Assistant Supervisor). Aufruf: tools/einspielen.sh [--nur-pruefen]
#
# Schritte: (a) sauberer Arbeitsbaum + Version, (b) Weltfingerabdruck lokal gegen den neuen Client im Zielcontainer,
# (c) Archiv per SSH ins Add-on-Verzeichnis, (d) Supervisor: Store neu laden, Update, warten bis gestartet,
# (e) Fingerabdruck im laufenden Container gegen lokal, (f) Log auf Fehler prüfen.
# --nur-pruefen: nur (a) und (b); es wird nichts ins Add-on-Verzeichnis geschrieben und nichts aktualisiert
# (der neue Client wird nur vorübergehend nach /tmp/neu im Container entpackt).
#
# Umgebungsvariablen (ohne Vorgaben; optional aus tools/einspielen.env.lokal, die nicht im Repo liegt):
#   ZOMBIES_SSH        SSH-Ziel (Befehle laufen dort mit sudo)
#   ZOMBIES_ADDON_DIR  Verzeichnis, in dem der Ordner "zombies" des Add-ons liegt (Elternordner wird per cd benutzt)
#   ZOMBIES_CONTAINER  Name des Add-on-Containers (docker exec, App-Pfad /app)
#   ZOMBIES_SLUG       Add-on-Slug im Supervisor
#   ZOMBIES_HA_WS      Pfad zu einem Helfer, der Supervisor-API-Aufrufe als JSON-Argument ausführt:
#                      python3 "$ZOMBIES_HA_WS" '{"type":"supervisor/api","endpoint":"/store/reload","method":"post","timeout":120}'
set -euo pipefail

nur_pruefen=0
case "${1:-}" in
  --nur-pruefen) nur_pruefen=1 ;;
  "") ;;
  *) echo "Aufruf: $0 [--nur-pruefen]" >&2; exit 2 ;;
esac

wurzel="$(cd "$(dirname "$0")/.." && pwd)"
cd "$wurzel"
if [ -f tools/einspielen.env.lokal ]; then
  # shellcheck disable=SC1091
  . tools/einspielen.env.lokal
fi

fehlt=0
for v in ZOMBIES_SSH ZOMBIES_ADDON_DIR ZOMBIES_CONTAINER ZOMBIES_SLUG ZOMBIES_HA_WS; do
  if [ -z "${!v:-}" ]; then echo "Fehlt: Umgebungsvariable $v (siehe Kopf von tools/einspielen.sh)" >&2; fehlt=1; fi
  if [[ "${!v:-}" =~ [^A-Za-z0-9_./@:~-] ]]; then echo "Unzulässige Zeichen in $v" >&2; fehlt=1; fi
done
[ "$fehlt" = 0 ] || exit 2
[ -f "$ZOMBIES_HA_WS" ] || { echo "Helfer ZOMBIES_HA_WS nicht gefunden: $ZOMBIES_HA_WS" >&2; exit 2; }

schritt() { printf '\n== %s\n' "$*"; }
abbruch() { echo "ABBRUCH: $*" >&2; exit 1; }
# shellcheck disable=SC2029  # Variablen sollen lokal expandiert werden (nur geprüfte Zeichen, siehe oben)
fern() { ssh "$ZOMBIES_SSH" "$@"; }
# Supervisor-API über den Helfer; Antwort (JSON) auf stdout
sv() { python3 "$ZOMBIES_HA_WS" "$1"; }
# Feld aus JSON-Antwort (Pfad wie data.version_latest); leer, wenn nicht vorhanden
jfeld() { python3 -c 'import json,sys
d=json.load(sys.stdin)
d=d.get("result",d) if isinstance(d,dict) else d
d=d.get("data",d) if isinstance(d,dict) and isinstance(d.get("data"),dict) else d
for k in sys.argv[1].replace("data.","",1).split("."):
    d=d.get(k) if isinstance(d,dict) else None
print("" if d is None else d)' "$1"; }
addon_info() { sv "{\"type\":\"supervisor/api\",\"endpoint\":\"/addons/$ZOMBIES_SLUG/info\",\"method\":\"get\",\"timeout\":60}" 2>/dev/null || true; }

# (a) Arbeitsbaum und Version
schritt "(a) Arbeitsbaum und Version"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no >&2
  abbruch "Arbeitsbaum nicht sauber (erst committen)"
fi
version="$(sed -n 's/^version: *"\{0,1\}\([^"[:space:]]*\)"\{0,1\}.*/\1/p' zombies/config.yaml | head -n 1)"
[ -n "$version" ] || abbruch "keine Version in zombies/config.yaml"
echo "Version $version, Stand $(git rev-parse --short HEAD)"

# (b) Fingerabdruck: lokal gegen den neuen Client, im Zielcontainer berechnet
schritt "(b) Weltfingerabdruck lokal und im Zielcontainer (neuer Client in /tmp/neu)"
lokal="$(node tools/fp_vergleich.mjs "$wurzel/zombies")"
echo "$lokal"
git archive --format=tar HEAD zombies/client | gzip \
  | fern "sudo docker exec -i $ZOMBIES_CONTAINER sh -c 'rm -rf /tmp/neu && mkdir -p /tmp/neu && tar -xzf - -C /tmp/neu'"
ziel="$(fern "sudo docker exec -i $ZOMBIES_CONTAINER node --input-type=module - /tmp/neu/zombies" < tools/fp_vergleich.mjs)"
fern "sudo docker exec $ZOMBIES_CONTAINER rm -rf /tmp/neu" || true
if [ "$lokal" != "$ziel" ]; then
  diff <(echo "$lokal") <(echo "$ziel") >&2 || true
  abbruch "Fingerabdruck im Zielcontainer weicht vom lokalen ab (Weltcode nicht deterministisch?)"
fi
echo "Fingerabdruck stimmt überein."

if [ "$nur_pruefen" = 1 ]; then echo; echo "Nur geprüft, nichts eingespielt."; exit 0; fi

# (c) Hochladen
schritt "(c) Archiv ins Add-on-Verzeichnis"
git archive --format=tar HEAD zombies | gzip \
  | fern "cd $ZOMBIES_ADDON_DIR/.. && sudo rm -rf $ZOMBIES_ADDON_DIR && sudo tar -xzf -"
# lokales Add-on immer aus dem Quellcode bauen: image: (fertige Images für den öffentlichen Store) im lokalen Ordner entfernen
fern "sudo sed -i '/^image:/d' $ZOMBIES_ADDON_DIR/config.yaml"
echo "Hochgeladen nach $ZOMBIES_ADDON_DIR"

# (d) Supervisor: Store neu laden, Update, warten
schritt "(d) Supervisor: Store neu laden und Update auf $version"
sv '{"type":"supervisor/api","endpoint":"/store/reload","method":"post","timeout":120}' >/dev/null || echo "Hinweis: store reload meldete einen Fehler (wird weiter versucht)" >&2
bereit=0
for _ in $(seq 1 24); do
  if [ "$(addon_info | jfeld data.version_latest)" = "$version" ]; then bereit=1; break; fi
  sleep 5
done
[ "$bereit" = 1 ] || abbruch "version_latest wurde nicht $version (Store-Reload prüfen)"
# Die Websocket-Verbindung kann beim Update abbrechen, deshalb Zeitlimit und Fehler ignorieren; entscheidend ist der Zustand danach.
timeout 300 python3 "$ZOMBIES_HA_WS" "{\"type\":\"supervisor/api\",\"endpoint\":\"/addons/$ZOMBIES_SLUG/update\",\"method\":\"post\",\"timeout\":280}" >/dev/null 2>&1 \
  || echo "Hinweis: update-Aufruf endete mit Fehler/Zeitlimit; Zustand wird geprüft" >&2
laeuft=0
for _ in $(seq 1 60); do
  info="$(addon_info)"
  if [ "$(echo "$info" | jfeld data.version)" = "$version" ] && [ "$(echo "$info" | jfeld data.state)" = "started" ]; then laeuft=1; break; fi
  sleep 5
done
[ "$laeuft" = 1 ] || abbruch "$version wurde nicht gestartet (Zustand: $(echo "${info:-}" | jfeld data.state))"
echo "$version started"

# (e) Fingerabdruck im laufenden Container
schritt "(e) Weltfingerabdruck im laufenden Container"
lauf=""
for _ in $(seq 1 12); do
  if lauf="$(fern "sudo docker exec -i $ZOMBIES_CONTAINER node --input-type=module - /app" < tools/fp_vergleich.mjs 2>/dev/null)"; then break; fi
  sleep 5
done
if [ "$lokal" != "$lauf" ]; then
  diff <(echo "$lokal") <(echo "$lauf") >&2 || true
  abbruch "Fingerabdruck im laufenden Container weicht ab"
fi
echo "Fingerabdruck stimmt überein."

# (f) Log
schritt "(f) Letzte Logzeilen"
log="$(fern "sudo docker logs --tail 40 $ZOMBIES_CONTAINER 2>&1" || true)"
echo "$log" | tail -n 8
if echo "$log" | grep -iE 'error|exception' >/dev/null; then
  echo "WARNUNG: Fehler/Exception in den letzten 40 Logzeilen:" >&2
  echo "$log" | grep -iE 'error|exception' >&2
  exit 1
fi
echo; echo "Fertig: $version läuft."
