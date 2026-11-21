// Paket A „Bedienung und Anzeige“: Geräte-Einstellungen, Feuerknopf, Wegwerfen eines Stücks, Pulsring der Eckkarte
import test from 'node:test';
import assert from 'node:assert/strict';
import { stimmenFaktorLesen, anAusLesen, schiessModusLesen, feuerErlaubt } from '../client/einstellungen_regeln.mjs';
import { pulsPhase, PULS_DAUER_MS } from '../client/uebersicht.mjs';
import { nimmEins, dingN, dingId } from '../client/stapel.mjs';

test('Stimmen-Faktor: 0–200 %, Standard 100 %', () => {
  assert.equal(stimmenFaktorLesen(null), 1);
  assert.equal(stimmenFaktorLesen(''), 1);
  assert.equal(stimmenFaktorLesen('abc'), 1);
  assert.equal(stimmenFaktorLesen('0'), 0);
  assert.equal(stimmenFaktorLesen('150'), 1.5);
  assert.equal(stimmenFaktorLesen('999'), 2);
  assert.equal(stimmenFaktorLesen('-5'), 0);
  assert.equal(stimmenFaktorLesen(100), 1);
});
test('An/Aus: nur ausdrückliches „aus“ schaltet ab', () => {
  assert.equal(anAusLesen(null), true);
  assert.equal(anAusLesen('an'), true);
  assert.equal(anAusLesen('aus'), false);
});
test('Schießen: Standard automatisch, Feuer nur mit Knopf', () => {
  assert.equal(schiessModusLesen(null), 'auto');
  assert.equal(schiessModusLesen('knopf'), 'knopf');
  assert.equal(schiessModusLesen('quatsch'), 'auto');
  assert.equal(feuerErlaubt('auto', false), true);
  assert.equal(feuerErlaubt('knopf', false), false);
  assert.equal(feuerErlaubt('knopf', true), true);
});
test('Wegwerfen aus einem Stapel nimmt genau ein Stück (auch Munitionskisten)', () => {
  const l = ['munitionskiste*3', 'wasser*2', 'essen'];
  assert.equal(nimmEins(l, 0), 'munitionskiste');
  assert.equal(dingN(l[0]), 2);
  assert.equal(nimmEins(l, 1), 'wasser');
  assert.equal(l[1], 'wasser');
  assert.equal(nimmEins(l, 1), 'wasser');
  assert.deepEqual(l, ['munitionskiste*2', 'essen']);
  assert.equal(dingId(l[0]), 'munitionskiste');
});
test('Pulsring: 5 s lang Phase 0..1, danach aus', () => {
  const t0 = 1000, bis = t0 + PULS_DAUER_MS;
  for (let t = t0; t < bis; t += 137) { const p = pulsPhase(t, bis); assert.ok(p >= 0 && p <= 1, String(p)); }
  assert.equal(pulsPhase(bis, bis), -1);
  assert.equal(pulsPhase(bis + 10, bis), -1);
  assert.equal(pulsPhase(1, undefined), -1);
});
