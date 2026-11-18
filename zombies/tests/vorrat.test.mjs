// Rucksack, Durchsuchen, Safe Rooms, Barrikade und Speichern
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, RUCKSACK_PLAETZE, safeRoomAn } from '../client/welt.mjs';

const PORT = 26900 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-test-'));
const DB = path.join(ordner, 'spiel.db');
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: DB }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), spielerId };
}

test('Durchsuchen füllt den Rucksack, leerer Behälter bleibt leer', async () => {
  const { c, raum, p } = await beitreten('Sucher');
  try {
    const b = raum.welt.behaelter.find(b => b.art !== 'auto');
    p.x = b.x; p.y = b.y + 1;
    raum.setzeInhalt(b.id, ['wasser', 'munition', 'verband']);
    const m0 = p.munition, r0 = p.rucksack.length;
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'), 'Aktion startet nicht');
    assert.ok(await bis(() => p.aktion === '' && raum.state.behaelter.get(b.id).rest === 0, 4000), 'nicht fertig');
    assert.equal(p.munition, m0 + 12);
    assert.equal(p.rucksack.length, r0 + 2);
    assert.ok(await bis(() => c.state.behaelter.get(b.id)?.rest === 0), 'Client sieht leeren Behälter nicht');
    // Bewegen bricht ab
    const b2 = raum.welt.behaelter.find(x => x.art !== 'auto' && x.id !== b.id);
    p.x = b2.x; p.y = b2.y + 1;
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'));
    c.send('eingabe', { dx: 1, dy: 0 });
    assert.ok(await bis(() => p.aktion === ''), 'Bewegen bricht nicht ab');
    assert.equal(raum.state.behaelter.get(b2.id), undefined);
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Rucksack hat 8 Plätze, Rest bleibt im Behälter', async () => {
  const { c, raum, p } = await beitreten('Packer');
  try {
    p.rucksack.clear();
    for (let i = 0; i < RUCKSACK_PLAETZE - 1; i++) p.rucksack.push('essen');
    const b = raum.welt.behaelter.find(b => b.art === 'auto');
    p.x = b.x; p.y = b.y;
    raum.setzeInhalt(b.id, ['wasser', 'bretter']);
    c.send('aktion');
    assert.ok(await bis(() => raum.state.behaelter.get(b.id).rest === 1, 5000));
    assert.equal(p.rucksack.length, RUCKSACK_PLAETZE);
    assert.equal(raum.inhalte.get(b.id)[0], 'bretter');
  } finally { await c.leave(); }
});

test('Benutzen: Wasser, Konserve, Verband, Waffe wechseln', async () => {
  const { c, p } = await beitreten('Nutzer');
  try {
    p.rucksack.clear();
    p.durst = 10; p.hunger = 10; p.hp = 30; p.waffe = 'pistole';
    for (const d of ['wasser', 'essen', 'verband', 'schlaeger']) p.rucksack.push(d);
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.durst > 50));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.hunger > 50));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.hp >= 75));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'schlaeger'));
    assert.deepEqual([...p.rucksack], ['pistole']);
    c.send('wegwerfen', { platz: 0 });
    assert.ok(await bis(() => p.rucksack.length === 0));
  } finally { await c.leave(); }
});

