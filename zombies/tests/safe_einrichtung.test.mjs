// Safe Rooms als Notlager: Möblierung (Dorf und Geretsried) und Ruhen auf dem Feldbett
import { textAus } from '../server/texte.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, T, baueWelt, setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer, SAFE_MOEBEL } from '../client/innen.mjs';
import { BEUTE } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const WOHNUNG = ['bett', 'badewanne', 'klo', 'herd', 'sofa', 'fernseher', 'couchtisch', 'esstisch', 'kuehlschrank', 'spuele', 'waschbecken'];
const GEHBAR = new Set([T.BODEN, T.TUER_OFFEN, T.INNENTUER, T.AUSGANG]);

function pruefeSafe(welt, seed, name) {
  assert.ok(welt.safeRooms.length > 0);
  for (const s of welt.safeRooms) {
    const w = innenraumFuer(seed, welt, s.ebene);
    const wo = `${name} Seed ${seed} ${s.name}`;
    const zahl = art => w.moebel.filter(m => m.art === art).length;
    assert.ok(zahl('feldbett') >= 2 && zahl('feldbett') <= 6, `${wo}: Feldbetten ${zahl('feldbett')}`);
    assert.ok(zahl('vorratsregal') >= 1, `${wo}: kein Vorratsregal`);
    assert.ok(zahl('funktisch') >= 1, `${wo}: kein Funktisch`);
    assert.ok(!w.moebel.some(m => WOHNUNG.includes(m.art)), `${wo}: Wohnungsmöbel übrig`);
    assert.ok(w.behaelter.some(b => b.art === 'vorratsregal'), `${wo}: Regal nicht durchsuchbar`);
    // Erreichbarkeit vom Start aus: Ausgang, Kiste und alle Behälter (über Nachbarkachel)
    const besucht = new Set(), q = [[Math.floor(w.start.x / KACHEL), Math.floor(w.start.y / KACHEL)]];
    besucht.add(q[0].join());
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (!besucht.has(k) && GEHBAR.has(w.hole(x + dx, y + dy))) { besucht.add(k); q.push([x + dx, y + dy]); }
      }
    }
    const erreichbar = (kx, ky) => besucht.has(kx + ',' + ky) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => besucht.has((kx + dx) + ',' + (ky + dy)));
    assert.ok(besucht.has(w.ausgang.x + ',' + w.ausgang.y), `${wo}: Ausgang nicht erreichbar`);
    assert.ok(erreichbar(Math.floor(w.kiste.x / KACHEL), Math.floor(w.kiste.y / KACHEL)), `${wo}: Kiste nicht erreichbar`);
    for (const b of w.behaelter) assert.ok(erreichbar(Math.floor(b.x / KACHEL), Math.floor(b.y / KACHEL)), `${wo}: Behälter ${b.art} nicht erreichbar`);
    for (const t of w.tueren) assert.ok(erreichbar(t.x, t.y), `${wo}: Tür nicht erreichbar`);
    for (const m of w.moebel) assert.ok(SAFE_MOEBEL.has(m.art), `${wo}: fremdes Möbel ${m.art}`);
  }
}

test('Safe Rooms im Dorf sind Notlager', () => {
  for (const seed of [1, 7, 42, 1234, 99999]) pruefeSafe(baueWelt(seed), seed, 'Dorf');
});

test('Safe Rooms in Geretsried sind Notlager', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  try { for (const seed of [3, 7, 21]) pruefeSafe(baueWeltAusKarte(karte, seed), seed, 'Geretsried'); }
  finally { setzeKartengroesse(64, 48); }
});

test('Möblierung ist deterministisch, Beute-Tabellen vorhanden', () => {
  const w = baueWelt(5), a = innenraumFuer(5, w, w.safeRooms[0].ebene), b = innenraumFuer(5, w, w.safeRooms[0].ebene);
  assert.deepEqual(a.moebel, b.moebel);
  assert.ok(BEUTE.vorratsregal.includes('wasser') && BEUTE.erstehilfe.includes('verband'));
});

