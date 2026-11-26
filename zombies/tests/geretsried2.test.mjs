// Geretsried 2: eigenes Level (Level 2 der Vorgabe-Reihenfolge, früher Zufallswahl in Level 1) – Aufbau, Missionen, Evakuierung (Bus), Anzeigenamen
import { textAus } from '../server/texte.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KACHEL, setzeKartengroesse, frei, findeWeg, weltFingerabdruck } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { evakArtFuer } from '../client/evak.mjs';
import { LEVEL_KARTEN, KARTEN_NAMEN, Aufgaben, levelSchluessel } from '../server/aufgaben.mjs';
import { KARTEN, bereinige, vorgaben } from '../server/einstellungen.mjs';
import { ladeKarte, starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { missionsPlan, missionListe } from '../server/mission.mjs';
import { befehl } from '../server/superuser.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));

test('Geretsried 2: Karte registriert, Name, Bus-Evakuierung, eigener Level-Schlüssel', () => {
  assert.ok(karte.quelle.includes('OpenStreetMap'));
  assert.ok(KARTEN.includes('geretsried2') && !KARTEN.includes('level1'));
  assert.equal(ladeKarte('geretsried2').name, 'geretsried2');
  assert.equal(KARTEN_NAMEN.geretsried, 'Geretsried 1');
  assert.equal(KARTEN_NAMEN.geretsried2, 'Geretsried 2');
  assert.equal(KARTEN_NAMEN.isarauen, 'die Isarauen');   // andere Karten unverändert
  assert.equal(evakArtFuer('geretsried2'), 'bus');
  assert.equal(levelSchluessel('geretsried2'), 'geretsried2');
  assert.deepEqual(LEVEL_KARTEN, ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  // Standard im Backend = Geretsried 1 (erstes Level); die alte Zufallswahl „level1“ wird zum ersten aktiven Level
  assert.equal(vorgaben().karte, 'geretsried');
  for (const k of ['geretsried', 'geretsried2']) assert.equal(bereinige({ karte: k }).karte, k);
  assert.equal(bereinige({ karte: 'level1' }).karte, 'geretsried');
  assert.equal(bereinige({ karte: 'level1', levelFolge: [{ karte: 'geretsried', aktiv: false }, { karte: 'geretsried2', aktiv: true }] }).karte, 'geretsried2');
  // Reihenfolge: Geretsried 1 → Geretsried 2 → Isarauen
  assert.equal(Aufgaben.prototype.naechsteKarte.call({ raum: { state: { karte: 'geretsried' } } }), 'geretsried2');
  assert.equal(Aufgaben.prototype.naechsteKarte.call({ raum: { state: { karte: 'geretsried2' } } }), 'isarauen');
});

// Aufgaben.levelWechsel mit Attrappe: welche Karte wird eingestellt?
function wechsel(ziel, zustandKarte = 'andermatt') {
  const eingestellt = [];
  const SR = function () {}; SR.kartenWechsel = k => eingestellt.push(k);
  const raum = { constructor: SR, state: { karte: zustandKarte, level: 5, besiegt: 0, spieler: new Map() }, chatVerlauf: [], weltNeuStarten: () => {} };
  const ag = Object.assign(Object.create(Aufgaben.prototype), { raum, eingestiegen: new Set(), folgenId: null });
  ag.levelWechsel(ziel);
  return eingestellt[0];
}

test('Levelwechsel: kein Zufall mehr, jede Karte ist ein eigenes Level', () => {
  for (let i = 0; i < 20; i++) assert.equal(wechsel({ karte: 'geretsried', level: 1, frisch: true }), 'geretsried');
  for (let i = 0; i < 20; i++) assert.equal(wechsel({ karte: 'geretsried2', level: 2 }), 'geretsried2');
  assert.equal(wechsel({ karte: 'isarauen', level: 3 }), 'isarauen');
  assert.equal(wechsel(null, 'koenigsdorf'), 'kochel');
  assert.equal(wechsel(null, 'andermatt'), 'geretsried', 'nach dem letzten Level wieder von vorn');
  assert.equal(wechsel(null, 'geretsried'), 'geretsried2');
});

test('Superuser „Level 1“ = Geretsried 1, „Level 2“ = Geretsried 2, „Level 3“ = Isarauen', () => {
  const ziele = [];
  const gesendet = [];
  const a = { wechselLaeuft: false, levelWechsel: z => ziele.push(z) };
  const raum = { aufgaben: a, extra: new Map([['s', { superuser: true }]]), state: { spieler: new Map([['s', { name: 'Su' }]]) },
    broadcast: (t, m) => gesendet.push(textAus(m)), clock: { setTimeout: f => f() } };
  const client = { sessionId: 's' };
  for (let i = 0; i < 10; i++) {
    a.wechselLaeuft = false;
    assert.match(textAus(befehl(raum, client, { befehl: 'level', level: 1 })), /Level 1 \(Geretsried 1\)/);
  }
  assert.ok(ziele.every(z => z.level === 1 && z.karte === 'geretsried'));
  assert.ok(gesendet.every(t => /Geretsried 1/.test(t)));
  ziele.length = 0; a.wechselLaeuft = false;
  assert.match(textAus(befehl(raum, client, { befehl: 'level', level: 2 })), /Level 2 \(Geretsried 2\)/);
  assert.deepEqual(ziele[0], { karte: 'geretsried2', level: 2 });
  ziele.length = 0; a.wechselLaeuft = false;
  befehl(raum, client, { befehl: 'level', level: 3 });
  assert.equal(ziele[0].karte, 'isarauen');
  a.wechselLaeuft = false;
  assert.match(textAus(befehl(raum, client, { befehl: 'level', level: 7 })), /Unbekannt/);
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
    // Missionen: höchstens drei Gegenstände je Level, weit auseinander, deterministisch
    assert.deepEqual(missionListe('geretsried2').map(m => m.ding), ['m_funk', 'm_batterie', 'm_antenne']);
    const plan = missionsPlan(7, 1, 'geretsried2', w);
    assert.equal(plan.length, 3, 'Gegenstände fehlen');
    assert.equal(new Set(plan.map(m => m.nr)).size, 3);
    assert.deepEqual(plan.map(m => m.nr), missionsPlan(7, 1, 'geretsried2', w).map(m => m.nr), 'Missionsplan nicht deterministisch');
    // Weltfingerabdruck: zweiter Aufbau ist identisch
    assert.equal(weltFingerabdruck(baueWeltAusKarte(karte, 7)), weltFingerabdruck(w), 'Fingerabdruck nicht deterministisch');
  } finally { setzeKartengroesse(64, 48); }
});

test('Server: alte Backend-Wahl „level1“ startet das erste aktive Level, feste Wahl gilt', async () => {
  const mitKarte = async optionen => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-g2-'));
    const server = await starte({ port: 28500 + Math.floor(Math.random() * 400), optionen, leise: true, datenbank: path.join(ordner, 'spiel.db') });
    const name = SpielRaum.einstellungen.karte?.name;
    await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true });
    return name;
  };
  assert.equal(await mitKarte({ karte: 'level1' }), 'geretsried');
  assert.equal(await mitKarte({ karte: 'geretsried2' }), 'geretsried2');
  assert.equal(await mitKarte({ karte: 'geretsried' }), 'geretsried');
});
