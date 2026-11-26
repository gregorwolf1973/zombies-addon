// Finale in Andermatt: Atomschlag-Countdown im HUD und Abspann nach dem Schlag (Nachricht 'bunkerEnde' vom Server)
import { spendenFuellen } from './spenden.mjs';
import { t } from './i18n.mjs';
const $ = id => document.getElementById(id);
let letzter = -1;

export const finaleZeit = sek => { const s = Math.max(0, Math.ceil(sek)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// pro Frame: ☢️ mm:ss oben in der Mitte, die letzten 2 Minuten rot und blinkend
export function finaleHud(s) {
  const el = $('finale'); if (!el) return;
  const rest = s.finaleRest || 0;
  if (rest === letzter) return;
  letzter = rest;
  el.style.display = rest > 0 ? 'block' : 'none';
  if (rest <= 0) return;
  const t = `☢️ ${finaleZeit(rest)}`;
  if (el.textContent !== t) el.textContent = t;
  el.classList.toggle('dringend', rest <= 120);
}

// Abspann: weißer Atomblitz über den ganzen Bildschirm; wer im Bunker war, sieht den Sieg, wer draußen war (oder alle bei Niederlage) „Game over“
export function finaleAbspann(szene, m, meineId, ton, ort) {
  szene.cameras.main.flash(2500, 255, 255, 255);
  try { ton?.explosion?.(ort?.x ?? 0, ort?.y ?? 0); } catch { /* egal */ }
  const box = $('abspann'); if (!box) return;
  const drinnen = (m.drinnen ?? []).includes(meineId);
  const titel = t(m.sieg ? (drinnen ? 'finale.siegTitel' : 'finale.draussenTitel') : 'finale.gameOver');
  const text = t(m.sieg ? (drinnen ? 'finale.siegText' : 'finale.draussenText') : 'finale.niederlageText');
  box.innerHTML = '';
  const h = document.createElement('div'); h.className = 'abspann-titel'; h.textContent = titel;
  const p = document.createElement('div'); p.className = 'abspann-text'; p.textContent = text;
  const sp = document.createElement('div'); sp.className = 'spenden'; sp.dataset.spenden = 'abspann';
  box.append(h, p, sp);
  spendenFuellen(box);
  box.classList.add('an');
  box.classList.toggle('verloren', !m.sieg || !drinnen);
}

// beim Neustart der Welt (Seite lädt neu) verschwindet der Abspann von selbst; falls nicht, hiermit ausblenden
export function finaleAbspannZu() { $('abspann')?.classList.remove('an'); }
