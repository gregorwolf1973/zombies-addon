import test from 'node:test';
import assert from 'node:assert/strict';
import { KACHEL, T } from '../client/welt.mjs';
import { waehleZiel, schussGuete, ersterBaum } from '../server/baumschuss.mjs';
import { aussehenMigriert, aussehenLesen } from '../client/figurbild.mjs';

const welt = (baeume = [], sonst = {}) => {
  const b = new Set(baeume.map(([x, y]) => x + ',' + y));
  return { hole: (x, y) => sonst[x + ',' + y] ?? (b.has(x + ',' + y) ? T.BAUM : T.WIESE) };
};
const m = k => (k + 0.5) * KACHEL;
const zom = kx => ({ x: m(kx), y: m(1) });

for (const n of [1, 2, 3]) {
  test(`Ziel hinter ${n} Baumkachel(n) wird anvisiert, Güte sinkt`, () => {
    const w = welt(Array.from({ length: n }, (_, i) => [3 + i, 1]));
    const z = zom(4 + n);
    const ziel = waehleZiel(w, [['z1', z]], m(0), m(1), 400);
    assert.ok(ziel, 'Ziel gefunden');
    assert.ok(Math.abs(ziel[2] - Math.pow(0.8, n)) < 1e-9);
    assert.ok(ersterBaum(w, m(0), m(1), z.x, z.y), 'Fehlschuss endet am Baum');
  });
}

test('freie Sicht bevorzugt: besseres Ziel gewinnt trotz größerer Distanz', () => {
  const w = welt([[3, 1], [4, 1], [5, 1]]);
  const imWald = zom(7), frei = { x: m(0), y: m(8) };   // Zeile 8 ohne Bäume, etwas weiter weg
  assert.equal(waehleZiel(w, [['wald', imWald], ['frei', frei]], m(0), m(1), 400)[0], 'frei');
});

test('Wand und Innentür blockieren weiterhin vollständig', () => {
  assert.equal(waehleZiel(welt([], { '3,1': T.WAND }), [['z', zom(6)]], m(0), m(1), 400), null);
  assert.equal(waehleZiel(welt([], { '3,1': T.INNENTUER }), [['z', zom(6)]], m(0), m(1), 400), null);
  assert.equal(waehleZiel(welt([[3, 1]], { '4,1': T.WAND }), [['z', zom(6)]], m(0), m(1), 400), null);
});

test('Nahangreifer und Ziele unter 3 m: immer Güte 1', () => {
  const w = welt([[2, 1], [3, 1]]);
  assert.equal(schussGuete(w, m(0), m(1), zom(5), true), 1);
  assert.ok(schussGuete(w, m(0), m(1), zom(5), false) < 1);
  assert.equal(schussGuete(w, m(0), m(1), { x: m(0) + 20, y: m(1) }, false), 1);
  assert.equal(waehleZiel(w, [['a', zom(5), true]], m(0), m(1), 400)[2], 1);
  assert.equal(schussGuete(welt([], { '1,1': T.WAND }), m(0), m(1), zom(4), true), 0, 'Wand zählt auch für Angreifer');
});

test('außerhalb der Reichweite kein Ziel', () => {
  assert.equal(waehleZiel(welt(), [['z', zom(10)]], m(0), m(1), 100), null);
});

test('Aussehen-Migration: m→h, w→f, Rest unverändert', () => {
  assert.equal(aussehenMigriert('m,2,3'), 'h,2,3');
  assert.equal(aussehenMigriert('w,0,7'), 'f,0,7');
  assert.equal(aussehenMigriert('s,1,1'), 's,1,1');
  assert.equal(aussehenMigriert('h,1,1'), 'h,1,1');
  assert.equal(aussehenMigriert(null), null);
  assert.equal(aussehenLesen(null).g, 'h', 'Vorgabe Held');
  assert.equal(aussehenLesen(aussehenMigriert('w,2,5')).g, 'f');
});
