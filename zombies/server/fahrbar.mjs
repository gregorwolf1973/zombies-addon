// Fahrbare Kampffahrzeuge (Boxer, Puma, Leopard): gemeinsame Logik. Bis zu vier Spieler steigen mit der Aktionstaste ein, der erste fährt
// (Eingabe wie beim Gehen), der Turm schießt von selbst, die Insassen sind unsichtbar und vor Zombies sicher, das Fahrzeug hat keine Lebenspunkte.
// Server ist maßgeblich (Fahren, Kollision, Schießen); der Client zeichnet nur (client/fahrbardarstellung.mjs, client/boxerdarstellung.mjs).
// Es können mehrere Fahrzeuge verschiedener Art gleichzeitig stehen: der Boxer am Flugfeld (server/boxer.mjs, mit Horde) und beliebig viele
// Superuser-/Schießstand-Fahrzeuge (`Fahrbare`, ohne Horde). Die Spielerfelder anBord/imBoxer gelten für alle Arten („sitzt in einem Fahrzeug“).
import { frei, kmhZuPx, sichtfrei, WERTE as W } from '../client/welt.mjs';
import { FAHRBAR, FAHRBAR_EINSTIEG, FAHRBAR_PLAETZE, fahrbarNah } from '../client/fahrbar.mjs';
import { Fahrzeug } from './verkehr.mjs';
import { Leopard, leopardEinst, turmDrehen, winkelDiff } from './leopard.mjs';
import { ueberrolleZombies, UEBERROLLEN_PAUSE } from './ueberrollen.mjs';
import { stammBei, rueckwaerts, RUECK_ANTEIL } from '../client/walze.mjs';

export const PX = 8;                             // Pixel je Meter
export { FAHRBAR_PLAETZE };
// Fahrwerk (je Art überschreibbar); Höchsttempo kommt aus der Einstellung bundeswehr.<art>Tempo (km/h)
export const FAHRWERK = {
  tempoKmh: 60,                                  // Vorgabe, wenn die Einstellung fehlt
  beschleunigung: 7 * PX,                        // px/s² (60 km/h in ~2,4 s)
  bremse: 14 * PX,                               // px/s² (ohne Eingabe)
  drehrate: 1.3,                                 // rad/s bei Fahrt
  drehrateStand: 0.6,                            // rad/s im Stand
  rueckwaerts: RUECK_ANTEIL,                     // Rückwärtsgang: Anteil des Höchsttempos (1/3, client/walze.mjs)
  schrittPx: 2,                                  // Teilschritt der Kollisionsprüfung (px): bei 60 km/h (133 px/s) nie durch Zäune/Wände
};
export const ART = {
  boxer: { tempoEinst: 'boxerTempo', fahrwerk: FAHRWERK },
  puma: { tempoEinst: 'pumaTempo', fahrwerk: { ...FAHRWERK, drehrate: 1.4 } },
  leopard: { tempoEinst: 'leopardTempo', fahrwerk: { ...FAHRWERK, drehrate: 1.1 } },
};
// Einstellungen, die der Rest braucht, falls die Verwaltung sie nicht kennt
export const EINST_BASIS = { boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60, pumaTempo: 60, leopardTempo: 60, pumaPause: 2.5, leopardUeberrollen: true };

const KOLL_R = 5;
const punkteVon = art => {
  const m = FAHRBAR[art], p = [];
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) p.push([u * m.laenge / 2, v * m.breite / 2]);
  return p;
};
const PUNKTE = Object.fromEntries(Object.keys(FAHRBAR).map(a => [a, punkteVon(a)]));

// Wanne der Art an Pose (x, y, w) frei? (Welt `welt`, Punkte mit KOLL_R Spielraum)
export function fahrbarFrei(welt, art, x, y, w) {
  const c = Math.cos(w), s = Math.sin(w);
  for (const [u, v] of PUNKTE[art]) {
    const px = x + c * u - s * v, py = y + s * u + c * v;
    if (!frei(welt, px, py, KOLL_R) || stammBei(welt, px, py, 1)) return false;   // Wände, Zäune, Baumstämme (der Leopard walzt kleine Bäume vorher um, server/walze.mjs)
  }
  return true;
}

