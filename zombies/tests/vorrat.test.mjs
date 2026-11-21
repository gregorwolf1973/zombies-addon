// Rucksack, Durchsuchen, Safe Rooms, Barrikade und Speichern
import { zaehle, hat } from '../client/stapel.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../client/welt.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, RUCKSACK_PLAETZE, safeRoomVon } from '../client/welt.mjs';
import { BOTPLAN } from '../server/botplan.mjs';
BOTPLAN.an = false;   // diese Tests prüfen das reine Folgen/Gelegenheiten der Bots; der Team-Planer hat eigene Tests (botplan.test.mjs)

// Figur in den Innenraum eines Safe Rooms setzen (neben die Eingangstür oder an einen Punkt darin)
function inDenSafeRoom(raum, p, s, wo = 'tuer') {
  const w = raum.wv(s.ebene);
  const ort = wo === 'kiste' ? w.kiste : wo === 'mitte' ? w.start : raum.nebenKachel(w, w.ausgang);
  p.ebene = s.ebene; p.x = ort.x; p.y = ort.y;
  return w;
}

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
    // Schränke stehen in Innenräumen – hier im ersten Safe Room (dort schlafen keine Zombies)
    const iw = raum.wv(raum.welt.safeRooms[0].ebene);
    // einen Behälter nehmen, an dem die Aktionstaste wirklich „Durchsuchen“ anbietet (nicht Kiste, Funktisch, Tür daneben)
    p.ebene = iw.ebene;
    const b = iw.behaelter.find(c => { p.x = c.x; p.y = c.y + 1; const k = raum.kontext(p); return k?.art === 'durchsuchen' && k.behaelter?.id === c.id; });
    assert.ok(b, 'kein freistehender Behälter im Safe Room');
    p.x = b.x; p.y = b.y + 1;
    raum.setzeInhalt(b.id, ['wasser', 'munition', 'verband']);
    const m0 = p.munition + p.magazin, r0 = zaehle(p.rucksack);   // Magazin + Vorrat; Stücke im Rucksack
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'durchsuchen'), 'Aktion startet nicht');
    assert.ok(await bis(() => p.aktion === '' && raum.state.behaelter.get(b.id).rest === 0, 4000), 'nicht fertig');
    assert.equal(p.munition + p.magazin, m0 + 12);
    assert.equal(zaehle(p.rucksack), r0 + 2);
    assert.ok(await bis(() => c.state.behaelter.get(b.id)?.rest === 0), 'Client sieht leeren Behälter nicht');
    // Bewegen bricht ab
    const b2 = iw.behaelter.find(x => { if (x.id === b.id) return false; p.x = x.x; p.y = x.y + 1; const k = raum.kontext(p); return k?.art === 'durchsuchen' && k.behaelter?.id === x.id; });
    assert.ok(b2, 'kein zweiter freistehender Behälter');
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
    // ohne Brechstange bleibt der Kofferraum zu
    c.send('aktion');
    await warte(300);
    assert.equal(p.aktion, '', 'Kofferraum ohne Brechstange geöffnet');
    p.rucksack.splice(0, 1, 'brechstange');
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
    // freier Waffenplatz: die Pistole bleibt im Platz „Haupt“, der Schläger kommt auf „Neben“ – nichts im Rucksack
    assert.deepEqual([...p.rucksack], []);
    assert.equal(p.wp0, 'pistole'); assert.equal(p.wplatz, 1);
  } finally { await c.leave(); }
});

test('Safe Room: Barrikade mit Brettern, Kiste, Zombie kommt nicht durch – ohne Barrikade schon', async () => {
  const { c, raum, p } = await beitreten('Bauer');
  try {
    const s = raum.welt.safeRooms[0];
    const tuer = s.haus.tuer, r = s.haus.raus;
    inDenSafeRoom(raum, p, s);
    assert.equal(safeRoomVon(raum.welt, p), s, 'nicht im Safe Room');
    p.rucksack.clear(); p.rucksack.push('bretter'); p.rucksack.push('bretter');
    assert.ok(await bis(() => p.sicher === s.id), 'sicher nicht gesetzt');
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'barrikade'), 'keine Barrikaden-Aktion an der Eingangstür');
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade >= 35, 5000), 'keine Barrikade');
    assert.equal(p.rucksack.length, 1);

    // Kiste: rein und wieder raus
    inDenSafeRoom(raum, p, s, 'kiste');
    c.send('kiste', { richtung: 'rein', platz: 0 });
    assert.ok(await bis(() => raum.state.safes.get(s.id).kiste.length === 1 && p.rucksack.length === 0));
    c.send('kiste', { richtung: 'raus', platz: 0 });
    assert.ok(await bis(() => p.rucksack.length === 1));

    // Zombie draußen vor der Tür kommt nicht hinein, hämmert aber
    raum.neuerZombie(0);
    const [id, z] = [...raum.state.zombies.entries()].at(-1);
    const davor = () => { z.ebene = ''; z.x = (tuer.x + 0.5 + r.dx * 1.2) * KACHEL; z.y = (tuer.y + 0.5 + r.dy * 1.2) * KACHEL; };
    davor();
    const vorher = raum.state.safes.get(s.id).barrikade;
    const info = raum.zombieInfo.get(id), rein = Math.atan2(-r.dy, -r.dx);
    for (let i = 0; i < 60; i++) { info.ziel = c.sessionId; raum.zombieGehen(z, rein, 5, 0.05); }
    assert.equal(z.ebene, '', 'Zombie ist durch die Barrikade gekommen');
    assert.equal(raum.state.safes.get(s.id).barrikade, vorher, 'Safe-Barrikade darf sich nicht abnutzen (Zombies hämmern nur)');

    // ohne Barrikade dringt er ein, wenn jemand drin ist
    raum.state.safes.get(s.id).barrikade = 0;
    davor();
    for (let i = 0; i < 80 && z.ebene === ''; i++) { info.ziel = null; raum.zombieGehen(z, rein, 5, 0.05); }
    assert.equal(z.ebene, s.ebene, 'Zombie kommt ohne Barrikade nicht hinein');
  } finally { await c.leave(); }
});

