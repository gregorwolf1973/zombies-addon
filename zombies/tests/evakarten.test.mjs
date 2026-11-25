// Evakuierungsarten der Level 3–5: Absturz (Königsdorf) → NH90 nach den Missionen, Kochel (NH90 von Anfang an), Bunker (Finale)
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
import { heliStand, evakArtFuer, ABSTURZ, absturzDauer, absturzStrecke, A400M, absturzLage, absturzPose, absturzSeite, absturzAufpralle, ABSTURZ_HERDE } from '../client/evak.mjs';
import { frei } from '../client/welt.mjs';
import { zaehle } from '../client/stapel.mjs';
import { bereinige } from '../server/einstellungen.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-evakarten-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'isarauen' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

// Raum mit erzwungener Evakuierungsart (Isarauen-Welt hat das feine Raster); fn bekommt { c, raum, p, s, ag, meldungen }
const mitArt = (art, fn, extra = {}) => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, aufgaben: { ...alt.aufgaben, evakArt: art }, ...extra };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Flüchtling', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const meldungen = []; c.onMessage('meldung', m => meldungen.push(m.text));
    c.onMessage('bunkerEnde', () => {});
    const ag = raum.aufgaben, s = raum.state;
    ag.alleBordSek = 0.3;   // sonst 10 s Restwartezeit, wenn alle an Bord sind
    await fn({ c, raum, p: s.spieler.get(c.sessionId), s, ag, meldungen });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};
const nurFunk = (raum) => { raum.state.aufgaben.clear(); raum.aufgaben.neu('funk', false); raum.aufgaben.aktualisieren(false); };

test('Karte → Evakuierungsart und Einstellung für die neuen Arten', () => {
  assert.equal(evakArtFuer('koenigsdorf'), 'absturz');
  assert.equal(evakArtFuer('kochel'), 'heli');
  assert.equal(evakArtFuer('andermatt'), 'bunker');
  assert.equal(evakArtFuer('isarauen'), 'panzer');
  for (const a of ['absturz', 'heli', 'bunker']) assert.equal(bereinige({ aufgaben: { evakArt: a } }).aufgaben.evakArt, a);
});

