// Geräusche – alles im Browser erzeugt (WebAudio), keine Tondateien.
// Lautstärke und Stereo-Seite richten sich nach der Entfernung zum eigenen Spieler.

let ctx = null, haupt = null, rauschPuffer = null, an = true;
let hx = 0, hy = 0;                         // Hörer (eigene Figur) in Pixeln
let wind = null, brumm = null;
const HOERWEITE = 900;                      // ab hier nichts mehr zu hören

try { an = localStorage.getItem('zombies_ton') !== 'aus'; } catch { /* ohne Speicher: an */ }

export function tonAn() { return an; }

// ---------- Tondateien (auf der Einstellungsseite Ereignissen zugeordnet) ----------
let zuordnung = {};                 // Ereignis → { dateien, laut }
const puffer = new Map();           // Datei → AudioBuffer | Promise | null (fehlt)
let drinnenJetzt = false, nachtJetzt = null;   // null = Tageszeit noch unbekannt
const hintergrund = { stadt: null, streuTimer: 0 };

export function toeneZuordnen(z) { zuordnung = z && typeof z === 'object' ? z : {}; if (ctx) vorladen(); }

function laden(datei) {
  if (puffer.has(datei)) return puffer.get(datei);
  const p = fetch('toene/' + encodeURIComponent(datei))
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
    .then(b => new Promise((ok, fehl) => ctx.decodeAudioData(b, ok, fehl)))
    .then(buf => { puffer.set(datei, buf); hintergrundPruefen(); return buf; })
    .catch(() => { puffer.set(datei, null); return null; });
  puffer.set(datei, p);
  return p;
}
function vorladen() { for (const t of Object.values(zuordnung)) for (const d of t.dateien ?? []) laden(d); hintergrundPruefen(); }
const geladen = d => { const b = puffer.get(d); return b instanceof AudioBuffer ? b : null; };

// eine zugeordnete Datei abspielen; false = keine da (dann erzeugt das Spiel selbst einen Ton)
function probe(id, x, y, extra = 1) {
  const t = zuordnung[id];
  if (!ctx || !t?.dateien?.length) return false;
  const bereit = t.dateien.map(geladen).filter(Boolean);
  if (!bereit.length) { t.dateien.forEach(laden); return false; }
  const z = ort(x, y, (t.laut ?? 80) / 100 * extra);
  if (!z) return true;   // zu weit weg: still, aber auch kein Ersatzton
  const src = ctx.createBufferSource(); src.buffer = bereit[Math.floor(Math.random() * bereit.length)];
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  src.connect(z); src.start();
  return true;
}

export function ereignis(id, x = null, y = null) { return probe(id, x, y); }

// Stadtgeräusche als Schleife; Zombieland: kurze Töne ab und zu aus wechselnder Richtung (lange Dateien als Schleife)
function hintergrundPruefen() {
  if (!ctx) return;
  const t = zuordnung.stadt, buf = t?.dateien?.map(geladen).find(Boolean);
  if (buf && !hintergrund.stadt) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(haupt); src.start(0, Math.random() * buf.duration);
    hintergrund.stadt = { src, g };
  }
  if (hintergrund.stadt) hintergrund.stadt.g.gain.setTargetAtTime(((t?.laut ?? 50) / 100) * (drinnenJetzt ? 0.15 : 0.6), ctx.currentTime, 0.8);
  if (wind) wind.gain.setTargetAtTime(drinnenJetzt ? 0.01 : hintergrund.stadt ? 0.025 : 0.07, ctx.currentTime, 0.8);
}

function streuen() {
  hintergrund.streuTimer = setTimeout(streuen, 9000 + Math.random() * 16000);
  if (!ctx || !an) return;
  const id = nachtJetzt ? 'zombielandNacht' : 'zombielandTag';
  const w = Math.random() * Math.PI * 2, d = 350 + Math.random() * 450;
  probe(id, hx + Math.cos(w) * d, hy + Math.sin(w) * d, drinnenJetzt ? 0.6 : 1.8);
}

export function tageszeit(nacht) {
  if (nacht === nachtJetzt) return;
  const erstes = nachtJetzt === null;
  nachtJetzt = nacht;
  if (nacht && !erstes) probe('nachteinbruch');
}

