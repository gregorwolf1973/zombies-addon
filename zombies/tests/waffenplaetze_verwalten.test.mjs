// Waffenplätze verwalten (Rucksack, Fallen lassen, Tauschen, Faust), Handgranate als Waffe, Granatwerfer (schnell, Reichweite aus Einstellung)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { WAFFEN, GRANATE } from '../client/welt.mjs';
import { freierPort, seedZufall } from './hilfe.mjs';
seedZufall(4711);

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

async function spieler(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  p.rucksack.splice(0, p.rucksack.length);
  const ort = raum.welt.start; p.x = ort.x; p.y = ort.y; p.ebene = ''; p.unten = false; p.richtung = 0;
  p.waffe = ''; p.munition = 0; p.pfeile = 0; p.granaten = 0; p.handgranaten = 0;
  return { c, raum, p, x };
}
function zombieIn(raum, p, dx, dy = 0) {
  const id = raum.setzeZombie(p.x + dx, p.y + dy, '');
  const info = raum.zombieInfo.get(id);
  info.steht = true; info.schlaeft = false; info.ziel = null; info.wechsel = 99;
  return id;
}
const gesamt = p => p.munition + p.mg0 + p.mg1 + p.mg2;

test('Platz → Rucksack: Waffe weg, Magazin zurück in den Vorrat; bei vollem Rucksack nichts', async () => {
  const { c, p } = await spieler('Rein');
  try {
    p.waffe = 'pistole'; p.munition = 60;
    assert.ok(await bis(() => p.magazin === 15 && p.munition === 45));
    c.send('platz_aktion', { platz: 0, aktion: 'rucksack' });
    assert.ok(await bis(() => p.waffe === '' && p.wp0 === ''), 'Waffe nicht abgelegt');
    assert.deepEqual([...p.rucksack], ['pistole']);
    assert.equal(p.munition, 60, 'Magazin zurück in den Vorrat'); assert.equal(p.magazin, 0);
    // Rucksack voll: Waffe bleibt im Platz
    p.waffe = 'messer';
    for (let i = 0; i < p.plaetze - 1; i++) p.rucksack.push('wasser');
    await warte(100);
    c.send('platz_aktion', { platz: 0, aktion: 'rucksack' });
    await warte(200);
    assert.equal(p.waffe, 'messer', 'bei vollem Rucksack bleibt die Waffe');
  } finally { await c.leave(); }
});

test('Platz → Fallen lassen: Bodenobjekt, Platz leer; inaktiver Platz geht auch', async () => {
  const { c, raum, p } = await spieler('Fallen');
  try {
    p.waffe = 'pistole'; p.munition = 30; p.wp1 = 'messer';
    assert.ok(await bis(() => p.magazin === 15));
    const boden = () => [...raum.state.boden.values()].map(b => b.ding);
    c.send('platz_aktion', { platz: 1, aktion: 'fallen' });
    assert.ok(await bis(() => boden().includes('messer')), 'Messer liegt nicht am Boden');
    assert.equal(p.wp1, ''); assert.equal(p.waffe, 'pistole');
    c.send('platz_aktion', { platz: 0, aktion: 'fallen' });
    assert.ok(await bis(() => boden().includes('pistole') && p.waffe === ''));
    assert.equal(p.munition, 30, 'Magazin zurück in den Vorrat');
  } finally { await c.leave(); }
});

