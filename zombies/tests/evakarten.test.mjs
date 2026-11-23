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
import { heliStand, evakArtFuer, ABSTURZ, absturzDauer, absturzStrecke, A400M } from '../client/evak.mjs';
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

test('Königsdorf: während der Landerolle fallen je Echtspieler 2 Munitionskisten (50+30 Schuss, 2+1 Handgranaten) auf/neben die Piste, auf der Karte, im Spielstand, fest', mitArt('absturz', async ({ c, raum, p, s, ag }) => {
  const { KISTEN, KISTEN_JE_SPIELER, kistenPlan, kistenSpeichern } = await import('../server/a400m_kisten.mjs');
  const fall = []; c.onMessage('kistenFall', m => fall.push(m));
  const fundorte = []; c.onMessage('fundorte', m => fundorte.push(m.l));
  // reiner Plan: Inhalte fest, Zeiten innerhalb der Rollstrecke, Liegeplätze begehbar und nicht im Rumpf
  const ap = (await import('../server/flugplatz.mjs')).absturzPlan(raum.welt, s.seed);
  const plan = kistenPlan(s.seed, 3, ap, raum.welt, (x, y) => ag.platzNeben(x, y));
  assert.equal(plan.length, 3 * KISTEN_JE_SPIELER);
  assert.equal(plan.filter(e => e.ding === 'a400m_kiste_a').length, 3); assert.equal(plan.filter(e => e.ding === 'a400m_kiste_b').length, 3);
  assert.deepEqual(KISTEN, { a400m_kiste_a: { schuss: 50, granaten: 2 }, a400m_kiste_b: { schuss: 30, granaten: 1 } });
  const rd = absturzDauer() - ABSTURZ.anflug;
  for (const e of plan) { assert.ok(e.zeit > 0 && e.zeit < rd, 'Zeit außerhalb der Rollstrecke'); assert.ok(frei(raum.welt, e.x1, e.y1, 6), 'Kiste im Hindernis'); }
  assert.deepEqual(plan, kistenPlan(s.seed, 3, ap, raum.welt, (x, y) => ag.platzNeben(x, y)), 'Plan nicht deterministisch');
  // Ablauf im Spiel
  nurFunk(raum);
  ag.fahrtGelingt = () => false;
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  ag.crash.rest = absturzDauer() - ABSTURZ.anflug - 0.05;   // Anflug überspringen: Aufsetzen, Rollen beginnt
  assert.ok(await bis(() => fall.length >= 2, 9000), 'keine Kisten gefallen');
  assert.ok(await bis(() => s.evakPhase === 'wrack', 12000), 'kein Stillstand');   // Rollstrecke läuft in Echtzeit
  assert.ok(await bis(() => [...s.boden.values()].filter(b => KISTEN[b.ding]).length === 2, 3000), 'nicht genau 2 Kisten am Boden');
  assert.equal(fall.length, 2);
  const kisten = [...s.boden.entries()].filter(([, b]) => KISTEN[b.ding]);
  assert.deepEqual(kisten.map(([, b]) => b.ding).sort(), ['a400m_kiste_a', 'a400m_kiste_b']);
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
  ag.heli.rest = 0.1;
  assert.ok(await bis(() => s.evakPhase === 'heli', 3000), 'NH90 landet nicht');
  let gewechselt = false; ag.levelWechsel = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; { const q = heliStand(raum.welt, s.evakX, s.evakY); p.x = q.x; p.y = q.y; }
  assert.ok(await bis(() => s.evakPhase === 'abflug', 4000), 'kein Abflug');
  assert.ok(p.anBord, 'nicht an Bord');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
}));

