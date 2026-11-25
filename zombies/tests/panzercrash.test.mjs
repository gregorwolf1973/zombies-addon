// Panzer rammt Auto (server/panzercrash.mjs) im echten Raum (Karte geretsried): Ein gefahrener Puma fährt in ein Verkehrsauto → Ruck,
// das Auto rutscht seitlich weg, dreht sich und brennt als Wrack (Rauch, Feuer, Lärm, keine Explosion), ein Mensch flieht (unfallTuer);
// fährt der Panzer danach über das Wrack, ist es platt (art 'platt', kein Hindernis) und das Feuer ist aus.
// Ein Spielerauto (server/pkw.mjs) wird ebenso zum Wrack, die Insassen steigen unverletzt aus.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse, frei } from '../client/welt.mjs';
import { KLASSEN, fahrbarFrei } from '../server/fahrbar.mjs';
import { FahrbarPkw } from '../server/pkw.mjs';
import { fzMasse } from '../client/fzkollision.mjs';
import { beruehrt } from '../server/panzercrash.mjs';
import { freierPort } from './hilfe.mjs';

let server;
const PORT = await freierPort();
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bed, ms = 6000) { const e = Date.now() + ms; while (Date.now() < e) { if (bed()) return true; await warte(20); } return bed(); }

async function beitreten(name) {
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 0, unfallTuer: 100, unfallMinuten: 0, feuerMinuten: 0, blaulicht: 'aus' };
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  await warte(1500);   // Raum eingeschwungen (erster Raum: Weltaufbau, lange Takte)
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.state.phase = 'spiel';
  for (const id of [...raum.state.fahrzeuge.keys()]) { raum.state.fahrzeuge.delete(id); raum.verkehr.info.delete(id); }
  const nachrichten = [];
  c.onMessage('*', (typ, m) => nachrichten.push([typ, m]));
  const laerm = [], l0 = raum.laerm.bind(raum);
  raum.laerm = (x, y, r, ...rest) => { laerm.push({ x, y, r }); return l0(x, y, r, ...rest); };
  return { c, raum, nachrichten, laerm, sid: c.sessionId, ende: async () => { try { await c.leave(); } catch { /* weg */ } await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; } };
}

// gerades Straßenstück: Puma-Start (x, y, w) und Autoplatz `vor` px voraus, Weg dazwischen und dahinter frei für den Puma
function strecke(raum, vor) {
  const w = raum.welt;
  for (const n of raum.verkehr.graph.knoten) for (const e of n.nach) {
    if (e.laenge < vor + 160) continue;
    const ux = (e.ziel.x - n.x) / e.laenge, uy = (e.ziel.y - n.y) / e.laenge, rw = Math.atan2(uy, ux);
    const x = n.x + ux * 40, y = n.y + uy * 40;
    let ok = true;
    for (let d = 0; d <= vor + 100 && ok; d += 8) if (!fahrbarFrei(w, 'puma', x + ux * d, y + uy * d, rw)) ok = false;
    if (ok && frei(w, x + ux * vor, y + uy * vor, 14)) return { x, y, w: rw, ax: x + ux * vor, ay: y + uy * vor };
  }
  return null;
}

function puma(raum, sid, x, y, w) {
  const b = new KLASSEN.puma(raum, { id: 'fz_puma_test', besitzer: sid });
  b.aufstellen(x, y, w);
  b.schiessen = () => {};
  raum.fahrbare.liste.push(b);
  return b;
}
function einsteigen(raum, b, sid) {
  const p = raum.state.spieler.get(sid);
  b.insassen = [sid]; p.anBord = true; p.imBoxer = true; p.x = b.f.x; p.y = b.f.y; p.ebene = '';
  const x = raum.extra.get(sid); x.warte = []; return { p, x };
}
const feuerVon = (raum, id) => [...raum.brand.info].find(([, i]) => i.fz === id)?.[0] ?? null;

