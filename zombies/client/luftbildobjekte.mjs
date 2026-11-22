// Weitere Objekte aus dem Luftbild (tools/luftbild_gemini.py), Weltcode: Server und Geräte bauen dieselbe Welt (deterministisch, keine Winkelfunktionen
// für Entscheidungen, kein Zufall). Karten-Felder (x/y/p in Spielpixeln, 8 je Meter):
//   heckenLuftbild   [{ p: [x, y, …], b }]            Hecken (Polylinie, b = Breite m) → werden zu Hecken-Zäunen ('h') wie die OSM-Hecken
//   poolsLuftbild    [{ p: [x, y, …] }]               Schwimmbecken (Umriss) → Hindernis im feinen Raster (nicht begehbar)
//   schuppenLuftbild [{ p: [x, y, …] }]               Gartenhäuser/Carports (die 4 Ecken des gedrehten Rechtecks) → Hindernis im feinen Raster
//   belaegeLuftbild  [{ p: [x, y, …] }]               Einfahrten/Pflaster/Kies (Umriss) → nur Darstellung (welt.belaege)
import { BREITE, HOEHE, T } from './welt.mjs';

const KACHEL = 32;

const imPolygon = (px, py, p) => {
  let drin = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > py) !== (p[j + 1] > py) && px < (p[j] - p[i]) * (py - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) drin = !drin;
  }
  return drin;
};

// Hecken als zusätzliche Zaunlinien 'h' in die Karte einfügen (vor zaeuneAusduennen: Glättung, Lücken und Türzugänge gelten dann auch für sie).
// Die groben Zaunkacheln (nur auf freier Wiese, Zaunart 'h') setzt diese Funktion mit; die Eingabekarte bleibt unverändert.
export function heckenEinfuegen(karte) {
  const liste = karte?.heckenLuftbild;
  if (!Array.isArray(liste) || !liste.length || !karte.zaeune || typeof karte.zaunart !== 'string') return karte;
  const kach = karte.kacheln.split(''), art = karte.zaunart.split('');
  const zaeune = [...karte.zaeune];
  for (const h of liste) {
    if (!Array.isArray(h.p) || h.p.length < 4) continue;
    const p = h.p.map(v => v / KACHEL);   // Kacheln
    zaeune.push({ a: 'h', p });
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 0.25));
      for (let j = 0; j <= n; j++) {
        const x = Math.floor(ax + (bx - ax) * j / n), y = Math.floor(ay + (by - ay) * j / n);
        if (x < 1 || y < 1 || x >= BREITE - 1 || y >= HOEHE - 1) continue;
        const c = y * BREITE + x;
        if (kach[c] === String(T.WIESE)) { kach[c] = String(T.ZAUN); art[c] = 'h'; }
      }
    }
  }
  return { ...karte, zaeune, kacheln: kach.join(''), zaunart: art.join('') };
}

// Polygone der Luftbild-Objekte, wie sie die Welt weitergibt (fürs Zeichnen: welt.poolsEcht, welt.schuppenEcht, welt.belaege)
export function luftbildObjekte(karte) {
  const poly = l => (Array.isArray(l) ? l : []).filter(o => Array.isArray(o.p) && o.p.length >= 6 && o.p.every(Number.isFinite)).map(o => ({ p: o.p.slice() }));
  const neben = (Array.isArray(karte?.nebengebaeude) ? karte.nebengebaeude : [])
    .filter(o => Array.isArray(o.u) && o.u.length >= 6 && o.u.every(Number.isFinite))
    .map(o => ({ p: o.u.map(v => v * KACHEL), art: o.art ?? 'neben', h: o.h ?? 0, farbe: typeof o.dach_farbe === 'string' ? o.dach_farbe : null, dach: Array.isArray(o.dach) ? o.dach : [] }));
  return { pools: poly(karte?.poolsLuftbild), schuppen: poly(karte?.schuppenLuftbild), belaege: poly(karte?.belaegeLuftbild), neben };
}

// Feines Raster (FEIN je Kachel) mit Hindernissen füllen: Pools und Schuppen (Wert 1 = fest), nur wo das grobe Raster begehbar ist.
// Kacheln direkt vor Haustüren bleiben frei (macht baueFein danach ohnehin: Schritt 4).
export function feinFuellen(f, fb, FEIN, hole, obj, BLOCKIERT) {
  const fuell = (p) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const fp = KACHEL / FEIN;
    for (let fy = Math.max(0, Math.floor(y0 / fp)); fy <= Math.min(HOEHE * FEIN - 1, Math.floor(y1 / fp)); fy++) {
      for (let fx = Math.max(0, Math.floor(x0 / fp)); fx <= Math.min(BREITE * FEIN - 1, Math.floor(x1 / fp)); fx++) {
        if (!imPolygon((fx + 0.5) * fp, (fy + 0.5) * fp, p)) continue;
        const t = hole(Math.floor(fx / FEIN), Math.floor(fy / FEIN));
        if (t === T.STRASSE || t === T.TUER || t === T.PLATZ) continue;   // Fahrbahn, Türen, befestigte Plätze (Fahrgassen) bleiben frei
        if (!f[fy * fb + fx]) f[fy * fb + fx] = 1;
      }
    }
  };
  void BLOCKIERT;
  // Pools sind begehbar (Tempo 10 %, welt.poolZonen) und füllen das Raster nicht
  for (const s of obj.schuppen) fuell(s.p);
}

