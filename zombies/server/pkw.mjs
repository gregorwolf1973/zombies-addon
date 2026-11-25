// Autos mit Autoschlüssel fahren (Regeln und Maße: client/pkw.mjs). Ein geparktes Auto der Welt wird beim Einsteigen mit Schlüssel zu einem
// fahrbaren Fahrzeug (Klasse FahrbarPkw, gleiche Fahr-/Einsteigelogik wie Boxer/Puma/Leopard aus server/fahrbar.mjs, Liste raum.fahrbare.liste).
// Unterschiede zu den Panzern: kein Turm, eigene Lebenspunkte (Einstellung auto.leben), Höchsttempo auto.tempo (Vorgabe 80 km/h),
// Zombies werden je nach Tempo überfahren (tot ab auto.zombieTotKmh, darunter Schaden und weggeschleudert) und kosten das Auto etwas Blech,
// ein Aufprall (Hauswand, Baum, Zaun, geparktes Auto, anderes Fahrzeug, Panzer) kostet Fahrer und Mitfahrer Lebensenergie nach Tempo
// (ab auto.crashAb km/h, auto.crashSchaden % bei 80 km/h). Bei 0 Lebenspunkten steigen alle aus, das Auto wird zum Wrack und brennt
// (Rauch → Feuer → ggf. Explosion wie ein Verkehrsunfall, server/unfall.mjs). Fahren darf nur, wer einen Autoschlüssel hat; Mitfahrer
// (auch Bots) brauchen keinen. Der Schlüssel bleibt im Rucksack. Fahrzeuge der Verkehrssimulation sind nie Ziel.
import { frei, bewege, kmhZuPx, WERTE as W } from '../client/welt.mjs';
import { fzRechtecke, kreisImRechteck, aufParkAuto } from '../client/fzkollision.mjs';
import { imFussabdruck } from '../client/evak.mjs';
import { PKW, PKW_ART, PKW_ID, PKW_VORGABE, SCHLUESSEL_MOEBEL, parkAutoBei, parkWinkel, parkAutoWeg, pkwNah, hatSchluessel, pkwEinsteigbar, crashAnteil, crashAutoSchaden, istStreife, streifeBei, fahrberechtigt } from '../client/pkw.mjs';
import { Fahrbar, FAHRWERK, PX, lenkWerte } from './fahrbar.mjs';
import { stammBei, RUECK_ANTEIL } from '../client/walze.mjs';
import { LAENGE, BREITE_FZ } from './verkehr.mjs';

export const kmhVon = px => px / PX * 3.6;
export const pkwEinst = raum => ({ ...PKW_VORGABE, ...(raum?.einstellungen?.()?.auto ?? {}) });

const KOLL_R = 3;                       // Spielraum der Rumpfpunkte gegen Wände/Bäume (px)
const ZOMBIE_PAUSE = 0.8;               // s, in denen derselbe Zombie nicht nochmal getroffen wird
const ZOMBIE_BREMSE = 0.9;              // jeder Treffer kostet 10 % Tempo
const SCHLEUDER = 12;                   // px, die ein langsam getroffener Zombie zur Seite fliegt
const CRASH_PAUSE = 0.6;                // s zwischen zwei Aufprall-Schäden
const BOT_EINSTIEG = 110;               // px: Bots in dieser Nähe steigen zu, wenn ein Mensch im stehenden Auto sitzt
const RAUCH_AB = 0.3;                   // unter 30 % Lebenspunkten raucht das Auto
const PUNKTE = (() => {                  // Rumpfpunkte (längs × quer) im Fahrzeugrahmen
  const p = [];
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) p.push([u * PKW.laenge / 2, v * PKW.breite / 2]);
  return p;
})();

// Lenkung aus der Einstellung (Grad/s) in rad/s; ungültig → Vorgabe
const lenkRad = g => (Number.isFinite(Number(g)) && Number(g) > 0 ? Number(g) : PKW_VORGABE.lenkung) * Math.PI / 180;

