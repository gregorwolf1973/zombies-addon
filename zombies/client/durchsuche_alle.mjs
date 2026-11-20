// "Alles durchsuchen": gemeinsame Auswahl der Behälter/Leichen für Server und Client (rein, ohne Zustand)
import { KACHEL, AKTION_ABSTAND, sichtfrei, durchsuchDauer } from './welt.mjs';

export const ALLE_FRAGEN = 3;                  // drinnen: so viele Quizfragen richtig, dann gehen alle Türen auf
export const ALLE_SPERRE = 30;                 // Sekunden Sperre nach einer falschen Antwort
export const ALLE_FAKTOR = 0.6;                 // Dauer = 60 % der Summe der Einzeldauern
export const ALLE_WEITE_INNEN = 8 * KACHEL;     // Reichweite im Innenraum (nur mit freier Sicht: geschlossene Türen/Wände sperren)
export const ALLE_WEITE_AUSSEN = 3.5 * KACHEL;  // draußen nur Autos/Leichen/Container in unmittelbarer Nähe
export const NIMM_WEITE = ALLE_WEITE_INNEN + 24;

// ich: { x, y, ebene }, w: Welt der Ebene, behaelter: Map id→{rest} (nur durchsuchte), leichen: Map id→{x,y,ebene,rest}
// Rückgabe: { liste: [{ id, art, x, y }], dauer, autoZu } – autoZu: Kofferräume ohne Brechstange (übersprungen)
export function alleKandidaten(w, behaelter, leichen, ich, hatBrechstange) {
  const ebene = ich.ebene ?? '';
  const weite = ebene ? ALLE_WEITE_INNEN : ALLE_WEITE_AUSSEN;
  const liste = []; let autoZu = 0;
  for (const b of w.behaelter ?? []) {
    if (b.art === 'bw_kiste' || b.art === 'bus') continue;   // Munitionskisten haben je Spieler eigenen Inhalt; Bus bleibt Einzelsuche
    if (behaelter.get(b.id)) continue;                       // schon durchsucht
    if (Math.hypot(b.x - ich.x, b.y - ich.y) > weite) continue;
    if (!sichtfrei(w, ich.x, ich.y, b.x, b.y)) continue;
    if (b.art === 'auto' && !hatBrechstange) { autoZu++; continue; }
    liste.push({ id: b.id, art: b.art, x: b.x, y: b.y });
  }
  for (const [id, l] of leichen) {
    if ((l.ebene ?? '') !== ebene || l.rest === 0) continue;
    if (Math.hypot(l.x - ich.x, l.y - ich.y) > weite) continue;
    if (!sichtfrei(w, ich.x, ich.y, l.x, l.y)) continue;
    liste.push({ id, art: 'leiche', x: l.x, y: l.y });
  }
  const dauer = ALLE_FAKTOR * liste.reduce((s, e) => s + durchsuchDauer(e.art), 0);
  return { liste, dauer, autoZu };
}
