// Bundeswehr-Stützpunkt, Teil 3: Soldaten sterben, laufen bei Angriffen zum Hotspot; Evakuierungsfahrzeug fährt ein
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

const PORT = 28100 + Math.floor(Math.random() * 9);
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
const stehtDa = (raum, id) => raum.state.zombies.has(id);
const planOrt = (sp, u, v) => rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(u, v);
// Zombie an einem Punkt des Bauplans (u, v in Kacheln) – steht still
function zombieBei(raum, sp, u, v) {
  const [x, y] = planOrt(sp, u, v);
  const id = raum.setzeZombie(x, y, '');
  ruhig(raum, id);
  return id;
}

test('Soldaten sterben im Nahkampf; sind alle tot, fällt das Lager', async () => {
  await frisch();
  const { c, raum, nachrichten } = await beitreten('Tod');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  st.nester = []; st.puma = null; st.soldatSchritt = () => {};   // sie sollen sich nicht freischießen
  assert.ok(st.schuetzen.length >= 4, 'zu wenig Soldaten: ' + st.schuetzen.length);
  assert.equal(raum.state.stuetzpunkt, 'steht');
  const erster = st.schuetzen[0];
  zombieBei(raum, sp, ...Object.values(planKoord(sp, erster.x, erster.y)));
  assert.ok(await bis(() => erster.tot, 8000), 'Soldat stirbt nicht ' + JSON.stringify({ hp: erster.hp, z: [...raum.state.zombies.values()].map(z => [z.x, z.y, z.hp, z.ebene]), s: [erster.x, erster.y], f: st.einst(), stz: raum.state.stuetzpunkt }));
  assert.ok(nachrichten.soldatTot.some(m => m.n === erster.n), 'keine Todesmeldung');
  assert.equal(raum.state.stuetzpunkt, 'steht', 'ein Toter lässt das Lager nicht fallen');
  const nachlegen = setInterval(() => { for (const q of st.schuetzen) if (!q.tot && ![...raum.state.zombies.values()].some(z => Math.hypot(z.x - q.x, z.y - q.y) < 20)) zombieBei(raum, sp, ...Object.values(planKoord(sp, q.x, q.y))); }, 200);
  assert.ok(await bis(() => raum.state.stuetzpunkt === 'gefallen', 25000), 'Lager fällt nicht ' + JSON.stringify(st.schuetzen.map(q => [q.tot, Math.round(q.hp)])));
  clearInterval(nachlegen);
  assert.ok(nachrichten.meldung.some(m => m.text.includes('Alle Soldaten sind gefallen')));
  await beenden(c);
});

test('Soldaten sind bei „fällt nie“ unverwundbar', async () => {
  await frisch();
  const { c, raum } = await beitreten('Fest');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt, e = SpielRaum.einstellungen, alt = e.bundeswehr;
  try {
    e.bundeswehr = { aktiv: true, falltage: 0 };
    st.nester = []; st.puma = null; st.soldatSchritt = () => {};
    const q = st.schuetzen[0];
    zombieBei(raum, sp, ...Object.values(planKoord(sp, q.x, q.y)));
    await warte(2500);
    assert.equal(q.tot, false);
  } finally { e.bundeswehr = alt; }
  await beenden(c);
});

test('Angriffs-Hotspot: ein Teil der Soldaten rückt aus (mindestens 2 bleiben), danach zurück auf die Posten, nie aus dem Lager', async () => {
  await frisch();
  const { c, raum } = await beitreten('Hot');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  st.nester = []; st.puma = null;
  const alle = st.schuetzen, n = alle.length;
  for (const [u, v] of [[24, 6], [24.1, 6.1], [23.9, 5.9], [24.05, 6.15], [23.95, 6.05], [24.1, 5.9], [24, 6.2], [23.9, 6.1]]) zombieBei(raum, sp, u, v);   // im Lager, aber weit weg von den Soldaten
  for (const z of raum.state.zombies.values()) z.hp = 1e9;   // die Soldaten töten sie nicht
  raum.stuetzpunkt.soldatSchritt = () => {};
  let zuHause = q => Math.hypot(q.x - q.hx, q.y - q.hy) < 2;
  assert.ok(await bis(() => alle.filter(q => !zuHause(q)).length >= 1, 8000), 'niemand rückt aus ' + JSON.stringify({ n, hot: st.hotspot({ hotZelle: null }), m: alle.map(q => [q.modus, q.weg.length, q.tot, Math.round(q.hp)]), z: raum.state.zombies.size, stz: raum.state.stuetzpunkt }));
  await warte(3000);
  const aus = alle.filter(q => !zuHause(q));
  assert.ok(aus.length <= n - 2, `mindestens 2 bleiben: ${aus.length} von ${n} ausgerückt`);
  assert.ok(n - aus.length >= Math.ceil(n / 2) - 0 || aus.length <= Math.floor(n / 2), 'höchstens die Hälfte rückt aus');
  for (const q of aus) { const { u, v } = planKoord(sp, q.x, q.y); assert.ok(u > -1 && u < 31 && v > 0 && v < 23, `Soldat verlässt das Lager: u=${u} v=${v}`); }
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  assert.ok(await bis(() => alle.every(q => zuHause(q) && q.modus === 'post'), 25000), 'nicht alle zurück auf den Posten');
  await beenden(c);
});

test('Evakuierungsfahrzeug fährt sichtbar ein, steht erst nach der Ankunft und fährt sichtbar wieder aus', async () => {
  await frisch();
  const { c, raum } = await beitreten('Bus');
  const v = raum.verkehr;
  const halt = v.graph.knoten[Math.floor(v.graph.knoten.length / 2)];
  const id = v.evakuierungBus(halt.x, halt.y, 0, halt);
  const f = raum.state.fahrzeuge.get(id);
  assert.ok(Math.hypot(f.x - halt.x, f.y - halt.y) > 250, 'er steht schon an der Haltestelle');
  assert.equal(v.evakuierungDa(id), false);
  for (let i = 0; i < 4000 && !v.evakuierungDa(id); i++) v.schritt(0.1);
  assert.equal(v.evakuierungDa(id), true, 'kommt nie an');
  assert.ok(Math.hypot(f.x - halt.x, f.y - halt.y) < 30);
  v.evakuierungAb(id);
  assert.equal(v.evakuierungDa(id), false);
  for (let i = 0; i < 6000 && raum.state.fahrzeuge.has(id); i++) v.schritt(0.1);
  assert.ok(!raum.state.fahrzeuge.has(id), 'fährt nicht aus');
  await beenden(c);
});
