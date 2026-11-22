// Untätige Spieler (AFK): nach 60 s ohne Eingabe übernimmt die Bot-Steuerung, die nächste echte Eingabe holt die Figur zurück
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 5000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(25); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });
const alteEinst = SpielRaum.einstellungen;

test('AFK: Bot übernimmt, folgt dem Mitspieler, zählt als Mensch, echte Eingabe holt zurück', async () => {
  const neu = name => new Client(URL_).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const a = await neu('Schlafmuetze'), b = await neu('Wach');
  const raum = matchMaker.getLocalRoomById(a.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.aktiv = null; raum.welle.ansage = null; raum.welle.uhr = null;
    assert.equal(raum.afkSekunden ?? 60, 60, 'Vorgabe 60 s');
    raum.afkSekunden = 0.6;
    const pa = raum.state.spieler.get(a.sessionId), pb = raum.state.spieler.get(b.sessionId), xa = raum.extra.get(a.sessionId), xb = raum.extra.get(b.sessionId);
    pa.unten = pb.unten = false;
    // B wach (Eingabe wird laufend „berührt“), A bekommt nichts mehr
    const wach = setInterval(() => { xb.letzteEingabe = Date.now(); }, 100);
    assert.equal(pa.afk, false);
    // Standmeldungen des Clients (dx = dy = 0) zählen nicht als Eingabe
    a.send('eingabe', { dx: 0, dy: 0, s: false });
    assert.ok(await bis(() => pa.afk === true), 'Bot hat nicht übernommen');
    assert.ok(xa.afkBot && !xa.bot, 'afkBot gesetzt, kein echter Bot');
    assert.equal(pb.afk, false);
    // A weit hinter B setzen: der Bot geht zu B
    const d0 = () => Math.hypot(pa.x - pb.x, pa.y - pb.y);
    pa.x = pb.x + 260; pa.y = pb.y; pa.ebene = pb.ebene;
    const start = d0();
    assert.ok(await bis(() => d0() < start - 80, 6000), `Bot folgt nicht (${start} → ${d0()})`);
    // Bot-Füllung: AFK-Spieler zählt als Mensch (2 Menschen, bots = 3 → 2 Bots)
    SpielRaum.einstellungen = { ...alteEinst, bots: 3 };
    raum.botsAnpassen();
    assert.equal([...raum.extra.values()].filter(x => x.bot).length, 2);
    SpielRaum.einstellungen = { ...alteEinst, bots: 0 };
    raum.botsAnpassen();
    assert.equal([...raum.extra.values()].filter(x => x.bot).length, 0);
    // echte Bewegung: sofort zurück
    a.send('eingabe', { dx: 1, dy: 0, s: false });
    assert.ok(await bis(() => pa.afk === false && !xa.afkBot), 'Spieler hat die Figur nicht zurück');
    a.send('eingabe', { dx: 0, dy: 0, s: false });
    clearInterval(wach);
  } finally { SpielRaum.einstellungen = alteEinst; await a.leave(); await b.leave(); }
});

test('AFK: Aktion (Chat) zählt als Eingabe, getrennte Spieler werden nicht übernommen', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Chatter', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(a.roomId);
  try {
    raum.afkSekunden = 0.5;
    const pa = raum.state.spieler.get(a.sessionId);
    assert.ok(await bis(() => pa.afk === true), 'Bot hat nicht übernommen');
    a.send('chat', { text: 'hallo' });
    assert.ok(await bis(() => pa.afk === false), 'Chat hat die Figur nicht zurückgegeben');
    // Verbindung weg: kein Bot, Figur steht still
    pa.afk = false;
    raum.extra.get(a.sessionId).letzteEingabe = 0; pa.verbunden = false;
    await warte(300);
    assert.equal(pa.afk, false); assert.ok(!raum.extra.get(a.sessionId).afkBot);
    pa.verbunden = true;
  } finally { await a.leave(); }
});
