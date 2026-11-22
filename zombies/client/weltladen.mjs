// Welt für den Client beschaffen: IndexedDB-Treffer oder Aufbau im Web Worker (Oberfläche bleibt bedienbar), Ergebnis wird gespeichert.
// Fällt bei jedem Fehler (kein Worker/IndexedDB, privater Modus) still auf den Aufbau im Haupt-Thread zurück.
import { setzeKartengroesse } from './welt.mjs';
import { baueWeltAusKarte } from './osmwelt.mjs';
import { weltAktivieren, weltSchluessel, weltZerlegen } from './weltkopie.mjs';
import { weltAusIdb, weltInIdb } from './weltidb.mjs';

let arbeiter = null, naechsteId = 1;
const offen = new Map();

function arbeiterHolen() {
  if (arbeiter) return arbeiter;
  const w = new Worker(new URL('./weltarbeiter.mjs', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => { const a = offen.get(data.id); offen.delete(data.id); if (a) a.ja(data); };
  const aus = () => { for (const a of offen.values()) a.nein(new Error('Worker fehlgeschlagen')); offen.clear(); if (arbeiter === w) arbeiter = null; try { w.terminate(); } catch { /* egal */ } };
  w.onerror = aus; w.onmessageerror = aus;
  arbeiter = w;
  return w;
}
function imArbeiter(karte, seed, autos, zurueck) {
  return new Promise((ja, nein) => {
    const id = naechsteId++;
    offen.set(id, { ja, nein });
    try { arbeiterHolen().postMessage({ id, karte, seed, autos, zurueck }); } catch (e) { offen.delete(id); nein(e); }
  });
}

// Liefert { welt, quelle: 'idb' | 'worker' | 'haupt' }. Der Aufrufer setzt vorher setzeKartengroesse (wird hier zur Sicherheit auch gesetzt).
export async function weltBeschaffen(karte, seed, autos) {
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const a = await imArbeiter(karte, seed, autos, true);
    if (a.welt && !a.fehler) return { welt: weltAktivieren(a.welt), quelle: a.quelle === 'idb' ? 'idb' : 'worker' };
  } catch { /* Worker nicht nutzbar → Haupt-Thread */ }
  const key = weltSchluessel(karte, seed, autos);
  const alt = await weltAusIdb(key);
  if (alt && alt.kacheln?.length === karte.breite * karte.hoehe) return { welt: weltAktivieren(alt), quelle: 'idb' };
  const welt = baueWeltAusKarte(karte, seed, { autos });
  weltInIdb(key, weltZerlegen(welt)).catch(() => {});
  return { welt, quelle: 'haupt' };
}

// Nur vorrechnen und in IndexedDB legen (nächstes Level, vom Server angekündigt); Fehler werden verschluckt
export async function weltVorrechnen(karte, seed, autos) {
  try { await imArbeiter(karte, seed, autos, false); } catch { /* egal */ }
}
