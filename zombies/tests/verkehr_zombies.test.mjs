// Fahrende Fahrzeuge töten Zombies (schnell) oder schleudern sie weg (langsam); viele Treffer lassen das Fahrzeug steckenbleiben
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

let server;
const PORT = await freierPort();
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function aufbau() {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'T', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  for (const id of [...raum.state.fahrzeuge.keys()]) { raum.state.fahrzeuge.delete(id); raum.verkehr.info.delete(id); }
  for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  const ereignisse = [];
  const alt = raum.broadcast.bind(raum);
  raum.broadcast = (typ, m, ...r) => { ereignisse.push([typ, m]); return alt(typ, m, ...r); };
  const n = raum.verkehr.graph.knoten.find(k => k.nach.length), ziel = n.nach[0].ziel;
  const id = raum.verkehr.neu('auto', n), f = raum.state.fahrzeuge.get(id), inf = raum.verkehr.info.get(id);
  f.richtung = Math.atan2(ziel.y - n.y, ziel.x - n.x);
  inf.weg = [{ x: n.x, y: n.y }, { x: ziel.x, y: ziel.y }];
  return { c, raum, id, f, inf, ereignisse };
}
const vor = (f, d, q = 0) => ({ x: f.x + Math.cos(f.richtung) * d - Math.sin(f.richtung) * q, y: f.y + Math.sin(f.richtung) * d + Math.cos(f.richtung) * q });

test('schnelles Auto tötet den Zombie, kein XP, kein Kill', async () => {
  const { c, raum, id, f, inf, ereignisse } = await aufbau();
  const p = vor(f, 4), zid = raum.setzeZombie(p.x, p.y), besiegt = raum.state.besiegt;
  raum.zRaster = null;
  raum.verkehr.zombiesUeberfahren(id, f, inf, 100, 0.05);
  assert.ok(!raum.state.zombies.has(zid));
  assert.equal(raum.state.besiegt, besiegt);
  assert.ok(ereignisse.some(([t, m]) => t === 'aufprall' && m.tot && m.id === id));
  const weg = ereignisse.find(([t]) => t === 'weg');
  assert.ok(weg && !weg[1].von);
  assert.ok(inf.treffer.mal < 1);
  await c.leave();
});

test('langsames Auto schleudert seitlich und schadet nach Tempo', async () => {
  const { c, raum, id, f, inf } = await aufbau();
  const p = vor(f, 2, 3), zid = raum.setzeZombie(p.x, p.y), z = raum.state.zombies.get(zid), hp0 = z.hp;
  raum.zRaster = null;
  raum.verkehr.zombiesUeberfahren(id, f, inf, 44.4, 0.05);
  assert.ok(raum.state.zombies.has(zid));
  assert.ok(Math.abs(hp0 - z.hp - hp0 * 0.6) < 1.5, `hp ${z.hp}`);
  const quer = -(z.x - f.x) * Math.sin(f.richtung) + (z.y - f.y) * Math.cos(f.richtung);
  assert.ok(quer > 8, `quer ${quer}`);
  await c.leave();
});

test('6 Treffer in kurzer Zeit: Fahrzeug bleibt stecken (Unfall)', async () => {
  const { c, raum, id, f, inf } = await aufbau();
  for (let i = 0; i < 6; i++) {
    const p = vor(f, 3 + i * 0.1); raum.setzeZombie(p.x, p.y); raum.zRaster = null;
    raum.verkehr.zombiesUeberfahren(id, f, inf, 100, 0.5);
  }
  assert.equal(f.art, 'wrack');
  assert.ok(raum.verkehr.unfaelle.liste.has(id));
  await c.leave();
});

test('Fahrzeug im Schritt: Zombie am Weg wird überfahren', async () => {
  const { c, raum, id, f } = await aufbau();
  const p = vor(f, 30), zid = raum.setzeZombie(p.x, p.y);
  for (let i = 0; i < 40; i++) { raum.zRaster = null; raum.verkehr.schritt(0.05); }
  assert.ok(!raum.state.zombies.has(zid) || raum.state.zombies.get(zid).hp < 100);
  assert.ok(raum.state.fahrzeuge.get(id).x !== p.x);
  await c.leave();
});
