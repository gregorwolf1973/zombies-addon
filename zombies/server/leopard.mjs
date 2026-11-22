// Leopard 2A7 (Evakuierungspanzer, Schießstand): Turm, Lader-MG und Hauptkanone.
// Der Turm wird hier simuliert: Turmwinkel (Fahrzeug.turm, Weltkoordinaten) dreht mit höchstens TURM_TEMPO zum Ziel, MG und Kanone feuern
// erst, wenn die Rohrrichtung höchstens ZIEL_TOLERANZ vom Ziel abweicht; der Client glättet nur.
// Hauptkanone: ab `kanoneMin` Zombies auf einem Fleck (Kreis 3 m Radius) in 15–60 m Entfernung, Pause mindestens `kanonePause` s,
// Explosion mit 5 m Radius und hohem Flächenschaden (nach außen schwächer, Spieler nie verletzt). Nie schießen, wenn ein Spieler oder
// Mensch im Sicherheitsradius um den Einschlag steht (Zielwahl: server/zielwahl.mjs).
import { LEOPARD } from '../client/evak.mjs';
import { PX, gefaehrdet, haufenZiel } from './zielwahl.mjs';
import { bewege, WERTE as W } from '../client/welt.mjs';

export const TURM_TEMPO = 0.7;                     // rad/s (ca. 40 °/s)
export const ZIEL_TOLERANZ = 10 * Math.PI / 180;   // so genau muss der Turm zielen, bevor gefeuert wird
export const KANONE = {
  reichweiteMin: 15, reichweiteMax: 60,            // Meter vom Turmdrehpunkt zum Ziel
  haufenRadius: 3,                                 // Meter: Zombies innerhalb dieses Kreises zählen als „ein Fleck“ (6 m Durchmesser)
  schadenRadius: 5, schaden: 400,                  // Meter, Schaden in der Mitte (am Rand die Hälfte)
  sicherheit: 9,                                   // Meter um den Einschlag, in denen kein Spieler/Mensch stehen darf
  scan: 0.25,                                      // so oft (s) wird nach Haufen gesucht
};
// Druckwelle der Hauptkanone vor dem Rohr: Kegel (±20°) bis 10 m; Zombies werden vom Rohr weg geschleudert (3–8 m, nahe am Rohr weiter)
// und taumeln ~0,6 s; Spieler bekommen keinen Schaden, nur einen Schubs von ~1 m (nicht durch Wände).
export const DRUCKWELLE = { weite: 10, halbWinkel: 20 * Math.PI / 180, wegMin: 3, wegMax: 8, taumeln: 0.6, spielerSchub: 1 };
const MG_TREFFER = 0.8;

export const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
// Ein Schritt des Turms: dreht von w zum Winkel ziel, höchstens tempo·dt
export function turmDrehen(w, ziel, dt, tempo = TURM_TEMPO) {
  const d = winkelDiff(w, ziel), m = tempo * dt;
  return Math.abs(d) <= m ? ziel : w + Math.sign(d) * m;
}
const norm = w => Math.atan2(Math.sin(w), Math.cos(w));

// Einstellungen (bundeswehr.*) → Werte des Leopards
export function leopardEinst(bw, trefferChance = MG_TREFFER) {
  return {
    reichweite: (bw.leopardReichweite ?? 29) * PX, mgPause: bw.leopardPause ?? 0.4, mgSchaden: bw.leopardSchaden ?? 100, trefferChance,
    kanone: bw.leopardKanone !== false, kanonePause: bw.leopardKanonePause ?? 8, kanoneMin: bw.leopardKanoneMin ?? 10,
  };
}

// Punkt im Turmrahmen (vorn, rechts vom Turmdrehpunkt) bei Turmwinkel w im Weltrahmen
export function turmPunkt(f, w, vorn, rechts) {
  const px = f.x + Math.cos(f.richtung) * LEOPARD.turmX, py = f.y + Math.sin(f.richtung) * LEOPARD.turmX;
  const c = Math.cos(w), s = Math.sin(w);
  return { x: px + c * vorn - s * rechts, y: py + s * vorn + c * rechts };
}

export class Leopard {
  constructor(raum, name = 'Evakuierungspanzer') {
    this.raum = raum; this.name = name;
    this.kuehlMg = 0; this.kuehlK = 3; this.scanT = 0; this.kz = null; this.fahrzeug = null;
    this.schuetze = null;
  }

  von(x, y) { const v = this.schuetze ??= { name: this.name, x, y, besiegt: 0 }; v.x = x; v.y = y; return v; }

