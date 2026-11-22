// Zäune und Hecken vor Haustüren: Scheibe um die Tür, Korridor zur Straße, parallele Zäune an der Hauswand
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zaeuneVorTuerenKappen } from '../client/zaunkappen.mjs';

const K = 32, M = 8;
// Haus 0..10 × 0..10 Kacheln (Pixel 0..320), Tür unten bei x = 160, y = 320, Normale nach unten; Straße bei y = 520
const haus = { betretbar: true, art: '', tuerPos: { x: 160, y: 320, nx: 0, ny: 1 } };
const umriss = [0, 0, 10, 0, 10, 10, 0, 10];
const strassen = [{ p: [0, 520 / K, 20, 520 / K] }];
const lin = (x0, y0, x1, y1, a = 'f') => ({ a, p: [x0 / K, y0 / K, x1 / K, y1 / K] });
const kappen = z => zaeuneVorTuerenKappen(z, [haus], [umriss], strassen, K);

test('Zaun quer vor der Tür wird 3 m um die Tür aufgetrennt, Enden glatt und gerade', () => {
  const r = kappen([lin(60, 335, 260, 335)]);   // 15 px vor der Wand, quer vor der Tür
  assert.equal(r.zaeune.length, 2);
  const [a, b] = r.zaeune;
  const rd = 3 * M, dy = 335 - 320, dx = Math.sqrt(rd * rd - dy * dy);   // Schnitt mit dem 3-m-Kreis
  assert.ok(Math.abs(a.p[2] * K - (160 - dx)) < 0.01, 'linkes Ende ' + a.p[2] * K);
  assert.ok(Math.abs(b.p[0] * K - (160 + dx)) < 0.01);
  assert.equal(a.p[3], 335 / K); assert.equal(b.p[1], 335 / K);   // weiter exakt auf der alten Geraden
  assert.ok(r.entfernt.tuer >= 1);
});

test('Zaun im Korridor zur Straße wird geschnitten, daneben (> 1 m) bleibt er', () => {
  const quer = kappen([lin(100, 420, 230, 420)]);   // quer über den Weg Tür → Straße, 100 px (12 m) vor der Tür
  assert.equal(quer.zaeune.length, 2);
  const [a, b] = quer.zaeune;
  assert.ok(Math.abs(a.p[2] * K - 152) < 0.01 && Math.abs(b.p[0] * K - 168) < 0.01, 'Korridor 2 m breit: ' + a.p[2] * K + ' ' + b.p[0] * K);
  const nebenan = [lin(100, 420, 150, 420, 'g'), lin(171, 420, 230, 420, 'g')];
  const r = kappen(nebenan);
  assert.equal(r.zaeune.length, 2);
  assert.deepEqual(r.zaeune, nebenan);
  assert.equal(r.zaeune[0], nebenan[0]);   // unverändert = dasselbe Objekt
});

test('Zaun parallel dicht an der Hauswand fällt weg, quer zur Wand und weiter weg bleibt', () => {
  assert.equal(kappen([lin(20, 328, 120, 328)]).zaeune.length, 0);                 // 1 m neben der Wand, parallel
  assert.equal(kappen([lin(20, 340, 120, 340)]).zaeune.length, 1);                 // 2,5 m: bleibt
  assert.equal(kappen([lin(20, 330, 20, 400)]).zaeune.length, 1);                  // quer zur Wand: bleibt (Anfang 10 px entfernt, Ende 80)
});

test('Läden: breiterer Freiraum (4 m, Korridor 3 m)', () => {
  const laden = { ...haus, art: 'bakery' };
  const r = zaeuneVorTuerenKappen([lin(100, 420, 230, 420)], [laden], [umriss], strassen, K);
  const [a, b] = r.zaeune;
  assert.ok(Math.abs(a.p[2] * K - 148) < 0.01 && Math.abs(b.p[0] * K - 172) < 0.01);
});