export class FahrbarPkw extends Fahrbar {
  constructor(raum, bid) {
    super(raum, 'boxer', { id: PKW_ID(bid) });
    this.art = PKW_ART; this.bid = bid; this.streife = istStreife(bid);   // Streifenwagen einer Sperre: fahrbar ohne Autoschlüssel, mit Blaulicht und Sirene
    this.m = { name: this.streife ? 'Streifenwagen' : PKW.name, laenge: PKW.laenge, breite: PKW.breite, turmX: 0, turmY: 0, muendung: 0 };
    this.von = { name: 'Auto', x: 0, y: 0, besiegt: 0 };
    const e = this.einstAuto();
    this.lebenMax = Math.max(1, Number(e.leben) || PKW_VORGABE.leben); this.leben = this.lebenMax;
    this.andere = [];                     // Rechtecke der anderen Fahrzeuge (je Takt neu)
    this.pause = new Map();               // Zombie → Uhrzeit, ab der er wieder getroffen werden kann
    this.uhr = 0; this.crashBis = 0; this.botUhr = 0; this.laermUhr = 0; this.sireneUhr = 0; this.letzteFrei = true; this.startBlock = 0;
  }

  einstAuto() { return pkwEinst(this.raum); }
  plaetze() { return Math.max(1, Math.round(Number(this.einstAuto().plaetze) || PKW_VORGABE.plaetze)); }
  fahrwerk() {
    const kmh = Number(this.einstAuto().tempo);
    return { ...FAHRWERK, beschleunigung: 6 * PX, bremse: 12 * PX, drehrate: lenkRad(this.einstAuto().lenkung), drehrateStand: lenkRad(this.einstAuto().lenkung) * 0.4, rueckwaerts: RUECK_ANTEIL, vmax: kmhZuPx(Number.isFinite(kmh) && kmh > 0 ? kmh : PKW_VORGABE.tempo) };
  }
  // weich lenken (server/fahrbar.mjs): Werte aus auto.lenkWeich/lenkTempo/lenkTotzone/spurhilfe
  lenkEinst() { const a = this.einstAuto(); return lenkWerte(a.lenkWeich, a.lenkTempo, a.lenkTotzone, a.spurhilfe); }
  // Fahrer ist der erste Mensch mit Autoschlüssel; ohne ihn rollt das Auto aus
  get fahrer() {
    for (const sid of this.insassen) if (!this.istBot(sid) && fahrberechtigt(this.bid, this.spieler(sid))) return sid;
    return null;
  }
  nahGenug(p) { return !!this.f && pkwNah(this.f, p.x, p.y); }
  // Zahl der Rumpfpunkte an Pose (x, y, w), die in einer Wand/einem Baum/Zaun, einem geparkten Auto oder einem anderen Fahrzeug liegen
  blockPunkte(welt, x, y, w) {
    const c = Math.cos(w), s = Math.sin(w);
    let n = 0;
    for (const [u, v] of PUNKTE) {
      const px = x + c * u - s * v, py = y + s * u + c * v;
      if (!frei(welt, px, py, KOLL_R) || aufParkAuto(welt, px, py, 1) || stammBei(welt, px, py, 1)) { n++; continue; }   // auch Baumstämme
      for (const r of this.andere) if (Math.abs(px - r.x) <= r.hl + 3 && Math.abs(py - r.y) <= r.hl + 3 && kreisImRechteck(r, px, py, 1)) { n++; break; }
    }
    return n;
  }
  // Pose frei? Steht das Auto schon beim Aufstellen eng (Parklücke an der Hecke, Luftbild-Autos dicht an dicht), darf es sich bewegen,
  // solange es nicht schlimmer wird, bis es einmal ganz frei ist. letzteFrei merkt sich das Ergebnis für die Aufprallerkennung.
  frei(welt, x, y, w) {
    const n = this.blockPunkte(welt, x, y, w);
    const ok = n === 0 || (this.startBlock > 0 && n <= this.startBlock);
    if (n === 0) this.startBlock = 0;
    this.letzteFrei = ok;
    return ok;
  }

  aussteigen(sid) {
    if (!this.sitzt(sid)) return false;
    const vorher = this.fahrer, p = this.spieler(sid);
    this.insassen = this.insassen.filter(i => i !== sid);
    if (p) {
      const q = this.platzNeben();
      p.x = q.x; p.y = q.y; p.anBord = false; p.imBoxer = false; p.ebene = '';
      const x = this.raum.extra.get(sid); if (x) x.schonT = 3;   // 3 s lang beißen Zombies nicht
    }
    const jetzt = this.fahrer;
    if (jetzt && jetzt !== vorher) this.sendeAn(jetzt, '🚗 Du fährst jetzt das Auto.');
    return true;
  }