const PORT = await freierPort();
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Ruhen: neben dem Feldbett steigt das Leben, Bewegen beendet es', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Schlaefer', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId);
  try {
    const s = raum.welt.safeRooms[0], w = raum.wv(s.ebene);
    const bett = w.moebel.find(m => m.art === 'feldbett');
    // freie Kachel neben dem Bett
    let ort = null;
    for (let dy = -1; dy <= bett.h && !ort; dy++) for (let dx = -1; dx <= bett.b && !ort; dx++) if (w.hole(bett.x + dx, bett.y + dy) === T.BODEN) ort = { x: bett.x + dx, y: bett.y + dy };
    assert.ok(ort, 'keine freie Kachel am Bett');
    p.ebene = s.ebene; p.x = (ort.x + 0.5) * KACHEL; p.y = (ort.y + 0.5) * KACHEL;
    p.hp = 50; p.durst = 80; p.hunger = 80;
    assert.ok(await bis(() => p.sicher === s.id), 'nicht im Safe Room');
    assert.equal(p.ruht, false, 'ruht sofort');
    assert.ok(await bis(() => p.ruht === true, 4000), 'ruht nicht');
    const hp0 = p.hp;
    await warte(1500);
    assert.ok(p.hp >= hp0 + 1, `Leben steigt nicht (${hp0} → ${p.hp})`);
    c.send('eingabe', { dx: 0, dy: 1 });
    assert.ok(await bis(() => p.ruht === false, 2000), 'Bewegen beendet das Ruhen nicht');
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Safe-Room-Kühlschrank: nur unter 30 %, höchstens einer je Spielstunde', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Durstig', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId);
  const meldungen = []; c.onMessage('meldung', m => meldungen.push(textAus(m)));
  try {
    const s = raum.welt.safeRooms.find(q => raum.wv(q.ebene).kuehlschrank), w = raum.wv(s.ebene);
    assert.ok(s, 'kein Safe Room mit Kühlschrank');
    p.ebene = s.ebene; p.x = w.kuehlschrank.x; p.y = w.kuehlschrank.y + 20;
    p.rucksack.splice(0, p.rucksack.length);
    p.durst = 80; p.hunger = 80;
    raum.kuehlschrank({ sessionId: c.sessionId, send: () => {} });
    assert.equal(p.rucksack.length, 0, 'bei 80 % gibt es nichts');
    p.durst = 10;
    raum.kuehlschrank({ sessionId: c.sessionId, send: () => {} });
    assert.deepEqual([...p.rucksack], ['wasser']);
    raum.kuehlschrank({ sessionId: c.sessionId, send: () => {} });
    assert.equal(p.rucksack.length, 1, 'zweites Mal innerhalb der Stunde gesperrt');
    p.hunger = 5; p.durst = 50;
    raum.state.zeit += (SpielRaum.einstellungen.tagMinuten || 48) * 60 / 24 + 1;   // eine Spielstunde später
    raum.kuehlschrank({ sessionId: c.sessionId, send: () => {} });
    assert.deepEqual([...p.rucksack], ['wasser', 'essen']);
  } finally { await c.leave(); }
});

test('Tod: Ausrüstung bleibt am Sterbeort liegen, Neustart im Safe Room mit vollen Werten', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Gefallen', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId);
  try {
    p.rucksack.splice(0, p.rucksack.length, 'wasser', 'verband'); p.waffe = 'pistole'; p.munition = 20; p.kleidung = 50;
    p.x = 100; p.y = 100; p.ebene = ''; p.hp = 0; p.durst = 3; p.hunger = 4; p.unten = true;
    raum.boden0 = raum.state.boden.size;
    raum.zurueckInDieSafeRooms();
    assert.equal(p.rucksack.length, 0); assert.equal(p.waffe, ''); assert.equal(p.munition, 0); assert.equal(p.kleidung, 0);
    assert.equal(p.hp, 100); assert.equal(p.durst, 100); assert.equal(p.hunger, 100);
    const da = [...raum.state.boden.values()].filter(b => Math.hypot(b.x - 100, b.y - 100) < 15).map(b => b.ding).sort();
    assert.deepEqual(da, ['kleidung', 'munition', 'munition', 'pistole', 'verband', 'wasser']);
    assert.ok([...raum.state.boden.values()].every(b => b.alter < 0), 'bleibt mehr als die übliche Zeit liegen');
  } finally { await c.leave(); }
});
