// Fahrbare Autos mit Autoschlüssel: gemeinsame Maße, Regeln und Prüfungen für Server (server/pkw.mjs) und Client (pkwdarstellung.mjs, spiel.mjs).
// Ein Autoschlüssel (Gegenstand 'autoschluessel') passt in JEDES geparkte Auto der Welt (welt.behaelter mit art 'auto', nicht ausgebrannt,
// nicht plattgefahren). Beim Einsteigen wird aus dem geparkten Auto ein Fahrzeug 'pkw' (state.fahrzeuge, Id 'pkw_<Behälter-Id>'); das
// gemalte Auto verschwindet aus den Kartenstücken (welt.autosWeg, Nachricht 'autosWeg'). Fahrzeuge der Verkehrssimulation sind nie Ziel.
// Maße in Spielpixeln (8 px = 1 m). Nur + − × ÷ / Math.sqrt / cos / sin (Laufzeitlogik, keine Weltdaten).
import { fzPx } from './masse.mjs';
import { imFussabdruck } from './evak.mjs';
import { hat } from './stapel.mjs';
import { aufParkAuto } from './fzkollision.mjs';

export const PKW_ART = 'pkw';
export const SCHLUESSEL = 'autoschluessel';
const [PL, PB] = fzPx('pkw') ?? [36, 16];
export const PKW = { name: 'Auto', laenge: PL, breite: PB };
export const PKW_EINSTIEG = 14;          // Spielpixel (1,75 m) Abstand zur Karosserie, aus dem man einsteigen kann
export const PKW_ID = bid => 'pkw_' + bid;
export const pkwBehaelterId = id => (String(id).startsWith('pkw_') ? String(id).slice(4) : null);

// Backend-Werte (Einstellung `auto`, server/einstellungen.mjs) – Vorgaben, wenn die Einstellung fehlt
export const PKW_VORGABE = {
  tempo: 80,               // Höchsttempo in km/h
  lenkung: 60,             // Lenkung in Grad je Sekunde (bei mittlerem Tempo; im Stand und bei Höchsttempo langsamer)
  leben: 100,              // Lebenspunkte des Autos
  plaetze: 4,              // Sitzplätze (Fahrer + Mitfahrer)
  crashAb: 20,             // km/h: ab hier kostet ein Aufprall Lebensenergie
  crashSchaden: 50,        // % Lebensenergie für Fahrer und Mitfahrer bei 80 km/h (dazwischen linear ab crashAb)
  crashAuto: 40,           // Lebenspunkte, die das Auto bei einem Aufprall mit 80 km/h verliert (linear wie oben)
  zombieTotKmh: 25,        // km/h: ab hier stirbt ein überfahrener Zombie sofort, darunter Schaden ∝ Tempo
  zombieSchaden: 2,        // Lebenspunkte, die das Auto je überfahrenem Zombie verliert
  schluesselMoebel: 10,    // % Chance auf einen Autoschlüssel je gefülltem Schrank/Spind/Aktenschrank/Werkbank (zusätzlich zur Beute; gefüllt sind beute.moebel %)
  schluesselKofferraum: 20,   // % je Kofferraum
  schluesselLeiche: 4,     // % je Leiche (toter Zombie)
};
// Möbel, in denen ein Autoschlüssel liegen kann
export const SCHLUESSEL_MOEBEL = new Set(['schrank', 'spind', 'aktenschrank', 'werkbank', 'werkzeugschrank', 'ausstellungsschrank']);

// Ausrichtung eines geparkten Autos wie in aussehen.mjs autoVonOben (Front zeigt in Fahrtrichtung)
export function parkWinkel(b) {
  let w = Number.isFinite(b.winkel) ? b.winkel : b.senkrecht ? Math.PI / 2 : 0;
  if (!b.vorwaerts && (b.farbe + Math.round(b.x)) % 2) w += Math.PI;
  return w;
}

// Kann dieses geparkte Auto genommen werden? (nicht ausgebrannt, nicht plattgefahren, nicht schon weg)
export function parkAutoFrei(b, welt, s) {
  if (!b || b.art !== 'auto') return false;
  if (welt?.autosWeg?.has(b.id)) return false;
  if (s?.verbrannt?.has?.('auto:' + b.id) || s?.platt?.has?.(b.id)) return false;
  return true;
}

// Steht (x, y) nah genug an Auto (x, y, richtung) zum Einsteigen?
export const pkwNah = (f, x, y) => imFussabdruck(f, x, y, PKW.laenge / 2, PKW.breite / 2, PKW_EINSTIEG);

