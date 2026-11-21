// Ländliche Details und Ausdünn-Zonen für OSM-Karten (läuft identisch auf Client und Server: deterministisch, kein Math.random,
// kein Welt-Zufall r() – nur Positions-Hashes; die Reihenfolge der Schleifen ist fest).
//  1. laendlicheDetails(): Karten mit wenigen Bäumen (< BAUM_ZIEL je 1000 Kacheln) bekommen Baumgruppen, Alleen an Landstraßen,
//     Hecken, Feldwege/Bankette an Landstraßen, Weidezäune (mit Tor) und Heu-/Strohballen. Karten mit genug Bäumen bleiben unverändert.
//  2. b11Ausduennen(): Bäume rund um die B-11-Kreuzung am Rathaus (geretsried2) stark ausdünnen, damit Fahrzeuge Platz haben.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';
import { fahrbahnBreite } from './vektor.mjs';

export const BAUM_ZIEL = 0.075;   // Baumkacheln je Kachel (70 je 1000), darunter wird aufgefüllt

const hsh = (x, y, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const NACH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Feste Freihalte-Kreise (Kacheln) je Karte (bbox): Hubschrauber-Landeplatz Kochel, Bunkertor Andermatt samt Reserveplätzen
const FREIHALTEN = {
  '47.65,11.352,47.665,11.37': [[169, 207, 14], [168, 207, 14]],
  '46.6315,8.5865,46.639,8.6012': [[222, 9, 10], [271, 9, 8], [198, 52, 8], [58, 27, 8], [73, 15, 8]],
};

// Freihalte-Kreise [x, y, Radius] (Kacheln) der Karte; auch der Stützpunkt-Bau (stuetzpunkt.mjs) meidet sie
export const freihalteKreise = karte => FREIHALTEN[(karte.bbox ?? []).join(',')] ?? [];

// Chebyshev-Abstand (Kacheln) zu den Quellkacheln (Wert 1 in quelle), zwei Durchgänge
function abstandsfeld(quelle) {
  const d = new Int16Array(BREITE * HOEHE).fill(999);
  for (let i = 0; i < d.length; i++) if (quelle[i]) d[i] = 0;
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const i = y * BREITE + x; let m = d[i];
    if (x > 0) m = Math.min(m, d[i - 1] + 1);
    if (y > 0) { m = Math.min(m, d[i - BREITE] + 1); if (x > 0) m = Math.min(m, d[i - BREITE - 1] + 1); if (x < BREITE - 1) m = Math.min(m, d[i - BREITE + 1] + 1); }
    d[i] = m;
  }
  for (let y = HOEHE - 1; y >= 0; y--) for (let x = BREITE - 1; x >= 0; x--) {
    const i = y * BREITE + x; let m = d[i];
    if (x < BREITE - 1) m = Math.min(m, d[i + 1] + 1);
    if (y < HOEHE - 1) { m = Math.min(m, d[i + BREITE] + 1); if (x < BREITE - 1) m = Math.min(m, d[i + BREITE + 1] + 1); if (x > 0) m = Math.min(m, d[i + BREITE - 1] + 1); }
    d[i] = m;
  }
  return d;
}

function entlangLinie(p, schritt, f) {
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let d = 0; d < L; d += schritt) f(ax + (bx - ax) * d / L, ay + (by - ay) * d / L, (bx - ax) / L, (by - ay) / L);
  }
}

// B-11-Kreuzung am Rathaus: Knoten der B 11, an dem „Karl-Lederer-Platz“ beginnt ([x, y] in Kacheln) oder null
export function b11Kreuzung(karte) {
  const strassen = karte.strassen ?? [];
  const b11 = new Set();
  for (const s of strassen) if (s.ref === 'B 11') for (let i = 0; i + 1 < s.p.length; i += 2) b11.add(s.p[i].toFixed(1) + ',' + s.p[i + 1].toFixed(1));
  if (!b11.size) return null;
  let kreuz = null;
  for (const s of strassen) {
    if (s.ref === 'B 11' || !s.n?.includes('Karl-Lederer-Platz')) continue;
    for (let i = 0; i + 1 < s.p.length; i += 2) if (b11.has(s.p[i].toFixed(1) + ',' + s.p[i + 1].toFixed(1))) kreuz = [s.p[i], s.p[i + 1]];
  }
  return kreuz;
}