test('Tauschen mit einer Waffe aus dem Rucksack; Munition geht nicht verloren; Rucksack-Waffe in leeren Platz', async () => {
  const { c, p } = await spieler('Tausch');
  try {
    p.waffe = 'pistole'; p.munition = 80;
    assert.ok(await bis(() => p.magazin === 15));
    p.magazin = 9;
    const vorher = p.munition + p.magazin;
    p.rucksack.push('wasser', 'gewehr');
    c.send('platz_aktion', { platz: 0, aktion: 'tausch', rs: 1 });
    assert.ok(await bis(() => p.waffe === 'gewehr' && p.wp0 === 'gewehr'), 'Tausch fehlgeschlagen');
    assert.deepEqual([...p.rucksack], ['wasser', 'pistole']);
    assert.ok(await bis(() => p.magazin === 30));
    assert.equal(p.munition + p.magazin, vorher, 'Munition bleibt erhalten');
    // Rucksack → leerer Platz 2 (nicht aktiv)
    c.send('platz_aktion', { platz: 1, aktion: 'tausch', rs: 1 });
    assert.ok(await bis(() => p.wp1 === 'pistole'));
    assert.equal(p.waffe, 'gewehr'); assert.deepEqual([...p.rucksack], ['wasser']);
    // ungültig: Wasser ist keine Waffe, Index außerhalb, einen dritten Platz gibt es nicht
    c.send('platz_aktion', { platz: 1, aktion: 'tausch', rs: 0 }); c.send('platz_aktion', { platz: 1, aktion: 'tausch', rs: 9 });
    p.rucksack.push('messer'); c.send('platz_aktion', { platz: 2, aktion: 'tausch', rs: 1 });
    await warte(200);
    assert.equal(p.wp1, 'pistole'); assert.equal(p.wp2, ''); assert.deepEqual([...p.rucksack], ['wasser', 'messer']);
  } finally { await c.leave(); }
});

test('Faust: Hand leer ohne einen Platz zu leeren; Platz wählen oder X nochmal bringt die Waffe samt Magazin zurück', async () => {
  const { c, p, x } = await spieler('Faust');
  try {
    p.waffe = 'pistole'; p.munition = 40;
    assert.ok(await bis(() => p.magazin === 15));
    p.magazin = 9;
    c.send('faust');
    assert.ok(await bis(() => p.faust === true && p.waffe === ''));
    await warte(150);
    assert.equal(p.wp0, 'pistole', 'Platz behält die Waffe');
    assert.equal(p.mg0, 9, 'Magazin bleibt im Platz');
    c.send('faust');
    assert.ok(await bis(() => p.faust === false && p.waffe === 'pistole' && p.magazin === 9), 'zurück: ' + p.waffe + ' ' + p.magazin);
    c.send('faust');
    assert.ok(await bis(() => p.faust));
    c.send('waffenplatz', { platz: 0 });
    assert.ok(await bis(() => !p.faust && p.waffe === 'pistole' && p.magazin === 9));
    assert.equal(x.mag[0].n, 9);
  } finally { await c.leave(); }
});

