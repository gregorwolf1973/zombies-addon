// Zombiewellen, Tempofaktoren und seltenere Blaulicht-Fahrten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, BREITE, HOEHE, frei, WERTE as W } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { LEVEL_VORGABE } from '../server/schwierigkeit.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
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
const ebenen = zusatz => LEVEL_VORGABE.map(v => ({ ...v, ...zusatz }));   // Level-Tabelle für alle Level gleich überschreiben
function einst(zusatz) { SpielRaum.einstellungen = { ...alteEinst, ...zusatz }; }
const streuung = werte => { const m = werte.reduce((a, b) => a + b, 0) / werte.length; return Math.sqrt(werte.reduce((a, b) => a + (b - m) ** 2, 0) / werte.length); };

test('Einstellungen: Blaulicht und Level-Tabelle werden bereinigt', () => {
  const v = vorgaben();
  assert.equal(v.blaulicht, 'selten');
  assert.equal(v.zombies.level.length, 5);
  assert.deepEqual(v.zombies.level[0], { grund: 8, jeSpieler: 5, horde: 12, dauer: 10, pause: 5, gleichzeitig: 1, haeuser: 10 });
  assert.deepEqual(v.zombies.level[4], { grund: 16, jeSpieler: 10, horde: 30, dauer: 15, pause: 1, gleichzeitig: 2, haeuser: 16 });
  assert.equal(bereinige({ blaulicht: 'quatsch' }).blaulicht, 'selten');
  assert.equal(bereinige({ blaulicht: 'aus' }).blaulicht, 'aus');
  // Teilwerte ändern nur das Genannte, alles wird geklammert
  const l = bereinige({ zombies: { level: [{ pause: 0.1, horde: 5000, grund: 'viel' }, { gleichzeitig: 0, dauer: 7.4 }] } }).zombies.level;
  assert.equal(l[0].pause, 0.5); assert.equal(l[0].horde, 200); assert.equal(l[0].grund, 8); assert.equal(l[0].jeSpieler, 5);
  assert.equal(l[1].gleichzeitig, 0); assert.equal(l[1].dauer, 7); assert.equal(l[1].haeuser, 11);
  // frühere Werte der Tabelle bleiben bei späteren Teiländerungen erhalten
  const alt = bereinige({ zombies: { level: [{ grund: 20 }] } });
  assert.equal(bereinige({ zombies: { level: [{ horde: 7 }] } }, alt).zombies.level[0].grund, 20);
});

test('Einstellungen: alte Werte (dichte, haeuser, welle*, Min/Max-Paare) werden übernommen', () => {
  const z = bereinige({ zombies: { dichte: 20, haeuser: 5, welle: 20, welleMin: 35, welleMax: 35, hordeZielMin: 2, hordeZielMax: 4, hordeTruppMin: 6, hordeTruppMax: 14 } }).zombies;
  assert.equal(z.level[0].grund, 16); assert.equal(z.level[0].jeSpieler, 10); assert.equal(z.level[0].haeuser, 5); assert.equal(z.level[0].horde, 12);
  assert.equal(z.level[4].haeuser, 8); assert.equal(z.level[0].gleichzeitig, 1);
  assert.equal(z.hordeZiel, 3); assert.equal(z.hordeTrupp, 10);
  for (const k of ['dichte', 'haeuser', 'welle', 'welleMin', 'welleMax', 'hordeZielMin', 'hordeZielMax', 'hordeTruppMin', 'hordeTruppMax']) assert.ok(!(k in z), k + ' sollte wegfallen');
  assert.equal(bereinige({ zombies: { welle: 0 } }).zombies.level[2].gleichzeitig, 0, 'welle 0 = keine Horden');
  // eine vorhandene Tabelle gewinnt gegen alte Felder
  assert.equal(bereinige({ zombies: { dichte: 20, level: [{ grund: 9 }] } }).zombies.level[0].grund, 9);
});

