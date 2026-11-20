import test from 'node:test';
import assert from 'node:assert/strict';
import { sichtGuete, WERTE as W, KACHEL, T } from '../client/welt.mjs';

// Kleine Testwelt: Wiese, Bäume nach Vorgabe
function welt(baeume = [], sonst = {}) {
  const b = new Set(baeume.map(([x, y]) => x + ',' + y));
  return { hole: (x, y) => sonst[x + ',' + y] ?? (b.has(x + ',' + y) ? T.BAUM : T.WIESE) };
}
const mitte = k => (k + 0.5) * KACHEL;
// Wahrnehmung wie in raum.mjs: weite × Güte, unter 40 px immer
const gesehen = (w, d) => { const g = sichtGuete(w, 0, mitte(1), d, mitte(1)); return g > 0 && (d < 40 || d < W.sichtWeite * g); };

test('Spieler unter einem einzelnen Baum wird in normaler Sichtweite gesehen', () => {
  const ziel = 130;                        // Zielkachel ist Baumkachel, zählt nicht
  const w = welt([[Math.floor(ziel / KACHEL), 1]]);
  assert.equal(sichtGuete(w, 0, mitte(1), ziel, mitte(1)), 1);
  assert.ok(gesehen(w, ziel));
  const w1 = welt([[2, 1]]);               // ein Baum dazwischen: kaum Wirkung
  assert.ok(sichtGuete(w1, 0, mitte(1), 6 * KACHEL, mitte(1)) >= 0.8);
});

test('im dichten Wald nur auf kürzere Distanz, aber nie gar nicht', () => {
  const baeume = []; for (let x = 0; x < 20; x++) for (let y = 0; y < 3; y++) baeume.push([x, y]);
  const w = welt(baeume);
  const g = sichtGuete(w, mitte(0), mitte(1), mitte(8), mitte(1));
  assert.equal(g, 0.3);
  assert.ok(!gesehen(welt(baeume), 160), 'weit weg nicht gesehen');
  assert.ok(gesehen(w, 45), 'nah dran gesehen');
  assert.ok(gesehen(w, 20), 'sehr nah immer gesehen');
});

test('Wand und Leere verdecken weiterhin ganz', () => {
  assert.equal(sichtGuete(welt([], { '1,1': T.WAND }), 0, mitte(1), 5 * KACHEL, mitte(1)), 0);
  assert.equal(sichtGuete(welt([], { '1,1': T.LEER }), 0, mitte(1), 5 * KACHEL, mitte(1)), 0);
});
