// Missionsgegenstände quer über die Karte (Aufgabe A1/A2): Je Welt (Seed) und Level werden einige Gegenstände in WEIT
// auseinanderliegenden Gebäuden versteckt (in einem Behälter des Innenraums). Auf der Karte erscheint nur ein Suchkreis
// (~150 m), der durch Hinweise kleiner wird. Alles deterministisch aus Seed + Level + Karte; nur der Server braucht es.
import { KACHEL, BREITE, zufall, ladenArt } from '../client/welt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { waehleOrte } from './mission_orte.mjs';

export const SUCH_RADIUS = 800;    // 100 m (8 px je m): Suchkreis der Missionsgegenstände
export const LANDEFEUER_RADIUS = 560;   // 70 m: Suchkreis der Landefeuer
export const LANDEFEUER_MAX = 5;   // höchstens so viele Landefeuer (eins je echtem Mitspieler, Bots zählen nicht)
export const SUCH_MIN = 150;       // kleiner wird der Kreis nie (~19 m)
const KREIS_VERSATZ = 0.8;         // Kreismitte höchstens so weit (Anteil vom Radius) vom Ziel entfernt: das Ziel liegt sicher drin
const BEHAELTER_OK = new Set(['schrank', 'spind', 'laden', 'laden_lebensmittel', 'laden_apotheke', 'laden_kaufhaus', 'laden_gaststaette', 'laden_polizei']);

// Missionsgegenstände je Level; typen = passende Gebäudearten (OSM shop/amenity) in Rangfolge, 'gross' = größeres Gebäude
const FUNK = [
  { ding: 'm_funk', typen: ['electronics', 'hardware', 'doityourself', 'car_repair', 'police', 'fire_station', 'school', 'sports', 'motorcycle', 'gross'] },
  { ding: 'm_batterie', typen: ['car_repair', 'car', 'motorcycle', 'hardware', 'doityourself', 'variety_store', 'department_store', 'car_wash'] },
  { ding: 'm_antenne', typen: ['hardware', 'doityourself', 'electronics', 'caravan', 'variety_store', 'sports', 'motorcycle', 'car'] },
];
export const MISSIONEN = {
  geretsried: [
    ...FUNK,
    { ding: 'm_schluessel', typen: ['townhall', 'police', 'bank', 'school', 'social_facility', 'place_of_worship', 'gross'] },
    { ding: 'm_diesel', typen: ['fuel', 'car_repair', 'car', 'caravan', 'car_wash'] },
  ],
  // Level 1, zweite Karte (Geretsried Nord/Ost, größer, viele benannte Läden): gleiche Gegenstände wie Geretsried, die Orte wählt der Plan nach Gebäudeart
  geretsried2: [
    ...FUNK,
    { ding: 'm_schluessel', typen: ['townhall', 'police', 'bank', 'school', 'social_facility', 'place_of_worship', 'gross'] },
    { ding: 'm_diesel', typen: ['fuel', 'car_repair', 'car', 'caravan', 'car_wash'] },
  ],
  isarauen: [
    ...FUNK,
    { ding: 'm_treibstoff', typen: ['fuel', 'car_wash', 'car_repair', 'motorcycle', 'car'] },
    { ding: 'm_landefeuer', typen: ['sports', 'fast_food', 'kitchen', 'furniture', 'gross'] },
  ],
  // Level 3: Segelflugplatz Königsdorf (keine Tankstelle in der Karte: Hangars/große Gebäude als Rückfall)
  koenigsdorf: [
    ...FUNK,
    { ding: 'm_treibstoff', typen: ['fuel', 'car_wash', 'car_repair', 'car', 'motorcycle', 'gross'] },
    { ding: 'm_landefeuer', typen: ['events_venue', 'stationery', 'sports', 'gross'] },
  ],
  // Level 4: Kochel am See (NH90 steht schon da: Treibstoff und der Schlüssel zum Hubschrauber)
  kochel: [
    ...FUNK,
    { ding: 'm_treibstoff', typen: ['fuel', 'car_wash', 'car_repair', 'car', 'wholesale', 'gross'] },
    { ding: 'm_schluessel', typen: ['townhall', 'school', 'bank', 'place_of_worship', 'kindergarten', 'gross'] },
  ],
  // Level 5: Andermatt, Finale am Bunkertor (Schlüssel + Diesel für den Notstrom, das Tor öffnet erst, wenn alles da ist)
  andermatt: [
    ...FUNK,
    { ding: 'm_schluessel', typen: ['public_building', 'townhall', 'bank', 'school', 'post_office', 'fire_station', 'place_of_worship', 'gross'] },
    { ding: 'm_diesel', typen: ['fuel', 'car_repair', 'car', 'recycling', 'fire_station', 'sports', 'gross'] },
  ],
};
export const FUNK_TEILE = ['m_funk', 'm_batterie', 'm_antenne'];   // zusammen am Funktisch = Funkspruch
export const landefeuerId = i => i <= 1 ? 'm_landefeuer' : `m_landefeuer#${i}`;   // eindeutige Missions-Id (Gegenstandsart bleibt m_landefeuer)
export const dingVon = id => String(id).split('#')[0];
export const missionListe = karte => MISSIONEN[karte] ?? MISSIONEN.geretsried;

