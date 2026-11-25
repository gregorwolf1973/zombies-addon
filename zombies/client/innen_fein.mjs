// Maßstäbliche Innenräume im Feinraster (Schalter INNEN_FEIN in welt.mjs, Standard aus).
// Eine Zelle = INNEN_Z px = 0,25 m (8 px = 1 m). Der Grundriss ist der echte OSM-Umriss des Hauses (an der längsten Kante
// ausgerichtet, damit das Raster achsparallel bleibt), Wände sind eine Zelle dick (innen 0,25 m, außen 2 Zellen = 0,5 m),
// Türen 5 Zellen (1,25 m), Möbel in Zellen nach echten Maßen. Die Ergebnisstruktur entspricht baueInnenraum() aus innen.mjs,
// dazu: kachel (px je Zelle), breite/hoehe (eigenes Raster), rs/radMax (Figurenradius drinnen), zellen-Listen bei Türen und Treppen.
// Weltcode: Server und Browser bauen getrennt, daher nur + − × ÷ Math.sqrt und Ganzzahlen, keine Winkelfunktionen.
import { T, zufall, ladenArt, grossArt, seiteVon, INNEN_REICH } from './welt.mjs';
import { GROSS_MASSE, GROSS_BEHAELTER, halleEinrichten } from './innen_gross.mjs';

export const INNEN_Z = 2;          // px je Zelle
const ZM = 4;                      // Zellen je Meter
const RAND = 8;                    // Zellen Rand um das Haus (Kamera, Nebel)
const AUSSEN = 2;                  // Außenwand in Zellen
const TUER = 5;                    // Türbreite in Zellen
const MPK = 4;                     // Meter je Außenkachel
export const FIGUR_RADIUS_INNEN = 3;   // px (Kollisionsradius drinnen, 0,75 m Breite); draußen 7 px

// Möbel nach echten Maßen (Zellen b × h, 4 Zellen = 1 m)
const M = {
  bett: [8, 6], einzelbett: [8, 4], sofa: [8, 4], couchtisch: [4, 2], schrank: [5, 2], regal: [4, 1], kommode: [4, 2],
  herd: [2, 2], kuehlschrank: [2, 2], spuele: [4, 2], esstisch: [5, 3], badewanne: [7, 3], waschbecken: [2, 2], klo: [2, 3],
  garderobe: [4, 2], kiste: [2, 2], heizung: [4, 1], alter_schrank: [5, 2], kasse: [5, 2], regal_lang: [4, 2],
  // Safe Room (Notlager): Funktisch 1,5 × 0,75 m, Feldbett 2 × 0,75 m, Vorratsregal 2 × 0,5 m, Vorratskiste 1,25 × 0,75 m
  funktisch: [6, 3], feldbett: [8, 3], vorratsregal: [8, 2], erstehilfe: [2, 2], safe_kuehlschrank: [3, 3], generator: [4, 3], kanister: [2, 2], vorratskiste: [5, 3],
};
const BEHAELTER = new Set(['schrank', 'kuehlschrank', 'kommode', 'kiste', 'alter_schrank', 'garderobe', 'regal_lang', 'klo', 'waschbecken', 'herd', 'spuele', 'vorratsregal', 'erstehilfe']);
const ZUGANG_NOETIG = new Set(['funktisch', 'vorratskiste', 'safe_kuehlschrank']);   // Safe-Room-Stücke, die man benutzt: müssen erreichbar bleiben
const GEHBAR = new Set([T.BODEN, T.TUER_OFFEN, T.INNENTUER, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH]);
const SEITE_NACH = { oben: [0, 1], unten: [0, -1], links: [1, 0], rechts: [-1, 0] };

Object.assign(M, GROSS_MASSE);
for (const a of GROSS_BEHAELTER) BEHAELTER.add(a);
export const MOEBEL_MASSE = M;

// ---------- Grundriss aus dem OSM-Umriss ----------
const MAXZ = 840;                  // größte Kantenlänge in Zellen (210 m); größere Gebäude bleiben im groben Raster
function grundriss(haus, kasten = false) {
  let p = haus?.umriss;
  if (!(p?.length >= 6)) p = [haus.x, haus.y, haus.x + haus.b, haus.y, haus.x + haus.b, haus.y + haus.h, haus.x, haus.y + haus.h];
  const n = p.length / 2, pm = p.map(v => v * MPK);
  // längste Kante bestimmt die Ausrichtung (Richtungsvektor normiert mit sqrt, keine Winkelfunktionen)
  let bl = -1, ex = 1, ey = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = pm[2 * j] - pm[2 * i], dy = pm[2 * j + 1] - pm[2 * i + 1], l = dx * dx + dy * dy;
    if (l > bl) { bl = l; ex = dx; ey = dy; }
  }
  if (Math.abs(ex) < Math.abs(ey)) { const t = ex; ex = ey; ey = -t; }
  if (ex < 0) { ex = -ex; ey = -ey; }
  const len = Math.sqrt(ex * ex + ey * ey) || 1, c = ex / len, s = ey / len;
  const rot = (x, y) => [x * c + y * s, -x * s + y * c];
  const uv = []; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let i = 0; i < n; i++) {
    const [u, v] = rot(pm[2 * i], pm[2 * i + 1]);
    const ur = Math.round(u * 100) / 100, vr = Math.round(v * 100) / 100;
    uv.push(ur, vr); if (ur < u0) u0 = ur; if (ur > u1) u1 = ur; if (vr < v0) v0 = vr; if (vr > v1) v1 = vr;
  }
  const W = Math.min(MAXZ, Math.ceil((u1 - u0) * ZM)), H = Math.min(MAXZ, Math.ceil((v1 - v0) * ZM));
  const GB = W + 2 * RAND, GH = H + 2 * RAND;
  const mask = new Uint8Array(GB * GH);
  const imPoly = (x, y) => {
    let drin = false;
    for (let i = 0, j = uv.length - 2; i < uv.length; j = i, i += 2) {
      if ((uv[i + 1] > y) !== (uv[j + 1] > y) && x < (uv[j] - uv[i]) * (y - uv[i + 1]) / (uv[j + 1] - uv[i + 1]) + uv[i]) drin = !drin;
    }
    return drin;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (kasten || imPoly(u0 + (i + 0.5) / ZM, v0 + (j + 0.5) / ZM)) mask[(j + RAND) * GB + i + RAND] = 1;
  }
  // Lage der Außentür im Raster (für die Wahl der Haustür-Stelle)
  const [tu, tv] = rot((haus.tuer.x + 0.5) * MPK, (haus.tuer.y + 0.5) * MPK);
  return { zuGross: (u1 - u0) * ZM > MAXZ || (v1 - v0) * ZM > MAXZ, GB, GH, mask, tuer: { x: Math.round((tu - u0) * ZM) + RAND, y: Math.round((tv - v0) * ZM) + RAND }, breiteM: (u1 - u0), hoeheM: (v1 - v0), abb: { c, s, u0, v0 } };
}

