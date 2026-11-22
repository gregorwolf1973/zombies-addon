// Radpanzer „Boxer“: fahrbarer Radpanzer am Flugfeld Königsdorf (Level 3). Bis zu vier Spieler steigen mit der Aktionstaste ein, der erste fährt
// (Eingabe wie beim Gehen), der Turm schießt automatisch Dauerfeuer auf den nächsten Zombie, die Insassen sind unsichtbar und vor Zombies
// sicher, der Boxer selbst hat keine Lebenspunkte. Solange jemand drin sitzt, kommt in festen Abständen eine Horde von vorn auf ihn zu.
// Server ist maßgeblich (Fahren, Kollision, Schießen); der Client zeichnet nur (client/boxerdarstellung.mjs).
import { KACHEL, frei } from '../client/welt.mjs';
import { BOXER, boxerNah } from '../client/boxer.mjs';
import { Fahrzeug } from './verkehr.mjs';
import { turmDrehen, winkelDiff } from './leopard.mjs';
import { ueberrolleZombies, UEBERROLLEN_PAUSE } from './ueberrollen.mjs';
import { WELLE_MAX } from './welle.mjs';

export const BOXER_PLAETZE = 4;
export const BOXER_ID = 'boxer1';
const PX = 8;                                    // Pixel je Meter
export const VMAX = 10 * PX;                     // 10 m/s
export const BESCHLEUNIGUNG = 3.5 * PX;          // px/s²
export const BREMSE = 8.5 * PX;                  // px/s² (ohne Eingabe)
export const DREHRATE = 1.3;                     // rad/s bei Fahrt
export const DREHRATE_STAND = 0.6;               // rad/s im Stand
const RUECKWAERTS = 0.35;                        // Rückwärtsgang: Anteil von VMAX
const TURM_TEMPO = 2.5;                          // rad/s
const ZIEL_TOLERANZ = 10 * Math.PI / 180;
const SCHADEN = 400;
const HORDE_VORNE = [80, 100];                   // Meter vor dem Boxer
const GLOBAL_MAX = 900;                          // so viele Zombies insgesamt höchstens, wenn eine Boxer-Horde erscheint
const FELD_TAKT = 2.5;                           // Sekunden: Ziel der Horde (Wegefeld) nachführen
export const EINST_VORGABE = { boxerHordeSek: 120, boxerHordeMin: 20, boxerHordeMax: 50, boxerSchussPause: 0.25, boxerReichweite: 40 };

// Punkte der Wanne (Längs u, quer v) für die Kollisionsprüfung
const PUNKTE = [];
for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) PUNKTE.push([u * BOXER.laenge / 2, v * BOXER.breite / 2]);
const KOLL_R = 5;

// Wanne an Pose (x, y, w) frei? (Welt `welt`, Punkte mit KOLL_R Spielraum)
export function boxerFrei(welt, x, y, w) {
  const c = Math.cos(w), s = Math.sin(w);
  for (const [u, v] of PUNKTE) if (!frei(welt, x + c * u - s * v, y + s * u + c * v, KOLL_R)) return false;
  return true;
}

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

export class Boxer {
  constructor(raum) {
    this.raum = raum;
    this.id = null; this.f = null;
    this.insassen = [];         // Sitzungs-IDs, der erste fährt
    this.v = 0;                 // Fahrgeschwindigkeit px/s (negativ = rückwärts)
    this.kuehl = 0; this.hordeT = 0; this.ueberT = 0; this.feldT = 0;
    this.horden = [];           // vom Boxer gerufene Horden (Objekte aus welle.horden)
    this.von = { name: 'Boxer', x: 0, y: 0, besiegt: 0 };
    this.letzteEingabe = { dx: 0, dy: 0 };
    this.drehBlock = false;
  }

