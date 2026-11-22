// Flandernzaun im Bundeswehr-Lager, S-Draht (Zombies bleiben hängen, reißen sich los), Puma überrollt Zombies, Flugfeld-Deko Königsdorf
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum, Zombie } from '../server/raum.mjs';
import { drahtPruefen, haengtSchritt, haengendStart, drahtRollen, DRAHT_DAUER } from '../server/haengend.mjs';
import { ueberrolleZombies } from '../server/ueberrollen.mjs';
import { KACHEL, WERTE, setzeKartengroesse, frei, tierGelaende, feinWert, bewege, zufall, WELT_VERSION, FLANDERN_TEMPO } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { rahmen } from '../client/stuetzpunkt.mjs';
import { FLUGFELD_TOTE } from '../client/flugfeld_deko.mjs';

const kartenDatei = name => JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));

// ---------------- Welt: Flandernzaun ----------------
for (const name of ['geretsried', 'geretsried2', 'isarauen']) {
  test(`Flandernzaun ${name}: rundum, Tor offen, Spieler kommen nicht durch, Zombies waten gebremst`, () => {
    const karte = kartenDatei(name);
    setzeKartengroesse(karte.breite, karte.hoehe);
    const w = baueWeltAusKarte(karte, 7), sp = w.stuetzpunkt;
    assert.ok(WELT_VERSION >= 20);
    assert.ok(sp.zaun.length >= 5, 'Zaunstücke fehlen');
    assert.equal(sp.teile.filter(t => t.art === 'flandern').length, sp.zaun.length);
    for (const z of sp.zaun) {
      const x = (z.x0 + z.x1) / 2, y = (z.y0 + z.y1) / 2;
      assert.ok(feinWert(w, x, y) === 4 || feinWert(w, x, y) === 1, 'Zaun nicht im Feinraster');
    }
    const r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung);
    const fest = (u, v) => { const [x, y] = r.ort(u, v); return !frei(w, x, y, WERTE.spielerRadius); };
    for (const [u, v] of [[10, 1.5], [24, 1.5], [0.5, 10], [29.5, 10], [15, 21.9], [0.5, 5]]) assert.ok(fest(u, v), `Zaun bei ${u}/${v} durchlässig`);
    for (const [u, v] of [[15.5, 1.5], [14.5, 1.5], [16.5, 1.5]]) assert.ok(!fest(u, v), `Tor blockiert bei ${u}/${v}`);
    // Zombie: gebremst, aber nicht gesperrt
    const [zx, zy] = r.ort(24, 1.5), f = tierGelaende(w, zx, zy, WERTE.zombieRadius);
    assert.ok(f > 0 && f <= FLANDERN_TEMPO + 1e-9, 'Zombietempo am Zaun ' + f);
    // ein Spieler, der gegen die Front läuft, bleibt davor
    const rueck = r.th, dirU = 0, dirV = 1;   // von der Stadt (−v) ins Lager (+v)
    const [sx, sy] = r.ort(24, -0.3), schritt = { x: sx, y: sy };
    const ein = { x: -r.s * dirV, y: r.c * dirV };
    for (let i = 0; i < 80; i++) bewege(w, schritt, ein.x * 2, ein.y * 2, WERTE.spielerRadius);
    void rueck; void dirU;
    const [ex, ey] = r.ort(24, 0.9);   // Mitte zwischen Rolle und Zaun: ab hier ist der Zaun (v 1,35) das Hindernis
    assert.ok(Math.hypot(schritt.x - sx, schritt.y - sy) < Math.hypot(ex - sx, ey - sy) + 40, 'Spieler kommt durch den Zaun');
    const vEnde = ((schritt.x - r.ort(0, 0)[0]) * -r.s + (schritt.y - r.ort(0, 0)[1]) * r.c) / KACHEL;
    assert.ok(vEnde < 1.4, 'Spieler hinter dem Zaun: v=' + vEnde);
    // Rollen vor dem Tor und hinter dem Lager
    assert.ok(sp.teile.filter(t => t.art === 'sdraht').length >= 3);
  });
}

