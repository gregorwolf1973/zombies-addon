// Radpanzer Boxer (Königsdorf): Standort am Flugfeld, Einsteigen/Fahrer/Aussteigen, Fahren mit Hindernis, Sicherheit der Insassen,
// Turm (nur mit Insassen), Horde (nur mit Insassen), Bots steigen nicht ein, Boxer-Insassen zählen nicht als Evakuierungs-Mitfahrer, Einstellungen
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
import { boxerStandort, boxerFrei, EINST_VORGABE, BOXER_PLAETZE } from '../server/boxer.mjs';
import { bereinige } from '../server/einstellungen.mjs';
import { BOXER, boxerNah } from '../client/boxer.mjs';
import { KACHEL, setzeKartengroesse, frei } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';

const PORT = 28300 + Math.floor(Math.random() * 100);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-boxer-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

// ---------- Standort in der Welt Königsdorf ----------
for (const seed of [7, 12345, 987654321]) {
  test(`Boxer-Standort Königsdorf (Seed ${seed}): am Flugfeld, frei, nicht auf der Piste`, () => {
    const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/koenigsdorf.json', import.meta.url)));
    setzeKartengroesse(karte.breite, karte.hoehe);
    const w = baueWeltAusKarte(karte, seed), o = boxerStandort(w);
    assert.ok(o, 'kein Standort');
    assert.ok(boxerFrei(w, o.x, o.y, o.w), 'Wanne steht in einem Hindernis');
    const pi = w.piste, rw = pi.rollweg[0], ende = rw[rw.length - 1];
    assert.ok(Math.hypot(o.x / KACHEL - ende[0], o.y / KACHEL - ende[1]) < 25, 'nicht bei den Hangars (Rollwegende)');
    // Abstand zur Piste (Mittellinie) größer als ihre halbe Breite
    const dx = pi.x1 - pi.x0, dy = pi.y1 - pi.y0, t = Math.max(0, Math.min(1, ((o.x / KACHEL - pi.x0) * dx + (o.y / KACHEL - pi.y0) * dy) / (dx * dx + dy * dy)));
    assert.ok(Math.hypot(o.x / KACHEL - pi.x0 - t * dx, o.y / KACHEL - pi.y0 - t * dy) > pi.b / 2 + 1.5, 'auf der Piste');
    setzeKartengroesse(karte.breite, karte.hoehe);
    assert.deepEqual(boxerStandort(baueWeltAusKarte(karte, seed)), o, 'nicht deterministisch');
  });
}

test('Boxer-Standort: Karten ohne Piste haben keinen Boxer', () => {
  assert.equal(boxerStandort({}), null);
});

test('Einstellungen: boxer* nur technisch begrenzt, Maximum nie unter dem Minimum', () => {
  const b = bereinige({}).bundeswehr;
  for (const [k, v] of Object.entries(EINST_VORGABE)) assert.equal(b[k], v, k);
  const k = bereinige({ bundeswehr: { boxerHordeSek: 1, boxerHordeMin: 0, boxerHordeMax: 9999, boxerSchussPause: 0, boxerReichweite: 9999 } }).bundeswehr;
  assert.deepEqual([k.boxerHordeSek, k.boxerHordeMin, k.boxerHordeMax, k.boxerSchussPause, k.boxerReichweite], [1, 1, 2000, 0.05, 9999]);
  const m = bereinige({ bundeswehr: { boxerHordeMin: 80, boxerHordeMax: 30 } }).bundeswehr;
  assert.ok(m.boxerHordeMax >= m.boxerHordeMin, 'Maximum unter Minimum');
});

test('Einstiegsprüfung: nur nahe der Wanne', () => {
  const f = { x: 500, y: 500, richtung: 0 };
  assert.ok(boxerNah(f, 500, 500 + BOXER.breite / 2 + 10));
  assert.ok(boxerNah(f, 500 + BOXER.laenge / 2 + 10, 500));
  assert.ok(!boxerNah(f, 500, 500 + BOXER.breite / 2 + 40));
  assert.ok(!boxerNah(f, 500 + BOXER.laenge / 2 + 50, 500));
});

