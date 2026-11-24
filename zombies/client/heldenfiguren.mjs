// Neue Helden-Figuren (Mixamo, exakt von oben gerendert; je Held ein Atlas grafik/helden_<id>.webp mit dem Körper OHNE Waffe, dazu helden_neu.json und der Waffen-Sprite-Atlas
// grafik/helden_waffen.webp; Bau: tools/mixamo/helden_atlas_bauen.py). Waffen und Taschenlampe sind eigene Sprites, die je Bild an der berechneten Handlage kleben (pos in helden_neu.json).
// Reine Logik (ohne Phaser): Held-Liste, Waffe → Gruppe → Clip → Bildnummer, Waffen-/Lampenlage, Mündungsversatz.
// Maßstab gemeinsam mit den Zombies: beide Atlanten haben 40 Atlas-Pixel je Welteinheit (Render gross=2), im Spiel gilt ZF_GROESSE für beide.
import { ZF_GROESSE } from './zombiefiguren.mjs';
export const FIG_PX_JE_M = 40;
// Helden stehen kompakt (Arme am Körper), Zombies strecken die Arme aus: Schulter-/Körperumriss stehend Zombie ~76 px, Held/Heldin ~53 px (Atlas-px) →
// Heldenbilder ×1,4 größer, damit Menschen und Zombies im Spiel gleich groß wirken (Körpergröße ~1,8 m)
export const HF_KORREKTUR = 1.4;
export const HF_GROESSE = ZF_GROESSE * HF_KORREKTUR;
// Alte Sprites (Schulterbreite 25,7 px bei Maßstab 0,42) auf die Schulterbreite der Mixamo-Helden (~15 px) bringen: Ziel 15,2 / 25,7
export const SCHULTER_ALT_PX = 25.7, SCHULTER_NEU_PX = 15.2;   // stehender Held: 53 Atlas-px × 0,2055 × 1,4
export const ALT_FAKTOR = SCHULTER_NEU_PX / SCHULTER_ALT_PX;
// Soldaten (Bundeswehr, Bild soldat_idle/soldat_schuss in figuren2): Schulterbreite 55 Bild-px (Höhe des Bildes quer zur Blickrichtung);
// Maßstab so, dass sie so breit sind wie die Mixamo-Helden (mg = Größenfaktor der Menschen, 1 = Standard)
export const SOLDAT_SCHULTER_PX = 55;
export const soldatSkala = (mg = 1) => SCHULTER_NEU_PX * mg / SOLDAT_SCHULTER_PX;

// Helden-Liste: EINZIGE Stelle für neue Helden (plus Atlas grafik/helden_<id>.webp, Eintrag in helden_neu.json, Vorschaubild in helden_vorschau.webp).
// Server (Zufall für Bots, Prüfung der Wahl), Startwahl (Auswahl + Vorschau) und Verwaltung (Zeile mit Häkchen) lesen dieselbe Liste.
// g = Kennbuchstabe im aussehen-String ('h,0,0'): h = Held, f = Heldin (wie bisher, alte Spielstände gelten weiter), die übrigen sind neu.
export const HF_LISTE = [
  { id: 'swatguy', g: 'h', name: 'Einsatzkraft' },      // Tarnanzug mit Schutzweste
  { id: 'jennifer', g: 'f', name: 'Rote Jacke' },
  { id: 'remy', g: 'r', name: 'Blondschopf' },          // blonder Mann, graues T-Shirt
  { id: 'alex', g: 'a', name: 'Schwarzer Anzug' },
  { id: 'brute', g: 'b', name: 'Muskelmann' },          // ~1,95 m
  { id: 'swat', g: 't', name: 'SWAT-Polizist' },
  { id: 'jody', g: 'j', name: 'Rosa Pulli' },
  { id: 'roth', g: 'o', name: 'Weißes Hemd' },
];
export const HF_FIGUREN = HF_LISTE.map(f => f.id);
export const HF_BUCHSTABEN = HF_LISTE.map(f => f.g).join('');
export const hfFigurVon = g => HF_LISTE.find(f => f.g === g)?.id ?? null;       // Kennbuchstabe → Figur-Id (null = kein Mixamo-Held)
export const hfBuchstabeVon = id => HF_LISTE.find(f => f.id === id)?.g ?? 'h';   // Figur-Id → Kennbuchstabe
// Einstellung bereinigen: { id: { an: bool } } für jeden Helden der Liste (fehlend = an); mindestens einer bleibt an
export function hfFigurenEinst(e) {
  const r = {};
  for (const f of HF_LISTE) { const q = e && typeof e === 'object' ? e[f.id] : null; r[f.id] = { an: typeof q?.an === 'boolean' ? q.an : true }; }
  if (!Object.values(r).some(q => q.an)) r[HF_LISTE[0].id].an = true;
  return r;
}
// aktive Helden (Liste der Kennbuchstaben, Reihenfolge wie HF_LISTE)
export const hfAktive = einst => { const e = hfFigurenEinst(einst); return HF_LISTE.filter(f => e[f.id].an).map(f => f.g); };
// Zufälliger aktiver Held (r = 0..1): Kennbuchstabe
export function hfZufall(einst, r) { const a = hfAktive(einst); return a[Math.min(a.length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(r) || 0)) * a.length))]; }

