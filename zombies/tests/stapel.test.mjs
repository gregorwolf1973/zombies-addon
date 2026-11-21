// Inventar mit Stapeln (client/stapel.mjs) und Munitionskisten (server/munition.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dingId, dingN, stapelbar, zaehle, hat, flach, fuegeHinzu, kannAufnehmen, blockGrund, nimmEins, nimmStapel, entferne, verschiebe, laden, platzFuer } from '../client/stapel.mjs';
import { munitionGeben, kisteOeffnen, munitionPruefen } from '../server/munition.mjs';
import { DINGE, BEUTE, MUNITION_MAX, MUNITIONSKISTE_SCHUSS, MUNITION_KISTE_AB, STAPEL_MAX, bezahlung } from '../client/welt.mjs';

test('Eintragsformat: "id" oder "id*n"', () => {
  assert.equal(dingId('wasser*3'), 'wasser');
  assert.equal(dingN('wasser*3'), 3);
  assert.equal(dingN('wasser'), 1);
  assert.equal(dingN('wasser*0'), 1);
  assert.equal(dingN('wasser*99'), STAPEL_MAX);
});

test('gleiche Dinge stapeln bis 5, dann neuer Platz', () => {
  const l = [];
  assert.equal(fuegeHinzu(l, 8, 'wasser', 7), 7);
  assert.deepEqual(l, ['wasser*5', 'wasser*2']);
  fuegeHinzu(l, 8, 'essen', 1);
  nimmEins(l, 1);   // ein Wasser weniger vom hinteren Stapel
  assert.deepEqual(l, ['wasser*5', 'wasser', 'essen']);
  fuegeHinzu(l, 8, 'wasser', 1);   // geht auf den nicht vollen Stapel
  assert.deepEqual(l, ['wasser*5', 'wasser*2', 'essen']);
  assert.equal(zaehle(l, 'wasser'), 7);
  assert.equal(flach(l).length, 8);
});

test('Plätze sind begrenzt: 8 Plätze × 5 = 40 Stück', () => {
  const l = [];
  assert.equal(fuegeHinzu(l, 8, 'essen', 50), 40);
  assert.equal(l.length, 8);
  assert.equal(kannAufnehmen(l, 8, 'essen'), false);
  assert.equal(blockGrund(l, 8, 'essen'), 'voll');
  assert.equal(blockGrund(l, 8, 'wasser'), 'voll');
  nimmEins(l, 0);
  assert.equal(kannAufnehmen(l, 8, 'essen'), true);
  assert.equal(platzFuer(l, 8, 'essen'), 1);
});

test('Waffen stapeln nicht, Messer und Handgranate schon', () => {
  assert.equal(stapelbar('pistole'), false);
  assert.equal(stapelbar('messer'), true);
  assert.equal(stapelbar('granate'), true);
  const l = [];
  fuegeHinzu(l, 8, 'pistole', 2);
  fuegeHinzu(l, 8, 'messer', 6);
  fuegeHinzu(l, 8, 'granate', 6);
  assert.deepEqual(l, ['pistole', 'pistole', 'messer*5', 'messer', 'granate*5', 'granate']);
});

test('Taschen und Missionsgegenstände stapeln nicht; nur eine Tasche tragbar', () => {
  assert.equal(stapelbar('tasche'), false);
  assert.equal(stapelbar('m_funk'), false);
  const l = [];
  assert.equal(fuegeHinzu(l, 8, 'tasche'), 1);
  assert.equal(fuegeHinzu(l, 8, 'trekking'), 0);
  assert.equal(fuegeHinzu(l, 8, 'tasche'), 0);
  assert.equal(blockGrund(l, 8, 'trekking'), 'tasche');
  assert.equal(kannAufnehmen(l, 8, 'trekking'), false);
  // in der Kiste gilt die Regel nicht
  const k = [];
  assert.equal(fuegeHinzu(k, 24, 'tasche', 2, true), 2);
});

test('Entnehmen: ein Stück, ganzer Stapel, nach Art', () => {
  const l = ['wasser*3', 'essen', 'wasser*2'];
  assert.equal(nimmEins(l, 0), 'wasser');
  assert.deepEqual(l, ['wasser*2', 'essen', 'wasser*2']);
  assert.equal(entferne(l, 'wasser', 3), 3);   // zuerst aus dem hintersten Stapel
  assert.deepEqual(l, ['wasser', 'essen']);
  assert.deepEqual(nimmStapel(['essen*4'], 0), { id: 'essen', n: 4 });
  assert.equal(nimmEins(l, 9), '');
  assert.equal(entferne(l, 'seil', 1), 0);
  assert.equal(hat(l, 'essen'), true);
});

test('Umsortieren: gleiche Art wird zusammengelegt, sonst getauscht', () => {
  const l = ['wasser*3', 'essen', 'wasser*4'];
  assert.equal(verschiebe(l, 0, 2, 8), true);   // 3 + 4 → 5 + 2
  assert.deepEqual(l, ['wasser*2', 'essen', 'wasser*5']);
  assert.equal(verschiebe(l, 0, 1, 8), true);   // andere Art: tauschen
  assert.deepEqual(l, ['essen', 'wasser*2', 'wasser*5']);
  assert.equal(verschiebe(l, 0, 7, 8), true);   // leeres Ziel hinter den Dingen: ans Ende
  assert.deepEqual(l, ['wasser*2', 'wasser*5', 'essen']);
  assert.equal(verschiebe(l, 0, 0, 8), false);
  assert.equal(verschiebe(l, 0, 8, 8), false);
});

