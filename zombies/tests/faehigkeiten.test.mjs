import test from 'node:test';
import assert from 'node:assert/strict';
import { neuerStand, normiere, levelAus, xpFuerAufstieg, gebeXp, investiere, freiePunkte, wirkung, fuerClient, MAX_LEVEL } from '../server/faehigkeiten.mjs';

test('Level-Kurve ist sanft und steigt', () => {
  assert.equal(xpFuerAufstieg(1), 100);
  assert.equal(levelAus(0), 1); assert.equal(levelAus(99), 1); assert.equal(levelAus(100), 2);
  assert.equal(levelAus(100 + xpFuerAufstieg(2)), 3);
  assert.equal(levelAus(1e9), MAX_LEVEL);
});

test('Aufstieg gibt je Level einen Punkt, Investieren wird geprüft', () => {
  const st = neuerStand();
  assert.equal(investiere(st, 'tempo'), false);
  assert.equal(gebeXp(st, 100), 1);
  assert.equal(freiePunkte(st), 1);
  assert.equal(investiere(st, 'gibtsnicht'), false);
  assert.equal(investiere(st, 'tempo'), true);
  assert.equal(freiePunkte(st), 0);
  assert.equal(investiere(st, 'tempo'), false);
  gebeXp(st, 1e6);
  for (let i = 0; i < 10; i++) investiere(st, 'tempo');
  assert.equal(st.s.tempo, 5);
});

test('XP-Faktor und Ungültiges', () => {
  const st = neuerStand();
  assert.equal(gebeXp(st, 10, 0), 0); assert.equal(st.xp, 0);
  gebeXp(st, 10, 2.5); assert.equal(st.xp, 25);
  gebeXp(st, -5); gebeXp(st, NaN); assert.equal(st.xp, 25);
});

test('normiere verwirft zu viele Punkte und Unsinn', () => {
  const st = normiere({ xp: 100, s: { tempo: 5, zielen: 3, leben: 'x' } });
  assert.equal(st.xp, 100);
  assert.equal(Object.values(st.s).reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(normiere(null), neuerStand());
});

test('Wirkungen: Stufe 0 = heute, Stufe 5 = Höchstwert', () => {
  const n = neuerStand();
  assert.equal(wirkung.tempo(n), 1); assert.equal(wirkung.schadenFaktor(n), 1); assert.equal(wirkung.rucksack(n), 0);
  const m = { xp: 0, s: { zielen: 5, tempo: 5, leben: 5, ausdauer: 5, leise: 5, sanitaeter: 5, tragen: 5 } };
  assert.ok(Math.abs(wirkung.tempo(m) - 1.2) < 1e-9);
  assert.ok(Math.abs(wirkung.schussFrei(m) - 0.4) < 1e-9);
  assert.ok(Math.abs(wirkung.verbrauch(m) - 0.5) < 1e-9);
  assert.ok(Math.abs(wirkung.hoerweite(m) - 0.6) < 1e-9);
  assert.ok(Math.abs(wirkung.heilen(m) - 1.75) < 1e-9);
  assert.equal(wirkung.rucksack(m), 2);
  assert.equal(wirkung.rucksack({ s: { tragen: 3 } }), 1);
  assert.equal(wirkung.rucksack({ s: { tragen: 2 } }), 0);
  assert.ok(wirkung.schadenFaktor(m) < 0.7);
});

test('fuerClient', () => {
  const st = neuerStand(); gebeXp(st, 150);
  const c = fuerClient(st);
  assert.equal(c.level, 2); assert.equal(c.im, 50); assert.equal(c.bis, xpFuerAufstieg(2)); assert.equal(c.frei, 1);
});
