// Leopard 2A7: Turm dreht begrenzt (Server), MG feuert erst auf Ziel, Hauptkanone nur ab 10 Zombies auf einem Fleck und nie bei Spieler im Radius;
// Schießstand: Fahrzeugwahl (keins / Puma / Leopard / Mörser)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { Leopard, leopardEinst, turmDrehen, winkelDiff, TURM_TEMPO, ZIEL_TOLERANZ, KANONE } from '../server/leopard.mjs';
import { bereinige } from '../server/einstellungen.mjs';
import { SS_START } from '../client/schiessstand_welt.mjs';
import { LEOPARD } from '../client/evak.mjs';

// ---------- Einheiten mit einem Spielraum-Ersatz ----------
function attrappe() {
  const nachrichten = [], r = {
    state: { zombies: new Map(), spieler: new Map(), menschen: new Map(), besiegt: 0 },
    rnd: () => 0, broadcast: (typ, m) => nachrichten.push({ typ, ...m }), laerm() {},
    schaden(id, z, menge) { z.hp -= menge; if (z.hp <= 0) r.state.zombies.delete(id); },
  };
  return { r, nachrichten };
}
const Z = (r, id, x, y, hp = 100) => r.state.zombies.set(id, { x, y, hp, ebene: '' });
const wanne = () => ({ x: 500, y: 500, richtung: 0, turm: 0 });
const E = (z = {}) => leopardEinst({ leopardReichweite: 40, leopardPause: 0.4, leopardSchaden: 100, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, ...z }, 1);
const pivotX = 500 + LEOPARD.turmX;

test('Turm dreht gleichmäßig und höchstens mit 0,7 rad/s', () => {
  assert.equal(TURM_TEMPO, 0.7);
  let w = 0;
  for (let i = 0; i < 10; i++) { const n = turmDrehen(w, Math.PI, 0.1); assert.ok(Math.abs(winkelDiff(w, n)) <= 0.07 + 1e-9, 'zu schnell'); w = n; }
  assert.ok(Math.abs(w - 0.7) < 1e-9, 'nach 1 s genau 0,7 rad: ' + w);
  assert.equal(turmDrehen(0.05, 0.1, 1), 0.1, 'kommt am Ziel an, ohne zu überschwingen');
  assert.ok(turmDrehen(0, -Math.PI + 0.1, 0.1) < 0, 'dreht den kürzeren Weg (gegen den Uhrzeigersinn)');
});

test('MG feuert erst, wenn der Turm höchstens 10° vom Ziel abweicht', () => {
  const { r, nachrichten } = attrappe(), f = wanne(), l = new Leopard(r), e = E({ leopardKanone: false });
  Z(r, 'a', pivotX, 500 - 150);                       // genau links (−90°)
  let erstesMg = null, t = 0;
  for (let i = 0; i < 100 && erstesMg === null; i++) {
    l.schritt(f, 0.05, e); t += 0.05;
    assert.ok(Math.abs(winkelDiff(0, f.turm)) <= 0.7 * t + 1e-9, 'Turm dreht schneller als 0,7 rad/s');
    if (nachrichten.some(m => m.typ === 'bwschuss')) erstesMg = t;
  }
  assert.ok(erstesMg, 'MG feuert nie');
  assert.ok(Math.abs(winkelDiff(f.turm, -Math.PI / 2)) <= ZIEL_TOLERANZ + 1e-9, 'MG feuert, bevor der Turm auf dem Ziel steht');
  assert.ok(erstesMg > (Math.PI / 2 - ZIEL_TOLERANZ) / 0.7 - 0.06, 'MG feuert zu früh: ' + erstesMg);
  const m = nachrichten.find(q => q.typ === 'bwschuss');
  assert.equal(m.evak, 'panzer'); assert.ok(Number.isFinite(m.tw));
});

test('Ohne Ziel kehrt der Turm gleichmäßig in Fahrtrichtung zurück', () => {
  const { r } = attrappe(), f = wanne(), l = new Leopard(r), e = E();
  l.schritt(f, 0.05, e); f.turm = 2;
  for (let i = 0; i < 10; i++) l.schritt(f, 0.1, e);
  assert.ok(Math.abs(f.turm - 1.3) < 1e-9, 'nach 1 s (2 − 0,7): ' + f.turm);
});

// zehn Zombies dicht beieinander (Kreis < 3 m Radius), 30 m vor dem Turm
const haufen = (r, n, x = pivotX + 240, y = 500) => { for (let i = 0; i < n; i++) Z(r, 'h' + i, x + Math.cos(i * 2.4) * (i % 3) * 8, y + Math.sin(i * 2.4) * (i % 3) * 8); };

