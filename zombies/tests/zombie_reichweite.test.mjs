// Zombie geht bis zur Berührung heran (Biss und Nahkampf in Reichweite)
import { test, before, after } from 'node:test';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import assert from 'node:assert/strict';
import { freierPort } from './hilfe.mjs';
import { frei } from '../client/welt.mjs';
const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });
// 0.84.1: Mit 15 km/h blieb der Zombie genau an der Grenze (19 px) stehen – Messer (18) traf nicht, Biss (20) nur knapp
for (const waffe of ['messer']) test('Jagender Zombie kommt in Reichweite: beißt den stehenden Spieler und das Messer trifft wiederholt (' + waffe + ')', async () => {
  const a = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'D' + waffe });
  a.onMessage('*', () => {});
  const raum = matchMaker.getLocalRoomById(a.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0; raum.welle && (raum.welle.schritt = () => {});
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
  let ort; for (let y = 300; y < 1400 && !ort; y += 24) for (let xx = 300; xx < 1400 && !ort; xx += 24) if (frei(raum.welt, xx, y, 60)) ort = { x: xx, y };
  p.x = ort.x; p.y = ort.y; p.ebene = ''; p.hp = 100; p.waffe = waffe; p.wp0 = waffe; p.wp1 = ''; p.wplatz = 0; p.faust = !waffe; x.pause = 0; x.schonT = 0; x.verz = 300;   // Anzeigeverzögerung wie im echten Spiel (Lag-Kompensation beim Biss)
  const zid = raum.setzeZombie(p.x + 60, p.y, ''); const z = raum.state.zombies.get(zid); z.hp = 1000;
  const i = raum.zombieInfo.get(zid); i.schlaeft = false; i.steht = false; i.ziel = a.sessionId; i.verloren = 0; i.wechsel = 1e6;
  let schlaege = 0, hpZ = z.hp; const ds = [];
  for (let t = 0; t < 200; t++) { raum.schritt(0.05); if (z.hp < hpZ) { schlaege++; hpZ = z.hp; } if (t % 20 === 0) ds.push(Math.round(Math.hypot(z.x - p.x, z.y - p.y))); p.x = ort.x; p.y = ort.y; }
  assert.ok(p.hp < 50, `Zombie beißt nicht: Spieler-HP ${p.hp.toFixed(1)}, Abstände ${ds.join(' ')}`);
  assert.ok(schlaege >= 8, `Messer trifft nur ${schlaege}× in 10 s, Abstände ${ds.join(' ')}`);
  await a.leave();
});
