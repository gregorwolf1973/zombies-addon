// Szene „Stau auf der B11“ (nur Karte geretsried2), zur Laufzeit am Weltstart aufgebaut – der geteilte Weltcode bleibt unberührt.
// Auf der B 11 nordwestlich der Kreuzung beim Rathaus (Karl-Lederer-Platz) steht ein Stau: 14 Fahrzeuge auf beiden Spuren, davon 3 brennend
// und 2 ausgebrannte Wracks; eine Feuerwehr mit Dauer-Blaulicht (Sirene aus, Fahrzeugfarbe 200 als Kennung) steht daneben. An der Kreuzung hält
// ein Bundeswehr-Posten: 8 Infanteristen (Gewehr wie die Lager-Soldaten, Lebenspunkte, Zombies beißen sie), ein Puma (statisch, Turm dreht,
// Kanone) und ein Mörserpanzer M113 (Fahrzeug 'moerser' über server/moerser.mjs, fest eingebaut). Gefallene lassen einen Munitionshaufen liegen und
// stehen nach der Verwandlungszeit als Zombie (Tarn-Typ 0) wieder auf. Sind alle Infanteristen tot, schweigen Puma und Mörser.
// Darstellung: client/szene_b11.mjs (Nachrichten 'b11' = Zustand jede Sekunde, 'b11schuss' = Schüsse).
import { Fahrzeug } from './verkehr.mjs';
import { Feuer } from './feuer.mjs';
import { sichtfrei } from '../client/welt.mjs';
import { B11_KARTE, b11Geometrie, b11Punkt } from './szene_b11_geo.mjs';

export const STAU = {
  abstand: 330, schritt: 80,          // erstes Auto, Abstand der Autos je Spur (px von der Kreuzung)
  autos: 14, brennend: [3, 6, 10], wracks: [5, 8],   // Fahrzeug-Nummern (0 = vorn nahe der Kreuzung, gerade = Spur Richtung Kreuzung)
  feuerwehr: 6,                        // steht neben diesem Auto
};
const SOLDATEN = 8, SOLDAT_S = 130, SOLDAT_ABSTAND = 20;   // Linie quer zur Straße 130 px hinter der Kreuzung
const PUMA_S = 190, PUMA_V = 18, MOERSER_S = 245, MOERSER_V = -18;
const SOLDAT_HP = 100, SOLDAT_BISS = 26, SOLDAT_NAHSCHADEN = 18;
const SOLDAT_REICHWEITE = 35 * 8, SOLDAT_PAUSE = 1.3, SOLDAT_SCHADEN = 100, SOLDAT_TREFFER = 0.75, SOLDAT_LAERM = 380;
const PUMA_REICHWEITE = 60 * 8, PUMA_PAUSE = 3.5, PUMA_DREH = 2.4, KANONE_SCHADEN = 100, KANONE_FLAECHE = 60, KANONE_RADIUS = 30, PUMA_LAERM = 760;
const TAU = Math.PI * 2;
const diffWinkel = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const zufall = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // deterministisch, 0..1

export class SzeneB11 {
  constructor(raum) {
    this.raum = raum;
    this.geo = null;
    this.soldaten = []; this.puma = null; this.autos = []; this.feuerIds = [];
    this.aufgegeben = false;
    this.schuetze = { name: 'Bundeswehr', x: 0, y: 0, besiegt: 0 };
    this.sendT = 0; this.nahT = 0;
  }

  aktiv() { return !!this.geo; }

  start() {
    const r = this.raum, s = r.state;
    if (s.karte !== B11_KARTE) return;
    this.geo = b11Geometrie(r.welt);
    if (!this.geo) return;
    const g = this.geo;
    // ---- Stau ----
    for (let i = 0; i < STAU.autos; i++) {
      const spur = i % 2, rang = i >> 1;
      const sl = STAU.abstand + rang * STAU.schritt + (zufall(i) - 0.5) * 24 + spur * 30;
      const p = b11Punkt(g, sl, (spur ? -15 : 15) + (zufall(i + 40) - 0.5) * 8);
      const f = new Fahrzeug();
      f.x = p.x; f.y = p.y; f.richtung = p.w + (spur ? Math.PI : 0) + (zufall(i + 80) - 0.5) * 0.14;
      f.art = STAU.wracks.includes(i) ? 'wrack' : 'auto'; f.farbe = Math.floor(zufall(i + 7) * 8); f.haelt = true;
      const id = 'stau' + i;
      s.fahrzeuge.set(id, f);
      this.autos.push(id);
      if (STAU.brennend.includes(i)) this.anzuenden(i, f);
    }
    // ---- Feuerwehr daneben (am Straßenrand, Blaulicht dauerhaft, Sirene aus) ----
    const fw = b11Punkt(g, STAU.abstand + (STAU.feuerwehr >> 1) * STAU.schritt + 20, 52);
    const ff = new Fahrzeug();
    ff.x = fw.x; ff.y = fw.y; ff.richtung = fw.w; ff.art = 'feuerwehr'; ff.farbe = 200; ff.haelt = true;
    r.state.fahrzeuge.set('stauFeuerwehr', ff); this.feuerwehrId = 'stauFeuerwehr';
    // ---- Posten: Blickrichtung weg von der Kreuzung (zum Stau) ----
    const blick = b11Punkt(g, SOLDAT_S, 0).w + Math.PI;
    for (let i = 0; i < SOLDATEN; i++) {
      const p = b11Punkt(g, SOLDAT_S + (i % 2) * 8, -SOLDAT_ABSTAND * (SOLDATEN - 1) / 2 + i * SOLDAT_ABSTAND);
      this.soldaten.push({ i, x: p.x, y: p.y, blick, hp: SOLDAT_HP, tot: 0, tZeit: 0, kuehl: 0.5 + (i % 5) * 0.2, scan: 0, ziel: null, zid: null });
    }
    const pp = b11Punkt(g, PUMA_S, PUMA_V);
    this.puma = { x: pp.x, y: pp.y, w: blick, turm: blick, kuehl: PUMA_PAUSE / 2, scan: 0, ziel: null };
    const mp = b11Punkt(g, MOERSER_S, MOERSER_V);
    const m = new Fahrzeug();
    m.x = mp.x; m.y = mp.y; m.richtung = blick; m.art = 'moerser'; m.farbe = 0; m.haelt = true;
    s.fahrzeuge.set('moerserB11', m);
    r.moerser.id = 'moerserB11'; r.moerser.fest = true; r.moerser.richtung = blick; r.moerser.schweigt = false;
    this.sendT = 0;
  }

