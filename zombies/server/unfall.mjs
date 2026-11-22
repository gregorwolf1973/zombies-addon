// Verkehrsunfälle: hin und wieder kommt ein fahrendes Auto von der Spur ab und kracht in ein anderes Fahrzeug oder eine Hauswand.
// Danach raucht es, nach 10–20 s brennt es (Brandmechanik aus server/feuer.mjs) und explodiert mit einstellbarer Wahrscheinlichkeit.
// Einstellungen (Verwaltung → Verkehr): unfall (Spielminuten im Mittel, 0 = aus), unfallExplosion (%), unfallSchaden (Lebenspunkte Spieler).
import { frei } from '../client/welt.mjs';
import { LAENGE } from './verkehr.mjs';

const METER = 8;                              // Pixel je Meter (client/hordenlogik.mjs)
export const UNFALL_RADIUS = 4 * METER + 14;  // Explosion: 4 m um das Wrack (plus halbe Fahrzeugbreite)
const MELDE_WEITE = 60 * METER;               // „💥 Unfall!“ nur für Spieler näher als 60 m
const ZIEL_ARTEN = new Set(['auto', 'laster', 'polizei']);   // diese Fahrzeuge dürfen das Ziel sein (nicht Bus, Feuerwehr, Evakuierung)
const MAX_FAHRT = 8;                          // Sekunden bis der Aufprall spätestens eintritt

export class Unfaelle {
  constructor(verkehr) {
    this.v = verkehr;
    this.raum = verkehr.raum;
    this.liste = new Map();   // Fahrzeug-id → { phase: 'rauch' | 'feuer', t, rauchBis, feuerId, explodiert, expAb }
    this.uhr = null;
  }

  einst() { return this.raum.einstellungen?.() ?? {}; }

  // Abstand bis zum nächsten Unfall (Spielsekunden), exponentiell verteilt um den Mittelwert
  naechster(minuten) { return Math.max(20, -Math.log(1 - this.raum.rnd()) * minuten * 60); }

  schritt(dt) {
    const e = this.einst(), zr = this.raum.zeitraffer?.() ?? 1, min = Number(e.unfallMinuten ?? 10);
    if (min > 0) {
      this.uhr ??= this.naechster(min);
      this.uhr -= dt * zr;
      if (this.uhr <= 0) {
        this.uhr = this.naechster(min);
        const draussen = [...this.raum.state.spieler.values()].filter(p => !p.ebene && p.verbunden !== false);
        if (draussen.length) {
          const p = draussen[Math.floor(this.raum.rnd() * draussen.length)];
          if (!this.ausloesen({ x: p.x, y: p.y })) this.uhr = Math.min(this.uhr, 20);   // nichts Passendes: bald nochmal versuchen
        }
      }
    } else this.uhr = null;
    for (const [id, u] of [...this.liste]) this.folge(id, u, dt * zr);
  }

  // Unfall auslösen. ort: Mitte der Suche (meist ein Spieler); opt.erzeugen: notfalls ein Auto auf die Straße stellen (Testbefehl).
  // Rückgabe: true, wenn ein Auto losgefahren ist.
  ausloesen(ort, opt = {}) {
    const s = this.raum.state, v = this.v;
    const nah = opt.nah ? [40, 900] : [150, 900];
    const kandidaten = [];
    for (const [id, f] of s.fahrzeuge) {
      const inf = v.info.get(id);
      if (f.art !== 'auto' || !inf?.weg || inf.halt > 0 || inf.brennt || inf.unfall || inf.evakuierung || inf.durchfahrt) continue;
      const d = Math.hypot(f.x - ort.x, f.y - ort.y);
      if (d >= nah[0] && d <= nah[1]) kandidaten.push({ id, d });
    }
    kandidaten.sort((a, b) => opt.nah ? a.d - b.d : this.raum.rnd() - 0.5);
    for (const { id } of kandidaten.slice(0, 6)) if (this.starte(id)) return true;
    if (!opt.erzeugen || !v.graph.knoten.length) return false;
    // keins in der Nähe: ein Auto auf einer Straße 150–500 px entfernt erzeugen
    const knoten = v.graph.knoten.filter(n => { const d = Math.hypot(n.x - ort.x, n.y - ort.y); return d > 150 && d < 500 && n.nach.length; });
    for (let versuch = 0; versuch < 14 && knoten.length; versuch++) {
      const n = knoten[Math.floor(this.raum.rnd() * knoten.length)], kante = n.nach[Math.floor(this.raum.rnd() * n.nach.length)];
      const id = v.neu('auto', n), f = s.fahrzeuge.get(id);
      f.richtung = Math.atan2(kante.ziel.y - n.y, kante.ziel.x - n.x);
      v.info.get(id).weg = [{ x: n.x, y: n.y }, { x: kante.ziel.x, y: kante.ziel.y }];   // fährt wie ein normales Auto; der Unfall übernimmt sofort
      if (this.starte(id)) return true;
      s.fahrzeuge.delete(id); v.info.delete(id);
    }
    return false;
  }