test('Speichern: Rucksack und Platz im Safe Room bleiben, draußen → zurück im Safe Room', async () => {
  const id = neueId();
  let { c, raum, p } = await beitreten('Vroni', id);
  const s = raum.welt.safeRooms[1];
  p.rucksack.clear(); p.rucksack.push('verband'); p.rucksack.push('bretter');
  inDenSafeRoom(raum, p, s, 'mitte'); p.munition = 33;
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
    assert.equal(p.munition + p.magazin, 33);   // Magazin + Vorrat
    assert.equal(p.name, 'Vroni2');
    assert.equal(p.ebene, s.ebene, 'nicht im Safe Room aufgetaucht');
    // jetzt draußen verlassen
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    assert.ok(await bis(() => p.sicher === ''));
  } finally { await c.leave(); }
  await warte(200);
  ({ c, raum, p } = await beitreten('Vroni', id));
  try {
    assert.ok(await bis(() => p.sicher === s.id), 'nicht im letzten Safe Room aufgetaucht');
  } finally { await c.leave(); }
});

test('Gleiche Person in zweitem Fenster: neues löst altes ab', async () => {
  const id = neueId();
  const { c, p } = await beitreten('Eins', id);
  let hinweis = false, weg = false;
  c.onMessage('abgeloest', () => { hinweis = true; });
  c.onLeave(() => { weg = true; });
  const c2 = await new Client(URL_).joinOrCreate('zombies', { name: 'Zwei', spielerId: id });
  try {
    assert.ok(await bis(() => hinweis && weg, 3000), 'altes Fenster nicht abgelöst');
    assert.notEqual(c2.sessionId, c.sessionId);
    const raum = [...matchMaker.getLocalRoomById ? [matchMaker.getLocalRoomById(c2.roomId)] : []][0];
    assert.equal(raum.state.spieler.size, 1);
    assert.equal(raum.state.spieler.get(c2.sessionId)?.verbunden, true);
    assert.equal(raum.state.spieler.get(c.sessionId), undefined);
  } finally { await c2.leave(); }
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
    inDenSafeRoom(raum, pa, s, 'mitte');
    assert.ok(await bis(() => pa.sicher === s.id));
    const stand = pa.infektion; await warte(400);
    assert.ok(Math.abs(pa.infektion - stand) < 0.01, 'Timer läuft im Safe Room weiter');
    // Spritze vom Mitspieler
    const neben = raum.freierPlatz({ x: pa.x + 20, y: pa.y }, 1, s.ebene);
    pb.ebene = s.ebene; pb.x = neben.x; pb.y = neben.y; pb.rucksack.clear(); pb.rucksack.push('spritze');
    b.c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => pa.infektion === 0), 'Spritze wirkt nicht');
    assert.equal(pb.rucksack.length, 0);
    // Verwandlung
    pa.ebene = pb.ebene = ''; pb.x = raum.welt.start.x + 40; pb.y = raum.welt.start.y;
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
    // kriecht langsam auf den Spieler zu (still stehende Spieler spürt er erst aus der Nähe)
    p.x = z.x - 45; p.y = z.y; p.hp = 100;
    raum.extra.get(c.sessionId).pause = 99;   // nicht automatisch zurückschlagen (würde ihn wegstoßen)
    const x0 = z.x;
    await warte(1000);
    const weg = x0 - z.x;
    assert.ok(weg > 3 && weg < 50, 'Kriecher-Tempo falsch: ' + weg);
    raum.schaden(zid, z, 999, p);
    assert.ok(!raum.state.zombies.has(zid));
    assert.equal(raum.state.leichen.size, 1);
    assert.equal([...raum.state.leichen.values()][0].variante, z.variante);
  } finally { await c.leave(); }
});

