// Landefeuer: eins je echtem Spieler (1 bis 5), kleinere Suchkreise, Orte stabil beim Nachwachsen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { missionsPlan, LANDEFEUER_RADIUS, SUCH_RADIUS, LANDEFEUER_MAX } from '../server/mission.mjs';
import { Aufgaben } from '../server/aufgaben.mjs';

const karte = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));

test('Landefeuer: höchstens eins (Obergrenze 3 Gegenstände je Level), unabhängig von der Spielerzahl, Position exakt', () => {
  const k = karte('isarauen');
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 5);
    assert.equal(LANDEFEUER_MAX, 1);
    for (const n of [1, 3, 7]) {
      const plan = missionsPlan(5, 1, 'isarauen', w, n);
      assert.equal(plan.filter(m => m.ding === 'm_landefeuer').length, 1);
      assert.ok(plan.length <= 3);
      assert.equal(new Set(plan.map(m => m.id)).size, plan.length);
      for (const m of plan) { assert.equal(m.r, LANDEFEUER_RADIUS); assert.equal(m.kx, m.x); assert.equal(m.ky, m.y); }
    }
    assert.deepEqual(missionsPlan(5, 1, 'isarauen', w, 1).map(m => m.nr), missionsPlan(5, 1, 'isarauen', w, 5).map(m => m.nr), 'Orte nicht stabil');
    assert.equal(LANDEFEUER_RADIUS, 150); assert.equal(SUCH_RADIUS, 150);
  } finally { setzeKartengroesse(64, 48); }
});

test('echteSpieler zählt keine Bots und keine Getrennten', () => {
  const sp = new Map([['a', { verbunden: true }], ['b', { verbunden: true }], ['c', { verbunden: false }], ['d', { verbunden: true }], ['e', { verbunden: true }]]);
  const extra = new Map([['d', { bot: true }], ['e', { bot: true }]]);
  const echte = Aufgaben.prototype.echteSpieler.call({ raum: { state: { spieler: sp }, extra } });
  assert.equal(echte, 2);
  const nur1 = Aufgaben.prototype.echteSpieler.call({ raum: { state: { spieler: new Map([['a', {}], ['b', {}], ['c', {}]]) }, extra: new Map([['b', { bot: true }], ['c', { bot: true }]]) } });
  assert.equal(nur1, 1);
});
