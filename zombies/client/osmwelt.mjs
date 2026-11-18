// Spielwelt aus einer umgerechneten OpenStreetMap-Karte (tools/osm_karte.py).
// Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0.
import { KACHEL, BREITE, HOEHE, T, zufall, BLOCKIERT, FEIN, FEIN_PX } from './welt.mjs';
import { randParkplaetze } from './vektor.mjs';

// Gebäude, die Safe Rooms werden (erster Treffer je Eintrag), mit Anzeigenamen
const SAFE_WUNSCH = [
  [/maria hilf/i, 'Kirche Maria Hilf'],
  [/karl-lederer/i, 'Karl-Lederer-Schule'],
  [/franz-marc/i, 'Franz-Marc-Schule'],
  [/st\.? ?ursula|pflegeheim/i, 'Pflegeheim St. Ursula'],
];
const RICHTUNGEN = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// optionen.autos: Faktor für geparkte Autos (1 = normal)
export function baueWeltAusKarte(karte, seed, optionen = {}) {
  const autoFaktor = Number.isFinite(optionen.autos) ? Math.max(0, optionen.autos) : 1;
  const r = zufall(seed ^ 0x6a09e667);
  const k = new Uint8Array(BREITE * HOEHE);
  for (let i = 0; i < k.length; i++) k[i] = karte.kacheln.charCodeAt(i) - 48;
  const setze = (x, y, v) => { if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) k[y * BREITE + x] = v; };
  const hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? k[y * BREITE + x] : T.ZAUN;

  // Gebäudeflächen (Boden/Wand) einer Gebäude-Bbox, die zur Tür zusammenhängen
  const flaecheVon = g => {
    const zellen = [], ziel = g.tuer, gesehen = new Set();
    if (!ziel) return zellen;
    const q = [[ziel.x, ziel.y]]; gesehen.add(ziel.y * BREITE + ziel.x);
    while (q.length) {
      const [x, y] = q.pop(); zellen.push([x, y]);
      for (const [dx, dy] of RICHTUNGEN) {
        const nx = x + dx, ny = y + dy, key = ny * BREITE + nx;
        if (gesehen.has(key) || nx < g.x || ny < g.y || nx >= g.x + g.b || ny >= g.y + g.h) continue;
        const t = hole(nx, ny);
        if (t !== T.BODEN && t !== T.WAND) continue;
        gesehen.add(key); q.push([nx, ny]);
      }
    }
    return zellen;
  };

  const haeuser = [], safeRooms = [], behaelter = [];
  for (const g of karte.gebaeude) {
    if (!g.tuer || g.flaeche < 12) {
      // Garagen, Schuppen, Gebäude ohne Tür: geschlossene Blöcke
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.b; x++) {
        if (hole(x, y) === T.BODEN || hole(x, y) === T.TUER) setze(x, y, T.WAND);
      }
      continue;
    }
    // Austrittsrichtung: auf der einen Seite der Tür Boden (innen), auf der anderen frei
    let raus = { dx: 0, dy: 1 };
    for (const [dx, dy] of RICHTUNGEN) {
      const aussen = hole(g.tuer.x + dx, g.tuer.y + dy), innen = hole(g.tuer.x - dx, g.tuer.y - dy);
      if (innen === T.BODEN && ![T.WAND, T.BODEN, T.LEER, T.WASSER, T.ZAUN].includes(aussen)) { raus = { dx, dy }; break; }
    }
    const h = { x: g.x, y: g.y, b: g.b, h: g.h, tuer: { ...g.tuer }, raus, nr: haeuser.length, name: g.name ?? '',
      art: g.shop ?? g.amenity ?? '', flaeche: g.flaeche };
    haeuser.push(h);
  }
  // Safe Rooms auf echte Gebäude
  for (const [muster, anzeige] of SAFE_WUNSCH) {
    const h = haeuser.find(h => !h.safe && muster.test(h.name));
    if (!h) continue;
    const zellen = flaecheVon(h).filter(([x, y]) => hole(x, y) === T.BODEN);
    if (zellen.length < 6) continue;
    h.safe = anzeige; h.safeId = 's' + safeRooms.length;
    const cx = h.x + h.b / 2, cy = h.y + h.h / 2;
    const mitte = zellen.reduce((a, z) => Math.hypot(z[0] - cx, z[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy) ? z : a);
    const weit = zellen.reduce((a, z) => Math.hypot(z[0] - h.tuer.x, z[1] - h.tuer.y) > Math.hypot(a[0] - h.tuer.x, a[1] - h.tuer.y) ? z : a);
    const kiste = { x: (weit[0] + 0.5) * KACHEL, y: (weit[1] + 0.5) * KACHEL };
    safeRooms.push({ id: h.safeId, name: anzeige, haus: h, kiste, innen: { x: (mitte[0] + 0.5) * KACHEL, y: (mitte[1] + 0.5) * KACHEL } });
    // ein Schrank an der Wand
    const schrank = zellen.find(([x, y]) => (x !== weit[0] || y !== weit[1]) && RICHTUNGEN.some(([dx, dy]) => hole(x + dx, y + dy) === T.WAND)
      && Math.hypot(x - h.tuer.x, y - h.tuer.y) > 2);
    if (schrank) behaelter.push({ id: 'b' + behaelter.length, art: 'schrank', x: (schrank[0] + 0.5) * KACHEL, y: (schrank[1] + 0.5) * KACHEL });
  }
  // betretbare Häuser: Außenhülle nicht begehbar (das Innere ist ein eigener Innenraum)
  for (const h of haeuser) {
    h.betretbar = !h.safe;
    if (!h.betretbar) continue;
    for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) if (hole(x, y) === T.BODEN) setze(x, y, T.LEER);
  }

  // Startplatz: größter zusammenhängender Platz in der Kartenmitte
  const imPlatz = new Uint8Array(BREITE * HOEHE);
  let besterPlatz = null;
  for (let y = 1; y < HOEHE - 1; y++) for (let x = 1; x < BREITE - 1; x++) {
    if (hole(x, y) !== T.PLATZ || imPlatz[y * BREITE + x]) continue;
    const q = [[x, y]], zellen = []; imPlatz[y * BREITE + x] = 1;
    while (q.length) {
      const [a, b] = q.pop(); zellen.push([a, b]);
      for (const [dx, dy] of RICHTUNGEN) {
        const nx = a + dx, ny = b + dy;
        if (hole(nx, ny) === T.PLATZ && !imPlatz[ny * BREITE + nx]) { imPlatz[ny * BREITE + nx] = 1; q.push([nx, ny]); }
      }
    }
    const mx = zellen.reduce((s, z) => s + z[0], 0) / zellen.length, my = zellen.reduce((s, z) => s + z[1], 0) / zellen.length;
    const wert = Math.min(zellen.length, 120) - Math.hypot(mx - BREITE / 2, my - HOEHE / 2) * 2.5;
    if (zellen.length >= 12 && (!besterPlatz || wert > besterPlatz.wert)) besterPlatz = { zellen, mx, my, wert };
  }
  let start, markt;
  if (besterPlatz) {
    const z = besterPlatz.zellen.reduce((a, c) => Math.hypot(c[0] - besterPlatz.mx, c[1] - besterPlatz.my) < Math.hypot(a[0] - besterPlatz.mx, a[1] - besterPlatz.my) ? c : a);
    start = { x: (z[0] + 0.5) * KACHEL, y: (z[1] + 0.5) * KACHEL };
    const xs = besterPlatz.zellen.map(c => c[0]), ys = besterPlatz.zellen.map(c => c[1]);
    markt = { x: Math.min(...xs), y: Math.min(...ys), b: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  } else {
    start = { x: BREITE * KACHEL / 2, y: HOEHE * KACHEL / 2 };
    markt = { x: Math.floor(BREITE / 2) - 2, y: Math.floor(HOEHE / 2) - 2, b: 4, h: 4 };
  }

  // Ortsausgang: eine Straße, die den linken Rand erreicht (sonst den oberen)
  let tor = null;
  for (let y = 2; y < HOEHE - 3 && !tor; y++) if (hole(1, y) === T.STRASSE && hole(1, y + 1) === T.STRASSE) tor = { x: 0, y };
  for (let x = 2; x < BREITE - 3 && !tor; x++) if (hole(x, 1) === T.STRASSE && hole(x + 1, 1) === T.STRASSE) tor = { x, y: 0 };
  if (!tor) tor = { x: 0, y: Math.floor(HOEHE / 2) };
  if (tor.x === 0) { setze(0, tor.y, T.TOR); setze(0, tor.y + 1, T.TOR); } else { setze(tor.x, 0, T.TOR); setze(tor.x + 1, 0, T.TOR); }

  // geparkte Autos am Straßenrand (Kofferraum durchsuchbar)
  const randStrasse = [];
  for (let y = 2; y < HOEHE - 2; y++) for (let x = 2; x < BREITE - 2; x++) {
    if (hole(x, y) !== T.STRASSE) continue;
    const senkrecht = hole(x, y - 1) === T.STRASSE && hole(x, y + 1) === T.STRASSE;
    const waagrecht = hole(x - 1, y) === T.STRASSE && hole(x + 1, y) === T.STRASSE;
    if (senkrecht !== waagrecht && (senkrecht ? (hole(x - 1, y) !== T.STRASSE || hole(x + 1, y) !== T.STRASSE) : (hole(x, y - 1) !== T.STRASSE || hole(x, y + 1) !== T.STRASSE))) {
      randStrasse.push([x, y, senkrecht]);
    }
  }
  const autos = Math.round(Math.min(260, randStrasse.length / 16) * autoFaktor);
  if (karte.strassen) {
    // längs am Rand der echten Straßenlinie, gerade nach der Straße ausgerichtet
    const plaetze = randParkplaetze(karte.strassen);
    const PLATZ_OK = new Set([T.STRASSE, T.PLATZ, T.WIESE, T.TUER]);
    const passt = q => [-20, 0, 20].every(d => {
      const kx = Math.floor((q.x + q.ux * d) / KACHEL), ky = Math.floor((q.y + q.uy * d) / KACHEL);
      return PLATZ_OK.has(hole(kx, ky)) && hole(kx, ky) !== T.TUER;
    });
    for (let n = 0, v = 0; n < autos && v < autos * 20 && plaetze.length; v++) {
      const q = plaetze[Math.floor(r() * plaetze.length)];
      if (!passt(q)) continue;
      if (behaelter.some(b => Math.hypot(b.x - q.x, b.y - q.y) < 52)) continue;
      if (Math.hypot(q.x - start.x, q.y - start.y) < KACHEL * 4) continue;
      behaelter.push({ id: 'b' + behaelter.length, art: 'auto', x: q.x, y: q.y, winkel: q.winkel, farbe: Math.floor(r() * 6) });
      n++;
    }
  } else for (let n = 0, v = 0; n < autos && v < autos * 20; v++) {
    const [x, y, senkrecht] = randStrasse[Math.floor(r() * randStrasse.length)];
    const px = (x + 0.5) * KACHEL, py = (y + 0.5) * KACHEL;
    if (behaelter.some(b => Math.hypot(b.x - px, b.y - py) < KACHEL * 2.6)) continue;
    if (Math.hypot(px - start.x, py - start.y) < KACHEL * 4) continue;
    behaelter.push({ id: 'b' + behaelter.length, art: 'auto', x: px, y: py, senkrecht, farbe: Math.floor(r() * 6) });
    n++;
  }

  // Parkplätze (OSM-Flächen): Autos in Reihen, Lücken dazwischen
  const imPolygon = (px, py, p) => {
    let drin = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > py) !== (p[j + 1] > py) && px < (p[j] - p[i]) * (py - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) drin = !drin;
    }
    return drin;
  };
  for (const f of karte.flaechen ?? []) {
    if (f.a !== 'parkplatz' || autoFaktor <= 0) continue;
    const xs = f.p.filter((_, i) => i % 2 === 0), ys = f.p.filter((_, i) => i % 2 === 1);
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    const quer = x1 - x0 >= y1 - y0;   // breiter Platz: Autos stehen nebeneinander (senkrecht)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((quer ? y % 3 : x % 3) === 2) continue;                 // Fahrgasse
      if ((quer ? x : y) % 1 !== 0 || r() > 0.42 * autoFaktor) continue;
      if (hole(x, y) !== T.PLATZ && hole(x, y) !== T.STRASSE) continue;
      if (!imPolygon(x + 0.5, y + 0.5, f.p)) continue;
      const px = (x + 0.5) * KACHEL, py = (y + 0.5) * KACHEL;
      if (Math.hypot(px - start.x, py - start.y) < KACHEL * 3) continue;
      if (behaelter.some(b => Math.abs(b.x - px) < KACHEL * (quer ? 0.9 : 1.6) && Math.abs(b.y - py) < KACHEL * (quer ? 1.6 : 0.9))) continue;
      behaelter.push({ id: 'b' + behaelter.length, art: 'auto', x: px, y: py, senkrecht: quer, farbe: Math.floor(r() * 6) });
    }
  }

  // Deko: Maibaum auf dem Platz, Busse auf Straßen, Büsche auf Wiesen
  const deko = [];
  const mbx = Math.floor(start.x / KACHEL), mby = Math.floor(start.y / KACHEL) - 2;
  if (hole(mbx, mby) === T.PLATZ) { setze(mbx, mby, T.DEKO); deko.push({ art: 'maibaum', kx: mbx, ky: mby, b: 1, h: 1, x: (mbx + 0.5) * KACHEL, y: (mby + 1) * KACHEL - 4 }); }
  for (let n = 0, v = 0; n < 8 && v < 2000; v++) {
    const [x, y, senkrecht] = randStrasse[Math.floor(r() * randStrasse.length)];
    const kacheln = []; for (let j = 0; j < 4; j++) kacheln.push(senkrecht ? [x, y + j] : [x + j, y]);
    if (!kacheln.every(([a, b]) => hole(a, b) === T.STRASSE)) continue;
    if (behaelter.some(b => kacheln.some(([a, c]) => Math.abs(Math.floor(b.x / KACHEL) - a) <= 1 && Math.abs(Math.floor(b.y / KACHEL) - c) <= 1))) continue;
    if (deko.some(d => Math.abs(d.kx - x) < 12 && Math.abs(d.ky - y) < 12)) continue;
    // nicht vor einer Haustür (sonst kommt man nicht mehr hinein)
    if (haeuser.some(h => h.tuer && kacheln.some(([a, c]) => Math.abs(h.tuer.x + h.raus.dx - a) <= 2 && Math.abs(h.tuer.y + h.raus.dy - c) <= 2))) continue;
    // Straße muss danach noch passierbar sein: neben jeder Buskachel quer noch Straße
    if (!kacheln.every(([a, b]) => senkrecht ? (hole(a - 1, b) === T.STRASSE || hole(a + 1, b) === T.STRASSE) : (hole(a, b - 1) === T.STRASSE || hole(a, b + 1) === T.STRASSE))) continue;
    for (const [a, b] of kacheln) setze(a, b, T.DEKO);
    const bb = senkrecht ? 1 : 4, hh = senkrecht ? 4 : 1;
    const d = { art: 'bus', kx: x, ky: y, b: bb, h: hh, x: (x + bb / 2) * KACHEL, y: (y + hh / 2) * KACHEL, senkrecht, v: r() };
    deko.push(d); behaelter.push({ id: 'bus' + n, art: 'bus', x: d.x, y: d.y });
    n++;
  }
  for (let n = 0, v = 0; n < 120 && v < 3000; v++) {
    const x = 2 + Math.floor(r() * (BREITE - 4)), y = 2 + Math.floor(r() * (HOEHE - 4));
    if (hole(x, y) !== T.WIESE) continue;
    deko.push({ art: 'busch', kx: x, ky: y, b: 1, h: 1, x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL, v: r() });
    n++;
  }

  // Vektordaten nur fürs Aussehen: echte Gebäudeumrisse, Straßenlinien, Flächen
  const safeBox = haeuser.filter(h => h.safe);
  const vektor = {
    strassen: karte.strassen ?? [], flaechen: karte.flaechen ?? [],
    gebaeude: karte.gebaeude.filter(g => g.umriss?.length >= 6).map(g => ({
      p: g.umriss, typ: g.building ?? 'yes', flaeche: g.flaeche, x: g.x, y: g.y, b: g.b, h: g.h,
      safe: safeBox.some(h => h.x === g.x && h.y === g.y && h.b === g.b && h.h === g.h),
    })),
  };
  for (const h of haeuser) h.umriss = karte.gebaeude.find(g => g.x === h.x && g.y === h.y && g.b === h.b && g.h === h.h)?.umriss;
  // Gärten, Zaunarten und Gartenausstattung (tools/osm_karte.py) – nur fürs Aussehen; das Raster enthält sie schon
  const details = karte.zaunart ? { zaunart: karte.zaunart, garten: karte.garten, objekte: karte.objekte ?? [], zaeune: karte.zaeune ?? null } : null;
  const welt = { seed, karte: true, kacheln: k, hole, haeuser, markt, tor, start, safeRooms, behaelter, deko, vektor: karte.strassen ? vektor : null, details };
  if (karte.zaeune) welt.fein = baueFein(welt, karte);
  return welt;
}