  einst() { return { ...EINST_VORGABE, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }

  // beim Weltaufbau: im Level Königsdorf (Karte mit Piste) am Flugfeld aufstellen
  start() {
    const r = this.raum;
    if (r.state.karte !== 'koenigsdorf') return;
    const o = boxerStandort(r.welt);
    if (o) this.aufstellen(o.x, o.y, o.w);
  }

  aufstellen(x, y, w = 0) {
    const s = this.raum.state;
    if (this.id) { s.fahrzeuge.delete(this.id); }
    const f = new Fahrzeug();
    f.x = x; f.y = y; f.richtung = w; f.art = 'boxer'; f.farbe = 0; f.haelt = true; f.rauch = false; f.turm = w;
    this.id = BOXER_ID; this.f = f; this.v = 0; this.insassen = [];
    s.fahrzeuge.set(this.id, f);
    return f;
  }

  spieler(sid) { return this.raum.state.spieler.get(sid); }
  istBot(sid) { return !!this.raum.extra.get(sid)?.bot; }
  sitzt(sid) { return this.insassen.includes(sid); }
  get fahrer() { return this.insassen[0] ?? null; }

  // Spieler p steht nah genug zum Einsteigen
  nahGenug(p) { return !!this.f && boxerNah(this.f, p.x, p.y); }

  kannEinsteigen(sid) {
    const p = this.spieler(sid), x = this.raum.extra.get(sid);
    if (!this.f || !p || !x || x.bot || p.anBord || p.imBoxer || p.unten || p.zombie > 0 || p.ebene || p.kamera || p.verbunden === false) return false;
    if (this.raum.state.phase !== 'spiel' || this.insassen.length >= BOXER_PLAETZE) return false;
    return this.nahGenug(p);
  }

  einsteigen(sid) {
    if (!this.kannEinsteigen(sid)) return false;
    const p = this.spieler(sid);
    this.insassen.push(sid);
    p.anBord = true; p.imBoxer = true; p.x = this.f.x; p.y = this.f.y;
    if (this.insassen.length === 1) this.hordeT = 0;   // die erste Horde kommt nach boxerHordeSek Insassen-Zeit
    this.sendeAn(sid, this.fahrer === sid ? '🛡️ Du fährst den Boxer (Gehen-Taste lenkt, E steigt aus). Der Turm schießt von selbst.' : `🛡️ Du sitzt im Boxer – ${this.spieler(this.fahrer)?.name ?? 'jemand'} fährt.`);
    return true;
  }

  // Aussteigen (Aktionstaste/Knopf) – auch während der Fahrt; ohne Fahrer bremst der Boxer bis zum Stand
  aussteigen(sid) {
    if (!this.sitzt(sid)) return false;
    const p = this.spieler(sid), f = this.f;
    this.insassen = this.insassen.filter(i => i !== sid);
    if (!p) return true;
    const q = this.platzNeben();
    p.x = q.x; p.y = q.y; p.anBord = false; p.imBoxer = false; p.ebene = '';
    const x = this.raum.extra.get(sid); if (x) x.schonT = 3;   // 3 s lang beißen Zombies nicht
    if (this.fahrer && !this.istBot(this.fahrer)) this.sendeAn(this.fahrer, '🛡️ Du fährst jetzt den Boxer.');
    return true;
  }

  // freier Platz neben der Wanne (rechts, dann links, dann ringsum)
  platzNeben() {
    const f = this.f, welt = this.raum.welt, r = BOXER.breite / 2 + 16;
    const versuche = [];
    for (const seite of [1, -1]) for (const u of [0, 14, -14, 28, -28]) versuche.push([u, seite * r]);
    for (const [u, v] of versuche) {
      const x = f.x + Math.cos(f.richtung) * u - Math.sin(f.richtung) * v, y = f.y + Math.sin(f.richtung) * u + Math.cos(f.richtung) * v;
      if (frei(welt, x, y, 10)) return { x, y };
    }
    for (let rad = 20; rad <= 200; rad += 20) for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5, x = f.x + Math.cos(a) * (r + rad), y = f.y + Math.sin(a) * (r + rad);
      if (frei(welt, x, y, 10)) return { x, y };
    }
    return { x: f.x, y: f.y + r };
  }

  sendeAn(sid, text) { this.raum.clients?.find(c => c.sessionId === sid)?.send('meldung', { text, lang: true }); }

  // Eingabe des Fahrers (raum.spielerSchritt): { dx, dy } wie beim Gehen
  fahrerEingabe(sid, e) { if (sid === this.fahrer) this.letzteEingabe = { dx: Number(e?.dx) || 0, dy: Number(e?.dy) || 0 }; }

  // ein Takt: Insassen prüfen, fahren, überrollen, schießen, Horde rufen
  schritt(dt) {
    const f = this.f; if (!f) return;
    const r = this.raum, s = r.state;
    // Insassen, die verschwunden sind (Verbindung weg, Superuser-Sprung, Zombie, am Boden), werden herausgenommen
    for (const sid of [...this.insassen]) {
      const p = s.spieler.get(sid);
      if (!p) { this.insassen = this.insassen.filter(i => i !== sid); continue; }
      if (!p.anBord || !p.imBoxer) { this.insassen = this.insassen.filter(i => i !== sid); p.imBoxer = false; continue; }
      if (p.verbunden === false || p.zombie > 0 || p.unten || p.kamera) { this.aussteigen(sid); }
    }
    const fahrer = this.fahrer;
    const e = fahrer && this.letzteEingabe ? this.letzteEingabe : { dx: 0, dy: 0 };
    if (!fahrer) this.letzteEingabe = { dx: 0, dy: 0 };
    this.fahren(e, dt);
    for (const sid of this.insassen) { const p = s.spieler.get(sid); if (p) { p.x = f.x; p.y = f.y; p.richtung = f.richtung; } }
    f.haelt = Math.abs(this.v) < 1;
    // Zombies im Fußabdruck überrollen
    this.ueberT -= dt;
    if (this.ueberT <= 0 && Math.abs(this.v) > 6) {
      this.ueberT = UEBERROLLEN_PAUSE;
      ueberrolleZombies(r, f, BOXER.laenge / 2, BOXER.breite / 2, this.von);
    }
    this.schiessen(dt);
    this.hordeSchritt(dt);
  }