  kannEinsteigen(sid) {
    const p = this.spieler(sid), x = this.raum.extra.get(sid);
    if (!this.f || !p || !x || x.bot || p.anBord || p.imBoxer || p.unten || p.zombie > 0 || p.ebene || p.kamera || p.verbunden === false) return false;
    if (this.raum.state.phase !== 'spiel') return false;
    const drin = this.insassen.map(sid => ({ schluessel: fahrberechtigt(this.bid, this.spieler(sid)), bot: this.istBot(sid) }));
    if (!pkwEinsteigbar(drin, fahrberechtigt(this.bid, p), this.plaetze())) return false;   // leeres Auto (oder niemand mit Schlüssel am Steuer): nur mit Autoschlüssel
    return this.nahGenug(p);
  }

  einsteigen(sid) {
    if (!this.kannEinsteigen(sid)) return false;
    this.zusteigen(sid);
    const f = this.fahrer;
    this.sendeAn(sid, f === sid ? (this.streife ? '🚓 Du fährst den Streifenwagen (Gehen-Taste lenkt, E steigt aus, H = Blaulicht + Sirene, R = Radio). Die Sirene lockt Zombies an.' : '🚗 Du fährst das Auto (Gehen-Taste lenkt, E steigt aus, R = Radio). Zombies überfahren kostet Blech, Aufprall kostet Leben.') : `🚗 Du fährst mit – ${this.spieler(f)?.name ?? 'niemand'} fährt.`);
    return true;
  }
  zusteigen(sid) {
    const p = this.spieler(sid);
    this.insassen.push(sid);
    p.anBord = true; p.imBoxer = true; p.x = this.f.x; p.y = this.f.y; p.aktion = ''; p.fortschritt = 0;
  }

  // Bots steigen zu, solange ein Mensch im stehenden Auto sitzt; sitzt kein Mensch mehr drin, steigen sie aus
  bots() {
    const r = this.raum, s = r.state, f = this.f;
    const mensch = this.insassen.some(sid => !this.istBot(sid));
    if (!mensch) { for (const sid of [...this.insassen]) if (this.istBot(sid)) this.aussteigen(sid); return; }
    if (Math.abs(this.v) >= 1) return;
    for (const [sid, p] of s.spieler) {
      if (this.insassen.length >= this.plaetze()) return;
      if (!this.istBot(sid) || p.anBord || p.imBoxer || p.unten || p.zombie > 0 || p.ebene || !(p.hp > 0)) continue;
      if (Math.abs(p.x - f.x) > BOT_EINSTIEG || Math.abs(p.y - f.y) > BOT_EINSTIEG || Math.hypot(p.x - f.x, p.y - f.y) > BOT_EINSTIEG) continue;
      this.zusteigen(sid);
    }
  }

  // Rechtecke aller anderen Fahrzeuge (Verkehr, Wracks, Panzer, andere Autos, Evakuierung) für die Kollision
  andereFahrzeuge() {
    const fz = fzRechtecke(this.raum.state.fahrzeuge), liste = [];
    for (const r of [...fz.steht, ...fz.faehrt]) if (r.id !== this.id) liste.push(r);
    for (const [id, o] of this.raum.state.fahrzeuge) {
      if (o.art !== 'evakuierung' || id === this.id) continue;
      const w = o.richtung ?? 0;
      liste.push({ id, x: o.x, y: o.y, c: Math.cos(w), s: Math.sin(w), hl: (LAENGE.evakuierung ?? 96) / 2, hb: (BREITE_FZ.evakuierung ?? 22) / 2 });
    }
    return liste;
  }

