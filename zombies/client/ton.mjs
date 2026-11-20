// Geräusche – alles im Browser erzeugt (WebAudio), keine Tondateien.
// Lautstärke und Stereo-Seite richten sich nach der Entfernung zum eigenen Spieler.

let ctx = null, haupt = null, rauschPuffer = null, stufe = 1;
const BASIS = 0.36;                          // Grundpegel (früher 0.8 – war zu laut); die Stufe regelt darunter
const STUFEN = [1, 0.5, 0.25, 0];            // 100 %, 50 %, 25 %, stumm
let hx = 0, hy = 0;                         // Hörer (eigene Figur) in Pixeln
let wind = null, brumm = null;
const HOERWEITE = 900;                      // ab hier nichts mehr zu hören

try {
  const v = Number(localStorage.getItem('zombies_lautstaerke'));
  if (localStorage.getItem('zombies_lautstaerke') !== null && STUFEN.includes(v)) stufe = v;
  else if (localStorage.getItem('zombies_ton') === 'aus') stufe = 0;
} catch { /* ohne Speicher: 100 % */ }

export function tonAn() { return stufe > 0; }
export function lautstaerke() { return stufe; }
const pegel = () => BASIS * stufe;

// ---------- Tondateien (auf der Einstellungsseite Ereignissen zugeordnet) ----------
let zuordnung = {};                 // Ereignis → { dateien, laut }
const puffer = new Map();           // Datei → AudioBuffer | Promise | null (fehlt)
let drinnenJetzt = false, nachtJetzt = null;   // null = Tageszeit noch unbekannt
const hintergrund = { stadt: null, streuTimer: 0, krankTimer: 0 };

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

// ---------- Stimmenbegrenzung: bei vielen Zombies nicht alles gleichzeitig ----------
const MAX_STIMMEN = 8, MAX_ZOMBIE_STIMMEN = 4;
const ZOMBIE_IDS = new Set(['entdeckt', 'kriecher', 'stoehnen', 'zombieTod', 'zombielandTag', 'zombielandNacht']);
const MIN_ABSTAND = { entdeckt: 400, zombielandTag: 1500, zombielandNacht: 1500, zombieTod: 150, stoehnen: 300, kriecher: 400, menschGebissen: 300, hilferufe: 5000, krankenwagen: 60000, truheLeer: 400 };   // ms je Ereignis-ID
const stimmen = [];            // laufende Einzel-Geräusche aus Dateien: { ende (s), v, zombie, g, src }
const zuletzt = new Map();     // Ereignis-ID → Zeitpunkt (ms) des letzten Abspielens

// erlaubt dieses Ereignis jetzt (Mindestabstand)? Ohne Treffer wird nichts vermerkt
function abstandOk(id) {
  const min = MIN_ABSTAND[id] ?? 0;
  return !min || performance.now() - (zuletzt.get(id) ?? -1e9) >= min;
}
function abstandMerken(id) { if (MIN_ABSTAND[id]) zuletzt.set(id, performance.now()); }

// Platz für eine neue Stimme (Lautstärke v)? Sonst wird die leiseste verdrängt – ist es die neue, false
function stimmePlatz(zombie, v) {
  const jetzt = ctx.currentTime;
  for (let i = stimmen.length - 1; i >= 0; i--) if (stimmen[i].ende <= jetzt) stimmen.splice(i, 1);
  const leisest = liste => liste.reduce((m, q) => !m || q.v < m.v ? q : m, null);
  for (const [liste, max] of [[stimmen, MAX_STIMMEN], [stimmen.filter(q => q.zombie), MAX_ZOMBIE_STIMMEN]]) {
    if (!(zombie || liste === stimmen) || liste.length < max) continue;
    const l = leisest(liste);
    if (!l || l.v >= v) return false;
    try { l.g.gain.setTargetAtTime(0, jetzt, 0.03); l.src.stop(jetzt + 0.15); } catch { /* schon zu Ende */ }
    stimmen.splice(stimmen.indexOf(l), 1);
  }
  return true;
}