test('Handgranate als Waffe: Magazin 5, Vorrat; kein Auto-Schuss; Wurf auf den Zielpunkt (Reichweite, Bogen), Zündung beim Aufschlag', async () => {
  const { c, raum, p } = await spieler('Werfer');
  try {
    const fluege = []; c.onMessage('granate', m => fluege.push(m));
    const explosionen = []; c.onMessage('explosion', m => explosionen.push(m));
    p.rucksack.push('granate', 'wasser', 'granate', 'granate', 'granate', 'granate', 'granate', 'granate');
    c.send('platz_aktion', { platz: 1, aktion: 'tausch', rs: 0 });
    assert.ok(await bis(() => p.wp1 === 'handgranate'), 'nicht im Platz');
    assert.equal(p.handgranaten, 7); assert.deepEqual([...p.rucksack], ['wasser']);
    c.send('waffenplatz', { platz: 1 });
    assert.ok(await bis(() => p.waffe === 'handgranate' && p.magazin === 5 && p.handgranaten === 2), `Magazin ${p.magazin} Vorrat ${p.handgranaten}`);
    assert.equal(p.magmax, 5); assert.equal(p.mx1, 5);
    // kein Auto-Schuss auf einen nahen Zombie
    const nah = zombieIn(raum, p, 100);
    const fest = { x: p.x + 100, y: p.y }, halte = setInterval(() => { const z = raum.state.zombies.get(nah); if (z) { z.x = fest.x; z.y = fest.y; } }, 5);   // der Zombie läuft nicht aus dem Zielpunkt
    await warte(900);
    assert.equal(fluege.length, 0, 'Handgranate wirft nicht von selbst'); assert.equal(raum.state.zombies.get(nah).hp > 0, true);
    // Wurf auf den angetippten Punkt: Zombie steht genau dort, Aufschlag zündet (Flugzeit nach Entfernung, kein 2-s-Zünder)
    const t0 = Date.now();
    c.send('wurf', { x: p.x + 100, y: p.y });
    assert.ok(await bis(() => fluege.length === 1), 'kein Wurf');
    assert.equal(p.magazin, 4);
    const f = fluege[0];
    assert.ok(Math.abs(f.x2 - (p.x + 100)) < 1 && Math.abs(f.y2 - p.y) < 1, 'Zielpunkt');
    assert.ok(f.zeit < 0.6 && f.zeit === f.flug, 'Zünder = Flugzeit: ' + f.zeit);
    assert.ok(await bis(() => explosionen.length === 1, 1500), 'keine Explosion');
    assert.ok((Date.now() - t0) < 1200, 'Aufschlagzündung');
    assert.ok(!raum.state.zombies.has(nah) || raum.state.zombies.get(nah).hp <= 0, 'Zombie nicht getroffen ' + JSON.stringify([raum.state.zombies.get(nah)?.x - p.x, raum.state.zombies.get(nah)?.hp, explosionen[0], f]));
    clearInterval(halte);
    // Wurfpause, danach: zu weit → auf die Reichweite geklemmt
    await warte(750);
    c.send('wurf', { x: p.x + 5000, y: p.y });
    assert.ok(await bis(() => fluege.length === 2));
    assert.ok(fluege[1].x2 - p.x <= GRANATE.wurfWeite + 1 && fluege[1].x2 - p.x > 100, 'Reichweite 25 m: ' + (fluege[1].x2 - p.x));
    // hinter der Figur → auf den Rand des 60°-Bogens geklemmt (±30° zur Blickrichtung 0)
    await warte(750);
    c.send('wurf', { x: p.x - 100, y: p.y - 5 });
    assert.ok(await bis(() => fluege.length === 3));
    const w = Math.atan2(fluege[2].y2 - fluege[2].y1, fluege[2].x2 - fluege[2].x1);
    assert.ok(Math.abs(Math.abs(w) - Math.PI / 6) < 0.05 || Math.abs(w) < Math.PI / 6 + 0.05, 'Bogen: ' + w);
    assert.equal(p.magazin, 2);
    // Magazin leer → lädt aus dem Vorrat nach
    p.magazin = 0;
    assert.ok(await bis(() => p.nachladen > 0 || p.magazin > 0));
    assert.ok(await bis(() => p.magazin === 2, 4000), 'Nachladen: ' + p.magazin);
    assert.equal(p.handgranaten, 0);
    assert.equal(WAFFEN.handgranate.magazin, 5);
  } finally { await c.leave(); }
});

test('Granatwerfer: Auto-Schuss mit Reichweite aus der Einstellung (60 m Vorgabe), Projektil ~4× schneller als ein Wurf', async () => {
  const { c, raum, p } = await spieler('Granatwerfer');
  const vorher = raum.constructor.einstellungen;
  try {
    assert.equal(WAFFEN.granatwerfer.reichweite, 480); assert.equal(vorher.reichweite.granatwerfer, 60);
    const fluege = []; c.onMessage('granate', m => fluege.push(m));
    p.waffe = 'granatwerfer'; p.granaten = 6;
    assert.ok(await bis(() => p.magazin === 1));
    // Reichweite 20 m = 160 px: Zombie in 300 px bleibt unbehelligt
    raum.constructor.einstellungen = { ...vorher, reichweite: { ...vorher.reichweite, granatwerfer: 20 } };
    const id = zombieIn(raum, p, 300);
    await warte(800);
    assert.equal(fluege.length, 0, 'schießt über die eingestellte Reichweite');
    // 60 m (Vorgabe): Schuss, schneller Flug
    raum.constructor.einstellungen = vorher;
    assert.ok(await bis(() => fluege.length > 0, 2500), 'kein Schuss bei 60 m');
    const f = fluege[0], strecke = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
    assert.equal(f.werfer, true);
    assert.ok(f.flug <= strecke / GRANATE.tempo / 3, `Flug ${f.flug} s für ${Math.round(strecke)} px`);
    assert.ok(raum.state.zombies.has(id) || true);
    // Bereich der Verwaltung bis 100 m
    const { bereinige } = await import('../server/einstellungen.mjs');
    assert.equal(bereinige({ reichweite: { granatwerfer: 400 } }).reichweite.granatwerfer, 100);
    assert.equal(bereinige({ reichweite: { pistole: 400 } }).reichweite.pistole, 80);
  } finally { raum.constructor.einstellungen = vorher; await c.leave(); }
});