test('Bots folgen ins Haus und bewaffnete Bots kämpfen', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 4, zombieFaktor: 0 };   // ohne Zombies, die die Tür versperren
  const a = await beitreten('Hausherr');
  try {
    const { raum, p } = a;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const bots = () => [...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum.state.spieler.get(sid));
    const s = raum.welt.safeRooms[0];
    inDenSafeRoom(raum, p, s, 'mitte');
    for (const b of bots()) { b.ebene = ''; b.x = raum.welt.start.x; b.y = raum.welt.start.y + 40; b.waffe = ''; b.munition = 0; }
    assert.ok(await bis(() => bots().filter(b => safeRoomVon(raum.welt, b) === s).length >= 2, 15000),
      'Bots kommen nicht ins Haus: ' + bots().map(b => Math.round(b.x) + ',' + Math.round(b.y)).join(' '));
    // bewaffneter Bot erledigt einen Zombie
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    const b0 = bots()[0]; b0.waffe = 'messer'; b0.ebene = ''; b0.x = p.x + 40; b0.y = p.y;
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

test('Aufheben mit Auswahl: gewählter Gegenstand, voller Rucksack tauscht Platz, Abstand wird geprüft', async () => {
  const a = await beitreten('Wähler');
  try {
    const { raum } = a;
    a.p.x = raum.welt.start.x; a.p.y = raum.welt.start.y; a.p.ebene = '';
    raum.state.boden.clear();
    a.p.rucksack.clear();
    const i1 = raum.legeHin('seil', a.p.x, a.p.y), i2 = raum.legeHin('bretter', a.p.x, a.p.y);
    const weit = raum.legeHin('seil', a.p.x + 300, a.p.y);
    a.c.send('aufheben_wahl', { id: weit });
    a.c.send('aufheben_wahl', { id: i2 });
    assert.ok(await bis(() => a.p.rucksack.includes('bretter')), 'gewählter nicht aufgehoben');
    assert.ok(!a.p.rucksack.includes('seil'));
    assert.ok(raum.state.boden.has(i1) && raum.state.boden.has(weit) && !raum.state.boden.has(i2));
    // voller Rucksack: ohne Platz nichts, mit Platz Tausch
    while (a.p.rucksack.length < a.p.plaetze) a.p.rucksack.push('bretter');
    a.p.rucksack[1] = 'brechstange';   // anderes Ding als das Seil, sonst würde es auf den Seil-Stapel passen
    const vorher = raum.state.boden.size;
    a.c.send('aufheben_wahl', { id: i1 });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(raum.state.boden.size, vorher, 'ohne Platzwahl darf nichts passieren');
    a.c.send('aufheben_wahl', { id: i1, platz: 3 });
    assert.ok(await bis(() => !raum.state.boden.has(i1)), 'Tausch fehlt');
    assert.equal(a.p.rucksack.length, a.p.plaetze);
    assert.ok(!raum.state.boden.has(i1));
    assert.equal([...raum.state.boden.values()].filter(b => b.ding === 'bretter').length, 1, 'verdrängter Gegenstand liegt am Boden');
  } finally { await a.c.leave(); }
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
    const s = raum.welt.safeRooms[0];
    const w = inDenSafeRoom(raum, p, s), a = w.ausgang;
    raum.neueLeiche({ x: (a.x + 0.5) * KACHEL, y: (a.y + 0.5) * KACHEL, richtung: 0, ebene: s.ebene });
    p.rucksack.clear(); p.rucksack.push('bretter');
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'wegziehen'), 'Wegziehen nicht angeboten: ' + p.aktion);
    assert.ok(await bis(() => p.aktion === '' && !raum.leicheInTuer(s), 3000), 'Leiche liegt noch');
    c.send('aktion');
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade > 0, 5000), 'keine Barrikade');
  } finally { await c.leave(); }
});

test('Figur: gewähltes Aussehen kommt an, wird gespeichert, Unsinn wird ersetzt', async () => {
  const id = neueId();
  let c = await new Client(URL_).joinOrCreate('zombies', { name: 'Modell', spielerId: id, aussehen: 'w,2,5' });
  let raum = matchMaker.getLocalRoomById(c.roomId);
  assert.equal(raum.state.spieler.get(c.sessionId).aussehen, 'w,2,5');
  raum.speichereSpieler(c.sessionId);
  await c.leave(); await warte(200);
  // ohne Angabe: gespeichertes Aussehen
  c = await new Client(URL_).joinOrCreate('zombies', { name: 'Modell', spielerId: id });
  raum = matchMaker.getLocalRoomById(c.roomId);
  assert.equal(raum.state.spieler.get(c.sessionId).aussehen, 'w,2,5');
  await c.leave(); await warte(200);
  c = await new Client(URL_).joinOrCreate('zombies', { name: 'Böse', spielerId: neueId(), aussehen: '<script>' });
  raum = matchMaker.getLocalRoomById(c.roomId);
  assert.match(raum.state.spieler.get(c.sessionId).aussehen, /^[mws],[0-5],[0-7]$/);
  await c.leave();
});

