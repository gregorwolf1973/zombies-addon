// Panzer rammt Auto (Gregor, Variante b): Stößt ein gefahrener Boxer, Puma oder Leopard (server/fahrbar.mjs) mit einem Auto der
// Verkehrssimulation (server/verkehr.mjs, Arten CRASH_ARTEN, auch einem Unfallauto in Fahrt) zusammen, gibt es einen kurzen Ruck
// (der Panzer verliert Tempo, nimmt keinen Schaden), das Auto wird ein Stück zur Seite geschleudert und gedreht und bleibt als brennendes
// Wrack liegen (Rauch, dann Feuer wie beim Verkehrsunfall über raum.brand, keine Explosion; Krach und Lärm locken Zombies).
// Aus dem Wrack flieht ein Mensch wie bei der Unfallszene (server/unfallszene.mjs, Einstellung unfallTuer).
// Ein selbst gefahrenes Auto der Spieler (server/pkw.mjs) wird genauso zum Wrack; seine Insassen bleiben unverletzt und steigen aus.
// Fährt danach ein Panzer über ein Wrack (dieses oder jedes andere Pkw-Wrack in state.fahrzeuge), wird es plattgewalzt (Fahrzeug.art
// 'platt', kein Hindernis mehr, Darstellung client/plattwrack.mjs) und sein Feuer geht aus. Der rammende Panzer walzt sein Wrack erst,
// nachdem er einmal ganz von ihm herunter ist (sonst wäre es sofort platt). Kein neues Schemafeld: Lage über x/y/rq, Zustand über art/rauch.
// Reine Serverlogik (keine Weltdaten), Zufall nur über raum.rnd.
import { frei } from '../client/welt.mjs';
import { imFussabdruck } from '../client/evak.mjs';
import { kreisImRechteck } from '../client/fzkollision.mjs';
import { unfallSzene } from './unfallszene.mjs';

export const CRASH_ARTEN = new Set(['auto', 'polizei']);   // Verkehrsautos in Pkw-Größe (Laster, Bus, Feuerwehr, Evakuierung nicht)
export const PANZER_ARTEN = new Set(['boxer', 'puma', 'leopard']);
export const CRASH_TEMPO = 12;        // px/s (≈ 5 km/h): langsamer rollende Panzer schieben nur an (das Auto wartet, server/verkehr.mjs)
export const CRASH_BREMSE = 0.45;     // Ruck: der Panzer behält so viel Tempo
export const SCHLEUDER_ZEIT = 0.6;    // s: so lange rutscht das Wrack
export const FEUER_NACH = 1;          // s nach dem Rutschen: Verkehrsauto fängt Feuer (vorher Rauch)
export const FEUER_NACH_PKW = 4;      // s: Spielerauto – die Insassen haben Zeit, sich zu entfernen
export const PLATT_TEMPO = 6;         // px/s: so schnell muss ein Panzer mindestens fahren, um ein Wrack plattzuwalzen
const PKW_L = 36, PKW_B = 16;         // Wrackmaße (px), wie client/fzkollision.mjs FZ_LAENGE.wrack
const SCHUB_PLATT = 6;                // px: das Wrack rutscht beim Plattwalzen ein Stück in Fahrtrichtung

// Probenpunkte (längs, quer) eines Rechtecks mit halber Länge hl und halber Breite hb
const proben = (hl, hb) => { const p = []; for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) p.push([u * hl, v * hb]); return p; };
const AUTO_PROBEN = proben(PKW_L / 2, PKW_B / 2);

// Überlappen Panzer b (Fahrbar mit f, m) und Fahrzeug o (Pkw-Maße)? Punkte des einen im Rechteck des anderen (beide Richtungen)
export function beruehrt(b, o) {
  const f = b.f, hl = b.m.laenge / 2, hb = b.m.breite / 2;
  if (Math.abs(o.x - f.x) > hl + PKW_L / 2 + 2 || Math.abs(o.y - f.y) > hl + PKW_L / 2 + 2) return false;
  const c = Math.cos(o.richtung ?? 0), s = Math.sin(o.richtung ?? 0);
  for (const [u, v] of AUTO_PROBEN) if (imFussabdruck(f, o.x + c * u - s * v, o.y + s * u + c * v, hl, hb, 1)) return true;
  const r = { x: o.x, y: o.y, c, s, hl: PKW_L / 2, hb: PKW_B / 2 }, fc = Math.cos(f.richtung), fs = Math.sin(f.richtung);
  for (const [u, v] of proben(hl, hb)) if (kreisImRechteck(r, f.x + fc * u - fs * v, f.y + fs * u + fc * v, 1)) return true;
  return false;
}

