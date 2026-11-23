// Querfeldein-Wegsuche für den Evakuierungspanzer (Leopard): befahrbar ist alles, was frei() für die Breite der Wanne meldet – Straße, Wiese,
// Feld, Schotter; nicht durch Häuser, Wasser, Bäume (dichter Wald), Zäune und Hecken (er fährt drumherum). Rein serverseitig, ändert
// nichts am Weltaufbau. Ergebnis hängt am Welt-Objekt (`welt._querfeld`): { ziel, start, weg, rueck, verschoben }.
import { BREITE, HOEHE, KACHEL, frei } from '../client/welt.mjs';

const ZELLE = 24;                  // Rasterweite der Suche (Pixel)
const RADIEN = [28, 20, 14];       // Platzbedarf der Wanne (Halbbreite 28): erst großzügig, dann enger
const MAX_KOSTEN = 2600;           // so weit (Weglänge in Pixeln) wird vom Ziel aus gesucht
const WUNSCH = [700, 1800];        // gewünschte Weglänge zwischen Einfahrtspunkt und Ziel

class Haufen {                     // einfacher Min-Heap nach Kosten
  constructor() { this.a = []; }
  get n() { return this.a.length; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let m = i; const x = 2 * i + 1, y = x + 1; if (x < a.length && a[x][0] < a[m][0]) m = x; if (y < a.length && a[y][0] < a[m][0]) m = y; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; }
}

// nächster befahrbarer Punkt um (x, y) (Spirale bis 900 px), null wenn keiner
export function befahrbarNahe(welt, x, y, rad = RADIEN[0]) {
  if (frei(welt, x, y, rad)) return { x, y };
  for (let r = 16; r <= 900; r += 16) {
    const n = Math.max(8, Math.round(r / 10));
    for (let k = 0; k < n; k++) {
      const a = k * Math.PI * 2 / n, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (frei(welt, px, py, rad)) return { x: px, y: py };
    }
  }
  return null;
}

// Sichtlinie für die Wanne: alle 12 px frei?
const gerade = (welt, a, b, rad) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 12);
  for (let i = 1; i < n; i++) if (!frei(welt, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, rad)) return false;
  return true;
};

function suche(welt, ziel, rad, maxKosten = MAX_KOSTEN) {
  const W = Math.ceil(BREITE * KACHEL / ZELLE), H = Math.ceil(HOEHE * KACHEL / ZELLE);
  const zx = Math.min(W - 1, Math.max(0, Math.round(ziel.x / ZELLE))), zy = Math.min(H - 1, Math.max(0, Math.round(ziel.y / ZELLE)));
  const kosten = new Float64Array(W * H).fill(Infinity), eltern = new Int32Array(W * H).fill(-1), erlaubt = new Int8Array(W * H);   // 0 unbekannt, 1 frei, 2 gesperrt
  const ok = (cx, cy) => { const i = cy * W + cx; if (!erlaubt[i]) erlaubt[i] = frei(welt, cx * ZELLE, cy * ZELLE, rad) ? 1 : 2; return erlaubt[i] === 1; };
  const h = new Haufen(), start = zy * W + zx;
  kosten[start] = 0; h.push(0, start);
  const gesehen = [];
  while (h.n) {
    const [k, i] = h.pop();
    if (k > kosten[i]) continue;
    gesehen.push(i);
    const cx = i % W, cy = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !ok(nx, ny)) continue;
      if (dx && dy && !(ok(cx + dx, cy) && ok(cx, cy + dy))) continue;   // nicht diagonal durch Ecken
      const nk = k + (dx && dy ? 1.414 : 1) * ZELLE;
      if (nk > maxKosten) continue;
      const j = ny * W + nx;
      if (nk < kosten[j]) { kosten[j] = nk; eltern[j] = i; h.push(nk, j); }
    }
  }
  return { W, H, kosten, eltern, gesehen };
}


// Weg von Zelle i zum Ziel (die Eltern zeigen zum Ziel), dann Sichtlinien-Glättung
function wegAus(welt, eltern, W, i0, ziel, rad, vorn = null) {
  const roh = vorn ? [vorn] : [];
  for (let i = i0; i >= 0; i = eltern[i]) roh.push({ x: (i % W) * ZELLE, y: ((i / W) | 0) * ZELLE });
  roh[roh.length - 1] = { x: ziel.x, y: ziel.y };
  const weg = [roh[0]];
  for (let a = 0; a < roh.length - 1;) {
    let b = roh.length - 1;
    while (b > a + 1 && !gerade(welt, roh[a], roh[b], rad)) b--;
    weg.push(roh[b]); a = b;
  }
  return weg;
}

