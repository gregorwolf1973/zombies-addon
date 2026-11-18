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
  assert.ok(z.welleMax >= z.welleMin && z.welleMax <= 50);
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
    // links außerhalb des Bildes (ca. 700–900 px, Toleranz für Platzsuche)
    const mx = zs.reduce((a, z) => a + z.x, 0) / zs.length;
    assert.ok(p.x - mx > 500 && p.x - mx < 1000, `Abstand ${p.x - mx}`);
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
    for (let i = 0; i < 1600 && raum.welle.aktiv; i++) {
      raum.welle.schritt(0.05);
      for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05);
    }
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
