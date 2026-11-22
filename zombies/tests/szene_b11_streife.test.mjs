// Streifenfahrt von Puma und Leopard 2 an der B 11 (geretsried2): Abstand, bleibt im Bereich, überrollt Zombies, macht geparkte Autos platt
// und schiebt sie ein Stück weiter (deterministisch, nie in eine Wand), Leopard-Kanone auf Zombiehaufen (server/szene_b11*.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { b11Geometrie } from '../server/szene_b11_geo.mjs';
import { STREIFE, MIN_ABSTAND } from '../server/szene_b11_fahrt.mjs';
import { plattLesen, plattKodieren, PLATT_MAX } from '../client/b11_platt.mjs';
import { frei, setzeKartengroesse } from '../client/welt.mjs';

const PORT = 28800 + Math.floor(Math.random() * 90);
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
  p.x = 100; p.y = 100;   // fern vom Geschehen
  return { c, raum, p };
}
const mitSzene = fn => async () => {
  await frisch();
  const t = await beitreten();
  try { await fn(t); } finally { await t.c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
};
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, '', false); const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; raum.state.zombies.get(id).hp = 100; return id; };
const stumm = sz => { sz.puma.kuehl = 1e9; if (sz.leopardLogik) { sz.leopardLogik.kuehlMg = 1e9; sz.leopardLogik.kuehlK = 1e9; } };

test('Kodierung des Schubs: hin und zurück, Vorzeichen', () => {
  for (const [dx, dy] of [[0, 0], [5, -3], [-8, 8], [12, 0], [-12, -12]]) assert.deepEqual(plattLesen(plattKodieren(dx, dy)), { dx, dy });
});

test('Puma und Leopard streifen im Bereich, halten Abstand zu allen Fahrzeugen, wenden an den Enden', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11, K = b11Geometrie(raum.welt).kreuzung;
  assert.equal(sz.streifen.length, 2, 'beide Streifen aktiv');
  const [sp, sl] = sz.streifen;
  const fz = [...raum.state.fahrzeuge.values()].filter(f => f.art === 'feuerwehr');
  assert.ok(fz.length >= 1);
  let minAbstand = Infinity, minFremd = Infinity, weg = [0, 0], maxK = 0;
  const enden = [new Set(), new Set()], alt = [{ x: sp.k.x, y: sp.k.y }, { x: sl.k.x, y: sl.k.y }];
  for (let t = 0; t < 1500; t += 0.1) {   // 25 Minuten
    sz.schritt(0.1); stumm(sz);
    [sp, sl].forEach((st, i) => {
      weg[i] += Math.hypot(st.k.x - alt[i].x, st.k.y - alt[i].y); alt[i] = { x: st.k.x, y: st.k.y };
      maxK = Math.max(maxK, Math.hypot(st.k.x - K.x, st.k.y - K.y));
      enden[i].add(st.idx);
      assert.ok(frei(raum.welt, st.k.x, st.k.y, st.def.rad - 6), `Fahrzeug ${i} steckt in einem Hindernis`);
      for (const f of fz) minFremd = Math.min(minFremd, Math.hypot(st.k.x - f.x, st.k.y - f.y));
    });
    minAbstand = Math.min(minAbstand, Math.hypot(sp.k.x - sl.k.x, sp.k.y - sl.k.y));
  }
  assert.ok(weg[0] > 600 && weg[1] > 600, 'Streifen fahren: ' + weg.map(Math.round));
  assert.ok(enden[0].size === sp.route.length && enden[1].size === sl.route.length, 'alle Wegpunkte angefahren: ' + enden.map(e => [...e].sort().join(',')).join(' / '));
  assert.ok(maxK < 1000, 'bleibt im Bereich Parkplatz–Kreuzung–Rathaus: ' + maxK);
  assert.ok(minAbstand >= MIN_ABSTAND - 1, 'Abstand Puma–Leopard ' + minAbstand);
  assert.ok(minFremd >= 15 * 8, 'Abstand zur Feuerwehr unter 15 m: ' + minFremd);
  assert.ok(STREIFE.puma.tempo <= 30 && STREIFE.leopard.tempo <= 30, 'langsam');
}));

