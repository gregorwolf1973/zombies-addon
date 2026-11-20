// Missionsgegenstände quer über die Karte, Suchkreise, Schwierigkeit (server/mission.mjs, schwierigkeit.mjs, aufgaben.mjs)
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
import { KACHEL, DINGE, setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { missionsPlan, missionListe, kreisSchrumpfen, SUCH_MIN, FUNK_TEILE } from '../server/mission.mjs';
import { schwierigkeit, LEVEL_TABELLE } from '../server/schwierigkeit.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';

const karte = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));

test('Missionsorte: Level 1 hat 5 Gegenstände, weit auseinander, je Runde und Level andere Orte, deterministisch', () => {
  const k = karte('geretsried');
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 7);
    const breite = k.breite * KACHEL;
    assert.deepEqual(missionListe('geretsried').map(m => m.ding), ['m_funk', 'm_batterie', 'm_antenne', 'm_schluessel', 'm_diesel']);
    const orte = plan => plan.map(m => m.nr).join(',');
    const gesehen = new Set();
    for (const [seed, level] of [[7, 1], [7, 2], [8, 1], [9, 1]]) {
      const plan = missionsPlan(seed, level, 'geretsried', w);
      assert.equal(plan.length, 5, 'Gegenstände fehlen');
      assert.equal(new Set(plan.map(m => m.nr)).size, 5, 'zwei Gegenstände im selben Haus');
      assert.ok(plan.every(m => m.behaelter.startsWith(`h${m.nr}eg:`)), 'Behälter gehört nicht zum Haus');
      let min = Infinity;
      for (const a of plan) for (const b of plan) if (a !== b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
      assert.ok(min >= 0.38 * breite, `Orte zu nah beieinander: ${(min / breite).toFixed(2)} der Kartenbreite (Seed ${seed}, Level ${level})`);
      assert.equal(orte(plan), orte(missionsPlan(seed, level, 'geretsried', w)), 'nicht deterministisch');
      gesehen.add(orte(plan));
    }
    assert.equal(gesehen.size, 4, 'Orte wiederholen sich bei anderem Seed/Level');
    // Level 2 (Isarauen): eigene Liste
    assert.deepEqual(missionListe('isarauen').map(m => m.ding), ['m_funk', 'm_batterie', 'm_antenne', 'm_treibstoff', 'm_landefeuer']);
    assert.ok(Object.values(DINGE).filter(d => d.mission).length >= 7);
  } finally { setzeKartengroesse(64, 48); }
});

test('Suchkreis: enthält das Ziel, wird mit jedem Hinweis kleiner, nie unter das Minimum', () => {
  const k = karte('geretsried');
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 11);
    for (const m of missionsPlan(11, 1, 'geretsried', w)) {
      assert.ok(Math.hypot(m.kx - m.x, m.ky - m.y) < m.r, 'Ziel nicht im Kreis');
      assert.ok(Math.hypot(m.kx - m.x, m.ky - m.y) > 0, 'Kreismitte liegt genau auf dem Ziel');
      let r = m.r;
      assert.ok(r === 800, 'Radius nicht 100 m: ' + r);
      while (kreisSchrumpfen(m)) {
        assert.ok(m.r < r, 'Kreis schrumpft nicht');
        assert.ok(Math.hypot(m.kx - m.x, m.ky - m.y) <= m.r, 'Ziel nach Hinweis nicht mehr im Kreis');
        r = m.r;
      }
      assert.equal(m.r, SUCH_MIN);
    }
  } finally { setzeKartengroesse(64, 48); }
});

