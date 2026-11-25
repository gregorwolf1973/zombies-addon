// Boxer, Puma, Leopard und gefahrene Autos walzen Hindernisse (Regeln: client/walze.mjs): Zäune und Hecken unter der Wanne werden dauerhaft platt (Lücke offen
// für alle, auch Zombies), Leopard und Puma drücken geparkte Autos platt (state.platt wie in der B11-Szene, Kofferraum leer) und walzt kleine Bäume
// um; Boxer fährt langsamer über geparkte Autos (30 %). Der Server entscheidet, schickt die Änderungen als Nachricht
// 'walze' { seed, zaun, baum } an alle (beim Beitritt die ganze Liste) und hält das Wegefeld der Zombies aktuell (wegfeld.mjs).
import { BREITE, zaunIndex } from '../client/welt.mjs';
import { aufParkAuto } from '../client/fzkollision.mjs';
import { imFussabdruck } from '../client/evak.mjs';
import { plattKodieren, PLATT_MAX } from '../client/b11_platt.mjs';
import { WALZE, zaunZellen, stammBei, walzeAnwenden } from '../client/walze.mjs';
import { FAHRBAR } from '../client/fahrbar.mjs';
import { feinZielVergessen } from './wegfeld.mjs';

const KOLL_R = 5;          // wie server/fahrbar.mjs: Spielraum der Wannenpunkte
const LAERM_PAUSE = 0.4;   // s zwischen zwei Geräuschen (Holz/Blech); Uhr = state.takt (ms)

// Wannenpunkte (5 × 3) eines Fahrzeugs an Pose (x, y, w); Maße aus fz.m (Panzer: FAHRBAR, Auto: client/pkw.mjs PKW)
function punkte(fz, x, y, w) {
  const m = fz.m ?? FAHRBAR[fz.art], c = Math.cos(w), s = Math.sin(w), l = [];
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) { const a = u * m.laenge / 2, b = v * m.breite / 2; l.push([x + c * a - s * b, y + s * a + c * b]); }
  return l;
}

export class Walze {
  constructor(raum) {
    this.raum = raum;
    this.zaun = new Set();     // plattgewalzte Feinfelder
    this.baum = new Map();     // umgewalzte Bäume k → { k, x, y, w, gr }
    this.uhr = 0; this.laermBis = 0;
    this.autos = (raum.welt?.behaelter ?? []).filter(b => b.art === 'auto');
  }

  // Tempofaktor über geparkten Autos (Boxer 0,3; Leopard und Puma walzt sie platt, Autos fahren nicht darüber)
  autoFaktor(fz) {
    const regel = WALZE[fz.art];
    if (!regel || typeof regel.auto !== 'number' || !fz.f) return 1;
    for (const [px, py] of punkte(fz, fz.f.x, fz.f.y, fz.f.richtung)) if (aufParkAuto(this.raum.welt, px, py, 1)) return regel.auto;
    return 1;
  }

