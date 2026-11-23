import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrackMuster } from '../client/wrack.mjs';

test('Wrack-Muster: pro Fahrzeug-Id stabil, zwischen Fahrzeugen verschieden, im Fahrzeugrahmen', () => {
  const a = wrackMuster('v12'), b = wrackMuster('v12'), c = wrackMuster('v13');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.glut, c.glut);
  assert.ok(a.glut.length >= 3 && a.glut.length <= 5);
  for (const g of a.glut) assert.ok(Math.abs(g.x) <= 31 && Math.abs(g.y) <= 13);
});

test('wrackAnimieren: läuft mit einem Wrack ohne Fehler (0.84.0 stürzte ab: fzPx("auto") = null)', async () => {
  const { wrackAnimieren } = await import('../client/wrack.mjs');
  const g = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : () => g) });   // jede Grafik-Methode liefert sich selbst (Verkettung)
  const add = new Proxy({}, { get: () => () => g });
  const scene = { add, time: { now: 1000 }, tweens: { add: () => {} } };
  const o = { x: 100, y: 100, r: 0, licht: g };   // wie busObj in spiel.mjs (hat immer ein Licht-Graphics)
  assert.doesNotThrow(() => wrackAnimieren(scene, o, 'w1', { art: 'wrack' }, 0.016, { x: 110, y: 100 }, ''));
});
