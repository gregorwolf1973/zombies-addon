// Bundeswehr-Stützpunkt, Teil 2: MG-Nester und Puma, Überrennen, Handgranate, MP/MG, Handel, Ärzte, Feldbetten, Funkzelt
import { flach } from '../client/stapel.mjs';
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
import { freierPort, altesTempo } from './hilfe.mjs';
altesTempo(SpielRaum);

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

const NACHRICHTEN = ['bwschuss', 'schuss', 'granate', 'explosion', 'handel', 'meldung'];
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
const ruhig = (raum, id) => { const i = raum.zombieInfo.get(id); i.steht = true; i.schlaeft = false; };
const stehtDa = (raum, id) => raum.state.zombies.has(id);
const planOrt = (sp, u, v) => rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung).ort(u, v);
// Zombie an einem Punkt des Bauplans (u, v in Kacheln) – steht still
function zombieBei(raum, sp, u, v) {
  const [x, y] = planOrt(sp, u, v);
  const id = raum.setzeZombie(x, y, '');
  ruhig(raum, id);
  return id;
}
// Punkt vor dem Draht (Bauplan u, v), den die Quelle (Nest oder Puma) sehen kann und der in Reichweite liegt (von der Karte abhängig)
function sichtPunkt(raum, quellen, min, max, seitlich = false) {
  const sp = raum.welt.stuetzpunkt, S = raum.stuetzpunkt;
  for (const v of [-2, -3, -1.5, -4]) for (let u = 3; u <= 27; u++) for (const quelle of [].concat(quellen)) {
    const [x, y] = planOrt(sp, u, v), d = Math.hypot(x - quelle.x, y - quelle.y);
    if (d < min || d > max || !S.sicht(quelle.x, quelle.y, x, y)) continue;
    if (seitlich && Math.abs(u - 14.6) < 6) continue;
    // der Punkt darf nicht selbst in einer Wand liegen
    if ([T.WAND, T.BAUM, T.LEER, T.WASSER].includes(raum.welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL)))) continue;
    return { u, v, x, y, quelle };
  }
  throw new Error('kein Punkt mit freier Sicht gefunden');
}
// Zombie vor dem Draht, den ein MG-Nest sehen und treffen könnte
function zombieImFeuer(raum) {
  const pt = sichtPunkt(raum, raum.stuetzpunkt.nester, 100, 330);
  const id = raum.setzeZombie(pt.x, pt.y, ''); ruhig(raum, id);
  return id;
}
// Spieler weit weg vom Lager (Startplatz der Karte)
function ausserhalb(raum, p) { p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.ebene = ''; }
// Spieler mitten im Lager (damit Zombies in der Nähe nicht als „weit weg“ verschwinden), Zombies stehen still
function imLagerSetzen(raum, p) {
  const [x, y] = planOrt(raum.welt.stuetzpunkt, 15, 12);
  p.x = x; p.y = y; p.ebene = '';
  einfrieren(raum);
}
// Mitte einer großen freien Fläche (± r Kacheln Wiese/Straße/Platz, in alle Richtungen frei), weit vom Stützpunkt
function offenerPlatz(raum) {
  for (const r of [8, 6, 5, 4]) { const ort = offenerPlatzR(raum, r); if (ort) return ort; }
  throw new Error('keine freie Fläche gefunden');
}
function offenerPlatzR(raum, r) {
  const w = raum.welt, ok = new Set([T.WIESE, T.STRASSE, T.PLATZ]), sp = w.stuetzpunkt;
  for (let y = r + 2; y < HOEHE - r - 2; y += 2) for (let x = r + 2; x < BREITE - r - 2; x += 2) {
    if (Math.hypot(x - (sp.x + sp.b / 2), y - (sp.y + sp.h / 2)) < 50) continue;
    let gut = true;
    for (let dy = -r; dy <= r && gut; dy++) for (let dx = -r; dx <= r; dx++) if (!ok.has(w.hole(x + dx, y + dy))) { gut = false; break; }
    if (!gut) continue;
    const cx = (x + 0.5) * KACHEL, cy = (y + 0.5) * KACHEL;
    if (frei(w, cx, cy, 11) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => linieFrei(w, cx, cy, cx + a * 260, cy + b * 260, 11))) return { x: cx, y: cy };
  }
  return null;
}
// Zombies stehen lassen (keine Wahrnehmung, keine Bewegung) – nur ihre Lebenspunkte und Lärmziele zählen
const einfrieren = raum => { raum.zombieSchritt = () => {}; };
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const diffWinkel = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

test('Stützpunkt: Bauplan-Hilfen (planKoord, imLager, Zeltwände, Händler)', async () => {
  await frisch();
  const { c, raum } = await beitreten('Hilfe');
  const sp = raum.welt.stuetzpunkt;
  assert.ok(sp, 'Geretsried ohne Stützpunkt');
  assert.equal(raum.state.stuetzpunkt, 'steht');
  const pk = planKoord(sp, ...planOrt(sp, 7.5, 3.25));
  assert.ok(Math.abs(pk.u - 7.5) < 1e-6 && Math.abs(pk.v - 3.25) < 1e-6);
  assert.ok(imLager(sp, ...planOrt(sp, 15, 12)) && !imLager(sp, ...planOrt(sp, 15, -2)) && !imLager(sp, ...planOrt(sp, 15, 1.5)), 'Lager = hinter dem Draht');
  // Zeltwand: von innen nach außen durch die Rückwand verdeckt die Sicht, im Zelt selbst nicht
  const sani = sp.teile.find(t => t.art === 'sanizelt'), co = Math.round(Math.cos(sani.winkel)), si = Math.round(Math.sin(sani.winkel));
  const welt = (lx, ly) => [sani.x + lx * co - ly * si, sani.y + lx * si + ly * co];
  assert.ok(!zeltWandImWeg(sp, ...welt(-sani.w / 4, 0), ...welt(sani.w / 4, 0)), 'im Zelt gibt es keine Wand');
  assert.ok(zeltWandImWeg(sp, ...welt(0, 0), ...welt(-sani.w, 0)), 'Zeltwand verdeckt die Sicht');
  const leute = handelsleute(sp);
  assert.equal(leute.filter(h => h.wer === 'arzt').length, 2);
  const soldaten = leute.filter(h => h.wer === 'soldat');
  assert.ok(soldaten.length >= 3 && soldaten.every(h => planKoord(sp, h.x, h.y).v >= 8), 'nur Lager-Soldaten, keine Wachen und Nester');
  await beenden(c);
});