  schritt(dt) {
    const f = this.f; if (!f) return;
    const r = this.raum, s = r.state;
    this.uhr += dt;
    for (const sid of [...this.insassen]) {
      const p = s.spieler.get(sid);
      if (!p) { this.insassen = this.insassen.filter(i => i !== sid); continue; }
      if (!p.anBord || !p.imBoxer) { this.insassen = this.insassen.filter(i => i !== sid); p.imBoxer = false; continue; }
      if (p.verbunden === false || p.zombie > 0 || p.unten || p.kamera) this.aussteigen(sid);
    }
    this.botUhr -= dt;
    if (this.botUhr <= 0) { this.botUhr = 0.5; this.bots(); }
    const fahrer = this.fahrer;
    const e = fahrer && this.letzteEingabe ? this.letzteEingabe : { dx: 0, dy: 0 };
    if (!fahrer) this.letzteEingabe = { dx: 0, dy: 0 };
    this.andere = this.andereFahrzeuge();
    this.letzteFrei = true;
    this.fahren(e, dt);
    if (this.anstoss > 0 && this.uhr >= this.crashBis) this.aufprall(kmhVon(this.anstoss));   // Tempo quer zur Kante (frontal: alles, schräg: Gleiten kostet wenig)
    if (!this.f) return;
    for (const sid of this.insassen) { const p = s.spieler.get(sid); if (p) { p.x = f.x; p.y = f.y; p.richtung = f.richtung; } }
    f.haelt = Math.abs(this.v) < 1;
    if (Math.abs(this.v) > 6) this.zombiesUeberfahren();
    // Motorlärm lockt Zombies (alle 1,5 s, je schneller desto weiter; mindestens so weit wie ein rennender Spieler)
    this.laermUhr -= dt;
    if (this.laermUhr <= 0 && Math.abs(this.v) > 10) {
      this.laermUhr = 1.5;
      const grund = Number(this.einstAuto().laerm); r.laerm(f.x, f.y, Math.max(W.hoerweiteRennen ?? 110, (Number.isFinite(grund) ? grund : PKW_VORGABE.laerm) * 8 + Math.abs(this.v)), true, '');
    }
    this.sirene(dt);
    this.zustand();
  }

  // Blaulicht + Sirene (nur Streifenwagen, Knopf/Taste H eines Menschen im Wagen); ohne Menschen im Wagen geht beides aus
  blaulichtSchalten(sid) {
    if (!this.streife || !this.f || !this.sitzt(sid) || this.istBot(sid) || this.leben <= 0) return false;
    this.f.blau = !this.f.blau; this.sireneUhr = 0;
    return true;
  }
  // Sirene lockt Zombies weithin an (Backend-Wert auto.sireneWeite in m), alle 2 s – auch im Stand
  sirene(dt) {
    const f = this.f; if (!f?.blau) return;
    if (!this.insassen.some(sid => !this.istBot(sid))) { f.blau = false; return; }
    this.sireneUhr -= dt;
    if (this.sireneUhr > 0) return;
    this.sireneUhr = 2;
    const m = Number(this.einstAuto().sireneWeite);
    this.raum.laerm(f.x, f.y, (Number.isFinite(m) ? m : PKW_VORGABE.sireneWeite) * 8, true, '');
  }

  // Lebensanzeige (Fahrzeug.leben in %) und Rauch bei starkem Schaden; bei 0 wird das Auto zum Wrack
  zustand() {
    const f = this.f; if (!f) return;
    if (this.leben <= 0) return this.zerstoeren();
    f.leben = Math.max(1, Math.min(100, Math.round(this.leben / this.lebenMax * 100)));
    f.rauch = this.leben / this.lebenMax < RAUCH_AB;
  }

  // Aufprall mit `kmh`: Insassen verlieren Lebensenergie, das Auto Lebenspunkte; Krach und Lärm
  aufprall(kmh) {
    const r = this.raum, s = r.state, e = this.einstAuto(), f = this.f;
    const anteil = crashAnteil(kmh, e), blech = crashAutoSchaden(kmh, e);
    if (anteil <= 0 && blech <= 0) return;
    this.crashBis = this.uhr + CRASH_PAUSE;
    const minus = Math.round(100 * anteil);
    for (const sid of [...this.insassen]) {
      const p = s.spieler.get(sid), x = r.extra.get(sid);
      if (!p || !minus || r.unsterblich?.(p, x)) continue;
      p.hp = Math.max(0, p.hp - minus);
      if (p.hp <= 0) r.liegtAmBoden?.(p);
    }
    this.leben -= blech;
    r.broadcast('krach', { x: f.x, y: f.y, ebene: '', pkw: 1 });
    r.laerm(f.x, f.y, 450, true, '');
    const rest = Math.max(0, Math.round(this.leben / this.lebenMax * 100));
    for (const sid of this.insassen) if (!this.istBot(sid)) this.sendeAn(sid, `💥 Aufprall mit ${Math.round(kmh)} km/h${minus ? ` – −${minus} ❤️` : ''} · Auto ${rest} %`);
    for (const sid of [...this.insassen]) { const p = s.spieler.get(sid); if (p?.unten) this.aussteigen(sid); }
  }

