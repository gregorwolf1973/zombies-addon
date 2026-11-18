// Gemeinsame Spielwelt für Server und Browser.
// Aus demselben Seed entsteht auf beiden Seiten dieselbe Karte, deshalb muss
// der Server die Karte nicht übertragen.

export const KACHEL = 32;
// Kartengröße in Kacheln. Für Karten aus OpenStreetMap wird sie vor dem Bauen der Welt gesetzt
// (live gebundene Exporte: alle Module sehen den neuen Wert).
export let BREITE = 64;
export let HOEHE = 48;
export function setzeKartengroesse(b, h) { BREITE = b; HOEHE = h; }
// Seite der Haustür für den Innenraum-Generator (aus der Austrittsrichtung)
// Art eines Gebäudes für Einrichtung und Funde (aus den OSM-Tags shop/amenity)
const LADEN_ARTEN = {
  lebensmittel: ['supermarket', 'beverages', 'convenience', 'bakery', 'butcher', 'kiosk', 'greengrocer'],
  apotheke: ['pharmacy', 'chemist', 'doctors', 'dentist', 'medical_supply'],
  kaufhaus: ['variety_store', 'department_store', 'toys', 'clothes', 'sports', 'shoes', 'outdoor', 'second_hand', 'bag', 'hardware', 'doityourself'],
  gaststaette: ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream'],
};
export function ladenArt(h) {
  const a = h?.art ?? '';
  for (const [kat, liste] of Object.entries(LADEN_ARTEN)) if (liste.includes(a)) return kat;
  return '';
}
export function seiteVon(h) {
  const r = h?.raus ?? { dx: 0, dy: 1 };
  return r.dy < 0 ? 'oben' : r.dy > 0 ? 'unten' : r.dx < 0 ? 'links' : 'rechts';
}

export const T = {
  WIESE: 0, STRASSE: 1, WAND: 2, BODEN: 3, TUER: 4,
  WASSER: 5, BAUM: 6, PLATZ: 7, ZAUN: 8, TOR: 9, DEKO: 10,
  // Innenräume
  INNENTUER: 11,      // geschlossene Zimmertür (blockiert, verdeckt die Sicht)
  AUSGANG: 12,        // Haustür von innen: führt nach draußen
  TREPPE_RUNTER: 13,  // in den Keller
  TREPPE_HOCH: 14,    // ins Dachgeschoss bzw. aus dem Keller hinauf
  MOEBEL: 15,         // Möbel (blockiert, Sicht frei)
  LEER: 16,           // außerhalb des Hauses
  TUER_OFFEN: 17,     // geöffnete Zimmertür
};

// Bäume sind kein Hindernis (man kann sich darunter verstecken – die Krone verdeckt die Sicht)
export const BLOCKIERT = new Set([T.WAND, T.WASSER, T.ZAUN, T.TOR, T.DEKO, T.INNENTUER, T.MOEBEL, T.LEER]);

