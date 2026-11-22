// Dauerfeuer: Lärm darf Zombies nicht ständig neu verzögern oder umlenken
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
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
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Feuer', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {}; raum.kriecherChance = 0;
    const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
    p.waffe = ''; p.munition = 0; x.pause = 1e6; x.schonT = 0;
    await fn({ raum, p, x, sid: c.sessionId });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
}

test('Dauerfeuer: Horde kommt stetig näher, kaum Stehzeiten', async () => {
  await beitreten(async ({ raum, p }) => {
    p.hp = 100; p.schleicht = false;
    const Z = [];
    for (let i = 0; i < 30; i++) {
      const id = raum.setzeZombie(p.x + 240 + (i % 5) * 6, p.y - 60 + i * 4, '');
      const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
      info.steht = false; info.schlaeft = false; z.kriecht = false; z.richtung = Math.PI;
      Z.push({ id, z, info, steh: 0, maxSteh: 0, bewegt: false, x0: z.x, y0: z.y });
    }
    const abst = () => Z.reduce((s, q) => s + Math.hypot(q.z.x - p.x, q.z.y - p.y), 0) / Z.length;
    const a0 = abst();
    let t = 0, naechster = 0;
    for (let k = 0; k < 200; k++) {
      t += 0.05; raum.uhr = t;
      if (t >= naechster) { raum.laerm(p.x, p.y, 600, true, ''); naechster += 0.3; }
      for (const q of Z) {
        const vx = q.z.x, vy = q.z.y;
        raum.zombieSchritt(q.id, q.z, 0.05);
        if (t > 2.2 && Math.hypot(q.z.x - p.x, q.z.y - p.y) > 40 && Math.hypot(q.z.x - vx, q.z.y - vy) < 0.2) { q.steh += 0.05; q.maxSteh = Math.max(q.maxSteh, q.steh); } else q.steh = 0;
      }
    }
    const a1 = abst();
    for (const q of Z) q.bewegt = Math.hypot(q.z.x - q.x0, q.z.y - q.y0) > 60;   // eingeklemmte (Hindernis) zählen nicht
    assert.ok(a0 - a1 >= 100, `kaum näher: ${a0.toFixed(0)} -> ${a1.toFixed(0)}`);
    const lang = Z.filter(q => q.bewegt && q.maxSteh > 1.3).length;
    assert.ok(lang <= 2, 'zu viele lange Stehzeiten: ' + lang);
  });
});

test('Einzelner jagender Zombie unter Beschuss steht nicht', async () => {
  await beitreten(async ({ raum, p, sid }) => {
    p.hp = 100;
    const id = raum.setzeZombie(p.x + 200, p.y, '');
    const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
    info.ziel = sid; info.schlaeft = false; info.steht = false; z.kriecht = false; info.reakT = 0;
    let t = 0, naechster = 0, steh = 0, maxSteh = 0;
    const d0 = Math.hypot(z.x - p.x, z.y - p.y);
    for (let k = 0; k < 60; k++) {
      t += 0.05; raum.uhr = t;
      if (t >= naechster) { raum.laerm(p.x, p.y, 600, true, ''); naechster += 0.3; }
      const vx = z.x, vy = z.y;
      raum.zombieSchritt(id, z, 0.05);
      if (Math.hypot(z.x - p.x, z.y - p.y) > 40 && Math.hypot(z.x - vx, z.y - vy) < 0.2) { steh += 0.05; maxSteh = Math.max(maxSteh, steh); } else steh = 0;
    }
    assert.ok(Math.hypot(z.x - p.x, z.y - p.y) < d0 - 40, 'kommt nicht näher');
    assert.ok(maxSteh <= 0.4, 'steht zu lange: ' + maxSteh);
  });
});