test('Safe Room: Barrikade mit Brettern, Kiste, Zombie kommt nicht durch', async () => {
  const { c, raum, p } = await beitreten('Bauer');
  try {
    const s = raum.welt.safeRooms[0];
    const tuer = s.haus.tuer, innenRichtung = tuer.y === s.haus.y ? 1 : -1;
    p.x = (tuer.x + 0.5) * KACHEL; p.y = (tuer.y + 0.5 + innenRichtung) * KACHEL;
    assert.ok(safeRoomAn(raum.welt, p.x, p.y), 'Startpunkt nicht im Safe Room');
    p.rucksack.clear(); p.rucksack.push('bretter'); p.rucksack.push('bretter');
    assert.ok(await bis(() => p.sicher === s.id), 'sicher nicht gesetzt');
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'barrikade'));
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade >= 35, 5000), 'keine Barrikade');
    assert.equal(p.rucksack.length, 1);

    // Kiste: rein und wieder raus
    p.x = s.kiste.x; p.y = s.kiste.y;
    c.send('kiste', { richtung: 'rein', platz: 0 });
    assert.ok(await bis(() => raum.state.safes.get(s.id).kiste.length === 1 && p.rucksack.length === 0));
    c.send('kiste', { richtung: 'raus', platz: 0 });
    assert.ok(await bis(() => p.rucksack.length === 1));

    // Zombie vor der Tür kommt nicht hinein, hämmert aber
    raum.neuerZombie(0);
    const [id, z] = [...raum.state.zombies.entries()].at(-1);
    z.x = (tuer.x + 0.5) * KACHEL; z.y = (tuer.y + 0.5 - innenRichtung * 1.2) * KACHEL;
    const vorher = raum.state.safes.get(s.id).barrikade;
    const info = raum.zombieInfo.get(id);
    for (let i = 0; i < 60; i++) {
      info.ziel = c.sessionId;
      raum.zombieGehen(z, innenRichtung > 0 ? Math.PI / 2 : -Math.PI / 2, 5, 0.05);
    }
    assert.ok(!safeRoomAn(raum.welt, z.x, z.y), 'Zombie ist durchgekommen');
    assert.ok(raum.state.safes.get(s.id).barrikade < vorher, 'Barrikade nutzt sich nicht ab');
  } finally { await c.leave(); }
});

test('Speichern: Rucksack und Platz im Safe Room bleiben, draußen → zurück im Safe Room', async () => {
  const id = neueId();
  let { c, raum, p } = await beitreten('Vroni', id);
  const s = raum.welt.safeRooms[1];
  p.rucksack.clear(); p.rucksack.push('verband'); p.rucksack.push('bretter');
  p.x = s.innen.x; p.y = s.innen.y; p.munition = 33;
  assert.ok(await bis(() => p.sicher === s.id));
  let ausgeruht = false;
  c.onMessage('ausgeruht', () => { ausgeruht = true; });
  c.send('ausruhen');
  assert.ok(await bis(() => ausgeruht), 'kein ausgeruht');
  await c.leave();
  await warte(200);

  ({ c, raum, p } = await beitreten('Vroni2', id));
  try {
    assert.deepEqual([...p.rucksack], ['verband', 'bretter']);
    assert.equal(p.munition, 33);
    assert.equal(p.name, 'Vroni2');
    assert.ok(Math.hypot(p.x - s.innen.x, p.y - s.innen.y) < 40, 'nicht am gespeicherten Platz');
    // jetzt draußen verlassen
    p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    assert.ok(await bis(() => p.sicher === ''));
  } finally { await c.leave(); }
  await warte(200);
  ({ c, raum, p } = await beitreten('Vroni', id));
  try {
    assert.ok(await bis(() => p.sicher === s.id), 'nicht im letzten Safe Room aufgetaucht');
  } finally { await c.leave(); }
});

test('Gleiche Person zweimal gleichzeitig wird abgelehnt', async () => {
  const id = neueId();
  const { c } = await beitreten('Eins', id);
  try {
    await assert.rejects(new Client(URL_).joinOrCreate('zombies', { name: 'Zwei', spielerId: id }), /anderen Fenster/);
  } finally { await c.leave(); }
});

test('Welt bleibt nach Neustart des Raums erhalten', async () => {
  const { c, raum } = await beitreten('Welt');
  const seed = raum.state.seed;
  const b = raum.welt.behaelter[3];
  raum.setzeInhalt(b.id, ['essen']);
  raum.state.safes.get('s2').barrikade = 77;
  await c.leave();
  assert.ok(await bis(() => !matchMaker.getLocalRoomById(raum.roomId), 3000), 'Raum bleibt bestehen');
  const neu = await beitreten('Welt2');
  try {
    assert.equal(neu.raum.state.seed, seed);
    assert.deepEqual(neu.raum.inhalte.get(b.id), ['essen']);
    assert.equal(neu.raum.state.safes.get('s2').barrikade, 77);
  } finally { await neu.c.leave(); }
});

test('Durst sinkt, bei 0 verliert man Lebenspunkte', async () => {
  const { c, raum, p } = await beitreten('Durstig');
  try {
    const d0 = p.durst;
    await warte(500);
    assert.ok(p.durst < d0);
    p.durst = 0; p.hp = 50; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    await warte(1000);
    assert.ok(p.hp < 50);
  } finally { await c.leave(); }
  assert.ok(SpielRaum.speicher);
});

