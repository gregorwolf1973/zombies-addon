// Radpanzer „Boxer“: fahrbarer Radpanzer am Flugfeld Königsdorf (Level 3). Fahren, Einsteigen, Turm und Überrollen stehen in server/fahrbar.mjs
// (gemeinsam mit den fahrbaren Superuser-Fahrzeugen Puma und Leopard); hier kommen Standort am Flugfeld und die Horde dazu: Solange jemand
// drin sitzt, kommt in festen Abständen eine Horde von vorn auf den Boxer zu (nur der echte Boxer, nie die Superuser-Fahrzeuge).
// Server ist maßgeblich; der Client zeichnet nur (client/boxerdarstellung.mjs).
import { KACHEL, frei, kmhZuPx } from '../client/welt.mjs';
import { FahrbarBoxer, ART, PX, FAHRBAR_PLAETZE, fahrbarFrei } from './fahrbar.mjs';
import { WELLE_MAX } from './welle.mjs';

export const BOXER_PLAETZE = FAHRBAR_PLAETZE;
export const BOXER_ID = 'boxer1';
// Fahrwerk des Boxers (Höchsttempo kommt aus der Einstellung bundeswehr.boxerTempo, km/h)
export const BOXER_FAHRWERK = ART.boxer.fahrwerk;
export const VMAX = kmhZuPx(BOXER_FAHRWERK.tempoKmh);
export const DREHRATE = BOXER_FAHRWERK.drehrate, DREHRATE_STAND = BOXER_FAHRWERK.drehrateStand;
const HORDE_VORNE = [80, 100];                   // Meter vor dem Boxer
const GLOBAL_MAX = 900;                          // so viele Zombies insgesamt höchstens, wenn eine Boxer-Horde erscheint
const FELD_TAKT = 2.5;                           // Sekunden: Ziel der Horde (Wegefeld) nachführen
export const EINST_VORGABE = { boxerHordeSek: 120, boxerHordeMin: 20, boxerHordeMax: 50, boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60 };

// Wanne an Pose (x, y, w) frei? (Welt `welt`, Punkte mit Spielraum)
export const boxerFrei = (welt, x, y, w) => fahrbarFrei(welt, 'boxer', x, y, w);

// Standort am Flugfeld Königsdorf: bei den Hangars (Ende des Rollwegs am Nordrand), nicht auf Piste/Rollweg, auf freiem Platz; null ohne Piste.
export function boxerStandort(welt) {
  const pi = welt?.piste;
  if (!pi) return null;
  const seg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const pistenAbstand = (x, y) => {   // Kacheln bis zum Rand von Piste/Rollweg
    let m = seg(x / KACHEL, y / KACHEL, [pi.x0, pi.y0], [pi.x1, pi.y1]) - pi.b / 2;
    for (const q of pi.rollweg ?? []) for (let i = 0; i + 1 < q.length; i++) m = Math.min(m, seg(x / KACHEL, y / KACHEL, q[i], q[i + 1]) - (pi.rb ?? 3) / 2);
    return m;
  };
  const rw = pi.rollweg?.[0], ende = rw ? rw[rw.length - 1] : [pi.x0 + (pi.x1 - pi.x0) * 0.5, pi.y0];
  const mx = (ende[0] + 3) * KACHEL, my = (ende[1] + 7) * KACHEL;   // bevorzugt: südöstlich vor den Hangars
  const w0 = Math.atan2(pi.y1 - pi.y0, pi.x1 - pi.x0);
  const kand = [];
  for (let dy = -12; dy <= 16; dy += 0.5) for (let dx = -16; dx <= 16; dx += 0.5) kand.push([mx + dx * KACHEL, my + dy * KACHEL]);
  kand.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
  for (const [x, y] of kand) {
    if (x < 6 * KACHEL || y < 6 * KACHEL || pistenAbstand(x, y) < 3) continue;
    for (const w of [w0, w0 + Math.PI / 2, w0 - Math.PI / 2, w0 + Math.PI]) {
      if (!boxerFrei(welt, x, y, w)) continue;
      // Platz zum Aussteigen und Wenden: auch ein Stück um die Wanne herum frei
      if (![[0, 22], [0, -22], [38, 0], [-38, 0]].every(([u, v]) => frei(welt, x + Math.cos(w) * u - Math.sin(w) * v, y + Math.sin(w) * u + Math.cos(w) * v, 6))) continue;
      return { x, y, w };
    }
  }
  return null;
}