  // Brand am Auto: Feuer, das nicht erlischt (die Feuer-Verwaltung aus server/feuer.mjs aktualisiert Stärke und Schaden)
  anzuenden(nr, f) {
    const r = this.raum, fe = new Feuer();
    fe.x = f.x; fe.y = f.y; fe.r = 42; fe.staerke = 1; fe.art = 'fahrzeug';
    const id = 'fb11_' + nr;
    r.state.feuer.set(id, fe);
    r.brand?.info.set(id, { ziel: 'b11:' + nr, alter: 30, dauer: 1e12 });
    this.feuerIds.push(id);
  }

  lebende() { return this.soldaten.filter(q => !q.tot); }

  // ---------- Verhalten ----------
  schritt(dt) {
    if (!this.geo) return;
    const r = this.raum;
    this.nahT += dt;
    if (!this.aufgegeben) {
      for (const q of this.soldaten) this.soldatSchritt(q, dt);
      this.pumaSchritt(dt);
    }
    if (this.nahT >= 0.25) { const d = this.nahT; this.nahT = 0; this.nahkampf(d); }
    // Gefallene stehen als Zombie wieder auf
    const sek = this.verwandlungSek();
    for (const q of this.soldaten) {
      if (q.tot !== 1) continue;
      q.tZeit += dt * (r.zeitraffer?.() ?? 1);
      if (q.tZeit >= sek) this.aufstehen(q);
    }
    if (!this.aufgegeben && this.soldaten.every(q => q.tot)) this.aufgeben();
    this.sendT -= dt;
    if (this.sendT <= 0) this.senden();
  }

  // Verwandlungszeit (Einstellung „verwandlung“, Spielminuten) in Sekunden der Spieluhr – wie bei den Menschen
  verwandlungSek() {
    const e = this.raum.einstellungen?.() ?? {};
    return (e.verwandlungMin ?? 30) * ((e.tagMinuten || 48) * 60 / 1440);
  }

  sicht(x1, y1, x2, y2) { return sichtfrei(this.raum.welt, x1, y1, x2, y2); }

