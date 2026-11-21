// Bundeswehr-Stützpunkt (Teil 1: Aufbau und Grafik): je Karte genau einer, deterministisch aus Karte + Seed.
// Server und Client bauen dasselbe (osmwelt.mjs ruft baueStuetzpunkt am Ende auf, ohne den gemeinsamen Zufall zu berühren).
//
// welt.stuetzpunkt = { x, y, b, h (Kacheln, Weltachsen), richtung ('n'|'s'|'o'|'w' = Front zur Stadt), winkel (Drehung des
//   Bauplans, Bogenmaß), teile: [...], sperren: [...], behaelter: [ids] }
// Der Plan wird in einem eigenen Rahmen (u nach rechts, v von der Front nach hinten, Kacheln) entworfen und gedreht.
// Jedes Teil hat Mittelpunkt x, y (Pixel) und art; Rechteckteile zusätzlich w, d (Breite quer/Tiefe im Rahmen, Pixel),
// winkel (Drehung des Rahmens) sowie b, h (Ausdehnung in Weltachsen). Blickrichtungen (blick) sind Weltwinkel im Bogenmaß.
import { KACHEL, BREITE, HOEHE, T, FEIN, FEIN_PX, zufall, findeWeg } from './welt.mjs';
import { zeichneSafeMoebel } from './safe_moebel.mjs';

const K = KACHEL, TAU = Math.PI * 2;
export const PUMA_SKALA = 1.6;   // Puma (Wanne und Turm) wird so viel größer gezeichnet als die Bauplan-Maße
export const SP_BREITE = 30, SP_TIEFE = 22;   // Kacheln im Bauplan (quer zur Front, von der Front nach hinten)
const WINKEL = { n: 0, o: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 };
const hash = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ======================================================================================================================
// Aufbau
// ======================================================================================================================

// Bauplan-Rahmen: u (quer, nach rechts von der Stadtseite aus gesehen), v (Tiefe von der Front nach hinten), Kacheln → Pixel
export function rahmen(x0, y0, b, h, richtung) {
  const th = WINKEL[richtung], c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  const ox = (richtung === 'n' || richtung === 'w' ? x0 : x0 + b) * K, oy = (richtung === 'n' || richtung === 'o' ? y0 : y0 + h) * K;
  const ort = (u, v) => [ox + (u * c - v * s) * K, oy + (u * s + v * c) * K];
  return { th, c, s, ort };
}

function platzSuchen(welt, start) {
  const fb = BREITE * FEIN, f = welt.fein;
  const hindernisse = [];   // [x, y, Spielraum in Pixel]
  for (const b of welt.behaelter) hindernisse.push([b.x, b.y, b.art === 'bus' ? 90 : 40]);
  for (const g of welt.muell?.tonnen ?? []) hindernisse.push([g.x, g.y, 30]);
  for (const sp of welt.sperren ?? []) hindernisse.push([sp.x, sp.y, 70]);
  for (const bu of welt.parkbuchten ?? []) hindernisse.push([bu.x, bu.y, (bu.laenge ?? 100) / 2 + 30]);
  for (const d of welt.deko ?? []) if (d.art !== 'busch') hindernisse.push([d.x, d.y, 60]);
  for (const h of welt.haeuser) if (h.tuer) hindernisse.push([(h.tuer.x + 0.5 + h.raus.dx) * K, (h.tuer.y + 0.5 + h.raus.dy) * K, 50]);
  for (const [cx, cy, r] of welt.freihalten ?? []) hindernisse.push([(cx + 0.5) * K, (cy + 0.5) * K, r * K]);   // feste Level-Orte (Heliplatz, Bunkertor)
  hindernisse.push([start.x, start.y, 10 * K], [(welt.tor.x + 0.5) * K, (welt.tor.y + 0.5) * K, 6 * K]);
  const NUR = new Set([T.WIESE, T.BAUM, T.PLATZ]);
  const RAND_NEIN = new Set([T.WAND, T.WASSER, T.ZAUN, T.TOR, T.LEER, T.TUER, T.DEKO]);
  const sx = start.x / K, sy = start.y / K;
  const treffer = [];
  for (const [bb, hh, ausrichtung] of [[SP_BREITE, SP_TIEFE, 'ns'], [SP_TIEFE, SP_BREITE, 'ow']]) {
    for (let y0 = 1; y0 + hh < HOEHE - 1; y0 += 2) for (let x0 = 1; x0 + bb < BREITE - 1; x0 += 2) {
      const cx = x0 + bb / 2, cy = y0 + hh / 2, dx = sx - cx, dy = sy - cy;
      if ((ausrichtung === 'ns') !== (Math.abs(dy) >= Math.abs(dx))) continue;
      const richtung = ausrichtung === 'ns' ? (dy > 0 ? 's' : 'n') : (dx > 0 ? 'o' : 'w');
      let ok = true;
      for (let y = y0 - 1; y <= y0 + hh && ok; y++) for (let x = x0 - 1; x <= x0 + bb; x++) {
        const t = welt.hole(x, y), innen = x >= x0 && x < x0 + bb && y >= y0 && y < y0 + hh;
        if (innen ? !NUR.has(t) : RAND_NEIN.has(t)) { ok = false; break; }
      }
      if (!ok) continue;
      const px0 = x0 * K - 48, px1 = (x0 + bb) * K + 48, py0 = y0 * K - 48, py1 = (y0 + hh) * K + 48;
      if (hindernisse.some(([x, y, m]) => x > px0 - m && x < px1 + m && y > py0 - m && y < py1 + m)) continue;
      for (let fy = y0 * FEIN; fy < (y0 + hh) * FEIN && ok; fy++) for (let fx = x0 * FEIN; fx < (x0 + bb) * FEIN; fx++) if (f[fy * fb + fx]) { ok = false; break; }
      if (!ok) continue;
      // Straßen an der Frontseite (Einfallstraße) zählen, Nähe zum Start belohnen
      let strasse = 0;
      const quer = richtung === 'n' || richtung === 's';
      for (let i = 0; i < (quer ? bb : hh); i++) for (let j = 1; j <= 4; j++) {
        const x = quer ? x0 + i : richtung === 'o' ? x0 + bb - 1 + j : x0 - j;
        const y = !quer ? y0 + i : richtung === 's' ? y0 + hh - 1 + j : y0 - j;
        if (welt.hole(x, y) === T.STRASSE) strasse++;
      }
      let baeume = 0;   // jeder Baum im Baufeld wird gefällt: lieber freie Fläche (die Waldmenge der Karte soll bleiben)
      for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + bb; x++) if (welt.hole(x, y) === T.BAUM) baeume++;
      treffer.push({ x0, y0, b: bb, h: hh, richtung, baeume, wert: Math.min(strasse, 60) * 2 - baeume * 0.8 - Math.max(0, Math.hypot(dx, dy) - 40) * 0.2 });
    }
  }
  treffer.sort((a, c) => c.wert - a.wert || a.y0 - c.y0 || a.x0 - c.x0);
  for (const t of treffer.slice(0, 20)) {
    const r = rahmen(t.x0, t.y0, t.b, t.h, t.richtung), [ax, ay] = r.ort(15.5, -0.5);
    if (findeWeg(welt, start.x, start.y, ax, ay, 11, 200000)) return t;
  }
  return null;
}