test('Königsdorf: erst wenn das Wrack steht, fallen je Echtspieler 2 Munitionskisten (50+30 Schuss, 2+1 Handgranaten) hinten heraus – neben das Wrack, nicht ins Feuer; auf der Karte, im Spielstand, fest', mitArt('absturz', async ({ c, raum, p, s, ag }) => {
  const { KISTEN, KISTEN_JE_SPIELER, kistenPlan, kistenSpeichern, imWrackFeuer } = await import('../server/a400m_kisten.mjs');
  const fall = []; c.onMessage('kistenFall', m => fall.push(m));
  const fundorte = []; c.onMessage('fundorte', m => fundorte.push(m.l));
  // reiner Plan: Inhalte fest, Zeiten kurz nach dem Stillstand, Liegeplätze begehbar, nahe am Wrack und außerhalb aller Brandherde
  const ap = (await import('../server/flugplatz.mjs')).absturzPlan(raum.welt, s.seed);
  const plan = kistenPlan(s.seed, 3, ap, raum.welt, (x, y) => ag.platzNeben(x, y));
  assert.equal(plan.length, 3 * KISTEN_JE_SPIELER);
  assert.equal(plan.filter(e => e.ding === 'a400m_kiste_a').length, 3); assert.equal(plan.filter(e => e.ding === 'a400m_kiste_b').length, 3);
  assert.deepEqual(KISTEN, { a400m_kiste_a: { schuss: 50, granaten: 2 }, a400m_kiste_b: { schuss: 30, granaten: 1 } });
  for (const e of plan) {
    assert.ok(e.zeit > 0 && e.zeit < 4, 'Kiste fällt nicht kurz nach dem Stillstand');
    assert.ok(frei(raum.welt, e.x1, e.y1, 6), 'Kiste im Hindernis');
    assert.ok(!imWrackFeuer(ap.ende, e.x1, e.y1, 20), 'Kiste liegt im Feuer');
    assert.ok(Math.hypot(e.x1 - ap.ende.x, e.y1 - ap.ende.y) < 600, 'Kiste nicht neben dem Wrack');
  }
  assert.deepEqual(plan, kistenPlan(s.seed, 3, ap, raum.welt, (x, y) => ag.platzNeben(x, y)), 'Plan nicht deterministisch');
  // Ablauf im Spiel
  nurFunk(raum);
  ag.fahrtGelingt = () => false;
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  ag.crash.rest = absturzDauer() - ABSTURZ.anflug - 0.05;   // Anflug überspringen: Aufprall, Hüpfer, Schlittern laufen in Echtzeit
  assert.ok(await bis(() => s.evakPhase === 'wrack', 12000), 'kein Stillstand');
  assert.equal(fall.length, 0, 'Kisten fallen schon während der Bruchlandung');
  assert.ok(await bis(() => fall.length >= 2, 4000), 'keine Kisten gefallen');
  assert.ok(await bis(() => [...s.boden.values()].filter(b => KISTEN[b.ding]).length === 2, 3000), 'nicht genau 2 Kisten am Boden');
  assert.equal(fall.length, 2);
  const kisten = [...s.boden.entries()].filter(([, b]) => KISTEN[b.ding]);
  assert.deepEqual(kisten.map(([, b]) => b.ding).sort(), ['a400m_kiste_a', 'a400m_kiste_b']);
  for (const [, b] of kisten) assert.ok(!imWrackFeuer(ap.ende, b.x, b.y, 20), 'Kiste im Feuer');
  // Karte: gelbe Punkte
  assert.ok(await bis(() => fundorte.some(l => l.filter(e => KISTEN[e[2]]).length === 2), 3000), 'Kisten nicht in den Fundorten');
  // Spielstand merkt sie, die Welt lässt sie nicht verfallen
  assert.equal(kistenSpeichern(raum).length, 2);
  assert.equal(ag.speichern().kisten.gefallen, true);
  for (const [, b] of kisten) b.alter = 1e6;
  raum.bodenAltern(1);
  assert.equal([...s.boden.values()].filter(b => KISTEN[b.ding]).length, 2, 'Kisten verfallen wie weggeworfene Dinge');
  // Aufheben: fester Inhalt (50 + 30 Schuss, 3 Handgranaten), keine weitere Kiste
  const meldungenK = []; p.munition = 0; p.handgranaten = 0;
  for (const [id, b] of kisten) { p.ebene = ''; p.x = b.x; p.y = b.y; raum.nimmAuf({ send: (t, m) => meldungenK.push(m?.text) }, p, id, b); }
  assert.equal(p.munition, 80, 'Schuss: ' + p.munition);
  assert.ok(meldungenK.some(t => t?.includes('+50 Schuss')) && meldungenK.some(t => t?.includes('+30 Schuss')), 'Meldung fehlt');
  const granaten = (p.handgranaten ?? 0) + zaehle(p.rucksack, 'granate') + [...s.boden.values()].filter(b => b.ding === 'granate').length;
  assert.equal(granaten, 3, 'Handgranaten: ' + granaten);
  assert.equal([...s.boden.values()].filter(b => KISTEN[b.ding]).length, 0);
  assert.equal(kistenSpeichern(raum).length, 0);
}));