const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };

// Behälter eines Hauses (Erdgeschoss), in die ein Missionsgegenstand passt: nicht hinter Zimmertüren
export function missionsBehaelter(seed, welt, nr) {
  const w = innenraumFuer(seed, welt, `h${nr}eg`);
  return (w?.behaelter ?? []).filter(b => BEHAELTER_OK.has(b.art) && !b.tuer);
}

// Plan der Missionsorte: [{ id (eindeutig), ding (Gegenstandsart), nr, behaelter, x, y (Hausmitte), kx, ky, r (Suchkreis) }]
export function missionsPlan(seed, level, karte, welt, landefeuer = 1) {
  const nLF = Math.max(1, Math.min(LANDEFEUER_MAX, Math.floor(Number(landefeuer)) || 1));
  // Landefeuer: immer für die Höchstzahl geplant (damit die Orte nicht von der Spielerzahl abhängen), danach gekürzt: mehr Spieler → nur neue Orte kommen dazu
  const liste = missionListe(karte).flatMap(m => m.ding === 'm_landefeuer'
    ? Array.from({ length: LANDEFEUER_MAX }, (_, i) => ({ ...m, id: landefeuerId(i + 1), nr: i + 1 })) : [{ ...m, id: m.ding }]);
  const rng = zufall((seed ^ Math.imul(Math.max(1, level), 0x9e3779b1) ^ hash(karte) ^ 0x4d15) >>> 0);
  let kandidaten = (welt.haeuser ?? []).filter(h => h.betretbar && !h.safe).map(h => ({
    nr: h.nr, x: (h.x + h.b / 2) * KACHEL, y: (h.y + h.h / 2) * KACHEL,
    typ: h.art || (h.flaeche >= 40 ? 'gross' : ''),
  }));
  const behaelter = new Map();
  const behaelterVon = nr => { if (!behaelter.has(nr)) behaelter.set(nr, missionsBehaelter(seed, welt, nr)); return behaelter.get(nr); };
  const wuensche = liste.map(m => ({ id: m.id, typen: m.typen }));
  let orte = [];
  for (let versuch = 0; versuch < 12; versuch++) {
    orte = waehleOrte({ kandidaten, wuensche, rng, breite: BREITE * KACHEL });
    const schlecht = new Set(orte.filter(o => !behaelterVon(o.nr).length).map(o => o.nr));
    if (!schlecht.size) break;
    kandidaten = kandidaten.filter(k => !schlecht.has(k.nr));
  }
  const plan = [];
  for (const o of orte) {
    const bh = behaelterVon(o.nr);
    if (!bh.length) continue;
    const b = bh[Math.floor(rng() * bh.length)];
    const ding = dingVon(o.id), lf = ding === 'm_landefeuer', nummer = lf ? Number(o.id.split('#')[1] ?? 1) : 0;
    const r = lf ? LANDEFEUER_RADIUS : SUCH_RADIUS;
    const a = rng() * Math.PI * 2, d = r * KREIS_VERSATZ * Math.sqrt(rng());
    if (lf && nummer > nLF) continue;
    plan.push({ id: o.id, ding, nummer, von: lf ? nLF : 0, nr: o.nr, behaelter: b.id, x: o.x, y: o.y, kx: o.x + Math.cos(a) * d, ky: o.y + Math.sin(a) * d, r });
  }
  return plan;
}

// Hinweis: Suchkreis halbieren, das Ziel (x, y) bleibt drin (Mitte rückt im gleichen Verhältnis zum Ziel)
export function kreisSchrumpfen(m) {
  const r = Math.max(SUCH_MIN, m.r / 2);
  if (r >= m.r) return false;
  const k = r / m.r;
  m.kx = m.x + (m.kx - m.x) * k; m.ky = m.y + (m.ky - m.y) * k; m.r = r;
  return true;
}