export function zufall(seed) {
  // mulberry32: klein und auf allen Plattformen gleich
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function baueWelt(seed) {
  const r = zufall(seed);
  const k = new Uint8Array(BREITE * HOEHE);
  const setze = (x, y, v) => { if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) k[y * BREITE + x] = v; };
  const hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? k[y * BREITE + x] : T.ZAUN;

  // Ortsrand: Zaun rundherum, im Osten die Isar
  for (let x = 0; x < BREITE; x++) { setze(x, 0, T.ZAUN); setze(x, HOEHE - 1, T.ZAUN); }
  for (let y = 0; y < HOEHE; y++) { setze(0, y, T.ZAUN); }
  for (let y = 0; y < HOEHE; y++) {
    const ufer = BREITE - 6 + Math.round(Math.sin(y / 5) * 1.5);
    for (let x = ufer; x < BREITE; x++) setze(x, y, T.WASSER);
  }

  // Straßennetz: zwei Hauptstraßen und Querstraßen
  const strassenX = [8, 22, 36, 48];
  const strassenY = [8, 23, 38];
  for (const sx of strassenX) for (let y = 1; y < HOEHE - 1; y++) { setze(sx, y, T.STRASSE); setze(sx + 1, y, T.STRASSE); }
  for (const sy of strassenY) for (let x = 1; x < BREITE - 7; x++) { setze(x, sy, T.STRASSE); setze(x, sy + 1, T.STRASSE); }

  // Marktplatz in der Mitte
  const markt = { x: 25, y: 18, b: 9, h: 9 };
  for (let y = markt.y; y < markt.y + markt.h; y++)
    for (let x = markt.x; x < markt.x + markt.b; x++) setze(x, y, T.PLATZ);

  // Tor am westlichen Ortsausgang (Level-Ziel)
  const tor = { x: 0, y: 23 };
  setze(0, 23, T.TOR); setze(0, 24, T.TOR);

  // Häuser in die Blöcke zwischen den Straßen
  const haeuser = [];
  const xs = [1, ...strassenX.map(s => s + 2)], xe = [...strassenX, BREITE - 8];
  const ys = [1, ...strassenY.map(s => s + 2)], ye = [...strassenY, HOEHE - 2];
  for (let bi = 0; bi < xs.length; bi++) {
    for (let bj = 0; bj < ys.length; bj++) {
      const bx0 = xs[bi] + 1, bx1 = xe[bi] - 1, by0 = ys[bj] + 1, by1 = ye[bj] - 1;
      const hoehe = by1 - by0 + 1;
      // zwei Häuserreihen, wenn der Block hoch genug ist, sonst eine
      const reihen = hoehe >= 9 ? ['oben', 'unten'] : hoehe >= 4 ? [r() < 0.5 ? 'oben' : 'unten'] : [];
      for (const reihe of reihen) {
        let x = bx0 + Math.floor(r() * 2);
        while (x <= bx1 - 4) {
          const b = Math.min(bx1 - x + 1, 5 + Math.floor(r() * 4));
          const h = Math.min(reihen.length === 2 ? Math.floor((hoehe - 1) / 2) : hoehe, 4 + Math.floor(r() * 3));
          if (b < 5 || h < 4) break;
          if (r() < 0.15) { x += 3; continue; }   // ab und zu eine Lücke (Garten)
          const y = reihe === 'oben' ? by0 : by1 - h + 1;
          let platz = true;
          for (let dy = -1; dy <= h && platz; dy++) for (let dx = 0; dx < b; dx++) {
            const t = hole(x + dx, y + dy);
            if ((dy >= 0 && dy < h && t !== T.WIESE) || t === T.WAND || t === T.TUER) { platz = false; break; }
          }
          if (!platz) { x += 2; continue; }
          for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < b; dx++) {
            const rand = dx === 0 || dy === 0 || dx === b - 1 || dy === h - 1;
            setze(x + dx, y + dy, rand ? T.WAND : T.BODEN);
          }
          // Tür zur Straße hin
          const tuer = { x: x + 1 + Math.floor(r() * (b - 2)), y: reihe === 'oben' ? y : y + h - 1 };
          setze(tuer.x, tuer.y, T.TUER);
          haeuser.push({ x, y, b, h, tuer });
          x += b + 1 + Math.floor(r() * 2);
        }
      }
    }
  }

  // Bäume auf freie Wiese
  for (let i = 0; i < 140; i++) {
    const x = 1 + Math.floor(r() * (BREITE - 8)), y = 1 + Math.floor(r() * (HOEHE - 2));
    const nebenTuer = [[1,0],[-1,0],[0,1],[0,-1]].some(([a, c]) => hole(x + a, y + c) === T.TUER);
    if (!nebenTuer && hole(x, y) === T.WIESE && hole(x + 1, y) === T.WIESE && hole(x, y + 1) === T.WIESE) setze(x, y, T.BAUM);
  }

  const start = { x: (markt.x + markt.b / 2) * KACHEL, y: (markt.y + markt.h / 2) * KACHEL };

  // Safe Rooms: vier Häuser an festen Gegenden des Orts
  const r2 = zufall(seed ^ 0x9e3779b9);
  const safeOrte = [
    { name: 'Feuerwehrhaus', x: markt.x + markt.b / 2, y: markt.y + markt.h / 2 },
    { name: 'Sakristei', x: 12, y: 40 },
    { name: 'Lagerraum', x: 50, y: 10 },
    { name: 'Keller', x: 48, y: 42 },
  ];
  const safeRooms = [];
  for (const ort of safeOrte) {
    let best = null, bd = Infinity;
    for (const h of haeuser) {
      if (h.safe) continue;
      const d = Math.hypot(h.x + h.b / 2 - ort.x, h.y + h.h / 2 - ort.y);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) continue;
    best.safe = ort.name;
    const id = 's' + safeRooms.length;
    best.safeId = id;
    // Vorratskiste in die Ecke gegenüber der Tür
    const kx = best.tuer.x - best.x < best.b / 2 ? best.x + best.b - 2 : best.x + 1;
    const ky = best.tuer.y === best.y ? best.y + best.h - 2 : best.y + 1;
    const innen = { x: (best.x + best.b / 2) * KACHEL, y: (best.y + best.h / 2) * KACHEL };
    safeRooms.push({ id, name: ort.name, haus: best, kiste: { x: (kx + 0.5) * KACHEL, y: (ky + 0.5) * KACHEL }, innen });
  }

  // Behälter zum Durchsuchen: in Häusern an den Wänden, Autos am Straßenrand
  const behaelter = [];
  const arten = ['schrank', 'kuehlschrank', 'spind'];
  for (const h of haeuser) {
    const plaetze = [];
    for (let y = h.y + 1; y <= h.y + h.h - 2; y++) for (let x = h.x + 1; x <= h.x + h.b - 2; x++) {
      const anWand = x === h.x + 1 || x === h.x + h.b - 2 || y === h.y + 1 || y === h.y + h.h - 2;
      const vorTuer = Math.abs(x - h.tuer.x) <= 1 && Math.abs(y - h.tuer.y) <= 1;
      const kiste = h.safe && safeRooms.find(s => s.haus === h && Math.floor(s.kiste.x / KACHEL) === x && Math.floor(s.kiste.y / KACHEL) === y);
      if (anWand && !vorTuer && !kiste) plaetze.push([x, y]);
    }
    const anzahl = Math.min(plaetze.length, h.safe ? 1 : 1 + Math.floor(r2() * 2));
    for (let i = 0; i < anzahl; i++) {
      const [x, y] = plaetze.splice(Math.floor(r2() * plaetze.length), 1)[0];
      behaelter.push({ id: 'b' + behaelter.length, art: arten[Math.floor(r2() * arten.length)], x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL });
    }
  }
  for (let i = 0, versuche = 0; i < 14 && versuche < 400; versuche++) {
    const senkrecht = r2() < 0.5;
    const sx = strassenX[Math.floor(r2() * strassenX.length)], sy = strassenY[Math.floor(r2() * strassenY.length)];
    const x = senkrecht ? sx + (r2() < 0.5 ? 0 : 1) : 2 + Math.floor(r2() * (BREITE - 12));
    const y = senkrecht ? 2 + Math.floor(r2() * (HOEHE - 4)) : sy + (r2() < 0.5 ? 0 : 1);
    if (hole(x, y) !== T.STRASSE) continue;
    // nicht auf Kreuzungen und nicht zu nah an anderen Autos
    const kreuzung = strassenX.some(s => x >= s && x <= s + 1) && strassenY.some(s => y >= s && y <= s + 1);
    const px = (x + 0.5) * KACHEL, py = (y + 0.5) * KACHEL;
    if (kreuzung || behaelter.some(b => b.art === 'auto' && Math.hypot(b.x - px, b.y - py) < KACHEL * 4)) continue;
    behaelter.push({ id: 'b' + behaelter.length, art: 'auto', x: px, y: py, senkrecht, farbe: Math.floor(r2() * 6) });
    i++;
  }

  const deko = baueDeko(seed, k, setze, hole, haeuser, markt, start, behaelter, tor, safeRooms);
  deko.filter(d => d.art === 'bus').forEach((d, i) => behaelter.push({ id: 'bus' + i, art: 'bus', x: d.x, y: d.y }));
  const imHaus = (b, h) => b.x >= h.x * KACHEL && b.x < (h.x + h.b) * KACHEL && b.y >= h.y * KACHEL && b.y < (h.y + h.h) * KACHEL;
  const draussenBehaelter = behaelter.filter(b => b.art === 'auto' || haeuser.some(h => h.safe && imHaus(b, h)));
  haeuser.forEach((h, i) => {
    h.nr = i; h.betretbar = !h.safe;
    h.raus = { dx: 0, dy: h.tuer.y === h.y ? -1 : 1 };
    // das Innere betretbarer Häuser ist ein eigener Innenraum – die Außenhülle ist nicht begehbar
    if (h.betretbar) for (let y = h.y + 1; y < h.y + h.h - 1; y++) for (let x = h.x + 1; x < h.x + h.b - 1; x++) setze(x, y, T.LEER);
  });
  return { seed, kacheln: k, hole, haeuser, markt, tor, start, safeRooms, behaelter: draussenBehaelter, deko };
}