test('Königsdorf: A400M landet auf der Piste und fängt erst im Stand Feuer (Wrack bleibt), kein Schaden; NH90 landet erst, wenn die Fahrt gelingt; Einsteigen → Abflug', mitArt('absturz', async ({ raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'absturz');
  assert.ok(s.evakAX > 0, 'keine Absturzstelle');
  nurFunk(raum);
  ag.fahrtGelingt = () => false;   // Missionsteile (code-6f) noch offen
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  const hp = p.hp;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  assert.ok(s.evakRest > 0 && s.evakRest <= Math.ceil(absturzDauer()));
  ag.crash.rest = 0.05;   // Anflug abkürzen
  assert.ok(await bis(() => s.evakPhase === 'wrack', 3000), 'kein Stillstand');
  assert.ok(await bis(() => meldungen.some(m => m.includes('gelandet') && m.includes('Feuer'))), 'keine Brand-Meldung nach der Landung');
  assert.equal([...s.feuer.values()].filter(f => f.art === 'a400m').length, ABSTURZ_HERDE.length, 'im Stand kein Vollbrand');
  assert.equal(p.hp, hp, 'Spieler beim Absturz verletzt');
  assert.ok(s.evakAX > 0 && s.evakAY > 0, 'Wrack nicht mehr da');
  assert.equal(s.busDa, false);
  await warte(700);
  assert.equal(s.evakPhase, 'wrack', 'Hubschrauber kommt, obwohl die Fahrt nicht gelingt');
  // Missionsteile erledigt → NH90 im Anflug, landet, Einsteigen, Abflug (Levelwechsel angestoßen)
  ag.fahrtGelingt = () => true;
  assert.ok(await bis(() => s.evakPhase === 'heliAnflug', 3000), 'NH90 kommt nicht');
  assert.ok(Math.hypot(s.evakX - s.evakAX, s.evakY - s.evakAY) > 300, 'Landeplatz liegt im Wrack');
  assert.ok(s.evakAX > 0, 'Wrack verschwindet beim Anflug');
  assert.equal([...s.feuer.values()].filter(f => f.art === 'a400m').length, ABSTURZ_HERDE.length, 'Wrack brennt nicht weiter');
  ag.heli.rest = 0.1;
  assert.ok(await bis(() => s.evakPhase === 'heli', 3000), 'NH90 landet nicht');
  let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; { const q = heliStand(raum.welt, s.evakX, s.evakY); p.x = q.x; p.y = q.y; }
  assert.ok(await bis(() => s.evakPhase === 'abflug', 4000), 'kein Abflug');
  assert.ok(p.anBord, 'nicht an Bord');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
}));

test('Königsdorf: Bruchlandung – hartes Aufsetzen am Pistenanfang, 3 Hüpfer, Schlittern (quer, fest je Seed) bis zum Stand auf/neben der Piste', () => {
  const { anflug, rollweg, tempo, huepfer, quer, gier, pendel } = ABSTURZ, ende = absturzDauer(), prallen = absturzAufpralle();
  assert.ok(huepfer.length >= 2 && huepfer.length <= 3, '2–3 Hüpfer');
  assert.equal(prallen.length, huepfer.length + 1); assert.equal(prallen[0], anflug);
  // Strecke: Anflug mit gleichbleibendem Tempo, am Aufsetzpunkt ABSTURZ.tempo, gleichmäßig gebremst, Stand genau am Plan
  assert.ok(Math.abs(absturzStrecke(anflug) - rollweg) < 1e-6, 'Aufsetzen nicht am Aufsetzpunkt');
  assert.ok(Math.abs(absturzStrecke(ende)) < 1e-6, 'kein Stillstand am Ende');
  assert.ok(Math.abs((absturzStrecke(anflug + 0.01) - absturzStrecke(anflug)) / -0.01 - tempo) < 2, 'Aufsetztempo');
  assert.ok(absturzStrecke(0) > rollweg + 2000, 'Anflug startet nicht weit genug draußen');
  for (let t = 0; t < ende; t += 0.5) assert.ok(absturzStrecke(t + 0.5) <= absturzStrecke(t) + 1e-9, 'rückwärts bei t=' + t);
  for (const seite of [1, -1]) {
    // Ablauf: anflug → huepfen → schlittern → stand, jede Phase genau einmal und in dieser Reihenfolge
    const folge = [], boegen = [];
    let luft = false, qAlt = 0, herdeAlt = 0;
    for (let k = 0; k <= Math.round(ende * 100) + 50; k++) {
      const t = k / 100, l = absturzLage(t, seite);
      if (folge.at(-1) !== l.phase) folge.push(l.phase);
      if (t > anflug + 1e-9) { if (l.h > 1e-6 && !luft) boegen.push(t); luft = l.h > 1e-6; }
      assert.ok(l.h >= 0 && l.h <= 1, 'Höhe');
      assert.ok(Math.abs(l.q) >= qAlt - 1e-9 && Math.abs(l.q) <= quer + 1e-9, 'Querversatz springt zurück bei t=' + t);
      assert.ok(Math.abs(l.gier) <= gier + pendel + 1e-9 && Math.sign(l.gier || seite) === seite, 'Gieren falsch bei t=' + t);
      assert.ok(l.herde >= herdeAlt, 'Brandherde gehen aus'); herdeAlt = l.herde;
      if (t < anflug) assert.equal(l.herde, 0, 'brennt schon im Anflug');
      else assert.ok(l.herde >= 1, 'brennt nicht ab dem ersten Aufprall bei t=' + t);
      qAlt = Math.abs(l.q);
    }
    assert.deepEqual(folge, ['anflug', 'huepfen', 'schlittern', 'stand']);
    assert.equal(boegen.length, huepfer.length, 'Zahl der Hüpfer: ' + boegen.length);
    for (const t of prallen) assert.ok(absturzLage(t, seite).h < 1e-9, 'beim Aufprall nicht am Boden: ' + t);
    assert.ok(absturzLage((prallen[0] + prallen[1]) / 2, seite).h > 0.3, 'erster Hüpfer zu flach');
    const st = absturzLage(ende, seite);
    assert.equal(st.phase, 'stand'); assert.equal(st.h, 0); assert.ok(Math.abs(st.q - seite * quer) < 1e-9 && Math.abs(st.gier - seite * gier) < 1e-9, 'Endlage');
    // fest: gleiche Zeit → gleiche Lage (kein Zufall)
    for (const t of [3, anflug + 0.3, anflug + 2, anflug + 5, ende]) assert.deepEqual(absturzLage(t, seite), absturzLage(t, seite));
  }
  assert.equal(absturzSeite(12345), absturzSeite(12345)); assert.ok([1, -1].includes(absturzSeite(7)));
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => absturzSeite(i * 977))).size === 2, 'bricht immer zur selben Seite aus');
});

