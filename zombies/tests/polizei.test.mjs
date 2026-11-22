// Polizisten an den Straßensperren (server/polizei.mjs): entstehen zur Laufzeit je Sperre auf freien Plätzen, schießen Zombies in 25 m
// ab (Munition begrenzt), sterben im Nahkampf, lassen Pistole/Munition liegen und stehen als Zombie wieder auf; Schalter aus = keine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { polizeiPosten } from '../server/polizei.mjs';
import { frei, setzeKartengroesse } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
async function beitreten() {
  const c = await new Client(URL_).joinOrCreate('zombies', { name: 'Beobachter', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.schritt = () => {};
  raum.kriecherChance = 0;
  const p = raum.state.spieler.get(c.sessionId);
  p.waffe = ''; p.munition = 0; raum.extra.get(c.sessionId).pause = 1e6;
  p.x = 100; p.y = 100;
  return { c, raum, p };
}
const mitRaum = fn => async () => {
  await frisch();
  const t = await beitreten();
  try { await fn(t); } finally { await t.c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
};
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, '', false); const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; raum.state.zombies.get(id).hp = 100; return id; };

test('Polizisten stehen an jeder Sperre auf freien Plätzen, nicht im Streifenwagen', mitRaum(async ({ raum }) => {
  const w = raum.welt, pz = raum.polizei;
  assert.ok(w.sperren.length >= 1, 'Karte ohne Sperren');
  assert.ok(pz.beamte.length >= 2 * w.sperren.length, 'Polizisten ' + pz.beamte.length);
  for (let k = 0; k < w.sperren.length; k++) {
    const mit = pz.beamte.filter(q => q.sperre === k);
    assert.ok(mit.length >= 2 && mit.length <= 3, 'je Sperre 2–3, war ' + mit.length);
    for (const q of mit) {
      assert.ok(frei(w, q.x, q.y, 6), 'Polizist in der Wand');
      assert.ok(Math.hypot(q.x - w.sperren[k].x, q.y - w.sperren[k].y) < 60, 'zu weit von der Sperre');
    }
  }
  // gleiche Eingabe, gleiche Plätze (kein Zufall)
  assert.deepEqual(polizeiPosten(w, w.sperren[0], 3), polizeiPosten(w, w.sperren[0], 3));
}));

test('Polizist schießt Zombie in Reichweite ab, ignoriert fernen', mitRaum(async ({ raum }) => {
  const pz = raum.polizei, q = pz.beamte[0];
  pz.trefferChance = 1;
  const nah = zombie(raum, q.x + Math.cos(q.blick) * 90, q.y + Math.sin(q.blick) * 90);
  const fern = zombie(raum, q.x + 600, q.y + 600);
  const geschossen = [];
  const alt = raum.broadcast.bind(raum); raum.broadcast = (t, m, ...r) => { if (t === 'polschuss') geschossen.push(m); return alt(t, m, ...r); };
  // andere Polizisten schießen eventuell mit – nur der Erfolg zählt
  for (let i = 0; i < 400 && raum.state.zombies.has(nah); i++) { pz.schritt(0.05); raum.state.zombies.get(nah) && (raum.state.zombies.get(nah).x += 0); }
  raum.broadcast = alt;
  assert.ok(geschossen.length >= 1, 'kein Schuss');
  assert.ok(!raum.state.zombies.has(nah) || raum.state.zombies.get(nah).hp <= 0, 'Zombie lebt noch');
  assert.ok(raum.state.zombies.get(fern)?.hp > 0, 'ferner Zombie getroffen');
}));

test('Munition begrenzt: leerer Polizist schweigt', mitRaum(async ({ raum }) => {
  const pz = raum.polizei, q = pz.beamte[0];
  for (const o of pz.beamte) o.muni = 0;
  zombie(raum, q.x + Math.cos(q.blick) * 90, q.y + Math.sin(q.blick) * 90);
  let n = 0;
  const alt = raum.broadcast.bind(raum); raum.broadcast = (t, m, ...r) => { if (t === 'polschuss') n++; return alt(t, m, ...r); };
  for (let i = 0; i < 100; i++) pz.schritt(0.05);
  raum.broadcast = alt;
  assert.equal(n, 0);
}));

test('Zombies beißen Polizisten tot: Pistole liegt da, danach steht ein Zombie auf', mitRaum(async ({ raum }) => {
  const pz = raum.polizei, q = pz.beamte[0];
  for (const o of pz.beamte) o.muni = 0;   // schweigen, damit der Zombie ungestört beißt
  const z = zombie(raum, q.x + 5, q.y);
  const vorher = raum.state.boden.size;
  for (let i = 0; i < 300 && !q.tot; i++) { raum.state.zombies.get(z).x = q.x + 5; raum.state.zombies.get(z).y = q.y; pz.schritt(0.05); }
  assert.equal(q.tot, 1, 'Polizist lebt noch');
  assert.ok([...raum.state.boden.values()].some(b => b.ding === 'pistole'), 'Pistole fehlt');
  assert.ok(raum.state.boden.size >= vorher + 2);
  const zahl = raum.state.zombies.size;
  q.tZeit = 1e9; pz.schritt(0.05);
  assert.equal(q.tot, 2);
  assert.equal(raum.state.zombies.size, zahl + 1, 'kein Zombie entstanden');
  assert.ok(raum.state.zombies.has(q.zid));
}));

test('Zombie-Trupps kennen Polizisten als Ziel; Zombies in der Nähe zählen als „nah“', mitRaum(async ({ raum }) => {
  const q = raum.polizei.beamte[0];
  const a = { mitte: { x: q.x, y: q.y } };
  assert.ok(raum.welle.opfer(a).some(o => o.art === 'polizei'), 'Polizei kein Opfer');
  const o = raum.welle.opfer(a).find(o => o.art === 'polizei');
  assert.ok(raum.welle.opferLage({ art: 'polizei', x: o.x, y: o.y }));
  raum.berechneNah();
  assert.ok(raum.nahPunkte.get('').some((v, i, l) => i % 2 === 0 && Math.abs(v - q.x) < 1 && Math.abs(l[i + 1] - q.y) < 1));
  q.tot = 1;
  assert.ok(!raum.welle.opfer(a).some(o => o.key === 'pol' + q.sperre && o.x === q.x), 'Toter bleibt Ziel');
}));

test('Schalter polizei.aktiv aus: keine Polizisten', async () => {
  await frisch();
  const alt = SpielRaum.prototype.einstellungen;
  SpielRaum.prototype.einstellungen = function () { return { ...(alt?.call(this) ?? {}), polizei: { aktiv: false, anzahl: 3, munition: 30 } }; };
  try {
    const t = await beitreten();
    try { assert.equal(t.raum.polizei.beamte.length, 0); } finally { await t.c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
  } finally { SpielRaum.prototype.einstellungen = alt; }
});
