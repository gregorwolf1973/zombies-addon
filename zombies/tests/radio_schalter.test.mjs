// Autoradio: Regeln (jedes dritte fahrende, jedes zehnte geparkte Auto) und eigener Schalter, unabhängig von „Musik“ (client/ton.mjs mit Attrappen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fahrzeugHatRadio, parktAutoHatRadio } from '../client/ton_regeln.mjs';

const echtesTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => { const t = echtesTimeout(f, ms, ...a); t.unref?.(); return t; };

// ---- Attrappen für ton.mjs ----
const gains = [];
const knoten = () => {
  const k = { connect() {}, disconnect() {}, start() {}, stop() {}, gain: { value: 1, ziele: [], setValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { k.gain.ziele.push(v); k.gain.value = v; } }, pan: { value: 0, setTargetAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, Q: { value: 0 }, playbackRate: { value: 1, setTargetAtTime() {} }, detune: { setTargetAtTime() {} } };
  gains.push(k); return k;
};
class FakeBuffer { constructor(n = 1000, rate = 8000) { this.length = n; this.sampleRate = rate; this.duration = n / rate; this.numberOfChannels = 1; } getChannelData() { return new Float32Array(this.length); } }
const audios = [];
class FakeAudio { constructor() { this.paused = true; this.src = ''; this.pausen = 0; audios.push(this); } setAttribute() {} play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; this.pausen++; } removeAttribute() { this.src = ''; } load() {} }
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  createGain() { return knoten(); } createStereoPanner() { return knoten(); } createBiquadFilter() { return knoten(); } createOscillator() { return knoten(); }
  createBufferSource() { return knoten(); } createBuffer(c, n, r) { return new FakeBuffer(n, r); } createMediaElementSource() { return knoten(); }
  decodeAudioData(b, ok) { ok(new FakeBuffer(2000)); } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
}
globalThis.AudioBuffer = FakeBuffer; globalThis.Audio = FakeAudio;
globalThis.document = { hidden: false, addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, setAttribute() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } };
globalThis.window = { AudioContext: FakeCtx };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

test('Radio-Regeln: jedes dritte Auto, nur Autos; geparkte etwa jedes zehnte, deterministisch', () => {
  assert.equal(fahrzeugHatRadio('auto3', 'auto'), true);
  assert.equal(fahrzeugHatRadio('auto4', 'auto'), false);
  assert.equal(fahrzeugHatRadio('bus3', 'bus'), false);
  let n = 0; for (let i = 0; i < 2000; i++) if (parktAutoHatRadio('b' + i)) n++;
  assert.ok(n > 120 && n < 280, 'Anteil geparkter Radios ' + n + ' von 2000');
  assert.equal(parktAutoHatRadio('b77'), parktAutoHatRadio('b77'));
});

test('Autoradio-Schalter ist unabhängig von „Musik“ (Live-Radio: Strom, Pegel, Fahrzeug-Handle)', async () => {
  const ton = await import('../client/ton.mjs');
  ton.tonStarten();
  ton.toneEinstellungen({ radioStream: { an: true, url: 'https://radio.test/stream', laut: 60, vorlauf: 0 } });
  const h = ton.schleifeStarten('autoradio', true);
  assert.ok(h?.live, 'kein Live-Radio-Handle');
  assert.equal(ton.autoradioAn(), true);
  const el = audios[audios.length - 1];
  assert.ok(el, 'kein Radiostrom angelegt');
  // Musik aus: Radio bleibt an
  ton.musikSetzen(false);
  assert.equal(el.pausen, 0, 'Musik aus pausiert den Radiostrom');
  assert.ok(ton.schleifeStarten('autoradio', true), 'Musik aus verhindert Autoradio');
  // Autoradio aus: kein Handle mehr, Strom pausiert
  ton.autoradioSetzen(false);
  assert.equal(ton.schleifeStarten('autoradio', true), null, 'Autoradio aus: trotzdem Handle');
  assert.ok(el.pausen >= 1, 'Radiostrom läuft trotz Schalter aus');
  // wieder an, Musik bleibt aus
  ton.autoradioSetzen(true);
  assert.ok(ton.schleifeStarten('autoradio', true), 'Autoradio an, aber kein Handle');
  ton.musikSetzen(true);
});

