// Level 3–5: Königsdorf (Absturz), Kochel (NH90), Andermatt (Bunker, Finale mit Atomschlag-Countdown)
import { textAus } from '../server/texte.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { KACHEL, setzeKartengroesse, frei } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { ladeKarte, starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KARTEN, LEVEL_WELTEN, bereinige } from '../server/einstellungen.mjs';
import { LEVEL_KARTEN, KARTEN_NAMEN, Aufgaben } from '../server/aufgaben.mjs';
import { missionsPlan, missionListe } from '../server/mission.mjs';
import { levelorteSetzen } from '../server/levelorte.mjs';
import { schwierigkeit } from '../server/schwierigkeit.mjs';
import { heliPlan, bunkerPlan } from '../server/flugplatz.mjs';
import { SU_BEFEHLE } from '../server/superuser.mjs';
import { ANSAGEN, ABSPANN_SEKUNDEN } from '../server/finale.mjs';
import { freierPort } from './hilfe.mjs';

const NEU = { koenigsdorf: 3, kochel: 4, andermatt: 5 };

test('Karten registriert, Reihenfolge 1→2→3→4→5→6, Namen, Einstellungen', () => {
  assert.deepEqual(LEVEL_KARTEN, ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  const naechste = k => Aufgaben.prototype.naechsteKarte.call({ raum: { state: { karte: k } } });
  for (let i = 0; i < LEVEL_KARTEN.length - 1; i++) assert.equal(naechste(LEVEL_KARTEN[i]), LEVEL_KARTEN[i + 1]);
  for (const k of Object.keys(NEU)) {
    assert.ok(KARTEN.includes(k) && LEVEL_WELTEN.includes(k), k);
    assert.ok(KARTEN_NAMEN[k]);
    assert.equal(ladeKarte(k).name, k);
    assert.ok(Array.isArray(missionListe(k)) && missionListe(k).length === 3, 'genau 3 Missionsgegenstände je Level');
  }
  const e = bereinige({});
  for (const k of LEVEL_WELTEN) assert.ok(e.bissSpielerLevel[k] > 0, 'Biss ' + k);
  assert.ok(e.bissSpielerLevel.andermatt > e.bissSpielerLevel.geretsried, 'Biss steigt');
  assert.equal(e.aufgaben.finaleMinuten, 30);
  assert.equal(bereinige({ aufgaben: { finaleMinuten: 5 } }).aufgaben.finaleMinuten, 5);   // nur empfohlen 10–90
  assert.equal(bereinige({ aufgaben: { finaleMinuten: 500 } }).aufgaben.finaleMinuten, 500);
  assert.ok(SU_BEFEHLE.includes('level') && SU_BEFEHLE.includes('countdown'));
});

test('Schwierigkeit: Level 1 und 2 gleich (Geretsried 1 und 2), steigt bis 6, darüber wie 6', () => {
  let vor = schwierigkeit({ level: 2, tage: 0 });
  assert.deepEqual(vor, schwierigkeit({ level: 1, tage: 0 }));
  for (let l = 3; l <= 6; l++) {
    const j = schwierigkeit({ level: l, tage: 0 });
    assert.ok(j.schnell > vor.schnell && j.nacht > vor.nacht && j.beute < vor.beute, 'Level ' + l);
    vor = j;
  }
  assert.deepEqual(schwierigkeit({ level: 9, tage: 0 }), vor);
});

for (const [karteName, level] of Object.entries(NEU)) for (const seed of [7, 4711]) {
  test(`${karteName} (Seed ${seed}): Welt, Missionsorte in weit entfernten Häusern, Levelorte frei`, () => {
    const karte = ladeKarte(karteName).kacheln ? JSON.parse(fs.readFileSync(new URL(`../client/karten/${karteName}.json`, import.meta.url))) : null;
    setzeKartengroesse(karte.breite, karte.hoehe);
    try {
      const w = baueWeltAusKarte(karte, seed);
      levelorteSetzen(w, karteName);
      assert.ok(w.safeRooms.length >= 1);
      const plan = missionsPlan(seed, level, karteName, w, 1);
      const soll = missionListe(karteName).map(m => m.ding);
      assert.deepEqual(plan.map(m => m.ding).sort(), soll.slice().sort(), 'nicht alle Gegenstände gefunden');
      assert.equal(new Set(plan.map(m => m.nr)).size, plan.length, 'zwei Gegenstände im selben Haus');
      let min = Infinity;
      for (const a of plan) for (const b of plan) if (a !== b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
      assert.ok(min > 40 * KACHEL, `Gegenstände zu nah beieinander: ${Math.round(min / KACHEL)} Kacheln`);
      if (karteName === 'kochel') {
        assert.ok(w.heliplatz && frei(w, w.heliplatz.x, w.heliplatz.y, 70), 'Heliplatz nicht frei');
        assert.deepEqual(heliPlan(w, seed).heli, w.heliplatz);
        assert.ok(Math.abs(w.heliplatz.x - 169.5 * KACHEL) < 3 * KACHEL && Math.abs(w.heliplatz.y - 207.5 * KACHEL) < 3 * KACHEL, 'Heliplatz nicht an der Kartenstelle');
      }
      if (karteName === 'andermatt') {
        assert.ok(w.bunkertor && frei(w, w.bunkertor.x, w.bunkertor.y, 40), 'Bunkertor nicht frei');
        assert.deepEqual(bunkerPlan(w, seed).tor, w.bunkertor);
        assert.ok(Math.abs(w.bunkertor.x - 222.5 * KACHEL) < 3 * KACHEL && Math.abs(w.bunkertor.y - 9.5 * KACHEL) < 3 * KACHEL, 'Bunkertor nicht an der Kartenstelle');
      }
      if (karteName === 'koenigsdorf') assert.equal(w.heliplatz, undefined);
    } finally { setzeKartengroesse(64, 48); }
  });
}

// ---------- Finale (Raum mit Andermatt) ----------
const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-level345-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'andermatt' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

const mitFinale = fn => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen, kw = SpielRaum.kartenWechsel;
  const gewechselt = []; SpielRaum.kartenWechsel = k => gewechselt.push(k);
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Flüchtling', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const meldungen = [], ende = []; c.onMessage('meldung', m => meldungen.push(textAus(m))); c.onMessage('bunkerEnde', m => ende.push(m));
    // Neustart abfangen, statt die Welt wirklich zu verwerfen
    const neustarts = []; raum.weltNeuStarten = (...a) => neustarts.push(a);
    await fn({ c, raum, p: raum.state.spieler.get(c.sessionId), s: raum.state, ag: raum.aufgaben, f: raum.finale, meldungen, ende, neustarts, gewechselt });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; SpielRaum.kartenWechsel = kw; }
};

