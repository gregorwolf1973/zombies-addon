// Radio als Lockmittel, Bundeswehr-Lager als Safe House (4 Vorratskisten), Munitionsnachschub der Soldaten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige } from '../server/einstellungen.mjs';
import { WAFFEN_RANG, GRENZE } from '../server/bots.mjs';
import { KACHEL, BREITE, HOEHE, T, DINGE, WAFFEN, BEUTE, LEICHE_SELTEN, LEICHE_OFT, GRANATE, HANDEL, MUNITION_MAX, TEMPO_MG, bezahlung, setzeKartengroesse, frei, linieFrei, sichtfrei } from '../client/welt.mjs';
import { rahmen, handelsleute, zeltWandImWeg, planKoord, imLager, fahrFlaeche, PUMA_PARK } from '../client/stuetzpunkt.mjs';

const PORT = 28300 + Math.floor(Math.random() * 9);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

const NACHRICHTEN = ['bwschuss', 'soldatTot', 'bwSoldaten', 'meldung'];
// Spieler mit allen Hilfen: keine Zombies, keine Welle; Nachrichten werden gesammelt
async function beitreten(name = 'Sepp', spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId, seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.schritt = () => {};
  raum.kriecherChance = 0;
  raum.stuetzpunkt.trefferChance = 1;
  const nachrichten = {};
  for (const art of NACHRICHTEN) { nachrichten[art] = []; c.onMessage(art, m => nachrichten[art].push(m)); }
  const p = raum.state.spieler.get(c.sessionId);
  p.waffe = ''; p.munition = 0;   // die Startpistole schießt sonst von selbst mit
  raum.extra.get(c.sessionId).pause = 1e6;   // und auch die Faust schlägt nicht automatisch zu (Tests, die schießen, setzen die Pause zurück)
  return { c, raum, p, nachrichten, spielerId };
}
// vor jedem Test eine frische Welt; ein nach einem Fehlschlag übrig gebliebener Raum wird geschlossen,
// damit ein einzelner Fehler nicht alle folgenden Tests mitreißt
async function frisch() {
  if (!await bis(() => !SpielRaum.aktiv, 3000)) {
    const alt = SpielRaum.aktiv;
    try { for (const k of [...(alt?.clients ?? [])]) k.leave?.(); await alt?.disconnect?.(); } catch { /* egal */ }
    assert.ok(await bis(() => !SpielRaum.aktiv, 5000), 'alter Raum lebt noch');
  }
  SpielRaum.speicher.loescheWelt();
}
async function beenden(...clients) {
  for (const c of clients) await c.leave();
  await bis(() => !SpielRaum.aktiv, 3000);
}
const ruhig = (raum, id) => { const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; i.bleibt = true; };
const planOrt = (sp, u, v) => rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(u, v);

test('Radio: einschalten legt es ab, macht regelmäßig weiten Lärm, lockt Zombies, geht nach 75 s kaputt und verschwindet', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Funk');
  const welt = raum.welt;
  p.x = welt.start.x; p.y = welt.start.y; p.ebene = '';
  p.rucksack.splice(0, p.rucksack.length, 'radio');
  const z = raum.setzeZombie(p.x + 400, p.y, ''); ruhig(raum, z);
  const laerm = [];
  const orig = raum.laerm.bind(raum);
  raum.laerm = (x, y, weite, ...r) => { laerm.push({ x, y, weite }); return orig(x, y, weite, ...r); };
  c.send('benutze', { platz: 0 });
  assert.ok(await bis(() => raum.radios.liste.length === 1), 'Radio nicht aufgestellt');
  assert.equal(p.rucksack.length, 0, 'Radio bleibt im Rucksack');
  const r = raum.radios.liste[0];
  raum.radios.schritt(0.1);
  assert.ok(laerm.some(l => Math.abs(l.x - r.x) < 1 && l.weite >= 600), 'kein weiter Lärm');
  const info = raum.zombieInfo.get(z);
  assert.ok(info.punkt && Math.hypot(info.punkt.x - r.x, info.punkt.y - r.y) <= 40 * Math.SQRT2 + 1, 'Zombie läuft nicht zum Radio');   // Lärmpunkt je Zombie um ±40 px gestreut
  const n0 = laerm.length;
  for (let i = 0; i < 40; i++) raum.radios.schritt(0.5);   // 20 s: mehrere Lärm-Ereignisse
  assert.ok(laerm.length - n0 >= 4, 'Lärm nicht regelmäßig');
  for (let i = 0; i < 120; i++) raum.radios.schritt(0.5);   // zusammen > 75 s
  assert.equal(r.aus, true, 'Radio läuft ewig');
  const n1 = laerm.length;
  raum.radios.schritt(5);
  assert.equal(laerm.length, n1, 'kaputtes Radio macht noch Lärm');
  assert.equal(raum.radios.liste.length, 1, 'kaputtes Radio sollte kurz liegen bleiben');
  raum.radios.schritt(30);
  assert.equal(raum.radios.liste.length, 0, 'kaputtes Radio bleibt ewig');
  await beenden(c);
});

test('Radio: Beute – kommt in Schrank, Kaufhaus und Bus vor, aber selten', () => {
  for (const art of ['schrank', 'laden_kaufhaus', 'bus']) {
    const t = BEUTE[art];
    assert.equal(t.filter(d => d === 'radio').length, 1, art);
    assert.ok(t.length >= 9, art);
  }
  assert.ok(DINGE.radio && DINGE.radio.name === 'Radio');
});