export class Panzercrash {
  constructor(raum) {
    this.raum = raum;
    this.wracks = new Map();   // Fahrzeug-Id → { t, von (Panzer-Id), frei, start, ziel, feuerAb, feuerId, szene, pkw, angezuendet }
  }

  // je Takt (server/fahrbar.mjs Fahrbare.schritt): Wracks rutschen, fangen Feuer, Insassen steigen aus, Rauch aus nach dem Brand
  schritt(dt) {
    const r = this.raum, s = r.state;
    for (const [id, w] of [...this.wracks]) {
      const o = s.fahrzeuge.get(id);
      if (!o || o.art !== 'wrack') { this.wracks.delete(id); continue; }
      w.t += dt;
      if (w.t < SCHLEUDER_ZEIT + dt / 2) {
        const q = Math.min(1, w.t / SCHLEUDER_ZEIT), e = 1 - (1 - q) * (1 - q);   // abbremsend
        o.x = w.start.x + (w.ziel.x - w.start.x) * e; o.y = w.start.y + (w.ziel.y - w.start.y) * e;
        o.richtung = w.start.w + (w.ziel.w - w.start.w) * e;
        for (const sid of w.pkw?.insassen ?? []) { const p = s.spieler.get(sid); if (p) { p.x = o.x; p.y = o.y; } }
        continue;
      }
      if (w.pkw && !w.ausgestiegen) this.aussteigen(w, o);
      if (!w.szene) { w.szene = true; if (!w.pkw) unfallSzene(r, o); }   // Tür auf, Mensch flieht, ggf. Zombie folgt (Einstellung unfallTuer)
      if (!w.angezuendet && w.t >= w.feuerAb) {
        w.angezuendet = true;
        w.feuerId = r.brand?.anzuenden({ k: 'fz:' + id, x: o.x, y: o.y, art: 'fahrzeug', r: 42, fz: id }) ?? null;
        if (!w.feuerId) o.rauch = false;
      } else if (w.angezuendet && (!w.feuerId || !s.feuer.has(w.feuerId))) { o.rauch = false; this.wracks.delete(id); }   // ausgebrannt
    }
  }

  // je Takt und Panzer (server/fahrbar.mjs Fahrbar.schritt, nach dem Fahren): Zusammenstoß mit Autos, Wracks plattwalzen
  pruefen(b) {
    const f = b.f;
    if (!f || !PANZER_ARTEN.has(b.art)) return;
    const r = this.raum, s = r.state, v = r.verkehr, tempo = Math.abs(b.v ?? 0);
    for (const [id, o] of [...s.fahrzeuge]) {
      if (id === b.id) continue;
      if (o.art === 'wrack') { this.wrackPruefen(b, id, o, tempo); continue; }
      if (CRASH_ARTEN.has(o.art) && v?.info.has(id)) {
        if ((tempo >= CRASH_TEMPO || !o.haelt) && beruehrt(b, o)) this.crash(b, id, o);
        continue;
      }
      if (o.art === 'pkw' && tempo >= CRASH_TEMPO) {
        const pkw = r.fahrbare?.liste.find(q => q.id === id && q.f === o);
        if (pkw && beruehrt(b, o)) this.crash(b, id, o, pkw);
      }
    }
  }

  // Wrack unter dem Panzer: der rammende Panzer muss erst einmal herunter sein; dann (oder ein anderer Panzer) walzt er es platt
  wrackPruefen(b, id, o, tempo) {
    const f = b.f, w = this.wracks.get(id), hl = b.m.laenge / 2, hb = b.m.breite / 2;
    if (w && w.von === b.id && !w.frei) {
      if (w.t >= SCHLEUDER_ZEIT && !beruehrt(b, o)) w.frei = true;
      return;
    }
    if (w && w.t < SCHLEUDER_ZEIT) return;
    if (tempo < PLATT_TEMPO || !imFussabdruck(f, o.x, o.y, hl, hb, 4)) return;
    this.platt(b, id, o);
  }

