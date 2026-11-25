// Evakuierungsarten (Server und Client): Bus, Panzer (Leopard 2A7) und Flugzeug (A400M, danach Hubschrauber).
// Maße in Spielpixeln (8 px = 1 m). Gemeinsam genutzt von server/aufgaben.mjs und client/evakdarstellung.mjs.
import { frei } from './welt.mjs';

export const EVAK_KARTEN = { isarauen: 'panzer', koenigsdorf: 'absturz', kochel: 'heli', andermatt: 'bunker' };            // Evakuierungsart je Karte (nicht aufgeführt = Bus)
export const evakArtFuer = karte => EVAK_KARTEN[karte] ?? 'bus';

// Leopard 2A7: Wanne 7,7 m = 61,6 px lang, 3,75 m = 30 px breit (Bilder aus dem eigenen Modell tools/panzer_modell/leopard.mjs, 80/3 Bildpunkte
// je Meter -> Skala 0,3 = 8 Spielpixel je Meter), Turmdrehpunkt 8,1 px vor der Wannenmitte, Ladeschütze mit MG im Turm-Rahmen (nach vorn, nach rechts)
export const LEOPARD = {
  laenge: 61.6, breite: 30, skala: 0.3,                    // Wannenbild: Spielpixel je Bildpunkt
  turmX: 8.1, turmY: 0, turmOx: 110.67 / 272, turmOy: 54.67 / 109,   // Drehpunkt im Turmbild (Anteile; Turmbild 272 × 109 px)
  mgX: -4.1, mgY: -7.5,
  kommandantX: -0.5, kommandantY: 6,                       // Lukenplätze im Turm-Rahmen: Kommandant rechts hinten, Ladeschütze (mit MG) links
  muendung: 48.5,                                          // Rohrende: so weit vor dem Turmdrehpunkt (Rohr ragt gut 3 m über die Wanne, gesamt ~10,9 m)
};

// A400M: 45 m lang, 42 m Spannweite (Bild: tools/a400m_bilder.py, 800 Spielpixel je Modelleinheit, Rumpfbild 544×506 px)
export const A400M = {
  laenge: 369, breite: 343, skala: 0.6816,
  naben: [[77.3, -103.5], [90.6, -56.1], [90.6, 54.8], [77.3, 102.2]],   // Propellernaben (nach vorn, nach rechts), von links nach rechts
  heck: 204,                                                              // Heckrampe: so weit hinter der Rumpfmitte (Einstiegspunkt)
  landeStrecke: 720, landeBreite: 170, rollweg: 320,                      // freie Fläche (Länge × Breite) und Weg der Landerolle
};

// Königsdorf: Bruchlandung des A400M. Anflug mit gleichbleibendem Tempo (`anflug` s vor dem Aufsetzen), hartes Aufsetzen mit `tempo` (px/s)
// an `aufsetz` px (Rumpfmitte) hinter dem Pistenanfang, gleichmäßig gebremst auf `rollweg` px bis zum Stillstand. Nach dem ersten Aufprall
// springt er noch `huepfer` mal hoch (Dauer s, Höhe als Anteil der Anflughöhe), dann schlittert er auf dem Bauch, versetzt sich dabei um
// `quer` px zur Seite und stellt sich um `gier` rad quer (Seite je Seed). Er brennt ab dem ersten Aufprall, im Stand Vollbrand (ABSTURZ_HERDE).
export const ABSTURZ = {
  anflug: 14, tempo: 300, rollweg: 1200, aufsetz: 200, rumpfHalbBreite: 34,
  huepfer: [[1.25, 0.42], [0.85, 0.22], [0.55, 0.09]],
  quer: 56, gier: 0.42, pendel: 0.07,
};
export const absturzRollDauer = () => 2 * ABSTURZ.rollweg / ABSTURZ.tempo;   // Sekunden vom Aufsetzen bis zum Stand
export const absturzDauer = () => ABSTURZ.anflug + absturzRollDauer();       // gesamter Ablauf bis zum Brand
// Ort des A400M (Abstand `d` px vom Stillstandspunkt rückwärts entlang der Piste, <0 = noch vor dem Aufsetzen) zur Zeit t (s) seit Beginn des Anflugs
export function absturzStrecke(t) {
  const { anflug, tempo, rollweg } = ABSTURZ, rd = absturzRollDauer();
  if (t <= anflug) return rollweg + tempo * (anflug - Math.max(0, t));          // noch in der Luft: Abstand zum Stillstandspunkt
  const tr = Math.min(t - anflug, rd), a = tempo * tempo / (2 * rollweg);
  return rollweg - (tempo * tr - a * tr * tr / 2);                              // auf der Piste: Rest bis zum Stand
}