test('Schwierigkeit: steigt je Level und je Spieltag (gedeckelt), Regler multipliziert, Vorgabe und Bereinigung', () => {
  const s = (level, tage, regler) => schwierigkeit({ level, tage, regler });
  assert.equal(LEVEL_TABELLE.length, 5);
  assert.deepEqual([s(1, 0).dichte, s(1, 0).horde, s(1, 0).schnell, s(1, 0).beute, s(1, 0).nacht], [1, 1, 0, 1, 1]);
  for (let l = 1; l < 5; l++) {
    const a = s(l, 0), b = s(l + 1, 0);
    assert.ok(b.dichte > a.dichte && b.horde > a.horde && b.schnell > a.schnell && b.nacht > a.nacht, 'Level ' + (l + 1) + ' nicht schwerer');
    assert.ok(b.beute < a.beute && b.munition < a.munition && b.abstand < a.abstand, 'Beute/Abstand Level ' + (l + 1));
  }
  assert.deepEqual(s(9, 0), s(5, 0), 'über Level 5 wie Level 5');
  assert.deepEqual(s(0, 0), s(1, 0));
  assert.ok(s(2, 3).dichte > s(2, 2).dichte && s(2, 1).dichte > s(2, 0).dichte, 'je Tag +8 %');
  assert.equal(s(1, 1).bonus, 0.08);
  assert.equal(s(1, 100).bonus, 0.6, 'Deckel');
  assert.equal(s(1, 100).dichte, s(1, 50).dichte);
  assert.ok(s(1, 0, 'leicht').dichte < s(1, 0).dichte && s(1, 0, 'schwer').dichte > s(1, 0).dichte);
  assert.equal(s(1, 0, 'schwer').dichte, 1.3);
  assert.equal(s(1, 0, 'leicht').dichte, 0.75);
  assert.equal(vorgaben().schwierigkeit, 'normal');
  assert.equal(bereinige({ schwierigkeit: 'schwer' }).schwierigkeit, 'schwer');
  assert.equal(bereinige({ schwierigkeit: 'irre' }, { schwierigkeit: 'leicht' }).schwierigkeit, 'leicht');
});