// nächstes geparktes Auto der Außenwelt in Einstiegsnähe oder null (Server und Client: gleiche Prüfung)
export function parkAutoBei(welt, s, x, y) {
  let best = null, bd = Infinity;
  for (const b of welt?.behaelter ?? []) {
    if (b.art !== 'auto' || Math.abs(b.x - x) > 40 || Math.abs(b.y - y) > 40) continue;
    if (!parkAutoFrei(b, welt, s) || !pkwNah({ x: b.x, y: b.y, richtung: parkWinkel(b) }, x, y)) continue;
    const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export const hatSchluessel = p => hat(p?.rucksack, SCHLUESSEL);

// Aufprall: Anteil (0–1) der Lebensenergie, den Insassen bei `kmh` verlieren (0 unter crashAb, crashSchaden % bei 80 km/h, linear, höchstens 100 %)
export function crashAnteil(kmh, e = PKW_VORGABE) {
  const ab = Number(e.crashAb ?? PKW_VORGABE.crashAb), voll = Number(e.crashSchaden ?? PKW_VORGABE.crashSchaden) / 100;
  if (!(kmh >= ab) || ab >= 80) return kmh >= ab && ab >= 80 ? Math.min(1, voll) : 0;
  return Math.max(0, Math.min(1, voll * (kmh - ab) / (80 - ab)));
}
// Schaden am Auto bei einem Aufprall mit `kmh` (Lebenspunkte)
export function crashAutoSchaden(kmh, e = PKW_VORGABE) {
  const ab = Number(e.crashAb ?? PKW_VORGABE.crashAb), voll = Number(e.crashAuto ?? PKW_VORGABE.crashAuto);
  if (!(kmh >= ab)) return 0;
  return ab >= 80 ? voll : Math.max(0, voll * (kmh - ab) / (80 - ab));
}

// Geparktes Auto aus dem Kletter-Index (client/fzkollision.mjs aufParkAuto) entfernen, damit Figuren nicht mehr darüber klettern.
// Der Index wird bei Bedarf gebaut; die Rechtecke tragen keine Id, daher Vergleich über die Mitte.
export function parkAutoAusIndex(welt, b) {
  if (!welt || !b) return;
  aufParkAuto(welt, b.x, b.y, 1);   // baut welt._parkIdx, falls noch nicht da
  const idx = welt._parkIdx;
  if (!idx) return;
  for (const [k, liste] of idx) {
    const rest = liste.filter(r => !(r.x === b.x && r.y === b.y));
    if (rest.length !== liste.length) { if (rest.length) idx.set(k, rest); else idx.delete(k); }
  }
}

// Geparktes Auto als „weg“ markieren (Server und Client): Kletter-Index, Zeichnung (aussehen.mjs zeichneBoden), Kofferraum
export function parkAutoWeg(welt, bid) {
  if (!welt) return null;
  welt.autosWeg ??= new Set();
  if (welt.autosWeg.has(bid)) return null;
  const b = (welt.behaelter ?? []).find(q => q.id === bid && q.art === 'auto');
  if (!b) return null;
  welt.autosWeg.add(bid);
  parkAutoAusIndex(welt, b);
  return b;
}

// Darf jemand (mit/ohne Autoschlüssel) in ein Auto mit diesen Insassen [{ schluessel, bot }] einsteigen?
// Gemeinsame Regel für Server (FahrbarPkw.kannEinsteigen) und Client (Aktionsknopf): Fahren nur mit Schlüssel, Mitfahren ohne,
// solange ein Mensch mit Schlüssel am Steuer sitzt; nie über die Plätze hinaus.
export function pkwEinsteigbar(insassen, ichSchluessel, plaetze) {
  if (insassen.length >= plaetze) return false;
  return !!ichSchluessel || insassen.some(i => i.schluessel && !i.bot);
}

// Aktionsknopf am Auto (Client; gleiche Prüfungen wie der Server): fahrbares Auto in Reichweite → einsteigen/mitfahren,
// geparktes Auto + Autoschlüssel → fahren (zweiter Knopf: Kofferraum). richtungVon(f) = Fahrtrichtung eines Fahrzeugs (Bogenmaß).
// Rückgabe { art, text, zweit? } oder null.
export function pkwKontext(welt, s, ich, x, y, richtungVon, plaetze = PKW_VORGABE.plaetze) {
  if (!ich || ich.ebene || ich.anBord || ich.imBoxer) return null;
  const mein = hatSchluessel(ich);
  for (const [, f] of s?.fahrzeuge ?? []) {
    if (f.art !== PKW_ART || !pkwNah({ x: f.x, y: f.y, richtung: richtungVon(f) }, x, y)) continue;
    const drin = [...(s.spieler?.values() ?? [])].filter(q => q.imBoxer && Math.abs(q.x - f.x) < 24 && Math.abs(q.y - f.y) < 24).map(q => ({ schluessel: hatSchluessel(q), bot: false }));
    if (!pkwEinsteigbar(drin, mein, plaetze)) continue;
    return { art: 'einsteigen', text: mein && !drin.some(i => i.schluessel) ? '🚗 Auto fahren' : '🚗 Einsteigen (mitfahren)' };
  }
  if (!mein) return null;
  const b = parkAutoBei(welt, s, x, y);
  if (!b) return null;
  const k = { art: 'einsteigen', text: '🚗 Auto fahren (Autoschlüssel)' };
  if (s?.behaelter?.get?.(b.id)?.rest !== 0) k.zweit = { art: 'durchsuchen', text: hat(ich.rucksack, 'brechstange') ? 'Kofferraum aufbrechen' : 'Kofferraum (Brechstange nötig)' };
  return k;
}
