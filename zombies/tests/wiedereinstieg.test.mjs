import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';

const PORT = 25900 + Math.floor(Math.random() * 90);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Erwischt zählt nur echte Spieler (Bot steht noch); alle wachen im selben Team-Safe auf', async () => {
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 2 };
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Toni' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Resi' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.botsAnpassen();
    const bots = [...raum.state.spieler].filter(([sid]) => raum.extra.get(sid)?.bot);
    assert.ok(bots.length >= 1, 'kein Bot');
    const ziel = raum.welt.safeRooms[raum.welt.safeRooms.length - 1];
    raum.teamSafe = ziel.id;
    for (const sid of [a.sessionId, b.sessionId]) { const p = raum.state.spieler.get(sid); p.unten = true; p.hp = 0; }
    assert.ok(await bis(() => raum.state.phase === 'erwischt'), 'trotz stehendem Bot nicht erwischt');
    assert.ok(await bis(() => raum.state.phase === 'spiel', 9000), 'kein Aufwachen');
    const rs = [...raum.state.spieler.values()];
    assert.ok(rs.every(p => !p.unten && p.hp === 100));
    assert.equal(new Set(rs.map(p => p.ebene)).size, 1, 'nicht alle auf derselben Ebene');
    assert.equal(rs[0].ebene, ziel.ebene);
  } finally {
    SpielRaum.einstellungen = alt;
    await a.leave(); await b.leave();
  }
});

test('teamSafe merkt das zuletzt von einem echten Spieler betretene Safe', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Solo' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const p = raum.state.spieler.get(a.sessionId);
    const safe = raum.welt.safeRooms[raum.welt.safeRooms.length - 1];
    const pos = raum.safePlatz(safe);
    p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
    assert.ok(await bis(() => raum.teamSafe === safe.id), 'teamSafe nicht gemerkt');
  } finally { await a.leave(); }
});
