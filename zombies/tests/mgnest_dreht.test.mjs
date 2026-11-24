// MG-Nester drehen sich (max. 90°/s, deterministisch) und sind maßstäblich (8 px = 1 m)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stuetzpunkt, MG_DREH } from '../server/stuetzpunkt.mjs';
import { MG_NEST, zeichneMgNestMg } from '../client/stuetzpunkt.mjs';

const neu = w => ({ bx: Math.cos(w), by: Math.sin(w), ax: Math.cos(w), ay: Math.sin(w), richt: 1 });
const winkel = n => Math.atan2(n.ay, n.ax);
const diff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const st = Object.create(Stuetzpunkt.prototype);

test('MG dreht zum Ziel mit Tempogrenze', () => {
  const n = neu(0);
  let vor = 0, ok = false;
  for (let i = 0; i < 100; i++) {   // Ziel bei 150° links hinten, 20 Schritte/s
    const dt = 0.05; st.nestDrehen(n, Math.cos(2.6), Math.sin(2.6), dt);
    const w = winkel(n); assert.ok(Math.abs(diff(w, vor)) <= MG_DREH * dt + 1e-6, 'zu schnell');
    assert.ok(Math.abs(Math.hypot(n.ax, n.ay) - 1) < 1e-9);
    vor = w;
    if (Math.abs(diff(w, 2.6)) < 1e-6) { ok = true; assert.ok(i >= 28, 'zu früh angekommen: ' + i); break; }
  }
  assert.ok(ok, 'Ziel nie erreicht');
  const m = neu(0); st.nestDrehen(m, 0, -1, 0.05);   // Ziel rechts: dreht negativ
  assert.ok(winkel(m) < 0);
});

test('ohne Ziel schwenkt das MG im Feld ±60° und bleibt darin', () => {
  const n = neu(1), lo = [Infinity, -Infinity];
  for (let i = 0; i < 4000; i++) { st.nestSchwenken(n, 0.05); const d = diff(winkel(n), 1); lo[0] = Math.min(lo[0], d); lo[1] = Math.max(lo[1], d); }
  assert.ok(lo[0] < -0.9 && lo[1] > 0.9 && lo[0] > -1.1 && lo[1] < 1.1, 'Feld ' + lo);
  const w = neu(0); w.ax = -1; w.ay = 0;   // weit außerhalb: zurückdrehen
  for (let i = 0; i < 60; i++) st.nestSchwenken(w, 0.05);
  assert.ok(Math.abs(diff(winkel(w), 0)) < 1.1);
});

test('MG-Nest maßstäblich: Innenraum Ø 2–2,5 m, MG 1,2 m, Sandsack 0,6 m', () => {
  assert.ok(2 * MG_NEST.innen / 8 >= 2 && 2 * MG_NEST.innen / 8 <= 2.5);
  assert.ok(MG_NEST.sack[0] / 8 > 0.5 && MG_NEST.sack[0] / 8 < 0.7);
  assert.ok(MG_NEST.mgLaenge / 8 > 1.1 && MG_NEST.mgLaenge / 8 < 1.3);
  assert.ok(MG_NEST.mgVor + MG_NEST.mgLaenge < MG_NEST.aussen + 1.5);
  const g = new Proxy({}, { get: () => () => g });
  assert.equal(zeichneMgNestMg(g), MG_NEST.mgVor + MG_NEST.mgLaenge);
});