// Nebengebäude (karte.nebengebaeude aus dem LoD2-Gebäudemodell, tools/nebengebaeude.py): kleine, nicht betretbare Hindernisse im feinen Raster
// mit glattem Umriss (Feinfelder, deren Mitte im Grundriss liegt). Nicht auf Fahrbahn, Türen, Plätzen oder Hauswänden und nicht im Türkorridor
// (4 Kacheln vor jeder Haustür). ohneWeg(f) = Liste der Häuser ohne Weg zur Straße; Nebengebäude, die ein Haus neu einsperren, fallen wieder weg
// (wie viele Schleifen nötig sind, bestimmt das Ergebnis, keine Zufallswerte).
// Rückgabe: Liste der gesetzten Nebengebäude { p (Spielpixel), art, h, dach }.
export function nebenPlatzieren(f, fb, FEIN, hole, neben, haeuser, ohneWeg) {
  const fp = KACHEL / FEIN, fh = f.length / fb;
  const korridor = [];
  for (const h of haeuser) if (h.tuer) for (let s = 0; s <= 3; s++) korridor.push([(h.tuer.x + 0.5 + h.raus.dx * s) * KACHEL, (h.tuer.y + 0.5 + h.raus.dy * s) * KACHEL]);
  const kandidaten = [];
  for (const n of neben) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < n.p.length; i += 2) { x0 = Math.min(x0, n.p[i]); x1 = Math.max(x1, n.p[i]); y0 = Math.min(y0, n.p[i + 1]); y1 = Math.max(y1, n.p[i + 1]); }
    const zellen = []; let ok = true, gesamt = 0;
    for (let fy = Math.max(0, Math.floor(y0 / fp)); fy <= Math.min(fh - 1, Math.floor(y1 / fp)) && ok; fy++) {
      for (let fx = Math.max(0, Math.floor(x0 / fp)); fx <= Math.min(fb - 1, Math.floor(x1 / fp)); fx++) {
        const px = (fx + 0.5) * fp, py = (fy + 0.5) * fp;
        if (!imPolygon(px, py, n.p)) continue;
        gesamt++;
        if (korridor.some(([kx, ky]) => (kx - px) * (kx - px) + (ky - py) * (ky - py) < 28 * 28)) { ok = false; break; }
        const t = hole(Math.floor(fx / FEIN), Math.floor(fy / FEIN));
        if (t === T.STRASSE || t === T.TUER || t === T.PLATZ || t === T.WAND || t === T.LEER || t === T.WASSER || t === T.BODEN) continue;   // Zelle bleibt frei
        zellen.push(fy * fb + fx);
      }
    }
    ok = ok && zellen.length >= 4 && zellen.length >= 0.7 * gesamt;   // mindestens 70 % des Grundrisses liegen auf freiem Grund, sonst ganz weglassen
    if (ok) kandidaten.push({ n, zellen });
  }
  const setze = liste => {
    const alt = new Map();
    for (const k of liste) for (const c of k.zellen) if (!alt.has(c)) { alt.set(c, f[c]); f[c] = 1; }
    return alt;
  };
  const rueck = alt => { for (const [c, v] of alt) f[c] = v; };
  const vorher = new Set(ohneWeg(f).map(h => h.x + ',' + h.y));
  let aktiv = kandidaten;
  for (let runde = 0; runde < 6; runde++) {
    const alt = setze(aktiv);
    const neu = ohneWeg(f).filter(h => !vorher.has(h.x + ',' + h.y));
    rueck(alt);
    if (!neu.length) break;
    // Nebengebäude in 10 Kacheln Umkreis der neu eingesperrten Häuser weglassen
    aktiv = aktiv.filter(k => !neu.some(h => {
      const cx = k.zellen[0] % fb * fp / KACHEL, cy = Math.floor(k.zellen[0] / fb) * fp / KACHEL;
      return (cx - h.tuer.x) * (cx - h.tuer.x) + (cy - h.tuer.y) * (cy - h.tuer.y) < 100;
    }));
  }
  setze(aktiv);
  return aktiv.map(k => k.n);
}
