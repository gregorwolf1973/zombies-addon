// Bundeswehr-Stützpunkt, Verhalten (Aufbau und Grafik: client/stuetzpunkt.mjs):
// MG-Nester und Puma schießen auf Zombies draußen, Ärzte heilen, Ärzte und Soldaten handeln, nach N Spieltagen fällt das Lager.
// Zustand in state.stuetzpunkt: '' = kein Stützpunkt auf der Karte, 'steht', 'gefallen' (wird mit der Welt gespeichert) oder
// 'aus' (Schalter „Stützpunkt aktiv“ aus: Figuren weg, nichts schießt, kein Handel – ohne Zombies und ohne Fall).
import { entferne, fuegeHinzu, kannAufnehmen, blockGrund } from '../client/stapel.mjs';
import { KACHEL, WAFFEN, sichtfrei, HANDEL, HANDEL_ABSTAND, HANDEL_RAETSEL, bezahlung, MUNITION_MAX, DINGE } from '../client/welt.mjs';
import { imLager, planKoord, handelPartner, zeltWandImWeg, rahmen, fahrFlaeche, FAHR_SCHRITT, PUMA_PARK, SP_BREITE, SP_TIEFE } from '../client/stuetzpunkt.mjs';

export const MG_REICHWEITE = 45 * 8;       // 45 m (8 px je Meter)
export const PUMA_REICHWEITE = 60 * 8;     // 60 m
export const SOLDAT_REICHWEITE = 35 * 8;   // Soldaten an ihren Posten: Gewehr, 35 m
const SOLDAT_PAUSE = 1.3, SOLDAT_SCHADEN = 100, SOLDAT_TREFFER = 0.75, SOLDAT_LAERM = 380;
export const MG_SCHADEN = WAFFEN.gewehr.schaden;   // MG-Nester treffen wie bisher mit Gewehrschaden; wirksam ist die Einstellung waffen.gewehr.schaden
const SALVE = 3, SALVE_TAKT = 0.15, SALVE_PAUSE = 1.1;   // kurze Feuerstöße: 3 Schuss, dann gut eine Sekunde Pause
const PUMA_PAUSE = 3.5, PUMA_DREH = 2.4;        // alle 3,5 s ein Schuss; Turm dreht 2,4 rad/s
// Puma fährt frei im Innenbereich des Lagers (Fahrfläche: fahrFlaeche in client/stuetzpunkt.mjs, Mitte mit Abstand zu Draht, Sandsäcken,
// Zelten, Fahrzeugen, MG-Nestern und der Einfahrt). Ziel ist der Hotspot: die Zelle (96 px) mit den meisten Zombies im Umkreis von
// 600 px um das Lager, auf allen Seiten. Ohne Zombies parkt er in der Lagermitte. Liegt das Ziel hinter ihm, fährt er rückwärts.
const HOT_ZELLE = 96, HOT_RADIUS = 600, HOT_NAH = 4;   // px, px, Kacheln (näher als das muss er nicht heran)
const PUMA_STREIFE = 0.8, PUMA_JAGD = 1.5, PUMA_RUECK = 1.0, PUMA_WENDE = 1.4;   // Kacheln/s Parken, Angriff, Rückwärts; rad/s Wannendrehung
const KANONE_SCHADEN = 100, KANONE_FLAECHE = 60, KANONE_RADIUS = 30;
const MG_LAERM = 520, PUMA_LAERM = 760;
// Munition: jedes MG-Nest und der Puma haben einen Vorrat (Einstellung bundeswehr.mgMunition / pumaMunition, 0 = unbegrenzt). Ist er leer,
// schweigt die Waffe; dann holen zwei Soldaten Nachschub vom Bundeswehr-Container (bw_container) und füllen sie wieder auf.
export const MG_MUNITION = 400, PUMA_MUNITION = 200;
const NACHSCHUB_WARTEN = 4, NACHSCHUB_SOLDATEN = 2;   // Sekunden am Container, Zahl der Träger
const HEILEN_PRO_SEK = 2;
const SCAN_TAKT = 0.25;
const TAU = Math.PI * 2;
// Soldaten: sterben durch Zombies im Nahkampf, laufen bei Angriffen zum Hotspot (mindestens die Hälfte, mindestens 2 bleiben auf Wache)
const SOLDAT_HP = 100, SOLDAT_BISS = 26, SOLDAT_NAHSCHADEN = 18;   // Leben, Abstand (px) und Schaden je Zombie und Sekunde
const SOLDAT_TEMPO = 1.7, HOT_MIN = 3, HOT_RUHE = 12, WACHE_MIN = 2;   // Kacheln/s; Zombies im Hotspot; Sekunden ohne Hotspot bis zum Rückweg
const KAMPF_RUHE = 8, KAMPF_RUHE_STREU = 7, DECKUNG_WEITE = 44, DECKUNG_TAKT = 3.5;   // Sekunden ohne Ziel (+ 0..7 je Soldat) bis zum Rückweg; Ausweichweite (px) und Takt im Kampf

const diffWinkel = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

const RUF_WEITE = 120;   // px vor dem Zaun, ab denen ein Spieler angerufen wird
export class Stuetzpunkt {
  constructor(raum) {
    this.raum = raum;
    this.nester = [];
    this.puma = null;
    this.trefferChance = 0.8;     // Anteil der MG-Schüsse, die treffen (Tests setzen 1)
    this.schuetze = { name: 'Bundeswehr', x: 0, y: 0, besiegt: 0 };   // „von“ für raum.schaden()
  }

