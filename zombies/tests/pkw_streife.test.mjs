// Streifenwagen an den Straßensperren fahrbar (ohne Autoschlüssel), Blaulicht + Sirene per Nachricht 'blaulicht' (lockt Zombies weithin an),
// Lärm fahrender Fahrzeuge (Auto, Streifenwagen, Puma) lockt Zombies wie ein rennender Spieler.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse, frei } from '../client/welt.mjs';
import { PKW, PKW_VORGABE, streifePose, streifeBei, pkwNah } from '../client/pkw.mjs';
import { freierPort } from './hilfe.mjs';

let server;
const PORT = await freierPort();
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bed, ms = 4000) { const e = Date.now() + ms; while (Date.now() < e) { if (bed()) return true; await warte(20); } return bed(); }

async function beitreten(name) {
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 0, polizei: { aktiv: false }, auto: { ...PKW_VORGABE, ...(alt.auto ?? {}) } };
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.state.phase = 'spiel';
  const nachrichten = [];
  c.onMessage('*', (typ, m) => nachrichten.push([typ, m]));
  return { c, raum, nachrichten, ende: async () => { try { await c.leave(); } catch { /* weg */ } await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; } };
}
// Sperre mit Streifenwagen und freiem Einstiegsplatz seitlich: { k, st, x, y }
function sperre(raum) {
  const w = raum.welt;
  for (const [k, s] of (w.sperren ?? []).entries()) {
    const st = streifePose(s), c = Math.cos(st.w), sn = Math.sin(st.w);
    for (const seite of [1, -1]) {
      const x = st.x - sn * seite * (PKW.breite / 2 + 9), y = st.y + c * seite * (PKW.breite / 2 + 9);
      if (frei(w, x, y, 10) && pkwNah({ x: st.x, y: st.y, richtung: st.w }, x, y) && streifeBei(w, x, y)?.k === k) return { k, st, x, y };
    }
  }
  return null;
}
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, '', false); const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; raum.state.zombies.get(id).hp = 100; return [id, i]; };

test('Streifenwagen: ohne Schlüssel einsteigen und fahren, Wagen verschwindet an der Sperre, Aussteigen', async () => {
  const { c, raum, nachrichten, ende } = await beitreten('Streife');
  try {
    const o = sperre(raum); assert.ok(o, 'keine Sperre mit freiem Platz');
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.x = o.x; p.y = o.y; p.rucksack.splice(0, p.rucksack.length);   // kein Autoschlüssel
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer && p.anBord), 'ohne Schlüssel nicht eingestiegen');
    const fz = raum.fahrbare.von(c.sessionId);
    assert.equal(fz.streife, true); assert.equal(fz.id, 'pkw_streife' + o.k);
    assert.equal(raum.state.fahrzeuge.get(fz.id)?.art, 'pkw');
    assert.ok(raum.welt.autosWeg.has('streife' + o.k));
    assert.ok(await bis(() => nachrichten.some(([t, m]) => t === 'autosWeg' && m.ids.includes('streife' + o.k))), 'autosWeg fehlt');
    assert.equal(streifeBei(raum.welt, o.x, o.y), null, 'zweiter Streifenwagen an derselben Stelle');
    const x0 = fz.f.x, y0 = fz.f.y;
    raum.extra.get(c.sessionId).eingabe = { dx: Math.cos(fz.f.richtung), dy: Math.sin(fz.f.richtung), s: false };
    assert.ok(await bis(() => Math.hypot(fz.f.x - x0, fz.f.y - y0) > 6, 3000), 'Streifenwagen fährt nicht');
    raum.extra.get(c.sessionId).eingabe = { dx: 0, dy: 0, s: false };
    c.send('aktion');
    assert.ok(await bis(() => !p.imBoxer && !p.anBord), 'steigt nicht aus');
    assert.ok(!raum.state.fahrzeuge.get(fz.id).blau);
  } finally { await ende(); }
});

test('Blaulicht + Sirene: Knopf schaltet um, Zombies in 100 m kommen, aus = Ruhe; ohne Menschen im Wagen geht sie aus', async () => {
  const { c, raum, ende } = await beitreten('Sirene');
  try {
    const o = sperre(raum);
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.x = o.x; p.y = o.y; p.rucksack.splice(0, p.rucksack.length);
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer), 'nicht eingestiegen');
    const fz = raum.fahrbare.von(c.sessionId), f = raum.state.fahrzeuge.get(fz.id);
    const [, info] = zombie(raum, fz.f.x + 800, fz.f.y);   // 100 m entfernt: weit außerhalb jedes Rennlärms
    assert.ok(!f.blau);
    c.send('blaulicht');
    assert.ok(await bis(() => f.blau === true), 'Blaulicht an');
    assert.ok(await bis(() => !!info.punkt, 3000), 'Zombie hört die Sirene nicht');
    c.send('blaulicht');
    assert.ok(await bis(() => f.blau === false), 'Blaulicht aus');
    info.punkt = null; info.laermQ = null;
    await warte(2600);
    assert.ok(!info.punkt, 'Zombie hört trotz ausgeschalteter Sirene');
    // Sirene an, dann steigt der Mensch aus: ohne Menschen im Wagen geht sie aus
    c.send('blaulicht');
    assert.ok(await bis(() => f.blau === true));
    c.send('aktion');
    assert.ok(await bis(() => !p.imBoxer));
    assert.ok(await bis(() => f.blau === false, 3000), 'Sirene läuft im leeren Wagen weiter');
    // Normales Auto: Knopf wirkt nicht
    assert.equal(fz.blaulichtSchalten('niemand'), false);
  } finally { await ende(); }
});

test('Zombies hören ein fahrendes Auto (Streifenwagen) wie einen rennenden Spieler; im Stand nicht', async () => {
  const { c, raum, ende } = await beitreten('Fahrer');
  try {
    const o = sperre(raum);
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.x = o.x; p.y = o.y; p.rucksack.splice(0, p.rucksack.length);
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer), 'nicht eingestiegen');
    const fz = raum.fahrbare.von(c.sessionId);
    const [, info] = zombie(raum, fz.f.x - Math.cos(fz.f.richtung) * 100, fz.f.y - Math.sin(fz.f.richtung) * 100);
    await warte(1800);
    assert.ok(!info.punkt, 'Zombie reagiert auf ein stehendes Auto');
    raum.extra.get(c.sessionId).eingabe = { dx: Math.cos(fz.f.richtung), dy: Math.sin(fz.f.richtung), s: false };
    assert.ok(await bis(() => !!info.punkt, 4000), 'Zombie hört das fahrende Auto nicht');
  } finally { await ende(); }
});

test('Puma: fahrender Panzer macht Lärm (Zombies hören ihn)', async () => {
  const { c, raum, ende } = await beitreten('Panzer');
  try {
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.x = 300; p.y = 300;
    const b = raum.fahrbare.setzen(c.sessionId, 'puma', p);
    assert.ok(b, 'kein Platz für den Puma');
    p.x = b.f.x; p.y = b.f.y;
    b.insassen.push(c.sessionId); p.anBord = true; p.imBoxer = true;
    const [, info] = zombie(raum, b.f.x - Math.cos(b.f.richtung) * 110, b.f.y - Math.sin(b.f.richtung) * 110);
    b.fahrerEingabe(c.sessionId, { dx: Math.cos(b.f.richtung), dy: Math.sin(b.f.richtung) });
    assert.ok(await bis(() => !!info.punkt, 4000), 'Zombie hört den Puma nicht');
  } finally { await ende(); }
});
