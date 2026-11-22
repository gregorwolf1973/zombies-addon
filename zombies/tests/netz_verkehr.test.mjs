// Datenverkehr senken: WebSocket-Kompression, Fahrzeuge nur im Bildausschnitt (+ Evakuierungsfahrzeug immer), Kopierschwelle
// für Netzpositionen, ferne Zombies nur jeden 2. Patch, nahe Meldungen (b11/bwSoldaten), kompakte Eingabe
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte, WS_KOMPRESSION } from '../server/index.mjs';
import { NetzPuffer, RUHE_NACH } from '../client/netzpuffer.mjs';
import { Fahrzeug } from '../server/verkehr.mjs';
import { netzWert } from '../server/netzfeld.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
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

async function beitreten(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name });
  c.onMessage('*', () => {});
  const raum = matchMaker.getLocalRoomById(c.roomId);
  assert.ok(await bis(() => raum.state.spieler.get(c.sessionId) && c.state?.fahrzeuge), 'Zustand fehlt');
  return { c, raum, p: raum.state.spieler.get(c.sessionId) };
}

test('Kompression: permessage-deflate wird ausgehandelt, kleine Pakete bleiben unkomprimiert; ohne Erweiterung läuft es trotzdem', async () => {
  assert.equal(WS_KOMPRESSION.threshold, 256);
  const { c, raum } = await beitreten('Kompr');
  try {
    const ws = raum.clients[0].ref;
    assert.match(String(ws.extensions), /permessage-deflate/, 'Erweiterung nicht ausgehandelt: ' + JSON.stringify(ws.extensions));
    // Fallback: ein Client ohne Angebot der Erweiterung (wie hinter einem Proxy, der sie entfernt) verbindet sich und bekommt den Zustand
    const WebSocket = (await import('ws')).default;
    const roh = await new Promise((ok, fehl) => {
      const w = new WebSocket(`ws://127.0.0.1:${PORT}/${raum.roomId}?sessionId=x`, { perMessageDeflate: false });
      w.on('unexpected-response', (_q, r) => { ok({ status: r.statusCode, ext: '' }); w.terminate(); });
      w.on('open', () => { ok({ status: 101, ext: w.extensions }); w.terminate(); });
      w.on('error', () => ok({ status: 0, ext: '' }));
      setTimeout(() => ok({ status: -1, ext: '' }), 2000);
    });
    assert.notEqual(roh.ext?.includes?.('permessage-deflate'), true, 'ohne Angebot darf nichts komprimiert werden');
  } finally { await c.leave(); }
  // ein Client ohne Erweiterung kann normal spielen
  const c2 = await new Client(URL_).joinOrCreate('zombies', { name: 'OhneKompr' });
  c2.onMessage('*', () => {});
  try { assert.ok(await bis(() => c2.state?.spieler?.size >= 1), 'Zustand kommt an'); } finally { await c2.leave(); }
});

test('Fahrzeuge: nur im Bildausschnitt (+ Rand), Evakuierungsfahrzeug immer; Position ganzzahlig, Richtung in Stufen', async () => {
  const { c, raum, p } = await beitreten('Fz');
  try {
    raum.verkehr = null; raum.state.fahrzeuge.clear();
    p.x = 1000; p.y = 1000; p.ebene = '';
    c.send('sicht', { w: 400, h: 300 });
    await warte(150);
    const mach = (id, x, y, art = 'auto', richtung = 0) => { const f = new Fahrzeug(); f.x = x; f.y = y; f.richtung = richtung; f.art = art; f.haelt = true; raum.state.fahrzeuge.set(id, f); return f; };
    mach('nah', 1100, 1000); mach('fern', 1000 + 400 + 260 + 600, 1000);
    mach('evak', 5000, 5000, 'evakuierung');
    assert.ok(await bis(() => c.state.fahrzeuge.has('nah')), 'naher Wagen fehlt');
    assert.ok(await bis(() => c.state.fahrzeuge.has('evak')), 'Evakuierungsfahrzeug muss immer da sein');
    await warte(300);
    assert.ok(!c.state.fahrzeuge.has('fern'), 'ferner Wagen wurde geschickt');
    // Richtung als Stufen
    const nah = raum.state.fahrzeuge.get('nah'); nah.richtung = Math.PI / 2; nah.x = 1100.7;
    raum.netzAbgleich();
    assert.equal(nah.rq, 64);
    assert.equal(netzWert(nah, 'x'), 1100, 'unter 1 px bleibt der gesendete Wert stehen');
    assert.equal(nah.x, 1100.7, 'der Server rechnet genau weiter');
    assert.ok(await bis(() => c.state.fahrzeuge.get('nah')?.rq === 64), 'Richtung kommt nicht an');
    // Spieler fährt/geht weiter: der ferne Wagen kommt dazu, der nahe fällt weg
    p.x = 1000 + 400 + 260 + 600;
    assert.ok(await bis(() => c.state.fahrzeuge.has('fern') && !c.state.fahrzeuge.has('nah')), 'Sicht folgt dem Spieler nicht');
    assert.ok(c.state.fahrzeuge.has('evak'), 'Evakuierungsfahrzeug bleibt in der Sicht');
    // Spieler im Haus: Fahrzeuge bleiben (Sirenen), nur gleiche Entfernung zählt
    p.ebene = 'h1eg';
    await warte(250);
    assert.ok(c.state.fahrzeuge.has('fern'), 'Fahrzeug auf Außenebene verschwindet im Haus');
  } finally { await c.leave(); }
});