test('Königsdorf: Der A400M setzt am Pistenanfang auf, brennt ab dem ersten Aufprall (Feuer wandern mit), schlittert bis zum Stand auf/neben der Piste; Spieler im Weg werden zur Seite gestoßen, Zombies umgerissen', mitArt('absturz', async ({ raum, p, s, ag, meldungen }) => {
  // Die Testwelt ist Isarauen (ohne Landebahn): eine eigene Piste setzen, Plan neu berechnen lassen
  raum.welt.landebahn = { x: 3000, y: 3000, w: 0.3, laenge: 5000, breite: 352 }; delete raum.welt._absturzplan;
  const lb = raum.welt.landebahn, c = Math.cos(lb.w), sn = Math.sin(lb.w);
  nurFunk(raum);
  ag.fahrtGelingt = () => false;
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  const plan = ag.crash.plan, { anflug } = ABSTURZ;
  const aufPiste = (x, y) => { const u = (x - lb.x) * c + (y - lb.y) * sn, v = -(x - lb.x) * sn + (y - lb.y) * c; return { u, v }; };
  // Plan: Aufsetzen nahe dem Pistenanfang auf der Achse, Stillstand weiter hinten; das Wrack steht seitlich versetzt noch auf/neben der Piste
  const a0 = aufPiste(plan.aufsetz.x, plan.aufsetz.y), a1 = aufPiste(plan.x, plan.y), e = aufPiste(plan.ende.x, plan.ende.y);
  assert.ok(a0.u > 0 && a0.u < 400 && Math.abs(a0.v) < 2, 'Aufsetzpunkt nicht am Pistenanfang: ' + JSON.stringify(a0));
  assert.ok(a1.u > a0.u + 800 && a1.u < lb.laenge - A400M.laenge && Math.abs(a1.v) < 2, 'Stillstand nicht auf der Piste: ' + JSON.stringify(a1));
  assert.ok(Math.abs(e.v) > 20 && Math.abs(e.v) < lb.breite / 2 && Math.abs(e.u - a1.u) < 1, 'Wrack nicht seitlich auf/neben der Piste: ' + JSON.stringify(e));
  assert.equal(plan.seite, absturzSeite(s.seed));
  assert.ok(Math.abs(plan.w - lb.w) < 1e-9, 'nicht in Pistenrichtung');
  assert.ok(Math.abs(plan.ende.richtung - lb.w - plan.seite * ABSTURZ.gier) < 1e-9, 'Wrack nicht quer gestellt');
  assert.equal(Math.round(plan.x), s.evakAX); assert.equal(Math.round(plan.y), s.evakAY);
  const a400mFeuer = () => [...s.feuer.entries()].filter(([, f]) => f.art === 'a400m');
  // im Anflug brennt nichts
  assert.equal(a400mFeuer().length, 0, 'Feuer schon im Anflug');
  assert.ok(!meldungen.some(m => m.includes('brennt')), 'Brand schon im Anflug');
  // erster Aufprall: Triebwerk brennt sofort (echtes Feuer), Meldung
  ag.crash.rest = absturzDauer() - anflug - 0.02;
  assert.ok(await bis(() => a400mFeuer().length >= 1, 2000), 'kein Feuer nach dem ersten Aufprall');
  assert.ok(await bis(() => meldungen.some(m => m.includes('hart') && m.includes('brennt'))), 'keine Aufprall-Meldung');
  const [fid, f0] = a400mFeuer()[0], x0 = f0.x;
  assert.ok(await bis(() => s.feuer.get(fid)?.x !== x0, 2000), 'Feuer bleibt nicht an der Maschine');
  // Spieler mitten im Weg, Maschine schlittert gerade darüber (Bauch am Boden): wird quer zum Rumpf zur Seite gestoßen, ohne Schaden
  ag.crash.rest = absturzDauer() - anflug - 3;   // 3 s nach dem Aufsetzen: schlittert
  const t = absturzDauer() - ag.crash.rest, pose = absturzPose(plan, plan.c, plan.s, t, plan.seite);
  assert.equal(pose.phase, 'schlittern');
  const rc = Math.cos(pose.richtung), rs = Math.sin(pose.richtung);
  p.ebene = ''; p.anBord = false; p.x = pose.x + 20 * rc; p.y = pose.y + 20 * rs;
  const hp = p.hp; ag.absturzRollen(t);
  const quer = Math.abs(-(p.x - pose.x) * rs + (p.y - pose.y) * rc);
  assert.ok(quer > ABSTURZ.rumpfHalbBreite, 'Spieler nicht aus dem Rumpf gestoßen: ' + quer);
  assert.equal(p.hp, hp, 'Spieler durch den Stoß verletzt');
  // Zombie im Weg wird umgerissen
  raum.neuerZombie(0);
  const [zid, z] = [...s.zombies.entries()].at(-1);
  z.ebene = ''; z.x = pose.x - 30 * rc; z.y = pose.y - 30 * rs; z.hp = 100;
  ag.crash.zombieT = -1; ag.absturzRollen(t);
  assert.ok(!s.zombies.has(zid) || !(s.zombies.get(zid).hp > 0), 'Zombie im Weg überlebt');
  // Stand: Vollbrand, Wrack an der Endlage
  ag.crash.rest = 0.05;
  assert.ok(await bis(() => s.evakPhase === 'wrack', 3000), 'kein Stillstand');
  assert.ok(await bis(() => meldungen.some(m => m.includes('gelandet') && m.includes('Feuer')), 2000), 'keine Meldung im Stand');
  assert.equal(a400mFeuer().length, ABSTURZ_HERDE.length, 'kein Vollbrand');
  const mitte = s.feuer.get('fa400m_' + ABSTURZ_HERDE.findIndex(h => h.x === 0));
  assert.ok(mitte && Math.hypot(mitte.x - plan.ende.x, mitte.y - plan.ende.y) < 12, 'Rumpfbrand nicht am Wrack');
  assert.equal(Math.round(s.evakAX), Math.round(plan.x), 'Absturzstelle verschoben');
}));