test('Tor-Rätsel: falsch macht Lärm, drei richtige öffnen das Tor, Stand wird gespeichert', async () => {
  const { setzeFragenquelle } = await import('../server/fragenquelle.mjs');
  const datei = path.join(ordner, 'fragen.txt');
  fs.writeFileSync(datei, `^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^
${[1, 2, 3, 4, 5].map(i => `| T | Frage ${i}? | R${i} | F${i}a | F${i}b | [[a:k${i}]] |`).join('\n')}`);
  setzeFragenquelle(datei);
  const { c, raum, p } = await beitreten('Rätsler');
  try {
    const tor = raum.welt.tor;
    p.x = (tor.x + 1.6) * KACHEL; p.y = (tor.y + 1) * KACHEL;
    const fragen = [], aufloesungen = [];
    c.onMessage('raetsel', m => fragen.push(m));
    c.onMessage('aufloesung', m => aufloesungen.push(m));
    // Zombie in Hörweite, der wandert
    raum.neuerZombie(0);
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    z.x = p.x + 300; z.y = p.y;
    raum.zombieInfo.get(zid).punkt = null;

    c.send('aktion');
    assert.ok(await bis(() => fragen.length === 1), 'keine Frage');
    const f = fragen[0];
    assert.equal(f.antworten.length, 3);
    const nr = f.frage.match(/\d/)[0];
    const falsch = f.antworten.findIndex(a => a !== 'R' + nr);
    c.send('antwort', { id: f.id, index: falsch });
    assert.ok(await bis(() => aufloesungen.length === 1));
    assert.equal(aufloesungen[0].richtig, false);
    assert.equal(aufloesungen[0].loesung, 'R' + nr);
    assert.equal(aufloesungen[0].seite, 'a:k' + nr);
    assert.ok(raum.zombieInfo.get(zid)?.punkt, 'Zombie hat den Lärm nicht gehört');
    assert.equal(raum.state.torGeloest, 0);

    for (let i = 0; i < 3; i++) {
      c.send('aktion');
      assert.ok(await bis(() => fragen.length === i + 2), 'keine neue Frage');
      const g = fragen.at(-1);
      assert.ok(!fragen.slice(0, -1).some(x => x.id === g.id), 'Frage doppelt gestellt');
      const n = g.frage.match(/\d/)[0];
      c.send('antwort', { id: g.id, index: g.antworten.indexOf('R' + n) });
      assert.ok(await bis(() => aufloesungen.length === i + 2));
      assert.equal(aufloesungen.at(-1).richtig, true);
    }
    assert.equal(raum.state.torGeloest, 3);
    assert.ok(await bis(() => c.state.torGeloest === 3));
    // offenes Tor: keine Rätsel mehr
    c.send('aktion');
    await warte(300);
    assert.equal(fragen.length, 4);
    raum.speichereWelt();
    assert.equal(SpielRaum.speicher.ladeWelt().torGeloest, 3);
  } finally { await c.leave(); }
});

test('Infektion: läuft draußen, ruht im Safe Room, Spritze heilt Mitspieler, Verwandlung und zurück', async () => {
  const a = await beitreten('Biss');
  const b = await beitreten('Arzt');
  try {
    const { raum } = a;
    const pa = a.p, pb = b.p;
    pa.infektion = 100;
    pa.x = raum.welt.start.x; pa.y = raum.welt.start.y;
    await warte(400);
    assert.ok(pa.infektion < 100, 'Timer läuft draußen nicht');
    const s = raum.welt.safeRooms[0];
    pa.x = s.innen.x; pa.y = s.innen.y;
    assert.ok(await bis(() => pa.sicher === s.id));
    const stand = pa.infektion; await warte(400);
    assert.ok(Math.abs(pa.infektion - stand) < 0.01, 'Timer läuft im Safe Room weiter');
    // Spritze vom Mitspieler
    pb.x = pa.x + 20; pb.y = pa.y; pb.rucksack.clear(); pb.rucksack.push('spritze');
    b.c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => pa.infektion === 0), 'Spritze wirkt nicht');
    assert.equal(pb.rucksack.length, 0);
    // Verwandlung
    pa.x = raum.welt.start.x; pa.y = raum.welt.start.y; pa.infektion = 0.1;
    assert.ok(await bis(() => pa.zombie > 0), 'keine Verwandlung');
    // der andere schießt/stößt den Zombie-Spieler um → zurück im Safe Room
    pb.waffe = 'schlaeger';
    // der Helfer bleibt dicht dran (der Schläger stößt den Zombie jedes Mal weg)
    const nachruecken = setInterval(() => { if (pa.zombie > 0) { pb.x = pa.x + 25; pb.y = pa.y; pb.hp = 100; } }, 100);
    try { assert.ok(await bis(() => pa.zombie === 0, 8000), 'Zombie-Spieler nicht erledigt'); }
    finally { clearInterval(nachruecken); }
    assert.ok(await bis(() => pa.sicher !== ''), 'nicht im Safe Room aufgewacht');
    assert.equal(pa.infektion, 0);
  } finally { await a.c.leave(); await b.c.leave(); }
});

