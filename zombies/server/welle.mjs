// Zombiewellen: alle X Spielminuten kommen 20–50 Zombies als dichte Gruppe von links oder rechts durchs Bild
// und ziehen quer über die Spieler hinweg zur anderen Seite. Man kann sie erledigen oder sich im Haus verstecken.
// Zehn Sekunden vorher gibt es eine Funkmeldung. Die Gruppe läuft mit einem gemeinsamen Ziel (kein Einzel-Wegsuchen):
// Richtung aus einem einmal berechneten Wegefeld zum Gruppenziel (Breitensuche, ein Durchlauf je Welle statt Wegsuche
// je Zombie) + Zusammenhalt zur Gruppenmitte; Abstand halten erledigt zombieGehen. Klemmt ein Zombie, weicht er kurz aus. Wellen-Zombies sehen Spieler wie alle anderen und jagen sie dann.
// Sie zählen nicht zum normalen Zombie-Soll (info.bleibt) und werden vom Auffüllen nicht ersetzt.
// Natürliches Verhalten: die Horde hat ein Ziel (Safe-Room-Vorplatz, Laden, Stützpunkt, Lärmort, Menschen, Spielernähe, Kreuzung),
// wechselt es alle hordeZielMin–hordeZielMax echte Minuten oder bei Ankunft; jeder Zombie hat eigenes Tempo, schlängelt, macht Pausen
// und taumelt, leichte Schwarmregeln (Abstand, schwache Kohäsion, lockere Ausrichtung) ergeben einen langgezogenen Haufen.
// Kommt die Horde in Reichweite von Spielern/Bots/Soldaten/Menschen, löst sich ein Angriffstrupp und jagt sein Ziel mit der
// normalen Jagdlogik (info.ziel / info.mensch / info.punkt); danach kehrt er zurück oder streunt.
import { KACHEL, BREITE, HOEHE, WERTE as W, T, BLOCKIERT, frei, drinnen, ladenArt } from '../client/welt.mjs';

export const WELLE_MAX = 1000;       // so viele zusätzliche Zombies höchstens
const ANSAGE = 10;                    // Sekunden zwischen Meldung und Auftauchen
const SICHT = 1000;                   // halbe Bildbreite eines breiten PC-Bildschirms: so weit sieht man höchstens
const ABSTAND = SICHT + 300;          // für die Seitenwahl am Kartenrand (Horde startet hinter dem Bildrand)
const ZIEL_ABSTAND = 900;             // Gruppenziel: so weit auf der Gegenseite des Spielers
const TEMPO = 0.5;                    // Anteil von W.zombieTempoJagen (ca. 52 px/s)
const MAX_DAUER = 600;                // spätestens dann löst sich die Welle auf (Sekunden); bis dahin zieht sie von Ziel zu Ziel
const RAND = 7;                       // Wegziele mindestens so viele Kacheln vom Kartenrand (Ortsausfahrt meiden)
const ABSPALT = 0.06;                 // Anteil der Gruppe, der sich bei jedem neuen Ziel abspaltet und als normaler Zombie streunt
const KLEMM_PRUEFUNG = 25;            // alle so viele Sekunden: kommt die Gruppenmitte kaum voran, gibt es ein neues Ziel
const KLEMM_WEG = 90;                 // ... weniger als so viele px Fortschritt
const TRUPP_TAKT = 0.5;               // Sekunden zwischen Trupp-Prüfungen
const TRUPP_SPERRE = 25;              // Sekunden, bis dasselbe Ziel wieder einen Trupp bekommt
const SEP = 34;                       // Schwarm: Abstand, ab dem Nachbarn sich abstoßen (px)
const GESPERRT = new Set([...BLOCKIERT].filter(t => t !== T.INNENTUER));
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;

export class Zombiewelle {
  constructor(raum) {
    this.raum = raum;
    this.uhr = null;       // Sekunden (Spielzeit) bis zur nächsten Welle
    this.ansage = null;    // { t, seite } zwischen Meldung und Auftauchen
    this.aktiv = null;     // { ids, ziel, mitte, alter, seite }
  }

  einst() { return this.raum.einstellungen?.() ?? {}; }

  // Ein Takt: Zeitgeber, Ansage, Auftauchen, Gruppenmitte, Auflösen
  schritt(dt) {
    const e = this.einst(), zr = this.raum.zeitraffer?.() ?? 1, min = e.welleMinuten ?? 0;
    if (min > 0) {
      if (this.uhr === null) this.uhr = min * 60;
      this.uhr -= dt * zr;
      if (this.uhr <= 0) {
        this.uhr = min * 60;
        if (!this.ansage && !this.aktiv) this.ansagen();
      }
    } else this.uhr = null;
    if (this.ansage && (this.ansage.t -= dt) <= 0) { const seite = this.ansage.seite; this.ansage = null; this.erzeugen(seite); }
    if (this.aktiv) this.verfolgen(dt);
  }

