// client/ton.mjs: Ladefehler werden wiederholt (max. 3), Schüsse draußen UND im Innenraum lösen Abspielen aus,
// gesperrter AudioContext wird geweckt, Stimmen werden freigegeben. Web Audio, document und fetch sind Attrappen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const echteZeit = performance.now.bind(performance);
let zeitVersatz = 0;
performance.now = () => echteZeit() + zeitVersatz;
const echtesTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => { const t = echtesTimeout(f, ms, ...a); t.unref?.(); return t; };

const zaehler = { starts: 0, resume: 0, fetch: 0 };
const knoten = () => ({
  connect() {}, disconnect() {}, start() { zaehler.starts++; }, stop() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {},
  gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
  pan: { value: 0 }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, Q: { value: 0 }, playbackRate: { value: 1 }, detune: { setTargetAtTime() {} },
});
class FakeBuffer { constructor(n = 1000, rate = 8000) { this.length = n; this.sampleRate = rate; this.duration = n / rate; this.numberOfChannels = 1; } getChannelData() { return new Float32Array(this.length); } }
class FakeCtx {
  constructor() { FakeCtx.letzte = this; this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  createGain() { return knoten(); } createStereoPanner() { return knoten(); } createBiquadFilter() { return knoten(); } createOscillator() { return knoten(); }
  createBufferSource() { return knoten(); } createBuffer(c, n, r) { return new FakeBuffer(n, r); }
  decodeAudioData(b, ok) { ok(new FakeBuffer(2000)); }
  resume() { zaehler.resume++; return Promise.resolve(); } suspend() { return Promise.resolve(); }
}
globalThis.AudioBuffer = FakeBuffer;
globalThis.document = { hidden: false, addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, setAttribute() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } };
globalThis.window = { AudioContext: FakeCtx };
let ladeModus = 'fehler';
globalThis.fetch = async () => { zaehler.fetch++; if (ladeModus === 'fehler') return { ok: false, status: 404 }; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };

const ton = await import('../client/ton.mjs');
const warte = ms => new Promise(r => echtesTimeout(r, ms));

test('Ladefehler wird nach 5 s erneut versucht (max. 3), Ersatzton bis dahin; danach spielt die Datei', async () => {
  ton.tonStarten();
  ton.toeneZuordnen({ schussPistole: { dateien: ['a.wav'], laut: 80 } });
  zeitVersatz += 3000; ton.hoerer(5000, 4000);
  zeitVersatz += 3000;
  // Versuch 1 schlägt fehl: Ersatzton (probe liefert false), kein Dauerabruf
  assert.equal(ton.ereignis('schussPistole', 5000, 4000), false);
  await warte(20);
  assert.equal(zaehler.fetch, 1);
  assert.equal(ton.ereignis('schussPistole', 5000, 4000), false);
  assert.equal(zaehler.fetch, 1, 'Wiederholung zu früh');
  // nach 6 s: zweiter Versuch, jetzt klappt es
  zeitVersatz += 6000; ladeModus = 'ok';
  assert.equal(ton.ereignis('schussPistole', 5000, 4000), false);
  await warte(20);
  assert.equal(zaehler.fetch, 2);
  const vorher = zaehler.starts;
  assert.equal(ton.ereignis('schussPistole', 5000, 4000), true, 'geladener Schuss spielt nicht');
  assert.ok(zaehler.starts > vorher, 'kein Abspielen draußen');
});

test('Schuss im Innenraum (kleine Koordinaten, eigene Ebene) spielt', () => {
  ton.hoerer(300, 200);   // Hörer im Feinraster-Innenraum
  const v = zaehler.starts;
  assert.equal(ton.ereignis('schussPistole', 305, 204), true);
  assert.ok(zaehler.starts > v, 'kein Abspielen im Innenraum');
  // Dauerfeuer im Innenraum: jeder Schuss spielt
  for (let i = 0; i < 12; i++) { const s = zaehler.starts; ton.schuss(300 + i, 200, 1, 'pistole'); assert.ok(zaehler.starts > s, 'Schuss ' + i + ' still'); }
});

