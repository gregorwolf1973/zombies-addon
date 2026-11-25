// Welt zwischenspeichern: baueWeltAusKarte ist deterministisch aus (Karte, Seed, Autos-Faktor, WELT_VERSION) und dauert 1–8 s.
// Dieses Modul macht das Ergebnis übertragbar (Worker, IndexedDB): einzig `hole` ist eine Funktion (Closure über welt.kacheln);
// alles andere sind Objekte, Arrays und Uint8Arrays (structuredClone-fähig, geteilte Verweise bleiben innerhalb EINER Kopie erhalten).
// Läuft im Browser (Haupt-Thread, Web Worker) und im Server (Haupt-Thread, worker_threads).
import { BREITE, HOEHE, T, WELT_VERSION } from './welt.mjs';

// Übertragbare Form: alles außer der Funktion `hole`
export function weltZerlegen(w) {
  const { hole, _zaunIdx, ...rest } = w;   // eslint-disable-line no-unused-vars -- Zaunindex (welt.mjs zaunIndex) baut sich bei Bedarf neu
  return rest;
}

// Spielfertig machen: `hole` wie in baueWeltAusKarte (liest die live gebundenen BREITE/HOEHE und welt.kacheln)
export function weltAktivieren(w) {
  const k = w.kacheln;
  w.hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? k[y * BREITE + x] : T.ZAUN;
  return w;
}

// Unabhängige Kopie einer fertigen Welt (zum Weiterreichen aus einem Zwischenspeicher: das Spiel verändert seine Welt)
export function weltKopieren(w) {
  return weltAktivieren(structuredClone(weltZerlegen(w)));
}

// Schlüssel aus allen Eingaben des Aufbaus. Die Karte geht mit Name, Größe und einer Prüfsumme über Kacheln/Zaunart/Listenlängen ein,
// damit eine geänderte Kartendatei ohne WELT_VERSION-Erhöhung keine alte Welt liefert.
export function kartenPruefsumme(karte) {
  let h = 0x811c9dc5;
  const mische = s => { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; };
  mische(String(karte.kacheln ?? '')); mische(String(karte.zaunart ?? ''));
  for (const k of Object.keys(karte).sort()) {
    const v = karte[k];
    mische(k + ':' + (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : typeof v === 'object' && v ? Object.keys(v).length : String(v)) + ';');
  }
  return h.toString(36);
}
export function weltSchluessel(karte, seed, autos) {
  return [karte.name ?? '', karte.breite, karte.hoehe, kartenPruefsumme(karte), seed, autos, WELT_VERSION].join('|');
}