test('Leichen: bleiben liegen, Beute durchsuchbar, altern weg, höchstens 30', async () => {
  const { c, raum, p } = await beitreten('Leichensucher');
  try {
    raum.kriecherChance = 0;
    raum.neuerZombie(0);
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    z.x = raum.welt.start.x; z.y = raum.welt.start.y;
    raum.schaden(zid, z, 999, p);
    assert.equal(raum.state.leichen.size, 1, 'keine Leiche');
    const [lid, l] = [...raum.state.leichen.entries()][0];
    raum.leichenInhalt.set(lid, ['schokoriegel', 'messer']); l.rest = 2;
    p.rucksack.clear(); p.x = l.x + 10; p.y = l.y;
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'));
    assert.ok(await bis(() => l.rest === 0, 3000), 'Leiche nicht durchsucht');
    assert.deepEqual([...p.rucksack], ['schokoriegel', 'messer']);
    // Messer in die Hand, Schokoriegel essen
    p.hunger = 50;
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.hunger >= 69));
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'messer'));
    // Altern
    l.alter = 999;
    assert.ok(await bis(() => !raum.state.leichen.has(lid)), 'Leiche verschwindet nicht');
    // Obergrenze
    for (let i = 0; i < 40; i++) raum.neueLeiche({ x: 100, y: 100, richtung: 0 });
    assert.equal(raum.state.leichen.size, 30);
    // Beute-Verteilung: selten ~5 %, oft ~55 %
    let selten = 0, oft = 0;
    for (let i = 0; i < 4000; i++) {
      raum.neueLeiche({ x: 0, y: 0, richtung: 0 });
      const inhalt = raum.leichenInhalt.get([...raum.state.leichen.keys()].at(-1));
      if (['pistole', 'munition', 'messer'].includes(inhalt[0])) selten++; else if (inhalt.length) oft++;
    }
    assert.ok(selten > 120 && selten < 290, `selten: ${selten}`);
    assert.ok(oft > 1900 && oft < 2500, `oft: ${oft}`);
  } finally { await c.leave(); }
});

test('Feste Kleidung schützt und nutzt sich ab', async () => {
  const { c, raum, p } = await beitreten('Angezogen');
  try {
    p.rucksack.clear(); p.rucksack.push('kleidung');
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.kleidung === 100));
    raum.neuerZombie(0);
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.hp = 100;
    z.x = p.x + 18; z.y = p.y;
    raum.zombieInfo.get(zid).ziel = c.sessionId;
    p.waffe = ''; p.munition = 0;
    await warte(1000);
    assert.ok(p.kleidung < 100, 'Kleidung nutzt sich nicht ab');
    assert.ok(p.hp > 100 - 14 * 1.2, 'Kleidung schützt nicht: ' + p.hp);
  } finally { await c.leave(); }
});