  get sp() { return this.raum.welt.stuetzpunkt; }
  einst() { return { aktiv: true, falltage: 3, mgMunition: MG_MUNITION, pumaMunition: PUMA_MUNITION, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  steht() { return this.raum.state.stuetzpunkt === 'steht'; }

  // Spieltage seit Weltbeginn (state.zeit zählt Sekunden Spielzeit, ein Spieltag = tagMinuten echte Minuten)
  spieltage() { return this.raum.state.zeit / ((this.raum.einstellungen?.()?.tagMinuten || 48) * 60); }

  // beim Aufbau der Welt: Zustand aus dem Speicher (nur wenn er zur Welt passt)
  start(stand, passt) {
    const s = this.raum.state, sp = this.sp;
    s.stuetzpunkt = ''; s.bwTurm = 0;
    this.nachschub = null;
    this.nester = []; this.puma = null; this.schuetzen = []; this.sHot = { hotZelle: null }; this.hotT = 0; this.ruheT = 0; this.sendT = 0; this.nahT = 0; this.rufUhr = 0; this.rufSp = new Map(); this.rufZombie = 0;
    if (!sp) return;
    sp.teile.forEach((t, n) => {
      if (t.art === 'mgnest') this.nester.push({ n, x: t.x, y: t.y, blick: t.blick, kuehl: 0, salve: 0, takt: 0, scan: 0, ziel: null, muni: this.einst().mgMunition });
      else if (t.art === 'puma') this.puma = { n, x: t.turm.x, y: t.turm.y, muni: this.einst().pumaMunition, kuehl: PUMA_PAUSE / 2, scan: 0, ziel: null, u: planKoord(sp, t.x, t.y).u, v: planKoord(sp, t.x, t.y).v, weg: [], hot: null, hotZelle: null, scanU: 0, rueckwaerts: false };
      // jeder Soldat an seinem Posten schießt mit (er bleibt dabei stehen)
      else if (t.art === 'posten' && t.rolle === 'soldat') this.schuetzen.push({ n, x: t.x, y: t.y, hx: t.x, hy: t.y, blick: t.blick ?? 0, w0: t.blick ?? 0, hp: SOLDAT_HP, tot: false, modus: 'post', weg: [], kuehl: 0.5 + (n % 5) * 0.2, scan: 0, ziel: null, kampfT: 99, deckT: DECKUNG_TAKT + (n % 4) });
    });
    if (this.puma) { const pt = sp.teile[this.puma.n]; s.bwTurm = pt.turm.winkel; s.bwX = pt.x; s.bwY = pt.y; s.bwW = pt.winkel; }
    // Munitionsvorrat aus dem Speicher (nur bei passender Welt; höchstens der aktuelle Höchstvorrat)
    const m = passt ? stand?.stuetzpunktMuni : null;
    if (m && typeof m === 'object') {
      const gueltig = (w, max) => Number.isFinite(w) ? Math.max(0, max > 0 ? Math.min(Math.round(w), max) : Math.round(w)) : null;
      for (const nest of this.nester) { const w = gueltig(m.mg?.[nest.n], this.einst().mgMunition); if (w !== null) nest.muni = w; }
      if (this.puma) { const w = gueltig(m.puma, this.einst().pumaMunition); if (w !== null) this.puma.muni = w; }
    }
    s.stuetzpunkt = passt && stand?.stuetzpunkt === 'gefallen' ? 'gefallen' : 'steht';
    if (s.stuetzpunkt === 'gefallen') this.zombiesErzeugen();
    else if (!this.einst().aktiv) s.stuetzpunkt = 'aus';
  }

  // Munitionsvorrat: { mg: { teilNr: Munition }, puma }
  muniSpeichern() {
    const mg = {};
    for (const n of this.nester) mg[n.n] = Math.max(0, Math.round(n.muni));
    return { mg, puma: this.puma ? Math.max(0, Math.round(this.puma.muni)) : null };
  }

  speichern() { return this.raum.state.stuetzpunkt === 'gefallen' ? 'gefallen' : this.sp ? 'steht' : ''; }

  schritt(dt) {
    const s = this.raum.state;
    if (!this.sp || !s.stuetzpunkt) return;
    const aktiv = this.einst().aktiv;
    if (s.stuetzpunkt === 'aus' && aktiv) s.stuetzpunkt = 'steht';
    else if (s.stuetzpunkt === 'steht' && !aktiv) s.stuetzpunkt = 'aus';
    if (s.stuetzpunkt !== 'steht') return;
    const tage = this.einst().falltage;
    if (tage > 0 && !this.keinZeitFall && this.spieltage() >= tage) return this.faellt();
    this.verteidigen(dt);
    this.soldatenLeben(dt);
    // alle Soldaten tot: das Lager ist verloren (gleicher Fall wie nach N Tagen, nur früher)
    if (s.stuetzpunkt === 'steht' && this.schuetzen.length && this.schuetzen.every(q => q.tot)) return this.faellt('Alle Soldaten sind gefallen');
    this.heilen(dt);
  }

  // ---------- Fall ----------
  faellt(grund = '') {
    const r = this.raum;
    r.state.stuetzpunkt = 'gefallen';
    this.zombiesErzeugen();
    r.broadcast('meldung', { text: `📻 ${grund ? grund + ' – d' : 'D'}er Bundeswehr-Stützpunkt ist gefallen! Soldaten, Ärzte und Verwundete sind verloren – in den Zelten und hinter dem Draht lauern jetzt Zombies. Die Kisten sind noch voll.`, lang: true });
    r.speichereWelt?.();
  }

  // an jedem Posten (Soldaten, MG-Nester, Ärzte, Verwundete) steht ein Zombie auf; sie bleiben und zählen nicht zum Soll
  zombiesErzeugen() {
    const r = this.raum, sp = this.sp;
    let i = 0;
    this.fallIds = [];
    for (const t of sp.teile) {
      let x, y;
      if (t.art === 'mgnest') { x = t.x - Math.cos(t.blick) * 5; y = t.y - Math.sin(t.blick) * 5; }
      else if (t.art === 'posten' && ['soldat', 'arzt', 'verwundet'].includes(t.rolle)) { x = t.x; y = t.y; }
      else continue;
      const platz = r.freierPlatz({ x, y }, i++);
      const id = r.setzeZombie(platz.x, platz.y, '');
      const info = r.zombieInfo.get(id);
      info.bleibt = true; info.schlaeft = false; info.steht = false;
      this.fallIds.push(id);
    }
  }

  // Testbefehl (Superuser): gefallenes Lager wieder aufbauen – Zombies des Falls weg, Soldaten/Munition neu, kein Fall nach Zeit mehr
  aufbauen() {
    const r = this.raum;
    for (const id of this.fallIds ?? []) { r.state.zombies.delete(id); r.zombieInfo.delete(id); }
    this.fallIds = [];
    this.start(null, false);
    this.keinZeitFall = true;
    r.broadcast('meldung', { text: '📻 Der Bundeswehr-Stützpunkt ist wieder besetzt.', lang: true });
    r.speichereWelt?.();
  }

  // ---------- Verteidigung ----------
  // Ziele: alle Zombies draußen in Reichweite – vor dem Draht und auch die, die schon ins Lager gelangt sind
  draussen(z) { return !(z.ebene ?? ''); }

  // Sicht für Schüsse: Häuser/Bäume (Kacheln) und Zeltwände verdecken
  sicht(x1, y1, x2, y2) { return sichtfrei(this.raum.welt, x1, y1, x2, y2) && !zeltWandImWeg(this.sp, x1, y1, x2, y2); }

  // bester Zombie: zuerst die im Lager, dann vor und an der Sperrlinie (v < 4), sonst der nächste; nur draußen und mit freier Sicht
  waehleZiel(x, y, reichweite) {
    const kand = [];
    for (const [id, z] of this.raum.state.zombies) {
      if (z.ebene) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d > reichweite || !this.draussen(z)) continue;
      kand.push({ id, z, wert: d - (imLager(this.sp, z.x, z.y) ? 200 : this.vorDerLinie(z) ? 90 : 0) });
    }
    kand.sort((a, b) => a.wert - b.wert);
    for (const k of kand.slice(0, 8)) if (this.sicht(x, y, k.z.x, k.z.y)) return k.id;
    return null;
  }
  // v < 4: vor dem Draht oder dicht dahinter (Bauplan-Rahmen, Kacheln von der Front nach hinten)
  vorDerLinie(z) { return planKoord(this.sp, z.x, z.y).v < 4; }

  gueltig(id, x, y, reichweite) {
    const z = id && this.raum.state.zombies.get(id);
    return z && !z.ebene && z.hp > 0 && Math.hypot(z.x - x, z.y - y) <= reichweite && this.draussen(z) && this.sicht(x, y, z.x, z.y) ? z : null;
  }

  verteidigen(dt) {
    for (const nest of this.nester) this.nestSchritt(nest, dt);
    if (this.puma) this.pumaSchritt(this.puma, dt);
    for (const sch of this.schuetzen) this.soldatSchritt(sch, dt);
  }

  // Soldat am Posten: Einzelschüsse mit dem Gewehr auf Zombies in der Nähe
  soldatSchritt(sch, dt) {
    const r = this.raum;
    if (sch.tot) return;
    sch.kampfT += dt;
    if (sch.weg.length) return;   // Laufende schießen nicht
    sch.kuehl = Math.max(0, sch.kuehl - dt);
    let z = this.gueltig(sch.ziel, sch.x, sch.y, SOLDAT_REICHWEITE);
    if (!z) {
      sch.scan -= dt;
      if (sch.scan > 0) { this.deckungSuchen(sch, dt); return; }
      sch.scan = SCAN_TAKT;
      sch.ziel = this.waehleZiel(sch.x, sch.y, SOLDAT_REICHWEITE);
      z = this.gueltig(sch.ziel, sch.x, sch.y, SOLDAT_REICHWEITE);
      if (!z) { this.deckungSuchen(sch, dt); return; }
    }
    // im Kampf: in Stellung bleiben, zum Ziel ausrichten und gelegentlich einen Schritt zur Seite (Deckung) machen
    sch.kampfT = 0;
    sch.blick = Math.atan2(z.y - sch.y, z.x - sch.x);
    this.sendT = Math.min(this.sendT, 0.2);
    if (this.deckungSuchen(sch, dt)) return;
    if (sch.kuehl > 0) return;
    sch.kuehl = SOLDAT_PAUSE * (0.85 + r.rnd() * 0.3);
    const treffer = r.rnd() < SOLDAT_TREFFER;
    const w = Math.atan2(z.y - sch.y, z.x - sch.x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - sch.x, z.y - sch.y);
    r.broadcast('bwschuss', { art: 'gewehr', n: sch.n, x1: sch.x, y1: sch.y, x2: sch.x + Math.cos(w) * d, y2: sch.y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) this.treffen(sch.ziel, z, SOLDAT_SCHADEN, sch);
    r.laerm(sch.x, sch.y, SOLDAT_LAERM, true, '');
  }

  // kurz im Kampf (Ziel gesehen in den letzten Sekunden): alle paar Sekunden einen kleinen Schritt in der Nähe des Postens, true = läuft los
  deckungSuchen(sch, dt) {
    if (sch.kampfT > 4 || sch.modus === 'zurueck' || sch.modus === 'nachschub') return false;
    sch.deckT -= dt;
    if (sch.deckT > 0) return false;
    sch.deckT = DECKUNG_TAKT * (0.8 + this.raum.rnd() * 0.8);
    const w = this.raum.rnd() * TAU, ab = DECKUNG_WEITE * (0.4 + this.raum.rnd() * 0.6);
    const px = sch.hx + Math.cos(w) * ab, py = sch.hy + Math.sin(w) * ab;
    if (!imLager(this.sp, px, py)) return false;
    const { u, v } = planKoord(this.sp, px, py);
    const weg = this.laufWeg(sch, u, v, 0);
    const e = weg[weg.length - 1];
    if (!e || Math.hypot(e.x - sch.hx, e.y - sch.hy) > DECKUNG_WEITE * 1.6 || Math.hypot(e.x - sch.x, e.y - sch.y) < 4) return false;
    sch.weg = weg.slice(1, 6);   // höchstens ein paar Knoten, bleibt nah am Posten
    return sch.weg.length > 0;
  }

  // ---------- Soldaten: Nahkampf, Tod, Hotspot-Einsatz ----------
  // Positionen aller Soldaten an die Clients (Figuren laufen und sterben dort); bewegt sich jemand, alle 0,2 s, sonst jede Sekunde
  soldatenSenden(dt, bewegt) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = bewegt ? 0.2 : 1;
    const rund = a => Math.round(a * 10) / 10;
    this.raum.broadcast('bwSoldaten', { s: this.schuetzen.map(q => [q.n, rund(q.x), rund(q.y), Math.round(q.blick * 100) / 100, q.tot ? 1 : 0]) });
  }

  // Soldaten rufen „Halt, sofort stehen bleiben!“, wenn sich ein Spieler dem Lager nähert (je Spieler alle 45–60 s),
  // und gelegentlich, wenn Zombies den Zaun erreichen (insgesamt höchstens alle 20–30 s); der nächste lebende Soldat ruft
  soldatRufen(d) {
    this.rufUhr += d;
    if (!this.steht() || !this.sp) return;
    const lebend = this.schuetzen.filter(q => !q.tot);
    if (!lebend.length) return;
    const naechster = (x, y) => lebend.reduce((a, b) => Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b);
    const rufen = (x, y) => { const q = naechster(x, y); this.raum.broadcast('soldatRuf', { n: q.n, x: q.x, y: q.y, t: this.raum.rnd() < 0.5 ? 0 : 1 }); };
    const E = RUF_WEITE / KACHEL;
    for (const [sid, p] of this.raum.state.spieler) {
      if (this.raum.extra.get(sid)?.bot || !p.verbunden || p.ebene || p.unten || p.zombie > 0) continue;
      const { u, v } = planKoord(this.sp, p.x, p.y);
      if (!(u >= -E && u <= SP_BREITE + E && v >= 1.5 - E && v <= SP_TIEFE)) continue;
      if ((this.rufSp.get(sid) ?? -1e9) > this.rufUhr) continue;
      this.rufSp.set(sid, this.rufUhr + 45 + this.raum.rnd() * 15);
      rufen(p.x, p.y);
      return;
    }
    if (this.rufZombie > this.rufUhr) return;
    for (const z of this.raum.state.zombies.values()) {
      const { u, v } = planKoord(this.sp, z.x, z.y);
      if (u < 0 || u > SP_BREITE || v < 0.5 || v > 2.5) continue;
      this.rufZombie = this.rufUhr + 20 + this.raum.rnd() * 10;
      rufen(z.x, z.y);
      return;
    }
  }

  soldatenLeben(dt) {
    if (!this.schuetzen.length) return;
    const unverwundbar = !(this.einst().falltage > 0);   // „nie fallen“: auch die Soldaten sind dann unverwundbar (wie der Puma)
    this.nahT += dt;
    if (this.nahT >= 0.25) {
      const d = this.nahT; this.nahT = 0;
      this.soldatRufen(d);
      const lebend = this.schuetzen.filter(q => !q.tot);
      if (lebend.length && !unverwundbar) {
        for (const z of this.raum.state.zombies.values()) {
          if (z.ebene || !(z.hp > 0)) continue;
          for (const q of lebend) if (!q.tot && Math.hypot(z.x - q.x, z.y - q.y) < SOLDAT_BISS) q.hp -= SOLDAT_NAHSCHADEN * d;
        }
        for (const q of lebend) if (q.hp <= 0) this.soldatTot(q);
      }
    }
    this.hotT -= dt;
    if (this.hotT <= 0) { this.hotT = 1; this.einsatzPlanen(); this.nachschubPruefen(); }
    let bewegt = false;
    for (const q of this.schuetzen) if (!q.tot && q.weg.length && this.soldatLaufen(q, dt)) bewegt = true;
    this.nachschubSchritt(dt);
    this.soldatenSenden(dt, bewegt);
  }

  soldatTot(q) {
    const r = this.raum;
    q.tot = true; q.hp = 0; q.weg = []; q.modus = 'tot';
    r.broadcast('soldatTot', { n: q.n, x: q.x, y: q.y, w: q.blick });
    r.laerm(q.x, q.y, 300, true, '');
    this.sendT = 0;
  }

  // alle 1 s: gibt es einen Angriffs-Hotspot, schickt der Stützpunkt die Hälfte der Soldaten (nie mehr als alle außer 2 Wachen) dorthin;
  // nach HOT_RUHE s ohne Hotspot kehren alle auf ihre Posten zurück
  einsatzPlanen() {
    const lebend = this.schuetzen.filter(q => !q.tot && q.modus !== 'nachschub');   // Munitionsträger bleiben bei ihrem Auftrag
    if (!lebend.length) return;
    const hot = this.hotspot(this.sHot);
    if (!hot || hot.n < HOT_MIN) {
      this.ruheT += 1;
      // erst heim, wenn lange kein Hotspot war UND der Soldat selbst eine Weile kein Ziel mehr hatte
      if (this.ruheT >= HOT_RUHE) for (const q of lebend) {
        const abseits = q.modus === 'hot' || (q.modus === 'post' && Math.hypot(q.x - q.hx, q.y - q.hy) > 2);
        if (abseits && !(q.modus === 'post' && q.weg.length) && q.kampfT >= KAMPF_RUHE + (q.n % 8) * KAMPF_RUHE_STREU / 7) this.heimschicken(q);
      }
      return;
    }
    this.ruheT = 0;
    const fl = fahrFlaeche(this.sp), { r } = fl;
    const zu = Math.min(SP_BREITE - 2, Math.max(2, hot.u)), zv = Math.min(SP_TIEFE - 2, Math.max(1.8, hot.v));
    const [hx, hy] = r.ort(zu, zv);
    const stay = Math.max(WACHE_MIN, Math.ceil(lebend.length / 2)), gehen = Math.max(0, lebend.length - stay);
    // schon Ausgerückte bleiben im Einsatz, sonst die dem Hotspot nächsten Posten
    const reihe = lebend.slice().sort((a, b) => (b.modus === 'hot') - (a.modus === 'hot') || Math.hypot(a.hx - hx, a.hy - hy) - Math.hypot(b.hx - hx, b.hy - hy));
    reihe.forEach((q, i) => {
      if (i >= gehen) { if (q.modus === 'hot') this.heimschicken(q); return; }
      if (q.modus === 'hot' && q.hotU !== undefined && Math.hypot(q.hotU - zu, q.hotV - zv) < 3) return;   // Hotspot kaum gewandert
      this.hinschicken(q, zu, zv, i);
    });
  }

  // Weg (Knotenliste in Pixeln) von der aktuellen Lage zu einem Bauplan-Punkt auf der Fahrfläche (Breitensuche wie beim Puma);
  // k = wie viele Knoten vom Ziel entfernt (damit sich die Soldaten verteilen)
  laufWeg(q, u1, v1, k = 0, genau = null) {
    const fl = fahrFlaeche(this.sp), { frei, nu, nv, r } = fl, S = FAHR_SCHRITT;
    const { u: u0, v: v0 } = planKoord(this.sp, q.x, q.y);
    const knoten = (u, v) => [Math.min(nu - 1, Math.max(0, Math.round(u / S))), Math.min(nv - 1, Math.max(0, Math.round(v / S)))];
    const naechster = (u, v) => {
      let [i, j] = knoten(u, v);
      if (frei[j * nu + i]) return j * nu + i;
      let bd = Infinity, best = -1;
      for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) if (frei[b * nu + a]) { const d = Math.hypot(a * S - u, b * S - v); if (d < bd) { bd = d; best = b * nu + a; } }
      return best;
    };
    const start = naechster(u0, v0);
    if (start < 0) return [];
    const vor = new Int32Array(nu * nv).fill(-2), ordnung = [start];
    vor[start] = -1;
    for (let n = 0; n < ordnung.length; n++) {
      const c = ordnung[n], i = c % nu, j = (c - i) / nu;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nu || b >= nv || !frei[b * nu + a] || vor[b * nu + a] !== -2) continue;
        if (di && dj && !(frei[j * nu + a] && frei[b * nu + i])) continue;
        vor[b * nu + a] = c; ordnung.push(b * nu + a);
      }
    }
    const nahe = ordnung.slice().sort((a, b) => Math.hypot((a % nu) * S - u1, Math.floor(a / nu) * S - v1) - Math.hypot((b % nu) * S - u1, Math.floor(b / nu) * S - v1));
    const ziel = nahe[Math.min(nahe.length - 1, k * 2)];
    const weg = [];
    for (let c = ziel; c >= 0; c = vor[c]) { const i = c % nu; weg.push(r.ort(i * S, (c - i) / nu * S)); }
    weg.reverse();
    if (genau) weg.push([genau.x, genau.y]);
    return weg.map(([x, y]) => ({ x, y }));
  }

  hinschicken(q, u, v, k) {
    q.modus = 'hot'; q.hotU = u; q.hotV = v;
    q.weg = this.laufWeg(q, u, v, k);
    q.ziel = null;
  }

  heimschicken(q) {
    q.modus = 'zurueck'; q.hotU = undefined;
    const { u, v } = planKoord(this.sp, q.hx, q.hy);
    q.weg = this.laufWeg(q, u, v, 0, { x: q.hx, y: q.hy });
    q.ziel = null;
  }

  // ein Schritt auf dem Weg; true, solange er läuft. Am Ziel: im Einsatz zum Hotspot gucken, zu Hause wieder Wache halten
  soldatLaufen(q, dt) {
    let rest = SOLDAT_TEMPO * KACHEL * dt;
    while (rest > 0 && q.weg.length) {
      const z = q.weg[0], d = Math.hypot(z.x - q.x, z.y - q.y);
      if (d < 0.5) { q.weg.shift(); continue; }
      q.blick = Math.atan2(z.y - q.y, z.x - q.x);
      const st = Math.min(rest, d);
      q.x += (z.x - q.x) / d * st; q.y += (z.y - q.y) / d * st; rest -= st;
      if (st >= d) q.weg.shift();
    }
    if (!q.weg.length) {
      if (q.modus === 'zurueck') { q.modus = 'post'; q.blick = q.w0; q.x = q.hx; q.y = q.hy; }
      else if (q.modus === 'hot' && q.hotU !== undefined) { const [hx, hy] = fahrFlaeche(this.sp).r.ort(q.hotU, q.hotV); q.blick = Math.atan2(hy - q.y, hx - q.x) + 0; }
      return false;
    }
    return true;
  }

  // Vorrat: 0 in den Einstellungen = unbegrenzt; sonst zählt jeder Schuss (muni), leer = die Waffe schweigt
  hatMuni(t, einstellung) { return !(this.einst()[einstellung] > 0) || t.muni > 0; }

  // ---------- Munitionsnachschub ----------
  // Ist ein MG-Nest oder der Puma leer, schickt das Lager zwei Soldaten (von ihren Posten, nur im Lager) zum Bundeswehr-Container;
  // sie warten kurz, bringen die Munition zur leeren Waffe (voller Vorrat) und kehren auf ihre Posten zurück. Unterwegs sind sie angreifbar.
  nachschubPruefen() {
    if (this.nachschub) return;
    const sp = this.sp, ziel = [...this.nester, this.puma].find(t => t && t.muni <= 0 && this.einst()[t === this.puma ? 'pumaMunition' : 'mgMunition'] > 0);
    const cont = sp.teile.find(t => t.art === 'container');
    if (!ziel || !cont) return;
    const frei = this.schuetzen.filter(q => !q.tot && q.modus === 'post').sort((a, b) => Math.hypot(a.x - cont.x, a.y - cont.y) - Math.hypot(b.x - cont.x, b.y - cont.y)).slice(0, NACHSCHUB_SOLDATEN);
    if (!frei.length) return;
    this.nachschub = { ziel, traeger: frei, phase: 'hin', t: 0 };
    frei.forEach((q, i) => { q.modus = 'nachschub'; q.ziel = null; q.weg = this.anlaufen(q, cont, i, 42); });
    this.raum.broadcast('meldung', { text: '📦 Soldaten holen Munition' });
    this.sendT = 0;
  }

  // Weg zu einem Gegenstand im Lager: über die Fahrfläche bis in die Nähe, dann auf den letzten Schritten bis auf `nah` px heran
  anlaufen(q, ziel, k, nah) {
    const { u, v } = planKoord(this.sp, ziel.x, ziel.y), weg = this.laufWeg(q, u, v, k), l = weg[weg.length - 1];
    if (l) {
      const w = Math.atan2(l.y - ziel.y, l.x - ziel.x) + (k ? 0.7 : -0.7);   // zwei Träger nebeneinander
      weg.push({ x: ziel.x + Math.cos(w) * nah, y: ziel.y + Math.sin(w) * nah });
    }
    return weg;
  }

  nachschubSchritt(dt) {
    const n = this.nachschub;
    if (!n) return;
    n.traeger = n.traeger.filter(q => !q.tot);
    if (!n.traeger.length) { this.nachschub = null; return; }   // alle Träger gefallen: beim nächsten Mal neue schicken
    if (n.traeger.some(q => q.weg.length)) return;              // noch unterwegs
    if (n.phase === 'hin') { n.phase = 'warten'; n.t = 0; return; }
    if (n.phase === 'warten') {
      n.t += dt;
      if (n.t < NACHSCHUB_WARTEN) return;
      n.phase = 'zurueck';
      n.traeger.forEach((q, i) => { q.weg = this.anlaufen(q, n.ziel, i, 20); });
      this.sendT = 0;
      return;
    }
    // Munition übergeben, Träger zurück auf ihre Posten
    n.ziel.muni = n.ziel === this.puma ? this.einst().pumaMunition : this.einst().mgMunition;
    for (const q of n.traeger) this.heimschicken(q);
    this.nachschub = null;
  }

  nestSchritt(nest, dt) {
    nest.kuehl = Math.max(0, nest.kuehl - dt);
    if (!this.hatMuni(nest, 'mgMunition')) { nest.salve = 0; return; }
    if (nest.salve > 0) {
      nest.takt -= dt;
      if (nest.takt > 0) return;
      if (!this.mgSchuss(nest)) { nest.salve = 0; nest.kuehl = 0.4; return; }
      nest.takt = SALVE_TAKT;
      if (--nest.salve === 0) nest.kuehl = SALVE_PAUSE;
      return;
    }
    if (nest.kuehl > 0) return;
    nest.scan -= dt;
    if (nest.scan > 0) return;
    nest.scan = SCAN_TAKT;
    nest.ziel = this.waehleZiel(nest.x, nest.y, MG_REICHWEITE);
    if (!nest.ziel) return;
    nest.salve = SALVE; nest.takt = 0;
    this.raum.laerm(nest.x, nest.y, MG_LAERM, true, '');   // laut: lockt Zombies zum Draht
  }

  // ein Schuss aus dem MG-Nest; false, wenn kein Ziel mehr da ist
  mgSchuss(nest) {
    const r = this.raum;
    let z = this.gueltig(nest.ziel, nest.x, nest.y, MG_REICHWEITE);
    if (!z) { nest.ziel = this.waehleZiel(nest.x, nest.y, MG_REICHWEITE); z = this.gueltig(nest.ziel, nest.x, nest.y, MG_REICHWEITE); }
    if (!z) return false;
    if (this.einst().mgMunition > 0) nest.muni--;
    const treffer = r.rnd() < this.trefferChance;
    const w = Math.atan2(z.y - nest.y, z.x - nest.x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.07 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - nest.x, z.y - nest.y);
    r.broadcast('bwschuss', { art: 'mg', n: nest.n, x1: nest.x, y1: nest.y, x2: nest.x + Math.cos(w) * d, y2: nest.y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) this.treffen(nest.ziel, z, this.raum.einstellungen?.()?.waffen?.gewehr?.schaden ?? MG_SCHADEN, nest);
    return true;
  }

  // Schaden an einem Zombie; die Abschüsse der Bundeswehr zählen nicht zu den Aufgaben der Spieler
  treffen(id, z, menge, von) {
    const r = this.raum, vorher = r.state.besiegt;
    this.schuetze.x = von.x; this.schuetze.y = von.y;
    r.schaden(id, z, menge, this.schuetze);
    r.state.besiegt = vorher;
  }

  // Hotspot: Zelle (96-px-Raster) mit den meisten Zombies im Umkreis von 600 px um das Lager (alle Seiten); Ergebnis: Mittelpunkt der
  // Zombies dieser Zelle als Bauplan-Punkt { u, v, n } oder null. Die bisherige Zelle bleibt, solange sie fast so voll ist wie die beste.
  hotspot(p) {
    const sp = this.sp, r = HOT_RADIUS / KACHEL, zellen = new Map();
    for (const z of this.raum.state.zombies.values()) {
      if (z.ebene || !(z.hp > 0)) continue;
      const { u, v } = planKoord(sp, z.x, z.y);
      if (u < -r || u > SP_BREITE + r || v < -r || v > SP_TIEFE + r) continue;
      const k = Math.floor(z.x / HOT_ZELLE) + ',' + Math.floor(z.y / HOT_ZELLE);
      let c = zellen.get(k);
      if (!c) zellen.set(k, c = { n: 0, u: 0, v: 0 });
      c.n++; c.u += u; c.v += v;
    }
    let best = null, bk = null;
    for (const [k, c] of zellen) if (!best || c.n > best.n) { best = c; bk = k; }
    if (!best) { p.hotZelle = null; return null; }
    const alt = p.hotZelle && zellen.get(p.hotZelle);
    if (alt && alt.n >= best.n * 0.7) { best = alt; bk = p.hotZelle; }
    p.hotZelle = bk;
    return { u: best.u / best.n, v: best.v / best.n, n: best.n };
  }

  // Fahrziel auf der Fahrfläche wählen und Weg dorthin suchen (Breitensuche über die freien Knoten, 8 Nachbarn)
  pumaPlanen(p) {
    const fl = fahrFlaeche(this.sp), { frei, nu, nv } = fl, S = FAHR_SCHRITT;
    const hot = this.hotspot(p);
    p.hot = hot;
    const kn = (u, v) => [Math.min(nu - 1, Math.max(0, Math.round(u / S))), Math.min(nv - 1, Math.max(0, Math.round(v / S)))];
    let [si, sj] = kn(p.u, p.v);
    if (!frei[sj * nu + si]) {   // steht zwischen den Knoten oder (Tests) irgendwo: nächster freier Knoten
      let bd = Infinity;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (frei[j * nu + i]) { const d = Math.hypot(i * S - p.u, j * S - p.v); if (d < bd) { bd = d; si = i; sj = j; } }
      if (bd === Infinity) { p.weg = []; return; }
    }
    const vor = new Int32Array(nu * nv).fill(-2), ordnung = [];
    vor[sj * nu + si] = -1; ordnung.push(sj * nu + si);
    for (let q = 0; q < ordnung.length; q++) {
      const k = ordnung[q], i = k % nu, j = (k - i) / nu;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nu || b >= nv || !frei[b * nu + a] || vor[b * nu + a] !== -2) continue;
        if (di && dj && !(frei[j * nu + a] && frei[b * nu + i])) continue;
        vor[b * nu + a] = k; ordnung.push(b * nu + a);
      }
    }
    let ziel;
    const zielU = hot ? hot.u : PUMA_PARK[0], zielV = hot ? hot.v : PUMA_PARK[1];
    if (hot) {   // erreichbarer Knoten, der dem Hotspot am nächsten kommt (näher als HOT_NAH Kacheln ist nicht nötig: dann der nächste zu mir)
      let bd = Infinity;
      for (const k of ordnung) { const i = k % nu, j = (k - i) / nu, d = Math.hypot(i * S - zielU, j * S - zielV); if (d < bd) bd = d; }
      const grenze = Math.max(bd, HOT_NAH) + 0.01;
      let bm = Infinity;
      for (const k of ordnung) {
        const i = k % nu, j = (k - i) / nu;
        if (Math.hypot(i * S - zielU, j * S - zielV) > grenze) continue;
        const m = Math.hypot(i * S - p.u, j * S - p.v);
        if (m < bm) { bm = m; ziel = k; }
      }
    } else {
      let bd = Infinity;
      for (const k of ordnung) { const i = k % nu, j = (k - i) / nu, d = Math.hypot(i * S - zielU, j * S - zielV); if (d < bd) { bd = d; ziel = k; } }
    }
    const weg = [];
    for (let k = ziel; k >= 0; k = vor[k]) { const i = k % nu; weg.push([i * S, (k - i) / nu * S]); }
    weg.reverse();
    // von der echten Lage aus Knoten überspringen, solange die Strecke zum übernächsten frei ist
    while (weg.length > 1 && fl.strecke(p.u, p.v, weg[1][0], weg[1][1])) weg.shift();
    p.weg = weg;
  }

  // Fahren: Wanne dreht nur so weit, dass der Wegpunkt vorn (≤ 90°) oder hinten liegt – liegt er hinten, rollt der Puma rückwärts statt
  // zu wenden. Erst bei passender Richtung (Rest ≤ 0,35 rad) rollt er. Turmmitte = Wannenmitte.
  pumaFahren(p, dt) {
    if (p.fest) return;   // Tests: Puma steht
    const s = this.raum.state, sp = this.sp, fl = fahrFlaeche(sp), r = fl.r;
    p.scanU -= dt;
    if (p.scanU <= 0) { p.scanU = 0.5 + this.raum.rnd() * 0.3; this.pumaPlanen(p); }
    if (!p.weg.length) return;
    let [wu, wv] = p.weg[0];
    let du = wu - p.u, dv = wv - p.v, rest = Math.hypot(du, dv);
    if (rest < 0.08) { p.weg.shift(); return; }
    const [px, py] = r.ort(p.u, p.v), [qx, qy] = r.ort(wu, wv);
    const richtung = Math.atan2(qy - py, qx - px), hinten = Math.abs(diffWinkel(richtung, s.bwW)) > Math.PI / 2;
    p.rueckwaerts = hinten;
    const soll = hinten ? richtung + Math.PI : richtung, diff = diffWinkel(soll, s.bwW), dreh = Math.min(Math.abs(diff), PUMA_WENDE * dt);
    let w = s.bwW + Math.sign(diff) * dreh; if (w > Math.PI) w -= TAU; if (w < -Math.PI) w += TAU;
    const rund = (a) => Math.round(a * 1000) / 1000;
    if (dreh > 0) s.bwW = rund(w);
    if (Math.abs(diff) - dreh > 0.35) return;
    const tempo = hinten ? PUMA_RUECK : p.hot ? PUMA_JAGD : PUMA_STREIFE, schritt = Math.min(rest, tempo * dt);
    p.u += du / rest * schritt; p.v += dv / rest * schritt;
    const [x, y] = r.ort(p.u, p.v);
    p.x = x; p.y = y;
    s.bwX = Math.round(x * 10) / 10; s.bwY = Math.round(y * 10) / 10;
  }

  pumaSchritt(p, dt) {
    const r = this.raum, s = r.state;
    this.pumaFahren(p, dt);
    p.kuehl = Math.max(0, p.kuehl - dt);
    p.scan -= dt;
    if (p.scan <= 0) { p.scan = SCAN_TAKT; if (!this.gueltig(p.ziel, p.x, p.y, PUMA_REICHWEITE)) p.ziel = this.waehleZiel(p.x, p.y, PUMA_REICHWEITE); }
    const z = this.gueltig(p.ziel, p.x, p.y, PUMA_REICHWEITE);
    if (!z) return;
    const soll = Math.atan2(z.y - p.y, z.x - p.x), diff = diffWinkel(soll, s.bwTurm);
    const schritt = Math.min(Math.abs(diff), PUMA_DREH * dt);
    if (schritt > 0) { let w = s.bwTurm + Math.sign(diff) * schritt; if (w > Math.PI) w -= TAU; if (w < -Math.PI) w += TAU; s.bwTurm = w; }
    if (Math.abs(diff) > 0.06 || p.kuehl > 0 || !this.hatMuni(p, 'pumaMunition')) return;
    if (this.einst().pumaMunition > 0) p.muni--;
    p.kuehl = this.einst().pumaPause ?? PUMA_PAUSE;   // Einstellung „Panzer: Schussfolge“ (Sekunden zwischen zwei Schüssen)
    // Treffpunkt: meist genau das Ziel, manchmal etwas daneben; kleiner Flächenschaden um den Einschlag
    const ix = z.x + (r.rnd() - 0.5) * 14, iy = z.y + (r.rnd() - 0.5) * 14;
    r.broadcast('bwschuss', { art: 'kanone', n: p.n, x1: p.x, y1: p.y, x2: ix, y2: iy, w: s.bwTurm, t: 1 });
    this.treffen(p.ziel, z, KANONE_SCHADEN, p);
    for (const [id, q] of [...s.zombies]) {
      if (id === p.ziel || q.ebene || Math.hypot(q.x - ix, q.y - iy) > KANONE_RADIUS) continue;
      this.treffen(id, q, KANONE_FLAECHE, p);
    }
    r.laerm(p.x, p.y, PUMA_LAERM, true, '');
  }

  // ---------- Ärzte heilen, Feldbetten ----------
  heilen(dt) {
    const sp = this.sp;
    for (const p of this.raum.state.spieler.values()) {
      if (p.ebene || p.unten || p.zombie > 0 || p.hp >= 100) continue;
      if (handelPartner(sp, p.x, p.y, HANDEL_ABSTAND, 'arzt')) p.hp = Math.min(100, p.hp + HEILEN_PRO_SEK * dt);
    }
  }

  // Feldbett des Sanitätszelts (≤ 1 Kachel Rand) – draußen gilt es wie ein Safe-Room-Bett (Ruhen in raum.ruhtAmBett)
  amFeldbett(p) {
    const sp = this.sp;
    if (!sp || p.ebene) return false;
    for (const t of sp.teile) {
      if (t.art !== 'feldbett') continue;
      const co = Math.round(Math.cos(t.winkel)), si = Math.round(Math.sin(t.winkel));
      const lx = (p.x - t.x) * co + (p.y - t.y) * si, ly = -(p.x - t.x) * si + (p.y - t.y) * co;
      if (Math.abs(lx) <= t.w / 2 + KACHEL && Math.abs(ly) <= t.d / 2 + KACHEL) return true;
    }
    return false;
  }

  // ---------- Handel ----------
  // Nachricht 'handel' { wer: 'arzt' | 'soldat', angebot: id }: der Server prüft alles und bezahlt selbst aus dem Rucksack
  handel(client, m) {
    const r = this.raum, p = r.state.spieler.get(client.sessionId);
    const sag = text => client.send('handel', { ok: false, text });
    if (!p || p.unten || p.zombie > 0 || p.ebene) return;
    if (!this.steht()) return sag('Der Stützpunkt ist gefallen – hier tauscht niemand mehr');
    const wer = String(m?.wer ?? ''), h = HANDEL[wer], a = h?.angebote.find(q => q.id === m?.angebot);
    if (!h || !a) return;
    if (!handelPartner(this.sp, p.x, p.y, HANDEL_ABSTAND, wer)) return sag(`Hier ist kein ${h.name} in der Nähe`);
    const zahl = bezahlung(p.rucksack, a.kostet);
    if (!zahl) return sag('Dafür fehlt dir etwas im Rucksack');
    if (a.gibt === 'munition') {
      if (p.munition >= MUNITION_MAX) return sag('Deine Munition ist schon voll');
    } else {
      const probe = [...p.rucksack];   // passt es, nachdem bezahlt wurde?
      for (const d of zahl) entferne(probe, d, 1);
      if (!kannAufnehmen(probe, p.plaetze, a.gibt, a.menge)) return sag(blockGrund(probe, p.plaetze, a.gibt, a.menge) === 'tasche' ? 'Du trägst schon eine Tasche' : 'Dein Rucksack ist zu voll');
    }
    for (const d of zahl) entferne(p.rucksack, d, 1);
    if (a.gibt === 'munition') p.munition = Math.min(MUNITION_MAX, p.munition + a.menge);
    else fuegeHinzu(p.rucksack, p.plaetze, a.gibt, a.menge);
    const was = a.gibt === 'munition' ? `🧰 ${a.menge} Schuss` : `${DINGE[a.gibt].zeichen} ${DINGE[a.gibt].name}`;
    client.send('handel', { ok: true, text: `${h.zeichen} Getauscht: ${was}` });
  }

  // Gegenwert prüfen und übergeben (für die Rätsel-Bezahlung): null = ok, sonst Fehltext
  uebergeben(p, a) {
    if (a.gibt === 'munition') {
      if (p.munition >= MUNITION_MAX) return 'Deine Munition ist schon voll';
      p.munition = Math.min(MUNITION_MAX, p.munition + a.menge);
    } else {
      if (!kannAufnehmen(p.rucksack, p.plaetze, a.gibt, a.menge)) return 'Dein Rucksack ist zu voll';
      fuegeHinzu(p.rucksack, p.plaetze, a.gibt, a.menge);
    }
    return null;
  }

  // Nachricht 'handel_raetsel' { wer, angebot, weiter }: statt Gegenständen HANDEL_RAETSEL Rätsel in Folge richtig beantworten
  handelRaetsel(client, m) {
    const r = this.raum, p = r.state.spieler.get(client.sessionId);
    const sag = text => client.send('handel', { ok: false, text });
    if (!p || p.unten || p.zombie > 0 || p.ebene || !this.steht()) return;
    const wer = String(m?.wer ?? ''), h = HANDEL[wer], a = h?.angebote.find(q => q.id === m?.angebot);
    if (!h || !a || !handelPartner(this.sp, p.x, p.y, HANDEL_ABSTAND, wer)) return;
    this.serien ??= new Map();
    const alt = this.serien.get(client.sessionId);
    const nr = m?.weiter && alt && alt.wer === wer && alt.angebot === a.id ? alt.nr : 0;
    if (a.gibt === 'munition' ? p.munition >= MUNITION_MAX : !kannAufnehmen(p.rucksack, p.plaetze, a.gibt, a.menge)) return sag(a.gibt === 'munition' ? 'Deine Munition ist schon voll' : 'Dein Rucksack ist zu voll');
    this.serien.set(client.sessionId, { wer, angebot: a.id, nr });
    r.stelleRaetsel(client, { art: 'handel', nr, von: HANDEL_RAETSEL });
  }

  // Antwort auf eine Handels-Rätselfrage (aus raum.antwort): richtig zählt hoch, falsch setzt die Serie zurück
  raetselAntwort(client, p, offen, richtig) {
    const serie = this.serien?.get(client.sessionId);
    const h = serie && HANDEL[serie.wer], a = h?.angebote.find(q => q.id === serie.angebot);
    let fertig = false, nr = 0, text = '';
    if (!serie || !a || p.ebene || !this.steht() || !handelPartner(this.sp, p.x, p.y, HANDEL_ABSTAND + 14, serie.wer)) {
      this.serien?.delete(client.sessionId);
    } else if (!richtig) {
      this.serien.delete(client.sessionId);
      text = 'Falsch – die Serie beginnt von vorn';
    } else {
      serie.nr++; nr = serie.nr;
      if (nr >= HANDEL_RAETSEL) {
        const fehler = this.uebergeben(p, a);
        this.serien.delete(client.sessionId);
        fertig = true;
        text = fehler ?? `${h.zeichen} Getauscht (Rätsel): ${a.gibt === 'munition' ? `🧰 ${a.menge} Schuss` : `${DINGE[a.gibt].zeichen} ${DINGE[a.gibt].name}`}`;
        client.send('handel', { ok: !fehler, text });
      }
    }
    client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite, handel: { nr, von: HANDEL_RAETSEL, fertig, text, weiter: richtig && !fertig && !!serie && this.serien.has(client.sessionId) } });
  }
}

