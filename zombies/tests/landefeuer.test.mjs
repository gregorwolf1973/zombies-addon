// Landefeuer: eins je echtem Spieler (1 bis 5), kleinere Suchkreise, Orte stabil beim Nachwachsen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { missionsPlan, LANDEFEUER_RADIUS, SUCH_RADIUS } from '../server/mission.mjs';
import { Aufgaben } from '../server/aufgaben.mjs';

const karte = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));

test('Landefeuer-Anzahl, Ids, Radien und stabile Orte', () => {
  const k = karte('isarauen');
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 5);
    const lf = n => missionsPlan(5, 1, 'isarauen', w, n).filter(m => m.ding === 'm_landefeuer');
    assert.equal(lf(1).length, 1);
    assert.equal(lf(3).length, 3);
    assert.equal(lf(7).length, 5);
    assert.deepEqual(lf(3).map(m => m.id), ['m_landefeuer', 'm_landefeuer#2', 'm_landefeuer#3']);
    assert.equal(new Set(lf(5).map(m => m.nr)).size, 5, 'Landefeuer im selben Haus');
    // gleiche Orte bei gleicher Zahl, und die ersten bleiben beim Nachwachsen
    assert.deepEqual(lf(3).map(m => m.nr), lf(3).map(m => m.nr));
    assert.deepEqual(lf(2).map(m => m.nr), lf(5).slice(0, 2).map(m => m.nr));
    const ganz = missionsPlan(5, 1, 'isarauen', w, 4);
    assert.equal(ganz.length, 4 + 4, 'übrige Gegenstände + 4 Landefeuer');
    for (const m of ganz) {
      assert.equal(m.r, m.ding === 'm_landefeuer' ? LANDEFEUER_RADIUS : SUCH_RADIUS);
      assert.ok(Math.hypot(m.kx - m.x, m.ky - m.y) < m.r, 'Ziel nicht im Kreis');
    }
    assert.equal(LANDEFEUER_RADIUS, 560); assert.equal(SUCH_RADIUS, 800);
    assert.equal(new Set(ganz.map(m => m.id)).size, ganz.length);
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