// setze(x, y, typ) schreibt ins grobe Raster (nur zum Entfernen von Bäumen im Baufeld)
export function baueStuetzpunkt(welt, seed, setze, lageVorgabe = null) {   // lageVorgabe { x0, y0, b, h, richtung }: fester Platz (Schießstand)
  welt.stuetzpunkt = null;
  if (!welt.fein) return;
  const lage = lageVorgabe ?? platzSuchen(welt, welt.start);
  if (!lage) return;
  const { x0, y0, b, h, richtung } = lage;
  const { th, c, s, ort } = rahmen(x0, y0, b, h, richtung);
  void seed; void zufall;
  const teile = [], sperren = [], behaelter = [];

  // Bäume und Büsche im Baufeld weg (Kronen würden sonst über dem Lager liegen)
  let entfernt = 0;
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + b; x++) if (welt.hole(x, y) === T.BAUM) { setze(x, y, T.WIESE); entfernt++; }
  welt.deko = welt.deko.filter(d => !(d.art === 'busch' && d.x > (x0 - 1) * K && d.x < (x0 + b + 1) * K && d.y > (y0 - 1) * K && d.y < (y0 + h + 1) * K));

  // Rahmenkoordinate (Pixel, relativ zur Mitte cx, cy) → Welt
  const fw = (cx, cy) => (fx, fy) => [cx + fx * c - fy * s, cy + fx * s + fy * c];
  const sperre = (cx, cy, fx0, fy0, fx1, fy1) => {
    const w = fw(cx, cy), p = w(fx0, fy0), q = w(fx1, fy1);
    sperren.push({ x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) });
  };
  const blickVorn = th - Math.PI / 2;   // Blick zur Stadt (Richtung −v)
  // Rechteckteil in Rahmenkoordinaten (Kacheln)
  const teil = (art, u0, v0, u1, v1, extra = {}) => {
    const [x, y] = ort((u0 + u1) / 2, (v0 + v1) / 2), w = (u1 - u0) * K, d = (v1 - v0) * K;
    const t = { art, x, y, w, d, winkel: th, b: c ? w : d, h: c ? d : w, ...extra };
    teile.push(t); return t;
  };
  const posten = (rolle, u, v, blick = blickVorn, extra = {}) => { const [x, y] = ort(u, v); teile.push({ art: 'posten', rolle, x, y, blick, ...extra }); };
  const behaelterNeu = (art, u, v) => {
    const [x, y] = ort(u, v);
    behaelter.push({ id: 'bw' + behaelter.length, art, x, y, winkel: th });
    return [x, y];
  };

  // ---- (a) Flandernzaun rundum (Holzböcke mit Stacheldraht) mit Tor (3 Kacheln), S-Draht-Rollen vor dem Tor und hinter dem Lager ----
  // Der Zaun steht im Feinraster als Wert 4: Spieler kommen nicht durch, Zombies waten stark gebremst hindurch (tierGelaende, FLANDERN_TEMPO).
  const DU0 = 14, DU1 = 17, ZV = 1.5, ZH = 21.9, ZU0 = 0.5, ZU1 = SP_BREITE - 0.5, ZD = 0.3;
  const zaun = [];
  for (const [u0, v0, u1, v1] of [
    [ZU0 - ZD / 2, ZV - ZD / 2, DU0, ZV + ZD / 2], [DU1, ZV - ZD / 2, ZU1 + ZD / 2, ZV + ZD / 2],   // Front links und rechts vom Tor
    [ZU0 - ZD / 2, ZV - ZD / 2, ZU0 + ZD / 2, ZH + ZD / 2], [ZU1 - ZD / 2, ZV - ZD / 2, ZU1 + ZD / 2, ZH + ZD / 2],   // Seiten
    [ZU0 - ZD / 2, ZH - ZD / 2, ZU1 + ZD / 2, ZH + ZD / 2],   // Rückseite
  ]) {
    const t = teil('flandern', u0, v0, u1, v1);
    zaun.push({ x0: t.x - t.b / 2, y0: t.y - t.h / 2, x1: t.x + t.b / 2, y1: t.y + t.h / 2 });
  }
  // S-Draht-Rollen (je 0,4 Kachel tief, im Feinraster fest): 2 + 3 vor dem Tor links/rechts, 1 hinter dem Lager außerhalb des Zauns
  for (const [u0, u1, v] of [[4.5, 12.5, 0.35], [18.5, 26.5, 0.35], [3, 27, 22.5]]) {
    const t = teil('sdraht', u0, v - 0.2, u1, v + 0.2);
    sperre(t.x, t.y, -t.w / 2, -t.d / 2, t.w / 2, t.d / 2);
  }
  {
    const [x, y] = ort((DU0 + DU1) / 2, 1.5), w = (DU1 - DU0) * K;
    teile.push({ art: 'durchfahrt', x, y, w, d: K, winkel: th, b: c ? w : K, h: c ? K : w, aussen: ort((DU0 + DU1) / 2, -0.5), innen: ort((DU0 + DU1) / 2, 4.5) });
  }
  {   // Puma: Wanne 72 × 34 px, Bug zur Stadt (−v); der Turm ist ein eigenes Teil (Mittelpunkt, Ausrichtung, Rohrlänge)
    // Ruheplatz in der Lagermitte; danach fährt er frei im Innenbereich (server/stuetzpunkt.mjs, fahrFlaeche), deshalb keine Sperre im Feinraster
    const L = 72, Bw = 34, [x, y] = ort(...PUMA_PARK);
    teile.push({ art: 'puma', x, y, winkel: blickVorn, laenge: L, breite: Bw, b: c ? Bw : L, h: c ? L : Bw, turm: { x, y, winkel: blickVorn, rohr: 44 } });
  }
  // ---- (b) Sandsackstellungen (U) und MG-Nester hinter der Sperrlinie ----
  for (const [u, v] of [[10.5, 4.0], [19.5, 4.0]]) {
    const t = teil('sandsack', u - 1.5, v - 0.75, u + 1.5, v + 0.75, { offen: 'vorn' });
    for (const rc of sandsackWaende(t.w, t.d)) sperre(t.x, t.y, ...rc);
    posten('soldat', u, v - 0.1);
  }
  for (const [u, v] of [[4.5, 4.3], [25.5, 4.3], [27.2, 7.0]]) {
    const [x, y] = ort(u, v);
    teile.push({ art: 'mgnest', x, y, r: 23, blick: blickVorn, winkel: th });
    sperren.push({ x, y, r: 22 });
  }
  posten('soldat', 13.4, 4.4); posten('soldat', 17.6, 4.4);   // hinter der Pumabahn (v 1,75–3,45)

  // ---- Zelte: Rechteck in Rahmenkoordinaten (Kacheln), Wände außen ums Innere, Eingang in einer Wand ----
  const zelt = (art, nutzung, u0, v0, u1, v1, seite, von, bis) => {
    const t = teil(art, u0, v0, u1, v1, { nutzung });
    const achseU = seite === 'v0' || seite === 'v1', mitte = achseU ? (u0 + u1) / 2 : (v0 + v1) / 2;
    const g0 = (von - mitte) * K, g1 = (bis - mitte) * K;
    const w = fw(t.x, t.y), hw = t.w / 2, hd = t.d / 2, m = (g0 + g1) / 2;
    const nx = seite === 'u1' ? 1 : seite === 'u0' ? -1 : 0, ny = seite === 'v1' ? 1 : seite === 'v0' ? -1 : 0;
    const pm = achseU ? [m, ny * hd] : [nx * hw, m];
    t.eingang = { seite, von: g0, bis: g1, mitte: w(...pm), aussen: w(pm[0] + nx * K, pm[1] + ny * K), innen: w(pm[0] - nx * K, pm[1] - ny * K) };
    for (const rc of zeltBaender(t.w, t.d, t.eingang)) sperre(t.x, t.y, ...rc);
    return t;
  };
  // ---- (c) Sanitätsstation: Zelt mit Feldbetten, Verwundeten, Ärzten, Sanikisten ----
  // (um DV nach hinten gerückt: zwischen Sandsäcken und Zelten bleibt eine breite Fahrgasse für den Puma, v ≈ 6–8)
  const DV = 1.5;
  {
    const z = zelt('sanizelt', 'sani', 3, 8 + DV, 12, 14 + DV, 'u1', 10 + DV, 12 + DV);
    const betten = [];
    for (const bv of [8.4 + DV, 11.6 + DV]) for (const bu of [3.5, 5, 6.5]) {
      const t = teil('feldbett', bu, bv, bu + 1, bv + 2);
      sperre(t.x, t.y, -t.w / 2, -t.d / 2, t.w / 2, t.d / 2);
      betten.push(t);
    }
    // Verwundete liegen auf vier Betten, Kopf zum Kissen (zur Front); (x, y) = Kopfmitte
    for (const i of [0, 1, 4, 5]) {
      const [x, y] = fw(betten[i].x, betten[i].y)(0, -19);
      teile.push({ art: 'posten', rolle: 'verwundet', x, y, blick: blickVorn, variante: i });
    }
    posten('arzt', 9.2, 9.7 + DV, th + Math.PI); posten('arzt', 9.2, 12.9 + DV, th + Math.PI);
    for (const [u, v] of [[10.5, 9.0 + DV], [10.5, 13.0 + DV]]) {
      const [x, y] = behaelterNeu('sanikiste', u, v);
      sperren.push({ x0: x - 10, y0: y - 10, x1: x + 10, y1: y + 10 });
    }
    z.kreuz = ort(9.8, 11 + DV);   // weißes Feld mit rotem Kreuz auf dem Zeltboden
    const [fx, fy] = ort(12.9, 9.3 + DV);
    teile.push({ art: 'flagge', x: fx, y: fy, winkel: th });
  }
  // ---- Funkzelt mit Antenne ----
  {
    const z = zelt('funkzelt', 'funk', 19, 8 + DV, 25, 12 + DV, 'u0', 9 + DV, 11 + DV);
    const [tx, ty] = ort(23.5, 11.0 + DV);
    teile.push({ art: 'funktisch', x: tx, y: ty, w: 2 * K, d: K, winkel: th, b: c ? 2 * K : K, h: c ? K : 2 * K });
    sperre(tx, ty, -K, -K / 2, K, K / 2);
    z.funkpunkt = ort(23.5, 9.8 + DV);       // hier steht man zum Funken (Teil 2)
    const [ax, ay] = ort(25.9, 8.6 + DV);
    teile.push({ art: 'antenne', x: ax, y: ay });
    sperren.push({ x: ax, y: ay, r: 5 });
    posten('soldat', 21.5, 9.6 + DV, th);
  }
  // ---- (d) Lager: zwei Zelte, Munitionskisten, Container, LKW ----
  zelt('zelt', 'lager', 3, 17.5, 9, 21.5, 'v0', 5, 7);
  zelt('zelt', 'lager', 22, 17.5, 28, 21.5, 'v0', 24, 26);
  {
    const [x, y] = ort(13.9, 19.4), L = 84, Bw = 36;   // LKW parkt quer, Bug nach „links“ (−u)
    teile.push({ art: 'lkw', x, y, winkel: th + Math.PI, laenge: L, breite: Bw, b: c ? L : Bw, h: c ? Bw : L });
    sperre(x, y, -L / 2, -Bw / 2, L / 2, Bw / 2);
  }
  {
    const [x, y] = behaelterNeu('bw_container', 18.6, 19.5);
    teile.push({ art: 'container', x, y, w: 2 * K, d: K, winkel: th, b: c ? 2 * K : K, h: c ? K : 2 * K });
    sperre(x, y, -K, -K / 2, K, K / 2);
  }
  for (const [u, v] of [[10.4, 16.8], [11.3, 16.8], [20.0, 16.8], [20.9, 16.8], [17.0, 15.0]]) {
    const [x, y] = behaelterNeu('bw_kiste', u, v);
    teile.push({ art: 'kiste', x, y, w: 22, d: 15, winkel: th, b: c ? 22 : 15, h: c ? 15 : 22 });
    sperre(x, y, -11, -7.5, 11, 7.5);
  }
  // vier Vorratskisten des Lagers (Safe House, gemeinsame Kisten wie im Safe Room: state.safes 'lager0'…'lager3'; Munition darf hinein)
  [[11.0, 21.2], [12.0, 21.2], [13.0, 21.2], [14.0, 21.2]].forEach(([u, v], i) => {
    const [x, y] = ort(u, v);
    teile.push({ art: 'vorratskiste', id: 'lager' + i, x, y, w: 26, d: 18, winkel: th, b: c ? 26 : 18, h: c ? 18 : 26 });
    sperre(x, y, -13, -9, 13, 9);
  });
  for (const [u, v] of [[12.7, 16.1], [20.5, 14.9], [15.8, 16.0], [9.8, 19.0], [21.0, 20.2]]) posten('soldat', u, v);

  // ---- Feinraster: alle Hindernisse eintragen ----
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, f = welt.fein, m = 1;   // Zellmitte darf 1 px daneben liegen (dünne Dinge)
  for (const sp of sperren) {
    const ax0 = sp.r ? sp.x - sp.r : sp.x0, ax1 = sp.r ? sp.x + sp.r : sp.x1, ay0 = sp.r ? sp.y - sp.r : sp.y0, ay1 = sp.r ? sp.y + sp.r : sp.y1;
    for (let fy = Math.max(0, Math.floor((ay0 - m) / FEIN_PX)); fy <= Math.min(fh - 1, Math.floor((ay1 + m) / FEIN_PX)); fy++) {
      for (let fx = Math.max(0, Math.floor((ax0 - m) / FEIN_PX)); fx <= Math.min(fb - 1, Math.floor((ax1 + m) / FEIN_PX)); fx++) {
        const px = (fx + 0.5) * FEIN_PX, py = (fy + 0.5) * FEIN_PX;
        if (sp.r ? Math.hypot(px - sp.x, py - sp.y) <= sp.r + m : px >= ax0 - m && px <= ax1 + m && py >= ay0 - m && py <= ay1 + m) f[fy * fb + fx] = 1;
      }
    }
  }
  for (const z of zaun) {   // Flandernzaun: Wert 4 (nur wo noch frei)
    for (let fy = Math.max(0, Math.floor(z.y0 / FEIN_PX)); fy <= Math.min(fh - 1, Math.floor((z.y1 - 0.01) / FEIN_PX)); fy++) {
      for (let fx = Math.max(0, Math.floor(z.x0 / FEIN_PX)); fx <= Math.min(fb - 1, Math.floor((z.x1 - 0.01) / FEIN_PX)); fx++) if (!f[fy * fb + fx]) f[fy * fb + fx] = 4;
    }
  }
  for (const bh of behaelter) welt.behaelter.push(bh);
  // Ersatz für die gefällten Bäume: an Waldrändern und in Baumgruppen der Karte (nicht nahe dem Baufeld), damit die Waldmenge gleich bleibt
  if (entfernt) {
    const tueren = welt.haeuser.filter(q => q.tuer).map(q => [q.tuer.x + q.raus.dx, q.tuer.y + q.raus.dy]);
    const kand = [];
    for (let y = 2; y < HOEHE - 2; y++) for (let x = 2; x < BREITE - 2; x++) {
      if (welt.hole(x, y) !== T.WIESE || (x >= x0 - 4 && x < x0 + b + 4 && y >= y0 - 4 && y < y0 + h + 4)) continue;
      let nb = 0, bad = false;
      for (let dy = -1; dy <= 1 && !bad; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = welt.hole(x + dx, y + dy);
        if (t === T.BAUM) nb++; else if (dx * dy === 0 && t !== T.WIESE) { bad = true; break; }
      }
      if (!bad && nb >= 2) kand.push([x, y, hash(x * 7 + 3, y * 13 + 5)]);
    }
    kand.sort((p, q) => p[2] - q[2]);
    const fb = BREITE * FEIN;
    for (const [x, y] of kand) {
      if (!entfernt) break;
      const cx = (x + 0.5) * K, cy = (y + 0.5) * K;
      if (tueren.some(([a, c]) => Math.abs(a - x) <= 2 && Math.abs(c - y) <= 2)) continue;
      if (welt.behaelter.some(q => Math.hypot(q.x - cx, q.y - cy) < 2 * K) || welt.sperren.some(q => Math.hypot(q.x - cx, q.y - cy) < 3 * K)) continue;
      if (welt.parkbuchten.some(q => Math.hypot(q.x - cx, q.y - cy) < (q.laenge ?? 100) / 2 + 24)) continue;
      if (welt.deko.some(q => Math.hypot(q.x - cx, q.y - cy) < K * 1.5) || Math.hypot(cx - welt.start.x, cy - welt.start.y) < 4 * K) continue;
      if (welt.fein[(y * FEIN + 2) * fb + x * FEIN + 2]) continue;
      setze(x, y, T.BAUM); entfernt--;
    }
  }
  welt.stuetzpunkt = { x: x0, y: y0, b, h, richtung, winkel: th, teile, sperren, zaun, behaelter: behaelter.map(q => q.id) };
}

