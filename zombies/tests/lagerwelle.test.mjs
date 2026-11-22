// Lager-Welle: sind alle Menschen (keine Bots) im Bundeswehr-Lager, kommt eine Welle aus mehreren Richtungen
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { rahmen } from '../client/stuetzpunkt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';

const PORT = 28100 + Math.floor(Math.random() * 90);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const neueId = () => crypto.randomBytes(16).toString('hex');
let alteEinst;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); alteEinst = SpielRaum.einstellungen; });
after(async () => { SpielRaum.einstellungen = alteEinst; await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

const planOrt = (sp, u, v) => rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(u, v);
const einst = z => { SpielRaum.einstellungen = { ...alteEinst, ...z }; };
const lagerZombies = w => w.horden.filter(h => h.lager).reduce((a, h) => a + h.ids.size + h.trupps.reduce((x, t) => x + t.ids.size, 0), 0);
const laufen = (w, s) => { for (let i = 0; i < s; i++) w.schritt(1); };
const leeren = (raum, w) => { w.horden = []; w.lagerPlan = null; raum.state.zombies.clear(); raum.zombieInfo.clear(); };

test('Einstellungen: lagerWelle und lagerWellePause werden geklammert, Vorgabe 200 / 10', () => {
  const v = vorgaben().zombies;
  assert.equal(v.lagerWelle, 200); assert.equal(v.lagerWellePause, 10);
  assert.equal(bereinige({ zombies: { lagerWelle: 9999, lagerWellePause: 0 } }).zombies.lagerWelle, 400);
  assert.equal(bereinige({ zombies: { lagerWelle: 9999, lagerWellePause: 0 } }).zombies.lagerWellePause, 1);
  assert.equal(bereinige({ zombies: { lagerWelle: 0 } }).zombies.lagerWelle, 0);
});

test('Lager-Welle: 200 Zombies, nur wenn alle Menschen drin sind (Bot draußen egal), Pause, 0 = aus, Tickzeit', async () => {
  einst({ lagerWelle: 200, lagerWellePause: 10 });
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp', spielerId: neueId(), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId), w = raum.welle, sp = raum.welt.stuetzpunkt;
  raum.zombieFaktor = 0; raum.kriecherChance = 0; leeren(raum, w);
  const p = raum.state.spieler.get(c.sessionId);
  p.waffe = ''; p.munition = 0; raum.extra.get(c.sessionId).pause = 1e6;
  const drin = q => { [q.x, q.y] = planOrt(sp, 15, 12); q.ebene = ''; };
  const draussen = q => { [q.x, q.y] = planOrt(sp, 15, -8); q.ebene = ''; };
  const meldungen = []; c.onMessage('meldung', m => meldungen.push(m.text));
  // ein zweiter Spieler, zunächst Bot (draußen): zählt nicht mit
  const c2 = await new Client(URL_).joinOrCreate('zombies', { name: 'Bot', spielerId: neueId(), seed: 7 });
  const p2 = raum.state.spieler.get(c2.sessionId), x2 = raum.extra.get(c2.sessionId);
  x2.bot = { nr: 0 }; draussen(p2); p2.x += 300; leeren(raum, w);
  assert.equal(raum.state.stuetzpunkt, 'steht');

  // Mensch draußen: nichts
  draussen(p); laufen(w, 3);
  assert.equal(w.lagerPlan, null); assert.equal(lagerZombies(w), 0);
  // alle Menschen drin (Bot draußen): Welle
  drin(p); w.schritt(1);
  assert.ok(w.lagerPlan, 'Welle nicht geplant');
  const richtungen = w.lagerPlan.richtungen.length;
  assert.ok(richtungen >= 3 && richtungen <= 4, 'Richtungen ' + richtungen);
  assert.ok(w.lagerPlan.gruppen.length >= 6);
  const plan = w.lagerPlan;
  laufen(w, 45);
  assert.equal(w.lagerPlan, null, 'Staffelung nicht fertig');
  const n = plan.erzeugt;
  console.log('Lager-Welle Zombies:', n, 'Horden:', w.horden.filter(h => h.lager).length);
  assert.equal(n, 200, 'Anzahl ' + n);
  await new Promise(r => setTimeout(r, 150));
  assert.ok(meldungen.some(m => /Zombiehorde kommt von/.test(m)));
  assert.equal(w.aktive().length, 0, 'zählt nicht zu „gleichzeitig“');
  const cx = (sp.x + sp.b / 2) * 32, cy = (sp.y + sp.h / 2) * 32;
  for (const h of w.horden) assert.ok(Math.hypot(h.mitte.x - cx, h.mitte.y - cy) > 1000, 'zu nah am Lager');

  // Pause: raus und wieder rein, keine neue Welle
  draussen(p); laufen(w, 2); drin(p); laufen(w, 45);
  assert.equal(w.lagerPlan, null, 'Pause nicht eingehalten'); assert.ok(lagerZombies(w) <= 200, 'Pause nicht eingehalten');
  assert.ok(w.lagerUhr > 400 && w.lagerUhr <= 600, 'Pause ' + w.lagerUhr);
  // Pause vorbei: wieder
  leeren(raum, w); w.lagerUhr = 0; draussen(p); laufen(w, 2); drin(p); w.schritt(1);
  assert.ok(w.lagerPlan, 'nach der Pause keine Welle');
  const plan2 = w.lagerPlan;
  laufen(w, 45);
  assert.equal(plan2.erzeugt, 200);

  // Mensch Nummer zwei draußen: nichts; dann beide drin: Welle
  leeren(raum, w); w.lagerUhr = 0; x2.bot = null; p2.verbunden = true; p2.hp = 100;
  draussen(p); laufen(w, 2); drin(p); laufen(w, 3);
  assert.equal(w.lagerPlan, null, 'ein Mensch noch draußen');
  draussen(p); laufen(w, 1); drin(p); drin(p2); w.schritt(1);
  assert.ok(w.lagerPlan, 'beide Menschen drin');
  laufen(w, 45);

  // 0 = aus
  leeren(raum, w); w.lagerUhr = 0; x2.bot = { nr: 0 };
  einst({ lagerWelle: 0 });
  draussen(p); laufen(w, 2); drin(p); laufen(w, 45);
  assert.equal(w.lagerPlan, null); assert.equal(lagerZombies(w), 0);

  // Tickzeit mit 200 zusätzlichen Zombies
  einst({ lagerWelle: 200, lagerWellePause: 10 });
  w.lagerUhr = 0; draussen(p); laufen(w, 2); drin(p); laufen(w, 45);
  const z = lagerZombies(w), ms = [];
  for (let i = 0; i < 40; i++) { const t = process.hrtime.bigint(); raum.schritt(0.05); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
  ms.sort((a, b) => a - b);
  console.log(`Tick mit ${z} Lager-Zombies: Median ${ms[20].toFixed(2)} ms, max ${ms[39].toFixed(2)} ms`);
  assert.ok(ms[20] < 25, 'Tick zu langsam: ' + ms[20]);
  await c2.leave(); await c.leave();
  for (let i = 0; i < 150 && SpielRaum.aktiv; i++) await new Promise(r => setTimeout(r, 20));
});
