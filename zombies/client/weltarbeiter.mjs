// Web Worker: Welt aus IndexedDB laden oder bauen (baueWeltAusKarte dauert 2–8 s und würde die Oberfläche einfrieren) und speichern.
// Nachricht: { id, karte, seed, autos, zurueck } → Antwort { id, welt (ohne hole) | null, quelle: 'idb'|'gebaut', fehler? }
// zurueck:false = nur in IndexedDB ablegen (Vorberechnung fürs nächste Level), die Welt wird nicht übertragen.
import { setzeKartengroesse } from './welt.mjs';
import { baueWeltAusKarte } from './osmwelt.mjs';
import { weltZerlegen, weltSchluessel } from './weltkopie.mjs';
import { weltAusIdb, weltHatIdb, weltInIdb } from './weltidb.mjs';

self.onmessage = async ({ data: { id, karte, seed, autos, zurueck } }) => {
  try {
    const key = weltSchluessel(karte, seed, autos);
    if (!zurueck) {
      if (!(await weltHatIdb(key))) {
        setzeKartengroesse(karte.breite, karte.hoehe);
        await weltInIdb(key, weltZerlegen(baueWeltAusKarte(karte, seed, { autos })));
      }
      self.postMessage({ id, welt: null, quelle: 'idb' });
      return;
    }
    const alt = await weltAusIdb(key);
    if (alt && alt.kacheln?.length === karte.breite * karte.hoehe) { self.postMessage({ id, welt: alt, quelle: 'idb' }); return; }
    setzeKartengroesse(karte.breite, karte.hoehe);
    const welt = weltZerlegen(baueWeltAusKarte(karte, seed, { autos }));
    self.postMessage({ id, welt, quelle: 'gebaut' });
    await weltInIdb(key, welt);   // nach der Antwort: das Spiel startet schon, das Speichern läuft im Worker weiter
  } catch (e) {
    self.postMessage({ id, welt: null, fehler: String(e?.stack ?? e) });
  }
};
