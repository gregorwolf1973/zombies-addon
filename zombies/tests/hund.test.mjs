// Begleiter-Hund: Zulaufen (höchstens einer je Spieler, nie bei Bots), Folgen, Teleport, Ablenkung von Zombies,
// Bellen vor der Haustür (ohne Lärm), Wegschicken, Speichern/Laden
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { EREIGNISSE, TON_STANDARD } from '../server/einstellungen.mjs';
import { setzeKartengroesse, frei, KACHEL } from '../client/welt.mjs';
import { hundRichtung, hundBild, hundSkala, SCHULTER_PX } from '../client/hund.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

const warte = ms => new Promise(r => setTimeout(r, ms));
async function beitreten(name, id = crypto.randomBytes(16).toString('hex')) {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: id, seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  const meld = []; c.onMessage('meldung', m => meld.push(m.text));
  return { c, raum, meld, id, sid: c.sessionId };
}
// Raum beruhigen: keine Zombies, keine Streuner, Spiel läuft nicht von selbst weiter
function ruhig(raum) {
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.welle.schritt = () => {};
  raum.state.hunde.clear(); raum.hunde.info.clear();
}
// freie Stelle in der Nähe von (x, y) auf einer Ebene
function freiNahe(raum, x, y, ebene = '') {
  const w = raum.wv(ebene);
  for (let r = 0; r < 200; r += 6) for (let a = 0; a < 6.3; a += 0.5) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (frei(w, px, py, 12)) return { x: px, y: py }; }
  throw new Error('keine freie Stelle');
}
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tick = (raum, n, dt = 0.05) => { for (let i = 0; i < n; i++) raum.hunde.schritt(dt); };

test('Bellen ist ein Ereignis der Tonliste, mit Vorbelegung, und kein Zombiegeräusch', () => {
  assert.ok(EREIGNISSE.some(e => e.id === 'hundBellen' && e.art === 'einmal'));
  assert.deepEqual(TON_STANDARD.hundBellen.dateien, ['dragon-studio-free-dog-bark-419014.mp3', 'dragon-studio-dog-bark-382732.mp3']);
});

test('Bildwahl und Größe: Richtung nach Bewegung, Laufbilder, Hundelänge = 2 × Schulterbreite', () => {
  assert.equal(hundRichtung(-Math.PI / 2), 0);   // nach oben
  assert.equal(hundRichtung(0), 1);              // rechts
  assert.equal(hundRichtung(Math.PI / 2), 2);    // unten
  assert.equal(hundRichtung(Math.PI), 3);        // links
  assert.equal(hundRichtung(-Math.PI), 3);
  assert.equal(hundRichtung(0.7, 1), 1);   // bleibt rechts (Beharrung)
  assert.equal(hundRichtung(1.5, 1), 2);   // klar unten: wechselt
  assert.equal(hundBild(2, false, 55), 2);         // Stand: erstes Bild der Richtung
  assert.equal(hundBild(2, true, 0), 2);
  assert.equal(hundBild(2, true, 10), 6);          // zweites Laufbild: Zeile 1
  assert.equal(hundBild(1, true, 59), 5 * 4 + 1);
  assert.equal(hundBild(1, true, 60), 1);          // Kreislauf
  // gleiche Formel wie die Figuren: bei jeder Größe ist die Hundelänge doppelt so groß wie die Schulterbreite (SCHULTER_PX × mg)
  for (const mg of [0.35, 0.7, 1.4]) assert.ok(Math.abs(96 * hundSkala(mg, 96) - 2 * SCHULTER_PX * mg) < 1e-9);
});

