// Fahrbare Fahrzeuge (Boxer, Puma, Leopard): mehrere gleichzeitig, Tempo, Hindernisse, Turmwaffen (Puma-Kanone, Leopard-Kanone), keine Horde für
// Superuser-Fahrzeuge, Superuser-Menü (Waffe wählen, Fahrzeug setzen/ersetzen/entfernen, nur Superuser) und Schießstand (selbst fahren)
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
import { fahrbarFrei, ART, FAHRBAR_PLAETZE } from '../server/fahrbar.mjs';
import { SU_WAFFEN } from '../server/superuser.mjs';
import { FAHRBAR, FAHRBAR_ARTEN, fahrbarNah } from '../client/fahrbar.mjs';
import { WAFFEN, vorratVon, frei, kmhZuPx } from '../client/welt.mjs';
import { stammBei } from '../client/walze.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-fahrbar-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

// ---------- Maße ----------
test('Maße: Boxer, Puma und Leopard in echten Metern (8 px = 1 m), Einstieg nur nahe der Wanne', () => {
  assert.deepEqual(FAHRBAR_ARTEN, ['boxer', 'puma', 'leopard']);
  assert.ok(Math.abs(FAHRBAR.puma.laenge - 7.3 * 8) < 0.01 && Math.abs(FAHRBAR.puma.breite - 3.7 * 8) < 0.01);
  assert.ok(Math.abs(FAHRBAR.leopard.laenge - 61.6) < 0.01);
  for (const a of FAHRBAR_ARTEN) {
    const m = FAHRBAR[a], f = { x: 500, y: 500, richtung: 0 };
    assert.ok(Number.isFinite(m.turmX) && Number.isFinite(m.turmY) && m.muendung > 10, a);
    assert.ok(fahrbarNah(a, f, 500, 500 + m.breite / 2 + 10), a + ' nah');
    assert.ok(!fahrbarNah(a, f, 500, 500 + m.breite / 2 + 40), a + ' fern');
    assert.ok(ART[a].fahrwerk.tempoKmh === 60, a + ' Tempo-Vorgabe 60');
  }
  assert.equal(FAHRBAR_PLAETZE, 4);
});

