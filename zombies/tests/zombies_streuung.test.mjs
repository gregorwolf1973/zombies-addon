// Zombies laufen nicht synchron: Reaktionsverzug, Tempo-Streuung, Schlängeln; Netzpuffer klingt weich aus
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { NetzPuffer } from '../client/netzpuffer.mjs';

const PORT = 28700 + Math.floor(Math.random() * 90);
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(b, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (b()) return true; await warte(20); } return b(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(fn) {
  assert.ok(await bis(() => !SpielRaum.aktiv, 5000));
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Streu', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {}; raum.kriecherChance = 0;
    const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
    p.waffe = ''; p.munition = 0; x.pause = 1e6; x.schonT = 0;
    await fn({ raum, p, x, sid: c.sessionId });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
}

test('16 Zombies entdecken gleichzeitig: Startzeiten, Tempo und Kurs streuen', async () => {
  await beitreten(async ({ raum, p }) => {
    p.hp = 100; p.schleicht = false;
    const Z = [];
    for (let i = 0; i < 16; i++) {
      const id = raum.setzeZombie(p.x + 100, p.y - 60 + i * 8, '');
      const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
      info.steht = false; info.schlaeft = false; z.kriecht = false; z.richtung = Math.PI;
      Z.push({ id, z, info, start: null, kurs: [] });
    }
    const spanneVon = a => { const m = a.reduce((u, v) => u + v) / a.length; return (Math.max(...a) - Math.min(...a)) / m; };
    assert.ok(spanneVon(Z.map(q => q.info.tempo)) >= 0.15, 'Tempo-Streuung zu klein');
    let t = 0;
    for (let k = 0; k < 40; k++) {
      t += 0.05; raum.uhr = t;
      for (const q of Z) {
        const vx = q.z.x, vy = q.z.y;
        raum.zombieSchritt(q.id, q.z, 0.05);
        const bew = Math.hypot(q.z.x - vx, q.z.y - vy) > 0.2;
        if (q.start === null && bew) q.start = t;
        if (bew) q.kurs.push(Math.atan2(q.z.y - vy, q.z.x - vx));
      }
    }
    const starts = Z.filter(q => q.start !== null).map(q => q.start);
    assert.ok(starts.length >= 12, 'zu wenige gestartet: ' + starts.length);
    assert.ok(Math.max(...starts) - Math.min(...starts) >= 0.3, 'Startzeiten-Spanne zu klein');
    const schlaengelnd = Z.filter(q => q.kurs.length > 5 && Math.max(...q.kurs) - Math.min(...q.kurs) > 0.15).length;
    assert.ok(schlaengelnd >= 8, 'Kurs schlängelt kaum: ' + schlaengelnd);
  });
});

test('Netzpuffer: Hochrechnung klingt weich aus', () => {
  const pf = new NetzPuffer(), o = {};
  pf.merke('a', 0, 0, 1000); pf.merke('a', 10, 0, 1100);
  const xs = [1100, 1150, 1200, 1300, 1350, 1500, 1700].map(t => { pf.pos('a', t, o); return o.x; });
  assert.ok(xs[1] > xs[0] && xs[2] > xs[1] && xs[3] > xs[2], 'rechnet weiter');
  assert.ok(xs[4] - xs[3] < (xs[1] - xs[0]), 'wird langsamer');
  assert.ok(xs[6] >= xs[5], 'läuft nicht zurück');
});