  // Meldung 10 s vorher; seite 'west' = sie kommen von links, 'ost' = von rechts
  ansagen(seite = null) {
    const ref = this.bezug();
    if (!seite) {
      seite = this.raum.rnd() < 0.5 ? 'west' : 'ost';
      // zu nah am Kartenrand: auf die andere Seite ausweichen, damit sie wirklich außerhalb des Bildes auftauchen
      if (ref.draussen && ref.x - ABSTAND < 2 * KACHEL) seite = 'ost';
      else if (ref.draussen && ref.x + ABSTAND > (BREITE - 2) * KACHEL) seite = 'west';
    }
    this.ansage = { t: ANSAGE, seite };
    this.raum.broadcast('meldung', { text: `🧟 Eine Zombiewelle kommt von ${seite === 'west' ? '◀ Westen' : 'Osten ▶'}!`, lang: true });
    return seite;
  }

  // Bezugspunkt: ein zufälliger Spieler draußen; sonst (alle in Häusern) die Haustür-Mitte; sonst die Kartenmitte
  bezug() {
    const s = this.raum.state;
    const draussen = [...s.spieler.values()].filter(p => !p.ebene && !p.unten && !(p.zombie > 0));
    const alle = draussen.length ? draussen : [...s.spieler.values()].filter(p => !p.ebene);
    if (alle.length) { const p = alle[Math.floor(this.raum.rnd() * alle.length)]; return { x: p.x, y: p.y, draussen: true }; }
    const tueren = [];
    for (const p of s.spieler.values()) {
      const m = EBENE_MUSTER.exec(p.ebene ?? ''), h = m ? this.raum.welt.haeuser[Number(m[1])] : null;
      if (h) tueren.push({ x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL });
    }
    if (tueren.length) return { x: tueren.reduce((a, t) => a + t.x, 0) / tueren.length, y: tueren.reduce((a, t) => a + t.y, 0) / tueren.length, draussen: false };
    return { x: BREITE * KACHEL / 2, y: HOEHE * KACHEL / 2, draussen: false };
  }