test('Figurenbogen enthält alle Bilder, die das Spiel braucht', async () => {
  const fs = await import('node:fs');
  const j = JSON.parse(fs.readFileSync(new URL('../client/grafik/figuren.json', import.meta.url)));
  for (const typ of ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose']) {
    assert.ok(j.bilder['zombie_' + typ]?.length >= 3, 'Laufbilder fehlen: ' + typ);
    assert.ok(j.bilder['leiche_' + typ]?.length, 'Leiche fehlt: ' + typ);
  }
  for (const k of 'abcd') assert.equal(j.bilder['kriecher_' + k]?.length, 2, 'Kriecher ' + k);
  for (const wer of ['mann', 'frau']) for (const w of ['hand', 'pistole', 'schlaeger', 'messer']) assert.ok(j.bilder[`${wer}_${w}`], `${wer}_${w}`);
});

test('Bots durchsuchen Schränke in der Nähe und nehmen bessere Waffen', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Chef');
  try {
    const { raum, p } = a;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const [bid, x] = [...raum.extra.entries()].find(([, e]) => e.bot);
    const bot = raum.state.spieler.get(bid);
    // ein Schrank in einem Haus mit freiem Platz und freier Sicht daneben (Bot und Mensch stehen dort)
    let schrank = null, rx = 0, ry = 0, ebene = '';
    for (const h of raum.welt.haeuser) {
      if (schrank || !h.betretbar || h.safe) continue;
      const iw = raum.wv(`h${h.nr}eg`);
      for (const c of iw.behaelter) {
        if (schrank) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (W.frei(iw, c.x + dx * 30, c.y + dy * 30, 13) && W.frei(iw, c.x + dx * 60, c.y + dy * 60, 13) && W.sichtfrei(iw, c.x + dx * 30, c.y + dy * 30, c.x, c.y)) { schrank = c; rx = dx; ry = dy; ebene = iw.ebene; break; }
        }
      }
    }
    for (const [zid, z] of [...raum.state.zombies]) if (z.ebene === ebene) { raum.state.zombies.delete(zid); raum.zombieInfo.delete(zid); }
    assert.ok(schrank, 'kein Schrank');
    raum.setzeInhalt(schrank.id, ['wasser', 'gewehr']);
    bot.rucksack.clear(); bot.waffe = 'messer'; bot.munition = 5;
    p.x = schrank.x + rx * 60; p.y = schrank.y + ry * 60;
    bot.x = schrank.x + rx * 30; bot.y = schrank.y + ry * 30; bot.ebene = p.ebene = ebene;
    assert.ok(await bis(() => bot.waffe === 'gewehr' || bot.rucksack.includes('gewehr'), 9000),
      'Bot hat nicht durchsucht: ' + JSON.stringify([...bot.rucksack]) + ' Aktion ' + bot.aktion);
    assert.ok(await bis(() => bot.waffe === 'gewehr', 3000), 'Bot nimmt das Gewehr nicht in die Hand');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

test('Bots legen Überzähliges ab und heben auf, was ein Mitspieler fallen lässt', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Chef');
  try {
    const { raum, p } = a;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const [bid] = [...raum.extra.entries()].find(([, e]) => e.bot);
    const bot = raum.state.spieler.get(bid);
    // freier Fleck draußen mit Platz drumherum
    let ort = null;
    for (let y = 200; y < 1800 && !ort; y += 32) for (let x = 200; x < 2400 && !ort; x += 32) {
      if ([[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]].every(([dx, dy]) => W.frei(raum.welt, x + dx, y + dy, 14)) && W.sichtfrei(raum.welt, x - 60, y, x + 60, y)) ort = { x, y };
    }
    assert.ok(ort, 'kein freier Platz');
    raum.state.boden.clear();
    bot.ebene = p.ebene = ''; bot.x = ort.x; bot.y = ort.y; p.x = ort.x + 50; p.y = ort.y;
    bot.rucksack.clear(); for (let i = 0; i < 5; i++) bot.rucksack.push('wasser');
    bot.durst = 100;
    assert.ok(await bis(() => bot.rucksack.filter(d => d === 'wasser').length === 3, 6000), 'Bot legt überzähliges Wasser nicht ab');
    await warte(1500);
    assert.equal(bot.rucksack.filter(d => d === 'wasser').length, 3, 'Bot hebt sein eigenes Wasser wieder auf');
    // der Mensch lässt einen Verband fallen
    raum.legeHin('verband', p.x, p.y, '');
    assert.ok(await bis(() => bot.rucksack.includes('verband'), 8000), 'Bot hebt den Verband nicht auf');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

test('Bots nutzen die Vorratskiste im Safe Room', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Lagerchef');
  try {
    const { raum, p } = a;
    const [bid] = [...raum.extra.entries()].find(([, e]) => e.bot);
    const bot = raum.state.spieler.get(bid);
    raum.state.aufgaben.clear();   // keine Aufgaben: die Kiste ist frei
    const s = raum.welt.safeRooms[0], kiste = raum.state.safes.get(s.id).kiste;
    kiste.clear(); kiste.push('verband'); kiste.push('bretter'); kiste.push('taschenlampe');
    inDenSafeRoom(raum, p, s, 'mitte');
    inDenSafeRoom(raum, bot, s, 'tuer');
    bot.rucksack.clear(); for (let i = 0; i < 5; i++) bot.rucksack.push('wasser');
    bot.durst = 100; bot.hp = 45;   // verletzt: braucht einen Verband, sonst nichts
    assert.ok(await bis(() => !hat(kiste, 'verband') && zaehle(bot.rucksack, 'wasser') === 3, 12000),   // Verband genommen (evtl. gleich benutzt)
      'Bot nutzt die Kiste nicht: ' + JSON.stringify([...bot.rucksack]) + ' Kiste ' + JSON.stringify([...kiste]));
    assert.equal(zaehle(kiste, 'wasser'), 2, 'Überzähliges liegt nicht in der Kiste');
    assert.equal(raum.state.boden.size, 0, 'Bot wirft im Safe Room auf den Boden statt in die Kiste');
    // was er nicht dringend braucht, lässt er für die Gruppe liegen (auch sein eigenes Wasser, er ist nicht durstig)
    await warte(3000);
    assert.ok(hat(kiste, 'bretter') && hat(kiste, 'taschenlampe'), 'Bot räumt die Kiste aus: ' + JSON.stringify([...kiste]));
    assert.equal(zaehle(kiste, 'wasser'), 2, 'Bot nimmt Wasser, obwohl er nicht durstig ist');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

// ---------- Türen: Bots blockieren sich nicht ----------
// Platzierung für die Tür-Tests: Punkte draußen vor der Haustür, auf denen eine Figur wirklich stehen kann
// (nicht in Deko/Zaun/Beeten, nicht auf einer Tür, mit Weg zur Haustür) – die Welt ist je Lauf zufällig
function aussenPunkte(raum, h, anzahl, vonAbstand, schritt = 14) {
  const w = raum.wv(''), tuer = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL };
  const tuerNah = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const k = w.hole(Math.floor(x / KACHEL) + dx, Math.floor(y / KACHEL) + dy);
    if ((k === W.T.TUER || k === W.T.AUSGANG) && !(Math.floor(x / KACHEL) + dx === h.tuer.x && Math.floor(y / KACHEL) + dy === h.tuer.y) && Math.hypot((Math.floor(x / KACHEL) + dx + 0.5) * KACHEL - x, (Math.floor(y / KACHEL) + dy + 0.5) * KACHEL - y) < 56) return true;
  } return false; };
  const kand = [];
  for (let r = vonAbstand; r <= vonAbstand + 160; r += 8) for (let ang = 0; ang < 24; ang++) {
    const wi = ang / 24 * Math.PI * 2, x = tuer.x + Math.cos(wi) * r, y = tuer.y + Math.sin(wi) * r;
    // nur vor dem Haus (Seite der Haustür), frei, keine Tür in der Nähe, Weg zur Tür vorhanden
    if ((x - tuer.x) * h.raus.dx + (y - tuer.y) * h.raus.dy < r * 0.5) continue;
    if (!W.frei(w, x, y, 12) || tuerNah(x, y) || !W.findeWeg(w, x, y, tuer.x, tuer.y, 11, 40000, true)) continue;
    kand.push({ x, y, r });
  }
  const wahl = [];
  for (const k of kand) { if (wahl.length < anzahl && wahl.every(o => Math.hypot(o.x - k.x, o.y - k.y) >= schritt)) wahl.push(k); }
  return wahl.length === anzahl ? wahl : null;
}

// Mensch geht ins Haus (ebene) und wieder hinaus; alle Bots müssen jedes Mal durch die Haustür folgen
async function botsDurchDieTuer(raum, p, haus, ebene, innen) {
  const bots = () => [...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum.state.spieler.get(sid));
  assert.equal(bots().length, 4);
  const h = haus;
  // Mensch steht im Haus, Bots dicht gedrängt vor der Tür
  const w = raum.wv(ebene);
  p.ebene = ebene; p.x = w.start.x; p.y = w.start.y;
  const start = aussenPunkte(raum, h, 4, 20), [aus] = aussenPunkte(raum, h, 1, 90) ?? [];
  assert.ok(start && aus, `keine freien Plätze vor der Haustür (Haus ${h.nr}, Tür ${JSON.stringify(h.tuer)}, raus ${JSON.stringify(h.raus)})`);
  start.forEach((pt, i) => { const b = bots()[i]; b.ebene = ''; b.waffe = ''; b.munition = 0; b.x = pt.x; b.y = pt.y; });
  const bericht = () => bots().map(b => `${b.ebene}@${Math.round(b.x)},${Math.round(b.y)}`).join(' ') + ' ' + [...raum.extra.entries()].filter(([, x]) => x.bot)
    .map(([sid, x]) => JSON.stringify({ z: x.bot.uebergangZiel, w: x.bot.wartetSeit, e: x.eingabe, f: x.bot.festZahl, ak: raum.state.spieler.get(sid).aktion })).join(' ');
  assert.ok(await bis(() => bots().every(b => innen(b)), 20000), 'nicht alle Bots kommen ins Haus: ' + bericht());
  // wieder hinaus: Mensch geht vor die Tür, die Bots müssen alle durch den Ausgang folgen
  p.ebene = ''; p.x = aus.x; p.y = aus.y;
  assert.ok(await bis(() => bots().every(b => b.ebene === '' && Math.hypot(b.x - p.x, b.y - p.y) < 260), 20000),
    'nicht alle Bots kommen heraus: ' + bericht() + ' Mensch ' + p.ebene + '@' + Math.round(p.x) + ',' + Math.round(p.y));
}

test('Mehrere Bots folgen einem Menschen durch die Haustür ins Haus und wieder hinaus', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 4, zombieFaktor: 0 };
  const a = await beitreten('Tuerfuehrer');
  try {
    const { raum, p } = a;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const s = raum.welt.safeRooms[0];
    await botsDurchDieTuer(raum, p, s.haus, s.ebene, b => safeRoomVon(raum.welt, b) === s);
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

test('Mehrere Bots folgen einem Menschen auch durch die Tür eines normalen Hauses (kein Safe Room) hinein und hinaus', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 4, zombieFaktor: 0 };
  const a = await beitreten('Tuerfuehrer2');
  try {
    const { raum, p } = a;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const sicher = new Set(raum.welt.safeRooms.map(r => r.haus));
    const h = raum.welt.haeuser.find(x => x.betretbar && !sicher.has(x) && aussenPunkte(raum, x, 4, 20) && aussenPunkte(raum, x, 1, 90));
    assert.ok(h, 'kein normales betretbares Haus');
    const ebene = `h${h.nr}eg`;
    // Zombies im Haus (und vor der Tür) entfernen, damit nur das Folgen geprüft wird
    for (const [id, z] of [...raum.state.zombies]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    await botsDurchDieTuer(raum, p, h, ebene, b => b.ebene === ebene);
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

// ---------- Tauschen mit Bots ----------
test('Tauschen mit Bot: er bietet Überzähliges an, der Tausch kommt zustande; seine einzige Waffe gibt er nicht her', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Tauscher');
  try {
    const { raum, p } = a;
    const [bsid, bx] = [...raum.extra.entries()].find(([, x]) => x.bot);
    const bot = raum.state.spieler.get(bsid);
    bot.ebene = ''; p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; bot.x = p.x + 20; bot.y = p.y;
    let fenster = null; a.c.onMessage('tausch', m => { fenster = m; });
    // Bot hat 5 Wasser (2 über der Grenze) und nur eine Waffe in der Hand
    bot.rucksack.clear(); for (let i = 0; i < 5; i++) bot.rucksack.push('wasser'); bot.rucksack.push('verband'); bot.waffe = 'messer';
    p.rucksack.clear(); p.rucksack.push('seil'); p.rucksack.push('bretter');
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster?.seinOk === true), 'kein Tauschfenster');
    a.c.send('tausch_anbieten', { platz: 0 });
    assert.ok(await bis(() => fenster?.meins?.length === 1 && fenster?.seins?.length === 1 && fenster?.seinOk), 'kein Gegenangebot: ' + JSON.stringify(fenster));
    assert.equal(fenster.seins[0], 'wasser', 'Bot bietet nicht das Überzählige an');
    a.c.send('tausch_ok');
    assert.ok(await bis(() => p.rucksack.includes('wasser') && !raum.tausche.has(a.c.sessionId)), 'Tausch nicht ausgeführt');
    assert.ok(bot.rucksack.includes('seil'));
    assert.equal(bot.waffe, 'messer');
    // Mensch ist verletzt: Bot gibt den Verband gegen eine Kleinigkeit
    p.hp = 20; fenster = null;
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster?.seinOk === true));
    a.c.send('tausch_anbieten', { platz: p.rucksack.indexOf('bretter') });
    assert.ok(await bis(() => fenster?.seins?.length === 1));
    assert.equal(fenster.seins[0], 'verband', 'verletzter Mensch bekommt keinen Verband');
    a.c.send('tausch_ende');
    // Bot hat nur seine eine Waffe und sonst fast nichts: gibt sie nicht her; Schenken nimmt er nur an, wenn er es will
    await bis(() => !raum.tausche.has(a.c.sessionId));
    bot.rucksack.clear(); bot.waffe = 'schrotflinte'; p.rucksack.clear(); p.rucksack.push('seil'); p.hp = 100; fenster = null;
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster?.seinOk === true));
    a.c.send('tausch_anbieten', { platz: 0 });
    await warte(200);
    assert.deepEqual(fenster.seins, [], 'Bot gibt etwas her, obwohl er nichts übrig hat');
    assert.equal(bot.waffe, 'schrotflinte');
    a.c.send('tausch_ende');
    // Bot mit Ersatzwaffe im Rucksack und Waffe in der Hand: einzige Waffe bleibt auch im Rucksack
    await bis(() => !raum.tausche.has(a.c.sessionId));
    bot.waffe = ''; bot.rucksack.clear(); bot.rucksack.push('pistole'); p.hp = 100; p.rucksack.clear(); p.rucksack.push('seil'); fenster = null;
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster));
    a.c.send('tausch_anbieten', { platz: 0 });
    await warte(200);
    assert.ok(!fenster.seins.includes('pistole'), 'Bot gibt seine einzige Waffe her');
    a.c.send('tausch_ende');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

