// Nebel als Wetterlage: Würfeln, Dichteverlauf, Zombie-Sichtfaktor, Zeitfenster, Einstellungen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Nebel, NEBEL_VORGABE, NEBEL_DAUER, bereinigeNebel, nebelWuerfeln, nebelDauer, nebelDichte, zombieSichtFaktor, kreuzt } from '../server/nebel.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { nebelRadius, nebelDeckkraft, rauschen, NEBEL_MAX, sichtVerlauf } from '../client/nebel.mjs';

const folge = (...w) => { let i = 0; return () => w[i++ % w.length]; };

test('Würfeln: Wahrscheinlichkeit in Prozent', () => {
  assert.equal(nebelWuerfeln(35, () => 0.34), true);
  assert.equal(nebelWuerfeln(35, () => 0.35), false);
  assert.equal(nebelWuerfeln(0, () => 0), false);
  assert.equal(nebelWuerfeln(100, () => 0.999), true);
});

test('Dauer liegt zwischen 20 und 60 Spielminuten', () => {
  assert.equal(nebelDauer(() => 0), NEBEL_DAUER[0]);
  assert.equal(nebelDauer(() => 0.9999), NEBEL_DAUER[1]);
  for (let i = 0; i < 200; i++) { const d = nebelDauer(); assert.ok(d >= 20 && d <= 60); }
});

test('Dichteverlauf: sanft hinein, voll, sanft hinaus', () => {
  assert.equal(nebelDichte(0, 40), 0);
  assert.equal(nebelDichte(40, 40), 0);
  assert.equal(nebelDichte(20, 40), 1);
  assert.ok(nebelDichte(5, 40) > 0 && nebelDichte(5, 40) < 1);
  assert.ok(nebelDichte(2, 40) < nebelDichte(5, 40));
  assert.ok(Math.abs(nebelDichte(5, 40) - nebelDichte(35, 40)) < 1e-9, 'symmetrisch');
  // kurzer Nebel: Blende höchstens ein Drittel, Spitze trotzdem 1
  assert.equal(nebelDichte(10, 20), 1);
  for (let m = 0; m <= 60; m += 0.5) { const d = nebelDichte(m, 60); assert.ok(d >= 0 && d <= 1); }
});

test('Zombie-Sichtfaktor: 1 ohne Nebel, bei voller Dichte der Einstellwert', () => {
  assert.equal(zombieSichtFaktor(0, 50), 1);
  assert.equal(zombieSichtFaktor(1, 50), 0.5);
  assert.equal(zombieSichtFaktor(0.5, 50), 0.75);
  assert.equal(zombieSichtFaktor(1, 100), 1);
  assert.equal(zombieSichtFaktor(2, 50), 0.5, 'Dichte wird begrenzt');
});

test('Zeitfenster: Marken auch über Mitternacht', () => {
  assert.equal(kreuzt(100, 110, 105), true);
  assert.equal(kreuzt(100, 110, 100), false, 'Start zählt nicht');
  assert.equal(kreuzt(100, 110, 110), true, 'Ende zählt');
  assert.equal(kreuzt(1435, 5, 1439), true);
  assert.equal(kreuzt(1435, 5, 2), true);
  assert.equal(kreuzt(1435, 5, 700), false);
  assert.equal(kreuzt(100, 100, 100), false);
});

// Spieltag simulieren: Takte zu 1,5 Spielminuten; tagAb 420, nachtAb 1290
function tag(nebel, einst, von = 0, bis = 1440, schritt = 1.5) {
  const dichten = [];
  for (let u = von; u <= bis; u += schritt) dichten.push(nebel.schritt(u % 1440, einst, 420, 1290));
  return dichten;
}

test('Nebel: kommt nur morgens/abends, dauert 20–60 min, blendet ein und aus', () => {
  const n = new Nebel(() => 0);   // würfelt immer „ja“, Dauer = 20
  const dichten = tag(n, { ...NEBEL_VORGABE, morgen: 100, abend: 100 });
  const lang = dichten.filter(d => d > 0).length * 1.5;
  assert.ok(lang >= 36 && lang <= 44, `zwei Nebel à 20 min, war ${lang}`);
  assert.ok(dichten.some(d => d === 1));
  assert.ok(dichten.some(d => d > 0 && d < 1));
  // Anfang: Morgenmarke = 420 − 90 = 330 → Index 220 und später
  assert.equal(dichten[100], 0);
});

