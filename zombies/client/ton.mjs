// Geräusche – alles im Browser erzeugt (WebAudio), keine Tondateien.
// Lautstärke und Stereo-Seite richten sich nach der Entfernung zum eigenen Spieler.

import { stimmeZuweisen } from './tonlogik.mjs';
import { hordeEinstellung, zaehleHoerbare, hordeSchritt, einzelschreiOk, akzentSchritt, PIXEL_JE_METER } from './hordenlogik.mjs';
import { musikSchritt, naechstesStueck } from './musiklogik.mjs';
import { anAusLesen, GERAET_SCHLUESSEL } from './einstellungen_regeln.mjs';
let ctx = null, haupt = null, rauschPuffer = null, stufe = 1;
const BASIS = 0.72;                          // Grundpegel (0.36 → 0.72 mit den gemessenen Lautstärken je Ereignis; früher 0.8)
const EFFEKT_FAKTOR = 0.75;                  // Spielgeräusche 25 % leiser als zuvor (Stimmen kommen besser durch); Musik behält ihren Pegel
let zombieTonAn = true, musikAn = true, radioAn = true;      // Zahnrad-Menü (je Gerät): Zombie-Einzelgeräusche, Musik, Autoradio
const STUFEN = [1, 0.5, 0.25, 0];            // 100 %, 50 %, 25 %, stumm
let hx = 0, hy = 0;                         // Hörer (eigene Figur) in Pixeln
let wind = null, brumm = null;
const HOERWEITE = 900;                      // ab hier nichts mehr zu hören

try {
  const v = Number(localStorage.getItem('zombies_lautstaerke'));
  if (localStorage.getItem('zombies_lautstaerke') !== null && STUFEN.includes(v)) stufe = v;
  else if (localStorage.getItem('zombies_ton') === 'aus') stufe = 0;
  zombieTonAn = anAusLesen(localStorage.getItem(GERAET_SCHLUESSEL.zombieTon));
  musikAn = anAusLesen(localStorage.getItem(GERAET_SCHLUESSEL.musik));
  radioAn = anAusLesen(localStorage.getItem(GERAET_SCHLUESSEL.autoradio));
} catch { /* ohne Speicher: 100 % */ }

export function tonAn() { return stufe > 0; }
export function lautstaerke() { return stufe; }
const pegel = () => BASIS * stufe;
const pegelEffekt = () => pegel() * EFFEKT_FAKTOR;
let musikAusgang = null;   // Musik (Spiel- und Startmusik) läuft an haupt vorbei, damit der Effekt-Faktor sie nicht leiser macht
function pegelAnwenden(zeitkonstante = 0.05) {
  if (!ctx) return;
  if (haupt) haupt.gain.setTargetAtTime(pegelEffekt(), ctx.currentTime, zeitkonstante);
  if (musikAusgang) musikAusgang.gain.setTargetAtTime(pegel(), ctx.currentTime, zeitkonstante);
}
// Zombie-Einzelgeräusche stumm schalten (Horde, „entdeckt“ bleiben)
export function zombieTonSetzen(an) { zombieTonAn = !!an; }
const zombieStumm = id => !zombieTonAn && ZOMBIE_IDS.has(id) && id !== 'entdeckt';
export function musikSetzen(an) {
  musikAn = !!an;
  if (!ctx) return;
  if (!musikAn) {
    musikAnwenden(null);   // Spielmusik ausblenden; kommt bei „an“ mit der nächsten Lage (≈1 s) wieder
    if (musik) { const m = musik; musik = null; if (m.strom) m.strom.stop(1); else { m.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { try { m.src.stop(); } catch { /* schon aus */ } }, 1500); } }
  }
}

// Autoradio (Live-Radio und Datei in fahrenden/geparkten Autos): eigener Schalter, unabhängig von „Musik“
export function autoradioSetzen(an) {
  radioAn = !!an;
  if (!ctx) return;
  radioPegel();
  if (radioAn) radioVorstart(); else if (radioEl) radioPausieren(true);
}
export const autoradioAn = () => radioAn;

// ---------- Tondateien (auf der Einstellungsseite Ereignissen zugeordnet) ----------
let zuordnung = {};                 // Ereignis → { dateien, laut }
const puffer = new Map();           // Datei → AudioBuffer | Promise | null (fehlt)
let drinnenJetzt = false, nachtJetzt = null;   // null = Tageszeit noch unbekannt
const hintergrund = { stadt: null, streuTimer: 0, krankTimer: 0 };

export function toeneZuordnen(z) { zuordnung = z && typeof z === 'object' ? z : {}; if (ctx) vorladen(); }