test('Hauptkanone: erst ab 10 Zombies auf einem Fleck, Turm dreht erst hin, Explosion mit 5 m Radius, danach Pause', () => {
  const { r, nachrichten } = attrappe(), f = { x: 500, y: 500, richtung: Math.PI, turm: 0 }, l = new Leopard(r), e = E({ leopardReichweite: 1 });
  const px = f.x + Math.cos(f.richtung) * LEOPARD.turmX;
  haufen(r, 9, px + 240 * Math.cos(-0.5), 500 + 240 * Math.sin(-0.5));
  l.kuehlK = 0;
  for (let i = 0; i < 80; i++) l.schritt(f, 0.05, e);
  assert.equal(nachrichten.filter(m => m.typ === 'leopardkanone').length, 0, '9 Zombies reichen nicht');
  Z(r, 'zehnter', px + 240 * Math.cos(-0.5), 500 + 240 * Math.sin(-0.5));
  let schuss = null, t = 0;
  for (let i = 0; i < 200 && !schuss; i++) {
    l.schritt(f, 0.05, e); t += 0.05;
    schuss = nachrichten.find(m => m.typ === 'leopardkanone');
  }
  assert.ok(schuss, 'Kanone schießt nicht');
  assert.ok(Math.abs(winkelDiff(f.turm, schuss.w)) < 1e-9 && Math.abs(winkelDiff(f.turm, -0.5)) <= ZIEL_TOLERANZ + 0.05, 'Turm war nicht auf dem Ziel');
  assert.ok(t > 0.5, 'Turm hat nicht gedreht (Turm startete bei 0, Ziel ~ -0,5 rad): ' + t);
  assert.equal(schuss.r, KANONE.schadenRadius * 8, 'Radius 5 m');
  assert.ok(Math.hypot(schuss.x1 - px, schuss.y1 - 500) > 80, 'Mündungsfeuer nicht am Rohrende');
  assert.ok(nachrichten.some(m => m.typ === 'explosion' && m.r === 40), 'keine Explosion');
  assert.ok([...r.state.zombies.values()].every(z => z.hp < 100) || r.state.zombies.size < 10, 'kein Flächenschaden');
  // Pause: 8 s kein zweiter Schuss, auch wenn wieder ein Haufen da ist
  haufen(r, 12, px + 240 * Math.cos(-0.5), 500 + 240 * Math.sin(-0.5));
  const n0 = nachrichten.filter(m => m.typ === 'leopardkanone').length;
  for (let i = 0; i < 150; i++) l.schritt(f, 0.05, e);   // 7,5 s
  assert.equal(nachrichten.filter(m => m.typ === 'leopardkanone').length, n0, 'Pause unterschritten');
  for (let i = 0; i < 100; i++) l.schritt(f, 0.05, e);
  assert.ok(nachrichten.filter(m => m.typ === 'leopardkanone').length > n0, 'schießt nach der Pause nicht wieder');
});

test('Hauptkanone: nie bei Spieler oder Mensch im Sicherheitsradius, Einstellung aus = nie', () => {
  for (const wer of ['spieler', 'menschen']) {
    const { r, nachrichten } = attrappe(), f = wanne(), l = new Leopard(r), e = E({ leopardReichweite: 1 });
    haufen(r, 14); l.kuehlK = 0;
    r.state[wer].set('x', { x: pivotX + 240 + 40, y: 500, ebene: '' });   // 5 m neben dem Haufen
    for (let i = 0; i < 200; i++) l.schritt(f, 0.05, e);
    assert.equal(nachrichten.filter(m => m.typ === 'leopardkanone').length, 0, 'schießt trotz ' + wer);
    r.state[wer].clear();                                                 // weg: jetzt darf er
    for (let i = 0; i < 40; i++) l.schritt(f, 0.05, e);
    assert.equal(nachrichten.filter(m => m.typ === 'leopardkanone').length, 1, 'schießt nicht, nachdem der Weg frei ist (' + wer + ')');
  }
  const { r, nachrichten } = attrappe(), l = new Leopard(r);
  haufen(r, 14); l.kuehlK = 0;
  for (let i = 0; i < 200; i++) l.schritt(wanne(), 0.05, E({ leopardKanone: false, leopardReichweite: 1 }));
  assert.equal(nachrichten.filter(m => m.typ === 'leopardkanone').length, 0, 'schießt trotz Einstellung aus');
  // außerhalb 15–60 m: zu nah und zu weit
  for (const abstand of [100, 600]) {
    const a = attrappe(), l2 = new Leopard(a.r); haufen(a.r, 14, pivotX + abstand, 500); l2.kuehlK = 0;
    for (let i = 0; i < 200; i++) l2.schritt(wanne(), 0.05, E({ leopardReichweite: 1 }));
    assert.equal(a.nachrichten.filter(m => m.typ === 'leopardkanone').length, 0, 'schießt auf ' + abstand + ' px');
  }
});

test('Einstellungen: leopardKanone (an), leopardKanonePause (8), leopardKanoneMin (10) mit Grenzen', () => {
  const v = bereinige({}).bundeswehr;
  assert.deepEqual([v.leopardKanone, v.leopardKanonePause, v.leopardKanoneMin], [true, 8, 10]);
  const b = bereinige({ bundeswehr: { leopardKanone: 'ja', leopardKanonePause: 0, leopardKanoneMin: 999 } }).bundeswehr;
  assert.deepEqual([b.leopardKanone, b.leopardKanonePause, b.leopardKanoneMin], [true, 3, 50]);
  assert.equal(bereinige({ bundeswehr: { leopardKanone: false } }).bundeswehr.leopardKanone, false);
});

