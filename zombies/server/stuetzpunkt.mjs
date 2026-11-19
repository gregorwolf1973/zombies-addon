// Bundeswehr-Stützpunkt, Verhalten (Aufbau und Grafik: client/stuetzpunkt.mjs):
// MG-Nester und Puma schießen auf Zombies draußen, Ärzte heilen, Ärzte und Soldaten handeln, nach N Spieltagen fällt das Lager.
// Zustand in state.stuetzpunkt: '' = kein Stützpunkt auf der Karte, 'steht', 'gefallen' (wird mit der Welt gespeichert) oder
// 'aus' (Schalter „Stützpunkt aktiv“ aus: Figuren weg, nichts schießt, kein Handel – ohne Zombies und ohne Fall).
import { KACHEL, WAFFEN, sichtfrei, HANDEL, HANDEL_ABSTAND, HANDEL_RAETSEL, bezahlung, MUNITION_MAX, DINGE } from '../client/welt.mjs';
import { imLager, planKoord, handelPartner, zeltWandImWeg, rahmen, SP_BREITE } from '../client/stuetzpunkt.mjs';

export const MG_REICHWEITE = 45 * 8;       // 45 m (8 px je Meter)
export const PUMA_REICHWEITE = 60 * 8;     // 60 m
export const SOLDAT_REICHWEITE = 35 * 8;   // Soldaten an ihren Posten: Gewehr, 35 m
const SOLDAT_PAUSE = 1.3, SOLDAT_SCHADEN = 100, SOLDAT_TREFFER = 0.75, SOLDAT_LAERM = 380;
export const MG_SCHADEN = WAFFEN.gewehr.schaden;   // MG-Nester treffen wie bisher mit Gewehrschaden; wirksam ist die Einstellung waffen.gewehr.schaden
const SALVE = 3, SALVE_TAKT = 0.15, SALVE_PAUSE = 1.1;   // kurze Feuerstöße: 3 Schuss, dann gut eine Sekunde Pause
const PUMA_PAUSE = 3.5, PUMA_DREH = 2.4;        // alle 3,5 s ein Schuss; Turm dreht 2,4 rad/s
// Puma fährt auf einer Bahn hinter dem Draht (Bauplan-Rahmen: v = 2,6, u von Rand zu Rand, Kacheln): ohne Angreifer hin und her mit
// Pausen an den Enden, bei Zombies vor dem Lager zur Höhe der Angreifer. Die Bahn liegt frei von festen Hindernissen (Draht endet bei
// v 1,75, Sandsäcke und MG-Nester beginnen bei v ≥ 3,25), darum braucht der Puma selbst keine Sperre im Feinraster.
const PUMA_V = 2.6, PUMA_U0 = 2.5, PUMA_U1 = SP_BREITE - 2.5;
const PUMA_STREIFE = 0.7, PUMA_JAGD = 1.5, PUMA_WENDE = 1.4;   // Kacheln/s Streife, Kacheln/s Angriff, rad/s Wannendrehung
const KANONE_SCHADEN = 100, KANONE_FLAECHE = 60, KANONE_RADIUS = 30;
const MG_LAERM = 520, PUMA_LAERM = 760;
const HEILEN_PRO_SEK = 2;
const SCAN_TAKT = 0.25;
const TAU = Math.PI * 2;

