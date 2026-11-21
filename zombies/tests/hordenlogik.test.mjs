import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hordeEinstellung, zaehleHoerbare, hordeSchritt, einzelschreiOk, akzentSchritt } from '../client/hordenlogik.mjs';

const E = hordeEinstellung({});

test('Vorgaben und Klammern', () => {
  assert.deepEqual(E, { ab: 8, aus: 5, nurHorde: 20, voll: 40, hoerweite: 30 });
  const k = hordeEinstellung({ ab: 10, aus: 50, nurHorde: 3, voll: 2, hoerweite: 0 });
  assert.equal(k.aus, 9); assert.equal(k.nurHorde, 10); assert.equal(k.voll, 11); assert.equal(k.hoerweite, 1);
});

test('Zählen: Umkreis in Metern (8 px = 1 m), Ebene, Schwerpunkt', () => {
  const ich = { x: 0, y: 0, ebene: '' };
  const z = [{ x: 100, y: 0 }, { x: 239, y: 0 }, { x: 241, y: 0 }, { x: 0, y: 50, ebene: 'h1' }];
  const r = zaehleHoerbare(z, ich, 30);
  assert.equal(r.n, 2); assert.equal(r.sx, 169.5);
  assert.equal(zaehleHoerbare(z, { x: 0, y: 0, ebene: 'h1' }, 30).n, 3);   // drinnen: Haus-Zombies und die draußen
  assert.equal(zaehleHoerbare([], ich, 30).sx, null);
});

test('Schwellen mit Hysterese, Pegel linear von ~25 % bis 100 %', () => {
  let s = hordeSchritt(null, 7, E); assert.equal(s.aktiv, false); assert.equal(s.pegel, 0);
  s = hordeSchritt(s, 8, E); assert.equal(s.aktiv, true); assert.ok(Math.abs(s.pegel - 0.25) < 1e-9);
  s = hordeSchritt(s, 6, E); assert.equal(s.aktiv, true);          // zwischen „aus“ und „ab“ bleibt es an
  s = hordeSchritt(s, 5, E); assert.equal(s.aktiv, false);         // ≤ aus
  s = hordeSchritt(s, 6, E); assert.equal(s.aktiv, false);         // und bleibt aus, bis wieder „ab“
  assert.equal(hordeSchritt(null, 40, E).pegel, 1);
  assert.equal(hordeSchritt(null, 200, E).pegel, 1);
  const mitte = hordeSchritt(null, 24, E).pegel; assert.ok(mitte > 0.25 && mitte < 1);
});

test('Einzelschreie: halb so oft, ab „nurHorde“ nur < 5 m und alle 4 s', () => {
  const aus = hordeSchritt(null, 3, E), halb = hordeSchritt(null, 10, E), nur = hordeSchritt(null, 25, E);
  assert.equal(einzelschreiOk(aus, { abstandMeter: 50, jetzt: 0, zufall: 0.9 }), true);
  assert.equal(einzelschreiOk(halb, { abstandMeter: 50, jetzt: 0, zufall: 0.3 }), true);
  assert.equal(einzelschreiOk(halb, { abstandMeter: 50, jetzt: 0, zufall: 0.7 }), false);
  assert.equal(nur.nur, true);
  assert.equal(einzelschreiOk(nur, { abstandMeter: 8, jetzt: 10000, letzter: 0 }), false);
  assert.equal(einzelschreiOk(nur, { abstandMeter: 4, jetzt: 10000, letzter: 8000 }), false);
  assert.equal(einzelschreiOk(nur, { abstandMeter: 4, jetzt: 10000, letzter: 5000 }), true);
});

test('Akzent: +10 in 3 s, höchstens alle 30 s', () => {
  let a = akzentSchritt(null, 3, 0, E); assert.equal(a.spiele, false);
  a = akzentSchritt(a, 8, 1000, E); assert.equal(a.spiele, false);
  a = akzentSchritt(a, 14, 2000, E); assert.equal(a.spiele, true);
  a = akzentSchritt(a, 30, 3000, E); assert.equal(a.spiele, false);       // Pause
  a = akzentSchritt(a, 2, 40000, E); a = akzentSchritt(a, 20, 41000, E); assert.equal(a.spiele, true);
  let l = akzentSchritt(null, 10, 0, E); l = akzentSchritt(l, 12, 5000, E); l = akzentSchritt(l, 18, 10000, E);
  assert.equal(l.spiele, false);                                           // langsamer Anstieg (nicht in 3 s)
});