// Hindernisse (Traktor, Heu, Kühe …) und Zäune. Jedes Stück wird verworfen, wenn es einen Teil
// der begehbaren Fläche abschneiden würde.
const BEGEHBAR = new Set([T.WIESE, T.STRASSE, T.BODEN, T.TUER, T.PLATZ, T.BAUM]);
function baueDeko(seed, k, setze, hole, haeuser, markt, start, behaelter, tor, safeRooms) {
  const r = zufall(seed ^ 0x2545f491);
  const sx = Math.floor(start.x / KACHEL), sy = Math.floor(start.y / KACHEL);
  const erreichbar = () => {
    const ok = new Uint8Array(BREITE * HOEHE);
    const q = [sy * BREITE + sx]; ok[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % BREITE, y = (q[i] - x) / BREITE;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = ny * BREITE + nx;
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || ok[j] || !BEGEHBAR.has(hole(nx, ny))) continue;
        ok[j] = 1; q.push(j);
      }
    }
    return q.length;
  };
  let zahl = erreichbar();
  // versucht Kacheln zu belegen; bleibt die Fläche (bis auf die belegten Kacheln) erreichbar, gilt es
  const versuche = (kacheln, typ) => {
    if (kacheln.some(([x, y]) => hole(x, y) !== T.WIESE)) return false;
    for (const [x, y] of kacheln) setze(x, y, typ);
    const neu = erreichbar();
    if (neu < zahl - kacheln.length) { for (const [x, y] of kacheln) setze(x, y, T.WIESE); return false; }
    zahl = neu; return true;
  };
  const frei3 = (x, y, b = 1, h = 1) => {
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= b; dx++) if (hole(x + dx, y + dy) !== T.WIESE) return false;
    return true;
  };
  const deko = [];
  const px = (x, b) => (x + b / 2) * KACHEL;

  // Maibaum (zwei Kacheln über der Marktmitte, damit der Startplatz frei bleibt) und Biertische
  const mx = Math.floor(markt.x + markt.b / 2), my = Math.floor(markt.y + markt.h / 2) - 2;
  setze(mx, my, T.DEKO); deko.push({ art: 'maibaum', kx: mx, ky: my, b: 1, h: 1, x: px(mx, 1), y: (my + 1) * KACHEL - 4 });
  for (const [bx, by] of [[markt.x + 1, markt.y + 1], [markt.x + markt.b - 3, markt.y + markt.h - 2]]) {
    setze(bx, by, T.DEKO); setze(bx + 1, by, T.DEKO);
    deko.push({ art: 'biertisch', kx: bx, ky: by, b: 2, h: 1, x: px(bx, 2), y: (by + 0.5) * KACHEL });
  }
  zahl = erreichbar();

  // Gartenzäune um einige Häuser, mit Gartentor vor der Haustür
  const kandidaten = haeuser.filter(h => !h.safe);
  for (let n = 0, i = 0; n < 6 && i < 40; i++) {
    const h = kandidaten[Math.floor(r() * kandidaten.length)];
    if (!h || h.zaun) continue;
    const ring = [];
    for (let x = h.x - 1; x <= h.x + h.b; x++) { ring.push([x, h.y - 1]); ring.push([x, h.y + h.h]); }
    for (let y = h.y; y < h.y + h.h; y++) { ring.push([h.x - 1, y]); ring.push([h.x + h.b, y]); }
    const torY = h.tuer.y === h.y ? h.y - 1 : h.y + h.h;
    const zaun = ring.filter(([x, y]) => hole(x, y) === T.WIESE && !(y === torY && Math.abs(x - h.tuer.x) <= 1));
    if (zaun.length < 6) continue;
    if (versuche(zaun, T.ZAUN)) { h.zaun = true; n++; }
  }

  // Weide mit Zaun und Gatter, darin Kühe
  const plaetze = [];
  for (let y = 2; y < HOEHE - 8; y++) for (let x = 2; x < BREITE - 16; x++) {
    let ok = true;
    for (let dy = 0; dy < 5 && ok; dy++) for (let dx = 0; dx < 6; dx++) if (hole(x + dx, y + dy) !== T.WIESE) { ok = false; break; }
    if (ok) plaetze.push([x, y]);
  }
  let weide = null;
  for (let v = 0; v < 20 && plaetze.length && !weide; v++) {
    const [wx, wy] = plaetze[Math.floor(r() * plaetze.length)];
    const ring = [];
    for (let x = wx; x < wx + 6; x++) { ring.push([x, wy]); ring.push([x, wy + 4]); }
    for (let y = wy + 1; y < wy + 4; y++) { ring.push([wx, y]); ring.push([wx + 5, y]); }
    const gatter = ring.filter(([x, y]) => !(y === wy + 4 && (x === wx + 2 || x === wx + 3)));
    if (versuche(gatter, T.ZAUN)) weide = { x: wx, y: wy };
  }
  if (weide) {
    for (const [dx, dy] of [[1, 1], [2, 2]]) {
      const x = weide.x + dx, y = weide.y + dy;
      if (versuche([[x, y], [x + 1, y]], T.DEKO)) deko.push({ art: 'kuh', kx: x, ky: y, b: 2, h: 1, x: px(x, 2), y: (y + 0.5) * KACHEL, v: r() });
    }
  }

  // einzelne Hindernisse auf freien Wiesen
  const setzeEinzeln = (art, anzahl, b, h) => {
    for (let n = 0, i = 0; n < anzahl && i < 300; i++) {
      const x = 2 + Math.floor(r() * (BREITE - 12)), y = 2 + Math.floor(r() * (HOEHE - 4));
      if (!frei3(x, y, b, h)) continue;
      if (deko.some(d => Math.abs(d.kx - x) < 4 && Math.abs(d.ky - y) < 4)) continue;
      const kacheln = [];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < b; dx++) kacheln.push([x + dx, y + dy]);
      if (art !== 'busch' && !versuche(kacheln, T.DEKO)) continue;
      deko.push({ art, kx: x, ky: y, b, h, x: px(x, b), y: (y + h / 2) * KACHEL, v: r() });
      n++;
    }
  };
  setzeEinzeln('traktor', 1, 2, 2);
  setzeEinzeln('heu', 4, 1, 1);
  setzeEinzeln('kuh', 3, 2, 1);
  setzeEinzeln('vogelscheuche', 1, 1, 1);
  setzeEinzeln('fels', 3, 1, 1);
  setzeEinzeln('busch', 5, 1, 1);    // Büsche bleiben begehbar
  // Busse: auf einer Fahrspur einer geraden Straße, nie auf Kreuzungen
  for (let n = 0, i = 0; n < 3 && i < 400; i++) {
    const senkrecht = r() < 0.5;
    const x = 2 + Math.floor(r() * (BREITE - 12)), y = 2 + Math.floor(r() * (HOEHE - 6));
    const kacheln = [];
    for (let j = 0; j < 4; j++) kacheln.push(senkrecht ? [x, y + j] : [x + j, y]);
    // Spur: auf Straße, daneben (quer) ebenfalls Straße (zweite Spur bleibt frei), Kreuzungsfrei
    const ok = kacheln.every(([a, b]) => hole(a, b) === T.STRASSE
      && (senkrecht ? (hole(a - 1, b) === T.STRASSE) !== (hole(a + 1, b) === T.STRASSE) : (hole(a, b - 1) === T.STRASSE) !== (hole(a, b + 1) === T.STRASSE)));
    if (!ok || deko.some(d => Math.abs(d.kx - x) < 8 && Math.abs(d.ky - y) < 8)) continue;
    // nicht auf geparkte Autos
    if (behaelter.some(bh => kacheln.some(([a, b]) => Math.abs(Math.floor(bh.x / KACHEL) - a) <= 1 && Math.abs(Math.floor(bh.y / KACHEL) - b) <= 1))) continue;
    for (const [a, b] of kacheln) setze(a, b, T.DEKO);
    if (erreichbar() < zahl - 4) { for (const [a, b] of kacheln) setze(a, b, T.STRASSE); continue; }
    zahl = erreichbar();
    const b = senkrecht ? 1 : 4, hh = senkrecht ? 4 : 1;
    deko.push({ art: 'bus', kx: x, ky: y, b, h: hh, x: px(x, b), y: (y + hh / 2) * KACHEL, senkrecht, v: r() });
    n++;
  }
  return deko;
}