// ---------- Raum mit Spielern ----------
function findeArt(raum, art, gang, hinderAb = 0, hinderBis = 0) {
  const welt = raum.wv('');
  for (let y = 300; y < 1300; y += 24) for (let x = 200; x < 1700; x += 24) {
    if (!fahrbarFrei(welt, art, x, y, 0)) continue;
    let weg = 0;
    while (weg < 1200 && fahrbarFrei(welt, art, x + weg, y, 0)) weg += 4;
    if (hinderAb ? weg >= hinderAb && weg <= hinderBis : weg >= gang) {
      // Hindernis darf nichts Walzbares sein: geparkte Autos platt Leopard/Puma (server/walze.mjs), Bäume und Zäune ebenso
      const ex = x + weg + FAHRBAR[art].laenge / 2;
      if (hinderAb && (welt.behaelter ?? []).some(b => b.art === 'auto' && Math.abs(b.x - ex) < 140 && Math.abs(b.y - y) < 100)) continue;
      if ([-20, 0, 20].some(dy => [0, 12, 24].some(dx => stammBei(welt, ex + dx, y + dy, 6)))) continue;
      if (frei(welt, x, y + 50, 10)) return { x, y, weg };
    }
  }
  throw new Error('keine passende Stelle');
}
const mitRaum = (fn, extra = {}) => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 0, ...extra };
  const clients = [];
  const neu = async name => {
    const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
    clients.push(c);
    const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.waffe = ''; p.munition = 0;   // die Figur schießt nicht selbst
    return { c, p, sid: c.sessionId };
  };
  try {
    const a = await neu('Fahrer');
    const raum = matchMaker.getLocalRoomById(a.c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.state.phase = 'spiel';
    await fn({ raum, a, neu });
  } finally { for (const c of clients) { try { await c.leave(); } catch { /* weg */ } } await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};
const zombie = (raum, x, y, steht = false) => { const id = raum.setzeZombie(x, y, ''); raum.zombieInfo.get(id).steht = steht; return id; };
// Zombies an ihrer Stelle festhalten (sie würden sonst umherlaufen); gibt die Aufräumfunktion zurück
const festhalten = (raum, ids) => {
  const pos = new Map(ids.map(id => [id, { x: raum.state.zombies.get(id).x, y: raum.state.zombies.get(id).y }]));
  const t = setInterval(() => { for (const [id, o] of pos) { const z = raum.state.zombies.get(id); if (z) { z.x = o.x; z.y = o.y; } } }, 15);
  return () => clearInterval(t);
};
const gebe = (raum, sid) => { raum.extra.get(sid).superuser = true; raum.state.spieler.get(sid).su = true; };

// ---------- Superuser-Menü ----------
test('Superuser: jede Waffe direkt wählen, Munition passend voll; wer kein Superuser ist, bekommt nichts', mitRaum(async ({ raum, a }) => {
  assert.deepEqual(SU_WAFFEN, Object.keys(WAFFEN).filter(n => n !== 'faust'));
  for (const n of ['mg', 'granatwerfer', 'handgranate']) assert.ok(SU_WAFFEN.includes(n), n);
  a.c.send('su', { befehl: 'waffe', name: 'mg' });
  await warte(250);
  assert.equal(a.p.waffe, '', 'Nicht-Superuser darf keine Waffe wählen');
  gebe(raum, a.sid);
  for (const n of SU_WAFFEN) {
    a.p.munition = 0; a.p.granaten = 0; a.p.handgranaten = 0; a.p.pfeile = 0;
    a.c.send('su', { befehl: 'waffe', name: n });
    assert.ok(await bis(() => a.p.waffe === n && (!WAFFEN[n].fern || a.p.magazin > 0)), `Waffe ${n}: ${a.p.waffe}, Magazin ${a.p.magazin}`);
    assert.ok(!WAFFEN[n].fern || vorratVon(a.p, WAFFEN[n]) + a.p.magazin >= Math.min(a.p.magmax, 5), `Vorrat ${n}`);
    assert.equal(a.p.handgranaten + (n === 'handgranate' ? a.p.magazin : 0) >= 5, true, `Handgranaten ${n}`);
  }
  a.c.send('su', { befehl: 'waffe', name: 'gibtsnicht' });
  await warte(250);
  assert.equal(a.p.waffe, SU_WAFFEN[SU_WAFFEN.length - 1], 'unbekannte Waffe ändert nichts');
}));

test('Superuser: Fahrzeug neben sich setzen, ein neues ersetzt das alte, Entfernen-Knopf, kein Bus, nur Superuser', mitRaum(async ({ raum, a }) => {
  const w = findeArt(raum, 'leopard', 200);
  a.p.x = w.x; a.p.y = w.y; a.p.richtung = 0;
  a.c.send('su', { befehl: 'fahrzeug', art: 'puma' });
  await warte(250);
  assert.equal(raum.fahrbare.liste.length, 0, 'Nicht-Superuser darf kein Fahrzeug setzen');
  gebe(raum, a.sid);
  a.c.send('su', { befehl: 'fahrzeug', art: 'bus' });
  await warte(250);
  assert.equal(raum.fahrbare.liste.length, 0, 'Bus gibt es nicht');
  a.c.send('su', { befehl: 'fahrzeug', art: 'puma' });
  assert.ok(await bis(() => raum.fahrbare.liste.length === 1), 'Puma fehlt');
  const p1 = raum.fahrbare.liste[0], id1 = p1.id;
  assert.equal(raum.state.fahrzeuge.get(id1).art, 'puma');
  assert.ok(p1.nahGenug(a.p), 'Puma steht nicht in Einstiegsreichweite');
  assert.ok(fahrbarFrei(raum.welt, 'puma', p1.f.x, p1.f.y, p1.f.richtung), 'Puma steht im Hindernis');
  a.c.send('su', { befehl: 'fahrzeug', art: 'leopard' });
  assert.ok(await bis(() => raum.fahrbare.liste[0]?.art === 'leopard'), 'Leopard ersetzt den Puma nicht');
  assert.equal(raum.fahrbare.liste.length, 1);
  assert.ok(!raum.state.fahrzeuge.has(id1), 'alter Puma steht noch im Zustand');
  assert.equal(raum.state.fahrzeuge.get(raum.fahrbare.liste[0].id).art, 'leopard');
  a.c.send('su', { befehl: 'fahrzeug', art: 'boxer' });
  assert.ok(await bis(() => raum.fahrbare.liste[0]?.art === 'boxer'));
  assert.equal([...raum.state.fahrzeuge.values()].filter(f => FAHRBAR_ARTEN.includes(f.art)).length, 1);
  a.c.send('su', { befehl: 'fahrzeug_weg' });
  assert.ok(await bis(() => raum.fahrbare.liste.length === 0), 'Fahrzeug nicht entfernt');
  assert.equal([...raum.state.fahrzeuge.values()].filter(f => FAHRBAR_ARTEN.includes(f.art)).length, 0);
}));

// ---------- Fahren ----------
for (const art of ['puma', 'leopard']) {
  test(`${art} fahren: Einsteigen mit E, Höchsttempo 60 km/h, Einstellung wirkt, bleibt vor Hindernissen stehen, Aussteigen`, mitRaum(async ({ raum, a }) => {
    const w = findeArt(raum, art, 0, 400, 1100);
    const b = raum.fahrbare.setzen(a.sid, art, a.p);
    assert.ok(b, 'kein Fahrzeug gesetzt');
    const f = b.aufstellen(w.x, w.y, 0);
    a.p.x = f.x; a.p.y = f.y + FAHRBAR[art].breite / 2 + 12;
    const fw = b.fahrwerk();
    assert.ok(Math.abs(fw.vmax - kmhZuPx(60)) < 0.01, 'Vorgabe nicht 60 km/h');
    a.c.send('aktion');
    assert.ok(await bis(() => a.p.imBoxer && a.p.anBord), 'steigt nicht ein');
    assert.equal(b.fahrer, a.sid);
    raum.extra.get(a.sid).eingabe = { dx: 1, dy: 0, s: false };
    let vmax = 0; const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !(b.v === 0 && f.x > w.x + 40)) { vmax = Math.max(vmax, b.v); await warte(10); }
    assert.ok(vmax > kmhZuPx(60) * 0.97 && vmax <= kmhZuPx(60) + 0.5, 'Höchsttempo ' + vmax);
    assert.ok(fahrbarFrei(raum.wv(''), art, f.x, f.y, f.richtung), 'steht im Hindernis');
    await warte(500);
    assert.ok(f.x < w.x + w.weg + 1, 'durch das Hindernis gefahren, platt: ' + raum.state.platt.size + ', Baeume weg: ' + (raum.welt.baeumeWeg?.size ?? 0));
    assert.ok(Math.hypot(a.p.x - f.x, a.p.y - f.y) < 1, 'Insasse folgt nicht');
    raum.extra.get(a.sid).eingabe = { dx: 0, dy: 0, s: false };
    a.c.send('aussteigen');
    assert.ok(await bis(() => !a.p.imBoxer && !a.p.anBord), 'steigt nicht aus');
    assert.ok(frei(raum.wv(''), a.p.x, a.p.y, 10), 'nicht auf freiem Platz');
  }));
}

