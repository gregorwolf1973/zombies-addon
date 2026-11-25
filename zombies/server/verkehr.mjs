// Fahrzeuge auf den echten Straßenlinien (OSM-Vektordaten) statt über das Kachelraster: glatte Fahrt, rechte Spur.
// Linienbus zwischen den Haltestellen, am Anfang etwas Verkehr vor allem auf den Hauptstraßen,
// ab und zu Polizei und Feuerwehr mit Blaulicht und Sirene (die Feuerwehr fährt zu einem Brand).
import { schema, t } from '@colyseus/schema';
import { KACHEL, BREITE, HOEHE } from '../client/welt.mjs';
import { B11_KARTE, b11Sperrkanten } from './szene_b11_geo.mjs';
import { frei, freiBewegung, bewege } from '../client/welt.mjs';
import { imFussabdruck } from '../client/evak.mjs';
import { Unfaelle } from './unfall.mjs';
import { entkoppeln } from './netzfeld.mjs';
import { querfeldVon, querfeldKosten } from './querfeld.mjs';

export const Fahrzeug = schema({
  x: t.int16(), y: t.int16(),   // übertragen in ganzen Pixeln (server/netzfeld.mjs; der Server rechnet genau)
  rq: t.uint8(),            // Fahrtrichtung in 256 Stufen (f.richtung im Bogenmaß bleibt Server-Eigenschaft, siehe SpielRaum.netzAbgleich)
  art: t.string(),          // 'bus' | 'auto' | 'laster' | 'polizei' | 'feuerwehr' | 'wrack' | 'platt' (vom Panzer plattgewalztes Wrack, server/panzercrash.mjs) | 'evakuierung' (stehender Bus am Tor, server/aufgaben.mjs)
  farbe: t.uint8(),
  haelt: t.boolean(),
  rauch: t.boolean(),       // Unfallfahrzeug raucht (server/unfall.mjs; der Client zeichnet Rauch darüber)
  turm: t.number(),         // Leopard (Evakuierungspanzer): Turmrichtung in Weltkoordinaten (Server dreht ihn mit begrenztem Tempo)
  leben: t.uint8(),         // fahrbares Auto ('pkw', server/pkw.mjs): Lebenspunkte in % (Anzeige über dem Auto)
  blau: t.boolean(),        // gefahrener Streifenwagen: Blaulicht + Sirene an (server/pkw.mjs)
}, 'Fahrzeug');
entkoppeln(Fahrzeug, ['x', 'y']);
Fahrzeug.prototype.richtung = 0;

const FAHRBAR = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);
const KOSTEN = { primary: 0.55, secondary: 0.6, tertiary: 0.75, unclassified: 1, residential: 1.2, living_street: 1.6, service: 3 };
export const LASTER_ANTEIL = 0.1;   // Anteil Laster im normalen Verkehr
const HAUPT = new Set(['primary', 'secondary', 'tertiary']);
export const LAENGE = { pkw: 36, auto: 36, laster: 72, bus: 96, evakuierung: 96, polizei: 39, feuerwehr: 76, boxer: 63, puma: 58, leopard: 62 };   // Fahrzeuglänge in Pixeln (8 px = 1 m, echte Maße: client/masse.mjs; für den Abstand)
export const BREITE_FZ = { pkw: 16, auto: 16, laster: 23, bus: 22, evakuierung: 22, polizei: 16, feuerwehr: 22, boxer: 24, puma: 30, leopard: 30 };   // Fahrzeugbreite in Pixeln (Abstandsprüfung)
const SCHIEBBAR = new Set(['auto', 'laster', 'polizei', 'feuerwehr', 'bus', 'wrack']);   // diese Fahrzeuge schiebt ein festgefahrenes Fahrzeug zur Seite (nicht Panzer/Evakuierung/Mörser)
const STAU_WENDEN = 8, STAU_SCHIEBEN = 15, STAU_WEG = 40;   // Sekunden Stillstand bis Wenden / Schieben / (unbeobachtet) Verschwinden
const SCHUB = 45;                                          // Tempo (px/s), mit dem ein Hindernis zur Seite geschoben wird
const KREUZ_ZELLE = 64;
// Fahrzeuge fahren Zombies um (Fußabdruck des Fahrzeugs, nur fahrende Fahrzeuge; Zombies per Raster des Raums, Fahrzeuge bremsen nicht dafür)
export const TREFFER_TOT_TEMPO = 55;      // px/s (≈ 25 km/h): ab hier ist der Zombie sofort tot
const TREFFER_SCHLEUDER = 11;             // px, die ein langsam getroffener Zombie quer zur Fahrt weggeschleudert wird
const TREFFER_SCHADEN_JE_TEMPO = 0.6 / 44.4;   // Anteil des Zombie-Lebens je px/s (60 % bei 20 km/h = 44,4 px/s)
const TREFFER_BREMSE = 0.85, TREFFER_ERHOLUNG = 0.075, TREFFER_MIN = 0.3;   // jeder Treffer −15 % Tempo, erholt sich in ~2 s
const TREFFER_STECKEN = 6, TREFFER_FENSTER = 8;   // so viele Treffer in so vielen Sekunden: Fahrzeug bleibt stecken (Unfall)
const TREFFER_PAUSE = 0.8;                // s, in denen derselbe Zombie nicht nochmal getroffen wird

const TEMPO = { bus: 85, auto: 115, laster: 90, polizei: 175, feuerwehr: 160 };
const SPUR = { bus: 0.22, auto: 0.22, laster: 0.22, polizei: 0.12, feuerwehr: 0.12 };   // Abstand zur Mitte in Kacheln je Meter Fahrbahn

