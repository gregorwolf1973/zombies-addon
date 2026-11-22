// Zäune um Spielplätze (OSM leisure=playground → karte.flaechen mit a 'spielplatz').
// Je Spielplatz eine glatte Holzzaun-Linie ('z', überkletterbar) entlang des Flächenumrisses, mit einer Lücke als Eingang an der
// Kante, die der nächsten Straße/dem nächsten Weg am nächsten liegt. Läuft beim Weltaufbau (Client und Server): deterministisch,
// nur + − × ÷ und Math.sqrt, kein Zufall, keine Winkelfunktionen.
const MIN_FLAECHE = 3;        // Kacheln² (≈ 48 m²): kleinere „Spielplätze“ bleiben offen
const LUECKE = 1.125;         // Kacheln (4,5 m): die Spielfigur (Radius 7 px) braucht im 1-m-Kollisionsraster mindestens 3 freie Felder neben den Zaunenden
const MIN_KANTE = LUECKE + 0.7;   // nur Kanten, auf denen die Lücke mit etwas Rand Platz hat

const rund = v => Math.round(v * 1000) / 1000;
const laenge = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
function flaeche(P) {   // P: [[x, y], …] (Kacheln²)
  let s = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
function distPunktStrasse(px, py, strassen) {
  let best = Infinity;
  for (const s of strassen) {
    const p = s.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay, L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
  }
  return best;   // Quadrat des Abstands genügt zum Vergleichen
}

// Fügt die Spielplatzzäune an karte.zaeune an (neue Karte, Eingabe bleibt unverändert). Karten ohne zaeune bleiben unberührt.
export function spielplatzZaeune(karte) {
  if (!karte?.zaeune || !Array.isArray(karte.flaechen)) return karte;
  const neu = [];
  for (const f of karte.flaechen) {
    if (f.a !== 'spielplatz' || !f.p || f.p.length < 6) continue;
    const P = [];
    for (let i = 0; i + 1 < f.p.length; i += 2) P.push([f.p[i], f.p[i + 1]]);
    if (flaeche(P) < MIN_FLAECHE) continue;
    const n = P.length;
    // Eingangskante: lange genug und mit der Mitte am dichtesten an einer Straße (bei Gleichstand die längere, dann die erste)
    let e = -1, eBest = Infinity, eLang = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], L = laenge(b[0] - a[0], b[1] - a[1]);
      if (L < MIN_KANTE) continue;
      const d = karte.strassen?.length ? distPunktStrasse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, karte.strassen) : -L;
      if (d < eBest - 1e-9 || (Math.abs(d - eBest) <= 1e-9 && L > eLang)) { e = i; eBest = d; eLang = L; }
    }
    const pts = [];
    if (e < 0) { for (const q of P) pts.push(rund(q[0]), rund(q[1])); pts.push(rund(P[0][0]), rund(P[0][1])); }   // keine passende Kante: geschlossener Ring ohne Eingang
    else {
      const a = P[e], b = P[(e + 1) % n], L = laenge(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      pts.push(rund(mx + ux * LUECKE / 2), rund(my + uy * LUECKE / 2));   // hinter der Lücke starten, einmal rundherum, vor der Lücke enden
      for (let k = 1; k <= n; k++) { const q = P[(e + k) % n]; pts.push(rund(q[0]), rund(q[1])); }
      pts.push(rund(mx - ux * LUECKE / 2), rund(my - uy * LUECKE / 2));
    }
    neu.push({ a: 'z', p: pts });
  }
  return neu.length ? { ...karte, zaeune: [...karte.zaeune, ...neu] } : karte;
}