// Walzbares Hindernis (geparktes Auto) wird von Leopard und Puma plattgemacht, der Weg danach ist frei
for (const art of ['puma', 'leopard']) {
  test(`${art} fahren: geparktes Auto im Weg wird plattgewalzt, die Fahrt geht weiter`, mitRaum(async ({ raum, a }) => {
    const welt = raum.wv('');
    let ort = null;
    for (const c of welt.behaelter ?? []) {
      if (c.art !== 'auto') continue;
      for (const x of [c.x - 200, c.x - 150]) if (x > 100 && fahrbarFrei(welt, art, x, c.y, 0) && fahrbarFrei(welt, art, x + 60, c.y, 0)) { ort = { x, y: c.y, auto: c }; break; }
      if (ort) break;
    }
    if (!ort) return;   // Welt ohne passend stehendes Auto
    const b = raum.fahrbare.setzen(a.sid, art, a.p);
    const f = b.aufstellen(ort.x, ort.y, 0);
    a.p.x = f.x; a.p.y = f.y + FAHRBAR[art].breite / 2 + 12;
    a.c.send('aktion');
    assert.ok(await bis(() => a.p.imBoxer && a.p.anBord), 'steigt nicht ein');
    raum.extra.get(a.sid).eingabe = { dx: 1, dy: 0, s: false };
    assert.ok(await bis(() => raum.state.platt.has(ort.auto.id) || f.x > ort.auto.x + 80, 12000), 'Auto nicht plattgewalzt');
    assert.ok(raum.state.platt.has(ort.auto.id), 'Auto steht noch, Fahrzeug trotzdem vorbei');
    raum.extra.get(a.sid).eingabe = { dx: 0, dy: 0, s: false };
  }));
}

