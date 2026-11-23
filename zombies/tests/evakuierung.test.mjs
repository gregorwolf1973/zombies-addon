// Evakuierungsarten: Leopard 2A7 (Isarauen) überrollt Zombies, schießt mit dem Lader-MG und überrollt nie Spieler;
// A400M mit Fehlschlag und Hubschrauber (server/aufgaben.mjs, server/flugplatz.mjs)
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
import { KACHEL, setzeKartengroesse, frei, findeWeg } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { LEOPARD, A400M, imFussabdruck, evakArtFuer } from '../client/evak.mjs';
import { flugplanBerechnen } from '../server/flugplatz.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-evak-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'isarauen' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: neueId() });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId) };
}
async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
const beenden = async (...clients) => { for (const c of clients) await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); };
const mitArt = (art, f) => async () => {
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, aufgaben: { ...alt.aufgaben, evakArt: art } };
  try { await f(); } finally { SpielRaum.einstellungen = alt; }
};
// Im Zeitraffer-Test bewegen sich Bewohner nicht mit; ein Mensch mitten auf der Fahrbahn würde das Fahrzeug (Bremsen vor Fußgängern) ewig aufhalten
const stehendeMenschenWeg = raum => { for (const m of raum.state.menschen?.values?.() ?? []) m.sichtbar = false; };
const busVon = raum => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');
function nurFunk(raum) { raum.state.aufgaben.clear(); raum.aufgaben.neu('funk', false); raum.aufgaben.aktualisieren(false); }

test('Einstellungen: Evakuierungsart und Leopard-MG werden bereinigt, Vorgabe aus', () => {
  assert.equal(vorgaben().aufgaben.evakArt, '');
  assert.equal(evakArtFuer('isarauen'), 'panzer');
  assert.equal(evakArtFuer('geretsried'), 'bus');
  const b = bereinige({ bundeswehr: { leopardReichweite: 1, leopardPause: 99, leopardSchaden: 9999, leopardUeberrollen: 'ja' } }).bundeswehr;
  assert.deepEqual([b.leopardReichweite, b.leopardPause, b.leopardSchaden, b.leopardUeberrollen], [1, 99, 9999, true]);
  assert.equal(bereinige({ bundeswehr: { leopardUeberrollen: false } }).bundeswehr.leopardUeberrollen, false);
  assert.equal(bereinige({ aufgaben: { evakArt: 'panzer' } }).aufgaben.evakArt, 'panzer');
});

test('Fußabdruck der Leopard-Wanne: vorn/hinten/seitlich', () => {
  const f = { x: 100, y: 100, richtung: Math.PI / 2 };   // fährt nach unten
  assert.ok(imFussabdruck(f, 100, 100 + LEOPARD.laenge / 2 - 2, LEOPARD.laenge / 2, LEOPARD.breite / 2));
  assert.ok(!imFussabdruck(f, 100, 100 + LEOPARD.laenge / 2 + 20, LEOPARD.laenge / 2, LEOPARD.breite / 2));
  assert.ok(imFussabdruck(f, 100 + LEOPARD.breite / 2 - 2, 100, LEOPARD.laenge / 2, LEOPARD.breite / 2));
  assert.ok(!imFussabdruck(f, 100 + LEOPARD.breite / 2 + 20, 100, LEOPARD.laenge / 2, LEOPARD.breite / 2));
});