// ---------- Straßengraph aus den Polylinien ----------
// Kante (Kachelkoordinaten, in beiden Richtungen) durch eine Straßensperre gesperrt? (welt.sperren aus osmwelt.mjs)
function gesperrt(welt, ax, ay, bx, by) {
  const nah = (a, b) => Math.abs(a - b) < 0.05;
  return [...(welt.sperren ?? []), ...(welt.verkehrSperren ?? [])].some(({ kante: k }) =>
    (nah(k[0], ax) && nah(k[1], ay) && nah(k[2], bx) && nah(k[3], by)) || (nah(k[0], bx) && nah(k[1], by) && nah(k[2], ax) && nah(k[3], ay)));
}
export function strassenGraph(welt) {
  if (welt._graph) return welt._graph;
  const knoten = new Map();   // "x,y" → { id, x, y, nach: [{ziel, laenge, haupt, t}] }
  const holen = (x, y) => {
    const k = x.toFixed(1) + ',' + y.toFixed(1);
    let n = knoten.get(k);
    if (!n) { n = { id: knoten.size, x: x * KACHEL, y: y * KACHEL, nach: [], haupt: false }; knoten.set(k, n); }
    return n;
  };
  for (const s of welt.vektor?.strassen ?? []) {
    if (!FAHRBAR.has(s.t)) continue;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      // nur innerhalb der Karte (OSM-Wege ragen über den Rand hinaus)
      const innen = (x, y) => x > 1.5 && y > 1.5 && x < BREITE - 1.5 && y < HOEHE - 1.5;
      if (!innen(s.p[i], s.p[i + 1]) || !innen(s.p[i + 2], s.p[i + 3])) continue;
      if (gesperrt(welt, s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3])) continue;   // Polizeisperre: Autos fahren drumherum
      const a = holen(s.p[i], s.p[i + 1]), b = holen(s.p[i + 2], s.p[i + 3]);
      if (a === b) continue;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      a.nach.push({ ziel: b, laenge: l, kosten: l * (KOSTEN[s.t] ?? 1.5) });
      b.nach.push({ ziel: a, laenge: l, kosten: l * (KOSTEN[s.t] ?? 1.5) });
      if (HAUPT.has(s.t)) { a.haupt = true; b.haupt = true; }
    }
  }
  const liste = [...knoten.values()];
  // nur das größte zusammenhängende Netz verwenden
  let bestes = [], gesehen = new Set();
  for (const n of liste) {
    if (gesehen.has(n)) continue;
    const teil = [n]; gesehen.add(n);
    for (let i = 0; i < teil.length; i++) for (const e of teil[i].nach) if (!gesehen.has(e.ziel)) { gesehen.add(e.ziel); teil.push(e.ziel); }
    if (teil.length > bestes.length) bestes = teil;
  }
  const netz = new Set(bestes);
  let netzM = 0, gesamtM = 0;
  for (const n of liste) for (const e of n.nach) gesamtM += e.laenge;
  for (const n of bestes) for (const e of n.nach) netzM += e.laenge;
  // Länge in Metern (8 px = 1 m); jede Kante steht an beiden Endknoten, daher halbieren
  welt._graph = { knoten: bestes, netz, haupt: bestes.filter(n => n.haupt), netzMeter: netzM / 16, gesamtMeter: gesamtM / 16 };
  return welt._graph;
}

// Anzahl normaler Autos am Anfang: nach befahrbarer Netzlänge (ein Auto je `dichte` Meter Straße, Vorgabe METER_JE_AUTO; Einstellung verkehrDichte),
// mindestens 3, höchstens die Einstellung `verkehr` (ohne feste Obergrenze: Dichte klein + `verkehr` groß = viele Autos auf großen Karten)
export const METER_JE_AUTO = 2000, MIN_AUTOS = 3, HAUPT_START_ANTEIL = 0.5, VERKEHR_REST = 1 / 3;
export function verkehrAnzahl(netzMeter, obergrenze, dichte = METER_JE_AUTO) {
  const max = Math.max(0, Math.floor(obergrenze ?? 0));
  const je = Number.isFinite(Number(dichte)) && Number(dichte) > 0 ? Number(dichte) : METER_JE_AUTO;
  return Math.min(max, Math.max(MIN_AUTOS, Math.round(netzMeter / je)));
}

export function naechsterKnoten(graph, x, y, nurHaupt = false) {
  let best = null, bd = Infinity;
  for (const n of nurHaupt ? graph.haupt : graph.knoten) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
  return best;
}

// Kreuzungen und Einmündungen (Knoten mit mindestens 3 Straßen) in einem Gitter, damit die Suche je Fahrzeug billig bleibt
function kreuzungsGitter(graph) {
  if (graph.kgitter) return graph.kgitter;
  const g = new Map();
  for (const n of graph.knoten) {
    if (n.nach.length < 3) continue;
    const k = Math.floor(n.x / KREUZ_ZELLE) + ',' + Math.floor(n.y / KREUZ_ZELLE);
    (g.get(k) ?? g.set(k, []).get(k)).push(n);
  }
  // Kreuzungen bestehen in OSM oft aus mehreren dicht beieinander liegenden Knoten: sie teilen sich eine Belegung (gruppe)
  const nah = n => {
    const cx = Math.floor(n.x / KREUZ_ZELLE), cy = Math.floor(n.y / KREUZ_ZELLE), l = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of g.get((cx + i) + ',' + (cy + j)) ?? []) if (m !== n && Math.hypot(m.x - n.x, m.y - n.y) < 48) l.push(m);
    return l;
  };
  for (const l of g.values()) for (const n of l) n.gruppe = nah(n);
  return (graph.kgitter = g);
}
const winkelUnterschied = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Dijkstra (kleiner Graph, einfache Liste genügt)
export function route(graph, von, nach, meiden = null) {
  if (!von || !nach) return null;
  const dist = new Map([[von, 0]]), vor = new Map(), offen = new Set([von]);
  while (offen.size) {
    let u = null, ud = Infinity;
    for (const n of offen) { const d = dist.get(n); if (d < ud) { ud = d; u = n; } }
    offen.delete(u);
    if (u === nach) break;
    for (const e of u.nach) {
      if (meiden?.has(e.ziel) && e.ziel !== nach) continue;
      const nd = ud + e.kosten;
      if (nd < (dist.get(e.ziel) ?? Infinity)) { dist.set(e.ziel, nd); vor.set(e.ziel, u); offen.add(e.ziel); }
    }
  }
  if (!dist.has(nach)) return null;
  const weg = [nach];
  while (weg[0] !== von) weg.unshift(vor.get(weg[0]));
  return weg.map(n => ({ x: n.x, y: n.y }));
}

