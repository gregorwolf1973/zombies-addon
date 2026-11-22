// Rauchpool der Leopard-Kanone: Obergrenze, Reichweite des Kegels, Auflösung, Verdichtung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RauchPool, RAUCH_MAX } from '../client/kanonenrauch.mjs';

test('Rauchkegel reicht 15-25 m nach vorn und löst sich in höchstens 5 s auf', () => {
  const p = new RauchPool(RAUCH_MAX, () => 0.5);
  p.schuss(0, 0, 0, -400, 0);
  let weit = 0;
  for (let t = 0; t < 5.01; t += 0.05) {
    p.schritt(0.05, 0, 0);
    for (const q of p.p) if (q.an && q.art === 0) weit = Math.max(weit, q.x);
  }
  assert.ok(weit / 8 >= 12 && weit / 8 <= 27, 'Reichweite m: ' + weit / 8);
  assert.equal(p.aktiv(), 0);
});

test('Pool hat eine feste Obergrenze, auch bei Dauerfeuer', () => {
  const p = new RauchPool(RAUCH_MAX);
  for (let i = 0; i < 30; i++) { p.schuss(0, 0, 0, -400, 0); p.schritt(0.1); assert.ok(p.aktiv() <= RAUCH_MAX); }
  assert.equal(p.p.length, RAUCH_MAX);
});

test('Mehrere Schüsse verdichten den Rauch', () => {
  const a = new RauchPool(RAUCH_MAX, () => 0.5), b = new RauchPool(RAUCH_MAX, () => 0.5);
  a.schuss(0, 0, 0, -400, 0);
  b.schuss(0, 0, 0, -400, 0); b.schritt(0.3); b.schuss(0, 0, 0, -400, 0);
  const max = q => Math.max(...q.p.filter(x => x.an && x.art === 0).map(x => x.a0));
  assert.ok(max(b) > max(a));
});
