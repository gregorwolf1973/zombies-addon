import { test } from 'node:test';
import assert from 'node:assert/strict';
import { musikWahl, musikSchritt, naechstesStueck, levelKategorie } from '../client/musiklogik.mjs';

const alle = () => true;
test('Priorität Finale > Horde > Lager > Safe > Level', () => {
  const L = { level: 3, lager: true, safe: true, horde: true, finale: true };
  assert.equal(musikWahl(L, alle), 'musikFinale');
  assert.equal(musikWahl({ ...L, finale: false }, alle), 'musikHorde');
  assert.equal(musikWahl({ ...L, finale: false, horde: false }, alle), 'musikLager');
  assert.equal(musikWahl({ level: 3, safe: true }, alle), 'musikSafe');
  assert.equal(musikWahl({ level: 3 }, alle), 'musikLevel3');
  assert.equal(levelKategorie(9), 'musikLevel5'); assert.equal(levelKategorie(undefined), 'musikLevel1');
});

test('Rückfall auf die nächstniedrigere Kategorie, am Ende Stille', () => {
  const hat = k => k === 'musikLevel2' || k === 'musikSafe';
  assert.equal(musikWahl({ level: 2, horde: true, lager: true, safe: true }, hat), 'musikSafe');
  assert.equal(musikWahl({ level: 2, horde: true }, hat), 'musikLevel2');
  assert.equal(musikWahl({ level: 4, horde: true }, hat), null);
});

test('Entprellung: Start sofort, Wechsel erst nach 4 s, Horde bleibt 10 s', () => {
  let st = musikSchritt(null, { level: 1 }, alle, 0);
  assert.equal(st.aktuell, 'musikLevel1');
  st = musikSchritt(st, { level: 1, safe: true }, alle, 1000);
  st = musikSchritt(st, { level: 1, safe: true }, alle, 4000); assert.equal(st.aktuell, 'musikLevel1');
  st = musikSchritt(st, { level: 1, safe: true }, alle, 5000); assert.equal(st.aktuell, 'musikSafe');
  // kurzer Ausschlag verfällt
  st = musikSchritt(st, { level: 1 }, alle, 6000);
  st = musikSchritt(st, { level: 1, safe: true }, alle, 7000); assert.equal(st.aktuell, 'musikSafe');
  // Horde: nach 4 s an, nach Ende noch 10 s
  const H = { level: 1, safe: true, horde: true };
  st = musikSchritt(st, H, alle, 10000); st = musikSchritt(st, H, alle, 14000); assert.equal(st.aktuell, 'musikHorde');
  st = musikSchritt(st, { level: 1, safe: true }, alle, 15000);
  st = musikSchritt(st, { level: 1, safe: true }, alle, 23000); assert.equal(st.aktuell, 'musikHorde');   // < 10 s nach Ende
  st = musikSchritt(st, { level: 1, safe: true }, alle, 24100); st = musikSchritt(st, { level: 1, safe: true }, alle, 28200);
  assert.equal(st.aktuell, 'musikSafe');
});

test('nächstes Stück: abwechselnd, nie dasselbe zweimal', () => {
  assert.equal(naechstesStueck([], null), null);
  assert.equal(naechstesStueck(['a'], 'a'), 'a');
  for (const z of [0, 0.5, 0.99]) assert.notEqual(naechstesStueck(['a', 'b', 'c'], 'b', z), 'b');
});
