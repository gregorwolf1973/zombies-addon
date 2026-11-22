// Zombiehorden: je Level (Einstellung zombies.level) kommen bis zu „gleichzeitig“ Horden als dichte Gruppe von links oder rechts
// durchs Bild und ziehen von Ziel zu Ziel. Eine Horde lebt „Hordendauer“ Minuten; danach bleibt ein Drittel als normale Streuner,
// der Rest zieht zum nächsten Kartenrand ab und verschwindet dort außer Sicht. Nach der „Pause“ kommt die nächste Horde von der
// anderen Seite. Man kann sie erledigen oder sich im Haus verstecken.
// Zehn Sekunden vorher gibt es eine Funkmeldung. Die Gruppe läuft mit einem gemeinsamen Ziel (kein Einzel-Wegsuchen):
// Richtung aus einem einmal berechneten Wegefeld zum Gruppenziel (Breitensuche, ein Durchlauf je Welle statt Wegsuche
// je Zombie) + Zusammenhalt zur Gruppenmitte; Abstand halten erledigt zombieGehen. Klemmt ein Zombie, weicht er kurz aus. Wellen-Zombies sehen Spieler wie alle anderen und jagen sie dann.
// Sie zählen nicht zum normalen Zombie-Soll (info.bleibt) und werden vom Auffüllen nicht ersetzt.
// Natürliches Verhalten: die Horde hat ein Ziel (Safe-Room-Vorplatz, Laden, Stützpunkt, Lärmort, Menschen, Spielernähe, Kreuzung),
// wechselt es etwa alle hordeZiel echte Minuten (±40 %) oder bei Ankunft; jeder Zombie hat eigenes Tempo, schlängelt, macht Pausen
// und taumelt, leichte Schwarmregeln (Abstand, schwache Kohäsion, lockere Ausrichtung) ergeben einen langgezogenen Haufen.
// Kommt die Horde in Reichweite von Spielern/Bots/Soldaten/Menschen, löst sich ein Angriffstrupp und jagt sein Ziel mit der
// normalen Jagdlogik (info.ziel / info.mensch / info.punkt); danach kehrt er zurück oder streunt.
import { feinDurchgang } from './wegfeld.mjs';
import { KACHEL, BREITE, HOEHE, WERTE as W, T, BLOCKIERT, frei, drinnen, ladenArt } from '../client/welt.mjs';

export const WELLE_MAX = 1000;       // so viele Zombies je Horde höchstens
const LAGER_STAFFEL = 30;             // Lager-Welle: Gruppen erscheinen gestaffelt über so viele Sekunden
const ANSAGE = 10;                    // Sekunden zwischen Meldung und Auftauchen
const SICHT = 1000;                   // halbe Bildbreite eines breiten PC-Bildschirms: so weit sieht man höchstens
const ABSTAND = SICHT + 300;          // für die Seitenwahl am Kartenrand (Horde startet hinter dem Bildrand)
const ZIEL_ABSTAND = 900;             // Gruppenziel: so weit auf der Gegenseite des Spielers
const TEMPO = 0.85;                   // Anteil von W.zombieTempoJagen (ca. 89 px/s): die Horde marschiert zügig, etwa wie ein Zombie auf Geräuschspur
const ERSTE_EXTRA = 180;              // die erste Horde nach Spielstart kommt Pause + so viele Sekunden nach dem Start
const ABZUG_MAX = 300;                // Sekunden, die der Abzug zum Kartenrand höchstens dauert (danach streunen die Reste)
const STREUNER = 1 / 3;               // Anteil der Horde, der bei der Auflösung als normale Streuner bleibt
const ABZUG_SICHT = 1000;             // Abzug: erst löschen, wenn kein Spieler draußen näher ist (px) – oder am Rand
const RAND = 7;                       // Wegziele mindestens so viele Kacheln vom Kartenrand (Ortsausfahrt meiden)
const ABSPALT = 0.06;                 // Anteil der Gruppe, der sich bei jedem neuen Ziel abspaltet und als normaler Zombie streunt
const KLEMM_PRUEFUNG = 15;            // alle so viele Sekunden: kommt die Gruppenmitte kaum voran? Erst Umweg, beim zweiten Mal (30 s) neues Ziel
const KLEMM_WEG = 55;                 // ... weniger als so viele px Fortschritt je Prüfung
const UMWEG_DAUER = 12;               // Sekunden, die die Horde einen Umweg-Punkt ansteuert, bevor sie wieder zum Ziel läuft
export const LAERM_LAUT = 600;        // ab dieser Hörweite (Granate/Explosion, Puma) lenkt Lärm die Horde um; leiser nur, wenn die Mitte nah ist
export const LAERM_NAH = 500;         // ... oder die Hordenmitte ist so nah (px) am Lärm
const LAERM_PAUSE_MIN = 120, LAERM_PAUSE_MAX = 180;   // Sekunden zwischen zwei Lärm-Umlenkungen (2–3 Minuten)
const INFO_TAKT = 1;                  // Sekunden zwischen 'hordeInfo'-Nachrichten
const WECHSEL_MAX = 5;                // so viele letzte Zielwechsel werden gemeldet
const TRUPP_TAKT = 0.5;               // Sekunden zwischen Trupp-Prüfungen
const TRUPP_SPERRE = 25;              // Sekunden, bis dasselbe Ziel wieder einen Trupp bekommt
const SEP = 26;                       // Schwarm: Abstand, ab dem Nachbarn sich abstoßen (px)
const FELD_GEWICHT = 2.2;             // Wegefeld überwiegt Schwarmkräfte deutlich: zügiger Zug statt Wuseln
const GESPERRT = new Set([...BLOCKIERT, T.WASSER, T.TUER, T.BODEN].filter(t => t !== T.INNENTUER));   // Wegefeld führt nie durch Häuser (Türen sind zu): sonst hämmert die Horde an Haustüren
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;

export class Zombiewelle {
  constructor(raum) {
    this.raum = raum;
    this.uhr = null;       // Sekunden (Spielzeit) bis zur nächsten Horde; null = kein Platz frei oder noch nicht gestartet
    this.erste = true;     // die erste Horde nach Spielstart kommt verzögert
    this.zeit = 0;         // laufende Sekunden (echte Zeit), gemeinsame Uhr für Lärmmerker
    this.ansage = null;    // { t, seite } zwischen Meldung und Auftauchen
    this.horden = [];      // alle Horden: { ids, ziel, mitte, alter, lebt, dauer, seite, abzug, ... }
    this.letzteSeite = null;   // Startseite der letzten Horde (die nächste kommt von der anderen)
    this.lagerDrin = false;    // waren beim letzten Takt alle Menschen im Bundeswehr-Lager?
    this.lagerUhr = 0;         // Sekunden (Spielzeit) Pause bis zur nächsten Lager-Welle
    this.lagerPlan = null;     // laufende Lager-Welle: { t, gruppen: [{ t, n, winkel }], ziel, feld }
  }