test('Leopard überrollt Zombies im Fußabdruck beim Fahren, nicht im Stand und nicht daneben', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Fahrer');
  const { raum } = a;
  try {
    nurFunk(raum);
    raum.aufgaben.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Panzer');
    const [id, f] = busVon(raum);
    assert.equal(raum.state.evakArt, 'panzer');
    raum.aufgaben.evakTrefferChance = 0;   // keine MG-Treffer stören den Test
    const besiegt = raum.state.besiegt, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    const setze = (u, v) => { const zid = raum.setzeZombie(f.x + c * u - s * v, f.y + s * u + c * v, ''); raum.zombieInfo.get(zid).steht = true; return zid; };
    const leichen = () => raum.state.leichen?.size ?? raum.leichen?.size ?? 0;
    const vorher = leichen();
    const unter = setze(30, 0), nebenan = setze(0, 60), weit = setze(150, 0);
    // im Stand: nichts passiert
    f.haelt = true; raum.aufgaben.ueberrollKuehl = 0; raum.aufgaben.ueberrollen(f, 1);
    assert.ok(raum.state.zombies.has(unter), 'im Stand überrollt');
    // beim Fahren: nur der Zombie unter der Wanne
    f.haelt = false; raum.aufgaben.ueberrollKuehl = 0;
    const blut = []; a.c.onMessage('weg', m => blut.push(m));
    raum.aufgaben.ueberrollen(f, 1);
    assert.ok(!raum.state.zombies.has(unter), 'Zombie unter der Wanne lebt');
    assert.ok(raum.state.zombies.has(nebenan) && raum.state.zombies.has(weit), 'Zombie neben/vor der Wanne überrollt');
    assert.equal(raum.state.besiegt, besiegt, 'zählt für die Spieler');
    assert.ok(leichen() >= vorher, 'Leiche fehlt');
    assert.ok(await bis(() => blut.length > 0), 'kein Blut/Wegmeldung');
    // Einstellung aus: nichts wird überrollt
    const z2 = setze(0, 0);
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bundeswehr: { ...SpielRaum.einstellungen.bundeswehr, leopardUeberrollen: false } };
    raum.aufgaben.ueberrollKuehl = 0; raum.aufgaben.evakFeuer(0.01);
    assert.ok(raum.state.zombies.has(z2), 'überrollt trotz Einstellung aus');
  } finally { await beenden(a.c); }
}));

test('Leopard-MG: Reichweite und Schaden aus den Einstellungen, Schuss mit Turmwinkel aus dem Lader-MG', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Schuetze');
  const { raum } = a;
  try {
    nurFunk(raum);
    const schuesse = []; a.c.onMessage('bwschuss', m => schuesse.push(m));
    raum.aufgaben.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    raum.aufgaben.evakTrefferChance = 1;
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bundeswehr: { ...SpielRaum.einstellungen.bundeswehr, leopardReichweite: 10, leopardSchaden: 40, leopardPause: 0.1, leopardUeberrollen: false } };
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Panzer');
    const [, f] = busVon(raum);
    const ziel = (u) => { const zid = raum.setzeZombie(f.x + Math.cos(f.richtung) * u, f.y + Math.sin(f.richtung) * u, ''); raum.zombieInfo.get(zid).steht = true; raum.state.zombies.get(zid).hp = 100; return zid; };
    const fern = ziel(LEOPARD.turmX + 100);   // > 10 m
    await warte(500);
    assert.equal(schuesse.length, 0, 'schießt außerhalb der Reichweite');
    raum.state.zombies.delete(fern); raum.zombieInfo.delete(fern);
    const nah = ziel(LEOPARD.turmX + 50);     // ~6 m
    const z = raum.state.zombies.get(nah);
    assert.ok(await bis(() => z.hp < 100 || !raum.state.zombies.has(nah)), 'schießt nicht');
    assert.equal(z.hp, 60, 'Schaden nicht aus den Einstellungen (40)');
    const m = schuesse.find(q => q.evak === 'panzer');
    assert.ok(m && Number.isFinite(m.tw), 'Turmwinkel fehlt');
    assert.ok(Math.hypot(m.x1 - f.x, m.y1 - f.y) < 30);
  } finally { await beenden(a.c); }
}));

test('Spieler werden nie überrollt: die Wanne bremst vor ihnen und fährt erst danach weiter', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Fussgaenger');
  const { raum } = a;
  try {
    const v = raum.verkehr;
    const x0 = a.p.x, y0 = a.p.y;
    a.p.ebene = '';
    const id = v.neu('evakuierung', { x: x0, y: y0 }, { evakuierung: true, angekommen: false });
    const f = raum.state.fahrzeuge.get(id), inf = v.info.get(id);
    f.richtung = 0; inf.weg = [{ x: x0, y: y0 }, { x: x0 + 400, y: y0 }]; inf.pos = 0;
    a.p.x = x0 + 60; a.p.y = y0; const hp = a.p.hp;
    for (let i = 0; i < 20; i++) v.schritt(0.1);
    assert.ok(f.x - x0 < 5, 'fährt auf den Spieler zu: ' + (f.x - x0));
    assert.equal(a.p.hp, hp);
    raum.aufgaben.ueberrollKuehl = 0; raum.aufgaben.ueberrollen(f, 1);
    assert.equal(a.p.hp, hp, 'Spieler verletzt');
    a.p.x = x0 + 250;
    for (let i = 0; i < 20; i++) v.schritt(0.1);
    assert.ok(f.x - x0 > 50, 'fährt nach Freigabe nicht weiter');
    raum.state.fahrzeuge.delete(id); v.info.delete(id);
  } finally { await beenden(a.c); }
}));