// ---------- Generator ----------
// Maßstäblich bauen; scheitert die Plausibilitätsprüfung (verwinkelter Umriss, unglückliche Zimmeraufteilung), wird mit anderem Zufall (Salz) neu
// aufgeteilt, zuletzt mit dem umhüllenden Rechteck des Umrisses. Alles deterministisch (Server und Client kommen zum selben Ergebnis).
// Null nur bei Gebäuden über 210 m Kantenlänge.
export function baueInnenFein(seed, nr, stock, haus, laden = false, seite = 'unten', safe = false, halle = '') {
  for (let versuch = 0; versuch < 12; versuch++) {
    const w = baueInnenFein1(seed, nr, stock, haus, laden, seite, safe, halle, versuch < 8 ? versuch : 0, versuch >= 8);
    if (w || (versuch === 0 && grundriss(haus).zuGross)) return w;
  }
  return null;
}
function baueInnenFein1(seed, nr, stock, haus, laden, seite, safe, halle, salz, kasten) {
  const rng = zufall(seed ^ Math.imul(nr + 1, 7919) ^ (stock === 'eg' ? 0 : stock === 'keller' ? 0x51ed : 0xa77e) ^ 0x1f1e ^ Math.imul(salz, 0x9e3779b1));
  const g = grundriss(haus, kasten), GB = g.GB, GH = g.GH;
  if (g.zuGross) return null;   // über 210 m: passt nicht in das Raster, das Haus bleibt im groben Raster
  const k = new Uint8Array(GB * GH).fill(T.LEER);
  const idx = (x, y) => y * GB + x;
  const hole = (x, y) => (x < 0 || y < 0 || x >= GB || y >= GH) ? T.LEER : k[y * GB + x];
  // Boden im Umriss; Außenwand = die äußersten AUSSEN Zellenlagen
  for (let i = 0; i < k.length; i++) if (g.mask[i]) k[i] = T.BODEN;
  const aussen = (x, y) => !g.mask[idx(x, y)];
  for (let lage = 1; lage <= AUSSEN; lage++) {
    const neu = [];
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GB - 1; x++) {
      if (k[idx(x, y)] !== T.BODEN) continue;
      const r = (nx, ny) => lage === 1 ? aussen(nx, ny) : k[idx(nx, ny)] === T.WAND;
      if (r(x + 1, y) || r(x - 1, y) || r(x, y + 1) || r(x, y - 1)) neu.push(idx(x, y));
    }
    for (const i of neu) k[i] = T.WAND;
  }
  // größte zusammenhängende Bodenfläche behalten (Splitter und Nischen zu Wand)
  {
    const comp = new Int32Array(GB * GH).fill(-1); let best = -1, bs = 0, nc = 0;
    for (let s0 = 0; s0 < k.length; s0++) {
      if (k[s0] !== T.BODEN || comp[s0] >= 0) continue;
      const q = [s0]; comp[s0] = nc;
      for (let a = 0; a < q.length; a++) {
        const i = q[a], x = i % GB, y = (i - x) / GB;
        for (const j of [i + 1, i - 1, i + GB, i - GB]) { if (j >= 0 && j < k.length && k[j] === T.BODEN && comp[j] < 0 && Math.abs((j % GB) - x) <= 1) { comp[j] = nc; q.push(j); } }
      }
      if (q.length > bs) { bs = q.length; best = nc; }
      nc++;
    }
    for (let i = 0; i < k.length; i++) if (k[i] === T.BODEN && comp[i] !== best) k[i] = T.WAND;
  }
  let ix0 = GB, iy0 = GH, ix1 = -1, iy1 = -1, flaeche = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GB; x++) if (k[idx(x, y)] === T.BODEN) { flaeche++; if (x < ix0) ix0 = x; if (x > ix1) ix1 = x; if (y < iy0) iy0 = y; if (y > iy1) iy1 = y; }
  const flaecheM2 = flaeche / (ZM * ZM);

  // Zimmer aufteilen (BSP, Innenwand = 1 Zelle)
  const MINR = laden ? 16 : 9;      // kleinste Zimmerbreite: 2,25 m (Laden: 4 m)
  const raeume = [{ x: ix0, y: iy0, b: ix1 - ix0 + 1, h: iy1 - iy0 + 1 }];
  const ziel = stock === 'eg' ? (laden ? 2 : Math.max(2, Math.min(7, Math.round(flaecheM2 / 17)))) : stock === 'keller' ? Math.max(2, Math.min(4, Math.round(flaecheM2 / 25))) : Math.max(1, Math.min(3, Math.round(flaecheM2 / 30)));
  const bodenIn = r => { let n = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.b; x++) if (k[idx(x, y)] === T.BODEN) n++; return n; };
  for (let runde = 0; runde < 40 && raeume.length < ziel; runde++) {
    const kand = raeume.filter(r => r.b >= 2 * MINR + 1 || r.h >= 2 * MINR + 1).sort((a, b) => bodenIn(b) - bodenIn(a));
    if (!kand.length) break;
    const r = kand[0], i = raeume.indexOf(r);
    const kannV = r.b >= 2 * MINR + 1, kannH = r.h >= 2 * MINR + 1;
    const vert = kannV && kannH ? (r.b * 0.9 > r.h ? true : r.h * 0.9 > r.b ? false : rng() < 0.5) : kannV;
    if (vert) {
      const spiel = r.b - 2 * MINR - 1;
      let wx = r.x + MINR + Math.floor(rng() * (spiel + 1));
      if (laden && raeume.length === 1) { const lager = Math.min(Math.max(MINR, Math.round(r.b * 0.3)), halle ? 24 : 9999); wx = g.tuer.x > r.x + r.b / 2 ? r.x + lager : r.x + r.b - lager - 1; }   // Laden: das kleinere Lager liegt von der Haustür abgewandt
      for (let y = r.y; y < r.y + r.h; y++) if (k[idx(wx, y)] === T.BODEN) k[idx(wx, y)] = T.WAND;
      raeume.splice(i, 1, { x: r.x, y: r.y, b: wx - r.x, h: r.h }, { x: wx + 1, y: r.y, b: r.x + r.b - wx - 1, h: r.h });
    } else {
      const spiel = r.h - 2 * MINR - 1;
      let wy = r.y + MINR + Math.floor(rng() * (spiel + 1));
      if (laden && raeume.length === 1) { const lager = Math.min(Math.max(MINR, Math.round(r.h * 0.3)), halle ? 24 : 9999); wy = g.tuer.y > r.y + r.h / 2 ? r.y + lager : r.y + r.h - lager - 1; }
      for (let x = r.x; x < r.x + r.b; x++) if (k[idx(x, wy)] === T.BODEN) k[idx(x, wy)] = T.WAND;
      raeume.splice(i, 1, { x: r.x, y: r.y, b: r.b, h: wy - r.y }, { x: r.x, y: wy + 1, b: r.b, h: r.y + r.h - wy - 1 });
    }
  }
  // Zimmer ohne Boden entfernen
  for (let i = raeume.length - 1; i >= 0; i--) if (bodenIn(raeume[i]) < 12) raeume.splice(i, 1);
  raeume.sort((a, b) => bodenIn(b) - bodenIn(a));
  const raumAn = (x, y) => raeume.findIndex(r => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);

  // ---------- Begehbarkeit mit echtem Figurenradius ----------
  const R = FIGUR_RADIUS_INNEN;
  const bl = new Set([T.WAND, T.MOEBEL, T.LEER]);   // Zimmertüren zählen als offen
  const freiFigur = (cx, cy) => {   // Figur (Radius R px) in der Mitte der Zelle cx,cy
    const x = (cx + 0.5) * INNEN_Z, y = (cy + 0.5) * INNEN_Z;
    const x0 = Math.floor((x - R) / INNEN_Z), x1 = Math.floor((x + R) / INNEN_Z), y0 = Math.floor((y - R) / INNEN_Z), y1 = Math.floor((y + R) / INNEN_Z);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (bl.has(hole(xx, yy))) return false;
    return true;
  };
  // Türen zwischen Nachbarzimmern (5 Zellen breit, in der 1-Zellen-Wand)
  const tueren = [], adj = raeume.map(() => []);
  // Türen, Haustür und Treppen als Rechtecke (Zellen): „liegt etwas davon höchstens abst Zellen neben dem Rechteck x,y,b,h?“ (statt Zelle für Zelle zu suchen)
  const sperrR = [];
  const sperrRect = zellen => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [x, y] of zellen) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } sperrR.push({ x0, y0, x1, y1 }); };
  const naheSperr = (x, y, b, h, abst) => { for (const r of sperrR) if (r.x1 >= x - abst && r.x0 <= x + b + abst - 1 && r.y1 >= y - abst && r.y0 <= y + h + abst - 1) return true; return false; };
  const tuerSuche = (i, j) => {
    const a = raeume[i], b = raeume[j];
    let wand = null;
    if (a.x + a.b + 1 === b.x) wand = { vert: true, w: a.x + a.b, lo: Math.max(a.y, b.y), hi: Math.min(a.y + a.h, b.y + b.h) };
    else if (b.x + b.b + 1 === a.x) wand = { vert: true, w: b.x + b.b, lo: Math.max(a.y, b.y), hi: Math.min(a.y + a.h, b.y + b.h) };
    else if (a.y + a.h + 1 === b.y) wand = { vert: false, w: a.y + a.h, lo: Math.max(a.x, b.x), hi: Math.min(a.x + a.b, b.x + b.b) };
    else if (b.y + b.h + 1 === a.y) wand = { vert: false, w: b.y + b.h, lo: Math.max(a.x, b.x), hi: Math.min(a.x + a.b, b.x + b.b) };
    if (!wand || wand.hi - wand.lo < TUER + 2) return null;
    // Läufe, in denen beide Seiten Boden und die Mitte Wand ist
    // beide Seiten müssen für eine Figur begehbar sein (keine schmalen Nischen, in denen die Tür sonst unerreichbar wäre)
    const ok = t => wand.vert ? (k[idx(wand.w, t)] === T.WAND && k[idx(wand.w - 1, t)] === T.BODEN && k[idx(wand.w + 1, t)] === T.BODEN && freiFigur(wand.w - 3, t) && freiFigur(wand.w + 3, t))
      : (k[idx(t, wand.w)] === T.WAND && k[idx(t, wand.w - 1)] === T.BODEN && k[idx(t, wand.w + 1)] === T.BODEN && freiFigur(t, wand.w - 3) && freiFigur(t, wand.w + 3));
    const laeufe = []; let s0 = -1;
    for (let t = wand.lo; t <= wand.hi; t++) {
      if (t < wand.hi && ok(t)) { if (s0 < 0) s0 = t; } else { if (s0 >= 0 && t - s0 >= TUER + 2) laeufe.push([s0, t - s0]); s0 = -1; }
    }
    return laeufe.length ? { wand, laeufe } : null;
  };
  for (let i = 0; i < raeume.length; i++) for (let j = i + 1; j < raeume.length; j++) { const s = tuerSuche(i, j); if (s) { adj[i].push({ j, s }); adj[j].push({ j: i, s }); } }
  const setzeTuer = s => {
    const [l0, ln] = s.laeufe[Math.floor(rng() * s.laeufe.length)];
    const t0 = l0 + 1 + Math.floor(rng() * (ln - TUER - 1 + 1 > 0 ? ln - TUER - 1 : 0));
    const zellen = [];
    for (let t = t0; t < t0 + TUER; t++) { const x = s.wand.vert ? s.wand.w : t, y = s.wand.vert ? t : s.wand.w; k[idx(x, y)] = T.INNENTUER; zellen.push([x, y]); }
    const m = zellen[Math.floor(TUER / 2)];
    tueren.push({ x: m[0], y: m[1], zellen, senkrecht: s.wand.vert, verschlossen: false });
    sperrRect(zellen);
  };
  const besucht = new Set([0]), kanten = [], fifo = [0];
  for (let a = 0; a < fifo.length; a++) for (const { j, s } of adj[fifo[a]]) if (!besucht.has(j)) { besucht.add(j); kanten.push([fifo[a], j, s]); fifo.push(j); }
  for (const [, , s] of kanten) setzeTuer(s);
  const extra = [];
  for (let i = 0; i < raeume.length; i++) for (const { j, s } of adj[i]) if (i < j && !kanten.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) extra.push(s);
  if (extra.length && rng() < 0.5) setzeTuer(extra[Math.floor(rng() * extra.length)]);
  // nicht erreichbare Zimmer (kein Spannbaum-Anschluss): zu Wand
  for (let i = raeume.length - 1; i >= 0; i--) if (!besucht.has(i)) { const r = raeume[i]; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.b; x++) if (k[idx(x, y)] === T.BODEN) k[idx(x, y)] = T.WAND; }
  const raeumeOk = raeume.filter((_, i) => besucht.has(i));
  raeume.length = 0; raeume.push(...raeumeOk);

  // Haustür (nur Erdgeschoss): an der Seite der Außentür, möglichst nahe an deren Lage; Ausgang = 2 Lagen × TUER Zellen
  let ausgang = null, flurIndex = 0;
  if (stock === 'eg') {
    const seiten = [seite, ...['unten', 'oben', 'links', 'rechts'].filter(s => s !== seite)];
    const horiz = s => s === 'oben' || s === 'unten';
    const zelle = (s, a, d) => s === 'unten' ? [a, GH - 1 - d] : s === 'oben' ? [a, d] : s === 'links' ? [d, a] : [GB - 1 - d, a];
    suche: for (const s of seiten) {
      const nach = SEITE_NACH[s], laenge = horiz(s) ? GB : GH, wunsch = horiz(s) ? g.tuer.x : g.tuer.y;
      const kandidaten = [];
      const kante = a => { for (let d = 0; d < (horiz(s) ? GH : GB); d++) { const [x, y] = zelle(s, a, d); if (g.mask[idx(x, y)]) return d; } return -1; };
      for (let a0 = RAND; a0 + TUER < laenge - RAND; a0++) {
        const d0 = kante(a0); if (d0 < 0) continue;
        let gut = true;
        for (let a = a0; a < a0 + TUER && gut; a++) {
          if (kante(a) !== d0) { gut = false; break; }
          for (let d = d0; d < d0 + AUSSEN; d++) { const [x, y] = zelle(s, a, d); if (k[idx(x, y)] !== T.WAND) gut = false; }
          for (let d = d0 + AUSSEN; d < d0 + AUSSEN + 5; d++) { const [x, y] = zelle(s, a, d); if (k[idx(x, y)] !== T.BODEN) gut = false; }
        }
        if (gut) kandidaten.push({ a0, d0, abst: Math.abs(a0 + TUER / 2 - wunsch) });
      }
      if (!kandidaten.length) continue;
      kandidaten.sort((p, q) => p.abst - q.abst);
      const { a0, d0 } = kandidaten[0], zellen = [];
      for (let a = a0; a < a0 + TUER; a++) for (let d = d0; d < d0 + AUSSEN; d++) { const [x, y] = zelle(s, a, d); k[idx(x, y)] = T.AUSGANG; zellen.push([x, y]); }
      // Vorplatz: zwei Zellenlagen vor der Haustür gehören auch zum Ausgang (sonst passt der Figurenkreis von 3 px nur auf einer 1 px schmalen Linie in die 2 Zellen
      // tiefe Türöffnung, und der Schritt nach draußen bliebe kurz davor hängen)
      for (let a = a0; a < a0 + TUER; a++) for (let d = d0 - 1; d >= d0 - 2; d--) { const [x, y] = zelle(s, a, d); if (x >= 0 && y >= 0 && x < GB && y < GH && k[idx(x, y)] === T.LEER) k[idx(x, y)] = T.AUSGANG; }
      const [mx, my] = zelle(s, a0 + Math.floor(TUER / 2), d0 + AUSSEN - 1);
      const xs = zellen.map(c => c[0]), ys = zellen.map(c => c[1]), rx = Math.min(...xs), ry = Math.min(...ys);
      sperrRect(zellen);
      ausgang = { x: mx, y: my, nach, zellen, seite: s, a0, d0, rect: { x: rx, y: ry, b: Math.max(...xs) - rx + 1, h: Math.max(...ys) - ry + 1 } };
      const [fx, fy] = zelle(s, a0 + Math.floor(TUER / 2), d0 + AUSSEN + 1);
      flurIndex = Math.max(0, raumAn(fx, fy));
      break suche;
    }
  }

  // Zimmerarten
  const typ = new Array(raeume.length).fill('');
  if (safe) raeume.forEach((_, i) => { typ[i] = 'notlager'; });
  else if (stock === 'eg' && laden) raeume.forEach((_, i) => { typ[i] = i === flurIndex ? (halle && halle !== 'supermarkt' ? 'halle' : 'verkaufsraum') : (halle && halle !== 'supermarkt' ? 'nebenraum' : 'lager'); });
  else if (stock === 'eg') {
    typ[flurIndex] = 'flur';
    // größte Zimmer zuerst, das kleinste Zimmer ist das Bad
    const folge = ['wohnzimmer', 'kueche', 'schlafzimmer', 'kinderzimmer', 'abstellraum'];
    const rest = raeume.map((_, i) => i).filter(i => i !== flurIndex);
    rest.forEach((i, n) => { typ[i] = n === rest.length - 1 && rest.length >= 2 ? 'bad' : (folge[n] ?? 'abstellraum'); });
  } else if (stock === 'keller') raeume.forEach((_, i) => { typ[i] = ['kellerraum', 'heizungsraum', 'vorratskeller'][Math.min(i, 2)]; });
  else raeume.forEach((_, i) => { typ[i] = 'dachboden'; });

  // Türen zählen als offen (Zimmertüren lassen sich öffnen)
  // (Summentabelle der gesperrten Zellen: „passt die Figur (4 × 4 Zellen) hierhin?“ in O(1); gleiches Ergebnis wie freiFigur, aber viel schneller)
  const erreichbar = (sx, sy) => {
    const W1 = GB + 1, S = new Int32Array(W1 * (GH + 1));
    for (let y = 0; y < GH; y++) {
      let zeile = 0;
      for (let x = 0; x < GB; x++) { const t = k[y * GB + x]; if (t === T.WAND || t === T.MOEBEL || t === T.LEER) zeile++; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + zeile; }
    }
    const passt = (cx, cy) => {
      const x0 = cx - 1, y0 = cy - 1, x1 = cx + 2, y1 = cy + 2;
      if (x0 < 0 || y0 < 0 || x1 >= GB || y1 >= GH) return false;
      return S[(y1 + 1) * W1 + x1 + 1] - S[y0 * W1 + x1 + 1] - S[(y1 + 1) * W1 + x0] + S[y0 * W1 + x0] === 0;
    };
    const s = new Uint8Array(GB * GH), q = new Int32Array(GB * GH), s0 = idx(sx, sy);
    let kopf = 0, ende = 0; s[s0] = 1; q[ende++] = s0;
    while (kopf < ende) {
      const i = q[kopf++], x = i % GB, y = (i - x) / GB;
      if (x + 1 < GB && !s[i + 1] && passt(x + 1, y)) { s[i + 1] = 1; q[ende++] = i + 1; }
      if (x > 0 && !s[i - 1] && passt(x - 1, y)) { s[i - 1] = 1; q[ende++] = i - 1; }
      if (y + 1 < GH && !s[i + GB] && passt(x, y + 1)) { s[i + GB] = 1; q[ende++] = i + GB; }
      if (y > 0 && !s[i - GB] && passt(x, y - 1)) { s[i - GB] = 1; q[ende++] = i - GB; }
    }
    return s;
  };

  // Treppen: 4 × 12 Zellen (1 × 3 m) längs einer Wand
  const treppen = [];
  const treppeSetzen = (art, ziel, raumIdx, streng = true) => {   // streng = false: Notlösung (Treppe auch frei im Raum, kürzer), damit Keller und Dachboden immer einen Rückweg haben
    const kand = [];
    // Summentabelle der Nicht-Boden-Zellen: „ist das Rechteck reiner Boden?“ in O(1)
    const W1 = GB + 1, S = new Int32Array(W1 * (GH + 1));
    for (let y = 0; y < GH; y++) { let zeile = 0; for (let x = 0; x < GB; x++) { if (k[y * GB + x] !== T.BODEN) zeile++; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + zeile; } }
    const nurBoden = (x, y, b, h) => S[(y + h) * W1 + x + b] - S[y * W1 + x + b] - S[(y + h) * W1 + x] + S[y * W1 + x] === 0;
    for (const ri of raumIdx) {
      const r = raeume[ri];
      for (const [b, h] of streng ? [[TUER - 1, 12], [12, TUER - 1]] : [[TUER - 1, 8], [8, TUER - 1]]) {
        const lang = b > h;   // eine lange Seite an der Wand
        for (let y = r.y; y <= r.y + r.h - h; y++) for (let x = r.x; x <= r.x + r.b - b; x++) {
          if (!nurBoden(x, y, b, h)) continue;
          if (naheSperr(x, y, b, h, streng ? 4 : 1)) continue;   // nicht an Türen (Abstand ≥ 4 Zellen)
          let wand = !streng;
          if (!streng) { /* ohne Wandbindung */ } else if (lang) {
            let o = true, u = true;
            for (let i = 0; i < b && (o || u); i++) { if (k[idx(x + i, y - 1)] !== T.WAND) o = false; if (k[idx(x + i, y + h)] !== T.WAND) u = false; }
            wand = o || u;
          } else {
            let l = true, rr = true;
            for (let i = 0; i < h && (l || rr); i++) { if (k[idx(x - 1, y + i)] !== T.WAND) l = false; if (k[idx(x + b, y + i)] !== T.WAND) rr = false; }
            wand = l || rr;
          }
          if (wand) kand.push({ x, y, b, h });
        }
      }
    }
    if (!kand.length) return false;
    const p = kand[Math.floor(rng() * kand.length)], zellen = [];
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.b; dx++) { k[idx(p.x + dx, p.y + dy)] = art === 'runter' ? T.TREPPE_RUNTER : T.TREPPE_HOCH; zellen.push([p.x + dx, p.y + dy]); }
    treppen.push({ x: p.x, y: p.y, art, ziel, zellen, rect: p });
    sperrRect(zellen);
    return true;
  };
  let hatKeller = false, hatDach = false;
  const alleRaeume = raeume.map((_, i) => i);
  const nahFlur = stock === 'eg' ? alleRaeume.filter(i => i === flurIndex || adj[flurIndex]?.some(a => a.j === i)) : alleRaeume;
  if (safe) { /* Safe Room: keine Treppen, nur das Erdgeschoss */ }
  else if (stock === 'eg') {
    hatKeller = rng() < 0.5; hatDach = rng() < 0.4;
    if (hatKeller && !treppeSetzen('runter', 'keller', nahFlur) && !treppeSetzen('runter', 'keller', alleRaeume)) hatKeller = false;
    if (hatDach && !treppeSetzen('hoch', 'dach', nahFlur) && !treppeSetzen('hoch', 'dach', alleRaeume)) hatDach = false;
  } else if (stock === 'keller') { if (!treppeSetzen('hoch', 'eg', alleRaeume)) treppeSetzen('hoch', 'eg', alleRaeume, false); }
  else if (!treppeSetzen('runter', 'eg', alleRaeume)) treppeSetzen('runter', 'eg', alleRaeume, false);

  // Start
  let start = null;
  const zentrum = (x, y) => ({ x: (x + 0.5) * INNEN_Z, y: (y + 0.5) * INNEN_Z });
  if (stock === 'eg' && ausgang) {
    const s = ausgang.seite, mid = ausgang.a0 + Math.floor(TUER / 2), d = ausgang.d0 + AUSSEN + 2;
    const [sx, sy] = s === 'unten' ? [mid, GH - 1 - d] : s === 'oben' ? [mid, d] : s === 'links' ? [d, mid] : [GB - 1 - d, mid];
    start = zentrum(sx, sy);
  } else if (treppen.length) {
    const r = treppen[0].rect, cands = [];
    for (let dy = -3; dy <= r.h + 2; dy++) for (let dx = -3; dx <= r.b + 2; dx++) if (k[idx(r.x + dx, r.y + dy)] === T.BODEN && freiFigur(r.x + dx, r.y + dy)) cands.push([r.x + dx, r.y + dy, Math.max(0, Math.max(-dx, dx - r.b + 1)) + Math.max(0, Math.max(-dy, dy - r.h + 1))]);
    cands.sort((a, b) => a[2] - b[2]);
    if (cands.length) start = zentrum(cands[0][0], cands[0][1]);
  }
  if (!start) { for (let y = iy0; y <= iy1 && !start; y++) for (let x = ix0; x <= ix1; x++) if (k[idx(x, y)] === T.BODEN && freiFigur(x, y)) { start = zentrum(x, y); break; } }
  start ??= zentrum(ix0 + 1, iy0 + 1);
  const startZ = [Math.floor(start.x / INNEN_Z), Math.floor(start.y / INNEN_Z)];

  // Plausibilität (vor der Einrichtung, deshalb billig): Start, Haustür, alle Zimmertüren und Treppen müssen für die Figur vom Start aus erreichbar sein;
  // Keller und Dachboden brauchen eine Treppe zurück. Sonst (sehr verwinkelte Umrisse) bleibt das Haus im groben Raster (Rückgabe null, siehe innenraumFein).
  {
    const fl = erreichbar(startZ[0], startZ[1]);
    const erreicht = zellen => zellen.some(([zx, zy]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => fl[idx(zx + a, zy + c)]));
    let ok = freiFigur(startZ[0], startZ[1]);
    if (ok && stock === 'eg' && !ausgang) ok = false;
    if (ok && ausgang && !erreicht(ausgang.zellen)) ok = false;
    if (ok) for (const t of tueren) if (!erreicht(t.zellen)) { ok = false; break; }
    if (ok) for (const t of treppen) if (!erreicht(t.zellen)) { ok = false; break; }
    if (ok && stock !== 'eg' && !treppen.length) ok = false;
    if (!ok) return null;
  }

  // ---------- Möbel ----------
  const moebel = [], behaelter = [], zaehler = { n: 0 };
  const freiVon = (x, y, b, h) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < b; dx++) if (k[idx(x + dx, y + dy)] !== T.BODEN) return false; return true; };
  const nahTuer = (x, y, b, h, abst) => naheSperr(x, y, b, h, abst);
  const nachbar = (x, y, b, h, was) => {   // an den vier Seiten: Anzahl Zellen der Art `was`
    const r = { oben: 0, unten: 0, links: 0, rechts: 0 };
    for (let i = 0; i < b; i++) { if (hole(x + i, y - 1) === was) r.oben++; if (hole(x + i, y + h) === was) r.unten++; }
    for (let j = 0; j < h; j++) { if (hole(x - 1, y + j) === was) r.links++; if (hole(x + b, y + j) === was) r.rechts++; }
    return r;
  };
  const platzieren = (art, x, y, b, h, schnell = false) => {   // schnell: Ladenregal-Reihen haben bauartbedingt 1,5-m-Gänge, keine Erreichbarkeitsprüfung (spart bei großen Märkten Sekunden)
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < b; dx++) k[idx(x + dx, y + dy)] = T.MOEBEL;
    // Zugänglichkeit: Start, alle Türen, Treppen und alle bisherigen Behälter müssen mit echtem Figurenradius erreichbar bleiben
    const s = schnell ? null : erreichbar(startZ[0], startZ[1]);
    let ok = freiFigur(startZ[0], startZ[1]) && (schnell || s[idx(startZ[0], startZ[1])] === 1);   // Start bleibt für die Figur frei (erreichbar() setzt die Startzelle immer auf 1)
    if (!schnell) for (const t of tueren) { if (!ok) break; const [cx, cy] = t.zellen[Math.floor(TUER / 2)]; ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => s[idx(cx + a, cy + c)]) || t.zellen.some(([zx, zy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => s[idx(zx + a, zy + c)])); }
    if (ok && !schnell) for (const tr of treppen) if (!tr.zellen.some(([zx, zy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => s[idx(zx + a, zy + c)]))) { ok = false; break; }
    if (ok && !schnell) for (const mm of moebel.concat([{ art, x, y, b, h }])) {
      if (!BEHAELTER.has(mm.art) && !ZUGANG_NOETIG.has(mm.art)) continue;
      let zug = false;
      for (let dy = -3; dy < mm.h + 3 && !zug; dy++) for (let dx = -3; dx < mm.b + 3; dx++) if (s[idx(mm.x + dx, mm.y + dy)]) { zug = true; break; }
      if (!zug) { ok = false; break; }
    }
    if (!ok) { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < b; dx++) k[idx(x + dx, y + dy)] = T.BODEN; return false; }
    moebel.push({ art, x, y, b, h });
    if (BEHAELTER.has(art)) {
      const bArt = art === 'regal_lang' ? 'laden' : art === 'kiste' ? 'spind' : art === 'klo' || art === 'waschbecken' ? 'bad' : (art === 'alter_schrank' || art === 'garderobe' || art === 'kommode' ? 'schrank' : art);
      behaelter.push({ id: 'm' + (zaehler.n++), art: bArt, x: (x + b / 2) * INNEN_Z, y: (y + h / 2) * INNEN_Z, rect: { x0: x * INNEN_Z, y0: y * INNEN_Z, x1: (x + b) * INNEN_Z, y1: (y + h) * INNEN_Z } });   // rect: Möbelumriss in px – Reichweite zählt bis zum Rand, nicht zur Mitte (lange Regale)
    }
    return true;
  };
  // Kandidaten: ganze Längsseite an der Wand, davor ≥ 5 Zellen (1,25 m) Boden; Tische frei mit Ring
  const setze = (ri, art, opt = {}) => {
    const r = raeume[ri], [mb, mh] = M[art] ?? [2, 2];
    const stufen = [[], []];
    for (const [b, h] of mb === mh ? [[mb, mh]] : [[mb, mh], [mh, mb]]) {
      for (let y = r.y; y <= r.y + r.h - h; y++) for (let x = r.x; x <= r.x + r.b - b; x++) {
        if (!freiVon(x, y, b, h) || nahTuer(x, y, b, h, opt.tuerAbst ?? 4)) continue;
        const w = nachbar(x, y, b, h, T.WAND), m = nachbar(x, y, b, h, T.MOEBEL);
        const lang = b === h ? 1 : b > h ? 1 : 0;   // 1: Längsseite waagrecht
        const volle = { oben: w.oben === b, unten: w.unten === b, links: w.links === h, rechts: w.rechts === h };
        const langAnWand = b === h ? (volle.oben || volle.unten || volle.links || volle.rechts) : lang ? (volle.oben || volle.unten) : (volle.links || volle.rechts);
        const irgendWand = volle.oben || volle.unten || volle.links || volle.rechts;
        // Luft davor: gegenüberliegende Seite der Wand mindestens 5 Zellen frei
        const luft = n => { for (let a = 0; a < 5; a++) { const t = n(a); if (t !== T.BODEN) return false; } return true; };
        let frontOk = true;
        if (volle.oben) frontOk = [...Array(b).keys()].every(i => luft(a => hole(x + i, y + h + a)));
        else if (volle.unten) frontOk = [...Array(b).keys()].every(i => luft(a => hole(x + i, y - 1 - a)));
        else if (volle.links) frontOk = [...Array(h).keys()].every(j => luft(a => hole(x + b + a, y + j)));
        else if (volle.rechts) frontOk = [...Array(h).keys()].every(j => luft(a => hole(x - 1 - a, y + j)));
        if (!frontOk) continue;
        if (opt.frei) {
          let ring = true;
          for (let dy = -3; dy < h + 3 && ring; dy++) for (let dx = -3; dx < b + 3; dx++) { if (dx >= 0 && dx < b && dy >= 0 && dy < h) continue; const t = hole(x + dx, y + dy); if (t === T.MOEBEL || t === T.WAND) { ring = false; break; } }
          if (ring) stufen[0].push({ x, y, b, h });
          continue;
        }
        const moebelNah = m.oben + m.unten + m.links + m.rechts;
        if (langAnWand && moebelNah === 0) stufen[0].push({ x, y, b, h });
        else if (irgendWand && moebelNah === 0) stufen[1].push({ x, y, b, h });
      }
    }
    for (const liste of stufen) {
      if (opt.nah) liste.sort((p, q) => { const dq = { x: q.x + q.b / 2 - opt.nah.x, y: q.y + q.h / 2 - opt.nah.y }, dp = { x: p.x + p.b / 2 - opt.nah.x, y: p.y + p.h / 2 - opt.nah.y }; return (dp.x * dp.x + dp.y * dp.y) - (dq.x * dq.x + dq.y * dq.y); });   // am nächsten an der Haustür
      else if (opt.fern) liste.sort((p, q) => { const dq = { x: q.x + q.b / 2 - opt.fern.x, y: q.y + q.h / 2 - opt.fern.y }, dp = { x: p.x + p.b / 2 - opt.fern.x, y: p.y + p.h / 2 - opt.fern.y }; return (dq.x * dq.x + dq.y * dq.y) - (dp.x * dp.x + dp.y * dp.y); });   // am weitesten von der Haustür weg
      for (let v = 0; v < 6 && liste.length; v++) {
        const i = opt.fern || opt.nah ? 0 : Math.floor(rng() * liste.length), p = liste.splice(i, 1)[0];
        if (platzieren(art, p.x, p.y, p.b, p.h)) return true;
      }
    }
    return false;
  };
  const MOEBEL_JE_RAUM = {
    wohnzimmer: [['sofa'], ['couchtisch', { frei: true }], ['schrank'], ['regal']],
    kueche: [['herd'], ['kuehlschrank'], ['spuele'], ['esstisch', { frei: true }]],
    schlafzimmer: [['bett'], ['schrank'], ['kommode']],
    kinderzimmer: [['einzelbett'], ['schrank'], ['kommode']],
    bad: [['badewanne'], ['waschbecken'], ['klo']],
    flur: [['garderobe'], ['kommode']],
    abstellraum: [['regal'], ['kiste']],
    kellerraum: [['regal'], ['kiste'], ['kiste'], ['kiste']],
    vorratskeller: [['regal'], ['kiste'], ['kiste'], ['kiste']],
    heizungsraum: [['heizung'], ['kiste']],
    nebenraum: [['klo'], ['waschbecken'], ['regal'], ['kiste'], ['schrank']],
    lager: [['regal'], ['regal'], ['regal'], ['regal'], ['regal'], ['regal'], ['regal'], ['regal'], ['kiste'], ['kiste'], ['kiste'], ['kiste'], ['kiste'], ['kiste']],
  };
  raeume.forEach((r, ri) => {
    if (typ[ri] === 'verkaufsraum') {
      // Ladenregale: Reihen von 1-m-Modulen (4 × 2 Zellen), Gänge 1,5 m, Rand und Eingang 1,5 m frei; Kasse an der Eingangsseite
      const ein = ausgang ? ausgang.seite : 'unten', quer = ein === 'links' || ein === 'rechts';
      const RM = 6, GANG = 6, TIEFE = 2;
      let n = 0;
      // Reihen laufen parallel zur Eingangswand
      const x0 = r.x + RM, x1 = r.x + r.b - RM, y0 = r.y + RM, y1 = r.y + r.h - RM;
      const reihen = [];
      if (!quer) for (let y = ein === 'unten' ? y0 : y0 + 7; y + TIEFE <= (ein === 'unten' ? y1 - 7 : y1); y += TIEFE + GANG) reihen.push({ y });
      else for (let x = ein === 'rechts' ? x0 : x0 + 7; x + TIEFE <= (ein === 'rechts' ? x1 - 7 : x1); x += TIEFE + GANG) reihen.push({ x });
      for (const re of reihen) {
        const von = quer ? y0 : x0, bis = quer ? y1 : x1;
        for (let a = von; a + 4 <= bis;) {
          // Segmente aus bis zu 4 Modulen (4 m), dann 1,25 m Querdurchgang
          let m = 0;
          while (m < 4 && a + 4 <= bis) {
            const px = quer ? re.x : a, py = quer ? a : re.y, pb = quer ? TIEFE : 4, ph = quer ? 4 : TIEFE;
            if (freiVon(px, py, pb, ph) && platzieren('regal_lang', px, py, pb, ph, true)) n++;
            a += 4; m++;
          }
          a += TUER;
        }
      }
      // Kasse: am Rand der Eingangsseite, nahe der Tür aber nicht davor
      setze(ri, 'kasse', { tuerAbst: 7 });
      if (halle === 'supermarkt') halleEinrichten({ halle, r, ri, k, T, idx, freiVon, platzieren, setze, moebel, behaelter, zelleZ: INNEN_Z, erreichbar, startZ, tueren, treppen, ausgang });
      return;
    }
    if (typ[ri] === 'halle') {
      halleEinrichten({ halle, r, ri, k, T, idx, freiVon, platzieren, setze, moebel, behaelter, zelleZ: INNEN_Z, erreichbar, startZ, tueren, treppen, ausgang });
      return;
    }
    for (const [art, opt] of MOEBEL_JE_RAUM[typ[ri]] ?? []) {
      if (typ[ri] === 'dachboden') continue;
      setze(ri, art, opt ?? {});
    }
  });
  // Dachboden: Kram auf alle Räume verteilen
  if (stock === 'dach') {
    const kram = [['alter_schrank'], ...Array(8).fill(['kiste'])];
    kram.forEach(([art], i) => setze(i % raeume.length, art));
  }
  // Safe Room als Notlager: Funktisch, Vorratsregale, Feldbetten, Erste Hilfe, Kühlschrank, Generator, Kanister und die Vorratskiste (möglichst weit
  // von der Haustür). Reihum auf die Zimmer verteilt, größte zuerst; jedes Stück nur, wenn alles erreichbar bleibt.
  let kiste = null, kuehlschrank = null;
  if (safe) {
    const aus = ausgang ? { x: (ausgang.x + 0.5), y: (ausgang.y + 0.5) } : { x: (ix0 + ix1) / 2, y: (iy0 + iy1) / 2 };
    const rIdx = raeume.map((_, i) => i);
    const dist2 = r => { const dx = r.x + r.b / 2 - aus.x, dy = r.y + r.h / 2 - aus.y; return dx * dx + dy * dy; };
    let reihum = 0;
    const setzeSafe = (art, opt = {}) => {
      const reihe = opt.fern ? [...rIdx].sort((a, c) => dist2(raeume[c]) - dist2(raeume[a])) : rIdx.map((_, j) => rIdx[(reihum + j) % rIdx.length]);
      for (const ri of reihe) if (setze(ri, art, opt)) { if (!opt.fern) reihum = (rIdx.indexOf(ri) + 1) % rIdx.length; return true; }
      return false;
    };
    setzeSafe('funktisch'); setzeSafe('vorratskiste', { fern: aus }); setzeSafe('vorratsregal'); setzeSafe('feldbett'); setzeSafe('feldbett');
    setzeSafe('erstehilfe'); setzeSafe('safe_kuehlschrank'); setzeSafe('generator'); setzeSafe('kanister');
    const betten = Math.max(2, Math.min(6, Math.floor(flaecheM2 / 25))), regale = Math.max(2, Math.min(4, Math.floor(flaecheM2 / 40)));
    for (let i = 2; i < betten; i++) setzeSafe('feldbett');
    for (let i = 1; i < regale; i++) setzeSafe('vorratsregal');
    if (rng() < 0.7) setzeSafe('kanister');
    const mk = moebel.find(m => m.art === 'vorratskiste'), mc = moebel.find(m => m.art === 'safe_kuehlschrank');
    // ohne Kiste ist der Safe Room unbrauchbar: notfalls ein beliebiger freier Platz an der Wand
    if (mk) kiste = { x: (mk.x + mk.b / 2) * INNEN_Z, y: (mk.y + mk.h / 2) * INNEN_Z };
    if (mc) kuehlschrank = { x: (mc.x + mc.b / 2) * INNEN_Z, y: (mc.y + mc.h / 2) * INNEN_Z };
    if (!kiste) return null;   // ohne Vorratskiste ist der Safe Room unbrauchbar: im groben Raster bauen
  }

  // Regalreihen: aneinanderstoßende Ladenregal-Module (1 m) zu EINEM Behälter mit gemeinsamem Rechteck zusammenfassen, damit man
  // an jeder Stelle entlang des Regals durchsuchen kann (Abstand zählt bis zur Rechteck-Kante); teile = Zahl der Module (mehr Beute)
  {
    const gleich = (a, b) => Math.abs(a - b) < 0.01;
    let geaendert = true;
    while (geaendert) {
      geaendert = false;
      const laeden = behaelter.filter(q => q.art === 'laden' && q.rect);
      for (const a of laeden) {
        for (const c of laeden) {
          if (a === c) continue;
          const reihe = gleich(a.rect.y0, c.rect.y0) && gleich(a.rect.y1, c.rect.y1) && gleich(a.rect.x1, c.rect.x0)
            || gleich(a.rect.x0, c.rect.x0) && gleich(a.rect.x1, c.rect.x1) && gleich(a.rect.y1, c.rect.y0);
          if (!reihe) continue;
          a.rect = { x0: Math.min(a.rect.x0, c.rect.x0), y0: Math.min(a.rect.y0, c.rect.y0), x1: Math.max(a.rect.x1, c.rect.x1), y1: Math.max(a.rect.y1, c.rect.y1) };
          a.x = (a.rect.x0 + a.rect.x1) / 2; a.y = (a.rect.y0 + a.rect.y1) / 2;
          a.teile = (a.teile ?? 1) + (c.teile ?? 1);
          behaelter.splice(behaelter.indexOf(c), 1);
          geaendert = true;
          break;
        }
        if (geaendert) break;
      }
    }
  }

  // Türen verschließen (30 %, am Flur bleibt eine offen) und Belohnungstür der Behälter dahinter
  const amFlur = t => stock === 'eg' && t.zellen.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => raumAn(x + a, y + c) === flurIndex && k[idx(x + a, y + c)] === T.BODEN));
  let offeneAmFlur = tueren.filter(amFlur).length;
  for (const t of tueren) { if (safe) { t.offen = true; continue; } if (rng() >= 0.3) continue; if (amFlur(t)) { if (offeneAmFlur <= 1) continue; offeneAmFlur--; } t.verschlossen = true; }   // Safe Room: alle Türen offen
  for (const t of tueren) {
    if (!t.verschlossen) continue;
    const ns = new Set();
    for (const [x, y] of t.zellen) for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ri = raumAn(x + a, y + c); if (ri >= 0 && k[idx(x + a, y + c)] === T.BODEN && ri !== (stock === 'eg' ? flurIndex : -1)) ns.add(ri); }
    if (ns.size !== 1) continue;
    const r = raeume[[...ns][0]];
    for (const bh of behaelter) { const cx = Math.floor(bh.x / INNEN_Z), cy = Math.floor(bh.y / INNEN_Z); if (!bh.tuer && cx >= r.x && cx < r.x + r.b && cy >= r.y && cy < r.y + r.h) bh.tuer = [t.x, t.y]; }
  }

  // Sicherheitsnetz: Hallen-Regale u. ä. (ohne Erreichbarkeitsprüfung) dürfen den Start nicht zustellen -> nächste freie, mit der Haustür verbundene Zelle
  if (!freiFigur(startZ[0], startZ[1])) {
    const cands = [];
    for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (k[idx(x, y)] === T.BODEN && freiFigur(x, y)) cands.push([x, y, (x - startZ[0]) * (x - startZ[0]) + (y - startZ[1]) * (y - startZ[1])]);
    cands.sort((p, q) => p[2] - q[2] || p[1] - q[1] || p[0] - q[0]);
    for (const [x, y] of cands.slice(0, 40)) {
      const fl = erreichbar(x, y);
      if (!ausgang || ausgang.zellen.some(([zx, zy]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => fl[idx(zx + a, zy + c)]))) { start = zentrum(x, y); startZ[0] = x; startZ[1] = y; break; }
    }
  }

  // Zombieplätze: freie Zellen in Zimmern (nicht Flur), mit echtem Figurenradius passend
  const zombiePlaetze = [];
  if (!safe) raeume.forEach((r, ri) => {
    if (stock === 'eg' && ri === flurIndex) return;
    if (rng() >= 0.45) return;
    const kand = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.b; x++) if (k[idx(x, y)] === T.BODEN && freiFigur(x, y) && !nahTuer(x, y, 1, 1, 6)) kand.push([x, y]);
    if (kand.length) { const [x, y] = kand[Math.floor(rng() * kand.length)]; zombiePlaetze.push(zentrum(x, y)); }
  });

  return {
    seed, nr, stock, ox: 0, oy: 0, b: GB, h: GH, kacheln: k, hole, start, ausgang, hatKeller, hatDach, treppen, tueren,
    raeume: raeume.map((r, i) => ({ x: r.x, y: r.y, b: r.b, h: r.h, typ: typ[i] })), moebel, behaelter, zombiePlaetze,
    // Feinraster-Kennung: eigene Kachelgröße und Rastergröße, Figurenradius drinnen
    kachel: INNEN_Z, breite: GB, hoehe: GH, rs: R / 7, radMax: R, einrasten: 8, reich: INNEN_REICH,   // tempo drinnen: welt.mjs tempoVon() (einstellbar)
   
    grundriss: { b: g.breiteM, h: g.hoeheM, flaeche: flaecheM2 },
    kiste, kuehlschrank,
    // Zelle/Pixel des Innenraums → Weltpixel auf der Karte (für Missionsorte): Umkehrung der Drehung und Verschiebung aus grundriss()
    zuKarte: (px, py) => {
      const u = g.abb.u0 + (px / INNEN_Z - RAND) / ZM, v = g.abb.v0 + (py / INNEN_Z - RAND) / ZM;
      return [Math.round((u * g.abb.c - v * g.abb.s) * 8), Math.round((u * g.abb.s + v * g.abb.c) * 8)];
    },
  };
}

