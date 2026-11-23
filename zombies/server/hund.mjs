// Begleiter-Hund: Streuner laufen Spielern zu (je Spieler höchstens einer), folgen ihnen durch Türen und Treppen,
// lenken Zombies ab und bellen, wenn ein Zombie vor der Haustür steht. Der Hund ist unverwundbar, braucht nichts
// und wird mit dem Spieler gespeichert (extra.hund -> speichereSpieler). Maße in Pixeln (8 px = 1 m).
import { schema, t } from '@colyseus/schema';
import { entkoppeln } from './netzfeld.mjs';
import { BREITE, HOEHE, KACHEL, tempoVon, T, WERTE as W, bewege, frei, findeWeg, sichtfrei } from '../client/welt.mjs';

export const Hund = schema({
  x: t.int16(), y: t.int16(),  // ganze Pixel (server/netzfeld.mjs)
  richtung: t.number(),        // Blickrichtung (Bogenmaß)
  ebene: t.string(),           // '' = draußen, sonst Innenraum (wie bei Spielern)
  besitzer: t.string(),        // Sitzungs-ID des Spielers, '' = Streuner
  laeuft: t.boolean(),         // bewegt sich gerade (Laufanimation)
  winselt: t.boolean(),        // ein Zombie hat ihn erreicht: kurz winseln
}, 'Hund');
entkoppeln(Hund, ['x', 'y']);

export const HUND = { ablenkung: 70, streuner: -1 };   // Vorgabe der Einstellung: Wahrscheinlichkeit in %, dass ein Zombie in der Nähe den Hund jagt

const PX = 8;
const RAD = 5;                       // Kollisionsradius
const ZULAUF = 2 * PX;               // so nah muss ein Spieler kommen, damit ihm der Streuner zuläuft
const START_MIN = 40 * PX;           // Streuner entstehen nicht näher am Start
const NAH_MIN = 100 * PX, NAH_MAX = 300 * PX;   // ein Streuner streunt in dieser Entfernung vom Startpunkt
const SICHT = 15 * PX;               // so weit sieht ein Streuner einen Spieler (mit freier Sichtlinie) und läuft ihm zu
const RUF_HOERWEITE = 35 * PX;       // Streuner-Bellen ist so weit zu hören
const KM2_JE_HUND = 0.33;            // automatische Anzahl: ein Streuner je 0,33 km² Kartenfläche (Geretsried 2 ≈ 7)
const FOLGE_NAH = 1.5 * PX, FOLGE_FERN = 3 * PX;   // Abstand zum Besitzer: ab FOLGE_FERN läuft er los, bei FOLGE_NAH bleibt er stehen
const TELEPORT = 30 * PX;            // weiter weg: springt hinter den Besitzer
// Ablenkung (Werte seit Wunsch „Hund lenkt zu wenig ab“; vorher: Radius 8 m, Dauer 4–8 s, Neuwürfeln nur alle 10 s auch nach Fehlwurf)
export const ABLENK_NEU = { radius: 25 * PX, nah: 2 * PX, dauerMin: 8, dauerMax: 14, neuFehl: 1.5, neuNachKontakt: 3, lassLos: 60 * PX };
export const ABLENK_ALT = { radius: 8 * PX, nah: 3 * PX, dauerMin: 4, dauerMax: 8, neuFehl: 10, neuNachKontakt: 10, lassLos: 1e9 };
// radius: Zombies so nah am Hund können ihn jagen; nah: hat der Zombie schon einen Spieler so nah, bleibt er bei ihm;
// neuFehl: nach misslungenem Wurf frühestens so viele Sekunden bis zum nächsten; lassLos: weiter weg vom Hund gibt der Zombie auf
const KONTAKT = 14;                  // Zombie erreicht den Hund
const BELL_ABSTAND = 4 * PX;         // Zombie so nah vor der Haustür: der Hund bellt
const ERLAUBT = new Set([T.STRASSE, T.WIESE, T.PLATZ]);   // Streuner laufen nur über Straßen und Wiesen
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const KRIECHER_TEMPO = 0.28;

// Bewegung in Teilschritten von höchstens 4 px
const gehe = (welt, h, dx, dy) => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < n; i++) bewege(welt, h, dx / n, dy / n, RAD);
};

