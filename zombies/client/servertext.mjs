// Servertexte im Client (Zweisprachigkeit, Phase 2) – gemeinsam mit dem Server (server/texte.mjs):
// - Namen von Safe Rooms/Gebäuden aus den Weltdaten: Die Welt bleibt deutsch (Fingerabdruck, deterministischer Aufbau);
//   nur Gattungsnamen („Feuerwehrhaus“, „Keller“ …) werden beim Anzeigen übersetzt, Eigennamen („Kirche Maria Hilf“) bleiben.
//   Server: ortK(name) als Wert in Meldungen; Client: ortName(name) für HUD, Kiste und Schilder.
// - Texte in Schemafeldern (Zeichenketten, z. B. Aufgaben): { k, w } als JSON, feldText() übersetzt (alter reiner Text bleibt).
import { textAus } from './i18n.mjs';

const GATTUNG = {
  Feuerwehrhaus: 'feuerwehrhaus', Sakristei: 'sakristei', Lagerraum: 'lagerraum', Keller: 'keller',
  Safehouse: 'safehouse', Lagerhalle: 'lagerhalle', 'Safe Room': 'safeRoom',
};

export const ortK = name => (GATTUNG[name] ? { k: 'srv.ort.' + GATTUNG[name] } : name ?? '');
export const ortName = name => textAus(ortK(name));

export const alsFeld = m => (typeof m === 'string' ? m : JSON.stringify(m));
export function ausFeld(s) {
  if (typeof s !== 'string' || s[0] !== '{') return s ?? '';
  try { return JSON.parse(s); } catch { return s; }
}
export const feldText = s => textAus(ausFeld(s));