  // Zugriff auf die erste Horde (Superuser-Werkzeuge, Tests); null setzt alle Horden zurück
  get aktiv() { return this.horden[0] ?? null; }
  set aktiv(h) { this.horden = h ? [h] : []; }
  // Horden, die noch ziehen (nicht im Abzug): nur sie zählen für „gleichzeitig“
  aktive() { return this.horden.filter(h => !h.abzug && !h.lager); }   // Lager-Wellen zählen nicht zu „gleichzeitig“

  einst() { return this.raum.einstellungen?.() ?? {}; }

  // Ein Takt: Zeitgeber, Ansage, Auftauchen, Gruppenmitten, Auflösen
  schritt(dt) {
    const zr = this.raum.zeitraffer?.() ?? 1;
    this.zeit += dt;
    const lv = this.raum.levelEinst?.() ?? { gleichzeitig: 0, pause: 5, horde: 0 };
    const frei = lv.gleichzeitig - this.aktive().length - (this.ansage ? 1 : 0);
    if (lv.gleichzeitig > 0 && lv.horde > 0 && frei > 0) {
      const pause = lv.pause * 60;
      if (this.uhr === null) { this.uhr = pause + (this.erste ? ERSTE_EXTRA : 0); this.erste = false; }
      this.uhr -= dt * zr;
      if (this.uhr <= 0) {
        this.uhr = frei > 1 ? pause : null;   // weiterer freier Platz: die nächste Horde nach einer weiteren Pause
        this.ansagen();
      }
    } else this.uhr = null;
    if (this.ansage && (this.ansage.t -= dt) <= 0) { const seite = this.ansage.seite; this.ansage = null; this.erzeugen(seite); }
    this.lagerSchritt(dt, zr);
    for (const h of [...this.horden]) this.verfolgen(h, dt, zr);
    if (this.horden.length) this.infoSenden(dt);
    else if (this.infoOffen) this.infoSenden(0, true);
  }

  // ---- Lager-Welle: kommen alle Menschen (keine Bots) ins Bundeswehr-Lager, greifen Zombies aus 3–4 Richtungen an ----

  // Alle lebenden, verbundenen Menschen (auch mit AFK-Steuerung, aber keine Bots) im Lager? Mindestens einer.
  alleImLager() {
    const r = this.raum;
    let n = 0;
    for (const [sid, p] of r.state.spieler) {
      if (r.extra?.get(sid)?.bot || !p.verbunden || !(p.hp > 0) || p.zombie > 0) continue;
      if (!r.imLagerSafe(p)) return false;
      n++;
    }
    return n > 0;
  }

  lagerSchritt(dt, zr = 1) {
    const e = this.einst(), n = Math.round(e.lagerWelle ?? 0);
    this.lagerUhr = Math.max(0, this.lagerUhr - dt * zr);
    const drin = n > 0 && this.alleImLager();
    const neu = drin && !this.lagerDrin;
    this.lagerDrin = drin;
    if (neu && this.lagerUhr <= 0 && !this.lagerPlan && this.lagerStarten(n)) this.lagerUhr = Math.max(0, e.lagerWellePause ?? 10) * 60;
    const plan = this.lagerPlan;
    if (!plan) return;
    plan.t += dt;
    while (plan.gruppen.length && plan.gruppen[0].t <= plan.t) this.lagerGruppe(plan, plan.gruppen.shift());
    if (!plan.gruppen.length) this.lagerPlan = null;
  }