test('Königsdorf (echte Karte): Aufsetzpunkt und Stillstand liegen auf der Piste, Wrack und Hubschrauberplatz weit auseinander', async () => {
  const { setzeKartengroesse, KACHEL } = await import('../client/welt.mjs');
  const { baueWeltAusKarte } = await import('../client/osmwelt.mjs');
  const { levelorteSetzen } = await import('../server/levelorte.mjs');
  const { absturzPlan } = await import('../server/flugplatz.mjs');
  const k = JSON.parse(fs.readFileSync(new URL('../client/karten/koenigsdorf.json', import.meta.url)));
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 7); levelorteSetzen(w, 'koenigsdorf');
    const lb = w.landebahn, plan = absturzPlan(w, 7), c = Math.cos(lb.w), sn = Math.sin(lb.w);
    const uv = pt => ({ u: (pt.x - lb.x) * c + (pt.y - lb.y) * sn, v: -(pt.x - lb.x) * sn + (pt.y - lb.y) * c });
    const a = uv(plan.aufsetz), z = uv(plan);
    assert.ok(a.u > 0 && Math.abs(a.v) < 1 && z.u > a.u + 1000 && z.u + A400M.laenge / 2 < lb.laenge && Math.abs(z.v) < 1, JSON.stringify({ a, z, laenge: lb.laenge }));
    assert.ok(Math.hypot(plan.x - plan.heli.x, plan.y - plan.heli.y) > 300, 'Hubschrauberplatz im Wrack');
    // die ganze Rumpffläche liegt auf freier Piste (kein Haus im Weg)
    const { frei } = await import('../client/welt.mjs');
    for (let d = 0; d <= 1200 + A400M.laenge; d += 40) assert.ok(frei(w, plan.aufsetz.x + c * (d - A400M.laenge / 2), plan.aufsetz.y + sn * (d - A400M.laenge / 2), 14), 'Hindernis auf der Piste bei ' + d);
  } finally { setzeKartengroesse(64, 48); }
});