test('Bots: fünf Mitspieler, folgen, helfen auf, weichen echten Spielern', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 5 };
  const a = await beitreten('Tester');
  try {
    const { raum, p } = a;
    const bots = () => [...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum.state.spieler.get(sid));
    assert.equal(bots().length, 5);
    assert.ok(bots().every(b => b.name.endsWith('🤖')));
    // Anführer läuft weg → Bots folgen
    p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    const ziel = raum.welt.safeRooms[0].innen;
    a.c.send('eingabe', { dx: 0, dy: 0 });
    for (const b of bots()) { b.x = p.x + 150; b.y = p.y; }
    await warte(4000);
    const naeher = bots().filter(b => Math.hypot(b.x - p.x, b.y - p.y) < 150).length;
    assert.ok(naeher >= 2, `nur ${naeher} Begleiter in der Nähe`);
    assert.ok(bots().every(b => Math.hypot(b.x - p.x, b.y - p.y) < 340), 'ein Bot ist zu weit weg');
    const paare = bots().flatMap((b, i) => bots().slice(i + 1).map(c => Math.hypot(b.x - c.x, b.y - c.y)));
    assert.ok(paare.filter(d => d < 16).length === 0, 'Bots kleben aneinander: ' + paare.map(Math.round).join(','));
    // auf einen Bot zugehen und tauschen: er weicht nicht aus
    const partner = bots()[0], zid = [...raum.extra.entries()].find(([sid]) => raum.state.spieler.get(sid) === partner)[0];
    p.x = partner.x - 20; p.y = partner.y;
    let fenster = null; a.c.onMessage('tausch', m => { fenster = m; });
    a.c.send('tausch_start', { mit: zid });
    assert.ok(await bis(() => fenster?.seinOk === true), 'kein Tausch mit dem Bot');
    a.c.send('tausch_ende');
    // Mensch liegt am Boden → ein Bot hilft auf
    p.unten = true; p.hp = 0; p.hilfe = 0;
    assert.ok(await bis(() => !p.unten, 15000), 'kein Bot hilft auf');
    // zweiter Mensch kommt → ein Bot weniger
    const b2 = await beitreten('Zweiter');
    assert.equal(bots().length, 4);
    await b2.c.leave();
    assert.ok(await bis(() => bots().length === 5));
    void ziel;
  } finally {
    await a.c.leave();
    SpielRaum.einstellungen = vorher;
  }
});

test('Kriecher: nicht ganz tot, langsam, beim zweiten Mal Leiche', async () => {
  const { c, raum, p } = await beitreten('Jäger');
  try {
    raum.kriecherChance = 1;
    raum.neuerZombie(0);
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    p.waffe = ''; p.munition = 0;
    z.x = raum.welt.start.x + 40; z.y = raum.welt.start.y + 60;
    raum.schaden(zid, z, 999, p);
    assert.ok(raum.state.zombies.has(zid), 'Kriecher verschwunden');
    assert.equal(z.kriecht, true);
    assert.equal(z.hp, 35);
    assert.equal(raum.state.leichen.size, 0);
    assert.ok(await bis(() => c.state.zombies?.get(zid)?.kriecht === true), 'Client sieht Kriecher nicht');
    // kriecht langsam auf den Spieler zu
    p.x = z.x - 80; p.y = z.y; p.hp = 100;
    const x0 = z.x;
    await warte(1000);
    const weg = x0 - z.x;
    assert.ok(weg > 5 && weg < 50, 'Kriecher-Tempo falsch: ' + weg);
    raum.schaden(zid, z, 999, p);
    assert.ok(!raum.state.zombies.has(zid));
    assert.equal(raum.state.leichen.size, 1);
    assert.equal([...raum.state.leichen.values()][0].variante, z.variante);
  } finally { await c.leave(); }
});

test('Bots folgen ins Haus und bewaffnete Bots kämpfen', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 4 };
  const a = await beitreten('Hausherr');
  try {
    const { raum, p } = a;
    const bots = () => [...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum.state.spieler.get(sid));
    const s = raum.welt.safeRooms[0];
    p.x = s.innen.x; p.y = s.innen.y;
    for (const b of bots()) { b.x = raum.welt.start.x; b.y = raum.welt.start.y + 40; b.waffe = ''; b.munition = 0; }
    assert.ok(await bis(() => bots().filter(b => safeRoomAn(raum.welt, b.x, b.y) === s).length >= 3, 15000),
      'Bots kommen nicht ins Haus: ' + bots().map(b => Math.round(b.x) + ',' + Math.round(b.y)).join(' '));
    // bewaffneter Bot erledigt einen Zombie
    p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    const b0 = bots()[0]; b0.waffe = 'messer'; b0.x = p.x + 40; b0.y = p.y;
    raum.kriecherChance = 0;
    raum.neuerZombie(0);
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    z.x = b0.x + 90; z.y = b0.y; raum.zombieInfo.get(zid).ziel = a.c.sessionId;
    assert.ok(await bis(() => !raum.state.zombies.has(zid), 10000), 'Bot kämpft nicht');
  } finally {
    await a.c.leave();
    SpielRaum.einstellungen = vorher;
  }
});

