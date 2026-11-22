// Pools: kein Hindernis, alle Figuren mit 10 % Tempo im Wasser (baumFaktor, Server und Client-Vorhersage rechnen gleich)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, setzeKartengroesse, baumFaktor, poolFaktor, frei, WERTE as W } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';

after(() => setzeKartengroesse(64, 48));
const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const w = baueWeltAusKarte(karte, 4711);

test('OSM-Pools: Kachel begehbar, Tempo 10 %, daneben normal', () => {
  const o = karte.objekte.find(q => q.a === 'pool');
  const x = (o.x + (o.b ?? 1) / 2) * KACHEL, y = (o.y + (o.h ?? 1) / 2) * KACHEL;
  assert.notEqual(w.hole(o.x, o.y), T.WASSER);
  assert.equal(poolFaktor(w, x, y), 0.1);
  assert.equal(baumFaktor(w, x, y, 25), 0.1);
  assert.equal(baumFaktor(w, x, y, 100), 0.1, 'auch bei baumTempo 100');
  assert.ok(frei(w, x, y, W.spielerRadius), 'Spieler kann hinein');
  assert.equal(poolFaktor({ ...w, ebene: 'haus:1' }, x, y), 1);
});

test('Luftbild-Pool-Polygone: innen 10 %, außen 1', () => {
  const q = w.poolZonen.find(z => z.p);
  assert.ok(q, 'Luftbild-Pools vorhanden');
  let innen = 0;
  for (let i = 0; i < 40 && !innen; i++) {
    const x = q.x0 + (q.x1 - q.x0) * (i % 7 + 0.5) / 7, y = q.y0 + (q.y1 - q.y0) * (Math.floor(i / 7) + 0.5) / 6;
    if (poolFaktor(w, x, y) === 0.1) innen++;
  }
  assert.ok(innen > 0);
  assert.equal(poolFaktor(w, q.x0 - 5, q.y0 - 5), 1);
});