test('MG-Nester: treffen Zombies vor dem Draht und im Lager, nicht außer Reichweite, nicht durch Wände', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('MG');
  const sp = raum.welt.stuetzpunkt;
  imLagerSetzen(raum, p);
  raum.stuetzpunkt.puma = null; raum.stuetzpunkt.schuetzen = [];   // hier nur die Nester prüfen
  const besiegt = raum.state.besiegt;
  // ins Lager eingedrungen: wird ebenfalls niedergemacht (Wunsch des Spielers)
  const drin = zombieBei(raum, sp, 28, 10);   // im Lager, 6 Kacheln vom Nest
  assert.ok(await bis(() => !stehtDa(raum, drin), 8000), 'Zombie im Lager nicht beschossen');
  raum.state.zombies.delete(drin); raum.zombieInfo.delete(drin);
  await warte(500);   // Schussmeldungen, die noch unterwegs sind, abwarten
  nachrichten.bwschuss.length = 0;
  // zu weit weg (> 45 m = 360 px vom nächsten Nest): bleibt unbehelligt
  const weit = zombieBei(raum, sp, 15, -24);
  await warte(1500);
  assert.ok(stehtDa(raum, weit), 'Zombie außer Reichweite beschossen');
  raum.state.zombies.delete(weit); raum.zombieInfo.delete(weit);
  // Sichtlinie versperrt: Wandkacheln rings um den Zombie → kein Schuss durch die Wand
  const pt = sichtPunkt(raum, raum.stuetzpunkt.nester, 120, 330);
  const [zx, zy] = [pt.x, pt.y], kx = Math.floor(zx / KACHEL), ky = Math.floor(zy / KACHEL), alt = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const i = (ky + dy) * BREITE + kx + dx; alt.push([i, raum.welt.kacheln[i]]); raum.welt.kacheln[i] = T.WAND; }
  const hinter = raum.setzeZombie(zx, zy, ''); ruhig(raum, hinter);
  await warte(2200);
  assert.ok(stehtDa(raum, hinter), 'durch die Wand geschossen');
  assert.equal(nachrichten.bwschuss.length, 0);
  for (const [i, t] of alt) raum.welt.kacheln[i] = t;
  // frei: vor dem Draht in Reichweite fällt er
  assert.ok(await bis(() => !stehtDa(raum, hinter), 5000), 'MG hat den Zombie vor dem Draht nicht getroffen');
  assert.ok(nachrichten.bwschuss.every(m => m.art === 'mg'));
  assert.ok(nachrichten.bwschuss.length >= 1 && nachrichten.bwschuss.some(m => Number.isInteger(m.n) && Number.isFinite(m.x2) && Number.isFinite(m.w)), 'keine bwschuss-Nachricht');
  assert.equal(raum.state.besiegt, besiegt, 'Abschüsse der Bundeswehr zählen nicht zu den Aufgaben der Spieler');
  await beenden(c);
});

test('Soldaten an ihren Posten schießen mit dem Gewehr auf Zombies in der Nähe (bleiben dabei stehen)', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Wache');
  const sp = raum.welt.stuetzpunkt;
  imLagerSetzen(raum, p);
  raum.stuetzpunkt.nester = []; raum.stuetzpunkt.puma = null;   // nur die Soldaten
  const sch = raum.stuetzpunkt.schuetzen;
  assert.ok(sch.length >= 3, 'zu wenige schießende Soldaten: ' + sch.length);
  // Zombie dicht neben einem Soldaten (freie Stelle suchen)
  let ziel = null;
  for (const s0 of sch) for (let w = 0; w < 6.28 && !ziel; w += 0.4) {
    const x = s0.x + Math.cos(w) * 70, y = s0.y + Math.sin(w) * 70;
    if (frei(raum.welt, x, y, 12) && sichtfrei(raum.welt, s0.x, s0.y, x, y)) ziel = { x, y };
  }
  assert.ok(ziel, 'keine freie Stelle neben einem Soldaten');
  const id = raum.setzeZombie(ziel.x, ziel.y, ''); ruhig(raum, id);
  assert.ok(await bis(() => !stehtDa(raum, id), 6000), 'Soldaten schießen nicht');
  assert.ok(nachrichten.bwschuss.some(m => m.art === 'gewehr' && Number.isInteger(m.n)), 'keine Gewehrschüsse gemeldet');
  // im Kampf bleiben sie in Stellung (höchstens ein paar Schritte Ausweichen um den Posten, nie aus dem Lager)
  const posten = sp.teile.filter(t => t.art === 'posten' && t.rolle === 'soldat');
  assert.ok(sch.every(q => posten.some(t => Math.hypot(t.x - q.x, t.y - q.y) < 90)), 'ein Soldat hat seinen Posten verlassen');
  assert.ok(sch.every(q => imLager(sp, q.x, q.y)), 'ein Soldat hat das Lager verlassen');
  await beenden(c);
});

