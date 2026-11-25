// Fahrtempo-Stufen (Tempomat-Deckel): Knopf 🐢/🚀 im HUD bzw. Taste T schaltet reihum 30 → 50 → Höchsttempo; Umschalt (PC) = langsam (30 km/h)
export const TEMPO_KMH = [30, 50, Infinity];   // Stufe 0, 1, 2 (2 = Höchsttempo des Fahrzeugs)
export const TEMPO_STUFE_MAX = TEMPO_KMH.length - 1;
export const TEMPO_LANGSAM_KMH = 30;
export const tempoStufe = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(TEMPO_STUFE_MAX, n)) : TEMPO_STUFE_MAX; };
export const tempoNaechste = stufe => (tempoStufe(stufe) + 1) % TEMPO_KMH.length;
// Deckel in km/h (Infinity = keiner); Umschalt gedrückt = höchstens 30 km/h
export const tempoDeckelKmh = (stufe, langsam) => Math.min(TEMPO_KMH[tempoStufe(stufe)], langsam ? TEMPO_LANGSAM_KMH : Infinity);
export const tempoKnopfText = stufe => { const s = tempoStufe(stufe); return s === 0 ? '🐢 30' : s === 1 ? '50' : '🚀 max'; };