// Wandrechtecke der U-förmigen Sandsackstellung (Rahmen um die Mitte, Öffnung nach vorn = −y)
function sandsackWaende(w, d) {
  const D = 12;
  return [[-w / 2, -d / 2, -w / 2 + D, d / 2], [w / 2 - D, -d / 2, w / 2, d / 2], [-w / 2, d / 2 - D, w / 2, d / 2]];
}
// Zeltwände (8 px dick) außen um das Innere w × d; eingang = Lücke in einer Wand (von/bis in Pixel relativ zur Mitte)
function zeltBaender(w, d, eingang) {
  const hw = w / 2, hd = d / 2, W = 8;
  const seite = (name, x0, y0, x1, y1, achse) => {
    if (eingang?.seite !== name) return [[x0, y0, x1, y1]];
    const a0 = achse === 'x' ? x0 : y0, a1 = achse === 'x' ? x1 : y1, g0 = Math.max(a0, eingang.von), g1 = Math.min(a1, eingang.bis), aus = [];
    if (g0 > a0) aus.push(achse === 'x' ? [a0, y0, g0, y1] : [x0, a0, x1, g0]);
    if (g1 < a1) aus.push(achse === 'x' ? [g1, y0, a1, y1] : [x0, g1, x1, a1]);
    return aus;
  };
  return [...seite('v0', -hw - W, -hd - W, hw + W, -hd, 'x'), ...seite('v1', -hw - W, hd, hw + W, hd + W, 'x'),
    ...seite('u0', -hw - W, -hd, -hw, hd, 'y'), ...seite('u1', hw, -hd, hw + W, hd, 'y')];
}