test('Puma: Turm dreht zum Ziel, schießt alle paar Sekunden, kleiner Flächenschaden', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Puma');
  const sp = raum.welt.stuetzpunkt, puma = sp.teile.find(t => t.art === 'puma');
  imLagerSetzen(raum, p);
  raum.stuetzpunkt.nester = []; raum.stuetzpunkt.schuetzen = [];   // nur der Puma
  raum.stuetzpunkt.puma.fest = true;   // dieser Test prüft Turm und Schuss; Fahren siehe nächsten Test
  assert.ok(Math.abs(raum.state.bwTurm - puma.turm.winkel) < 1e-9, 'Turm beginnt in Fahrtrichtung');
  const anfang = raum.state.bwTurm;
  const [px, py] = planOrt(sp, 15.5, 7.0), pst = raum.stuetzpunkt.puma;   // Puma etwas weiter vorn: Ziel seitlich im Innenbereich
  pst.x = px; pst.y = py; puma.turm.x = px; puma.turm.y = py;
  const [zx0, zy0] = planOrt(sp, 24, 7.0), pt = { x: zx0, y: zy0 };   // weit seitlich vom Rohr (Bug zeigt zur Front)
  const dicht = (dx) => { const id = raum.setzeZombie(pt.x + dx, pt.y, ''); ruhig(raum, id); return id; };
  const a = dicht(0), b = dicht(11);   // dicht nebeneinander
  const za = raum.state.zombies.get(a), zb = raum.state.zombies.get(b);
  const ziel = abstand(za, puma.turm) <= abstand(zb, puma.turm) ? za : zb;
  const soll = Math.atan2(ziel.y - puma.turm.y, ziel.x - puma.turm.x);
  assert.ok(diffWinkel(anfang, soll) > 0.5, 'Testaufbau: Ziel liegt nicht seitlich');
  assert.ok(await bis(() => nachrichten.bwschuss.some(m => m.art === 'kanone'), 6000), 'Puma schießt nicht');
  const m = nachrichten.bwschuss.find(q => q.art === 'kanone');
  assert.ok(diffWinkel(m.w, Math.atan2(m.y2 - m.y1, m.x2 - m.x1)) < 0.12, 'Rohr zeigt nicht zum Einschlag');
  assert.ok(diffWinkel(raum.state.bwTurm, anfang) > 0.5, 'Turm hat sich nicht gedreht');
  await warte(150);
  // einer ist tot, der andere hat den Flächenschaden (60) abbekommen
  const lebend = [a, b].filter(id => stehtDa(raum, id));
  assert.equal(lebend.length, 1, 'ein Zombie müsste tot sein, der andere noch stehen');
  assert.equal(raum.state.zombies.get(lebend[0]).hp, 40, 'Flächenschaden fehlt');
  await beenden(c);
});

// Zombies, die nach dem Aufbau der Welt schon herumstehen, entfernen (die Fahrtests brauchen einen leeren Raum)
const leeren = raum => { for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); } };
// Puma auf einen Bauplan-Punkt (u, v) setzen
function pumaSetzen(raum, u, v) {
  const sp = raum.welt.stuetzpunkt, p = raum.stuetzpunkt.puma, [x, y] = planOrt(sp, u, v);
  p.u = u; p.v = v; p.x = x; p.y = y; p.weg = []; p.scanU = 0;
  raum.state.bwX = x; raum.state.bwY = y;
}
// Fahrt beobachten: prüft laufend, dass die Mitte des Puma nie in einem Hindernis steht (Fahrfläche), und merkt Höchstwerte
function beobachten(raum) {
  const sp = raum.welt.stuetzpunkt, fl = fahrFlaeche(sp), b = { fehler: 0, minU: 99, maxU: -99, minV: 99, maxV: -99, drehMax: 0, w0: raum.state.bwW, rueck: 0 };
  const t = setInterval(() => {
    const k = planKoord(sp, raum.state.bwX, raum.state.bwY);
    if (!fl.ok(k.u, k.v)) b.fehler++;
    b.minU = Math.min(b.minU, k.u); b.maxU = Math.max(b.maxU, k.u); b.minV = Math.min(b.minV, k.v); b.maxV = Math.max(b.maxV, k.v);
    b.drehMax = Math.max(b.drehMax, diffWinkel(raum.state.bwW, b.w0));
    if (raum.stuetzpunkt.puma.rueckwaerts) b.rueck++;
  }, 50);
  b.ende = () => clearInterval(t);
  return b;
}

test('Puma fährt frei im Innenbereich: parkt in der Lagermitte, Fahrfläche frei von Hindernissen und von der Einfahrt', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Fahrer');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  imLagerSetzen(raum, p); leeren(raum);
  st.nester = []; st.schuetzen = [];
  const k0 = planKoord(sp, raum.state.bwX, raum.state.bwY);
  assert.ok(Math.abs(k0.u - PUMA_PARK[0]) < 0.05 && Math.abs(k0.v - PUMA_PARK[1]) < 0.05, 'Start im Ruheplatz');
  const fl = fahrFlaeche(sp);
  assert.ok(fl.ok(...PUMA_PARK), 'Ruheplatz auf der Fahrfläche');
  // Draht, Sandsäcke, MG-Nester, Zelte, Fahrzeuge und Einfahrt sind nicht befahrbar; die Fahrfläche ist groß und zusammenhängend
  for (const [u, v] of [[15.5, 1.5], [15.5, 3.5], [15.5, 5.0], [10.5, 4.0], [4.5, 4.3], [7, 11], [22, 10.5], [14, 19.4], [6, 19]]) assert.ok(!fl.ok(u, v), `befahrbar bei ${u}/${v}`);
  assert.ok(fl.frei.reduce((a, q) => a + q, 0) >= 100, 'Fahrfläche zu klein');
  st.puma.scanU = 0;
  const b = beobachten(raum);
  await warte(3000);
  b.ende();
  assert.equal(b.fehler, 0);
  assert.ok(Math.hypot(raum.state.bwX - sp.teile.find(t => t.art === 'puma').x, raum.state.bwY - sp.teile.find(t => t.art === 'puma').y) < 30, 'ohne Zombies bleibt er in der Lagermitte');
  await beenden(c);
});

test('Puma fährt zum Hotspot: stärkste Häufung, auch rechts und seitlich des Lagers, nie durch Hindernisse', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Hotspot');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  imLagerSetzen(raum, p); leeren(raum);
  st.nester = []; st.schuetzen = [];
  const b = beobachten(raum);
  // ein einzelner Zombie vor der Front links, dicht daneben die große Gruppe rechts außerhalb des Lagers
  zombieBei(raum, sp, 4, -6);
  for (const [u, v] of [[34, 10], [34.4, 10.3], [34.2, 9.6], [33.8, 10.5]]) zombieBei(raum, sp, u, v);
  assert.ok(await bis(() => planKoord(sp, raum.state.bwX, raum.state.bwY).u > 21, 30000), 'Puma fährt nicht nach rechts zur Gruppe');
  await warte(1500);
  assert.ok(st.puma.hot && st.puma.hot.u > 30, 'Hotspot ist die Gruppe rechts');
  // Gruppe weg, neue Häufung links vor der Front
  leeren(raum);
  for (const [u, v] of [[4, -5], [4.4, -5.3], [3.8, -4.6]]) zombieBei(raum, sp, u, v);
  assert.ok(await bis(() => planKoord(sp, raum.state.bwX, raum.state.bwY).u < 8, 30000), 'Puma fährt nicht nach links');
  const pk = planKoord(sp, raum.state.bwX, raum.state.bwY);
  assert.ok(pk.v >= 4.5, 'bleibt hinter dem Draht und den Sandsäcken: v = ' + pk.v);   // Wanne nur noch 58 × 30 px (früher 115 × 54): darf näher an die Front
  b.ende();
  assert.equal(b.fehler, 0, 'Puma stand in einem Hindernis');
  assert.ok(b.maxU > 20 && b.minU < 9, `u von ${b.minU} bis ${b.maxU}`);
  await beenden(c);
});