  // Zombies im Fußabdruck: schnell = tot, langsam = Schaden ∝ Tempo und weggeschleudert; jeder Treffer bremst und kostet das Auto Blech
  zombiesUeberfahren() {
    const r = this.raum, s = r.state, f = this.f, e = this.einstAuto();
    const hl = PKW.laenge / 2, hb = PKW.breite / 2, kmh = kmhVon(Math.abs(this.v)), tot = kmh >= Number(e.zombieTotKmh ?? PKW_VORGABE.zombieTotKmh);
    const maxHp = r.einstellungen?.()?.zombieLeben ?? 100;
    for (const [zid, z] of [...s.zombies]) {
      if (z.ebene || !(z.hp > 0) || Math.abs(z.x - f.x) > hl + 10 || Math.abs(z.y - f.y) > hl + 10) continue;
      if (!imFussabdruck(f, z.x, z.y, hl, hb, 4) || (this.pause.get(zid) ?? 0) > this.uhr) continue;
      this.pause.set(zid, this.uhr + ZOMBIE_PAUSE);
      const vorher = s.besiegt;
      this.von.x = f.x; this.von.y = f.y;
      if (tot) { z.kriecht = true; r.schaden(zid, z, z.hp + 1, this.von); }
      else {
        const quer = -(z.x - f.x) * Math.sin(f.richtung) + (z.y - f.y) * Math.cos(f.richtung), sd = quer >= 0 ? 1 : -1;
        bewege(r.welt, z, -Math.sin(f.richtung) * sd * SCHLEUDER, Math.cos(f.richtung) * sd * SCHLEUDER, W.zombieRadius ?? 6);
        r.schaden(zid, z, Math.min(maxHp * 0.95, maxHp * 0.9 * kmh / Math.max(1, Number(e.zombieTotKmh ?? 25))), this.von);
      }
      s.besiegt = vorher;   // zählt nicht für die Aufgaben (wie Panzer und Verkehr)
      r.broadcast('aufprall', { x: z.x, y: z.y, id: this.id, tot, w: f.richtung, ebene: '' });
      this.v *= ZOMBIE_BREMSE;
      this.leben -= Math.max(0, Number(e.zombieSchaden ?? PKW_VORGABE.zombieSchaden));
    }
    if (this.pause.size > 40) for (const [k, t] of this.pause) if (t < this.uhr) this.pause.delete(k);
  }

  // Lebenspunkte aufgebraucht: alle steigen aus, das Auto bleibt als Wrack stehen und brennt (wie ein Verkehrsunfall)
  zerstoeren() {
    const r = this.raum, f = this.f; if (!f) return;
    const wer = [...this.insassen];
    for (const sid of wer) this.aussteigen(sid);
    for (const sid of wer) if (!this.istBot(sid)) this.sendeAn(sid, '🔥 Das Auto ist hinüber – alle raus!');
    f.art = 'wrack'; f.haelt = true; f.rauch = true; f.leben = 0; f.blau = false;
    r.broadcast('krach', { x: f.x, y: f.y, ebene: '', pkw: 1 });
    r.verkehr?.unfaelle?.liste.set(this.id, { phase: 'rauch', t: 0, rauchBis: 6 + r.rnd() * 6 });   // Rauch → Feuer → ggf. Explosion (server/unfall.mjs)
    if (r.fahrbare) r.fahrbare.liste = r.fahrbare.liste.filter(b => b !== this);
    this.f = null; this.id = null; this.insassen = [];
  }
}

