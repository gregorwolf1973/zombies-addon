// Sprachübertragung, Serverseite: Signalisierung, Teilnehmerliste, Sprechanzeige, „Reden lockt“
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';

const PORT = 26100 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
// Handler eintragen und dann die Sprach-Angaben anfordern (Nachrichten aus onJoin könnten vor dem Handler ankommen)
function lausche(c) {
  const s = { rtc: [], partner: [], start: [], einst: [] };
  c.onMessage('rtc', m => s.rtc.push(m));
  c.onMessage('sprachPartner', m => s.partner.push(m));
  c.onMessage('sprachStart', m => s.start.push(m));
  c.onMessage('spracheEinst', m => s.einst.push(m));
  return s;
}

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf', turn_server: 'turn:t.example:3478', turn_username: 'u', turn_password: 'p' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Sprache: rtc nur an das Ziel, Teilnehmerliste ohne Bots, sprachStart mit ICE', async () => {
  SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: 5 };
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Vroni' });
  const c = await new Client(URL_).joinOrCreate('zombies', { name: 'Hias' });
  const sa = lausche(a), sb = lausche(b), sc = lausche(c);
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.botsAnpassen();
    a.send('sprachBereit'); b.send('sprachBereit'); c.send('sprachBereit');
    assert.ok(await bis(() => sa.start.length && sb.start.length && sc.start.length), 'sprachStart fehlt');
    assert.deepEqual(sa.start[0].ice, [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:t.example:3478', username: 'u', credential: 'p' }]);
    assert.equal(sa.start[0].einst.an, true);
    assert.equal(sa.start[0].einst.hoerweite, 40);
    // Teilnehmerliste: genau die drei Menschen
    assert.ok(await bis(() => sa.partner.at(-1)?.ids.length === 3));
    assert.deepEqual([...sa.partner.at(-1).ids].sort(), [a.sessionId, b.sessionId, c.sessionId].sort());
    assert.ok([...raum.extra.values()].some(x => x.bot), 'Test braucht Bots');

    // rtc geht nur an das Ziel, mit richtigem Absender
    a.send('rtc', { an: b.sessionId, daten: { sdp: 'angebot' } });
    assert.ok(await bis(() => sb.rtc.length === 1), 'rtc kam nicht an');
    assert.deepEqual(sb.rtc[0], { von: a.sessionId, daten: { sdp: 'angebot' } });
    await warte(150);
    assert.equal(sc.rtc.length, 0); assert.equal(sa.rtc.length, 0);

    // nie an Bots, an Unbekannte, an sich selbst; zu große Nachrichten fallen weg
    const botId = [...raum.extra.entries()].find(([, x]) => x.bot)[0];
    let botBekam = false;
    const orig = raum.clients.find.bind(raum.clients);
    raum.clients.find = f => { const r = orig(f); if (r?.sessionId === botId) botBekam = true; return r; };
    a.send('rtc', { an: botId, daten: { x: 1 } });
    a.send('rtc', { an: 'gibtsnicht', daten: { x: 1 } });
    a.send('rtc', { an: a.sessionId, daten: { x: 1 } });
    a.send('rtc', { an: b.sessionId, daten: { gross: 'x'.repeat(21000) } });
    await warte(250);
    raum.clients.find = orig;
    assert.equal(botBekam, false);
    assert.equal(sb.rtc.length, 1); assert.equal(sa.rtc.length, 0);

    // Antwort in die Gegenrichtung
    b.send('rtc', { an: a.sessionId, daten: { ice: 1 } });
    assert.ok(await bis(() => sa.rtc.length === 1));
    assert.equal(sa.rtc[0].von, b.sessionId);

    // Verlassen: Liste ohne den Gegangenen
    await c.leave();
    assert.ok(await bis(() => sa.partner.at(-1)?.ids.length === 2 && !sa.partner.at(-1).ids.includes(c.sessionId)), 'Liste nach Verlassen');
  } finally { await a.leave(); await b.leave(); SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: 0 }; }
});

test('Sprache: spricht wird gesetzt (höchstens 4× pro Sekunde), Reden lockt Lärm nur mit Einstellung', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Vroni' });
  const sb = lausche(b);
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    a.send('spricht', { an: true });
    assert.ok(await bis(() => p.spricht === true && b.state.spieler.get(a.sessionId)?.spricht === true), 'spricht kam nicht an');

    // schnelles Hin und Her: Endzustand stimmt trotzdem, aber nicht jeder Wechsel kommt durch
    let wechsel = 0;
    let stand = p.spricht;
    const zaehler = setInterval(() => { if (p.spricht !== stand) { wechsel++; stand = p.spricht; } }, 5);
    for (let i = 0; i < 10; i++) a.send('spricht', { an: i % 2 === 1 });   // endet mit true
    await warte(1200);
    clearInterval(zaehler);
    assert.ok(wechsel <= 5, 'zu viele Wechsel: ' + wechsel);
    assert.equal(p.spricht, true, 'Endzustand geht nicht verloren');

    // Lärm: ohne redenLockt keiner, mit redenLockt etwa alle 0,5 s
    const aufrufe = [];
    const laerm0 = raum.laerm.bind(raum);
    raum.laerm = (x, y, w, d, e) => { aufrufe.push({ x, y, w, d, e }); return laerm0(x, y, w, d, e); };
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: { an: true, hoerweite: 40, stockwerk: 0.35, drinnenDraussen: 0.1, funk: 0.7, redenLockt: false } };
    p.x = 5000; p.y = 5000;   // weit weg von allem, damit nur Reden zählt
    await warte(900);
    assert.equal(aufrufe.filter(l => l.x === 5000).length, 0, 'Lärm ohne Einstellung');
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: { ...SpielRaum.einstellungen.sprache, redenLockt: true } };
    raum.einstellungenGeaendert();
    assert.ok(await bis(() => sb.einst.length > 0 && sb.einst.at(-1).einst.redenLockt === true), 'spracheEinst fehlt');
    await warte(1300);
    const reden = aufrufe.filter(l => l.x === 5000 && l.y === 5000);
    assert.ok(reden.length >= 2 && reden.length <= 4, 'Lärmaufrufe: ' + reden.length);
    assert.equal(reden[0].w, 200); assert.equal(reden[0].d, false); assert.equal(reden[0].e, p.ebene);

    // Sprache aus: niemand spricht mehr, rtc wird nicht mehr weitergeleitet
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: { ...SpielRaum.einstellungen.sprache, an: false } };
    raum.einstellungenGeaendert();
    assert.ok(await bis(() => p.spricht === false));
    const vorher = sb.rtc.length;
    a.send('rtc', { an: b.sessionId, daten: { x: 1 } });
    await warte(200);
    assert.equal(sb.rtc.length, vorher);
  } finally {
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: undefined };
    await a.leave(); await b.leave();
  }
});

test('Sprache: Spieler mit Funkgerät – Gegenstand existiert und ist auffindbar', async () => {
  const { DINGE, BEUTE } = await import('../client/welt.mjs');
  assert.equal(DINGE.funkgeraet.name, 'Funkgerät');
  assert.equal(DINGE.funkgeraet.zeichen, '📻');
  const orte = Object.entries(BEUTE).filter(([, t]) => t.includes('funkgeraet')).map(([k]) => k);
  for (const soll of ['spind', 'schrank', 'auto', 'laden_kaufhaus']) assert.ok(orte.includes(soll), soll);
});
