// Haustüren: Tür exakt auf der Hauswand (Nische/Vordach bevorzugt), Wechsel ins Haus erst an der Wandlinie und nur mit gezieltem Hineinlaufen (≥ 0,3 s)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, KACHEL } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { berechneTuerPose } from '../client/tuerpose.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { SpielRaum } from '../server/raum.mjs';

const K = KACHEL;
const karteLaden = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));

// Abstand eines Punktes zum Polygonrand (px)
function randAbstand(u, px, py) {
  let m = Infinity;
  for (let i = 0; i < u.length; i += 2) {
    const j = (i + 2) % u.length, ax = u[i] * K, ay = u[i + 1] * K, bx = u[j] * K, by = u[j + 1] * K, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    m = Math.min(m, Math.hypot(ax + dx * t - px, ay + dy * t - py));
  }
  return m;
}

test('Türpose: Nische (Rücksprung) bekommt die Tür mittig auf der Rückwand', () => {
  // 10 × 8 Kacheln großes Haus, an der Unterseite (y = 8) ein Rücksprung 2 m tief und 3 m breit (Rückwand y = 7,5)
  const k = K, s = 1 / 8;   // 1 m in Kacheln
  const umriss = [0, 0, 10, 0, 10, 8, 4.5 + 1.5 * s, 8, 4.5 + 1.5 * s, 8 - 2 * s, 4.5 - 1.5 * s, 8 - 2 * s, 4.5 - 1.5 * s, 8, 0, 8];
  const h = { tuer: { x: 4, y: 7 }, raus: { dx: 0, dy: 1 }, umriss };
  const q = berechneTuerPose(h, k);
  assert.equal(q.nische, true);
  assert.ok(Math.abs(q.x - 4.5 * k) < 0.5 && Math.abs(q.y - (8 - 2 * s) * k) < 0.5, `Position ${q.x}/${q.y}`);
  assert.ok(Math.abs(q.ny - 1) < 1e-6 && Math.abs(q.nx) < 1e-6);
});

test('Türpose: ohne Nische mittig an der Wand, mindestens 1 m von den Ecken, exakt auf der Wand', () => {
  const umriss = [0, 0, 2, 0, 2, 2, 0, 2];   // 2 × 2 Kacheln, Tür unten links in der Ecke
  const h = { tuer: { x: 0, y: 1 }, raus: { dx: 0, dy: 1 }, umriss };
  const q = berechneTuerPose(h, K);
  assert.equal(q.nische, false);
  assert.ok(Math.abs(q.y - 2 * K) < 0.01, 'nicht auf der Wand');
  assert.ok(q.x >= 8 - 1e-6 && q.x <= 2 * K - 8 + 1e-6);
});

test('geretsried2: alle Türen liegen auf der Polygonwand (außer Rückfall), Nischen werden gefunden', () => {
  const karte = karteLaden('geretsried2');
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  let nischen = 0, rueckfall = 0;
  for (const h of w.haeuser) {
    assert.ok(h.tuerPos, 'tuerPos fehlt');
    const q = h.tuerPos;
    assert.ok(Math.abs(Math.hypot(q.nx, q.ny) - 1) < 0.01, 'Normale nicht normiert');
    if (q.nische) nischen++;
    const px = (h.tuer.x + 0.5 + h.raus.dx * 0.5) * K, py = (h.tuer.y + 0.5 + h.raus.dy * 0.5) * K;
    if (q.x === px && q.y === py) { rueckfall++; continue; }
    assert.ok(randAbstand(h.umriss, q.x, q.y) < 0.05, 'Tür nicht auf der Wand: Haus ' + h.nr);
    assert.ok(Math.hypot(q.x - px, q.y - py) < 1.7 * K);
  }
  assert.ok(nischen >= 5, 'zu wenige Nischen: ' + nischen);
  assert.ok(rueckfall < w.haeuser.length * 0.1, 'zu viele Rückfälle: ' + rueckfall);
});

