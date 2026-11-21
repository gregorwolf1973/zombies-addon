// Türen öffnen automatisch: 0,5 s davorstehen oder dagegenlaufen (nicht beim Vorbeilaufen, nicht bei verschlossenen Türen)
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
import { KACHEL, T, frei, schlossArt, ladenArt } from '../client/welt.mjs';

const PORT = 28100 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-tuerauto-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');
const mitteK = k => ({ x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  const meldungen = [];
  c.onMessage('meldung', m => meldungen.push(m.text));
  return { c, raum, p: raum.state.spieler.get(c.sessionId), meldungen, spielerId };
}


function normalesHaus(raum, n) {
  const safe = new Set(raum.welt.safeRooms.map(s => s.haus.nr));
  return raum.welt.haeuser.filter(h => h.betretbar && !safe.has(h.nr))[n];
}
const ebeneVon = h => `h${h.nr}eg`;
function seitenDerTuer(w, t) {
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    if (w.hole(t.x + dx, t.y + dy) === T.BODEN && w.hole(t.x - dx, t.y - dy) === T.BODEN) return { a: mitteK({ x: t.x - dx, y: t.y - dy }), b: mitteK({ x: t.x + dx, y: t.y + dy }), dx, dy };
  }
  return null;
}
function findeTuer(raum) {
  for (let n = 0; n < 60; n++) {
    const h = normalesHaus(raum, n);
    if (!h) break;
    const w = raum.wv(ebeneVon(h));
    for (const t of w.tueren) { const s = seitenDerTuer(w, t); if (s) return { h, w, t, s, key: `${ebeneVon(h)}:${t.x},${t.y}` }; }
  }
  return null;
}
function schliesse(raum, g, p, pos, verschlossen = false) {
  const st = raum.state.tueren.get(g.key);
  st.kaputt = false; st.hp = 100;
  raum.setzeTuer(g.key, true); raum.setzeTuer(g.key, false); raum.setzeBarrikade(g.key, 0);
  st.verschlossen = verschlossen;
  p.ebene = ebeneVon(g.h); p.x = pos.x; p.y = pos.y;
  const x = raum.extra.get([...raum.state.spieler.keys()][0]);
  x.ankunft = null; x.tuerT = 0; x.tuerKey = null;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  return st;
}

test('Tür geht auf: 0,5 s davorstehen (nicht früher), 0,5 s dagegendrücken', async () => {
  const { c, raum, p } = await beitreten('Steher');
  try {
    const g = findeTuer(raum); assert.ok(g, 'keine Zimmertür');
    const st = schliesse(raum, g, p, g.s.a);
    await warte(250);
    assert.equal(st.offen, false, 'nach 0,25 s schon offen');
    assert.ok(await bis(() => st.offen === true, 1500), 'Tür geht im Stehen nicht auf');
    // dagegendrücken
    schliesse(raum, g, p, g.s.a);
    c.send('eingabe', { dx: g.s.dx, dy: g.s.dy });
    assert.ok(await bis(() => st.offen === true, 1500), 'Tür geht beim Dagegenlaufen nicht auf');
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Tür bleibt zu: seitlich vorbeilaufen, verschlossene Tür, Barrikade', async () => {
  const { c, raum, p } = await beitreten('Vorbeiläufer');
  try {
    const g = findeTuer(raum);
    let st = schliesse(raum, g, p, g.s.a);
    c.send('eingabe', { dx: g.s.dy, dy: g.s.dx });   // quer zur Tür
    await warte(900);
    c.send('eingabe', { dx: 0, dy: 0 });
    assert.equal(st.offen, false, 'Tür beim Vorbeilaufen geöffnet');
    raum.state.tuerFrei = 0; raum.state.tuerRaetsel = 50; raum.state.tuerSchluessel = 50;   // sonst kann die Tür die Schlossart „frei“ haben (dann öffnet sie normal)
    assert.notEqual(raum.tuerArt(g.key), 'frei');
    st = schliesse(raum, g, p, g.s.a, true);
    await warte(900);
    assert.equal(st.offen, false, 'verschlossene Tür ging von selbst auf');
    st = schliesse(raum, g, p, g.s.a);
    raum.setzeBarrikade(g.key, 50);
    await warte(900);
    assert.equal(st.offen, false, 'verbarrikadierte Tür ging von selbst auf');
  } finally { await c.leave(); }
});

test('Von Hand geschlossen: Auto-Öffnung greift erst nach > 80 px Abstand wieder', async () => {
  const { c, raum, p } = await beitreten('Schließer');
  try {
    const g = findeTuer(raum); assert.ok(g, 'keine Zimmertür');
    const st = schliesse(raum, g, p, g.s.a);
    raum.setzeTuer(g.key, true);   // offen, Spieler steht davor
    const x = raum.extra.get(c.sessionId);
    // von Hand schließen (Knopf/E): erst die erste, sonst die zweite Möglichkeit
    c.send('aktion');
    if (!(await bis(() => st.offen === false, 1200))) { c.send('aktion2'); await bis(() => st.offen === false, 1200); }
    assert.equal(st.offen, false, 'Tür ließ sich nicht von Hand schließen');
    assert.equal(x.tuerSperre?.key, g.key, 'keine Sperre nach dem Schließen');
    await warte(1000);   // länger als die 0,5 s der Auto-Öffnung
    assert.equal(st.offen, false, 'Tür ging trotz Sperre von selbst wieder auf');
    // mehr als 80 px weg: Sperre fällt
    p.x = g.s.a.x - g.s.dx * 90; p.y = g.s.a.y - g.s.dy * 90;
    await warte(150);
    assert.equal(x.tuerSperre ?? null, null, 'Sperre blieb nach > 80 px bestehen');
    // wieder davor: öffnet von selbst
    p.x = g.s.a.x; p.y = g.s.a.y; x.tuerT = 0; x.tuerKey = null;
    assert.ok(await bis(() => st.offen === true, 1500), 'Tür geht nach der Sperre nicht mehr automatisch auf');
  } finally { await c.leave(); }
});