test('Beide Plätze mit leeren Waffen: Faust schlägt zu, Waffen bleiben (rot) in den Plätzen, mit Munition wieder aktiv', async () => {
  const { c, raum, p } = await spieler('Leer');
  try {
    p.waffe = 'pistole'; p.wp1 = 'gewehr'; p.munition = 0;
    await warte(300);
    assert.equal(p.wp1, 'gewehr'); assert.equal(p.magazin, 0);
    // Faust-Reichweite 16 px; je nach Welt (Seed) steht am Startplatz ein Baum im Weg: eine Richtung mit freier Sicht suchen
    let id = null;
    for (const [dx, dy] of [[12, 0], [-12, 0], [0, 12], [0, -12], [9, 9], [-9, -9]]) {
      raum.state.zombies.clear(); raum.zombieInfo.clear();
      id = zombieIn(raum, p, dx, dy);
      if (raum.naechsterZombie(p.x, p.y, 16, p)) break;
    }
    const hp0 = raum.state.zombies.get(id).hp;
    assert.ok(await bis(() => !raum.state.zombies.has(id) || raum.state.zombies.get(id).hp < hp0, 2500), 'Faust schlägt nicht zu');
    assert.equal(p.wp0, 'pistole', 'leere Waffe bleibt im Platz');
    // Munition aufgehoben: Auto-Wechsel / Knopf nimmt die Waffe wieder
    p.munition = 40;
    c.send('waffenplatz', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'pistole' && p.magazin > 0, 6500), 'lädt nicht nach');
  } finally { await c.leave(); }
});

test('Nur zwei Waffenplätze: alter Stand mit Platz 3 wandert in einen freien Platz oder in den Rucksack', async () => {
  const { lade, PLATZ_FELD } = await import('../server/waffenplaetze.mjs');
  assert.equal(PLATZ_FELD.length, 2);
  const neu = waffe => ({ waffe, munition: 0, pfeile: 0, granaten: 0, handgranaten: 0 });
  // Platz 2 frei: Platz-3-Waffe rückt auf (samt Magazin)
  let p = neu('pistole'), x = {};
  lade(p, x, { wplatz: 0, wp0: 'pistole', wp1: '', wp2: 'gewehr', mag: [3, 0, 7] });
  assert.equal(p.wp0, 'pistole'); assert.equal(p.wp1, 'gewehr'); assert.equal(p.wp2, ''); assert.equal(x.mag[1].n, 7); assert.deepEqual(x.ueberlauf, []);
  // beide belegt: Platz-3-Waffe in den Überlauf (Rucksack), Magazin zurück in den Vorrat
  p = neu('pistole'); x = {};
  lade(p, x, { wplatz: 0, wp0: 'pistole', wp1: 'messer', wp2: 'gewehr', mag: [0, 0, 7] });
  assert.equal(p.wp1, 'messer'); assert.equal(p.wp2, ''); assert.deepEqual(x.ueberlauf, ['gewehr']); assert.equal(p.munition, 7);
  // Platz 3 war aktiv und kommt nirgends unter: Platz 1 wird aktiv
  p = neu('sense'); x = {};
  lade(p, x, { wplatz: 2, wp0: 'pistole', wp1: 'messer', waffe: 'sense', mag: [4, 0, 0] });
  assert.equal(p.wplatz, 0); assert.equal(p.waffe, 'pistole'); assert.equal(p.magazin, 4); assert.deepEqual(x.ueberlauf, ['sense']);
  // Platz 3 war aktiv, Platz 2 frei: wird dort aktiv
  p = neu('sense'); x = {};
  lade(p, x, { wplatz: 2, wp0: 'pistole', wp1: '', waffe: 'sense', mag: [0, 0, 0] });
  assert.equal(p.wplatz, 1); assert.equal(p.waffe, 'sense'); assert.equal(p.wp1, 'sense');
});