test('Kochel: NH90 steht von Anfang an, Einsteigen jederzeit mit Aussteigen, Abflug nur wenn die Fahrt gelingt', mitArt('heli', async ({ c, raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'heli');
  assert.equal(s.evakPhase, 'heli', 'Hubschrauber steht nicht von Anfang an');
  assert.ok(s.busDa && s.busSteht && s.evakX > 0);
  ag.fahrtGelingt = () => false;
  p.ebene = ''; { const q = heliStand(raum.welt, s.evakX, s.evakY); p.x = q.x; p.y = q.y; }
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => meldungen.some(m => m.includes('es fehlt'))), 'Meldung „was fehlt“');
  ag.busRest = 0.05; await warte(600);
  assert.ok(p.anBord && s.busDa, 'fliegt ohne erfüllte Bedingungen ab');
  ag.einstiegT.clear(); c.send('aussteigen');
  assert.ok(await bis(() => !p.anBord), 'Aussteigen geht nicht');
  // Bedingungen erfüllt, wieder einsteigen → Abflug
  ag.fahrtGelingt = () => true;
  let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  const w = { x: s.evakX + 300, y: s.evakY }; p.x = w.x; p.y = w.y; await warte(400);
  assert.ok(await bis(() => { p.ebene = ''; const q = heliStand(raum.welt, s.evakX, s.evakY); p.x = q.x; p.y = q.y; return s.evakPhase === 'abflug'; }, 6000), 'kein Abflug');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
}));

test('Bunker: Einsteigen = hineingehen (anBord), kein Abflug; Countdown-Ende: drinnen gewinnt, draußen verliert', mitArt('bunker', async ({ c, raum, p, s, ag, meldungen }) => {
  assert.equal(s.evakArt, 'bunker');
  assert.equal(s.evakPhase, 'bunker');
  assert.ok(s.evakX > 0 && s.busDa);
  const betreten = [], verlassen = [];
  raum.bunker = { betreten: sid => betreten.push(sid), verlassen: sid => verlassen.push(sid) };
  ag.fahrtGelingt = () => true;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.ok(await bis(() => p.anBord), 'geht nicht hinein');
  assert.equal(betreten.length, 1, 'Haken betreten nicht gerufen');
  assert.ok(meldungen.some(m => m.includes('Bunker')) || await bis(() => meldungen.some(m => m.includes('Bunker'))));
  await warte(800);
  assert.ok(p.anBord && s.busDa, 'Bunker „fährt“ ab');
  assert.equal(ag.wechselLaeuft, false, 'Levelwechsel im Bunker');
  // ein Bot bleibt draußen
  const bots = [...s.spieler.entries()].filter(([sid]) => raum.extra.get(sid)?.bot);
  // Countdown-Ende: der Spieler ist drin → Sieg
  let r = ag.bunkerEnde();
  assert.equal(r.sieg, true);
  assert.equal(s.evakPhase, 'sieg');
  assert.ok(r.drinnen.includes(c.sessionId));
  // Aussteigen und draußen sein → Niederlage
  ag.einstiegT.clear(); c.send('aussteigen');
  assert.ok(await bis(() => !p.anBord));
  assert.equal(verlassen.length, 1);
  r = ag.bunkerEnde();
  assert.equal(r.sieg, false);
  assert.equal(s.evakPhase, 'niederlage');
  assert.ok(r.draussen.includes(c.sessionId));
}));