// erst nach einer Berührung/einem Klick erlaubt der Browser Ton
export function tonStarten() {
  if (ctx) { ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  haupt = ctx.createGain(); haupt.gain.value = an ? 0.8 : 0; haupt.connect(ctx.destination);
  // 2 s weißes Rauschen als Grundstoff für Schuss, Wind, Schlurfen
  rauschPuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = rauschPuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  hintergrundAufbauen();
  vorladen();
  if (!hintergrund.streuTimer) hintergrund.streuTimer = setTimeout(streuen, 6000);
}

export function tonUmschalten() {
  an = !an;
  try { localStorage.setItem('zombies_ton', an ? 'an' : 'aus'); } catch { /* egal */ }
  if (haupt) haupt.gain.setTargetAtTime(an ? 0.8 : 0, ctx.currentTime, 0.05);
  return an;
}

export function hoerer(x, y) { hx = x; hy = y; }

// Ausgang für ein Geräusch an Position (x, y); null = zu weit weg
function ort(x, y, laut = 1) {
  if (!ctx || !an) return null;
  let v = laut, pan = 0;
  if (x != null) {
    const d = Math.hypot(x - hx, y - hy);
    if (d > HOERWEITE) return null;
    v *= Math.max(0, 1 - d / HOERWEITE) ** 1.6;
    pan = Math.max(-1, Math.min(1, (x - hx) / 400));
  }
  if (v < 0.01) return null;
  const g = ctx.createGain(); g.gain.value = v;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(haupt); }
  else g.connect(haupt);
  return g;
}

function rauschen(ziel, dauer, { typ = 'lowpass', freq = 1000, q = 1, start = 0, a = 0.005, laut = 1, freqEnde } = {}) {
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource(); src.buffer = rauschPuffer;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = typ; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnde) f.frequency.exponentialRampToValueAtTime(freqEnde, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  src.connect(f); f.connect(g); g.connect(ziel);
  src.start(t, Math.random() * 1.5); src.stop(t + dauer + 0.05);
}

function ton(ziel, dauer, { typ = 'sine', freq = 440, freqEnde, start = 0, a = 0.01, laut = 0.5 } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(); o.type = typ; o.frequency.setValueAtTime(freq, t);
  if (freqEnde) o.frequency.exponentialRampToValueAtTime(freqEnde, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g); g.connect(ziel); o.start(t); o.stop(t + dauer + 0.05);
}

// ---------- einzelne Geräusche ----------
export function schuss(x, y) {
  const z = ort(x, y, 1); if (!z) return;
  rauschen(z, 0.35, { freq: 2500, freqEnde: 300, a: 0.002, laut: 1 });
  ton(z, 0.18, { typ: 'triangle', freq: 140, freqEnde: 45, a: 0.002, laut: 0.8 });
}

export function stoss(x, y, messer) {
  const z = ort(x, y, 0.7); if (!z) return;
  if (messer) rauschen(z, 0.15, { typ: 'highpass', freq: 3000, freqEnde: 6000, laut: 0.5 });
  else rauschen(z, 0.2, { typ: 'bandpass', freq: 900, freqEnde: 400, q: 0.8, laut: 0.6 });
  ton(z, 0.12, { typ: 'sine', freq: 110, freqEnde: 60, start: 0.06, a: 0.003, laut: 0.7 });   // Treffer-Dumpf
}

export function zombieWeg(x, y) {
  if (probe('zombieTod', x, y)) return;
  const z = ort(x, y, 0.8); if (!z) return;
  rauschen(z, 0.3, { freq: 600, freqEnde: 120, laut: 0.7 });
  ton(z, 0.45, { typ: 'sawtooth', freq: 160, freqEnde: 55, laut: 0.18 });
}

