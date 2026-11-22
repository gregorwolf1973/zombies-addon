// Drehzone des Laufsticks (client/stick.mjs) und Blickrichtung im Stand (Server-Meldung 'blick')
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { STICK_TOT, STICK_WEG, stickWert } from '../client/stick.mjs';
import { frei, WERTE as W } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

test('Stick: Drehzone dreht nur, danach Laufen, Schleichbereich so breit wie vorher', () => {
  assert.deepEqual(stickWert(2, 1).winkel, null);                         // Zittern beim Aufsetzen
  const d = stickWert(0, STICK_TOT - 1);
  assert.ok(d.dreht && !d.laeuft && d.vx === 0 && d.vy === 0);
  assert.ok(Math.abs(d.winkel - Math.PI / 2) < 1e-9);
  const g = stickWert(STICK_TOT + STICK_WEG * 0.3, 0);
  assert.ok(g.laeuft && !g.dreht && Math.abs(g.vx - 0.3) < 1e-9);        // Schleichen (< 0,55)
  const v = stickWert(-500, 0);
  assert.ok(v.vx === -1 && v.kx === -(STICK_TOT + STICK_WEG));              // voll, Knopf am Rand
});

const PORT = await freierPort();
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(b, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (b()) return true; await warte(20); } return b(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Blick im Stand: gilt erst nach den älteren Laufstücken, Laufen überschreibt ihn', async () => {
  const a = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Blick' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId)));
    const p = raum.state.spieler.get(a.sessionId);
    let ort = null;
    for (let y = 200; y < 1400 && !ort; y += 24) for (let x = 200; x < 1400 && !ort; x += 24) if (frei(raum.welt, x, y, W.spielerRadius + 30)) ort = { x, y };
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    p.x = ort.x; p.y = ort.y; p.ebene = ''; p.zombie = 0; p.unten = false; p.waffe = ''; p.rucksack.clear();
    await warte(100);
    // Laufstück nach rechts (Nr. 1) und gleich danach Blick nach unten (64 = 90°) bezogen auf Nr. 1
    a.send('eingabe', { dx: 1, dy: 0, s: false, n: 1, d: 0.2 });
    a.send('blick', [64, 1]);
    assert.ok(await bis(() => p.seq === 1));
    assert.ok(await bis(() => Math.abs(p.richtung - Math.PI / 2) < 0.01), 'Blick nicht übernommen: ' + p.richtung);
    // Blick bezogen auf eine noch nicht abgearbeitete Nummer wartet
    a.send('blick', [128, 2]);
    await warte(200);
    assert.ok(Math.abs(p.richtung - Math.PI / 2) < 0.01, 'Blick zu früh übernommen');
    a.send('eingabe', { dx: 0, dy: 0, s: false, n: 2, d: 0.05 });
    assert.ok(await bis(() => Math.abs(p.richtung - Math.PI) < 0.01), 'wartender Blick nicht übernommen');
    // Unsinn wird ignoriert
    a.send('blick', [999, 2]); a.send('blick', 'x');
    await warte(150);
    assert.ok(Math.abs(p.richtung - Math.PI) < 0.01);
  } finally { await a.leave(); }
});
