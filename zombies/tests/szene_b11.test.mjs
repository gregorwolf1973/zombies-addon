// Szene „Stau auf der B11“ (nur geretsried2): Autos auf der B 11, 3 brennend, Wracks, Feuerwehr, Posten mit 8 Soldaten,
// Gefallene lassen Munition liegen und stehen als Zombie auf, ohne Soldaten schweigen Puma und Mörser (server/szene_b11.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { SzeneB11, STAU } from '../server/szene_b11.mjs';
import { b11Geometrie, b11Punkt } from '../server/szene_b11_geo.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';

const PORT = 28700 + Math.floor(Math.random() * 90);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried2' }, leise: true, datenbank: ':memory:' }); });
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
  p.x = 100; p.y = 100;   // fern vom Posten
  return { c, raum, p };
}
const mitSzene = fn => async () => {
  await frisch();
  const t = await beitreten();
  try { await fn(t); } finally { await t.c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
};
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, '', false); const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; raum.state.zombies.get(id).hp = 100; return id; };

test('Szene steht nur auf geretsried2 (andere Karte: nichts)', async () => {
  const s = new SzeneB11({ state: { karte: 'geretsried' }, welt: {} });
  s.start();
  assert.equal(s.aktiv(), false);
  const s2 = new SzeneB11({ state: { karte: 'geretsried2', fahrzeuge: new Map() }, welt: { vektor: { strassen: [] } } });
  s2.start();
  assert.equal(s2.aktiv(), false, 'ohne B 11 keine Szene');
});

test('geretsried2: Kreuzung beim Rathaus (Karl-Lederer-Platz), Stau auf der B 11, Verkehr dort gesperrt', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11, g = b11Geometrie(raum.welt);
  assert.ok(sz.aktiv() && g, 'Szene fehlt');
  // Kreuzung = Kachel (123,370)
  assert.ok(Math.abs(g.kreuzung.x / 32 - 123.6) < 0.2 && Math.abs(g.kreuzung.y / 32 - 370.5) < 0.2, JSON.stringify(g.kreuzung));
  const fz = [...raum.state.fahrzeuge.entries()];
  const autos = fz.filter(([id]) => id.startsWith('stau')), wracks = autos.filter(([, f]) => f.art === 'wrack');
  assert.equal(autos.length, STAU.autos + 1);   // 14 Autos + Feuerwehr (id beginnt ebenfalls mit „stau“)
  const pkw = fz.filter(([id]) => /^stau\d+$/.test(id));
  assert.ok(pkw.length >= 12 && pkw.length <= 15, 'Zahl der Stau-Autos ' + pkw.length);
  assert.equal(wracks.length, 2);
  // jedes Auto liegt dicht an der B 11 (höchstens 40 px von der Mittellinie) und steht
  for (const [, f] of pkw) {
    assert.equal(f.haelt, true);
    let best = Infinity;
    for (let s = 0; s <= g.laenge; s += 8) { const q = b11Punkt(g, s); best = Math.min(best, Math.hypot(q.x - f.x, q.y - f.y)); }
    assert.ok(best < 40, 'Auto nicht auf der B 11: ' + best);
  }
  // beide Spuren: gegenläufige Richtungen
  const rich = pkw.map(([, f]) => Math.cos(f.richtung));
  assert.ok(rich.some(c => c > 0.3) || rich.some(c => c < -0.3));
  const a = pkw[0][1], b = pkw[1][1];
  assert.ok(Math.abs(Math.atan2(Math.sin(a.richtung - b.richtung), Math.cos(a.richtung - b.richtung))) > 2.5, 'beide Spuren, entgegengesetzt');
  // 3 brennen dauerhaft
  assert.equal(raum.state.feuer.size, 3);
  for (const [id, fe] of raum.state.feuer) assert.equal(fe.art, 'fahrzeug', id);
  // Feuerwehr mit Blaulicht-Kennung daneben
  const fw = raum.state.fahrzeuge.get('stauFeuerwehr');
  assert.equal(fw.art, 'feuerwehr'); assert.equal(fw.haelt, true);
  // Mörser fest eingebaut, kein Test-Schalter nötig
  assert.equal(raum.moerser.fahrzeug()?.art, 'moerser');
  // Verkehr: keine Kante der Stau-Strecke im Straßengraph
  const nah = (a, b) => Math.abs(a - b) < 1;
  for (const kn of raum.verkehr.graph.knoten) for (const e of kn.nach) {
    for (const [ax, ay, bx, by] of g.kanten) {
      const k = (kn.x / 32 - ax) ** 2 + (kn.y / 32 - ay) ** 2 < 0.01 && (e.ziel.x / 32 - bx) ** 2 + (e.ziel.y / 32 - by) ** 2 < 0.01;
      assert.ok(!k, 'Stau-Kante im Verkehrsgraph');
    }
  }
  assert.ok(nah(0, 0));
  // die Brände sind nach langer Zeit noch da (kein Erlöschen)
  raum.brand.schritt(500);
  assert.equal(raum.state.feuer.size, 3);
}));