// Musikdatei? (bleibt Stereo; Effekte werden räumlich gemischt und dürfen Mono sein)
const istMusik = datei => Object.entries(zuordnung).some(([id, t]) => id.startsWith('musik') && t?.dateien?.includes(datei));
// Dekodierte Töne liegen als Float32 im Speicher (1 min Stereo ≈ 23 MB) – lange Effekte auf Mono halbieren (iPhone/iPad!)
const MONO_AB_S = 8;
function monoMachen(buf) {
  if (buf.numberOfChannels < 2 || buf.duration < MONO_AB_S) return buf;
  try {
    const m = ctx.createBuffer(1, buf.length, buf.sampleRate), z = m.getChannelData(0), k = buf.numberOfChannels;
    for (let c = 0; c < k; c++) { const q = buf.getChannelData(c); for (let i = 0; i < q.length; i++) z[i] += q[i] / k; }
    return m;
  } catch { return buf; }
}
const LADE_FEHLER = new Map();     // Datei → { n (Versuche), t (ms, letzter Fehlschlag) }
const LADE_WIEDER_MS = 5000, LADE_MAX = 3;   // fehlgeschlagene Ladeversuche nach 5 s erneut, höchstens 3 Versuche insgesamt
function laden(datei) {
  if (puffer.has(datei)) {
    const b = puffer.get(datei);
    if (b !== null) return b;
    const f = LADE_FEHLER.get(datei);
    if (!f || f.n >= LADE_MAX || performance.now() - f.t < LADE_WIEDER_MS) return null;   // fehlt (noch): kein Dauer-Abruf
  }
  const p = fetch('toene/' + encodeURIComponent(datei))
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
    .then(b => new Promise((ok, fehl) => ctx.decodeAudioData(b, ok, fehl)))
    .then(buf => istMusik(datei) ? buf : monoMachen(buf))
    .then(buf => { puffer.set(datei, buf); LADE_FEHLER.delete(datei); hintergrundPruefen(); return buf; })
    .catch(() => { const f = LADE_FEHLER.get(datei); LADE_FEHLER.set(datei, { n: (f?.n ?? 0) + 1, t: performance.now() }); puffer.set(datei, null); return null; });
  puffer.set(datei, p);
  return p;
}
// Vorladen nacheinander und erst nach einer Pause (Welt wird in der Zeit aufgebaut): vorher liefen ~40 Downloads und Dekodierungen
// gleichzeitig, das bremste den Start und sprengte auf iPhone/iPad den Speicher. Was vorher gebraucht wird, lädt probe() sofort selbst.
// Spielmusik (musik…) wird erst bei Bedarf geladen.
let vorladeLauf = 0;
const VORLADE_PAUSE_MS = 6000;
function vorladen() {
  const lauf = ++vorladeLauf;
  const rang = id => /^schuss/.test(id) ? 0 : /^(zombieTod|weg)/.test(id) ? 1 : /^huelse/.test(id) ? 2 : /tuer|tür/i.test(id) ? 3 : 4;   // Rückmeldung zum eigenen Handeln zuerst
  const liste = [...new Set(Object.entries(zuordnung).filter(([id]) => !id.startsWith('musik')).sort((a, b) => rang(a[0]) - rang(b[0])).flatMap(([, t]) => t?.dateien ?? []))];
  const weiter = () => {
    if (lauf !== vorladeLauf) return;   // neue Zuordnung: neuer Durchlauf
    const d = liste.shift();
    if (d === undefined) { hintergrundPruefen(); return; }
    Promise.resolve(laden(d)).finally(() => setTimeout(weiter, 50));
  };
  setTimeout(weiter, VORLADE_PAUSE_MS);
  hintergrundPruefen();
}
const geladen = d => { const b = puffer.get(d); return b instanceof AudioBuffer ? b : null; };

// ---------- Stimmenbegrenzung: bei vielen Zombies nicht alles gleichzeitig ----------
const MAX_STIMMEN = 10, MAX_ZOMBIE_STIMMEN = 5;
const ZOMBIE_IDS = new Set(['entdeckt', 'kriecher', 'stoehnen', 'zombieTod', 'zombielandTag', 'zombielandNacht']);
const MIN_ABSTAND = { entdeckt: 3000, zombielandTag: 1500, zombielandNacht: 1500, zombieTod: 120, stoehnen: 250, kriecher: 400, menschGebissen: 300, hilferufe: 5000, wimmern: 4000, soldatRuf: 8000, hundBellen: 2500, krankenwagen: 60000, truheLeer: 400 };   // ms je Ereignis-ID
const stimmen = [];            // laufende Einzel-Geräusche aus Dateien: { ende (s), v, zombie, g, src }
const zuletzt = new Map();     // Ereignis-ID → Zeitpunkt (ms) des letzten Abspielens

// erlaubt dieses Ereignis jetzt (Mindestabstand)? Ohne Treffer wird nichts vermerkt
function abstandOk(id) {
  const min = MIN_ABSTAND[id] ?? 0;
  return !min || performance.now() - (zuletzt.get(id) ?? -1e9) >= min;
}
function abstandMerken(id) { if (MIN_ABSTAND[id]) zuletzt.set(id, performance.now()); }

// Platz für eine neue Stimme (Lautstärke v)? Dauerfeuer-Quelle: ältester eigener Ton wird abgelöst; sonst leiseste verdrängt – ist es die neue, false
function stimmePlatz(zombie, v, quelle, prio = false) {
  const jetzt = ctx.currentTime;
  if (ctx.state !== 'running') stimmen.length = 0;   // Uhr steht (gesperrt/unterbrochen): nichts läuft wirklich, keine Stimme belegt Platz
  const r = stimmeZuweisen(stimmen, { jetzt, zombie, v, quelle, prio });
  for (const l of r.verdraengt) try { l.g.gain.setTargetAtTime(0, jetzt, 0.02); l.src.stop(jetzt + 0.1); } catch { /* schon zu Ende */ }
  return r.ok;
}
const SCHUSS_IDS = new Set(['schussPistole', 'schussGewehr', 'schussSchrot']);
const PRIO_IDS = new Set([...SCHUSS_IDS, 'zombieTod']);   // Rückmeldung zum eigenen Handeln: nie wegen voller Stimmen verwerfen
const SCHUSS_MAX_SEK = 0.45;   // bei hoher Kadenz Schusstöne kürzen (Ausklingen per Gain-Rampe)