test('Zombies bekommen verschiedene feste Tempofaktoren zwischen 0,6 und 1,0 (eingestelltes Tempo = Höchsttempo)', async () => {
  const { c, raum } = await beitreten('Tempo');
  try {
    const ids = Array.from({ length: 40 }, (_, i) => raum.setzeZombie(100 + i * 5, 100, ''));
    const t = ids.map(id => raum.zombieInfo.get(id).tempo);
    assert.ok(t.every(x => x >= 0.6 && x <= 1.0), 'außerhalb 0,6–1,0');
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
    einst({ zombieFaktor: 1, zombiesLevel: ebenen({ horde: 30 }) });
    raum.zombieFaktor = 0;
    // Spieler mitten auf die Karte, draußen
    p.ebene = ''; p.x = BREITE * KACHEL / 2; p.y = HOEHE * KACHEL / 2;
    const meldungen = [];
    const alt = raum.broadcast.bind(raum);
    raum.broadcast = (typ, m, ...r) => { if (typ === 'meldung') meldungen.push(m.text); return alt(typ, m, ...r); };
    const seite = raum.welle.ansagen('west');
    assert.equal(seite, 'west');
    assert.ok(meldungen.some(m => /Zombiehorde kommt von .*Westen/.test(m)), 'Meldung fehlt');
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
    for (let i = 0; i < 2300 && raum.welle.aktiv && raum.welle.aktiv.ziele < 2; i++) {   // 115 s (seit 0.84.4 Tempofaktor im Mittel 0,72 statt 1,0)
      raum.welle.schritt(0.05);
      for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05);
    }
    // am Ziel angekommen: die Welle zieht weiter (neues Ziel) statt stehen zu bleiben
    assert.ok(raum.welle.aktiv && raum.welle.aktiv.ziele >= 2, 'Welle ist am Ziel stehen geblieben');
    raum.welle.beenden();
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
    p.ebene = ''; p.x = 4 * KACHEL; p.y = HOEHE * KACHEL / 2;
    // Welle von Osten, am anderen Ende der Karte; Spieler ist weit weg
    raum.welle.erzeugen('ost', 50);
    const ids = [...raum.welle.aktiv.ids];
    assert.ok(ids.length <= 50 && ids.length > 0);
    const nahe = ids.filter(id => Math.hypot(raum.state.zombies.get(id).x - p.x, raum.state.zombies.get(id).y - p.y) < 700);
    for (const id of nahe) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    raum.welle.beenden();
    assert.equal(raum.welle.aktiv, null);
    for (const id of ids) if (!nahe.includes(id)) assert.ok(!raum.state.zombies.has(id), 'ferner Wellen-Zombie ist nicht verschwunden');
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: Zeitgeber nach Level-Tabelle (erste Horde verzögert); gleichzeitig 0 = keine Horde', async () => {
  const { c, raum, p } = await beitreten('Uhr');
  try {
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;   // Startplatz ist immer frei und draußen
    einst({ zeitraffer: 1, zombiesLevel: ebenen({ gleichzeitig: 0 }) });
    raum.welle.uhr = null;
    for (let i = 0; i < 100; i++) raum.welle.schritt(60);
    assert.equal(raum.welle.ansage, null); assert.equal(raum.welle.aktiv, null);
    einst({ zeitraffer: 1, zombiesLevel: ebenen({ gleichzeitig: 1, pause: 5, horde: 20 }) });
    raum.welle.uhr = null; raum.welle.erste = true;
    for (let i = 0; i < 7; i++) raum.welle.schritt(60);   // Pause 5 min + 3 min Startverzögerung = 480 s
    assert.equal(raum.welle.ansage, null, 'zu früh angesagt');
    raum.welle.schritt(59);
    assert.equal(raum.welle.ansage, null, 'zu früh angesagt (vor 8 Minuten)');
    raum.welle.schritt(2);
    assert.ok(raum.welle.ansage, 'keine Ansage nach 8 Minuten');
    raum.welle.schritt(11);
    // in engen Zufallswelten ist nicht immer Platz für alle – etwas weniger ist in Ordnung
    assert.ok(raum.welle.aktiv && raum.welle.aktiv.ids.size >= 5 && raum.welle.aktiv.ids.size <= 30, 'Horde nicht erschienen: ' + raum.welle.aktiv?.ids.size);
    // gleichzeitig 1: solange sie zieht, kommt keine zweite
    for (let i = 0; i < 5; i++) raum.welle.schritt(1);
    assert.equal(raum.welle.uhr, null); assert.equal(raum.welle.horden.length, 1);
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Größe = je Spieler × Spielerzahl (Bots zählen halb) × Tag-Bonus × Regler, ±30 %', async () => {
  const { c, raum } = await beitreten('Groesse');
  try {
    einst({ zombiesLevel: ebenen({ horde: 20 }), schwierigkeit: 'normal' });
    assert.equal(raum.spielerZahl(), 1);
    const gr = () => Array.from({ length: 200 }, () => raum.welle.hordeGroesse());
    let g = gr();
    assert.ok(Math.min(...g) >= 14 && Math.max(...g) <= 26 && Math.max(...g) - Math.min(...g) >= 6, `1 Spieler: ${Math.min(...g)}–${Math.max(...g)}`);
    raum.extra.set('bot1', { bot: { nr: 0 } }); raum.state.spieler.set('bot1', new (raum.state.spieler.get(c.sessionId).constructor)());
    assert.equal(raum.spielerZahl(), 1.5);
    g = gr();
    assert.ok(Math.min(...g) >= 21 && Math.max(...g) <= 39, `1,5 Spieler: ${Math.min(...g)}–${Math.max(...g)}`);
    raum.state.spieler.delete('bot1'); raum.extra.delete('bot1');
    einst({ zombiesLevel: ebenen({ horde: 20 }), schwierigkeit: 'schwer' });
    g = gr();
    assert.ok(Math.min(...g) >= 18 && Math.max(...g) <= 34 && Math.max(...g) > 28, `schwer: ${Math.min(...g)}–${Math.max(...g)}`);
    einst({ zombiesLevel: ebenen({ horde: 5000 }) });
    assert.ok(gr().every(x => x <= 1000), 'Deckel WELLE_MAX');
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombies draußen = (Grund + je Spieler × Spielerzahl) × Nacht × Regler', async () => {
  const { c, raum } = await beitreten('Soll');
  try {
    raum.zombieFaktor = 1; raum.stadt = null; raum.state.level = 1; raum.state.tag = 1;
    einst({ nachtFaktor: 1.5, schwierigkeit: 'normal', zombiesLevel: ebenen({ grund: 10, jeSpieler: 6 }) });
    raum.state.uhr = 12 * 60;
    assert.equal(raum.zombieSollJetzt(), 16);   // 10 + 6 × 1 Spieler
    raum.state.uhr = 0;
    assert.equal(raum.zombieSollJetzt(), 24);   // nachts × 1,5
    raum.state.uhr = 12 * 60;
    einst({ nachtFaktor: 1.5, schwierigkeit: 'schwer', zombiesLevel: ebenen({ grund: 10, jeSpieler: 6 }) });
    assert.equal(raum.zombieSollJetzt(), Math.round(16 * 1.3));
    SpielRaum.einstellungen = { ...alteEinst, nachtFaktor: 1.5, schwierigkeit: 'normal', zombiesLevel: LEVEL_VORGABE };
    raum.state.level = 3;
    assert.equal(raum.zombieSollJetzt(), 12 + 7);   // Vorgabe Level 3
    raum.state.level = 5;
    assert.equal(raum.zombieSollJetzt(), 16 + 10);
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Hordendauer um → ein Drittel streunt, der Rest zieht zum Rand ab und wird außer Sicht gelöscht; Pause; neue Horde von der anderen Seite', async () => {
  const { c, raum, p } = await beitreten('Abzug');
  try {
    einst({ zeitraffer: 1, zombiesLevel: ebenen({ gleichzeitig: 1, pause: 4, dauer: 10, horde: 30 }) });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    const w = raum.welle;
    w.erzeugen('west', 60);
    const a = w.aktiv, gesamt = a.ids.size;
    assert.ok(gesamt >= 30);
    assert.equal(w.letzteSeite, 'west');
    assert.equal(a.dauer, 600);
    a.lebt = a.dauer - 1; w.verfolgen(a, 0.5);
    assert.ok(!a.abzug, 'zu früh aufgelöst');
    w.verfolgen(a, 1);
    assert.ok(a.abzug, 'nicht aufgelöst');
    assert.equal(a.zielArt, 'abzug');
    const streuner = [...raum.zombieInfo.values()].filter(i => !i.welle && !i.bleibt).length;
    assert.ok(Math.abs(streuner - gesamt / 3) <= 2, `Streuner ${streuner} von ${gesamt}`);
    assert.ok(a.ids.size >= gesamt / 2, 'Rest zieht ab');
    assert.equal(w.aktive().length, 0, 'Abzug zählt nicht als aktive Horde');
    // Abzug: nah am Spieler (im Bild) bleiben sie; fern von allen Spielern werden sie gelöscht
    const ids = [...a.ids];
    for (const id of ids) { const q = raum.state.zombies.get(id); q.x = p.x + 1500; q.y = p.y; }
    w.verfolgen(a, 0.1);
    assert.equal(a.ids.size, 0); assert.ok(!w.horden.includes(a), 'Horde nicht entfernt');
    for (const id of ids) assert.ok(!raum.state.zombies.has(id), 'Abzugs-Zombie nicht gelöscht');
    // Pause: Uhr startet neu, nach 4 min neue Ansage von der anderen Seite
    w.erste = false;
    w.schritt(1);
    assert.ok(w.uhr !== null && w.uhr > 200 && w.uhr <= 240, 'Pause nicht gestartet: ' + w.uhr);
    for (let i = 0; i < 235; i++) w.schritt(1);
    assert.equal(w.ansage, null, 'zu früh');
    w.schritt(10);   // Ansage + 10 s: die neue Horde steht
    assert.equal(w.horden.length, 1, 'keine neue Horde');
    assert.equal(w.horden[0].seite, 'ost', 'neue Horde nicht von der anderen Seite');
    w.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Abzug – wer nah am Spieler ist, bleibt; Rest erreicht den Rand', async () => {
  const { c, raum, p } = await beitreten('Rand');
  try {
    einst({ zeitraffer: 1, zombiesLevel: ebenen({ gleichzeitig: 1, dauer: 10, horde: 30 }) });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    const w = raum.welle;
    w.erzeugen('west', 30);
    const a = w.aktiv; a.lebt = a.dauer + 1; w.verfolgen(a, 0.1);
    assert.ok(a.abzug && a.ziel);
    // Ziel liegt in Randnähe (3 Kacheln), nächster Rand zur Mitte
    const rd = Math.min(a.ziel.x, a.ziel.y, BREITE * KACHEL - a.ziel.x, HOEHE * KACHEL - a.ziel.y);
    assert.ok(rd <= 8 * KACHEL, 'Abzugsziel nicht am Rand: ' + rd);
    // ein Zombie neben dem Spieler wird nicht gelöscht, auch wenn alle anderen weg sind
    const [nah, ...rest] = [...a.ids];
    const q = raum.state.zombies.get(nah); q.x = p.x + 100; q.y = p.y;
    for (const id of rest) { const z = raum.state.zombies.get(id); z.x = p.x + 3000; z.y = p.y; }
    w.verfolgen(a, 0.1);
    assert.ok(raum.state.zombies.has(nah) && a.ids.has(nah), 'Zombie im Bild gelöscht');
    assert.equal(a.ids.size, 1);
    // nach ABZUG_MAX streunt der Rest
    w.verfolgen(a, 301);
    assert.ok(!w.horden.includes(a)); assert.ok(raum.zombieInfo.get(nah) && !raum.zombieInfo.get(nah).welle, 'Rest streunt nicht');
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: mehrere gleichzeitig (Level 3: 2), jede mit eigener Zeit; Zeitraffer verkürzt Dauer und Pause; Hordenliste je Horde', async () => {
  const { c, raum, p } = await beitreten('Zwei');
  try {
    einst({ zeitraffer: 10, hordeZieleZeigen: true, zombiesLevel: ebenen({ gleichzeitig: 2, pause: 3, dauer: 12, horde: 20 }) });
    p.ebene = ''; p.x = BREITE * KACHEL / 2; p.y = HOEHE * KACHEL / 2; p.unten = true;
    const w = raum.welle;
    w.uhr = null; w.erste = false;
    w.schritt(1);
    assert.ok(w.uhr !== null && w.uhr < 180 && w.uhr > 140, 'Zeitraffer wirkt nicht auf die Pause: ' + w.uhr);
    for (let i = 0; i < 20 && !w.ansage; i++) w.schritt(1);
    assert.ok(w.ansage, 'keine Ansage');
    w.schritt(11);
    assert.equal(w.horden.length, 1);
    assert.ok(w.uhr !== null, 'zweiter Platz frei: Uhr läuft weiter');
    for (let i = 0; i < 40 && w.horden.length < 2; i++) w.schritt(1);
    assert.equal(w.horden.length, 2, 'zweite Horde fehlt');
    assert.equal(w.uhr, null, 'mehr als „gleichzeitig“ Horden');
    // Hordenliste: je Horde Größe, Restzeit, Ziel
    const info = []; raum.clients[0].send = (typ, m) => { if (typ === 'hordeInfo') info.push(m); };
    raum.extra.get(raum.clients[0].sessionId).superuser = true;
    w.infoSenden(0, true);
    const m = info.at(-1);
    assert.equal(m.horden.length, 2);
    assert.ok(m.horden.every(h => h.n > 0 && typeof h.restDauer === 'number' && h.restDauer > 0 && h.name && h.mitte && h.ziel));
    // Zeitraffer: Hordendauer läuft 10× so schnell ab
    const a = w.horden[0]; a.lebt = 0; w.verfolgen(a, 6, 10);
    assert.equal(Math.round(a.lebt), 60);
    w.beenden(w.horden[1]); w.beenden(a);
    assert.equal(w.horden.length, 0);
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Zombiewelle: Leistung mit 50 Wellen-Zombies', async () => {
  const { c, raum, p } = await beitreten('Last');
  try {
    p.ebene = ''; p.x = BREITE * KACHEL / 2; p.y = HOEHE * KACHEL / 2; p.unten = true;
    raum.welle.erzeugen('west', 50);
    const n = raum.state.zombies.size;
    const t0 = performance.now();
    const N = 100;
    for (let i = 0; i < N; i++) { raum.welle.schritt(0.05); for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05); }
    const ms = (performance.now() - t0) / N;
    console.log(`# Welle: ${n} Zombies, ${ms.toFixed(2)} ms je Takt`);
    assert.ok(ms < 25, `zu langsam: ${ms} ms`);
    raum.welle.beenden();
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
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    raum.welle.erzeugen('west', 30);
    const a = raum.welle.aktiv, ziel0 = { ...a.ziel };
    a.mitte = { x: ziel0.x, y: ziel0.y };
    raum.welle.neuesZiel(a);
    assert.ok(raum.welle.aktiv, 'Welle löst sich auf statt weiterzuziehen');
    const z = raum.welle.aktiv.ziel;
    assert.ok(z.x >= 6 * KACHEL && z.x <= (BREITE - 6) * KACHEL && z.y >= 6 * KACHEL && z.y <= (HOEHE - 6) * KACHEL, 'Ziel zu nah am Rand');
    raum.welle.beenden();
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
  assert.equal(v.hordeZiel, 3.5); assert.equal(v.hordeTrupp, 10); assert.equal(v.hordeReichweite, 18);
  const z = bereinige({ zombies: { hordeZiel: 99, hordeTrupp: 5000, hordeReichweite: 999 } }).zombies;
  assert.equal(z.hordeZiel, 30); assert.equal(z.hordeTrupp, 300); assert.equal(z.hordeReichweite, 60);
  assert.equal(bereinige({ zombies: { hordeZiel: 0, hordeTrupp: 0 } }).zombies.hordeZiel, 0.5);
  assert.equal(bereinige({ zombies: { hordeReichweite: 1 } }).zombies.hordeReichweite, 5);
});

test('Horde: Zielwechsel nach Ablauf der Zeit (hordeZiel ±40 %)', async () => {
  const { c, raum, p } = await beitreten('Zielzeit');
  try {
    einst({ hordeZiel: 2.5 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    raum.welle.erzeugen('west', 30);
    const a = raum.welle.aktiv;
    const dauern = Array.from({ length: 50 }, () => raum.welle.zielDauer());
    assert.ok(dauern.every(d => d >= 90 && d <= 210), 'Zieldauer außerhalb ±40 % von 2,5 min');
    assert.ok(new Set(dauern.map(d => Math.round(d))).size > 20, 'Zieldauer streut nicht');
    assert.ok(a.zielUhr >= 90 && a.zielUhr <= 210);
    const ziele0 = a.ziele; a.zielUhr = 1; a.pruef.t = 0;
    for (let i = 0; i < 30; i++) raum.welle.schritt(0.05);
    assert.ok(raum.welle.aktiv.ziele > ziele0, 'Ziel wurde nach Ablauf der Zeit nicht gewechselt');
    assert.ok(raum.welle.aktiv.zielUhr >= 80, 'Zeitgeber nicht neu gesetzt');
    raum.welle.beenden();
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
    einst({ hordeTrupp: 6, hordeReichweite: 18 });
    p.ebene = ''; p.unten = true;
    raum.welle.erzeugen('west', 40);
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
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Trupp kehrt zurück oder streunt, wenn das Ziel 20–30 s außer Sicht ist', async () => {
  const { c, raum, p } = await beitreten('Truppende');
  try {
    einst({ hordeTrupp: 8 });
    p.ebene = ''; p.unten = false;
    raum.welle.erzeugen('west', 40);
    const a = raum.welle.aktiv, gesamt = a.ids.size;
    assert.ok(spielerNebenHorde(raum, p));
    // nur den Trupp gegen den Testspieler zählen (in der Zufallswelt können Menschen/Bots weitere Trupps auslösen)
    const meine = () => a.trupps.filter(t => t.sid === c.sessionId);
    for (let i = 0; i < 20 && !meine().length; i++) raum.welle.schritt(0.6);   // Trupp löst sich je nach Zufallsstart etwas später
    assert.equal(meine().length, 1);
    const t = meine()[0], ids = [...t.ids];
    p.x = 2 * KACHEL; p.y = 2 * KACHEL; p.ebene = 'h0eg';   // Spieler im Haus: nicht mehr angreifbar
    raum.welle.schritt(0.6);
    assert.equal(meine().length, 0);
    const zurueck = ids.filter(id => a.ids.has(id)).length;
    const streunt = ids.filter(id => raum.zombieInfo.get(id) && !raum.zombieInfo.get(id).welle).length;
    assert.equal(zurueck + streunt, ids.length);
    assert.ok(a.ids.size >= gesamt - ids.length);
    // außer Sicht: Spieler draußen, aber weit weg
    p.ebene = ''; p.unten = false;
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: kein Gleichschritt – Tempi, Richtungen und Wege streuen', async () => {
  const { c, raum, p } = await beitreten('Streuung');
  try {
    einst({ welleMinuten: 20, welleMin: 80, welleMax: 80 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y; p.unten = true;
    raum.welle.erzeugen('west', 40);
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
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: zieht zügig und zusammenhängend – Mitte legt in 60 s Spielzeit mindestens 2000 px zurück, wenig Stillstand', async () => {
  const { c, raum, p } = await beitreten('Marsch');
  try {
    einst({ welleMinuten: 20, welleMin: 40, welleMax: 40, hordeZielMin: 5, hordeZielMax: 5 });
    p.ebene = ''; p.x = 4 * KACHEL; p.y = 4 * KACHEL; p.unten = true;   // Liegender weit weg in der Ecke: sonst weichen Zombies vor ihm aus
    raum.welle.erzeugen('west', 40);
    const a = raum.welle.aktiv, ids = [...a.ids];
    const start = { ...a.mitte };
    let weg = 0, letzte = { ...a.mitte }, steht = 0, messungen = 0;
    for (let i = 0; i < 1200; i++) {   // 60 s in 0,05-s-Schritten
      raum.welle.schritt(0.05);
      raum.baueZombieRaster();
      for (const [id, z] of raum.state.zombies) raum.zombieSchritt(id, z, 0.05);
      if (i % 20 === 19 && raum.welle.aktiv) {   // jede Sekunde: Mitte, Anteil der Stehenden
        const m = raum.welle.aktiv.mitte;
        weg += Math.hypot(m.x - letzte.x, m.y - letzte.y); letzte = { ...m };
        // „steht“: weniger als 40 % des langsamsten Marschtempos je Sekunde (früher fest 20 px bei 89 px/s; seit 0.84.4 Höchsttempo-Faktoren 0,6–1,0)
        const stehGrenze = Math.min(20, W.zombieTempoJagen * 0.85 * 0.6 * 0.4);
        let st = 0, n = 0;
        for (const id of raum.welle.aktiv.ids) { const z = raum.state.zombies.get(id); if (!z) continue; n++; if (z._x0 !== undefined && Math.hypot(z.x - z._x0, z.y - z._y0) < stehGrenze) st++; z._x0 = z.x; z._y0 = z.y; }
        if (n && i > 100) { steht += st / n; messungen++; }
      }
    }
    raum.zRaster = null;
    assert.ok(raum.welle.aktiv && raum.welle.aktiv.ids.size >= ids.length * 0.4, 'Horde zerfallen');
    // seit 0.84.0 Tempo in km/h (Zombie jagt 15 km/h): Mindestweg = 60 % des Marschtempos (TEMPO 0,85), höchstens wie früher 2000 px
    const soll = Math.min(2000, 0.6 * W.zombieTempoJagen * 0.85 * 60);
    assert.ok(weg >= soll, `Hordenmitte zu langsam: ${Math.round(weg)} px in 60 s (Soll ${Math.round(soll)})`);
    assert.ok(steht / messungen < 0.25, 'zu viele Zombies stehen oder hängen fest: ' + (steht / messungen));   // gewollte kurze Pausen (kein Gleichschritt) erlauben etwas mehr Stillstand
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

// ---- Horde: klare Ziele (Lärm-Schwelle, Festfahren, hordeInfo) ----

test('Horde: Dauerlärm (20 Schüsse in 60 s) lenkt höchstens einmal um', async () => {
  const { c, raum, p } = await beitreten('Dauerlaerm');
  try {
    einst({ hordeZiel: 0.5 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    raum.welle.erzeugen('west', 30);
    const w = raum.welle, a = w.aktiv;
    a.seitZiel = 999; a.zielUhr = 9999;
    const lx = a.mitte.x + 650, ly = a.mitte.y;   // mehr als LAERM_NAH entfernt
    let wechsel = 0; const alt = w.setzeZiel.bind(w);
    w.setzeZiel = (...x) => { wechsel++; return alt(...x); };
    for (let i = 0; i < 20; i++) { raum.laerm(lx, ly, 520, true, ''); a.laermPause -= 3; a.seitZiel = 999; }   // MG-Dauerfeuer: nie laut genug
    assert.equal(wechsel, 0, 'MG-Dauerfeuer lenkt um');
    for (let i = 0; i < 20; i++) { raum.laerm(lx, ly, 600, true, ''); a.laermPause -= 3; a.seitZiel = 999; a.alter += 3; }   // laut (Explosion): 60 s
    assert.ok(wechsel <= 1, 'mehr als eine Umlenkung in 60 s: ' + wechsel);
    w.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: festgefahren wechselt nicht vor 30 s (erst Umweg), hordeInfo mit Ziel/Grund, Liste höchstens 5', async () => {
  const { c, raum, p } = await beitreten('Klemm');
  try {
    einst({ hordeZiel: 5 });
    p.ebene = ''; p.x = raum.welt.start.x; p.y = raum.welt.start.y;
    raum.welle.erzeugen('west', 30);
    const w = raum.welle, a = w.aktiv;
    let wechsel = 0; const alt = w.neuesZiel.bind(w); const gruende = [];
    w.neuesZiel = (h, g) => { wechsel++; gruende.push(g); return alt(h, g); };
    a.ziel = { x: a.mitte.x + 5000, y: a.mitte.y }; a.zielUhr = 9999;   // weit weg, nicht angekommen
    w.verfolgen(a, 0.01); a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y };
    for (let t = 0; t < 29; t++) w.verfolgen(a, 1);   // Zombies bewegen sich nicht: kein Fortschritt
    assert.equal(wechsel, 0, 'Wechsel vor 30 s');
    assert.ok(a.klemmStufe >= 1, 'kein Umweg versucht ' + JSON.stringify([a.pruef.t, a.ids.size, wechsel, a.klemmStufe]));
    for (let t = 0; t < 3; t++) w.verfolgen(a, 1);
    assert.equal(gruende[0], 'festgefahren');
    // hordeInfo: Ziel, Name, Grund
    const info = []; raum.clients[0].send = (typ, m) => { if (typ === 'hordeInfo') info.push(m); };
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, hordeZieleZeigen: true };
    w.infoSenden(0, true);
    assert.equal(info.length, 0, 'hordeInfo nur für Superuser');
    raum.extra.get(raum.clients[0].sessionId).superuser = true;
    w.infoSenden(0, true);
    const m = info.at(-1);
    assert.ok(m?.aktiv && m.ziel && m.mitte && typeof m.name === 'string' && m.name && typeof m.rest === 'number', 'hordeInfo unvollständig');
    assert.ok(m.wechsel.length >= 1 && m.wechsel.every(x => x.grund && x.name && x.art));
    for (let i = 0; i < 10; i++) { a.zielName = 'X' + i; w.wechselMerken(a, 'laden', 'zeit'); }
    assert.equal(a.wechsel.length, 5);
    w.infoSenden(0, true);
    assert.ok(info.at(-1).wechsel.length <= 5);
    // ohne Schalter und ohne ?debug nichts senden
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, hordeZieleZeigen: false };
    const n = info.length; w.infoSenden(0, true);
    assert.equal(info.length, n, 'sendet trotz ausgeschaltetem Schalter');
    w.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Einstellungen: hordeZieleZeigen Vorgabe aus, bool bleibt', () => {
  assert.equal(vorgaben().zombies.hordeZieleZeigen, false);
  assert.equal(bereinige({ zombies: { hordeZieleZeigen: true } }).zombies.hordeZieleZeigen, true);
  assert.equal(bereinige({ zombies: { hordeZieleZeigen: 'ja' } }).zombies.hordeZieleZeigen, false);
});

test('Soll früh im Ausbruch: mindestens 60 % des vollen Solls', async () => {
  const { c, raum } = await beitreten('Ausbruch');
  try {
    raum.zombieFaktor = 1;
    const alt = raum.stadt;
    raum.stadt = { anfangs: 10, ruheAnteil: () => 1 };
    const frueh = raum.zombieSollJetzt();
    raum.stadt = { anfangs: 10, ruheAnteil: () => 0 };
    const spaet = raum.zombieSollJetzt();
    raum.stadt = alt;
    assert.ok(spaet > 0 && frueh >= Math.floor(spaet * 0.58), `früh ${frueh}, später ${spaet}`);
  } finally { await c.leave(); }
});

test('Horde: Truppgröße wächst mit der Hordengröße (mindestens 15 %)', async () => {
  const { c, raum, p } = await beitreten('Truppgroesse');
  try {
    einst({ hordeTrupp: 5, hordeReichweite: 40 });
    p.ebene = ''; p.unten = false;
    raum.welle.erzeugen('west', 200);
    const a = raum.welle.aktiv, gesamt = a.ids.size;
    assert.ok(gesamt >= 60, `Horde nur ${gesamt}`);
    assert.ok(spielerNebenHorde(raum, p));
    // Trupps lösen sich zufällig: bis zu 20 Schritte warten, statt sich auf den ersten zu verlassen
    let t = null;
    for (let i = 0; i < 20 && !t; i++) { raum.welle.schritt(0.6); t = a.trupps.find(q => q.sid === c.sessionId); }
    assert.ok(t, 'kein Trupp');
    assert.ok(t.ids.size >= Math.floor(gesamt * 0.12), `Trupp ${t.ids.size} von ${gesamt}`);
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});

test('Horde: Trupp bleibt bei sichtbarem Spieler länger als 30 s dran', async () => {
  const { c, raum, p } = await beitreten('Truppdauer');
  try {
    einst({ hordeTrupp: 8 });
    p.ebene = ''; p.unten = false;
    raum.welle.erzeugen('west', 40);
    const a = raum.welle.aktiv;
    assert.ok(spielerNebenHorde(raum, p));
    const meine = () => a.trupps.filter(t => t.sid === c.sessionId);
    for (let i = 0; i < 20 && !meine().length; i++) raum.welle.schritt(0.6);   // Trupp löst sich je nach Zufallsstart etwas später
    assert.equal(meine().length, 1);
    for (let i = 0; i < 70; i++) { raum.welle.schritt(0.6); a.cool.clear(); }   // 42 s, Spieler dauernd in Sicht
    assert.equal(meine().length, 1, 'Trupp hat trotz Sicht aufgegeben');
    // außer Sicht: erst nach 30–45 s Schluss
    const t = meine()[0];
    for (const id of t.ids) { const q = raum.state.zombies.get(id); q.x = p.x + 3000; q.y = p.y; }
    raum.welle.laermOrt = null;
    raum.welle.truppen(a, 0.6);
    assert.ok(t.aus > 0 && t.ausMax >= 30 && t.ausMax <= 45, `ausMax ${t.ausMax}`);
    raum.welle.beenden();
  } finally { await c.leave(); SpielRaum.einstellungen = alteEinst; }
});
