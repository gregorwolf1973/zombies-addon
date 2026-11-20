// Flugplan für die A400M-Evakuierung: eine lange freie Fläche zum Landen (aus dem feinen Raster) und ein Hubschrauber-Landeplatz
// in einiger Entfernung, zu Fuß erreichbar. Deterministisch aus dem Seed; das Ergebnis hängt an der Welt (`welt._flugplan`).
import { BREITE, HOEHE, KACHEL, frei, findeWeg, zufall } from '../client/welt.mjs';
import { A400M } from '../client/evak.mjs';

const SCHRITT = 128;        // Rasterweite der Suche (Pixel)
const HELI_RAD = 70;        // freier Platz für den Hubschrauber (Radius)
const HELI_ABSTAND = [640, 1500];   // Abstand Hubschrauberplatz – Heckrampe (Pixel, 80–190 m)

// freier Streifen ab (x, y) in Richtung w: Länge L, Breite B (Proben alle 24 px, Kreise vom Radius B/2)
const streifenFrei = (welt, x, y, w, L, B) => {
  const c = Math.cos(w), s = Math.sin(w);
  for (let d = 0; d <= L; d += 24) if (!frei(welt, x + c * d, y + s * d, B / 2)) return false;
  return true;
};

// null, wenn die Welt keinen Landestreifen oder keinen erreichbaren Hubschrauberplatz hat
export function flugplanBerechnen(welt, seed = welt.seed ?? 1) {
  if (welt._flugplan !== undefined) return welt._flugplan;
  const rnd = zufall((seed ^ 0x4a4f4e) >>> 0);
  const L = A400M.landeStrecke, B = A400M.landeBreite, W = BREITE * KACHEL, H = HOEHE * KACHEL;
  const kandidaten = [];
  for (let y = B; y < H - B; y += SCHRITT) for (let x = B; x < W - B; x += SCHRITT) {
    if (!frei(welt, x, y, B / 2)) continue;
    for (const w of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const ex = x + Math.cos(w) * L, ey = y + Math.sin(w) * L;
      if (ex < B || ey < B || ex > W - B || ey > H - B) continue;
      if (streifenFrei(welt, x, y, w, L, B)) kandidaten.push({ x, y, w });
    }
  }
  // Mischen mit dem Zufall der Welt (nie sort mit Zufall), dann der erste Kandidat mit erreichbarem Hubschrauberplatz
  for (let i = kandidaten.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]]; }
  for (const k of kandidaten.slice(0, 40)) {
    const c = Math.cos(k.w), s = Math.sin(k.w);
    const mitte = { x: k.x + c * (L - A400M.laenge / 2 - 40), y: k.y + s * (L - A400M.laenge / 2 - 40) };   // Rumpfmitte nach der Landerolle
    const start = { x: mitte.x - c * A400M.rollweg, y: mitte.y - s * A400M.rollweg };                       // Rumpfmitte beim Aufsetzen
    const rampe = { x: mitte.x - c * A400M.heck, y: mitte.y - s * A400M.heck };
    const heli = welt.heliplatz ? { x: welt.heliplatz.x, y: welt.heliplatz.y } : hubschrauberPlatz(welt, rampe, rnd);
    if (heli) return welt._flugplan = { w: k.w, start, mitte, rampe, heli };
  }
  return welt._flugplan = null;
}

