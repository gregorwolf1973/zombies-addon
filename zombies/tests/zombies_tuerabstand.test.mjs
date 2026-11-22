// Zombies erscheinen nicht nah an Haus-/Safe-Room-Türen (15 m), Wandernde meiden Haustüren (4 m)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, setzeKartengroesse, frei, T } from '../client/welt.mjs';

const PORT = 28900 + Math.floor(Math.random() * 90);
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(fn) {
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Tuerabstand', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {};
    raum.extra.get(c.sessionId).pause = 1e6;
    await fn(raum, raum.state.spieler.get(c.sessionId));
  } finally { await c.leave(); }
}

function tueren(raum) {
  const t = raum.welt.haeuser.filter(h => h.tuer).map(h => ({ x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL }));
  for (const s of raum.welt.safeRooms) t.push({ x: s.vorTuer.x, y: s.vorTuer.y });
  return t;
}

test('Spawn: Nachschub und Horde nie näher als 120 px an Türen, nie im Wasser', async () => {
  await beitreten(async (raum, p) => {
    const ts = tueren(raum);
    assert.ok(ts.length > 3);
    p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    for (let i = 0; i < 400; i++) raum.neuerZombie(0);
    assert.ok(raum.state.zombies.size > 20, 'zu wenige Zombies: ' + raum.state.zombies.size);
    for (const z of raum.state.zombies.values()) {
      assert.ok(ts.every(t => Math.hypot(t.x - z.x, t.y - z.y) >= 120), 'Zombie zu nah an einer Tür');
      assert.notEqual(raum.welt.hole(Math.floor(z.x / KACHEL), Math.floor(z.y / KACHEL)), T.WASSER, 'Zombie im Wasser');
    }
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const ids = raum.welle.erzeugen('west', 40) ?? [];
    for (const id of ids) {
      const z = raum.state.zombies.get(id);
      assert.ok(ts.every(t => Math.hypot(t.x - z.x, t.y - z.y) >= 120), 'Hordenzombie zu nah an einer Tür');
    }
  });
});

test('Wandernder Zombie dreht vor einer Haustür ab', async () => {
  await beitreten(async (raum, p) => {
    const h = raum.welt.haeuser.find(q => q.betretbar && q.tuer);
    const t = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL };
    // freien Startpunkt ~ 3,5 m von der Tür suchen, Zombie zielt direkt auf sie
    let s = null;
    for (let a = 0; a < 16 && !s; a++) { const x = t.x + Math.cos(a * 0.4) * 28, y = t.y + Math.sin(a * 0.4) * 28; if (frei(raum.welt, x, y, 11)) s = { x, y }; }
    assert.ok(s);
    p.x = s.x + 2000; p.y = s.y + 2000;   // Spieler weit weg
    const id = raum.setzeZombie(s.x, s.y, ''), z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
    info.schlaeft = false; info.steht = false; info.ziel = null; info.punkt = null; info.wechsel = 50; info.bleibt = true;
    z.richtung = Math.atan2(t.y - z.y, t.x - z.x);
    const d0 = Math.hypot(t.x - z.x, t.y - z.y);
    for (let i = 0; i < 20; i++) { raum.uhr = (raum.uhr ?? 0) + 0.1; raum.zombieSchritt(id, z, 0.1); info.wechsel = 50; }
    const d1 = Math.hypot(t.x - z.x, t.y - z.y);
    assert.ok(d1 > d0 - 1, `Wanderer läuft zur Tür: ${d0} → ${d1}`);
  });
});