  // Die Gruppe erscheint dicht beieinander außerhalb des Bildes auf begehbaren Feldern und bekommt ihr Ziel
  erzeugen(seite = 'west') {
    const r = this.raum, e = this.einst(), welt = r.welt;
    const lo = Math.max(1, Math.min(WELLE_MAX, e.welleMin ?? 20)), hi = Math.max(lo, Math.min(WELLE_MAX, e.welleMax ?? 50));
    const n = lo + Math.floor(r.rnd() * (hi - lo + 1));
    const richtung = seite === 'west' ? 1 : -1;     // Zugrichtung in x
    const ref = this.bezug();
    const kl = (v, a, b) => Math.max(a, Math.min(b, v));
    const grenzeX = [2 * KACHEL, (BREITE - 2) * KACHEL], grenzeY = [2 * KACHEL, (HOEHE - 2) * KACHEL];
    const zielX = [RAND * KACHEL, (BREITE - RAND) * KACHEL], zielY = [RAND * KACHEL, (HOEHE - RAND) * KACHEL];   // Ziele bleiben im Ort
    // Streuradius so, dass n Zombies dicht stehen (ca. 26 px Platz je Zombie)
    const radius = 22 + Math.sqrt(n) * 14;
    // Mitte so weit weg, dass auch der vorderste Zombie hinter dem Bildrand steht; dann laufen sie ins Bild ein
    const randX = [Math.min(grenzeX[0] + radius, BREITE * KACHEL / 2), Math.max(grenzeX[1] - radius, BREITE * KACHEL / 2)];   // ganze Horde auf der Karte
    const cx = kl(ref.draussen ? ref.x - richtung * (SICHT + radius + 80 + r.rnd() * 200) : (seite === 'west' ? 2.5 : BREITE - 2.5) * KACHEL, ...randX);
    const cy0 = kl(ref.y + (r.rnd() - 0.5) * 160, ...grenzeY);
    const ziel = { x: kl(ref.x + richtung * ZIEL_ABSTAND, ...zielX), y: kl(ref.y, ...zielY) };
    // kein Zombie darf in Sichtweite irgendeines Spielers draußen auftauchen
    const sehende = [...r.state.spieler.values()].filter(p => !p.ebene && !(p.zombie > 0));
    let sicht = SICHT;   // wird gelockert, wenn die Karte zu klein ist (Testkarte, Kartenrand)
    const gesehen = (x, y) => sehende.some(p => Math.abs(p.x - x) < sicht + 40 && Math.abs(p.y - y) < sicht * 0.75 + 40);
    const plaetze = cy => {
      const liste = [];
      for (let v = 0; v < n * 8 && liste.length < n; v++) {
        const a = r.rnd() * Math.PI * 2, d = radius * Math.sqrt(r.rnd());
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (x < KACHEL || y < KACHEL || x > (BREITE - 1) * KACHEL || y > (HOEHE - 1) * KACHEL) continue;
        if (!frei(welt, x, y, W.zombieRadius + 2) || drinnen(welt, x, y) || gesehen(x, y)) continue;
        if (welt.safeRooms.some(s => Math.hypot(s.vorTuer.x - x, s.vorTuer.y - y) < 120)) continue;
        if (liste.some(q => Math.hypot(q.x - x, q.y - y) < W.zombieRadius * 1.6)) continue;
        liste.push({ x, y });
      }
      return liste;
    };
    // ist der Platz zugebaut (Häuser, Wasser), die Gruppe etwas nach oben/unten verschieben
    let beste = [];
    for (const stufe of [1, 0.75, 0.5, 0.3]) {   // erst ganz außerhalb jeder Sicht, sonst schrittweise näher
      sicht = SICHT * stufe;
      for (const dy of [0, 96, -96, 192, -192, 288, -288, 384, -384]) {
        const cy = cy0 + dy;
        if (cy < grenzeY[0] || cy > grenzeY[1]) continue;
        const l = plaetze(cy);
        if (l.length > beste.length) beste = l;
        if (beste.length >= n) break;
      }
      if (beste.length >= n * 0.6) break;
    }
    if (!beste.length) return null;
    const ids = new Set();
    const w0 = Math.atan2(ziel.y - cy0, ziel.x - cx);
    for (const p of beste) {
      const id = r.setzeZombie(p.x, p.y, '');
      const info = r.zombieInfo.get(id);
      info.welle = true; info.bleibt = true; info.versatz = (r.rnd() - 0.5) * 0.4; info.ausweich = 0;
      info.wTempo = 0.8 + r.rnd() * 0.4; info.phase = r.rnd() * Math.PI * 2; info.phaseV = 1 + r.rnd() * 1.2; info.steuerT = r.rnd() * 0.4;
      r.state.zombies.get(id).richtung = w0;
      ids.add(id);
    }
    this.aktiv = { ids, ziel, mitte: { x: cx, y: cy0 }, alter: 0, seite, feld: this.baueFeld(ziel), pruef: { t: 0, x: cx, y: cy0 }, ziele: 1, ...this.neuerZustand() };
    return [...ids];
  }