// ---------- A400M ----------
const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/isarauen.json', import.meta.url)));
const karteG = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));

for (const [name, k] of [['isarauen', karte], ['geretsried', karteG]]) {
  test(`Flugplan ${name}: freier Landestreifen, Hubschrauberplatz in Entfernung und zu Fuß erreichbar, deterministisch`, () => {
    setzeKartengroesse(k.breite, k.hoehe);
    try {
      const w = baueWeltAusKarte(k, 7);
      const p = flugplanBerechnen(w, 7);
      assert.ok(p, 'kein Flugplan');
      const c = Math.cos(p.w), s = Math.sin(p.w);
      // die ganze Landerolle samt Rumpf liegt auf freiem Boden
      for (let d = -A400M.laenge / 2; d <= A400M.rollweg; d += 40) assert.ok(frei(w, p.start.x + c * d, p.start.y + s * d, 40), 'Streifen blockiert bei ' + d);
      assert.ok(Math.hypot(p.mitte.x - p.start.x, p.mitte.y - p.start.y) > 300);
      const dh = Math.hypot(p.heli.x - p.rampe.x, p.heli.y - p.rampe.y);
      assert.ok(dh >= 600 && dh <= 1600, 'Hubschrauberplatz-Abstand ' + dh);
      assert.ok(frei(w, p.heli.x, p.heli.y, 60), 'Hubschrauberplatz blockiert');
      assert.ok(findeWeg(w, p.rampe.x, p.rampe.y, p.heli.x, p.heli.y, 11, 80000, true), 'Hubschrauberplatz nicht erreichbar');
      delete w._flugplan;
      assert.deepEqual(flugplanBerechnen(w, 7), p, 'nicht deterministisch');
    } finally { setzeKartengroesse(64, 48); }
  });
}