// Hubschrauberplatz für Karten, auf denen der NH90 von Anfang an steht (Kochel) oder nach dem Absturz landet (Königsdorf):
// welt.heliplatz ({x, y} in Pixeln, aus den Kartendaten) hat Vorrang, sonst frei und zu Fuß vom Start erreichbar (350–1400 px)
export function heliPlan(welt, seed = welt.seed ?? 1) {
  if (welt._heliplan !== undefined) return welt._heliplan;
  if (welt.heliplatz) return welt._heliplan = { heli: { x: welt.heliplatz.x, y: welt.heliplatz.y } };
  const rnd = zufall((seed ^ 0x48454c49) >>> 0), W = BREITE * KACHEL, H = HOEHE * KACHEL, st = welt.start ?? { x: W / 2, y: H / 2 };
  const liste = [];
  for (let n = 0; n < 400 && liste.length < 8; n++) {
    const a = rnd() * Math.PI * 2, d = 350 + rnd() * 1050, x = st.x + Math.cos(a) * d, y = st.y + Math.sin(a) * d;
    if (x < 200 || y < 200 || x > W - 200 || y > H - 200 || !frei(welt, x, y, HELI_RAD)) continue;
    liste.push({ x, y });
  }
  for (const p of liste) if (findeWeg(welt, st.x, st.y, p.x, p.y, 11, 40000, true)) return welt._heliplan = { heli: p };
  return welt._heliplan = liste[0] ? { heli: liste[0] } : null;
}

// Bunkertor (Finale): welt.bunkertor ({x, y} in Pixeln) hat Vorrang, sonst ein freier, erreichbarer Platz abseits des Starts
export function bunkerPlan(welt, seed = welt.seed ?? 1) {
  if (welt._bunkerplan !== undefined) return welt._bunkerplan;
  if (welt.bunkertor) return welt._bunkerplan = { tor: { x: welt.bunkertor.x, y: welt.bunkertor.y } };
  const rnd = zufall((seed ^ 0x42554e4b) >>> 0), W = BREITE * KACHEL, H = HOEHE * KACHEL, st = welt.start ?? { x: W / 2, y: H / 2 };
  for (let n = 0; n < 400; n++) {
    const a = rnd() * Math.PI * 2, d = 400 + rnd() * 1100, x = st.x + Math.cos(a) * d, y = st.y + Math.sin(a) * d;
    if (x < 150 || y < 150 || x > W - 150 || y > H - 150 || !frei(welt, x, y, 40)) continue;
    if (findeWeg(welt, st.x, st.y, x, y, 11, 40000, true)) return welt._bunkerplan = { tor: { x, y } };
  }
  return welt._bunkerplan = { tor: { x: st.x + 300, y: st.y } };
}

// Absturzstelle des A400M (Königsdorf): auf der Anflugachse der Landebahn weit vor dem Aufsetzpunkt, im Kartenrandbereich
export function absturzPlan(welt, seed = welt.seed ?? 1) {
  if (welt._absturzplan !== undefined) return welt._absturzplan;
  const W = BREITE * KACHEL, H = HOEHE * KACHEL, fp = welt.fein ? flugplanBerechnen(welt, seed) : null, hp = heliPlan(welt, seed);
  if (!hp) return welt._absturzplan = null;
  const rnd = zufall((seed ^ 0x41425354) >>> 0);
  const w = fp ? fp.w : rnd() * Math.PI * 2, ax = fp ? fp.start.x : hp.heli.x, ay = fp ? fp.start.y : hp.heli.y;
  const c = Math.cos(w), s = Math.sin(w);
  let d = 700;
  const klemme = (v, m) => Math.max(160, Math.min(m - 160, v));
  const x = klemme(ax - c * d, W), y = klemme(ay - s * d, H);
  return welt._absturzplan = { x, y, w: Math.atan2(ay - y, ax - x) || w, heli: hp.heli };
}

function hubschrauberPlatz(welt, rampe, rnd) {
  const W = BREITE * KACHEL, H = HOEHE * KACHEL, liste = [];
  for (let n = 0; n < 160 && liste.length < 6; n++) {
    const a = rnd() * Math.PI * 2, d = HELI_ABSTAND[0] + rnd() * (HELI_ABSTAND[1] - HELI_ABSTAND[0]);
    const x = rampe.x + Math.cos(a) * d, y = rampe.y + Math.sin(a) * d;
    if (x < 200 || y < 200 || x > W - 200 || y > H - 200) continue;
    if (!frei(welt, x, y, HELI_RAD)) continue;
    liste.push({ x, y });
  }
  for (const p of liste) if (findeWeg(welt, rampe.x, rampe.y, p.x, p.y, 11, 40000, true)) return p;
  return null;
}
