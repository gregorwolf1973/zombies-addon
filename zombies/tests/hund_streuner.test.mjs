// Streuner-Hunde: Anzahl nach Kartenfläche, Einstellung, einer nahe am Start, Zulaufen aus Sichtweite (15 m)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { grundwerte } from '../server/einstellungen.mjs';
import { setzeKartengroesse, BREITE, HOEHE, frei, sichtfrei } from '../client/welt.mjs';

const PORT = 28320 + Math.floor(Math.random() * 9);
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(name) {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  return { c, raum: matchMaker.getLocalRoomById(c.roomId), sid: c.sessionId };
}
function ruhig(raum) {
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.welle.schritt = () => {};
  raum.state.hunde.clear(); raum.hunde.info.clear();
}
const mitEinstellung = (streuner, fn) => {
  const alt = SpielRaum.einstellungen.hund;
  SpielRaum.einstellungen.hund = { ablenkung: 40, streuner };
  try { return fn(); } finally { SpielRaum.einstellungen.hund = alt; }
};
const tick = (raum, n, dt = 0.05) => { for (let i = 0; i < n; i++) raum.hunde.schritt(dt); };

test('Grundwert der Einstellung ist automatisch (-1)', () => {
  assert.equal(grundwerte().hund.streuner, -1);
});

test('Anzahl: automatisch 1 je 0,5 km² (mindestens 1), 0 = keine, fest = fest', async () => {
  const { raum } = await beitreten('Anzahl');
  const h = raum.hunde, b0 = BREITE, h0 = HOEHE;
  try {
    // Kachel = 4 m, also 16 m²: 500 × 400 Kacheln = 3,2 km² → 6; 64 × 48 → mindestens 1
    for (const [b, hh, erw] of [[64, 48, 1], [300, 300, 3], [500, 400, 6], [700, 700, 16]]) {
      setzeKartengroesse(b, hh);
      mitEinstellung(-1, () => assert.equal(h.streunerAnzahl(), erw, `${b}x${hh}`));
    }
    mitEinstellung(0, () => assert.equal(h.streunerAnzahl(), 0));
    mitEinstellung(7, () => assert.equal(h.streunerAnzahl(), 7));
  } finally { setzeKartengroesse(b0, h0); }
});

test('start: Einstellung 0 = keine Streuner; sonst Anzahl, einer 100–300 m vom Start, keiner unter 40 m', async () => {
  const { raum } = await beitreten('Start');
  const h = raum.hunde;
  mitEinstellung(0, () => { ruhig(raum); h.start(); assert.equal(raum.state.hunde.size, 0); });
  mitEinstellung(5, () => {
    ruhig(raum); h.start();
    const st = raum.welt.start;
    const ds = [...raum.state.hunde.values()].map(d => Math.hypot(d.x - st.x, d.y - st.y) / 8);
    assert.equal(ds.length, 5);
    assert.ok(ds.some(d => d >= 100 && d <= 300), 'einer nahe am Start: ' + ds.map(Math.round));
    assert.ok(ds.every(d => d >= 40), 'keiner näher als 40 m');
  });
});

test('Zulaufen: Streuner sieht Spieler auf 12 m und läuft hin; hat der Spieler einen Hund, ignoriert er ihn', async () => {
  const a = await beitreten('Sina');
  const raum = a.raum, w = raum.wv('');
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid), x = raum.extra.get(a.sid);
  p.ebene = ''; p.verbunden = true; p.unten = false;
  // Spielerplatz mit einer freien Stelle 12 m (96 px) daneben und freier Sichtlinie suchen (Spieler wandert über die Karte)
  let q = null;
  for (let ky = 3; ky < 60 && !q; ky += 2) for (let kx = 3; kx < 60 && !q; kx += 2) {
    const px = kx * 32 + 16, py = ky * 32 + 16;
    if (!frei(w, px, py, 12)) continue;
    for (let a2 = 0; a2 < 6.3; a2 += 0.3) {
      const sx = px + Math.cos(a2) * 96, sy = py + Math.sin(a2) * 96;
      if (frei(w, sx, sy, 12) && sichtfrei(w, px, py, sx, sy)) { p.x = px; p.y = py; q = { x: sx, y: sy }; break; }
    }
  }
  assert.ok(q, 'Stelle gefunden');
  const id = raum.hunde.neuerStreuner(q.x, q.y), d = raum.state.hunde.get(id), inf = raum.hunde.info.get(id);
  inf.steht = true; inf.wandelT = 99;
  const d0 = Math.hypot(d.x - p.x, d.y - p.y);
  tick(raum, 8);
  assert.ok(Math.hypot(d.x - p.x, d.y - p.y) < d0 - 5, 'läuft zum Spieler');
  assert.equal(d.besitzer, '', 'noch nicht zugeteilt (erst bei 2 m)');
  tick(raum, 300);
  assert.equal(d.besitzer, a.sid, 'schließt sich an');
  assert.ok(x.hund);
  // zweiter Streuner in 12 m: Spieler hat schon einen Hund, also ignoriert
  const id2 = raum.hunde.neuerStreuner(q.x, q.y), d2 = raum.state.hunde.get(id2), i2 = raum.hunde.info.get(id2);
  i2.steht = true; i2.wandelT = 99;
  assert.equal(raum.hunde.sichtZiel(d2), null);
  tick(raum, 20);
  assert.equal(d2.besitzer, '');
});

test('Sicht: weiter als 15 m sieht der Streuner den Spieler nicht', async () => {
  const a = await beitreten('Weit');
  const raum = a.raum;
  ruhig(raum);
  const p = raum.state.spieler.get(a.sid);
  p.ebene = ''; p.verbunden = true; p.unten = false;
  const id = raum.hunde.neuerStreuner(p.x + 160, p.y);
  assert.equal(raum.hunde.sichtZiel(raum.state.hunde.get(id)), null);
});