const norm = w => Math.atan2(Math.sin(w), Math.cos(w));
const LENK_TAU = 0.5;      // s: Autos drehen mit Abweichung/LENK_TAU (höchstens die Lenkrate) – 30° Abweichung ≈ 60°/s, 5° ≈ 10°/s
const LENK_AUFBAU = 0.3;   // s: so schnell baut sich der Lenkeinschlag auf bzw. ab

export class Fahrbar {
  // opt: { id, besitzer (Sitzungs-ID des Superusers/Spielers, der es gesetzt hat) }
  constructor(raum, art, opt = {}) {
    this.raum = raum; this.art = art; this.m = FAHRBAR[art];
    this.vorgabeId = opt.id ?? `fz_${art}`; this.besitzer = opt.besitzer ?? null;
    this.id = null; this.f = null;
    this.insassen = [];         // Sitzungs-IDs, der erste fährt
    this.v = 0;                 // Fahrgeschwindigkeit px/s (negativ = rückwärts)
    this.kuehl = 0; this.ueberT = 0;
    this.von = { name: this.m.name, x: 0, y: 0, besiegt: 0 };
    this.letzteEingabe = { dx: 0, dy: 0 };
    this.drehBlock = false;
  }

  get fahrwerkBasis() { return ART[this.art].fahrwerk; }
  fahrwerk() {
    const b = this.fahrwerkBasis, kmh = Number(this.einst()[ART[this.art].tempoEinst]);
    return { ...b, vmax: kmhZuPx(Number.isFinite(kmh) && kmh > 0 ? kmh : b.tempoKmh) };
  }
  einst() { return { ...EINST_BASIS, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  frei(welt, x, y, w) { return fahrbarFrei(welt, this.art, x, y, w); }
  // Schützen dieses Fahrzeugs (Objekte, die raum.schaden als „von“ bekommt)
  get schuetzen() { return [this.von]; }

  aufstellen(x, y, w = 0) {
    const s = this.raum.state;
    if (this.id) s.fahrzeuge.delete(this.id);
    const f = new Fahrzeug();
    f.x = x; f.y = y; f.richtung = w; f.art = this.art; f.farbe = 0; f.haelt = true; f.rauch = false; f.turm = w;
    this.id = this.vorgabeId; this.f = f; this.v = 0; this.insassen = [];
    s.fahrzeuge.set(this.id, f);
    return f;
  }

  // Fahrzeug abbauen: alle Insassen steigen aus, das Fahrzeug verschwindet
  abbauen() {
    for (const sid of [...this.insassen]) this.aussteigen(sid);
    if (this.id) this.raum.state.fahrzeuge.delete(this.id);
    this.id = null; this.f = null;
  }

  spieler(sid) { return this.raum.state.spieler.get(sid); }
  istBot(sid) { return !!this.raum.extra.get(sid)?.bot; }
  sitzt(sid) { return this.insassen.includes(sid); }
  get fahrer() { return this.insassen[0] ?? null; }

  nahGenug(p) { return !!this.f && fahrbarNah(this.art, this.f, p.x, p.y); }

  kannEinsteigen(sid) {
    const p = this.spieler(sid), x = this.raum.extra.get(sid);
    if (!this.f || !p || !x || x.bot || p.anBord || p.imBoxer || p.unten || p.zombie > 0 || p.ebene || p.kamera || p.verbunden === false) return false;
    if (this.raum.state.phase !== 'spiel' || this.insassen.length >= FAHRBAR_PLAETZE) return false;
    return this.nahGenug(p);
  }

  einsteigen(sid) {
    if (!this.kannEinsteigen(sid)) return false;
    const p = this.spieler(sid), n = this.m.name;
    this.insassen.push(sid);
    p.anBord = true; p.imBoxer = true; p.x = this.f.x; p.y = this.f.y;
    this.eingestiegen(sid);
    this.sendeAn(sid, this.fahrer === sid ? `🛡️ Du fährst den ${n} (Gehen-Taste lenkt, E steigt aus). Der Turm schießt von selbst.` : `🛡️ Du sitzt im ${n} – ${this.spieler(this.fahrer)?.name ?? 'jemand'} fährt.`);
    return true;
  }
  eingestiegen() {}   // Haken für Unterklassen (Boxer: Hordenuhr)

  // Aussteigen (Aktionstaste/Knopf) – auch während der Fahrt; ohne Fahrer bremst das Fahrzeug bis zum Stand
  aussteigen(sid) {
    if (!this.sitzt(sid)) return false;
    const p = this.spieler(sid);
    this.insassen = this.insassen.filter(i => i !== sid);
    if (!p) return true;
    const q = this.platzNeben();
    p.x = q.x; p.y = q.y; p.anBord = false; p.imBoxer = false; p.ebene = '';
    const x = this.raum.extra.get(sid); if (x) x.schonT = 3;   // 3 s lang beißen Zombies nicht
    if (this.fahrer && !this.istBot(this.fahrer)) this.sendeAn(this.fahrer, `🛡️ Du fährst jetzt den ${this.m.name}.`);
    return true;
  }

  // freier Platz neben der Wanne (rechts, dann links, dann ringsum)
  platzNeben() {
    const f = this.f, welt = this.raum.welt, r = this.m.breite / 2 + 16;
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

  // ein Takt: Insassen prüfen, fahren, überrollen, schießen
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
    this.ueberAuto = r.walze?.autoFaktor(this) ?? 1;   // Puma/Boxer über geparkten Autos langsamer (server/walze.mjs)
    this.fahren(e, dt);
    for (const sid of this.insassen) { const p = s.spieler.get(sid); if (p) { p.x = f.x; p.y = f.y; p.richtung = f.richtung; } }
    f.haelt = Math.abs(this.v) < 1;
    // Zombies im Fußabdruck überrollen
    this.ueberT -= dt;
    if (this.ueberT <= 0 && Math.abs(this.v) > 6) {
      this.ueberT = UEBERROLLEN_PAUSE;
      ueberrolleZombies(r, f, this.m.laenge / 2, this.m.breite / 2, this.von);
    }
    // Motorlärm lockt Zombies (alle 1,5 s; wie bei den Autos, server/pkw.mjs: mindestens so weit wie ein rennender Spieler, je schneller desto weiter)
    this.laermUhr = (this.laermUhr ?? 0) - dt;
    if (this.laermUhr <= 0 && Math.abs(this.v) > 10) { this.laermUhr = 1.5; r.laerm(f.x, f.y, Math.max(W.hoerweiteRennen ?? 110, 160 + Math.abs(this.v)), true, ''); }
    this.schiessen(dt);
    this.hordeSchritt?.(dt);
  }

  // Lenken wie bei der Figur: Eingabe {dx, dy} gibt die Wunschrichtung; das Fahrzeug dreht mit begrenzter Rate dorthin und fährt vorwärts.
  // Liegt die Wunschrichtung mehr als ~135° hinter der Achse (Skalarprodukt, client/walze.mjs rueckwaerts), fährt es rückwärts (höchstens 1/3 Tempo)
  // und lenkt wie im Rückwärtsgang: das Heck dreht zur Wunschrichtung. Zäune/Hecken/Bäume/Autos unter der Wanne: server/walze.mjs (raum.walze).
  fahren(e, dt) {
    const f = this.f, welt = this.raum.welt, fw = this.fahrwerk(), VM = fw.vmax * (this.ueberAuto ?? 1);
    const roh = Math.hypot(e.dx, e.dy), len = Math.min(1, roh);
    let soll = 0;
    this.rueck = false;
    if (len > 0.1) {
      const hx = Math.cos(f.richtung), hy = Math.sin(f.richtung), ux = e.dx / roh, uy = e.dy / roh;
      const rueck = this.rueck = rueckwaerts(hx * ux + hy * uy, this.v);
      const ziel = rueck ? Math.atan2(-uy, -ux) : Math.atan2(uy, ux), d = winkelDiff(f.richtung, ziel), c = Math.cos(d);
      let rate = fw.drehrateStand + (fw.drehrate - fw.drehrateStand) * Math.min(1, Math.abs(this.v) / (VM * 0.3));
      if (fw.drehrateVmax !== undefined) { const t = Math.max(0, Math.min(1, (Math.abs(this.v) / VM - 0.5) / 0.5)); rate += (fw.drehrateVmax - rate) * t; }   // Autos: bei hohem Tempo weicher lenken
      let schritt = Math.max(-rate * dt, Math.min(rate * dt, d));
      if (fw.drehrateVmax !== undefined) {   // Autos: weich lenken – Drehrate wächst mit der Abweichung (kleine Stickbewegung = kleiner Einschlag) und baut sich in ~0,3 s auf
        const zielRate = Math.max(-rate, Math.min(rate, d / LENK_TAU));
        this.lenkW = (this.lenkW ?? 0) + (zielRate - (this.lenkW ?? 0)) * Math.min(1, dt / LENK_AUFBAU);
        schritt = Math.abs(this.lenkW * dt) > Math.abs(d) ? d : this.lenkW * dt;
      }
      const w = f.richtung + schritt;
      this.drehBlock = false;
      if (Math.abs(schritt) > 1e-6) {
        this.raum.walze?.walzen(this, f.x, f.y, w);
        if (this.frei(welt, f.x, f.y, w)) f.richtung = w; else this.drehBlock = true;
      }
      if (rueck) soll = c > 0 ? -VM * fw.rueckwaerts * len * c * c : 0;
      else {
        soll = c > 0 ? VM * len * c * c : 0;   // quer zur Wunschrichtung: langsam
        if (this.drehBlock && c < 0.2) soll = -VM * fw.rueckwaerts * len;   // festgefahren: rückwärts freisetzen
      }
    }
    if (len <= 0.1) this.lenkW = 0;
    // Beschleunigen / Bremsen
    if (soll > this.v) this.v = Math.min(soll, this.v + (this.v < 0 ? fw.bremse : fw.beschleunigung) * dt);
    else this.v = Math.max(soll, this.v - (this.v > 0 ? fw.bremse : fw.beschleunigung) * dt);
    if (Math.abs(this.v) < 0.5 && soll === 0) this.v = 0;
    this.v = Math.max(-VM * fw.rueckwaerts, Math.min(VM, this.v));   // über einem geparkten Auto sofort langsam (Puma 40 %, Boxer 30 %)
    // Vorrücken in kleinen Teilschritten; Hindernis: stehen bleiben
    const weg = this.v * dt, n = Math.max(1, Math.ceil(Math.abs(weg) / fw.schrittPx));
    for (let i = 0; i < n; i++) {
      const nx = f.x + Math.cos(f.richtung) * weg / n, ny = f.y + Math.sin(f.richtung) * weg / n;
      this.raum.walze?.walzen(this, nx, ny, f.richtung);
      if (!this.frei(welt, nx, ny, f.richtung)) { this.v = 0; break; }
      f.x = nx; f.y = ny;
    }
  }

  // Turmmitte (Drehpunkt) in der Welt; mit Winkel w: Punkt `vorn`/`rechts` im Turmrahmen
  turmPunkt(w = null, vorn = 0, rechts = 0) {
    const f = this.f, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    const px = f.x + c * this.m.turmX - s * this.m.turmY, py = f.y + s * this.m.turmX + c * this.m.turmY;
    if (w === null) return { x: px, y: py };
    const cw = Math.cos(w), sw = Math.sin(w);
    return { x: px + cw * vorn - sw * rechts, y: py + sw * vorn + cw * rechts };
  }

  // nächster lebender Zombie draußen innerhalb `reichweite` px um den Turm, als [id, z] oder null
  naechsterZombie(pv, reichweite) {
    let mz = null, bd = reichweite;
    for (const [id, z] of this.raum.state.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - pv.x, z.y - pv.y);
      if (d < bd && sichtfrei(this.raum.welt, pv.x, pv.y, z.x, z.y)) { bd = d; mz = [id, z]; }   // nur mit freier Sichtlinie (keine Hauswand dazwischen)
    }
    return mz;
  }

  schiessen() {}   // Unterklassen
}

// ---------- Boxer-Turm: Dauerfeuer ----------
const BOXER_TURM_TEMPO = 2.5;                    // rad/s
const ZIEL_TOLERANZ = 10 * Math.PI / 180;
const BOXER_SCHADEN = 400;
export class FahrbarBoxer extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'boxer', opt); }

  // Turm: nächster Zombie in Reichweite; Dauerfeuer, sobald der Turm höchstens 10° danebenliegt. Ohne Insassen: kein Feuer, Turm kehrt nach vorn zurück.
  schiessen(dt) {
    const f = this.f, r = this.raum, s = r.state, e = this.einst();
    this.kuehl -= dt;
    const pv = this.turmPunkt();
    const mz = this.insassen.length ? this.naechsterZombie(pv, e.boxerReichweite * PX) : null;
    const zielW = mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung;
    f.turm = norm(turmDrehen(f.turm, zielW, dt, BOXER_TURM_TEMPO));
    if (!mz || this.kuehl > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > ZIEL_TOLERANZ) return;
    this.kuehl = Math.max(0.05, e.boxerSchussPause);
    const m = this.turmPunkt(f.turm, this.m.muendung, 0);
    const w = Math.atan2(z.y - m.y, z.x - m.x), d = Math.hypot(z.x - m.x, z.y - m.y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: m.x, y1: m.y, x2: m.x + Math.cos(w) * d, y2: m.y + Math.sin(w) * d, w, t: 1, evak: 'boxer', tw: f.turm });
    const vorher = s.besiegt;
    this.von.x = m.x; this.von.y = m.y;
    r.schaden(id, z, Math.max(BOXER_SCHADEN, z.hp), this.von);
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie Leopard und Bundeswehr)
  }
}

