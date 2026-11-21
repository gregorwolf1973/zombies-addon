// Fahrzeuge auf den echten Straßenlinien (OSM-Vektordaten) statt über das Kachelraster: glatte Fahrt, rechte Spur.
// Linienbus zwischen den Haltestellen, am Anfang etwas Verkehr vor allem auf den Hauptstraßen,
// ab und zu Polizei und Feuerwehr mit Blaulicht und Sirene (die Feuerwehr fährt zu einem Brand).
import { schema, t } from '@colyseus/schema';
import { KACHEL, BREITE, HOEHE } from '../client/welt.mjs';
import { B11_KARTE, b11Sperrkanten } from './szene_b11_geo.mjs';

export const Fahrzeug = schema({
  x: t.number(), y: t.number(), richtung: t.number(),
  art: t.string(),          // 'bus' | 'auto' | 'laster' | 'polizei' | 'feuerwehr' | 'wrack' | 'evakuierung' (stehender Bus am Tor, server/aufgaben.mjs)
  farbe: t.uint8(),
  haelt: t.boolean(),
  turm: t.number(),         // Leopard (Evakuierungspanzer): Turmrichtung in Weltkoordinaten (Server dreht ihn mit begrenztem Tempo)
}, 'Fahrzeug');

const FAHRBAR = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);
const KOSTEN = { primary: 0.55, secondary: 0.6, tertiary: 0.75, unclassified: 1, residential: 1.2, living_street: 1.6, service: 3 };
export const LASTER_ANTEIL = 0.1;   // Anteil Laster im normalen Verkehr
const HAUPT = new Set(['primary', 'secondary', 'tertiary']);
export const LAENGE = { auto: 36, laster: 72, bus: 96, evakuierung: 96, polizei: 39, feuerwehr: 76 };   // Fahrzeuglänge in Pixeln (8 px = 1 m, echte Maße: client/masse.mjs; für den Abstand)
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
  welt._graph = { knoten: bestes, netz, haupt: bestes.filter(n => n.haupt) };
  return welt._graph;
}

export function naechsterKnoten(graph, x, y, nurHaupt = false) {
  let best = null, bd = Infinity;
  for (const n of nurHaupt ? graph.haupt : graph.knoten) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
  return best;
}

// Dijkstra (kleiner Graph, einfache Liste genügt)
export function route(graph, von, nach) {
  if (!von || !nach) return null;
  const dist = new Map([[von, 0]]), vor = new Map(), offen = new Set([von]);
  while (offen.size) {
    let u = null, ud = Infinity;
    for (const n of offen) { const d = dist.get(n); if (d < ud) { ud = d; u = n; } }
    offen.delete(u);
    if (u === nach) break;
    for (const e of u.nach) {
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
    this.blaulichtUhr = this.naechsteBlaulichtPause();
  }

  neu(art, startKnoten, extra = {}) {
    const f = new Fahrzeug();
    f.x = startKnoten.x; f.y = startKnoten.y; f.richtung = 0; f.art = art; f.farbe = Math.floor(this.raum.rnd() * 8); f.haelt = false;
    const id = art + this.naechsteId++;
    this.raum.state.fahrzeuge.set(id, f);
    this.info.set(id, { weg: null, pos: 0, halt: 0, ...extra });
    return id;
  }

  fahreNach(id, ziel) {
    const f = this.raum.state.fahrzeuge.get(id), inf = this.info.get(id);
    const von = naechsterKnoten(this.graph, f.x, f.y);
    const weg = route(this.graph, von, ziel);
    if (!weg || weg.length < 2) return false;
    const versatz = (SPUR[f.art] ?? 0.2) * 4 * KACHEL / 4 * 1.6;
    inf.weg = spurLinie(weg, versatz); inf.pos = 0; inf.zielKnoten = ziel;
    return true;
  }

  // Linienbus über alle Haltestellen, am Anfang Verkehr
  start(haltestellen, autos) {
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
    for (let i = 0; i < autos && this.graph.haupt.length; i++) {
      const id = this.neu(r() < LASTER_ANTEIL ? 'laster' : 'auto', this.graph.haupt[Math.floor(r() * this.graph.haupt.length)]);
      this.neuesZiel(id);
    }
  }

  neuesZiel(id) {
    const r = this.raum.rnd, liste = r() < 0.75 && this.graph.haupt.length ? this.graph.haupt : this.graph.knoten;
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

  // Evakuierungspanzer (Leopard): fährt querfeldein auf dem Weg aus server/querfeld.mjs (plan.weg: Einfahrtspunkt → Ziel) und wartet dort;
  // die Ausfahrt nimmt den Weg zurück (plan.rueck)
  evakuierungPanzer(plan) {
    const id = this.neu('evakuierung', plan.weg[0], { evakuierung: true, angekommen: false, querfeld: plan });
    const f = this.raum.state.fahrzeuge.get(id), inf = this.info.get(id);
    f.farbe = 0; inf.weg = plan.weg.map(p => ({ x: p.x, y: p.y })); inf.pos = 0;
    f.richtung = Math.atan2(plan.weg[1].y - plan.weg[0].y, plan.weg[1].x - plan.weg[0].x);
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
    if (inf.querfeld) { inf.weg = [{ x: f.x, y: f.y }, ...inf.querfeld.rueck]; inf.pos = 0; inf.halt = 0; inf.abfahrt = true; f.haelt = false; return; }   // Panzer: den Feldweg zurück
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
      // Fahrzeug direkt voraus (gleiche Spur): dahinter warten statt hindurchzufahren;
      // steht es länger als 5 s (Wrack, Pannenauto, verkeilt an der Kreuzung), wird vorbeigefahren
      const vorder = this.vorausFahrzeug(id, f);
      if (vorder) inf.gestaut = (inf.gestaut ?? 0) + dt; else inf.gestaut = 0;
      const stau = vorder && inf.gestaut < 5;
      let rest = (TEMPO[f.art] ?? 100) * dt * (imWeg ? (inf.durchfahrt ? 0.3 : 0) : 1) * (stau ? 0 : 1);
      while (rest > 0) {
        const ziel = inf.weg[inf.pos + 1];
        if (!ziel) { inf.weg = null; this.angekommen(id, f, inf, zeitMin, e); break; }
        const d = Math.hypot(ziel.x - f.x, ziel.y - f.y), w = Math.atan2(ziel.y - f.y, ziel.x - f.x);
        if (d > 0.5) f.richtung += Math.atan2(Math.sin(w - f.richtung), Math.cos(w - f.richtung)) * Math.min(1, dt * 7);
        if (d <= rest) { f.x = ziel.x; f.y = ziel.y; inf.pos++; rest -= d; }
        else { f.x += Math.cos(w) * rest; f.y += Math.sin(w) * rest; rest = 0; }
      }
    }
  }

  vorausFahrzeug(id, f) {
    const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), lf = LAENGE[f.art] ?? 46;
    for (const [oid, o] of this.raum.state.fahrzeuge) {
      if (oid === id) continue;
      const rx = o.x - f.x, ry = o.y - f.y;
      const vor = rx * c + ry * sn, quer = -rx * sn + ry * c;
      if (vor > 0 && vor < lf / 2 + (LAENGE[o.art === 'wrack' ? 'auto' : o.art] ?? 46) / 2 + 10 && Math.abs(quer) < 17) return o;
    }
    return null;
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
    // normaler Verkehr: nach der Anfangsphase verschwinden die Autos am Ziel
    if (zeitMin > (e.verkehrPhase ?? 25)) { s.fahrzeuge.delete(id); this.info.delete(id); return; }
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