export class Hunde {
  constructor(raum) {
    this.raum = raum;
    this.info = new Map();   // Hund-ID -> Server-Zustand
    this.nummer = 0;
    this.t = 0;              // eigene Uhr (Sekunden)
    this.suchBudget = 0;
    this.ablenkWerte = ABLENK_NEU;   // Tests können ABLENK_ALT setzen (Vorher-Messung)
  }

  get ablenkung() {
    const e = this.raum.constructor.einstellungen?.hund;
    const a = Number(e?.ablenkung);
    return Number.isFinite(a) ? Math.max(0, Math.min(100, a)) : HUND.ablenkung;
  }

  get streunerEinstellung() {
    const a = Number(this.raum.constructor.einstellungen?.hund?.streuner);
    return Number.isFinite(a) ? Math.max(-1, Math.min(200, Math.round(a))) : HUND.streuner;
  }

  // Anzahl Streuner: Einstellung (-1 = automatisch: 1 je 0,5 km² Kartenfläche, mindestens 1; 0 = keine; sonst fest)
  streunerAnzahl() {
    const e = this.streunerEinstellung;
    if (e >= 0) return e;
    const km2 = BREITE * HOEHE * KACHEL * KACHEL / (PX * PX) / 1e6;   // Kacheln → m² → km²
    return Math.min(20, Math.max(1, Math.round(km2 / KM2_JE_HUND)));
  }

  // Beim Start der Welt: Streuner an zufälligen Orten, der erste streunt 100–300 m vom Start
  start(anzahl = null) {
    const n = anzahl ?? this.streunerAnzahl();
    for (let i = 0; i < n; i++) {
      const o = (i === 0 && this.raum.welt.start ? this.streunerOrt(NAH_MIN, NAH_MAX) : null) ?? this.streunerOrt();
      if (o) this.neuerStreuner(o.x, o.y);
    }
    this.raum.onMessage('hundWeg', client => {
      this.raum.ruehrt?.(client.sessionId);
      this.wegschicken(client.sessionId);
    });
  }

  // Ort für einen Streuner: ohne Entfernungsangabe mindestens START_MIN vom Start, sonst zwischen min und max (px)
  streunerOrt(min = START_MIN, max = Infinity) {
    const r = this.raum, w = r.welt, rnd = r.rnd;
    for (let i = 0; i < 1500; i++) {
      const kx = 1 + Math.floor(rnd() * (BREITE - 2)), ky = 1 + Math.floor(rnd() * (HOEHE - 2));
      if (!ERLAUBT.has(w.hole(kx, ky))) continue;
      const x = (kx + 0.5) * KACHEL, y = (ky + 0.5) * KACHEL;
      if (w.start) { const d = Math.hypot(x - w.start.x, y - w.start.y); if (d < min || d > max) continue; }
      if (!frei(w, x, y, RAD + 3)) continue;
      return { x, y };
    }
    return null;
  }

  neuer(x, y, ebene, besitzer) {
    const h = new Hund(), id = 'd' + (++this.nummer);
    h.x = x; h.y = y; h.richtung = this.raum.rnd() * Math.PI * 2; h.ebene = ebene ?? ''; h.besitzer = besitzer ?? '';
    h.laeuft = false; h.winselt = false;
    this.info.set(id, { modus: besitzer ? 'folgt' : 'streuner', wandelT: 0, steht: true, wandelW: 0, fluchtT: 0, fluchtW: 0, bogen: 1, bellT: 0, rufT: this.t + 20 + this.raum.rnd() * 20, pruefT: 0.5, winselT: 0, weg: null, wegT: 0, steckt: 0, geht: false });
    this.raum.state.hunde.set(id, h);
    return id;
  }
  neuerStreuner(x, y) { return this.neuer(x, y, '', ''); }

  // ---------- Besitzer ----------

  // Spieler bekommt (gespeichert) schon einen Hund: Beitritt
  beitritt(sid, p, x, gespeichert) {
    if (x.bot || !gespeichert?.hund) return;
    x.hund = true;
    const o = this.naehe(p, false);
    this.neuer(o.x, o.y, p.ebene ?? '', sid);
  }