test('Puma fährt rückwärts statt zu wenden, wenn das Ziel hinter ihm liegt', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Rueck');
  const sp = raum.welt.stuetzpunkt, st = raum.stuetzpunkt;
  imLagerSetzen(raum, p); leeren(raum);
  st.nester = []; st.schuetzen = [];
  pumaSetzen(raum, 15.5, 7.0);   // Bug zur Front (−v); Hotspot weiter hinten im Lager (+v)
  const b = beobachten(raum);
  zombieBei(raum, sp, 15.5, 28); zombieBei(raum, sp, 15.9, 28.3);
  assert.ok(await bis(() => planKoord(sp, raum.state.bwX, raum.state.bwY).v > 11, 30000), 'Puma fährt nicht nach hinten');
  b.ende();
  assert.ok(b.rueck > 5, 'fährt nicht rückwärts');
  assert.ok(b.drehMax < 0.4, 'hat gewendet statt rückwärts zu fahren: ' + b.drehMax.toFixed(2) + ' rad');
  assert.equal(b.fehler, 0);
  await beenden(c);
});

test('Überrennen: nach N Spieltagen fällt der Stützpunkt – Zombies an den Posten, kein Feuer, kein Handel, gespeichert und geladen', async () => {
  await frisch();
  const { c, raum, p, nachrichten, spielerId } = await beitreten('Fall');
  const sp = raum.welt.stuetzpunkt;
  imLagerSetzen(raum, p);
  assert.equal(SpielRaum.einstellungen.bundeswehr.falltage, 3, 'Vorgabe: 3 Spieltage');
  raum.state.zeit = 2.5 * 48 * 60;
  await warte(300);
  assert.equal(raum.state.stuetzpunkt, 'steht', 'zu früh gefallen');
  const posten = sp.teile.filter(t => t.art === 'mgnest' || (t.art === 'posten' && ['soldat', 'arzt', 'verwundet'].includes(t.rolle))).length;
  assert.ok(posten >= 15, 'Posten: ' + posten);
  raum.state.zeit = 3 * 48 * 60 + 5;
  assert.ok(await bis(() => raum.state.stuetzpunkt === 'gefallen', 2000), 'Stützpunkt fällt nicht');
  assert.ok([...raum.zombieInfo.values()].filter(i => i.bleibt).length >= posten, 'an jedem Posten ein bleibender Zombie');
  assert.ok(raum.state.zombies.size >= posten);
  const alle = [...raum.state.zombies.values()];
  const postenOrte = sp.teile.filter(t => t.art === 'mgnest' || (t.art === 'posten' && ['soldat', 'arzt', 'verwundet'].includes(t.rolle)));
  assert.ok(postenOrte.every(t => alle.some(z => abstand(z, t) < 110)), 'ein Posten ohne Zombie in der Nähe');
  assert.ok(await bis(() => nachrichten.meldung.some(m => m.lang && /Der Bundeswehr-Stützpunkt ist gefallen!/.test(m.text)), 10000), 'keine lange Meldung');   // Nachricht kommt über das Netz: darauf warten, nicht sofort prüfen
  // MG und Puma schweigen
  nachrichten.bwschuss.length = 0;
  for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  const vor = zombieImFeuer(raum);
  await warte(2500);
  assert.ok(stehtDa(raum, vor), 'nach dem Fall wurde noch geschossen');
  assert.equal(nachrichten.bwschuss.length, 0);
  // kein Handel mehr
  const arzt = handelsleute(sp).find(h => h.wer === 'arzt');
  p.x = arzt.x + 18; p.y = arzt.y; p.rucksack.splice(0, p.rucksack.length, 'essen', 'essen');
  c.send('handel', { wer: 'arzt', angebot: 'verband' });
  assert.ok(await bis(() => nachrichten.handel.length === 1));
  assert.equal(nachrichten.handel[0].ok, false);
  assert.deepEqual([...p.rucksack], ['essen', 'essen']);
  // Kisten bleiben plünderbar
  const kiste = raum.welt.behaelter.find(b => b.art === 'bw_kiste');
  p.x = kiste.x + 14; p.y = kiste.y;
  assert.equal(raum.kontext(p)?.art, 'durchsuchen', 'Kiste nicht mehr plünderbar');
  // gespeichert …
  raum.speichereWelt();
  assert.equal(SpielRaum.speicher.ladeWelt().stuetzpunkt, 'gefallen');
  // … und beim nächsten Start wieder da (mit den Zombies an den Posten)
  await beenden(c);
  assert.equal(SpielRaum.speicher.ladeWelt().stuetzpunkt, 'gefallen');
  const c2 = await new Client(URL_).joinOrCreate('zombies', { name: 'Fall', spielerId, seed: 7 });
  const raum2 = matchMaker.getLocalRoomById(c2.roomId);
  assert.equal(raum2.state.stuetzpunkt, 'gefallen');
  assert.ok([...raum2.zombieInfo.values()].filter(i => i.bleibt).length >= posten, 'Zombies an den Posten fehlen nach dem Laden');
  await beenden(c2);
});

test('Schalter „Stützpunkt aktiv“: aus = Figuren weg, kein Feuer, kein Handel, kein Fall', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Aus');
  const sp = raum.welt.stuetzpunkt, e = SpielRaum.einstellungen, alt = e.bundeswehr;
  try {
    imLagerSetzen(raum, p);
    e.bundeswehr = { aktiv: false, falltage: 3 };
    raum.state.zeit = 4 * 48 * 60;
    await warte(300);
    assert.equal(raum.state.stuetzpunkt, 'aus');
    const vor = zombieImFeuer(raum);
    await warte(1800);
    assert.ok(stehtDa(raum, vor));
    assert.equal(nachrichten.bwschuss.length, 0);
    assert.equal(raum.state.zombies.size, 1, 'es sind keine Zombies an den Posten aufgetaucht');
    e.bundeswehr = alt;
    raum.state.zeit = 0;
    await warte(300);
    assert.equal(raum.state.stuetzpunkt, 'steht', 'wieder an');
  } finally { e.bundeswehr = alt; }
  await beenden(c);
});