// ======================================================================================================================
// Verhalten (Teil 2): gemeinsame Hilfen für Server und Client (Handelspartner, Sicht, Lage im Bauplan)
// ======================================================================================================================

// Weltpunkt → Bauplan-Koordinaten (Kacheln): u quer nach rechts, v von der Front nach hinten
export function planKoord(sp, x, y) {
  const r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung), [ox, oy] = r.ort(0, 0);
  const dx = (x - ox) / K, dy = (y - oy) / K;
  return { u: dx * r.c + dy * r.s, v: -dx * r.s + dy * r.c };
}
// Hinter der Sperrlinie (im Lager)? Die Front (Draht) liegt bei v ≈ 1,5.
export function imLager(sp, x, y) {
  const { u, v } = planKoord(sp, x, y);
  return u >= 0 && u <= SP_BREITE && v >= 2 && v <= SP_TIEFE;
}

// ---------- Fahrfläche des Puma ----------
// Der Puma fährt frei im Innenbereich des Lagers. Seine Mitte darf nur dort stehen, wo ein Kreis vom Radius PUMA_R (deckt die
// Wanne in jeder Drehung ab: 115 × 54 px) kein festes Teil berührt: Draht, Sandsäcke, MG-Nester, Zelte (auch innen), Betten, Kisten,
// Container, LKW, Antenne, Posten sowie die Einfahrt (Durchfahrt bis v 4,5 und 3 Kacheln seitlich: dort treten Spieler ein).
// Raster in Bauplan-Koordinaten (u, v in Kacheln), Knoten alle 0,5 Kacheln; frei[j * nu + i] = 1: Knoten darf befahren werden.
export const PUMA_R = 62;                 // Pixel
export const FAHR_SCHRITT = 0.5;          // Kacheln
export const PUMA_PARK = [15.5, 9.0];     // Ruheplatz: Lagermitte hinter der Einfahrt
const fahrCache = new WeakMap();
export function fahrFlaeche(sp) {
  let f = fahrCache.get(sp);
  if (f) return f;
  const r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung), [ox, oy] = r.ort(0, 0);
  const plan = (x, y) => { const dx = (x - ox) / K, dy = (y - oy) / K; return [dx * r.c + dy * r.s, -dx * r.s + dy * r.c]; };
  const rects = [], kreise = [];   // Rechteck [u0, v0, u1, v1], Kreis [u, v, Radius] in Kacheln
  for (const q of sp.sperren) {
    if (q.r) { const [u, v] = plan(q.x, q.y); kreise.push([u, v, q.r / K]); continue; }
    const [a, b] = plan(q.x0, q.y0), [c, d] = plan(q.x1, q.y1);
    rects.push([Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]);
  }
  for (const t of sp.teile) {
    if (t.art === 'sanizelt' || t.art === 'zelt' || t.art === 'funkzelt') {   // Zeltinneres und Wände
      const [u, v] = plan(t.x, t.y); rects.push([u - t.w / K / 2 - 0.17, v - t.d / K / 2 - 0.17, u + t.w / K / 2 + 0.17, v + t.d / K / 2 + 0.17]);
    } else if (t.art === 'posten') { const [u, v] = plan(t.x, t.y); kreise.push([u, v, 14 / K]); }
  }
  rects.push([12.5, 0, 18.5, 4.5]);   // Einfahrt
  const nu = Math.round(SP_BREITE / FAHR_SCHRITT) + 1, nv = Math.round(SP_TIEFE / FAHR_SCHRITT) + 1, rk = PUMA_R / K;
  const abstand = (u, v) => {   // Abstand (Kacheln) zum nächsten Hindernis, negativ nicht nötig
    let m = Infinity;
    for (const [u0, v0, u1, v1] of rects) m = Math.min(m, Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1)));
    for (const [cu, cv, cr] of kreise) m = Math.min(m, Math.hypot(u - cu, v - cv) - cr);
    return m;
  };
  const ok = (u, v) => u >= rk && u <= SP_BREITE - rk && v >= rk && v <= SP_TIEFE - rk && abstand(u, v) > rk;
  const frei = new Uint8Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) frei[j * nu + i] = ok(i * FAHR_SCHRITT, j * FAHR_SCHRITT) ? 1 : 0;
  // Strecke frei befahrbar? (abgetastet alle 0,2 Kacheln)
  const strecke = (u0, v0, u1, v1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / 0.2));
    for (let k = 0; k <= n; k++) if (!ok(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n)) return false;
    return true;
  };
  f = { frei, nu, nv, ok, strecke, r };
  fahrCache.set(sp, f);
  return f;
}