  // zweites Fenster übernimmt die Figur (neue Sitzungs-ID): der Hund bleibt beim Spieler
  besitzerWechsel(alt, neu) {
    for (const h of this.raum.state.hunde.values()) if (h.besitzer === alt) h.besitzer = neu;
  }

  spielerWeg(sid) {
    for (const [id, h] of [...this.raum.state.hunde]) if (h.besitzer === sid) { this.raum.state.hunde.delete(id); this.info.delete(id); }
  }

  // Zahnrad-Knopf: Hund läuft weg und verschwindet (es wird kein neuer Streuner erzeugt)
  wegschicken(sid) {
    const x = this.raum.extra.get(sid);
    if (!x?.hund) return false;
    x.hund = false;
    for (const [id, h] of this.raum.state.hunde) {
      if (h.besitzer !== sid) continue;
      const inf = this.info.get(id), p = this.raum.state.spieler.get(sid);
      h.besitzer = ''; inf.modus = 'weg'; inf.wegT = 7; inf.weg = null;
      inf.fluchtW = p ? Math.atan2(h.y - p.y, h.x - p.x) : h.richtung;
      inf.bogen = this.raum.rnd() < 0.5 ? -0.5 : 0.5;
    }
    this.raum.clients.find(c => c.sessionId === sid)?.send('meldung', { text: '🐕 Der Hund läuft davon' });
    return true;
  }

  // freier Platz neben dem Spieler (hinten = hinter seinem Rücken)
  naehe(p, hinten) {
    const w = this.raum.wv(p.ebene ?? '');
    for (let j = 0; j < 18; j++) {
      const a = hinten ? (p.richtung ?? 0) + Math.PI + (j % 2 ? 1 : -1) * Math.floor((j + 1) / 2) * 0.35 : j * 0.9 + 1;
      const rr = ((hinten ? 18 : 20) + j * 3) * (w.reich ?? 1);
      const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
      if (frei(w, x, y, RAD)) return { x, y };
    }
    return { x: p.x, y: p.y };
  }

  teleport(h, inf, p) {
    const o = this.naehe(p, true);
    h.x = o.x; h.y = o.y; h.ebene = p.ebene ?? ''; inf.weg = null; inf.fluchtT = 0; inf.geht = false; h.laeuft = false;
  }

  // ---------- Takt ----------

  schritt(dt) {
    this.t += dt;
    this.suchBudget = 3;
    const s = this.raum.state;
    for (const [id, h] of [...s.hunde]) {
      const inf = this.info.get(id);
      if (!inf) { s.hunde.delete(id); continue; }
      h.winselt = this.t < inf.winselT;
      if (inf.modus === 'weg') { this.davon(id, h, inf, dt); continue; }
      if (inf.modus === 'streuner') { this.streunen(id, h, inf, dt); continue; }
      const p = s.spieler.get(h.besitzer), x = this.raum.extra.get(h.besitzer);
      if (!p || !x) { this.spielerWeg(h.besitzer); continue; }
      this.folgen(id, h, inf, p, dt);
      inf.pruefT -= dt;
      if (inf.pruefT <= 0) { inf.pruefT = 0.5; this.ablenken(h, inf); this.tuerBellen(h, inf, p); }
    }
  }