test('Bundeswehr-Lager ist Safe House (solange es steht) mit 4 Vorratskisten, Munition darf hinein', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Lager');
  const sp = raum.welt.stuetzpunkt, kisten = sp.teile.filter(t => t.art === 'vorratskiste');
  assert.equal(kisten.length, 4, 'vier Vorratskisten');
  for (const k of kisten) assert.ok(raum.state.safes.has(k.id), 'Kiste ohne state.safes ' + k.id);
  // im Lager (Mitte): Safe House
  const [mx, my] = planOrt(sp, 15.5, 9);
  p.x = mx; p.y = my; p.ebene = '';
  assert.ok(await bis(() => p.sicher === 'lager'), 'im Lager nicht sicher');
  // vor der ersten Kiste: Munition hinein, gemeinsame Kiste
  const k = kisten[0];
  p.x = k.x; p.y = k.y + 20;
  p.rucksack.splice(0, p.rucksack.length, 'munition');
  c.send('kiste', { richtung: 'rein', platz: 0 });
  assert.ok(await bis(() => [...raum.state.safes.get(k.id).kiste].includes('munition')), 'Munition nicht in der Kiste');
  c.send('kiste', { richtung: 'raus', platz: 0 });
  assert.ok(await bis(() => p.rucksack.includes('munition')), 'Munition nicht wieder heraus');
  // draußen vor dem Draht: nicht sicher
  const [ax, ay] = planOrt(sp, 15.5, -4);
  p.x = ax; p.y = ay;
  assert.ok(await bis(() => p.sicher === ''), 'draußen vor dem Lager sicher');
  // Lager fällt: keine Safe-House-Wirkung mehr, Kisten gesperrt
  p.x = k.x; p.y = k.y + 20;
  assert.ok(await bis(() => p.sicher === 'lager'));
  raum.state.stuetzpunkt = 'gefallen';
  assert.ok(await bis(() => p.sicher === ''), 'gefallenes Lager noch Safe House');
  p.rucksack.splice(0, p.rucksack.length, 'wasser');
  c.send('kiste', { richtung: 'rein', platz: 0 });
  await warte(200);
  assert.ok(!raum.state.safes.get(k.id).kiste.includes('wasser'), 'Kiste des gefallenen Lagers noch offen');
  await beenden(c);
});

test('Munitionsnachschub: leeres MG-Nest und leerer Puma – zwei Soldaten holen Munition am Container und füllen auf', async () => {
  await frisch();
  const { c, raum, nachrichten } = await beitreten('Nach');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  assert.ok(st.nester.length >= 1 && st.puma, 'Nester/Puma fehlen');
  const e = st.einst();
  assert.equal(st.nester[0].muni, e.mgMunition); assert.equal(st.puma.muni, e.pumaMunition);
  st.puma.fest = true;
  const nest = st.nester[0];
  // leeres Nest schießt nicht, auch wenn ein Zombie vor dem Draht steht
  nest.muni = 0;
  const cont = sp.teile.find(t => t.art === 'container');
  let weg = 0, minAbstand = Infinity, ausgerueckt = 0;
  const posten = new Map(st.schuetzen.map(q => [q.n, [q.hx, q.hy]]));
  for (let i = 0; i < 1200 && nest.muni <= 0; i++) {
    st.schritt(0.25);
    const traeger = st.schuetzen.filter(q => q.modus === 'nachschub');
    ausgerueckt = Math.max(ausgerueckt, traeger.length);
    for (const q of traeger) { minAbstand = Math.min(minAbstand, Math.hypot(q.x - cont.x, q.y - cont.y)); weg = Math.max(weg, Math.hypot(q.x - q.hx, q.y - q.hy)); }
  }
  assert.equal(nest.muni, e.mgMunition, 'Nest nicht wieder voll');
  assert.equal(ausgerueckt, 2, 'zwei Soldaten sollten ausrücken');
  assert.ok(minAbstand < 70, 'Soldaten kamen nicht zum Container: ' + minAbstand);
  assert.ok(weg > 40, 'Soldaten haben ihren Posten nicht verlassen');
  await warte(100);
  assert.ok(nachrichten.meldung.some(m => m.text.includes('Soldaten holen Munition')), 'keine Meldung');
  for (let i = 0; i < 400; i++) st.schritt(0.25);   // zurück auf den Posten
  for (const q of st.schuetzen) if (!q.tot) { assert.equal(q.modus, 'post'); assert.ok(Math.hypot(q.x - posten.get(q.n)[0], q.y - posten.get(q.n)[1]) < 3, 'nicht auf dem Posten'); }
  // Puma ebenso
  st.puma.muni = 0;
  for (let i = 0; i < 1200 && st.puma.muni <= 0; i++) st.schritt(0.25);
  assert.equal(st.puma.muni, e.pumaMunition, 'Puma nicht wieder voll');
  await beenden(c);
});

test('Munition zählt: jeder MG-Schuss und jeder Kanonenschuss verbraucht Vorrat, 0 in den Einstellungen = unbegrenzt', async () => {
  await frisch();
  const { c, raum } = await beitreten('Zaehl');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  st.puma = null;
  const nest = st.nester[0];
  const vor = nest.muni;
  const [zx, zy] = [nest.x + Math.cos(nest.blick) * 150, nest.y + Math.sin(nest.blick) * 150];
  const z = raum.setzeZombie(zx, zy, ''); ruhig(raum, z);
  for (let i = 0; i < 20; i++) st.nestSchritt(nest, 0.25);
  assert.ok(nest.muni < vor || !st.gueltig(z, nest.x, nest.y, 360), 'Munition wird nicht verbraucht');
  const e = SpielRaum.einstellungen, alt = e.bundeswehr;
  try {
    e.bundeswehr = { aktiv: true, falltage: 3, mgMunition: 0, pumaMunition: 0 };
    nest.muni = 0;
    assert.equal(st.hatMuni(nest, 'mgMunition'), true, 'unbegrenzt');
  } finally { e.bundeswehr = alt; }
  await beenden(c);
});