// Feines Kollisionsraster (1 m) aus den echten Umrissen: Häuser nach ihrem OSM-Polygon, Gartenzäune und Hecken nach den
// geglätteten Zaunlinien; alles andere (Safe Rooms, Wasser, Gartenhäuser, Kartenrand, Busse …) wie im groben Raster.
// Wo das grobe Raster begehbar ist und der Kachelmittelpunkt frei liegt, bleibt der Weg offen (Wegsuche bleibt grob).
function baueFein(welt, karte) {
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, f = new Uint8Array(fb * fh);
  const hole = welt.hole, zaunart = welt.details?.zaunart ?? '';
  const safe = new Uint8Array(BREITE * HOEHE);
  for (const h of welt.haeuser) if (h.safe) for (let y = h.y - 1; y <= h.y + h.h; y++) for (let x = h.x - 1; x <= h.x + h.b; x++) if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) safe[y * BREITE + x] = 1;
  const grob = new Uint8Array(BREITE * HOEHE);   // 1 = Kachel wird grob übernommen
  for (const o of welt.details?.objekte ?? []) if (o.a === 'gartenhaus' || o.a === 'pool') for (let y = o.y; y < o.y + (o.h ?? 1); y++) for (let x = o.x; x < o.x + (o.b ?? 1); x++) grob[y * BREITE + x] = 1;
  const kachelFuellen = (kx, ky, wert) => { for (let dy = 0; dy < FEIN; dy++) for (let dx = 0; dx < FEIN; dx++) f[(ky * FEIN + dy) * fb + kx * FEIN + dx] = wert; };
  // 1. grob übernehmen – außer Hauswänden (Polygon) und Gartenzäunen (Linien)
  for (let ky = 0; ky < HOEHE; ky++) for (let kx = 0; kx < BREITE; kx++) {
    const t = hole(kx, ky), i = ky * BREITE + kx;
    if (!BLOCKIERT.has(t)) continue;
    const haus = (t === T.WAND || t === T.LEER) && !safe[i] && !grob[i];
    const zaun = t === T.ZAUN && 'hzmw'.includes(zaunart[i]);
    if (!haus && !zaun) kachelFuellen(kx, ky, 1);
  }
  // 2. Häuser nach ihrem Umriss
  const imPolygon = (px, py, p) => {
    let drin = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > py) !== (p[j + 1] > py) && px < (p[j] - p[i]) * (py - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) drin = !drin;
    return drin;
  };
  for (const g of karte.gebaeude) {
    const p = g.umriss;
    if (!p || p.length < 6) continue;
    if (welt.haeuser.some(h => h.safe && h.x === g.x && h.y === g.y)) continue;
    const kx0 = Math.max(0, g.x - 2), ky0 = Math.max(0, g.y - 2), kx1 = Math.min(BREITE - 1, g.x + g.b + 1), ky1 = Math.min(HOEHE - 1, g.y + g.h + 1);
    for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) {
      const t = hole(kx, ky), i = ky * BREITE + kx;
      if (safe[i] || grob[i] || t === T.STRASSE || t === T.PLATZ || t === T.TUER || t === T.ZAUN) continue;
      // begehbare Kachel, deren Mitte im Haus liegt: offen lassen (sonst bricht die grobe Wegsuche)
      if (!BLOCKIERT.has(t) && imPolygon(kx + 0.5, ky + 0.5, p)) continue;
      for (let dy = 0; dy < FEIN; dy++) for (let dx = 0; dx < FEIN; dx++) {
        if (imPolygon(kx + (dx + 0.5) / FEIN, ky + (dy + 0.5) / FEIN, p)) f[(ky * FEIN + dy) * fb + kx * FEIN + dx] = 3;   // 3 = Hausumriss (am Ende 1)
      }
    }
  }
  // 3. Gartenzäune und Hecken entlang der Linien (Hecken etwas dicker)
  for (const z of karte.zaeune ?? []) {
    const dicke = (z.a === 'h' ? 9 : 6) / KACHEL;   // in Kacheln
    for (let i = 0; i + 3 < z.p.length; i += 2) {
      const ax = z.p[i], ay = z.p[i + 1], bx = z.p[i + 2], by = z.p[i + 3], L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
      const fx0 = Math.max(0, Math.floor((Math.min(ax, bx) - dicke) * FEIN)), fx1 = Math.min(fb - 1, Math.ceil((Math.max(ax, bx) + dicke) * FEIN));
      const fy0 = Math.max(0, Math.floor((Math.min(ay, by) - dicke) * FEIN)), fy1 = Math.min(fh - 1, Math.ceil((Math.max(ay, by) + dicke) * FEIN));
      for (let fy = fy0; fy <= fy1; fy++) for (let fx = fx0; fx <= fx1; fx++) {
        const px = (fx + 0.5) / FEIN, py = (fy + 0.5) / FEIN;
        const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2));
        if (Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py) > dicke) continue;
        const kt = hole(Math.floor(px), Math.floor(py));
        if (kt === T.TUER || kt === T.STRASSE) continue;
        if (!f[fy * fb + fx]) f[fy * fb + fx] = 2;
      }
    }
  }
  // 4. vor jeder Haustür einen Zugang freihalten (Türkachel und die zwei Kacheln davor)
  for (const h of welt.haeuser) {
    if (!h.tuer) continue;
    for (let s = 0; s <= 2; s++) {
      const kx = h.tuer.x + h.raus.dx * s, ky = h.tuer.y + h.raus.dy * s;
      if (kx < 0 || ky < 0 || kx >= BREITE || ky >= HOEHE || (s > 0 && BLOCKIERT.has(hole(kx, ky)))) break;
      kachelFuellen(kx, ky, 0);
    }
  }
  // 5. jede Tür muss ohne Klettern erreichbar sein: Durchgang mit Spielerbreite prüfen, sonst Zaun auf dem kürzesten Weg öffnen
  zugaengeOeffnen(f, fb, fh, welt);
  for (let i = 0; i < f.length; i++) if (f[i] === 3) f[i] = 1;
  return f;
}