test('Bunker: alle im Bunker und Aufgaben erledigt → Countdown springt auf 10 s, Meldung, dann Sieg', mitArt('bunker', async ({ c, raum, p, s, ag, meldungen }) => {
  ag.alleBordSek = 10;
  assert.ok(raum.finale.aktiv(), 'kein Countdown');
  assert.ok(s.finaleRest > 60, 'Countdown zu kurz: ' + s.finaleRest);
  ag.fahrtGelingt = () => false;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  await warte(800);
  assert.ok(s.finaleRest > 60 && !p.anBord, 'Tor offen trotz fehlender Aufgaben');
  ag.fahrtGelingt = () => true;
  assert.ok(await bis(() => p.anBord), 'geht nicht hinein');
  assert.ok(await bis(() => s.finaleRest <= 10), 'Countdown springt nicht auf 10 s: ' + s.finaleRest);
  assert.ok(await bis(() => meldungen.some(m => m.includes('Alle im Bunker – Tor schließt in 10 s')), 10000), meldungen.join(' | '));   // Meldung kommt über das Netz
  raum.finale.rest = 0.05;
  assert.ok(await bis(() => s.evakPhase === 'sieg', 3000), 'kein Sieg: ' + s.evakPhase);
}));

test('Bunker (Vorgabe alleBordSek = 0): alle drin und Aufgaben erledigt → Tor schließt sofort, Sieg', mitArt('bunker', async ({ c, raum, p, s, ag, meldungen }) => {
  assert.equal(new ag.constructor(raum).alleBordSek, 0, 'Vorgabe nicht 0'); ag.alleBordSek = 0;
  assert.ok(s.finaleRest > 60);
  ag.fahrtGelingt = () => true;
  p.ebene = ''; p.x = s.evakX; p.y = s.evakY;
  assert.ok(await bis(() => s.evakPhase === 'sieg', 4000), 'kein sofortiger Sieg: ' + s.evakPhase + ' ' + s.finaleRest);
  assert.ok(await bis(() => meldungen.some(m => m.includes('Alle im Bunker – Tor schließt!')), 5000), meldungen.join(' | '));
}));

// ---------- Levelwechsel auf die neuen Karten: Evakuierungsart je Karte, nie Panzer/Bus ----------
const warteRaum = async () => { assert.ok(await bis(() => !SpielRaum.aktiv, 5000), 'alter Raum lebt noch'); };
async function levelWechselNach(ag, raum, ziel) {
  ag.levelWechsel(ziel);
  await bis(() => !SpielRaum.aktiv, 6000);
}
async function neuBeitreten() {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Springer', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum };
}

test('Levelwechsel nach Königsdorf (normal und per Testsprung), Kochel und Andermatt: Evakuierungsart stimmt, nie Panzer oder Bus', async () => {
  await warteRaum();
  SpielRaum.speicher.loescheWelt();
  let { c, raum } = await neuBeitreten();
  try {
    assert.equal(raum.state.karte, 'isarauen');
    assert.equal(raum.state.evakArt, 'panzer');
    // 1. normaler Levelwechsel: Isarauen → Königsdorf
    await levelWechselNach(raum.aufgaben, raum, null);
    ({ c, raum } = await neuBeitreten());
    assert.equal(raum.state.karte, 'koenigsdorf', 'falsche Karte');
    assert.equal(raum.state.evakArt, 'absturz', 'Königsdorf: Art ' + raum.state.evakArt);
    assert.ok(raum.state.evakAX > 0 && raum.state.evakX > 0, 'Absturzstelle/Heliplatz fehlen');
    // A400M-Ablauf statt Panzer: Funk, Ankunftszeit → Landeanflug (kein Fahrzeug)
    raum.state.aufgaben.clear(); raum.aufgaben.neu('funk', false); raum.aufgaben.aktualisieren(false);
    raum.aufgaben.funkAbsetzen(raum.state.spieler.get(c.sessionId), raum.welt.safeRooms[0]);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => raum.state.evakPhase === 'absturz', 4000), 'A400M kommt nicht');
    assert.equal([...raum.state.fahrzeuge.values()].some(f => f.art === 'evakuierung'), false, 'Evakuierungsfahrzeug statt Absturz');
    // 2. Testsprung (Menü „Level 3“) aus derselben Welt und aus einer anderen
    await levelWechselNach(raum.aufgaben, raum, { karte: 'kochel', level: 4 });
    ({ c, raum } = await neuBeitreten());
    assert.equal(raum.state.karte, 'kochel');
    assert.equal(raum.state.evakArt, 'heli');
    assert.equal(raum.state.evakPhase, 'heli', 'NH90 steht nicht');
    await levelWechselNach(raum.aufgaben, raum, { karte: 'koenigsdorf', level: 3 });
    ({ c, raum } = await neuBeitreten());
    assert.equal(raum.state.karte, 'koenigsdorf');
    assert.equal(raum.state.evakArt, 'absturz', 'Testsprung nach Königsdorf: Art ' + raum.state.evakArt);
    await levelWechselNach(raum.aufgaben, raum, { karte: 'andermatt', level: 5 });
    ({ c, raum } = await neuBeitreten());
    assert.equal(raum.state.evakArt, 'bunker');
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.kartenWechsel?.('isarauen'); SpielRaum.speicher.loescheWelt(); }
});

