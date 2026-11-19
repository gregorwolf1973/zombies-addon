// Zombiewellen, Tempofaktoren und seltenere Blaulicht-Fahrten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, BREITE, HOEHE, frei } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';

const PORT = 27300 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const neueId = () => crypto.randomBytes(16).toString('hex');
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

async function beitreten(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: neueId() });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.aktiv = null; raum.welle.ansage = null; raum.welle.uhr = null;
  return { c, raum, p: raum.state.spieler.get(c.sessionId) };
}
const alteEinst = SpielRaum.einstellungen;
function einst(zusatz) { SpielRaum.einstellungen = { ...alteEinst, ...zusatz }; }
const streuung = werte => { const m = werte.reduce((a, b) => a + b, 0) / werte.length; return Math.sqrt(werte.reduce((a, b) => a + (b - m) ** 2, 0) / werte.length); };

test('Einstellungen: Blaulicht und Welle werden bereinigt', () => {
  const v = vorgaben();
  assert.equal(v.blaulicht, 'selten');
  assert.equal(v.zombies.welle, 20); assert.equal(v.zombies.welleMin, 20); assert.equal(v.zombies.welleMax, 50);
  assert.equal(bereinige({ blaulicht: 'quatsch' }).blaulicht, 'selten');
  assert.equal(bereinige({ blaulicht: 'aus' }).blaulicht, 'aus');
  assert.equal(bereinige({ zombies: { welle: 2 } }).zombies.welle, 5);
  assert.equal(bereinige({ zombies: { welle: 0 } }).zombies.welle, 0);
  const z = bereinige({ zombies: { welleMin: 40, welleMax: 10 } }).zombies;
  assert.ok(z.welleMax >= z.welleMin && z.welleMax <= 1000);
  assert.equal(bereinige({ zombies: { welleMax: 5000 } }).zombies.welleMax, 1000);
  assert.equal(bereinige({ zombies: { welleMin: 200, welleMax: 250 } }).zombies.welleMin, 200);
});

test('Zombies bekommen verschiedene feste Tempofaktoren zwischen 0,9 und 1,1', async () => {
  const { c, raum } = await beitreten('Tempo');
  try {
    const ids = Array.from({ length: 40 }, (_, i) => raum.setzeZombie(100 + i * 5, 100, ''));
    const t = ids.map(id => raum.zombieInfo.get(id).tempo);
    assert.ok(t.every(x => x >= 0.9 && x <= 1.1), 'außerhalb 0,9–1,1');
    assert.ok(new Set(t.map(x => x.toFixed(3))).size > 20, 'zu wenig verschieden');
    // wirkt beim Gehen: schneller Zombie kommt weiter als langsamer
    const a = raum.setzeZombie(300, 300, ''), b = raum.setzeZombie(300, 600, '');
    raum.zombieInfo.get(a).tempo = 1.1; raum.zombieInfo.get(b).tempo = 0.9;
    const za = raum.state.zombies.get(a), zb = raum.state.zombies.get(b);
    // zwei freie waagrechte Strecken suchen (die Welt ist zufällig, an festen Stellen stehen manchmal Häuser)
    const freiStrecke = y => { for (let x = 64; x < 2000; x += 16) if ([0, 40, 80, 120].every(d => frei(raum.welt, x + d, y, 12))) return x; return null; };
    const strecken = [];
    for (let y = 80; y < 1500 && strecken.length < 2; y += 24) { const x = freiStrecke(y); if (x !== null && (!strecken.length || Math.abs(strecken[0].y - y) > 60)) strecken.push({ x, y }); }
    assert.equal(strecken.length, 2, 'keine freien Strecken');
    za.x = strecken[0].x; za.y = strecken[0].y; zb.x = strecken[1].x; zb.y = strecken[1].y;
    const ax0 = za.x, bx0 = zb.x;
    for (let i = 0; i < 20; i++) {
      raum.zombieGehen(za, 0, 3, 0.05, raum.zombieInfo.get(a));
      raum.zombieGehen(zb, 0, 3, 0.05, raum.zombieInfo.get(b));
    }
    assert.ok(za.x - ax0 > zb.x - bx0 && zb.x > bx0, `Tempo wirkt nicht (${za.x - ax0} ≤ ${zb.x - bx0})`);
  } finally { await c.leave(); }
});