// Punkte auf die rechte Spur versetzen und Ecken abrunden (Fahrlinie ohne Zick-Zack)
function spurLinie(punkte, versatz) {
  if (punkte.length < 2) return punkte;
  const aus = [];
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[Math.max(0, i - 1)], b = punkte[i], c = punkte[Math.min(punkte.length - 1, i + 1)];
    let dx = c.x - a.x, dy = c.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    aus.push({ x: b.x - dy * versatz, y: b.y + dx * versatz });   // rechts der Fahrtrichtung (y nach unten)
  }
  // Ecken abrunden: an jedem inneren Punkt zwei Punkte kurz davor und danach
  const rund = [aus[0]];
  for (let i = 1; i < aus.length - 1; i++) {
    const a = aus[i - 1], b = aus[i], c = aus[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(18, l1 / 2, l2 / 2);
    rund.push({ x: b.x + (a.x - b.x) / (l1 || 1) * r, y: b.y + (a.y - b.y) / (l1 || 1) * r });
    rund.push({ x: b.x + (c.x - b.x) / (l2 || 1) * r, y: b.y + (c.y - b.y) / (l2 || 1) * r });
  }
  rund.push(aus.at(-1));
  return rund;
}

export class Verkehr {
  constructor(raum) {
    this.raum = raum;
    if (raum.state?.karte === B11_KARTE && !raum.welt._graph) raum.welt.verkehrSperren = b11Sperrkanten(raum.welt);   // Szene „Stau auf der B11“: dort fährt kein Verkehr
    this.graph = strassenGraph(raum.welt);
    this.info = new Map();      // id → { weg, pos, halt, ... }
    this.naechsteId = 1;
    this.unfaelle = new Unfaelle(this);
    this.blaulichtUhr = this.naechsteBlaulichtPause();
  }

  neu(art, startKnoten, extra = {}) {
    const f = new Fahrzeug();
    f.x = startKnoten.x; f.y = startKnoten.y; f.richtung = 0; f.art = art; f.farbe = Math.floor(this.raum.rnd() * 8); f.haelt = false;
    const nr = this.naechsteId, id = art + this.naechsteId++;
    this.raum.state.fahrzeuge.set(id, f);
    this.info.set(id, { weg: null, pos: 0, halt: 0, nr, ...extra });
    return id;
  }

  fahreNach(id, ziel) {
    const f = this.raum.state.fahrzeuge.get(id), inf = this.info.get(id);
    const von = naechsterKnoten(this.graph, f.x, f.y);
    const weg = route(this.graph, von, ziel);
    if (!weg || weg.length < 2) return false;
    const versatz = (SPUR[f.art] ?? 0.2) * 4 * KACHEL / 4 * 1.85;   // Spurabstand zur Mitte: Gegenverkehr hat ~26 px Abstand (Autos 18, Laster 22 px breit)
    inf.weg = spurLinie(weg, versatz); inf.pos = 0; inf.zielKnoten = ziel;
    return true;
  }