// ---------- Puma: 30-mm-Maschinenkanone (Werte wie der Puma im Bundeswehr-Lager, server/stuetzpunkt.mjs) ----------
export const PUMA_WAFFE = { reichweite: 60, turmTempo: 2.4, tolerance: 0.06, schaden: 100, flaeche: 60, radius: 30, streu: 14 };
export class FahrbarPuma extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'puma', opt); }

  schiessen(dt) {
    const f = this.f, r = this.raum, s = r.state, e = this.einst(), W = PUMA_WAFFE;
    this.kuehl -= dt;
    const pv = this.turmPunkt();
    const mz = this.insassen.length ? this.naechsterZombie(pv, W.reichweite * PX) : null;
    const zielW = mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung;
    f.turm = norm(turmDrehen(f.turm, zielW, dt, W.turmTempo));
    if (!mz || this.kuehl > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > W.tolerance) return;
    this.kuehl = Math.max(0.1, e.pumaPause);
    const m = this.turmPunkt(f.turm, this.m.muendung, 0);
    const ix = z.x + (r.rnd() - 0.5) * W.streu, iy = z.y + (r.rnd() - 0.5) * W.streu;   // meist genau das Ziel, manchmal etwas daneben
    r.broadcast('bwschuss', { art: 'kanone', n: -1, x1: m.x, y1: m.y, x2: ix, y2: iy, w: f.turm, t: 1, evak: 'puma', tw: f.turm });
    const vorher = s.besiegt;
    this.von.x = m.x; this.von.y = m.y;
    r.schaden(id, z, W.schaden, this.von);
    for (const [qid, q] of [...s.zombies]) {
      if (qid === id || q.ebene || !(q.hp > 0) || Math.hypot(q.x - ix, q.y - iy) > W.radius || !sichtfrei(r.welt, ix, iy, q.x, q.y)) continue;   // Wände schirmen den Flächenschaden ab
      r.schaden(qid, q, W.flaeche, this.von);
    }
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler
  }
}

