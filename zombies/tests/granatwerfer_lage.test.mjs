// Granatwerfer: Auto-Schuss bis 25 m, Mehrfachfeuer mit Nachladen, Nacht/Nebel, naher Zombie; Taschenlampe im Fahrzeug
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import * as SU from '../server/superuser.mjs';
import { WAFFEN, GRANATE } from '../client/welt.mjs';
import { lampeAn } from '../client/pkwlicht.mjs';
import { lichtquellen } from '../server/schussdunkel.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

async function spieler(name) {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  p.rucksack.splice(0, p.rucksack.length);
  const ort = raum.welt.start; p.x = ort.x; p.y = ort.y; p.ebene = ''; p.unten = false;
  const fluege = [], explosionen = [];
  c.onMessage('granate', m => fluege.push(m)); c.onMessage('explosion', m => explosionen.push(m));
  return { c, raum, p, x, fluege, explosionen };
}
function zombieIn(raum, p, abstand) {
  const id = raum.setzeZombie(p.x + abstand, p.y, '');
  const info = raum.zombieInfo.get(id);
  info.steht = true; info.schlaeft = false; info.ziel = null; info.wechsel = 99;
  return id;
}

test('Werte: Reichweite 25 m (Vorgabe 25, Backend einstellbar)', () => {
  assert.equal(WAFFEN.granatwerfer.reichweite, 200);
});

test('Granatwerfer: mehrere Schüsse hintereinander mit automatischem Nachladen, Granaten werden verbraucht, Explosion am Ziel', async () => {
  const s = await spieler('Serie');
  let halte = null;
  try {
    s.raum.state.uhr = 12 * 60;
    SU.waffeSetzen(s.raum, s.p, s.x, 'granatwerfer');
    assert.ok(await bis(() => s.p.magazin === 1), 'nicht geladen');
    s.p.granaten = 2;   // Vorrat außerhalb des Magazins: 1 im Rohr + 2 = 3 Schuss
    const ziele = [];
    for (let i = 0; i < 3; i++) {
      const id = zombieIn(s.raum, s.p, 150);   // 18,75 m
      ziele.push(id);
      const n = s.fluege.length;
      assert.ok(await bis(() => s.fluege.length > n, 9000), `Schuss ${i + 1} fehlt (Magazin ${s.p.magazin}, Vorrat ${s.p.granaten}, Nachladen ${s.p.nachladen})`);
      assert.equal(s.fluege[n].werfer, true);
      halte = setInterval(() => { const z = s.raum.state.zombies.get(id); if (z) { z.x = s.fluege[n].x2; z.y = s.fluege[n].y2; } }, 5);
      assert.ok(await bis(() => !s.raum.state.zombies.has(id) || s.raum.state.zombies.get(id).hp <= 0, 2500), `Zombie ${i + 1} nicht getroffen`);
      clearInterval(halte); halte = null;
      s.raum.state.zombies.clear(); s.raum.zombieInfo.clear();
    }
    // Der Zombie fällt im Server-Tick; die Nachricht „explosion“ kommt erst danach über die Verbindung an
    assert.ok(await bis(() => s.explosionen.length >= 3, 2000), 'Explosionen gemeldet: ' + s.explosionen.length);
    assert.equal(s.fluege.length, 3);
    assert.equal(s.explosionen[0].r, GRANATE.radius, 'Radius wie Handgranate');
    assert.equal(s.p.hp, 100, 'Schütze bleibt unverletzt');
  } finally { clearInterval(halte); await s.c.leave(); }   // Intervall auch nach einem Fehlschlag beenden (sonst hängt der Lauf)
});

test('Granatwerfer: Reichweite 25 m – 220 px kein Schuss, Mindestabstand 4,5 m – nur ein naher Zombie kein Schuss', async () => {
  const s = await spieler('Grenzen');
  try {
    SU.waffeSetzen(s.raum, s.p, s.x, 'granatwerfer');
    assert.ok(await bis(() => s.p.magazin === 1));
    const weit = zombieIn(s.raum, s.p, 220);
    await warte(700);
    assert.equal(s.fluege.length, 0, 'schießt über 25 m');
    s.raum.state.zombies.delete(weit); s.raum.zombieInfo.delete(weit);
    zombieIn(s.raum, s.p, 30);
    await warte(700);
    assert.equal(s.fluege.length, 0); assert.equal(s.p.magazin, 1, 'Munition bleibt');
  } finally { await s.c.leave(); }
});

