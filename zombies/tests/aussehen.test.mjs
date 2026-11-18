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

// Browser-Klassen, die die Zeichenfunktionen nutzen, für Node nachbilden
globalThis.Path2D ??= class { moveTo() {} lineTo() {} arc() {} rect() {} closePath() {} };
globalThis.OffscreenCanvas ??= class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }; }
};

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
  assert.equal(j.feld, 160);
  for (const g of ['sv_pistole_idle', 'sv_pistole_move', 'sv_pistole_shoot', 'sv_gewehr_move', 'sv_schrot_shoot', 'sv_messer_meleeattack',
    'sv_fuesse_walk', 'sv_fuesse_idle', 'z6_laufen', 'z6_angriff', 'z7_laufen', 'z7_sterben', 'z7_sterben2', 'buerger1', 'buerger3', 'polizist', 'muendungsblitz', 'soldat_idle', 'soldat_schuss', 'arzt', 'verwundet']) {
    assert.ok(j.bilder[g]?.length > 0, 'fehlt: ' + g);
  }
  const webp = readFileSync(new URL('../client/grafik/figuren2.webp', import.meta.url));
  assert.equal(webp.toString('ascii', 12, 16), 'VP8X');   // erweitertes Format mit Alpha
  const breite = webp.readUIntLE(24, 3) + 1, hoehe = webp.readUIntLE(27, 3) + 1;
  const max = Math.max(...Object.values(j.bilder).flat());
  assert.equal(breite, j.feld * j.spalten);
  // viele Handy-GPUs laden Texturen nur bis 4096 px Kantenlänge
  const f1 = readFileSync(new URL('../client/grafik/figuren.png', import.meta.url));
  assert.ok(f1.readUInt32BE(16) <= 4096 && f1.readUInt32BE(20) <= 4096, 'figuren.png zu groß für Handys');
  assert.ok(breite <= 4096 && hoehe <= 4096, 'figuren2 zu groß für Handys');
  assert.ok(Math.floor(max / j.spalten) * j.feld < hoehe, 'Bildnummer außerhalb des Bogens');
  const { aussehenLesen } = await import('../client/figurbild.mjs');
  assert.equal(aussehenLesen('s,0,0').g, 's');
});
