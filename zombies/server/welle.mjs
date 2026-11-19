// Zombiewellen: alle X Spielminuten kommen 20–50 Zombies als dichte Gruppe von links oder rechts durchs Bild
// und ziehen quer über die Spieler hinweg zur anderen Seite. Man kann sie erledigen oder sich im Haus verstecken.
// Zehn Sekunden vorher gibt es eine Funkmeldung. Die Gruppe läuft mit einem gemeinsamen Ziel (kein Einzel-Wegsuchen):
// Richtung aus einem einmal berechneten Wegefeld zum Gruppenziel (Breitensuche, ein Durchlauf je Welle statt Wegsuche
// je Zombie) + Zusammenhalt zur Gruppenmitte; Abstand halten erledigt zombieGehen. Klemmt ein Zombie, weicht er kurz aus. Wellen-Zombies sehen Spieler wie alle anderen und jagen sie dann.
// Sie zählen nicht zum normalen Zombie-Soll (info.bleibt) und werden vom Auffüllen nicht ersetzt.
import { KACHEL, BREITE, HOEHE, WERTE as W, T, BLOCKIERT, frei, drinnen } from '../client/welt.mjs';

export const WELLE_MAX = 300;        // so viele zusätzliche Zombies höchstens
const ANSAGE = 10;                    // Sekunden zwischen Meldung und Auftauchen
const ABSTAND = 800;                  // so weit außerhalb des Bildes tauchen sie auf (700–900 px)
const ZIEL_ABSTAND = 900;             // Gruppenziel: so weit auf der Gegenseite des Spielers
const TEMPO = 0.5;                    // Anteil von W.zombieTempoJagen (ca. 52 px/s)
const MAX_DAUER = 600;                // spätestens dann löst sich die Welle auf (Sekunden); bis dahin zieht sie von Ziel zu Ziel
const RAND = 7;                       // Wegziele mindestens so viele Kacheln vom Kartenrand (Ortsausfahrt meiden)
const ABSPALT = 0.06;                 // Anteil der Gruppe, der sich bei jedem neuen Ziel abspaltet und als normaler Zombie streunt
const KLEMM_PRUEFUNG = 25;            // alle so viele Sekunden: kommt die Gruppenmitte kaum voran, gibt es ein neues Ziel
const KLEMM_WEG = 90;                 // ... weniger als so viele px Fortschritt
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
    const cx = kl(ref.draussen ? ref.x - richtung * (700 + r.rnd() * 200) : (seite === 'west' ? 2.5 : BREITE - 2.5) * KACHEL, ...grenzeX);
    const cy0 = kl(ref.y + (r.rnd() - 0.5) * 160, ...grenzeY);
    const ziel = { x: kl(ref.x + richtung * ZIEL_ABSTAND, ...zielX), y: kl(ref.y, ...zielY) };
    // Streuradius so, dass n Zombies dicht stehen (ca. 26 px Platz je Zombie)
    const radius = 22 + Math.sqrt(n) * 14;
    const plaetze = cy => {
      const liste = [];
      for (let v = 0; v < n * 8 && liste.length < n; v++) {
        const a = r.rnd() * Math.PI * 2, d = radius * Math.sqrt(r.rnd());
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (x < KACHEL || y < KACHEL || x > (BREITE - 1) * KACHEL || y > (HOEHE - 1) * KACHEL) continue;
        if (!frei(welt, x, y, W.zombieRadius + 2) || drinnen(welt, x, y)) continue;
        if (welt.safeRooms.some(s => Math.hypot(s.vorTuer.x - x, s.vorTuer.y - y) < 120)) continue;
        if (liste.some(q => Math.hypot(q.x - x, q.y - y) < W.zombieRadius * 1.6)) continue;
        liste.push({ x, y });
      }
      return liste;
    };
    // ist der Platz zugebaut (Häuser, Wasser), die Gruppe etwas nach oben/unten verschieben
    let beste = [];
    for (const dy of [0, 96, -96, 192, -192, 288, -288, 384, -384]) {
      const cy = cy0 + dy;
      if (cy < grenzeY[0] || cy > grenzeY[1]) continue;
      const l = plaetze(cy);
      if (l.length > beste.length) beste = l;
      if (beste.length >= n) break;
    }
    if (!beste.length) return null;
    const ids = new Set();
    const w0 = Math.atan2(ziel.y - cy0, ziel.x - cx);
    for (const p of beste) {
      const id = r.setzeZombie(p.x, p.y, '');
      const info = r.zombieInfo.get(id);
      info.welle = true; info.bleibt = true; info.versatz = (r.rnd() - 0.5) * 0.4; info.ausweich = 0;
      r.state.zombies.get(id).richtung = w0;
      ids.add(id);
    }
    this.aktiv = { ids, ziel, mitte: { x: cx, y: cy0 }, alter: 0, seite, feld: this.baueFeld(ziel), pruef: { t: 0, x: cx, y: cy0 }, ziele: 1 };
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

  // Gruppenmitte nachführen; am Ziel, bei Zeitablauf oder wenn keiner mehr übrig ist: auflösen
  verfolgen(dt) {
    const a = this.aktiv, z = this.raum.state.zombies;
    a.alter += dt;
    let sx = 0, sy = 0, n = 0, amZiel = 0;
    for (const id of a.ids) {
      const q = z.get(id), info = this.raum.zombieInfo.get(id);
      if (!q || !info?.welle) { a.ids.delete(id); continue; }
      sx += q.x; sy += q.y; n++;
      if (Math.hypot(q.x - a.ziel.x, q.y - a.ziel.y) < 260) amZiel++;
    }
    if (!n) { this.aktiv = null; return; }
    a.mitte = { x: sx / n, y: sy / n };
    if (a.alter > MAX_DAUER) return this.aufloesen();
    // Kommt die Mitte kaum voran (klemmt an Häusern/Wasser), gibt es ein neues Ziel
    a.pruef.t += dt;
    let klemmt = false;
    if (a.pruef.t >= KLEMM_PRUEFUNG) {
      klemmt = Math.hypot(a.mitte.x - a.pruef.x, a.mitte.y - a.pruef.y) < KLEMM_WEG;
      a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y };
    }
    // am Ziel (Mitte nah oder die Hälfte angekommen): nicht stehen bleiben, sondern weiterziehen
    if (klemmt || Math.hypot(a.mitte.x - a.ziel.x, a.mitte.y - a.ziel.y) < 160 || amZiel >= n / 2) this.neuesZiel();
  }

  // Neues Wegziel im bebauten Gebiet (Haustür eines Hauses, weg von den Kartenrändern, 500–1600 px entfernt);
  // dabei spalten sich einzelne Zombies ab und streunen als normale Zombies weiter
  neuesZiel() {
    const a = this.aktiv, r = this.raum, welt = r.welt;
    if (!a) return;
    const kl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const kandidaten = [];
    for (const h of welt.haeuser ?? []) {
      const x = kl((h.tuer.x + 0.5) * KACHEL, RAND * KACHEL, (BREITE - RAND) * KACHEL), y = kl((h.tuer.y + 1.5) * KACHEL, RAND * KACHEL, (HOEHE - RAND) * KACHEL);
      const d = Math.hypot(x - a.mitte.x, y - a.mitte.y);
      if (d >= 500 && d <= 1600 && Math.hypot(x - a.ziel.x, y - a.ziel.y) > 300) kandidaten.push({ x, y });
    }
    let ziel;
    if (kandidaten.length) ziel = kandidaten[Math.floor(r.rnd() * kandidaten.length)];
    else {   // kein Haus in Reichweite: zufälliger Punkt im Innenbereich der Karte
      ziel = { x: (RAND + r.rnd() * (BREITE - 2 * RAND)) * KACHEL, y: (RAND + r.rnd() * (HOEHE - 2 * RAND)) * KACHEL };
    }
    const feld = this.baueFeld(ziel);
    if (!feld) return;   // Ziel unerreichbar: das alte behalten, beim nächsten Takt neuer Versuch
    a.ziel = ziel; a.feld = feld; a.ziele++;
    a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y };
    for (const id of [...a.ids]) {
      if (a.ids.size <= 3 || r.rnd() >= ABSPALT) continue;
      const info = r.zombieInfo.get(id);
      if (info) { info.welle = false; info.bleibt = false; }
      a.ids.delete(id);
    }
  }

  // Zombies weit weg von allen Spielern draußen verschwinden (außerhalb des Bildes), die übrigen werden normale Zombies
  aufloesen() {
    const a = this.aktiv, r = this.raum;
    if (!a) return;
    const spieler = [...r.state.spieler.values()].filter(p => !p.ebene);
    for (const id of a.ids) {
      const q = r.state.zombies.get(id), info = r.zombieInfo.get(id);
      if (!q || !info) continue;
      const nah = spieler.some(p => Math.hypot(p.x - q.x, p.y - q.y) < 700);
      if (!nah && !q.jagt) { r.state.zombies.delete(id); r.zombieInfo.delete(id); }
      else { info.welle = false; info.bleibt = false; }
    }
    this.aktiv = null;
  }

  // Bewegung eines Wellen-Zombies (aus zombieSchritt, wenn er nichts jagt und keinem Geräusch folgt)
  gehen(id, z, info, dt) {
    const a = this.aktiv, r = this.raum;
    if (!a || z.ebene) { info.welle = false; info.bleibt = false; return; }   // Haus betreten oder Welle vorbei: normaler Zombie
    let w;
    if (info.ausweich > 0) { info.ausweich -= dt; w = info.ausweichW; }
    else {
      const d0 = Math.hypot(a.ziel.x - z.x, a.ziel.y - z.y) || 1;
      const wf = a.feld ? this.feldRichtung(a.feld, z.x, z.y) : null;
      let vx = wf === null ? (a.ziel.x - z.x) / d0 : Math.cos(wf), vy = wf === null ? (a.ziel.y - z.y) / d0 : Math.sin(wf);
      const dm = Math.hypot(a.mitte.x - z.x, a.mitte.y - z.y);
      if (dm > 70) { const k = Math.min(1.2, (dm - 70) / 120); vx += (a.mitte.x - z.x) / dm * k; vy += (a.mitte.y - z.y) / dm * k; }
      w = Math.atan2(vy, vx) + (info.versatz ?? 0);
    }
    z.richtung = w;
    if (!r.zombieGehen(z, w, W.zombieTempoJagen * TEMPO * dt, dt, info)) {
      info.ausweich = 0.8 + r.rnd() * 0.8; info.ausweichW = w + (r.rnd() < 0.5 ? -1 : 1) * (1.1 + r.rnd() * 0.6);
    }
  }
}