// Safe Room, in dem der Punkt liegt (Innenraum oder Tür), sonst null
export function safeRoomAn(welt, x, y) {
  const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
  for (const s of welt.safeRooms) {
    const h = s.haus;
    if (kx >= h.x && kx < h.x + h.b && ky >= h.y && ky < h.y + h.h) {
      const t = welt.hole(kx, ky);
      if (t === T.BODEN || t === T.TUER) return s;
    }
  }
  return null;
}

// Ändert sich die Kartenerzeugung, passen gespeicherte Behälter nicht mehr
export const WELT_VERSION = 4;

// ---------- Gegenstände ----------
export const DINGE = {
  wasser: { name: 'Wasser', zeichen: '💧' },
  essen: { name: 'Konserve', zeichen: '🥫' },
  verband: { name: 'Verbandskasten', zeichen: '🩹' },
  bretter: { name: 'Bretter', zeichen: '🪵' },
  pistole: { name: 'Pistole', zeichen: '🔫', waffe: true },
  schlaeger: { name: 'Baseballschläger', zeichen: '🏏', waffe: true },
  munition: { name: 'Munition', zeichen: '🧰' },
  spritze: { name: 'Rettungsspritze', zeichen: '💉' },
  schluessel: { name: 'Schlüsselbund', zeichen: '🔑' },
  brechstange: { name: 'Brechstange', zeichen: '⚒️' },
  messer: { name: 'Messer', zeichen: '🔪', waffe: true },
  schrotflinte: { name: 'Schrotflinte', zeichen: '💥', waffe: true },
  gewehr: { name: 'Jagdgewehr', zeichen: '🎯', waffe: true },
  sense: { name: 'Sense', zeichen: '🌾', waffe: true },
  kleidung: { name: 'Feste Kleidung', zeichen: '🧥' },
  seil: { name: 'Seil', zeichen: '🪢' },
  taschenlampe: { name: 'Taschenlampe', zeichen: '🔦' },
  schokoriegel: { name: 'Schokoriegel', zeichen: '🍫' },
  tasche: { name: 'Sporttasche (12 Plätze)', zeichen: '👜', plaetze: 12 },
  trekking: { name: 'Trekkingrucksack (16 Plätze)', zeichen: '🎒', plaetze: 16 },
};
export const BODEN_DAUER = 180;      // weggeworfene Gegenstände bleiben 3 Minuten liegen
export const TAUSCH_ABSTAND = 34;    // so nah muss man sich sein (berühren), um zu tauschen
// Beute bei toten Zombies: selten (etwa jeder 20.) eine Waffe, sonst oft Alltagszeug
export const LEICHE_SELTEN = ['pistole', 'munition', 'messer', 'schrotflinte'];
export const LEICHE_OFT = ['kleidung', 'seil', 'taschenlampe', 'schokoriegel'];
export const LEICHE_DAUER = 180;      // Sekunden, die eine Leiche liegen bleibt
export const LEICHEN_MAX = 30;
export const RUCKSACK_PLAETZE = 8;   // Grundausstattung; größere Taschen erhöhen p.plaetze
export const KISTE_PLAETZE = 24;
export const BEHAELTER_NAME = { schrank: 'Schrank', kuehlschrank: 'Kühlschrank', spind: 'Spind', auto: 'Kofferraum', leiche: 'Zombie', bus: 'Bus',
  laden: 'Regal', laden_lebensmittel: 'Regal', laden_apotheke: 'Regal', laden_kaufhaus: 'Regal', laden_gaststaette: 'Küchenregal' };