const diffWinkel = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class Stuetzpunkt {
  constructor(raum) {
    this.raum = raum;
    this.nester = [];
    this.puma = null;
    this.trefferChance = 0.8;     // Anteil der MG-Schüsse, die treffen (Tests setzen 1)
    this.schuetze = { name: 'Bundeswehr', x: 0, y: 0, besiegt: 0 };   // „von“ für raum.schaden()
  }

  get sp() { return this.raum.welt.stuetzpunkt; }
  einst() { return { aktiv: true, falltage: 3, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  steht() { return this.raum.state.stuetzpunkt === 'steht'; }

  // Spieltage seit Weltbeginn (state.zeit zählt Sekunden Spielzeit, ein Spieltag = tagMinuten echte Minuten)
  spieltage() { return this.raum.state.zeit / ((this.raum.einstellungen?.()?.tagMinuten || 48) * 60); }

  // beim Aufbau der Welt: Zustand aus dem Speicher (nur wenn er zur Welt passt)
  start(stand, passt) {
    const s = this.raum.state, sp = this.sp;
    s.stuetzpunkt = ''; s.bwTurm = 0;
    this.nester = []; this.puma = null; this.schuetzen = [];
    if (!sp) return;
    sp.teile.forEach((t, n) => {
      if (t.art === 'mgnest') this.nester.push({ n, x: t.x, y: t.y, blick: t.blick, kuehl: 0, salve: 0, takt: 0, scan: 0, ziel: null });
      else if (t.art === 'puma') this.puma = { n, x: t.turm.x, y: t.turm.y, kuehl: PUMA_PAUSE / 2, scan: 0, ziel: null, u: planKoord(sp, t.x, t.y).u, richtung: 1, warte: 2, sollU: null, scanU: 0 };
      // jeder Soldat an seinem Posten schießt mit (er bleibt dabei stehen)
      else if (t.art === 'posten' && t.rolle === 'soldat') this.schuetzen.push({ n, x: t.x, y: t.y, kuehl: 0.5 + (n % 5) * 0.2, scan: 0, ziel: null });
    });
    if (this.puma) { const pt = sp.teile[this.puma.n]; s.bwTurm = pt.turm.winkel; s.bwX = pt.x; s.bwY = pt.y; s.bwW = pt.winkel; }
    s.stuetzpunkt = passt && stand?.stuetzpunkt === 'gefallen' ? 'gefallen' : 'steht';
    if (s.stuetzpunkt === 'gefallen') this.zombiesErzeugen();
    else if (!this.einst().aktiv) s.stuetzpunkt = 'aus';
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
    if (tage > 0 && this.spieltage() >= tage) return this.faellt();
    this.verteidigen(dt);
    this.heilen(dt);
  }

  // ---------- Fall ----------
  faellt() {
    const r = this.raum;
    r.state.stuetzpunkt = 'gefallen';
    this.zombiesErzeugen();
    r.broadcast('meldung', { text: '📻 Der Bundeswehr-Stützpunkt ist gefallen! Soldaten, Ärzte und Verwundete sind verloren – in den Zelten und hinter dem Draht lauern jetzt Zombies. Die Kisten sind noch voll.', lang: true });
    r.speichereWelt?.();
  }

  // an jedem Posten (Soldaten, MG-Nester, Ärzte, Verwundete) steht ein Zombie auf; sie bleiben und zählen nicht zum Soll
  zombiesErzeugen() {
    const r = this.raum, sp = this.sp;
    let i = 0;
    for (const t of sp.teile) {
      let x, y;
      if (t.art === 'mgnest') { x = t.x - Math.cos(t.blick) * 5; y = t.y - Math.sin(t.blick) * 5; }
      else if (t.art === 'posten' && ['soldat', 'arzt', 'verwundet'].includes(t.rolle)) { x = t.x; y = t.y; }
      else continue;
      const platz = r.freierPlatz({ x, y }, i++);
      const id = r.setzeZombie(platz.x, platz.y, '');
      const info = r.zombieInfo.get(id);
      info.bleibt = true; info.schlaeft = false; info.steht = false;
    }
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
    sch.kuehl = Math.max(0, sch.kuehl - dt);
    if (sch.kuehl > 0) return;
    let z = this.gueltig(sch.ziel, sch.x, sch.y, SOLDAT_REICHWEITE);
    if (!z) {
      sch.scan -= dt;
      if (sch.scan > 0) return;
      sch.scan = SCAN_TAKT;
      sch.ziel = this.waehleZiel(sch.x, sch.y, SOLDAT_REICHWEITE);
      z = this.gueltig(sch.ziel, sch.x, sch.y, SOLDAT_REICHWEITE);
      if (!z) return;
    }
    sch.kuehl = SOLDAT_PAUSE * (0.85 + r.rnd() * 0.3);
    const treffer = r.rnd() < SOLDAT_TREFFER;
    const w = Math.atan2(z.y - sch.y, z.x - sch.x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - sch.x, z.y - sch.y);
    r.broadcast('bwschuss', { art: 'gewehr', n: sch.n, x1: sch.x, y1: sch.y, x2: sch.x + Math.cos(w) * d, y2: sch.y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) this.treffen(sch.ziel, z, SOLDAT_SCHADEN, sch);
    r.laerm(sch.x, sch.y, SOLDAT_LAERM, true, '');
  }

  nestSchritt(nest, dt) {
    nest.kuehl = Math.max(0, nest.kuehl - dt);
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

  // Angreifer vor dem Lager: Mittel von u der (bis zu) 6 Zombies, die der Front am nächsten sind (v von −14 bis 7, Kacheln); sonst null
  angriffsU() {
    const sp = this.sp, r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung), [ox, oy] = r.ort(0, 0), liste = [];
    for (const z of this.raum.state.zombies.values()) {
      if (z.ebene) continue;
      const dx = (z.x - ox) / KACHEL, dy = (z.y - oy) / KACHEL, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
      if (v < -14 || v > 7 || u < -6 || u > SP_BREITE + 6) continue;
      liste.push([Math.abs(v - 1.5), u]);
    }
    if (!liste.length) return null;
    liste.sort((a, b) => a[0] - b[0]);
    const n = liste.slice(0, 6);
    return Math.min(PUMA_U1, Math.max(PUMA_U0, n.reduce((a, q) => a + q[1], 0) / n.length));
  }

  // Fahren: Wanne dreht in Fahrtrichtung (±u), rollt erst bei passender Richtung; Turmmitte = Wannenmitte
  pumaFahren(p, dt) {
    if (p.fest) return;   // Tests: Puma steht
    const s = this.raum.state, sp = this.sp, r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung);
    p.scanU -= dt;
    if (p.scanU <= 0) { p.scanU = 0.5; p.sollU = this.angriffsU(); }
    let ziel = p.u, tempo = 0;
    if (p.sollU !== null) { ziel = p.sollU; tempo = PUMA_JAGD; p.warte = 0; }
    else if (p.warte > 0) p.warte -= dt;
    else {
      const ende = p.richtung > 0 ? PUMA_U1 : PUMA_U0;
      if (Math.abs(p.u - ende) < 0.05) { p.richtung = -p.richtung; p.warte = 3 + this.raum.rnd() * 3; } else { ziel = ende; tempo = PUMA_STREIFE; }
    }
    const du = ziel - p.u;
    if (tempo === 0 || Math.abs(du) < 0.15) return;
    const soll = du > 0 ? r.th : r.th + Math.PI, diff = diffWinkel(soll, s.bwW), dreh = Math.min(Math.abs(diff), PUMA_WENDE * dt);
    let w = s.bwW + Math.sign(diff) * dreh; if (w > Math.PI) w -= TAU; if (w < -Math.PI) w += TAU;
    const rund = (a) => Math.round(a * 1000) / 1000;
    if (dreh > 0) s.bwW = rund(w);
    if (Math.abs(diff) - dreh > 0.35) return;
    p.u += Math.sign(du) * Math.min(Math.abs(du), tempo * dt);
    const [x, y] = r.ort(p.u, PUMA_V);
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
    if (Math.abs(diff) > 0.06 || p.kuehl > 0) return;
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
    } else if (p.rucksack.length - zahl.length + a.menge > p.plaetze) return sag('Dein Rucksack ist zu voll');
    for (const d of zahl) p.rucksack.splice(p.rucksack.indexOf(d), 1);
    if (a.gibt === 'munition') p.munition = Math.min(MUNITION_MAX, p.munition + a.menge);
    else for (let i = 0; i < a.menge; i++) p.rucksack.push(a.gibt);
    const was = a.gibt === 'munition' ? `🧰 ${a.menge} Schuss` : `${DINGE[a.gibt].zeichen} ${DINGE[a.gibt].name}`;
    client.send('handel', { ok: true, text: `${h.zeichen} Getauscht: ${was}` });
  }

  // Gegenwert prüfen und übergeben (für die Rätsel-Bezahlung): null = ok, sonst Fehltext
  uebergeben(p, a) {
    if (a.gibt === 'munition') {
      if (p.munition >= MUNITION_MAX) return 'Deine Munition ist schon voll';
      p.munition = Math.min(MUNITION_MAX, p.munition + a.menge);
    } else {
      if (p.rucksack.length + a.menge > p.plaetze) return 'Dein Rucksack ist zu voll';
      for (let i = 0; i < a.menge; i++) p.rucksack.push(a.gibt);
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
    if (a.gibt === 'munition' ? p.munition >= MUNITION_MAX : p.rucksack.length + a.menge > p.plaetze) return sag(a.gibt === 'munition' ? 'Deine Munition ist schon voll' : 'Dein Rucksack ist zu voll');
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

