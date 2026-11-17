// Die Zeichenfunktionen laufen für verschiedene Karten ohne Fehler durch (Schein-Canvas)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueWelt } from '../client/welt.mjs';
import { zeichneBoden, zeichneOben, zeichneDach } from '../client/aussehen.mjs';

function scheinCanvas() {
  let aufrufe = 0;
  const schein = new Proxy(function () {}, {
    get: (t, k) => k === 'aufrufe' ? aufrufe : k === 'measureText' ? () => ({ width: 10 }) : schein,
    set: () => true,
    apply: () => { aufrufe++; return schein; },
  });
  return schein;
}

for (const seed of [1, 42, 1234]) {
  test(`Aussehen für Karte ${seed}`, () => {
    const w = baueWelt(seed);
    const boden = scheinCanvas(), oben = scheinCanvas();
    zeichneBoden(boden, w);
    zeichneOben(oben, w);
    assert.ok(boden.aufrufe > 10000, 'Boden zeichnet zu wenig');
    assert.ok(oben.aufrufe > 1000, 'obere Ebene zeichnet zu wenig');
    w.haeuser.forEach((h, i) => zeichneDach(scheinCanvas(), h, i));
  });
}
