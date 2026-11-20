// Panzermörser (M113): Steilfeuer auf Zombiegruppen, Reichweiten, Sicherheitsabstand, Spieler nie verletzt (server/moerser.mjs)
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
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { MOERSER } from '../server/moerser.mjs';
import { frei } from '../client/welt.mjs';

const PORT = 27950 + Math.floor(Math.random() * 40);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-moerser-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
// Raum mit eingeschaltetem Mörser; fn bekommt { c, raum, p, f, schuesse }
const mitMoerser = (zusatz, fn) => async () => {
  await frisch();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, test: { ...alt.test, moerser: true }, moerser: { ...MOERSER, ...zusatz } };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Beobachter', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const schuesse = []; c.onMessage('moerser', m => schuesse.push(m));
    assert.ok(await bis(() => raum.moerser.fahrzeug()), 'Mörserfahrzeug erscheint nicht');
    raum.moerser.kuehl = 0;
    await fn({ c, raum, p: raum.state.spieler.get(c.sessionId), f: raum.moerser.fahrzeug(), schuesse });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, '', true); raum.zombieInfo.get(id).steht = true; raum.state.zombies.get(id).hp = 100; return id; };
// freier Fleck (20 px Platz) in `meter` Entfernung vom Fahrzeug, in beliebiger Richtung (der Zufallsdorf-Plan hat Häuser und Zäune)
const fleck = (raum, f, meter) => {
  for (let k = 0; k < 72; k++) {
    const w = k * Math.PI / 36, x = f.x + Math.cos(w) * meter * 8, y = f.y + Math.sin(w) * meter * 8;
    if (frei(raum.wv(''), x, y, 20)) return { x, y };
  }
  throw new Error('kein freier Fleck in ' + meter + ' m');
};
const gruppe = (raum, f, meter, n = 4) => { const o = fleck(raum, f, meter), ids = []; for (let i = 0; i < n; i++) ids.push(zombie(raum, o.x + (i % 2) * 6 - 3, o.y + (i >> 1) * 6 - 3)); return { x: o.x, y: o.y, ids }; };
const fernhalten = (p, f) => { p.ebene = ''; p.x = f.x - 40; p.y = f.y + 300; };

test('Mörser-Einstellungen: Vorgabe aus, Grenzen und Reichweitenreihenfolge', () => {
  assert.equal(vorgaben().test.moerser, false);
  assert.deepEqual(vorgaben().moerser, MOERSER);
  const m = bereinige({ moerser: { reichweiteMin: 90, reichweiteMax: 20, pause: 0, schaden: 99999, radius: 99, mindestZombies: 0, sicherheit: -4, tempo: 1 }, test: { moerser: true } });
  assert.equal(m.test.moerser, true);
  assert.ok(m.moerser.reichweiteMax >= m.moerser.reichweiteMin + 5, 'Höchstreichweite muss über der Mindestreichweite liegen');
  assert.deepEqual([m.moerser.pause, m.moerser.schaden, m.moerser.radius, m.moerser.mindestZombies, m.moerser.sicherheit, m.moerser.tempo], [1, 1000, 15, 1, 0, 10]);
  assert.equal(bereinige({ test: { moerser: 'ja' } }).test.moerser, false);
});

