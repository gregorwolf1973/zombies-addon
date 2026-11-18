import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paketBauen, paketLesen, relaisPaket, neuerAls, mulawByte, mulawFloat, mulawKodieren, mulawDekodieren, Abtaster,
  FORMAT_OPUS, FORMAT_MULAW, KOPF,
} from '../client/sprache_kodierung.mjs';

test('Paketkopf: Hin- und Rückweg, Fehlerrahmen', () => {
  const p = paketBauen(FORMAT_MULAW, 0x1234, Uint8Array.from([9, 8, 7]));
  assert.deepEqual([...p], [1, 0x12, 0x34, 9, 8, 7]);
  const g = paketLesen(p);
  assert.equal(g.format, FORMAT_MULAW); assert.equal(g.nr, 0x1234); assert.deepEqual([...g.nutz], [9, 8, 7]);
  const r = relaisPaket(5, paketBauen(FORMAT_OPUS, 65535, Uint8Array.from([1])));
  assert.equal(r[0], 5);
  assert.equal(paketLesen(r, 1).nr, 65535);
  assert.equal(paketLesen(r, 1).format, FORMAT_OPUS);
  // Fehlerrahmen
  assert.equal(paketLesen(null), null);
  assert.equal(paketLesen(new Uint8Array(0)), null);
  assert.equal(paketLesen(Uint8Array.from([0, 0, 1])), null, 'ohne Nutzdaten');
  assert.equal(paketLesen(Uint8Array.from([2, 0, 1, 5])), null, 'unbekanntes Format');
  assert.equal(paketLesen(Uint8Array.from([0, 0, 1, 5]), 1), null, 'ab Versatz zu kurz');
  assert.equal(KOPF, 3);
});

test('laufende Nummer mit Überlauf', () => {
  assert.ok(neuerAls(2, 1)); assert.ok(!neuerAls(1, 2)); assert.ok(!neuerAls(5, 5));
  assert.ok(neuerAls(0, 65535)); assert.ok(!neuerAls(65535, 0));
});

test('μ-law: Hin- und Rückweg mit kleinem Fehler, Stille, Grenzen', () => {
  assert.equal(mulawFloat(mulawByte(0)), 0);
  assert.equal(mulawByte(0), 0xff);
  for (let i = -32768; i < 32768; i += 13) {
    const f = i / 32768, r = mulawFloat(mulawByte(f));
    assert.ok(Math.abs(r - f) <= Math.abs(f) * 0.04 + 0.0005, `${f} → ${r}`);
    assert.equal(Math.sign(r) || 0, Math.sign(f) || 0 || Math.sign(r));
  }
  assert.ok(mulawFloat(mulawByte(5)) > 0.97 && mulawFloat(mulawByte(-5)) < -0.97, 'Übersteuerung wird begrenzt');
  assert.equal(mulawByte(NaN), 0xff);
  const f = Float32Array.from({ length: 320 }, (_, i) => 0.5 * Math.sin(i / 5));
  const b = mulawKodieren(f), d = mulawDekodieren(b);
  assert.equal(b.length, 320); assert.equal(d.length, 320);
  for (let i = 0; i < 320; i++) assert.ok(Math.abs(d[i] - f[i]) < 0.02);
  assert.equal(mulawDekodieren(new Uint8Array(0)).length, 0);
});

test('Abtaster: Rate und Mittelwert über Blöcke', () => {
  const a = new Abtaster(48000, 8000);
  const aus = [...a.push(new Float32Array(96).fill(0.5)), ...a.push(new Float32Array(96).fill(0.5))];
  assert.equal(aus.length, 32);
  for (const v of aus) assert.ok(Math.abs(v - 0.5) < 1e-6);
  const b = new Abtaster(44100, 16000);   // gebrochenes Verhältnis, Blöcke zu 128
  let n = 0;
  for (let i = 0; i < 344; i++) n += b.push(new Float32Array(128).fill(1)).length;
  assert.ok(Math.abs(n - 44032 * 16000 / 44100) <= 1, 'Anzahl ' + n);
});