test('Nebel: Wahrscheinlichkeit 0 oder aus = nie Nebel', () => {
  assert.ok(tag(new Nebel(() => 0), { ...NEBEL_VORGABE, morgen: 0, abend: 0 }).every(d => d === 0));
  assert.ok(tag(new Nebel(() => 0), { ...NEBEL_VORGABE, an: false }).every(d => d === 0));
});

test('Nebel: nur morgens, wenn abends 0 %', () => {
  const d = tag(new Nebel(() => 0), { ...NEBEL_VORGABE, morgen: 100, abend: 0 });
  const abends = d.slice(Math.floor(900 / 1.5)).filter(x => x > 0);
  assert.equal(abends.length, 0);
  assert.ok(d.some(x => x > 0));
});

test('Nebel: Zeitsprung würfelt nicht und zählt nicht', () => {
  const n = new Nebel(() => 0);
  const e = { ...NEBEL_VORGABE, morgen: 100, abend: 100 };
  n.schritt(100, e, 420, 1290);
  assert.equal(n.schritt(800, e, 420, 1290), 0);   // Sprung (Testbefehl Zeit) über die Morgenmarke
  assert.equal(n.aktiv(), false);
});

test('Testbefehl: sofort an hält volle Dichte, aus beendet', () => {
  const n = new Nebel(() => 0.99);
  assert.equal(n.schalte(true), 1);
  for (let u = 0; u < 100; u += 5) assert.equal(n.schritt(u, NEBEL_VORGABE, 420, 1290), 1);
  assert.equal(n.schalte(false), 0);
  assert.equal(n.schritt(500, NEBEL_VORGABE, 420, 1290), 0);
});

test('Einstellungen: Vorgabe, Grenzen, Zusammenführen', () => {
  assert.deepEqual(vorgaben().nebel, { an: true, morgen: 35, abend: 35, sicht: 20, zombie: 50 });
  assert.deepEqual(bereinige({}).nebel, NEBEL_VORGABE);
  const b = bereinige({ nebel: { morgen: 500, abend: -3, sicht: 1, zombie: 'x', an: false } }).nebel;
  assert.deepEqual(b, { an: false, morgen: 100, abend: 0, sicht: 5, zombie: 50 });
  const neu = bereinige({ nebel: { sicht: 30 } }, bereinige({ nebel: { morgen: 60 } }));
  assert.equal(neu.nebel.morgen, 60); assert.equal(neu.nebel.sicht, 30);
  assert.deepEqual(bereinigeNebel(undefined), NEBEL_VORGABE);
});

test('Darstellung: Radius schrumpft mit der Dichte, Deckkraft steigt', () => {
  assert.ok(nebelRadius(1, 20) < nebelRadius(0.5, 20) && nebelRadius(0.5, 20) < nebelRadius(0.1, 20));
  assert.ok(Math.abs(nebelRadius(1, 20) - 20 * 8 * 1.5) < 1e-9);
  assert.equal(nebelDeckkraft(0), 0); assert.equal(nebelDeckkraft(1), 1); assert.ok(NEBEL_MAX < 0.8 && NEBEL_MAX > 0.6); assert.equal(sichtVerlauf(0.2), 0); assert.equal(sichtVerlauf(1), 1);
});

test('Rauschen: deterministisch, nahtlos, nicht flach', () => {
  const a = rauschen(64, 3), b = rauschen(64, 3), c = rauschen(64, 4);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.ok(Math.max(...a) - Math.min(...a) > 60);
  const nahtX = Math.abs(a[63] - a[0]), innen = Math.abs(a[31] - a[30]);
  assert.ok(nahtX < 40 && innen < 40, 'Naht ohne Sprung');
});