test('absturzPlan/heliPlan liefern immer einen Plan (auch ohne freie Fläche), Landebahn der Karte hat Vorrang', async () => {
  const { absturzPlan, heliPlan } = await import('../server/flugplatz.mjs');
  const leer = { seed: 5, start: { x: 500, y: 500 }, fein: null, kacheln: [], hole: () => 1 };   // alles blockiert: frei() findet nichts
  const blockiert = { ...leer, fein: new Uint8Array(1).fill(1) };
  const ap = absturzPlan({ ...blockiert }, 5);
  assert.ok(ap && Number.isFinite(ap.x) && ap.heli, 'kein Absturzplan ohne freie Fläche');
  assert.ok(heliPlan({ ...blockiert }, 5)?.heli, 'kein Heliplan ohne freie Fläche');
  const mitBahn = { ...blockiert, landebahn: { x: 5000, y: 5000, w: 0 }, heliplatz: { x: 4000, y: 4100 } };
  const p = absturzPlan(mitBahn, 5);
  assert.equal(p.w > -0.01 && p.w < 0.01, true, 'Anflug nicht entlang der Landebahn');
  assert.deepEqual(p.heli, { x: 4000, y: 4100 }, 'heliplatz der Karte nicht genutzt');
});

test('Erzwungene Evakuierungsart (Verwaltung) gilt nur für die aktuelle Karte: nach dem Levelwechsel nach Königsdorf kommt kein Leopard', async () => {
  await warteRaum();
  SpielRaum.speicher.loescheWelt();
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const r = await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aufgaben: { evakArt: 'panzer' } }) });
  assert.ok(r.ok, 'Verwaltung nicht erreichbar: ' + r.status);
  assert.equal(SpielRaum.einstellungen.aufgaben.evakArt, 'panzer');
  let { c, raum } = await neuBeitreten();
  try {
    await levelWechselNach(raum.aufgaben, raum, { karte: 'koenigsdorf', level: 3 });
    assert.equal(SpielRaum.einstellungen.aufgaben.evakArt, '', 'erzwungene Art blieb stehen');
    ({ c, raum } = await neuBeitreten());
    assert.equal(raum.state.evakArt, 'absturz', 'Königsdorf: Art ' + raum.state.evakArt);
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.kartenWechsel?.('isarauen'); SpielRaum.speicher.loescheWelt(); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; }
});

test('A400M-Brand (Darstellung): Teilchen-Pool bleibt in seiner Grenze, Rauch steigt auf und zieht mit dem Wind ab, Teilchen erlöschen', async () => {
  const { FxPool, RAUCH, WIND } = await import('../client/absturzfx.mjs');
  const pool = new FxPool(60);
  for (let i = 0; i < 400; i++) { pool.rauch(0, 0); pool.flamme(0, 0, 40); pool.funken(0, 0, 1, 0, 2); pool.staub(0, 0, 2); pool.glut(0, 0); }
  assert.equal(pool.aktiv(), 60, 'Pool wächst über die Grenze');
  const leer = new FxPool(10, () => 0.5);
  const q = leer.rauch(100, 100);
  for (let i = 0; i < 40; i++) leer.schritt(0.1);
  assert.equal(q.art, RAUCH);
  assert.ok(q.y < 100 - 150, 'Rauch steigt nicht hoch: ' + q.y);
  assert.ok(Math.sign(q.x - 100) === Math.sign(WIND.x), 'Rauch zieht nicht mit dem Wind');
  for (let i = 0; i < 200; i++) pool.schritt(0.1);
  assert.equal(pool.aktiv(), 0, 'Teilchen erlöschen nicht');
});