// eine zugeordnete Datei abspielen; false = keine da (dann erzeugt das Spiel selbst einen Ton)
function probe(id, x, y, extra = 1) {
  const t = zuordnung[id];
  if (!ctx || !t?.dateien?.length) return false;
  weckeKontext();
  if (zombieStumm(id)) return true;   // Zahnrad: Zombiegeräusche aus – auch kein Ersatzton
  if (ctx.state !== 'running') return true;   // Kontext schläft: Ereignis verwerfen, kein Ersatzton, keine Warteschlange
  const bereit = t.dateien.map(geladen).filter(Boolean);
  if (!bereit.length) { t.dateien.forEach(laden); return false; }
  if (!abstandOk(id)) return true;   // zu kurz nach dem letzten: verworfen, auch kein Ersatzton
  const laut = (t.laut ?? 80) / 100 * extra;
  const z = ort(x, y, laut);
  if (!z) return true;   // zu weit weg: still, aber auch kein Ersatzton
  const v = z.gain.value, zombie = ZOMBIE_IDS.has(id);
  const buf = bereit[Math.floor(Math.random() * bereit.length)], rate = 0.94 + Math.random() * 0.12;
  const kurz = SCHUSS_IDS.has(id);
  const quelle = kurz ? id + ':' + (x == null ? 'ich' : Math.round(x / 400) + ',' + Math.round(y / 400)) : null;
  if (!stimmePlatz(zombie, v, quelle, PRIO_IDS.has(id))) { try { z.disconnect(); } catch { /* egal */ } return true; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(z); src.start();
  let dauer = buf.duration / rate;
  if (kurz && dauer > SCHUSS_MAX_SEK) {
    dauer = SCHUSS_MAX_SEK;
    try { const t0 = ctx.currentTime; z.gain.setValueAtTime(v, t0 + dauer - 0.15); z.gain.linearRampToValueAtTime(0, t0 + dauer); src.stop(t0 + dauer + 0.02); } catch { /* egal */ }
  }
  const stimme = { ende: ctx.currentTime + dauer, v, zombie, quelle, g: z, src };
  stimmen.push(stimme);
  src.onended = () => { const i = stimmen.indexOf(stimme); if (i >= 0) stimmen.splice(i, 1); };   // Stimme sicher freigeben, auch wenn die Uhr steht
  abstandMerken(id);
  return true;
}

// ---------- Hordengeräusch: viele Zombies in Hörweite → Schleife aus Dateien (Ereignis „horde“) statt vieler Einzelschreie ----------
// Schwellen, Hysterese und Lautstärke: client/hordenlogik.mjs; Einstellungen kommen von /info (toeneHorde, musik)
let hordeEin = hordeEinstellung(), musikEin = { laut: 35, blende: 3 };
let hordeSt = { aktiv: false, pegel: 0, halb: false, nur: false, n: 0 }, akzentSt = null, hordeLoop = null, letzterNah = -1e9;
export const hordeAktiv = () => hordeSt.aktiv;
export function toneEinstellungen(i) {
  hordeEin = hordeEinstellung(i?.toeneHorde);
  const r = i?.radioStream ?? {}, rl = Number(r.laut);
  const url = typeof r.url === 'string' && r.url.startsWith('https://') ? r.url : '';
  if (radioEl && radioEin.url !== url) radioPausieren(true);   // Senderwechsel: beim nächsten Auto neu verbinden
  const rv = Number(r.vorlauf);
  const rd = Number(r.durchsage);
  radioEin = { an: r.an === true && !!url, url, laut: Number.isFinite(rl) ? Math.max(0, Math.min(100, rl)) : 60, vorlauf: Number.isFinite(rv) ? Math.max(0, Math.min(120, rv)) : 30, durchsage: Number.isFinite(rd) ? Math.max(0, Math.min(30, rd)) : 4 };
  if (!radioEin.an && radioEl) radioPausieren(true);
  else radioVorstart();
  radioPegel();
  const L = Number(i?.musik?.laut), B = Number(i?.musik?.blende);
  musikEin = { laut: Number.isFinite(L) ? Math.max(0, Math.min(100, L)) : 35, blende: Number.isFinite(B) ? Math.max(1, Math.min(10, B)) : 3 };
}
// darf dieser Einzelschrei (Zombie bei x, y) jetzt kommen? In der Horde seltener bzw. nur aus der Nähe
function schreiErlaubt(x, y) {
  const d = x == null ? 0 : Math.hypot(x - hx, y - hy) / PIXEL_JE_METER, jetzt = performance.now();
  const ok = einzelschreiOk(hordeSt, { abstandMeter: d, jetzt, letzter: letzterNah });
  if (ok && hordeSt.nur) letzterNah = jetzt;
  return ok;
}
// zombies: Zombies der Karte, ich: { x, y, ebene }; etwa jede Sekunde vom Spiel aufgerufen
export function hordeLage(zombies, ich) {
  const z = zaehleHoerbare(zombies, ich, hordeEin.hoerweite);
  hordeSt = hordeSchritt(hordeSt, z.n, hordeEin);
  akzentSt = akzentSchritt(akzentSt, z.n, performance.now(), hordeEin);
  if (akzentSt.spiele && ctx && stufe > 0 && !document.hidden) probe('hordeAkzent', null, null, drinnenJetzt ? 0.4 : 1);
  hordeSchleife(z);
}
function hordeSchleife(z) {
  if (!ctx) return;
  const t = zuordnung.horde, laut = (t?.laut ?? 80) / 100;
  const an = hordeSt.aktiv && stufe > 0 && !document.hidden && !!t?.dateien?.length;
  if (an && !hordeLoop) {
    const bereit = t.dateien.map(geladen).filter(Boolean);
    if (!bereit.length) { t.dateien.forEach(laden); return; }
    const buf = bereit[Math.floor(Math.random() * bereit.length)];
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(g); if (pan) { g.connect(pan); pan.connect(haupt); } else g.connect(haupt);
    src.start(0, Math.random() * buf.duration);
    hordeLoop = { src, g, pan, timer: 0 };
  }
  const l = hordeLoop;
  if (!l) return;
  const jetzt = ctx.currentTime;
  if (an) {
    clearTimeout(l.timer); l.timer = 0;
    l.g.gain.setTargetAtTime(hordeSt.pegel * laut * (drinnenJetzt ? 0.4 : 1), jetzt, 0.7);   // Einblenden ≈ 2 s
    if (l.pan && z.sx != null) l.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, endlich((z.sx - hx) / (hordeEin.hoerweite * PIXEL_JE_METER)))), jetzt, 0.5);
  } else if (!l.timer) {
    l.g.gain.setTargetAtTime(0, jetzt, 1);   // Ausblenden ≈ 3 s, danach Schleife beenden
    l.timer = setTimeout(() => { if (hordeLoop === l) { hordeLoop = null; try { l.src.stop(); } catch { /* schon aus */ } } }, 4500);
  }
  musikLautstaerke();
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