test('Streuner: ein Spieler in 2 m bekommt den Hund, jeder nur einen, Bots keinen', async () => {
  const a = await beitreten('Anna'), b = await beitreten('Bert');
  const raum = a.raum;
  ruhig(raum);
  const pa = raum.state.spieler.get(a.sid), pb = raum.state.spieler.get(b.sid), xa = raum.extra.get(a.sid), xb = raum.extra.get(b.sid);
  for (const p of [pa, pb]) { p.ebene = ''; p.verbunden = true; p.unten = false; }
  const o1 = freiNahe(raum, pa.x, pa.y);
  pa.x = o1.x; pa.y = o1.y;
  const o2 = freiNahe(raum, pa.x + 300, pa.y); pb.x = o2.x; pb.y = o2.y;
  // Bert ist (noch) ein Bot: bekommt nie einen Hund
  xb.bot = { weg: null };
  const s1 = raum.hunde.neuerStreuner(pb.x + 4, pb.y);
  tick(raum, 20);
  assert.equal(raum.state.hunde.get(s1).besitzer, '', 'Bot bekommt keinen Hund');
  assert.ok(!xb.hund);
  delete xb.bot;
  raum.state.hunde.delete(s1); raum.hunde.info.delete(s1);   // s1 wandert sonst (zufällig) in Berts Nähe und würde ihm später zulaufen
  // weit weg: nichts
  const s2 = raum.hunde.neuerStreuner(pa.x + 40, pa.y); raum.state.hunde.get(s2).x = pa.x + 40;
  raum.hunde.info.get(s2).steht = true; raum.hunde.info.get(s2).wandelT = 99;
  tick(raum, 5);
  assert.equal(raum.state.hunde.get(s2).besitzer, '', '5 m: noch kein Zulaufen');
  // in 2 m: Anna bekommt ihn, mit Meldung
  const h2 = raum.state.hunde.get(s2); h2.x = pa.x + 12; h2.y = pa.y;
  tick(raum, 2);
  assert.equal(h2.besitzer, a.sid);
  assert.ok(xa.hund);
  await warte(100);
  assert.ok(a.meld.includes('🐕 Ein Hund läuft dir zu!'), 'Meldung: ' + JSON.stringify(a.meld));
  // ein zweiter Streuner direkt neben Anna bleibt Streuner (höchstens ein Hund je Spieler)
  const s3 = raum.hunde.neuerStreuner(pa.x - 10, pa.y);
  raum.hunde.info.get(s3).steht = true; raum.hunde.info.get(s3).wandelT = 99;
  tick(raum, 10);
  assert.equal(raum.state.hunde.get(s3).besitzer, '');
  assert.equal([...raum.state.hunde.values()].filter(h => h.besitzer === a.sid).length, 1);
  // Bert (jetzt Mensch) bekommt den dritten, wenn er nah steht
  pb.x = raum.state.hunde.get(s3).x + 8; pb.y = raum.state.hunde.get(s3).y;
  tick(raum, 2);
  assert.equal(raum.state.hunde.get(s3).besitzer, b.sid);
  await a.c.leave(); await b.c.leave();
});

test('Hund folgt in 1,5–3 m Abstand, wartet im Stand, springt bei > 30 m hinter den Besitzer, ist unverwundbar', async () => {
  const a = await beitreten('Folge');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  p.ebene = ''; p.verbunden = true;
  const o = freiNahe(raum, p.x, p.y); p.x = o.x; p.y = o.y;
  const id = raum.hunde.neuer(p.x + 10, p.y, '', a.sid); x.hund = true;
  const h = raum.state.hunde.get(id);
  assert.ok(!('hp' in h) && !('leben' in h), 'der Hund hat keine Lebenspunkte');
  // Besitzer steht: der Hund wartet (bleibt, wo er ist)
  const vorher = { x: h.x, y: h.y };
  tick(raum, 40);
  assert.ok(abstand(h, vorher) < 1, 'wartet');
  // Besitzer geht 150 px weiter: der Hund kommt nach
  const ziel = freiNahe(raum, p.x + 150, p.y);
  for (let i = 0; i < 60; i++) {   // Besitzer läuft in Schritten
    const d = abstand(p, ziel); if (d < 3) break;
    p.x += (ziel.x - p.x) / d * Math.min(7.5, d); p.y += (ziel.y - p.y) / d * Math.min(7.5, d);
    tick(raum, 1);
  }
  tick(raum, 60);
  const d = abstand(h, p);
  assert.ok(d <= 3 * 8 + 4, 'folgt auf höchstens ~3 m, ist ' + d);
  assert.ok(d >= 5, 'läuft nicht in den Besitzer, ist ' + d);
  // weit weg: Teleport hinter den Besitzer
  p.richtung = 0;
  const weit = freiNahe(raum, p.x + 400, p.y);
  p.x = weit.x; p.y = weit.y;
  tick(raum, 1);
  assert.ok(abstand(h, p) < 40, 'zurückgesprungen, Abstand ' + abstand(h, p));
  assert.ok(h.x <= p.x + 2, 'hinter dem Besitzer (Blick nach rechts)');
  assert.equal(raum.state.hunde.size, 1);
  await a.c.leave();
});

