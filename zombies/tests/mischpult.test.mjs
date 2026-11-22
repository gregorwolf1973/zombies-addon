// Mischpult: Lautstärke gilt auch für Ereignisse ohne Datei (Ersatzton); API speichert sie
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bereinige } from '../server/einstellungen.mjs';

test('API: laut für Ereignis ohne Datei wird gespeichert und begrenzt', () => {
  const e = bereinige({ toene: { schussPistole: { dateien: [], laut: 35 }, tuerAuf: { laut: 400 }, musikLager: { dateien: [], laut: 20 } } });
  assert.deepEqual(e.toene.schussPistole, { dateien: [], laut: 35 });
  assert.equal(e.toene.tuerAuf.laut, 100);
  assert.deepEqual(e.toene.musikLager, { dateien: [], laut: 20 });
});

const echtesTimeout = globalThis.setTimeout, echtesInterval = globalThis.setInterval;
globalThis.setTimeout = (f, ms, ...a) => { const t = echtesTimeout(f, ms, ...a); t.unref?.(); return t; };
globalThis.setInterval = (f, ms, ...a) => { const t = echtesInterval(f, ms, ...a); t.unref?.(); return t; };
const gains = [];
const knoten = () => ({
  connect() {}, disconnect() {}, start() {}, stop() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {},
  gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
  pan: { value: 0 }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, Q: { value: 0 }, playbackRate: { value: 1 }, detune: { setTargetAtTime() {} },
});
class FakeBuffer { constructor(n = 1000, rate = 8000) { this.length = n; this.sampleRate = rate; this.duration = n / rate; this.numberOfChannels = 1; } getChannelData() { return new Float32Array(this.length); } }
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  createGain() { const k = knoten(); gains.push(k); return k; } createStereoPanner() { return knoten(); } createBiquadFilter() { return knoten(); } createOscillator() { return knoten(); }
  createBufferSource() { return knoten(); } createBuffer(c, n, r) { return new FakeBuffer(n, r); }
  decodeAudioData(b, ok) { ok(new FakeBuffer(2000)); }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
}
globalThis.AudioBuffer = FakeBuffer;
globalThis.document = { hidden: false, addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, setAttribute() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } };
globalThis.window = { AudioContext: FakeCtx };
globalThis.fetch = async () => ({ ok: false, status: 404 });

test('Ersatzton nutzt laut des Ereignisses (Standard 100 % ohne Eintrag)', async () => {
  const ton = await import('../client/ton.mjs');
  ton.tonStarten();
  const pegel = (z) => {
    ton.toeneZuordnen(z);
    gains.length = 0;
    ton.schuss(null, null, 1, 'pistole');
    return gains[0]?.gain.value ?? 0;   // erster Verstärker = Ausgang des Ereignisses (ort)
  };
  const voll = pegel({}), halb = pegel({ schussPistole: { dateien: [], laut: 50 } }), stumm = pegel({ schussPistole: { dateien: [], laut: 0 } });
  assert.ok(voll > 0);
  assert.ok(Math.abs(halb / voll - 0.5) < 0.01, `halb ${halb} voll ${voll}`);
  assert.equal(stumm, 0);
});