// ---------- mit laufendem Raum ----------
const PORT = 27600 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-mission-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });
async function beitreten(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), client: { sessionId: c.sessionId, send() {} } };
}
async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
async function beenden(...clients) { for (const c of clients) await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
const busVon = raum => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');

test('Missionsgegenstände: liegen im Behälter, nicht wegwerfbar, Abgabe in der Kiste zählt für alle, Bus erst nach der Abgabe', async () => {
  await frisch();
  const a = await beitreten('Eins'), b = await beitreten('Zwei');
  const { raum } = a;
  try {
    const ag = raum.aufgaben;
    assert.ok(ag.mission.length >= 3, 'kein Missionsplan');
    assert.ok(raum.state.aufgaben.get('mission')?.pflicht, 'Missionsaufgabe fehlt oder keine Pflicht');
    assert.equal(raum.state.missionen.size, ag.mission.length);
    assert.equal(raum.state.missionOffen, ag.mission.length);
    const safe = raum.welt.safeRooms[0];
    const kiste = raum.state.safes.get(safe.id).kiste;
    const m0 = ag.mission[0];

    // der Gegenstand liegt im Behälter des Gebäudes und kommt beim Durchsuchen in den Rucksack
    raum.ueberrascht = new Set(ag.mission.map(m => m.behaelter));
    raum.durchsucht(null, a.p, { id: m0.behaelter, art: 'schrank' });
    assert.ok(a.p.rucksack.includes(m0.ding), 'Missionsgegenstand nicht im Behälter');

    // nicht wegwerfbar
    raum.wegwerfen(a.client, { platz: a.p.rucksack.indexOf(m0.ding) });
    assert.ok(a.p.rucksack.includes(m0.ding), 'Missionsgegenstand weggeworfen');
    assert.ok(![...raum.state.boden.values()].some(d => d.ding === m0.ding));

    // Abgabe durch Eins zählt für Zwei mit (gemeinsame Kiste), der Gegenstand verlässt den Rucksack
    a.p.ebene = safe.ebene; const w = raum.wv(safe.ebene); a.p.x = w.kiste.x; a.p.y = w.kiste.y;
    raum.kiste(a.client, { richtung: 'rein', platz: a.p.rucksack.indexOf(m0.ding) });
    assert.ok(kiste.includes(m0.ding));
    ag.aktualisieren(false);
    assert.equal(kiste.includes(m0.ding), false, 'abgegebener Gegenstand bleibt in der Kiste');
    assert.ok(ag.abgegeben.has(m0.ding));
    assert.equal(raum.state.missionen.get(m0.ding).abgegeben, true);
    assert.equal(raum.state.aufgaben.get('mission').fortschritt, 1);
    assert.equal(raum.state.missionOffen, ag.mission.length - 1);
    assert.ok(await bis(() => b.c.state.missionOffen === ag.mission.length - 1), 'Zwei sieht die Abgabe nicht');
    assert.equal(ag.missionsFunde(m0.behaelter).includes(m0.ding), false);

    // Funkspruch, aber Gegenstände fehlen: zur Ankunftszeit kommt kein Fahrzeug
    ag.funkAbsetzen(a.p, safe);
    raum.state.uhr = 18 * 60 + 0.1;
    await warte(700);
    assert.equal(busVon(raum), undefined, 'Bus kommt trotz fehlender Missionsgegenstände');
    assert.equal(raum.state.busDa, false);
    // alle anderen abgeben: der Bus kommt
    for (const m of ag.mission) if (!ag.abgegeben.has(m.ding)) kiste.push(m.ding);
    ag.aktualisieren(false);
    assert.equal(raum.state.missionOffen, 0);
    assert.ok(raum.state.aufgaben.get('mission').erledigt, 'Missionsaufgabe nicht erledigt');
    assert.ok(await bis(() => busVon(raum), 4000), 'Bus kommt nicht nach der Abgabe aller Gegenstände');
  } finally { await beenden(a.c, b.c); }
});

test('Hinweis: raum.missionHinweis halbiert den Suchkreis im Zustand, das Ziel bleibt drin; Schwierigkeit im Raum steigt', async () => {
  await frisch();
  const a = await beitreten('Hinweis');
  const { raum } = a;
  try {
    const ag = raum.aufgaben, m = ag.mission[1], q = raum.state.missionen.get(m.ding);
    const r0 = q.r;
    assert.ok(Math.hypot(q.x - m.x, q.y - m.y) <= q.r, 'Ziel nicht im Suchkreis');
    assert.equal(raum.missionHinweis(m.ding), m.ding);
    assert.ok(q.r <= Math.ceil(r0 / 2) && q.r >= r0 / 2 - 1, `Radius ${r0} -> ${q.r}`);
    assert.ok(Math.hypot(q.x - m.x, q.y - m.y) <= q.r + 1, 'Ziel nach Hinweis nicht mehr im Kreis');
    // zufälliger Gegenstand, wenn keiner genannt ist
    const vorher = [...raum.state.missionen.values()].reduce((s, x) => s + x.r, 0);
    assert.ok(raum.missionHinweis());
    assert.ok([...raum.state.missionen.values()].reduce((s, x) => s + x.r, 0) < vorher);
    // Speicherstand: Hinweise bleiben
    assert.equal(ag.speichern().mission.hinweise[m.ding], 1);

    // Schwierigkeit im Raum: Level, Spieltag, Regler
    const basis = raum.schwierigkeit();
    raum.state.level = 3; raum.state.tag = 4;
    const spaeter = raum.schwierigkeit();
    assert.ok(spaeter.dichte > basis.dichte && spaeter.horde > basis.horde && spaeter.beute < basis.beute);
    SpielRaum.einstellungen.schwierigkeit = 'schwer';
    assert.ok(raum.schwierigkeit().dichte > spaeter.dichte, 'Regler schwer wirkt nicht');
    delete SpielRaum.einstellungen.schwierigkeit;
    raum.state.level = 1; raum.state.tag = 1;
    assert.equal(raum.schwierigkeit().dichte, 1);
    // mehr Zombie-Soll bei höherer Schwierigkeit
    const soll1 = raum.zombieSollJetzt();
    raum.state.level = 5; raum.state.tag = 6;
    raum.zombieFaktor = 1;
    assert.ok(raum.zombieSollJetzt() > soll1 || soll1 === 0);
  } finally { await beenden(a.c); }
});
