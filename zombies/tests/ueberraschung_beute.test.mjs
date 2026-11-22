// Belohnungsspind hinter Rätsel-Türen, Messer in Küchen, Überraschungszombie, Wiedereinstieg im Lager
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse, BEUTE, KACHEL } from '../client/welt.mjs';
import { rahmen, imLager } from '../client/stuetzpunkt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
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

async function frisch() {
  if (!await bis(() => !SpielRaum.aktiv, 3000)) {
    const alt = SpielRaum.aktiv;
    try { for (const k of [...(alt?.clients ?? [])]) k.leave?.(); await alt?.disconnect?.(); } catch { /* egal */ }
    assert.ok(await bis(() => !SpielRaum.aktiv, 5000), 'alter Raum lebt noch');
  }
  SpielRaum.speicher.loescheWelt();
}
async function beitreten(name = 'Sepp', spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId, seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.schritt = () => {};
  const p = raum.state.spieler.get(c.sessionId);
  p.waffe = ''; p.munition = 0;
  raum.extra.get(c.sessionId).pause = 1e6;
  return { c, raum, p, spielerId };
}
const falsch = (c) => ({ sessionId: c.sessionId, send() {} });
// Behälter durchsuchen und Inhalt zurückgeben
function suche(raum, c, p, b) {
  raum.inhalte.delete(b.id); raum.ueberrascht?.delete(b.id);
  p.rucksack.length = 0; p.plaetze = 1000; p.waffe = ''; p.munition = 0; p.pfeile = 0;
  const vor = raum.state.zombies.size;
  raum.durchsucht(falsch(c), p, b);
  return { inhalt: [...(raum.inhalte.get(b.id) ?? [])], gefunden: [...p.rucksack, p.waffe].filter(Boolean), zombies: raum.state.zombies.size - vor, munition: p.munition, pfeile: p.pfeile };
}
// alle Behälter aller betretbaren Häuser (Erdgeschoss), mit Raumtypen
function ebenen(raum) {
  const l = [];
  for (const h of raum.welt.haeuser) if (h.betretbar && !h.safe) { const w = raum.wv(`h${h.nr}eg`); if (w?.behaelter) l.push(w); }
  return l;
}
const WAFFEN = ['pistole', 'mp', 'gewehr', 'schrotflinte', 'armbrust'];

test('Belohnungsspind hinter Rätsel-Tür: viel mehr Waffen als normale Schränke und Spinde', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Beute');
  const einst = SpielRaum.einstellungen, alt = einst.ueberraschung;
  einst.ueberraschung = 0;
  const bel = [], norm = [];
  for (const w of ebenen(raum)) for (const b of w.behaelter) {
    if (b.art !== 'schrank' && b.art !== 'spind') continue;
    if (b.tuer && raum.tuerArt(`${w.ebene}:${b.tuer[0]},${b.tuer[1]}`) === 'raetsel') bel.push(b); else norm.push(b);
  }
  assert.ok(bel.length > 0, 'kein Belohnungsbehälter in der Welt');
  const quote = liste => {
    let n = 0, t = 0;
    for (const b of liste.slice(0, 20)) for (let i = 0; i < 40; i++) { const r = suche(raum, c, p, b); t++; if (r.gefunden.some(d => WAFFEN.includes(d))) n++; }
    return n / t;
  };
  const q1 = quote(bel), q2 = quote(norm);
  assert.ok(q1 > 0.4, 'Belohnungsquote zu klein: ' + q1);
  assert.ok(q1 > q2 * 1.8, `Belohnung ${q1} nicht deutlich über normal ${q2}`);
  assert.ok(BEUTE.spind_belohnung.includes('verband') && BEUTE.spind_belohnung.includes('spritze'));
  einst.ueberraschung = alt;
  await c.leave();
});

test('Küche: Herd und Spüle liefern oft ein Messer (je Küche 50–85 %)', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Koch');
  const einst = SpielRaum.einstellungen, alt = einst.ueberraschung;
  einst.ueberraschung = 0;
  let kuechen = 0, treffer = 0, versuche = 0;
  for (const w of ebenen(raum)) for (const r of w.raeume.filter(r => r.typ === 'kueche')) {
    const bs = w.behaelter.filter(b => (b.art === 'herd' || b.art === 'spuele') && Math.floor(b.x / KACHEL) >= r.x && Math.floor(b.x / KACHEL) < r.x + r.b && Math.floor(b.y / KACHEL) >= r.y && Math.floor(b.y / KACHEL) < r.y + r.h);
    if (bs.length < 2) continue;
    kuechen++;
    if (kuechen > 25) break;
    for (let i = 0; i < 30; i++) { versuche++; if (bs.some(b => suche(raum, c, p, b).gefunden.includes('messer'))) treffer++; }
  }
  assert.ok(kuechen >= 3, 'zu wenige Küchen mit Herd und Spüle: ' + kuechen);
  const q = treffer / versuche;
  assert.ok(q > 0.5 && q < 0.85, 'Messerquote je Küche: ' + q);
  einst.ueberraschung = alt;
  await c.leave();
});