test('Falltage: 0 = nie', async () => {
  await frisch();
  const { c, raum } = await beitreten('Nie');
  const e = SpielRaum.einstellungen, alt = e.bundeswehr;
  try {
    e.bundeswehr = { aktiv: true, falltage: 0 };
    raum.state.zeit = 50 * 48 * 60;
    await warte(400);
    assert.equal(raum.state.stuetzpunkt, 'steht');
  } finally { e.bundeswehr = alt; }
  await beenden(c);
});

test('Handgranate: Wurf auf den nächsten Zombie, Explosion nach 2 s, Schaden im Radius, halber Schaden für Spieler, Lärm', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Granate');
  einfrieren(raum);
  const ort = offenerPlatz(raum);
  p.x = ort.x; p.y = ort.y; p.richtung = 0;
  // ohne Granate passiert nichts
  c.send('wurf'); await warte(200);
  assert.equal(nachrichten.granate.length, 0);
  p.rucksack.push('granate', 'wasser');
  const z = (dx, dy) => { const id = raum.setzeZombie(ort.x + dx, ort.y + dy, ''); return id; };
  const a = z(90, 0), b = z(90, 25), cz = z(160, 0), lock = z(90, -520), fern = z(90, 720);
  const lockInfo = raum.zombieInfo.get(lock), fernInfo = raum.zombieInfo.get(fern);
  lockInfo.ziel = null; fernInfo.ziel = null;
  c.send('wurf');
  assert.ok(await bis(() => nachrichten.granate.length === 1), 'kein Wurf');
  const g = nachrichten.granate[0];
  assert.ok(Math.abs(g.x2 - (ort.x + 90)) < 1 && Math.abs(g.y2 - ort.y) < 1, 'Wurf geht nicht auf den nächsten Zombie');
  assert.equal(g.flug, GRANATE.flug); assert.equal(g.zeit, GRANATE.zuender);
  assert.ok(!p.rucksack.includes('granate') && p.rucksack.includes('wasser'), 'Granate verbraucht');
  // Zünder: nach 1 s noch nichts passiert
  await warte(1000);
  assert.equal(nachrichten.explosion.length, 0, 'zu früh explodiert');
  assert.ok(stehtDa(raum, a) && stehtDa(raum, b));
  // der Werfer läuft in die Nähe: halber Schaden
  p.x = g.x2 + 10; p.y = g.y2; p.hp = 100;
  assert.ok(await bis(() => nachrichten.explosion.length === 1, 2500), 'keine Explosion');
  assert.ok(Math.abs(nachrichten.explosion[0].x - g.x2) < 1 && nachrichten.explosion[0].r === GRANATE.radius);
  assert.ok(!stehtDa(raum, a) && !stehtDa(raum, b), 'Zombies im Radius überleben');
  assert.ok(stehtDa(raum, cz), 'Zombie außerhalb des Radius getroffen');
  assert.equal(raum.state.zombies.get(cz).hp, 100);
  assert.equal(p.hp, 100 - GRANATE.schadenSpieler, 'halber Schaden für Spieler');
  assert.equal(p.besiegt, 2, 'Abschüsse gutgeschrieben');
  // Lärm: Zombie in 600 px lockt, einer in 700+ px nicht
  assert.ok(lockInfo.punkt && Math.hypot(lockInfo.punkt.x - g.x2, lockInfo.punkt.y - g.y2) <= 40 * Math.SQRT2 + 1, 'Lärm lockt nicht');   // Lärmpunkt ist je Zombie um ±40 px gestreut
  assert.ok(!fernInfo.punkt, 'Lärm zu weit gehört');
  // ohne Ziel: Wurf in Blickrichtung (80 px)
  for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  p.x = ort.x; p.y = ort.y; p.richtung = 0; p.hp = 100;
  p.rucksack.push('granate');
  await warte(700);   // Wurfpause
  c.send('wurf');
  assert.ok(await bis(() => nachrichten.granate.length === 2));
  assert.ok(Math.abs(nachrichten.granate[1].x2 - (ort.x + GRANATE.blickWeite)) < 9, 'Blickrichtung: ' + (nachrichten.granate[1].x2 - ort.x));
  await beenden(c);
});

test('Maschinenpistole und Maschinengewehr: hohe Feuerrate, Reichweiten einstellbar, MG-Träger läuft 15 % langsamer', async () => {
  await frisch();
  const e = SpielRaum.einstellungen;
  assert.equal(WAFFEN.mp.reichweite, 240); assert.equal(WAFFEN.mg.reichweite, 360);
  assert.equal(e.reichweite.mp, 30); assert.equal(e.reichweite.mg, 45);
  assert.ok(WAFFEN.mp.schaden < WAFFEN.pistole.schaden && WAFFEN.mp.pause < WAFFEN.pistole.pause / 2 && WAFFEN.mg.pause < WAFFEN.mp.pause);
  assert.ok(DINGE.mp.waffe && DINGE.mg.waffe && DINGE.granate.wurf && !DINGE.granate.waffe);
  const { c, raum, p, nachrichten } = await beitreten('Feuer');
  const ort = offenerPlatz(raum);
  p.x = ort.x; p.y = ort.y;
  const schiesse = async (waffe, entfernung) => {
    for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    nachrichten.schuss.length = 0;
    raum.extra.get(c.sessionId).mag = [null, null, null]; p.magazin = 0;   // Magazin neu aus dem Vorrat füllen
    p.waffe = waffe; p.munition = 120; p.x = ort.x; p.y = ort.y; raum.extra.get(c.sessionId).pause = 0;
    einfrieren(raum);
    for (let i = 0; i < 10; i++) { const id = raum.setzeZombie(ort.x + entfernung, ort.y + (i - 5) * 6, ''); raum.zombieInfo.get(id).ziel = null; }
    await warte(1000);
    const n = nachrichten.schuss.length;
    assert.ok(Math.abs(120 - p.munition - p.magazin - n) <= 3, `Munition je Schuss: ${120 - p.munition - p.magazin} verbraucht, ${n} Schüsse gemeldet`);
    return n;
  };
  const mp = await schiesse('mp', 200), mg = await schiesse('mg', 250);
  assert.ok(mp >= 5, 'MP feuert zu langsam: ' + mp);
  assert.ok(mg >= 8 && mg > mp, 'MG: ' + mg + ' Schuss/s, MP: ' + mp);
  // Reichweite: 45 m (MG) ja, 31 m (MP) nein
  for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  nachrichten.schuss.length = 0;
  p.waffe = 'mp'; p.munition = 50; raum.extra.get(c.sessionId).pause = 0;
  raum.setzeZombie(ort.x + 31 * 8 + 4, ort.y, '');
  await warte(500);
  assert.equal(nachrichten.schuss.length, 0, 'MP schießt weiter als 30 m');
  // MG-Träger (Hand oder Rucksack) 15 % langsamer – Schritt für Schritt nachgerechnet
  for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  const x = raum.extra.get(c.sessionId);
  const lauf = (waffe, rucksack) => {
    p.waffe = waffe; p.rucksack.splice(0, p.rucksack.length, ...rucksack); p.x = ort.x; p.y = ort.y;
    x.eingabe = { dx: 1, dy: 0, s: false };
    for (let i = 0; i < 20; i++) raum.spielerSchritt(c.sessionId, p, x, 0.05);
    x.eingabe = { dx: 0, dy: 0, s: false };
    return p.x - ort.x;
  };
  const normal = lauf('', []), mitMg = lauf('mg', []), imRucksack = lauf('', ['mg']);
  assert.ok(normal > 100);
  assert.ok(Math.abs(mitMg / normal - TEMPO_MG) < 0.01 && Math.abs(imRucksack / normal - TEMPO_MG) < 0.01, `Tempo ${mitMg / normal}`);
  await beenden(c);
});

