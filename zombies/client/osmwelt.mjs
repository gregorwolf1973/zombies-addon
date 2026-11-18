// Spielwelt aus einer umgerechneten OpenStreetMap-Karte (tools/osm_karte.py).
// Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0.
import { KACHEL, BREITE, HOEHE, T, zufall } from './welt.mjs';

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
  for (let n = 0, v = 0; n < autos && v < autos * 20; v++) {
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
  return { seed, karte: true, kacheln: k, hole, haeuser, markt, tor, start, safeRooms, behaelter, deko, vektor: karte.strassen ? vektor : null, details };
}