// Händler: die beiden Ärzte und die Soldaten im Lager (v ≥ 8: nicht die Wachen an Draht und Sandsäcken, nicht die MG-Nester)
const handelsCache = new WeakMap();
export function handelsleute(sp) {
  let l = handelsCache.get(sp);
  if (!l) {
    l = [];
    for (const t of sp.teile) {
      if (t.art !== 'posten') continue;
      if (t.rolle === 'arzt') l.push({ wer: 'arzt', x: t.x, y: t.y });
      else if (t.rolle === 'soldat' && planKoord(sp, t.x, t.y).v >= 8) l.push({ wer: 'soldat', x: t.x, y: t.y });
    }
    handelsCache.set(sp, l);
  }
  return l;
}
// nächster Handelspartner der gesuchten Art (oder irgendeiner) innerhalb des Abstands, sonst null
export function handelPartner(sp, x, y, abstand, wer = null) {
  if (!sp) return null;
  let best = null, bd = abstand;
  for (const h of handelsleute(sp)) {
    if (wer && h.wer !== wer) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

// Trifft die Strecke eine Zeltwand? (Zelte sind die einzigen Wände im Lager; Draht, Sandsäcke und Fahrzeuge lassen Schüsse durch)
export function zeltWandImWeg(sp, x1, y1, x2, y2) {
  for (const t of sp.teile) {
    if (t.art !== 'sanizelt' && t.art !== 'zelt' && t.art !== 'funkzelt') continue;
    const co = Math.round(Math.cos(t.winkel)), si = Math.round(Math.sin(t.winkel));
    const lok = (x, y) => [(x - t.x) * co + (y - t.y) * si, -(x - t.x) * si + (y - t.y) * co];
    const [ax, ay] = lok(x1, y1), [bx, by] = lok(x2, y2);
    for (const [r0, s0, r1, s1] of zeltBaender(t.w, t.d, t.eingang)) {
      let a = 0, b = 1;
      const dx = bx - ax, dy = by - ay;
      let treffer = true;
      for (const [p0, d, lo, hi] of [[ax, dx, r0, r1], [ay, dy, s0, s1]]) {
        if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) { treffer = false; break; } continue; }
        let ta = (lo - p0) / d, tb = (hi - p0) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        a = Math.max(a, ta); b = Math.min(b, tb);
        if (a > b) { treffer = false; break; }
      }
      if (treffer) return true;
    }
  }
  return false;
}

// ======================================================================================================================
// Zeichnen (Canvas 2D, von oben). Alle Funktionen zeichnen nur, was im rect (Kacheln) liegt; ctx ist schon um −rect·KACHEL verschoben.
// ======================================================================================================================
const OLIV = '#4b5320';
function sichtbar(t, rect, rand = 60) {
  const hb = (t.b ?? t.laenge ?? 60) / 2 + rand, hh = (t.h ?? t.laenge ?? 60) / 2 + rand;
  return t.x + hb > rect.x0 * K && t.x - hb < rect.x1 * K && t.y + hh > rect.y0 * K && t.y - hh < rect.y1 * K;
}
function rundRechteck(ctx, f, x, y, b, h, rad = 2) { ctx.fillStyle = f; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, b, h, rad); else ctx.rect(x, y, b, h); ctx.fill(); }
function mitRahmen(ctx, t, fn) { ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.winkel ?? 0); fn(); ctx.restore(); }

// Flecktarn-Flecken in der Fläche (im aktuellen Clip), deterministisch nach Saat
function tarnFlecken(ctx, x0, y0, x1, y1, saat, dichte = 1) {
  const farben = ['#3b4a26', '#6a5032', '#25271b', '#7d8650', '#58682f'];
  const n = Math.round(((x1 - x0) * (y1 - y0)) / 160 * dichte);
  for (let i = 0; i < n; i++) {
    const a = hash(saat, i * 2), b = hash(saat + 7, i * 2 + 1), k = hash(saat + 13, i);
    ctx.fillStyle = farben[Math.floor(k * 5)];
    ctx.beginPath(); ctx.ellipse(x0 + a * (x1 - x0), y0 + b * (y1 - y0), 2.5 + k * 4.5, 1.8 + hash(saat, i + 99) * 3.5, hash(saat, i + 5) * TAU, 0, TAU); ctx.fill();
  }
}

// ---------------- Bodenebene: Platz, Zeltböden, Betten, Nestböden ----------------
export function zeichneStuetzpunktBoden(ctx, welt, rect) {
  const sp = welt.stuetzpunkt;
  if (!sp) return;
  const bx0 = sp.x * K, by0 = sp.y * K, bx1 = (sp.x + sp.b) * K, by1 = (sp.y + sp.h) * K;
  if (bx1 + 40 < rect.x0 * K || bx0 - 40 > rect.x1 * K || by1 + 40 < rect.y0 * K || by0 - 40 > rect.y1 * K) return;
  // festgefahrener Boden: Zellen von 8 px, zum Rand hin lückenhafter
  const Z = 8, nx = sp.b * K / Z, ny = sp.h * K / Z, cols = ['#8b7b55', '#80714e', '#94855e', '#76694a'];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const px = bx0 + i * Z, py = by0 + j * Z;
    if (px + Z < rect.x0 * K || px > rect.x1 * K || py + Z < rect.y0 * K || py > rect.y1 * K) continue;
    const rd = Math.min(i, j, nx - 1 - i, ny - 1 - j);
    if (hash(i + sp.x * 131, j + sp.y * 71) > Math.min(1, 0.25 + rd / 5)) continue;
    ctx.globalAlpha = Math.min(0.92, 0.35 + rd / 6);
    ctx.fillStyle = cols[Math.floor(hash(i * 3 + sp.x, j * 5 + sp.y) * 4)];
    ctx.fillRect(px, py, Z, Z);
  }
  ctx.globalAlpha = 1;
  for (const t of sp.teile) {
    if (!sichtbar(t, rect, 80)) continue;
    if (t.art === 'sanizelt' || t.art === 'zelt' || t.art === 'funkzelt') zeltBoden(ctx, t);
    else if (t.art === 'feldbett' || t.art === 'funktisch') mitRahmen(ctx, t, () => zeichneSafeMoebel(ctx, { art: t.art, x: -t.w / 2 / K, y: -t.d / 2 / K, b: t.w / K, h: t.d / K }, K));
    else if (t.art === 'mgnest') {   // Sandboden im Nest (unter dem Soldaten)
      ctx.fillStyle = '#a08c5c'; ctx.beginPath(); ctx.arc(t.x, t.y, 17, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(t.x, t.y, 17, 0.2, Math.PI - 0.2); ctx.fill();
    }
  }
}

function zeltBoden(ctx, t) {
  mitRahmen(ctx, t, () => {
    const hw = t.w / 2, hd = t.d / 2;
    rundRechteck(ctx, '#6e7342', -hw, -hd, t.w, t.d, 1);
    ctx.fillStyle = 'rgba(255,255,255,.07)';   // Zeltbahnen
    for (let x = -hw + 14; x < hw; x += 28) ctx.fillRect(x, -hd, 12, t.d);
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(-hw, -hd, t.w, 5);   // Schatten der Wand
    if (t.nutzung === 'lager') {   // Schlafsäcke und Kiste auf dem Boden
      for (let i = 0; i < 3; i++) {
        const x = -hw + 16 + i * 40, y = hd - 46;
        rundRechteck(ctx, '#556b2f', x, y, 17, 36, 7); rundRechteck(ctx, '#8aa05a', x + 2, y + 2, 13, 8, 4);
      }
      rundRechteck(ctx, '#3a2f1e', hw - 36, -hd + 12, 24, 16, 2); rundRechteck(ctx, '#6d5a3a', hw - 34, -hd + 14, 20, 12, 2);
    }
  });
  if (t.nutzung === 'sani' && t.kreuz) {   // weißes Feld mit rotem Kreuz
    mitRahmen(ctx, { x: t.kreuz[0], y: t.kreuz[1], winkel: t.winkel }, () => {
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-20, -18, 46, 46);
      ctx.fillStyle = '#f5f5f0'; ctx.fillRect(-23, -23, 46, 46);
      ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 1.5; ctx.strokeRect(-22.5, -22.5, 45, 45);
      ctx.fillStyle = '#c62828'; ctx.fillRect(-5, -17, 10, 34); ctx.fillRect(-17, -5, 34, 10);
    });
  }
}