  // Ziel suchen, das auf direktem Weg erreichbar ist: Strahlen in der Fahrtrichtung ±80°, erstes Fahrzeug oder erste Wand
  zielSuchen(id, f) {
    const welt = this.raum.welt, s = this.raum.state, r = this.raum.rnd;
    const winkel = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4].sort(() => r() - 0.5);
    const funde = [];
    for (const a of winkel) {
      const w = f.richtung + a, c = Math.cos(w), sn = Math.sin(w);
      for (let d = 20; d <= 260; d += 6) {
        const px = f.x + c * d, py = f.y + sn * d;
        let hit = null;
        for (const [oid, o] of s.fahrzeuge) {
          if (oid === id || !ZIEL_ARTEN.has(o.art === 'wrack' ? 'auto' : o.art)) continue;
          if (Math.hypot(px - o.x, py - o.y) < (LAENGE[o.art === 'wrack' ? 'auto' : o.art] ?? 46) * 0.4) { hit = oid; break; }
        }
        if (hit) { if (d >= 40) funde.push({ art: 'fz', oid: hit, x: s.fahrzeuge.get(hit).x, y: s.fahrzeuge.get(hit).y }); break; }
        if (!frei(welt, px, py, 8)) { if (d >= 45) funde.push({ art: 'haus', x: px - c * 6, y: py - sn * 6 }); break; }
      }
    }
    if (!funde.length) return null;
    const fz = funde.filter(q => q.art === 'fz'), wahl = fz.length && r() < 0.6 ? fz : funde;
    return wahl[Math.floor(r() * wahl.length)];
  }

  starte(id) {
    const f = this.raum.state.fahrzeuge.get(id), inf = this.v.info.get(id);
    if (!f || !inf) return false;
    const ziel = this.zielSuchen(id, f);
    if (!ziel) return false;
    inf.unfall = { ziel, t: 0 };
    inf.weg = null; inf.halt = 0;
    f.haelt = false;
    return true;
  }

  // Fahrphase des Unfallautos: gerade auf das Ziel zu, beschleunigt, ohne Rücksicht auf Verkehr
  fahrt(id, f, inf, dt) {
    const u = inf.unfall, s = this.raum.state, welt = this.raum.welt, lf = LAENGE.auto;
    u.t += dt;
    const o = u.ziel.oid ? s.fahrzeuge.get(u.ziel.oid) : null;
    if (u.ziel.oid && !o) { u.ziel = { art: 'haus', x: f.x + Math.cos(f.richtung) * 60, y: f.y + Math.sin(f.richtung) * 60 }; }   // Ziel verschwunden: einfach geradeaus
    const tx = o ? o.x : u.ziel.x, ty = o ? o.y : u.ziel.y;
    const w = Math.atan2(ty - f.y, tx - f.x);
    f.richtung += Math.atan2(Math.sin(w - f.richtung), Math.cos(w - f.richtung)) * Math.min(1, dt * 6);
    const tempo = Math.min(175, 70 + u.t * 140), c = Math.cos(f.richtung), sn = Math.sin(f.richtung);
    const nx = f.x + c * tempo * dt, ny = f.y + sn * tempo * dt;
    if (o) {
      const lo = LAENGE[o.art === 'wrack' ? 'auto' : o.art] ?? 46;
      if (Math.hypot(o.x - nx, o.y - ny) < (lf + lo) / 2 * 0.78) { f.x = nx; f.y = ny; return this.aufprall(id, f, inf, u.ziel.oid); }
    } else if (!frei(welt, nx + c * lf / 2, ny + sn * lf / 2, 5) || Math.hypot(tx - nx, ty - ny) < 5) return this.aufprall(id, f, inf, null);
    f.x = nx; f.y = ny;
    if (u.t > MAX_FAHRT) this.aufprall(id, f, inf, null);
  }

  aufprall(id, f, inf, oid) {
    const s = this.raum.state, v = this.v;
    f.art = 'wrack'; f.haelt = true; f.rauch = true;
    v.info.delete(id);
    if (oid) {   // das andere Fahrzeug ist beschädigt und bleibt als Wrack liegen
      const o = s.fahrzeuge.get(oid);
      if (o) {
        const oi = v.info.get(oid), c = Math.cos(f.richtung), sn = Math.sin(f.richtung);
        if (!oi?.evakuierung) { o.art = 'wrack'; o.haelt = true; v.info.delete(oid); }
        if (frei(this.raum.welt, o.x + c * 10, o.y + sn * 10, 8)) { o.x += c * 10; o.y += sn * 10; }
      }
    }
    this.raum.broadcast('krach', { x: f.x, y: f.y, ebene: '' });
    this.raum.laerm(f.x, f.y, 650, true, '');
    this.melden(f.x, f.y, '💥 Unfall!');
    this.liste.set(id, { phase: 'rauch', t: 0, rauchBis: 10 + this.raum.rnd() * 10 });
  }

  melden(x, y, text) {
    const s = this.raum.state;
    for (const c of this.raum.clients ?? []) {
      const p = s.spieler.get(c.sessionId);
      if (p && !p.ebene && Math.hypot(p.x - x, p.y - y) < MELDE_WEITE) { try { c.send('meldung', { text }); } catch { /* Verbindung weg */ } }
    }
  }

  // Rauch → Feuer → (Explosion) → ausgebrannt
  folge(id, u, dt) {
    const s = this.raum.state, f = s.fahrzeuge.get(id);
    if (!f) { this.liste.delete(id); return; }
    u.t += dt;
    if (u.phase === 'rauch') {
      if (u.t < u.rauchBis) return;
      u.phase = 'feuer'; u.t = 0;
      u.explodiert = this.raum.rnd() * 100 < (this.einst().unfallExplosion ?? 50);
      u.expAb = 12 + this.raum.rnd() * 13;
      u.feuerId = this.raum.brand?.anzuenden({ k: 'fz:' + id, x: f.x, y: f.y, art: 'fahrzeug', r: 42, fz: id }) ?? null;
      return;
    }
    if (u.explodiert && u.t >= u.expAb) { this.explosion(f); u.explodiert = false; }
    if (!u.feuerId || !s.feuer.has(u.feuerId)) {   // Feuer erloschen (oder es gab keins): ausgebrannt, nur noch Wrack
      if (u.explodiert) this.explosion(f);
      f.rauch = false; this.liste.delete(id);
    }
  }

  // Druckwelle: Schaden an Spielern (einstellbar), Zombies und Bewohnern im Umkreis von 4 m
  explosion(f) {
    const r = this.raum, s = r.state, R = UNFALL_RADIUS, schaden = this.einst().unfallSchaden ?? 30;
    const abfall = d => 1 - 0.5 * d / R;   // in der Mitte voll, am Rand halb
    for (const p of s.spieler.values()) {
      if (p.ebene || p.unten || p.anBord || p.zombie > 0 || r.unsterblich?.(p)) continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d > R) continue;
      p.hp = Math.max(0, p.hp - schaden * abfall(d));
      if (p.hp === 0) r.liegtAmBoden(p);
    }
    const von = { name: 'Autounfall', x: f.x, y: f.y, besiegt: 0 };
    for (const [zid, z] of [...s.zombies]) {
      if (z.ebene) continue;
      const d = Math.hypot(z.x - f.x, z.y - f.y);
      if (d <= R) r.schaden(zid, z, 250 * abfall(d), von);
    }
    for (const [mid, m] of [...s.menschen]) {
      if (m.ebene || m.sichtbar === false || Math.hypot(m.x - f.x, m.y - f.y) > R) continue;
      const inf = r.stadt?.info.get(mid);
      if (inf?.folgt) continue;   // gerettete Begleiter eines Spielers bleiben verschont
      if (inf) r.stadt.gruppeVerlassen(mid, inf);
      s.menschen.delete(mid); r.stadt?.info.delete(mid);
      r.neueLeiche({ x: m.x, y: m.y, richtung: r.rnd() * Math.PI * 2, variante: Math.floor(r.rnd() * 25), ebene: '' });
    }
    r.broadcast('explosion', { x: f.x, y: f.y, r: 40, ebene: '' });
    r.laerm(f.x, f.y, 900, true, '');
  }
}