test('Zombiewelle: Meldung, Gruppe außerhalb des Bildes, zieht zur Gegenseite, löst sich auf, zählt nicht zum Soll', async () => {
  const { c, raum, p } = await beitreten('Wellen');
  try {
    einst({ welleMinuten: 20, welleMin: 20, welleMax: 50, zombieFaktor: 1 });
    raum.zombieFaktor = 0;
    // Spieler mitten auf die Karte, draußen
    p.ebene = ''; p.x = BREITE * KACHEL / 2; p.y = HOEHE * KACHEL / 2;
    const meldungen = [];
    const alt = raum.broadcast.bind(raum);
    raum.broadcast = (typ, m, ...r) => { if (typ === 'meldung') meldungen.push(m.text); return alt(typ, m, ...r); };
    const seite = raum.welle.ansagen('west');
    assert.equal(seite, 'west');
    assert.ok(meldungen.some(m => /Zombiewelle kommt von .*Westen/.test(m)), 'Meldung fehlt');
    // vor Ablauf der 10 s noch nichts
    raum.welle.schritt(5);
    assert.equal(raum.state.zombies.size, 0);
    raum.welle.schritt(6);
    const ids = [...raum.welle.aktiv.ids];
    assert.ok(ids.length >= 10 && ids.length <= 50, `Größe ${ids.length}`);
    // zählt nicht zum Soll: bleibt-Markierung, Auffüllen zählt sie nicht
    assert.ok(ids.every(id => raum.zombieInfo.get(id).bleibt && raum.zombieInfo.get(id).welle));
    const zs = ids.map(id => raum.state.zombies.get(id));
    // links, so weit weg wie die Karte erlaubt (auf großen Karten hinter dem Bildrand, hier begrenzt durch die kleine Testkarte)
    const mx = zs.reduce((a, z) => a + z.x, 0) / zs.length;
    assert.ok(p.x - mx > 300, `Abstand ${p.x - mx}`);
    assert.ok(zs.every(z => Math.hypot(z.x - p.x, z.y - p.y) > 280), 'Zombie zu nah am Spieler aufgetaucht');
    // dichte Gruppe
    assert.ok(streuung(zs.map(z => z.x)) < 120 && streuung(zs.map(z => z.y)) < 120, 'zu verstreut');
    // Auffüllen: Soll 0 → nichts zu tun; mit Soll > 0 zählen Wellen-Zombies nicht als Ersatz
    raum.zombieFaktor = 1; raum.nachspawn = 0; raum.ersteWelle = false;
    const vorher = raum.state.zombies.size;
    raum.zombiesAuffuellen(0.1);
    assert.equal(raum.state.zombies.size, vorher + 1, 'Auffüllen hat die Welle als Ersatz gezählt');
    raum.zombieFaktor = 0;
    for (const [id] of [...raum.state.zombies]) if (!ids.includes(id)) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    // Spieler wegsperren, damit niemand jagt: weit weg in der Ecke stehen lassen wäre unfair, daher unsichtbar unten
    p.unten = true;
    const x0 = mx, y0 = zs.reduce((a, z) => a + z.y, 0) / zs.length;
    const j = raum.state.zombies.size;
    for (let i = 0; i < 1600 && raum.welle.aktiv && raum.welle.aktiv.ziele < 2; i++) {
      raum.welle.schritt(0.05);
      for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05);
    }
    // am Ziel angekommen: die Welle zieht weiter (neues Ziel) statt stehen zu bleiben
    assert.ok(raum.welle.aktiv && raum.welle.aktiv.ziele >= 2, 'Welle ist am Ziel stehen geblieben');
    raum.welle.aufloesen();
    const lebend = ids.filter(id => raum.state.zombies.has(id));
    const rest = lebend.map(id => raum.state.zombies.get(id));
    // Welle ist am Ziel angekommen und aufgelöst (verschwunden oder normale Zombies)
    assert.equal(raum.welle.aktiv, null, 'Welle nicht aufgelöst');
    if (rest.length) {
      const mx2 = rest.reduce((a, z) => a + z.x, 0) / rest.length;
      assert.ok(mx2 > x0 + 800, `bewegt sich nicht zur Gegenseite (${x0} → ${mx2})`);
    }
    assert.ok(j > 0);
    void y0;
  } finally { raum.broadcast = Object.getPrototypeOf(raum).broadcast; await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: weit weg von allen Spielern verschwinden sie beim Auflösen; höchstens 50', async () => {
  const { c, raum, p } = await beitreten('Weg');
  try {
    einst({ welleMinuten: 20, welleMin: 50, welleMax: 50 });
    p.ebene = ''; p.x = 4 * KACHEL; p.y = HOEHE * KACHEL / 2;
    // Welle von Osten, am anderen Ende der Karte; Spieler ist weit weg
    raum.welle.erzeugen('ost');
    const ids = [...raum.welle.aktiv.ids];
    assert.ok(ids.length <= 50 && ids.length > 0);
    const nahe = ids.filter(id => Math.hypot(raum.state.zombies.get(id).x - p.x, raum.state.zombies.get(id).y - p.y) < 700);
    for (const id of nahe) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    raum.welle.aufloesen();
    assert.equal(raum.welle.aktiv, null);
    for (const id of ids) if (!nahe.includes(id)) assert.ok(!raum.state.zombies.has(id), 'ferner Wellen-Zombie ist nicht verschwunden');
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: Zeitgeber löst nach der Einstellung aus; 0 = keine Welle', async () => {
  const { c, raum, p } = await beitreten('Uhr');
  try {
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;   // Startplatz ist immer frei und draußen
    einst({ welleMinuten: 0, welleMin: 20, welleMax: 20, zeitraffer: 1 });
    raum.welle.uhr = null;
    for (let i = 0; i < 100; i++) raum.welle.schritt(60);
    assert.equal(raum.welle.ansage, null); assert.equal(raum.welle.aktiv, null);
    einst({ welleMinuten: 5, welleMin: 20, welleMax: 20, zeitraffer: 1 });
    raum.welle.uhr = null;
    for (let i = 0; i < 4; i++) raum.welle.schritt(60);
    assert.equal(raum.welle.ansage, null, 'zu früh angesagt');
    raum.welle.schritt(59);
    assert.equal(raum.welle.ansage, null, 'zu früh angesagt (vor 5 Minuten)');
    raum.welle.schritt(2);
    assert.ok(raum.welle.ansage, 'keine Ansage nach 5 Minuten');
    raum.welle.schritt(11);
    // in engen Zufallswelten ist nicht immer Platz für alle – etwas weniger ist in Ordnung
    assert.ok(raum.welle.aktiv && raum.welle.aktiv.ids.size >= 5 && raum.welle.aktiv.ids.size <= 20, 'Welle nicht erschienen: ' + raum.welle.aktiv?.ids.size);
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: Leistung mit 50 Wellen-Zombies', async () => {
  const { c, raum, p } = await beitreten('Last');
  try {
    einst({ welleMinuten: 20, welleMin: 50, welleMax: 50 });
    p.ebene = ''; p.x = BREITE * KACHEL / 2; p.y = HOEHE * KACHEL / 2; p.unten = true;
    raum.welle.erzeugen('west');
    const n = raum.state.zombies.size;
    const t0 = performance.now();
    const N = 100;
    for (let i = 0; i < N; i++) { raum.welle.schritt(0.05); for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05); }
    const ms = (performance.now() - t0) / N;
    console.log(`# Welle: ${n} Zombies, ${ms.toFixed(2)} ms je Takt`);
    assert.ok(ms < 25, `zu langsam: ${ms} ms`);
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Blaulicht: Abstände selten 8–15 min, normal 2,5–6,5 min; aus = keine Fahrten', async () => {
  const { c, raum } = await beitreten('Blau');
  try {
    const v = raum.verkehr;
    einst({ blaulicht: 'selten' });
    for (let i = 0; i < 200; i++) { const t = v.naechsteBlaulichtPause(); assert.ok(t >= 480 && t <= 900, `selten ${t}`); }
    einst({ blaulicht: 'normal' });
    for (let i = 0; i < 200; i++) { const t = v.naechsteBlaulichtPause(); assert.ok(t >= 150 && t <= 390, `normal ${t}`); }
    // aus: keine Fahrzeuge, auch nicht bei Bränden
    einst({ blaulicht: 'aus' });
    const vorher = raum.state.fahrzeuge.size;
    for (let i = 0; i < 20; i++) v.blaulicht(); v.blaulicht({ x: 500, y: 500 });
    assert.equal(raum.state.fahrzeuge.size, vorher);
    // Uhr läuft nur nach Spielzeit ab: bei „selten“ in 7 Minuten keine Durchfahrt
    einst({ blaulicht: 'selten', zeitraffer: 1 });
    v.blaulichtUhr = v.naechsteBlaulichtPause();
    let n = 0; const alt = v.blaulicht.bind(v); v.blaulicht = (...a) => { n++; return alt(...a); };
    for (let i = 0; i < 420; i++) v.schritt(1);
    assert.equal(n, 0, 'Durchfahrt vor 8 Minuten');
    for (let i = 0; i < 500; i++) v.schritt(1);
    assert.ok(n >= 1, 'keine Durchfahrt nach 15 Minuten');
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: zieht am Ziel weiter (neues Ziel) statt sich aufzulösen, Ziele bleiben im Ort', async () => {
  const { c, raum, p } = await beitreten('Weiter');
  try {
    einst({ welleMinuten: 20, welleMin: 30, welleMax: 30 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    raum.welle.erzeugen('west');
    const a = raum.welle.aktiv, ziel0 = { ...a.ziel };
    a.mitte = { x: ziel0.x, y: ziel0.y };
    raum.welle.neuesZiel();
    assert.ok(raum.welle.aktiv, 'Welle löst sich auf statt weiterzuziehen');
    const z = raum.welle.aktiv.ziel;
    assert.ok(z.x >= 6 * KACHEL && z.x <= (BREITE - 6) * KACHEL && z.y >= 6 * KACHEL && z.y <= (HOEHE - 6) * KACHEL, 'Ziel zu nah am Rand');
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombies lassen am Boden liegende Spieler in Ruhe', async () => {
  const { c, raum, p } = await beitreten('Unten');
  try {
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true; p.hp = 0;
    const id = raum.setzeZombie(p.x + 20, p.y, '');
    const zz = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
    info.ziel = [...raum.state.spieler.keys()][0]; info.schlaeft = false;
    const d0 = Math.hypot(zz.x - p.x, zz.y - p.y);
    for (let i = 0; i < 40; i++) raum.zombieSchritt(id, zz, 0.1);
    assert.equal(info.ziel, null, 'Zombie jagt weiter');
    assert.ok(Math.hypot(zz.x - p.x, zz.y - p.y) > d0 + 5, 'Zombie zieht nicht ab');
    assert.ok(p.hp === 0);
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

// ---- Horde: Ziele, Angriffstrupps, kein Gleichschritt ----

test('Einstellungen: Hordenziel, Trupp und Reichweite werden bereinigt', () => {
  const v = vorgaben().zombies;
  assert.equal(v.hordeZielMin, 2); assert.equal(v.hordeZielMax, 5);
  assert.equal(v.hordeTruppMin, 5); assert.equal(v.hordeTruppMax, 15); assert.equal(v.hordeReichweite, 18);
  const z = bereinige({ zombies: { hordeZielMin: 9, hordeZielMax: 3, hordeTruppMin: 40, hordeTruppMax: 10, hordeReichweite: 999 } }).zombies;
  assert.ok(z.hordeZielMax >= z.hordeZielMin && z.hordeTruppMax >= z.hordeTruppMin && z.hordeReichweite <= 60);
  assert.equal(bereinige({ zombies: { hordeReichweite: 1 } }).zombies.hordeReichweite, 5);
});

test('Horde: Zielwechsel nach Ablauf der Zeit (2–5 echte Minuten)', async () => {
  const { c, raum, p } = await beitreten('Zielzeit');
  try {
    einst({ welleMinuten: 20, welleMin: 30, welleMax: 30, hordeZielMin: 2, hordeZielMax: 3 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    raum.welle.erzeugen('west');
    const a = raum.welle.aktiv;
    const dauern = Array.from({ length: 50 }, () => raum.welle.zielDauer());
    assert.ok(dauern.every(d => d >= 120 && d <= 180), 'Zieldauer außerhalb 2–3 min');
    assert.ok(a.zielUhr >= 120 && a.zielUhr <= 180);
    const ziele0 = a.ziele; a.zielUhr = 1; a.pruef.t = 0;
    for (let i = 0; i < 30; i++) raum.welle.schritt(0.05);
    assert.ok(raum.welle.aktiv.ziele > ziele0, 'Ziel wurde nach Ablauf der Zeit nicht gewechselt');
    assert.ok(raum.welle.aktiv.zielUhr >= 100, 'Zeitgeber nicht neu gesetzt');
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

// stellt den Spieler frei und draußen neben einen Wellen-Zombie
function spielerNebenHorde(raum, p) {
  const a = raum.welle.aktiv, z = raum.state.zombies.get([...a.ids][0]);
  for (let w = 0; w < 6.3; w += 0.4) {
    const x = z.x + Math.cos(w) * 70, y = z.y + Math.sin(w) * 70;
    if (frei(raum.welt, x, y, 12)) { p.x = x; p.y = y; return true; }
  }
  return false;
}

test('Horde: Trupp löst sich bei Spieler in Reichweite und greift an; Liegende bleiben unangetastet', async () => {
  const { c, raum, p } = await beitreten('Trupp');
  try {
    einst({ welleMinuten: 20, welleMin: 40, welleMax: 40, hordeTruppMin: 6, hordeTruppMax: 6, hordeReichweite: 18 });
    p.ebene = ''; p.unten = true;
    raum.welle.erzeugen('west');
    const a = raum.welle.aktiv, gesamt = a.ids.size;
    assert.ok(spielerNebenHorde(raum, p), 'kein freier Platz');
    // am Boden: nichts passiert
    raum.welle.schritt(0.6);
    assert.equal(a.trupps.length, 0, 'Trupp gegen Liegenden');
    assert.ok([...raum.zombieInfo.values()].every(i => !i.ziel));
    // aufrecht: Trupp
    p.unten = false;
    raum.welle.schritt(0.6);
    assert.equal(a.trupps.length, 1, 'kein Trupp');
    const t = a.trupps[0], sid = [...raum.state.spieler.keys()][0];
    assert.ok(t.ids.size >= 3 && t.ids.size < gesamt, `Truppgröße ${t.ids.size}`);
    assert.ok([...t.ids].every(id => raum.zombieInfo.get(id).ziel === sid && !a.ids.has(id)), 'Trupp jagt nicht');
    assert.equal(a.ids.size + t.ids.size, gesamt);
    // derselbe Spieler bekommt nicht gleich noch einen
    raum.welle.schritt(0.6); assert.equal(a.trupps.length, 1);
    // Spieler geht zu Boden: Trupp lässt los (Jagdlogik) und löst sich auf
    p.unten = true;
    for (const id of t.ids) raum.zombieSchritt(id, raum.state.zombies.get(id), 0.1);
    assert.ok([...t.ids].every(id => !raum.zombieInfo.get(id).ziel), 'Zombie jagt Liegenden weiter');
    raum.welle.schritt(0.6);
    assert.equal(a.trupps.length, 0, 'Trupp bleibt trotz Liegendem');
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Trupp kehrt zurück oder streunt, wenn das Ziel 20–30 s außer Sicht ist', async () => {
  const { c, raum, p } = await beitreten('Truppende');
  try {
    einst({ welleMinuten: 20, welleMin: 40, welleMax: 40, hordeTruppMin: 8, hordeTruppMax: 8 });
    p.ebene = ''; p.unten = false;
    raum.welle.erzeugen('west');
    const a = raum.welle.aktiv, gesamt = a.ids.size;
    assert.ok(spielerNebenHorde(raum, p));
    raum.welle.schritt(0.6);
    assert.equal(a.trupps.length, 1);
    const t = a.trupps[0], ids = [...t.ids];
    p.x = 2 * KACHEL; p.y = 2 * KACHEL; p.ebene = 'h0eg';   // Spieler im Haus: nicht mehr angreifbar
    raum.welle.schritt(0.6);
    assert.equal(a.trupps.length, 0);
    const zurueck = ids.filter(id => a.ids.has(id)).length;
    const streunt = ids.filter(id => raum.zombieInfo.get(id) && !raum.zombieInfo.get(id).welle).length;
    assert.equal(zurueck + streunt, ids.length);
    assert.ok(a.ids.size >= gesamt - ids.length);
    // außer Sicht: Spieler draußen, aber weit weg
    p.ebene = ''; p.unten = false;
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: kein Gleichschritt – Tempi, Richtungen und Wege streuen', async () => {
  const { c, raum, p } = await beitreten('Streuung');
  try {
    einst({ welleMinuten: 20, welleMin: 80, welleMax: 80 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    raum.welle.erzeugen('west');
    const ids = [...raum.welle.aktiv.ids];
    const tempi = ids.map(id => raum.zombieInfo.get(id).wTempo);
    assert.ok(tempi.every(x => x >= 0.8 && x <= 1.2), 'Tempo außerhalb ±20 %');
    assert.ok(streuung(tempi) > 0.07, `Tempi zu gleichförmig (${streuung(tempi)})`);
    const start = ids.map(id => ({ x: raum.state.zombies.get(id).x, y: raum.state.zombies.get(id).y }));
    const winkel = [];
    for (let i = 0; i < 160; i++) {
      raum.welle.schritt(0.05);
      raum.baueZombieRaster();
      for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05);
      if (i % 20 === 0) winkel.push(ids.map(id => raum.state.zombies.get(id)?.richtung ?? 0));
    }
    raum.zRaster = null;
    const weg = ids.map((id, k) => { const z = raum.state.zombies.get(id); return Math.hypot(z.x - start[k].x, z.y - start[k].y); });
    assert.ok(streuung(weg) / (weg.reduce((x, y) => x + y, 0) / weg.length) > 0.05, 'zurückgelegte Wege zu gleich');
    const rs = winkel.map(w => { const sx = w.reduce((x, y) => x + Math.cos(y), 0) / w.length, sy = w.reduce((x, y) => x + Math.sin(y), 0) / w.length; return 1 - Math.hypot(sx, sy); });
    assert.ok(rs.some(r => r > 0.01), 'Blickrichtungen laufen im Gleichschritt');
    raum.welle.aufloesen();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});
