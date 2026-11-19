import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { sauberName } from '../server/raum.mjs';

const PORT = 25670 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Namen werden bereinigt', () => {
  assert.equal(sauberName('  Sepp<script>  '), 'Seppscript');
  assert.equal(sauberName(''), 'Unbekannt');
  assert.equal(sauberName('Ägidius Müller-Lüdenscheidt'), 'Ägidius Müller-L');
});

test('Spieldateien werden ausgeliefert', async () => {
  for (const pfad of ['/', '/spiel.mjs', '/welt.mjs', '/vendor/phaser.min.js', '/vendor/colyseus.js', '/gesund']) {
    const r = await fetch(URL_ + pfad);
    assert.equal(r.status, 200, pfad);
  }
});

test('zwei Spieler landen im selben Raum und sehen sich', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Vroni' });
  try {
    assert.equal(a.roomId, b.roomId);
    assert.ok(await bis(() => a.state.spieler?.size === 2 && b.state.spieler?.size === 2), 'Spieler fehlen');
    const namen = [...b.state.spieler.values()].map(p => p.name).sort();
    assert.deepEqual(namen, ['Sepp', 'Vroni']);
    // bei 2 Spielern ist genau einer bewaffnet
    const bewaffnet = [...a.state.spieler.values()].filter(p => p.waffe === 'pistole');
    assert.equal(bewaffnet.length, 1);
    assert.ok(a.state.seed > 0 && a.state.seed === b.state.seed);
    // Zombies erscheinen
    assert.ok(await bis(() => a.state.zombies.size > 0), 'keine Zombies');

    // Sepp läuft nach rechts – Vroni sieht die Bewegung
    const x0 = b.state.spieler.get(a.sessionId).x;
    a.send('eingabe', { dx: 1, dy: 0, s: false });
    assert.ok(await bis(() => b.state.spieler.get(a.sessionId).x > x0 + 20), 'Bewegung kam nicht an');
    a.send('eingabe', { dx: 0, dy: 0, s: false });

    // Schleichen: langsamer
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    a.send('eingabe', { dx: 0, dy: 1, s: true });
    assert.ok(await bis(() => p.schleicht === true));
    a.send('eingabe', { dx: 0, dy: 0, s: false });
  } finally {
    await a.leave(); await b.leave();
  }
});

test('Aufhelfen: stehen bleiben bringt den Mitspieler wieder hoch', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Hans' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Resi' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0;             // keine Störung durch Zombies
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const hans = raum.state.spieler.get(a.sessionId), resi = raum.state.spieler.get(b.sessionId);
    hans.unten = true; hans.hp = 0; hans.hilfe = 0;
    resi.x = hans.x + 20; resi.y = hans.y;
    resi.rucksack.push('verband');
    b.send('eingabe', { dx: 0, dy: 0, s: false });
    assert.ok(await bis(() => hans.hilfe > 0.2, 2000), 'Hilfe beginnt nicht');
    assert.ok(await bis(() => !hans.unten, 5000), 'Hans steht nicht auf');
    assert.equal(hans.hp, 70);
    assert.ok(!resi.rucksack.includes('verband'), 'Verbandskasten verbraucht');
    // b sieht das auch
    assert.ok(await bis(() => b.state.spieler.get(a.sessionId).unten === false));
  } finally {
    await a.leave(); await b.leave();
  }
});

test('alle am Boden → Erwischt, Aufwachen im Safe Room', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Toni' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const toni = raum.state.spieler.get(a.sessionId);
    toni.unten = true; toni.hp = 0;
    assert.ok(await bis(() => a.state.phase === 'erwischt'));
    assert.ok(await bis(() => a.state.phase === 'spiel', 8000), 'kein Aufwachen');
    assert.equal(toni.unten, false);
    assert.ok(toni.hp === 100 && toni.durst > 99.9 && toni.hunger > 99.9, 'volle Werte nach dem Aufwachen: ' + toni.hp);
    assert.ok(await bis(() => toni.sicher !== ''), 'nicht im Safe Room');
  } finally {
    await a.leave();
  }
});

test('Pistole trifft Zombie in Reichweite und verbraucht Munition', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Schütze' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.kriecherChance = 0;
    const p = raum.state.spieler.get(a.sessionId);
    assert.equal(p.waffe, 'pistole');
    const m0 = p.munition;
    raum.zombieFaktor = 0;
    raum.neuerZombie(0);
    const [id, z] = [...raum.state.zombies.entries()][0];
    z.x = p.x + 60; z.y = p.y;
    raum.zombieInfo.get(id).steht = true; raum.zombieInfo.get(id).wechsel = 99;
    assert.ok(await bis(() => !raum.state.zombies.has(id), 4000), 'Zombie überlebt');
    assert.equal(m0 - p.munition, 3, '3 Schuss für einen Zombie');
    assert.ok(await bis(() => a.state.besiegt === 1), 'Zähler kam nicht an');
  } finally {
    await a.leave();
  }
});

test('Einstellung zombieLeben und groesseGesamt gelten im Raum', async () => {
  const { SpielRaum } = await import('../server/raum.mjs');
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, zombieLeben: 250, groesseGesamt: 80 };
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Leben' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.setzeZombie(10, 10);
    assert.equal([...raum.state.zombies.values()][0].hp, 250);
    raum.tageszeitenUebernehmen();
    assert.equal(raum.state.groesseGesamt, 80);
  } finally {
    SpielRaum.einstellungen = vorher;
    await a.leave();
  }
});

test('Zugangscode: ohne Code abgewiesen, mit Code dabei, Ingress-Header von außen zählt nicht', async () => {
  const { SpielRaum } = await import('../server/raum.mjs');
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, zugangscode: 'Brezn' };
  try {
    await assert.rejects(new Client(URL_).joinOrCreate('zombies', { name: 'Fremder' }), /Zugangscode/);
    await assert.rejects(new Client(URL_).joinOrCreate('zombies', { name: 'Falsch', code: 'Weißwurst' }), /Zugangscode/);
    const mitHeader = new Client(URL_, { headers: { 'X-Ingress-Path': '/api/hassio_ingress/x' } });
    await assert.rejects(mitHeader.joinOrCreate('zombies', { name: 'Trickser' }), /Zugangscode/);
    const info = await (await fetch(URL_ + '/info', { headers: { 'X-Ingress-Path': '/x' } })).json();
    assert.equal(info.code, true);
    const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Freund', code: ' Brezn ' });
    assert.ok(a.sessionId);
    await a.leave();
  } finally {
    SpielRaum.einstellungen = vorher;
  }
});
