// Sichtfilter (Zombies mind. 720 px, Autos mit Radio mind. 480 px, unabhängig vom Bildschirm); Ton-Tests: tests/radio_schalter.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { Fahrzeug } from '../server/verkehr.mjs';

const echtesTimeout = globalThis.setTimeout;
const warte = ms => new Promise(r => echtesTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}

// ---- Server: Sichtfilter ----
let server;
const PORT = 27500 + Math.floor(Math.random() * 200);
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Sichtfilter: Zombies mind. 720 px, Radio-Autos mind. 480 px, andere Autos nur im Bildausschnitt', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Radio' });
  c.onMessage('*', () => {});
  const raum = matchMaker.getLocalRoomById(c.roomId);
  assert.ok(await bis(() => raum.state.spieler.get(c.sessionId) && c.state?.fahrzeuge));
  const p = raum.state.spieler.get(c.sessionId);
  try {
    raum.verkehr = null; raum.state.fahrzeuge.clear(); raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.zombiesAuffuellen = () => {};
    p.x = 1500; p.y = 1500; p.ebene = '';
    c.send('sicht', { w: 200, h: 100 });   // winziger Bildschirm: Bildausschnitt + 260 = 460 x 410
    await warte(150);
    const mach = (id, x, y) => { const f = new Fahrzeug(); f.x = x; f.y = y; f.art = 'auto'; f.haelt = true; raum.state.fahrzeuge.set(id, f); };
    mach('auto3', 1500 + 300, 1500 + 450);   // Radio, in 480 px Kasten, aber außerhalb des Bildes (y > 410)
    mach('auto4', 1500 + 100, 1500 + 450);   // kein Radio, außerhalb des Bildes: fehlt
    mach('auto6', 1500 + 600, 1500);         // Radio, aber 600 px weg: fehlt
    const nahZ = raum.setzeZombie(1500 + 700, 1500, ''), fernZ = raum.setzeZombie(1500 + 800, 1500, '');
    for (const id of [nahZ, fernZ]) { const i = raum.zombieInfo.get(id); i.schlaeft = true; i.steht = true; }
    assert.ok(await bis(() => c.state.zombies.has(nahZ)), 'Zombie bei 700 px fehlt trotz kleinem Bildschirm');
    assert.ok(await bis(() => c.state.fahrzeuge.has('auto3')), 'Radio-Auto außerhalb des Bildes fehlt');
    await warte(300);
    assert.ok(!c.state.zombies.has(fernZ), 'Zombie bei 800 px wurde geschickt');
    assert.ok(!c.state.fahrzeuge.has('auto4'), 'Auto ohne Radio außerhalb des Bildes wurde geschickt');
    assert.ok(!c.state.fahrzeuge.has('auto6'), 'Radio-Auto 600 px entfernt wurde geschickt');
  } finally { await c.leave(); }
});