  // ein Takt: Ziel wählen, Turm drehen, MG und Kanone feuern, wenn der Turm steht
  schritt(f, dt, e) {
    const r = this.raum, s = r.state;
    if (this.fahrzeug !== f) { f.turm = f.richtung; this.fahrzeug = f; }   // neues Fahrzeug: Turm steht nach vorn
    this.kuehlMg -= dt; this.kuehlK -= dt; this.scanT -= dt;
    const pv = turmPunkt(f, 0, 0, 0);   // Turmdrehpunkt
    // Hauptkanone: Haufen suchen (nicht in jedem Takt)
    if (e.kanone && this.kuehlK <= 0) {
      if (this.scanT <= 0) {
        this.scanT = KANONE.scan;
        this.kz = haufenZiel(s, pv, { rmin: KANONE.reichweiteMin * PX, rmax: KANONE.reichweiteMax * PX, R: KANONE.haufenRadius * PX, min: e.kanoneMin, sicher: KANONE.sicherheit * PX });
      }
    } else this.kz = null;
    // Lader-MG: nächster Zombie in Reichweite
    let mz = null, bd = e.reichweite;
    for (const [id, z] of s.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - pv.x, z.y - pv.y);
      if (d < bd) { bd = d; mz = [id, z]; }
    }
    const kw = this.kz ? Math.atan2(this.kz.y - pv.y, this.kz.x - pv.x) : null;
    const zielW = kw ?? (mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung);
    f.turm = norm(turmDrehen(f.turm, zielW, dt));
    // Kanone: Turm steht auf dem Haufen, Sicherheitsradius noch einmal prüfen
    if (this.kz && Math.abs(winkelDiff(f.turm, kw)) <= ZIEL_TOLERANZ) {
      if (!gefaehrdet(s, this.kz.x, this.kz.y, KANONE.sicherheit * PX)) {
        this.kanonenSchuss(f, pv, this.kz);
        this.kuehlK = Math.max(1, e.kanonePause); this.kuehlMg = Math.max(this.kuehlMg, 1);
      }
      this.kz = null;
      return;
    }
    if (!mz || this.kuehlMg > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > ZIEL_TOLERANZ) return;
    this.kuehlMg = e.mgPause;
    const m = turmPunkt(f, f.turm, LEOPARD.mgX, LEOPARD.mgY);
    const treffer = r.rnd() < e.trefferChance;
    const w = Math.atan2(z.y - m.y, z.x - m.x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08)), d = Math.hypot(z.x - m.x, z.y - m.y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: m.x, y1: m.y, x2: m.x + Math.cos(w) * d, y2: m.y + Math.sin(w) * d, w, t: treffer ? 1 : 0, evak: 'panzer', tw: f.turm });
    if (treffer) {
      const vorher = s.besiegt;
      r.schaden(id, z, e.mgSchaden, this.von(m.x, m.y));
      s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie die Bundeswehr)
    }
  }

  // Schuss der Hauptkanone: Mündungsfeuer am Rohrende, Einschlag mit Flächenschaden am Ziel (Sicht egal, nach außen schwächer)
  kanonenSchuss(f, pv, ziel) {
    const r = this.raum, s = r.state, R = KANONE.schadenRadius * PX;
    const mu = turmPunkt(f, f.turm, LEOPARD.muendung, 0);
    r.broadcast('leopardkanone', { x1: mu.x, y1: mu.y, x2: ziel.x, y2: ziel.y, w: f.turm, r: R });
    this.druckwelle(mu, f.turm);
    const von = this.von(ziel.x, ziel.y);
    const vorher = s.besiegt;
    for (const [id, z] of [...s.zombies]) {
      if (z.ebene) continue;
      const d = Math.hypot(z.x - ziel.x, z.y - ziel.y);
      if (d > R) continue;
      const sch = Math.max(1, Math.round(KANONE.schaden * (1 - 0.5 * d / R)));
      if (sch >= z.hp) z.kriecht = true;   // ein Treffer, der ihn erledigt, lässt ihn nicht mehr kriechen
      r.schaden(id, z, sch, von);
    }
    s.besiegt = vorher;
    r.broadcast('explosion', { x: ziel.x, y: ziel.y, r: R, ebene: '' });
    r.laerm?.(ziel.x, ziel.y, 700, true, '');
  }

  // Druckwelle im Kegel vor der Mündung (nur Leopard; der Puma hat keine). Rückgabe: Anzahl geschleuderter Zombies
  druckwelle(mu, w) {
    const r = this.raum, s = r.state, D = DRUCKWELLE, weite = D.weite * PX, welt = r.wv?.('');
    const schieb = (o, wk, strecke, rad) => {
      const n = Math.max(1, Math.ceil(strecke / 4)), dx = Math.cos(wk) * strecke / n, dy = Math.sin(wk) * strecke / n;
      for (let i = 0; i < n; i++) { if (welt) bewege(welt, o, dx, dy, rad); else { o.x += dx; o.y += dy; } }
    };
    const imKegel = o => {
      if (o.ebene) return null;
      const d = Math.hypot(o.x - mu.x, o.y - mu.y);
      if (d > weite) return null;
      const wk = d < 1 ? w : Math.atan2(o.y - mu.y, o.x - mu.x);
      return Math.abs(winkelDiff(w, wk)) <= D.halbWinkel ? { d, wk } : null;
    };
    let n = 0;
    for (const [id, z] of s.zombies) {
      if (!(z.hp > 0)) continue;
      const k = imKegel(z); if (!k) continue;
      schieb(z, k.wk, (D.wegMin + (D.wegMax - D.wegMin) * (1 - k.d / weite)) * PX, W.zombieRadius);
      const info = r.zombieInfo?.get(id);
      if (info) { info.reakT = Math.max(info.reakT ?? 0, D.taumeln); info.tmT = 0; }
      n++;
    }
    for (const p of s.spieler.values()) {
      if (p.unten || p.anBord) continue;
      const k = imKegel(p); if (k) schieb(p, k.wk, D.spielerSchub * PX, W.spielerRadius);
    }
    return n;
  }
}
