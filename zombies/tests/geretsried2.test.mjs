// Level 1, zweite Karte „Geretsried 2“: Aufbau, Missionen, Evakuierung (Bus), Zufallswahl Geretsried/Geretsried 2, Anzeigenamen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KACHEL, setzeKartengroesse, frei, findeWeg, weltFingerabdruck } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { evakArtFuer } from '../client/evak.mjs';
import { LEVEL_KARTEN, LEVEL1_KARTEN, KARTEN_NAMEN, Aufgaben, level1Karte, levelSchluessel } from '../server/aufgaben.mjs';
import { KARTEN, bereinige, vorgaben } from '../server/einstellungen.mjs';
import { ladeKarte, starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { missionsPlan, missionListe } from '../server/mission.mjs';
import { befehl } from '../server/superuser.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));

test('Geretsried 2: Karte registriert, Name, Bus-Evakuierung, Level-1-Schlüssel', () => {
  assert.ok(karte.quelle.includes('OpenStreetMap'));
  assert.ok(KARTEN.includes('geretsried2') && KARTEN.includes('level1'));
  assert.equal(ladeKarte('geretsried2').name, 'geretsried2');
  assert.equal(KARTEN_NAMEN.geretsried, 'Geretsried (Level 1)');
  assert.equal(KARTEN_NAMEN.geretsried2, 'Geretsried 2 (Level 1)');
  assert.equal(KARTEN_NAMEN.isarauen, 'die Isarauen');   // andere Karten unverändert
  assert.equal(evakArtFuer('geretsried2'), 'bus');
  assert.equal(levelSchluessel('geretsried2'), 'geretsried');
  assert.deepEqual(LEVEL_KARTEN, ['geretsried', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  // Standard im Backend = Zufall; „level1“ und die beiden Karten sind gültige Auswahlwerte
  assert.equal(vorgaben().karte, 'level1');
  for (const k of ['level1', 'geretsried', 'geretsried2']) assert.equal(bereinige({ karte: k }).karte, k);
  // nach Level 1 folgt Level 2, auch von Geretsried 2 aus
  assert.equal(Aufgaben.prototype.naechsteKarte.call({ raum: { state: { karte: 'geretsried2' } } }), 'isarauen');
});

test('Zufallswahl Level 1: 50/50 zwischen Geretsried und Geretsried 2', () => {
  assert.deepEqual(LEVEL1_KARTEN, ['geretsried', 'geretsried2']);
  assert.equal(level1Karte(() => 0.1), 'geretsried');
  assert.equal(level1Karte(() => 0.9), 'geretsried2');
  const n = { geretsried: 0, geretsried2: 0 };
  for (let i = 0; i < 2000; i++) n[level1Karte()]++;
  assert.ok(n.geretsried > 800 && n.geretsried2 > 800, JSON.stringify(n));
});

// Aufgaben.levelWechsel mit Attrappe: welche Karte wird eingestellt?
function wechsel(ziel, level1Wahl, zustandKarte = 'andermatt') {
  const eingestellt = [];
  const SR = function () {}; SR.level1Wahl = level1Wahl; SR.kartenWechsel = k => eingestellt.push(k);
  const raum = { constructor: SR, state: { karte: zustandKarte, level: 5, besiegt: 0, spieler: new Map() }, chatVerlauf: [], weltNeuStarten: () => {} };
  const ag = Object.assign(Object.create(Aufgaben.prototype), { raum, eingestiegen: new Set(), folgenId: null });
  ag.levelWechsel(ziel);
  return eingestellt[0];
}

test('Levelwechsel auf Level 1: Zufall, außer das Backend legt eine Karte fest; Superuser „Level 1“ immer Zufall', () => {
  const gesehen = new Set();
  for (let i = 0; i < 60; i++) gesehen.add(wechsel({ karte: 'geretsried', level: 1, frisch: true }, ''));
  assert.deepEqual([...gesehen].sort(), ['geretsried', 'geretsried2']);
  for (let i = 0; i < 20; i++) assert.equal(wechsel({ karte: 'geretsried', level: 1, frisch: true }, 'geretsried2'), 'geretsried2');
  for (let i = 0; i < 20; i++) assert.equal(wechsel({ karte: 'geretsried', level: 1, frisch: true }, 'geretsried'), 'geretsried');
  assert.equal(wechsel({ karte: 'isarauen', level: 2 }, ''), 'isarauen');   // andere Level unverändert
  assert.equal(wechsel({ karte: 'geretsried2', level: 1, fest: true }, 'geretsried'), 'geretsried2');   // schon gewürfelt (Superuser)
  assert.equal(wechsel(null, '', 'koenigsdorf'), 'kochel');
});

test('Superuser „Level 1“ würfelt zwischen Geretsried und Geretsried 2, Level 2 bleibt Isarauen', () => {
  const ziele = [];
  const gesendet = [];
  const a = { wechselLaeuft: false, levelWechsel: z => ziele.push(z) };
  const raum = { aufgaben: a, extra: new Map([['s', { superuser: true }]]), state: { spieler: new Map([['s', { name: 'Su' }]]) },
    broadcast: (t, m) => gesendet.push(m.text), clock: { setTimeout: f => f() } };
  const client = { sessionId: 's' };
  const gesehen = new Set();
  for (let i = 0; i < 60; i++) {
    a.wechselLaeuft = false;
    const antwort = befehl(raum, client, { befehl: 'level', level: 1 });
    assert.match(String(antwort), /Level 1 \(Geretsried( 2)? \(Level 1\)\)/);
  }
  for (const z of ziele) { assert.equal(z.level, 1); gesehen.add(z.karte); }
  assert.deepEqual([...gesehen].sort(), ['geretsried', 'geretsried2']);
  assert.ok(gesendet.every(t => /Geretsried( 2)? \(Level 1\)/.test(t)));
  ziele.length = 0; a.wechselLaeuft = false;
  befehl(raum, client, { befehl: 'level', level: 2 });
  assert.equal(ziele[0].karte, 'isarauen');
});

test('Geretsried 2: Welt baut deterministisch, Start frei, Safe Rooms und Haustüren vom Start erreichbar', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const w = baueWeltAusKarte(karte, 7);
    assert.ok(w.safeRooms.length >= 3, 'Safe Rooms: ' + w.safeRooms.map(s => s.name));
    assert.ok(w.haeuser.filter(h => h.betretbar).length > 200);
    assert.ok(frei(w, w.start.x, w.start.y, 11), 'Start blockiert');
    assert.ok(w.tor, 'kein Ortsausgang (Evakuierungsziel des Busses)');
    assert.ok(w.behaelter.filter(b => b.art === 'auto').length >= 20, 'zu wenige Autos');
    for (const s of w.safeRooms) assert.ok(findeWeg(w, w.start.x, w.start.y, (s.haus.tuer.x + 0.5) * KACHEL, (s.haus.tuer.y + 0.5) * KACHEL, 11, 90000), `${s.name} nicht erreichbar`);
    const tueren = w.haeuser.filter(h => h.betretbar).slice(0, 40);
    const erreicht = tueren.filter(h => findeWeg(w, w.start.x, w.start.y, (h.tuer.x + 0.5) * KACHEL, (h.tuer.y + 0.5) * KACHEL, 11, 90000)).length;
    assert.ok(erreicht >= 30, `nur ${erreicht}/40 Haustüren erreichbar`);
    // Missionen: alle fünf Gegenstände, weit auseinander, deterministisch
    assert.deepEqual(missionListe('geretsried2').map(m => m.ding), ['m_funk', 'm_batterie', 'm_antenne', 'm_schluessel', 'm_diesel']);
    const plan = missionsPlan(7, 1, 'geretsried2', w);
    assert.equal(plan.length, 5, 'Gegenstände fehlen');
    assert.equal(new Set(plan.map(m => m.nr)).size, 5);
    assert.deepEqual(plan.map(m => m.nr), missionsPlan(7, 1, 'geretsried2', w).map(m => m.nr), 'Missionsplan nicht deterministisch');
    // Weltfingerabdruck: zweiter Aufbau ist identisch
    assert.equal(weltFingerabdruck(baueWeltAusKarte(karte, 7)), weltFingerabdruck(w), 'Fingerabdruck nicht deterministisch');
  } finally { setzeKartengroesse(64, 48); }
});

test('Server: Backend „level1“ würfelt eine Level-1-Karte, feste Wahl gilt', async () => {
  const mitKarte = async optionen => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-g2-'));
    const server = await starte({ port: 28500 + Math.floor(Math.random() * 400), optionen, leise: true, datenbank: path.join(ordner, 'spiel.db') });
    const name = SpielRaum.einstellungen.karte?.name, wahl = SpielRaum.level1Wahl;
    await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true });
    return { name, wahl };
  };
  const z = await mitKarte({ karte: 'level1' });
  assert.ok(LEVEL1_KARTEN.includes(z.name), String(z.name)); assert.equal(z.wahl, '');
  const fest = await mitKarte({ karte: 'geretsried2' });
  assert.deepEqual(fest, { name: 'geretsried2', wahl: 'geretsried2' });
  const alt = await mitKarte({ karte: 'geretsried' });
  assert.deepEqual(alt, { name: 'geretsried', wahl: 'geretsried' });
});