test('A400M: landet, einsteigen, Triebwerk fällt aus, alle raus, zu Fuß zum Hubschrauber, Abholung → Levelwechsel', mitArt('flugzeug', async () => {
  await frisch();
  const a = await beitreten('Flieger');
  const { raum } = a;
  try {
    const s = raum.state, ag = raum.aufgaben; ag.alleBordSek = 0.3;
    assert.equal(s.evakArt, 'flugzeug');
    const plan = flugplanBerechnen(raum.welt, s.seed);
    assert.ok(plan, 'kein Flugplan in der Isarauen-Welt');
    assert.ok(s.evakX > 0 && Math.hypot(s.evakX - plan.rampe.x, s.evakY - plan.rampe.y) < 2, 'Abholpunkt (Heckrampe) nicht gesetzt');
    nurFunk(raum);
    const meldungen = []; a.c.onMessage('meldung', m => meldungen.push(m.text));
    let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; };
    ag.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    s.uhr = 18 * 60 + 0.1;
    // 1. Landung: Flugzeug rollt aus, Einsteigen erst nach dem Stand
    assert.ok(await bis(() => busVon(raum) && s.evakPhase === 'landung'), 'keine Landung');
    const [, f] = busVon(raum);
    assert.equal(s.busSteht, false);
    a.p.ebene = ''; a.p.x = s.evakX; a.p.y = s.evakY;
    await warte(300);
    assert.equal(s.busBord, 0, 'steigt schon während der Landerolle ein');
    a.p.x = 50; a.p.y = 50;   // wieder weg: sonst steigt er beim Stand sofort ein
    assert.ok(await bis(() => s.evakPhase === 'einsteigen', 8000), 'Landerolle endet nicht');
    assert.ok(Math.hypot(f.x - plan.mitte.x, f.y - plan.mitte.y) < 2, 'steht nicht am Endpunkt');
    assert.ok(Math.abs(f.richtung - plan.w) < 0.01);
    assert.ok(await bis(() => s.busSteht), 'steht nicht');
    // 2. Einsteigen: wer an der Heckrampe steht, ist an Bord; dann fällt ein Triebwerk aus
    a.p.x = s.evakX; a.p.y = s.evakY;
    assert.ok(await bis(() => a.p.anBord || s.evakPhase === 'heliAnflug', 2000), 'steigt an der Rampe nicht ein');
    assert.ok(await bis(() => s.evakPhase === 'heliAnflug', 4000), 'kein Fehlschlag: ' + s.evakPhase);
    assert.ok(await bis(() => meldungen.some(m => m.includes('Triebwerk'))), 'Meldung zum Fehlschlag fehlt');
    assert.ok(await bis(() => meldungen.some(m => m.includes('Hubschrauber'))), 'Hinweis auf den Hubschrauber fehlt');
    // 3. alle raus: Spieler steht neben der Heckrampe, das Flugzeug bleibt stehen, der Abholpunkt ist jetzt der Hubschrauberplatz
    assert.ok(Math.hypot(a.p.x - plan.rampe.x, a.p.y - plan.rampe.y) < 250, 'Spieler nicht ausgestiegen');
    assert.equal(a.p.anBord, false, 'beim Aussteigen noch an Bord');
    assert.ok(busVon(raum), 'Flugzeug verschwunden');
    assert.equal(s.busDa, false);
    assert.ok(Math.hypot(s.evakX - plan.heli.x, s.evakY - plan.heli.y) < 2, 'Abholpunkt nicht am Hubschrauberplatz');
    assert.ok(s.evakRest > 0 && s.evakRest <= 30);
    assert.equal(gewechselt, false);
    // 4. Hubschrauber landet, nicht eingestiegen: wartet, Abflug erst mit allen an Bord
    ag.heli.rest = 0.1;
    assert.ok(await bis(() => s.evakPhase === 'heli', 3000), 'Hubschrauber landet nicht');
    assert.equal(s.busSteht, true);
    await warte(300);
    assert.equal(gewechselt, false, 'Abflug ohne den Spieler');
    // 5. zu Fuß hin: Abholung, Meldung, Levelwechsel
    a.p.x = plan.heli.x + 20; a.p.y = plan.heli.y;
    assert.ok(await bis(() => s.evakPhase === 'abflug', 3000), 'kein Abflug');
    assert.equal(a.p.anBord, true, 'nicht im Hubschrauber');
    assert.ok(await bis(() => meldungen.some(m => m.includes('Geschafft')), 1000));
    ag.wechselVerzoegerung = 50;
  } finally { await beenden(a.c); }
}));

test('A400M: ohne alle an Bord startet er ohne euch wieder und der Hubschrauber kommt erst nach einem Fehlschlag', mitArt('flugzeug', async () => {
  await frisch();
  const a = await beitreten('Zuspaet');
  const { raum } = a;
  try {
    const s = raum.state, ag = raum.aufgaben;
    nurFunk(raum);
    ag.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    ag.einst = () => ({ an: true, stunde: 18, wartezeit: 60, wartenEchtMin: 1, anzahl: 4, evakArt: 'flugzeug' });
    s.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => s.evakPhase === 'einsteigen', 8000), 'keine Landung');
    a.p.ebene = ''; a.p.x = 50; a.p.y = 50;   // weit weg vom Flugzeug
    ag.busRest = 0.05;
    assert.ok(await bis(() => !s.busDa, 3000), 'Flugzeug bleibt');
    assert.equal(s.evakPhase, '', 'Phase nicht zurückgesetzt');
    assert.equal(busVon(raum), undefined, 'Flugzeug nicht abgeflogen');
    assert.equal(ag.heli, null, 'Hubschrauber ohne Fehlschlag');
  } finally { await beenden(a.c); }
}));