// Seite, zu der er ausbricht (1 = rechts der Flugrichtung, -1 = links): fest je Seed, Server und Client gleich
export const absturzSeite = seed => ((Math.abs(Math.round(Number(seed) || 0)) >>> 3) % 2 ? 1 : -1);
// Zeitpunkte der Aufpralle (s seit Beginn des Anflugs): erstes Aufsetzen, dann das Ende jedes Hüpfers; ab dem letzten schlittert er
export function absturzAufpralle() {
  const l = [ABSTURZ.anflug];
  let t = ABSTURZ.anflug;
  for (const [dauer] of ABSTURZ.huepfer) l.push(t += dauer);
  return l;
}
// Lage zur Zeit t: d = Abstand zum Stillstandspunkt entlang der Piste (wie absturzStrecke), q = seitlicher Versatz (px, + = rechts),
// gier = Querstellung (rad, + = im Uhrzeigersinn), h = Höhe (1 = Beginn des Anflugs, 0 = am Boden), phase, herde = Zahl der Aufpralle bisher
// (bestimmt, welche Brandherde schon brennen). Nur Grundrechenarten (kein sin/cos): überall gleich.
export function absturzLage(t, seite = 1) {
  const { anflug, rollweg, huepfer, quer, gier, pendel } = ABSTURZ, d = absturzStrecke(t), ende = absturzDauer();
  let h = 0, phase = 'schlittern', wipp = 0, herde = 0;
  if (t < anflug) { h = 1 - Math.max(0, t) / anflug; phase = 'anflug'; }
  else {
    let t0 = anflug; herde = 1;
    for (let k = 0; k < huepfer.length; k++) {
      const [dauer, hoehe] = huepfer[k];
      if (t < t0 + dauer) { const u = (t - t0) / dauer; h = 4 * hoehe * u * (1 - u); phase = 'huepfen'; wipp = (k % 2 ? -1 : 1) * pendel * 4 * u * (1 - u); break; }
      t0 += dauer; herde++;
    }
    if (t >= ende) { phase = 'stand'; herde = huepfer.length + 2; }
  }
  const s = t <= anflug ? 0 : Math.max(0, Math.min(1, (rollweg - d) / rollweg)), glatt = s * s * (3 - 2 * s);
  return { d, q: seite * quer * glatt, gier: seite * (gier * glatt + wipp), h, phase, herde };
}
// Lage in Weltkoordinaten. p = { x, y, w } (Stillstandspunkt auf der Pistenachse, Pistenrichtung), c/s = cos/sin(w) (einmal gerechnet)
export function absturzPose(p, c, s, t, seite = 1) {
  const l = absturzLage(t, seite);
  return { ...l, x: p.x - c * l.d - s * l.q, y: p.y - s * l.d + c * l.q, richtung: p.w + l.gier };
}
// Brandherde im Rumpf-Rahmen (x nach vorn, y nach rechts, px), r = Radius (Server: Feuer mit Schaden/Licht/Knistern), ab = ab dem wievielten
// Aufprall er brennt (1 = erstes Aufsetzen, 5 = Stillstand/Vollbrand). Triebwerke sitzen hinter den Propellernaben (A400M.naben).
export const ABSTURZ_HERDE = [
  { x: 64, y: 55, r: 44, ab: 1 },     // Triebwerk 3 (rechts innen) – fängt beim ersten Aufprall Feuer
  { x: 18, y: -38, r: 46, ab: 2 },    // linke Tragflächenwurzel (Tank)
  { x: 64, y: -56, r: 44, ab: 3 },    // Triebwerk 2
  { x: 52, y: 102, r: 40, ab: 4 },    // Triebwerk 4 (außen rechts), schleift beim Schlittern
  { x: 52, y: -103, r: 40, ab: 5 },   // Triebwerk 1
  { x: 0, y: 6, r: 78, ab: 5 },       // Rumpfmitte – Vollbrand im Stand
  { x: -78, y: -8, r: 56, ab: 5 },    // hinterer Rumpf
];
// Weltort eines Brandherds bei Rumpfmitte (x, y) und Richtung über c = cos, s = sin der Richtung
export const herdOrt = (hd, x, y, c, s) => ({ x: x + c * hd.x - s * hd.y, y: y + s * hd.x + c * hd.y });