// Stöhnen: tiefe Sägezahnstimme mit Formantfilter und Zittern
export function stoehnen(x, y, laut = 0.5, kriecht = false) {
  if (probe(kriecht ? 'kriecher' : 'stoehnen', x, y, laut * 1.6)) return;
  const z = ort(x, y, laut); if (!z) return;
  const t = ctx.currentTime, dauer = 0.9 + Math.random() * 0.9, f0 = 75 + Math.random() * 45;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.25), t + dauer);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
  const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(500 + Math.random() * 200, t); f.frequency.linearRampToValueAtTime(320, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(f); f.connect(g); g.connect(z);
  o.start(t); lfo.start(t); o.stop(t + dauer + 0.05); lfo.stop(t + dauer + 0.05);
}

export function entdeckt(x, y) {
  if (probe('entdeckt', x, y)) return;
  stoehnen(x, y, 0.9);
  const z = ort(x, y, 0.4); if (z) rauschen(z, 0.5, { typ: 'bandpass', freq: 1200, q: 2, laut: 0.4 });   // Fauchen
}

export function tuer(offen) {
  const z = ort(null, null, 0.5); if (!z) return;
  // Knarzen: kurze Folge rauer Töne, dann der Anschlag beim Schließen
  for (let i = 0; i < 4; i++) ton(z, 0.07, { typ: 'sawtooth', freq: 300 + i * 40 + Math.random() * 30, start: i * 0.05, laut: 0.06 });
  if (!offen) rauschen(z, 0.15, { freq: 400, start: 0.2, a: 0.003, laut: 0.7 });
}

export function suchen() {
  const z = ort(null, null, 0.4); if (!z) return;
  for (let i = 0; i < 5; i++) rauschen(z, 0.08, { typ: 'bandpass', freq: 1500 + Math.random() * 1500, q: 1.5, start: i * 0.07 + Math.random() * 0.03, laut: 0.4 });
}

export function aufheben() {
  const z = ort(null, null, 0.35); if (!z) return;
  ton(z, 0.08, { typ: 'triangle', freq: 660, laut: 0.4 }); ton(z, 0.12, { typ: 'triangle', freq: 990, start: 0.07, laut: 0.4 });
}

export function richtig() {
  const z = ort(null, null, 0.4); if (!z) return;
  [523, 659, 784].forEach((f, i) => ton(z, 0.25, { typ: 'triangle', freq: f, start: i * 0.1, laut: 0.4 }));
}

export function falsch() {
  const z = ort(null, null, 0.4); if (!z) return;
  ton(z, 0.35, { typ: 'square', freq: 140, freqEnde: 90, laut: 0.25 });
  rauschen(z, 0.25, { typ: 'bandpass', freq: 2500, q: 4, start: 0.05, laut: 0.3 });   // Schloss klappert
}

export function biss() {
  const z = ort(null, null, 0.8); if (!z) return;
  rauschen(z, 0.12, { typ: 'bandpass', freq: 1800, q: 1, a: 0.002, laut: 0.8 });
  ton(z, 0.3, { typ: 'sawtooth', freq: 220, freqEnde: 120, start: 0.05, laut: 0.2 });   // Aufschrei
}

export function schritt(drinnen) {
  const z = ort(null, null, drinnen ? 0.22 : 0.12); if (!z) return;
  rauschen(z, 0.06, { freq: drinnen ? 500 : 1200, a: 0.002, laut: 0.6 });
  if (drinnen) ton(z, 0.05, { freq: 90, a: 0.002, laut: 0.4 });
}

// ---------- Hintergrund: Wind draußen, Brummen drinnen ----------
function hintergrundAufbauen() {
  const src = ctx.createBufferSource(); src.buffer = rauschPuffer; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
  const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
  wind = ctx.createGain(); wind.gain.value = 0;
  src.connect(f); f.connect(wind); wind.connect(haupt); src.start(); lfo.start();

  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 50;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 100.7;
  brumm = ctx.createGain(); brumm.gain.value = 0;
  const b2 = ctx.createGain(); b2.gain.value = 0.3;
  o.connect(brumm); o2.connect(b2); b2.connect(brumm); brumm.connect(haupt); o.start(); o2.start();
}

export function umgebung(drinnen) {
  drinnenJetzt = drinnen;
  if (!ctx) return;
  brumm.gain.setTargetAtTime(drinnen ? 0.035 : 0, ctx.currentTime, 0.8);
  hintergrundPruefen();
}