test('Leopard (Isarauen) fährt querfeldein zum Abholpunkt, wartet dort und fährt auf dem Feldweg wieder hinaus', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Querfeld');
  const { raum, p } = a;
  try {
    const s = raum.state, ag = raum.aufgaben, v = raum.verkehr;
    assert.equal(s.evakArt, 'panzer');
    nurFunk(raum);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    s.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum), 4000), 'kein Panzer');
    const [id, f] = busVon(raum), inf = v.info.get(id);
    assert.ok(inf.querfeld, 'kein Querfeldplan');
    const ziel = inf.querfeld.ziel;
    if (inf.querfeld.verschoben) assert.ok(Math.hypot(s.evakX - ziel.x, s.evakY - ziel.y) < 2, 'Abholpunkt nicht verschoben');
    const start = { x: f.x, y: f.y };
    // Fahrt im Zeitraffer (schritt direkt), bis er steht
    stehendeMenschenWeg(raum);
    for (let i = 0; i < 8000 && !inf.angekommen; i++) v.schritt(0.1);
    assert.ok(inf.angekommen, 'Panzer kommt nicht an');
    assert.ok(Math.hypot(f.x - ziel.x, f.y - ziel.y) < 20, 'steht nicht am Abholpunkt: ' + Math.hypot(f.x - ziel.x, f.y - ziel.y));
    assert.ok(Math.hypot(start.x - ziel.x, start.y - ziel.y) > 150, 'kam von nirgendwo');
    assert.ok(await bis(() => s.busSteht, 2000), 'Server hält ihn nicht für stehend');
    // Ausfahrt auf dem Feldweg zurück: verschwindet am Einfahrtspunkt
    v.evakuierungAb(id);
    for (let i = 0; i < 8000 && raum.state.fahrzeuge.has(id); i++) v.schritt(0.1);
    assert.equal(raum.state.fahrzeuge.has(id), false, 'Panzer fährt nicht wieder hinaus');
  } finally { await beenden(a.c); }
}));

test('Leopard (Isarauen): Anfahrt von weit weg über die Straße vom Kartenrand, dann querfeldein, und er steht zur angekündigten Zeit am Abholpunkt', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Anmarsch');
  const { raum, p } = a;
  try {
    const s = raum.state, ag = raum.aufgaben, v = raum.verkehr;
    const rate = 1440 / ((raum.einstellungen?.().tagMinuten || 48) * 60);   // Spielminuten je Sekunde
    const vorlauf = ag.panzerVorlauf();
    assert.ok(vorlauf > 20, 'Vorlauf zu kurz: ' + vorlauf);
    const meldungen = [];
    raum.broadcast = (typ, m) => { if (typ === 'meldung') meldungen.push(m.text); };
    nurFunk(raum);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    s.uhr = 18 * 60 - vorlauf + 1;   // knapp nach dem spätesten Abfahrtszeitpunkt am Kartenrand
    assert.ok(await bis(() => busVon(raum), 4000), 'Panzer rollt nicht rechtzeitig los');
    const [id, f] = busVon(raum), inf = v.info.get(id);
    const ziel = inf.querfeld.ziel;
    assert.ok(inf.feldWeg && inf.feldVon > 1, 'kein gemischter Weg (Straße + Feld)');
    assert.ok(!inf.angekommen);
    const start = { x: f.x, y: f.y }, abstand = Math.hypot(start.x - ziel.x, start.y - ziel.y);
    const rand = Math.min(start.x, start.y, 8960 - start.x, 6656 - start.y);
    assert.ok(abstand > 8000 || rand < 160, 'Start nicht weit weg: ' + abstand + ' / Rand ' + rand);
    assert.ok(meldungen.some(t => /Panzer im Anmarsch aus (Norden|Süden|Osten|Westen|Nord|Süd)/.test(t) && /m Luftlinie/.test(t)), 'kein Hinweis „Panzer im Anmarsch“: ' + meldungen.join(' | '));
    // im Zeitraffer fahren; die Spieluhr läuft mit (v.schritt allein bewegt sie nicht)
    stehendeMenschenWeg(raum);
    const t0 = s.uhr;
    let strasse = false, feld = false;
    for (let i = 0; i < 20000 && !inf.angekommen; i++) {
      v.schritt(0.1); s.uhr += 0.1 * rate;
      if (v.imFeld(inf)) feld = true; else strasse = true;
    }
    assert.ok(inf.angekommen, 'Panzer kommt nicht an');
    assert.ok(strasse && feld, 'Weg nicht gemischt');
    assert.ok(Math.hypot(f.x - ziel.x, f.y - ziel.y) < 20, 'steht nicht am Abholpunkt');
    assert.ok(s.uhr <= 18 * 60 + 3, 'zu spät: ' + (s.uhr - 18 * 60) + ' Spielminuten');
    assert.ok(s.uhr >= 18 * 60 - 0.35 * vorlauf, 'viel zu früh: ' + (18 * 60 - s.uhr) + ' Spielminuten (Vorlauf ' + vorlauf + ', Fahrt ' + (s.uhr - t0) + ')');
  } finally { await beenden(a.c); }
}));