// ---------------- Welt: Flugfeld Königsdorf ----------------
function pistenAbstandKachel(pi, x, y) {
  const seg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  let m = seg(x / KACHEL, y / KACHEL, [pi.x0, pi.y0], [pi.x1, pi.y1]) - pi.b / 2;
  for (const q of pi.rollweg) for (let i = 0; i + 1 < q.length; i++) m = Math.min(m, seg(x / KACHEL, y / KACHEL, q[i], q[i + 1]) - pi.rb / 2);
  return m;
}
for (const seed of [7, 12345, 987654321]) {
  test(`Flugfeld Königsdorf (Seed ${seed}): 2 Puma, 2 Leopard, 4 Rollen, ${FLUGFELD_TOTE} Tote, nicht auf der Piste, frei begehbar`, () => {
    const karte = kartenDatei('koenigsdorf');
    setzeKartengroesse(karte.breite, karte.hoehe);
    const w = baueWeltAusKarte(karte, seed), ff = w.flugfeld;
    assert.ok(ff, 'keine Flugfeld-Deko');
    assert.equal(ff.fahrzeuge.filter(q => q.art === 'puma').length, 2);
    assert.equal(ff.fahrzeuge.filter(q => q.art === 'leopard').length, 2);
    assert.equal(ff.draht.length, 4);
    assert.equal(ff.tote.length, FLUGFELD_TOTE);
    for (const q of [...ff.fahrzeuge, ...ff.draht, ...ff.tote]) {
      assert.ok(pistenAbstandKachel(w.piste, q.x, q.y) > 1, 'auf der Piste: ' + JSON.stringify(q));
    }
    for (const q of ff.fahrzeuge) assert.equal(feinWert(w, q.x, q.y), 1, 'Fahrzeug blockiert nicht');
    for (const q of ff.draht) assert.equal(feinWert(w, q.x, q.y), 1, 'Rolle blockiert nicht');
    for (const q of ff.tote) assert.ok(frei(w, q.x, q.y, 5), 'Toter in einem Hindernis');
    // deterministisch
    setzeKartengroesse(karte.breite, karte.hoehe);
    assert.deepEqual(baueWeltAusKarte(karte, seed).flugfeld, ff);
    // andere Karten haben keine Flugfeld-Deko
    const k2 = kartenDatei('geretsried'); setzeKartengroesse(k2.breite, k2.hoehe);
    assert.equal(baueWeltAusKarte(k2, seed).flugfeld, null);
  });
}

test('Flugfeld: haengendStart legt feste Tote ohne Beute und hängende Zombies (2–3 je Rolle) an', () => {
  const karte = kartenDatei('koenigsdorf');
  setzeKartengroesse(karte.breite, karte.hoehe);
  const welt = baueWeltAusKarte(karte, 7);
  let zid = 1, lid = 1;
  const raum = {
    welt, rnd: zufall(3), state: { zombies: new Map(), leichen: new Map() }, zombieInfo: new Map(), leichenInhalt: new Map(),
    haengenBleiben: SpielRaum.prototype.haengenBleiben,
    setzeZombie(x, y) { const z = new Zombie(); z.x = x; z.y = y; z.hp = 100; z.ebene = ''; const id = 'z' + zid++; this.state.zombies.set(id, z); this.zombieInfo.set(id, {}); return id; },
    neueLeiche(o, fest) { const id = 'l' + lid++; this.state.leichen.set(id, { ...o, fest, rest: 1 }); return id; },
  };
  haengendStart(raum);
  assert.equal(raum.state.leichen.size, FLUGFELD_TOTE);
  for (const l of raum.state.leichen.values()) assert.ok(l.fest && l.deko && l.rest === 0);
  const rollen = drahtRollen(welt);
  const flug = rollen.filter(q => !q.lager);
  assert.equal(flug.length, 4);
  const haengend = [...raum.state.zombies.values()].filter(z => z.haengt);
  assert.equal(haengend.length, raum.state.zombies.size);
  assert.ok(haengend.length >= 4 * 2 + rollen.filter(q => q.lager).length, 'zu wenige hängende Zombies: ' + haengend.length);
  for (const z of haengend) assert.ok(z.kriecht);
  for (const info of raum.zombieInfo.values()) assert.equal(info.haengtT, Infinity);
});