// Körpergruppen: der Körper hält nichts (ohne, Messer, Schlagwaffen), die Pistole einhändig oder ein Langwaffen-Griff beidhändig (Gewehr, MP, MG, Scharfschütze, Granatwerfer, Armbrust, Schrot)
export const HF_GRUPPEN = ['ohne', 'pistole', 'gewehr', 'messer', 'schlag'];
export const HF_GRUPPE = {
  pistole: 'pistole',
  gewehr: 'gewehr', mp: 'gewehr', mg: 'gewehr', scharfschuetze: 'gewehr', jagdgewehr: 'gewehr', granatwerfer: 'gewehr', armbrust: 'gewehr', schrotflinte: 'gewehr',
  messer: 'messer',
  schlaeger: 'schlag', brechstange: 'schlag', sense: 'schlag',
};
export const hfGruppe = waffe => HF_GRUPPE[waffe] ?? 'ohne';   // Faust, Handgranate, unbekannte Waffen: ohne Waffe in der Hand
// Waffe (welt.mjs WAFFEN, Schlüssel p.waffe bzw. aktiveWaffe) → Sprite im Waffen-Atlas (null = nichts zeichnen)
export const HF_WAFFE_SPRITE = {
  pistole: 'pistole', gewehr: 'gewehr', jagdgewehr: 'gewehr', mp: 'mp', mg: 'mg', scharfschuetze: 'scharfschuetze', granatwerfer: 'granatwerfer', armbrust: 'armbrust', schrotflinte: 'schrotflinte',
  messer: 'messer', schlaeger: 'schlaeger', brechstange: 'brechstange', sense: 'sense',
};
export const hfWaffeSprite = waffe => HF_WAFFE_SPRITE[waffe] ?? null;
// Zustand → Clipname im Atlas. art: 'stehen' | 'gehen' | 'rennen' | 'schiessen' | 'nahkampf' | 'werfen' | 'tod'
export function hfClip(gruppe, art) {
  if (art === 'tod' || art === 'werfen') return art;
  // Gewehr-Gruppe: eigener Schussclip; Pistole: kein eigener Clip (der Mixamo-Schuss steht seitlich zum Ziel) – Haltung der Pistole im Stehen, die Waffe schlägt im Spiel zurück (spiel.mjs)
  if (art === 'schiessen') return gruppe === 'gewehr' ? 'gewehr_schiessen' : gruppe === 'pistole' ? 'pistole_stehen' : hfClip(gruppe, 'nahkampf');
  if (art === 'nahkampf') return gruppe === 'messer' ? 'messer_stechen' : gruppe === 'schlag' ? 'schlaeger_schlagen' : 'faust_schlagen';   // Faust/Gewehrkolben: Faustschlag, keine Waffe sichtbar
  return gruppe === 'pistole' || gruppe === 'gewehr' ? gruppe + '_' + art : art;
}
export const HF_SCHUSS_MS = 260;    // Anzeigedauer des Schussclips
export const HF_NAHKAMPF_MS = 450;  // Anzeigedauer von Stechen/Schlagen/Faustschlag
export const HF_WURF_MS = 800;      // Anzeigedauer des Wurfs (Abschnitt des Clips „werfen“: Ausholen und Wurf)
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

// Lage eines Waffen-/Lampen-Sprites für ein Bild: pose = [x, y, winkel, längenfaktor] (Atlas-Pixel ab Bildmitte), rot = Drehung des Körperbildes, sk = Anzeigemaßstab.
// Ergebnis: Versatz ab Figurmitte (Spielpixel, mit der Körperdrehung mitgedreht), Drehung und Maßstab des Sprites (x verkürzt bei geneigter Waffe)
export function hfLage(pose, rot, sk) {
  const c = Math.cos(rot), s = Math.sin(rot), x = pose[0] * sk, y = pose[1] * sk;
  return { x: x * c - y * s, y: x * s + y * c, rot: rot + pose[2], sx: sk * pose[3], sy: sk };
}
// Taschenlampe am Lauf einer Zweihandwaffe: eigene Pose aus der Waffenpose und dem Montagepunkt der Waffe (meta.lampe = [vorwärts, seitlich] Atlas-px ab Griff)
export function hfLampeAmLauf(pose, meta) {
  const m = meta?.lampe; if (!m) return null;
  const c = Math.cos(pose[2]), s = Math.sin(pose[2]), v = m[0] * pose[3], q = m[1];
  return [pose[0] + c * v - s * q, pose[1] + s * v + c * q, pose[2], pose[3]];
}
// Mündung (Spielpixel ab Figurmitte) für einen Schuss in Richtung ziel (rad): der Körper dreht so, dass die Waffe (Achse = pose[2]) zum Ziel zeigt
// pose aus pos[figur][clip][waffe][bild], meta = waffen[waffe] aus helden_neu.json, sk = Anzeigemaßstab der Figur
export function hfMuendung(pose, meta, ziel, sk) {
  const r = ziel - pose[2], c = Math.cos(r), s = Math.sin(r), l = meta.laenge * (1 - meta.griff) * pose[3];
  const x = (pose[0] + Math.cos(pose[2]) * l) * sk, y = (pose[1] + Math.sin(pose[2]) * l) * sk;
  return { rot: r, x: x * c - y * s, y: x * s + y * c };
}
