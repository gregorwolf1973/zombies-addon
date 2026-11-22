// Kameraflug (Superuser): Figur steht, unverwundbar, für Zombies unsichtbar; Sicht-Filter berücksichtigt die Kameraposition;
// dazu die reinen Mausrad-Hilfen des Clients (client/kameraflug.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { begrenzungZuruecksetzen } from '../server/superuser.mjs';
import { radPixel, radFaktor, FLUG_TEMPO, FLUG_TEMPO_SCHNELL } from '../client/kameraflug.mjs';
import { frei, WERTE as W, BREITE, HOEHE, KACHEL } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const TESTPW = 'Nur-Ein-Testwert-42';   // nur für diesen Test
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-kam-'));
const warte = ms => new Promise(r => setTimeout(r, ms));
const verbunden = [];
let server;
async function bis(f, ms = 4000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
const beitreten = async (name, pw) => {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, ...(pw ? { testzugang: pw } : {}) });
  c.onMessage('*', () => {});
  verbunden.push(c);
  await bis(() => c.state.spieler?.get(c.sessionId));
  return c;
};
const raum = () => SpielRaum.aktiv;
const ich = c => raum().state.spieler.get(c.sessionId);
const ex = c => raum().extra.get(c.sessionId);
const su = async (c, m) => { c.send('su', m); await warte(150); };