export class Boxer extends FahrbarBoxer {
  constructor(raum) {
    super(raum, { id: BOXER_ID });
    this.hordeT = 0; this.feldT = 0;
    this.horden = [];           // vom Boxer gerufene Horden (Objekte aus welle.horden)
  }

  einst() { return { ...EINST_VORGABE, ...super.einst() }; }

  // beim Weltaufbau: im Level Königsdorf (Karte mit Piste) am Flugfeld aufstellen
  start() {
    const r = this.raum;
    if (r.state.karte !== 'koenigsdorf') return;
    const o = boxerStandort(r.welt);
    if (o) this.aufstellen(o.x, o.y, o.w);
  }

  eingestiegen() { if (this.insassen.length === 1) this.hordeT = 0; }   // die erste Horde kommt nach boxerHordeSek Insassen-Zeit

  // Horde: solange jemand drin sitzt alle boxerHordeSek Sekunden 20–50 Zombies (Einstellung) 80–100 m vor dem Boxer; sie laufen auf ihn zu und folgen ihm
  hordeSchritt(dt) {
    const r = this.raum, w = r.welle, e = this.einst();
    if (this.insassen.length && w) {
      this.hordeT += dt;
      if (this.hordeT >= Math.max(5, e.boxerHordeSek)) {
        if (this.hordeRufen(e)) this.hordeT = 0; else this.hordeT = Math.max(5, e.boxerHordeSek) - 10;   // kein Platz: in 10 s noch einmal
      }
    }
    // Ziel laufend nachführen (ohne Insassen ziehen die Horden normal weiter)
    this.horden = this.horden.filter(h => w?.horden.includes(h) && !h.abzug);
    this.feldT -= dt;
    if (this.horden.length && this.feldT <= 0 && this.insassen.length) {
      this.feldT = FELD_TAKT;
      const f = this.f;
      for (const h of this.horden) {
        if (Math.hypot(h.ziel.x - f.x, h.ziel.y - f.y) < 40) continue;
        const ziel = { x: f.x, y: f.y }, feld = w.baueFeld(ziel);
        h.ziel = ziel; if (feld) h.feld = feld;
        h.pruef = { t: 0, x: h.mitte.x, y: h.mitte.y }; h.klemmStufe = 0; h.umwegBis = 0; h.feldHaupt = null;
      }
    }
  }

  hordeRufen(e) {
    const r = this.raum, w = r.welle, f = this.f;
    const lo = Math.max(1, Math.round(e.boxerHordeMin)), hi = Math.max(lo, Math.round(e.boxerHordeMax));
    let n = Math.min(WELLE_MAX, lo + Math.floor(r.rnd() * (hi - lo + 1)));
    n = Math.min(n, GLOBAL_MAX - r.state.zombies.size);
    if (n < Math.min(lo, 5)) return false;
    const c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    const dist = HORDE_VORNE[0] + r.rnd() * (HORDE_VORNE[1] - HORDE_VORNE[0]);
    // erst genau voraus, dann seitlich versetzt, dann näher/weiter
    const plan = [];
    for (const dd of [0, -10, 10]) for (const quer of [0, 12, -12, 24, -24, 40, -40]) plan.push([dist + dd, quer]);
    for (const [dm, quer] of plan) {
      const u = dm * PX, v = quer * PX, x = f.x + c * u - s * v, y = f.y + s * u + c * v;
      const ids = w.erzeugen('west', n, { cx: x, cy: y, ziel: { x: f.x, y: f.y }, feld: w.baueFeld({ x: f.x, y: f.y }), lager: true, blind: true });
      if (!ids) continue;
      const h = w.horden[w.horden.length - 1];
      h.boxer = true; h.zielName = 'Boxer'; this.horden.push(h);
      for (const sid of this.insassen) if (!this.istBot(sid)) this.sendeAn(sid, `🧟 Eine Horde (${ids.length}) kommt auf den Boxer zu!`);
      return true;
    }
    return false;
  }
}
