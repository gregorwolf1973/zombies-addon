// Jede Haustür hat einen freien Vorplatz und einen begehbaren Weg (Spielerradius) zur Straße
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte, tuerenOhneWeg } from '../client/osmwelt.mjs';

for (const name of ['geretsried', 'geretsried2', 'isarauen']) {
  test(`${name}: keine Tür ohne freien Weg zur Straße`, () => {
    const karte = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
    setzeKartengroesse(karte.breite, karte.hoehe);
    for (const seed of [1, 7]) {
      const w = baueWeltAusKarte(karte, seed, { autos: 1.7 });
      const schlecht = tuerenOhneWeg(w);
      assert.equal(schlecht.length, 0, `Seed ${seed}: Türen ohne Weg: ` + schlecht.map(h => `${h.tuer.x},${h.tuer.y}`).join(' '));
    }
  });
}