test('Bundeswehr-Beute: Granate/MP/MG nur in bw_kiste, bw_container und (MP/MG) Polizeiwache; Bots ordnen MP/MG über das Gewehr', () => {
  for (const [art, liste] of Object.entries(BEUTE)) {
    const neu = liste.filter(d => ['granate', 'mp', 'mg'].includes(d));
    if (art === 'bw_container') assert.ok(neu.length > 0, art);
    else if (art === 'bw_kiste') assert.equal(neu.length, 0, 'Munitionskiste: Zufallsbeute ersetzt durch Versorgung');
    else if (art === 'laden_polizei') assert.ok(neu.includes('mp') && neu.includes('mg'), 'Polizeiwache: MP und MG selten');
    else assert.equal(neu.length, 0, 'neue Bundeswehr-Waffen dürfen nicht in ' + art + ' liegen');
  }
  const zahl = (liste, d) => liste.filter(q => q === d).length;
  assert.ok(zahl(BEUTE.bw_container, 'granate') > zahl(BEUTE.bw_container, 'mg'), 'Granaten häufiger als MP/MG');
  assert.ok(BEUTE.bw_container.includes('munition'));
  assert.ok(!BEUTE.bw_kiste.includes('mg'), 'MG nur im Container');
  for (const d of ['granate', 'mp', 'mg']) assert.ok(![...LEICHE_SELTEN, ...LEICHE_OFT].includes(d), 'Leichen tragen ' + d);
  assert.ok(WAFFEN_RANG.indexOf('mp') > WAFFEN_RANG.indexOf('gewehr') && WAFFEN_RANG.indexOf('mg') > WAFFEN_RANG.indexOf('mp'));
  assert.equal(GRENZE.granate, 2);
  assert.ok(MUNITION_MAX >= 150);
});

test('Einstellungen: Bundeswehr (aktiv, Falltage) und Reichweiten von MP/MG werden bereinigt', () => {
  const v = bereinige({});
  assert.deepEqual(v.bundeswehr, { aktiv: true, falltage: 3, versorgungTage: 2, versorgungMunition: 50, versorgungVerband: 3, versorgungSpritze: 1, versorgungWaffe: true, pumaPause: 2.5, leopardReichweite: 29, leopardPause: 0.4, leopardSchaden: 100, leopardUeberrollen: true, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, boxerHordeSek: 120, boxerHordeMin: 20, boxerHordeMax: 50, boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60, mgMunition: 400, pumaMunition: 200 });
  assert.equal(v.reichweite.mp, 30); assert.equal(v.reichweite.mg, 45);
  const e = bereinige({ bundeswehr: { aktiv: 'ja', falltage: 99 }, reichweite: { mp: 500, mg: 1 } });
  assert.equal(e.bundeswehr.aktiv, true); assert.equal(e.bundeswehr.falltage, 99);
  assert.equal(e.reichweite.mp, 500); assert.equal(e.reichweite.mg, 1);
  assert.equal(bereinige({ bundeswehr: { aktiv: false, falltage: 0 } }).bundeswehr.aktiv, false);
  assert.equal(bereinige({ bundeswehr: { falltage: -4 } }, e).bundeswehr.falltage, 0);
  assert.deepEqual(SpielRaum.einstellungen.bundeswehr, { aktiv: true, falltage: 3, versorgungTage: 2, versorgungMunition: 50, versorgungVerband: 3, versorgungSpritze: 1, versorgungWaffe: true, pumaPause: 2.5, leopardReichweite: 29, leopardPause: 0.4, leopardSchaden: 100, leopardUeberrollen: true, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, boxerHordeSek: 120, boxerHordeMin: 20, boxerHordeMax: 50, boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60, mgMunition: 400, pumaMunition: 200 });
});

test('Handel: Preise, Bezahlung mit dem, was man am meisten hat', () => {
  assert.deepEqual(bezahlung(['essen', 'essen', 'wasser', 'bretter'], HANDEL.arzt.angebote[0].kostet), ['essen', 'essen']);
  assert.deepEqual(bezahlung(['wasser', 'schokoriegel', 'schokoriegel', 'schokoriegel'], HANDEL.arzt.angebote[0].kostet), ['schokoriegel', 'schokoriegel']);
  assert.equal(bezahlung(['wasser'], HANDEL.arzt.angebote[1].kostet), null);
  assert.equal(bezahlung(['essen', 'wasser'], HANDEL.soldat.angebote[0].kostet), null, 'Granate nur für 2 Konserven');
  assert.deepEqual(bezahlung(['essen', 'essen', 'wasser'], HANDEL.soldat.angebote[0].kostet), ['essen', 'essen']);
  assert.equal(bezahlung(['essen', 'wasser', 'verband'], HANDEL.soldat.angebote[1].kostet).length, 3);
  assert.equal(HANDEL.soldat.angebote[1].menge, 30);
});

