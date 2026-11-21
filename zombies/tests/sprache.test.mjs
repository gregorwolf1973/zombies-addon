import test from 'node:test';
import assert from 'node:assert/strict';
import { lautstaerke, kurve, SPRACHE_VORGABE } from '../client/sprache_regeln.mjs';

const E = { ...SPRACHE_VORGABE };
const M = 8;   // Pixel je Meter
const welt = { haeuser: { 3: { tuer: { x: 10, y: 10 }, raus: { dx: 0, dy: 1 } }, 4: { tuer: { x: 30, y: 10 }, raus: { dx: 0, dy: 1 } } } };
const sp = (xm, ym, ebene = '', rucksack = []) => ({ x: xm * M, y: ym * M, ebene, rucksack });
const nah = (a, b, e = E) => lautstaerke(a, b, welt, e).nah;
const nahe = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('Kurve: voll bis Hörweite, danach Kosinus-Abfall auf 0 bei +50 %', () => {
  assert.equal(kurve(0, 50), 1);
  assert.equal(kurve(50, 50), 1);
  nahe(kurve(62.5, 50), 0.5);
  assert.equal(kurve(75, 50), 0);
  assert.equal(kurve(200, 50), 0);
  let letzte = 1;
  for (let m = 50; m <= 75; m += 0.5) { const k = kurve(m, 50); assert.ok(k <= letzte + 1e-12 && k >= 0); letzte = k; }
});

test('beide draußen: voll bis Hörweite, 0 ab +50 %', () => {
  assert.equal(nah(sp(0, 0), sp(3, 0)), 1);
  assert.equal(nah(sp(0, 0), sp(40, 0)), 1);
  nahe(nah(sp(0, 0), sp(0, 50)), 0.5);   // auch senkrecht, Entfernung zählt
  assert.equal(nah(sp(0, 0), sp(60, 0)), 0);
  assert.equal(nah(sp(0, 0), sp(100, 0)), 0);
  assert.equal(nah(sp(0, 0), sp(20, 0), { ...E, hoerweite: 10 }), 0);   // kleinere Hörweite
});

test('beide draußen: Pan nach links/rechts, begrenzt auf ±0,8', () => {
  const pan = (a, b) => lautstaerke(a, b, welt, E).pan;
  assert.equal(pan(sp(0, 0), sp(0, 10)), 0);
  assert.ok(pan(sp(0, 0), sp(5, 0)) > 0);
  assert.ok(pan(sp(0, 0), sp(-5, 0)) < 0);
  nahe(pan(sp(0, 0), sp(7.5, 0)), 0.5);
  nahe(pan(sp(0, 0), sp(30, 0)), 0.8);
  nahe(pan(sp(0, 0), sp(-30, 0)), -0.8);
});

test('gleiches Haus, gleiches Stockwerk: mindestens 0,6, Pan 0', () => {
  const r = lautstaerke(sp(0, 0, 'h3eg'), sp(70, 0, 'h3eg'), welt, E);
  assert.equal(r.nah, 0.6);
  assert.equal(r.pan, 0);
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(2, 0, 'h3eg')), 1);
  nahe(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h3eg'), { ...E, hoerweite: 40 }), 1);
  // auf Entfernung leicht leiser, aber nie unter 0,6
  assert.ok(nah(sp(0, 0, 'h3eg'), sp(60, 0, 'h3eg')) >= 0.6);
});

test('gleiches Haus, anderes Stockwerk: Wert aus der Einstellung', () => {
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h3keller')), 0.35);
  assert.equal(nah(sp(0, 0, 'h3dach'), sp(1, 1, 'h3eg')), 0.35);
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h3keller'), { ...E, stockwerk: 0.8 }), 0.8);
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h3keller'), { ...E, stockwerk: 0 }), 0);
});

test('einer drinnen, einer draußen: gedämpft nach Abstand zur Haustür-Vorkachel', () => {
  // Vorkachel von Haus 3: Kachel (10, 11) → Mitte (10,5; 11,5) Kacheln = 42 m / 46 m
  const vx = 10.5 * 4, vy = 11.5 * 4;
  nahe(nah(sp(vx, vy + 2), sp(0, 0, 'h3eg')), 0.10);               // direkt vor der Tür
  nahe(nah(sp(0, 0, 'h3eg'), sp(vx, vy + 2)), 0.10);               // symmetrisch
  nahe(nah(sp(vx + 50, vy), sp(0, 0, 'h3keller')), 0.05);        // Mitte des Abfalls (40 m + 10 m)
  assert.equal(nah(sp(vx + 60, vy), sp(0, 0, 'h3eg')), 0);
  nahe(nah(sp(vx, vy), sp(0, 0, 'h3eg'), { ...E, drinnenDraussen: 0.5 }), 0.5);
  assert.equal(nah(sp(vx, vy), sp(0, 0, 'h3eg'), { ...E, drinnenDraussen: 0 }), 0);
  assert.equal(lautstaerke(sp(vx, vy), sp(0, 0, 'h3eg'), welt, E).pan, 0);
  assert.equal(nah(sp(vx, vy), sp(0, 0, 'h99eg')), 0);   // Haus unbekannt
});

test('verschiedene Häuser: 0', () => {
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h4eg')), 0);
  assert.equal(nah(sp(0, 0, 'h3eg'), sp(0, 0, 'h4keller')), 0);
});

test('Funk: nur mit zwei Funkgeräten, überall, unabhängig von Haus und Entfernung', () => {
  const f = ['funkgeraet'];
  const r = lautstaerke(sp(0, 0, '', f), sp(500, 0, '', f), welt, E);
  assert.equal(r.nah, 0);
  assert.equal(r.funk, 0.7);
  assert.equal(lautstaerke(sp(0, 0, 'h3eg', f), sp(0, 0, 'h4keller', [...f, 'wasser']), welt, E).funk, 0.7);
  assert.equal(lautstaerke(sp(0, 0, '', f), sp(5, 0, '', ['wasser']), welt, E).funk, 0);
  assert.equal(lautstaerke(sp(0, 0, '', []), sp(5, 0, '', f), welt, E).funk, 0);
  assert.equal(lautstaerke(sp(0, 0, '', f), sp(5, 0, '', f), welt, { ...E, funk: 0.3 }).funk, 0.3);
  assert.equal(lautstaerke(sp(0, 0, '', f), sp(5, 0, '', f), welt, { ...E, funk: 0 }).funk, 0);
  assert.equal(lautstaerke(sp(0, 0, '', f), sp(5, 0, '', f), welt, E).nah, 1);   // nah und Funk laufen nebeneinander
});

test('ungültige Eingaben: Stille', () => {
  assert.deepEqual(lautstaerke(null, sp(0, 0), welt, E), { nah: 0, funk: 0, pan: 0 });
  assert.equal(nah(sp(0, 0), { x: 1, y: 1 }), 1);   // ohne ebene/rucksack = draußen, ohne Funk
});