test('Ablenkung: Zombie in 8 m jagt den Hund (nicht bei Ziel < 3 m), erreicht ihn ohne Wirkung, verliert das Interesse', async () => {
  const a = await beitreten('Ablenk');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  p.ebene = ''; p.verbunden = true;
  const o = freiNahe(raum, p.x, p.y); p.x = o.x; p.y = o.y;
  const id = raum.hunde.neuer(p.x + 15, p.y, '', a.sid); x.hund = true;
  const h = raum.state.hunde.get(id);
  const alt = SpielRaum.einstellungen.hund;
  try {
    // Wahrscheinlichkeit 0: nie
    SpielRaum.einstellungen.hund = { ablenkung: 0 };
    const zp = freiNahe(raum, h.x + 30, h.y);
    const z0 = raum.setzeZombie(zp.x, zp.y); raum.zombieInfo.get(z0).ziel = a.sid;
    tick(raum, 40);
    assert.ok(!(raum.zombieInfo.get(z0).hundBis > 0), 'bei 0 % nie abgelenkt');
    raum.state.zombies.delete(z0); raum.zombieInfo.delete(z0);
    // 100 %, aber der Zombie ist schon näher als 3 m am Spieler: bleibt dort
    SpielRaum.einstellungen.hund = { ablenkung: 100 };
    const zn = freiNahe(raum, p.x - 14, p.y);
    const z1 = raum.setzeZombie(zn.x, zn.y); raum.zombieInfo.get(z1).ziel = a.sid;
    raum.state.zombies.get(z1).x = p.x - 14; raum.state.zombies.get(z1).y = p.y;
    h.x = p.x - 30; h.y = p.y;
    tick(raum, 20);
    assert.ok(!(raum.zombieInfo.get(z1).hundBis > 0), 'Zombie am Spieler wird nicht abgelenkt');
    assert.equal(raum.zombieInfo.get(z1).ziel, a.sid);
    raum.state.zombies.delete(z1); raum.zombieInfo.delete(z1);
    // 100 %: Zombie 40 px (5 m) vom Hund, sein Ziel ist der Spieler (weit weg)
    h.x = p.x + 15; h.y = p.y;
    const zf = freiNahe(raum, h.x + 45, h.y);
    const z2 = raum.setzeZombie(zf.x, zf.y); const zi = raum.zombieInfo.get(z2), z = raum.state.zombies.get(z2);
    zi.ziel = a.sid;
    z.x = h.x + 45; z.y = h.y;
    const bellen = []; const alt2 = raum.broadcast.bind(raum);
    raum.broadcast = (art, m, ...r) => { if (art === 'hundBellen') bellen.push(m); return alt2(art, m, ...r); };
    tick(raum, 10);   // 0,5 s: Prüfung
    assert.ok(zi.hundBis > raum.hunde.t + 3 && zi.hundBis <= raum.hunde.t + 8.1, 'jagt den Hund für 4–8 s');
    assert.equal(zi.ziel, null, 'Spieler nicht mehr das Ziel');
    assert.equal(bellen.length, 1, 'kurzes Bellen bei Ablenkung');
    let winselte = false, minAbstand = 1e9;
    for (let i = 0; i < 240 && zi.hundBis; i++) {
      raum.hunde.schritt(0.05); raum.zombieSchritt(z2, z, 0.05);
      minAbstand = Math.min(minAbstand, abstand(h, z)); if (h.winselt) winselte = true;
    }
    assert.ok(winselte || minAbstand < 60, 'der Zombie kam an den Hund heran');
    assert.equal(raum.state.hunde.size, 1, 'der Hund bleibt unversehrt');
    assert.ok(!(zi.hundBis > 0), 'Zombie hat das Interesse verloren');
    assert.equal(zi.ziel, null);
    raum.broadcast = alt2;
  } finally { SpielRaum.einstellungen.hund = alt; }
  await a.c.leave();
});