test('Überraschungszombie: bei 100 % springt er heraus (Durchsuchen bricht ab), bei 0 % nie, nicht im Safe Room', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Schreck');
  const einst = SpielRaum.einstellungen, alt = einst.ueberraschung;
  const w = ebenen(raum).find(w => w.behaelter.some(b => b.art === 'schrank' || b.art === 'spind'));
  const b = w.behaelter.find(b => b.art === 'schrank' || b.art === 'spind');
  p.ebene = w.ebene; p.x = b.x; p.y = b.y; p.sicher = '';
  einst.ueberraschung = 100;
  let r = suche(raum, c, p, b);
  assert.equal(r.zombies, 1, 'kein Zombie');
  assert.deepEqual(r.inhalt, [], 'Durchsuchen nicht abgebrochen');
  assert.ok(!raum.inhalte.has(b.id));
  const nachErsten = raum.state.zombies.size;
  const z = [...raum.state.zombies.values()].pop();
  assert.ok(Math.hypot(z.x - b.x, z.y - b.y) < 60 && z.ebene === w.ebene, 'Zombie nicht daneben');
  // zweites Durchsuchen desselben Behälters: normal
  raum.durchsucht(falsch(c), p, b);
  assert.ok(raum.inhalte.has(b.id));
  assert.equal(raum.state.zombies.size, nachErsten);
  // 0 %: nie
  einst.ueberraschung = 0;
  raum.state.zombies.clear();
  let n = 0;
  for (const bb of w.behaelter.filter(b => ['schrank', 'spind'].includes(b.art))) for (let i = 0; i < 30; i++) n += suche(raum, c, p, bb).zombies;
  assert.equal(n, 0);
  // Auto draußen bei 100 %
  einst.ueberraschung = 100;
  const auto = raum.welt.behaelter.find(b => b.art === 'auto');
  assert.ok(auto, 'kein Auto');
  p.ebene = ''; p.x = auto.x; p.y = auto.y;
  r = suche(raum, c, p, auto);
  assert.equal(r.zombies, 1, 'Auto: kein Zombie');
  // Safe Room: nie
  const safe = raum.welt.safeRooms[0];
  const pos = raum.safePlatz(safe);
  p.ebene = pos.ebene; p.x = pos.x; p.y = pos.y; p.sicher = safe.id;
  raum.state.zombies.clear();
  r = suche(raum, c, p, { id: 'test:b99', art: 'schrank', x: p.x, y: p.y });
  assert.equal(r.zombies, 0, 'Zombie im Safe Room');
  einst.ueberraschung = alt;
  await c.leave();
});

test('Wiedereinstieg: Abmeldung im Bundeswehr-Lager führt beim Anmelden ins Lager zurück, Rückfall auf Safe Room wenn es gefallen ist', async () => {
  await frisch();
  const id = neueId();
  let { c, raum, p } = await beitreten('Lagerfeuer', id);
  const sp = raum.welt.stuetzpunkt;
  const [mx, my] = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(15.5, 9);
  p.x = mx; p.y = my; p.ebene = '';
  assert.ok(await bis(() => p.sicher === 'lager'), 'nicht im Lager');
  await c.leave();
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000));
  ({ c, raum, p } = await beitreten('Lagerfeuer', id));
  assert.ok(imLager(raum.welt.stuetzpunkt, p.x, p.y) && p.ebene === '', `nicht im Lager: ${p.x},${p.y} ${p.ebene}`);
  assert.ok(Math.hypot(p.x - mx, p.y - my) < 60, 'nicht am Abmeldeort');
  // Lager fällt, Abmeldung dort … nächste Anmeldung im Safe Room (Lager steht nicht mehr)
  raum.state.stuetzpunkt = 'gefallen';
  await warte(100);
  await c.leave();
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000));
  ({ c, raum, p } = await beitreten('Lagerfeuer', id));
  assert.ok(p.ebene !== '' || !imLager(raum.welt.stuetzpunkt, p.x, p.y), 'im gefallenen Lager eingestiegen');
  await c.leave();
});