// Liegt der Punkt im Fußabdruck eines Fahrzeugs (Mitte f.x/f.y, Richtung f.richtung, halbe Länge hl, halbe Breite hb, Zuschlag zu)?
export function imFussabdruck(f, x, y, hl, hb, zu = 0) {
  const dx = x - f.x, dy = y - f.y, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.abs(u) <= hl + zu && Math.abs(v) <= hb + zu;
}

// Hubschrauber NH90 (tools/fahrzeug_bilder.py): Rumpf 16,96 m inkl. Heckrotor, Hauptrotor 16 m. Spielmaßstab 8 px je Meter, Bilder mit 12 Bildpunkten je Meter -> skala 0.667.
// Container-Ursprung = Rotornabe; der Rumpf sitzt dort um (rumpfX | rumpfY) versetzt (Bug nach rechts)
export const HELI = { skala: 0.6667, rumpfX: -23.0, rumpfY: 3.65, rotorRadius: 64 };

// Tanklaster als Kulisse neben der Nase des gelandeten A400M (Container-Rahmen des Flugzeugs: nach vorn / nach rechts), 100 px lang
export const TANKLASTER = { skala: 0.6667, x: 178, y: 72 };


// Hubschrauber-Standort: der NH90 landet nicht auf dem Landelicht (state.evakX/evakY, Markierung), sondern HELI_VERSATZ (20 m) daneben,
// auf einer freien, begehbaren Stelle (nicht in Häusern/Wasser). Deterministisch (feste Richtungstabelle, kein sin/cos): Server und Client
// rechnen dasselbe; das Ergebnis wird je Welt und Punkt gemerkt. Einsteigen und Anzeige beziehen sich auf diesen Standort.
export const HELI_VERSATZ = 160;
const R8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
export function heliStand(welt, x, y) {
  x = Math.round(x); y = Math.round(y);
  const schluessel = x + ',' + y, cache = welt ? (welt._heliStand ??= new Map()) : null;
  if (cache?.has(schluessel)) return cache.get(schluessel);
  let erg = { x, y };
  if (welt) {
    const start = (Math.abs(x * 7 + y * 13)) % 8;
    suche: for (const [dist, rad] of [[HELI_VERSATZ, 40], [HELI_VERSATZ, 20], [HELI_VERSATZ - 40, 20], [HELI_VERSATZ + 40, 20], [HELI_VERSATZ, 8]]) {
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = R8[(start + k) % 8], px = Math.round(x + dx * dist), py = Math.round(y + dy * dist);
        if (frei(welt, px, py, rad)) { erg = { x: px, y: py }; break suche; }
      }
    }
  }
  cache?.set(schluessel, erg);
  return erg;
}
