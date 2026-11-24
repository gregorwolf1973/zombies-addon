// Luftbild: keine Baumschatten ohne gezeichnete Krone; Soldaten (Bundeswehr) haben Heldengröße
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHULTER_NEU_PX, SOLDAT_SCHULTER_PX, soldatSkala } from '../client/heldenfiguren.mjs';

test('Soldat: Schulterbreite in der Welt == Held-Schulterbreite (auch mit Größenfaktor)', () => {
  for (const mg of [0.5, 1, 1.3]) assert.ok(Math.abs(soldatSkala(mg) * SOLDAT_SCHULTER_PX - SCHULTER_NEU_PX * mg) < 1e-9);
});

test('spiel.mjs: alle Soldaten-Darstellungen nutzen soldatSkala, keine alte BOGEN2-Größe für soldat_idle', () => {
  const q = fs.readFileSync(new URL('../client/spiel.mjs', import.meta.url), 'utf8');
  assert.ok(!/BOGEN2_GROESSE \* groesse\('figuren2', 'soldat_idle'\) \* mg\(\)/.test(q), 'alte Soldatengröße übrig');
  assert.ok((q.match(/soldatSkala\(mg\(\)\)/g) ?? []).length >= 4, 'Lager (2×), B11, Evakuierung');
});

test('Schatten: ohne Kronen (Luftbild) kein Baumschatten, sonst einer je Baum', async () => {
  let ellipsen = 0;
  const g = new Proxy({ ellipse() { ellipsen++; } }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  const { zeichneSchatten } = await import('../client/kulisse.mjs');
  const ctx = { save() {}, restore() {}, drawImage() {}, set filter(v) {} };
  const baeume = [{ x: 100, y: 100, gr: 40, art: 'baum_gross' }, { x: 140, y: 100, gr: 40, art: 'baum_gross' }];
  const rect = { x0: 0, y0: 0, x1: 16, y1: 16 };
  assert.equal(zeichneSchatten(ctx, 128, 128, rect, [], [], []), false);
  assert.equal(ellipsen, 0);
  assert.equal(zeichneSchatten(ctx, 128, 128, rect, [], baeume, []), true);
  assert.equal(ellipsen, 2);
  // der Aufrufer (aussehen.mjs) reicht im Luftbild eine leere Baumliste durch
  const a = fs.readFileSync(new URL('../client/aussehen.mjs', import.meta.url), 'utf8');
  assert.match(a, /!mitBaeumen \? \[\] : baumKronen/);
  assert.match(fs.readFileSync(new URL('../client/spiel.mjs', import.meta.url), 'utf8'), /zeichneSchattenStueck\([^\n]*!st\.foto\)/);
});