// ---------- Leopard 2A7: Lader-MG und Hauptkanone (server/leopard.mjs, inkl. Rauchkegel und Druckwelle) ----------
// Entscheidung: Die Kanone feuert automatisch wie der Boxer-Turm (Haufensuche, Sicherheitsradius um den Einschlag, Pause leopardKanonePause);
// ein eigener Feuerknopf würde auf dem Handy die Lenkung stören, und die Sicherheitsprüfung (nie auf Spieler/Menschen) bleibt so immer aktiv.
export class FahrbarLeopard extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'leopard', opt); this.leopard = new Leopard(raum, 'Leopard'); }
  get schuetzen() { return [this.von, this.leopard.schuetze].filter(Boolean); }

  aufstellen(x, y, w = 0) { const f = super.aufstellen(x, y, w); this.leopard.fahrzeug = f; return f; }

  schiessen(dt) {
    const f = this.f, bw = this.einst();
    if (this.insassen.length) { this.leopard.schritt(f, dt, leopardEinst(bw, 0.8)); return; }
    f.turm = norm(turmDrehen(f.turm, f.richtung, dt));   // ohne Insassen: kein Feuer, Turm kehrt nach vorn zurück
    this.leopard.kz = null;
  }
}

export const KLASSEN = { boxer: FahrbarBoxer, puma: FahrbarPuma, leopard: FahrbarLeopard };