  // Streuner: gemächlich umherlaufen; ein Spieler in Reichweite nimmt ihn mit (Bots nie, jeder nur einen)
  streunen(id, h, inf, dt) {
    const w = this.raum.wv(''), r = this.raum.rnd;
    inf.wandelT -= dt;
    if (inf.wandelT <= 0) { inf.wandelT = 2 + r() * 4; inf.steht = r() < 0.4; inf.wandelW = r() * Math.PI * 2; }
    h.laeuft = false;
    if (this.t >= inf.rufT) { inf.rufT = this.t + 20 + r() * 20; this.rufen(h); }
    const ziel = this.sichtZiel(h);
    if (ziel) {   // sieht einen Spieler: läuft zu ihm
      const a = Math.atan2(ziel.y - h.y, ziel.x - h.x), v = W.tempoGehen * 0.9 * dt;
      gehe(w, h, Math.cos(a) * v, Math.sin(a) * v);
      h.richtung = a; h.laeuft = true; inf.steht = false; inf.wandelT = 0.5;
    } else if (!inf.steht) {
      const v = W.tempoGehen * 0.4 * dt, x0 = h.x, y0 = h.y;
      gehe(w, h, Math.cos(inf.wandelW) * v, Math.sin(inf.wandelW) * v);
      const k = w.hole(Math.floor(h.x / KACHEL), Math.floor(h.y / KACHEL));
      if (!ERLAUBT.has(k) || Math.hypot(h.x - x0, h.y - y0) < v * 0.3) { h.x = x0; h.y = y0; inf.wandelW = r() * Math.PI * 2; inf.wandelT = Math.min(inf.wandelT, 0.5); }
      else { h.richtung = inf.wandelW; h.laeuft = true; }
    }
    for (const [sid, p] of this.raum.state.spieler) {
      const x = this.raum.extra.get(sid);
      if (!x || x.bot || x.hund || p.verbunden === false || p.unten || p.anBord || p.zombie > 0 || (p.ebene ?? '') !== (h.ebene ?? '')) continue;
      if (Math.hypot(p.x - h.x, p.y - h.y) > ZULAUF) continue;
      x.hund = true; h.besitzer = sid; inf.modus = 'folgt'; inf.weg = null; inf.pruefT = 0.5;
      this.raum.clients.find(c => c.sessionId === sid)?.send('meldung', { text: '🐕 Ein Hund läuft dir zu!' });
      break;
    }
  }

