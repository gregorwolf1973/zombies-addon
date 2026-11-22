// Fensterpositionen der Feinräume: etwa alle 6 m ein 1,25-m-Fenster, Abstand zu Ecken/Türen, kurze Wände ohne Fenster
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../client/welt.mjs';
import { fensterPositionen } from '../client/innen_fein_bild.mjs';

// Rechteckhaus b × h Zellen (Wand ringsum, innen Boden, außen leer) bei Versatz 6; optional Türlücke in der oberen Wand
function haus(b, h, tuerX) {
  const B = b + 12, H = h + 12, o = 6;
  return {
    breite: B, hoehe: H,
    hole(x, y) {
      if (x < 0 || y < 0 || x >= B || y >= H) return T.LEER;
      const ix = x - o, iy = y - o;
      if (ix < 0 || iy < 0 || ix >= b || iy >= h) return T.LEER;
      if (ix === 0 || iy === 0 || ix === b - 1 || iy === h - 1) return (iy === 0 && tuerX != null && ix >= tuerX && ix < tuerX + 4) ? T.BODEN : T.WAND;
      return T.BODEN;
    },
  };
}
test('14 m x 10 m Haus: Fenster 1,25 m breit, 6 m Abstand, 1 m von den Ecken', () => {
  const f = fensterPositionen(haus(56, 40));
  const oben = f.filter(a => a.richtung === 'n').sort((a, b) => a.x - b.x);
  assert.ok(oben.length >= 1);
  if (oben.length > 1) assert.equal(oben[1].x - oben[0].x, 24);
  for (const a of f) assert.equal(a.n, 5);
  for (const a of oben) assert.ok(a.x - 6 >= 5 && 6 + 56 - (a.x + a.n) >= 5);
  assert.ok(f.length >= 4 && f.length <= 12, 'Anzahl ' + f.length);
});
test('kurze Wand (2 m) ohne Fenster, Fenster nicht neben Türen', () => {
  assert.equal(fensterPositionen(haus(8, 8)).length, 0);
  for (const a of fensterPositionen(haus(56, 40, 26)).filter(a => a.richtung === 'n')) {
    const tuerA = 6 + 26, tuerE = tuerA + 4;
    assert.ok(a.x + a.n <= tuerA - 4 || a.x >= tuerE + 4, 'Abstand zur Tür');
  }
});
test('deterministisch', () => {
  const w = haus(80, 56);
  assert.deepEqual(fensterPositionen(w), fensterPositionen(w));
});