export const BEUTE = {
  kuehlschrank: ['wasser', 'wasser', 'essen', 'essen', 'essen', null],
  schrank: ['verband', 'bretter', 'bretter', 'essen', 'munition', 'spritze', 'schluessel', 'kleidung', 'brechstange', 'sense', null, null],
  spind: ['munition', 'munition', 'verband', 'schlaeger', 'bretter', 'pistole', 'spritze', 'tasche', 'trekking', 'brechstange', 'seil', 'gewehr', 'schrotflinte', null, null],
  // Kofferraum geht nur mit Brechstange auf – darum liegt drin keine, dafür etwas mehr Gutes
  auto: ['wasser', 'verband', 'munition', 'munition', 'bretter', 'essen', 'spritze', 'tasche', 'taschenlampe', 'schrotflinte', null],
  laden_lebensmittel: ['essen', 'essen', 'essen', 'wasser', 'wasser', 'wasser', 'schokoriegel', 'schokoriegel', null],
  laden_apotheke: ['verband', 'verband', 'verband', 'spritze', 'spritze', 'kleidung', null, null],
  laden_kaufhaus: ['tasche', 'tasche', 'trekking', 'trekking', 'taschenlampe', 'taschenlampe', 'seil', 'kleidung', 'kleidung', 'messer', 'brechstange', null],
  laden_gaststaette: ['essen', 'essen', 'wasser', 'wasser', 'messer', 'schokoriegel', null],
  laden: ['essen', 'wasser', 'schokoriegel', null, null],
  bus: ['wasser', 'wasser', 'essen', 'schokoriegel', 'tasche', 'trekking', 'kleidung', 'verband', 'taschenlampe', null],
};
export const MUNITION_PRO_FUND = 12;