test('Weggeworfenes bleibt liegen, andere heben es auf; großer Rucksack', async () => {
  const a = await beitreten('Werfer'), b = await beitreten('Finder');
  try {
    const { raum } = a;
    a.p.x = raum.welt.start.x; a.p.y = raum.welt.start.y;
    a.p.rucksack.clear(); a.p.rucksack.push('seil');
    a.c.send('wegwerfen', { platz: 0 });
    assert.ok(await bis(() => raum.state.boden.size === 1));
    const [, ding] = [...raum.state.boden.entries()][0];
    b.p.x = ding.x + 5; b.p.y = ding.y; b.p.rucksack.clear();
    b.c.send('aktion');
    assert.ok(await bis(() => b.p.rucksack.includes('seil')), 'nicht aufgehoben');
    assert.equal(raum.state.boden.size, 0);
    // großer Rucksack
    b.p.rucksack.push('trekking');
    b.c.send('benutze', { platz: 1 });
    assert.ok(await bis(() => b.p.plaetze === 16));
    // Liegenbleiben läuft ab
    raum.legeHin('seil', 0, 0);
    [...raum.state.boden.values()][0].alter = 999;
    assert.ok(await bis(() => raum.state.boden.size === 0));
  } finally { await a.c.leave(); await b.c.leave(); }
});

test('Tauschen: anbieten, beide bestätigen, Entfernen bricht ab', async () => {
  const a = await beitreten('Anna'), b = await beitreten('Bert');
  try {
    const { raum } = a;
    a.p.x = raum.welt.start.x; a.p.y = raum.welt.start.y; b.p.x = a.p.x + 20; b.p.y = a.p.y;
    a.p.rucksack.clear(); a.p.rucksack.push('wasser'); b.p.rucksack.clear(); b.p.rucksack.push('messer');
    const stand = { a: null, b: null };
    a.c.onMessage('tausch', m => { stand.a = m; }); b.c.onMessage('tausch', m => { stand.b = m; });
    a.c.send('tausch_start', { mit: b.c.sessionId });
    assert.ok(await bis(() => stand.a && stand.b), 'kein Tauschfenster');
    a.c.send('tausch_anbieten', { platz: 0 });
    b.c.send('tausch_anbieten', { platz: 0 });
    assert.ok(await bis(() => stand.a?.seins?.[0] === 'messer' && stand.b?.seins?.[0] === 'wasser'));
    a.c.send('tausch_ok'); await warte(100);
    assert.equal(a.p.rucksack.length, 0, 'zu früh getauscht');
    b.c.send('tausch_ok');
    assert.ok(await bis(() => a.p.rucksack.includes('messer') && b.p.rucksack.includes('wasser')), 'Tausch nicht ausgeführt');
    // neuer Tausch, dann auseinander → abgebrochen, Angebot zurück
    let ende = null; a.c.onMessage('tausch_ende', m => { ende = m; });
    a.c.send('tausch_start', { mit: b.c.sessionId });
    await bis(() => raum.tausche.size === 2);
    a.c.send('tausch_anbieten', { platz: 0 });
    await bis(() => a.p.rucksack.length === 0);
    b.p.x += 200;
    assert.ok(await bis(() => ende?.grund === 'abgebrochen'));
    assert.deepEqual([...a.p.rucksack], ['messer']);
  } finally { await a.c.leave(); await b.c.leave(); }
});

test('Toter Zombie in der Tür: erst wegziehen, dann verbarrikadieren', async () => {
  const { c, raum, p } = await beitreten('Türsteher');
  try {
    const s = raum.welt.safeRooms[0], t = s.haus.tuer, rein = t.y === s.haus.y ? 1 : -1;
    raum.neueLeiche({ x: (t.x + 0.5) * KACHEL, y: (t.y + 0.5) * KACHEL, richtung: 0 });
    p.x = (t.x + 0.5) * KACHEL; p.y = (t.y + 0.5 + rein) * KACHEL;
    p.rucksack.clear(); p.rucksack.push('bretter');
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'wegziehen'), 'Wegziehen nicht angeboten: ' + p.aktion);
    assert.ok(await bis(() => p.aktion === '' && !raum.leicheInTuer(s), 3000), 'Leiche liegt noch');
    c.send('aktion');
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade > 0, 5000), 'keine Barrikade');
  } finally { await c.leave(); }
});