test('Puma, Leopard und Feuerwehr stehen am Start mindestens 15 m auseinander', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11;
  const pk = [['puma', sz.puma], ['leopard', sz.leopard], ...['stauFeuerwehr'].map(id => [id, raum.state.fahrzeuge.get(id)])];
  for (let i = 0; i < pk.length; i++) for (let j = i + 1; j < pk.length; j++) {
    const d = Math.hypot(pk[i][1].x - pk[j][1].x, pk[i][1].y - pk[j][1].y);
    assert.ok(d >= 15 * 8, `${pk[i][0]}–${pk[j][0]} nur ${(d / 8).toFixed(1)} m`);
  }
}));

test('Streife überrollt Zombies auf dem Weg (zählt nicht für die Spieler)', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11, st = sz.streifen[1], a = st.route[0], b = st.route[1];
  const id = zombie(raum, (a.x + b.x) / 2, (a.y + b.y) / 2);
  const besiegt = raum.state.besiegt;
  for (let t = 0; t < 400 && raum.state.zombies.get(id)?.hp > 0; t += 0.1) { sz.schritt(0.1); stumm(sz); }
  assert.ok(!(raum.state.zombies.get(id)?.hp > 0), 'Zombie lebt noch');
  assert.equal(raum.state.besiegt, besiegt);
}));

test('Autos werden platt (Kofferraum leer), ein Stück geschoben, nie in eine Wand, deterministisch', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11, st = sz.streifen[0], w = raum.welt;
  assert.ok(sz.parkAutos.length >= 20, 'geparkte Autos im Bereich: ' + sz.parkAutos.length);
  const lauf = () => {
    const erg = [];
    raum.state.platt.clear(); sz.kontakt.clear();
    for (const b of sz.parkAutos) {
      for (let h = 0; h < 8; h++) {
        raum.state.platt.delete(b.id); sz.kontakt.clear();
        st.k.x = b.x; st.k.y = b.y; st.k.richtung = h * Math.PI / 4;
        sz.plattmachen(st);
        const v = raum.state.platt.get(b.id);
        assert.notEqual(v, undefined, 'Auto unter der Wanne nicht platt: ' + b.id);
        const { dx, dy } = plattLesen(v), l = Math.hypot(dx, dy);
        assert.ok(l <= PLATT_MAX + 1, 'zu weit geschoben ' + l);
        assert.ok(l === 0 || frei(w, b.x + dx, b.y + dy, 14), 'Auto in die Wand geschoben: ' + b.id);
        erg.push(v);
      }
    }
    return erg;
  };
  const e1 = lauf(), e2 = lauf();
  assert.deepEqual(e1, e2, 'nicht deterministisch');
  assert.ok(e1.some(v => { const { dx, dy } = plattLesen(v); return Math.hypot(dx, dy) >= 4; }), 'es wird tatsächlich geschoben');
  // Kofferraum: leer, nicht mehr durchsuchbar
  const b = sz.parkAutos[0];
  raum.state.platt.clear(); sz.kontakt.clear();
  raum.setzeInhalt(b.id, ['munition']);
  st.k.x = b.x; st.k.y = b.y; st.k.richtung = 0;
  sz.plattmachen(st);
  assert.equal(raum.state.behaelter.get(b.id).rest, 0);
  assert.deepEqual([...raum.inhalte.get(b.id)], []);
  // mehrere Durchgänge schieben höchstens PLATT_MAX weit
  for (let i = 0; i < 10; i++) { sz.kontakt.clear(); sz.plattmachen(st); }
  const { dx, dy } = plattLesen(raum.state.platt.get(b.id));
  assert.ok(Math.hypot(dx, dy) <= PLATT_MAX + 1);
  // im selben Durchgang (Fahrzeug bleibt darüber) wird nicht weitergeschoben
  const vorher = raum.state.platt.get(b.id);
  sz.plattmachen(st); sz.plattmachen(st);
  assert.equal(raum.state.platt.get(b.id), vorher);
  // ausgebrannte Autos bleiben unberührt
  const b2 = sz.parkAutos[1];
  raum.state.verbrannt.set('auto:' + b2.id, true);
  st.k.x = b2.x; st.k.y = b2.y; sz.kontakt.clear();
  sz.plattmachen(st);
  assert.equal(raum.state.platt.has(b2.id), false);
}));