test('Bus (Straße): liegt die nächste Straße weit vom Ortsausgang, wandert der Abholpunkt dorthin und der Bus hält dort', mitArt('bus', async () => {
  await frisch();
  const a = await beitreten('Strasse');
  const { raum, p } = a;
  try {
    const s = raum.state, ag = raum.aufgaben;
    assert.equal(s.evakArt, 'bus');
    assert.ok(await bis(() => (raum.verkehr?.graph?.knoten?.length ?? 0) > 0 && s.evakX > 0, 4000), 'Abholpunkt nicht auf die Straße verschoben');
    const bh = ag.busHalt();
    assert.ok(bh.punkt, 'Isarauen: Straße weit vom Ortsausgang erwartet');
    assert.ok(Math.hypot(s.evakX - bh.punkt.x, s.evakY - bh.punkt.y) < 2);
    nurFunk(raum);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    s.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum), 4000), 'kein Bus');
    const [bid, f] = busVon(raum), inf = raum.verkehr.info.get(bid);
    stehendeMenschenWeg(raum);
    for (let i = 0; i < 20000 && !inf.angekommen; i++) raum.verkehr.schritt(0.1);   // Fahrt im Zeitraffer
    assert.ok(inf.angekommen, 'Bus kommt nicht an');
    assert.ok(Math.hypot(f.x - s.evakX, f.y - s.evakY) < 40, 'Bus hält nicht am Abholpunkt');
  } finally { await beenden(a.c); }
}));

test('Leopard: einsteigen, warten, Aufgaben werden erfüllt, Abfahrt → bleibt an Bord und fährt mit, bis zum Levelwechsel', mitArt('panzer', async () => {
  await frisch();
  const a = await beitreten('Mitfahrer');
  const { raum, p } = a;
  try {
    const s = raum.state, ag = raum.aufgaben, v = raum.verkehr; ag.alleBordSek = 0.3;
    nurFunk(raum);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    ag.fahrtGelingt = () => false;   // noch nicht erfüllt
    s.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum), 4000), 'kein Panzer');
    const [id, f] = busVon(raum), inf = v.info.get(id);
    stehendeMenschenWeg(raum);
    for (let i = 0; i < 8000 && !inf.angekommen; i++) v.schritt(0.1);
    assert.ok(await bis(() => s.busSteht, 2000), 'steht nicht');
    p.ebene = ''; p.x = f.x; p.y = f.y;
    assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
    await warte(1500);   // wartet an Bord – er fährt nicht ohne Erfolg los, wirft niemanden raus
    assert.ok(p.anBord && s.busDa, 'nach dem Warten nicht mehr an Bord');
    // jetzt sind alle Aufgaben erfüllt: Abfahrt mit Erfolg
    let gewechselt = false; raum.weltNeuStarten = () => { gewechselt = true; }; ag.wechselVerzoegerung = 4000;   // echtes levelWechsel(), nur der Weltneustart ist ersetzt
    ag.fahrtGelingt = () => true;
    assert.ok(await bis(() => ag.wechselLaeuft, 4000), 'keine Abfahrt');
    assert.ok(p.anBord, 'beim Losfahren abgesetzt');
    const von = { x: f.x, y: f.y };
    for (let i = 0; i < 40; i++) { v.schritt(0.1); ag.mitnehmen(); }   // das Fahrzeug fährt den Feldweg hinaus
    assert.ok(Math.hypot(f.x - von.x, f.y - von.y) > 40, 'Panzer fährt nicht los');
    assert.ok(p.anBord && Math.hypot(p.x - f.x, p.y - f.y) < 1, 'Fahrgast bleibt zurück (läuft nicht mit dem Panzer)');
    assert.ok(await bis(() => gewechselt, 6000), 'kein Levelwechsel');
    assert.equal(p.anBord, false, 'nach dem Levelwechsel noch an Bord');
  } finally { await beenden(a.c); }
}));
