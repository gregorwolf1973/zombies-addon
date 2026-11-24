// Licht gefahrener Autos (client/pkwlicht.mjs) und Puma-Einschlag (client/einschlag.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pkwLichtAn, pkwRueckwaerts, pkwLichtPunkte, dunkelVon } from '../client/pkwlicht.mjs';
import { einschlagWerte } from '../client/einschlag.mjs';

test('Licht nur nachts, mit Fahrer und nicht am Wrack', () => {
  const auto = { art: 'pkw', leben: 80 };
  assert.equal(pkwLichtAn(auto, true, dunkelVon(0)), true);        // Mitternacht
  assert.equal(pkwLichtAn(auto, true, dunkelVon(12 * 60)), false); // Mittag
  assert.equal(pkwLichtAn(auto, false, dunkelVon(0)), false);      // kein Fahrer
  assert.equal(pkwLichtAn({ art: 'wrack', leben: 0 }, true, 1), false);
  assert.equal(pkwLichtAn({ art: 'pkw', leben: 0 }, true, 1), false);
  assert.equal(pkwLichtAn({ art: 'auto' }, true, 1), false);       // Verkehrsauto
});

test('Rückwärts nur gegen die Blickrichtung', () => {
  assert.equal(pkwRueckwaerts(-5, 0, 0, 50), true);
  assert.equal(pkwRueckwaerts(5, 0, 0, 50), false);
  assert.equal(pkwRueckwaerts(0, 5, Math.PI / 2, 50), false);
  assert.equal(pkwRueckwaerts(-5, 0, 0, 0.5), false);
});

test('Lichtpunkte: Scheinwerfer vorn, Rücklichter hinten', () => {
  const p = pkwLichtPunkte(100, 50, 0, 36, 16);
  assert.ok(p.vorn.every(q => q.x === 118) && p.hinten.every(q => q.x === 82));
  assert.ok(p.vorn[0].y !== p.vorn[1].y);
});

test('Puma-Einschlag: klein, kurz, ohne Brandfleck; Granate unverändert groß', () => {
  const w = einschlagWerte(24, 0.45);
  assert.equal(w.fein, true);
  assert.equal(w.brand, null);
  assert.ok(w.staub.dauer[1] <= 700 && w.staub.alpha <= 0.3);
  assert.ok(w.staub.r[1] * w.staub.wachs <= 4 && w.staub.weite[1] <= 12);
  assert.ok(w.funkenWeite[1] <= 20);
  assert.equal(einschlagWerte(40, 1).fein, false);
  assert.equal(einschlagWerte(24, 0.5).fein, false);
});