// ---------------- obere Ebene: Wände, Draht, Sandsäcke, Fahrzeuge, Kisten ----------------
export function zeichneStuetzpunktOben(ctx, welt, rect) {
  const sp = welt.stuetzpunkt;
  if (!sp) return;
  const bx0 = sp.x * K, by0 = sp.y * K, bx1 = (sp.x + sp.b) * K, by1 = (sp.y + sp.h) * K;
  if (bx1 + 120 < rect.x0 * K || bx0 - 120 > rect.x1 * K || by1 + 120 < rect.y0 * K || by0 - 120 > rect.y1 * K) return;
  const dinge = [];
  for (const t of sp.teile) {
    if (!sichtbar(t, rect, 100)) continue;
    const f = {
      sanizelt: () => zeltWaende(ctx, t), zelt: () => zeltWaende(ctx, t), funkzelt: () => zeltWaende(ctx, t),
      sdraht: () => sDraht(ctx, t), flandern: () => flandernZaun(ctx, t), sandsack: () => sandsackStellung(ctx, t), mgnest: () => mgNest(ctx, t),
      lkw: () => lkw(ctx, t), container: () => bwContainer(ctx, t), kiste: () => munKiste(ctx, t), vorratskiste: () => vorratsKiste(ctx, t),
      antenne: () => antenne(ctx, t), flagge: () => flagge(ctx, t),
    }[t.art];
    if (f) dinge.push([t.art === 'sdraht' ? t.y - 4000 : t.art === 'flandern' ? t.y - 3000 : t.y, f]);
  }
  for (const b of welt.behaelter) if (b.art === 'sanikiste' && sp.behaelter.includes(b.id)) dinge.push([b.y, () => saniKiste(ctx, b)]);
  dinge.sort((a, c) => a[0] - c[0]);
  for (const [, f] of dinge) { ctx.save(); f(); ctx.restore(); }
}

function zeltWaende(ctx, t) {
  mitRahmen(ctx, t, () => {
    const baender = zeltBaender(t.w, t.d, t.eingang), e = t.eingang;
    for (const [x0, y0, x1, y1] of baender) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 3, y0 + 4, x1 - x0, y1 - y0); }
    for (const [x0, y0, x1, y1] of baender) {
      ctx.fillStyle = t.nutzung === 'sani' ? '#566431' : OLIV; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x0, y0, x1 - x0, 2);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x0, y1 - 2, x1 - x0, 2);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
      const lang = (x1 - x0) > (y1 - y0);
      for (let a = (lang ? x0 : y0) + 12; a < (lang ? x1 : y1) - 2; a += 14) { ctx.beginPath(); if (lang) { ctx.moveTo(a, y0); ctx.lineTo(a, y1); } else { ctx.moveTo(x0, a); ctx.lineTo(x1, a); } ctx.stroke(); }
    }
    const hw = t.w / 2, hd = t.d / 2;
    if (e) {   // aufgerollte Eingangsbahnen
      const achseU = e.seite === 'v0' || e.seite === 'v1', nx = e.seite === 'u1' ? 1 : e.seite === 'u0' ? -1 : 0, ny = e.seite === 'v1' ? 1 : e.seite === 'v0' ? -1 : 0;
      for (const g of [e.von, e.bis]) rundRechteck(ctx, '#b8a878', (achseU ? g : nx * (hw + 4)) - 3, (achseU ? ny * (hd + 4) : g) - 3, 6, 6, 2);
    }
    ctx.strokeStyle = 'rgba(40,30,20,.55)'; ctx.lineWidth = 1;   // Abspannleinen und Heringe an den Ecken
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(cx * (hw + 8), cy * (hd + 8)); ctx.lineTo(cx * (hw + 13), cy * (hd + 13)); ctx.stroke();
      ctx.fillStyle = '#3e2723'; ctx.beginPath(); ctx.arc(cx * (hw + 13), cy * (hd + 13), 2, 0, TAU); ctx.fill();
    }
  });
}

// Flandernzaun: Holzböcke (gekreuzte Balken) alle 22 px, oben ein Längsbalken und drei Stacheldrahtlitzen mit Zacken
function flandernZaun(ctx, t) {
  mitRahmen(ctx, t, () => {
    const lang = t.w >= t.d, L = lang ? t.w : t.d;
    if (!lang) ctx.rotate(Math.PI / 2);
    const hl = L / 2, n = Math.max(1, Math.round(L / 22)), sch = L / n, saat = Math.round(t.x * 3 + t.y * 5);
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(-hl + 2, -3, L, 10);   // Schatten
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {   // Böcke: zwei gekreuzte Balken quer zum Zaun
      const x = -hl + (i + 0.5) * sch;
      ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x - 3.2, -5); ctx.lineTo(x + 3.2, 5); ctx.moveTo(x + 3.2, -5); ctx.lineTo(x - 3.2, 5); ctx.stroke();
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3.2, -5); ctx.lineTo(x + 3.2, 5); ctx.moveTo(x + 3.2, -5); ctx.lineTo(x - 3.2, 5); ctx.stroke();
    }
    ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();   // Längsbalken
    ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-hl, -0.7); ctx.lineTo(hl, -0.7); ctx.stroke();
    for (const [y, f] of [[-3.6, 0], [0, 1], [3.6, 2]]) {   // Stacheldraht (wellig) mit kurzen Zacken
      ctx.strokeStyle = '#4a4d50'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let x = -hl; x <= hl; x += 3) { const yy = y + Math.sin(x * 0.55 + f * 2) * 1.1; if (x === -hl) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      ctx.stroke();
      ctx.strokeStyle = '#b0b7ba'; ctx.lineWidth = 0.9;
      for (let x = -hl + 4 + hash(saat, f) * 4; x < hl; x += 9) { ctx.beginPath(); ctx.moveTo(x - 1.5, y - 2.2); ctx.lineTo(x + 1.5, y + 2.2); ctx.moveTo(x + 1.5, y - 2.2); ctx.lineTo(x - 1.5, y + 2.2); ctx.stroke(); }
    }
  });
}

// S-Draht (NATO-Draht): Rollen nebeneinander, mit Schatten
export function zeichneSDrahtRolle(ctx, w, d) { sDraht(ctx, { x: 0, y: 0, w, d, winkel: 0 }); }   // für Flugfeld-Deko (flugfeld_deko.mjs), um den Ursprung
function sDraht(ctx, t) {
  mitRahmen(ctx, t, () => {
    const hw = t.w / 2, n = Math.max(2, Math.round(t.w / 12)), s = t.w / n;
    for (let i = 0; i < n; i++) {
      const x = -hw + (i + 0.5) * s, y = i % 2 ? 1.2 : -1.2;
      ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 4, s * 0.55, 8, 0, 0, TAU); ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = -hw + (i + 0.5) * s, y = i % 2 ? 1.2 : -1.2;
      ctx.strokeStyle = '#4a4d50'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.arc(x, y, 7.2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#8d9498'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + 0.4, y - 0.3, 4.6, 0.3, TAU - 0.5); ctx.stroke();
      ctx.strokeStyle = '#2e3033'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#b0b7ba'; ctx.lineWidth = 0.9;   // Zacken
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + i; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.lineTo(x + Math.cos(a + 0.35) * 9.6, y + Math.sin(a + 0.35) * 9.6); ctx.stroke(); }
    }
    ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;   // Pfähle an den Enden
    for (const x of [-hw, hw]) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, 6); ctx.stroke(); }
  });
}

