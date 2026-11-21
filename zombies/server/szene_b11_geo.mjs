// Szene „Stau auf der B11“ (nur Karte geretsried2): Geometrie aus den Straßendaten, rein rechnerisch und deterministisch.
// Kreuzung = Knoten der B 11, an dem auch der Karl-Lederer-Platz beginnt (beim Rathaus). Der Stau liegt auf der B 11 nordwestlich davon.
import { KACHEL } from '../client/welt.mjs';

export const B11_KARTE = 'geretsried2';
const KEY = (x, y) => x.toFixed(1) + ',' + y.toFixed(1);

// { kreuzung: {x, y} (Pixel), punkte: [{x, y}] Pixel von der Kreuzung weg (Stau-Seite), laenge, kanten: [[ax, ay, bx, by]] in Kacheln } oder null
export function b11Geometrie(welt) {
  if (welt._b11 !== undefined) return welt._b11;
  welt._b11 = null;
  const strassen = welt.vektor?.strassen ?? [];
  const b11 = strassen.filter(s => s.ref === 'B 11');
  if (!b11.length) return null;
  const adj = new Map();
  const zu = (a, b) => { const k = KEY(a[0], a[1]); (adj.get(k) ?? adj.set(k, []).get(k)).push(b); };
  for (const s of b11) for (let i = 0; i + 3 < s.p.length; i += 2) {
    const a = [s.p[i], s.p[i + 1]], b = [s.p[i + 2], s.p[i + 3]];
    zu(a, b); zu(b, a);
  }
  // Kreuzung: B-11-Knoten, an dem die Straße „Karl-Lederer-Platz“ beginnt
  let kreuz = null;
  for (const s of strassen) {
    if (s.ref === 'B 11' || !s.n?.includes('Karl-Lederer-Platz')) continue;
    for (let i = 0; i + 1 < s.p.length; i += 2) if (adj.has(KEY(s.p[i], s.p[i + 1]))) kreuz = [s.p[i], s.p[i + 1]];
  }
  if (!kreuz) return null;
  // von der Kreuzung aus die Kette der B 11 entlanggehen, in Richtung kleinerer y (Nordwesten)
  const kette = [kreuz], gesehen = new Set([KEY(kreuz[0], kreuz[1])]);
  let akt = kreuz;
  for (let n = 0; n < 60; n++) {
    const nach = (adj.get(KEY(akt[0], akt[1])) ?? []).filter(q => !gesehen.has(KEY(q[0], q[1])));
    if (!nach.length) break;
    akt = nach.reduce((a, b) => (b[1] < a[1] ? b : a));
    gesehen.add(KEY(akt[0], akt[1])); kette.push(akt);
  }
  const punkte = kette.map(p => ({ x: p[0] * KACHEL, y: p[1] * KACHEL }));
  let laenge = 0;
  for (let i = 1; i < punkte.length; i++) laenge += Math.hypot(punkte[i].x - punkte[i - 1].x, punkte[i].y - punkte[i - 1].y);
  const kanten = [];
  for (let i = 1; i < kette.length; i++) kanten.push([kette[i - 1][0], kette[i - 1][1], kette[i][0], kette[i][1]]);
  return (welt._b11 = { kreuzung: punkte[0], punkte, laenge, kanten });
}

// Punkt im Abstand s (Pixel) von der Kreuzung auf der Stau-Seite; w = Richtung zur Kreuzung hin (Fahrtrichtung der Einfahrt),
// seitlich: +versatz = rechts der Fahrtrichtung zur Kreuzung (y nach unten)
export function b11Punkt(geo, s, versatz = 0) {
  const p = geo.punkte;
  let rest = Math.max(0, Math.min(s, geo.laenge));
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (rest <= l || i === p.length - 1) {
      const k = l ? Math.min(1, rest / l) : 0, dx = (p[i - 1].x - p[i].x) / (l || 1), dy = (p[i - 1].y - p[i].y) / (l || 1);   // zur Kreuzung hin
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k - dy * versatz, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k + dx * versatz, w: Math.atan2(dy, dx) };
    }
    rest -= l;
  }
  return { ...p[0], w: 0 };
}

// Kanten (Kachelkoordinaten) der Stau-Strecke: der normale Verkehr nimmt sie nicht (siehe strassenGraph in verkehr.mjs)
export function b11Sperrkanten(welt) { return (b11Geometrie(welt)?.kanten ?? []).map(kante => ({ kante })); }
