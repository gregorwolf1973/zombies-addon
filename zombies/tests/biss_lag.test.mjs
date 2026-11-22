// Biss nur bei Berührung (+ ca. 0,5 m) und mit Lag-Kompensation (Anzeigeverzögerung des Spielers), Nahbereichs-Hilfe im Client
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { NetzPuffer, verzFuerServer, naheAnzeigeVerz, VERZ_MAX } from '../client/netzpuffer.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(b, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (b()) return true; await warte(20); } return b(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(fn) {
  assert.ok(await bis(() => !SpielRaum.aktiv, 5000));
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Biss', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {}; raum.kriecherChance = 0;
    const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
    p.waffe = ''; p.munition = 0; x.pause = 1e6; x.schonT = 0;
    await fn({ raum, p, x, sid: c.sessionId });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
}

function zombieNeben(raum, p, sid, abstand) {
  const id = raum.setzeZombie(p.x + abstand, p.y, ''), z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
  info.steht = true; info.schlaeft = false; info.bleibt = true; info.ziel = sid;
  return { id, z, info };
}

test('Biss: Berührung beißt, 28 px (alte Reichweite) nicht mehr', async () => {
  await beitreten(async ({ raum, p, sid }) => {
    p.hp = 100;
    const a = zombieNeben(raum, p, sid, 28);
    raum.uhr = 0; raum.zombieSchritt(a.id, a.z, 0.1);
    assert.equal(p.hp, 100, 'beißt schon bei 28 px');
    a.z.x = p.x + 18; a.z.y = p.y; raum.zombieSchritt(a.id, a.z, 0.1);
    assert.ok(p.hp < 100, 'beißt bei Berührung nicht');
  });
});

test('Zombie läuft heran und beißt dann zuverlässig', async () => {
  await beitreten(async ({ raum, p, sid }) => {
    p.hp = 100;
    const a = zombieNeben(raum, p, sid, 60); a.info.steht = false; a.info.bleibt = false;
    for (let i = 0; i < 60; i++) { raum.uhr = (raum.uhr ?? 0) + 0.1; raum.zombieSchritt(a.id, a.z, 0.1); }
    assert.ok(p.hp < 100, 'beißt nach Annäherung nicht, Abstand ' + Math.hypot(a.z.x - p.x, a.z.y - p.y));
  });
});

test('Lag-Kompensation: Zombie, der vor verz ms noch außerhalb stand, beißt nicht; ohne Verzögerung schon', async () => {
  await beitreten(async ({ raum, p, x, sid }) => {
    for (const verz of [0, 300]) {
      p.hp = 100; x.verz = verz;
      const a = zombieNeben(raum, p, sid, 17);
      // Verlauf: vor 300 ms stand er 40 px entfernt (außerhalb), jetzt 17 px (Server-Position knapp innerhalb)
      raum.uhr = 10;
      a.info.spur = [{ t: 9.6, x: p.x + 40, y: p.y }, { t: 9.8, x: p.x + 28, y: p.y }, { t: 9.95, x: p.x + 20, y: p.y }];
      raum.zombieSchritt(a.id, a.z, 0.05);
      if (verz === 0) assert.ok(p.hp < 100, 'direkter Kontakt beißt nicht');
      else assert.equal(p.hp, 100, 'Biss trotz zurückgerechneter Entfernung');
      raum.state.zombies.delete(a.id); raum.zombieInfo.delete(a.id);
    }
    // Eingabe mit verz wird übernommen und gedeckelt
    raum.eingabeEmpfangen({ sessionId: sid }, { dx: 0, dy: 0, verz: 9999 });
    assert.equal(x.verz, 450);
    raum.eingabeEmpfangen({ sessionId: sid }, { dx: 0, dy: 0, verz: 120.4 });
    assert.equal(x.verz, 120);
  });
});

test('Client: Verzögerungsmeldung und Nahbereichs-Hilfe', () => {
  assert.equal(verzFuerServer(180.6), 181);
  assert.equal(verzFuerServer(9999), VERZ_MAX);
  assert.equal(verzFuerServer(-5), 0);
  assert.equal(naheAnzeigeVerz(200, 30), 0);          // weit weg: keine Hilfe
  assert.equal(naheAnzeigeVerz(200, 10), 120);        // nah: auf 80 ms verkürzt
  const mitte = naheAnzeigeVerz(200, 20);
  assert.ok(mitte > 0 && mitte < 120);                // fließender Übergang
  assert.equal(naheAnzeigeVerz(60, 5), 0);            // schon unter 80 ms: nichts
  assert.ok(new NetzPuffer().verz > 0);
});