test('Kopierschwelle: Positionen gehen erst ab 1 px Änderung in den Patch; Sprünge sofort; ferne Zombies nur jeden 2. Patch', async () => {
  const { c, raum, p } = await beitreten('Schwelle');
  try {
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.zombiesAuffuellen = () => {};
    p.x = 600; p.y = 600; p.ebene = '';
    c.send('sicht', { w: 900, h: 700 });
    await warte(150);
    const nah = raum.setzeZombie(700, 600, ''), fern = raum.setzeZombie(600 + 500, 600, '');
    for (const id of [nah, fern]) { const i = raum.zombieInfo.get(id); i.schlaeft = true; i.steht = true; }
    const zn = raum.state.zombies.get(nah), zf = raum.state.zombies.get(fern);
    raum.netzAbgleich();
    assert.equal(netzWert(zn, 'x'), 700);
    zn.x = 700.4; raum.netzAbgleich();
    assert.equal(netzWert(zn, 'x'), 700, 'unter 1 px: nichts kopiert');
    zn.x = 700.4; zn.y = 600.9; raum.netzAbgleich();
    assert.equal(netzWert(zn, 'y'), 600);
    zn.x = 701.2; raum.netzAbgleich();
    assert.equal(netzWert(zn, 'x'), 701, 'ab 1 px kopiert');
    assert.equal(zn.x, 701.2, 'Server rechnet genau');
    // Sprung (Teleport/Spawn) geht sofort durch, ohne Netzabgleich
    zn.x = 300; assert.equal(netzWert(zn, 'x'), 300);
    zn.x = 701; raum.netzAbgleich();
    // Ferner Zombie (> 300 px vom Spieler): nur jeden 2. Patch
    let kopiert = 0, x0 = netzWert(zf, 'x');
    for (let i = 0; i < 10; i++) {
      zf.x += 5;
      const vorher = netzWert(zf, 'x');
      raum.netzAbgleich();
      if (netzWert(zf, 'x') !== vorher) kopiert++;
    }
    assert.ok(kopiert >= 4 && kopiert <= 6, `ferner Zombie sollte etwa jeden 2. Patch kopiert werden, war ${kopiert} von 10`);
    assert.ok(netzWert(zf, 'x') - x0 >= 40, 'ferner Zombie holt auf');
    // naher Zombie: jeden Patch
    let nahK = 0;
    for (let i = 0; i < 10; i++) { zn.x += 5; const v = netzWert(zn, 'x'); raum.netzAbgleich(); if (netzWert(zn, 'x') !== v) nahK++; }
    assert.equal(nahK, 10);
    // Richtung: erst ab 8 Stufen (≈ 11°)
    zn.richtung = 0; raum.netzAbgleich(); const rq0 = zn.rq;
    zn.richtung = 5 / 256 * Math.PI * 2; raum.netzAbgleich();
    assert.equal(zn.rq, rq0, '5 Stufen: bleibt');
    zn.richtung = 9 / 256 * Math.PI * 2; raum.netzAbgleich();
    assert.equal(zn.rq, (rq0 + 9) % 256, '9 Stufen: neu');
  } finally { await c.leave(); }
});