  // Lenken wie bei der Figur: Eingabe {dx, dy} gibt die Wunschrichtung; der Boxer dreht mit begrenzter Rate dorthin und fährt vorwärts
  fahren(e, dt) {
    const f = this.f, welt = this.raum.welt;
    const len = Math.min(1, Math.hypot(e.dx, e.dy));
    let soll = 0;
    if (len > 0.1) {
      const ziel = Math.atan2(e.dy, e.dx), d = winkelDiff(f.richtung, ziel), c = Math.cos(d);
      const rate = DREHRATE_STAND + (DREHRATE - DREHRATE_STAND) * Math.min(1, Math.abs(this.v) / (VMAX * 0.3));
      const schritt = Math.max(-rate * dt, Math.min(rate * dt, d));
      const w = f.richtung + schritt;
      this.drehBlock = false;
      if (Math.abs(schritt) > 1e-6) {
        if (boxerFrei(welt, f.x, f.y, w)) f.richtung = w; else this.drehBlock = true;
      }
      soll = c > 0 ? VMAX * len * c * c : 0;   // quer zur Wunschrichtung: langsam, entgegengesetzt: Stand
      if (this.drehBlock && c < 0.2) soll = -VMAX * RUECKWAERTS * len;   // festgefahren: rückwärts freisetzen
    }
    // Beschleunigen / Bremsen
    if (soll > this.v) this.v = Math.min(soll, this.v + BESCHLEUNIGUNG * dt);
    else this.v = Math.max(soll, this.v - (this.v > 0 ? BREMSE : BESCHLEUNIGUNG) * dt);
    if (Math.abs(this.v) < 0.5 && soll === 0) this.v = 0;
    // Vorrücken in Teilschritten; Hindernis: stehen bleiben
    const weg = this.v * dt, n = Math.max(1, Math.ceil(Math.abs(weg) / 3));
    for (let i = 0; i < n; i++) {
      const nx = f.x + Math.cos(f.richtung) * weg / n, ny = f.y + Math.sin(f.richtung) * weg / n;
      if (!boxerFrei(welt, nx, ny, f.richtung)) { this.v = 0; break; }
      f.x = nx; f.y = ny;
    }
  }

  // Turmmitte (Drehpunkt) in der Welt
  turmPunkt(w = null, vorn = 0, rechts = 0) {
    const f = this.f, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    const px = f.x + c * BOXER.turmX - s * BOXER.turmY, py = f.y + s * BOXER.turmX + c * BOXER.turmY;
    if (w === null) return { x: px, y: py };
    const cw = Math.cos(w), sw = Math.sin(w);
    return { x: px + cw * vorn - sw * rechts, y: py + sw * vorn + cw * rechts };
  }

  // Turm: nächster Zombie in Reichweite; Dauerfeuer, sobald der Turm höchstens 10° danebenliegt. Ohne Insassen: kein Feuer, Turm kehrt nach vorn zurück.
  schiessen(dt) {
    const f = this.f, r = this.raum, s = r.state, e = this.einst();
    this.kuehl -= dt;
    const pv = this.turmPunkt();
    let mz = null;
    if (this.insassen.length) {
      let bd = e.boxerReichweite * PX;
      for (const [id, z] of s.zombies) {
        if (z.ebene || !(z.hp > 0)) continue;
        const d = Math.hypot(z.x - pv.x, z.y - pv.y);
        if (d < bd) { bd = d; mz = [id, z]; }
      }
    }
    const zielW = mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung;
    const nw = turmDrehen(f.turm, zielW, dt, TURM_TEMPO);
    f.turm = Math.atan2(Math.sin(nw), Math.cos(nw));
    if (!mz || this.kuehl > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > ZIEL_TOLERANZ) return;
    this.kuehl = Math.max(0.05, e.boxerSchussPause);
    const m = this.turmPunkt(f.turm, BOXER.muendung, 0);
    const w = Math.atan2(z.y - m.y, z.x - m.x), d = Math.hypot(z.x - m.x, z.y - m.y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: m.x, y1: m.y, x2: m.x + Math.cos(w) * d, y2: m.y + Math.sin(w) * d, w, t: 1, evak: 'boxer', tw: f.turm });
    const vorher = s.besiegt;
    this.von.x = m.x; this.von.y = m.y;
    r.schaden(id, z, Math.max(SCHADEN, z.hp), this.von);
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie Leopard und Bundeswehr)
  }

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