test('Granatwerfer: ein naher Zombie (36–60 px) blockiert den Schuss auf einen weiter entfernten nicht', async () => {
  const s = await spieler('Nah');
  try {
    SU.waffeSetzen(s.raum, s.p, s.x, 'granatwerfer');
    assert.ok(await bis(() => s.p.magazin === 1));
    zombieIn(s.raum, s.p, 20 + 30);   // < Mindestabstand 36? nein: 50 px liegt darüber → er selbst ist Ziel
    s.raum.state.zombies.clear(); s.raum.zombieInfo.clear();
    zombieIn(s.raum, s.p, 30);        // zu nah, außer Stoßreichweite
    zombieIn(s.raum, s.p, 150);
    assert.ok(await bis(() => s.fluege.length > 0, 2500), 'kein Abschuss trotz sicherem Ziel');
    assert.ok(Math.hypot(s.fluege[0].x2 - s.p.x, s.fluege[0].y2 - s.p.y) > 100, 'Ziel muss der ferne Zombie sein');
  } finally { await s.c.leave(); }
});

for (const [titel, uhr, nebel] of [['Tag', 12 * 60, 0], ['Nacht', 0, 0], ['Nebel', 12 * 60, 1]]) {
  test(`Granatwerfer (Superuser-Waffe) schießt automatisch: ${titel}, auch mit Lampe`, async () => {
    const s = await spieler('Su' + titel);
    try {
      s.raum.state.uhr = uhr; s.raum.state.nebel = nebel; s.p.lampe = 100;
      SU.waffeSetzen(s.raum, s.p, s.x, 'granatwerfer');
      assert.ok(await bis(() => s.p.magazin === 1), 'Magazin nicht geladen');
      zombieIn(s.raum, s.p, 120);
      assert.ok(await bis(() => s.fluege.length > 0, 3000), 'kein Abschuss');
      assert.equal(s.p.magazin, 0);
    } finally { await s.c.leave(); }
  });
}

test('Taschenlampe im Fahrzeug: kein Kegel/keine Lampe an der Figur, Lampenzeit läuft nicht ab, Schussdunkel zählt sie nicht', async () => {
  assert.equal(lampeAn({ lampe: 100 }), true);
  assert.equal(lampeAn({ lampe: 0 }), false);
  assert.equal(lampeAn({ lampe: 100, imBoxer: true, anBord: true }), false, 'Pkw, Streifenwagen, Boxer, Puma, Leopard');
  assert.equal(lampeAn({ lampe: 100, anBord: true }), false, 'Evakuierungsfahrzeug');
  const q = lichtquellen({ spieler: new Map([['a', { x: 0, y: 0, richtung: 0, lampe: 100, ebene: '', anBord: true }], ['b', { x: 500, y: 0, richtung: 0, lampe: 100, ebene: '' }]]), fahrzeuge: new Map(), feuer: new Map() });
  assert.equal(q.lampen.length, 1, 'nur der Fußgänger leuchtet');
  const s = await spieler('Fahrer');
  try {
    s.raum.state.uhr = 0;
    s.p.lampe = 1000;
    s.raum.beduerfnisse(s.p, s.x, 5);
    assert.equal(s.p.lampe, 995, 'zu Fuß läuft die Zeit ab');
    s.p.anBord = true; s.p.imBoxer = true;
    s.raum.beduerfnisse(s.p, s.x, 5);
    assert.equal(s.p.lampe, 995, 'im Fahrzeug steht die Lampenzeit');
    s.p.anBord = false; s.p.imBoxer = false;
    s.raum.beduerfnisse(s.p, s.x, 5);
    assert.equal(s.p.lampe, 990, 'nach dem Aussteigen wie vorher');
  } finally { await s.c.leave(); }
});