test('Schenken: Bot nimmt Geschenke an (auch eine Ersatz-Taschenlampe), nur bei vollem Rucksack nicht', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Schenker');
  try {
    const { raum, p } = a;
    const [bsid] = [...raum.extra.entries()].find(([, x]) => x.bot);
    const bot = raum.state.spieler.get(bsid);
    bot.ebene = ''; p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; bot.x = p.x + 20; bot.y = p.y;
    let fenster = null; a.c.onMessage('tausch', m => { fenster = m; });
    bot.rucksack.clear(); bot.waffe = 'messer';   // nichts übrig, braucht Wasser
    p.hp = 100; p.durst = 100; p.rucksack.clear(); p.rucksack.push('wasser'); p.rucksack.push('seil');
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster));
    a.c.send('tausch_anbieten', { platz: 0 });
    assert.ok(await bis(() => fenster?.meins?.length === 1 && fenster.seinOk === true), 'Bot nimmt Wasser nicht an');
    a.c.send('tausch_ok');
    assert.ok(await bis(() => bot.rucksack.includes('wasser')), 'Geschenk kommt nicht an');
    // eine zweite Taschenlampe (er hat schon eine) nimmt er als Geschenk trotzdem
    fenster = null;
    bot.rucksack.push('taschenlampe'); p.rucksack.clear(); p.rucksack.push('taschenlampe');
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster));
    a.c.send('tausch_anbieten', { platz: 0 });
    assert.ok(await bis(() => fenster?.meins?.length === 1 && fenster.seinOk === true), 'Bot nimmt die Taschenlampe nicht');
    a.c.send('tausch_ok');
    assert.ok(await bis(() => zaehle(bot.rucksack, 'taschenlampe') === 2), 'Taschenlampe kommt nicht an');
    // voller Rucksack: kein Platz für ein Geschenk
    fenster = null;
    while (bot.rucksack.length < bot.plaetze) bot.rucksack.push('bretter');
    p.rucksack.clear(); p.rucksack.push('seil');
    a.c.send('tausch_start', { mit: bsid });
    assert.ok(await bis(() => fenster));
    a.c.send('tausch_anbieten', { platz: 0 });
    assert.ok(await bis(() => fenster?.meins?.length === 1));
    await warte(100);
    // voll: entweder lehnt er ab oder er gibt im Tausch etwas Überzähliges her (dann passt es wieder)
    assert.ok(fenster.seinOk === false || fenster.seins.length >= 1, 'Bot nimmt trotz vollem Rucksack an, ohne etwas abzugeben');
    a.c.send('tausch_ende');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

