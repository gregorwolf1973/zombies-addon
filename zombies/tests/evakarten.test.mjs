// Evakuierungsarten der Level 3–5: Absturz (Königsdorf) → NH90 nach den Missionen, Kochel (NH90 von Anfang an), Bunker (Finale)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { evakArtFuer } from '../client/evak.mjs';
import { bereinige } from '../server/einstellungen.mjs';

const PORT = 28300 + Math.floor(Math.random() * 100);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-evakarten-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'isarauen' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

// Raum mit erzwungener Evakuierungsart (Isarauen-Welt hat das feine Raster); fn bekommt { c, raum, p, s, ag, meldungen }
const mitArt = (art, fn, extra = {}) => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, aufgaben: { ...alt.aufgaben, evakArt: art }, ...extra };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Flüchtling', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const meldungen = []; c.onMessage('meldung', m => meldungen.push(m.text));
    c.onMessage('bunkerEnde', () => {});
    const ag = raum.aufgaben, s = raum.state;
    await fn({ c, raum, p: s.spieler.get(c.sessionId), s, ag, meldungen });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};
const nurFunk = (raum) => { raum.state.aufgaben.clear(); raum.aufgaben.neu('funk', false); raum.aufgaben.aktualisieren(false); };

test('Karte → Evakuierungsart und Einstellung für die neuen Arten', () => {
  assert.equal(evakArtFuer('koenigsdorf'), 'absturz');
  assert.equal(evakArtFuer('kochel'), 'heli');
  assert.equal(evakArtFuer('andermatt'), 'bunker');
  assert.equal(evakArtFuer('isarauen'), 'panzer');
  for (const a of ['absturz', 'heli', 'bunker']) assert.equal(bereinige({ aufgaben: { evakArt: a } }).aufgaben.evakArt, a);
});

test('Königsdorf: A400M stürzt ab (Wrack bleibt), kein Schaden; NH90 landet erst, wenn die Fahrt gelingt; Einsteigen → Abflug', mitArt('absturz', async ({ raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'absturz');
  assert.ok(s.evakAX > 0, 'keine Absturzstelle');
  nurFunk(raum);
  ag.fahrtGelingt = () => false;   // Missionsteile (code-6f) noch offen
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  const hp = p.hp;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  assert.ok(s.evakRest > 0 && s.evakRest <= 14);
  ag.crash.rest = 0.05;   // Anflug abkürzen
  assert.ok(await bis(() => s.evakPhase === 'wrack', 3000), 'kein Absturz');
  assert.ok(await bis(() => meldungen.some(m => m.includes('stürzt ab'))), 'keine Absturz-Meldung');
  assert.equal(p.hp, hp, 'Spieler beim Absturz verletzt');
  assert.ok(s.evakAX > 0 && s.evakAY > 0, 'Wrack nicht mehr da');
  assert.equal(s.busDa, false);
  await warte(700);
  assert.equal(s.evakPhase, 'wrack', 'Hubschrauber kommt, obwohl die Fahrt nicht gelingt');
  // Missionsteile erledigt → NH90 im Anflug, landet, Einsteigen, Abflug (Levelwechsel angestoßen)
  ag.fahrtGelingt = () => true;
  assert.ok(await bis(() => s.evakPhase === 'heliAnflug', 3000), 'NH90 kommt nicht');
  assert.ok(Math.hypot(s.evakX - s.evakAX, s.evakY - s.evakAY) > 300, 'Landeplatz liegt im Wrack');
  assert.ok(s.evakAX > 0, 'Wrack verschwindet beim Anflug');
  ag.heli.rest = 0.1;
  assert.ok(await bis(() => s.evakPhase === 'heli', 3000), 'NH90 landet nicht');
  let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.ok(await bis(() => s.evakPhase === 'abflug', 4000), 'kein Abflug');
  assert.ok(p.anBord, 'nicht an Bord');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
}));

test('Kochel: NH90 steht von Anfang an, Einsteigen jederzeit mit Aussteigen, Abflug nur wenn die Fahrt gelingt', mitArt('heli', async ({ c, raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'heli');
  assert.equal(s.evakPhase, 'heli', 'Hubschrauber steht nicht von Anfang an');
  assert.ok(s.busDa && s.busSteht && s.evakX > 0);
  ag.fahrtGelingt = () => false;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => meldungen.some(m => m.includes('es fehlt'))), 'Meldung „was fehlt“');
  ag.busRest = 0.05; await warte(600);
  assert.ok(p.anBord && s.busDa, 'fliegt ohne erfüllte Bedingungen ab');
  ag.einstiegT.clear(); c.send('aussteigen');
  assert.ok(await bis(() => !p.anBord), 'Aussteigen geht nicht');
  // Bedingungen erfüllt, wieder einsteigen → Abflug
  ag.fahrtGelingt = () => true;
  let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  const w = { x: s.evakX + 300, y: s.evakY }; p.x = w.x; p.y = w.y; await warte(400);
  assert.ok(await bis(() => { p.ebene = ''; p.x = s.evakX; p.y = s.evakY; return s.evakPhase === 'abflug'; }, 6000), 'kein Abflug');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
}));

test('Bunker: Einsteigen = hineingehen (anBord), kein Abflug; Countdown-Ende: drinnen gewinnt, draußen verliert', mitArt('bunker', async ({ c, raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'bunker');
  assert.equal(s.evakPhase, 'bunker');
  assert.ok(s.evakX > 0 && s.busDa);
  const betreten = [], verlassen = [];
  raum.bunker = { betreten: sid => betreten.push(sid), verlassen: sid => verlassen.push(sid) };
  ag.fahrtGelingt = () => true;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.ok(await bis(() => p.anBord), 'geht nicht hinein');
  assert.equal(betreten.length, 1, 'Haken betreten nicht gerufen');
  assert.ok(meldungen.some(m => m.includes('Bunker')) || await bis(() => meldungen.some(m => m.includes('Bunker'))));
  await warte(800);
  assert.ok(p.anBord && s.busDa, 'Bunker „fährt“ ab');
  assert.equal(ag.wechselLaeuft, false, 'Levelwechsel im Bunker');
  // ein Bot bleibt draußen
  const bots = [...s.spieler.entries()].filter(([sid]) => raum.extra.get(sid)?.bot);
  // Countdown-Ende: der Spieler ist drin → Sieg
  let r = ag.bunkerEnde();
  assert.equal(r.sieg, true);
  assert.equal(s.evakPhase, 'sieg');
  assert.ok(r.drinnen.includes(c.sessionId));
  // Aussteigen und draußen sein → Niederlage
  ag.einstiegT.clear(); c.send('aussteigen');
  assert.ok(await bis(() => !p.anBord));
  assert.equal(verlassen.length, 1);
  r = ag.bunkerEnde();
  assert.equal(r.sieg, false);
  assert.equal(s.evakPhase, 'niederlage');
  assert.ok(r.draussen.includes(c.sessionId));
}));