// Ausdünn-Zone der B-11-Kreuzung: Umkreis 40 Kacheln um die Kreuzung, entlang der B 11 bis 60 Kacheln Entfernung ±10 Kacheln seitlich.
// Liefert eine Funktion (x, y) → true/false (Kachelkoordinaten) oder null, wenn die Karte keine solche Kreuzung hat.
export function b11Zone(karte) {
  const kr = b11Kreuzung(karte);
  if (!kr) return null;
  const segmente = [];
  for (const s of karte.strassen) if (s.ref === 'B 11') for (let i = 0; i + 3 < s.p.length; i += 2) segmente.push([s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]]);
  const nahe = segmente.filter(([ax, ay, bx, by]) => Math.min(Math.hypot(ax - kr[0], ay - kr[1]), Math.hypot(bx - kr[0], by - kr[1])) <= 75);
  const segAbstand = (px, py, [ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5, d = Math.hypot(px - kr[0], py - kr[1]);
    if (d <= 40) return true;
    if (d > 70) return false;
    return d <= 60 && nahe.some(s => segAbstand(px, py, s) <= 10);
  };
}

// Bäume in der B-11-Zone auf ca. 10 % ausdünnen (feste Auswahl nach Position)
export function b11Ausduennen(karte, k, setze) {
  const inZone = b11Zone(karte);
  if (!inZone) return 0;
  let weg = 0;
  for (let y = 1; y < HOEHE - 1; y++) for (let x = 1; x < BREITE - 1; x++) {
    if (k[y * BREITE + x] !== T.BAUM || !inZone(x, y) || hsh(x, y, 77) < 0.1) continue;
    setze(x, y, T.WIESE); weg++;
  }
  return weg;
}