// Entscheidung je Haus (fein oder grob), damit alle Stockwerke eines Hauses im selben Raster liegen: Erdgeschoss, und wenn es Treppen nach unten/oben hat,
// auch Keller und Dachboden müssen sich bauen lassen (Größe, Erreichbarkeit). Gleiche Entscheidung auf Server und Client (alles deterministisch).
const ENTSCHEIDUNG = new WeakMap();
function bauen(seed, nr, stock, haus) {
  const safe = !!haus.safe, kat = safe ? '' : ladenArt(haus), halle = safe ? '' : grossArt(haus);
  return baueInnenFein(seed, nr, safe ? 'eg' : stock, haus, !!kat || !!halle, seiteVon(haus), safe, halle);
}
function feinMoeglich(seed, welt, nr, haus) {
  let m = ENTSCHEIDUNG.get(welt);
  if (!m) ENTSCHEIDUNG.set(welt, m = new Map());
  const key = seed + ':' + nr;
  if (m.has(key)) return m.get(key);
  let ok = false;
  const eg = bauen(seed, nr, 'eg', haus);
  if (eg) {
    ok = true;
    if (!haus.safe) for (const [st, hat] of [['keller', eg.hatKeller], ['dach', eg.hatDach]]) if (hat && !bauen(seed, nr, st, haus)) { ok = false; break; }
  }
  const e = { ok, eg: ok ? eg : null };   // das gebaute Erdgeschoss wird beim ersten Abruf wiederverwendet (kein zweites Bauen)
  m.set(key, e);
  return e;
}