// AudioContext aufwecken, falls der Browser ihn gesperrt/unterbrochen hat (ohne Geste kann das ablehnen – schadet nicht)
let weckT = 0;
function weckeKontext() {
  if (!ctx || ctx.state === 'running' || document.hidden) return;
  const jetzt = performance.now();
  if (jetzt - weckT < 500) return;
  weckT = jetzt;
  try { Promise.resolve(ctx.resume?.()).catch(() => {}); } catch { /* egal */ }
}
// bei jeder Nutzergeste (dauerhaft, nicht nur bis der Ton das erste Mal lief): gesperrten/unterbrochenen Kontext wieder starten
for (const a of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) document.addEventListener(a, () => { weckT = 0; weckeKontext(); }, true);

// erst nach einer Berührung/einem Klick erlaubt der Browser Ton
export function tonStarten() {
  if (ctx) { if (!document.hidden) ctx.resume?.(); audioFreischalten(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ }   // iOS: Ton trotz Stummschalter, nicht als „Umgebungston“ unterbrechen
  try { ctx.onstatechange = () => { stimmen.length = 0; }; } catch { /* egal */ }   // Zustandswechsel: alte Stimmen belegen keinen Platz mehr
  haupt = ctx.createGain(); haupt.gain.value = pegelEffekt(); haupt.connect(ctx.destination);
  musikAusgang = ctx.createGain(); musikAusgang.gain.value = pegel(); musikAusgang.connect(ctx.destination);
  musikBus = ctx.createGain(); musikBus.gain.value = musikEin.laut / 100; musikBus.connect(musikAusgang);
  // 2 s weißes Rauschen als Grundstoff für Schuss, Wind, Schlurfen
  rauschPuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = rauschPuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  hintergrundAufbauen();
  vorladen();
  audioFreischalten();
  if (!hintergrund.streuTimer) hintergrund.streuTimer = setTimeout(streuen, 6000);
  if (!hintergrund.krankTimer) hintergrund.krankTimer = setTimeout(krankenwagen, 30000 + Math.random() * 60000);
}

// schaltet die Lautstärke durch (100 → 50 → 25 → stumm → 100 %), merkt sie im Browser, liefert die neue Stufe (0–1)
export function tonUmschalten() {
  stufe = STUFEN[(STUFEN.indexOf(stufe) + 1) % STUFEN.length];
  try { localStorage.setItem('zombies_lautstaerke', String(stufe)); localStorage.setItem('zombies_ton', stufe ? 'an' : 'aus'); } catch { /* egal */ }
  pegelAnwenden();
  return stufe;
}

// setzt die Lautstärke direkt (nur 1, 0.5, 0.25 oder 0), merkt sie im Browser
export function lautstaerkeSetzen(v) {
  if (!STUFEN.includes(v)) return stufe;
  stufe = v;
  try { localStorage.setItem('zombies_lautstaerke', String(stufe)); localStorage.setItem('zombies_ton', stufe ? 'an' : 'aus'); } catch { /* egal */ }
  pegelAnwenden();
  return stufe;
}

// Hörerposition; ungültige Werte (Figur noch nicht da) ignorieren – sonst rechnet jedes Geräusch mit NaN
let hoerBekanntSeit = 0;   // Zeitpunkt, ab dem die Hörerposition bekannt ist; Ortstöne erst ~2 s danach (Beitritt: Nachrichten/Erstabgleich)
export function hoerer(x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { hx = x; hy = y; if (!hoerBekanntSeit) hoerBekanntSeit = performance.now(); } }
const endlich = (v, ersatz = 0) => Number.isFinite(v) ? v : ersatz;

// Ausgang für ein Geräusch an Position (x, y); null = zu weit weg
function ort(x, y, laut = 1) {
  if (!ctx || stufe === 0) return null;
  weckeKontext();
  if (ctx.state !== 'running') return null;   // gesperrt/unterbrochen: nichts einreihen (sonst prasselt beim Aufwachen alles auf einmal los)
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
  if (!zombieTonAn) return;
  if (probe('zombieTod', x, y)) return;
  if (!abstandOk('zombieTod')) return; abstandMerken('zombieTod');
  const z = ort(x, y, 0.8); if (!z) return;
  rauschen(z, 0.3, { freq: 600, freqEnde: 120, laut: 0.7 });
  ton(z, 0.45, { typ: 'sawtooth', freq: 160, freqEnde: 55, laut: 0.18 });
}

// Stöhnen: tiefe Sägezahnstimme mit Formantfilter und Zittern
// Hund bellt (Begleiter-Hund): Datei aus der Zuordnung 'hundBellen', sonst ein synthetisches „Wuff-wuff“. Gehört nicht zu den abschaltbaren Zombiegeräuschen.
export function hundBellen(x, y) {
  if (probe('hundBellen', x, y, 1)) return;
  if (!abstandOk('hundBellen')) return;
  const z = ort(x, y, 0.7); if (!z) return;
  abstandMerken('hundBellen');
  const t0 = ctx.currentTime, n = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.26, f0 = 380 + Math.random() * 120;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.16);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(550, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(f); f.connect(g); g.connect(z);
    o.start(t); o.stop(t + 0.2);
  }
}