// Erweiterte Suche (bis ANFAHRT_KOSTEN) für die gemischte Anfahrt Straße → Feld, einmal je Plan
const ANFAHRT_KOSTEN = 20000;
function weite(welt, plan) {
  if (!plan) return null;
  if (plan._weite === undefined) Object.defineProperty(plan, '_weite', { value: suche(welt, plan.ziel, plan.rad, ANFAHRT_KOSTEN), enumerable: false, writable: true });
  return plan._weite;
}

// Letztes Stück querfeldein von einem Punkt (z. B. Straßenknoten) zum Ziel des Plans; null, wenn dort kein Feldweg für die Wanne hinführt.
// Verwendet die Suche des Plans (Kostenfeld vom Ziel aus).
export function querfeldVon(welt, plan, punkt) {
  const s = weite(welt, plan);
  if (!s || !frei(welt, punkt.x, punkt.y, plan.rad)) return null;
  const { W, H, kosten, eltern } = s;
  const cx = Math.round(punkt.x / ZELLE), cy = Math.round(punkt.y / ZELLE);
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
  const i = cy * W + cx;
  if (!Number.isFinite(kosten[i])) return null;
  const c0 = { x: cx * ZELLE, y: cy * ZELLE };
  if (!gerade(welt, punkt, c0, plan.rad)) return null;
  return wegAus(welt, eltern, W, i, plan.ziel, plan.rad, { x: punkt.x, y: punkt.y });
}

// Kostenwert (Weglänge vom Ziel, Pixel) an einem Punkt, Infinity außerhalb der Suche
export function querfeldKosten(plan, punkt, welt) {
  const s = weite(welt, plan);
  if (!s) return Infinity;
  const cx = Math.round(punkt.x / ZELLE), cy = Math.round(punkt.y / ZELLE);
  if (cx < 0 || cy < 0 || cx >= s.W || cy >= s.H) return Infinity;
  return s.kosten[cy * s.W + cx];
}

// Plan für ein Ziel (Pixel). ziel wird bei Bedarf auf die nächste befahrbare Stelle verschoben. null, wenn keine Fläche gefunden wird.
export function querfeldPlan(welt, wunsch) {
  if (welt._querfeld !== undefined && welt._querfeldWunsch?.x === wunsch.x && welt._querfeldWunsch?.y === wunsch.y) return welt._querfeld;
  welt._querfeldWunsch = { x: wunsch.x, y: wunsch.y };
  for (const rad of RADIEN) {
    const ziel = befahrbarNahe(welt, wunsch.x, wunsch.y, rad);
    if (!ziel) continue;
    const s = suche(welt, ziel, rad), { W, H, kosten, eltern, gesehen } = s;
    // Einfahrtspunkt: erreichbar, Weglänge im Wunschbereich, möglichst nah am Kartenrand
    let best = -1, bestWert = Infinity;
    for (const i of gesehen) {
      const k = kosten[i];
      if (k < WUNSCH[0] || k > WUNSCH[1]) continue;
      const cx = i % W, cy = (i / W) | 0, rand = Math.min(cx, cy, W - 1 - cx, H - 1 - cy) * ZELLE;
      const wert = rand - k * 0.05;
      if (wert < bestWert) { bestWert = wert; best = i; }
    }
    if (best < 0) for (const i of gesehen) if (best < 0 || kosten[i] > kosten[best]) best = i;   // kleine Fläche: der weiteste Punkt
    if (best < 0 || kosten[best] < 150) continue;
    const weg = wegAus(welt, eltern, W, best, ziel, rad);
    const verschoben = Math.hypot(ziel.x - wunsch.x, ziel.y - wunsch.y) > 24;
    const plan = { ziel, start: weg[0], weg, rueck: [...weg].reverse(), verschoben, rad };
    Object.defineProperty(plan, '_suche', { value: s, enumerable: false });   // für querfeldVon (Straße → Feld)
    return welt._querfeld = plan;
  }
  return welt._querfeld = null;
}