  // Zusammenstoß: Ruck beim Panzer, Auto wird zum Wrack und rutscht seitlich weg (aus der Fahrspur des Panzers), Krach, Lärm, Meldung
  crash(b, id, o, pkw = null) {
    const r = this.raum, f = b.f, welt = r.welt;
    const vz = (b.v ?? 0) < 0 ? -1 : 1, fc = Math.cos(f.richtung), fs = Math.sin(f.richtung), hx = fc * vz, hy = fs * vz;
    const quer = -(o.x - f.x) * fs + (o.y - f.y) * fc;
    const seite = Math.abs(quer) > 2 ? Math.sign(quer) : (r.rnd() < 0.5 ? 1 : -1);
    const nx = -fs * seite, ny = fc * seite, tempo = Math.max(Math.abs(b.v ?? 0), 20);
    const querWeg = Math.max(8, b.m.breite / 2 + PKW_B / 2 + 6 - Math.abs(quer)), vorWeg = 6 + tempo * 0.12;
    const dx = hx * vorWeg + nx * querWeg, dy = hy * vorWeg + ny * querWeg, d = Math.sqrt(dx * dx + dy * dy);
    // so weit rutschen, wie es frei ist (Hauswände, Zäune halten das Wrack auf)
    let ex = o.x, ey = o.y;
    for (let k = 2; k <= d; k += 2) { const x = o.x + dx * k / d, y = o.y + dy * k / d; if (!frei(welt, x, y, 7)) break; ex = x; ey = y; }
    const dreh = seite * vz * (0.5 + r.rnd() * 0.6) * (tempo > 80 ? 1.3 : 1);
    const w0 = o.richtung ?? 0;
    // Fahrzeug wird Wrack: aus Verkehr und Unfallablauf nehmen (keine Explosion), Rauch an
    r.verkehr?.info.delete(id); r.verkehr?.unfaelle?.liste.delete(id);
    o.art = 'wrack'; o.haelt = true; o.rauch = true; o.blau = false;
    if (pkw) { o.leben = 0; pkw.f = null; if (r.fahrbare) r.fahrbare.liste = r.fahrbare.liste.filter(q => q !== pkw); }   // fährt nicht mehr (server/pkw.mjs schritt)
    this.wracks.set(id, { t: 0, von: b.id, frei: false, start: { x: o.x, y: o.y, w: w0 }, ziel: { x: ex, y: ey, w: w0 + dreh },
      feuerAb: SCHLEUDER_ZEIT + (pkw ? FEUER_NACH_PKW : FEUER_NACH), feuerId: null, szene: false, pkw, angezuendet: false, ausgestiegen: false });
    b.v *= CRASH_BREMSE;   // Ruck: der Panzer bremst stark, bleibt aber heil
    r.broadcast('krach', { x: o.x, y: o.y, ebene: '', ruck: b.id });
    r.laerm(o.x, o.y, 650, true, '');
    r.verkehr?.unfaelle?.melden(o.x, o.y, pkw ? '💥 Ein Panzer hat das Auto gerammt!' : '💥 Zusammenstoß mit dem Panzer!');
    for (const sid of pkw?.insassen ?? []) if (!pkw.istBot(sid)) pkw.sendeAn(sid, '💥 Vom Panzer gerammt – alle raus!');
  }

  // Spielerauto nach dem Rutschen: alle steigen unverletzt aus (Platz neben dem Wrack, server/pkw.mjs aussteigen)
  aussteigen(w, o) {
    w.ausgestiegen = true;
    const pkw = w.pkw;
    pkw.f = o;
    for (const sid of [...pkw.insassen].reverse()) pkw.aussteigen(sid);   // von hinten: der Fahrer zuletzt (sonst „Du fährst jetzt …“ an Mitfahrer)
    pkw.f = null; pkw.id = null; pkw.insassen = [];
  }

  // Wrack plattwalzen: art 'platt' (kein Hindernis, flach gezeichnet), ein Stück in Fahrtrichtung geschoben, Feuer und Rauch aus
  platt(b, id, o) {
    const r = this.raum, s = r.state, f = b.f, vz = (b.v ?? 0) < 0 ? -1 : 1;
    const x = o.x + Math.cos(f.richtung) * vz * SCHUB_PLATT, y = o.y + Math.sin(f.richtung) * vz * SCHUB_PLATT;
    if (frei(r.welt, x, y, 6)) { o.x = x; o.y = y; }
    o.art = 'platt'; o.haelt = true; o.rauch = false; o.blau = false;
    const br = r.brand;
    if (br) for (const [fid, inf] of [...br.info]) if (inf.fz === id) { s.feuer.delete(fid); br.info.delete(fid); s.verbrannt.set(inf.ziel, true); }
    r.verkehr?.info.delete(id); r.verkehr?.unfaelle?.liste.delete(id);
    this.wracks.delete(id);
    r.broadcast('b11platt', { x: o.x, y: o.y, w: f.richtung });   // Staub (client/szene_b11.mjs)
    r.broadcast('blech', { x: o.x, y: o.y });
    r.laerm(o.x, o.y, 400, true, '');
  }
}