// ---------- Raum mit aufgestelltem Boxer ----------
// freie Pose (Richtung 0 = nach Osten) mit freiem Gang `gang` px voraus, Hindernis erst ab `hinderAb`..`hinderBis` px (0 = egal)
function finde(raum, gang, hinderAb = 0, hinderBis = 0) {
  const welt = raum.wv('');
  for (let y = 300; y < 1300; y += 24) for (let x = 200; x < 1700; x += 24) {
    if (!boxerFrei(welt, x, y, 0)) continue;
    let weg = 0;
    while (weg < 1200 && boxerFrei(welt, x + weg, y, 0)) weg += 4;
    if (hinderAb ? weg >= hinderAb && weg <= hinderBis : weg >= gang) {
      // Zusatz: seitlich Platz zum Aussteigen
      if (frei(welt, x, y + 40, 10)) return { x, y, weg };
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
    const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
    clients.push(c);
    const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.waffe = ''; p.munition = 0;   // die Figur schießt nicht selbst: nur der Turm soll Zombies treffen
    return { c, p, sid: c.sessionId };
  };
  try {
    const a = await neu('Fahrer');
    const raum = matchMaker.getLocalRoomById(a.c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const w = finde(raum, 420);
    const f = raum.boxer.aufstellen(w.x, w.y, 0);
    a.p.x = f.x; a.p.y = f.y + BOXER.breite / 2 + 12;
    raum.state.phase = 'spiel';
    await fn({ raum, f, a, neu, w, boxer: raum.boxer });
  } finally { for (const c of clients) { try { await c.leave(); } catch { /* weg */ } } await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};
const zombie = (raum, x, y) => { const id = raum.setzeZombie(x, y, ''); raum.zombieInfo.get(id).steht = false; return id; };

test('Einsteigen mit Aktionstaste: Fahrer zuerst, nächster Insasse übernimmt, Aussteigen neben der Wanne mit Schonzeit; höchstens vier', mitRaum(async ({ raum, f, a, neu, boxer }) => {
  assert.equal(raum.state.fahrzeuge.get('boxer1')?.art, 'boxer');
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer), 'steigt nicht ein');
  assert.ok(a.p.anBord, 'anBord (Zombieschutz) fehlt');
  assert.equal(boxer.fahrer, a.sid);
  const b = await neu('Zweiter'); b.p.x = f.x - 10; b.p.y = f.y + BOXER.breite / 2 + 14;
  b.c.send('aktion');
  assert.ok(await bis(() => b.p.imBoxer), 'zweiter steigt nicht ein');
  assert.equal(boxer.fahrer, a.sid, 'Fahrer wechselt beim Einsteigen');
  assert.deepEqual(boxer.insassen, [a.sid, b.sid]);
  assert.ok(Math.hypot(a.p.x - f.x, a.p.y - f.y) < 1 && Math.hypot(b.p.x - f.x, b.p.y - f.y) < 1, 'Insassen folgen dem Boxer nicht');
  // Fahrer steigt aus: der zweite fährt
  a.c.send('aussteigen');
  assert.ok(await bis(() => !a.p.imBoxer), 'steigt nicht aus');
  assert.equal(a.p.anBord, false);
  assert.equal(boxer.fahrer, b.sid, 'Fahrerwechsel fehlt');
  const d = Math.hypot(a.p.x - f.x, a.p.y - f.y);
  assert.ok(d > 5 && d < 60 && frei(raum.wv(''), a.p.x, a.p.y, 10), 'nicht auf freiem Platz neben dem Boxer: ' + d);
  assert.ok((raum.extra.get(a.sid).schonT ?? 0) > 0, 'keine Schonzeit');
  // Aktionstaste im Boxer steigt ebenfalls aus
  b.c.send('aktion');
  assert.ok(await bis(() => !b.p.imBoxer), 'Aktionstaste steigt nicht aus');
  assert.equal(boxer.insassen.length, 0);
  // weit weg: kein Einsteigen
  a.p.x = f.x; a.p.y = f.y + 200;
  assert.equal(boxer.einsteigen(a.sid), false);
  // vier Plätze
  const sp = [a, b];
  for (const n of ['Dritter', 'Vierter', 'Fünfter']) sp.push(await neu(n));
  for (const q of sp) { q.p.x = f.x; q.p.y = f.y + BOXER.breite / 2 + 10; }
  const ein = sp.map(q => boxer.einsteigen(q.sid));
  assert.deepEqual(ein, [true, true, true, true, false]);
  assert.equal(BOXER_PLAETZE, 4);
}));

test('Fahren: Eingabe lenkt, Boxer beschleunigt auf ca. 10 m/s, dreht begrenzt, bremst ohne Eingabe und bleibt vor einem Hindernis stehen', mitRaum(async ({ raum, f, a, w, boxer }) => {
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  const x = raum.extra.get(a.sid);
  const x0 = f.x, y0 = f.y;
  x.eingabe = { dx: 1, dy: 0, s: false };
  assert.ok(await bis(() => f.x > x0 + 60, 5000), 'fährt nicht');
  assert.ok(Math.abs(f.y - y0) < 2 && Math.abs(f.richtung) < 0.01, 'weicht von der Richtung ab');
  assert.ok(Math.hypot(a.p.x - f.x, a.p.y - f.y) < 1, 'Insasse folgt nicht');
  assert.ok(boxer.v <= 80.5, 'schneller als 10 m/s: ' + boxer.v);
  // Lenken: nach unten drehen (begrenzte Rate)
  const t0 = Date.now(), r0 = f.richtung;
  x.eingabe = { dx: 0, dy: 1, s: false };
  await warte(300);
  assert.ok(f.richtung > r0 + 0.1 && f.richtung < Math.PI / 2, 'dreht nicht oder sprunghaft: ' + f.richtung);
  assert.ok(f.richtung - r0 < 1.3 * 0.5 + 0.2, 'dreht zu schnell: ' + (f.richtung - r0));
  // ohne Eingabe: Stand
  x.eingabe = { dx: 0, dy: 0, s: false };
  assert.ok(await bis(() => Math.abs(boxer.v) < 0.01, 4000), 'bremst nicht');
}));

test('Fahren: vor einem Hindernis bleibt der Boxer stehen (nie in Häusern oder Wasser)', mitRaum(async ({ raum, a, boxer }) => {
  // Boxer an eine Stelle setzen, vor der ein Hindernis liegt
  const w = finde(raum, 0, 150, 700);
  const f = boxer.aufstellen(w.x, w.y, 0);
  a.p.x = f.x; a.p.y = f.y + BOXER.breite / 2 + 12;
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  raum.extra.get(a.sid).eingabe = { dx: 1, dy: 0, s: false };
  assert.ok(await bis(() => f.x > w.x + 40, 4000), 'fährt nicht');
  assert.ok(await bis(() => boxer.v === 0 && f.x > w.x + 40, 12000), 'bleibt nicht stehen');
  assert.ok(boxerFrei(raum.wv(''), f.x, f.y, f.richtung), 'steht im Hindernis');
  const stand = f.x;
  await warte(800);
  assert.ok(f.x - stand < 4, 'fährt durch das Hindernis: ' + (f.x - stand));
  assert.ok(f.x < w.x + w.weg + 1, 'weiter als das Hindernis');
}));

test('Insassen sind für Zombies unangreifbar und unsichtbar; Zombies im Fußabdruck werden überrollt', mitRaum(async ({ raum, f, a, boxer }) => {
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  boxer.kuehl = 1e9;   // Turm schweigt: nur die Zombies sollen etwas tun
  const hp = a.p.hp, zid = zombie(raum, f.x + 14, f.y + 10);
  await warte(1500);
  assert.equal(a.p.hp, hp, 'Zombie beißt Insassen');
  assert.ok(!raum.zombieInfo.get(zid)?.ziel, 'Zombie jagt Insassen');
  assert.ok(raum.state.zombies.has(zid), 'Zombie wurde ohne Fahrt überrollt');
  // Fahrt: der Zombie im Fußabdruck stirbt (zählt nicht für die Aufgaben)
  const besiegt = raum.state.besiegt, x0 = f.x, y0 = f.y;
  const z2 = zombie(raum, f.x + 80, f.y); raum.zombieInfo.get(z2).steht = true;   // steht still mitten in der Spur
  raum.extra.get(a.sid).eingabe = { dx: 1, dy: 0, s: false };
  // der Zombie wird in der Spur festgehalten (er würde sonst umherlaufen)
  assert.ok(await bis(() => { const q = raum.state.zombies.get(z2); if (q) { q.x = x0 + 80; q.y = y0; } return !q; }, 6000), `Zombie nicht überrollt: Boxer ${Math.round(f.x)}/${Math.round(f.y)} v=${boxer.v.toFixed(1)}`);
  assert.equal(raum.state.besiegt, besiegt, 'Überrollen zählt für die Aufgaben');
}));

test('Turm: Dauerfeuer auf den nächsten Zombie in Reichweite, nur mit Insassen; Abschuss zählt nicht für die Aufgaben', mitRaum(async ({ raum, f, a, boxer }) => {
  const nah = zombie(raum, f.x + 150, f.y), fern = zombie(raum, f.x + 400, f.y);   // 19 m / 50 m: außerhalb 40 m
  const schuesse = []; const bc = raum.broadcast.bind(raum); raum.broadcast = (t, m) => { if (t === 'bwschuss' && m.evak === 'boxer') schuesse.push(m); return bc(t, m); };
  await warte(1500);
  assert.ok(raum.state.zombies.has(nah) && raum.state.zombies.has(fern), 'Zombies verschwunden');
  assert.equal(schuesse.length, 0, 'schießt ohne Insassen');
  const besiegt = raum.state.besiegt;
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  assert.ok(await bis(() => !raum.state.zombies.has(nah), 5000), 'Turm trifft nicht');
  assert.ok(schuesse.length >= 1 && schuesse[0].evak === 'boxer' && Number.isFinite(schuesse[0].tw), 'bwschuss fehlt');
  assert.ok(Math.abs(Math.atan2(Math.sin(f.turm), Math.cos(f.turm))) < 3.2);
  assert.ok(raum.state.zombies.has(fern), 'schießt über die Reichweite');
  assert.equal(raum.state.besiegt, besiegt, 'Abschuss zählt für die Aufgaben');
  // Turm dreht nicht sprunghaft: Zombie hinter dem Boxer
  const hinten = zombie(raum, f.x - 160, f.y + 5);
  f.turm = 0; const t0 = Date.now();
  const nr = schuesse.length;
  assert.ok(await bis(() => schuesse.length > nr, 4000), 'zielt nicht nach hinten');
  assert.ok(Date.now() - t0 > 500, 'Turm dreht zu schnell (π rad bei 2,5 rad/s braucht > 1 s)');
  assert.ok(hinten);
}));

test('Horde: alle boxerHordeSek Sekunden 20–50 Zombies 80–100 m voraus, nur mit Insassen, folgt dem Boxer', mitRaum(async ({ raum, a, neu, boxer }) => {
  // freie Stelle mit viel Platz voraus
  const w = finde(raum, 1000);
  const f = boxer.aufstellen(w.x, w.y, 0);
  a.p.x = f.x; a.p.y = f.y + BOXER.breite / 2 + 12;
  boxer.hordeT = 119.9;   // ohne Insassen läuft die Uhr nicht
  await warte(700);
  assert.equal(raum.state.zombies.size, 0, 'Horde ohne Insassen');
  assert.ok(!raum.welle.horden.some(h => h.boxer));
  a.c.send('aktion');
  assert.ok(await bis(() => a.p.imBoxer));
  assert.equal(boxer.hordeT, 0, 'Uhr startet nicht beim ersten Insassen');
  boxer.hordeT = 119.9;
  assert.ok(await bis(() => raum.welle.horden.some(h => h.boxer), 3000), 'keine Horde nach boxerHordeSek');
  const h = raum.welle.horden.find(q => q.boxer);
  const n = h.ids.size;
  assert.ok(n >= 12 && n <= 50, 'Hordengröße ' + n);
  const mx = [...h.ids].reduce((s, id) => s + raum.state.zombies.get(id).x, 0) / n, my = [...h.ids].reduce((s, id) => s + raum.state.zombies.get(id).y, 0) / n;
  const d = Math.hypot(mx - f.x, my - f.y) / 8;
  assert.ok(d > 65 && d < 120, 'Entfernung ' + d + ' m');
  assert.ok(mx > f.x, 'nicht vor dem Boxer');
  assert.ok(h.lager, 'zählt als Lager-Welle (ohne Zielwechsel)');
  assert.equal(boxer.hordeT < 5, true, 'Uhr nicht neu gestartet');
  // Ziel folgt dem Boxer
  const ziel0 = { ...h.ziel };
  raum.extra.get(a.sid).eingabe = { dx: 1, dy: 0, s: false };   // nach Osten: dort ist mindestens 1000 px frei
  boxer.feldT = 0;
  assert.ok(await bis(() => Math.hypot(h.ziel.x - ziel0.x, h.ziel.y - ziel0.y) > 60 && Math.hypot(h.ziel.x - f.x, h.ziel.y - f.y) < 260, 10000), 'Ziel folgt dem Boxer nicht');
  // Insassen steigen aus: keine neue Horde, bestehende bleibt
  a.c.send('aussteigen');
  assert.ok(await bis(() => !a.p.imBoxer));
  const gesamt = raum.welle.horden.filter(q => q.boxer).length;
  boxer.hordeT = 1e6;
  await warte(500);
  assert.equal(raum.welle.horden.filter(q => q.boxer).length, gesamt, 'neue Horde ohne Insassen');
  assert.ok(raum.welle.horden.includes(h), 'bestehende Horde verschwindet');
}, { bundeswehr: { ...EINST_VORGABE } }));

test('Bots steigen nicht ein', mitRaum(async ({ raum, f, boxer }) => {
  const bots = [...raum.state.spieler.entries()].filter(([sid]) => raum.extra.get(sid)?.bot);
  assert.ok(bots.length >= 1, 'keine Bots im Raum');
  const [sid, b] = bots[0];
  b.ebene = ''; b.x = f.x; b.y = f.y + BOXER.breite / 2 + 8;
  assert.equal(boxer.einsteigen(sid), false);
  await warte(600);
  assert.ok(!b.imBoxer && !boxer.insassen.includes(sid), 'Bot ist eingestiegen');
}, { bots: 2 }));

test('Evakuierung: Boxer-Insassen zählen nie als Mitfahrer des Evakuierungsfahrzeugs', async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 0 };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Fahrgast', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const ag = raum.aufgaben; ag.alleBordSek = 0.3;
    raum.state.aufgaben.clear(); for (const id of ['funk', 'tor', 'zombies', 'lampen']) ag.neu(id, false); ag.aktualisieren(false);
    const p = raum.state.spieler.get(c.sessionId);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => [...raum.state.fahrzeuge.values()].some(f => f.art === 'evakuierung')), 'kein Bus');
    const bus = [...raum.state.fahrzeuge.values()].find(f => f.art === 'evakuierung');
    assert.ok(await bis(() => raum.state.busSteht, 8000), 'Bus steht nicht');
    // Boxer direkt am Bus, Spieler steigt ein (mitten im Einstiegsbereich des Busses)
    raum.boxer.aufstellen(bus.x, bus.y, 0);
    p.ebene = ''; p.x = bus.x; p.y = bus.y; raum.state.phase = 'spiel';
    assert.equal(raum.boxer.einsteigen(c.sessionId), true);
    await warte(800);
    assert.ok(p.imBoxer && p.anBord, 'Insasse nicht mehr im Boxer');
    assert.ok(!ag.eingestiegen.has(c.sessionId), 'Boxer-Insasse zählt als Mitfahrer der Evakuierung');
    assert.equal(raum.state.busBord, 0, 'busBord zählt den Boxer-Insassen');
    // Aussteigen: jetzt darf er normal einsteigen
    raum.boxer.aussteigen(c.sessionId);
    p.x = bus.x; p.y = bus.y;
    assert.ok(await bis(() => ag.eingestiegen.has(c.sessionId), 3000), 'nach dem Aussteigen kein normales Einsteigen mehr');
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
});