test('Bellen: Zombie < 4 m vor der Haustür bellt der Hund alle 3–5 s, ohne Lärm; weiter weg nicht', async () => {
  const a = await beitreten('Bell');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  const haus = raum.welt.haeuser.find(h => h.betretbar && !h.safe && h.tuer);
  const ebene = `h${haus.nr}eg`, w = raum.wv(ebene);
  p.ebene = ebene; p.verbunden = true; p.x = w.start.x; p.y = w.start.y;
  const id = raum.hunde.neuer(p.x + 12, p.y, ebene, a.sid); x.hund = true;
  const tx = (haus.tuer.x + 0.5) * KACHEL, ty = (haus.tuer.y + 0.5) * KACHEL;
  const bellen = []; const alt2 = raum.broadcast.bind(raum);
  raum.broadcast = (art, m, ...r) => { if (art === 'hundBellen') bellen.push({ t: raum.hunde.t, ...m }); return alt2(art, m, ...r); };
  let laerm = 0; const altL = raum.laerm.bind(raum); raum.laerm = (...r) => { laerm++; return altL(...r); };
  // Zombie 10 m vor der Tür: kein Bellen
  const fern = freiNahe(raum, tx + haus.raus.dx * 90, ty + haus.raus.dy * 90);
  const zid = raum.setzeZombie(fern.x, fern.y); const z = raum.state.zombies.get(zid); raum.zombieInfo.get(zid).schlaeft = true;
  z.x = fern.x; z.y = fern.y;
  tick(raum, 200);
  assert.equal(bellen.length, 0, 'weit von der Tür: ruhig');
  // Zombie 2,5 m vor der Tür
  z.x = tx + haus.raus.dx * 20; z.y = ty + haus.raus.dy * 20;
  tick(raum, 400);   // 20 s
  assert.ok(bellen.length >= 4 && bellen.length <= 7, 'alle 3–5 s: ' + bellen.length);
  for (let i = 1; i < bellen.length; i++) { const d = bellen[i].t - bellen[i - 1].t; assert.ok(d >= 3 - 1e-6 && d <= 5.6, 'Abstand ' + d); }
  assert.equal(bellen[0].ebene, ebene);
  assert.equal(laerm, 0, 'Bellen macht keinen Lärm');
  // Zombie weg: Bellen hört auf
  const n = bellen.length; z.x = fern.x; z.y = fern.y;
  tick(raum, 200);
  assert.equal(bellen.length, n);
  // Hund und Besitzer in einem anderen Haus als die Tür des Zombies: kein Bellen
  raum.broadcast = alt2; raum.laerm = altL;
  await a.c.leave();
});

test('Wegschicken: der Hund läuft davon und verschwindet; kein neuer Streuner', async () => {
  const a = await beitreten('Weg');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  p.ebene = ''; p.verbunden = true;
  const o = freiNahe(raum, p.x, p.y); p.x = o.x; p.y = o.y;
  raum.hunde.neuer(p.x + 12, p.y, '', a.sid); x.hund = true;
  a.c.send('hundWeg');
  await warte(150);
  assert.equal(x.hund, false);
  assert.equal([...raum.state.hunde.values()].filter(h => h.besitzer === a.sid).length, 0);
  assert.equal(raum.state.hunde.size, 1, 'läuft noch davon');
  const start = { x: [...raum.state.hunde.values()][0].x, y: [...raum.state.hunde.values()][0].y };
  tick(raum, 40);
  assert.ok(abstand([...raum.state.hunde.values()][0], start) > 40, 'rennt weg');
  tick(raum, 200);
  assert.equal(raum.state.hunde.size, 0, 'verschwunden, nichts nachgekommen');
  // ohne Hund: der Befehl tut nichts
  a.c.send('hundWeg'); await warte(100);
  assert.equal(raum.state.hunde.size, 0);
  await a.c.leave();
});

test('Speichern und Laden: der Hund bleibt beim Spieler (Wiedereinstieg, Levelwechsel)', async () => {
  const a = await beitreten('Speicher'), b = await beitreten('Bleibt');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  p.ebene = ''; p.verbunden = true;
  const o = freiNahe(raum, p.x, p.y); p.x = o.x; p.y = o.y;
  raum.hunde.neuer(p.x + 12, p.y, '', a.sid); x.hund = true;
  raum.speichereSpieler(a.sid, true);
  assert.equal(raum.speicher.ladeSpieler(a.id).hund, true);
  // ohne Hund: false
  assert.equal(raum.speicher.ladeSpieler(b.id).hund, false);
  // Verlassen: Hund aus der Welt, Spielstand behält ihn
  await a.c.leave(); await warte(200);
  assert.equal([...raum.state.hunde.values()].length, 0);
  assert.equal(raum.speicher.ladeSpieler(a.id).hund, true);
  // Wiedereinstieg (auch nach Levelwechsel: derselbe Weg über onJoin): der Hund ist wieder da
  const a2 = await beitreten('Speicher', a.id);
  const raum2 = a2.raum;
  assert.equal(raum2, raum);
  const neu = [...raum.state.hunde.values()].filter(h => h.besitzer === a2.sid);
  assert.equal(neu.length, 1);
  assert.ok(raum.extra.get(a2.sid).hund);
  // Streuner läuft diesem Spieler nicht noch einmal zu
  const q = raum.state.spieler.get(a2.sid);
  const s = raum.hunde.neuerStreuner(q.x + 5, q.y); raum.hunde.info.get(s).steht = true; raum.hunde.info.get(s).wandelT = 99;
  tick(raum, 10);
  assert.equal(raum.state.hunde.get(s).besitzer, '');
  await a2.c.leave(); await b.c.leave();
});
