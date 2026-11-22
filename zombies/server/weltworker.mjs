// Worker-Thread: baut Welten aus OSM-Karten abseits der Tick-Schleife (baueWeltAusKarte dauert 1–2 s und blockiert sonst alle Spieler).
// Aufträge laufen nacheinander (die Kartengröße BREITE/HOEHE ist modulweit global). Ergebnis: Welt ohne `hole` (structuredClone).
import { parentPort } from 'node:worker_threads';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { weltZerlegen } from '../client/weltkopie.mjs';

parentPort.on('message', ({ id, karte, seed, autos }) => {
  try {
    setzeKartengroesse(karte.breite, karte.hoehe);
    const welt = baueWeltAusKarte(karte, seed, { autos });
    parentPort.postMessage({ id, welt: weltZerlegen(welt) });
  } catch (e) {
    parentPort.postMessage({ id, fehler: String(e?.stack ?? e) });
  }
});