  // Plant die Welle: 3–4 Richtungen (nur solche mit Platz auf der Karte), je zwei Gruppen, über etwa 30 s gestaffelt (nach der Ansage);
  // false = kein Ziel am Lager oder keine Richtung mit Platz
  lagerStarten(n) {
    const r = this.raum, ziel = this.zielVonArt('stuetzpunkt', null), sp = r.welt.stuetzpunkt;
    if (!ziel || !sp) return false;
    const mitte = { x: (sp.x + sp.b / 2) * KACHEL, y: (sp.y + sp.h / 2) * KACHEL };
    const d0 = SICHT + 22 + Math.sqrt(n / 6) * 14 + 300;   // Mindestabstand einer Gruppe vom Lagermitte
    const w0 = r.rnd() * Math.PI * 2, kand = [];
    for (let i = 0; i < 12; i++) {   // zwölf mögliche Richtungen; Karte muss dort bis in d0 Abstand reichen
      const w = w0 + i * Math.PI / 6, x = mitte.x + Math.cos(w) * d0, y = mitte.y + Math.sin(w) * d0;
      if (x >= 3 * KACHEL && y >= 3 * KACHEL && x <= (BREITE - 3) * KACHEL && y <= (HOEHE - 3) * KACHEL) kand.push(w);
    }
    if (!kand.length) return false;
    const k = Math.min(r.rnd() < 0.5 ? 3 : 4, kand.length), richtungen = [];
    // Richtungen möglichst weit auseinander: der Reihe nach die jeweils entfernteste von den schon gewählten
    richtungen.push(kand.splice(Math.floor(r.rnd() * kand.length), 1)[0]);
    const wd = (a, b) => { const d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
    while (richtungen.length < k && kand.length) {
      let bi = 0, bd = -1;
      kand.forEach((w, i) => { const d = Math.min(...richtungen.map(q => wd(w, q))); if (d > bd) { bd = d; bi = i; } });
      richtungen.push(kand.splice(bi, 1)[0]);
    }
    const feld = this.baueFeld(ziel);
    if (!feld) return false;
    const g = richtungen.length * 2, gruppen = [];
    for (let i = 0; i < g; i++) {
      const rest = n - gruppen.reduce((a, q) => a + q.n, 0);
      gruppen.push({ t: ANSAGE + (i / g) * LAGER_STAFFEL + r.rnd() * 2, n: Math.round(rest / (g - i)), winkel: richtungen[i % richtungen.length] + (r.rnd() - 0.5) * 0.3 });
    }
    this.lagerPlan = { t: 0, gruppen, richtungen, ziel, feld, mitte, d0, erzeugt: 0 };
    const NAME = ['Osten ▶', 'Süden', '◀ Westen', 'Norden'];
    const himmel = [...new Set(richtungen.map(w => NAME[Math.round((((w % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4]))];
    r.broadcast('meldung', { text: `🧟 Eine Zombiehorde kommt von ${himmel.join(', ')}!`, lang: true });
    return true;
  }

  // Eine Gruppe erscheint außerhalb der Sicht in der Richtung (Winkel) vom Lager aus und zieht zum Lager;
  // klappt es dort nicht (Häuser, Wasser), werden andere geplante Richtungen versucht, zuletzt wird die Zahl der nächsten Gruppe zugeschlagen
  lagerGruppe(plan, q) {
    if (q.n < 1) return;
    const r = this.raum, radius = 22 + Math.sqrt(q.n) * 14;
    for (const basis of [q.winkel, ...plan.richtungen.filter(w => Math.abs(w - q.winkel) > 0.5)]) {
      for (let v = 0; v < 10; v++) {
        const w = basis + (r.rnd() - 0.5) * 0.1 * (1 + v), d = plan.d0 + v * 50 + r.rnd() * 150;
        const cx = plan.mitte.x + Math.cos(w) * d, cy = plan.mitte.y + Math.sin(w) * d;
        if (cx < 3 * KACHEL || cy < 3 * KACHEL || cx > (BREITE - 3) * KACHEL || cy > (HOEHE - 3) * KACHEL) continue;
        const ids = this.erzeugen('west', q.n, { cx, cy, ziel: plan.ziel, feld: plan.feld, lager: true });
        if (ids) {
          plan.erzeugt += ids.length;
          const fehl = q.n - ids.length;   // nicht alle fanden Platz: Rest zur nächsten Gruppe (bei der letzten: noch ein Versuch)
          if (fehl > 0) { if (plan.gruppen.length) plan.gruppen[0].n += fehl; else if (!q.nachschlag) this.lagerGruppe(plan, { ...q, n: fehl, nachschlag: true }); }
          return;
        }
      }
    }
    if (plan.gruppen.length) plan.gruppen[0].n += q.n;
  }

  // Meldung 10 s vorher; seite 'west' = sie kommen von links, 'ost' = von rechts
  ansagen(seite = null) {
    const ref = this.bezug();
    if (!seite) {
      seite = this.letzteSeite ? (this.letzteSeite === 'west' ? 'ost' : 'west') : this.raum.rnd() < 0.5 ? 'west' : 'ost';   // nie die Seite der letzten Horde
      // zu nah am Kartenrand: auf die andere Seite ausweichen, damit sie wirklich außerhalb des Bildes auftauchen
      if (ref.draussen && ref.x - ABSTAND < 2 * KACHEL) seite = 'ost';
      else if (ref.draussen && ref.x + ABSTAND > (BREITE - 2) * KACHEL) seite = 'west';
    }
    this.ansage = { t: ANSAGE, seite };
    this.raum.broadcast('meldung', { text: `🧟 Eine Zombiehorde kommt von ${seite === 'west' ? '◀ Westen' : 'Osten ▶'}!`, lang: true });
    return seite;
  }

  // Bezugspunkt: ein zufälliger Spieler draußen; sonst (alle in Häusern) die Haustür-Mitte; sonst die Kartenmitte
  bezug() {
    const s = this.raum.state;
    const draussen = [...s.spieler.values()].filter(p => !p.ebene && !p.unten && !p.anBord && !(p.zombie > 0));
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
  // Hordengröße: je Spieler (Level-Tabelle) × Spielerzahl × Tag-Bonus × Regler, zufällig ±30 %
  hordeGroesse() {
    const r = this.raum, lv = r.levelEinst(), faktor = r.schwierigkeit?.().horde ?? 1;
    return Math.max(1, Math.min(WELLE_MAX, Math.round(lv.horde * r.spielerZahl() * faktor * (0.7 + 0.6 * r.rnd()))));
  }

  // opts (Lager-Welle): { cx, cy, ziel, feld, lager } = feste Startmitte und festes Ziel; null, wenn nicht mindestens 60 % Platz finden
  erzeugen(seite = 'west', anzahl = null, opts = null) {
    const r = this.raum, welt = r.welt;
    const n = Math.max(1, Math.min(WELLE_MAX, Math.round(anzahl ?? this.hordeGroesse())));
    const richtung = seite === 'west' ? 1 : -1;     // Zugrichtung in x
    const ref = this.bezug();
    const kl = (v, a, b) => Math.max(a, Math.min(b, v));
    const grenzeX = [2 * KACHEL, (BREITE - 2) * KACHEL], grenzeY = [2 * KACHEL, (HOEHE - 2) * KACHEL];
    const zielX = [RAND * KACHEL, (BREITE - RAND) * KACHEL], zielY = [RAND * KACHEL, (HOEHE - RAND) * KACHEL];   // Ziele bleiben im Ort
    // Streuradius so, dass n Zombies dicht stehen (ca. 26 px Platz je Zombie)
    const radius = 22 + Math.sqrt(n) * 14;
    // Mitte so weit weg, dass auch der vorderste Zombie hinter dem Bildrand steht; dann laufen sie ins Bild ein
    const randX = [Math.min(grenzeX[0] + radius, BREITE * KACHEL / 2), Math.max(grenzeX[1] - radius, BREITE * KACHEL / 2)];   // ganze Horde auf der Karte
    const cx = opts ? opts.cx : kl(ref.draussen ? ref.x - richtung * (SICHT + radius + 80 + r.rnd() * 200) : (seite === 'west' ? 2.5 : BREITE - 2.5) * KACHEL, ...randX);
    const cy0 = opts ? opts.cy : kl(ref.y + (r.rnd() - 0.5) * 160, ...grenzeY);
    const ziel = opts ? opts.ziel : { x: kl(ref.x + richtung * ZIEL_ABSTAND, ...zielX), y: kl(ref.y, ...zielY) };
    // kein Zombie darf in Sichtweite irgendeines Spielers draußen auftauchen
    const sehende = opts?.blind ? [] : [...r.state.spieler.values()].filter(p => !p.ebene && !(p.zombie > 0));   // blind: Boxer-Horde erscheint bewusst vor den Augen der Insassen
    let sicht = SICHT;   // wird gelockert, wenn die Karte zu klein ist (Testkarte, Kartenrand)
    const gesehen = (x, y) => sehende.some(p => Math.abs(p.x - x) < sicht + 40 && Math.abs(p.y - y) < sicht * 0.75 + 40);
    const plaetze = cy => {
      const liste = [];
      for (let v = 0; v < n * 8 && liste.length < n; v++) {
        const a = r.rnd() * Math.PI * 2, d = radius * Math.sqrt(r.rnd());
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (x < KACHEL || y < KACHEL || x > (BREITE - 1) * KACHEL || y > (HOEHE - 1) * KACHEL) continue;
        if (!frei(welt, x, y, W.zombieRadius + 2) || drinnen(welt, x, y) || gesehen(x, y)) continue;
        if (r.tuerNahe(x, y, 120)) continue;   // nie dicht an Haus-/Safe-Room-Türen
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
    if (!beste.length || (opts && beste.length < n * 0.6)) return null;
    const ids = new Set();
    if (!opts) this.letzteSeite = seite;
    const w0 = Math.atan2(ziel.y - cy0, ziel.x - cx);
    const a = { ids, ziel, mitte: { x: cx, y: cy0 }, alter: 0, lebt: 0, dauer: r.levelEinst().dauer * 60, abzug: false, seite, feld: opts?.feld ?? this.baueFeld(ziel), pruef: { t: 0, x: cx, y: cy0 }, ziele: 1, lager: !!opts?.lager, ...this.neuerZustand() };
    for (const p of beste) {
      const id = r.setzeZombie(p.x, p.y, '');
      const info = r.zombieInfo.get(id);
      info.h = a;
      info.welle = true; info.bleibt = true; info.versatz = (r.rnd() - 0.5) * 0.4; info.ausweich = 0;
      info.wTempo = 0.8 + r.rnd() * 0.4; info.phase = r.rnd() * Math.PI * 2; info.phaseV = 1 + r.rnd() * 1.2; info.steuerT = r.rnd() * 0.4;
      r.state.zombies.get(id).richtung = w0;
      ids.add(id);
    }
    this.horden.push(a);
    a.zielName = this.zielName(opts?.lager ? 'stuetzpunkt' : 'start', ziel);
    this.wechselMerken(a, opts?.lager ? 'stuetzpunkt' : 'start', 'start');
    return [...ids];
  }

  // Wegefeld zum Gruppenziel: Schritte jeder begehbaren Kachel bis zur Zielkachel (einmal je Ziel)
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
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || feld[ny * BREITE + nx] !== -1) continue;
        if (!frei_(nx, ny) && !(BLOCKIERT.has(welt.hole(nx, ny)) && feinDurchgang(welt, x, y, nx, ny))) continue;   // Kachel gesperrt, im Feinraster aber offen (schmaler Durchgang)
        feld[ny * BREITE + nx] = feld[i] + 1; q.push(ny * BREITE + nx);
      }
    }
    return feld;
  }

  // Richtung nach dem Wegefeld: bis zu drei Kacheln vorausschauen (glatter Weg um Häuser), aber nur so weit, wie die Gerade
  // für die Figur frei ist (keine Ecken schneiden und an Hauswänden hängenbleiben); null = kein Weg bekannt / am Ziel
  feldRichtung(feld, x, y) {
    let kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    if (kx < 0 || ky < 0 || kx >= BREITE || ky >= HOEHE || feld[ky * BREITE + kx] <= 0) return null;
    const welt = this.raum.welt;
    const ziele = [];
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
      ziele.push([(kx + 0.5) * KACHEL, (ky + 0.5) * KACHEL]);
    }
    if (!ziele.length) return null;
    let wahl = ziele[0];
    for (let i = ziele.length - 1; i > 0; i--) {   // weitestes Ziel mit freier Gerade
      const [tx, ty] = ziele[i];
      const d = Math.hypot(tx - x, ty - y), n = Math.ceil(d / 10);
      let ok = true;
      for (let k = 1; k <= n && ok; k++) ok = frei(welt, x + (tx - x) * k / n, y + (ty - y) * k / n, W.zombieRadius + 1);
      if (ok) { wahl = ziele[i]; break; }
    }
    return Math.atan2(wahl[1] - y, wahl[0] - x);
  }

  // Zeitgeber, Trupps und Lärmsperre einer neuen Horde
  neuerZustand() {
    return { zielUhr: this.zielDauer(), trupps: [], cool: new Map(), truppT: 0, laermPause: 0, seitZiel: 0, radius: 100, zielArt: 'start', klemmStufe: 0, umwegBis: 0, feldHaupt: null, wechsel: [], infoT: 0 };
  }

  // Sekunden (echte Zeit) bis zum nächsten Zielwechsel: hordeZiel Minuten, zufällig ±40 %
  zielDauer() {
    const m = Math.max(0.2, this.einst().hordeZiel ?? 3.5);
    return m * (0.6 + 0.8 * this.raum.rnd()) * 60;
  }

  // Gruppenmitte nachführen; Zielwechsel nach Zeit/Ankunft/Klemmen, Trupps lösen und verwalten; Zeitablauf: auflösen
  verfolgen(a, dt, zr = 1) {
    const z = this.raum.state.zombies;
    a.alter += dt; a.lebt += dt * zr; a.seitZiel += dt; a.laermPause -= dt;
    let sx = 0, sy = 0, n = 0, amZiel = 0;
    const streu = Math.max(192, Math.sqrt(Math.max(a.ids.size, 1)) * 14);   // Streuradius der Eigenpunkte (siehe lenken)
    for (const id of a.ids) {
      const q = z.get(id), info = this.raum.zombieInfo.get(id);
      if (!q || !info?.welle) { a.ids.delete(id); continue; }
      sx += q.x; sy += q.y; n++;
      if (Math.hypot(q.x - a.ziel.x, q.y - a.ziel.y) < streu + 70) amZiel++;
    }
    if (a.abzug) return this.abzugSchritt(a, dt, n, sx, sy);
    a.truppT += dt;
    if (a.truppT >= TRUPP_TAKT) { const d = a.truppT; a.truppT = 0; this.truppen(a, d); }
    if (!n) { if (!a.trupps.length) this.entfernen(a); return; }
    a.mitte = { x: sx / n, y: sy / n };
    if (a.lebt > a.dauer) return this.aufloesen(a);
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
      if (!klemmt) a.klemmStufe = 0;
      else if (a.klemmStufe === 0) { a.klemmStufe = 1; klemmt = false; this.umweg(a); }   // erstes Mal (15 s): ausweichen
      // zweites Mal in Folge (30 s ohne Fortschritt): klemmt bleibt true → neues Ziel
    }
    if (a.umwegBis && a.alter >= a.umwegBis) { a.umwegBis = 0; if (a.feldHaupt) { a.feld = a.feldHaupt; a.feldHaupt = null; } }
    a.zielUhr -= dt;
    // Ziel wechseln: Zeit abgelaufen, am Ziel (Mitte nah oder die Hälfte angekommen) oder festgefahren
    const angekommen = Math.hypot(a.mitte.x - a.ziel.x, a.mitte.y - a.ziel.y) < 160 + Math.sqrt(n) * 6 || amZiel >= n / 2 || (a.seitZiel > 60 && amZiel >= n * 0.2);
    if (!a.lager && (klemmt || angekommen || a.zielUhr <= 0)) this.neuesZiel(a, klemmt ? 'festgefahren' : angekommen ? 'angekommen' : 'zeit');
  }

  // Umweg: kurz einen Punkt seitlich der Gruppenmitte ansteuern (Wegefeld dorthin), danach wieder zum eigentlichen Ziel
  umweg(a) {
    for (let v = 0; v < 6; v++) {
      const p = this.punktNahe(a.mitte.x, a.mitte.y, 250, 500);
      if (!p) continue;
      const feld = this.baueFeld(p);
      if (!feld) continue;
      a.feldHaupt ??= a.feld; a.feld = feld; a.umwegBis = a.alter + UMWEG_DAUER;
      return true;
    }
    return false;
  }

  // ---- Prüfwerkzeug: lesbarer Zielname, Zielwechsel-Liste, Log, 'hordeInfo' an Clients ----

  zielName(art, ziel) {
    const welt = this.raum.welt, K = KACHEL;
    const haus = () => {
      let best = null, bd = 40;
      for (const h of welt.haeuser ?? []) { const d = Math.hypot((h.tuer.x + 0.5) * K - ziel.x, (h.tuer.y + 1.5) * K - ziel.y); if (d < bd) { bd = d; best = h; } }
      return best;
    };
    switch (art) {
      case 'safe': { const q = (welt.safeRooms ?? []).find(q => Math.hypot(q.vorTuer.x - ziel.x, q.vorTuer.y - ziel.y) < 40); return q?.name ? `Safe Room ${q.name}` : 'Safe Room'; }
      case 'laden': { const h = haus(); return h?.name ? `Laden ${h.name}` : `Laden${h?.art ? ' (' + h.art + ')' : ''}`; }
      case 'haus': { const h = haus(); return h?.name ? `Haus ${h.name}` : 'Haus'; }
      case 'stuetzpunkt': return 'Stützpunkt';
      case 'laerm': return 'Lärm';
      case 'kreuzung': return 'Kreuzung';
      case 'spieler': return 'Spieler-Nähe';
      case 'menschen': return 'Menschen';
      case 'zufall': return 'Zufallspunkt';
      case 'start': return 'Gegenseite';
    }
    return art;
  }

  wechselMerken(a, art, grund) {
    const name = a.zielName;
    a.wechsel.push({ zeit: Math.round(this.raum.state?.uhr ?? 0), art, name, grund });
    if (a.wechsel.length > WECHSEL_MAX) a.wechsel.splice(0, a.wechsel.length - WECHSEL_MAX);
    const GRUND = { zeit: 'Zeit', angekommen: 'angekommen', festgefahren: 'festgefahren', laerm: 'Lärm', start: 'Start', dauer: 'Hordendauer um' };
    console.log(`Horde (${a.ids.size}): neues Ziel ${name} – Grund: ${GRUND[grund] ?? grund}`);
  }

  // Zustand der Horden an Clients, die ihn sehen wollen (Einstellung hordeZieleZeigen oder Client mit ?debug); sonst nichts senden.
  // Oben die Felder der ersten Horde (Übersichtskarte, Fahne), dazu „horden“ mit allen: Größe, Restzeit, nächstes Ziel
  infoSenden(dt = INFO_TAKT, erzwingen = false) {
    const r = this.raum, hs = this.horden;
    if (hs.length) { this.infoT = (this.infoT ?? 0) - dt; if (this.infoT > 0 && !erzwingen) return; this.infoT = INFO_TAKT; }
    // nur Superuser: Einstellung hordeZieleZeigen = für Superuser von Anfang an an; im ☰-Menü je Person schaltbar
    const alle = !!this.einst().hordeZieleZeigen;
    const debug = r.hordeDebug, aus = r.hordeAus;
    const sieht = c => !!r.extra?.get(c.sessionId)?.superuser && !aus?.has(c.sessionId) && (alle || !!debug?.has(c.sessionId));
    const empf = (r.clients ?? []).filter(sieht);
    if (!empf.length) { this.infoOffen = false; return; }
    const eine = a => ({
      n: a.ids.size + a.trupps.reduce((x, t) => x + t.ids.size, 0), mitte: { x: Math.round(a.mitte.x), y: Math.round(a.mitte.y) }, ziel: { x: Math.round(a.ziel.x), y: Math.round(a.ziel.y) },
      art: a.zielArt, name: a.zielName, rest: a.abzug ? 0 : Math.max(0, Math.round(a.zielUhr)), restDauer: Math.max(0, Math.round(a.dauer - a.lebt)), abzug: !!a.abzug,
      wechsel: a.wechsel.slice(-WECHSEL_MAX),
    });
    const m = hs.length ? { aktiv: true, ...eine(hs.find(h => !h.abzug) ?? hs[0]), horden: hs.map(eine) } : { aktiv: false };
    if (!hs.length && !this.infoOffen) return;
    this.infoOffen = hs.length > 0;
    for (const c of empf) { try { c.send('hordeInfo', m); } catch { /* Client weg */ } }
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
      case 'laerm': return this.laermOrt && this.zeit - this.laermOrt.t < 180 ? { x: this.laermOrt.x, y: this.laermOrt.y } : null;
      case 'menschen': {
        const l = [...s.menschen.values()].filter(m => m.sichtbar && !m.infiziert && !m.ebene);
        const m = wahl(l); return m ? this.punktNahe(m.x, m.y, 60, 160) : null;
      }
      case 'spieler': {
        const l = [...s.spieler.values()].filter(p => !p.ebene && !p.unten && !p.anBord && !(p.zombie > 0));
        const p = wahl(l); return p ? this.punktNahe(p.x, p.y, 260, 520) : null;
      }
      case 'kreuzung': return wahl(this.kreuzungen());
    }
    return null;
  }

  // Zielart gewichtet wählen und ein erreichbares Ziel dazu finden (mindestens RAND Kacheln vom Kartenrand, nicht direkt nebenan)
  waehleZiel(a) {
    const r = this.raum;
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
  neuesZiel(a, grund = 'zeit') {
    const r = this.raum;
    if (!a || a.abzug) return;
    const w = this.waehleZiel(a);
    if (!w) return;   // Ziel unerreichbar: das alte behalten, beim nächsten Takt neuer Versuch
    this.setzeZiel(a, w.ziel, w.feld, w.art, grund);
    for (const id of [...a.ids]) {
      if (a.ids.size <= 3 || r.rnd() >= ABSPALT) continue;
      const info = r.zombieInfo.get(id);
      if (info) { info.welle = false; info.bleibt = false; }
      a.ids.delete(id);
    }
  }

  setzeZiel(a, ziel, feld, art, grund = 'zeit') {
    a.ziel = ziel; a.feld = feld; a.ziele++; a.zielArt = art; a.seitZiel = 0; a.zielUhr = this.zielDauer();
    a.pruef = { t: 0, x: a.mitte.x, y: a.mitte.y }; a.klemmStufe = 0; a.umwegBis = 0; a.feldHaupt = null;
    a.zielName = this.zielName(art, ziel);
    this.wechselMerken(a, art, grund);
    this.infoSenden(0, true);
  }

  // Lärm (aus SpielRaum.laerm): lenkt jede Horde höchstens alle 2–3 Minuten um, nur bei lautem Lärm (weite >= LAERM_LAUT)
  // oder wenn die Hordenmitte ohnehin nah dran ist (LAERM_NAH); das Ziel bleibt mindestens 60 % der Zielzeit (hordeZiel) bestehen.
  laermHoeren(x, y, weite) {
    this.laermOrt = { x, y, t: this.zeit };
    if (weite < 200) return;
    const kl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const a of this.horden) {
      if (a.abzug || a.lager || a.laermPause > 0) continue;
      if (a.seitZiel < Math.max(0.2, (this.einst().hordeZiel ?? 3.5) * 0.6) * 60) continue;
      const dist = Math.hypot(a.mitte.x - x, a.mitte.y - y);
      if (!(weite >= LAERM_LAUT ? dist <= Math.max(700, a.radius + weite) : dist < LAERM_NAH)) continue;
      const ziel = { x: kl(x, RAND * KACHEL, (BREITE - RAND) * KACHEL), y: kl(y, RAND * KACHEL, (HOEHE - RAND) * KACHEL) };
      if (Math.hypot(ziel.x - a.mitte.x, ziel.y - a.mitte.y) < 200) continue;
      const feld = this.baueFeld(ziel);
      if (!feld) continue;
      a.laermPause = LAERM_PAUSE_MIN + this.raum.rnd() * (LAERM_PAUSE_MAX - LAERM_PAUSE_MIN);
      this.setzeZiel(a, ziel, feld, 'laerm', 'laerm');
    }
  }

  // ---- Angriffstrupps ----

  // alle möglichen Opfer: Spieler/Bots draußen (nicht am Boden), Soldaten (ein Ziel für den Stützpunkt), sichtbare Menschen
  opfer(a) {
    const r = this.raum, s = r.state, out = [];
    for (const [sid, p] of s.spieler) if (!p.ebene && !p.unten && !p.anBord && !p.kamera && !(p.zombie > 0)) out.push({ key: 's:' + sid, art: 'spieler', sid, x: p.x, y: p.y });
    const sp = r.stuetzpunkt;
    if (sp?.schuetzen && s.stuetzpunkt === 'steht' && sp.einst().falltage > 0) {
      let best = null, bd = Infinity;
      for (const q of sp.schuetzen) { if (q.tot) continue; const d = Math.hypot(q.x - a.mitte.x, q.y - a.mitte.y); if (d < bd) { bd = d; best = q; } }
      if (best) out.push({ key: 'bw', art: 'soldat', x: best.x, y: best.y });
    }
    const pol = r.polizei?.lebende?.() ?? [];   // Polizisten an den Straßensperren (ein Ziel je Sperre: der nächste)
    for (const k of new Set(pol.map(q => q.sperre))) {
      let best = null, bd = Infinity;
      for (const q of pol) if (q.sperre === k) { const d = Math.hypot(q.x - a.mitte.x, q.y - a.mitte.y); if (d < bd) { bd = d; best = q; } }
      if (best) out.push({ key: 'pol' + k, art: 'polizei', x: best.x, y: best.y });
    }
    for (const [mid, m] of s.menschen) if (m.sichtbar && !m.infiziert && !m.ebene) out.push({ key: 'm:' + mid, art: 'mensch', mid, x: m.x, y: m.y });
    return out;
  }

  // aktuelle Lage eines Trupp-Ziels ({x, y}) oder null, wenn es nicht mehr angreifbar ist
  opferLage(t) {
    const r = this.raum, s = r.state;
    if (t.art === 'spieler') { const p = s.spieler.get(t.sid); return p && !p.ebene && !p.unten && !p.anBord && !(p.zombie > 0) ? p : null; }
    if (t.art === 'mensch') { const m = s.menschen.get(t.mid); return m && m.sichtbar && !m.infiziert && !m.ebene ? m : null; }
    if (t.art === 'polizei') {
      let best = null, bd = Infinity;
      for (const q of r.polizei?.lebende?.() ?? []) { const d = Math.hypot(q.x - t.x, q.y - t.y); if (d < bd && d < 400) { bd = d; best = q; } }
      return best;
    }
    const sp = r.stuetzpunkt;
    if (!sp?.schuetzen || s.stuetzpunkt !== 'steht' || !(sp.einst().falltage > 0)) return null;
    let best = null, bd = Infinity;
    for (const q of sp.schuetzen) { if (q.tot) continue; const d = Math.hypot(q.x - t.x, q.y - t.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  // alle TRUPP_TAKT Sekunden: neue Trupps lösen, bestehende betreuen
  truppen(a, dt) {
    const r = this.raum, e = this.einst();
    const z = r.state.zombies;
    // bestehende Trupps
    for (const t of [...a.trupps]) {
      t.alter += dt;
      const lebende = [...t.ids].filter(id => z.has(id) && r.zombieInfo.get(id)?.trupp === t);
      t.ids = new Set(lebende);
      const lage = lebende.length ? this.opferLage(t) : null;
      if (!lage || t.alter > 300) { this.truppEnde(a, t); continue; }
      t.x = lage.x; t.y = lage.y;
      let sieht = false;
      for (const id of lebende) { const q = z.get(id); if (Math.hypot(q.x - lage.x, q.y - lage.y) < r.zombieSicht().verfolgen) { sieht = true; break; } }
      // solange das Opfer in Hörweite ist (Zombies im Umkreis), bleibt der Trupp dran
      if (!sieht && this.laermOrt && this.zeit - this.laermOrt.t < 8 && Math.hypot(this.laermOrt.x - lage.x, this.laermOrt.y - lage.y) < 400) sieht = true;
      t.aus = sieht ? 0 : t.aus + dt;
      if (t.aus > t.ausMax) { this.truppEnde(a, t); continue; }
      for (const id of lebende) {   // wer sein Ziel verloren hat, geht zur letzten bekannten Stelle, solange der Trupp es noch sucht
        const info = r.zombieInfo.get(id), q = z.get(id);
        if (!info.ziel && !info.mensch && !info.punkt && Math.hypot(q.x - lage.x, q.y - lage.y) < r.zombieSicht().aufgeben) info.punkt = { x: lage.x, y: lage.y };
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
      const t0 = Math.max(1, e.hordeTrupp ?? 10), lo = Math.max(1, t0 * 0.7), hi = Math.max(lo, t0 * 1.3);   // Angriffstrupp-Größe ±30 %
      let n = lo + r.rnd() * (hi - lo);
      n *= Math.max(0.5, Math.min(2, Math.sqrt(a.ids.size / 40)));   // größere Horde → größerer Trupp
      n = Math.max(n, a.ids.size * (0.15 + r.rnd() * 0.1));          // mindestens 15–25 % der Horde, damit der Angriff nicht versandet
      if (o.art === 'soldat') n *= 2;
      n = Math.min(n, Math.max(hi * 4, 60));                          // Obergrenze: Einstellung × 4 (mindestens 60)
      n = Math.max(1, Math.min(Math.round(n), a.ids.size - 3, 300));
      this.truppLoesen(a, o, kand.slice(0, n).map(q => q[1]));
      neu++;
    }
  }

  truppLoesen(a, o, ids) {
    const r = this.raum;
    const t = { key: o.key, art: o.art, sid: o.sid, mid: o.mid, x: o.x, y: o.y, ids: new Set(), alter: 0, aus: 0, ausMax: 30 + r.rnd() * 15 };
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
  truppEnde(a, t) {
    const r = this.raum;
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

  // Horde aus der Liste nehmen; war es die letzte ziehende, beginnt die Pause bis zur nächsten (uhr = null: Takt setzt sie neu)
  entfernen(a) {
    this.horden = this.horden.filter(h => h !== a);
  }

  // Hordendauer um: Trupps und etwa ein Drittel werden normale Streuner, der Rest zieht zum nächsten Kartenrand ab
  aufloesen(a = this.aktiv) {
    if (!a || a.abzug) return;
    const r = this.raum;
    // Trupps: wer jagt, jagt weiter (normaler Zombie)
    for (const t of a.trupps) for (const id of t.ids) {
      const info = r.zombieInfo.get(id);
      if (info && info.trupp === t) { info.trupp = null; info.welle = false; info.bleibt = false; }
    }
    a.trupps = [];
    const liste = [...a.ids];
    for (let i = liste.length - 1; i > 0; i--) { const k = Math.floor(r.rnd() * (i + 1)); [liste[i], liste[k]] = [liste[k], liste[i]]; }
    const streuner = Math.round(liste.length * STREUNER);
    for (const id of liste.slice(0, streuner)) {
      const info = r.zombieInfo.get(id);
      if (info) { info.welle = false; info.bleibt = false; info.h = null; }
      a.ids.delete(id);
    }
    // nächster Kartenrand (ein Punkt etwas innerhalb des Randes, damit das Wegefeld ihn kennt); andere Seiten als Ausweichen
    const m = a.mitte, rd = 3 * KACHEL;
    const kandidaten = [
      { d: m.x, x: rd, y: m.y }, { d: BREITE * KACHEL - m.x, x: BREITE * KACHEL - rd, y: m.y },
      { d: m.y, x: m.x, y: rd }, { d: HOEHE * KACHEL - m.y, x: m.x, y: HOEHE * KACHEL - rd },
    ].sort((p, q) => p.d - q.d);
    let rand = null, feld = null;
    for (const k of kandidaten) {
      const ziel = { x: Math.max(rd, Math.min(BREITE * KACHEL - rd, k.x)), y: Math.max(rd, Math.min(HOEHE * KACHEL - rd, k.y)) };
      feld = this.baueFeld(ziel);
      if (feld) { rand = ziel; break; }
    }
    if (!rand || !a.ids.size) {   // kein Weg zum Rand: alle bleiben als Streuner
      for (const id of a.ids) { const info = r.zombieInfo.get(id); if (info) { info.welle = false; info.bleibt = false; info.h = null; } }
      this.entfernen(a);
      return;
    }
    a.abzug = true; a.abzugT = 0; a.ziel = rand; a.feld = feld; a.zielArt = 'abzug'; a.zielName = 'Abzug zum Kartenrand';
    a.ziele++; a.seitZiel = 0; a.zielUhr = Infinity; a.umwegBis = 0; a.feldHaupt = null; a.klemmStufe = 0;
    a.pruef = { t: 0, x: m.x, y: m.y };
    this.wechselMerken(a, 'abzug', 'dauer');
    this.infoSenden(0, true);
  }

  // Abzug: wer am Rand steht oder außer Sicht aller Spieler draußen ist, wird gelöscht; nach ABZUG_MAX streunen die Reste
  abzugSchritt(a, dt, n, sx, sy) {
    const r = this.raum, z = r.state.zombies;
    a.abzugT += dt;
    if (n) a.mitte = { x: sx / n, y: sy / n };
    const spieler = [...r.state.spieler.values()].filter(p => !p.ebene);
    const rd = 2.2 * KACHEL;
    for (const id of [...a.ids]) {
      const q = z.get(id), info = r.zombieInfo.get(id);
      if (!q || !info) { a.ids.delete(id); continue; }
      if (a.abzugT > ABZUG_MAX) { info.welle = false; info.bleibt = false; info.h = null; a.ids.delete(id); continue; }
      if (q.jagt) { info.welle = false; info.bleibt = false; info.h = null; a.ids.delete(id); continue; }   // hat einen Spieler entdeckt: jagt als Streuner
      const amRand = q.x < rd || q.y < rd || q.x > BREITE * KACHEL - rd || q.y > HOEHE * KACHEL - rd;
      const nah = d => spieler.some(p => Math.hypot(p.x - q.x, p.y - q.y) < d);
      if (!nah(ABZUG_SICHT) || (amRand && !nah(400))) { z.delete(id); r.zombieInfo.delete(id); a.ids.delete(id); }
    }
    if (!a.ids.size) this.entfernen(a);
  }

  // Sofort beenden (Prüfwerkzeug, Tests): ferne Zombies verschwinden, die übrigen werden normale Zombies
  beenden(a = this.aktiv) {
    if (!a) return;
    const r = this.raum;
    const spieler = [...r.state.spieler.values()].filter(p => !p.ebene);
    const alle = new Set(a.ids);
    for (const t of a.trupps) for (const id of t.ids) alle.add(id);
    for (const id of alle) {
      const q = r.state.zombies.get(id), info = r.zombieInfo.get(id);
      if (!q || !info) continue;
      info.trupp = null;
      const nah = spieler.some(p => Math.hypot(p.x - q.x, p.y - q.y) < 700);
      if (!nah && !q.jagt) { r.state.zombies.delete(id); r.zombieInfo.delete(id); }
      else { info.welle = false; info.bleibt = false; info.h = null; }
    }
    this.entfernen(a);
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
      // eigener, versetzter Zielpunkt um das Hordenziel (Streuung wächst mit der Hordengröße): die Horde staut sich nicht auf einem Punkt
      // am Platz gedrängt (Nachbarn im Mindestabstand): nach ein paar Sekunden einen weiter entfernten Eigenpunkt suchen, die Traube quillt auseinander
      if (info.angekommen && info.eng > 0) { if (++info.dicht >= 8) { info.dicht = 0; info.rf = Math.min(4, (info.rf ?? 1) * 1.4); info.zOffNr = -1; } } else info.dicht = 0;
      if (info.zOff === undefined || info.zOffNr !== a.ziele) {
        const rmax = Math.max(192, Math.sqrt(Math.max(a.ids.size, 1)) * 14) * (info.rf ?? 1);
        info.quer ??= (r.rnd() - 0.5) * 0.24;   // seitlicher Versatz quer zur Laufrichtung (kein Gänsemarsch auf einer Linie)
        info.zOffNr = a.ziele;
        // Punkt wählen, der vom Ziel aus frei erreichbar ist (nicht hinter Wänden): bis zu 16 Versuche mit schrumpfendem Radius
        let best = { x: 0, y: 0 };
        for (let t = 0; t < 16; t++) {
          const w0 = r.rnd() * Math.PI * 2, rr = (48 + Math.sqrt(r.rnd()) * (rmax - 48)) * (1 - t / 16 * 0.85);
          const ox = Math.cos(w0) * rr, oy = Math.sin(w0) * rr;
          let ok = frei(r.welt, a.ziel.x + ox, a.ziel.y + oy, W.zombieRadius);
          for (let k = 1; ok && k <= 8; k++) ok = frei(r.welt, a.ziel.x + ox * k / 8, a.ziel.y + oy * k / 8, W.zombieRadius);
          if (ok) { best = { x: ox, y: oy }; break; }
        }
        info.zOff = best;
      }
      info.stopp = 1;
      const px = a.ziel.x + info.zOff.x, py = a.ziel.y + info.zOff.y, dp = Math.hypot(px - z.x, py - z.y);
      let direkt = false;
      if (d0 < 260 + Math.hypot(info.zOff.x, info.zOff.y)) {   // nah am Ziel: geradeaus zum eigenen Punkt, wenn der Weg frei ist
        direkt = dp < 20;
        if (!direkt) {
          direkt = true;
          const n = Math.min(12, Math.ceil(dp / 16));
          for (let i = 1; i <= n && direkt; i++) if (!frei(r.welt, z.x + (px - z.x) * i / n, z.y + (py - z.y) * i / n, W.zombieRadius)) direkt = false;
        }
      }
      if (direkt) {
        vx = (px - z.x) / (dp || 1) * FELD_GEWICHT; vy = (py - z.y) / (dp || 1) * FELD_GEWICHT;
        if (dp < 70) { const k = Math.max(dp / 70, 0.05); vx *= k; vy *= k; info.stopp = Math.max(0.3, k); }
        info.angekommen = dp < 14;
      } else {
        info.angekommen = false;
        const eng = !info.zOff.x && !info.zOff.y && d0 < 90;   // enge Gasse, kein freier Eigenpunkt: vor dem Ziel abbremsen und stehen bleiben
        const wf = a.feld ? this.feldRichtung(a.feld, z.x, z.y) : null;
        vx = wf === null ? (a.ziel.x - z.x) / d0 : Math.cos(wf); vy = wf === null ? (a.ziel.y - z.y) / d0 : Math.sin(wf);
        const dm = Math.hypot(a.mitte.x - z.x, a.mitte.y - z.y);
        vx *= FELD_GEWICHT; vy *= FELD_GEWICHT;
        const vl = Math.hypot(vx, vy) || 1;
        const qx = -vy / vl * info.quer * FELD_GEWICHT, qy = vx / vl * info.quer * FELD_GEWICHT; vx += qx; vy += qy;
        if (dm > 140) { const k = Math.min(0.4, (dm - 140) / 400); vx += (a.mitte.x - z.x) / dm * k; vy += (a.mitte.y - z.y) / dm * k; }
        if (eng) { const k = Math.max(d0 / 90, 0.1); vx *= k; vy *= k; info.stopp = Math.max(0.2, k); info.angekommen = d0 < 30; }
      }
    }
    const fx = vx, fy = vy;   // Zugrichtung ohne Schwarmkräfte (für den Wandtest unten)
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
    // Abstoßung nicht gegen Wände drücken: ist die Richtung mit Abstoßung versperrt, gilt nur die Zugrichtung
    const sepOk = (qx, qy) => { const l = Math.hypot(qx, qy) || 1; return frei(r.welt, z.x + qx / l * (W.zombieRadius + 5), z.y + qy / l * (W.zombieRadius + 5), W.zombieRadius); };
    info.sepStark = Math.hypot(sx, sy);
    if (sx || sy) {
      const sw = info.angekommen || info.stopp < 1 ? 2.2 : 0.8;   // am Ziel zählt der Abstand mehr als der Zug: lockere Traube statt Haufen
      const gx = fx + sx * sw, gy = fy + sy * sw;
      if (sepOk(gx, gy)) { vx = gx; vy = gy; } else { vx = fx; vy = fy; }
    }
    if (an) { const l = Math.hypot(ax, ay) || 1; vx += ax / l * 0.3; vy += ay / l * 0.3; }
    let h = Math.atan2(vy, vx);
    // feine Hindernisse (Bänke, Autos, Zaunpfosten, Hausecken) voraus: seitlich daran vorbeisteuern, bevor der Zombie anstößt
    const voraus = ang => frei(r.welt, z.x + Math.cos(ang) * 22, z.y + Math.sin(ang) * 22, W.zombieRadius) && frei(r.welt, z.x + Math.cos(ang) * 11, z.y + Math.sin(ang) * 11, W.zombieRadius);
    if (!voraus(h)) {
      info.seite ??= r.rnd() < 0.5 ? -1 : 1;   // bevorzugte Ausweichseite je Zombie (kein Hin und Her)
      for (const dw of [0.45, 0.9, 1.4, 1.9]) {
        if (voraus(h + info.seite * dw)) { h += info.seite * dw; break; }
        if (voraus(h - info.seite * dw)) { h -= info.seite * dw; break; }
      }
    }
    return h;
  }

  // Bewegung eines Wellen-Zombies (aus zombieSchritt, wenn er nichts jagt und keinem Geräusch folgt)
  gehen(id, z, info, dt) {
    const r = this.raum, a = info.h && this.horden.includes(info.h) ? info.h : null;   // jeder Zombie kennt seine Horde
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
        if (info.angekommen && !info.sepStark) { info.pauseT = 0.6 + r.rnd() * 1.2; return; }   // am eigenen Platz, niemand im Weg: stehen bleiben
        if (u < 0.02) { info.taumelT = 0.3 + r.rnd() * 0.4; info.taumelW = (r.rnd() < 0.5 ? -1 : 1) * (0.4 + r.rnd() * 0.4); }
        else if (u < 0.04) { info.pauseT = 0.4 + r.rnd() * 0.9; return; }
      }
      w = info.lenkW + Math.sin(info.phase) * 0.18;   // leichtes Schlängeln
      if (info.taumelT > 0) { info.taumelT -= dt; w += info.taumelW; }
    }
    z.richtung = w;
    // in Spielernähe langsamer werden, statt an ihm vorbeizumarschieren (Nachzügler bleiben im Sichtfeld, Trupps schnappen zu)
    let bremse = 1;
    for (const p of r.state.spieler.values()) {
      if (p.ebene || p.unten || p.anBord) continue;
      const dx = p.x - z.x, dy = p.y - z.y;
      if (Math.abs(dx) > 500 || Math.abs(dy) > 500) continue;
      const d = Math.hypot(dx, dy);
      bremse = Math.min(bremse, d < 300 ? 0.45 : 0.45 + (d - 300) / 200 * 0.55);
    }
    if (!r.zombieGehen(z, w, W.zombieTempoJagen * TEMPO * info.wTempo * bremse * (info.stopp ?? 1) * (info.eng ? ((info.stopp ?? 1) < 1 ? (info.eng > 1 ? 0.3 : 0.55) : 0.75) : 1) * dt, dt, info)) {
      // seitlich am Hindernis entlang: zuerst flache Winkel zur Zugrichtung, die Seite mit freiem Platz wählen
      const seite = r.rnd() < 0.5 ? -1 : 1;
      let neu = null;
      for (const dw of [0.7, 1.2, 1.7]) for (const sg of [seite, -seite]) {
        const ww = w + sg * dw;
        if (!neu && frei(r.welt, z.x + Math.cos(ww) * 16, z.y + Math.sin(ww) * 16, W.zombieRadius)) neu = ww;
      }
      info.ausweich = 0.4 + r.rnd() * 0.4; info.ausweichW = neu ?? w + seite * 1.4;
    }
  }
}
