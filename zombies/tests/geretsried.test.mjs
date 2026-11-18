// Phase C: Geretsried aus OpenStreetMap
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { KACHEL, T, setzeKartengroesse, frei, findeWeg, seiteVon } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { baueInnenraum } from '../client/innen.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));

test('Geretsried: Karte, Safe Rooms, Häuser, Start und Ortsausgang', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  assert.ok(karte.quelle.includes('OpenStreetMap'));
  assert.equal(w.safeRooms.length, 4, 'Safe Rooms: ' + w.safeRooms.map(s => s.name));
  assert.ok(w.haeuser.filter(h => h.betretbar).length > 200);
  assert.ok(frei(w, w.start.x, w.start.y, 11), 'Start blockiert');
  assert.ok(w.behaelter.filter(b => b.art === 'auto').length >= 20, 'zu wenige Autos');
  // Wege: vom Start zu den Safe Rooms und zu Haustüren
  for (const s of w.safeRooms) assert.ok(findeWeg(w, w.start.x, w.start.y, s.innen.x, s.innen.y), `${s.name} nicht erreichbar`);
  const tueren = w.haeuser.filter(h => h.betretbar).slice(0, 40);
  const erreicht = tueren.filter(h => findeWeg(w, w.start.x, w.start.y, (h.tuer.x + 0.5) * KACHEL, (h.tuer.y + 0.5) * KACHEL, 11, 60000)).length;
  assert.ok(erreicht >= 30, `nur ${erreicht}/40 Haustüren erreichbar`);
  // Innenräume aller Seiten
  for (const h of w.haeuser.filter(h => h.betretbar).slice(0, 12)) {
    const i = baueInnenraum(7, h.nr, 'eg', seiteVon(h));
    assert.equal(i.hole(i.ausgang.x, i.ausgang.y), T.AUSGANG);
  }
  setzeKartengroesse(64, 48);
});

let server;
const PORT = 27700 + Math.floor(Math.random() * 200);
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('Geretsried im Spiel: Zombies nur in der Nähe, Haus betreten', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Geretsrieder', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const p = raum.state.spieler.get(c.sessionId);
    assert.equal(raum.state.karte, 'geretsried');
    assert.ok(await bis(() => c.state.karte === 'geretsried'));
    assert.ok(await bis(() => raum.state.zombies.size > 5, 4000), 'keine Zombies');
    const weit = [...raum.state.zombies.entries()].filter(([id, z]) => !z.ebene && !raum.zombieInfo.get(id)?.bleibt && Math.hypot(z.x - p.x, z.y - p.y) > 1600).length;
    assert.equal(weit, 0, 'Zombies weit weg erzeugt');
    // Geschäfte: PENNY mit Lebensmittelregalen, Apotheke mit Apothekenregalen
    const penny = raum.welt.haeuser.find(h => /penny/i.test(h.name));
    assert.ok(penny, 'PENNY fehlt');
    assert.ok(raum.wv(`h${penny.nr}eg`).behaelter.some(b => b.art === 'laden_lebensmittel'), 'PENNY ohne Lebensmittelregal');
    const apo = raum.welt.haeuser.find(h => /apotheke/i.test(h.name));
    assert.ok(raum.wv(`h${apo.nr}eg`).behaelter.some(b => b.art === 'laden_apotheke'), 'Apotheke ohne Regal');
    // Haus betreten (Tür in beliebiger Richtung)
    const h = raum.welt.haeuser.find(h => h.betretbar);
    p.x = (h.tuer.x + 0.5 + h.raus.dx) * KACHEL; p.y = (h.tuer.y + 0.5 + h.raus.dy) * KACHEL;
    c.send('eingabe', { dx: -h.raus.dx, dy: -h.raus.dy });
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 4000), 'nicht hineingekommen');
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Geretsried: Vektordaten fürs Aussehen (Umrisse, Straßen, Flächen) passen zum Raster', async () => {
  const { readFileSync } = await import('node:fs');
  const karte = JSON.parse(readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
  assert.ok(karte.strassen.length > 100, 'zu wenige Straßen');
  assert.ok(karte.flaechen.length > 10, 'zu wenige Flächen');
  const mitUmriss = karte.gebaeude.filter(g => g.umriss?.length >= 6);
  assert.equal(mitUmriss.length, karte.gebaeude.length, 'Gebäude ohne Umriss');
  // Umriss liegt um das gerasterte Gebäude herum (höchstens eine Kachel daneben)
  // (einzelne Gebäude ragen in OSM über eine Straße – dort ist das Raster abgeschnitten, der Client beschneidet das Dach)
  const daneben = mitUmriss.filter(g => {
    const xs = g.umriss.filter((_, i) => i % 2 === 0), ys = g.umriss.filter((_, i) => i % 2 === 1);
    return !(Math.min(...xs) > g.x - 1.5 && Math.max(...xs) < g.x + g.b + 1.5 && Math.min(...ys) > g.y - 1.5 && Math.max(...ys) < g.y + g.h + 1.5);
  });
  assert.ok(daneben.length < mitUmriss.length * 0.05, `${daneben.length} Umrisse passen nicht zum Raster`);
});

test('Stadtleben: Menschen gehen umher, Gebissene werden zu Zombies, der Bus fährt', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Bürgermeister', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const s = raum.state;
    assert.ok(s.menschen.size >= 40, 'zu wenige Menschen: ' + s.menschen.size);
    assert.ok(s.busse.size === 1, 'kein Bus');
    // jemand bewegt sich
    const vorher = new Map([...s.menschen.entries()].map(([id, m]) => [id, [m.x, m.y, m.sichtbar]]));
    const bus0 = { x: s.busse.get('linie1').x, y: s.busse.get('linie1').y };
    await new Promise(r => setTimeout(r, 12000));
    const bewegt = [...s.menschen.entries()].filter(([id, m]) => { const v = vorher.get(id); return v && (Math.hypot(m.x - v[0], m.y - v[1]) > 20 || m.sichtbar !== v[2]); }).length;
    assert.ok(bewegt >= 5, 'Menschen bewegen sich nicht: ' + bewegt);
    const bus = s.busse.get('linie1');
    assert.ok(Math.hypot(bus.x - bus0.x, bus.y - bus0.y) > 50, 'Bus fährt nicht');
    // Biss → nach der Ansteckungszeit ein Zombie
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar && !q.infiziert);
    m.infiziert = true; raum.stadt.info.get(mid).inf = 0.5;
    assert.ok(await bis(() => !s.menschen.has(mid), 3000), 'Gebissener verwandelt sich nicht');
    const zid = raum.stadt.zuletztVerwandelt;
    assert.ok(zid && s.zombies.has(zid), 'kein neuer Zombie');
    assert.ok(raum.zombieInfo.get(zid).bleibt, 'verwandelter Zombie würde wieder verschwinden');
  } finally { await c.leave(); }
});