// ---------- Verwaltung: geparkte Autos nehmen, Schlüssel-Funde ----------
export class PkwVerwaltung {
  constructor(raum) {
    this.raum = raum;
    const w = raum.welt;
    if (w) { w._parkIdx = undefined; w.autosWeg = new Set(); }   // Welt (ggf. aus dem Zwischenspeicher) wieder vollständig
  }

  // geparktes Auto in Einstiegsnähe (nur draußen, Spieler zu Fuß) oder null
  amParkAuto(p) {
    if (!p || p.ebene || p.anBord || p.imBoxer) return null;
    return parkAutoBei(this.raum.welt, this.raum.state, p.x, p.y);
  }

  // Aktionstaste am geparkten Auto: mit Autoschlüssel einsteigen (das Auto wird fahrbar); ohne Schlüssel false (dann gilt der Kofferraum)
  einsteigen(sid) {
    const r = this.raum, p = r.state.spieler.get(sid), x = r.extra.get(sid);
    if (!p || !x || x.bot || p.unten || p.zombie > 0 || p.kamera || r.state.phase !== 'spiel' || !r.fahrbare) return false;
    const b = this.amParkAuto(p);
    if (!b || !hatSchluessel(p)) return this.streifeEinsteigen(sid, p);   // sonst ein Streifenwagen an einer Sperre (Schlüssel steckt)
    const fz = new FahrbarPkw(r, b.id);
    const f = fz.aufstellen(b.x, b.y, parkWinkel(b));
    f.farbe = b.farbe ?? 0; f.leben = 100; f.turm = 0;
    fz.andere = fz.andereFahrzeuge(); fz.startBlock = fz.blockPunkte(r.welt, f.x, f.y, f.richtung);   // eng geparkt: darf erst herausrangieren
    r.fahrbare.liste.push(fz);
    this.weg(b.id);
    fz.einsteigen(sid);
    return true;
  }

  // Streifenwagen an einer Straßensperre (ohne Autoschlüssel): wird zum fahrbaren Fahrzeug, die Polizisten bleiben an der Sperre
  streifeEinsteigen(sid, p) {
    const r = this.raum;
    if (p.ebene || p.anBord || p.imBoxer) return false;
    const st = streifeBei(r.welt, p.x, p.y);
    if (!st) return false;
    const fz = new FahrbarPkw(r, st.id);
    const f = fz.aufstellen(st.x, st.y, st.w);
    f.farbe = 0; f.leben = 100; f.turm = 0; f.blau = false;
    fz.andere = fz.andereFahrzeuge(); fz.startBlock = fz.blockPunkte(r.welt, f.x, f.y, f.richtung);
    r.fahrbare.liste.push(fz);
    this.weg(st.id);
    fz.einsteigen(sid);
    return true;
  }

  // geparktes Auto aus der Welt nehmen (Kletter-Index, Zeichnung bei allen, Kofferraum leer)
  weg(bid) {
    const r = this.raum;
    if (!parkAutoWeg(r.welt, bid)) return;
    if (!istStreife(bid)) r.setzeInhalt?.(bid, []);
    r.broadcast('autosWeg', this.liste());
  }
  liste() { return { seed: this.raum.state.seed, ids: [...(this.raum.welt?.autosWeg ?? [])], plaetze: Math.max(1, Math.round(Number(pkwEinst(this.raum).plaetze) || PKW_VORGABE.plaetze)) }; }
  beitritt(client) { try { client.send('autosWeg', this.liste()); } catch { /* Verbindung weg */ } }
}

// Autoschlüssel als Zusatzfund: quelle 'moebel' (Schrank, Spind …), 'kofferraum' oder 'leiche'; Fundhäufigkeit funde.autoschluessel (10 = normal) wirkt mit
export function schluesselFund(raum, quelle, art = '') {
  if (quelle === 'moebel' && !SCHLUESSEL_MOEBEL.has(art)) return [];
  const e = pkwEinst(raum), k = { moebel: 'schluesselMoebel', kofferraum: 'schluesselKofferraum', leiche: 'schluesselLeiche' }[quelle];
  if (!k) return [];
  const faktor = Number(raum.einstellungen?.()?.funde?.autoschluessel ?? 10) / 10;
  return raum.rnd() * 100 < Number(e[k] ?? 0) * faktor ? ['autoschluessel'] : [];
}