// ---------- Hecken und niedrige Zäune für Zombies und Bots ----------
test('Zombies und Bots: durch Hecke und Holzzaun langsam, Metallzaun bleibt zu', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const { c, raum } = await beitreten('Gaertner');
  const w = raum.welt, K = w.kacheln, alt = w.details, kopie = K.slice();
  try {
    // freie, gerade Reihe von 12 Kacheln auf Wiese suchen
    let ort = null;
    for (let ky = 3; ky < W.HOEHE - 3 && !ort; ky++) for (let kx = 2; kx < W.BREITE - 13 && !ort; kx++) {
      let gut = true;
      for (let i = 0; i < 12 && gut; i++) if (!W.frei(w, (kx + i + 0.5) * KACHEL, (ky + 0.5) * KACHEL, 12) || w.hole(kx + i, ky) !== W.T.WIESE) gut = false;
      if (gut) ort = { kx, ky };
    }
    assert.ok(ort, 'keine freie Reihe');
    const zaunart = new Array(W.BREITE * W.HOEHE).fill('');
    const gehe = (z, ziel) => {   // Schritte (0,05 s, Tempo 100 px/s) bis zum Ziel, höchstens 400
      let n = 0;
      while (n < 400 && z.x < ziel) { raum.zombieGehen(z, 0, 100 * 0.05, 0.05); n++; }
      return n;
    };
    const start = () => ({ x: (ort.kx + 1) * KACHEL, y: (ort.ky + 0.5) * KACHEL, ebene: '', jagt: true });
    const ziel = (ort.kx + 10) * KACHEL;
    const frei_ = gehe(start(), ziel);
    // zwei Kacheln dicke Zaunwand über die ganze Kartenhöhe (Kartenrand und Wiese; so führt kein Weg drumherum)
    const setze = art => {
      K.set(kopie);
      for (let ky = 1; ky < W.HOEHE - 1; ky++) for (const i of [4, 5]) { K[ky * W.BREITE + ort.kx + i] = W.T.ZAUN; zaunart[ky * W.BREITE + ort.kx + i] = art; }
      w.details = { zaunart };
    };
    setze('h');
    const hecke = gehe(start(), ziel);
    assert.ok(hecke > frei_ + 20 && hecke < 390, `Hecke: ${hecke} Schritte, frei ${frei_}`);
    setze('z');
    const holz = gehe(start(), ziel);
    assert.ok(holz > frei_ + 10 && holz < hecke, `Holzzaun: ${holz} Schritte (Hecke ${hecke}, frei ${frei_})`);
    setze('m');
    const z = start(); gehe(z, ziel);
    assert.ok(z.x < (ort.kx + 4) * KACHEL, 'Zombie kommt durch den Metallzaun: ' + z.x);
    // Bot folgt durch die Hecke
    setze('h');
    const bsid = [...raum.extra.entries()].find(([, x]) => x.bot)[0];
    const bot = raum.state.spieler.get(bsid), p = raum.state.spieler.get(c.sessionId);
    bot.ebene = ''; bot.waffe = ''; bot.x = (ort.kx + 1.5) * KACHEL; bot.y = (ort.ky + 0.5) * KACHEL;
    p.ebene = ''; p.x = (ort.kx + 11) * KACHEL; p.y = (ort.ky + 0.5) * KACHEL;
    assert.equal(W.findeWeg(w, bot.x, bot.y, p.x, p.y, 11, 40000), null, 'Weg ohne Zaun gefunden – Testaufbau kaputt');
    assert.ok(W.findeWeg(w, bot.x, bot.y, p.x, p.y, 11, 40000, true), 'keine Wegsuche durch die Hecke');
    assert.ok(await bis(() => bot.x > (ort.kx + 6.6) * KACHEL, 25000), 'Bot kommt nicht durch die Hecke: ' + Math.round(bot.x) + ' / ' + (ort.kx + 6.6) * KACHEL);
    // Metallzaun: Bot bleibt davor
    setze('m');
    bot.x = (ort.kx + 1.5) * KACHEL; bot.y = (ort.ky + 0.5) * KACHEL; bot.weg = null;
    await warte(2500);
    assert.ok(bot.x < (ort.kx + 4) * KACHEL, 'Bot geht durch den Metallzaun');
  } finally {
    K.set(kopie); w.details = alt;
    await c.leave();
    SpielRaum.einstellungen = vorher;
  }
});

