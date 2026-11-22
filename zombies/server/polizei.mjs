// Polizisten an den Straßensperren (welt.sperren aus client/osmwelt.mjs; der Streifenwagen mit Blaulicht ist dort schon gezeichnet,
// das Flackern macht client/polizei.mjs). Alles entsteht zur LAUFZEIT hier auf dem Server – der geteilte Weltcode (WELT_VERSION) bleibt unberührt.
// Verhalten: 2–3 Polizisten halten Wache an ihrem Posten und schießen mit der Pistole auf Zombies im Umkreis von 25 m (Munition je Kopf
// begrenzt, Einstellung polizei.munition, 0 = unbegrenzt). Zombies beißen sie (Lebenspunkte); gefallene lassen Pistole und Munition
// liegen und stehen nach der Verwandlungszeit als Zombie wieder auf. Angriffstrupps der Horden kennen sie als Ziel (server/welle.mjs).
// Nachrichten: 'pol' { s: [[nr, x, y, blick, tot]] } (jede Sekunde, bei Bewegung/Kampf öfter, nur in der Nähe), 'polschuss' { i, x, y, w, t }, 'poltot'.
import { frei, sichtfrei, WAFFEN } from '../client/welt.mjs';

export const POL_REICHWEITE = 25 * 8;   // 25 m (8 px je Meter)
const POL_HP = 90, POL_BISS = 26, POL_NAHSCHADEN = 18;
const POL_PAUSE = 1.1, POL_TREFFER = 0.7, POL_LAERM = 300;
const AUTO_HL = 23 * 0.78, AUTO_HB = 10.5 * 0.76;   // Halbmaße des gezeichneten Streifenwagens (client/aussehen.mjs zeichneSperren)

// Lokale Lage an der Sperre (x = Straßenrichtung, y = quer) → Welt
const zuWelt = (s, lx, ly) => { const c = Math.cos(s.winkel), n = Math.sin(s.winkel); return { x: s.x + c * lx - n * ly, y: s.y + n * lx + c * ly }; };

// Sichere Standorte für n Polizisten an einer Sperre: nie in Wänden/auf gesperrten Kacheln (frei), nie im Streifenwagen, nie auf dem Gitter
export function polizeiPosten(welt, s, n) {
  const B = s.breite, seite = s.seite ?? 1, wa = 0.3 * seite;
  const ca = Math.cos(wa), sa = Math.sin(wa), ax = seite * 30, ay = -B * 0.16;
  const kand = [];
  for (const lx of [seite * 14, -seite * 14, seite * 20, -seite * 22]) for (const f of [-0.4, 0.4, 0.05, -0.2, 0.22, -0.55, 0.55]) kand.push([lx, f * B + (f > 0.5 ? 12 : f < -0.5 ? -12 : 0)]);
  for (const lx of [seite * 8, -seite * 8, seite * 26, -seite * 30]) for (const f of [-0.4, 0.4, 0, -0.2, 0.2]) kand.push([lx, f * B]);
  const out = [];
  for (const [lx, ly] of kand) {
    if (out.length >= n) break;
    const dx = lx - ax, dy = ly - ay, ux = dx * ca + dy * sa, uy = -dx * sa + dy * ca;
    if (Math.abs(ux) < AUTO_HL + 6 && Math.abs(uy) < AUTO_HB + 6) continue;   // im Streifenwagen
    if (Math.abs(lx) < 7 && Math.abs(ly) < B / 2 + 8) continue;               // auf dem Absperrgitter/den Sandsäcken
    const p = zuWelt(s, lx, ly);
    if (!frei(welt, p.x, p.y, 6)) continue;
    if (out.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 14)) continue;
    // Blick weg von der Sperre, entlang der Straße
    out.push({ x: p.x, y: p.y, blick: s.winkel + (lx >= 0 ? 0 : Math.PI) });
  }
  return out;
}

export class Polizei {
  constructor(raum) {
    this.raum = raum;
    this.beamte = [];
    this.laeuft = false;
    this.sendT = 0; this.nahT = 0; this.pruefT = 0;
    this.schuetze = { name: 'Polizei', x: 0, y: 0, besiegt: 0 };
    this.trefferChance = POL_TREFFER;   // Tests setzen 1
  }

  einst() { return { aktiv: true, anzahl: 3, munition: 30, ...(this.raum.einstellungen?.()?.polizei ?? {}) }; }

  start() {
    const r = this.raum;
    this.beamte = []; this.laeuft = false;
    const e = this.einst();
    this.war = e.aktiv;
    if (!e.aktiv || !r.welt?.sperren?.length || r.welt.kachel || r.welt.ebene) return;
    let nr = 0;
    r.welt.sperren.forEach((s, k) => {
      for (const p of polizeiPosten(r.welt, s, e.anzahl)) {
        this.beamte.push({ i: nr++, sperre: k, x: p.x, y: p.y, hx: p.x, hy: p.y, blick: p.blick, hp: POL_HP, tot: 0, tZeit: 0,
          kuehl: 0.4 + (nr % 4) * 0.25, scan: 0, ziel: null, zid: null, muni: e.munition });
      }
    });
    this.laeuft = this.beamte.length > 0;
    this.sendT = 0;
  }

  lebende() { return this.beamte.filter(q => !q.tot); }