  // Spieler (kein Bot, ohne eigenen Hund), den dieser Streuner im Umkreis SICHT mit freier Sichtlinie sieht (nächster)
  sichtZiel(h) {
    const w = this.raum.wv(''), s = this.raum.state;
    let best = null, bd = SICHT;
    for (const [sid, p] of s.spieler) {
      const x = this.raum.extra.get(sid);
      if (!x || x.bot || x.hund || p.verbunden === false || p.unten || p.anBord || p.zombie > 0 || (p.ebene ?? '') !== (h.ebene ?? '')) continue;
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d < bd && sichtfrei(w, h.x, h.y, p.x, p.y)) { best = p; bd = d; }
    }
    return best;
  }

  // Streuner bellt von selbst: nur Spieler in RUF_HOERWEITE auf gleicher Ebene hören es; kein Lärm für Zombies
  rufen(h) {
    const msg = { x: h.x, y: h.y, ebene: h.ebene ?? '' };
    for (const c of this.raum.clients) {
      const p = this.raum.state.spieler.get(c.sessionId);
      if (p && (p.ebene ?? '') === msg.ebene && Math.hypot(p.x - h.x, p.y - h.y) < RUF_HOERWEITE) c.send('hundBellen', msg);
    }
  }

  // weggeschickt: läuft im Bogen davon und verschwindet
  davon(id, h, inf, dt) {
    inf.wegT -= dt;
    if (inf.wegT <= 0) { this.raum.state.hunde.delete(id); this.info.delete(id); return; }
    this.renne(h, inf, dt, 1.3);
  }

  // im Bogen davonrennen (fluchtW dreht sich langsam); steckt er fest, dreht er stärker ab
  renne(h, inf, dt, faktor) {
    const w = this.raum.wv(h.ebene ?? ''), v = W.tempoGehen * faktor * dt * tempoVon(w), x0 = h.x, y0 = h.y;
    inf.fluchtW += inf.bogen * dt;
    gehe(w, h, Math.cos(inf.fluchtW) * v, Math.sin(inf.fluchtW) * v);
    if (Math.hypot(h.x - x0, h.y - y0) < v * 0.3) inf.fluchtW += 1.2 * (inf.bogen < 0 ? -1 : 1);
    h.richtung = inf.fluchtW; h.laeuft = true;
  }

  // dem Besitzer folgen: wartet, wenn dieser steht; geht mit durch Türen und Treppen; weit weg = hinter ihn springen
  folgen(id, h, inf, p, dt) {
    const d = Math.hypot(p.x - h.x, p.y - h.y), R = this.raum.wv(h.ebene ?? '').reich ?? 1;   // R: drinnen im Feinraster kleinere Abstände
    if ((h.ebene ?? '') !== (p.ebene ?? '') || d > TELEPORT) { this.teleport(h, inf, p); return; }
    if (inf.fluchtT > 0) {
      inf.fluchtT -= dt;
      if (d > 20 * PX * R) inf.fluchtT = 0;
      else { this.renne(h, inf, dt, 1.5); return; }
    }
    inf.geht = d > FOLGE_FERN * R || (inf.geht && d > FOLGE_NAH * R);
    h.laeuft = false;
    if (!inf.geht) { inf.weg = null; return; }
    const welt = this.raum.wv(h.ebene ?? ''), v = W.tempoGehen * (d > 90 * R ? 1.4 : d > 40 * R ? 1.15 : 0.8) * dt * tempoVon(welt);
    if (sichtfrei(welt, h.x, h.y, p.x, p.y)) {
      const a = Math.atan2(p.y - h.y, p.x - h.x), x0 = h.x, y0 = h.y;
      gehe(welt, h, Math.cos(a) * v, Math.sin(a) * v);
      h.richtung = a; h.laeuft = true; inf.weg = null;
      inf.steckt = Math.hypot(h.x - x0, h.y - y0) < v * 0.2 ? inf.steckt + dt : 0;
      if (inf.steckt > 0.6) { inf.steckt = 0; this.gehePfad(welt, h, inf, p, 0, dt, true); }
    } else {
      inf.wegT -= dt;
      if (inf.wegT <= 0) { inf.weg = null; inf.wegT = 1; }
      if (this.gehePfad(welt, h, inf, p, v, dt) === 'keinWeg') this.teleport(h, inf, p);
    }
  }

  gehePfad(welt, h, inf, ziel, v, dt, nurSuchen = false) {
    if (!inf.weg || nurSuchen) {
      if (this.suchBudget <= 0) return true;
      this.suchBudget--;
      inf.weg = findeWeg(welt, h.x, h.y, ziel.x, ziel.y, 9, 30000);
      if (!inf.weg) return 'keinWeg';
      if (nurSuchen) return true;
    }
    while (inf.weg.length > 1 && Math.hypot(inf.weg[0].x - h.x, inf.weg[0].y - h.y) < 10) inf.weg.shift();
    const wp = inf.weg[0], a = Math.atan2(wp.y - h.y, wp.x - h.x), x0 = h.x, y0 = h.y;
    gehe(welt, h, Math.cos(a) * v, Math.sin(a) * v);
    h.richtung = a; h.laeuft = true;
    inf.steckt = Math.hypot(h.x - x0, h.y - y0) < v * 0.2 ? inf.steckt + dt : 0;
    if (inf.steckt > 2) inf.weg = null;
    return true;
  }

  // ---------- Ablenkung ----------

  // Zombies im Umkreis jagen mit Wahrscheinlichkeit den Hund (4–8 s) statt ihres Ziels; er rennt im Bogen weg
  ablenken(h, inf) {
    const r = this.raum, proz = this.ablenkung, A = this.ablenkWerte;
    if (proz <= 0) return;
    let n = 0, sx = 0, sy = 0;
    for (const [zid, z] of r.state.zombies) {
      if ((z.ebene ?? '') !== (h.ebene ?? '') || z.hp <= 0 || z.haengt) continue;
      if (Math.hypot(z.x - h.x, z.y - h.y) > A.radius) continue;
      const zi = r.zombieInfo.get(zid);
      if (!zi || zi.schlaeft || zi.hundBis > this.t || zi.hundNeu > this.t) continue;
      const pz = zi.ziel ? r.state.spieler.get(zi.ziel) : null;
      if (pz && !pz.unten && (pz.ebene ?? '') === (z.ebene ?? '') && Math.hypot(pz.x - z.x, pz.y - z.y) < A.nah) continue;   // direkt am Spieler: bleibt dort
      zi.hundNeu = this.t + A.neuFehl;   // erst nach einer Pause neu würfeln
      if (r.rnd() * 100 >= proz) continue;
      zi.hundBis = this.t + A.dauerMin + r.rnd() * (A.dauerMax - A.dauerMin); zi.hundId = [...r.state.hunde].find(([, q]) => q === h)?.[0];
      zi.ziel = null; zi.punkt = null; zi.mensch = null; zi.suche = false; zi.sucheT = 0;
      n++; sx += z.x; sy += z.y;
    }
    if (!n) return;
    inf.fluchtT = 3 + r.rnd() * 2;
    inf.fluchtW = Math.atan2(h.y - sy / n, h.x - sx / n) + (r.rnd() < 0.5 ? 0.6 : -0.6);
    inf.bogen = r.rnd() < 0.5 ? -0.9 : 0.9;
    this.belle(h, inf);
  }

  // Aufruf aus zombieSchritt: true = der Zombie jagt gerade den Hund (Schritt erledigt)
  zombieJagt(z, info, dt) {
    const r = this.raum;
    const h = info.hundId ? r.state.hunde.get(info.hundId) : null;
    if (!(info.hundBis > this.t) || !h || (h.ebene ?? '') !== (z.ebene ?? '')) { info.hundBis = 0; return false; }
    const d = Math.hypot(h.x - z.x, h.y - z.y);
    if (d > this.ablenkWerte.lassLos) { info.hundBis = 0; return false; }
    // Hat der Zombie den Hund erreicht, jagt er ihn weiter (der Hund springt weg), statt sofort zum Spieler zurückzukehren;
    // die Jagd endet erst mit Ablauf der Dauer
    if (d < KONTAKT) { this.erreicht(info.hundId, h, z); info.hundNeu = this.t + this.ablenkWerte.neuNachKontakt; return true; }
    info.punkt = null; z.jagt = true;
    z.richtung = Math.atan2(h.y - z.y, h.x - z.x);
    r.zombieGehen(z, z.richtung, W.zombieTempoJagen * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info);
    return true;
  }

  // Zombie hat den Hund erreicht: richtet nichts aus; der Hund winselt kurz und springt weg
  erreicht(id, h, z) {
    const inf = this.info.get(id);
    if (!inf) return;
    inf.winselT = this.t + 1.2; h.winselt = true;
    const a = Math.atan2(h.y - z.y, h.x - z.x), w = this.raum.wv(h.ebene ?? '');
    for (let l = 40; l >= 12; l -= 7) {
      const x = h.x + Math.cos(a) * l, y = h.y + Math.sin(a) * l;
      if (frei(w, x, y, RAD) && sichtfrei(w, h.x, h.y, x, y)) { h.x = x; h.y = y; break; }
    }
    inf.fluchtT = Math.max(inf.fluchtT, 2.5); inf.fluchtW = a; inf.weg = null;
  }

  // ---------- Bellen (kein Lärm: lockt keine Zombies an) ----------

  belle(h, inf) {
    if (this.t < inf.bellT) return false;
    inf.bellT = this.t + 3 + this.raum.rnd() * 2;
    this.raum.broadcast('hundBellen', { x: h.x, y: h.y, ebene: h.ebene ?? '' });
    return true;
  }

  // Besitzer und Hund sind in einem Haus, ein Zombie steht draußen vor der Haustür: bellen (alle 3–5 s)
  tuerBellen(h, inf, p) {
    const m = EBENE_MUSTER.exec(h.ebene ?? ''), mp = EBENE_MUSTER.exec(p.ebene ?? '');
    if (!m || !mp || m[1] !== mp[1]) return;
    const haus = this.raum.welt.haeuser?.[Number(m[1])];
    if (!haus?.tuer) return;
    const tx = (haus.tuer.x + 0.5) * KACHEL, ty = (haus.tuer.y + 0.5) * KACHEL;
    for (const z of this.raum.state.zombies.values()) {
      if (z.ebene || z.hp <= 0) continue;
      if (Math.hypot(z.x - tx, z.y - ty) < BELL_ABSTAND) { this.belle(h, inf); return; }
    }
  }

  // Hund des Spielers (für Tests und Meldungen)
  vonSpieler(sid) {
    for (const [id, h] of this.raum.state.hunde) if (h.besitzer === sid) return { id, h, inf: this.info.get(id) };
    return null;
  }
}
