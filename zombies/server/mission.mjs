// Missionsgegenstände quer über die Karte (Aufgabe A1/A2): Je Welt (Seed) und Level werden höchstens MISSION_MAX (3)
// Gegenstände in WEIT auseinanderliegenden Gebäuden versteckt (in einem Behälter des Erdgeschosses). Auf der Karte sitzt
// das Symbol GENAU am Gebäude (Paket N); der Kreis darum ist nur eine animierte Auffindhilfe. Hinweise (Zettel, Gerettete)
// gibt es deshalb nicht mehr. Alles deterministisch aus Seed + Level + Karte; nur der Server braucht es.
import { KACHEL, BREITE, zufall, ladenArt } from '../client/welt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { waehleOrte } from './mission_orte.mjs';

export const MISSION_MAX = 3;      // höchstens so viele Missionsgegenstände je Level (Gregor: nicht zu langwierig)
export const SUCH_RADIUS = 150;    // Auffindkreis um den Gegenstand (~19 m, zentriert, pulsiert auf der Karte)
export const LANDEFEUER_RADIUS = 150;
export const LANDEFEUER_MAX = 1;   // Landefeuer: nur eins (die Obergrenze MISSION_MAX gilt für alle Gegenstände zusammen)
export const SUCH_MIN = 150;
const BEHAELTER_OK = new Set(['schrank', 'spind', 'laden', 'laden_lebensmittel', 'laden_apotheke', 'laden_kaufhaus', 'laden_gaststaette', 'laden_polizei']);

// Missionsgegenstände je Level; typen = passende Gebäudearten (OSM shop/amenity) in Rangfolge, 'gross' = größeres Gebäude
const T_FUNK = { ding: 'm_funk', typen: ['electronics', 'hardware', 'doityourself', 'car_repair', 'police', 'fire_station', 'school', 'sports', 'motorcycle', 'gross'] };
const T_BATTERIE = { ding: 'm_batterie', typen: ['car_repair', 'car', 'motorcycle', 'hardware', 'doityourself', 'variety_store', 'department_store', 'car_wash'] };
const T_ANTENNE = { ding: 'm_antenne', typen: ['hardware', 'doityourself', 'electronics', 'caravan', 'variety_store', 'sports', 'motorcycle', 'car'] };
const schluessel = typen => ({ ding: 'm_schluessel', typen });
const T_DIESEL = { ding: 'm_diesel', typen: ['fuel', 'car_repair', 'car', 'caravan', 'car_wash'] };
const treibstoff = typen => ({ ding: 'm_treibstoff', typen });
const landefeuer = typen => ({ ding: 'm_landefeuer', typen });
// Je Level genau 3 Gegenstände; der Funkspruch braucht die vorhandenen Funkteile (m_funk, m_batterie, m_antenne) in der Kiste
export const MISSIONEN = {
  geretsried: [T_FUNK, T_BATTERIE, T_ANTENNE],
  // Level 1, zweite Karte (Geretsried Nord/Ost): gleiche Gegenstände, die Orte wählt der Plan nach Gebäudeart
  geretsried2: [T_FUNK, T_BATTERIE, T_ANTENNE],
  isarauen: [T_FUNK, T_ANTENNE, landefeuer(['sports', 'fast_food', 'kitchen', 'furniture', 'gross'])],
  // Level 3: Segelflugplatz Königsdorf (keine Tankstelle in der Karte: Hangars/große Gebäude als Rückfall)
  koenigsdorf: [T_FUNK, treibstoff(['fuel', 'car_wash', 'car_repair', 'car', 'motorcycle', 'gross']), landefeuer(['events_venue', 'stationery', 'sports', 'gross'])],
  // Level 4: Kochel am See (NH90 steht schon da: Treibstoff und der Schlüssel zum Hubschrauber)
  kochel: [T_FUNK, treibstoff(['fuel', 'car_wash', 'car_repair', 'car', 'wholesale', 'gross']), schluessel(['townhall', 'school', 'bank', 'place_of_worship', 'kindergarten', 'gross'])],
  // Level 5: Andermatt, Finale am Bunkertor (Schlüssel + Diesel für den Notstrom)
  andermatt: [T_FUNK, schluessel(['public_building', 'townhall', 'bank', 'school', 'post_office', 'fire_station', 'place_of_worship', 'gross']), T_DIESEL],
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

const ART_NAMEN = { electronics: 'Elektrogeschäft', hardware: 'Baumarkt', doityourself: 'Baumarkt', car_repair: 'Autowerkstatt', police: 'Polizei', fire_station: 'Feuerwehr', school: 'Schule', sports: 'Sportgeschäft', motorcycle: 'Motorradhändler', car: 'Autohaus',
  variety_store: 'Gemischtwaren', department_store: 'Kaufhaus', car_wash: 'Waschanlage', caravan: 'Wohnwagenhändler', townhall: 'Rathaus', bank: 'Bank', social_facility: 'Sozialeinrichtung', place_of_worship: 'Kirche', fuel: 'Tankstelle',
  recycling: 'Wertstoffhof', public_building: 'Amtsgebäude', post_office: 'Post', kindergarten: 'Kindergarten', wholesale: 'Großhandel', fast_food: 'Imbiss', kitchen: 'Küchenstudio', furniture: 'Möbelhaus', events_venue: 'Veranstaltungshalle', stationery: 'Schreibwaren' };
// „Autohaus Müller, Erdgeschoss“ bzw. „Baumarkt, Erdgeschoss“ (nur das Erdgeschoss, siehe missionsBehaelter)
export function ortText(haus) {
  const art = ART_NAMEN[haus?.art];
  const wo = haus?.name ? (art && !haus.name.toLowerCase().includes(art.toLowerCase()) ? `${art} ${haus.name}` : haus.name) : art ?? 'größeres Gebäude';
  return `${wo}, Erdgeschoss`;
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
    if (lf && nummer > nLF) continue;
    // Position exakt (Gebäudemitte), kx/ky = Kreismitte = Ziel; ort = Beschreibung für die Aufgabenliste (Erdgeschoss: nur dort liegen Gegenstände)
    plan.push({ id: o.id, ding, nummer, von: lf ? nLF : 0, nr: o.nr, behaelter: b.id, x: o.x, y: o.y, kx: o.x, ky: o.y, r, ort: ortText(welt.haeuser?.[o.nr]) });
  }
  return plan.slice(0, MISSION_MAX);
}

// Hinweis: Suchkreis halbieren, das Ziel (x, y) bleibt drin (Mitte rückt im gleichen Verhältnis zum Ziel)
export function kreisSchrumpfen(m) {
  const r = Math.max(SUCH_MIN, m.r / 2);
  if (r >= m.r) return false;
  const k = r / m.r;
  m.kx = m.x + (m.kx - m.x) * k; m.ky = m.y + (m.ky - m.y) * k; m.r = r;
  return true;
}
