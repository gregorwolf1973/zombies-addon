// Rucksack, Durchsuchen, Safe Rooms, Barrikade und Speichern
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
import { KACHEL, RUCKSACK_PLAETZE, safeRoomAn } from '../client/welt.mjs';

const PORT = 26900 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-test-'));
const DB = path.join(ordner, 'spiel.db');
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');

before(async () => { server = await starte({ port: PORT, optionen: {}, leise: true, datenbank: DB }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), spielerId };
}

test('Durchsuchen füllt den Rucksack, leerer Behälter bleibt leer', async () => {
  const { c, raum, p } = await beitreten('Sucher');
  try {
    const b = raum.welt.behaelter.find(b => b.art !== 'auto');
    p.x = b.x; p.y = b.y + 1;
    raum.setzeInhalt(b.id, ['wasser', 'munition', 'verband']);
    const m0 = p.munition, r0 = p.rucksack.length;
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'), 'Aktion startet nicht');
    assert.ok(await bis(() => p.aktion === '' && raum.state.behaelter.get(b.id).rest === 0, 4000), 'nicht fertig');
    assert.equal(p.munition, m0 + 12);
    assert.equal(p.rucksack.length, r0 + 2);
    assert.ok(await bis(() => c.state.behaelter.get(b.id)?.rest === 0), 'Client sieht leeren Behälter nicht');
    // Bewegen bricht ab
    const b2 = raum.welt.behaelter.find(x => x.art !== 'auto' && x.id !== b.id);
    p.x = b2.x; p.y = b2.y + 1;
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'));
    c.send('eingabe', { dx: 1, dy: 0 });
    assert.ok(await bis(() => p.aktion === ''), 'Bewegen bricht nicht ab');
    assert.equal(raum.state.behaelter.get(b2.id), undefined);
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Rucksack hat 8 Plätze, Rest bleibt im Behälter', async () => {
  const { c, raum, p } = await beitreten('Packer');
  try {
    p.rucksack.clear();
    for (let i = 0; i < RUCKSACK_PLAETZE - 1; i++) p.rucksack.push('essen');
    const b = raum.welt.behaelter.find(b => b.art === 'auto');
    p.x = b.x; p.y = b.y;
    raum.setzeInhalt(b.id, ['wasser', 'bretter']);
    c.send('aktion');
    assert.ok(await bis(() => raum.state.behaelter.get(b.id).rest === 1, 5000));
    assert.equal(p.rucksack.length, RUCKSACK_PLAETZE);
    assert.equal(raum.inhalte.get(b.id)[0], 'bretter');
  } finally { await c.leave(); }
});

test('Benutzen: Wasser, Konserve, Verband, Waffe wechseln', async () => {
  const { c, p } = await beitreten('Nutzer');
  try {
    p.rucksack.clear();
    p.durst = 10; p.hunger = 10; p.hp = 30; p.waffe = 'pistole';
    for (const d of ['wasser', 'essen', 'verband', 'schlaeger']) p.rucksack.push(d);
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.durst > 50));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.hunger > 50));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.hp >= 75));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'schlaeger'));
    assert.deepEqual([...p.rucksack], ['pistole']);
    c.send('wegwerfen', { platz: 0 });
    assert.ok(await bis(() => p.rucksack.length === 0));
  } finally { await c.leave(); }
});