  // Linienbus über alle Haltestellen, am Anfang Verkehr
  start(haltestellen, autos, dichte = METER_JE_AUTO) {
    if (!this.graph.knoten.length) return;
    const r = this.raum.rnd;
    if (haltestellen.length >= 2) {
      // Haltestellen nach Nähe ordnen
      const offen = haltestellen.map(h => ({ ...h, knoten: naechsterKnoten(this.graph, h.x, h.y) }));
      const reihe = [offen.shift()];
      while (offen.length) { const l = reihe.at(-1); offen.sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y)); reihe.push(offen.shift()); }
      const id = this.neu('bus', reihe[0].knoten, { linie: reihe, stopp: 0, halt: 6, mitfahrer: new Map() });
      this.busId = id;
    }
    const anzahl = verkehrAnzahl(this.graph.netzMeter, autos, dichte);
    this.sollAutos = anzahl;
    for (let i = 0; i < anzahl; i++) {
      // Startknoten mit Abstand zu den anderen Fahrzeugen (sonst stehen mehrere übereinander am selben Knoten)
      let start = null;
      for (let versuch = 0; versuch < 12; versuch++) {
        const liste = r() < HAUPT_START_ANTEIL && this.graph.haupt.length ? this.graph.haupt : this.graph.knoten;
        start = liste[Math.floor(r() * liste.length)];
        if (![...this.raum.state.fahrzeuge.values()].some(o => Math.hypot(o.x - start.x, o.y - start.y) < 80)) break;
      }
      const id = this.neu(r() < LASTER_ANTEIL ? 'laster' : 'auto', start);
      this.neuesZiel(id);
    }
  }

  neuesZiel(id) {
    const r = this.raum.rnd, liste = r() < HAUPT_START_ANTEIL && this.graph.haupt.length ? this.graph.haupt : this.graph.knoten;
    for (let v = 0; v < 6; v++) if (this.fahreNach(id, liste[Math.floor(r() * liste.length)])) return true;
    return false;
  }

  // Hauptstraßen-Knoten nahe am Kartenrand (Ein- und Ausfahrten)
  randKnoten() {
    if (this._rand) return this._rand;
    const B = BREITE * KACHEL, H = HOEHE * KACHEL, abst = n => Math.min(n.x, n.y, B - n.x, H - n.y);
    const liste = (this.graph.haupt.length ? this.graph.haupt : this.graph.knoten).slice().sort((a, b) => abst(a) - abst(b));
    return (this._rand = liste.slice(0, Math.max(2, Math.min(12, liste.length))));
  }

  // Abstand bis zur nächsten zufälligen Durchfahrt in Spielsekunden: selten 8–15 min, normal 2,5–6,5 min
  naechsteBlaulichtPause() {
    const modus = this.raum.einstellungen?.().blaulicht ?? 'selten';
    return (modus === 'normal' ? 150 + this.raum.rnd() * 240 : 480 + this.raum.rnd() * 420);
  }

  // Polizei oder Feuerwehr: von einem Rand zum anderen, die Feuerwehr zum Brand
  blaulicht(brand = null) {
    const g = this.graph, r = this.raum.rnd;
    if ((this.raum.einstellungen?.().blaulicht ?? 'selten') === 'aus') return;
    if (!g.haupt.length) return;
    const rand = this.randKnoten();
    const start = rand[Math.floor(r() * rand.length)];
    const art = brand ? 'feuerwehr' : (r() < 0.5 ? 'polizei' : 'feuerwehr');
    const id = this.neu(art, start, { durchfahrt: true, brand });
    const ziel = brand ? naechsterKnoten(g, brand.x, brand.y) : rand.reduce((a, b) => Math.hypot(b.x - start.x, b.y - start.y) > Math.hypot(a.x - start.x, a.y - start.y) ? b : a);
    if (!this.fahreNach(id, ziel)) { this.raum.state.fahrzeuge.delete(id); this.info.delete(id); return; }
    this.raum.broadcast('sirene', { id });
  }

  // Evakuierungsbus (Aufgaben): fährt von einem Rand der Karte sichtbar zur Haltestelle (Knoten `halt`) und wartet dort, bis er losfährt.
  // Gibt es keinen Straßenweg (oder keinen Knoten), steht er sofort an (x, y).
  evakuierungBus(x, y, richtung = 0, halt = null) {
    if (halt && this.graph.knoten.length) {
      const fern = this.randKnoten().filter(n => Math.hypot(n.x - halt.x, n.y - halt.y) > 300)
        .sort((a, b) => Math.hypot(a.x - halt.x, a.y - halt.y) - Math.hypot(b.x - halt.x, b.y - halt.y));
      for (const start of fern) {
        const id = this.neu('evakuierung', start, { evakuierung: true, angekommen: false });
        const f = this.raum.state.fahrzeuge.get(id);
        f.farbe = 0;
        if (this.fahreNach(id, halt)) { f.richtung = Math.atan2(this.info.get(id).weg[1].y - f.y, this.info.get(id).weg[1].x - f.x); return id; }
        this.raum.state.fahrzeuge.delete(id); this.info.delete(id);
      }
    }
    const id = this.neu('evakuierung', { x, y }, { halt: 1e12, evakuierung: true, angekommen: true });
    const f = this.raum.state.fahrzeuge.get(id);
    f.richtung = richtung; f.haelt = true; f.farbe = 0;
    return id;
  }

  // Evakuierungspanzer (Leopard): Anfahrt von weit weg. Gemischter Weg: erst über das Straßennetz von einem Randknoten (Wanne passt durch, siehe
  // spurFrei) bis zu einem Knoten nahe am Abholort, dann das letzte Stück querfeldein (plan.weg aus server/querfeld.mjs, ab Knoten).
  // Ergebnis (am Plan zwischengespeichert): { weg, feldVon, feldWeg, knoten, rand, laenge }; null, wenn keine Straße passt (dann nur Querfeld).
  panzerWeg(plan) {
    if (plan._misch !== undefined) return plan._misch;
    plan._misch = null;
    const g = this.graph, welt = this.raum.welt;
    if (!g.knoten.length) return null;
    const versatz = (SPUR.evakuierung ?? 0.22) * 4 * KACHEL / 4 * 1.85;
    const kand = g.knoten.map(n => ({ n, k: querfeldKosten(plan, n, welt) })).filter(o => Number.isFinite(o.k) && o.k >= 100)
      .sort((a, b) => a.k - b.k).slice(0, 40);
    const rand = this.randKnoten();
    for (const { n } of kand) {
      const feld = querfeldVon(welt, plan, n);
      if (!feld) continue;
      for (const r of rand.slice().sort((a, b) => Math.hypot(b.x - n.x, b.y - n.y) - Math.hypot(a.x - n.x, a.y - n.y))) {
        if (r === n) continue;
        // kürzeste Straße, deren Mitte für die Wanne frei ist; an Engstellen wird der Knoten dahinter gemieden und neu gesucht
        const meiden = new Set();
        let strasse = null;
        for (let versuch = 0; versuch < 8; versuch++) {
          const wege = route(g, r, n, meiden);
          if (!wege || wege.length < 2) break;
          const schlecht = wege.findIndex((p, i) => i < wege.length - 1 && this.spurSchlecht([p, wege[i + 1]], 1) > 3);   // hartes Hindernis auf der Straße (einzelne Ausreißer zählen nicht)
          if (schlecht < 0 && this.spurSchlecht(wege, 10) <= 14) { strasse = wege; break; }   // höchstens eine kurze Engstelle (≈ 14 Stützpunkte): die Wanne drückt sich durch den Straßenrand
          if (schlecht < 0) break;
          const k = naechsterKnoten(g, wege[schlecht + 1].x, wege[schlecht + 1].y);
          if (!k || k === n) break;
          meiden.add(k);
        }
        if (!strasse) continue;
        const lane = spurLinie(strasse, versatz);
        if (this.spurSchlecht(lane, 3) > 6) continue;
        const weg = [...lane, ...feld];
        let laenge = 0; for (let i = 0; i < weg.length - 1; i++) laenge += Math.hypot(weg[i + 1].x - weg[i].x, weg[i + 1].y - weg[i].y);
        return plan._misch = { weg, feldVon: lane.length, feldWeg: feld, knoten: n, rand: r, laenge };
      }
    }
    return null;
  }

  // Passt die Wanne des Panzers auf die Fahrlinie (kein Haus, kein Wasser im Weg; enge Straßen scheiden aus)?
  // (nur Hindernisse wie Häuser, Bäume, Mauern zählen; Wasser nicht, denn Brücken laufen über Wasserkacheln)
  spurFrei(linie, rad = 14) {
    const welt = this.raum.welt;
    for (let i = 0; i < linie.length - 1; i++) {
      const a = linie[i], b = linie[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
      for (let j = 0; j <= n; j++) if (!freiBewegung(welt, a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n, rad)) return false;
    }
    return true;
  }

  // Anzahl der Stützpunkte (alle 16 px) auf der Linie, an denen die Wanne nicht passt
  spurSchlecht(linie, rad) {
    const welt = this.raum.welt;
    let n = 0;
    for (let i = 0; i < linie.length - 1; i++) {
      const a = linie[i], b = linie[i + 1], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
      for (let j = 0; j <= m; j++) if (!freiBewegung(welt, a.x + (b.x - a.x) * j / m, a.y + (b.y - a.y) * j / m, rad)) n++;
    }
    return n;
  }

  // Länge (Pixel) der Anfahrt des Panzers, für die rechtzeitige Abfahrt
  panzerLaenge(plan) {
    const m = this.panzerWeg(plan), w = m ? m.weg : plan.weg;
    let l = 0; for (let i = 0; i < w.length - 1; i++) l += Math.hypot(w[i + 1].x - w[i].x, w[i + 1].y - w[i].y);
    return l;
  }

  // Panzer im Gelände (nicht auf der Straße)? Nur dort gelten die Querfeld-Ausnahmen (nicht überfahren, kein Wenden)
  imFeld(inf) { return !!inf.querfeld && inf.pos >= (inf.feldVon ?? 0) && inf.pos < (inf.feldBis ?? Infinity); }

  evakuierungPanzer(plan) {
    const m = this.panzerWeg(plan), weg0 = m ? m.weg : plan.weg;
    const id = this.neu('evakuierung', weg0[0], { evakuierung: true, angekommen: false, querfeld: plan });
    const f = this.raum.state.fahrzeuge.get(id), inf = this.info.get(id);
    f.farbe = 0; inf.weg = weg0.map(p => ({ x: p.x, y: p.y })); inf.pos = 0;
    if (m) { inf.feldVon = m.feldVon; inf.feldWeg = m.feldWeg; inf.zielKnoten = m.knoten; inf.mischRand = m.rand; }
    f.richtung = Math.atan2(weg0[1].y - weg0[0].y, weg0[1].x - weg0[0].x);
    return id;
  }

  // A400M (Evakuierungsart 'flugzeug'): steht ohne Straße am Aufsetzpunkt (x, y) in Richtung `richtung`; die Landerolle bewegt server/aufgaben.mjs,
  // `angekommen` wird erst am Ende der Rolle gesetzt (evakuierungDa)
  evakuierungFlugzeug(x, y, richtung) {
    const id = this.neu('evakuierung', { x, y }, { halt: 1e12, evakuierung: true, angekommen: false, flugzeug: true });
    const f = this.raum.state.fahrzeuge.get(id);
    f.richtung = richtung; f.haelt = true; f.farbe = 0;
    return id;
  }

  // steht der Evakuierungsbus an der Haltestelle (Einsteigen ist nur dann möglich)?
  evakuierungDa(id) { return !!this.info.get(id)?.angekommen && !this.info.get(id)?.abfahrt; }

  // der Evakuierungsbus fährt zum am weitesten entfernten Rand und verschwindet dort
  evakuierungAb(id) {
    const f = this.raum.state.fahrzeuge.get(id), inf = this.info.get(id);
    if (!f || !inf) return;
    if (inf.flugzeug) { this.raum.state.fahrzeuge.delete(id); this.info.delete(id); return; }   // hebt ab (kein Straßenweg)
    if (inf.querfeld) {   // Panzer: den Feldweg zurück, bei gemischter Anfahrt danach auf der Straße zum Rand
      const feld = inf.feldWeg ? [...inf.feldWeg].reverse() : inf.querfeld.rueck;
      let weg = [{ x: f.x, y: f.y }, ...feld], ende = weg.length;
      if (inf.feldWeg && inf.mischRand) {
        const strasse = route(this.graph, inf.zielKnoten, inf.mischRand);
        if (strasse && strasse.length > 1) { weg = [...weg, ...spurLinie(strasse, (SPUR.evakuierung ?? 0.22) * 4 * KACHEL / 4 * 1.85)]; inf.zielKnoten = inf.mischRand; }
      }
      inf.weg = weg; inf.pos = 0; inf.halt = 0; inf.abfahrt = true; f.haelt = false;
      inf.feldVon = 0; inf.feldBis = ende; inf.feldWeg = null;
      return;
    }
    inf.halt = 0; inf.abfahrt = true; f.haelt = false;
    const rand = this.graph.knoten.length ? this.randKnoten() : [];
    const ziel = rand.length ? rand.reduce((a, b) => Math.hypot(b.x - f.x, b.y - f.y) > Math.hypot(a.x - f.x, a.y - f.y) ? b : a) : null;
    if (!ziel || !this.fahreNach(id, ziel)) { this.raum.state.fahrzeuge.delete(id); this.info.delete(id); }
  }

  schritt(dt) {
    const s = this.raum.state;
    const zeitMin = (s.zeit ?? 0) / 60;
    const e = this.raum.einstellungen?.() ?? {};
    this.blaulichtUhr -= dt * (this.raum.zeitraffer?.() ?? 1);
    if (this.blaulichtUhr <= 0) { this.blaulichtUhr = this.naechsteBlaulichtPause(); this.blaulicht(); }
    for (const [id, f] of s.fahrzeuge) {
      const inf = this.info.get(id);
      if (!inf || f.art === 'wrack') continue;
      if (inf.brennt) { f.haelt = true; continue; }
      if (inf.unfall) { this.unfaelle.fahrt(id, f, inf, dt); continue; }   // von der Spur abgekommen (server/unfall.mjs)
      if (inf.halt > 0) {
        f.haelt = true; inf.halt -= dt;
        if (inf.halt <= 0) this.weiter(id, f, inf);
        continue;
      }
      if (!inf.weg) { this.weiter(id, f, inf); continue; }
      f.haelt = false;
      // Fußgänger und Spieler direkt vor dem Fahrzeug: bremsen (Polizei und Feuerwehr fahren langsam vorbei)
      const vorn = { x: f.x + Math.cos(f.richtung) * 40, y: f.y + Math.sin(f.richtung) * 40 };
      const imWeg = [...s.spieler.values(), ...s.menschen.values()].some(p => !p.ebene && p.sichtbar !== false && Math.hypot(p.x - vorn.x, p.y - vorn.y) < 30);
      // Abstand halten, Vorfahrt an Kreuzungen, Festgefahren: siehe fahrtFaktor / festgefahren
      const lauf = this.fahrtFaktor(id, f, inf, dt);
      let rest = (TEMPO[f.art] ?? 100) * dt * (imWeg ? (inf.durchfahrt ? 0.3 : 0) : 1) * lauf.faktor * (inf.treffer?.mal ?? 1) * (inf.evakuierung && inf.abfahrt ? 0.6 : 1);   // abfahrender Evakuierungsbus rollt langsam: man kann noch aufspringen
      const x0 = f.x, y0 = f.y;
      while (rest > 0) {
        const ziel = inf.weg[inf.pos + 1];
        if (!ziel) { inf.weg = null; this.angekommen(id, f, inf, zeitMin, e); break; }
        const d = Math.hypot(ziel.x - f.x, ziel.y - f.y), w = Math.atan2(ziel.y - f.y, ziel.x - f.x);
        if (d > 0.5) f.richtung += Math.atan2(Math.sin(w - f.richtung), Math.cos(w - f.richtung)) * Math.min(1, dt * 7);
        if (d <= rest) { f.x = ziel.x; f.y = ziel.y; inf.pos++; rest -= d; }
        else { f.x += Math.cos(w) * rest; f.y += Math.sin(w) * rest; rest = 0; }
      }
      const bewegt = Math.hypot(f.x - x0, f.y - y0);
      if (!this.imFeld(inf) && !inf.flugzeug) this.zombiesUeberfahren(id, f, inf, bewegt / dt, dt);
      if (lauf.faktor < 0.05 && !imWeg) { if (bewegt < 0.3) this.festgefahren(id, f, inf, lauf, dt); }
      else if (bewegt > 1.5) { inf.steht = 0; inf.gewendet = false; inf.kreuzFrei = false; inf.schubSeite = undefined; }
    }
    this.unfaelle.schritt(dt);
  }

  // Zombies im Fußabdruck des fahrenden Fahrzeugs: schnell = tot (zählt für niemanden), langsam = quer weggeschleudert + Schaden ∝ Tempo.
  // Jeder Treffer bremst; viele Treffer kurz hintereinander lassen das Fahrzeug steckenbleiben (server/unfall.mjs).
  zombiesUeberfahren(id, f, inf, tempo, dt) {
    const tr = inf.treffer ??= { mal: 1, uhr: 0, zeiten: [], pause: new Map() };
    tr.uhr += dt;
    if (tr.mal < 1) tr.mal = Math.min(1, tr.mal + TREFFER_ERHOLUNG * dt);
    if (tempo < 6 || !this.raum.state.zombies.size) return;
    const raum = this.raum, s = raum.state, a = f.art, hl = (LAENGE[a] ?? 46) / 2, hb = (BREITE_FZ[a] ?? 18) / 2;
    if (!raum.zRaster) raum.baueZombieRaster();
    const maxHp = (raum.einstellungen?.() ?? {}).zombieLeben ?? 100;
    let n = 0;
    for (const z of raum.zombiesNahe(f.x, f.y, '', 1)) {
      if (z.ebene || !(z.hp > 0) || Math.abs(z.x - f.x) > hl + 10 || Math.abs(z.y - f.y) > hl + 10) continue;
      if (!imFussabdruck(f, z.x, z.y, hl, hb, 4)) continue;
      if ((tr.pause.get(z) ?? 0) > tr.uhr) continue;
      const zid = [...s.zombies].find(([, q]) => q === z)?.[0];
      if (!zid) continue;
      tr.pause.set(z, tr.uhr + TREFFER_PAUSE);
      const tot = tempo >= TREFFER_TOT_TEMPO, vorher = s.besiegt, von = { name: 'Fahrzeug', x: f.x, y: f.y, besiegt: 0 };
      if (tot) { z.kriecht = true; raum.schaden(zid, z, z.hp + 1, von); }
      else {
        const quer = -(z.x - f.x) * Math.sin(f.richtung) + (z.y - f.y) * Math.cos(f.richtung), sd = quer >= 0 ? 1 : -1;
        bewege(raum.welt, z, -Math.sin(f.richtung) * sd * TREFFER_SCHLEUDER, Math.cos(f.richtung) * sd * TREFFER_SCHLEUDER, 6);
        raum.schaden(zid, z, Math.min(maxHp * 0.95, maxHp * TREFFER_SCHADEN_JE_TEMPO * tempo), von);
      }
      s.besiegt = vorher;   // kein Kill für die Aufgaben
      raum.broadcast('aufprall', { x: z.x, y: z.y, id, tot, w: f.richtung, ebene: '' });
      tr.mal = Math.max(TREFFER_MIN, tr.mal * TREFFER_BREMSE);
      tr.zeiten.push(tr.uhr); n++;
    }
    if (tr.pause.size > 40) for (const [z, t] of tr.pause) if (t < tr.uhr) tr.pause.delete(z);
    if (!n) return;
    tr.zeiten = tr.zeiten.filter(t => t > tr.uhr - TREFFER_FENSTER);
    if (tr.zeiten.length >= TREFFER_STECKEN && !inf.evakuierung && f.art !== 'wrack') this.unfaelle.aufprall(id, f, inf, null);   // bleibt stecken: Rauch → Feuer → ggf. Explosion
  }

  // Erstes Fahrzeug im Fahrkorridor voraus (auch querende; Entgegenkommende auf ihrer Spur nicht). Lücke = freier Raum zwischen den Stoßstangen.
  hindernis(id, f, weite) {
    const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), lf = LAENGE[f.art] ?? 46, bf = (BREITE_FZ[f.art] ?? 18) / 2;
    let best = null;
    for (const [oid, o] of this.raum.state.fahrzeuge) {
      if (oid === id || o.art === 'platt') continue;   // plattgewalztes Wrack (server/panzercrash.mjs): darüber fahren
      const rx = o.x - f.x, ry = o.y - f.y;
      if (rx * rx + ry * ry > 40000) continue;
      const vor = rx * c + ry * sn, quer = -rx * sn + ry * c;
      if (vor <= 0) continue;
      const oa = o.art === 'wrack' ? 'auto' : o.art, lo = LAENGE[oa] ?? 46, bo = (BREITE_FZ[oa] ?? 18) / 2;
      const dth = o.richtung - f.richtung, cd = Math.cos(dth), sd = Math.abs(Math.sin(dth));
      const entlang = Math.abs(cd) * lo / 2 + sd * bo, seite = sd * lo / 2 + Math.abs(cd) * bo;
      const gegen = cd < -0.5;
      if (Math.abs(quer) >= bf + seite - (gegen ? 4 : 1)) continue;   // Gegenverkehr darf sich in Kurven um wenige Pixel streifen, blockiert aber bei echter Frontalstellung
      const luecke = vor - lf / 2 - entlang, extra = gegen ? 30 : 0;   // Gegenverkehr nähert sich doppelt so schnell: früher bremsen
      if (luecke > weite + extra) continue;
      if (!best || luecke < best.luecke) best = { oid, o, luecke, extra };
    }
    return best;
  }

  // Fahrzeuge, die den Kreuzungsknoten `kid` gerade belegen (Vorrang durch frühere Einfahrt)
  kreuzHalter(kid, ausser) {
    const aus = [];
    for (const [hid, hi] of this.info) {
      if (hid === ausser || !hi.kreuz?.has(kid)) continue;
      const hf = this.raum.state.fahrzeuge.get(hid);
      if (hf) aus.push({ id: hid, f: hf, inf: hi });
    }
    return aus;
  }

  kreuzungenNah(x, y) {
    const g = kreuzungsGitter(this.graph), cx = Math.floor(x / KREUZ_ZELLE), cy = Math.floor(y / KREUZ_ZELLE), aus = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = g.get((cx + i) + ',' + (cy + j)); if (l) aus.push(...l); }
    return aus;
  }

  // Tempofaktor 0..1: bremst mit Abstand vor Fahrzeugen im Korridor und wartet vor besetzten Kreuzungen
  fahrtFaktor(id, f, inf, dt) {
    const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), lf = LAENGE[f.art] ?? 46;
    let faktor = 1;
    const h = this.hindernis(id, f, 36);
    inf.hindernis = h ? h.oid : null;
    if (h) faktor = Math.max(0, Math.min(1, (h.luecke - 4) / (32 + h.extra)));
    let wartet = false, gegnerId = null;
    const halte = lf / 2 + 26;   // Haltelinie: Fahrzeugfront bleibt außerhalb der Fahrspuren der Kreuzung
    for (const k of this.kreuzungenNah(f.x, f.y)) {
      const dx = k.x - f.x, dy = k.y - f.y, d = Math.hypot(dx, dy), vor = dx * c + dy * sn, quer = Math.abs(-dx * sn + dy * c);
      if (inf.kreuz?.has(k.id)) { if (vor < 0 && d > halte) inf.kreuz.delete(k.id); continue; }   // passiert: Vorrang abgeben
      if (vor <= 0 || d > halte + 14 || quer > 30) continue;
      const gruppe = [k, ...(k.gruppe ?? [])];
      const gegner = gruppe.flatMap(g => this.kreuzHalter(g.id, id)).find(g => winkelUnterschied(g.f.richtung, f.richtung) > 0.7);
      if (gegner && !inf.kreuzFrei) {
        // gegenseitiges Warten > 3 s: das Fahrzeug mit der kleineren Nummer fährt
        if ((inf.kreuzWarte ?? 0) > 3 && (gegner.inf.steht ?? 0) > 3 && (inf.nr ?? 0) < (gegner.inf.nr ?? 0)) { for (const g of gruppe) (inf.kreuz ??= new Map()).set(g.id, true); continue; }
        wartet = true; gegnerId = gegner.id;
        if (d <= halte + 4) faktor = 0;
        continue;
      }
      for (const g of gruppe) (inf.kreuz ??= new Map()).set(g.id, true);
    }
    inf.kreuzWarte = wartet ? (inf.kreuzWarte ?? 0) + dt : 0;
    return { faktor, hindernis: h, kreuzWartet: wartet, gegnerId };
  }

  // Das Fahrzeug will fahren, kommt aber nicht weiter: nach 8 s wenden, nach 15 s das Hindernis sanft zur Seite schieben
  festgefahren(id, f, inf, lauf, dt) {
    inf.steht = (inf.steht ?? 0) + dt;
    inf.blechUhr = (inf.blechUhr ?? 0) - dt;
    if (inf.steht >= STAU_WENDEN && !inf.gewendet) { inf.gewendet = true; this.wenden(id, f, inf); return; }
    if (inf.steht >= STAU_SCHIEBEN) {
      if (lauf.hindernis && lauf.hindernis.luecke < 12) {
        if (this.schieben(f, lauf.hindernis.o, dt, inf) && inf.blechUhr <= 0) {
          inf.blechUhr = 1.2;
          this.raum.broadcast('blech', { x: lauf.hindernis.o.x, y: lauf.hindernis.o.y });
        }
      } else if (lauf.kreuzWartet) inf.kreuzFrei = true;   // ohne Alternative: trotz Vorrangs anderer langsam hineinfahren (der Korridor schützt vor Überlappung)
    }
    // lange festgefahren und niemand schaut zu: Fahrzeug verschwindet, damit die Straße frei wird
    if (inf.steht >= STAU_WEG && ['auto', 'laster', 'polizei', 'feuerwehr'].includes(f.art) && !inf.evakuierung) {
      const s = this.raum.state;
      if (![...s.spieler.values()].some(p => !p.ebene && Math.hypot(p.x - f.x, p.y - f.y) < 700)) { s.fahrzeuge.delete(id); this.info.delete(id); }
    }
  }

  // Rückwärts auf einen anderen Weg: Route vom Knoten hinter dem Fahrzeug unter Meidung der Knoten vor ihm
  wenden(id, f, inf) {
    if (!inf.weg || this.imFeld(inf) || inf.flugzeug || !this.graph.knoten.length) return false;
    const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), g = this.graph;
    const hinten = naechsterKnoten(g, f.x - c * 50, f.y - sn * 50);
    if (!hinten) return false;
    const meiden = new Set();
    for (const abst of [30, 60, 90]) { const n = naechsterKnoten(g, f.x + c * abst, f.y + sn * abst); if (n && n !== hinten) meiden.add(n); }
    const r = this.raum.rnd, wege = [];
    if (inf.zielKnoten) wege.push(inf.zielKnoten);
    if (!inf.evakuierung) for (let v = 0; v < 5; v++) wege.push((r() < 0.75 && g.haupt.length ? g.haupt : g.knoten)[Math.floor(r() * (g.haupt.length || g.knoten.length))]);
    for (const ziel of wege) {
      if (!ziel || ziel === hinten) continue;
      const weg = route(g, hinten, ziel, meiden);
      if (!weg || weg.length < 2) continue;
      // Mitte der Straße unter dem Fahrzeug; die neue Spur liegt auf der anderen Seite (rechts der neuen Fahrtrichtung)
      const versatz = (SPUR[f.art] ?? 0.2) * 4 * KACHEL / 4 * 1.85;   // Spurabstand zur Mitte: Gegenverkehr hat ~26 px Abstand (Autos 18, Laster 22 px breit)
      const mitte = { x: f.x + Math.sin(f.richtung) * versatz, y: f.y - Math.cos(f.richtung) * versatz };
      const lane = spurLinie([mitte, ...weg], versatz);
      if (inf.feldWeg) { inf.weg = [...lane, ...inf.feldWeg]; inf.feldVon = lane.length; }   // Panzer-Anfahrt: das Feldstück bleibt dahinter
      else { inf.weg = lane; if (inf.querfeld) inf.feldBis = 0; }
      inf.pos = 0; inf.zielKnoten = ziel; inf.kreuz = null; inf.kreuzFrei = false; inf.kreuzWarte = 0;
      f.x = inf.weg[0].x; f.y = inf.weg[0].y;   // wechselt sofort auf die Gegenspur (sonst stünde er dem Rückstau frontal gegenüber)
      const q = inf.weg[1]; if (q) f.richtung = Math.atan2(q.y - f.y, q.x - f.x);   // der Client dreht weich nach
      return true;
    }
    return false;
  }

  // Hindernis-Fahrzeug `o` quer zur Fahrtrichtung von `f` zur Seite schieben (nicht in Wände/Häuser); false, wenn kein Platz ist
  schieben(f, o, dt, inf) {
    if (!SCHIEBBAR.has(o.art)) return false;
    const welt = this.raum.welt, nx = -Math.sin(f.richtung), ny = Math.cos(f.richtung), c = Math.cos(f.richtung), sn = Math.sin(f.richtung), schritt = SCHUB * dt;
    // Seite mit mehr Platz (einmal gewählt, damit das Hindernis nicht hin und her wandert)
    inf.schubSeite ??= [24, 36, 48].map(d => (frei(welt, o.x + nx * d, o.y + ny * d, 9) ? 1 : 0) - (frei(welt, o.x - nx * d, o.y - ny * d, 9) ? 1 : 0)).reduce((a, b) => a + b, 0) >= 0 ? 1 : -1;
    const seite = inf.schubSeite;
    for (const sd of [seite, -seite]) {
      if (frei(welt, o.x + nx * sd * (schritt + 2), o.y + ny * sd * (schritt + 2), 9)) { o.x += nx * sd * schritt; o.y += ny * sd * schritt; return true; }
    }
    if (frei(welt, o.x + c * (schritt + 2), o.y + sn * (schritt + 2), 9)) { o.x += c * schritt; o.y += sn * schritt; return true; }
    return false;
  }

  angekommen(id, f, inf, zeitMin, e) {
    const s = this.raum.state;
    if (inf.evakuierung) {   // Evakuierungsbus: steht am Tor, nach der Abfahrt verschwindet er am Rand
      if (inf.abfahrt) { s.fahrzeuge.delete(id); this.info.delete(id); } else { inf.halt = 1e12; f.haelt = true; inf.angekommen = true; }
      return;
    }
    if (f.art === 'bus') { inf.halt = 8; this.raum.stadt?.busHalt(inf, inf.linie[inf.stopp]); return; }
    if (inf.durchfahrt) {
      if (inf.brand && !inf.amBrand) { inf.amBrand = true; inf.halt = 25; return; }   // (die Sirene ist dabei nach wenigen Sekunden aus, siehe Client)   // Feuerwehr löscht eine Weile
      s.fahrzeuge.delete(id); this.info.delete(id); return;
    }
    if (inf.randAus) { s.fahrzeuge.delete(id); this.info.delete(id); return; }   // Auto eines Bewohners (menschen.mjs): fährt zum Kartenrand und verschwindet
    // normaler Verkehr: nach der Anfangsphase verschwinden die Autos am Ziel, bis nur noch ein Drittel fährt
    if (zeitMin > (e.verkehrPhase ?? 25)) {
      let normal = 0;
      for (const [fid, fz] of s.fahrzeuge) if ((fz.art === 'auto' || fz.art === 'laster') && fid !== id && this.info.get(fid) && !this.info.get(fid).durchfahrt) normal++;
      if (normal + 1 > Math.ceil((this.sollAutos ?? 0) * VERKEHR_REST)) { s.fahrzeuge.delete(id); this.info.delete(id); return; }
    }
    this.neuesZiel(id);
  }

  weiter(id, f, inf) {
    if (f.art === 'bus') {
      inf.stopp = (inf.stopp + 1) % inf.linie.length;
      this.fahreNach(id, inf.linie[inf.stopp].knoten);
      return;
    }
    if (inf.durchfahrt && inf.amBrand) {
      // nach dem Löschen zum nächsten Rand
      inf.brand = null;
      const weg = this.randKnoten().reduce((a, b) => Math.hypot(b.x - f.x, b.y - f.y) > Math.hypot(a.x - f.x, a.y - f.y) ? b : a);
      if (!this.fahreNach(id, weg)) { this.raum.state.fahrzeuge.delete(id); this.info.delete(id); }
      return;
    }
    this.neuesZiel(id);
  }
}