// ---------- Verwaltung mehrerer Fahrzeuge ----------
// Der Boxer am Flugfeld (raum.boxer) gehört nicht dazu, wird aber überall mitgezählt (`alle()`); hier leben die Fahrzeuge,
// die ein Superuser oder der Schießstand aufstellt (`liste`, je Besitzer höchstens eins).
export class Fahrbare {
  constructor(raum) { this.raum = raum; this.liste = []; this.zaehler = 0; }

  alle() { return [this.raum.boxer, ...this.liste].filter(b => b?.f); }
  von(sid) { return this.alle().find(b => b.sitzt(sid)) ?? null; }
  // Versuch, in ein Fahrzeug in Reichweite einzusteigen
  einsteigen(sid) { for (const b of this.alle()) if (b.einsteigen(sid)) return true; return false; }
  aussteigen(sid) { return this.von(sid)?.aussteigen(sid) ?? false; }
  fahrerEingabe(sid, e) { this.von(sid)?.fahrerEingabe(sid, e); }
  schritt(dt) {
    this.raum.boxer?.schritt(dt);
    // Fahrzeug, dessen Besitzer gegangen ist und das leer steht: verschwindet
    for (const b of [...this.liste]) if (!b.insassen.length && b.besitzer && !this.raum.state.spieler.has(b.besitzer)) this.entfernen(b.besitzer);
    for (const b of this.liste) b.schritt(dt);
  }
  schuetzen() { return this.alle().flatMap(b => b.schuetzen); }