// Fundhäufigkeit je Gegenstand einstellbar: 10 = normal, 0 = nie, 20 = doppelt so oft.
// Zieht aus einer Beutetabelle (Einträge mit Wiederholungen, null = nichts) mit Gewichten.
export function ziehe(tabelle, faktoren, rnd) {
  let summe = 0;
  const gewichte = tabelle.map(d => { const g = d ? (faktoren?.[d] ?? 10) / 10 : 1; summe += g; return g; });
  if (summe <= 0) return null;
  let r = rnd() * summe;
  for (let i = 0; i < tabelle.length; i++) { r -= gewichte[i]; if (r < 0) return tabelle[i]; }
  return null;
}
export const AKTION_ABSTAND = 40;
export const INFEKTION_DAUER = 5400;   // 90 Minuten bis zur Verwandlung
export const ZOMBIE_ZEIT = 180;        // so lange spielt man als Zombie gegen die anderen

export function blockiert(welt, px, py) {
  return BLOCKIERT.has(welt.hole(Math.floor(px / KACHEL), Math.floor(py / KACHEL)));
}

// Kreis mit Radius rad frei? (prüft die vier Ecken des umschließenden Quadrats)
export function frei(welt, x, y, rad) {
  return !blockiert(welt, x - rad, y - rad) && !blockiert(welt, x + rad, y - rad)
      && !blockiert(welt, x - rad, y + rad) && !blockiert(welt, x + rad, y + rad);
}

