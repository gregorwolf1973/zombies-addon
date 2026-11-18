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

// Hörerposition; ungültige Werte (Figur noch nicht da) ignorieren – sonst rechnet jedes Geräusch mit NaN
export function hoerer(x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { hx = x; hy = y; } }
const endlich = (v, ersatz = 0) => Number.isFinite(v) ? v : ersatz;

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
  v = endlich(v); pan = endlich(pan);
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
const SCHUSS_EREIGNIS = { pistole: 'schussPistole', mp: 'schussPistole', gewehr: 'schussGewehr', mg: 'schussGewehr', schrotflinte: 'schussSchrot' };
export function schuss(x, y, laut = 1, art = 'pistole') {
  if (probe(SCHUSS_EREIGNIS[art] ?? 'schussPistole', x, y, art === 'schrotflinte' ? 1.1 : 1)) return;
  const z = ort(x, y, laut); if (!z) return;
  rauschen(z, 0.35, { freq: 2500, freqEnde: 300, a: 0.002, laut: 1 });
  ton(z, 0.18, { typ: 'triangle', freq: 140, freqEnde: 45, a: 0.002, laut: 0.8 });
}

// Kanone (Puma) und Handgranate: das lauteste vorhandene Schussgeräusch (Schrotflinte), sonst ein tiefer Knall mit langem Nachhall
export function kanone(x, y) {
  if (probe('schussSchrot', x, y, 1.9)) return;
  boom(x, y, 1.6);
}
export function explosion(x, y) {
  if (probe('schussSchrot', x, y, 2.2)) return;
  boom(x, y, 2.2);
}
function boom(x, y, laut) {
  const z = ort(x, y, laut); if (!z) return;
  rauschen(z, 0.9, { freq: 1800, freqEnde: 120, a: 0.002, laut: 1 });
  ton(z, 0.55, { typ: 'sine', freq: 90, freqEnde: 28, a: 0.002, laut: 1 });
  rauschen(z, 0.5, { typ: 'bandpass', freq: 400, freqEnde: 90, q: 0.7, start: 0.12, laut: 0.5 });
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
  if (probe(offen ? 'tuerAuf' : 'tuerZu')) return;
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

// Knistern eines Brandes (erzeugt): kurze, raue Knackser
export function knistern(x, y, staerke = 1) {
  const z = ort(x, y, 0.7 * staerke); if (!z) return;
  for (let i = 0; i < 3; i++) rauschen(z, 0.04 + Math.random() * 0.05, { typ: 'bandpass', freq: 1500 + Math.random() * 3000, q: 2, start: Math.random() * 0.25, a: 0.002, laut: 0.5 + Math.random() * 0.5 });
  rauschen(z, 0.4, { freq: 300, start: 0, laut: 0.25 });
}

// ---------- Sirene: läuft dauernd, solange das Fahrzeug da ist; Lautstärke, Richtung und Tonhöhe folgen der Entfernung ----------
// Mit zugeordneter Datei (Ereignis „Sirene“) als Schleife, sonst ein erzeugtes Martinshorn (a' 440 Hz / d'' 587 Hz).
// allgemeine Schleife an einem bewegten Ding (z. B. Autoradio); ohne zugeordnete Datei: null
export function schleifeStarten(id) {
  if (!ctx) return null;
  const t = zuordnung[id], liste = (t?.dateien ?? []).map(geladen).filter(Boolean);
  if (!liste.length) { (t?.dateien ?? []).forEach(laden); return null; }
  const g = ctx.createGain(); g.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { g.connect(pan); pan.connect(haupt); } else g.connect(haupt);
  const buf = liste[Math.floor(Math.random() * liste.length)];
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start(0, Math.random() * buf.duration);
  return { g, pan, laut: (t?.laut ?? 50) / 100, quellen: [src], rate: src.playbackRate };
}

// Lautstärke einer Schleife (0–1 vor dem Einstellungs-Regler) sanft setzen, z. B. Wasserrauschen nach Uferabstand
export function schleifeLaut(h, v) {
  if (!h || !ctx) return;
  h.g.gain.setTargetAtTime(an ? Math.max(0, v) * h.laut : 0, ctx.currentTime, 0.3);
}

export function sireneStarten() {
  if (!ctx) return null;
  const g = ctx.createGain(); g.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { g.connect(pan); pan.connect(haupt); } else g.connect(haupt);
  const t = zuordnung.sirene, buf = t?.dateien?.map(geladen).find(Boolean);
  const h = { g, pan, laut: (t?.laut ?? 60) / 100, quellen: [] };
  if (buf) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    src.connect(g); src.start(0, Math.random() * buf.duration); h.quellen.push(src); h.rate = src.playbackRate;
  } else {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7;
    const jetzt = ctx.currentTime;
    for (let i = 0; i < 400; i++) o.frequency.setValueAtTime(i % 2 ? 587 : 440, jetzt + i * 0.65);   // gut 4 Minuten Tatütata
    o.connect(f); f.connect(g); o.start(); h.quellen.push(o); h.rate = null; h.osz = o;
    h.laut *= 0.35;
  }
  return h;
}
// weite: Hörweite in Pixeln (Vorgabe 1400; die Sirene nutzt weniger), stumm: sofort weich ausblenden
export function sireneLage(h, x, y, naeher, weite = 1400, stumm = false) {
  if (!h || !ctx) return;
  const d = Math.hypot(x - hx, y - hy);
  const v = endlich(an && !stumm ? Math.max(0, 1 - d / weite) ** 1.5 * h.laut : 0);
  h.g.gain.setTargetAtTime(v, ctx.currentTime, stumm ? 0.2 : 0.12);       // sanft ein- und ausblenden (kurz)
  if (h.pan) h.pan.pan.setTargetAtTime(endlich(Math.max(-1, Math.min(1, (x - hx) / 500))), ctx.currentTime, 0.1);
  const doppler = endlich(Math.max(0.9, Math.min(1.1, 1 + naeher / 1600)), 1);          // kommt näher: höher, fährt weg: tiefer
  if (h.rate) h.rate.setTargetAtTime(doppler, ctx.currentTime, 0.2);
  else if (h.osz) h.osz.detune.setTargetAtTime((doppler - 1) * 1200, ctx.currentTime, 0.2);
}
export function sireneStoppen(h) {
  if (!h || !ctx) return;
  h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  setTimeout(() => { for (const q of h.quellen) { try { q.stop(); } catch { /* schon aus */ } } }, 700);
}