// ---------- Schießstand: Fahrzeugwahl ----------
const PORT = 27400 + Math.floor(Math.random() * 200);
let server;
const warte = ms => new Promise(rr => setTimeout(rr, ms));
async function bis(bedingung, ms = 5000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });
const beitreten = async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).create('schiessstand', { name: 'Uebung' });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.kriecherChance = 0;
  return { c, raum };
};
const stelleZombies = (raum, n, x, y) => {
  for (let i = 0; i < n; i++) { const id = raum.setzeZombie(x + (i % 3) * 6, y + Math.floor(i / 3) * 6, '', true); raum.zombieInfo.get(id).steht = true; raum.zombieInfo.get(id).uebung = false; raum.state.zombies.get(id).hp = 100; }
};

test('Schießstand: Fahrzeugwahl – ohne Wahl schießt keins; Leopard und Mörserpanzer stehen am Lager und feuern', async () => {
  const { c, raum } = await beitreten();
  try {
    assert.equal(raum.fahrzeug, '');
    assert.equal(raum.state.fahrzeuge.size, 0, 'Fahrzeug ohne Wahl');
    // ungültige Wahl wird ignoriert
    c.send('ss_fahrzeug', { art: 'zeppelin' }); await warte(100);
    assert.equal(raum.fahrzeug, '');
    // Leopard
    const kanonen = [], mg = [];
    c.onMessage('leopardkanone', m => kanonen.push(m)); c.onMessage('bwschuss', m => mg.push(m)); c.onMessage('moerser', () => {});
    c.send('ss_fahrzeug', { art: 'leopard' });
    assert.ok(await bis(() => raum.fahrzeug === 'leopard' && raum.state.fahrzeuge.get('leopard1')), 'Leopard fehlt');
    const f = raum.state.fahrzeuge.get('leopard1');
    assert.equal(f.art, 'evakuierung'); assert.equal(raum.state.evakArt, 'panzer');
    assert.ok(Math.hypot(f.x - SS_START.x, f.y - SS_START.y) < 250, 'steht nicht am Lager');
    raum.leopard.kuehlK = 0;
    stelleZombies(raum, 12, f.x + 30 + 8 * 28, f.y + 4 * 8);       // Haufen ca. 28 m vor dem Leopard (Spieler weit weg)
    for (const p of raum.state.spieler.values()) { p.x = SS_START.x + 400; p.y = SS_START.y - 5; }   // Spieler außerhalb des Sicherheitsradius
    assert.ok(await bis(() => kanonen.length > 0 || mg.length > 0, 6000), 'Leopard schießt nicht');
    assert.ok(await bis(() => kanonen.length > 0, 8000), 'Kanone schießt nicht auf den Haufen');
    // Wechsel auf Mörser: Leopard weg, M113 da
    c.send('ss_fahrzeug', { art: 'moerser' });
    assert.ok(await bis(() => raum.fahrzeug === 'moerser' && raum.moerser.fahrzeug()), 'Mörser fehlt');
    assert.ok(!raum.state.fahrzeuge.has('leopard1') && raum.state.evakArt === '');
    assert.equal(raum.moerser.fahrzeug().art, 'moerser');
    assert.ok(Math.hypot(raum.moerser.fahrzeug().x - SS_START.x, raum.moerser.fahrzeug().y - SS_START.y) < 250, 'Mörser steht nicht am Lager');
    // Puma: Mörser weg
    c.send('ss_fahrzeug', { art: 'puma' });
    assert.ok(await bis(() => raum.fahrzeug === 'puma' && !raum.moerser.fahrzeug()), 'Mörser bleibt');
    // alter Schalter ss_panzer: aus = keins
    c.send('ss_panzer', { an: false });
    assert.ok(await bis(() => raum.fahrzeug === ''), 'ss_panzer aus');
  } finally { await c.leave(); }
});

test('Schießstand: Mörserpanzer beschießt Zombiegruppen (Spieler weit weg)', async () => {
  const { c, raum } = await beitreten();
  try {
    const schuesse = []; c.onMessage('moerser', m => schuesse.push(m)); c.onMessage('explosion', () => {});
    c.send('ss_fahrzeug', { art: 'moerser' });
    assert.ok(await bis(() => raum.moerser.fahrzeug()), 'Mörser fehlt');
    const f = raum.moerser.fahrzeug(); raum.moerser.kuehl = 0;
    for (const p of raum.state.spieler.values()) { p.x = SS_START.x + 400; p.y = SS_START.y - 5; }
    stelleZombies(raum, 6, f.x - 20, f.y + 40 * 8);
    assert.ok(await bis(() => schuesse.length > 0, 6000), 'Mörser schießt nicht');
  } finally { await c.leave(); }
});