test('Handel mit Arzt und Soldat: Bezahlung, Ablehnung ohne Mittel/ohne Nähe, Munitionsgrenze', async () => {
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Handel');
  const sp = raum.welt.stuetzpunkt, leute = handelsleute(sp);
  const arzt = leute.find(h => h.wer === 'arzt'), soldat = leute.find(h => h.wer === 'soldat');
  const sende = async (wer, angebot) => {
    const n = nachrichten.handel.length;
    c.send('handel', { wer, angebot });
    assert.ok(await bis(() => nachrichten.handel.length === n + 1), 'keine Antwort');
    return nachrichten.handel[n];
  };
  const rucksack = (...d) => p.rucksack.splice(0, p.rucksack.length, ...d);
  const hat = () => flach(p.rucksack).sort();   // einzelne Stücke (Stapel aufgelöst)
  // Arzt: 1 Verband für 2 beliebige Dinge
  p.x = arzt.x + 18; p.y = arzt.y;
  rucksack('essen', 'essen', 'wasser', 'bretter');
  let r = await sende('arzt', 'verband');
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(hat(), ['bretter', 'verband', 'wasser'], 'zwei Konserven bezahlt (davon hatte er am meisten)');
  rucksack('bretter', 'verband', 'wasser', 'schokoriegel');   // Bretter zahlen nicht mehr (höchstens 3 Gegenstandstypen)
  r = await sende('arzt', 'spritze');
  assert.equal(r.ok, true);
  assert.deepEqual(hat(), ['bretter', 'spritze', 'verband']);
  // ohne Mittel: abgelehnt, nichts passiert
  rucksack('wasser', 'verband');   // Verband bezahlt nicht beim Arzt
  r = await sende('arzt', 'verband');
  assert.equal(r.ok, false); assert.deepEqual(hat(), ['verband', 'wasser']);
  // Rucksack voll: nach Bezahlung muss das Neue hineinpassen
  rucksack(...Array(p.plaetze).fill('essen'));
  r = await sende('arzt', 'verband');
  assert.equal(r.ok, true, 'Platz wird durch die Bezahlung frei: ' + r.text);
  assert.equal(p.rucksack.length, p.plaetze - 1);
  // Soldat ist hier nicht in der Nähe (Arzt-Platz): abgelehnt
  rucksack('essen', 'essen', 'essen', 'essen');
  r = await sende('soldat', 'granate');
  assert.equal(r.ok, false, 'Arzt ist kein Soldat'); assert.equal(p.rucksack.length, 4);
  // Soldat im Lager: 1 Handgranate für 2 Konserven
  p.x = soldat.x + 18; p.y = soldat.y;
  r = await sende('soldat', 'granate');
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(hat(), ['essen', 'essen', 'granate']);
  r = await sende('soldat', 'granate');
  assert.equal(r.ok, true); assert.deepEqual(hat(), ['granate', 'granate']);
  r = await sende('soldat', 'granate');
  assert.equal(r.ok, false, 'ohne Konserven keine Granate'); assert.deepEqual(hat(), ['granate', 'granate']);
  // 30 Schuss für 3 beliebige Dinge; Obergrenze
  rucksack('wasser', 'bretter', 'verband', 'essen');
  p.munition = 10;
  r = await sende('soldat', 'munition');
  assert.equal(r.ok, true, r.text);
  assert.equal(p.munition, 40); assert.equal(p.rucksack.length, 1);
  rucksack('wasser', 'wasser', 'wasser');
  p.munition = 140;
  r = await sende('soldat', 'munition');
  assert.equal(p.munition, MUNITION_MAX, 'auf die Obergrenze gekappt'); assert.equal(r.ok, true);
  rucksack('wasser', 'wasser', 'wasser');
  r = await sende('soldat', 'munition');
  assert.equal(r.ok, false, 'Munition schon voll'); assert.equal(p.rucksack.length, 3);
  // eine Wache am Draht handelt nicht (nur Soldaten im Lager)
  const wache = sp.teile.find(t => t.art === 'posten' && t.rolle === 'soldat' && planKoord(sp, t.x, t.y).v < 8);
  p.x = wache.x; p.y = wache.y - 20;
  p.munition = 0;
  r = await sende('soldat', 'munition');
  assert.equal(r.ok, false, 'Wachen handeln nicht'); assert.equal(p.munition, 0);
  // unbekanntes Angebot / falscher Händler: ignoriert
  c.send('handel', { wer: 'bettler', angebot: 'x' }); c.send('handel', { wer: 'arzt', angebot: 'granate' });
  await warte(200);
  assert.equal(nachrichten.handel.length, 12);
  await beenden(c);
});

test('Ärzte heilen in der Nähe langsam (+2 Leben/s)', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Heilung');
  const sp = raum.welt.stuetzpunkt, arzt = handelsleute(sp).find(h => h.wer === 'arzt');
  ausserhalb(raum, p);
  p.hp = 50; p.hunger = 100; p.durst = 100;
  await warte(600);
  assert.equal(p.hp, 50, 'ohne Arzt keine Heilung');
  p.x = arzt.x + 30; p.y = arzt.y;
  const t0 = Date.now();
  assert.ok(await bis(() => p.hp >= 56, 5000), 'Arzt heilt nicht');
  const rate = (p.hp - 50) / ((Date.now() - t0) / 1000);
  assert.ok(rate > 1.2 && rate < 3, 'Heilrate ' + rate.toFixed(2) + ' Leben/s');
  p.x += 300;
  const hp = p.hp;
  await warte(500);
  assert.ok(p.hp - hp < 0.2, 'Heilung weit weg vom Arzt');
  await beenden(c);
});

test('Feldbetten im Sanitätszelt wirken wie im Safe Room (Ruhen)', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Bett');
  const sp = raum.welt.stuetzpunkt, bett = sp.teile.find(t => t.art === 'feldbett');
  ausserhalb(raum, p);
  p.hp = 50;
  await warte(2400);
  assert.equal(p.ruht, false, 'ruht ohne Bett');
  p.x = bett.x; p.y = bett.y;
  assert.ok(await bis(() => p.ruht, 4000), 'ruht nicht am Feldbett');
  const hp = p.hp;
  await warte(1100);
  assert.ok(p.hp - hp > 0.6, `Feldbett: +1 Leben/s (war ${hp}, jetzt ${p.hp})`);
  const x = raum.extra.get(c.sessionId);
  x.eingabe = { dx: 1, dy: 0, s: false };
  assert.ok(await bis(() => !p.ruht, 1000), 'Bewegung beendet das Ruhen nicht');
  await beenden(c);
});