test('Mörser: nur mit Test-Schalter, danach steht ein M113 am Start und verschwindet bei Schalter aus', async () => {
  await frisch();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Aus', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    await warte(300);
    assert.equal(raum.moerser.fahrzeug(), null, 'Mörser trotz Vorgabe aus');
    const alt = SpielRaum.einstellungen;
    SpielRaum.einstellungen = { ...alt, test: { ...alt.test, moerser: true } };
    assert.ok(await bis(() => raum.moerser.fahrzeug()?.art === 'moerser'), 'Mörser erscheint nicht');
    SpielRaum.einstellungen = alt;
    assert.ok(await bis(() => !raum.moerser.fahrzeug()), 'Mörser bleibt');
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('Mörser: Granate im hohen Bogen (Flugzeit), Einschlag mit Flächenschaden, zählt nicht für die Aufgaben', mitMoerser({ schaden: 60, pause: 60 }, async ({ raum, f, schuesse }) => {
  const g = gruppe(raum, f, 30), weit = zombie(raum, fleck(raum, f, 60).x, fleck(raum, f, 60).y);   // Zombie weit außerhalb des Radius (6 m = 48 px)
  const besiegt = raum.state.besiegt;
  assert.ok(await bis(() => schuesse.length > 0), 'schießt nicht');
  const m = schuesse[0];
  assert.ok(m.flug >= 1.5 && m.flug <= 5, 'Flugzeit ' + m.flug);
  assert.ok(Math.hypot(m.x2 - g.x, m.y2 - g.y) < 12, 'Ziel nicht in der Gruppe');
  assert.ok(g.ids.every(id => raum.state.zombies.get(id).hp === 100), 'Schaden vor dem Einschlag');
  assert.ok(await bis(() => g.ids.every(id => raum.state.zombies.get(id)?.hp < 100), 4000), 'kein Einschlagschaden: ' + JSON.stringify(g.ids.map(id => raum.state.zombies.get(id)?.hp)) + ' flug=' + raum.moerser.flug.length + ' zomb=' + raum.state.zombies.size);
  assert.ok(g.ids.every(id => raum.state.zombies.get(id).hp >= 30 && raum.state.zombies.get(id).hp <= 60), 'Schaden nach außen nicht abgestuft: ' + g.ids.map(id => raum.state.zombies.get(id)?.hp));
  assert.equal(raum.state.zombies.get(weit).hp, 100, 'Zombie außerhalb des Radius getroffen');
  assert.equal(raum.state.besiegt, besiegt);
}));

test('Mörser: tötet eine Gruppe mit vollem Schaden, Blut und Leichen wie üblich', mitMoerser({ schaden: 400 }, async ({ raum, f, schuesse }) => {
  const g = gruppe(raum, f, 40, 5);
  assert.ok(await bis(() => g.ids.every(id => !raum.state.zombies.has(id)), 6000), 'Gruppe lebt noch');
  assert.ok(schuesse.length >= 1);
}));

test('Mörser: Mindestgröße der Gruppe, Mindest- und Höchstreichweite', mitMoerser({ mindestZombies: 3, reichweiteMin: 20, reichweiteMax: 50 }, async ({ raum, f, schuesse }) => {
  gruppe(raum, f, 30, 2);                      // nur 2 Zombies
  await warte(900);
  assert.equal(schuesse.length, 0, 'schießt auf zu kleine Gruppe');
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  gruppe(raum, f, 10, 4);                      // zu nah (< 20 m)
  await warte(900);
  assert.equal(schuesse.length, 0, 'schießt unter der Mindestreichweite');
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  gruppe(raum, f, 70, 4);                      // zu weit (> 50 m)
  await warte(900);
  assert.equal(schuesse.length, 0, 'schießt über der Höchstreichweite');
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  gruppe(raum, f, 35, 4);                      // im Fenster
  assert.ok(await bis(() => schuesse.length > 0), 'schießt nicht in der Reichweite');
}));

test('Mörser: kein Schuss, wenn ein Spieler nahe am Einschlag steht; Spieler nehmen nie Schaden', mitMoerser({ schaden: 60, sicherheit: 6, pause: 60 }, async ({ raum, p, f, schuesse }) => {
  const g = gruppe(raum, f, 30, 4);
  p.ebene = ''; p.x = g.x + 20; p.y = g.y + 5;   // 2,5 m vom Einschlag
  const hp = p.hp;
  await warte(1200);
  assert.equal(schuesse.length, 0, 'schießt trotz Spieler am Einschlag');
  // Spieler geht weg (die geweckten Zombies stellen wir neu auf): es wird geschossen
  fernhalten(p, f);
  for (const id of g.ids) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  g.ids = []; for (let i = 0; i < 4; i++) g.ids.push(zombie(raum, g.x + (i % 2) * 6 - 3, g.y + (i >> 1) * 6 - 3));
  assert.ok(await bis(() => schuesse.length > 0), 'schießt nicht, obwohl niemand mehr nah ist');
  // Einschlag direkt auf einem Spieler (er kam im Flug dazu): Zombies leiden, der Spieler bleibt unverletzt
  await warte(2500);
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  p.x = g.x; p.y = g.y; p.ebene = '';
  const z = zombie(raum, g.x + 4, g.y), hp2 = p.hp;
  raum.moerser.einschlag({ x: g.x, y: g.y }, raum.moerser.einst());
  assert.ok(raum.state.zombies.get(z).hp < 100, 'Zombie am Einschlag unverletzt');
  assert.equal(p.hp, hp2, 'Spieler vom Mörser verletzt');
}));