// Sandsäcke auf einer Fläche (Reihen versetzt, Schatten)
function sandsaecke(ctx, x0, y0, x1, y1, saat) {
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 3, y0 + 4, x1 - x0, y1 - y0);
  ctx.fillStyle = '#a89560'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const lang = (x1 - x0) >= (y1 - y0), L = lang ? x1 - x0 : y1 - y0, Q = lang ? y1 - y0 : x1 - x0, reihen = Math.max(1, Math.round(Q / 8)), q1 = Q / reihen;
  for (let r = 0; r < reihen; r++) {
    for (let a = r % 2 ? 7 : 0; a < L; a += 14) {
      const q = (r + 0.5) * q1, cx = lang ? x0 + a + 7 : x0 + q, cy = lang ? y0 + q : y0 + a + 7;
      ctx.fillStyle = ['#c8b27a', '#bfa86c', '#d2bd88'][Math.floor(hash(saat + r, a) * 3)];
      ctx.beginPath(); ctx.ellipse(cx, cy, lang ? 7 : q1 / 2 + 0.5, lang ? q1 / 2 + 0.5 : 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(80,60,20,.55)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}
function sandsackStellung(ctx, t) {
  mitRahmen(ctx, t, () => { sandsackWaende(t.w, t.d).forEach((rc, i) => sandsaecke(ctx, ...rc, Math.round(t.x + t.y) + i * 9)); });
}

// MG-Nest: Ring aus Sandsäcken, MG auf Dreibein in Blickrichtung, Munitionskiste
function mgNest(ctx, t) {
  ctx.translate(t.x, t.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(2.5, 4, 24, 0, TAU); ctx.fill();
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + 0.2;
    ctx.save(); ctx.translate(Math.cos(a) * 19.5, Math.sin(a) * 19.5); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = ['#c8b27a', '#bfa86c', '#d2bd88'][Math.floor(hash(Math.round(t.x), i) * 3)];
    ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 5.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,20,.55)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#c4ae76';   // zweite Lage innen, nach hinten offen (Einstieg)
  for (let i = 0; i < 9; i++) {
    const a = t.blick + 0.9 + i * 0.58;
    ctx.save(); ctx.translate(Math.cos(a) * 15, Math.sin(a) * 15); ctx.rotate(a + Math.PI / 2);
    ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(80,60,20,.5)'; ctx.stroke(); ctx.restore();
  }
  ctx.rotate(t.blick);
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6;   // Dreibein und MG (Lauf nach vorn)
  for (const a of [0.7, -0.7, Math.PI]) { ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + Math.cos(a) * 10, Math.sin(a) * 10); ctx.stroke(); }
  rundRechteck(ctx, '#1d1f1c', 0, -2.4, 17, 4.8, 1.2); rundRechteck(ctx, '#33382f', 2, -1.6, 9, 3.2, 1);
  ctx.fillStyle = '#111'; ctx.fillRect(15, -0.9, 14, 1.8); ctx.fillRect(26, -2.2, 3, 4.4);
  ctx.fillStyle = '#4b5320'; ctx.fillRect(-4, 4, 8, 6); ctx.fillStyle = '#c9a227'; ctx.fillRect(-3, 8, 6, 1.3);   // Munitionskiste mit Gurt
}

// Schützenpanzer Puma, Wanne (Turm = eigene Zeichnung, siehe zeichnePumaTurm); Rahmen: x = Bug, y = rechts
export function zeichnePumaWanne(ctx, L = 72, B = 34) {
  const hl = L / 2, hb = B / 2;
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(-hl + 4, -hb + 5, L, B);
  for (const s of [-1, 1]) {   // Ketten
    const y = s > 0 ? hb - 7 : -hb;
    rundRechteck(ctx, '#23231f', -hl + 1, y, L - 7, 7, 2);
    ctx.strokeStyle = '#3d3d36'; ctx.lineWidth = 1;
    for (let x = -hl + 4; x < hl - 8; x += 3.2) { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x, y + 6.5); ctx.stroke(); }
    ctx.fillStyle = '#55554c';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-hl + 9 + i * 10.4, y + 3.5, 2.4, 0, TAU); ctx.fill(); }
  }
  const wanne = () => {   // flach, kantig, Bug schräg
    ctx.beginPath(); ctx.moveTo(-hl + 2, -hb + 5); ctx.lineTo(hl - 18, -hb + 5); ctx.lineTo(hl - 1, -hb + 11); ctx.lineTo(hl - 1, hb - 11); ctx.lineTo(hl - 18, hb - 5);
    ctx.lineTo(-hl + 2, hb - 5); ctx.closePath();
  };
  wanne(); ctx.fillStyle = '#4f5a2c'; ctx.fill();
  ctx.save(); wanne(); ctx.clip(); tarnFlecken(ctx, -hl, -hb, hl, hb, 42, 1.15);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(hl - 18, -hb + 5, 18, B - 10);   // schräger Bug heller
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-hl, hb - 11, L, 6);
  ctx.restore();
  wanne(); ctx.strokeStyle = '#1d2112'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;   // Plattenfugen, Heckgitter
  ctx.beginPath(); ctx.moveTo(hl - 18, -hb + 5); ctx.lineTo(hl - 18, hb - 5); ctx.moveTo(-hl + 16, -hb + 5); ctx.lineTo(-hl + 16, hb - 5); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-hl + 4, -8 + i * 5); ctx.lineTo(-hl + 14, -8 + i * 5); ctx.stroke(); }
  ctx.fillStyle = '#242518'; ctx.beginPath(); ctx.arc(-6, 0, 12.5, 0, TAU); ctx.fill();   // Turmring unter dem Turm
  ctx.fillStyle = '#e8e8dc'; ctx.fillRect(-hl + 22, hb - 12, 5, 1.8); ctx.fillRect(-hl + 23.6, hb - 13.6, 1.8, 5);   // Eisernes Kreuz (klein)
  ctx.fillStyle = '#111'; ctx.fillRect(-hl + 22.6, hb - 11.5, 3.8, 0.8); ctx.fillRect(-hl + 24.1, hb - 13, 0.8, 3.8);
}

// Puma-Turm: unbemannt, 30-mm-Maschinenkanone nach vorn (+x); Drehpunkt = (PUMA_TURM.mx, PUMA_TURM.my) im Bild
export const PUMA_TURM = { b: 96, h: 48, mx: 30, my: 24 };
// Puma-Draufsicht aus dem 3D-Modell (grafik/puma_wanne.webp, puma_turm.webp; tools/glb_draufsicht + tools/puma_bilder.py).
// Maße in Modelleinheiten: Wannenlänge, Bildpunkte je Einheit, Turm-Drehpunkt relativ zur Wannenmitte (x = Bug, y = rechts),
// Drehpunkt im Turmbild (Bildpunkte) und Abstand Drehpunkt → Mündung
export const PUMA_BILD = { laenge: 146.06, px: 2.4, turmX: -25.36, turmY: -8.36, turmMx: 62.4, turmMy: 55.6, muendung: 72.78 };
export function zeichnePumaTurm(ctx) {
  ctx.save(); ctx.translate(PUMA_TURM.mx, PUMA_TURM.my);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(3, 4, 17, 13, 0, 0, TAU); ctx.fill();
  rundRechteck(ctx, '#1f221b', 10, -2.2, 46, 4.4, 1); rundRechteck(ctx, '#2c3126', 9, -3.4, 16, 6.8, 1.5);   // Rohr und Rohrmantel
  ctx.fillStyle = '#12140f'; ctx.fillRect(52, -3.2, 5, 6.4);                                                   // Mündungsbremse
  rundRechteck(ctx, '#23261f', 12, 5.5, 14, 2.4, 1);                                                          // koaxiales MG
  const turm = () => { ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(7, -12); ctx.lineTo(16, -8); ctx.lineTo(16, 8); ctx.lineTo(7, 12); ctx.lineTo(-17, 9); ctx.closePath(); };
  turm(); ctx.fillStyle = '#505c2d'; ctx.fill();
  ctx.save(); turm(); ctx.clip(); tarnFlecken(ctx, -17, -12, 16, 12, 77, 1.4); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(7, -12, 9, 24); ctx.restore();
  turm(); ctx.strokeStyle = '#1d2112'; ctx.lineWidth = 1.5; ctx.stroke();
  rundRechteck(ctx, '#2d3326', -4, -13.5, 9, 5, 1.4);   // Sensorkopf
  ctx.fillStyle = '#7fb3c8'; ctx.fillRect(2, -12.5, 2.4, 3);
  ctx.fillStyle = '#2b2f24'; ctx.beginPath(); ctx.arc(-6, 2, 4.4, 0, TAU); ctx.fill();   // Luke
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#222'; for (let i = 0; i < 3; i++) ctx.fillRect(-14 + i * 1.6, 7.5 - i * 0.3, 1.2, 1.6);   // Nebelwurfbecher
  ctx.restore();
}