test('Einstellung bundeswehr.pumaTempo / leopardTempo bestimmt das Höchsttempo je Art', mitRaum(async ({ raum, a }) => {
  const p = raum.fahrbare.setzen(a.sid, 'puma', a.p), l = raum.fahrbare.setzen(a.sid + 'x', 'leopard', a.p);
  assert.ok(Math.abs(p.fahrwerk().vmax - kmhZuPx(30)) < 0.01 && Math.abs(l.fahrwerk().vmax - kmhZuPx(45)) < 0.01);
  assert.ok(Math.abs(raum.boxer.fahrwerk().vmax - kmhZuPx(60)) < 0.01, 'Boxer behält 60');
}, { bundeswehr: { pumaTempo: 30, leopardTempo: 45 } }));

test('mehrere Fahrzeuge gleichzeitig: Boxer, Puma und Leopard mit je eigenem Fahrer und eigenen Insassen, keine Horde für Superuser-Fahrzeuge', mitRaum(async ({ raum, a, neu }) => {
  const sp = [a, await neu('Zwei'), await neu('Drei')];
  const arten = ['boxer', 'puma', 'leopard'], fz = [];
  for (let i = 0; i < 3; i++) {
    const w = findeArt(raum, arten[i], 600);
    const b = i === 0 ? raum.boxer : raum.fahrbare.setzen(sp[i].sid, arten[i], sp[i].p);
    if (i === 0) b.aufstellen(w.x, w.y, 0);   // der Boxer steht sonst nur in Königsdorf
    fz.push(b);
    if (i > 0) assert.equal(typeof b.hordeSchritt, 'undefined', 'Superuser-Fahrzeug hat eine Hordenlogik');
  }
  const orte = [], welt = raum.wv('');
  outer: for (let y = 300; y < 1300; y += 24) for (let x = 200; x < 1700; x += 24) {
    if (!arten.every((art, i) => fahrbarFrei(welt, art, x + i * 90, y, 0))) continue;
    if (!arten.every((art, i) => fahrbarFrei(welt, art, x + i * 90 + 250, y, 0) && fahrbarFrei(welt, art, x + i * 90 + 120, y, 0))) continue;
    orte.push([x, y]); break outer;
  }
  assert.ok(orte.length, 'keine Stelle für drei Fahrzeuge nebeneinander');
  const [x0, y0] = orte[0];
  for (let i = 0; i < 3; i++) { fz[i].aufstellen(x0 + i * 90, y0, 0); sp[i].p.x = fz[i].f.x; sp[i].p.y = fz[i].f.y + FAHRBAR[arten[i]].breite / 2 + 10; }
  assert.deepEqual([...raum.state.fahrzeuge.values()].map(f => f.art).filter(x => FAHRBAR_ARTEN.includes(x)).sort(), ['boxer', 'leopard', 'puma']);
  for (const q of sp) q.c.send('aktion');
  assert.ok(await bis(() => sp.every(q => q.p.imBoxer)), 'nicht alle eingestiegen');
  assert.deepEqual(fz.map(b => b.fahrer), sp.map(q => q.sid));
  assert.deepEqual(sp.map(q => raum.fahrbare.von(q.sid)?.art), arten);
  // nur das Fahrzeug des Fahrers fährt
  const vorher = fz.map(b => b.f.x);
  raum.extra.get(sp[1].sid).eingabe = { dx: 1, dy: 0, s: false };
  assert.ok(await bis(() => fz[1].f.x > vorher[1] + 40, 5000), 'Puma fährt nicht');
  assert.ok(Math.abs(fz[0].f.x - vorher[0]) < 1 && Math.abs(fz[2].f.x - vorher[2]) < 1, 'andere Fahrzeuge bewegen sich');
  // Aussteigen aus dem eigenen Fahrzeug
  sp[2].c.send('aussteigen');
  assert.ok(await bis(() => !sp[2].p.imBoxer && fz[2].insassen.length === 0));
  assert.ok(sp[0].p.imBoxer && sp[1].p.imBoxer);
  // keine Boxer-Horde, auch wenn Insassen im Puma sitzen
  const hordeVorher = raum.welle?.horden.filter(h => h.boxer).length ?? 0;
  fz[0].hordeT = 0; fz[0].insassen.length && (fz[0].hordeT = 0);
  await warte(300);
  assert.equal(raum.welle?.horden.filter(h => h.boxer).length ?? 0, hordeVorher, 'Boxer-Horde ohne Anlass');
  assert.equal(fz[1].horden, undefined); assert.equal(fz[2].horden, undefined);
}));

