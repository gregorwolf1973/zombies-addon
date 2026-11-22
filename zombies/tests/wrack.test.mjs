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
