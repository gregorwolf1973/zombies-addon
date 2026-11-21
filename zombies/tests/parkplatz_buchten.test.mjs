// Parkplätze: Autos stehen IN den gezeichneten Buchten (vektor.mjs parkplatzBuchten = eine Quelle für Linien und Autos)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse, weltFingerabdruck, WELT_VERSION } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { parkplatzBuchten, PARK_BREIT, PARK_TIEFE } from '../client/vektor.mjs';
import { fzPx } from '../client/masse.mjs';

const lade = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));
after(() => setzeKartengroesse(64, 48));
const bauen = (k, seed) => { setzeKartengroesse(k.breite, k.hoehe); return baueWeltAusKarte(k, seed); };
const polygon = f => { const p = []; for (let i = 0; i < f.p.length; i += 2) p.push([f.p[i] * KACHEL, f.p[i + 1] * KACHEL]); return p; };
// Punkt in konvexem Viereck (Ecken der Reihe nach)
const imViereck = (q, [a, b, c, d]) => {
  const s = [[a, b], [b, c], [c, d], [d, a]].map(([p, r]) => (r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0]));
  return s.every(v => v >= -1e-6) || s.every(v => v <= 1e-6);
};
const winkelDiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d; };   // Längsachse: 180° gleich
// Trennachsensatz für zwei gedrehte Rechtecke (Länge l × Breite b)
const ecken = (x, y, w, l, b) => { const c = Math.cos(w), s = Math.sin(w); return [[-l, -b], [l, -b], [l, b], [-l, b]].map(([u, v]) => [x + u / 2 * c - v / 2 * s, y + u / 2 * s + v / 2 * c]); };
const ueberlappt = (A, B) => {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const [p, q] = [P[i], P[(i + 1) % 4]], nx = q[1] - p[1], ny = -(q[0] - p[0]);
    const pr = R => R.map(([x, y]) => x * nx + y * ny), a = pr(A), b = pr(B);
    if (Math.max(...a) <= Math.min(...b) + 1e-6 || Math.max(...b) <= Math.min(...a) + 1e-6) return false;
  }
  return true;
};

for (const name of ['geretsried2', 'geretsried', 'andermatt']) {
  const karte = lade(name);
  const welt = bauen(karte, 4711);
  const autos = welt.behaelter.filter(b => b.art === 'auto' && b.platz === 'parkplatz');
  const lots = (karte.flaechen ?? []).filter(f => f.a === 'parkplatz').map(f => ({ pts: polygon(f) }));
  // alle Buchten (auch überlappender Flächen), in denen der Mittelpunkt liegt
  const buchten = a => lots.flatMap(l => parkplatzBuchten(l.pts).buchten.filter(bu => imViereck([a.x, a.y], bu.ecken)));

  test(`${name}: Parkplatz-Autos vorhanden und Weltversion mindestens 24`, () => {
    assert.ok(autos.length > 0);
    assert.ok(WELT_VERSION >= 24);
  });
  test(`${name}: Winkel = Buchtrichtung (±5°), Mittelpunkt innerhalb einer Bucht`, () => {
    for (const a of autos) {
      const bl = buchten(a);
      assert.ok(bl.length, `Auto ${a.id} bei ${Math.round(a.x)},${Math.round(a.y)} steht in keiner Bucht`);
      assert.ok(Number.isFinite(a.winkel));
      assert.ok(bl.some(bu => winkelDiff(a.winkel, bu.winkel) < 5 * Math.PI / 180), `Auto ${a.id}: Winkel ${a.winkel} passt zu keiner Bucht`);
    }
  });
  test(`${name}: Autos liegen ganz in ihrer Bucht und überlappen sich nicht`, () => {
    const [l, b] = fzPx('pkw');
    assert.ok(l <= PARK_TIEFE && b <= PARK_BREIT);
    for (const a of autos) {
      assert.ok(buchten(a).some(bu => ecken(a.x, a.y, a.winkel, l, b).every(p => imViereck(p, bu.ecken))), `Auto ${a.id} ragt über die Bucht`);
    }
    for (let i = 0; i < autos.length; i++) for (let j = i + 1; j < autos.length; j++) {
      const a = autos[i], c = autos[j];
      if (Math.hypot(a.x - c.x, a.y - c.y) > 60) continue;
      assert.ok(!ueberlappt(ecken(a.x, a.y, a.winkel, l, b), ecken(c.x, c.y, c.winkel, l, b)), `${a.id} überlappt ${c.id}`);
    }
  });
  test(`${name}: nicht jede Bucht ist besetzt (Lücken)`, () => {
    const alle = lots.reduce((n, l) => n + parkplatzBuchten(l.pts).buchten.length, 0);
    assert.ok(autos.length < alle * 0.7, `${autos.length} von ${alle}`);
  });
}

test('Determinismus: gleiche Karte und Seed ergeben gleiche Parkplatz-Autos und Fingerabdruck', () => {
  const karte = lade('geretsried2');
  const a = bauen(karte, 4711), b = bauen(karte, 4711);
  const p = w => w.behaelter.filter(x => x.platz === 'parkplatz');
  assert.deepEqual(p(a), p(b));
  assert.equal(weltFingerabdruck(a), weltFingerabdruck(b));
  // Buchtgeometrie rein geometrisch, ohne Zufall
  const pts = [[0, 0], [400, 100], [380, 300], [-20, 180]];
  assert.deepEqual(parkplatzBuchten(pts.map(q => [...q])).buchten, parkplatzBuchten(pts.map(q => [...q])).buchten);
});