// ---------- Turmwaffen ----------
test('Puma: Kanone schießt auf den nächsten Zombie (nur mit Insassen), Abschuss zählt nicht für die Aufgaben', mitRaum(async ({ raum, a }) => {
  const w = findeArt(raum, 'puma', 600);
  const b = raum.fahrbare.setzen(a.sid, 'puma', a.p), f = b.aufstellen(w.x, w.y, 0);
  a.p.x = f.x; a.p.y = f.y + FAHRBAR.puma.breite / 2 + 12;
  const schuesse = []; const bc = raum.broadcast.bind(raum); raum.broadcast = (t, m) => { if (t === 'bwschuss' && m.evak === 'puma') schuesse.push(m); return bc(t, m); };
  const nah = zombie(raum, f.x + 200, f.y, true), fern = zombie(raum, f.x + 560, f.y, true);   // 25 m / 70 m: außerhalb der 60 m
  await warte(1200);
  assert.equal(schuesse.length, 0, 'schießt ohne Insassen');
  const besiegt = raum.state.besiegt;
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  assert.ok(await bis(() => !raum.state.zombies.has(nah), 6000), 'Kanone trifft nicht');
  assert.ok(schuesse.length >= 1 && schuesse[0].art === 'kanone' && Number.isFinite(schuesse[0].tw), 'bwschuss fehlt');
  assert.ok(raum.state.zombies.has(fern), 'schießt über die Reichweite');
  assert.equal(raum.state.besiegt, besiegt, 'Abschuss zählt für die Aufgaben');
  assert.ok(Math.hypot(schuesse[0].x1 - f.x, schuesse[0].y1 - f.y) > 10, 'Mündung steht in der Wannenmitte');
}));

test('Leopard: Hauptkanone feuert auf einen Zombiehaufen (Druckwelle/Rauch-Meldung), nie bei einem Spieler am Einschlag; ohne Insassen kein Feuer', mitRaum(async ({ raum, a }) => {
  const w = findeArt(raum, 'leopard', 700);
  const b = raum.fahrbare.setzen(a.sid, 'leopard', a.p), f = b.aufstellen(w.x, w.y, 0);
  a.p.x = f.x; a.p.y = f.y + FAHRBAR.leopard.breite / 2 + 12;
  const kanonen = []; const bc = raum.broadcast.bind(raum); raum.broadcast = (t, m) => { if (t === 'leopardkanone') kanonen.push(m); return bc(t, m); };
  const cx = f.x + 35 * 8, cy = f.y;   // 35 m voraus: außerhalb der MG-Reichweite (29 m), innerhalb der Kanone (15–60 m)
  const ids = []; for (let i = 0; i < 14; i++) ids.push(zombie(raum, cx + (i % 4) * 6 - 9, cy + Math.floor(i / 4) * 6 - 9, true));
  b.leopard.kuehlK = 0;
  const los = festhalten(raum, ids);
  try {
  await warte(2500);
  assert.equal(kanonen.length, 0, 'schießt ohne Insassen');
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  const besiegt = raum.state.besiegt;
  assert.ok(await bis(() => kanonen.length >= 1, 12000), 'Hauptkanone feuert nicht');
  assert.ok(Math.abs(kanonen[0].x2 - cx) < 40 && Math.abs(kanonen[0].y2 - cy) < 40, 'Einschlag nicht beim Haufen');
  assert.ok(await bis(() => ids.filter(id => raum.state.zombies.has(id)).length <= 4, 4000), 'Haufen überlebt: ' + ids.filter(id => raum.state.zombies.has(id)).length);
  assert.equal(raum.state.besiegt, besiegt, 'Abschuss zählt für die Aufgaben');
  } finally { los(); }
}));