// Bundeswehr-LKW (Rahmen: x = Bug): Fahrerhaus, Plane in Flecktarn, Räder, Spiegel
function lkw(ctx, t) {
  ctx.translate(t.x, t.y); ctx.rotate(t.winkel);
  const L = t.laenge, B = t.breite, hl = L / 2, hb = B / 2;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-hl + 4, -hb + 5, L, B);
  ctx.fillStyle = '#16160f';
  for (const x of [-hl + 12, -hl + 28, hl - 18]) { ctx.fillRect(x - 6, -hb - 2, 12, 5); ctx.fillRect(x - 6, hb - 3, 12, 5); }   // Räder
  rundRechteck(ctx, '#3a3d30', -hl + 2, -hb + 3, L - 4, B - 6, 2);
  const plane = () => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-hl + 1, -hb + 1, L - 31, B - 2, 3); else ctx.rect(-hl + 1, -hb + 1, L - 31, B - 2); };
  plane(); ctx.fillStyle = '#4f5a2c'; ctx.fill();
  ctx.save(); plane(); ctx.clip(); tarnFlecken(ctx, -hl, -hb, hl - 30, hb, 91, 1.2); ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2;   // Planenspriegel
  for (let x = -hl + 8; x < hl - 32; x += 11) { ctx.beginPath(); ctx.moveTo(x, -hb + 2); ctx.lineTo(x, hb - 2); ctx.stroke(); }
  plane(); ctx.strokeStyle = '#1d2112'; ctx.lineWidth = 1.5; ctx.stroke();
  rundRechteck(ctx, '#505c2d', hl - 29, -hb + 2, 27, B - 4, 3);   // Fahrerhaus
  ctx.fillStyle = '#6a7a42'; ctx.fillRect(hl - 27, -hb + 4, 12, B - 8);
  ctx.fillStyle = '#25312f'; ctx.fillRect(hl - 12, -hb + 4, 8, B - 8);   // Windschutzscheibe
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(hl - 11, -hb + 5, 2, B - 10);
  ctx.fillStyle = '#16160f'; ctx.fillRect(hl - 18, -hb - 2, 4, 3); ctx.fillRect(hl - 18, hb - 1, 4, 3);   // Spiegel
  ctx.fillStyle = '#f2e6a8'; ctx.fillRect(hl - 2, -hb + 3, 2, 4); ctx.fillRect(hl - 2, hb - 7, 2, 4);
}

// Container (olivgrün, Wellblech, Türen an einem Ende) – Rahmen: 64 × 32
function bwContainer(ctx, t) {
  ctx.translate(t.x, t.y); ctx.rotate(t.winkel);
  const hw = t.w / 2, hd = t.d / 2;
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(-hw + 4, -hd + 5, t.w, t.d);
  rundRechteck(ctx, '#3f4b22', -hw, -hd, t.w, t.d, 2); rundRechteck(ctx, '#55632c', -hw + 2, -hd + 2, t.w - 4, t.d - 4, 1);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
  for (let x = -hw + 6; x < hw - 10; x += 5) { ctx.beginPath(); ctx.moveTo(x, -hd + 3); ctx.lineTo(x, hd - 3); ctx.stroke(); }
  ctx.fillStyle = '#2c3517'; ctx.fillRect(hw - 9, -hd + 2, 7, t.d - 4);   // Türen
  ctx.strokeStyle = '#9aa07a'; ctx.beginPath(); ctx.moveTo(hw - 5.5, -hd + 4); ctx.lineTo(hw - 5.5, hd - 4); ctx.stroke();
  ctx.fillStyle = '#b9c08c'; ctx.fillRect(hw - 8, -4, 1.6, 8); ctx.fillRect(hw - 4.4, -4, 1.6, 8);
  ctx.fillStyle = 'rgba(235,235,215,.85)'; ctx.fillRect(-hw + 7, -3, 16, 1.6); ctx.fillRect(-hw + 7, 1, 10, 1.6);   // Schablonenschrift
}

// Munitionskiste (olivgrün, Schablonenschrift, gelbes Band)
function munKiste(ctx, t) {
  ctx.translate(t.x, t.y); ctx.rotate(t.winkel);
  const hw = t.w / 2, hd = t.d / 2;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-hw + 2, -hd + 3, t.w, t.d);
  rundRechteck(ctx, '#3d4720', -hw, -hd, t.w, t.d, 2); rundRechteck(ctx, '#56632b', -hw + 1.5, -hd + 1.5, t.w - 3, t.d - 3, 1.4);
  ctx.fillStyle = '#d4b530'; ctx.fillRect(-hw + 4, -hd + 1.5, 2.4, t.d - 3);
  ctx.fillStyle = '#c0c4a0'; ctx.fillRect(hw - 4, -hd + 2, 2, 3); ctx.fillRect(hw - 4, hd - 5, 2, 3);   // Verschlüsse
  ctx.fillStyle = 'rgba(240,240,225,.9)'; ctx.fillRect(-hw + 8, -2.5, 8, 1.2); ctx.fillRect(-hw + 8, -0.2, 6, 1.2); ctx.fillRect(-hw + 8, 2, 7, 1.2);
}
// Vorratskiste des Lagers: helle Holzkiste mit grünem Deckelband und weißem Kreuz (Safe House)
function vorratsKiste(ctx, t) {
  ctx.translate(t.x, t.y); ctx.rotate(t.winkel);
  const hw = t.w / 2, hd = t.d / 2;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-hw + 2, -hd + 3, t.w, t.d);
  rundRechteck(ctx, '#5a4326', -hw, -hd, t.w, t.d, 2); rundRechteck(ctx, '#8a6a3c', -hw + 1.5, -hd + 1.5, t.w - 3, t.d - 3, 1.4);
  ctx.fillStyle = '#4f5d2a'; ctx.fillRect(-hw + 1.5, -2.2, t.w - 3, 4.4);
  ctx.fillStyle = 'rgba(240,240,225,.92)'; ctx.fillRect(-1, -hd + 3, 2, t.d - 6); ctx.fillRect(-4.5, -1, 9, 2);
}
function saniKiste(ctx, b) {
  ctx.translate(b.x, b.y); ctx.rotate(b.winkel ?? 0);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-8, -5, 20, 16);
  rundRechteck(ctx, '#e8e8e0', -10, -8, 20, 16, 2);
  ctx.strokeStyle = '#7d7d73'; ctx.lineWidth = 1.2; ctx.strokeRect(-9.5, -7.5, 19, 15);
  ctx.fillStyle = '#c62828'; ctx.fillRect(-1.8, -5.5, 3.6, 11); ctx.fillRect(-5.5, -1.8, 11, 3.6);
}
function antenne(ctx, t) {
  ctx.translate(t.x, t.y);
  ctx.strokeStyle = 'rgba(40,40,40,.55)'; ctx.lineWidth = 1;
  for (const a of [0.5, 2.1, 3.7, 5.3]) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.stroke();
    ctx.fillStyle = '#3e2723'; ctx.beginPath(); ctx.arc(Math.cos(a) * 30, Math.sin(a) * 30, 1.8, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(2, 3, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6d7276'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b0b6ba'; ctx.beginPath(); ctx.arc(-0.8, -0.8, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
}
// Fahne mit rotem Kreuz am Sanitätszelt (von oben: Stange, Tuch)
function flagge(ctx, t) {
  ctx.translate(t.x, t.y); ctx.rotate(t.winkel);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-3, -3, 20, 14);
  ctx.fillStyle = '#f5f5f0'; ctx.fillRect(-2, -5, 18, 12);
  ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 1; ctx.strokeRect(-1.5, -4.5, 17, 11);
  ctx.fillStyle = '#c62828'; ctx.fillRect(5, -3, 3, 8); ctx.fillRect(2.5, -0.5, 8, 3);
  ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(-3, 1, 2, 0, TAU); ctx.fill();
}
