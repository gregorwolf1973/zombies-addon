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

test('zweiter Figurenbogen: alle Gruppen vorhanden, Survivor-Aussehen gültig', async () => {
  const { readFileSync } = await import('node:fs');
  const j = JSON.parse(readFileSync(new URL('../client/grafik/figuren2.json', import.meta.url)));
  assert.equal(j.feld, 224);
  for (const g of ['sv_pistole_idle', 'sv_pistole_move', 'sv_pistole_shoot', 'sv_gewehr_move', 'sv_schrot_shoot', 'sv_messer_meleeattack',
    'sv_fuesse_walk', 'sv_fuesse_idle', 'z6_laufen', 'z6_angriff', 'z7_laufen', 'z7_sterben', 'z7_sterben2', 'buerger1', 'buerger3', 'muendungsblitz']) {
    assert.ok(j.bilder[g]?.length > 0, 'fehlt: ' + g);
  }
  const png = readFileSync(new URL('../client/grafik/figuren2.png', import.meta.url));
  const breite = png.readUInt32BE(16), hoehe = png.readUInt32BE(20);
  const max = Math.max(...Object.values(j.bilder).flat());
  assert.equal(breite, j.feld * j.spalten);
  assert.ok(Math.floor(max / j.spalten) * j.feld < hoehe, 'Bildnummer außerhalb des Bogens');
  const { aussehenLesen } = await import('../client/figurbild.mjs');
  assert.equal(aussehenLesen('s,0,0').g, 's');
});