  waehleZiel(x, y, reichweite) {
    let best = null, bd = Infinity;
    for (const [id, z] of this.raum.state.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd && d <= reichweite && this.sicht(x, y, z.x, z.y)) { bd = d; best = id; }
    }
    return best;
  }
  gueltig(id, x, y, reichweite) {
    const z = id && this.raum.state.zombies.get(id);
    return z && !z.ebene && z.hp > 0 && Math.hypot(z.x - x, z.y - y) <= reichweite && this.sicht(x, y, z.x, z.y) ? z : null;
  }
  treffen(id, z, menge, von) {
    const r = this.raum, vorher = r.state.besiegt;
    this.schuetze.x = von.x; this.schuetze.y = von.y;
    r.schaden(id, z, menge, this.schuetze);
    r.state.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie die Bundeswehr)
  }

  soldatSchritt(q, dt) {
    const r = this.raum;
    if (q.tot) return;
    q.kuehl = Math.max(0, q.kuehl - dt);
    let z = this.gueltig(q.ziel, q.x, q.y, SOLDAT_REICHWEITE);
    if (!z) {
      q.scan -= dt;
      if (q.scan > 0) return;
      q.scan = 0.25;
      q.ziel = this.waehleZiel(q.x, q.y, SOLDAT_REICHWEITE);
      z = this.gueltig(q.ziel, q.x, q.y, SOLDAT_REICHWEITE);
      if (!z) return;
    }
    q.blick = Math.atan2(z.y - q.y, z.x - q.x);
    this.sendT = Math.min(this.sendT, 0.2);
    if (q.kuehl > 0) return;
    q.kuehl = SOLDAT_PAUSE * (0.85 + r.rnd() * 0.3);
    const treffer = r.rnd() < SOLDAT_TREFFER;
    const w = q.blick + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - q.x, z.y - q.y);
    r.broadcast('b11schuss', { art: 'gewehr', i: q.i, x1: q.x, y1: q.y, x2: q.x + Math.cos(w) * d, y2: q.y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) this.treffen(q.ziel, z, SOLDAT_SCHADEN, q);
    r.laerm(q.x, q.y, SOLDAT_LAERM, true, '');
  }

  pumaSchritt(dt) {
    const r = this.raum, p = this.puma;
    if (!p) return;
    p.kuehl = Math.max(0, p.kuehl - dt);
    p.scan -= dt;
    if (p.scan <= 0) { p.scan = 0.25; if (!this.gueltig(p.ziel, p.x, p.y, PUMA_REICHWEITE)) p.ziel = this.waehleZiel(p.x, p.y, PUMA_REICHWEITE); }
    const z = this.gueltig(p.ziel, p.x, p.y, PUMA_REICHWEITE);
    if (!z) return;
    const soll = Math.atan2(z.y - p.y, z.x - p.x), diff = diffWinkel(soll, p.turm), st = Math.min(Math.abs(diff), PUMA_DREH * dt);
    if (st > 0) { p.turm += Math.sign(diff) * st; if (p.turm > Math.PI) p.turm -= TAU; if (p.turm < -Math.PI) p.turm += TAU; this.sendT = Math.min(this.sendT, 0.2); }
    if (Math.abs(diff) > 0.06 || p.kuehl > 0) return;
    p.kuehl = this.raum.einstellungen?.()?.bundeswehr?.pumaPause ?? this.raum.einstellungen?.()?.pumaPause ?? PUMA_PAUSE;
    const ix = z.x + (r.rnd() - 0.5) * 14, iy = z.y + (r.rnd() - 0.5) * 14;
    r.broadcast('b11schuss', { art: 'kanone', x1: p.x, y1: p.y, x2: ix, y2: iy, w: p.turm, t: 1 });
    this.treffen(p.ziel, z, KANONE_SCHADEN, p);
    for (const [id, q] of [...r.state.zombies]) {
      if (id === p.ziel || q.ebene || Math.hypot(q.x - ix, q.y - iy) > KANONE_RADIUS) continue;
      this.treffen(id, q, KANONE_FLAECHE, p);
    }
    r.laerm(p.x, p.y, PUMA_LAERM, true, '');
  }

  // Zombies im Nahkampf: Lebenspunkte der Soldaten sinken
  nahkampf(d) {
    const lebend = this.lebende();
    if (!lebend.length) return;
    for (const z of this.raum.state.zombies.values()) {
      if (z.ebene || !(z.hp > 0)) continue;
      for (const q of lebend) if (!q.tot && Math.hypot(z.x - q.x, z.y - q.y) < SOLDAT_BISS) q.hp -= SOLDAT_NAHSCHADEN * d;
    }
    for (const q of lebend) if (q.hp <= 0) this.soldatTot(q);
  }

  // gefallen: Munitionshaufen bleibt liegen (aufhebbar wie jeder Bodengegenstand), der Körper liegt bis zur Verwandlung
  soldatTot(q) {
    const r = this.raum;
    q.tot = 1; q.hp = 0; q.tZeit = 0;
    r.legeHin('munition', q.x, q.y); r.legeHin('munition', q.x, q.y); r.legeHin('munitionskiste', q.x, q.y);
    r.broadcast('b11tot', { i: q.i, x: q.x, y: q.y, w: q.blick });
    r.laerm(q.x, q.y, 300, true, '');
    this.sendT = 0;
  }

  aufstehen(q) {
    const r = this.raum;
    const id = r.setzeZombie(q.x, q.y, '');
    const z = r.state.zombies.get(id), info = r.zombieInfo.get(id);
    z.variante = 0;   // Tarn-Zombie (Soldat)
    info.schlaeft = false; info.steht = false;
    q.tot = 2; q.zid = id;
    this.sendT = 0;
  }

  // alle Infanteristen tot: Posten aufgegeben, Puma und Mörser schweigen
  aufgeben() {
    this.aufgegeben = true;
    if (this.raum.moerser) this.raum.moerser.schweigt = true;
    this.raum.broadcast('meldung', { text: '📻 Der Bundeswehr-Posten an der B 11 ist gefallen – Puma und Mörser schweigen.', lang: true });
    this.sendT = 0;
  }

  senden() {
    const rund = a => Math.round(a * 10) / 10;
    this.sendT = 1;
    const p = this.puma;
    this.raum.broadcast('b11', {
      s: this.soldaten.map(q => [q.i, rund(q.x), rund(q.y), Math.round(q.blick * 100) / 100, q.tot]),
      p: p ? [rund(p.x), rund(p.y), Math.round(p.w * 100) / 100, Math.round(p.turm * 100) / 100] : 0,
      aus: this.aufgegeben ? 1 : 0,
    });
  }
}