// eine zugeordnete Datei abspielen; false = keine da (dann erzeugt das Spiel selbst einen Ton)
function probe(id, x, y, extra = 1) {
  const t = zuordnung[id];
  if (!ctx || !t?.dateien?.length) return false;
  const bereit = t.dateien.map(geladen).filter(Boolean);
  if (!bereit.length) { t.dateien.forEach(laden); return false; }
  if (!abstandOk(id)) return true;   // zu kurz nach dem letzten: verworfen, auch kein Ersatzton
  const laut = (t.laut ?? 80) / 100 * extra;
  const z = ort(x, y, laut);
  if (!z) return true;   // zu weit weg: still, aber auch kein Ersatzton
  const v = z.gain.value, zombie = ZOMBIE_IDS.has(id);
  const buf = bereit[Math.floor(Math.random() * bereit.length)], rate = 0.94 + Math.random() * 0.12;
  if (!stimmePlatz(zombie, v)) { try { z.disconnect(); } catch { /* egal */ } return true; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(z); src.start();
  stimmen.push({ ende: ctx.currentTime + buf.duration / rate, v, zombie, g: z, src });
  abstandMerken(id);
  return true;
}

// ---------- Horden-Grollen: viele Zombies in Hörweite → ein dauerndes tiefes Brummen statt vieler Einzellaute ----------
const HORDE_AB = 25;            // ab so vielen Zombies in Hörweite
let hordeKnoten = null, hordeAnzahl = 0, hordeStand = 0;
export const hordeAktiv = () => hordeAnzahl > HORDE_AB;
// n = Zahl der Zombies in Hörweite; wird vom Spiel regelmäßig gemeldet (bleibt es aus, verklingt das Grollen)
export function horde(n) {
  hordeAnzahl = endlich(n); hordeStand = performance.now();
  hordeLaut();
}
function hordeLaut() {
  if (!ctx) return;
  const an = stufe > 0 && !document.hidden && hordeAnzahl > HORDE_AB;
  if (!hordeKnoten && !an) return;
  if (!hordeKnoten) {
    // Rauschen → Tiefpass, dazu zwei leicht verstimmte Sägezahn-Brummer; ein langsamer LFO lässt es wogen
    const src = ctx.createBufferSource(); src.buffer = rauschPuffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lg = ctx.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(f.frequency);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 52; o2.frequency.value = 55.5;
    const og = ctx.createGain(); og.gain.value = 0.25; o1.connect(og); o2.connect(og); og.connect(f);
    src.connect(f); f.connect(g); g.connect(haupt);
    src.start(); lfo.start(); o1.start(); o2.start();
    hordeKnoten = { g };
  }
  const ziel = an ? Math.min(0.5, 0.12 + (hordeAnzahl - HORDE_AB) / 120 * 0.4) * (drinnenJetzt ? 0.4 : 1) : 0;   // steigt mit der Zahl, gedeckelt
  hordeKnoten.g.gain.setTargetAtTime(ziel, ctx.currentTime, 1.2);
}
setInterval(() => { if (hordeKnoten && performance.now() - hordeStand > 6000) { hordeAnzahl = 0; } if (hordeKnoten) hordeLaut(); }, 2000);

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
  if (!ctx || stufe === 0 || document.hidden) return;
  const id = nachtJetzt ? 'zombielandNacht' : 'zombielandTag';
  const w = Math.random() * Math.PI * 2, d = 350 + Math.random() * 450;
  probe(id, hx + Math.cos(w) * d, hy + Math.sin(w) * d, drinnenJetzt ? 0.6 : 1.8);
}

// ferner Krankenwagen als Stimmung: selten (alle 2–5 Minuten), nur draußen, weit weg aus wechselnder Richtung
function krankenwagen() {
  hintergrund.krankTimer = setTimeout(krankenwagen, 60000 + Math.random() * 90000);
  if (!ctx || stufe === 0 || document.hidden || drinnenJetzt) return;
  const w = Math.random() * Math.PI * 2, d = 600 + Math.random() * 500;
  probe('krankenwagen', hx + Math.cos(w) * d, hy + Math.sin(w) * d, 1.6);
}

export function tageszeit(nacht) {
  if (nacht === nachtJetzt) return;
  const erstes = nachtJetzt === null;
  nachtJetzt = nacht;
  if (nacht && !erstes) probe('nachteinbruch');
}