test('Haus betreten: erst ab 0,3 s gezieltem Hineinlaufen an der Wandlinie, Streifen löst nichts aus', () => {
  const karte = karteLaden('isarauen');
  setzeKartengroesse(karte.breite, karte.hoehe);
  const welt = baueWeltAusKarte(karte, 1, { autos: 1 });
  const ebenen = new Map();
  const r = Object.create(SpielRaum.prototype);
  for (const [k, v] of Object.entries({ state: { seed: 1, tueren: new Map() }, clients: [] })) Object.defineProperty(r, k, { value: v, writable: true });
  Object.assign(r, { welt, brand: null, wv: e => (!e ? welt : ebenen.get(e) ?? ebenen.set(e, innenraumFuer(1, welt, e)).get(e)), freierPlatz: ort => ({ x: ort.x, y: ort.y }) });
  const h = welt.haeuser.find(q => q.betretbar && !q.safe), q = h.tuerPos;
  const an = (abstand, seit = 0) => ({ ebene: '', x: q.x + q.nx * abstand - q.ny * seit, y: q.y + q.ny * abstand + q.nx * seit });
  const hinein = { dx: -q.nx, dy: -q.ny, s: false };
  const schritte = (p, x, n, dt = 0.05) => { for (let i = 0; i < n; i++) r.uebergang('s1', p, x, dt); };

  // gezielt hinein: nach 0,2 s noch draußen, nach 0,35 s drin
  let p = an(3), x = { eingabe: hinein };
  schritte(p, x, 4); assert.equal(p.ebene, '', 'schon nach 0,2 s im Haus');
  schritte(p, x, 3); assert.equal(p.ebene, `h${h.nr}eg`, 'nach 0,35 s nicht im Haus');

  // zu weit vor der Wand (2 m): nichts, auch bei gezieltem Hineinlaufen
  p = an(16); x = { eingabe: hinein }; schritte(p, x, 12); assert.equal(p.ebene, '', 'Wandlinie noch nicht erreicht');
  // seitlich daneben (> 0,75 m)
  p = an(3, 10); x = { eingabe: hinein }; schritte(p, x, 12); assert.equal(p.ebene, '', 'seitlich der Tür');
  // Streifen: an der Wand entlang laufen (Skalarprodukt 0)
  p = an(3); x = { eingabe: { dx: -q.ny, dy: q.nx, s: false } }; schritte(p, x, 12); assert.equal(p.ebene, '', 'Streifen löst aus');
  // schräg (45°, Skalarprodukt ≈ 0,71 knapp darüber, 60°: 0,5 darunter)
  p = an(3); x = { eingabe: { dx: -q.nx * 0.5 - q.ny * 0.866, dy: -q.ny * 0.5 + q.nx * 0.866, s: false } }; schritte(p, x, 12); assert.equal(p.ebene, '', '60° schräg löst aus');
  // Unterbrechung setzt die Zeit zurück: 0,2 s hinein, 0,05 s Streifen, 0,2 s hinein = noch draußen
  p = an(3); x = { eingabe: hinein }; schritte(p, x, 4);
  x.eingabe = { dx: -q.ny, dy: q.nx, s: false }; schritte(p, x, 1);
  x.eingabe = hinein; schritte(p, x, 4); assert.equal(p.ebene, '', 'Unterbrechung zählt nicht zusammen');
  // Stillstand ohne Eingabe
  p = an(3); x = { eingabe: { dx: 0, dy: 0, s: false } }; schritte(p, x, 20); assert.equal(p.ebene, '', 'Stehen löst aus');
  // Bots kommen wie bisher mit der Türkachel hinein
  p = { ebene: '', x: (h.tuer.x + 0.5) * K, y: (h.tuer.y + 0.5) * K }; x = { bot: { uebergangZiel: { x: p.x, y: p.y } }, eingabe: { dx: 0, dy: 0, s: false } };
  schritte(p, x, 1); assert.equal(p.ebene, `h${h.nr}eg`, 'Bot kommt nicht hinein');
});
