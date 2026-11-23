// Neue Helden-Figuren (Mixamo: Jennifer = Heldin, SWAT Guy = Held; exakt von oben gerendert, Atlas grafik/helden_<held|heldin>.webp + helden_neu.json,
// Bau: tools/mixamo/helden_atlas_bauen.py). Reine Logik (ohne Phaser): Waffe → Gruppe → Clip → Bildnummer, Mündungsversatz.
// Maßstab gemeinsam mit den Zombies: beide Atlanten haben 40 Atlas-Pixel je Meter (160-px-Feld = 4 m, Render gross=2), im Spiel gilt ZF_GROESSE für beide.
import { ZF_GROESSE } from './zombiefiguren.mjs';
export const FIG_PX_JE_M = 40;
export const HF_GROESSE = ZF_GROESSE;
export const HF_FIGUREN = ['held', 'heldin'];
export const HF_GRUPPEN = ['ohne', 'pistole', 'gewehr', 'schrot', 'messer', 'schlaeger'];
// Waffe (welt.mjs WAFFEN, Schlüssel p.waffe bzw. aktiveWaffe) → Gruppe. Unbekannte Waffen, Faust, Handgranate: ohne Waffe in der Hand.
export const HF_GRUPPE = {
  pistole: 'pistole',
  gewehr: 'gewehr', mp: 'gewehr', mg: 'gewehr', scharfschuetze: 'gewehr', jagdgewehr: 'gewehr', granatwerfer: 'gewehr', armbrust: 'gewehr',
  schrotflinte: 'schrot',
  messer: 'messer',
  schlaeger: 'schlaeger', brechstange: 'schlaeger', sense: 'schlaeger',
};
export const hfGruppe = waffe => HF_GRUPPE[waffe] ?? 'ohne';
// Zustand → Clipname im Atlas. art: 'stehen' | 'gehen' | 'rennen' | 'schiessen' | 'nahkampf' | 'tod'
export function hfClip(gruppe, art) {
  if (art === 'tod') return 'tod';
  if (art === 'schiessen') return gruppe === 'pistole' || gruppe === 'gewehr' || gruppe === 'schrot' ? gruppe + '_schiessen' : hfClip(gruppe, 'nahkampf');
  if (art === 'nahkampf') return gruppe === 'messer' ? 'messer_stechen' : gruppe === 'schlaeger' ? 'schlaeger_schlagen' : 'faust_schlagen';   // Faust/Gewehrkolben: Schlag ohne Waffe in der Hand
  return gruppe === 'ohne' ? art : gruppe + '_' + art;
}
export const HF_SCHUSS_MS = 260;    // Anzeigedauer des Schussclips
export const HF_NAHKAMPF_MS = 450;  // Anzeigedauer von Stechen/Schlagen
export const HF_TOD_MS = 1400;      // Sterben (danach liegt die Figur im letzten Bild)
// Bildnummer: clip = Eintrag aus helden_neu.json (n, weg, dauer, einmal). Schleifen mit weg > 0 nach zurückgelegtem Weg (lauf, Spielpixel), sonst nach Zeit;
// einmalige Clips nach Zeit seit Beginn (seit, ms) über die Anzeigedauer ms
export function hfBild(clip, { lauf = 0, zeitMs = 0, seit = 0, ms = 1000 } = {}) {
  const n = clip.n;
  if (clip.einmal) return Math.max(0, Math.min(n - 1, Math.floor(seit / ms * n)));
  if (clip.weg > 0) return ((Math.floor(lauf / clip.weg * n) % n) + n) % n;
  return Math.floor(zeitMs / (clip.dauer * 1000) * n) % n;
}
export const hfName = (clip, i) => `${clip}_${String(i).padStart(2, '0')}`;
// Mündung (Spielpixel ab Figurmitte) für einen Schuss in Richtung ziel (rad): der Körper dreht so, dass die Waffe (Achse im Bild = winkel) zum Ziel zeigt
// mund = [x, y, winkel] aus helden_neu.json (Atlas-Pixel, x nach vorn, y nach unten), sk = Anzeigemaßstab der Figur
export function hfMuendung(mund, ziel, sk) {
  const r = ziel - mund[2], c = Math.cos(r), s = Math.sin(r), x = mund[0] * sk, y = mund[1] * sk;
  return { rot: r, x: x * c - y * s, y: x * s + y * c };
}
