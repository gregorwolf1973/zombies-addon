// Automatische Schussreichweite bei Nacht und Nebel: das Ziel ist schlecht zu sehen, die Reichweite sinkt um `schussDunkel` % (Backend, Vorgabe 30).
// Ausnahme: das Ziel ist beleuchtet – Taschenlampenkegel (eigene, Mitspieler, Bots), Scheinwerfer eines gefahrenen Autos, Feuer/brennendes Wrack.
// Reine Logik ohne Raum (Test: tests/schussdunkel.test.mjs); der Server entscheidet, der Client zeigt keinen Reichweitenring.
import { dunkelVon, PKW_LICHT_DUNKEL, pkwLichtPunkte } from '../client/pkwlicht.mjs';
import { PKW } from '../client/pkw.mjs';

export const SCHUSS_DUNKEL_VORGABE = 30;   // % weniger Reichweite
const PX_JE_M = 8;                         // 4 m je Kachel à 32 px
export const LAMPE_LAENGE = 30 * PX_JE_M;  // heller Teil des Taschenlampenkegels (Pixel)
export const LAMPE_COS = Math.cos(0.35);   // halber Öffnungswinkel ~20°
export const PKW_LAENGE = 36 * PX_JE_M;    // Scheinwerferkegel
export const PKW_COS = Math.cos(0.4);
export const FEUER_SAUM = 5 * PX_JE_M;     // Feuerschein reicht so weit über den Brandradius hinaus
const FAHRER_NAHE = 24;                    // wie client/pkwdarstellung.mjs: Fahrer = Spieler im Boxer-Zustand nahe am Auto

// Anteil 0..1, wie stark die Sicht gerade eingeschränkt ist: Nacht (dunkel ≥ 0,3, wie beim Autolicht) voll, Nebel nach Dichte
export function dunkelAnteil(uhr, nebelDichte = 0) {
  const nacht = dunkelVon(uhr) >= PKW_LICHT_DUNKEL ? 1 : 0;
  return Math.max(nacht, Math.max(0, Math.min(1, nebelDichte || 0)));
}

// Reichweitenfaktor (1 = keine Einbuße)
export const schussFaktor = (uhr, nebelDichte, prozent = SCHUSS_DUNKEL_VORGABE) =>
  1 - Math.max(0, Math.min(90, Number.isFinite(Number(prozent)) ? Number(prozent) : SCHUSS_DUNKEL_VORGABE)) / 100 * dunkelAnteil(uhr, nebelDichte);

// liegt (zx, zy) im Kegel ab (qx, qy) in Richtung (cx, cy) (Einheitsvektor), Länge l, Mindest-Kosinus k? Ohne Winkelfunktionen.
export function imKegel(qx, qy, cx, cy, l, k, zx, zy) {
  const dx = zx - qx, dy = zy - qy, d = Math.hypot(dx, dy);
  if (d <= 6) return true;
  return d <= l && dx * cx + dy * cy >= k * d;
}

// Ist das Ziel (z) beleuchtet? quellen: { lampen: [{x,y,richtung}], autos: [{x,y,richtung}], feuer: [{x,y,r}] }
export function beleuchtet(q, zx, zy) {
  for (const l of q.lampen) if (imKegel(l.x, l.y, Math.cos(l.richtung), Math.sin(l.richtung), LAMPE_LAENGE, LAMPE_COS, zx, zy)) return true;
  for (const a of q.autos) {
    const c = Math.cos(a.richtung), s = Math.sin(a.richtung);
    for (const p of pkwLichtPunkte(a.x, a.y, a.richtung, PKW.laenge, PKW.breite).vorn) if (imKegel(p.x, p.y, c, s, PKW_LAENGE, PKW_COS, zx, zy)) return true;
  }
  for (const f of q.feuer) if (Math.hypot(zx - f.x, zy - f.y) <= (f.r || 0) + FEUER_SAUM) return true;
  return false;
}

// Lichtquellen draußen (ebene '') aus dem Raumzustand sammeln
export function lichtquellen(state, ebene = '') {
  const lampen = [], autos = [], feuer = [], fahrer = [];
  if (ebene) return { lampen, autos, feuer };   // drinnen: eigene Regeln (Lampe/Hauslicht), keine Einbuße
  for (const [, p] of state.spieler) {
    if ((p.ebene ?? '') !== '') continue;
    if (p.imBoxer) fahrer.push(p);
    else if (p.lampe > 0 && !(p.zombie > 0) && !p.unten) lampen.push({ x: p.x, y: p.y, richtung: p.richtung ?? 0 });
  }
  for (const [, f] of state.fahrzeuge) {
    if (f.art !== 'pkw' || f.leben <= 0) continue;
    if (fahrer.some(p => Math.abs(p.x - f.x) < FAHRER_NAHE && Math.abs(p.y - f.y) < FAHRER_NAHE)) autos.push({ x: f.x, y: f.y, richtung: f.richtung ?? 0 });
  }
  for (const [, f] of state.feuer) if (f.staerke > 0) feuer.push({ x: f.x, y: f.y, r: f.r });
  return { lampen, autos, feuer };
}