test('alte Spielstände (ein Eintrag je Stück) laden und werden gestapelt; neue Stände bleiben gleich', () => {
  const alt = ['wasser', 'wasser', 'essen', 'wasser', 'pistole', 'pistole', 'unbekannt'];
  const l = [];
  laden(l, alt, 8);
  assert.deepEqual(l, ['wasser*3', 'essen', 'pistole', 'pistole']);
  const neu = [];
  laden(neu, l, 8);
  assert.deepEqual(neu, l);
  const kaputt = [];
  laden(kaputt, 'quatsch', 8);
  assert.deepEqual(kaputt, []);
  const k = [];
  laden(k, ['essen*5', 'essen*5', 'essen*5'], 2, true);   // mehr als Plätze: Überschuss fällt weg
  assert.deepEqual(k, ['essen*5', 'essen*5']);
});

test('Handel: bezahlt wird mit Stücken aus Stapeln', () => {
  const zahl = bezahlung(['essen*3', 'wasser'], { anzahl: 2, aus: ['essen', 'wasser'] });
  assert.deepEqual(zahl, ['essen', 'essen']);
  assert.equal(bezahlung(['essen'], { anzahl: 2, aus: ['essen', 'wasser'] }), null);
});

test('Munitionskiste: Ding vorhanden, findbar, stapelbar', () => {
  assert.equal(DINGE.munitionskiste.name, 'Munitionskiste');
  assert.equal(stapelbar('munitionskiste'), true);
  assert.equal(MUNITIONSKISTE_SCHUSS, 30);
  const tabellen = Object.entries(BEUTE).filter(([, t]) => t.includes('munitionskiste')).map(([k]) => k);
  assert.ok(tabellen.length >= 4, 'in mehreren Fundtabellen: ' + tabellen);
});

test('Munition: Überschuss wird zur Munitionskiste, je 30 Schuss', () => {
  const p = { munition: MUNITION_MAX - 5, rucksack: [], plaetze: 8 };
  let e = munitionGeben(p, 12);   // 5 in den Zähler, 7 Überschuss
  assert.equal(p.munition, MUNITION_MAX);
  assert.deepEqual(e, { zaehler: 5, kisten: 0 });
  assert.deepEqual(p.rucksack, []);
  e = munitionGeben(p, 12); e = munitionGeben(p, 12);   // 7+12+12 = 31 → eine Kiste, 1 Rest
  assert.equal(e.kisten, 1);
  assert.deepEqual(p.rucksack, ['munitionskiste']);
  for (let i = 0; i < 30; i++) munitionGeben(p, 12);   // 1+360 = 361 → 12 Kisten (Rest 1)
  assert.equal(zaehle(p.rucksack, 'munitionskiste'), 13);
  assert.equal(p.munition, MUNITION_MAX);
});

test('Munition: ohne Platz im Rucksack gehen keine Kisten verloren (nur Überschuss bleibt gemerkt)', () => {
  const p = { munition: MUNITION_MAX, rucksack: [], plaetze: 1 };
  p.rucksack.push('pistole');
  assert.equal(munitionGeben(p, 60).kisten, 0);
  assert.deepEqual(p.rucksack, ['pistole']);
  p.rucksack.length = 0;
  assert.equal(munitionGeben(p, 1).kisten, 2);   // der gemerkte Überschuss (60) wird jetzt eingepackt
});

test('Munition: Kiste öffnen (von Hand und automatisch bei <= 120)', () => {
  const p = { munition: 140, rucksack: ['munitionskiste*3'], plaetze: 8 };
  const meldungen = [];
  assert.equal(munitionPruefen(p, t => meldungen.push(t)), false, 'über 120: nichts');
  p.munition = MUNITION_KISTE_AB;
  assert.equal(munitionPruefen(p, t => meldungen.push(t)), true);
  assert.equal(p.munition, MUNITION_MAX);
  assert.deepEqual(p.rucksack, ['munitionskiste*2']);
  assert.equal(meldungen.length, 1);
  p.munition = 0;   // leerer Vorrat: eine Kiste je Prüfung, max. 150
  munitionPruefen(p);
  assert.equal(p.munition, 30);
  assert.deepEqual(p.rucksack, ['munitionskiste']);
  p.munition = MUNITION_MAX;   // von Hand bei vollem Zähler: nichts verbraucht
  assert.equal(kisteOeffnen(p), false);
  assert.deepEqual(p.rucksack, ['munitionskiste']);
  p.munition = 100;
  assert.equal(kisteOeffnen(p), true);
  assert.equal(p.munition, 130);
  assert.deepEqual(p.rucksack, []);
  assert.equal(munitionPruefen(p), false, 'keine Kiste mehr');
});
