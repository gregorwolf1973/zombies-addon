// Prüft je Karte und Seed, ob jede betretbare Haustür über einen freien Weg (Feinraster, Spielerradius) zur Straße führt.
// Aufruf: node tools/tueren_pruefen.mjs [seed ...]
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte, tuerenOhneWeg } from '../client/osmwelt.mjs';

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!seeds.length) seeds.push(1, 7, 12345);
let gesamt = 0;
for (const name of ['geretsried', 'isarauen']) {
  const karte = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  for (const seed of seeds) {
    const w = baueWeltAusKarte(karte, seed, { autos: 1.7 });
    const schlecht = tuerenOhneWeg(w);
    const n = w.haeuser.filter(h => h.tuer && h.betretbar).length;
    gesamt += schlecht.length;
    console.log(`${name} Seed ${seed}: ${schlecht.length} von ${n} Türen ohne freien Weg`, schlecht.slice(0, 5).map(h => `${h.tuer.x},${h.tuer.y}`).join(' '));
  }
}
process.exitCode = gesamt ? 1 : 0;