export function stoehnen(x, y, laut = 0.5, kriecht = false, pruefen = true) {
  if (pruefen && !zombieTonAn) return;   // Zahnrad: Zombiegeräusche aus (entdeckt ruft mit pruefen=false)
  if (pruefen && !schreiErlaubt(x, y)) return;   // in der Horde: Einzelschreie seltener bzw. nur aus der Nähe
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
  if (!schreiErlaubt(x, y)) return;
  if (probe('entdeckt', x, y)) return;
  if (!abstandOk('entdeckt')) return; abstandMerken('entdeckt');
  stoehnen(x, y, 0.9, false, false);
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
// ---------- Autoradio als Live-Radio (Einstellung radioStream, z. B. Antenne Bayern) ----------
// Ein gemeinsames <audio> holt den Stream direkt beim Sender (CORS erlaubt); jedes Auto mit Radio bekommt einen eigenen
// Lautstärke-/Richtungszweig (wie die Sirene). Ohne Autos mit Radio wird der Stream nach 5 s getrennt (spart Datenvolumen).
let radioEin = { an: false, url: '', laut: 60, vorlauf: 30 };
let radioStummBis = 0, radioStummTimer = null;
let radioDuck = null, aktLevel = 1, durchsageNaechste = 0, durchsageLaeuft = false, durchsageNr = -1;   // Vorlauf: Stream läuft schon, ist aber noch stumm (Senderwerbung am Anfang)
let radioEl = null, radioQuelle = null, radioBus = null, radioFrei = false, radioNutzer = 0, radioAusTimer = null;
function radioAnlegen() {
  if (radioEl || !ctx?.createMediaElementSource) return !!radioEl;
  try {
    radioEl = new Audio(); radioEl.crossOrigin = 'anonymous'; radioEl.preload = 'none'; radioEl.setAttribute('playsinline', '');
    radioQuelle = ctx.createMediaElementSource(radioEl);
    radioDuck = ctx.createGain(); radioDuck.gain.value = 1; radioQuelle.connect(radioDuck);   // Sender leiser während einer Durchsage
    radioBus = ctx.createGain(); radioBus.gain.value = radioAn ? radioEin.laut / 100 : 0; radioBus.connect(haupt);
    radioEl.onerror = () => { radioPausieren(true); };
    return true;
  } catch { radioEl = null; return false; }
}
// Lautstärke des Live-Radios: gemeinsamer Bus, wirkt sofort auch auf schon laufende Autoradios
function radioPegel() {
  if (!ctx || !radioBus) return;
  const stumm = performance.now() < radioStummBis;
  radioBus.gain.setTargetAtTime(radioAn && !stumm ? radioEin.laut / 100 : 0, ctx.currentTime, stumm ? 0.05 : 0.6);
}
// Stream gleich bei Spielbeginn verbinden und für den Vorlauf stumm lassen; danach bleibt er bis zum Verlassen verbunden
// (sonst spielt der Sender bei jedem neuen Verbindungsaufbau wieder seinen Vorspann)
function radioVorstart() {
  if (!ctx || !radioEin.an || !radioAn || !radioAnlegen()) return;
  if (!radioEl.paused && radioEl.src && radioEl.src.startsWith(radioEin.url)) return;
  try {
    radioEl.src = radioEin.url;
    Promise.resolve(radioEl.play()).then(() => {
      radioFrei = true;
      radioStummBis = performance.now() + radioEin.vorlauf * 1000;
      clearTimeout(radioStummTimer); radioStummTimer = setTimeout(radioPegel, radioEin.vorlauf * 1000 + 50);
      radioPegel();
    }).catch(() => {});
  } catch { /* nächste Geste */ }
}
function radioFreischalten() {   // iOS: in einer Nutzergeste starten (gleich mit dem Stream, stumm im Vorlauf)
  if (!radioEin.an || radioFrei) return;
  radioVorstart();
}
function radioPausieren(sofort = false) {
  clearTimeout(radioAusTimer);
  const aus = () => { if (radioNutzer > 0 || !radioEl) return; try { radioEl.pause(); radioEl.removeAttribute('src'); radioEl.load(); } catch { /* egal */ } };
  if (sofort) { radioNutzer = Math.min(radioNutzer, 0); aus(); } else radioAusTimer = setTimeout(aus, 5000);
}
// Alle Autos spielen denselben Live-Sender exakt gleichzeitig – mehrere Zweige würden sich voll addieren (viele Autos = sehr laut).
// Deshalb klingt nur der lauteste (nächste) Zweig, die anderen sind stumm.
const liveZweige = new Set();
function liveMischen() {
  const jetzt = performance.now();
  let best = null;
  for (const h of liveZweige) if (jetzt - (h.zeit ?? 0) < 1500 && (!best || (h.ziel ?? 0) > (best.ziel ?? 0))) best = h;
  for (const h of liveZweige) h.g.gain.setTargetAtTime(h === best ? (h.ziel ?? 0) : 0, ctx.currentTime, 0.15);
  if (best && (best.ziel ?? 0) > 0.05) durchsagePruefen(best);
}
// Eilmeldung (Nachrichtensprecher) im Live-Radio: alle radioEin.durchsage Minuten, erstmals ~20 s nachdem man ein Radio hört.
// Kommt aus dem hörbaren Autoradio (gleicher Zweig: Richtung, Entfernung), der Sender wird solange leiser.
function durchsagePruefen(h) {
  const jetzt = performance.now();
  if (!radioEin.durchsage || durchsageLaeuft || jetzt < radioStummBis) return;
  if (!durchsageNaechste) { durchsageNaechste = jetzt + 20000; return; }
  if (jetzt < durchsageNaechste) return;
  const t = zuordnung['durchsageLevel' + aktLevel], liste = t?.dateien ?? [];   // kein Rückfall auf andere Level (Ortsname!)
  if (!liste.length) return;
  durchsageNr = (durchsageNr + 1) % liste.length;   // mehrere Aufnahmen: abwechselnd
  const datei = liste[durchsageNr];
  const buf = geladen(datei);
  if (!buf) { laden(datei); durchsageNr--; return; }
  durchsageLaeuft = true;
  const src = ctx.createBufferSource(), g = ctx.createGain(), z = ctx.currentTime;
  src.buffer = buf; g.gain.value = (t.laut ?? 100) / 100 * 2.2;   // Sprecher deutlich über dem (geduckten) Sender
  src.connect(g); g.connect(h.g);
  radioDuck.gain.cancelScheduledValues(z); radioDuck.gain.setTargetAtTime(0.12, z, 0.3);
  src.onended = () => {
    try { g.disconnect(); } catch { /* egal */ }
    radioDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    durchsageLaeuft = false;
    durchsageNaechste = performance.now() + radioEin.durchsage * 60000 * (0.85 + Math.random() * 0.3);
  };
  src.start(z + 0.6);
}
function radioHandle() {
  if (!radioEin.an || !radioAn || !radioAnlegen()) return null;
  clearTimeout(radioAusTimer);
  if (radioEl.paused || !radioEl.src || !radioEl.src.startsWith(radioEin.url)) radioVorstart();
  const g = ctx.createGain(); g.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { g.connect(pan); pan.connect(radioBus); } else g.connect(radioBus);
  radioDuck.connect(g);
  radioNutzer++;
  let weg = false;
  const h = { g, pan, laut: 1, quellen: null, rate: null, live: true };   // Lautstärke regelt radioBus (radioPegel)
  const ende = { stop() { if (weg) return; weg = true; liveZweige.delete(h); try { radioDuck.disconnect(g); } catch { /* schon getrennt */ } radioNutzer--; } };   // Stream bleibt verbunden (kein neuer Sender-Vorspann)
  h.quellen = [ende];
  liveZweige.add(h);
  return h;
}

// allgemeine Schleife an einem bewegten Ding (z. B. Autoradio); ohne zugeordnete Datei: null
export function schleifeStarten(id, fahrzeug = false) {
  if (!ctx) return null;
  if (id === 'autoradio' && fahrzeug && !radioAn) return null;   // Autoradio-Schalter aus: kein Auto spielt Radio
  if (id === 'autoradio' && radioEin.an) { const h = radioHandle(); if (h) return h; }
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
  if (h.live) { h.ziel = v; h.zeit = performance.now(); liveMischen(); }   // Live-Radio: nur das lauteste Auto ist zu hören (sonst addiert sich derselbe Sender)
  else h.g.gain.setTargetAtTime(v, ctx.currentTime, stumm ? 0.2 : 0.12);       // sanft ein- und ausblenden (kurz)
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

// ---------- Spielmusik: Hauptlied je Level, Lager, Horde, Safe, Finale (Auswahl: client/musiklogik.mjs) ----------
let musikBus = null, musikSt, musikLauf = null;
const musikLetzt = new Map();
const hatMusik = k => (zuordnung[k]?.dateien ?? []).some(d => puffer.get(d) !== null && !stromFehlt.has(d));   // undefined = noch nicht geladen, null = fehlt

// ---------- Musik streamen statt dekodieren ----------
// Ein dekodiertes Lied liegt als Float32 im Speicher (3 min Stereo ≈ 70 MB) – zu viel für iPhone/iPad. Deshalb spielt Musik über
// <audio>-Elemente, die an den AudioContext angeschlossen sind (MediaElementSource): kaum Speicher, startet sofort.
// iOS erlaubt play() nur Elementen, die einmal in einer Nutzergeste gespielt haben → feste Elemente, in der ersten Geste freigeschaltet.
const stromFehlt = new Set();
const stromSpieler = [];   // { a, g, belegt, frei }
let stilleUrl = null;
function stille() {   // 0,05 s Stille als WAV-Daten-URL zum Freischalten
  if (stilleUrl) return stilleUrl;
  const n = 2205, b = new DataView(new ArrayBuffer(44 + n * 2)), txt = (o, t) => { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 44100, true); b.setUint32(28, 88200, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); txt(36, 'data'); b.setUint32(40, n * 2, true);
  let bin = ''; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return (stilleUrl = 'data:audio/wav;base64,' + btoa(bin));
}
function stromAnlegen() {
  if (!ctx?.createMediaElementSource || stromSpieler.length >= 3) return null;
  try {
    const a = new Audio(); a.preload = 'auto'; a.setAttribute('playsinline', ''); a.crossOrigin = 'anonymous';
    const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g);
    const sp = { a, g, belegt: false, frei: false };
    stromSpieler.push(sp);
    return sp;
  } catch { return null; }
}
// in jeder Nutzergeste aufrufen: legt die Elemente an und spielt einmal kurz Stille (iOS-Freischaltung)
export function audioFreischalten() {
  if (!ctx) return;
  radioFreischalten();
  while (stromSpieler.length < 3 && stromAnlegen());
  for (const sp of stromSpieler) {
    if (sp.frei || sp.belegt) continue;
    try { sp.a.src = stille(); Promise.resolve(sp.a.play()).then(() => { sp.frei = true; if (!sp.belegt) sp.a.pause(); }).catch(() => {}); } catch { /* nächste Geste */ }
  }
}
// Datei auf einem freien Element abspielen; liefert { g, stop(sek) } oder null (dann alter Weg über dekodierte Puffer)
function stromStarten(datei, { loop = false, ziel, laut = 1, blende = 1, ende } = {}) {
  const sp = stromSpieler.find(x => !x.belegt && x.frei) ?? (stromSpieler.some(x => x.frei) ? null : stromSpieler.find(x => !x.belegt));
  if (!sp) return null;
  sp.belegt = true;
  const a = sp.a, g = sp.g, jetzt = ctx.currentTime;
  try { g.disconnect(); } catch { /* war nicht verbunden */ }
  g.connect(ziel);
  g.gain.cancelScheduledValues(jetzt); g.gain.setValueAtTime(0, jetzt); g.gain.linearRampToValueAtTime(laut, jetzt + blende);
  let aus = false;
  const frei = () => { if (aus) return; aus = true; a.onended = a.onerror = null; try { a.pause(); a.removeAttribute('src'); a.load(); } catch { /* egal */ } sp.belegt = false; };
  a.onended = () => { frei(); ende?.(); };
  a.onerror = () => { stromFehlt.add(datei); frei(); ende?.(); };
  a.loop = loop; a.src = 'toene/' + encodeURIComponent(datei);
  Promise.resolve(a.play()).then(() => { sp.frei = true; }).catch(() => { frei(); ende?.('gesperrt'); });
  return {
    g,
    stop(sek = 0) {
      if (aus) return;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + sek);
      a.onended = null;
      setTimeout(frei, sek * 1000 + 150);
    },
  };
}
// lage: { level, lager, safe, finale }; etwa jede Sekunde vom Spiel aufgerufen
export function musikLage(lage) {
  if (!ctx) return;
  if (lage?.level) aktLevel = Math.max(1, Math.min(5, Number(lage.level) || 1));
  musikSt = musikSchritt(musikSt, { ...lage, horde: hordeSt.aktiv }, hatMusik, performance.now());
  musikAnwenden(musikAn ? musikSt.aktuell : null);
  musikLautstaerke();
}
function musikLautstaerke() {
  if (!ctx || !musikBus) return;
  musikBus.gain.setTargetAtTime(musikEin.laut / 100 * (hordeSt.aktiv && hordeSt.pegel >= 0.6 ? 0.6 : 1), ctx.currentTime, 0.6);   // Ducking bei lautem Hordengeräusch
}
function musikAnwenden(kat) {
  const l = musikLauf;
  if ((l?.kat ?? null) === kat) return;
  if (l?.strom) l.strom.stop(musikEin.blende);
  else if (l?.g) {
    const t = ctx.currentTime, b = musikEin.blende;
    l.g.gain.cancelScheduledValues(t); l.g.gain.setValueAtTime(l.g.gain.value, t); l.g.gain.linearRampToValueAtTime(0, t + b);
    try { l.src.stop(t + b + 0.1); } catch { /* schon aus */ }
  }
  musikLauf = null;
  if (kat) musikStueck(kat);
}
function musikStueck(kat) {
  const t = zuordnung[kat], liste = (t?.dateien ?? []).filter(d => puffer.get(d) !== null && !stromFehlt.has(d));
  const datei = naechstesStueck(liste, musikLetzt.get(kat));
  if (!datei) return;
  // bevorzugt streamen; nur ohne freigeschaltetes Element (alte Browser) über den dekodierten Puffer
  if (!geladen(datei)) {
    const l = { kat };
    l.strom = stromStarten(datei, { ziel: musikBus, laut: (t.laut ?? 100) / 100, blende: musikEin.blende, ende: grund => {
      if (musikLauf !== l) return;
      musikLauf = null;
      if (grund === 'gesperrt') { l.gesperrt = true; return; }   // iOS ohne Geste: bei der nächsten Lage (≈1 s) neuer Versuch
      musikStueck(kat);
    } });
    if (l.strom) { musikLetzt.set(kat, datei); musikLauf = l; return; }
  }
  const buf = geladen(datei);
  if (!buf) { const w = { kat }; musikLauf = w; Promise.resolve(laden(datei)).then(() => { if (musikLauf === w) { musikLauf = null; musikStueck(kat); } }); return; }
  musikLetzt.set(kat, datei);
  const g = ctx.createGain(), src = ctx.createBufferSource(), jetzt = ctx.currentTime;
  src.buffer = buf; src.connect(g); g.connect(musikBus);
  g.gain.setValueAtTime(0, jetzt); g.gain.linearRampToValueAtTime((t.laut ?? 100) / 100, jetzt + musikEin.blende);
  const l = { kat, g, src };
  musikLauf = l;
  src.onended = () => { if (musikLauf === l) { musikLauf = null; musikStueck(kat); } };   // nach dem Ende das nächste Stück
  src.start();
}