test('Leopard schießt mit der Hauptkanone auf einen Haufen von mehr als 10 Zombies', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11, l = sz.leopard, got = [];
  const alt = raum.broadcast.bind(raum); raum.broadcast = (a, m) => { got.push(a); return alt(a, m); };
  // freien Fleck 300 px vom Leopard suchen, 12 Zombies dicht beieinander
  let ort = null;
  for (let k = 0; k < 36 && !ort; k++) {
    const w = k * Math.PI / 18, x = l.x + Math.cos(w) * 300, y = l.y + Math.sin(w) * 300;
    if (frei(raum.welt, x, y, 20)) ort = { x, y };
  }
  assert.ok(ort);
  for (let i = 0; i < 12; i++) zombie(raum, ort.x + (i % 4) * 6, ort.y + (i >> 2) * 6);
  sz.puma.kuehl = 1e9; sz.leopardLogik.kuehlK = 0; sz.leopardLogik.scanT = 0;
  for (let t = 0; t < 12 && !got.includes('leopardkanone'); t += 0.1) { sz.leopardSchritt(0.1); sz.leopardLogik.kuehlMg = 1e9; }
  assert.ok(got.includes('leopardkanone'), 'Kanone schweigt');
}));

test('Posten aufgegeben: die Panzer stehen still', mitSzene(async ({ raum }) => {
  const sz = raum.szeneB11;
  for (const q of sz.soldaten) q.hp = 0;
  sz.nahkampf(0.25); sz.schritt(0.1);
  assert.equal(sz.aufgegeben, true);
  const vor = sz.streifen.map(s => [s.k.x, s.k.y]);
  for (let t = 0; t < 30; t += 0.1) sz.schritt(0.1);
  sz.streifen.forEach((s, i) => assert.deepEqual([s.k.x, s.k.y], vor[i]));
}));

test('Leopard (B11) unterstützt Spieler in 150 m mit MG auch auf Zombies in 40 m, ohne Spieler in der Nähe schweigt er', mitSzene(async ({ raum, p }) => {
  const sz = raum.szeneB11, l = sz.leopard, got = [];
  const alt = raum.broadcast.bind(raum); raum.broadcast = (a, m) => { got.push(a); return alt(a, m); };
  raum.einstellungen().bundeswehr.leopardReichweite = 25;
  let id = null;
  for (let k = 0; k < 36 && !id; k++) {
    const w = k * Math.PI / 18, x = l.x + Math.cos(w) * 320, y = l.y + Math.sin(w) * 320;
    if (frei(raum.welt, x, y, 20)) id = zombie(raum, x, y);
  }
  assert.ok(id);
  sz.puma.kuehl = 1e9; sz.leopardLogik.kuehlK = 1e9; sz.streifen.forEach(s => { s.steht = 1e9; s.wartet = 1e9; });
  const lauf = () => { for (let t = 0; t < 6; t += 0.1) sz.leopardSchritt(0.1); };
  lauf();   // Spieler fern (100,100): nichts
  assert.ok(!got.includes('bwschuss'), 'ohne Spieler in der Nähe schießt der Leopard auf 40 m');
  p.x = l.x + 800; p.y = l.y;   // 100 m
  lauf();
  assert.ok(got.includes('bwschuss'), 'Leopard schweigt trotz Spieler in der Nähe');
}));