function zugaengeOeffnen(f, fb, fh, welt) {
  const W2 = 2;   // Spielerradius 12 px ≈ 1,5 Feinfelder → Fenster ±2
  // frei[c] = im Fenster um c kein Hindernis (getrennt für Zäune und feste Dinge)
  const fenster = (bed) => {
    const zeile = new Uint8Array(fb * fh), aus = new Uint8Array(fb * fh);
    for (let y = 0; y < fh; y++) { let n = 0; for (let x = -W2; x < fb; x++) { if (x + W2 < fb && bed(f[y * fb + x + W2])) n++; if (x - W2 - 1 >= 0 && bed(f[y * fb + x - W2 - 1])) n--; if (x >= 0) zeile[y * fb + x] = n > 0 ? 1 : 0; } }
    for (let x = 0; x < fb; x++) { let n = 0; for (let y = -W2; y < fh; y++) { if (y + W2 < fh && zeile[(y + W2) * fb + x]) n++; if (y - W2 - 1 >= 0 && zeile[(y - W2 - 1) * fb + x]) n--; if (y >= 0) aus[y * fb + x] = n > 0 ? 1 : 0; } }
    return aus;
  };
  const belegt = fenster(v => v !== 0), fest = fenster(v => v === 1), umriss = fenster(v => v === 3);
  const start = Math.floor(welt.start.y / FEIN_PX) * fb + Math.floor(welt.start.x / FEIN_PX);
  const erreicht = new Uint8Array(fb * fh), q = [start]; erreicht[start] = 1;
  const nach = c => { const x = c % fb, y = (c - x) / fb, r = []; if (x > 0) r.push(c - 1); if (x < fb - 1) r.push(c + 1); if (y > 0) r.push(c - fb); if (y < fh - 1) r.push(c + fb); return r; };
  for (let i = 0; i < q.length; i++) for (const n of nach(q[i])) if (!erreicht[n] && !belegt[n]) { erreicht[n] = 1; q.push(n); }
  for (const h of welt.haeuser) {
    if (!h.tuer || !(h.betretbar || h.safe)) continue;
    // Vorplatz (gut eine Kachel vor der Tür, freigehalten) muss erreichbar sein
    const vx = Math.floor((h.tuer.x + 0.5 + h.raus.dx * 1.3) * FEIN), vy = Math.floor((h.tuer.y + 0.5 + h.raus.dy * 1.3) * FEIN);
    const ziel = vy * fb + vx;
    if ([0, -1, -fb, -fb - 1, 1, fb].some(d => erreicht[ziel + d])) continue;
    // Suche: freie Felder kosten 0, Zaun 1, Hausumriss 6 (notfalls ein Stück freigeben); grob feste Dinge sind tabu
    const kosten = new Map([[ziel, 0]]), vor = new Map(), dq = [ziel];
    const preis = n => !belegt[n] ? 0 : umriss[n] ? 6 : 1;
    let gefunden = -1;
    while (dq.length) {
      const c = dq.shift();
      if (erreicht[c]) { gefunden = c; break; }
      for (const n of nach(c)) {
        if (fest[n]) continue;   // zu nah an festen Dingen: dort passt die Figur nicht durch
        const k = kosten.get(c) + preis(n);
        if (k < (kosten.get(n) ?? Infinity)) { kosten.set(n, k); vor.set(n, c); if (preis(n)) dq.push(n); else dq.unshift(n); }
      }
    }
    for (let c = gefunden; c !== undefined && c !== ziel; c = vor.get(c)) {
      const x = c % fb, y = (c - x) / fb;
      for (let dy = -W2; dy <= W2; dy++) for (let dx = -W2; dx <= W2; dx++) { const i = (y + dy) * fb + x + dx; if (f[i] === 2 || f[i] === 3) f[i] = 0; }
    }
  }
}