test('Puma rammt Verkehrsauto: Ruck, Auto rutscht weg und dreht sich, brennt (keine Explosion), Mensch flieht; Überfahren → platt, Feuer aus', async () => {
  const { raum, nachrichten, laerm, sid, ende } = await beitreten('Panzerfahrerin');
  try {
    const s = raum.state, v = raum.verkehr;
    const st = strecke(raum, 110);
    assert.ok(st, 'keine gerade Straße gefunden');
    const b = puma(raum, sid, st.x, st.y, st.w);
    const { x } = einsteigen(raum, b, sid);
    // Verkehrsauto wartet auf der Straße voraus (quer leicht versetzt)
    const id = v.neu('auto', { x: st.ax, y: st.ay }), f = s.fahrzeuge.get(id);
    f.richtung = st.w + 0.3; v.info.get(id).halt = 1000; f.haelt = true;
    const a0 = { x: f.x, y: f.y, w: f.richtung }, m0 = new Set(s.menschen.keys());
    let vVor = 0, vNach = null;
    x.eingabe = { dx: Math.cos(st.w), dy: Math.sin(st.w) };
    // Tempo kurz vor/nach dem Aufprall mitschreiben (Ruck)
    const p0 = raum.fahrbare.crash.crash.bind(raum.fahrbare.crash);
    raum.fahrbare.crash.crash = (bb, ...r) => { vVor = bb.v; p0(bb, ...r); vNach = bb.v; };
    assert.ok(await bis(() => f.art === 'wrack', 8000), 'kein Zusammenstoß');
    assert.ok(vVor > 40, 'Puma war zu langsam: ' + vVor);
    assert.ok(vNach < vVor * 0.6 && vNach > 0, `kein Ruck: ${vVor} → ${vNach}`);
    assert.ok(b.f && b.f.art === 'puma', 'Puma beschädigt/weg');
    assert.ok(!v.info.has(id), 'Wrack fährt weiter');
    assert.ok(f.rauch, 'kein Rauch');
    assert.ok(nachrichten.some(([t, m]) => t === 'krach' && m.ruck) || await bis(() => nachrichten.some(([t, m]) => t === 'krach' && m.ruck), 1000), 'kein Krach mit Ruck');
    assert.ok(laerm.some(l => l.r >= 600 && Math.hypot(l.x - f.x, l.y - f.y) < 60), 'kein Lärm');
    // rutscht weg und dreht sich, dann brennt es; ein Mensch flieht aus dem Wrack
    x.eingabe = { dx: 0, dy: 0 };
    assert.ok(await bis(() => feuerVon(raum, id) && s.feuer.has(feuerVon(raum, id)), 5000), 'Wrack brennt nicht');
    assert.ok(Math.hypot(f.x - a0.x, f.y - a0.y) >= 6, 'Wrack nicht weggeschleudert');
    assert.ok(Math.abs(f.richtung - a0.w) >= 0.3, 'Wrack nicht gedreht');
    const mensch = [...s.menschen].find(([mid]) => !m0.has(mid) && raum.stadt.info.get(mid)?.unfall);
    assert.ok(mensch, 'kein Mensch aus dem Wrack');
    assert.ok(mensch[1].flieht && Math.hypot(mensch[1].x - f.x, mensch[1].y - f.y) < 60, 'Mensch flieht nicht vom Wrack');
    assert.ok(await bis(() => nachrichten.some(([t]) => t === 'autotuer'), 1000), 'Tür-Animation fehlt');
    assert.ok(!nachrichten.some(([t]) => t === 'explosion'), 'Explosion');
    assert.ok(!raum.verkehr.unfaelle.liste.has(id), 'im Unfallablauf (Explosion möglich)');
    // Panzer fährt drüber: hinter das Wrack stellen (freie Anfahrt), Kurs auf das Wrack
    let pose = null;
    for (let k = 0; k < 16 && !pose; k++) {
      const w = k * Math.PI / 8, ux = Math.cos(w), uy = Math.sin(w), d0 = 75;
      let ok = true;
      for (let d = d0; d >= -30 && ok; d -= 6) if (!fahrbarFrei(raum.welt, 'puma', f.x - ux * d, f.y - uy * d, w)) ok = false;
      if (ok) pose = { x: f.x - ux * d0, y: f.y - uy * d0, w };
    }
    assert.ok(pose, 'keine Anfahrt zum Wrack');
    b.v = 0; b.f.x = pose.x; b.f.y = pose.y; b.f.richtung = pose.w;
    assert.ok(!beruehrt(b, f));
    const fid = feuerVon(raum, id);
    x.eingabe = { dx: Math.cos(pose.w), dy: Math.sin(pose.w) };
    assert.ok(await bis(() => f.art === 'platt', 8000), 'Wrack nicht plattgewalzt');
    x.eingabe = { dx: 0, dy: 0 };
    assert.ok(!s.feuer.has(fid) && !feuerVon(raum, id), 'Feuer brennt noch');
    assert.equal(f.rauch, false, 'raucht noch');
    assert.equal(fzMasse('platt'), null, 'plattes Wrack ist Hindernis');
    assert.ok(await bis(() => nachrichten.some(([t]) => t === 'b11platt'), 1000), 'kein Staub');
    assert.ok(s.fahrzeuge.get(id) === f, 'Wrack verschwunden');
  } finally { await ende(); }
});