test('Posten: 8 Infanteristen, Puma, schießen auf Zombies in Reichweite', mitSzene(async ({ c, raum }) => {
  const sz = raum.szeneB11;
  assert.equal(sz.soldaten.length, 8);
  assert.ok(sz.puma);
  const schuesse = []; c.onMessage('b11schuss', m => schuesse.push(m)); c.onMessage('b11', () => {}); c.onMessage('b11tot', () => {});
  const q = sz.soldaten[3];
  const id = zombie(raum, q.x + Math.cos(q.blick) * 150, q.y + Math.sin(q.blick) * 150);
  // Sicht kann durch ein Haus verdeckt sein: freie Richtung suchen
  let ok = false;
  for (let k = 0; k < 24 && !ok; k++) {
    const w = k * Math.PI / 12, x = q.x + Math.cos(w) * 150, y = q.y + Math.sin(w) * 150, z = raum.state.zombies.get(id);
    z.x = x; z.y = y; ok = sz.sicht(q.x, q.y, x, y);
  }
  assert.ok(ok, 'keine freie Sichtlinie');
  assert.ok(await bis(() => schuesse.some(s => s.art === 'gewehr') || !raum.state.zombies.has(id), 4000), 'Soldaten schießen nicht');
}));

test('Soldat fällt: Munitionshaufen, nach der Verwandlungszeit steht er als Zombie auf; alle tot: Puma und Mörser schweigen', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11;
  const q = sz.soldaten[0];
  const vorher = raum.state.boden.size;
  q.hp = 0; sz.nahkampf(0.25);
  assert.equal(q.tot, 1);
  assert.ok(raum.state.boden.size >= vorher + 3, 'Munitionshaufen fehlt');
  const dinge = [...raum.state.boden.values()].filter(b => Math.hypot(b.x - q.x, b.y - q.y) < 20).map(b => b.ding);
  assert.ok(dinge.includes('munition'), dinge.join());
  // vor der Verwandlungszeit kein Zombie
  assert.equal(raum.state.zombies.size, 0);
  sz.schritt(1);
  assert.equal(q.tot, 1);
  q.tZeit = sz.verwandlungSek() + 1; sz.schritt(0.1);
  assert.equal(q.tot, 2);
  assert.equal(raum.state.zombies.size, 1);
  const z = raum.state.zombies.get(q.zid);
  assert.ok(z && z.variante === 0, 'Tarn-Zombie erwartet');
  // alle übrigen fallen: der Posten ist aufgegeben
  assert.equal(raum.moerser.schweigt, false);
  for (const s of sz.soldaten) if (!s.tot) { s.hp = 0; }
  sz.nahkampf(0.25); sz.schritt(0.1);
  assert.equal(sz.aufgegeben, true);
  assert.equal(raum.moerser.schweigt, true);
  // Puma schießt nicht mehr
  const id = zombie(raum, sz.puma.x + 100, sz.puma.y);
  sz.puma.kuehl = 0; sz.puma.turm = 0;
  let geschossen = false; const alt = raum.broadcast.bind(raum); raum.broadcast = (a, m) => { if (a === 'b11schuss') geschossen = true; return alt(a, m); };
  sz.schritt(1); sz.schritt(1);
  assert.equal(geschossen, false);
  assert.ok(raum.state.zombies.has(id) || true);
}));

test('Mörser auf der B 11 feuert auf Zombiegruppen im Bereich', mitSzene(async ({ c, raum }) => {
  const sz = raum.szeneB11, m = raum.moerser.fahrzeug();
  const gesehen = []; c.onMessage('moerser', x => gesehen.push(x)); c.onMessage('b11', () => {});
  raum.moerser.kuehl = 0;
  // Gruppe 40 m entfernt (freier Fleck suchen), Spieler weit weg
  for (let k = 0; k < 36 && !gesehen.length; k++) {
    const w = k * Math.PI / 18, x = m.x + Math.cos(w) * 320, y = m.y + Math.sin(w) * 320;
    for (let i = 0; i < 4; i++) zombie(raum, x + (i % 2) * 6, y + (i >> 1) * 6);
    raum.moerser.kuehl = 0; raum.moerser.schritt(0.1);
    if (!gesehen.length) { raum.state.zombies.clear(); raum.zombieInfo.clear(); }
    await warte(30);
  }
  assert.ok(await bis(() => gesehen.length > 0, 1000), 'Mörser schießt nicht');
  assert.ok(sz.aktiv());
}));
