// Gegenstands-Icons (Gemini-Bilder, tools/dinge_bilder.py → grafik/dinge.webp + dinge.json).
// Für HTML: dingIcon(name) liefert ein <i> mit Bildausschnitt; ohne Bild (Liste noch nicht geladen, neuer Gegenstand)
// bleibt das Emoji aus DINGE. Für Phaser: dingRahmen(scene) legt je Gegenstand einen Rahmen im Bild 'dinge' an.
import { DINGE } from './welt.mjs';

export const DING_ALIAS = { handgranate: 'granate' };   // gleiches Bild
let liste = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setzeDingListe(json) {
  if (json && json.dinge && json.feld) liste = json;
}

export function hatDingBild(name) { return !!liste?.dinge?.[DING_ALIAS[name] ?? name]; }

// Icon als HTML (px = Kantenlänge); unbekannte Gegenstände: Emoji bzw. ersatz
export function dingIcon(name, px = 20, ersatz) {
  const p = liste?.dinge?.[DING_ALIAS[name] ?? name];
  if (!p) return esc(ersatz ?? DINGE[name]?.zeichen ?? '?');
  const k = px / liste.feld;
  return `<i class="ding-icon" style="width:${px}px;height:${px}px;background-position:${-p[0] * k}px ${-p[1] * k}px;background-size:${liste.breite * k}px ${liste.hoehe * k}px" title="${esc(DINGE[name]?.name ?? name)}"></i>`;
}

// Icon + Name als HTML
export const dingHtml = (name, px = 20) => `${dingIcon(name, px)} ${esc(DINGE[name]?.name ?? name)}`;

// Phaser: Rahmen je Gegenstand im geladenen Bild 'dinge' anlegen
export function dingRahmen(scene) {
  const tex = scene.textures.exists('dinge') ? scene.textures.get('dinge') : null;
  if (!tex || !liste) return;
  for (const [name, [x, y]] of Object.entries(liste.dinge)) if (!tex.has(name)) tex.add(name, 0, x, y, liste.feld, liste.feld);
}

export { esc as escHtml };