test('Stapel im Rucksack: Benutzen/Wegwerfen nehmen 1 Stück, Aufheben stapelt, zweite Tasche geht nicht, Munitionskiste öffnet sich', async () => {
  const a = await beitreten('Stapler');
  try {
    const { raum, p, c } = a;
    p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.ebene = '';
    raum.state.boden.clear();
    p.rucksack.clear(); p.rucksack.push('wasser*3'); p.durst = 10;
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.durst > 30), 'Wasser nicht getrunken');
    assert.deepEqual([...p.rucksack], ['wasser*2']);
    c.send('wegwerfen', { platz: 0 });
    assert.ok(await bis(() => raum.state.boden.size === 1), 'Wegwerfen legt nichts hin');
    assert.deepEqual([...p.rucksack], ['wasser']);
    // Aufheben: gleiche Dinge landen auf dem vorhandenen Stapel
    const id = [...raum.state.boden.keys()][0];
    c.send('aufheben_wahl', { id });
    assert.ok(await bis(() => raum.state.boden.size === 0), 'nicht aufgehoben');
    assert.deepEqual([...p.rucksack], ['wasser*2']);
    // nur eine Tasche tragbar: die zweite bleibt liegen
    p.rucksack.clear(); p.rucksack.push('tasche');
    const t2 = raum.legeHin('trekking', p.x, p.y);
    c.send('aufheben_wahl', { id: t2 });
    await new Promise(r => setTimeout(r, 200));
    assert.ok(raum.state.boden.has(t2), 'zweite Tasche aufgehoben');
    assert.deepEqual([...p.rucksack], ['tasche']);
    // Munitionskiste: bei Vorrat <= 120 öffnet sie sich von selbst (+30)
    p.rucksack.clear(); p.rucksack.push('munitionskiste*2'); p.munition = 100;
    assert.ok(await bis(() => p.munition + p.magazin >= 130 && zaehle(p.rucksack, 'munitionskiste') === 1), 'Kiste öffnet sich nicht: ' + p.munition + ' ' + JSON.stringify([...p.rucksack]));
    // von Hand benutzen
    p.munition = 140;
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.munition === 150 && zaehle(p.rucksack, 'munitionskiste') === 0), 'Benutzen öffnet die Kiste nicht');
  } finally { await a.c.leave(); }
});