test('Finale: Countdown startet mit der Vorgabe, läuft nur mit echtem Spieler, SU-Befehl setzt ihn neu', mitFinale(async ({ raum, s, f, ag }) => {
  assert.equal(s.karte, 'andermatt');
  assert.equal(ag.evakArt(), 'bunker');
  // Vorgabe 1800 s; zwischen Beitritt und Testbeginn kann der echte Simulationstakt schon ein paar Sekunden gezählt haben (unter Last)
  assert.ok(f.rest <= 1800 && f.rest > 1790 && s.finaleRest === Math.ceil(f.rest), 'Countdown beginnt nicht mit 1800 s: ' + f.rest);
  assert.ok(f.aktiv());
  const vorher = f.rest;
  raum.schritt(1); raum.schritt(1);
  assert.ok(f.rest < vorher - 1.9 && s.finaleRest === Math.ceil(f.rest));
  // niemand verbunden: Pause
  for (const p of s.spieler.values()) p.verbunden = false;
  const r0 = f.rest; raum.schritt(5);
  assert.equal(f.rest, r0, 'Countdown läuft ohne Spieler');
  for (const [sid, p] of s.spieler) if (!raum.extra.get(sid)?.bot) p.verbunden = true;
  assert.equal(f.setzen(60), true);
  assert.equal(s.finaleRest, 60);
  assert.equal(f.gemeldet.has(60), false);
  assert.ok(f.gemeldet.has(600) && f.gemeldet.has(300));
}));

test('Finale: Ansagen bei 10/5/1 min und 30 s', mitFinale(async ({ raum, f, meldungen, c }) => {
  assert.deepEqual(ANSAGEN, [600, 300, 60, 30]);
  f.rest = 601; f.gemeldet.clear();
  raum.schritt(1.5);
  assert.ok(await bis(() => meldungen.some(m => m.includes('10 Minuten'))), '10 min fehlt');
  f.rest = 300.5; raum.schritt(1);
  f.rest = 60.5; raum.schritt(1);
  f.rest = 30.5; raum.schritt(1);
  assert.ok(await bis(() => meldungen.some(m => m.includes('30 Sekunden'))), '30 s fehlt');
  assert.ok(meldungen.some(m => m.includes('5 Minuten')) && meldungen.some(m => m.includes('1 Minute')));
  assert.ok(c.sessionId);
}));

test('Finale: Bunkertor bleibt zu, bis die Missionen erledigt sind, dann geht der Spieler hinein', mitFinale(async ({ raum, p, s, ag, meldungen }) => {
  assert.ok(s.evakX > 0 && ag.heli?.art === 'bunker');
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.equal(ag.fahrtGelingt(), false, 'Missionen schon erledigt?');
  raum.schritt(0.6); raum.schritt(0.6);
  assert.ok(!p.anBord, 'Tor offen trotz offener Missionen');
  assert.ok(await bis(() => meldungen.some(m => m.includes('Bunkertor ist verschlossen'))), 'kein Hinweis am Tor');
  ag.fahrtGelingt = () => true;
  raum.schritt(0.6);
  assert.equal(p.anBord, true, 'Tor bleibt zu, obwohl alles erledigt');
}));