// Bewegen mit Gleiten an Wänden: erst x, dann y getrennt
export function bewege(welt, obj, dx, dy, rad) {
  const gehtX = dx && frei(welt, obj.x + dx, obj.y, rad);
  if (gehtX) obj.x += dx;
  const gehtY = dy && frei(welt, obj.x, obj.y + dy, rad);
  if (gehtY) obj.y += dy;
  // Ecken-Hilfe: wer fast gerade gegen eine Wand läuft und knapp daneben
  // einen Durchgang (Tür) hat, wird seitlich hineingeschoben
  const EINRASTEN = KACHEL * 0.5;
  if (dy && !gehtY && Math.abs(dx) < Math.abs(dy) * 0.4) {
    for (let off = 2; off <= EINRASTEN; off += 2) {
      for (const s of [1, -1]) {
        if (frei(welt, obj.x + s * off, obj.y + dy, rad) && frei(welt, obj.x + s * Math.min(off, Math.abs(dy)), obj.y, rad)) {
          obj.x += s * Math.min(off, Math.abs(dy));
          return;
        }
      }
    }
  }
  if (dx && !gehtX && Math.abs(dy) < Math.abs(dx) * 0.4) {
    for (let off = 2; off <= EINRASTEN; off += 2) {
      for (const s of [1, -1]) {
        if (frei(welt, obj.x + dx, obj.y + s * off, rad) && frei(welt, obj.x, obj.y + s * Math.min(off, Math.abs(dx)), rad)) {
          obj.y += s * Math.min(off, Math.abs(dx));
          return;
        }
      }
    }
  }
}

// Freie Sichtlinie zwischen zwei Punkten (Wände und Bäume verdecken)
export function sichtfrei(welt, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (KACHEL / 3));
  for (let i = 1; i < n; i++) {
    const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
    const t = welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL));
    if (t === T.WAND || t === T.BAUM || t === T.INNENTUER || t === T.LEER) return false;
  }
  return true;
}

// Ist der Punkt in einem Haus (Boden oder Tür)?
export function drinnen(welt, x, y) {
  const t = welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL));
  return t === T.BODEN || t === T.TUER;
}

// Spielwerte, die Server und Client kennen müssen
export const WERTE = {
  spielerRadius: 11,
  zombieRadius: 11,
  tempoGehen: 150,      // px/s
  tempoSchleichen: 70,
  zombieTempoWandern: 30,
  zombieTempoJagen: 105,
  sichtWeite: 170,
  sichtWeiteSchleichen: 95,
  sichtWinkel: Math.PI / 2.4,   // ganzer Kegel ~75°
  hoerweiteSchuss: 380,
  hoerweiteRennen: 110,
  pistoleReichweite: 230,
  nahkampfReichweite: 34,
  aufhelfenAbstand: 40,
  aufhelfenDauer: 3,      // s
};

// Anzahl Bewaffneter und Zombies nach Spielerzahl (Konzept: 40 % bewaffnet)
export function bewaffnetSoll(n) { return Math.ceil(n * 0.4); }
export function zombieSoll(n) {
  const anteil = n <= 2 ? 0.3 : n <= 5 ? 0.3 + (n - 2) * 0.083 : n <= 7 ? 0.55 + (n - 5) * 0.1 : 0.75 + (n - 7) * 0.083;
  return Math.round(45 * Math.min(1, anteil));
}

// ---------- Wegsuche (für Bots) ----------
export const BEGEHBAR_WEG = new Set([T.WIESE, T.STRASSE, T.BODEN, T.TUER, T.PLATZ, T.BAUM, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH, T.TUER_OFFEN]);

// gerade Strecke mit Radius rad frei?
export function linieFrei(welt, x1, y1, x2, y2, rad) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i <= n; i++) {
    if (!frei(welt, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, rad)) return false;
  }
  return true;
}