// ---------------- Server: Hängenbleiben, Losreißen, Puma ----------------
const PORT = 28500 + Math.floor(Math.random() * 90);
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(fn) {
  assert.ok(await bis(() => !SpielRaum.aktiv, 5000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Draht', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    // die Zombies vom Weltstart (hängend im Lager-Draht) sind da; für die Tests alles leeren
    const lager = [...raum.state.zombies.values()].filter(z => z.haengt).length;
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {}; raum.kriecherChance = 0;
    const p = raum.state.spieler.get(c.sessionId);
    p.waffe = ''; p.munition = 0; raum.extra.get(c.sessionId).pause = 1e6;
    await fn({ c, raum, p, lager });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
}
const ruhig = (raum, id) => { const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; return i; };

test('Lager: beim Weltstart hängen 1–2 Zombies je Rolle im Draht', async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 5000));
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Zaungast', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    const rollen = drahtRollen(raum.welt).filter(q => q.lager).length, h = [...raum.state.zombies.values()].filter(z => z.haengt && z.kriecht);
    assert.ok(rollen >= 3);
    assert.ok(h.length >= rollen && h.length <= rollen * 2, `hängende Zombies ${h.length} bei ${rollen} Rollen`);
    for (const [id, z] of raum.state.zombies) if (z.haengt) assert.equal(raum.zombieInfo.get(id).haengtT, Infinity);
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('S-Draht: Zombie bleibt mit 40 % hängen (einmal je Berührung), beißt, ist erschießbar, reißt sich nach 60 s los', async () => {
  await beitreten(async ({ raum, p }) => {
    const roll = drahtRollen(raum.welt).find(q => q.lager), sp = raum.welt.stuetzpunkt;
    const nahe = (abstand) => [roll.x + roll.ausen[0] * (roll.hb + abstand), roll.y + roll.ausen[1] * (roll.hb + abstand)];
    const neu = (abstand = WERTE.zombieRadius) => { const [x, y] = nahe(abstand); const id = raum.setzeZombie(x, y, ''); return [id, raum.state.zombies.get(id), ruhig(raum, id)]; };
    // weit weg vom Draht: nichts passiert
    { const [, z, info] = neu(60); raum.rnd = () => 0; drahtPruefen(raum, z, info); assert.ok(!z.haengt); }
    // Berührung, Wurf ≥ 40 %: frei
    { const [, z, info] = neu(); raum.rnd = () => 0.5; drahtPruefen(raum, z, info); assert.ok(!z.haengt && !z.kriecht); assert.equal(info.imDraht, true); }
    // Berührung, Wurf < 40 %: hängt (Kriecher-Aussehen); ein zweiter Aufruf in derselben Berührung würfelt nicht neu
    const [id, z, info] = neu();
    raum.rnd = () => 0.39; drahtPruefen(raum, z, info);
    assert.ok(z.haengt && z.kriecht && z.hp > 0 && z.hp < 100);
    assert.equal(info.haengtT, DRAHT_DAUER);
    const x0 = z.x, y0 = z.y;
    // bewegt sich nicht (auch nicht, wenn ein Spieler in der Ferne ist), zappelt nur
    for (let i = 0; i < 100; i++) raum.zombieSchritt(id, z, 0.1);
    assert.equal(z.x, x0); assert.equal(z.y, y0);
    assert.ok(z.haengt, 'nach 10 s noch hängen');
    // beißt einen Spieler in Reichweite
    p.x = x0 - roll.ausen[0] * 17; p.y = y0 - roll.ausen[1] * 17;
    const hp = p.hp; p.hp = 100;
    info.ziel = [...raum.state.spieler.keys()][0];
    raum.extra.get(info.ziel).schonT = 0;
    for (let i = 0; i < 10; i++) raum.zombieSchritt(id, z, 0.1);
    assert.ok(p.hp < 100, 'beißt nicht: hp ' + p.hp + ' vorher ' + hp);
    assert.equal(z.x, x0, 'bewegt sich beim Beißen');
    p.x = 1; p.y = 1; info.ziel = null;
    // nach 60 s reißt er sich los und bleibt Kriecher; danach bewegt er sich wieder
    haengtSchritt(raum, z, info, 40);   // 10 s + 1 s + 40 s = 51 s
    assert.ok(z.haengt, 'noch nicht frei');
    for (let i = 0; i < 120 && z.haengt; i++) raum.zombieSchritt(id, z, 1);
    assert.ok(!z.haengt && z.kriecht, 'reißt sich nicht los');
    // ein hängender Zombie ist erschießbar
    const [id2, z2, info2] = neu(); raum.rnd = () => 0; drahtPruefen(raum, z2, info2); assert.ok(z2.haengt);
    raum.schaden(id2, z2, 999, { name: 'Test', x: 0, y: 0, besiegt: 0 });
    assert.ok(!raum.state.zombies.has(id2), 'nicht erschießbar');
    void sp;
  });
});

test('S-Draht: ein Zombie, der gegen die Rolle läuft, bleibt wirklich hängen (Schrittschleife, Wurf erzwungen)', async () => {
  await beitreten(async ({ raum }) => {
    const roll = drahtRollen(raum.welt).find(q => q.lager);
    // 30 px vor der Rolle, Blick/Gehrichtung auf die Rolle (Wandern ohne Pause)
    const x = roll.x + roll.ausen[0] * (roll.hb + 30), y = roll.y + roll.ausen[1] * (roll.hb + 30);
    const id = raum.setzeZombie(x, y, ''), z = raum.state.zombies.get(id), info = ruhig(raum, id);
    info.steht = false; info.wechsel = 1e9;
    z.richtung = Math.atan2(-roll.ausen[1], -roll.ausen[0]);
    raum.rnd = () => 0;
    for (let i = 0; i < 400 && !z.haengt; i++) raum.zombieSchritt(id, z, 0.1);
    assert.ok(z.haengt && z.kriecht, 'Zombie bleibt nicht hängen');
  });
});

test('Puma fährt Zombies platt (Einstellung leopardUeberrollen), zählt nicht für die Aufgaben; aus: überfährt nicht', async () => {
  await beitreten(async ({ raum }) => {
    const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt, p = st.puma, r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung);
    st.nester = []; st.schuetzen = [];
    assert.ok(p, 'kein Puma');
    const fahre = (an) => {
      const [x0, y0] = r.ort(12, 9), [x1, y1] = r.ort(14, 9), w = Math.atan2(y1 - y0, x1 - x0);
      p.u = 12; p.v = 9; p.x = x0; p.y = y0; p.weg = [[14, 9]]; p.scanU = 1e9; p.hot = null; p.fest = false;
      raum.state.bwX = x0; raum.state.bwY = y0; raum.state.bwW = w;
      raum.einstellungen = () => ({ bundeswehr: { leopardUeberrollen: an } });
      const [zx, zy] = r.ort(13, 9), id = raum.setzeZombie(zx, zy, ''), z = raum.state.zombies.get(id); ruhig(raum, id);
      const [fx, fy] = r.ort(13, 12.5), fid = raum.setzeZombie(fx, fy, ''); ruhig(raum, fid);   // daneben (3,5 Kacheln seitlich): bleibt stehen
      const besiegt = raum.state.besiegt;
      for (let i = 0; i < 60; i++) st.pumaFahren(p, 0.1);
      return { id, fid, besiegt, z };
    };
    let e = fahre(true);
    assert.ok(!raum.state.zombies.has(e.id), 'Zombie nicht überrollt');
    assert.ok(raum.state.zombies.has(e.fid), 'Zombie neben dem Puma überrollt');
    assert.equal(raum.state.besiegt, e.besiegt, 'zählt für die Aufgaben');
    raum.state.zombies.delete(e.fid); raum.zombieInfo.delete(e.fid);
    e = fahre(false);
    assert.ok(raum.state.zombies.has(e.id), 'überrollt trotz Schalter aus');
  });
});

test('ueberrolleZombies (gemeinsam mit dem Leopard): Fußabdruck 72 × 34, Zuschlag 6', () => {
  const zombies = new Map(), gemeldet = [];
  const mk = (x, y) => ({ x, y, hp: 50, ebene: '' });
  zombies.set('a', mk(0, 0)); zombies.set('b', mk(30, 0)); zombies.set('c', mk(0, 26)); zombies.set('d', mk(50, 0));
  const raum = { state: { zombies, besiegt: 3 }, schaden: (id) => { zombies.delete(id); raum.state.besiegt++; }, broadcast: (t) => gemeldet.push(t) };
  const n = ueberrolleZombies(raum, { x: 0, y: 0, richtung: 0 }, 36, 17, { name: 'T', x: 0, y: 0, besiegt: 0 });
  assert.equal(n, 2);   // a (Mitte) und b (30 < 36 + 6); c liegt 26 > 17 + 6 neben der Wanne
  assert.ok(zombies.has('c') && zombies.has('d') && !zombies.has('a') && !zombies.has('b'));
  assert.equal(raum.state.besiegt, 3);
  assert.equal(gemeldet.length, 2);
});
