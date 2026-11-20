// Einsteigen in Evakuierungsfahrzeuge: wer an Bord ist, sitzt im Fahrzeug (Position folgt, Zombies lassen ihn in Ruhe), Meldung was fehlt,
// Aussteigen mit Meldung bei Abfahrt ohne Erfolg, Mitfahren bis zum Levelwechsel; Bots ebenso (server/aufgaben.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { BUS_ABSTAND } from '../client/welt.mjs';

const PORT = 28100 + Math.floor(Math.random() * 100);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-einsteigen-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

const busVon = raum => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');
// Raum mit gerufenem Evakuierungsbus; fn bekommt { c, raum, p, bus, id, meldungen, ag }
const mitBus = (aufgaben, fn, extra = {}) => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, ...extra };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Fahrgast', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const meldungen = []; c.onMessage('meldung', m => meldungen.push(m.text));
    const ag = raum.aufgaben;
    raum.state.aufgaben.clear(); for (const id of aufgaben) ag.neu(id, false); ag.aktualisieren(false);
    const p = raum.state.spieler.get(c.sessionId);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Bus');
    const [id, bus] = busVon(raum);
    assert.ok(await bis(() => raum.state.busSteht, 8000), 'Bus steht nicht');
    await fn({ c, raum, p, bus, id, meldungen, ag });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};

test('Einsteigen mit offenen Aufgaben: sitzt im Fahrzeug, Meldung nennt, was fehlt, Zombies und Eingabe ändern nichts', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus, meldungen, ag }) => {
  assert.equal(ag.fahrtGelingt(), false);
  p.ebene = ''; p.x = bus.x + BUS_ABSTAND - 10; p.y = bus.y;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => meldungen.some(m => m.includes('an Bord') && m.includes('es fehlt'))), 'Meldung „was fehlt“ fehlt: ' + meldungen.join(' | '));
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'Position folgt dem Fahrzeug nicht');
  assert.equal(raum.state.busBord, 1);
  // das Fahrzeug bewegt sich: der Fahrgast bleibt drin, auch ohne dass die Fahrt gelingt
  bus.x += 40; bus.y += 10;
  await warte(200);
  assert.ok(p.anBord && Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'folgt dem bewegten Fahrzeug nicht');
  // Eingabe wird ignoriert
  raum.extra.get([...raum.state.spieler.keys()][0]).eingabe = { dx: 1, dy: 0, s: false };
  await warte(300);
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'läuft aus dem Fahrzeug');
  // Zombies lassen ihn in Ruhe
  ag.evakTrefferChance = 0;   // der Bus schießt sonst den Zombie ab
  const hp = p.hp, zid = raum.setzeZombie(bus.x + 6, bus.y, ''); raum.zombieInfo.get(zid).steht = false;
  await warte(1500);
  assert.equal(p.hp, hp, 'Zombie beißt Fahrgast');
  assert.equal(raum.zombieInfo.get(zid).ziel, null, 'Zombie jagt Fahrgast');
}));

test('Abfahrt ohne Erfolg: Fahrgäste steigen mit Meldung aus (nichts wird still verworfen)', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus, meldungen, ag }) => {
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord));
  ag.busRest = 0.05;
  assert.ok(await bis(() => !p.anBord, 3000), 'steigt nicht aus');
  assert.ok(await bis(() => meldungen.some(m => m.includes('steigt') && m.includes('fehlte'))), 'Aussteig-Meldung fehlt: ' + meldungen.join(' | '));
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 150, 'steht nicht neben dem Fahrzeug');
}));

test('Abfahrt mit Erfolg: Fahrgast fährt mit dem abfahrenden Fahrzeug bis zum Levelwechsel, danach nicht mehr an Bord', mitBus(['funk'], async ({ raum, p, bus, id, ag }) => {
  assert.equal(ag.fahrtGelingt(), true);
  let gewechselt = false;
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  raum.weltNeuStarten = () => { gewechselt = true; };
  ag.wechselVerzoegerung = 200;
  assert.ok(await bis(() => p.anBord || ag.wechselLaeuft, 2000));
  assert.ok(await bis(() => ag.wechselLaeuft, 4000), 'keine Abfahrt');
  assert.ok(p.anBord, 'nicht mehr an Bord nach der Abfahrt');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
  assert.equal(p.anBord, false, 'anBord nach dem Levelwechsel nicht zurückgesetzt');
}));

test('Bots steigen ebenso ein und sitzen still', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus }) => {
  const bots = [...raum.state.spieler.entries()].filter(([sid]) => raum.extra.get(sid)?.bot);
  assert.ok(bots.length >= 1, 'keine Bots im Raum');
  const [, b] = bots[0];
  b.ebene = ''; b.x = bus.x + 20; b.y = bus.y;
  assert.ok(await bis(() => b.anBord), 'Bot steigt nicht ein');
  await warte(600);
  assert.ok(b.anBord && Math.hypot(b.x - bus.x, b.y - bus.y) < 1, 'Bot sitzt nicht still im Fahrzeug');
}, { bots: 2 }));