test('Königsdorf: Der A400M setzt am Pistenanfang auf, rollt auf der Piste aus (eigener Bremsweg), erst im Stand brennt er; Spieler im Weg werden zur Seite gestoßen', mitArt('absturz', async ({ raum, p, s, ag, meldungen }) => {
  // Die Testwelt ist Isarauen (ohne Landebahn): eine eigene Piste setzen, Plan neu berechnen lassen
  raum.welt.landebahn = { x: 3000, y: 3000, w: 0.3, laenge: 5000, breite: 352 }; delete raum.welt._absturzplan;
  const lb = raum.welt.landebahn, c = Math.cos(lb.w), sn = Math.sin(lb.w);
  nurFunk(raum);
  ag.fahrtGelingt = () => false;
  ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
  s.uhr = 18 * 60 + 0.1;
  assert.ok(await bis(() => s.evakPhase === 'absturz'), 'kein Landeanflug');
  const plan = ag.crash.plan;
  const aufPiste = (x, y) => { const u = (x - lb.x) * c + (y - lb.y) * sn, v = -(x - lb.x) * sn + (y - lb.y) * c; return { u, v }; };
  // Plan: Aufsetzen nahe dem Pistenanfang, Stillstand weiter hinten, beides auf der Piste in Pistenrichtung
  const a0 = aufPiste(plan.aufsetz.x, plan.aufsetz.y), a1 = aufPiste(plan.x, plan.y);
  assert.ok(a0.u > 0 && a0.u < 400 && Math.abs(a0.v) < 2, 'Aufsetzpunkt nicht am Pistenanfang: ' + JSON.stringify(a0));
  assert.ok(a1.u > a0.u + 800 && a1.u < lb.laenge - A400M.laenge && Math.abs(a1.v) < 2, 'Stillstand nicht auf der Piste: ' + JSON.stringify(a1));
  assert.ok(Math.abs(plan.w - lb.w) < 1e-9, 'nicht in Pistenrichtung');
  assert.equal(Math.round(plan.x), s.evakAX); assert.equal(Math.round(plan.y), s.evakAY);
  // Bewegung: Anflug mit gleichbleibendem Tempo, am Aufsetzpunkt ABSTURZ.tempo, gleichmäßig gebremst, Stand genau am Plan
  const { anflug, rollweg, tempo } = ABSTURZ;
  assert.ok(Math.abs(absturzStrecke(anflug) - rollweg) < 1e-6, 'Aufsetzen nicht am Aufsetzpunkt');
  assert.ok(Math.abs(absturzStrecke(absturzDauer())) < 1e-6, 'kein Stillstand am Ende');
  assert.ok(Math.abs((absturzStrecke(anflug + 0.01) - absturzStrecke(anflug)) / -0.01 - tempo) < 2, 'Aufsetztempo');
  assert.ok(absturzStrecke(0) > rollweg + 2000, 'Anflug startet nicht weit genug draußen');
  for (let t = 0; t < absturzDauer(); t += 0.5) assert.ok(absturzStrecke(t + 0.5) <= absturzStrecke(t) + 1e-9, 'rückwärts bei t=' + t);
  // Ablauf im Raum: während Anflug und Rollen kein Brand, erst im Stand
  assert.ok(!meldungen.some(m => m.includes('Feuer')), 'Brand schon im Anflug');
  // Spieler mitten auf der Piste, Flugzeug rollt gerade darüber: wird quer zur Piste zur Seite gestoßen, ohne Schaden
  ag.crash.rest = absturzDauer() - anflug - 3;   // 3 s nach dem Aufsetzen
  const t = absturzDauer() - ag.crash.rest, d = absturzStrecke(t);
  const fx = plan.x - c * d, fy = plan.y - sn * d;
  p.ebene = ''; p.anBord = false; p.x = fx + 20 * c; p.y = fy + 20 * sn;
  const hp = p.hp; ag.absturzRollen(t);
  const q = aufPiste(p.x, p.y), f = aufPiste(fx, fy);
  assert.ok(Math.abs(q.v - f.v) > ABSTURZ.rumpfHalbBreite, 'Spieler nicht aus dem Rumpf gestoßen: ' + (q.v - f.v));
  assert.equal(p.hp, hp, 'Spieler verletzt');
  assert.ok(!meldungen.some(m => m.includes('Feuer')), 'Brand schon beim Rollen');
  ag.crash.rest = 0.05;
  assert.ok(await bis(() => s.evakPhase === 'wrack', 3000), 'kein Stillstand');
  assert.ok(meldungen.some(m => m.includes('gelandet') && m.includes('Feuer')), 'Brand erst im Stand');
  assert.equal(Math.round(s.evakAX), Math.round(plan.x), 'Wrack nicht an der Stillstandsposition');
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