test('Netzpuffer (träge): unveränderte Stände ferner Zombies bremsen die Gleitbewegung nicht', () => {
  const pf = new NetzPuffer(), ziel = {};
  // Server schickt alle 200 ms (jeder 2. Patch), die Patches dazwischen zeigen denselben Stand
  for (let t = 0; t <= 1000; t += 100) pf.merke('z', Math.floor(t / 200) * 200 * 0.05, 0, t, true);
  const s = pf.spuren.get('z');
  assert.ok(s.length <= 6 && s.length >= 5, 'nur geänderte Stände (+ evtl. Ruhepunkte) gemerkt: ' + s.length);
  // Zwischen den Ständen gleichmäßig: bei t=100 mittig zwischen x(0)=0 und x(200)=10
  pf.pos('z', 100, ziel);
  assert.ok(Math.abs(ziel.x - 5) < 0.01, 'Mitte gleitet, statt anzuhalten: ' + ziel.x);
  // Bleibt der Zombie wirklich stehen, kommt nach RUHE_NACH ein Ruhepunkt
  const q = new NetzPuffer();
  q.merke('s', 10, 0, 0, true); q.merke('s', 10, 0, 100, true);
  assert.equal(q.spuren.get('s').length, 1, 'unter ' + RUHE_NACH + ' ms: noch kein Ruhepunkt');
  q.merke('s', 10, 0, 200, true);
  assert.equal(q.spuren.get('s').length, 2, 'danach steht er');
  // nicht träge (Spieler): jeder Stand wird gemerkt wie bisher
  const r = new NetzPuffer();
  r.merke('p', 5, 5, 0); r.merke('p', 5, 5, 100);
  assert.equal(r.spuren.get('p').length, 2);
});

test('Eingabe kompakt: Meldung "e" als Feld-Array wirkt wie die Objektform (Nummer, Dauer, Verzögerung)', async () => {
  const { c, raum, p } = await beitreten('Kompakt');
  try {
    const x = raum.extra.get(c.sessionId);
    c.send('e', [7, 100, -50, 3, 50, 180]);
    assert.ok(await bis(() => (x.warte?.length ?? 0) > 0 || x.verz === 180), 'Eingabe kommt nicht an');
    assert.equal(x.verz, 180);
    const w = x.warte?.[x.warte.length - 1];
    if (w) { assert.equal(w.n, 7); assert.ok(Math.abs(w.dx - 1 / Math.hypot(1, 0.5)) < 1e-9 || w.dx <= 1); assert.equal(w.s, true); }
    assert.equal(x.feuerAus, false);
    c.send('e', [8, 0, 0, 1, 250]);
    assert.ok(await bis(() => x.feuerAus === true), 'Bit „Feuer“ fehlt: feuerAus bleibt falsch');
    c.send('e', 'kaputt'); c.send('e', [1]);   // ungültig: wird ignoriert
    await warte(100);
    assert.ok(raum.state.spieler.get(c.sessionId), 'Raum läuft weiter');
  } finally { await c.leave(); }
});

test('Nahe Meldungen: b11/bwSoldaten nur an Spieler in der Nähe und nur bei Änderung', async () => {
  const { c, raum, p } = await beitreten('Nah');
  try {
    const erhalten = [];
    c.onMessage('probe', m => erhalten.push(m));
    p.x = 1000; p.y = 1000; p.ebene = '';
    const punkt = { x: 1200, y: 1000 }, fern = { x: 9000, y: 9000 };
    assert.equal(raum.sendeNah('probe', { a: 1 }, [punkt]), 1, 'nah: gesendet');
    assert.equal(raum.sendeNah('probe', { a: 1 }, [punkt]), 0, 'unverändert: nicht erneut');
    assert.equal(raum.sendeNah('probe', { a: 2 }, [punkt]), 1, 'geändert: gesendet');
    assert.equal(raum.sendeNah('probe', { a: 3 }, [fern]), 0, 'fern: nichts');
    assert.equal(raum.sendeNah('probe', { a: 2 }, [punkt]), 1, 'wer neu in die Nähe kommt, bekommt den Stand sofort');
    assert.ok(await bis(() => erhalten.length === 3), 'erhalten: ' + erhalten.length);
  } finally { await c.leave(); }
});