test('Leopard: kein Kanonenschuss, solange ein Spieler im Sicherheitsradius des Einschlags steht', mitRaum(async ({ raum, a, neu }) => {
  const w = findeArt(raum, 'leopard', 700);
  const b = raum.fahrbare.setzen(a.sid, 'leopard', a.p), f = b.aufstellen(w.x, w.y, 0);
  a.p.x = f.x; a.p.y = f.y + FAHRBAR.leopard.breite / 2 + 12;
  const zwei = await neu('Passant');
  const cx = f.x + 35 * 8, cy = f.y;
  zwei.p.x = cx + 20; zwei.p.y = cy;   // mitten im Haufen
  const kanonen = []; const bc = raum.broadcast.bind(raum); raum.broadcast = (t, m) => { if (t === 'leopardkanone') kanonen.push(m); return bc(t, m); };
  const ids = []; for (let i = 0; i < 14; i++) ids.push(zombie(raum, cx + (i % 4) * 6 - 9, cy + Math.floor(i / 4) * 6 - 9, true));
  b.leopard.kuehlK = 0;
  const los = festhalten(raum, ids);
  try {
    a.c.send('aktion');
    assert.ok(await bis(() => a.p.imBoxer));
    await warte(3500);
    assert.equal(kanonen.length, 0, 'schießt auf Spieler');
  } finally { los(); }
}));

// ---------- Schießstand ----------
test('Schießstand: Boxer, Puma und Leopard selbst fahren (Einsteigen/Aussteigen, ein Fahrzeug je Spieler, Turm schießt, keine Horde)', async () => {
  const c = await new Client(URL_).create('schiessstand', { name: 'Fahrschueler' });
  const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  raum.kriecherChance = 0;
  try {
    for (const art of FAHRBAR_ARTEN) {
      c.send('ss_fahrbar', { art });
      assert.ok(await bis(() => raum.fahrbare.vonBesitzer(c.sessionId)?.art === art), `${art} nicht gesetzt`);
      assert.equal(raum.fahrbare.liste.length, 1, 'mehr als ein Fahrzeug je Spieler');
      const b = raum.fahrbare.liste[0];
      assert.ok(b.nahGenug(p), `${art}: nicht in Einstiegsreichweite`);
      assert.ok(fahrbarFrei(raum.welt, art, b.f.x, b.f.y, b.f.richtung), `${art}: steht im Hindernis`);
      c.send('aktion');
      assert.ok(await bis(() => p.imBoxer && p.anBord), `${art}: steigt nicht ein`);
      assert.equal(b.fahrer, c.sessionId);
      const x0 = b.f.x, y0 = b.f.y;
      x.eingabe = { dx: 0, dy: 1, s: false };   // Richtung Süden (Zombiefeld) lenken, dann ein Stück fahren
      assert.ok(await bis(() => Math.hypot(b.f.x - x0, b.f.y - y0) > 40, 6000), `${art}: fährt nicht`);
      assert.ok(b.v <= kmhZuPx(60) + 0.5);
      x.eingabe = { dx: 0, dy: 0, s: false };
      assert.ok(await bis(() => Math.abs(b.v) < 0.5, 4000), `${art}: bremst nicht`);
      c.send('aktion');   // E noch einmal: aussteigen
      assert.ok(await bis(() => !p.imBoxer && !p.anBord), `${art}: steigt nicht aus`);
      assert.equal(typeof b.hordeSchritt, 'undefined');
    }
    // Turm: Zombie vor dem Leopard, Kanone/MG trifft und der Abschuss zählt als Fahrzeug-Abschuss
    c.send('ss_fahrbar', { art: 'puma' });
    assert.ok(await bis(() => raum.fahrbare.vonBesitzer(c.sessionId)?.art === 'puma'));
    const b = raum.fahrbare.liste[0];
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer));
    const z = zombie(raum, b.f.x + 160, b.f.y, true);
    raum.zombieInfo.get(z).uebung = true;
    assert.ok(await bis(() => !raum.state.zombies.has(z), 6000), 'Puma-Kanone trifft nicht');
    assert.ok(raum.panzerKills >= 1, 'Abschuss nicht dem Fahrzeug zugerechnet');
    // Entfernen: noch einmal dieselbe Art wählen
    c.send('ss_fahrbar', { art: 'puma' });
    assert.ok(await bis(() => raum.fahrbare.liste.length === 0), 'Fahrzeug nicht entfernt');
    assert.ok(!p.imBoxer && !p.anBord, 'Spieler sitzt noch im entfernten Fahrzeug');
  } finally { await c.leave(); }
});