test('Puma rammt Spielerauto: Auto wird brennendes Wrack, Insassen steigen unverletzt aus; langsames Anschieben ist kein Crash', async () => {
  const { raum, sid, ende } = await beitreten('Autofahrer');
  try {
    const s = raum.state;
    const st = strecke(raum, 70);
    assert.ok(st, 'keine gerade Straße gefunden');
    const b = puma(raum, sid, st.x, st.y, st.w);
    const pkw = new FahrbarPkw(raum, 'b_test');
    pkw.aufstellen(st.ax, st.ay, st.w + Math.PI / 2);
    raum.fahrbare.liste.push(pkw);
    const p = s.spieler.get(sid);
    pkw.insassen = [sid]; p.anBord = true; p.imBoxer = true; p.x = st.ax; p.y = st.ay; p.hp = 100;
    raum.extra.get(sid).warte = []; raum.extra.get(sid).eingabe = { dx: 0, dy: 0 };
    const o = pkw.f, pid = pkw.id;
    // fahrerloser Puma rollt mit Schwung auf das Auto zu
    b.v = 120;
    for (let i = 0; i < 6 && o.art === 'pkw'; i++) { b.v = Math.max(b.v, 100); await warte(50); }
    assert.ok(await bis(() => o.art === 'wrack', 3000), 'kein Zusammenstoß');
    assert.ok(!raum.fahrbare.liste.includes(pkw), 'Auto noch fahrbar');
    assert.ok(await bis(() => !p.anBord && !p.imBoxer, 3000), 'Insassen nicht ausgestiegen');
    assert.equal(p.hp, 100, 'Insasse verletzt');
    assert.ok(Math.hypot(p.x - o.x, p.y - o.y) < 60, 'Insasse nicht neben dem Wrack');
    assert.ok(s.fahrzeuge.get(pid) === o, 'Wrack weg');
    assert.ok(await bis(() => feuerVon(raum, pid), 7000), 'Spielerauto brennt nicht');
    // langsam: kein Crash
    const st2 = strecke(raum, 110);
    const id = raum.verkehr.neu('auto', { x: st2.ax, y: st2.ay }), f = s.fahrzeuge.get(id);
    f.richtung = st2.w; raum.verkehr.info.get(id).halt = 1000; f.haelt = true;
    b.f.x = st2.ax - Math.cos(st2.w) * 46; b.f.y = st2.ay - Math.sin(st2.w) * 46; b.f.richtung = st2.w;
    b.v = 5;
    raum.fahrbare.crash.pruefen(b);
    assert.equal(f.art, 'auto', 'langsames Anschieben ist ein Crash');
  } finally { await ende(); }
});
