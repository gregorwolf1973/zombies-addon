// Soldaten rufen „Halt!“, wenn sich ein Spieler dem Lager nähert – je Spieler genau einmal je Abklingzeit
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { EREIGNISSE } from '../server/einstellungen.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { rahmen } from '../client/stuetzpunkt.mjs';

const PORT = 28200 + Math.floor(Math.random() * 9);
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('soldatRuf ist ein Ereignis der Tonliste', () => {
  assert.ok(EREIGNISSE.some(e => e.id === 'soldatRuf' && e.gruppe === 'bundeswehr'));
});

test('Ruf bei Annäherung genau einmal je Abklingzeit', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Ruf', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.welle.schritt = () => {};
  const st = raum.stuetzpunkt, sp = raum.welt.stuetzpunkt, p = raum.state.spieler.get(c.sessionId);
  const rufe = []; const alt = raum.broadcast.bind(raum);
  raum.broadcast = (art, m, ...r) => { if (art === 'soldatRuf') rufe.push(m); return alt(art, m, ...r); };
  const [x, y] = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(15, -2);   // 2 Kacheln vor dem Zaun
  p.x = x; p.y = y; p.verbunden = true;
  st.soldatRufen(0.25);
  assert.equal(rufe.length, 1);
  assert.ok(st.schuetzen.some(q => q.n === rufe[0].n && !q.tot));
  for (let i = 0; i < 160; i++) st.soldatRufen(0.25);   // 40 s: noch Abklingzeit
  assert.equal(rufe.length, 1);
  for (let i = 0; i < 100; i++) st.soldatRufen(0.25);   // über 65 s: wieder ein Ruf
  assert.equal(rufe.length, 2);
  p.unten = true; for (let i = 0; i < 400; i++) st.soldatRufen(0.25);   // am Boden: kein Ruf
  assert.equal(rufe.length, 2);
  await c.leave();
});