test('Funkspruch am Funkpunkt des Funkzelts zählt wie am Funktisch; „Bretter“-Aufgabe gilt dann als erfüllt', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Funker');
  const sp = raum.welt.stuetzpunkt, zelt = sp.teile.find(t => t.art === 'funkzelt');
  assert.ok(Array.isArray(zelt.funkpunkt));
  raum.state.aufgaben.clear();
  for (const id of ['funk', 'bretter', 'tor', 'zombies']) raum.aufgaben.neu(id, false);
  raum.aufgaben.aktualisieren(false);
  p.x = zelt.funkpunkt[0]; p.y = zelt.funkpunkt[1];
  assert.equal(raum.kontext(p)?.art, 'funk');
  assert.equal(raum.state.aufgaben.get('bretter').erledigt, false);
  p.x += 120;
  assert.notEqual(raum.kontext(p)?.art, 'funk', 'zu weit weg vom Funkpunkt');
  p.x = zelt.funkpunkt[0];
  c.send('aktion');
  assert.ok(await bis(() => p.aktion === 'funk'), 'Aktion startet nicht');
  assert.equal(raum.state.funk, false);
  assert.ok(await bis(() => raum.state.funk === true, 7000), 'Funkspruch nicht abgesetzt');
  assert.equal(raum.state.aufgaben.get('funk').erledigt, true);
  assert.equal(raum.aufgaben.funkSafe, 'stuetzpunkt');
  assert.ok(await bis(() => raum.state.aufgaben.get('bretter').erledigt, 2000), 'Bretter-Aufgabe bleibt offen');
  assert.notEqual(raum.kontext(p)?.art, 'funk', 'Funkspruch lässt sich zweimal absetzen');
  assert.equal(raum.aufgaben.speichern().funkSafe, 'stuetzpunkt');
  await beenden(c);
});


test('Handel per Rätsel: 6 richtige in Folge zahlen, eine falsche setzt zurück; Handelswaren höchstens 3 Gegenstandstypen', async () => {
  for (const h of Object.values(HANDEL)) for (const a of h.angebote) assert.ok(a.kostet.aus.length <= 3, `${a.id}: mehr als 3 Gegenstandstypen`);
  await frisch();
  const { c, raum, p, nachrichten } = await beitreten('Raetsler');
  const arzt = handelsleute(raum.welt.stuetzpunkt).find(h => h.wer === 'arzt');
  p.x = arzt.x + 18; p.y = arzt.y;
  p.rucksack.splice(0, p.rucksack.length);
  const fragen = [], lösungen = [];
  c.onMessage('raetsel', m => fragen.push(m));
  c.onMessage('aufloesung', m => lösungen.push(m));
  const antworte = async (richtig, n) => {
    assert.ok(await bis(() => fragen.length === n), 'keine Frage');
    const o = raum.offeneRaetsel.get(c.sessionId);
    c.send('antwort', { id: o.id, index: richtig ? o.richtigIndex : (o.richtigIndex + 1) % 4 });
    assert.ok(await bis(() => lösungen.length === n), 'keine Auflösung');
    return lösungen[n - 1];
  };
  c.send('handel_raetsel', { wer: 'arzt', angebot: 'verband' });
  assert.equal((await antworte(true, 1)).handel.nr, 1);
  c.send('handel_raetsel', { wer: 'arzt', angebot: 'verband', weiter: true });
  let a = await antworte(false, 2);
  assert.equal(a.handel.nr, 0, 'falsch setzt zurück');
  c.send('handel_raetsel', { wer: 'arzt', angebot: 'verband', weiter: true });   // ohne laufende Serie fängt sie neu an
  a = await antworte(true, 3); assert.equal(a.handel.nr, 1);
  for (let i = 2; i <= 6; i++) {
    c.send('handel_raetsel', { wer: 'arzt', angebot: 'verband', weiter: true });
    a = await antworte(true, 2 + i);
  }
  assert.equal(a.handel.fertig, true);
  assert.deepEqual([...p.rucksack], ['verband']);
  assert.ok(nachrichten.handel.some(m => m.ok && /Rätsel/.test(m.text)));
  await beenden(c);
});

test('Handgranate: weiter werfen, größerer Radius, mehr Schaden als zuvor (120 px, 40 px, 150/50)', () => {
  assert.ok(GRANATE.wurfWeite >= 120 * 1.6 && GRANATE.blickWeite >= 80 * 1.6, 'Wurfweite');
  assert.ok(GRANATE.radius >= 40 * 1.5, 'Radius');
  assert.ok(GRANATE.schadenZombie > 150 && GRANATE.schadenSpieler > 50, 'Schaden');
});

test('Munitionsvorrat der MG-Nester und des Puma wird mit der Welt gespeichert und geladen', async () => {
  await frisch();
  const spielerId = neueId();
  const { c, raum } = await beitreten('Muni', spielerId);
  assert.ok(raum.stuetzpunkt.nester.length >= 2 && raum.stuetzpunkt.puma, 'Nester/Puma fehlen');
  raum.stuetzpunkt.nester[0].muni = 123; raum.stuetzpunkt.nester[1].muni = 0; raum.stuetzpunkt.puma.muni = 77;
  const nr = raum.stuetzpunkt.nester.map(n => n.n), pn = raum.stuetzpunkt.puma.n;
  raum.speichereWelt();
  const stand = SpielRaum.speicher.ladeWelt();
  assert.equal(stand.stuetzpunktMuni.mg[nr[0]], 123);
  assert.equal(stand.stuetzpunktMuni.puma, 77);
  await beenden(c);
  const c2 = await new Client(URL_).joinOrCreate('zombies', { name: 'Muni', spielerId, seed: 7 });
  const raum2 = matchMaker.getLocalRoomById(c2.roomId);
  try {
    const nest = n => raum2.stuetzpunkt.nester.find(x => x.n === n);
    assert.equal(nest(nr[0]).muni, 123);
    assert.equal(nest(nr[1]).muni, 0);
    assert.equal(raum2.stuetzpunkt.puma.muni, 77);
    assert.equal(raum2.stuetzpunkt.puma.n, pn);
  } finally { await beenden(c2); }
});