// erst nach einer Berührung/einem Klick erlaubt der Browser Ton
export function tonStarten() {
  if (ctx) { if (!document.hidden) ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  haupt = ctx.createGain(); haupt.gain.value = pegel(); haupt.connect(ctx.destination);
  // 2 s weißes Rauschen als Grundstoff für Schuss, Wind, Schlurfen
  rauschPuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = rauschPuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  hintergrundAufbauen();
  vorladen();
  if (!hintergrund.streuTimer) hintergrund.streuTimer = setTimeout(streuen, 6000);
  if (!hintergrund.krankTimer) hintergrund.krankTimer = setTimeout(krankenwagen, 30000 + Math.random() * 60000);
}

// schaltet die Lautstärke durch (100 → 50 → 25 → stumm → 100 %), merkt sie im Browser, liefert die neue Stufe (0–1)
export function tonUmschalten() {
  stufe = STUFEN[(STUFEN.indexOf(stufe) + 1) % STUFEN.length];
  try { localStorage.setItem('zombies_lautstaerke', String(stufe)); localStorage.setItem('zombies_ton', stufe ? 'an' : 'aus'); } catch { /* egal */ }
  if (haupt) haupt.gain.setTargetAtTime(pegel(), ctx.currentTime, 0.05);
  return stufe;
}

// setzt die Lautstärke direkt (nur 1, 0.5, 0.25 oder 0), merkt sie im Browser
export function lautstaerkeSetzen(v) {
  if (!STUFEN.includes(v)) return stufe;
  stufe = v;
  try { localStorage.setItem('zombies_lautstaerke', String(stufe)); localStorage.setItem('zombies_ton', stufe ? 'an' : 'aus'); } catch { /* egal */ }
  if (haupt) haupt.gain.setTargetAtTime(pegel(), ctx.currentTime, 0.05);
  return stufe;
}

// Hörerposition; ungültige Werte (Figur noch nicht da) ignorieren – sonst rechnet jedes Geräusch mit NaN
let hoerBekanntSeit = 0;   // Zeitpunkt, ab dem die Hörerposition bekannt ist; Ortstöne erst ~2 s danach (Beitritt: Nachrichten/Erstabgleich)
export function hoerer(x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { hx = x; hy = y; if (!hoerBekanntSeit) hoerBekanntSeit = performance.now(); } }
const endlich = (v, ersatz = 0) => Number.isFinite(v) ? v : ersatz;

// Ausgang für ein Geräusch an Position (x, y); null = zu weit weg
function ort(x, y, laut = 1) {
  if (!ctx || stufe === 0) return null;
  let v = laut, pan = 0;
  if (x != null) {
    if (!hoerBekanntSeit || performance.now() - hoerBekanntSeit < 2000) return null;   // Hörer unbekannt (0/0) → sonst volle Lautstärke aus dem Nichts
    const d = Math.hypot(x - hx, y - hy);
    if (!Number.isFinite(d) || d > HOERWEITE) return null;
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
const SCHUSS_EREIGNIS = { pistole: 'schussPistole', mp: 'schussPistole', gewehr: 'schussGewehr', mg: 'schussGewehr', scharfschuetze: 'schussGewehr', schrotflinte: 'schussSchrot' };
export function schuss(x, y, laut = 1, art = 'pistole') {
  if (art === 'armbrust') {   // leises Sirren der Sehne, kein Knall
    const z = ort(x, y, laut); if (!z) return;
    ton(z, 0.14, { typ: 'triangle', freq: 520, freqEnde: 190, a: 0.002, laut: 0.5 });
    rauschen(z, 0.06, { freq: 3500, freqEnde: 1800, a: 0.002, laut: 0.25 });
    return;
  }
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
  if (!abstandOk('zombieTod')) return; abstandMerken('zombieTod');
  const z = ort(x, y, 0.8); if (!z) return;
  rauschen(z, 0.3, { freq: 600, freqEnde: 120, laut: 0.7 });
  ton(z, 0.45, { typ: 'sawtooth', freq: 160, freqEnde: 55, laut: 0.18 });
}

// Stöhnen: tiefe Sägezahnstimme mit Formantfilter und Zittern
export function stoehnen(x, y, laut = 0.5, kriecht = false) {
  if (hordeAktiv() && Math.random() < 0.6) return;   // in der Horde: Einzellaute noch seltener
  if (probe(kriecht ? 'kriecher' : 'stoehnen', x, y, laut * 1.6)) return;
  if (!abstandOk('stoehnen')) return;
  const z = ort(x, y, laut); if (!z) return;
  abstandMerken('stoehnen');
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
  if (!abstandOk('entdeckt')) return; abstandMerken('entdeckt');
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

// Wassermangel: trockenes Husten/Keuchen (gefiltertes Rauschen + rauer Ton) und leises Tropfen, komplett synthetisiert
// Stimme für den Durst-Ton: je Gerät einmal zufällig festgelegt (das Aussehen kennt kein Geschlecht)
let stimme = null;
function durstStimme() {
  if (stimme) return stimme;
  try { stimme = localStorage.getItem('zob_stimme'); } catch {}
  if (stimme !== 'durstMann' && stimme !== 'durstFrau') { stimme = Math.random() < 0.5 ? 'durstMann' : 'durstFrau'; try { localStorage.setItem('zob_stimme', stimme); } catch {} }
  return stimme;
}
// Nachladen: Ton aus der Verwaltung, sonst zwei kurze Klicks (Magazin raus, Magazin rein)
export function nachladen(x, y) {
  if (document.hidden) return;
  if (probe('nachladen', x, y)) return;
  const z = ort(x, y, 0.6); if (!z) return;
  rauschen(z, 0.05, { typ: 'highpass', freq: 2500, freqEnde: 5000, laut: 0.45 });
  ton(z, 0.06, { typ: 'square', freq: 1200, freqEnde: 700, a: 0.002, laut: 0.18 });
  rauschen(z, 0.07, { typ: 'highpass', freq: 3000, freqEnde: 6000, start: 0.5, laut: 0.55 });
  ton(z, 0.08, { typ: 'square', freq: 900, freqEnde: 450, start: 0.5, a: 0.002, laut: 0.22 });
}
// Hülse fällt zu Boden (nur in Räumen, kurz nach dem Schuss)
export function huelse(x, y) {
  if (document.hidden) return;
  setTimeout(() => probe('huelse', x, y), 300 + Math.random() * 200);
}
export function durst() {
  if (document.hidden) return;
  if (probe(durstStimme(), null, null)) return;
  const z = ort(null, null, 0.5); if (!z) return;
  // zwei trockene Huster
  for (let i = 0; i < 2; i++) {
    const t0 = i * 0.22;
    rauschen(z, 0.14, { typ: 'bandpass', freq: 900 + Math.random() * 300, q: 1.2, start: t0, a: 0.01, laut: 0.55 });
    ton(z, 0.12, { typ: 'sawtooth', freq: 190 - i * 20, freqEnde: 110, start: t0, laut: 0.12 });
  }
  // raues Einatmen
  rauschen(z, 0.45, { typ: 'highpass', freq: 2200, q: 0.7, start: 0.6, a: 0.2, laut: 0.18 });
  // Tropfen: kurzer, fallender Sinus mit leisem Nachhall
  ton(z, 0.09, { typ: 'sine', freq: 1500, freqEnde: 650, start: 1.25, a: 0.004, laut: 0.28 });
  ton(z, 0.12, { typ: 'sine', freq: 1500, freqEnde: 650, start: 1.47, a: 0.004, laut: 0.1 });
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

// Chat-Benachrichtigung: kurzes, weiches „Ding-Dong“ (höchstens alle 1,5 s, nicht im Hintergrund, stumm = nichts)
let nachrichtZuletzt = 0;
export function nachricht() {
  if (document.hidden) return;
  const jetzt = performance.now();
  if (jetzt - nachrichtZuletzt < 1500) return;
  if (!ctx) return;
  nachrichtZuletzt = jetzt;
  if (probe('chatKlingel', null, null)) return;   // zugeordnete Datei (klingelton1.mp3)
  const z2 = ort(null, null, 0.8); if (!z2) return;
  ton(z2, 0.35, { typ: 'sine', freq: 988, start: 0, a: 0.01, laut: 0.9 });
  ton(z2, 0.2, { typ: 'sine', freq: 1976, start: 0, a: 0.01, laut: 0.12 });
  ton(z2, 0.5, { typ: 'sine', freq: 784, start: 0.16, a: 0.01, laut: 0.9 });
  ton(z2, 0.3, { typ: 'sine', freq: 1568, start: 0.16, a: 0.01, laut: 0.12 });
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
  h.g.gain.setTargetAtTime(stufe > 0 ? Math.max(0, v) * h.laut : 0, ctx.currentTime, 0.3);
}

// Radio-Gegenstand: Schleife aus der Zuordnung „Radio“, sonst aus „Autoradio“, sonst erzeugte Musik (kleine Melodie, Rauschen darunter).
// Wie die Sirene lenkbar (sireneLage / sireneStoppen); null, solange der Ton aus ist.
export function radioStarten() {
  if (!ctx) return null;
  for (const id of ['radio', 'autoradio']) { const h = schleifeStarten(id); if (h) return h; }
  const g = ctx.createGain(); g.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { g.connect(pan); pan.connect(haupt); } else g.connect(haupt);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
  const o = ctx.createOscillator(); o.type = 'square';
  const og = ctx.createGain(); og.gain.value = 0.16;
  const NOTEN = [262, 330, 392, 330, 294, 349, 440, 349, 262, 392, 523, 392, 330, 294, 262, 196];   // C-Dur-Melodie, Achtel 0,28 s
  const jetzt = ctx.currentTime;
  for (let i = 0; i < 330; i++) o.frequency.setValueAtTime(NOTEN[i % NOTEN.length] * (Math.floor(i / 16) % 2 ? 1.122 : 1), jetzt + i * 0.28);
  o.connect(og); og.connect(f); f.connect(g); o.start();
  const rs = ctx.createBufferSource(); rs.buffer = rauschPuffer; rs.loop = true;
  const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3000; rf.Q.value = 0.8;
  const rg = ctx.createGain(); rg.gain.value = 0.12;
  rs.connect(rf); rf.connect(rg); rg.connect(g); rs.start();
  return { g, pan, laut: 0.45, quellen: [o, rs], rate: null, osz: o };
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
  const v = endlich(stufe > 0 && !stumm ? Math.max(0, 1 - d / weite) ** 1.5 * h.laut : 0);
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
  brand.g.gain.setTargetAtTime(stufe > 0 ? Math.min(0.35, staerke * 0.3) : 0, ctx.currentTime, 0.4);
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
// Beim Öffnen der Seite sofort versuchen; blockiert der Browser (AudioContext bleibt "suspended"), startet die erste
// Berührung/Taste irgendwo auf der Seite die Musik (Listener entfernt sich, sobald der Ton läuft).
export function musikSofort(startseiteSichtbar = () => true) {
  const los = () => {
    if (musikAus || !startseiteSichtbar()) return;
    try { musikStarten(); } catch { /* egal */ }
    if (!ctx || document.hidden) return;
    try { Promise.resolve(ctx.resume?.()).catch(() => { /* weiter warten */ }); } catch { /* egal */ }
  };
  const ARTEN = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];
  const ab = () => { for (const a of ARTEN) document.removeEventListener(a, geste, true); };
  const geste = () => {
    los();
    // erst abmelden, wenn der Ton wirklich läuft; sonst bei der nächsten Geste noch einmal
    setTimeout(() => { if (musikAus || !startseiteSichtbar() || ctx?.state === 'running') ab(); }, 300);
  };
  for (const a of ARTEN) document.addEventListener(a, geste, true);
  los();
}
export function musikAusblenden(sek = 4) {
  musikAus = true;
  if (!musik || !ctx) return;
  const m = musik; musik = null;
  m.g.gain.setTargetAtTime(0, ctx.currentTime, sek / 3);
  setTimeout(() => { try { m.src.stop(); } catch { /* schon aus */ } }, sek * 1500);
}

// Handy aus / Browser im Hintergrund: Ton anhalten (AudioContext schlafen legen), beim Zurückkehren weiter
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  try {
    if (document.hidden) ctx.suspend?.();
    else ctx.resume?.();
  } catch { /* egal */ }
});