// Breitensuche über Kacheln; liefert Wegpunkte (Pixel), schon mit Abkürzungen über freie Strecken
export function findeWeg(welt, vonX, vonY, nachX, nachY, rad = 11, maxKnoten = Infinity) {
  const sx = Math.floor(vonX / KACHEL), sy = Math.floor(vonY / KACHEL);
  const zx = Math.floor(nachX / KACHEL), zy = Math.floor(nachY / KACHEL);
  if (!BEGEHBAR_WEG.has(welt.hole(zx, zy))) return null;
  const vor = new Int32Array(BREITE * HOEHE).fill(-1);
  const start = sy * BREITE + sx, ziel = zy * BREITE + zx;
  vor[start] = start;
  const q = [start];
  for (let k = 0; k < q.length && k < maxKnoten; k++) {
    const i = q[k];
    if (i === ziel) break;
    const x = i % BREITE, y = (i - x) / BREITE;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
      const j = ny * BREITE + nx;
      if (vor[j] !== -1 || !BEGEHBAR_WEG.has(welt.hole(nx, ny))) continue;
      vor[j] = i; q.push(j);
    }
  }
  if (vor[ziel] === -1) return null;
  const kacheln = [];
  for (let i = ziel; i !== start; i = vor[i]) kacheln.push(i);
  kacheln.reverse();
  const punkte = kacheln.map(i => ({ x: (i % BREITE + 0.5) * KACHEL, y: (Math.floor(i / BREITE) + 0.5) * KACHEL }));
  punkte.push({ x: nachX, y: nachY });
  // Abkürzen: von jedem Punkt so weit wie möglich geradeaus
  const glatt = [];
  let ax = vonX, ay = vonY, i = 0;
  while (i < punkte.length) {
    let j = punkte.length - 1;
    while (j > i && !linieFrei(welt, ax, ay, punkte[j].x, punkte[j].y, rad)) j--;
    glatt.push(punkte[j]);
    ax = punkte[j].x; ay = punkte[j].y; i = j + 1;
  }
  return glatt;
}

// ---------- Tag und Nacht (Server und Browser rechnen gleich) ----------
// uhr = Spielminute 0–1439. Abenddämmerung 19:30–21:30, Morgendämmerung 5:00–7:00.
export function helligkeit(uhr) {
  const u = ((uhr % 1440) + 1440) % 1440;
  if (u >= 1290 || u < 300) return 0;
  if (u >= 1170) return 1 - (u - 1170) / 120;
  if (u < 420) return (u - 300) / 120;
  return 1;
}
export const istNacht = uhr => helligkeit(uhr) < 0.35;
const hausHash = n => { let h = Math.imul(n + 17, 2654435761) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
// tagsüber sind etwa 70 % der Häuser durch die Fenster hell, Keller nie; nachts ist alles dunkel
export function hausHell(nr, stock, uhr) { return stock !== 'keller' && helligkeit(uhr) > 0.6 && hausHash(nr) < 0.7; }
// nachts brennt in etwa jedem fünften Haus noch Licht (nur draußen als Fensterschein zu sehen)
export const fensterLicht = nr => hausHash(nr * 7 + 3) < 0.2;
export function uhrText(uhr) {
  const u = Math.floor(((uhr % 1440) + 1440) % 1440);
  return `${String(Math.floor(u / 60)).padStart(2, '0')}:${String(u % 60).padStart(2, '0')}`;
}

// ---------- Waffen ----------
// fern: braucht Munition (eine pro Schuss); kegel: Schrot trifft alle im Kegel; bogen: Sense trifft alle im Bogen.
// ueberraschung: Schadensfaktor gegen Zombies, die einen noch nicht bemerkt haben (von hinten anschleichen).
export const WAFFEN = {
  pistole: { fern: true, reichweite: WERTE.pistoleReichweite, schaden: 34, pause: 0.45, laut: 1, ueberraschung: 1.5, bild: 1 },
  gewehr: { fern: true, reichweite: WERTE.pistoleReichweite * 1.8, schaden: 100, pause: 1.2, laut: 1.4, ueberraschung: 1.5, bild: 1 },
  schrotflinte: { fern: true, reichweite: 160, schaden: 70, nebenSchaden: 45, kegel: 0.45, pause: 0.95, laut: 1.3, ueberraschung: 1.5, bild: 1 },
  schlaeger: { reichweite: 42, schaden: 40, pause: 0.6, stoss: true, ueberraschung: 3, bild: 2 },
  sense: { reichweite: 58, schaden: 55, bogen: 1.4, pause: 0.85, ueberraschung: 3, bild: 2 },
  messer: { reichweite: 36, schaden: 30, pause: 0.45, ueberraschung: 4, bild: 3 },
  faust: { reichweite: WERTE.nahkampfReichweite, schaden: 20, pause: 0.7, stoss: true, ueberraschung: 2.5, bild: 0 },
};
// womit kämpft der Spieler gerade? (Fernwaffe ohne Munition → Faust)
export function aktiveWaffe(p) {
  const w = WAFFEN[p.waffe];
  return w && (!w.fern || p.munition > 0) ? [p.waffe, w] : ['faust', WAFFEN.faust];
}
