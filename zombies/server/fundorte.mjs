// Fundorte für die Karte: wo liegt ein Missionsgegenstand gerade (getragen / am Boden / im Behälter) und in welchen bereits
// geöffneten Behältern (oder am Boden) liegt etwas, das die offenen Aufgaben brauchen. Reine Rechenfunktionen über den Raum;
// das Ergebnis geht nur bei Änderung (und alle 10 s zur Sicherheit) als Nachricht 'fundorte' an die Clients.
// Hinweis: Inhalte ungeöffneter Behälter stehen noch nicht fest (werden erst beim Durchsuchen ausgewürfelt), darum gibt es dafür keine Punkte.
import { flach } from '../client/stapel.mjs';
import { KACHEL, BREITE, zufall, ladenArt, INNEN_FEIN } from '../client/welt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { KISTEN } from './a400m_kisten.mjs';
import { behaelterAufKarte, missionsBehaelter } from './mission.mjs';

// Aufgaben-Funde: Für jede offene Aufgabe legt der Server die gebrauchten Dinge fest in passende Behälter (verteilt über die Karte).
// Sie kommen beim Befüllen garantiert dazu (wie die Missionsgegenstände) und stehen als gelber Punkt auf der Karte.
const ARTEN_JE_DING = {
  spritze: ['laden_apotheke', 'erstehilfe', 'sanikiste'],
  wasser: ['laden_lebensmittel', 'kuehlregal', 'wagenecke', 'kuehlschrank', 'laden', 'laden_gaststaette'],
  essen: ['laden_lebensmittel', 'kuehlregal', 'kuehlschrank', 'laden', 'laden_gaststaette', 'herd'],
  taschenlampe: ['werkbank', 'werkzeugschrank', 'aktenschrank', 'laden_kaufhaus'],
  bretter: ['werkbank', 'werkzeugschrank', 'laden_kaufhaus', 'hochregal'],
};
const LADEN_JE_DING = { spritze: 'apotheke', wasser: 'lebensmittel', essen: 'lebensmittel', taschenlampe: 'kaufhaus', bretter: 'kaufhaus' };
export const FUNDE_RESERVE = 1;

// bedarf: { ding: Anzahl } → [{ ding, behaelter }] (Reserve +1 je Ding). Eigene Zufallsquelle aus Seed/Level, verschiebt die übrige Beute nicht.
export function aufgabenFundePlan(seed, level, welt, bedarf) {
  const rng = zufall((seed ^ Math.imul(Math.max(1, level), 0x9e3779b1) ^ 0x7f41) >>> 0);
  const plan = [], genutzt = new Map();   // Behälter-Id → Anzahl belegt (höchstens 1 Ding je Behälter und Art)
  const haeuser = (welt.haeuser ?? []).filter(h => h.betretbar && !h.safe);
  const eg = new Map();
  const behaelterVon = h => { if (!eg.has(h.nr)) eg.set(h.nr, (innenraumFuer(seed, welt, `h${h.nr}eg`)?.behaelter ?? []).filter(b => !b.tuer)); return eg.get(h.nr); };
  for (const [ding, soll] of Object.entries(bedarf)) {
    const n = soll + FUNDE_RESERVE, arten = new Set(ARTEN_JE_DING[ding] ?? []);
    const mischen = l => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const passend = mischen(haeuser.filter(h => ladenArt(h) === LADEN_JE_DING[ding])), rest = mischen(haeuser.filter(h => ladenArt(h) !== LADEN_JE_DING[ding]));
    const gewaehlt = [];
    for (const [phase, liste] of [[0, passend], [0, rest], [1, mischen(haeuser)]]) {
      let versuche = 0;
      for (const h of liste) {
        if (gewaehlt.length >= n || ++versuche > 80) break;
        if (gewaehlt.some(g => g.nr === h.nr)) continue;
        // verteilt über die Karte: zuerst nur Häuser mit Abstand (15 % der Kartenbreite) zu den schon gewählten
        const mx = (h.x + h.b / 2) * KACHEL, my = (h.y + h.h / 2) * KACHEL;
        if (phase === 0 && gewaehlt.some(g => Math.hypot(g.mx - mx, g.my - my) < 0.15 * BREITE * KACHEL)) continue;
        const bh = phase === 0 ? behaelterVon(h).filter(b => arten.has(b.art) && !genutzt.has(b.id)) : missionsBehaelter(seed, welt, h.nr).filter(b => !genutzt.has(b.id));
        if (!bh.length) continue;
        const b = bh[Math.floor(rng() * bh.length)];
        genutzt.set(b.id, 1); gewaehlt.push({ nr: h.nr, mx, my }); plan.push({ ding, behaelter: b.id });
      }
    }
  }
  return plan;
}

// Bedarf der offenen Aufgaben (Menge je Ding) bei n Spielern
export function aufgabenBedarf(state, n, vorratFn) {
  const offen = id => { const a = state.aufgaben?.get(id); return !!a && !a.erledigt; };
  const b = {};
  if (offen('medizin')) b.spritze = 1;
  if (offen('vorraete')) { b.wasser = vorratFn(n); b.essen = vorratFn(n); }
  if (offen('lampen')) b.taschenlampe = Math.max(1, n);
  if (offen('bretter')) b.bretter = 4;
  return b;
}

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
// Ergebnis je Behälter-Id wird am Raum gemerkt (deterministisch aus Seed, Welt und Innenmodus; sonst baute jeder Aufruf das ganze Haus neu)
export function behaelterPosition(raum, id) {
  const m = EBENE.exec(id);
  if (m) {
    let c = raum.behaelterPosCache;
    if (!c || c.welt !== raum.welt || c.seed !== raum.state.seed || c.fein !== INNEN_FEIN) c = raum.behaelterPosCache = { welt: raum.welt, seed: raum.state.seed, fein: INNEN_FEIN, map: new Map() };
    if (c.map.has(id)) return c.map.get(id);
    const w = innenraumFuer(raum.state.seed, raum.welt, m[0]), b = w?.behaelter?.find(q => q.id === id);
    const pos = b ? behaelterAufKarte(raum.state.seed, raum.welt, Number(m[1]), b) : null;
    c.map.set(id, pos);
    return pos;
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
  for (const b of raum.state.boden.values()) if (KISTEN[b.ding] && !b.ebene) dazu([b.x, b.y], b.ding);   // A400M-Kisten (feste Funde), gelbe Punkte auf der Karte
  if (!gesucht.size) return aus;
  for (const [id, inhalt] of raum.inhalte) {
    if (id.includes('@') || !inhalt?.length) continue;
    const d = inhalt.find(x => gesucht.has(x));
    if (d) dazu(behaelterPosition(raum, id), d);
  }
  // fest eingeplante Aufgaben-Funde in noch ungeöffneten Behältern
  for (const e of raum.aufgaben?.fundePlan ?? []) if (gesucht.has(e.ding) && !raum.inhalte.has(e.behaelter)) dazu(behaelterPosition(raum, e.behaelter), e.ding);
  for (const b of raum.state.boden.values()) if (gesucht.has(b.ding)) dazu(b.ebene ? hausMitte(raum, b.ebene) : [b.x, b.y], b.ding);
  return aus.slice(0, 160);
}
