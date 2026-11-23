// Fundorte für die Karte: wo liegt ein Missionsgegenstand gerade (getragen / am Boden / im Behälter) und in welchen bereits
// geöffneten Behältern (oder am Boden) liegt etwas, das die offenen Aufgaben brauchen. Reine Rechenfunktionen über den Raum;
// das Ergebnis geht nur bei Änderung (und alle 10 s zur Sicherheit) als Nachricht 'fundorte' an die Clients.
// Hinweis: Inhalte ungeöffneter Behälter stehen noch nicht fest (werden erst beim Durchsuchen ausgewürfelt), darum gibt es dafür keine Punkte.
import { flach } from '../client/stapel.mjs';
import { KACHEL } from '../client/welt.mjs';
import { behaelterAufKarte } from './mission.mjs';

const EBENE = /^h(\d+)(eg|keller|dach)/;

// Gegenstände, die die offenen Aufgaben (state.aufgaben) gerade brauchen
export function gesuchteDinge(state, medizinGefunden = false) {
  const offen = id => { const a = state.aufgaben?.get(id); return !!a && !a.erledigt; };
  const g = new Set();
  if (offen('medizin') && !medizinGefunden) g.add('spritze');
  if (offen('vorraete')) { g.add('wasser'); g.add('essen'); }
  if (offen('lampen')) g.add('taschenlampe');
  if (offen('bretter')) g.add('bretter');
  return g;
}

// Kartenposition (px) eines Behälters anhand seiner Id; null, wenn nicht auffindbar
export function behaelterPosition(raum, id) {
  const m = EBENE.exec(id);
  if (m) {
    const w = raum.ebenen?.get(m[0]), b = w?.behaelter?.find(q => q.id === id);
    return b ? behaelterAufKarte(raum.state.seed, raum.welt, Number(m[1]), b) : null;
  }
  const b = raum.welt.behaelter?.find(q => q.id === id);
  return b ? [b.x, b.y] : null;
}

// Mitte des Hauses einer Ebene (für Bodengegenstände in Innenräumen)
function hausMitte(raum, ebene) {
  const m = EBENE.exec(ebene), h = m ? raum.welt.haeuser?.[Number(m[1])] : null;
  return h ? [(h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL] : null;
}

// Aktueller Ort eines Missionsgegenstands: { getragen, x, y } (x/y nur, wenn er nicht getragen wird); sonst null = unverändert am Plan-Ort
export function missionsOrt(raum, ding) {
  for (const p of raum.state.spieler.values()) if (flach(p.rucksack).includes(ding)) return { getragen: true };
  for (const b of raum.state.boden.values()) {
    if (b.ding !== ding) continue;
    const pos = b.ebene ? hausMitte(raum, b.ebene) : [b.x, b.y];
    if (pos) return { getragen: false, x: Math.round(pos[0]), y: Math.round(pos[1]) };
  }
  return null;
}

// Liste [[x, y, ding], ...] (Kartenpixel, ohne Doppelte) der gesuchten Dinge in geöffneten Behältern bzw. am Boden
export function fundorteListe(raum, gesucht) {
  const aus = [], da = new Set();
  const dazu = (pos, ding) => {
    if (!pos) return;
    const k = `${Math.round(pos[0] / 8)},${Math.round(pos[1] / 8)},${ding}`;
    if (da.has(k)) return;
    da.add(k); aus.push([Math.round(pos[0]), Math.round(pos[1]), ding]);
  };
  if (!gesucht.size) return aus;
  for (const [id, inhalt] of raum.inhalte) {
    if (id.includes('@') || !inhalt?.length) continue;
    const d = inhalt.find(x => gesucht.has(x));
    if (d) dazu(behaelterPosition(raum, id), d);
  }
  for (const b of raum.state.boden.values()) if (gesucht.has(b.ding)) dazu(b.ebene ? hausMitte(raum, b.ebene) : [b.x, b.y], b.ding);
  return aus.slice(0, 120);
}
