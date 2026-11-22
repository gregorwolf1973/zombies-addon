// Verkehrsmenge richtet sich nach der befahrbaren Netzlänge (Einstellung `verkehr` = Obergrenze, mindestens 3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { verkehrAnzahl, strassenGraph, METER_JE_AUTO } from '../server/verkehr.mjs';

test('Formel: Netzlänge / Meter je Auto, Untergrenze 3, Obergrenze Einstellung', () => {
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 10, 30), 10);
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 10 + 400, 30), 10);
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 10 + 1100, 30), 11);
  assert.equal(verkehrAnzahl(500, 30), 3);
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 100, 30), 30);
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 100, 12), 12);
  assert.equal(verkehrAnzahl(METER_JE_AUTO * 100, 0), 0);
});
test('Geretsried 2: etwa 15 bis 20 Autos, Netzlänge im Graph', () => {
  const k = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
  setzeKartengroesse(k.breite, k.hoehe);
  const g = strassenGraph(baueWeltAusKarte(k, 7));
  assert.ok(g.netzMeter > 20000 && g.netzMeter <= g.gesamtMeter + 1, 'Netz ' + g.netzMeter);
  const n = verkehrAnzahl(g.netzMeter, 30);
  assert.ok(n >= 15 && n <= 20, 'Autos ' + n);
});