// ---------- Startmusik: nach dem ersten Antippen der Startseite, blendet beim Spielbeginn aus ----------
let musik = null;
export function musikStarten() {
  tonStarten();
  if (!ctx || musik || !musikAn) return;
  const t = zuordnung.startmusik, liste = (t?.dateien ?? []).filter(d => !stromFehlt.has(d));
  if (!liste.length) return;
  audioFreischalten();
  if (!liste.some(geladen)) {
    const m = { strom: null };
    m.strom = stromStarten(liste[Math.floor(Math.random() * liste.length)], { loop: true, ziel: musikAusgang, laut: (t.laut ?? 55) / 100, blende: 2,
      ende: () => { if (musik === m) musik = null; } });   // gesperrt/Fehler: nächste Geste versucht es wieder
    if (m.strom) { musik = m; return; }
  }
  const buf = liste.map(geladen).filter(Boolean);
  if (!buf.length) { Promise.all(liste.map(laden)).then(() => { if (!musik && !musikAus) musikStarten(); }); return; }
  const g = ctx.createGain(); g.gain.value = 0; g.connect(musikAusgang);
  const src = ctx.createBufferSource(); src.buffer = buf[Math.floor(Math.random() * buf.length)]; src.loop = true; src.connect(g); src.start();
  g.gain.setTargetAtTime((t.laut ?? 55) / 100, ctx.currentTime, 0.8);
  musik = { g, src };
}
let musikAus = false;
// Beim Öffnen der Seite sofort versuchen; blockiert der Browser (AudioContext bleibt "suspended"), startet die erste
// Berührung/Taste irgendwo auf der Seite die Musik (Listener entfernt sich, sobald der Ton läuft).
export function musikSofort(startseiteSichtbar = () => true) {
  const los = () => {
    // im Spiel (z. B. nach automatischem Neuladen): erste Berührung schaltet wenigstens den Ton frei
    if (musikAus || !startseiteSichtbar()) { try { tonStarten(); if (ctx && !document.hidden) Promise.resolve(ctx.resume?.()).catch(() => {}); } catch { /* egal */ } return; }
    try { musikStarten(); } catch { /* egal */ }
    if (!ctx || document.hidden) return;
    try { Promise.resolve(ctx.resume?.()).catch(() => { /* weiter warten */ }); } catch { /* egal */ }
  };
  const ARTEN = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];
  // Browser spielen erst nach einer Berührung Ton ab (Autoplay-Sperre, nicht umgehbar): solange gesperrt, sichtbarer Hinweis
  let hinweis = null;
  const hinweisZeigen = an => {
    if (an && !hinweis) {
      hinweis = document.createElement('div');
      hinweis.textContent = '🔊 Tippe irgendwo für Ton';
      hinweis.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;background:rgba(0,0,0,.72);color:#fff;padding:8px 14px;border-radius:18px;font:600 14px system-ui,sans-serif;pointer-events:none;animation:tonPuls 1.6s ease-in-out infinite';
      if (!document.getElementById('tonPulsStil')) { const s = document.createElement('style'); s.id = 'tonPulsStil'; s.textContent = '@keyframes tonPuls{0%,100%{opacity:.55}50%{opacity:1}}'; document.head.appendChild(s); }
      document.body.appendChild(hinweis);
    } else if (!an && hinweis) { hinweis.remove(); hinweis = null; }
  };
  const ab = () => { for (const a of ARTEN) document.removeEventListener(a, geste, true); hinweisZeigen(false); };
  const geste = () => {
    los();
    try { audioFreischalten(); } catch { /* egal */ }
    // erst abmelden, wenn der Ton wirklich läuft; sonst bei der nächsten Geste noch einmal
    setTimeout(() => { if (musikAus || !startseiteSichtbar() || ctx?.state === 'running') ab(); }, 300);
  };
  for (const a of ARTEN) document.addEventListener(a, geste, true);
  los();
  // nach kurzer Zeit prüfen, ob der Browser den Ton zugelassen hat
  setTimeout(() => { if (!musikAus && startseiteSichtbar() && ctx?.state !== 'running') hinweisZeigen(true); }, 900);
}
export function musikAusblenden(sek = 4) {
  musikAus = true;
  if (!musik || !ctx) return;
  const m = musik; musik = null;
  if (m.strom) { m.strom.stop(sek); return; }
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
