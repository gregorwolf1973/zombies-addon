// Servertexte für die Clients (Zweisprachigkeit, Phase 2): Der Server schickt Schlüssel + Werte ({ k, w }) statt fertigem Text,
// jeder Client übersetzt sie in der Sprache seines Spielers (client/i18n.mjs textAus). Schlüssel stehen in client/i18n/de.mjs + en.mjs
// im Abschnitt „srv“. Werte, die selbst übersetzt werden (Gegenstand, Behälter, Ort), gehen verschachtelt als { k } mit;
// Listen als Array (Komma) oder { l: […], s: ' · ' }. Server-Logs dürfen textAus() nutzen (im Node immer Deutsch).
import { hat, textAus } from '../client/i18n.mjs';
import { ortK, alsFeld, ausFeld, feldText } from '../client/servertext.mjs';

export { textAus, ortK, alsFeld, ausFeld, feldText };

export const L = { lang: true };   // Meldung länger zeigen (mit Funk-Klick)

// M('tuer.blockiert') → { k: 'srv.tuer.blockiert' }; M('x', { n: 3 }, L) → { k, w, lang: true }
export function M(k, w, extra) {
  const m = { k: 'srv.' + k };
  if (w) m.w = w;
  return extra ? Object.assign(m, extra) : m;
}
// Gegenstands- bzw. Behältername als Schlüssel (unbekannt: die Kennung selbst)
export const D = id => (hat('ding.' + id, 'de') ? { k: 'ding.' + id } : String(id ?? ''));
export const B = art => (hat('behaelter.' + art, 'de') ? { k: 'behaelter.' + art } : String(art ?? ''));

// Name eines nicht-menschlichen Schützen („von“ in raum.schaden: Fahrzeuge, Bundeswehr, Polizei) als Schlüssel; Spielernamen bleiben
const SCHUETZE = { A400M: 'a400m', Auto: 'auto', Autounfall: 'autounfall', Bundeswehr: 'bundeswehr', Evakuierungsbus: 'bus', Evakuierungspanzer: 'panzer', Fahrzeug: 'fahrzeug', Polizei: 'polizei' };
export const schuetzeK = name => (SCHUETZE[name] ? M('schuetze.' + SCHUETZE[name]) : name);

// Hilfsfunktionen, die fertigen Text ODER { k, w } bekommen: Nachricht für send('meldung', …) bauen
export const nachricht = (m, extra) => (typeof m === 'string' ? { text: m, ...extra } : { ...m, ...extra });

// Ort einer Figur für den Chat: draußen, Safe Room, benanntes Haus oder „in einem Haus“
export function chatOrt(welt, p, safeRoomVon, EBENE_MUSTER) {
  const safe = safeRoomVon(welt, p);
  if (safe) return M('chat.safe', { ort: ortK(safe.name) });
  if (p.ebene) {
    const e = EBENE_MUSTER.exec(p.ebene);
    return (e && welt.haeuser?.[Number(e[1])]?.name) || M('chat.imHaus');
  }
  return M('chat.draussen');
}