// Einstieg wie innenraumFuer(): Läden mit Verkaufsraum, Haus ohne Umriss aus dem Hausrechteck; null = dieses Haus bleibt im groben Raster
export function innenraumFein(seed, welt, ebene, muster) {
  const m = muster.exec(ebene ?? '');
  if (!m) return null;
  const nr = Number(m[1]), haus = welt.haeuser[nr];
  if (!haus) return null;
  const e = feinMoeglich(seed, welt, nr, haus);
  if (!e.ok) return null;
  const safe = !!haus.safe, kat = safe ? '' : ladenArt(haus);
  let w;
  if (m[2] === 'eg' && e.eg) { w = e.eg; e.eg = null; } else w = bauen(seed, nr, m[2], haus);
  if (!w) return null;
  if (kat) { w.behaelter.forEach(b => { if (b.art === 'laden') b.art = 'laden_' + kat; }); w.moebel.forEach(q => { if (q.art === 'regal_lang') q.kat = kat; }); w.laden = kat; }
  if (!safe && !kat) { const hl = grossArt(haus); if (hl) w.halle = hl; }
  if (kat === 'lebensmittel' && grossArt(haus) === 'supermarkt') w.halle = 'supermarkt';
  w.ebene = ebene; w.nr = nr; w.stock = m[2];
  w.behaelter = w.behaelter.map(b => ({ ...b, id: ebene + ':' + b.id }));
  if (safe) { w.safe = haus.safeId; w.safeName = haus.safe; w.zombiePlaetze = []; w.hatKeller = false; w.hatDach = false; for (const t of w.tueren) { t.verschlossen = false; t.offen = true; } }
  return w;
}