before(async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  server = await starte({ port: PORT, optionen: { karte: 'geretsried', bots: 0 }, leise: true,
    datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') });
  await fetch(`${URL_}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ superuserPasswort: TESTPW }) });
});
after(async () => {
  for (const c of verbunden) { try { await c.leave(); } catch { /* weg */ } }
  await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true });
});

// freie Stelle in der Nähe von (x, y)
const freiBei = (x, y) => {
  for (let r = 0; r < 400; r += 12) for (let a = 0; a < 6.28; a += 0.5) {
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (frei(raum().welt, px, py, W.zombieRadius + 6)) return { x: px, y: py };
  }
  return null;
};

test('Nur Superuser: normaler Spieler kann den Kameraflug nicht einschalten', async () => {
  begrenzungZuruecksetzen();
  const n = await beitreten('Hias');
  await su(n, { befehl: 'kamera', an: true, x: 100, y: 100 });
  assert.ok(!ich(n).kamera);
  assert.ok(!ex(n).kameraPos);
  await su(n, { befehl: 'kamerapos', x: 5, y: 5 });
  assert.ok(!ex(n).kameraPos);
  await n.leave();
});

test('Kameraflug: Figur steht, Zombie nimmt sie nicht wahr, kein Schaden; danach wieder normal', async () => {
  begrenzungZuruecksetzen();
  const boss = await beitreten('Gregor', TESTPW);
  const p = ich(boss);
  assert.equal(p.su, true);
  const r = raum();
  for (const sid of [...r.state.spieler.keys()]) if (sid !== boss.sessionId) { r.state.spieler.delete(sid); r.extra.delete(sid); }   // Reste früherer Tests
  const pos = freiBei(p.x, p.y), zp = freiBei(p.x + 14, p.y);
  p.x = pos.x; p.y = pos.y; p.hp = 100;
  await su(boss, { befehl: 'kamera', an: true, x: Math.round(p.x), y: Math.round(p.y) });
  assert.equal(p.kamera, true);
  assert.ok(ex(boss).kameraPos);

  // Eingaben bewegen die Figur nicht
  const x0 = p.x, y0 = p.y;
  boss.send('eingabe', { dx: 1, dy: 0, s: true, n: 1, d: 0.2 });
  await warte(400);
  assert.equal(p.x, x0); assert.equal(p.y, y0);

  // Zombie dicht daneben: bemerkt nichts, beißt nicht
  const id = r.setzeZombie(zp.x, zp.y, '');
  const z = r.state.zombies.get(id), info = r.zombieInfo.get(id);
  z.richtung = Math.atan2(p.y - z.y, p.x - z.x);   // schaut zur Figur
  info.schlaeft = false;
  await warte(1500);
  assert.notEqual(info.ziel, boss.sessionId, 'Zombie hat die unsichtbare Figur als Ziel');
  assert.equal(p.hp, 100, 'Schaden im Kameraflug');
  // auch direkter Schaden (z. B. Feuer/Biss-Pfad) wird je Takt aufgehoben
  p.hp = 20; p.unten = true; p.infektion = 40;
  await warte(300);
  assert.equal(p.hp, 100); assert.equal(p.unten, false); assert.equal(p.infektion, 0);
  // Aktionen/Würfe ohne Wirkung
  boss.send('aktion'); await warte(100); assert.ok(!p.aktion);

  // Ende: Flag weg, Zombie darf wieder jagen
  await su(boss, { befehl: 'kamera', an: false });
  assert.ok(!p.kamera); assert.equal(ex(boss).kameraPos, null);
  z.x = p.x + 14; z.y = p.y; z.richtung = Math.atan2(p.y - z.y, p.x - z.x);
  assert.ok(await bis(() => info.ziel === boss.sessionId, 3000), 'nach dem Flug bemerkt der Zombie die Figur wieder');
  r.state.zombies.delete(id); r.zombieInfo.delete(id);
  await boss.leave();
});

test('Sicht-Filter: Zombies am Flugort werden gesendet, sobald die Kameraposition dort ist', async () => {
  begrenzungZuruecksetzen();
  const boss = await beitreten('Gregor2', TESTPW), normal = await beitreten('Sepp');
  const r = raum(), p = ich(boss);
  assert.ok(p.su, 'Superuser');
  boss.send('sicht', { w: 600, h: 400 }); normal.send('sicht', { w: 600, h: 400 }); await warte(100);
  // weit weg von der Figur (aber auf der Karte) einen Zombie setzen
  const fern = freiBei(p.x > BREITE * KACHEL / 2 ? 300 : BREITE * KACHEL - 300, p.y > HOEHE * KACHEL / 2 ? 300 : HOEHE * KACHEL - 300);
  assert.ok(Math.hypot(fern.x - p.x, fern.y - p.y) > 3500, 'Testpunkt zu nah');
  const cb = c => r.clients.find(k => k.sessionId === c.sessionId);
  const da = id => !!r.state.zombies.get(id);
  // Flug zuerst, Zombie dann an die Kamera (fern der Figur räumt der Raum sonst gelegentlich Zombies ab)
  await su(boss, { befehl: 'kamera', an: true, x: Math.round(fern.x), y: Math.round(fern.y) });
  const id = r.setzeZombie(fern.x, fern.y, '');
  r.zombieInfo.get(id).bleibt = true;   // Stadt-Zombie: wird nicht abgeräumt, damit nur der Filter geprüft wird
  assert.ok(await bis(() => cb(boss).sichtZ.has(id), 2000), 'mit Kameraposition sichtbar ' + JSON.stringify([da(id), ex(boss).kameraPos, ich(boss).kamera, cb(boss).sicht, [...cb(boss).sichtZ].length]));
  assert.ok(!cb(normal).sichtZ.has(id), 'andere Spieler unberührt');
  // Kamera zurück zur Figur: Zombie fällt wieder heraus (er existiert noch)
  await su(boss, { befehl: 'kamerapos', x: Math.round(p.x), y: Math.round(p.y) });
  assert.ok(await bis(() => !cb(boss).sichtZ.has(id) || !da(id), 2000));
  assert.ok(da(id), 'Zombie wurde im Raum entfernt – Test nicht aussagekräftig');
  assert.ok(!cb(boss).sichtZ.has(id), 'Kamera weg: Zombie wieder fern');
  await su(boss, { befehl: 'kamerapos', x: Math.round(fern.x), y: Math.round(fern.y) });
  const id2 = r.setzeZombie(fern.x, fern.y, '');   // normaler Zombie: wird fern von Figur UND Kamera abgeräumt, am Flugort nicht
  assert.ok(await bis(() => cb(boss).sichtZ.has(id2), 2000), 'Kamera wieder dort ' + JSON.stringify([da(id2), ex(boss).kameraPos, ich(boss).kamera, cb(boss).sicht]));
  await warte(1500);
  assert.ok(da(id2), 'Zombie am Flugort bleibt bestehen, solange die Kamera dort ist');
  // Flug beenden: Filter wieder nur an der Figur
  await su(boss, { befehl: 'kamera', an: false });
  assert.ok(await bis(() => !cb(boss).sichtZ.has(id2) || !da(id2), 2000));
  assert.ok(!cb(boss).sichtZ.has(id2));
  for (const q of [id, id2]) { r.state.zombies.delete(q); r.zombieInfo.delete(q); }
  await boss.leave(); await normal.leave();
});

test('Mausrad-Hilfen: Zeilen/Seiten/Pixel, begrenzt, jede Raststufe zoomt sichtbar; Flugtempo 60/200 m/s', () => {
  assert.equal(radPixel({ deltaMode: 0, deltaY: 100 }), 100);
  assert.equal(radPixel({ deltaMode: 1, deltaY: 3 }), 48);    // Zeilen
  assert.equal(radPixel({ deltaMode: 2, deltaY: 1 }), 300);   // Seite, begrenzt
  assert.equal(radPixel({ deltaMode: 0, deltaY: -5000 }), -300);
  assert.equal(radPixel({}), 0);
  const stufe = radFaktor(radPixel({ deltaMode: 0, deltaY: -100 }));
  assert.ok(stufe > 1.1 && stufe < 1.2, 'Raststufe zoomt ~13 %: ' + stufe);
  assert.ok(Math.abs(radFaktor(-100) * radFaktor(100) - 1) < 1e-9, 'hin und zurück neutral');
  const klein = radFaktor(radPixel({ deltaMode: 0, deltaY: -4 }));   // Trackpad: kleine Schritte summieren sich
  assert.ok(klein > 1 && Math.abs(klein ** 25 - stufe) < 0.01);
  assert.equal(FLUG_TEMPO / 8, 60); assert.equal(FLUG_TEMPO_SCHNELL / 8, 200);
});