  // vor jedem Teilschritt/Drehen: was unter der Wanne an Pose (x, y, w) liegt, wird gewalzt
  walzen(fz, x, y, w) {
    const regel = WALZE[fz.art];
    if (!regel || !fz.f) return;
    const r = this.raum, welt = r.welt, zellen = new Set(), baum = [], vorn = new Set();
    const pk = punkte(fz, x, y, w), kopf = (fz.v ?? 0) < 0 ? [0, 1, 2] : [12, 13, 14];   // Punkte an der Front in Fahrtrichtung (rückwärts: Heck)
    for (let k = 0; k < pk.length; k++) {
      const [px, py] = pk[k];
      if (regel.zaun) zaunZellen(welt, px, py, fz.walzR ?? KOLL_R + 1, kopf.includes(k) ? vorn : zellen);   // Auto: knapp mehr als sein Kollisionsabstand (server/pkw.mjs)
      if (regel.baumMax) {
        const b = stammBei(welt, px, py, 1);
        if (b && b.gr <= regel.baumMax && !baum.some(q => q.k === b.k)) baum.push({ k: b.k, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(w * 100) / 100, gr: Math.round(b.gr) });
      }
    }
    if (regel.auto === 'platt') this.autosPlatt(fz, x, y, w);
    // Durchbruch = Linie quer zur Fahrtrichtung vor der Front; längs laufende Zäune (Ausparken, an der Hecke entlang) zählen nicht
    const zi = welt.details?.zaeune ? zaunIndex(welt) : null, hx = Math.cos(w), hy = Math.sin(w);
    const quer = i => { const l = zi?.map.get(i); if (!l) return true; const o = l[0] * 5, dx = zi.seg[o + 2] - zi.seg[o], dy = zi.seg[o + 3] - zi.seg[o + 1], d = dx * hx + dy * hy; return d * d < 0.64 * (dx * dx + dy * dy); };
    const vornNeu = [...vorn].filter(i => !this.zaun.has(i) && !zellen.has(i) && quer(i));
    for (const i of vorn) zellen.add(i);
    const zaun = [...zellen].filter(i => !this.zaun.has(i));
    if (!zaun.length && !baum.length) return;
    this.anwenden({ zaun, baum });
    if (vornNeu.length) fz.gewalzt?.(vornNeu.length);   // Auto: bremst und verliert Lebenspunkte, wenn es mit der Front durchbricht (seitliches Schrammen beim Ausparken kostet nichts, server/pkw.mjs)
    if ((r.state.takt ?? 0) >= this.laermBis || !r.state.takt) {
      this.laermBis = (r.state.takt ?? 0) + LAERM_PAUSE * 1000;
      r.broadcast('blech', { x, y });   // Holz/Blech knirscht (Ereignis „Blech schabt“)
      r.laerm?.(x, y, 300, true, '');
    }
  }

  // Änderung übernehmen, an alle senden, Wegefeld-Zwischenspeicher der Kacheln verwerfen
  anwenden(delta) {
    const r = this.raum;
    for (const i of delta.zaun ?? []) this.zaun.add(i);
    for (const b of delta.baum ?? []) this.baum.set(b.k, b);
    const kacheln = walzeAnwenden(r.welt, delta);
    for (const t of kacheln) feinZielVergessen(r.welt, t % BREITE, Math.floor(t / BREITE));
    r.broadcast('walze', { seed: r.state.seed, zaun: delta.zaun ?? [], baum: delta.baum ?? [] });
  }

  // Leopard: geparkte Autos unter der Wanne platt drücken (wie die Panzer der B11-Szene), etwas in Fahrtrichtung schieben
  autosPlatt(fz, x, y, w) {
    const r = this.raum, s = r.state, m = FAHRBAR[fz.art], k = { x, y, richtung: w };
    for (const b of this.autos) {
      if (Math.abs(b.x - x) > m.laenge || Math.abs(b.y - y) > m.laenge) continue;
      if (s.platt.has(b.id) || s.verbrannt.has('auto:' + b.id) || r.welt.autosWeg?.has(b.id)) continue;
      if (!imFussabdruck(k, b.x, b.y, m.laenge / 2, m.breite / 2, 4)) continue;
      const dx = Math.max(-PLATT_MAX, Math.min(PLATT_MAX, Math.cos(w) * 6)), dy = Math.max(-PLATT_MAX, Math.min(PLATT_MAX, Math.sin(w) * 6));   // ein Stück in Fahrtrichtung geschoben
      s.platt.set(b.id, plattKodieren(dx, dy));
      r.setzeInhalt?.(b.id, []);   // Kofferraum zerquetscht
      r.broadcast('b11platt', { x: b.x + dx, y: b.y + dy, w });
      r.laerm?.(b.x, b.y, 400, true, '');
    }
  }

  liste() { return { seed: this.raum.state.seed, zaun: [...this.zaun], baum: [...this.baum.values()], voll: true }; }
  beitritt(client) { if (!this.zaun.size && !this.baum.size) return; try { client.send('walze', this.liste()); } catch { /* weg */ } }
}