test('gesperrter AudioContext wird bei Nutzung geweckt', () => {
  const r = zaehler.resume;
  zeitVersatz += 1000;
  ton.hoerer(300, 200);
  FakeCtx.letzte.state = 'suspended';
  ton.schuss(300, 200, 1, 'pistole');
  assert.ok(zaehler.resume > r, 'resume() nicht aufgerufen');
});

test('Betreten und Schuss im selben Tick: eigener Schuss- und Todeston starten trotz alter Ebene/fernem Hörer', async () => {
  const { ortFuer } = await import('../client/ton_regeln.mjs');
  FakeCtx.letzte.state = 'running';
  ton.toeneZuordnen({ schussPistole: { dateien: ['a.wav'], laut: 80 }, zombieTod: { dateien: ['a.wav'], laut: 80 } });
  zeitVersatz += 1000;
  ton.hoerer(9000, 9000);   // Hörer noch draußen, weit weg von den Innenraum-Koordinaten des Schusses
  // Server-Nachrichten: Schuss und Tod in neuer Ebene 'h5eg', Hörer-Ebene im Patch noch ''
  const schuss = { x1: 300, y1: 200, ebene: 'h5eg', von: 'ich' }, weg = { x: 305, y: 204, ebene: 'h5eg', von: 'ich' };
  const o1 = ortFuer(schuss, 'ich', '', schuss.x1, schuss.y1), o2 = ortFuer(weg, 'ich', '', weg.x, weg.y);
  assert.ok(o1.spielen && o2.spielen && o1.x === null && o2.x === null);
  let s = zaehler.starts; ton.schuss(o1.x, o1.y, 1, 'pistole'); assert.ok(zaehler.starts > s, 'eigener Schuss still');
  s = zaehler.starts; ton.zombieWeg(o2.x, o2.y); assert.ok(zaehler.starts > s, 'eigener Todeston still');
  // fremder Schuss in anderer Ebene: verworfen
  assert.equal(ortFuer({ ...schuss, von: 'anderer' }, 'ich', '', 300, 200).spielen, false);
  assert.equal(ortFuer({ x: 1, y: 2 }, 'ich', 'h5eg', 1, 2).spielen, true, 'Nachricht ohne Ebene bleibt hörbar');
  // Todeston kurz hintereinander (Mindestabstand 120 ms)
  zeitVersatz += 150; s = zaehler.starts; ton.zombieWeg(null, null); assert.ok(zaehler.starts > s, 'zweiter Todeston nach 150 ms still');
});

test('schlafender AudioContext: nichts wird eingereiht', () => {
  FakeCtx.letzte.state = 'suspended';
  zeitVersatz += 1000;
  const s = zaehler.starts; ton.schuss(null, null, 1, 'pistole'); ton.stoss(null, null, false);
  assert.equal(zaehler.starts, s);
  FakeCtx.letzte.state = 'running';
});

test('Kanone ohne eigene Datei nutzt die Schrot-Datei, eigene Datei hat Vorrang', async () => {
  ladeModus = 'ok';
  ton.toeneZuordnen({ schussSchrot: { dateien: ['s.wav'], laut: 10 }, kanone: { dateien: [], laut: 200 } });
  zeitVersatz += 6000; ton.hoerer(5000, 4000);
  zeitVersatz += 3000; ton.kanone(5000, 4000);
  await warte(20); zeitVersatz += 6000;
  const v = zaehler.starts;
  ton.kanone(5000, 4000);
  assert.ok(zaehler.starts > v, 'Schrot-Datei wird für die Kanone nicht abgespielt');
  ton.toeneZuordnen({ schussSchrot: { dateien: ['s.wav'], laut: 10 }, kanone: { dateien: ['k.wav'], laut: 200 } });
  ton.kanone(5000, 4000); await warte(20); zeitVersatz += 6000;
  const w = zaehler.starts;
  ton.kanone(5000, 4000);
  assert.ok(zaehler.starts > w, 'eigene Kanonen-Datei wird nicht abgespielt');
});