  vonBesitzer(besitzer) { return this.liste.find(b => b.besitzer === besitzer) ?? null; }

  // Fahrzeug des Besitzers entfernen (Insassen steigen aus); true, wenn eins da war
  entfernen(besitzer) {
    const b = this.vonBesitzer(besitzer);
    if (!b) return false;
    b.abbauen();
    this.liste = this.liste.filter(q => q !== b);
    return true;
  }

  // freie Pose neben (px, py) in Blickrichtung w: Wanne daneben, Spieler steht an der Seite (zum Einsteigen in Reichweite)
  platzNeben(art, px, py, w) {
    const welt = this.raum.welt, m = FAHRBAR[art], versuche = [];
    const quer = m.breite / 2 + 12, vorn = m.laenge / 2 + 10;
    for (const seite of [1, -1]) for (const dw of [0, Math.PI]) for (const u of [0, 14, -14]) versuche.push([w + dw, u, seite * quer]);
    for (const seite of [1, -1]) for (const dw of [Math.PI / 2, -Math.PI / 2]) versuche.push([w + dw, 0, seite * quer]);
    for (const [fw, u, v] of versuche) {
      const c = Math.cos(w), s = Math.sin(w);
      const x = px + c * u - s * v, y = py + s * u + c * v;   // Mittelpunkt: neben dem Spieler (in dessen Blickrichtung versetzt)
      if (this.pose(art, x, y, fw)) return { x, y, w: fw };
    }
    // weiter weg: Ring um den Spieler (zu Fuß erreichbar)
    for (let rad = vorn; rad <= vorn + 120; rad += 16) for (let k = 0; k < 16; k++) {
      const a = w + k * Math.PI / 8, x = px + Math.cos(a) * rad, y = py + Math.sin(a) * rad;
      for (const fw of [w, a + Math.PI / 2]) if (this.pose(art, x, y, fw)) return { x, y, w: fw };
    }
    return null;
  }
  pose(art, x, y, w) {
    if (!fahrbarFrei(this.raum.welt, art, x, y, w)) return false;
    for (const b of this.alle()) if (Math.hypot(b.f.x - x, b.f.y - y) < ((b.m?.laenge ?? 36) + FAHRBAR[art].laenge) / 2 * 0.8) return false;   // nicht in ein anderes Fahrzeug (auch Autos, server/pkw.mjs)
    return true;
  }

  // Fahrzeug der Art für `besitzer` neben der Figur p aufstellen (ersetzt ein früheres desselben Besitzers); null = kein Platz
  setzen(besitzer, art, p) {
    const K = KLASSEN[art];
    if (!K) return null;
    this.entfernen(besitzer);
    const pos = this.platzNeben(art, p.x, p.y, Number.isFinite(p.richtung) ? p.richtung : 0);
    if (!pos) return null;
    const b = new K(this.raum, { id: `fz_${art}_${++this.zaehler}`, besitzer });
    b.aufstellen(pos.x, pos.y, pos.w);
    this.liste.push(b);
    return b;
  }
}