  // alle 2 s: Schalter live nachziehen (aus: Polizisten verschwinden, an: neu aufstellen)
  pruefen(dt) {
    this.pruefT -= dt;
    if (this.pruefT > 0) return;
    this.pruefT = 2;
    const an = this.einst().aktiv;
    if (an === this.war) return;
    this.war = an;
    if (an) return this.start();
    for (const q of this.beamte) if (q.zid) { this.raum.state.zombies.delete(q.zid); this.raum.zombieInfo.delete(q.zid); }
    this.beamte = []; this.laeuft = false; this.raum.broadcast('pol', { s: [], aus: 1 });
  }

  schritt(dt) {
    this.pruefen(dt);
    if (!this.beamte.length) return;
    const r = this.raum;
    this.nahT += dt;
    for (const q of this.beamte) this.beamterSchritt(q, dt);
    if (this.nahT >= 0.25) { const d = this.nahT; this.nahT = 0; this.nahkampf(d); }
    const sek = this.verwandlungSek();
    for (const q of this.beamte) {
      if (q.tot !== 1) continue;
      q.tZeit += dt * (r.zeitraffer?.() ?? 1);
      if (q.tZeit >= sek) this.aufstehen(q);
    }
    this.sendT -= dt;
    if (this.sendT <= 0) this.senden();
  }

  // Verwandlungszeit (Einstellung „verwandlung“, Spielminuten) in Sekunden der Spieluhr – wie bei den Bewohnern und der B11-Szene
  verwandlungSek() {
    const e = this.raum.einstellungen?.() ?? {};
    return (e.verwandlungMin ?? 30) * ((e.tagMinuten || 48) * 60 / 1440);
  }

  sicht(x1, y1, x2, y2) { return sichtfrei(this.raum.welt, x1, y1, x2, y2); }
  gueltig(id, x, y) {
    const z = id && this.raum.state.zombies.get(id);
    return z && !z.ebene && z.hp > 0 && Math.hypot(z.x - x, z.y - y) <= POL_REICHWEITE && this.sicht(x, y, z.x, z.y) ? z : null;
  }
  waehleZiel(x, y) {
    let best = null, bd = Infinity;
    for (const [id, z] of this.raum.state.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd && d <= POL_REICHWEITE && this.sicht(x, y, z.x, z.y)) { bd = d; best = id; }
    }
    return best;
  }

  beamterSchritt(q, dt) {
    const r = this.raum;
    if (q.tot) return;
    q.kuehl = Math.max(0, q.kuehl - dt);
    let z = this.gueltig(q.ziel, q.x, q.y);
    if (!z) {
      q.scan -= dt;
      if (q.scan > 0) return;
      q.scan = 0.25;
      q.ziel = this.waehleZiel(q.x, q.y);
      z = this.gueltig(q.ziel, q.x, q.y);
      if (!z) return;
    }
    q.blick = Math.atan2(z.y - q.y, z.x - q.x);
    this.sendT = Math.min(this.sendT, 0.2);
    if (q.kuehl > 0 || q.muni === 0 && this.einst().munition > 0) return;   // leer: schweigt (0 im Vorrat; Einstellung 0 = unbegrenzt)
    q.kuehl = POL_PAUSE * (0.85 + r.rnd() * 0.3);
    if (this.einst().munition > 0) q.muni--;
    const treffer = r.rnd() < this.trefferChance;
    const w = q.blick + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.07 + r.rnd() * 0.1));
    const d = Math.hypot(z.x - q.x, z.y - q.y);
    r.broadcast('polschuss', { i: q.i, x: q.x, y: q.y, x2: q.x + Math.cos(w) * d, y2: q.y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) this.treffen(q.ziel, z, WAFFEN.pistole.schaden, q);
    r.laerm(q.x, q.y, POL_LAERM, true, '');
  }

  treffen(id, z, menge, von) {
    const r = this.raum, vorher = r.state.besiegt;
    this.schuetze.x = von.x; this.schuetze.y = von.y;
    r.schaden(id, z, menge, this.schuetze);
    r.state.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler
  }

  // Zombies im Nahkampf: Lebenspunkte sinken
  nahkampf(d) {
    const lebend = this.lebende();
    if (!lebend.length) return;
    for (const z of this.raum.state.zombies.values()) {
      if (z.ebene || !(z.hp > 0)) continue;
      for (const q of lebend) if (!q.tot && Math.hypot(z.x - q.x, z.y - q.y) < POL_BISS) q.hp -= POL_NAHSCHADEN * d;
    }
    for (const q of lebend) if (q.hp <= 0) this.tot(q);
  }

  // gefallen: Pistole und Munition liegen am Boden (aufhebbar wie jeder Bodengegenstand), der Körper liegt bis zur Verwandlung
  tot(q) {
    const r = this.raum;
    q.tot = 1; q.hp = 0; q.tZeit = 0;
    r.legeHin('pistole', q.x, q.y); r.legeHin('munition', q.x, q.y);
    r.broadcast('poltot', { i: q.i, x: q.x, y: q.y, w: q.blick });
    r.laerm(q.x, q.y, 300, true, '');
    this.sendT = 0;
  }

  aufstehen(q) {
    const r = this.raum;
    const id = r.setzeZombie(q.x, q.y, '');
    const info = r.zombieInfo.get(id);
    info.schlaeft = false; info.steht = false;
    q.tot = 2; q.zid = id;
    this.sendT = 0;
  }

  senden() {
    this.sendT = 1;
    const rund = a => Math.round(a * 10) / 10;
    this.raum.sendeNah('pol', { s: this.beamte.map(q => [q.i, rund(q.x), rund(q.y), Math.round(q.blick * 100) / 100, q.tot]) }, this.beamte);
  }
}