test('Finale: Countdown bei 0 → bunkerEnde; Sieg (drin): Abspann, nach 20 s frische Runde in Level 1 (Geretsried)', mitFinale(async ({ c, raum, p, s, ag, f, ende, neustarts, meldungen }) => {
  ag.fahrtGelingt = () => true;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  raum.schritt(0.6);
  assert.equal(p.anBord, true);
  let aufrufe = 0; const orig = ag.bunkerEnde.bind(ag); ag.bunkerEnde = () => { aufrufe++; return orig(); };
  f.rest = 0.5; raum.schritt(1);
  assert.equal(aufrufe, 1);
  assert.equal(s.finaleRest, 0);
  assert.equal(s.evakPhase, 'sieg');
  assert.equal(s.phase, 'finale', 'Welt steht nicht still');
  assert.ok(f.abspann && f.abspann.rest > ABSPANN_SEKUNDEN - 1 && f.abspann.rest <= ABSPANN_SEKUNDEN, 'Abspann dauert ABSPANN_SEKUNDEN: ' + f.abspann?.rest);
  assert.ok(await bis(() => ende.length === 1 && ende[0].sieg === true && ende[0].drinnen.includes(c.sessionId)), 'bunkerEnde nicht angekommen');
  assert.ok(await bis(() => meldungen.some(m => m.includes('Geschafft') && m.includes('Bunker'))));
  assert.equal(neustarts.length, 0);
  // Während der Wartezeiten oben läuft der echte Simulationstakt weiter und zählt den Abspann schon herunter (unter Last spürbar):
  // darum nur die verbleibende Zeit simulieren, nicht pauschal ABSPANN_SEKUNDEN − 1
  assert.ok(f.abspann.rest > 1, 'Abspann schon fast vorbei: ' + f.abspann.rest);
  raum.schritt(f.abspann.rest - 0.5);
  assert.equal(neustarts.length, 0, 'Neustart zu früh');
  raum.schritt(1.5);
  assert.equal(neustarts.length, 1, 'kein Neustart nach dem Abspann');
  assert.deepEqual(neustarts[0], [false], 'frische Runde: weltNeuStarten(false) ohne Stand (Level 1)');
  raum.schritt(10);
  assert.equal(neustarts.length, 1, 'doppelter Neustart');
}));

test('Finale: Niederlage (keiner drin): Atomblitz, Game over, nach 20 s Andermatt (Level 6) neu', mitFinale(async ({ c, raum, p, s, f, ende, neustarts, gewechselt, meldungen }) => {
  f.rest = 0.5; raum.schritt(1);
  assert.equal(s.evakPhase, 'niederlage');
  assert.equal(p.unten, true, 'draußen überlebt');
  assert.ok(await bis(() => ende.length === 1 && ende[0].sieg === false && ende[0].draussen.includes(c.sessionId)));
  assert.ok(await bis(() => meldungen.some(m => m.includes('Game over'))));
  raum.schritt(ABSPANN_SEKUNDEN + 0.5);
  assert.equal(neustarts.length, 1);
  assert.deepEqual(gewechselt, ['andermatt']);
  const [spielerLoeschen, stand] = neustarts[0];
  assert.equal(spielerLoeschen, false);
  assert.equal(stand.level, 6);
  assert.equal(stand.karte, 'andermatt');
}));

test('Superuser: Befehl level wechselt die Karte, countdown setzt den Zähler', mitFinale(async ({ c, raum, p, s, f, gewechselt, neustarts }) => {
  const SU = await import('../server/superuser.mjs');
  const x = raum.extra.get(c.sessionId); x.superuser = true;
  const antworten = []; const client = { sessionId: c.sessionId, send: (t, m) => antworten.push([t, m]) };
  assert.match(textAus(SU.befehl(raum, client, { befehl: 'countdown', sekunden: 60 })), /60 s/);
  assert.equal(s.finaleRest, 60);
  assert.match(textAus(SU.befehl(raum, client, { befehl: 'level', level: 9 })), /Unbekannt/);
  assert.match(textAus(SU.befehl(raum, client, { befehl: 'level', level: 4 })), /Level 4/);
  assert.ok(await bis(() => neustarts.length === 1, 4000), 'kein Wechsel');
  assert.deepEqual(gewechselt, ['koenigsdorf']);
  assert.equal(neustarts[0][1].level, 4);
  assert.equal(neustarts[0][1].karte, 'koenigsdorf');
  assert.ok(p && f);
}));