test('Safe Room: Barrikade mit Brettern, Kiste, Zombie kommt nicht durch', async () => {
  const { c, raum, p } = await beitreten('Bauer');
  try {
    const s = raum.welt.safeRooms[0];
    const tuer = s.haus.tuer, innenRichtung = tuer.y === s.haus.y ? 1 : -1;
    p.x = (tuer.x + 0.5) * KACHEL; p.y = (tuer.y + 0.5 + innenRichtung) * KACHEL;
    assert.ok(safeRoomAn(raum.welt, p.x, p.y), 'Startpunkt nicht im Safe Room');
    p.rucksack.clear(); p.rucksack.push('bretter'); p.rucksack.push('bretter');
    assert.ok(await bis(() => p.sicher === s.id), 'sicher nicht gesetzt');
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'barrikade'));
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade >= 35, 5000), 'keine Barrikade');
    assert.equal(p.rucksack.length, 1);

    // Kiste: rein und wieder raus
    p.x = s.kiste.x; p.y = s.kiste.y;
    c.send('kiste', { richtung: 'rein', platz: 0 });
    assert.ok(await bis(() => raum.state.safes.get(s.id).kiste.length === 1 && p.rucksack.length === 0));
    c.send('kiste', { richtung: 'raus', platz: 0 });
    assert.ok(await bis(() => p.rucksack.length === 1));

    // Zombie vor der Tür kommt nicht hinein, hämmert aber
    raum.neuerZombie(0);
    const [id, z] = [...raum.state.zombies.entries()].at(-1);
    z.x = (tuer.x + 0.5) * KACHEL; z.y = (tuer.y + 0.5 - innenRichtung * 1.2) * KACHEL;
    const vorher = raum.state.safes.get(s.id).barrikade;
    const info = raum.zombieInfo.get(id);
    for (let i = 0; i < 60; i++) {
      info.ziel = c.sessionId;
      raum.zombieGehen(z, innenRichtung > 0 ? Math.PI / 2 : -Math.PI / 2, 5, 0.05);
    }
    assert.ok(!safeRoomAn(raum.welt, z.x, z.y), 'Zombie ist durchgekommen');
    assert.ok(raum.state.safes.get(s.id).barrikade < vorher, 'Barrikade nutzt sich nicht ab');
  } finally { await c.leave(); }
});

test('Speichern: Rucksack und Platz im Safe Room bleiben, draußen → zurück im Safe Room', async () => {
  const id = neueId();
  let { c, raum, p } = await beitreten('Vroni', id);
  const s = raum.welt.safeRooms[1];
  p.rucksack.clear(); p.rucksack.push('verband'); p.rucksack.push('bretter');
  p.x = s.innen.x; p.y = s.innen.y; p.munition = 33;
  assert.ok(await bis(() => p.sicher === s.id));
  let ausgeruht = false;
  c.onMessage('ausgeruht', () => { ausgeruht = true; });
  c.send('ausruhen');
  assert.ok(await bis(() => ausgeruht), 'kein ausgeruht');
  await c.leave();
  await warte(200);

  ({ c, raum, p } = await beitreten('Vroni2', id));
  try {
    assert.deepEqual([...p.rucksack], ['verband', 'bretter']);
    assert.equal(p.munition, 33);
    assert.equal(p.name, 'Vroni2');
    assert.ok(Math.hypot(p.x - s.innen.x, p.y - s.innen.y) < 40, 'nicht am gespeicherten Platz');
    // jetzt draußen verlassen
    p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    assert.ok(await bis(() => p.sicher === ''));
  } finally { await c.leave(); }
  await warte(200);
  ({ c, raum, p } = await beitreten('Vroni', id));
  try {
    assert.ok(await bis(() => p.sicher === s.id), 'nicht im letzten Safe Room aufgetaucht');
  } finally { await c.leave(); }
});

test('Gleiche Person zweimal gleichzeitig wird abgelehnt', async () => {
  const id = neueId();
  const { c } = await beitreten('Eins', id);
  try {
    await assert.rejects(new Client(URL_).joinOrCreate('zombies', { name: 'Zwei', spielerId: id }), /anderen Fenster/);
  } finally { await c.leave(); }
});

test('Welt bleibt nach Neustart des Raums erhalten', async () => {
  const { c, raum } = await beitreten('Welt');
  const seed = raum.state.seed;
  const b = raum.welt.behaelter[3];
  raum.setzeInhalt(b.id, ['essen']);
  raum.state.safes.get('s2').barrikade = 77;
  await c.leave();
  assert.ok(await bis(() => !matchMaker.getLocalRoomById(raum.roomId), 3000), 'Raum bleibt bestehen');
  const neu = await beitreten('Welt2');
  try {
    assert.equal(neu.raum.state.seed, seed);
    assert.deepEqual(neu.raum.inhalte.get(b.id), ['essen']);
    assert.equal(neu.raum.state.safes.get('s2').barrikade, 77);
  } finally { await neu.c.leave(); }
});

test('Durst sinkt, bei 0 verliert man Lebenspunkte', async () => {
  const { c, raum, p } = await beitreten('Durstig');
  try {
    const d0 = p.durst;
    await warte(500);
    assert.ok(p.durst < d0);
    p.durst = 0; p.hp = 50; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    await warte(1000);
    assert.ok(p.hp < 50);
  } finally { await c.leave(); }
  assert.ok(SpielRaum.speicher);
});
