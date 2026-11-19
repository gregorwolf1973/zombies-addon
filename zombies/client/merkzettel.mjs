// Spieler-Einstellungen mit dem Server abgleichen: gelten dadurch auf jedem Gerät.
// localStorage bleibt Zwischenspeicher und Vorgabe vor dem ersten Beitritt. Der Server schickt beim Beitritt
// 'einstellungen_spieler' {werte}; fehlt dort etwas, laden wir es hoch. Jede spätere Änderung geht gesammelt hin.
import { EINSTELLUNG_MUSTER, einstellungenBereinigen } from './einstellungen_regeln.mjs';

let raum = null, hoerbereit = false, serverStand = {}, timer = null, anwenden = {};
let setzeOrig = null, warteOk = null;

function lokalLesen() {
  const roh = {};
  try { for (const k of Object.keys(EINSTELLUNG_MUSTER)) { const v = localStorage.getItem(k); if (v !== null) roh[k] = v; } } catch { /* ohne Speicher */ }
  return einstellungenBereinigen(roh);
}
function senden() {
  timer = null;
  if (!raum || !hoerbereit) return;
  const lokal = lokalLesen();
  if (JSON.stringify(lokal) === JSON.stringify(serverStand)) return;
  try { raum.send('einstellungen_spieler', { werte: lokal }); serverStand = lokal; } catch { /* Verbindung weg */ }
}
const planen = () => { if (raum && hoerbereit && !timer) timer = setTimeout(senden, 400); };

// Jeden Schreibzugriff auf die bekannten Schlüssel bemerken (die übrigen Module schreiben weiter wie bisher in localStorage)
try {
  setzeOrig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setzeOrig.call(this, k, v);
    try { if (this === localStorage && k in EINSTELLUNG_MUSTER) planen(); } catch { /* egal */ }
  };
} catch { /* alte Umgebung */ }

// anwendenFuer: { schluessel: wert => …sofort umsetzen… } für Werte, die ein Modul schon gelesen hat (z. B. Lautstärke)
export function merkzettelAnschliessen(r, anwendenFuer = {}) {
  raum = r; anwenden = anwendenFuer; hoerbereit = false; serverStand = {};
  r.onMessage('einstellungen_spieler', m => {
    const vomServer = einstellungenBereinigen(m?.werte);
    for (const [k, v] of Object.entries(vomServer)) {
      let alt = null; try { alt = localStorage.getItem(k); } catch { /* egal */ }
      if (alt === v) continue;
      try { (setzeOrig ?? Storage.prototype.setItem).call(localStorage, k, v); } catch { /* egal */ }
      try { anwenden[k]?.(v); } catch { /* egal */ }
    }
    serverStand = vomServer;
    hoerbereit = true;
    senden();   // was nur lokal vorhanden ist, geht hoch
    warteOk?.();
  });
}
// wartet (höchstens ms), bis der Server die gemerkten Werte geschickt hat – danach liest das Spiel sie aus dem localStorage
export function merkzettelErwarten(ms = 1500) {
  if (hoerbereit) return Promise.resolve();
  return new Promise(ok => { warteOk = ok; setTimeout(ok, ms); });
}
export const merkzettelLokal = lokalLesen;
