// Zombie-Sicht (Backend-Einstellung zombieSicht): Meter/Grad/% -> Pixel/Bogenmaß; Server UND Client nutzen es.
// Grundwerte entsprechen exakt dem früheren festen Verhalten (W.sichtWeite 170 px usw.).
import { WERTE as W, helligkeit } from './welt.mjs';

export const SICHT_VORGABE = { gehen: 21, schleichen: 12, kegel: 75, verfolgen: 34, aufgeben: 64, nacht: 100 };
const PX = { gehen: W.sichtWeite, schleichen: W.sichtWeiteSchleichen, verfolgen: W.sichtWeite * 1.6, aufgeben: W.sichtWeite * 3 };   // Pixel der Grundwerte (exakt wie früher)

export function bereinigeSicht(e, alt) {
  const z = (v, min, max, vor) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : vor; };
  const a = { ...SICHT_VORGABE, ...(alt ?? {}) }, s = e ?? {};
  return {
    gehen: z(s.gehen ?? a.gehen, 3, 80, SICHT_VORGABE.gehen),
    schleichen: z(s.schleichen ?? a.schleichen, 2, 60, SICHT_VORGABE.schleichen),
    kegel: z(s.kegel ?? a.kegel, 20, 180, SICHT_VORGABE.kegel),
    verfolgen: z(s.verfolgen ?? a.verfolgen, 5, 150, SICHT_VORGABE.verfolgen),
    aufgeben: z(s.aufgeben ?? a.aufgeben, 10, 250, SICHT_VORGABE.aufgeben),
    nacht: z(s.nacht ?? a.nacht, 10, 200, SICHT_VORGABE.nacht),
  };
}

const px = (s, k) => (s[k] === SICHT_VORGABE[k] ? PX[k] : s[k] * 8);

// Sichtwerte in Pixeln; uhr (Spielminuten) optional für den Nachtfaktor auf Entdecken und Verfolgen
export function sichtPx(einst, uhr) {
  const s = { ...SICHT_VORGABE, ...(einst ?? {}) };
  const f = uhr === undefined || s.nacht === 100 ? 1 : 1 - (1 - s.nacht / 100) * (1 - helligkeit(uhr));
  return {
    gehen: px(s, 'gehen') * f, schleichen: px(s, 'schleichen') * f, verfolgen: px(s, 'verfolgen') * f, aufgeben: px(s, 'aufgeben'),
    winkel: s.kegel === SICHT_VORGABE.kegel ? W.sichtWinkel : s.kegel * Math.PI / 180,
  };
}
