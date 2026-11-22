// Baumkronen in der Darstellung: Baumkacheln zu Gruppen (4er-Nachbarschaft), höchstens ein Baum je 2 Kacheln,
// Kronen 4–8 m, nur leichte Überlappung, deterministisch und unabhängig vom Kartenstück. Die Baumkacheln selbst (Kollision/Sicht) bleiben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { T, KACHEL, setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { baumKronen, baumGruppe, baumVon, BAUM_GRUPPE_MAX } from '../client/aussehen.mjs';

// kleine Welt aus Zeichenkette: B = Baum, . = Wiese
function mini(zeilen) {
  const h = zeilen.length, b = zeilen[0].length;
  setzeKartengroesse(b, h);
  return { hole: (x, y) => (x < 0 || y < 0 || x >= b || y >= h) ? T.ZAUN : zeilen[y][x] === 'B' ? T.BAUM : T.WIESE, b, h };
}
const alle = w => baumKronen(w, { x0: 0, y0: 0, x1: w.b, y1: w.h });

test('Einzelbaum: eine Krone, 4–5,5 m; Paar: ein Baum für zwei Kacheln', () => {
  const w = mini(['.......', '..B....', '.......', '....BB.', '.......']);
  const k = alle(w);
  assert.equal(k.length, 2, 'Einzelbaum + Paar = 2 Kronen');
  const einzel = k.find(b => b.x < 4 * KACHEL);
  assert.ok(einzel.gr >= 4 * 8 && einzel.gr <= 5.5 * 8 + 1e-9, 'Einzelbaum ' + einzel.gr / 8 + ' m');
  assert.equal(baumGruppe(w, 4, 3), 2);
});

test('Gruppen: Größe über 4er-Nachbarschaft, Diagonale zählt nicht, Wald wird bei BAUM_GRUPPE_MAX gedeckelt', () => {
  const w = mini(['B.B.', '.B..', '....']);
  assert.equal(baumGruppe(w, 0, 0), 1);
  assert.equal(baumGruppe(w, 1, 1), 1);
  const wald = mini(Array.from({ length: 12 }, () => 'B'.repeat(12)));
  assert.equal(baumGruppe(wald, 5, 5), BAUM_GRUPPE_MAX);
});

test('Wald bleibt dicht, aber höchstens ein Baum je 2 Kacheln; Kronen 4–8 m', () => {
  const w = mini(Array.from({ length: 20 }, () => 'B'.repeat(20)));
  const k = alle(w);
  assert.equal(k.length, 200, 'Schachbrett: genau die Hälfte der 400 Kacheln');
  for (const b of k) assert.ok(b.gr >= 5.5 * 8 - 1e-9 && b.gr <= 7.5 * 8 + 1e-9, 'Waldkrone ' + b.gr / 8);
});

test('Überlappung begrenzt: im Wald im Mittel gering, nie mehr als die halbe Krone', () => {
  const w = mini(Array.from({ length: 24 }, () => 'B'.repeat(24)));
  const k = alle(w);
  const tiefen = [];
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
    const d = Math.hypot(k[i].x - k[j].x, k[i].y - k[j].y), r = (k[i].gr + k[j].gr) / 2;
    if (d < r) tiefen.push((r - d) / Math.min(k[i].gr, k[j].gr));
  }
  assert.ok(tiefen.length > 0);
  assert.ok(Math.max(...tiefen) <= 0.5, 'stärkste Überlappung ' + Math.max(...tiefen).toFixed(2));
  const mittel = tiefen.reduce((a, b) => a + b, 0) / (k.length);   // je Baum
  assert.ok(mittel < 0.6, 'Überlappung je Baum ' + mittel.toFixed(2));
});

test('Deterministisch und unabhängig vom Kartenstück', () => {
  const w = mini(['.BB..B.', 'BBB.BB.', '.B..B..', '.......']);
  const a = baumKronen(w, { x0: 0, y0: 0, x1: 7, y1: 4 }), b = baumKronen(w, { x0: 0, y0: 0, x1: 7, y1: 4 });
  assert.deepEqual(a, b);
  // Stück rechts: jede Krone, die dort nahe genug liegt, ist mit der aus dem Gesamtausschnitt identisch
  const rechts = baumKronen(w, { x0: 4, y0: 0, x1: 7, y1: 4 });
  for (const k of rechts) assert.ok(a.some(o => o.x === k.x && o.y === k.y && o.gr === k.gr && o.art === k.art), 'Krone passt nicht zum Gesamtausschnitt');
  assert.deepEqual(baumVon(5, 7, 3), baumVon(5, 7, 3));
});

test('Echte Karte Geretsried 2: Kronen 4–8 m, höchstens eine Krone je 2 Baumkacheln, Baumkacheln unverändert', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url), 'utf8'));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 12345);
  let kacheln = 0; for (let y = 100; y < 160; y++) for (let x = 100; x < 160; x++) if (w.hole(x, y) === T.BAUM) kacheln++;
  const k = baumKronen(w, { x0: 100, y0: 100, x1: 160, y1: 160 }).filter(b => b.x >= 100 * KACHEL && b.x < 160 * KACHEL && b.y >= 100 * KACHEL && b.y < 160 * KACHEL);
  assert.ok(kacheln > 50, 'Testausschnitt braucht Bäume: ' + kacheln);
  if (karte.amtlich) {
    // amtliche Einzelbäume (Kronendurchmesser aus dem Oberflächenmodell): echte Kronen 2–30 m, übrige Waldkacheln wie bisher 4–8 m
    assert.ok(k.length > 20, `Kronen ${k.length}`);
    for (const b of k) assert.ok(b.echt ? b.gr >= 16 - 1e-9 && b.gr <= 240 + 1e-9 : b.gr >= 32 - 1e-9 && b.gr <= 64 + 1e-9, `Krone ${b.gr} echt=${!!b.echt}`);
    return;
  }
  assert.ok(k.length <= kacheln * 0.75 && k.length >= kacheln * 0.3, `Kronen ${k.length} für ${kacheln} Baumkacheln`);
  for (const b of k) assert.ok(b.gr >= 32 - 1e-9 && b.gr <= 64 + 1e-9);
});
