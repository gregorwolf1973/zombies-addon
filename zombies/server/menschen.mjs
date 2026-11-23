// Abschnitt 4: Menschen in der Stadt und der Ausbruch.
// Menschen gehen von zu Hause zum Einkaufen, zum Platz und zur Bushaltestelle, ein Bus fährt die Haltestellen ab.
// Zombies wittern Menschen und beißen sie; Gebissene werden nach einer einstellbaren Zeit selbst zu Zombies.
import { schema, t } from '@colyseus/schema';
import { entkoppeln } from './netzfeld.mjs';
import { KACHEL, BREITE, HOEHE, kachelVon, tempoVon, T, findeWeg, sichtfrei, bewege, baumFaktor, frei, ladenArt, zufall, DINGE, WERTE as W } from '../client/welt.mjs';

export const Mensch = schema({
  x: t.int16(), y: t.int16(),   // Position übertragen in ganzen Pixeln (Server rechnet genau)
  rq: t.uint8(),               // Blickrichtung in 256 Stufen (m.richtung im Bogenmaß bleibt Server-Eigenschaft, siehe SpielRaum.netzAbgleich)
  aussehen: t.string(),
  typ: t.string(),             // Bewohner-Typ (siehe TYPEN), '' = gewöhnlicher Bürger oder Polizist
  infiziert: t.boolean(),
  flieht: t.boolean(),
  sichtbar: t.boolean(),       // false = im Haus oder im Bus
  ebene: t.string(),           // '' = draußen, sonst Innenraum (versteckte Bewohner in Häusern, Begleiter im Haus)
  versteckt: t.boolean(),      // geduckt im Versteck (Zombies bemerken sie viel schwerer)
  folgt: t.boolean(),          // folgt einem Spieler (angesprochen, wird gerettet)
}, 'Mensch');
entkoppeln(Mensch, ['x', 'y']);


export const POLIZIST_ANTEIL = 0.06;
const RAD = 10;
const TEMPO = W.tempoGehen * 0.55, FLUCHT = W.tempoGehen * 0.62;   // Flucht langsamer als ein jagender Zombie (105 px/s), sonst holt er sie nie ein
const BISS_ABSTAND = 30;
export const PANIK_ANTEIL = 0.12;     // so viele Bewohner laufen schreiend herum, der Rest versteckt sich in Gruppen
export const VERSTECK_WEITE = 40;     // Witterungsreichweite der Zombies gegenüber Versteckten (sonst W.sichtWeite)
const ALARM = 75;                     // so nah darf ein Zombie an eine versteckte Gruppe kommen, bevor sie weiterzieht
const HAUS_VERSTECKT = 0.12;          // Anteil der Wohnhäuser (ohne Zombies) mit einem versteckten Menschen
const FOLGE_ABSTAND = 65;
export const RETTUNG_BELOHNUNG = ['verband', 'munition', 'wasser', 'essen'];

// Versteckpunkte im Windschatten von Häusern, Zäunen und Hecken (Baustein von DeepSeek, angepasst):
// begehbare Kacheln mit mindestens 2 Sichtblockern unter den 8 Nachbarn (einer davon orthogonal), nicht an Türen und Straßen.
// Zeilenweiser Scan, deshalb deterministisch; zwischen zwei Punkten mindestens 3 Kacheln.
export function versteckPunkte(hole, breite, hoehe, kachel, T) {
  const istBlock = t => t === T.WAND || t === T.ZAUN || t === T.DEKO;
  const punkte = [], belegt = new Uint8Array(breite * hoehe);
  const zuNah = (kx, ky) => {
    for (let y = Math.max(0, ky - 2); y <= Math.min(hoehe - 1, ky + 2); y++) for (let x = Math.max(0, kx - 2); x <= Math.min(breite - 1, kx + 2); x++) if (belegt[y * breite + x]) return true;
    return false;
  };
  for (let ky = 0; ky < hoehe; ky++) for (let kx = 0; kx < breite; kx++) {
    const t = hole(kx, ky);
    if (t !== T.WIESE && t !== T.PLATZ) continue;
    let block = 0, ortho = 0, verboten = false;
    for (let dy = -1; dy <= 1 && !verboten; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const n = hole(kx + dx, ky + dy);
      if (n === T.TUER || n === T.STRASSE) { verboten = true; break; }
      if (istBlock(n)) { block++; if (!dx || !dy) ortho++; }
    }
    if (verboten || block < 2 || ortho < 1 || zuNah(kx, ky)) continue;
    punkte.push({ x: (kx + 0.5) * kachel, y: (ky + 0.5) * kachel });
    belegt[ky * breite + kx] = 1;
  }
  return punkte;
}

// Tempo unter Bäumen in % (Einstellung, wird je Takt aus den Einstellungen geholt); die Baumkachel unter dem Menschen zählt
let baumProzent = 25;
const baum = (welt, m) => baumFaktor(welt, m.x, m.y, baumProzent);

// Bewegung in Teilschritten von höchstens 4 px (Netz: keine Sprünge)
const gehe = (welt, m, dx, dy) => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < n; i++) bewege(welt, m, dx / n, dy / n, RAD);
};

// Bewohner-Typen (Bild buerger160, Client): Tempo = Faktor auf das normale Bewohnertempo, Anteil = Wahrscheinlichkeit je Bewohner
// (Rest sind die gewöhnlichen Bürger und Polizisten). Wird deterministisch aus der Mensch-ID gewählt.
export const TYPEN = {
  dick: { tempo: 0.75, anteil: 0.07 }, oma: { tempo: 0.7, anteil: 0.07 }, opa: { tempo: 0.7, anteil: 0.07 },
  jogger: { tempo: 1.25, anteil: 0.07 }, teenager: { tempo: 1.1, anteil: 0.07 }, geschaeftsfrau: { tempo: 1, anteil: 0.07 },
  bauarbeiter: { tempo: 1, anteil: 0.07 }, rucksack: { tempo: 1, anteil: 0.07 },
};
export const typFuerId = id => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;   // Mischen, damit fortlaufende IDs gleichmäßig streuen
  let u = (h >>> 0) / 4294967296;
  for (const [n, e] of Object.entries(TYPEN)) { if (u < e.anteil) return n; u -= e.anteil; }
  return '';
};

const winkelDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export class Stadtleben {
  constructor(raum) {
    this.raum = raum;
    this.info = new Map();        // id → { heim, ziel, weg, warte, inf, steckt, art }
    this.naechsteId = 1;
    this.takt = 0;
    this.anfangs = 0;
    const w = raum.welt;
    this.wohnungen = w.haeuser.filter(h => h.betretbar && !ladenArt(h));
    this.laeden = w.haeuser.filter(h => h.betretbar && ladenArt(h));
    this.haltestellen = (w.details?.objekte ?? []).filter(o => o.a === 'haltestelle').map(o => ({ x: o.x * KACHEL, y: o.y * KACHEL, name: o.n }));
    this.plaetze = w.markt ? [{ x: (w.markt.x + w.markt.b / 2) * KACHEL, y: (w.markt.y + w.markt.h / 2) * KACHEL }] : [];
    // Verstecke (Windschatten von Häusern/Zäunen/Hecken) und Gruppen, die sich dort ducken
    this.verstecke = typeof w.hole === 'function' ? versteckPunkte(w.hole, BREITE, HOEHE, KACHEL, T).filter(p => frei(w, p.x, p.y, RAD)) : [];
    this.gruppen = new Map();     // id → { id, mitglieder: [ids], vp, vpIdx, soll, flucht, fluchtZeit }
    this.belegt = new Set();      // Indizes der besetzten Verstecke
    this.schlecht = new Set();    // Verstecke ohne Weg dorthin
    this.naechsteGruppe = 1;
    this.suchBudget = 0;
    this.hausFertig = new Set();  // Innenräume, in denen die Frage „versteckter Mensch?“ schon entschieden ist
    this.gerettet = 0;
  }

  // ---------- Gruppen und Verstecke ----------

  // freier Sitzplatz Nr. n am Versteck (kleiner Kreis um den Punkt)
  slotFuer(vp, n) {
    for (let j = 0; j < 8; j++) {
      const a = n * 2.1 + j * 0.8, rr = n ? 13 + j * 2 : 0;
      const x = vp.x + Math.cos(a) * rr, y = vp.y + Math.sin(a) * rr;
      if (frei(this.raum.welt, x, y, RAD)) return { x, y };
    }
    return { x: vp.x, y: vp.y };
  }

  // neue Gruppe an einem der nächsten freien Verstecke (bei pos), null wenn es keine Verstecke gibt
  neueGruppe(pos, soll = 2 + Math.floor(this.raum.rnd() * 3), nicht = -1) {
    if (!this.verstecke.length) return null;
    const alle = this.verstecke.map((p, i) => ({ p, i, d: Math.hypot(p.x - pos.x, p.y - pos.y) })).filter(c => c.i !== nicht && !this.schlecht.has(c.i)).sort((a, b) => a.d - b.d);
    const frei_ = alle.filter(c => !this.belegt.has(c.i));
    const wahl = (frei_.length ? frei_ : alle).slice(0, 6);
    if (!wahl.length) return null;
    const c = wahl[Math.floor(this.raum.rnd() * wahl.length)];
    const g = { id: 'g' + this.naechsteGruppe++, mitglieder: [], vp: c.p, vpIdx: c.i, soll, flucht: 0, fluchtZeit: 0 };
    this.belegt.add(c.i); this.gruppen.set(g.id, g);
    return g;
  }

  gruppeAufnehmen(g, id, inf) {
    inf.gruppe = g.id; inf.modus = 'versteck'; inf.slot = this.slotFuer(g.vp, g.mitglieder.length); inf.sitzt = false; inf.weg = null; inf.unterwegs = 0;
    g.mitglieder.push(id);
  }

  gruppeVerlassen(id, inf) {
    const g = this.gruppen.get(inf.gruppe);
    inf.gruppe = null; inf.sitzt = false;
    if (!g) return;
    g.mitglieder = g.mitglieder.filter(x => x !== id);
    if (!g.mitglieder.length) { this.gruppen.delete(g.id); this.belegt.delete(g.vpIdx); }
  }

  // Gruppe zieht gemeinsam zum nächsten Versteck, das vom Zombie weg liegt
  gruppeFlieht(g, gefahr) {
    const s = this.raum.state;
    const ms = g.mitglieder.map(id => s.menschen.get(id)).filter(Boolean);
    if (!ms.length) return;
    const cx = ms.reduce((a, m) => a + m.x, 0) / ms.length, cy = ms.reduce((a, m) => a + m.y, 0) / ms.length;
    const dz = p => gefahr ? Math.hypot(p.x - gefahr.x, p.y - gefahr.y) : Infinity;
    const alle = this.verstecke.map((p, i) => ({ p, i, d: Math.hypot(p.x - cx, p.y - cy), z: dz(p) }))
      .filter(c => c.i !== g.vpIdx && !this.schlecht.has(c.i) && c.d > 100 && c.d < 700 && c.z > 140).sort((a, b) => a.d - b.d);
    const wahl = alle.find(c => !this.belegt.has(c.i)) ?? alle[0];
    g.fluchtZeit = this.takt;
    if (!wahl) { g.flucht = 0; return; }
    this.belegt.delete(g.vpIdx);
    g.vpIdx = wahl.i; g.vp = wahl.p; g.flucht = 1;
    this.belegt.add(wahl.i);
    g.mitglieder.forEach((id, n) => {
      const inf = this.info.get(id), m = s.menschen.get(id);
      if (!inf || !m) return;
      inf.slot = this.slotFuer(g.vp, n); inf.weg = null; inf.sitzt = false; inf.unterwegs = 0; m.versteckt = false;
    });
  }

  // Weg zu einem Punkt (A*, höchstens eine Wegsuche je Takt-Budget); 'keinWeg' wenn es keinen gibt, sonst true bei Bewegung
  gehePfad(welt, m, inf, ziel, v, d) {
    v *= baum(welt, m);
    if (!inf.weg) {
      if (this.suchBudget <= 0) return true;
      this.suchBudget--;
      inf.weg = findeWeg(welt, m.x, m.y, ziel.x, ziel.y, RAD, 30000);
      if (!inf.weg) return 'keinWeg';
    }
    while (inf.weg.length > 1 && Math.hypot(inf.weg[0].x - m.x, inf.weg[0].y - m.y) < 10) inf.weg.shift();
    const wp = inf.weg[0], w = Math.atan2(wp.y - m.y, wp.x - m.x), x0 = m.x, y0 = m.y;
    gehe(welt, m, Math.cos(w) * v, Math.sin(w) * v);
    m.richtung = w;
    inf.steckt = Math.hypot(m.x - x0, m.y - y0) < v * 0.2 ? (inf.steckt ?? 0) + d : 0;
    if (inf.steckt > 2.5) inf.weg = null;
    return true;
  }

  // true = erledigt (sitzt oder läuft zum Platz); false = Zombie direkt dran, normales Weglaufen
  versteckSchritt(id, m, inf, gefahr, gd, d, welt) {
    const g = this.gruppen.get(inf.gruppe);
    if (!g) { inf.gruppe = null; return false; }
    if (gefahr && gd >= 50 && (!g.flucht || (this.takt - g.fluchtZeit > 3 && Math.hypot(gefahr.x - g.vp.x, gefahr.y - g.vp.y) < 70))) this.gruppeFlieht(g, gefahr);
    if (gefahr && gd < 50) { inf.sitzt = false; m.versteckt = false; return false; }
    if (inf.sitzt) { m.versteckt = true; m.flieht = false; return true; }
    m.versteckt = false; m.flieht = !!g.flucht;
    inf.unterwegs = (inf.unterwegs ?? 0) + d;
    const rest = Math.hypot(inf.slot.x - m.x, inf.slot.y - m.y);
    let r = true;
    if (rest >= 12 && inf.unterwegs <= 40) r = this.gehePfad(welt, m, inf, inf.slot, (g.flucht ? FLUCHT : TEMPO) * (TYPEN[m.typ]?.tempo ?? 1) * d, d);
    if (r === 'keinWeg') { this.schlecht.add(g.vpIdx); if (g.flucht) { this.gruppeFlieht(g, gefahr); } else { inf.slot = { x: m.x, y: m.y }; } }
    if (rest < 12 || inf.unterwegs > 40 || r === 'keinWeg' && !g.flucht) {
      inf.sitzt = true; m.versteckt = true; m.flieht = false;
      if (g.mitglieder.every(k => this.info.get(k)?.sitzt !== false)) g.flucht = 0;
    }
    return true;
  }

  // Panik: schreiend ziellos herumrennen, gelegentlich Hilferufe (locken Zombies an)
  panikSchritt(id, m, inf, d, welt, fern) {
    const r = this.raum.rnd;
    m.flieht = true; m.versteckt = false;
    inf.panikT = (inf.panikT ?? 0) - d;
    if (inf.panikT <= 0 || inf.steckt > 0.4) { inf.panikW = r() * Math.PI * 2; inf.panikT = 1.2 + r() * 2; inf.steckt = 0; }
    const v = FLUCHT * 1.1 * (TYPEN[m.typ]?.tempo ?? 1) * d * baum(welt, m), w = inf.panikW, x0 = m.x, y0 = m.y;
    gehe(welt, m, Math.cos(w) * v, Math.sin(w) * v);
    m.richtung = w;
    inf.steckt = Math.hypot(m.x - x0, m.y - y0) < v * 0.3 ? (inf.steckt ?? 0) + d : 0;
    inf.rufT = (inf.rufT ?? 3 + r() * 10) - d;
    if (inf.rufT <= 0) {
      inf.rufT = 9 + r() * 12;
      if (!fern) { this.raum.broadcast('hilferufe', { x: m.x, y: m.y }); this.raum.laerm(m.x, m.y, 320, false, ''); }
    }
  }

  // ---------- Retten ----------

  // nächster ansprechbarer Mensch (gleiche Ebene, höchstens 56 px, nicht gebissen, folgt noch niemandem)
  ansprechbar(p) {
    let best = null, bd = 56 * (this.raum.wv(p.ebene).reich ?? 1);   // drinnen im Feinraster: Reichweite im Maßstab des Raums
    for (const [id, m] of this.raum.state.menschen) {
      const inf = this.info.get(id);
      if (!inf || !m.sichtbar || m.infiziert || inf.folgt || (m.ebene ?? '') !== (p.ebene ?? '')) continue;
      const dd = Math.hypot(m.x - p.x, m.y - p.y);
      if (dd < bd) { bd = dd; best = id; }
    }
    return best;
  }

  // Spieler spricht den Menschen an: er folgt ihm (höchstens 2 Begleiter je Spieler)
  ansprechen(sid, p, mid) {
    const m = this.raum.state.menschen.get(mid), inf = this.info.get(mid);
    const client = this.raum.clients.find(c => c.sessionId === sid);
    if (!m || !inf || m.infiziert || inf.folgt || (m.ebene ?? '') !== (p.ebene ?? '')) return false;
    if ([...this.info.values()].filter(i => i.folgt === sid).length >= 2) { client?.send('meldung', { text: '🙋 Du hast schon zwei Begleiter' }); return false; }
    this.gruppeVerlassen(mid, inf);
    inf.folgt = sid; inf.modus = 'folgt'; inf.weg = null; inf.steckt = 0;
    m.folgt = true; m.versteckt = false; m.flieht = false;
    client?.send('meldung', { text: '🙋 „Bitte bring mich in Sicherheit!“ – Er folgt dir, bring ihn in einen Safe Room.' });
    return true;
  }

  // Begleiter wird frei (Spieler weg/tot oder selbst gebissen) und sucht sich ein Versteck
  freilassen(id, m, inf) {
    inf.folgt = null; m.folgt = false; inf.weg = null;
    if (m.infiziert) { inf.modus = ''; return; }
    if (m.ebene) { m.ebene = ''; const p = this.vorDerTuer(inf.heim); m.x = p.x; m.y = p.y; }
    const g = this.neueGruppe(m, 1);
    if (g) this.gruppeAufnehmen(g, id, inf); else inf.modus = 'panik';
  }

  naehe(p, ebene) {
    const w = this.raum.wv(ebene);
    for (let j = 0; j < 12; j++) {
      const a = j * 0.9 + 1, rr = (26 + j * 3) * (w.reich ?? 1);
      const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
      if (frei(w, x, y, RAD)) return { x, y };
    }
    return { x: p.x, y: p.y };
  }

  folgenSchritt(id, m, inf, d, welt) {
    const s = this.raum.state, p = s.spieler.get(inf.folgt);
    if (!p || p.zombie > 0) return this.freilassen(id, m, inf);
    if ((m.ebene ?? '') !== (p.ebene ?? '') || Math.hypot(p.x - m.x, p.y - m.y) > 700) {   // geht mit durch Türen und Treppen
      const q = this.naehe(p, p.ebene ?? ''); m.x = q.x; m.y = q.y; m.ebene = p.ebene ?? ''; inf.weg = null;
    }
    const dp = Math.hypot(p.x - m.x, p.y - m.y);
    if (p.sicher && dp < 240) return this.retten(id, m, inf, p);
    if (dp <= FOLGE_ABSTAND * (welt.reich ?? 1)) { m.richtung = Math.atan2(p.y - m.y, p.x - m.x); return; }
    const v = (dp > 180 ? W.tempoGehen * 0.95 : W.tempoGehen * 0.62) * (TYPEN[m.typ]?.tempo ?? 1) * d * tempoVon(welt) * baum(welt, m);
    if (sichtfrei(welt, m.x, m.y, p.x, p.y)) {
      const w = Math.atan2(p.y - m.y, p.x - m.x);
      gehe(welt, m, Math.cos(w) * v, Math.sin(w) * v); m.richtung = w; inf.weg = null;
    } else {
      inf.wegT = (inf.wegT ?? 0) - d;
      if (inf.wegT <= 0) { inf.weg = null; inf.wegT = 1; }
      if (this.gehePfad(welt, m, inf, p, v, d) === 'keinWeg') { const q = this.naehe(p, p.ebene ?? ''); m.x = q.x; m.y = q.y; }
    }
  }

  // Im Safe Room angekommen: gerettet. Punkte, Zähler und Belohnung.
  retten(id, m, inf, p) {
    const sid = inf.folgt, s = this.raum.state, client = this.raum.clients.find(c => c.sessionId === sid);
    this.gruppeVerlassen(id, inf);
    s.menschen.delete(id); this.info.delete(id);
    s.gerettet = Math.min(65535, (s.gerettet ?? 0) + 1); this.gerettet++;
    this.raum.xpGeben?.(sid, 'rettung');
    this.raum.broadcast('meldung', { text: `🙋 ${p.name} hat einen Menschen in Sicherheit gebracht!`, lang: true });
    // Belohnung: mit 60 % ein Hinweis auf einen offenen Missionsgegenstand, sonst ein nützlicher Gegenstand
    // (raum.missionHinweis liefert den Gegenstand und verkleinert dessen Suchkreis, oder null)
    const hinweis = this.raum.rnd() < 0.6 ? this.raum.missionHinweis?.('') : null;
    if (hinweis) { client?.send('meldung', { text: `🗺 Der Gerettete verrät dir etwas über ${DINGE[hinweis]?.zeichen ?? ''} ${DINGE[hinweis]?.name ?? hinweis} – der Suchkreis auf der Karte ist kleiner geworden`, lang: true }); return 'hinweis'; }
    const ding = RETTUNG_BELOHNUNG[Math.floor(this.raum.rnd() * RETTUNG_BELOHNUNG.length)];
    const genommen = this.raum.einpacken(p, [ding]);
    if (!genommen.length) { p.munition = Math.min(999, (p.munition ?? 0) + 20); client?.send('meldung', { text: '🎁 Zum Dank: 20 Schuss (Rucksack voll)' }); return 'munition'; }
    client?.send('gefunden', { dinge: genommen, rest: 0 });
    client?.send('meldung', { text: `🎁 Zum Dank: ${DINGE[ding]?.name ?? ding}` });
    return ding;
  }

  // Versteckter Mensch in einem Innenraum (deterministisch aus Seed und Ebene; nur in Wohnhäusern ohne Zombies)
  versteckterImHaus(ebene, w) {
    if (this.hausFertig.has(ebene)) return null;
    this.hausFertig.add(ebene);
    const haus = this.raum.welt.haeuser?.[w.nr];
    if (!haus || haus.safe || ladenArt(haus) || !haus.betretbar) return null;
    for (const z of this.raum.state.zombies.values()) if ((z.ebene ?? '') === ebene) return null;
    let h = 2166136261 ^ (this.raum.state.seed >>> 0);
    for (let i = 0; i < ebene.length; i++) h = Math.imul(h ^ ebene.charCodeAt(i), 16777619) >>> 0;
    const rng = zufall(h ^ 0x3c1d9a);
    if (rng() >= HAUS_VERSTECKT) return null;
    const K = kachelVon(w), nahe = w.kachel ? 6 : 1;   // Feinraster: Abstand zu Türen und Treppen in Zellen (1,5 m)
    const zellen = q => q.zellen ?? [[q.x, q.y]];
    const sperr = [...(w.tueren ?? []), ...(w.treppen ?? []), ...(w.ausgang ? [w.ausgang] : [])].flatMap(zellen).map(([x, y]) => ({ x, y }));
    if (w.start) sperr.push({ x: Math.floor(w.start.x / K), y: Math.floor(w.start.y / K) });
    const platz = [];
    for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++) {
      if (w.hole(x, y) !== T.BODEN) continue;
      if (!w.kachel) { if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => w.hole(x + a, y + c) === T.MOEBEL)) continue; }   // hinter Schrank/Möbel
      else {   // Feinraster: die Figur (Radius 3 px) steht nie unmittelbar am Möbel; „dahinter“ = ein Möbelstück höchstens 3 Zellen (0,75 m) entfernt
        let nah = false;
        for (let dy = -3; dy <= 3 && !nah; dy++) for (let dx = -3; dx <= 3; dx++) if (w.hole(x + dx, y + dy) === T.MOEBEL) { nah = true; break; }
        if (!nah) continue;
      }
      if (sperr.some(q => Math.abs(q.x - x) <= nahe && Math.abs(q.y - y) <= nahe) || !frei(w, (x + 0.5) * K, (y + 0.5) * K, 12)) continue;
      platz.push({ x: (x + 0.5) * K, y: (y + 0.5) * K });
    }
    if (!platz.length) return null;
    const ort = platz[Math.floor(rng() * platz.length)];
    const m = new Mensch();
    m.x = ort.x; m.y = ort.y; m.richtung = rng() * Math.PI * 2; m.infiziert = false; m.flieht = false; m.sichtbar = true; m.versteckt = true; m.ebene = ebene;
    m.aussehen = `${rng() < 0.5 ? 'm' : 'w'},${Math.floor(rng() * 6)},${Math.floor(rng() * 8)}`;
    const id = 'm' + this.naechsteId++;
    m.typ = typFuerId(id);
    this.raum.state.menschen.set(id, m);
    this.info.set(id, { heim: haus, ziel: null, weg: null, warte: 0, inf: 0, steckt: 0, modus: 'innen' });
    return id;
  }

  // leises Wimmern, wenn ein Spieler im selben Innenraum in der Nähe ist
  wimmern() {
    for (const [id, inf] of this.info) {
      if (inf.modus !== 'innen') continue;
      const m = this.raum.state.menschen.get(id);
      if (!m) continue;
      for (const c of this.raum.clients) {
        const p = this.raum.state.spieler.get(c.sessionId);
        if (!p || (p.ebene ?? '') !== m.ebene || Math.hypot(p.x - m.x, p.y - m.y) > 260) continue;
        if (this.takt < (inf['w' + c.sessionId] ?? 0)) continue;
        inf['w' + c.sessionId] = this.takt + 6 + this.raum.rnd() * 4;
        c.send('wimmern', { x: m.x, y: m.y, ebene: m.ebene });
      }
    }
  }

  vorDerTuer(h) { return { x: (h.tuer.x + 0.5 + h.raus.dx) * KACHEL, y: (h.tuer.y + 0.5 + h.raus.dy) * KACHEL }; }

  // zu Spielbeginn: Menschen an ihren Haustüren, ein Bus, ein paar erste Zombies weit weg vom Start
  start(anzahl, ersteZombies = 3) {
    const r = this.raum.rnd;
    let gruppe = null;   // laufende Gruppe, die noch Mitglieder aufnimmt
    for (let i = 0; i < anzahl && this.wohnungen.length; i++) {
      const heim = this.wohnungen[Math.floor(r() * this.wohnungen.length)];
      const p = this.vorDerTuer(heim);
      const m = new Mensch();
      m.x = p.x; m.y = p.y; m.richtung = 0; m.infiziert = false; m.flieht = false;
      // ein Teil ist noch zu Hause und kommt später heraus
      m.sichtbar = r() < 0.6;
      // ca. 6 % Polizisten (Kennung 'p', der Client zeichnet sie mit dem Polizistenbild)
      m.aussehen = `${r() < POLIZIST_ANTEIL ? 'p' : r() < 0.5 ? 'm' : 'w'},${Math.floor(r() * 6)},${Math.floor(r() * 8)}`;
      const id = 'm' + this.naechsteId++;
      m.typ = m.aussehen.startsWith('p') ? '' : typFuerId(id);
      this.raum.state.menschen.set(id, m);
      const inf = { heim, ziel: null, weg: null, warte: m.sichtbar ? 0 : 10 + r() * 120, inf: 0, steckt: 0, modus: '' };
      this.info.set(id, inf);
      // ca. 12 % laufen in Panik herum, die übrigen ducken sich in kleinen Gruppen (2–4) an Verstecken
      if (r() < PANIK_ANTEIL || !this.verstecke.length) { inf.modus = 'panik'; m.sichtbar = true; inf.warte = 0; continue; }
      if (!gruppe || gruppe.mitglieder.length >= gruppe.soll) gruppe = this.neueGruppe(p);
      if (!gruppe) { inf.modus = 'panik'; m.sichtbar = true; inf.warte = 0; continue; }
      this.gruppeAufnehmen(gruppe, id, inf);
      const slot = inf.slot;
      m.x = slot.x; m.y = slot.y; m.sichtbar = true; m.versteckt = true; inf.sitzt = true; inf.warte = 0; m.richtung = r() * Math.PI * 2;
    }
    this.anfangs = anzahl;
    if (anzahl > 0) {
      const start = this.raum.welt.start;
      for (let n = 0, v = 0; n < ersteZombies && v < 400; v++) {
        const x = (2 + r() * (BREITE - 4)) * KACHEL, y = (2 + r() * (HOEHE - 4)) * KACHEL;
        if (Math.hypot(x - start.x, y - start.y) < 900 || this.raum.welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL)) !== T.WIESE) continue;
        const zid = this.raum.setzeZombie(x, y, ''); this.raum.zombieInfo.get(zid).bleibt = true; n++;
      }
    }
  }

  lebende() { return this.raum.state.menschen.size; }

  // Anteil der noch gesunden Menschen (für den Zombie-Nachschub aus dem Umland)
  ruheAnteil() { return this.anfangs ? [...this.raum.state.menschen.values()].filter(m => !m.infiziert).length / this.anfangs : 0; }

  neuesZiel(id, m, inf) {
    const r = this.raum.rnd, wahl = r();
    // eines der nächstgelegenen Ziele (kurze Wege: glaubwürdiger und spart Rechenzeit auf dem Pi)
    const nahe = (liste, n, pos) => {
      const sortiert = liste.map(e => { const p = pos(e); return { e, d: Math.hypot(p.x - m.x, p.y - m.y) }; }).sort((a, b) => a.d - b.d);
      return sortiert[Math.floor(r() * Math.min(n, sortiert.length))].e;
    };
    let ziel;
    if (wahl < 0.35 && this.laeden.length) { const h = nahe(this.laeden, 5, h => this.vorDerTuer(h)); ziel = { ...this.vorDerTuer(h), art: 'haus' }; }
    else if (wahl < 0.6 && this.haltestellen.length) { const hs = nahe(this.haltestellen, 3, hs => hs); ziel = { x: hs.x, y: hs.y, art: 'haltestelle', hs }; }
    else if (wahl < 0.75 && this.plaetze.length) { const p = this.plaetze[0]; ziel = { x: p.x + (r() - 0.5) * 120, y: p.y + (r() - 0.5) * 120, art: 'platz' }; }
    else ziel = { ...this.vorDerTuer(inf.heim), art: 'haus' };
    inf.ziel = ziel; inf.weg = null; inf.steckt = 0;
  }

  schritt(dt) {
    const s = this.raum.state, welt0 = this.raum.welt;
    const zr = this.raum.zeitraffer?.() ?? 1;
    this.takt += dt;
    const zombies = [...s.zombies.entries()].filter(([, z]) => !z.ebene);
    const fern = m => this.raum.istFern ? this.raum.istFern(m.x, m.y, '') : true;   // weit von allen Spielern (auch Haustüren, Stützpunkt)
    const tick = Math.round(this.takt * 20);
    let suchen = 1;
    this.suchBudget = 2;
    for (const [id, m] of s.menschen) {
      const inf = this.info.get(id);
      if (!inf || inf.modus === 'innen') continue;   // versteckte Menschen in Häusern bleiben, wo sie sind
      // Ansteckung läuft auch im Haus und im Bus
      if (m.infiziert) {
        inf.inf -= dt * zr;
        if (inf.inf <= 0) { this.verwandeln(id, m, inf); continue; }
      }
      // weit weg: nur jedes vierte Mal, dafür mit gesammeltem Schritt
      let d = dt;
      if (fern(m)) { inf.stau = (inf.stau ?? 0) + dt; if ((tick + inf.heim.nr) % 4) continue; d = inf.stau; inf.stau = 0; } else inf.stau = 0;
      if (!m.sichtbar) {
        if (inf.imBus) continue;
        inf.warte -= d;
        if (inf.warte <= 0) { const p = this.vorDerTuer(inf.heim.nr === inf.drinIn?.nr ? inf.heim : (inf.drinIn ?? inf.heim)); m.x = p.x; m.y = p.y; m.sichtbar = true; this.neuesZiel(id, m, inf); }
        continue;
      }
      // Zombie oder Feuer in der Nähe? Weglaufen (gebissene laufen auch, aber langsamer); Versteckte reagieren erst, wenn er ganz nah kommt
      const welt = m.ebene ? this.raum.wv(m.ebene) : welt0;
      if (inf.folgt) { const pp = s.spieler.get(inf.folgt); if (!pp || (pp.ebene ?? '') !== (m.ebene ?? '') || pp.sicher) { this.folgenSchritt(id, m, inf, d, welt); continue; } }
      let gefahr = null, gd = inf.gruppe && inf.sitzt ? ALARM : inf.folgt ? 130 : 170;
      for (const z of this.raum.zRaster ? this.raum.zombiesNahe(m.x, m.y, m.ebene ?? '', 2) : m.ebene ? [] : zombies.map(e => e[1])) {
        const dd = Math.hypot(z.x - m.x, z.y - m.y);
        if (dd < gd && sichtfrei(welt, m.x, m.y, z.x, z.y)) { gd = dd; gefahr = z; }
      }
      if (!m.ebene) for (const f of s.feuer?.values() ?? []) { const dd = Math.hypot(f.x - m.x, f.y - m.y) - f.r; if (dd < Math.min(gd, 90)) { gd = dd; gefahr = f; } }
      if (inf.gruppe && this.versteckSchritt(id, m, inf, gefahr, gd, d, welt)) continue;
      if (gefahr || inf.fluchtZeit > 0) {
        m.flieht = true; m.versteckt = false; inf.sitzt = false;
        inf.fluchtZeit = gefahr ? 0.8 : inf.fluchtZeit - d;
        // Richtung nur alle 0,4 s neu wählen (sonst zittert die Figur an Hindernissen): von 12 Richtungen die freie, die am weitesten weg führt
        inf.fluchtWahl = (inf.fluchtWahl ?? 0) - d;
        if (gefahr && (inf.fluchtWahl <= 0 || inf.fluchtW === undefined)) {
          inf.fluchtWahl = 0.4;
          const weg = Math.atan2(m.y - gefahr.y, m.x - gefahr.x);
          let best = weg, bw = -Infinity;
          for (let k = 0; k < 12; k++) {
            const w = weg + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
            const tx = m.x + Math.cos(w) * 40, ty = m.y + Math.sin(w) * 40;
            if (!frei(welt, tx, ty, RAD)) continue;
            const alt = inf.fluchtW ?? w;
            const wert = Math.hypot(tx - gefahr.x, ty - gefahr.y) - Math.abs(Math.atan2(Math.sin(w - alt), Math.cos(w - alt))) * 6;
            if (wert > bw) { bw = wert; best = w; }
          }
          inf.fluchtW = best;
        }
        const v = (m.infiziert ? TEMPO : FLUCHT) * (TYPEN[m.typ]?.tempo ?? 1) * d * baum(welt, m), w = inf.fluchtW ?? 0;
        bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
        m.richtung = w;
        inf.weg = null;
        continue;
      }
      inf.fluchtW = undefined;
      m.flieht = false;
      if (inf.folgt) { this.folgenSchritt(id, m, inf, d, welt); continue; }
      if (inf.modus === 'panik') { this.panikSchritt(id, m, inf, d, welt, fern(m)); continue; }
      if (inf.modus === 'versteck' && !inf.gruppe) { const g = this.neueGruppe(m, 1); if (g) { this.gruppeAufnehmen(g, id, inf); continue; } inf.modus = 'panik'; continue; }
      if (!inf.ziel) this.neuesZiel(id, m, inf);
      const z = inf.ziel;
      // an der Haltestelle warten, bis der Bus kommt – oder irgendwann weitergehen
      if (inf.wartet) { inf.wartet -= d; if (inf.wartet <= 0) { inf.wartet = 0; this.neuesZiel(id, m, inf); } continue; }
      const dz = Math.hypot(z.x - m.x, z.y - m.y);
      if (dz < 18) { this.angekommen(id, m, inf); continue; }
      if (!inf.weg) {
        if (suchen <= 0) continue;   // höchstens eine Wegsuche je Takt, die anderen warten einen Augenblick
        suchen--;
        inf.weg = findeWeg(welt, m.x, m.y, z.x, z.y, RAD, 30000);
        if (!inf.weg) { this.neuesZiel(id, m, inf); continue; }
      }
      while (inf.weg.length > 1 && Math.hypot(inf.weg[0].x - m.x, inf.weg[0].y - m.y) < 10) inf.weg.shift();
      const wp = inf.weg[0];
      const w = Math.atan2(wp.y - m.y, wp.x - m.x), v = TEMPO * (TYPEN[m.typ]?.tempo ?? 1) * d * baum(welt, m);
      const x0 = m.x, y0 = m.y;
      bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
      m.richtung = w;
      // nicht ineinanderlaufen: von zu nahen Nachbarn wegschieben
      for (const [oid, o] of s.menschen) {
        if (oid === id || !o.sichtbar) continue;
        const dd = Math.hypot(o.x - m.x, o.y - m.y);
        if (dd > 0.01 && dd < 20) bewege(welt, m, (m.x - o.x) / dd * (20 - dd) * 0.3, (m.y - o.y) / dd * (20 - dd) * 0.3, RAD);
      }
      inf.steckt = Math.hypot(m.x - x0, m.y - y0) < v * 0.2 ? inf.steckt + d : 0;
      if (inf.steckt > 2.5) { inf.weg = null; if (inf.steckt > 6) this.neuesZiel(id, m, inf); }
    }
    this.zombiesWittern(zombies);
    if (tick % 10 === 0) this.wimmern();
  }

  angekommen(id, m, inf) {
    const z = inf.ziel, r = this.raum.rnd;
    if (z.art === 'haus') {
      m.sichtbar = false; inf.warte = 25 + r() * 90; inf.ziel = null;
      inf.drinIn = this.raum.welt.haeuser.find(h => Math.hypot(this.vorDerTuer(h).x - z.x, this.vorDerTuer(h).y - z.y) < 4) ?? inf.heim;
    } else if (z.art === 'haltestelle') {
      if (!inf.wartet) inf.wartet = 40 + r() * 40;   // auf den Bus warten, sonst weitergehen
    } else this.neuesZiel(id, m, inf);
  }

  // gebissen → nach der Ansteckungszeit ein Zombie an derselben Stelle
  verwandeln(id, m, inf) {
    const s = this.raum.state;
    if (!m.sichtbar) { const p = this.vorDerTuer(inf.drinIn ?? inf.heim); m.x = p.x; m.y = p.y; }
    this.gruppeVerlassen(id, inf);
    s.menschen.delete(id); this.info.delete(id);
    const zid = this.raum.setzeZombie(m.x, m.y, '');
    if (String(m.aussehen ?? '').startsWith('p')) this.raum.state.zombies.get(zid).variante = 20;   // verwandelter Polizist: Streife (Figur copzombie)
    this.raum.zombieInfo.get(zid).bleibt = true;
    this.zuletztVerwandelt = zid;
    s.verwandelt = Math.min(65535, (s.verwandelt ?? 0) + 1);
    this.raum.broadcast('meldung', { text: '🧟 Ein gebissener Mensch hat sich verwandelt' });
  }

  // Zombies ohne Ziel gehen auf sichtbare Menschen los und beißen bei Berührung
  zombiesWittern(zombies) {
    const s = this.raum.state, welt = this.raum.welt;
    const menschen = [...s.menschen.entries()].filter(([, m]) => m.sichtbar && !m.ebene);
    if (!menschen.length) return;
    // Verwandlungszeit in Spielminuten → Sekunden der Spieluhr (ein Spieltag = tagMinuten echte Minuten = 1440 Spielminuten)
    const spielMin = this.raum.einstellungen?.()?.verwandlungMin ?? 30;
    const sekunden = spielMin * ((this.raum.einstellungen?.()?.tagMinuten || 48) * 60 / 1440);
    const chance = this.raum.einstellungen?.()?.bissChance ?? 1;
    // Raster der sichtbaren Menschen (Zelle 96 px): jeder Zombie prüft nur die Nachbarzellen (Sichtweite 170 < 2 Zellen)
    const Z = 96, raster = new Map();
    for (const e of menschen) {
      const k = Math.floor(e[1].y / Z) * 4096 + Math.floor(e[1].x / Z);
      const l = raster.get(k); if (l) l.push(e); else raster.set(k, [e]);
    }
    const SW = this.raum.zombieSicht();
    for (const [zid, z] of zombies) {
      const info = this.raum.zombieInfo.get(zid);
      if (!info || info.ziel || info.schlaeft || info.dran === false) continue;   // ferne Zombies nur in „ihrem“ Takt
      let best = null, bd = SW.gehen;
      const cx = Math.floor(z.x / Z), cy = Math.floor(z.y / Z);
      const kandidaten = [];
      for (let j = cy - 2; j <= cy + 2; j++) for (let i = cx - 2; i <= cx + 2; i++) { const l = raster.get(j * 4096 + i); if (l) for (const e of l) kandidaten.push(e); }
      for (const [mid, m] of kandidaten) {
        if (m.infiziert) continue;   // schon gebissen: nicht noch einmal jagen
        const d = Math.hypot(m.x - z.x, m.y - z.y);
        if (d > (m.versteckt ? Math.min(bd, VERSTECK_WEITE) : bd)) continue;   // Versteckte bemerkt man erst fast beim Draufstehen
        const imKegel = winkelDiff(Math.atan2(m.y - z.y, m.x - z.x), z.richtung) < SW.winkel / 2;
        if ((imKegel || d < 60) && sichtfrei(welt, z.x, z.y, m.x, m.y)) { bd = d; best = [mid, m]; }
      }
      if (!best) continue;
      const [mid, m] = best;
      info.punkt = { x: m.x, y: m.y }; info.mensch = mid;   // aktiv verfolgen (raum.mjs, zombieSchritt)
      // Hilferuf, wenn der Angreifer nah ist (je Mensch höchstens alle 6–12,5 s)
      const mi = this.info.get(mid);
      if (mi && bd < 90 && !m.infiziert && !m.versteckt && (mi.hilfeBis ?? 0) < Date.now()) {
        mi.hilfeBis = Date.now() + 6000 + this.raum.rnd() * 6500;
        this.raum.broadcast('hilferufe', { x: m.x, y: m.y });
      }
      if (bd < BISS_ABSTAND && !m.infiziert) {
        // einmal pro Sekunde ein Bissversuch; die Einstellung „Biss-Chance“ entscheidet, ob er trifft
        if ((info.bissVersuch ?? -1) > this.takt) continue;
        info.bissVersuch = this.takt + 1;
        if (this.raum.rnd() >= chance) continue;
        m.infiziert = true; m.versteckt = false;
        this.info.get(mid).inf = sekunden;
        if (this.info.get(mid).gruppe) { this.gruppeVerlassen(mid, this.info.get(mid)); this.info.get(mid).modus = ''; }
        if (this.info.get(mid).folgt) this.freilassen(mid, m, this.info.get(mid));   // Gebissene lassen sich nicht mehr retten
        this.raum.broadcast('menschGebissen', { x: m.x, y: m.y, ebene: m.ebene ?? '' });
      }
    }
  }

  // Bus (verkehr.mjs) hält an einer Haltestelle: Mitfahrer mit diesem Ziel steigen aus, Wartende steigen ein
  busHalt(businfo, stopp) {
    const s = this.raum.state, r = this.raum.rnd;
    const gleich = (a, b) => a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    businfo.mitfahrer ??= new Map();
    for (const [id, zielHs] of businfo.mitfahrer) {
      if (!gleich(zielHs, stopp)) continue;
      businfo.mitfahrer.delete(id);
      const m = s.menschen.get(id), inf = this.info.get(id);
      if (!m || !inf) continue;
      m.x = stopp.x + (r() - 0.5) * 30; m.y = stopp.y + (r() - 0.5) * 30; m.sichtbar = true; inf.imBus = false; this.neuesZiel(id, m, inf);
    }
    for (const [id, m] of s.menschen) {
      const inf = this.info.get(id);
      if (!m.sichtbar || !inf?.wartet || !gleich(inf.ziel?.hs, stopp)) continue;
      const andere = this.haltestellen.filter(h => !gleich(h, stopp));
      if (!andere.length) continue;
      m.sichtbar = false; inf.imBus = true; inf.wartet = 0; inf.ziel = null;
      businfo.mitfahrer.set(id, andere[Math.floor(r() * andere.length)]);
    }
  }
}