// ctx: { karte, k, hole, setze, haeuser, deko, nein (Uint8Array, 1 = gesperrt), zone (Uint8Array, 2 = Acker/Sport/Parkplatz …), start }
// karte.zaeune / karte.zaunart / karte.strassen müssen veränderbare Kopien sein (osmwelt.mjs sorgt dafür).
export function laendlicheDetails(ctx) {
  const { karte, k, hole, setze, haeuser, deko, nein, zone, start, ohneBaeume } = ctx;
  const N = BREITE * HOEHE;
  // Entscheidung „ländlich“ immer nach den OSM-Bäumen (Karten-Rohdaten); k enthält mit Luftbild schon die Luftbild-Bäume
  const lb = ohneBaeume ? karte.luftbild : null;
  let bestand = 0; for (let i = 0; i < N; i++) if ((lb ? karte.kacheln.charCodeAt(i) - 48 : k[i]) === T.BAUM) bestand++;
  if (bestand >= BAUM_ZIEL * N) return { baeume: 0, hecken: 0, zaeune: 0, ballen: 0, wege: 0 };
  const erg = { baeume: 0, hecken: 0, zaeune: 0, ballen: 0, wege: 0 };

  // Abstandsfelder: Gebäude (inkl. Gärten), Straßen/Plätze, Fuß-/Feldwege
  const geb = new Uint8Array(N), str = new Uint8Array(N), pfad = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = k[i];
    if (t === T.WAND || t === T.LEER || t === T.BODEN || t === T.TUER) geb[i] = 1;
    else if (t === T.STRASSE || t === T.PLATZ) str[i] = 1;
    const g = karte.garten?.[i]; if (g && g !== '.') geb[i] = 1;
  }
  const WEG = new Set(['footway', 'path', 'cycleway', 'track', 'steps', 'pedestrian']);
  for (const s of karte.strassen ?? []) if (WEG.has(s.t)) entlangLinie(s.p, 0.4, (x, y) => { const kx = Math.floor(x), ky = Math.floor(y); if (kx >= 0 && ky >= 0 && kx < BREITE && ky < HOEHE) pfad[ky * BREITE + kx] = 1; });
  const dGeb = abstandsfeld(geb), dStr = abstandsfeld(str), dPfad = abstandsfeld(pfad);
  const neinFeld = new Uint8Array(nein);

  // Sperrflächen: Landebahn samt Rollwegen, feste Freihalte-Kreise, B-11-Zone, Startplatz
  const piste = karte.piste;
  const nahPiste = (px, py) => {
    if (!piste) return false;
    const [x0, y0, x1, y1] = piste.p, L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, b = piste.b ?? 11;
    const u = (px - x0) * ux + (py - y0) * uy, v = -(px - x0) * uy + (py - y0) * ux;
    if (u >= -8 && u <= L + 8 && Math.abs(v) <= b / 2 + 8) return true;
    for (const l of piste.rollweg ?? []) for (let i = 0; i + 3 < l.length; i += 2) {
      const dx = l[i + 2] - l[i], dy = l[i + 3] - l[i + 1], t = Math.max(0, Math.min(1, ((px - l[i]) * dx + (py - l[i + 1]) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(px - l[i] - t * dx, py - l[i + 1] - t * dy) <= (piste.rb ?? 3) / 2 + 6) return true;
    }
    return false;
  };
  const kreise = freihalteKreise(karte);
  const b11 = b11Zone(karte);
  const sx = start.x / KACHEL, sy = start.y / KACHEL;
  const gesperrt = new Uint8Array(N);   // 1 = hier nie etwas Neues
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const i = y * BREITE + x;
    if (kreise.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) || (b11 && b11(x, y)) || Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 12) gesperrt[i] = 1;
  }
  if (piste) {   // nur den Kachelbereich der Piste prüfen (Rest ist weit weg)
    const xs = [piste.p[0], piste.p[2], ...(piste.rollweg ?? []).flatMap(l => l.filter((_, i) => i % 2 === 0))], ys = [piste.p[1], piste.p[3], ...(piste.rollweg ?? []).flatMap(l => l.filter((_, i) => i % 2 === 1))];
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - 20)), x1 = Math.min(BREITE - 1, Math.ceil(Math.max(...xs) + 20)), y0 = Math.max(0, Math.floor(Math.min(...ys) - 20)), y1 = Math.min(HOEHE - 1, Math.ceil(Math.max(...ys) + 20));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (nahPiste(x + 0.5, y + 0.5)) gesperrt[y * BREITE + x] = 1;
  }

  // Kachel ist als Wiese frei für Neues (Abstände in Kacheln zu Gebäuden/Gärten, Straßen, Wegen)
  const ok = (x, y, aGeb, aStr, aPfad) => {
    if (x < 3 || y < 3 || x >= BREITE - 3 || y >= HOEHE - 3) return false;
    const i = y * BREITE + x;
    if (lb && lb.charCodeAt(i) !== 50 && lb.charCodeAt(i) !== 51) return false;   // mit Luftbild nur auf Wiese/Acker (Ziffer 2/3)
    return k[i] === T.WIESE && !neinFeld[i] && !gesperrt[i] && zone[i] !== 2 && dGeb[i] >= aGeb && dStr[i] >= aStr && dPfad[i] >= aPfad;
  };
  const sperre = (x, y, rad = 0) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < BREITE && y + dy < HOEHE) neinFeld[(y + dy) * BREITE + x + dx] = 1; };
  const baum = (x, y) => { setze(x, y, T.BAUM); erg.baeume++; };

  // 1. Alleen entlang von Landstraßen (nur auf Strecken ohne Häuser, ohne Gehweg in der Nähe)
  const LAND = new Set(['primary', 'secondary', 'tertiary', 'unclassified']);
  const neuStrassen = [];
  (karte.strassen ?? []).forEach((s, si) => {
    if (!LAND.has(s.t)) return;
    const fb = fahrbahnBreite({ t: s.t, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0 }) / KACHEL;
    // Allee: etwa alle 4 Kacheln ein Baum, je Seite mit Lücken
    entlangLinie(s.p, 4, (px, py, ux, uy) => {
      for (const seite of [-1, 1]) {
        if (ohneBaeume || hsh(Math.round(px * 2), Math.round(py * 2), 31 + seite) > 0.5) continue;   // mit Luftbild: Bäume nur dort, wo das Luftbild sie zeigt
        const ab = fb / 2 + 1.8, x = Math.floor(px - uy * ab * seite), y = Math.floor(py + ux * ab * seite);
        if (ok(x, y, 6, 1, 3)) baum(x, y);
      }
    });
    // Bankett/Feldweg: durchgehende Strecken (≥ 10 Kacheln) auf einer Seite, nur wo Wiese frei ist
    const seite = hsh(Math.round(s.p[0]), Math.round(s.p[1]), 41 + si) < 0.5 ? 1 : -1;
    let lauf = [];
    const abschliessen = () => {
      if (lauf.length >= 6 && hsh(Math.round(lauf[0][0]), Math.round(lauf[0][1]), 43) < 0.85) {
        const p = []; for (const [x, y] of lauf) p.push(+x.toFixed(1), +y.toFixed(1));
        neuStrassen.push({ t: 'track', b: 1, p });
        for (const [x, y] of lauf) sperre(Math.floor(x), Math.floor(y), 1);
        erg.wege++;
      }
      lauf = [];
    };
    entlangLinie(s.p, 2, (px, py, ux, uy) => {
      const ab = fb / 2 + 1.3, x = px - uy * ab * seite, y = py + ux * ab * seite;
      if (ok(Math.floor(x), Math.floor(y), 4, 1, 3)) lauf.push([x, y]); else abschliessen();
    });
    abschliessen();
  });
  if (neuStrassen.length) karte.strassen.push(...neuStrassen);

  // 2. Baumgruppen in 6×6-Zellen, geordnet nach Hash (Wald/Grünflächen und gebäudenahe Zellen zuerst/später gewichtet), bis das Ziel erreicht ist
  const ziel = Math.ceil(BAUM_ZIEL * N);
  let anzahl = bestand + erg.baeume;
  const Z = 6, zellen = [];
  for (let j = 0; j * Z + 3 < HOEHE - 3; j++) for (let i = 0; i * Z + 3 < BREITE - 3; i++) {
    const cx = 3 + i * Z + 3, cy = 3 + j * Z + 3, ci = Math.min(HOEHE - 1, cy) * BREITE + Math.min(BREITE - 1, cx);
    zellen.push({ i, j, key: hsh(i, j, 11) * (zone[ci] === 1 ? 0.5 : 1) * (dGeb[ci] < 5 ? 1.6 : 1) });
  }
  zellen.sort((a, b) => a.key - b.key || a.j - b.j || a.i - b.i);
  for (let durchgang = 0; durchgang < 3 && anzahl < ziel && !ohneBaeume; durchgang++) {
    for (const c of zellen) {
      if (anzahl >= ziel) break;
      const ox = 3 + c.i * Z + Math.floor(hsh(c.i, c.j, 12 + durchgang) * Z), oy = 3 + c.j * Z + Math.floor(hsh(c.i, c.j, 15 + durchgang) * Z);
      const n = 4 + Math.floor(hsh(c.i, c.j, 18 + durchgang) * 8);   // 4..11 Bäume
      for (let m = 0; m < n; m++) {
        const x = ox + Math.round((hsh(c.i * 13 + m, c.j, 21 + durchgang) - 0.5) * 6), y = oy + Math.round((hsh(c.i, c.j * 13 + m, 24 + durchgang) - 0.5) * 6);
        if (ok(x, y, 3, 2, 2)) { baum(x, y); anzahl++; }
      }
    }
  }

  // 3. Hecken (Feldraine): gerade Stücke aus 3–5 Kacheln mit 2 Kacheln Lücke, in 16×16-Zellen
  const heckenOk = (x, y) => {
    if (!ok(x, y, 5, 3, 3)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = hole(x + dx, y + dy); if (t !== T.WIESE && t !== T.BAUM) return false; }
    return true;
  };
  const zaunLinie = (art, tiles) => {   // tiles: [[x, y], …] gerade hintereinander
    for (const [x, y] of tiles) { setze(x, y, T.ZAUN); ctx.zaunart[y * BREITE + x] = art; sperre(x, y, 1); }
    karte.zaeune.push({ a: art, p: tiles.length > 1 ? [tiles[0][0] + 0.5, tiles[0][1] + 0.5, tiles.at(-1)[0] + 0.5, tiles.at(-1)[1] + 0.5] : [tiles[0][0] + 0.2, tiles[0][1] + 0.5, tiles[0][0] + 0.8, tiles[0][1] + 0.5] });
  };
  for (let j = 0; j * 16 + 3 < HOEHE - 3; j++) for (let i = 0; i * 16 + 3 < BREITE - 3; i++) {
    if (ohneBaeume || hsh(i, j, 51) > 0.3) continue;   // mit Luftbild keine Zufalls-Hecken
    const quer = hsh(i, j, 52) < 0.5, laenge = 8 + Math.floor(hsh(i, j, 53) * 8);
    const x0 = 3 + i * 16 + Math.floor(hsh(i, j, 54) * 6), y0 = 3 + j * 16 + Math.floor(hsh(i, j, 55) * 6);
    const stuecke = []; let aktuell = [];
    for (let m = 0; m < laenge; m++) {
      const x = quer ? x0 + m : x0, y = quer ? y0 : y0 + m;
      if (m % 6 >= 4) { if (aktuell.length) stuecke.push(aktuell); aktuell = []; continue; }   // 4 Kacheln Hecke, 2 Kacheln Lücke
      if (!heckenOk(x, y)) { if (aktuell.length) stuecke.push(aktuell); aktuell = []; continue; }
      aktuell.push([x, y]);
    }
    if (aktuell.length) stuecke.push(aktuell);
    for (const s of stuecke) if (s.length >= 2) { zaunLinie('h', s); erg.hecken++; }
  }

  // 4. Weidezäune: Koppeln (8–12 × 6–9 Kacheln) mit 2 Kacheln breitem Tor, innen Heuballen; je 40×40-Zelle
  for (let j = 0; j * 40 + 6 < HOEHE - 6; j++) for (let i = 0; i * 40 + 6 < BREITE - 6; i++) {
    if (hsh(i, j, 61) > 0.35) continue;
    const w = 8 + Math.floor(hsh(i, j, 62) * 5), h = 6 + Math.floor(hsh(i, j, 63) * 4);
    const x0 = 6 + i * 40 + Math.floor(hsh(i, j, 64) * (40 - w - 8)), y0 = 6 + j * 40 + Math.floor(hsh(i, j, 65) * (40 - h - 8));
    let gut = true;
    for (let y = y0 - 1; y <= y0 + h && gut; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (!ok(x, y, 7, 4, 4)) { gut = false; break; }
      const t = hole(x, y); if (t !== T.WIESE) { gut = false; break; }
    }
    if (!gut) continue;
    const tor = Math.floor(hsh(i, j, 66) * 4), tm = 2 + Math.floor(hsh(i, j, 67) * (Math.min(w, h) - 4));
    const seiten = [
      Array.from({ length: w }, (_, m) => [x0 + m, y0]), Array.from({ length: h }, (_, m) => [x0 + w - 1, y0 + m]),
      Array.from({ length: w }, (_, m) => [x0 + w - 1 - m, y0 + h - 1]), Array.from({ length: h }, (_, m) => [x0, y0 + h - 1 - m]),
    ];
    seiten.forEach((s, n) => {
      if (n !== tor) { zaunLinie('z', s); return; }
      const a = s.slice(0, tm), b = s.slice(tm + 2);   // Tor: 2 Kacheln
      if (a.length) zaunLinie('z', a); if (b.length) zaunLinie('z', b);
    });
    erg.zaeune++;
    // Heuballen im Inneren (nicht vor dem Tor)
    for (let m = 0; m < 2; m++) {
      const bx = x0 + 2 + Math.floor(hsh(i, j, 70 + m) * (w - 4)), by = y0 + 2 + Math.floor(hsh(i, j, 73 + m) * (h - 4));
      if (hole(bx, by) !== T.WIESE) continue;
      setze(bx, by, T.DEKO); deko.push({ art: 'heu', kx: bx, ky: by, b: 1, h: 1, x: (bx + 0.5) * KACHEL, y: (by + 0.5) * KACHEL, v: hsh(bx, by, 79) }); erg.ballen++;
    }
  }

  // 5. Einzelne Heu-/Strohballen auf Feldern: 1–3 in einer Reihe, ringsum nur freie Wiese/Bäume, je 24×24-Zelle
  for (let j = 0; j * 24 + 4 < HOEHE - 4; j++) for (let i = 0; i * 24 + 4 < BREITE - 4; i++) {
    if (hsh(i, j, 81) > 0.45) continue;
    const x0 = 4 + i * 24 + Math.floor(hsh(i, j, 82) * 20), y0 = 4 + j * 24 + Math.floor(hsh(i, j, 83) * 20);
    const n = 1 + Math.floor(hsh(i, j, 84) * 3), quer = hsh(i, j, 85) < 0.5;
    for (let m = 0; m < n; m++) {
      const x = quer ? x0 + m * 2 : x0, y = quer ? y0 : y0 + m * 2;   // jede zweite Kachel: nie eine Wand quer über den Weg
      if (!heckenOk(x, y)) continue;
      setze(x, y, T.DEKO); deko.push({ art: 'heu', kx: x, ky: y, b: 1, h: 1, x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL, v: hsh(x, y, 86) }); sperre(x, y, 1); erg.ballen++;
    }
  }
  void haeuser;
  return erg;
}