// ---------- Brandrauschen: dauerndes Fauchen, Stärke nach Nähe und Größe der Brände ----------
let brand = null;
export function brandRauschen(staerke) {
  if (!ctx) return;
  if (!brand) {
    const src = ctx.createBufferSource(); src.buffer = rauschPuffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(haupt); src.start();
    brand = { g, f };
  }
  brand.g.gain.setTargetAtTime(an ? Math.min(0.35, staerke * 0.3) : 0, ctx.currentTime, 0.4);
  brand.f.frequency.setTargetAtTime(500 + Math.random() * 300, ctx.currentTime, 0.1);   // flackernd
}

// ---------- Startmusik: nach dem ersten Antippen der Startseite, blendet beim Spielbeginn aus ----------
let musik = null;
export function musikStarten() {
  tonStarten();
  if (!ctx || musik) return;
  const t = zuordnung.startmusik, liste = (t?.dateien ?? []);
  if (!liste.length) return;
  const buf = liste.map(geladen).filter(Boolean);
  if (!buf.length) { Promise.all(liste.map(laden)).then(() => { if (!musik && !musikAus) musikStarten(); }); return; }
  const g = ctx.createGain(); g.gain.value = 0; g.connect(haupt);
  const src = ctx.createBufferSource(); src.buffer = buf[Math.floor(Math.random() * buf.length)]; src.loop = true; src.connect(g); src.start();
  g.gain.setTargetAtTime((t.laut ?? 55) / 100, ctx.currentTime, 0.8);
  musik = { g, src };
}
let musikAus = false;
export function musikAusblenden(sek = 4) {
  musikAus = true;
  if (!musik || !ctx) return;
  const m = musik; musik = null;
  m.g.gain.setTargetAtTime(0, ctx.currentTime, sek / 3);
  setTimeout(() => { try { m.src.stop(); } catch { /* schon aus */ } }, sek * 1500);
}