  // Wegefeld zum Gruppenziel: Schritte jeder begehbaren Kachel bis zur Zielkachel (einmal je Welle)
  baueFeld(ziel) {
    const welt = this.raum.welt, feld = new Int16Array(BREITE * HOEHE).fill(-1);
    const frei_ = (x, y) => x >= 0 && y >= 0 && x < BREITE && y < HOEHE && !GESPERRT.has(welt.hole(x, y));
    let sx = Math.floor(ziel.x / KACHEL), sy = Math.floor(ziel.y / KACHEL);
    for (let rr = 0; rr < 8 && !frei_(sx, sy); rr++) {   // nächste freie Kachel am Ziel suchen
      outer: for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (frei_(sx + dx, sy + dy)) { sx += dx; sy += dy; break outer; }
    }
    if (!frei_(sx, sy)) return null;
    const q = [sy * BREITE + sx]; feld[q[0]] = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % BREITE, y = (i - x) / BREITE;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!frei_(nx, ny) || feld[ny * BREITE + nx] !== -1) continue;
        feld[ny * BREITE + nx] = feld[i] + 1; q.push(ny * BREITE + nx);
      }
    }
    return feld;
  }

  // Richtung nach dem Wegefeld: zwei Kacheln vorausschauen (glatter Weg um Häuser), null = kein Weg bekannt / am Ziel
  feldRichtung(feld, x, y) {
    let kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    if (kx < 0 || ky < 0 || kx >= BREITE || ky >= HOEHE || feld[ky * BREITE + kx] <= 0) return null;
    for (let schritt = 0; schritt < 3; schritt++) {
      let best = null, bw = feld[ky * BREITE + kx];
      if (bw <= 0) break;
      for (const [nx, ny] of [[kx + 1, ky], [kx - 1, ky], [kx, ky + 1], [kx, ky - 1]]) {
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
        const v = feld[ny * BREITE + nx];
        if (v >= 0 && v < bw) { bw = v; best = [nx, ny]; }
      }
      if (!best) break;
      [kx, ky] = best;
    }
    return Math.atan2((ky + 0.5) * KACHEL - y, (kx + 0.5) * KACHEL - x);
  }

  // Zeitgeber, Trupps und Lärmsperre einer neuen Horde
  neuerZustand() {
    return { zielUhr: this.zielDauer(), trupps: [], cool: new Map(), truppT: 0, laermPause: 0, seitZiel: 0, radius: 100, zielArt: 'start' };
  }

  // Sekunden (echte Zeit) bis zum nächsten Zielwechsel: zufällig zwischen hordeZielMin und hordeZielMax Minuten
  zielDauer() {
    const e = this.einst(), lo = Math.max(0.2, e.hordeZielMin ?? 2), hi = Math.max(lo, e.hordeZielMax ?? 5);
    return (lo + this.raum.rnd() * (hi - lo)) * 60;
  }

  // Gruppenmitte nachführen; Zielwechsel nach Zeit/Ankunft/Klemmen, Trupps lösen und verwalten; Zeitablauf: auflösen
  verfolgen(dt) {
    const a = this.aktiv, z = this.raum.state.zombies;
    a.alter += dt; a.seitZiel += dt; a.laermPause -= dt;
    let sx = 0, sy = 0, n = 0, amZiel = 0;
    for (const id of a.ids) {
      const q = z.get(id), info = this.raum.zombieInfo.get(id);
      if (!q || !info?.welle) { a.ids.delete(id); continue; }
      sx += q.x; sy += q.y; n++;
      if (Math.hypot(q.x - a.ziel.x, q.y - a.ziel.y) < 260) amZiel++;
    }
    a.truppT += dt;
    if (a.truppT >= TRUPP_TAKT) { const d = a.truppT; a.truppT = 0; this.truppen(d); }
    if (!n) { if (!a.trupps.length) this.aktiv = null; return; }
    a.mitte = { x: sx / n, y: sy / n };
    if (a.alter > MAX_DAUER) return this.aufloesen();
    // Ausdehnung der Horde (80 % der Zombies) für die Reichweitenprüfung: Näherung aus dem Abstand eines Teils
    let rs = 0, k = 0; const schritt = Math.max(1, Math.floor(n / 40));
    let i = 0;
    for (const id of a.ids) { if (i++ % schritt) continue; const q = z.get(id); rs += Math.hypot(q.x - a.mitte.x, q.y - a.mitte.y); k++; }
    a.radius = Math.max(60, (rs / Math.max(1, k)) * 2.2);
    // Kommt die Mitte kaum voran (klemmt an Häusern/Wasser), gibt es ein neues Ziel
    a.pruef.t += dt;
    let klemmt = false;
    if (a.pruef.t >= KLEMM_PRUEFUNG) {
      klemmt = Math.hypot(a.mitte.x - a.pruef.x, a.mitte.y - a.pruef.y) < KLEMM_WEG;
      a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y };
    }
    a.zielUhr -= dt;
    // Ziel wechseln: Zeit abgelaufen, am Ziel (Mitte nah oder die Hälfte angekommen) oder festgefahren
    const angekommen = Math.hypot(a.mitte.x - a.ziel.x, a.mitte.y - a.ziel.y) < 160 + Math.sqrt(n) * 6 || amZiel >= n / 2;
    if (klemmt || angekommen || a.zielUhr <= 0) this.neuesZiel();
  }

  // ---- Zielwahl ----

  // Kreuzungen im bebauten Gebiet (einmal je Welt berechnet): Straßenkachel mit mindestens drei Straßennachbarn, nahe Häusern
  kreuzungen() {
    const welt = this.raum.welt;
    if (this._kreuzWelt === welt) return this._kreuz;
    const bloecke = new Set();
    for (const h of welt.haeuser ?? []) bloecke.add((h.tuer.y >> 3) * 4096 + (h.tuer.x >> 3));
    const nah = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (bloecke.has(((y >> 3) + j) * 4096 + (x >> 3) + i)) return true; return false; };
    const liste = [];
    for (let y = RAND; y < HOEHE - RAND; y++) for (let x = RAND; x < BREITE - RAND; x++) {
      if (welt.hole(x, y) !== T.STRASSE) continue;
      let c = 0;
      if (welt.hole(x + 1, y) === T.STRASSE) c++;
      if (welt.hole(x - 1, y) === T.STRASSE) c++;
      if (welt.hole(x, y + 1) === T.STRASSE) c++;
      if (welt.hole(x, y - 1) === T.STRASSE) c++;
      if (c >= 3 && nah(x, y)) liste.push({ x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL });
    }
    this._kreuzWelt = welt; this._kreuz = liste;
    return liste;
  }

  // Ein Punkt nahe (x, y), der begehbar ist (Abstand rMin–rMax, zufällige Richtung); null, wenn nichts gefunden
  punktNahe(x, y, rMin, rMax) {
    const r = this.raum;
    for (let v = 0; v < 8; v++) {
      const w = r.rnd() * Math.PI * 2, d = rMin + r.rnd() * (rMax - rMin);
      const px = x + Math.cos(w) * d, py = y + Math.sin(w) * d;
      if (frei(r.welt, px, py, W.zombieRadius + 2) && !drinnen(r.welt, px, py)) return { x: px, y: py };
    }
    return null;
  }

  // Kandidat einer Zielart (oder null)
  zielVonArt(art, a) {
    const r = this.raum, welt = r.welt, s = r.state;
    const wahl = l => l.length ? l[Math.floor(r.rnd() * l.length)] : null;
    switch (art) {
      case 'safe': { const q = wahl(welt.safeRooms ?? []); return q ? { x: q.vorTuer.x, y: q.vorTuer.y } : null; }
      case 'laden': { const h = wahl((welt.haeuser ?? []).filter(h => ladenArt(h))); return h ? { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 1.5) * KACHEL } : null; }
      case 'haus': { const h = wahl(welt.haeuser ?? []); return h ? { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 1.5) * KACHEL } : null; }
      case 'stuetzpunkt': {
        const sp = welt.stuetzpunkt;
        if (!sp || s.stuetzpunkt !== 'steht') return null;
        const f = { n: [0, -1], s: [0, 1], o: [1, 0], w: [-1, 0] }[sp.richtung] ?? [0, 1];
        return { x: (sp.x + sp.b / 2 + f[0] * (sp.b / 2 + 5)) * KACHEL, y: (sp.y + sp.h / 2 + f[1] * (sp.h / 2 + 5)) * KACHEL };
      }
      case 'laerm': return this.laermOrt && a.alter - this.laermOrt.t < 180 ? { x: this.laermOrt.x, y: this.laermOrt.y } : null;
      case 'menschen': {
        const l = [...s.menschen.values()].filter(m => m.sichtbar && !m.infiziert);
        const m = wahl(l); return m ? this.punktNahe(m.x, m.y, 60, 160) : null;
      }
      case 'spieler': {
        const l = [...s.spieler.values()].filter(p => !p.ebene && !p.unten && !(p.zombie > 0));
        const p = wahl(l); return p ? this.punktNahe(p.x, p.y, 260, 520) : null;
      }
      case 'kreuzung': return wahl(this.kreuzungen());
    }
    return null;
  }

  // Zielart gewichtet wählen und ein erreichbares Ziel dazu finden (mindestens RAND Kacheln vom Kartenrand, nicht direkt nebenan)
  waehleZiel() {
    const a = this.aktiv, r = this.raum;
    const kl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const gew = { safe: 2, laden: 3, stuetzpunkt: 1.5, laerm: 3, menschen: 2, spieler: 2.5, kreuzung: 2, haus: 1 };
    const arten = Object.keys(gew);
    for (let versuch = 0; versuch < 10; versuch++) {
      let summe = 0; for (const k of arten) summe += gew[k];
      let t = r.rnd() * summe, art = arten[0];
      for (const k of arten) { t -= gew[k]; if (t <= 0) { art = k; break; } }
      const roh = this.zielVonArt(art, a);
      if (!roh) { gew[art] = 0; if (!arten.some(k => gew[k] > 0)) break; continue; }
      const ziel = { x: kl(roh.x, RAND * KACHEL, (BREITE - RAND) * KACHEL), y: kl(roh.y, RAND * KACHEL, (HOEHE - RAND) * KACHEL) };
      if (Math.hypot(ziel.x - a.mitte.x, ziel.y - a.mitte.y) < 350 || Math.hypot(ziel.x - a.ziel.x, ziel.y - a.ziel.y) < 250) continue;
      const feld = this.baueFeld(ziel);
      if (feld) return { ziel, feld, art };
    }
    // nichts Passendes: zufälliger Punkt im Innenbereich der Karte
    for (let v = 0; v < 6; v++) {
      const ziel = { x: (RAND + r.rnd() * (BREITE - 2 * RAND)) * KACHEL, y: (RAND + r.rnd() * (HOEHE - 2 * RAND)) * KACHEL };
      const feld = this.baueFeld(ziel);
      if (feld) return { ziel, feld, art: 'zufall' };
    }
    return null;
  }

  // Neues Wegziel; dabei spalten sich einzelne Zombies ab und streunen als normale Zombies weiter
  neuesZiel() {
    const a = this.aktiv, r = this.raum;
    if (!a) return;
    const w = this.waehleZiel();
    if (!w) return;   // Ziel unerreichbar: das alte behalten, beim nächsten Takt neuer Versuch
    this.setzeZiel(w.ziel, w.feld, w.art);
    for (const id of [...a.ids]) {
      if (a.ids.size <= 3 || r.rnd() >= ABSPALT) continue;
      const info = r.zombieInfo.get(id);
      if (info) { info.welle = false; info.bleibt = false; }
      a.ids.delete(id);
    }
  }

  setzeZiel(ziel, feld, art) {
    const a = this.aktiv;
    a.ziel = ziel; a.feld = feld; a.ziele++; a.zielArt = art; a.seitZiel = 0; a.zielUhr = this.zielDauer();
    a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y };
  }

  // Lärm (aus SpielRaum.laerm): ist die Horde in der Nähe und nicht gerade erst umgelenkt, zieht sie kurz dorthin
  laermHoeren(x, y, weite) {
    this.laermOrt = { x, y, t: this.aktiv?.alter ?? 0 };
    const a = this.aktiv;
    if (!a || a.laermPause > 0 || a.seitZiel < 12 || weite < 200) return;
    if (Math.hypot(a.mitte.x - x, a.mitte.y - y) > Math.max(700, a.radius + weite)) return;
    const kl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ziel = { x: kl(x, RAND * KACHEL, (BREITE - RAND) * KACHEL), y: kl(y, RAND * KACHEL, (HOEHE - RAND) * KACHEL) };
    if (Math.hypot(ziel.x - a.mitte.x, ziel.y - a.mitte.y) < 200) return;
    const feld = this.baueFeld(ziel);
    a.laermPause = 30;
    if (feld) { this.setzeZiel(ziel, feld, 'laerm'); a.zielUhr = Math.min(a.zielUhr, 40 + this.raum.rnd() * 30); }
  }

  // ---- Angriffstrupps ----

  // alle möglichen Opfer: Spieler/Bots draußen (nicht am Boden), Soldaten (ein Ziel für den Stützpunkt), sichtbare Menschen
  opfer(a) {
    const r = this.raum, s = r.state, out = [];
    for (const [sid, p] of s.spieler) if (!p.ebene && !p.unten && !(p.zombie > 0)) out.push({ key: 's:' + sid, art: 'spieler', sid, x: p.x, y: p.y });
    const sp = r.stuetzpunkt;
    if (sp?.schuetzen && s.stuetzpunkt === 'steht' && sp.einst().falltage > 0) {
      let best = null, bd = Infinity;
      for (const q of sp.schuetzen) { if (q.tot) continue; const d = Math.hypot(q.x - a.mitte.x, q.y - a.mitte.y); if (d < bd) { bd = d; best = q; } }
      if (best) out.push({ key: 'bw', art: 'soldat', x: best.x, y: best.y });
    }
    for (const [mid, m] of s.menschen) if (m.sichtbar && !m.infiziert) out.push({ key: 'm:' + mid, art: 'mensch', mid, x: m.x, y: m.y });
    return out;
  }

  // aktuelle Lage eines Trupp-Ziels ({x, y}) oder null, wenn es nicht mehr angreifbar ist
  opferLage(t) {
    const r = this.raum, s = r.state;
    if (t.art === 'spieler') { const p = s.spieler.get(t.sid); return p && !p.ebene && !p.unten && !(p.zombie > 0) ? p : null; }
    if (t.art === 'mensch') { const m = s.menschen.get(t.mid); return m && m.sichtbar && !m.infiziert ? m : null; }
    const sp = r.stuetzpunkt;
    if (!sp?.schuetzen || s.stuetzpunkt !== 'steht' || !(sp.einst().falltage > 0)) return null;
    let best = null, bd = Infinity;
    for (const q of sp.schuetzen) { if (q.tot) continue; const d = Math.hypot(q.x - t.x, q.y - t.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  // alle TRUPP_TAKT Sekunden: neue Trupps lösen, bestehende betreuen
  truppen(dt) {
    const a = this.aktiv, r = this.raum, e = this.einst();
    const z = r.state.zombies;
    // bestehende Trupps
    for (const t of [...a.trupps]) {
      t.alter += dt;
      const lebende = [...t.ids].filter(id => z.has(id) && r.zombieInfo.get(id)?.trupp === t);
      t.ids = new Set(lebende);
      const lage = lebende.length ? this.opferLage(t) : null;
      if (!lage || t.alter > 150) { this.truppEnde(t); continue; }
      t.x = lage.x; t.y = lage.y;
      let sieht = false;
      for (const id of lebende) { const q = z.get(id); if (Math.hypot(q.x - lage.x, q.y - lage.y) < W.sichtWeite * 1.6) { sieht = true; break; } }
      t.aus = sieht ? 0 : t.aus + dt;
      if (t.aus > t.ausMax) { this.truppEnde(t); continue; }
      for (const id of lebende) {   // wer sein Ziel verloren hat, geht zur letzten bekannten Stelle, solange der Trupp es noch sucht
        const info = r.zombieInfo.get(id), q = z.get(id);
        if (!info.ziel && !info.mensch && !info.punkt && Math.hypot(q.x - lage.x, q.y - lage.y) < W.sichtWeite * 3) info.punkt = { x: lage.x, y: lage.y };
      }
    }
    for (const [k, bis] of a.cool) if (bis <= a.alter) a.cool.delete(k);
    if (a.ids.size <= 3) return;
    const reichweite = Math.max(40, e.hordeReichweite ?? 18) * 8;
    const maxTrupps = 6 + Math.floor(a.ids.size / 120);
    const belegt = new Set(a.trupps.map(t => t.key));
    let neu = 0;
    for (const o of this.opfer(a)) {
      if (neu >= 2 || a.trupps.length >= maxTrupps || a.ids.size <= 3) break;
      if (belegt.has(o.key) || (a.cool.get(o.key) ?? 0) > a.alter) continue;
      if (Math.hypot(o.x - a.mitte.x, o.y - a.mitte.y) > a.radius + reichweite + 40) continue;
      // Zombies der Horde nach Abstand zum Opfer
      const kand = [];
      for (const id of a.ids) { const q = z.get(id); if (q) { const d = Math.hypot(q.x - o.x, q.y - o.y); if (d < reichweite) kand.push([d, id]); } }
      if (!kand.length) continue;
      kand.sort((p, q) => p[0] - q[0]);
      const lo = Math.max(1, e.hordeTruppMin ?? 5), hi = Math.max(lo, e.hordeTruppMax ?? 15);
      let n = lo + r.rnd() * (hi - lo);
      n *= Math.max(0.5, Math.min(2, Math.sqrt(a.ids.size / 40)));   // größere Horde → größerer Trupp
      if (o.art === 'soldat') n *= 2;
      n = Math.max(1, Math.min(Math.round(n), a.ids.size - 3, 300));
      this.truppLoesen(o, kand.slice(0, n).map(q => q[1]));
      neu++;
    }
  }

  truppLoesen(o, ids) {
    const a = this.aktiv, r = this.raum;
    const t = { key: o.key, art: o.art, sid: o.sid, mid: o.mid, x: o.x, y: o.y, ids: new Set(), alter: 0, aus: 0, ausMax: 20 + r.rnd() * 10 };
    for (const id of ids) {
      const info = r.zombieInfo.get(id), q = r.state.zombies.get(id);
      if (!info || !q) continue;
      a.ids.delete(id); t.ids.add(id);
      info.trupp = t; info.schlaeft = false; info.punkt = null; info.steht = false; info.verloren = 0;
      if (o.art === 'spieler') { info.ziel = o.sid; q.jagt = true; }
      else if (o.art === 'mensch') { info.mensch = o.mid; q.jagt = true; }
      else info.punkt = { x: o.x, y: o.y };
    }
    if (!t.ids.size) return;
    a.trupps.push(t);
  }

  // Trupp aufgelöst: die meisten kehren zur Horde zurück, der Rest streunt als normaler Zombie
  truppEnde(t) {
    const a = this.aktiv, r = this.raum;
    if (!a) return;
    a.trupps = a.trupps.filter(q => q !== t);
    a.cool.set(t.key, a.alter + TRUPP_SPERRE);
    for (const id of t.ids) {
      const info = r.zombieInfo.get(id);
      if (!info || info.trupp !== t) continue;
      info.trupp = null; info.punkt = null; info.mensch = null;
      if (info.ziel) { info.ziel = null; const q = r.state.zombies.get(id); if (q) q.jagt = false; }
      if (r.rnd() < 0.65) a.ids.add(id);
      else { info.welle = false; info.bleibt = false; }
    }
  }

  // Zombies weit weg von allen Spielern draußen verschwinden (außerhalb des Bildes), die übrigen werden normale Zombies
  aufloesen() {
    const a = this.aktiv, r = this.raum;
    if (!a) return;
    const spieler = [...r.state.spieler.values()].filter(p => !p.ebene);
    const alle = new Set(a.ids);
    for (const t of a.trupps) for (const id of t.ids) alle.add(id);
    for (const id of alle) {
      const q = r.state.zombies.get(id), info = r.zombieInfo.get(id);
      if (!q || !info) continue;
      info.trupp = null;
      const nah = spieler.some(p => Math.hypot(p.x - q.x, p.y - q.y) < 700);
      if (!nah && !q.jagt) { r.state.zombies.delete(id); r.zombieInfo.delete(id); }
      else { info.welle = false; info.bleibt = false; }
    }
    this.aktiv = null;
  }

  // Schwarm-Lenkung eines Wellen-Zombies: Richtung (Winkel) aus Wegefeld + Abstand + schwacher Zusammenhalt + lockerer Ausrichtung
  lenken(z, info, a) {
    const r = this.raum;
    let vx, vy;
    if (info.trupp) {   // Trupp: zur letzten bekannten Stelle des Opfers
      const d = Math.hypot(info.trupp.x - z.x, info.trupp.y - z.y) || 1;
      vx = (info.trupp.x - z.x) / d; vy = (info.trupp.y - z.y) / d;
    } else {
      const d0 = Math.hypot(a.ziel.x - z.x, a.ziel.y - z.y) || 1;
      const wf = a.feld ? this.feldRichtung(a.feld, z.x, z.y) : null;
      vx = wf === null ? (a.ziel.x - z.x) / d0 : Math.cos(wf); vy = wf === null ? (a.ziel.y - z.y) / d0 : Math.sin(wf);
      const dm = Math.hypot(a.mitte.x - z.x, a.mitte.y - z.y);
      if (dm > 90) { const k = Math.min(0.7, (dm - 90) / 260); vx += (a.mitte.x - z.x) / dm * k; vy += (a.mitte.y - z.y) / dm * k; }
    }
    let sx = 0, sy = 0, ax = 0, ay = 0, an = 0;
    // Nachbarn aus dem Raster (höchstens 28 prüfen: reicht für Abstand und Ausrichtung, hält den Takt kurz)
    const g = r.zRaster?.get(z.ebene ?? ''), RZ = 96;
    if (g) {
      const cx = Math.floor(z.x / RZ), cy = Math.floor(z.y / RZ);
      let gepr = 0;
      aussen: for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
        const l = g.get(j * 4096 + i);
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const o = l[k];
          if (o === z) continue;
          if (++gepr > 28) break aussen;
          const dx = z.x - o.x, dy = z.y - o.y, d2 = dx * dx + dy * dy;
          if (d2 < SEP * SEP && d2 > 0) { const d = Math.sqrt(d2), f = (SEP - d) / SEP / d; sx += dx * f; sy += dy * f; }
          if (d2 < 110 * 110) { ax += Math.cos(o.richtung); ay += Math.sin(o.richtung); an++; }
        }
      }
    }
    vx += sx * 1.6; vy += sy * 1.6;
    if (an) { const l = Math.hypot(ax, ay) || 1; vx += ax / l * 0.3; vy += ay / l * 0.3; }
    return Math.atan2(vy, vx);
  }

  // Bewegung eines Wellen-Zombies (aus zombieSchritt, wenn er nichts jagt und keinem Geräusch folgt)
  gehen(id, z, info, dt) {
    const a = this.aktiv, r = this.raum;
    if (!a || z.ebene) { info.welle = false; info.bleibt = false; info.trupp = null; return; }   // Haus betreten oder Welle vorbei: normaler Zombie
    info.wTempo ??= 0.8 + r.rnd() * 0.4; info.phase ??= r.rnd() * Math.PI * 2; info.phaseV ??= 1 + r.rnd() * 1.2; info.steuerT ??= 0;
    info.phase += info.phaseV * dt;
    if (info.pauseT > 0) { info.pauseT -= dt; return; }   // kurze individuelle Pause
    let w;
    if (info.ausweich > 0) { info.ausweich -= dt; w = info.ausweichW; }
    else {
      info.steuerT -= dt;
      if (info.steuerT <= 0 || info.lenkW === undefined) {   // Nachbarn nur alle 0,25–0,5 s neu auswerten
        info.steuerT = 0.25 + r.rnd() * 0.25;
        info.lenkW = this.lenken(z, info, a);
        const u = r.rnd();
        if (u < 0.04) { info.pauseT = 0.6 + r.rnd() * 2; return; }
        if (u < 0.07) { info.taumelT = 0.5 + r.rnd() * 0.7; info.taumelW = (r.rnd() < 0.5 ? -1 : 1) * (0.8 + r.rnd() * 0.8); }
      }
      w = info.lenkW + Math.sin(info.phase) * 0.28;   // Schlängeln
      if (info.taumelT > 0) { info.taumelT -= dt; w += info.taumelW; }
    }
    z.richtung = w;
    if (!r.zombieGehen(z, w, W.zombieTempoJagen * TEMPO * info.wTempo * dt, dt, info)) {
      info.ausweich = 0.8 + r.rnd() * 0.8; info.ausweichW = w + (r.rnd() < 0.5 ? -1 : 1) * (1.1 + r.rnd() * 0.6);
    }
  }
}
