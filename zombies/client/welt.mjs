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
  polizei: ['police'],
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

// Art einer verschlossenen Zimmertür, deterministisch aus Tür-Schlüssel und Welt-Seed (Server und Client gleich):
// 'frei' (geht einfach auf), 'raetsel' (nur per Rätsel), 'schluessel' (nur mit Schlüsselbund). a = Anteile { frei, raetsel, schluessel } in %
export const TUER_ANTEILE = { frei: 50, raetsel: 25, schluessel: 25 };
export function schlossArt(key, seed, a = TUER_ANTEILE) {
  let h = 2166136261 ^ (seed >>> 0);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  const r = zufall(h)();
  const f = Math.max(0, +a.frei || 0), q = Math.max(0, +a.raetsel || 0), s = Math.max(0, +a.schluessel || 0), summe = f + q + s;
  if (summe <= 0) return 'frei';
  const x = r * summe;
  return x < f ? 'frei' : x < f + q ? 'raetsel' : 'schluessel';
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
    // Innenraum (Ebene) und Platz vor der Tür kommen unten dazu, wenn Hausnummer und Austrittsrichtung feststehen
    safeRooms.push({ id, name: ort.name, haus: best });
  }

  // Behälter zum Durchsuchen: in Häusern an den Wänden, Autos am Straßenrand
  const behaelter = [];
  const arten = ['schrank', 'kuehlschrank', 'spind'];
  for (const h of haeuser) {
    const plaetze = [];
    for (let y = h.y + 1; y <= h.y + h.h - 2; y++) for (let x = h.x + 1; x <= h.x + h.b - 2; x++) {
      const anWand = x === h.x + 1 || x === h.x + h.b - 2 || y === h.y + 1 || y === h.y + h.h - 2;
      const vorTuer = Math.abs(x - h.tuer.x) <= 1 && Math.abs(y - h.tuer.y) <= 1;
      if (anWand && !vorTuer) plaetze.push([x, y]);
    }
    const anzahl = Math.min(plaetze.length, 1 + Math.floor(r2() * 2));
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
  const draussenBehaelter = behaelter.filter(b => b.art === 'auto');
  haeuser.forEach((h, i) => {
    h.nr = i; h.betretbar = true;   // auch Safe Rooms: eigener Innenraum
    h.raus = { dx: 0, dy: h.tuer.y === h.y ? -1 : 1 };
    // das Innere betretbarer Häuser ist ein eigener Innenraum – die Außenhülle ist nicht begehbar
    if (h.betretbar) for (let y = h.y + 1; y < h.y + h.h - 1; y++) for (let x = h.x + 1; x < h.x + h.b - 1; x++) setze(x, y, T.LEER);
  });
  safeRoomsVervollstaendigen(safeRooms);
  return { seed, kacheln: k, hole, haeuser, markt, tor, start, safeRooms, behaelter: draussenBehaelter, deko };
}

// Safe Rooms sind Innenräume: Ebene 'h{nr}eg', dazu der Platz vor der Haustür (für Abstände draußen)
export function safeRoomsVervollstaendigen(safeRooms) {
  for (const s of safeRooms) {
    const h = s.haus, r = h.raus ?? { dx: 0, dy: 1 };
    s.ebene = `h${h.nr}eg`;
    s.vorTuer = { x: (h.tuer.x + 0.5 + r.dx * 1.3) * KACHEL, y: (h.tuer.y + 0.5 + r.dy * 1.3) * KACHEL };
  }
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
// Safe Room, in dessen Innenraum diese Figur steht (oder null)
export function safeRoomVon(welt, p) {
  const e = p?.ebene ?? '';
  return e ? welt.safeRooms.find(s => s.ebene === e) ?? null : null;
}

// Ändert sich die Kartenerzeugung, passen gespeicherte Behälter nicht mehr
export const WELT_VERSION = 19;   // 19: Türen zur Straße, freier Vorplatz und Weg (tuerenFreihalten), 18: Küchen-Behälter Herd/Spüle, Behälter hinter Zimmertüren tragen die Tür ('tuer', Belohnungsbeute hinter Rätsel-Türen), 17: Bundeswehr-Lager mit 4 Vorratskisten (Safe House), 16: Polizeiwache (amenity=police) als Laden mit Waffenschrank, 6: Autos längs am Straßenrand, 7: Safe Rooms als Innenräume, 8: Autos meist in Parkbuchten/auf Parkplätzen, 9: Müllcontainer, Straßensperren, Parkbuchten mit freien Plätzen, 10: mehr Bäume, 11: Bundeswehr-Stützpunkt

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
  // nur bei der Bundeswehr (bw_kiste, bw_container): Handgranate (Wurfgegenstand, keine Waffe in der Hand), Maschinenpistole, Maschinengewehr
  granate: { name: 'Handgranate', zeichen: '💣', wurf: true },
  mp: { name: 'Maschinenpistole', zeichen: '🪖', waffe: true },
  mg: { name: 'Maschinengewehr', zeichen: '🔥', waffe: true },
  // Armbrust (leise, braucht Pfeile) und Scharfschützengewehr (nutzt normale Munition; selten bei Bundeswehr und Polizei)
  armbrust: { name: 'Armbrust', zeichen: '🏹', waffe: true },
  pfeil: { name: 'Pfeil', zeichen: '➶' },
  // Granatwerfer (selten, nur Bundeswehr) und seine Munition: zählt wie Pfeile als Vorrat (p.granaten), nicht im Rucksack
  granatwerfer: { name: 'Granatwerfer', zeichen: '🔫🧨', waffe: true },   // sieht aus wie ein Gewehr (Haltung gewehr)
  // Handgranaten im Waffenplatz (nie am Boden/Rucksack zu finden): Magazin 5, Vorrat p.handgranaten; Wurf per Tippen auf den Zielpunkt
  handgranate: { name: 'Handgranaten', zeichen: '💣', waffe: true, intern: true },
  granate40: { name: 'Granate (40 mm)', zeichen: '🧨' },
  scharfschuetze: { name: 'Scharfschützengewehr', zeichen: '🔭', waffe: true },
  sense: { name: 'Sense', zeichen: '🌾', waffe: true },
  kleidung: { name: 'Feste Kleidung', zeichen: '🧥' },
  seil: { name: 'Seil', zeichen: '🪢' },
  taschenlampe: { name: 'Taschenlampe', zeichen: '🔦' },
  radio: { name: 'Radio', zeichen: '📻', radio: true },   // Lockmittel: einschalten und ablegen, spielt ~75 s und macht weithin Lärm (server/radio.mjs)
  funkgeraet: { name: 'Funkgerät', zeichen: '📻' },   // Sprachfunk: mit zwei Funkgeräten hört man sich überall (client/sprache_regeln.mjs)
  schokoriegel: { name: 'Schokoriegel', zeichen: '🍫' },
  tasche: { name: 'Sporttasche (12 Plätze)', zeichen: '👜', plaetze: 12 },
  trekking: { name: 'Trekkingrucksack (16 Plätze)', zeichen: '🎒', plaetze: 16 },
  // Missionsgegenstände (server/mission.mjs): nie in Beutetabellen, nicht wegwerfbar (nur in die Safe-Room-Kiste legen), verschwinden nie vom Boden
  m_funk: { name: 'Funkgerät (Funktisch)', zeichen: '📟', mission: true, intern: true },
  m_batterie: { name: 'Batterie', zeichen: '🔋', mission: true, intern: true },
  m_antenne: { name: 'Antenne', zeichen: '📡', mission: true, intern: true },
  m_schluessel: { name: 'Torschlüssel', zeichen: '🗝️', mission: true, intern: true },
  m_diesel: { name: 'Dieselkanister', zeichen: '🛢️', mission: true, intern: true },
  m_treibstoff: { name: 'Treibstoffkanister', zeichen: '⛽', mission: true, intern: true },
  m_landefeuer: { name: 'Landefeuer', zeichen: '🚨', mission: true, intern: true },
};
export const BODEN_DAUER = 180;      // weggeworfene Gegenstände bleiben 3 Minuten liegen
export const TAUSCH_ABSTAND = 34;    // so nah muss man sich sein (berühren), um zu tauschen
// Beute bei toten Zombies: selten (etwa jeder 20.) eine Waffe, sonst oft Alltagszeug
export const LEICHE_SELTEN = ['pistole', 'munition', 'messer', 'schrotflinte'];
export const LEICHE_OFT = ['kleidung', 'seil', 'taschenlampe', 'schokoriegel'];
export const LEICHE_DAUER = 180;      // Sekunden, die eine Leiche liegen bleibt
export const LEICHEN_MAX = 30;
export const LEICHE_WOHNUNG = 0.2;   // Anteil der Wohnhaus-Ebenen mit einer Leiche (deterministisch aus Seed und Ebene, nicht in Safe Rooms und Läden)
export const RUCKSACK_PLAETZE = 8;   // Grundausstattung; größere Taschen erhöhen p.plaetze
export const KISTE_PLAETZE = 24;
export const BEHAELTER_NAME = { bad: 'Toilette / Waschbecken', muelltonne: 'Mülltonnen', container: 'Müllcontainer', schrank: 'Schrank', kuehlschrank: 'Kühlschrank', spind: 'Spind', herd: 'Herd', spuele: 'Spüle', spind_belohnung: 'Spind', auto: 'Kofferraum', leiche: 'Zombie', bus: 'Bus',
  vorratsregal: 'Vorratsregal', erstehilfe: 'Erste-Hilfe-Kasten', bw_kiste: 'Munitionskiste', bw_container: 'Bundeswehr-Container', sanikiste: 'Sanitätskiste', laden: 'Regal', laden_lebensmittel: 'Regal', laden_apotheke: 'Regal', laden_kaufhaus: 'Regal', laden_gaststaette: 'Küchenregal', laden_polizei: 'Waffenschrank' };
export const BEUTE = {
  kuehlschrank: ['wasser', 'wasser', 'essen', 'essen', 'essen', null],
  schrank: ['verband', 'bretter', 'bretter', 'essen', 'munition', 'spritze', 'schluessel', 'kleidung', 'brechstange', 'sense', 'funkgeraet', 'pfeil', 'radio', null, null],
  spind: ['munition', 'munition', 'verband', 'schlaeger', 'bretter', 'pistole', 'spritze', 'tasche', 'trekking', 'brechstange', 'seil', 'gewehr', 'schrotflinte', 'funkgeraet', 'armbrust', 'pfeil', null, null],
  // Herd und Spüle der Küche: oft ein Messer (je Küche ca. 60-70 %)
  herd: ['messer', 'messer', 'essen', 'wasser', 'wasser', null],
  spuele: ['messer', 'messer', 'wasser', 'wasser', 'essen', null],
  // Belohnung für Rätsel-Türen: Schrank/Spind im Raum dahinter, viel Waffen, Munition und Medizin
  spind_belohnung: ['pistole', 'gewehr', 'gewehr', 'schrotflinte', 'armbrust', 'munition', 'munition', 'pfeil', 'verband', 'verband', 'spritze', null],
  // Kofferraum geht nur mit Brechstange auf – darum liegt drin keine, dafür etwas mehr Gutes
  auto: ['wasser', 'verband', 'munition', 'munition', 'bretter', 'essen', 'spritze', 'tasche', 'taschenlampe', 'schrotflinte', 'funkgeraet', null],
  laden_lebensmittel: ['essen', 'essen', 'essen', 'wasser', 'wasser', 'wasser', 'schokoriegel', 'schokoriegel', null],
  laden_apotheke: ['verband', 'verband', 'verband', 'spritze', 'spritze', 'kleidung', null, null],
  laden_kaufhaus: ['tasche', 'tasche', 'trekking', 'trekking', 'taschenlampe', 'taschenlampe', 'seil', 'kleidung', 'kleidung', 'messer', 'brechstange', 'funkgeraet', 'wasser', 'wasser', 'armbrust', 'pfeil', 'pfeil', 'radio', null],
  laden_gaststaette: ['essen', 'essen', 'wasser', 'wasser', 'messer', 'schokoriegel', null],
  laden: ['essen', 'wasser', 'schokoriegel', null, null],
  vorratsregal: ['wasser', 'wasser', 'wasser', 'essen', 'essen', 'essen', 'verband', 'bretter', 'schokoriegel', 'schokoriegel', 'spritze', 'funkgeraet', null],
  erstehilfe: ['verband', 'verband', 'verband', 'spritze', null],
  // Bundeswehr-Stützpunkt (Teil 2 ergänzt hier die neuen Waffen)
  // Handgranaten häufiger, Maschinenpistole und Maschinengewehr selten (nur hier zu finden)
  bw_kiste: ['munition', 'munition', 'munition', 'verband', 'essen', 'wasser', 'taschenlampe', 'granate', 'granate', 'mp', 'pfeil', 'granate40', null],   // MG/Scharfschütze der Kiste: raum.mjs (durchsucht), nicht hier
  bw_container: ['munition', 'munition', 'verband', 'verband', 'spritze', 'essen', 'essen', 'wasser', 'wasser', 'taschenlampe', 'granate', 'granate', 'granate', 'mp', 'mg', 'mg', 'scharfschuetze', 'pfeil', 'granatwerfer', 'granate40', 'granate40', null],
  // Polizeiwache (OSM amenity=police): Pistolen, Schrot, selten Maschinenpistole, Maschinengewehr, Scharfschützengewehr
  laden_polizei: ['munition', 'munition', 'verband', 'taschenlampe', 'pistole', 'pistole', 'schrotflinte', 'mp', 'mg', 'mg', 'scharfschuetze', 'funkgeraet', null],
  sanikiste: ['verband', 'verband', 'verband', 'spritze', 'spritze', null],
  bus: ['wasser', 'wasser', 'essen', 'schokoriegel', 'tasche', 'trekking', 'kleidung', 'verband', 'taschenlampe', 'radio', null],
  bad: ['wasser', 'wasser', 'wasser', 'verband', 'schokoriegel', null, null],   // Bad: oft Wasser (Spülkasten, Hahn)
  muelltonne: ['essen', 'wasser', 'seil', 'schokoriegel', null, null, null, null, null],   // Hausmüll: meist leer, selten etwas Brauchbares
  container: ['essen', 'essen', 'schokoriegel', 'schokoriegel', 'bretter', 'bretter', 'kleidung', 'kleidung', 'tasche', null, null, null],   // Müll: meist Krempel, selten eine Tasche
};
export const MUNITION_PRO_FUND = 12;
// Pfeile für die Armbrust zählen wie Munition als Vorrat (p.pfeile), nicht im Rucksack. Aus Behältern gibt es PFEILE_PRO_FUND, vom Boden 1 Stück.
export const PFEILE_PRO_FUND = 6;
export const PFEILE_MAX = 40;
export const GRANATEN_PRO_FUND = 2;   // Granaten (40 mm) aus Behältern; vom Boden 1 Stück
export const GRANATEN_MAX = 20;
export const HANDGRANATEN_MAX = 20;   // Vorrat an Handgranaten außerhalb des Magazins (Waffenplatz)
export const MUNITION_MAX = 150;   // so viel Munition trägt man höchstens (Maschinengewehr und Soldaten-Handel brauchen mehr Platz als die alten 99)

// ---------- Handel mit den Ärzten und Soldaten des Bundeswehr-Stützpunkts ----------
// Bezahlt wird mit Dingen (höchstens 3 Gegenstandstypen in 'aus') ODER mit HANDEL_RAETSEL richtig beantworteten Rätselfragen am Stück.
// kostet: anzahl Dinge aus der Liste 'aus' (beliebig gemischt); gibt: Ding (menge Stück) oder 'munition' (menge Schuss)
export const HANDEL = {
  arzt: {
    name: 'Arzt', zeichen: '🩺',
    angebote: [
      { id: 'verband', gibt: 'verband', menge: 1, kostet: { anzahl: 2, aus: ['essen', 'wasser', 'schokoriegel'] } },
      { id: 'spritze', gibt: 'spritze', menge: 1, kostet: { anzahl: 2, aus: ['essen', 'wasser', 'schokoriegel'] } },
    ],
  },
  soldat: {
    name: 'Soldat', zeichen: '🎖',
    angebote: [
      { id: 'granate', gibt: 'granate', menge: 1, kostet: { anzahl: 2, aus: ['essen'] } },
      { id: 'munition', gibt: 'munition', menge: 100, kostet: { anzahl: 3, aus: ['essen', 'wasser', 'verband'] } },
    ],
  },
};
export const HANDEL_RAETSEL = 6;   // so viele Rätsel in Folge richtig = Bezahlung ohne Gegenstände (eine falsche Antwort setzt zurück)
export const HANDEL_ABSTAND = 56;   // so nah muss man an Arzt bzw. Soldat stehen (Pixel; 2,5 m wären nur 20 px – kleiner als die Figuren selbst)
// Womit bezahlt wird: Liste der abzugebenden Dinge (zuerst das, wovon man am meisten hat) oder null, wenn der Rucksack nicht reicht
export function bezahlung(rucksack, kostet) {
  const n = new Map(kostet.aus.map(d => [d, rucksack.filter(q => q === d).length]));
  const zahl = [];
  for (let i = 0; i < kostet.anzahl; i++) {
    let best = null;
    for (const [d, m] of n) if (m > 0 && (best === null || m > n.get(best))) best = d;
    if (best === null) return null;
    n.set(best, n.get(best) - 1); zahl.push(best);
  }
  return zahl;
}
// Bundeswehr-Handgranate: Zünder 2 s ab dem Wurf, fliegt 0,6 s, Radius 5 m (8 px je m), Lärm 600 px
export const GRANATE = { flug: 0.6, flugWerfer: 0.8, tempo: 330, tempoWerfer: 1500, bogen: Math.PI / 3, zuender: 2.0, radius: 60, schadenZombie: 220, schadenSpieler: 70, wurfWeite: 200, blickWeite: 136, laerm: 600 };   // Wurfweite +67 %, Radius +50 %, mehr Schaden
// Wer ein Maschinengewehr trägt (in der Hand oder im Rucksack), läuft 15 % langsamer
export const TEMPO_MG = 0.85;
export const traegtMg = p => p.waffe === 'mg' || (p.rucksack ?? []).includes('mg');

// Fundhäufigkeit je Gegenstand einstellbar: 10 = normal, 0 = nie, 20 = doppelt so oft.
// Zieht aus einer Beutetabelle (Einträge mit Wiederholungen, null = nichts) mit Gewichten.
// wo man es erwartet, gibt es manches häufiger: Wasser in Lebensmittelläden, Kaufhäusern, Gaststätten und Eisdielen +50 %
export const BEUTE_BONUS = {
  // Gewichte so gewählt, dass die Fundwahrscheinlichkeit um die Hälfte steigt (z. B. Lebensmittel 33 % → 50 %)
  laden_lebensmittel: { wasser: 2.0 }, laden_kaufhaus: { wasser: 1.65 }, laden_gaststaette: { wasser: 1.9 },
};
export function ziehe(tabelle, faktoren, rnd, bonus = null) {
  let summe = 0;
  const gewichte = tabelle.map(d => { const g = d ? (faktoren?.[d] ?? 10) / 10 * (bonus?.[d] ?? 1) : 1; summe += g; return g; });
  if (summe <= 0) return null;
  let r = rnd() * summe;
  for (let i = 0; i < tabelle.length; i++) { r -= gewichte[i]; if (r < 0) return tabelle[i]; }
  return null;
}
// Dauer des Durchsuchens (Sekunden) je Behälterart – Spieler und Bots gleich
export const durchsuchDauer = art => art === 'auto' || art === 'bus' ? 1.2 : art === 'leiche' ? 0.6 : 0.8;
export const AKTION_ABSTAND = 40;
export const BUS_ABSTAND = 86;   // Abstand zur Mitte des Evakuierungsbusses (Pixel, Busmitte bis Spieler): wer so nah steht, ist an Bord
export const INFEKTION_DAUER = 5400;   // 90 Minuten bis zur Verwandlung
export const ZOMBIE_ZEIT = 180;        // so lange spielt man als Zombie gegen die anderen

export function blockiert(welt, px, py) {
  return BLOCKIERT.has(welt.hole(Math.floor(px / KACHEL), Math.floor(py / KACHEL)));
}

// Feines Kollisionsraster (1 m): 4 × 4 Felder je Kachel; 0 = frei, 1 = fest, 2 = Zaun/Hecke (kletterbar)
export const FEIN = 4, FEIN_PX = KACHEL / FEIN;
export function feinWert(welt, x, y) {
  const fx = Math.floor(x / FEIN_PX), fy = Math.floor(y / FEIN_PX), fb = BREITE * FEIN;
  if (fx < 0 || fy < 0 || fx >= fb || fy >= HOEHE * FEIN) return 1;
  return welt.fein[fy * fb + fx];
}

// Kreis mit Radius rad frei? Mit feinem Raster: alle überdeckten Feinfelder; sonst die vier Ecken des Quadrats
const freiStandard = (welt, x, y, rad) => frei(welt, x, y, rad);
export function frei(welt, x, y, rad) {
  const f = welt.fein;
  if (f) {
    const fb = BREITE * FEIN, fh = HOEHE * FEIN;
    const x0 = Math.floor((x - rad) / FEIN_PX), x1 = Math.floor((x + rad) / FEIN_PX);
    const y0 = Math.floor((y - rad) / FEIN_PX), y1 = Math.floor((y + rad) / FEIN_PX);
    if (x0 < 0 || y0 < 0 || x1 >= fb || y1 >= fh) return false;
    for (let fy = y0; fy <= y1; fy++) for (let fx = x0, i = fy * fb + x0; fx <= x1; fx++, i++) if (f[i]) return false;
    return true;
  }
  return !blockiert(welt, x - rad, y - rad) && !blockiert(welt, x + rad, y - rad)
      && !blockiert(welt, x - rad, y + rad) && !blockiert(welt, x + rad, y + rad);
}

// ---------- Hecken und niedrige Zäune für Zombies und Bots (Menschen klettern bewusst, siehe zaunUeberstieg) ----------
export const ZAUN_TEMPO = { h: 0.35, z: 0.45 };   // Tempo-Faktor, solange Zombie/Bot im Zaunfeld steht
// Art des durchquerbaren Zauns ('h' Hecke, 'z' Holzzaun – im Dorf alle Rasterzäune) auf Kachel kx,ky oder null
function tierZaunArt(welt, kx, ky) {
  if (kx <= 0 || ky <= 0 || kx >= BREITE - 1 || ky >= HOEHE - 1) return null;   // Kartenrand bleibt zu
  if (welt.hole(kx, ky) !== T.ZAUN) return null;
  const za = welt.details?.zaunart;
  if (!za) return 'z';
  const a = za[ky * BREITE + kx];
  return a === 'h' || a === 'z' ? a : null;
}
// Zaunart eines Feinfelds mit Wert 2: Art der Kachel; die geglätteten Zaunlinien laufen auch über andere Kacheln,
// dort entscheidet die Nachbarschaft (Metall/Mauer in der Nähe → undurchlässig, sonst Hecke, sonst Holzzaun)
function feinZaunArt(welt, kx, ky) {
  const za = welt.details?.zaunart;
  if (!za) return 'z';
  const eigene = za[ky * BREITE + kx];
  if (eigene && 'hzmw'.includes(eigene)) return eigene;
  let h = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = kx + dx, y = ky + dy;
    if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE) continue;
    const a = za[y * BREITE + x];
    if (a === 'm' || a === 'w') return 'm';
    if (a === 'h') h = true;
  }
  return h ? 'h' : 'z';
}
// Wie frei(), aber Hecken und Holzzäune sind betretbar (Metallzäune, Mauern, Häuser bleiben zu). Rückgabe: true/false
export function freiTier(welt, x, y, rad) { return tierGelaende(welt, x, y, rad) > 0; }
// 0 = blockiert, sonst Tempo-Faktor (1 = freies Gelände, kleiner = in Hecke/Zaun)
export function tierGelaende(welt, x, y, rad) {
  if (welt.ebene) return frei(welt, x, y, rad) ? 1 : 0;
  const f = welt.fein;
  let faktor = 1;
  if (f) {
    const fb = BREITE * FEIN, fh = HOEHE * FEIN;
    const x0 = Math.floor((x - rad) / FEIN_PX), x1 = Math.floor((x + rad) / FEIN_PX);
    const y0 = Math.floor((y - rad) / FEIN_PX), y1 = Math.floor((y + rad) / FEIN_PX);
    if (x0 < 0 || y0 < 0 || x1 >= fb || y1 >= fh) return 0;
    for (let fy = y0; fy <= y1; fy++) for (let fx = x0; fx <= x1; fx++) {
      const w = f[fy * fb + fx];
      if (!w) continue;
      if (w !== 2) return 0;
      const kx = Math.floor(fx / FEIN), ky = Math.floor(fy / FEIN);
      if (kx <= 0 || ky <= 0 || kx >= BREITE - 1 || ky >= HOEHE - 1) return 0;
      const art = feinZaunArt(welt, kx, ky);
      if (art !== 'h' && art !== 'z') return 0;
      faktor = Math.min(faktor, ZAUN_TEMPO[art]);
    }
    return faktor;
  }
  for (const [px, py] of [[x - rad, y - rad], [x + rad, y - rad], [x - rad, y + rad], [x + rad, y + rad]]) {
    const kx = Math.floor(px / KACHEL), ky = Math.floor(py / KACHEL);
    if (!blockiert(welt, px, py)) continue;
    const art = tierZaunArt(welt, kx, ky);
    if (!art) return 0;
    faktor = Math.min(faktor, ZAUN_TEMPO[art]);
  }
  return faktor;
}

// Bewegen mit Gleiten an Wänden: erst x, dann y getrennt
export function bewege(welt, obj, dx, dy, rad, frei = freiStandard) {
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

// Sichtgüte 0..1 für Zombie-Wahrnehmung: Wand/Innentür/Leer = 0; jede verschiedene Baumkachel
// auf der Linie (außer Start- und Zielkachel) mindert um 20 %, nie unter 0,3 (ein bisschen sieht man immer).
export const BAUM_SICHT = 0.8, BAUM_SICHT_MIN = 0.3;
export function sichtGuete(welt, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (KACHEL / 3));
  const k1 = Math.floor(x1 / KACHEL) + ',' + Math.floor(y1 / KACHEL), k2 = Math.floor(x2 / KACHEL) + ',' + Math.floor(y2 / KACHEL);
  const baeume = new Set();
  for (let i = 1; i < n; i++) {
    const kx = Math.floor((x1 + (x2 - x1) * i / n) / KACHEL), ky = Math.floor((y1 + (y2 - y1) * i / n) / KACHEL);
    const t = welt.hole(kx, ky);
    if (t === T.WAND || t === T.INNENTUER || t === T.LEER) return 0;
    if (t === T.BAUM) { const k = kx + ',' + ky; if (k !== k1 && k !== k2) baeume.add(k); }
  }
  return Math.max(BAUM_SICHT_MIN, Math.pow(BAUM_SICHT, baeume.size));
}

// Ist der Punkt in einem Haus (Boden oder Tür)?
export function drinnen(welt, x, y) {
  const t = welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL));
  return t === T.BODEN || t === T.TUER;
}

// Spielwerte, die Server und Client kennen müssen
export const WERTE = {
  spielerRadius: 7,       // Kollisionsradius (px), unabhängig von der Anzeigegröße; kleiner = kommt durch enge Lücken
  zombieRadius: 9,
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
export function linieFrei(welt, x1, y1, x2, y2, rad, freiFn = frei) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i <= n; i++) {
    if (!freiFn(welt, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, rad)) return false;
  }
  return true;
}

// Breitensuche über Kacheln; liefert Wegpunkte (Pixel), schon mit Abkürzungen über freie Strecken
export function findeWeg(welt, vonX, vonY, nachX, nachY, rad = 11, maxKnoten = Infinity, zaunOk = false) {
  const weg = findeWegRaster(welt, vonX, vonY, nachX, nachY, rad, maxKnoten, false);
  // Zombies und Bots dürfen notfalls durch Hecken und Holzzäune (teurer: erst nur der freie Weg, dann mit Zaun)
  return weg ?? (zaunOk ? findeWegRaster(welt, vonX, vonY, nachX, nachY, rad, maxKnoten, true) : null);
}
function findeWegRaster(welt, vonX, vonY, nachX, nachY, rad, maxKnoten, zaunOk) {
  const frei_ = zaunOk ? freiTier : frei;
  const begehbar = (x, y) => { const t = welt.hole(x, y); return BEGEHBAR_WEG.has(t) || (zaunOk && t === T.ZAUN && tierZaunArt(welt, x, y) !== null); };
  const sx = Math.floor(vonX / KACHEL), sy = Math.floor(vonY / KACHEL);
  const zx = Math.floor(nachX / KACHEL), zy = Math.floor(nachY / KACHEL);
  if (!begehbar(zx, zy)) return null;
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
      if (vor[j] !== -1 || !begehbar(nx, ny)) continue;
      // mit feinem Raster: Kachelmitte und Übergang dorthin müssen auch fein frei sein (Zaunlinien, Hausumrisse)
      if (welt.fein && j !== ziel && (!frei_(welt, (nx + 0.5) * KACHEL, (ny + 0.5) * KACHEL, 9) || !frei_(welt, (x + nx + 1) * KACHEL / 2, (y + ny + 1) * KACHEL / 2, 9))) continue;
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
    while (j > i && !linieFrei(welt, ax, ay, punkte[j].x, punkte[j].y, rad, frei_)) j--;
    glatt.push(punkte[j]);
    ax = punkte[j].x; ay = punkte[j].y; i = j + 1;
  }
  return glatt;
}

// ---------- Tag und Nacht (Server und Browser rechnen gleich) ----------
// uhr = Spielminute 0–1439. Abenddämmerung 19:30–21:30, Morgendämmerung 5:00–7:00.
// Tageszeiten (Spielminuten): ab tagAb ganz hell, ab nachtAb ganz dunkel, davor je 2 Stunden Dämmerung.
// Einstellbar (Verwaltung „Tag beginnt“/„Nacht beginnt“); der Server schickt die Werte im Zustand an die Clients.
const DAEMMERUNG = 60;   // eine volle Spielstunde Übergang
let TAG_AB = 420, NACHT_AB = 1290;
export function setzeTageszeiten(tagAb, nachtAb) {
  const t = Number(tagAb), n = Number(nachtAb);
  if (Number.isFinite(t) && Number.isFinite(n) && n - t >= 2 * DAEMMERUNG) { TAG_AB = t; NACHT_AB = n; }
}
export const tageszeiten = () => ({ tagAb: TAG_AB, nachtAb: NACHT_AB });
export function helligkeit(uhr) {
  const u = ((uhr % 1440) + 1440) % 1440;
  if (u >= NACHT_AB || u < TAG_AB - DAEMMERUNG) return 0;
  if (u >= NACHT_AB - DAEMMERUNG) return 1 - (u - (NACHT_AB - DAEMMERUNG)) / DAEMMERUNG;
  if (u < TAG_AB) return (u - (TAG_AB - DAEMMERUNG)) / DAEMMERUNG;
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
// magazin: Schuss je Magazin (nur Fernwaffen), nachlade: Sekunden zum Nachladen (Magazin leer → automatisch, Taste R → von Hand).
// vorrat (nur bei Granatwerfer): 'granaten' statt Munition; granate: Bogenschuss mit Explosion wie eine Handgranate.
// fern: braucht Munition (eine pro Schuss); kegel: Schrot trifft alle im Kegel; bogen: Sense trifft alle im Bogen.
// ueberraschung: Schadensfaktor gegen Zombies, die einen noch nicht bemerkt haben (von hinten anschleichen).
export const WAFFEN = {
  pistole: { fern: true, magazin: 15, nachlade: 4, reichweite: WERTE.pistoleReichweite, schaden: 34, pause: 0.45, laut: 1, ueberraschung: 1.5, bild: 1 },
  gewehr: { fern: true, magazin: 30, nachlade: 4, reichweite: WERTE.pistoleReichweite * 1.8, schaden: 100, pause: 1.2, laut: 1.4, ueberraschung: 1.5, bild: 1 },
  // Bundeswehr: Maschinenpistole (30 m, hohe Feuerrate, etwas weniger Schaden als die Pistole) und Maschinengewehr (45 m, sehr hohe Feuerrate)
  mp: { fern: true, magazin: 30, nachlade: 4, reichweite: 30 * 8, schaden: 28, pause: 0.14, laut: 1.1, ueberraschung: 1.5, bild: 1 },
  mg: { fern: true, magazin: 100, nachlade: 4, reichweite: 45 * 8, schaden: 30, pause: 0.09, laut: 1.3, ueberraschung: 1.5, bild: 1 },
  // Armbrust: fast lautlos, 25 m, kräftiger Einzelschuss, langsam gespannt; verbraucht Pfeile (p.pfeile), der Pfeil bleibt am Ziel liegen
  armbrust: { fern: true, magazin: 1, nachlade: 2, pfeil: true, reichweite: 25 * 8, schaden: 80, pause: 2.4, laut: 0.06, ueberraschung: 2, bild: 1 },
  // Scharfschützengewehr: 75 m, sehr hoher Schaden, langsame Schussfolge, sehr laut; Gewehrmunition
  scharfschuetze: { fern: true, magazin: 5, nachlade: 4, reichweite: 75 * 8, schaden: 220, pause: 2.8, laut: 2.2, ueberraschung: 1.5, bild: 1 },
  schrotflinte: { fern: true, magazin: 6, nachlade: 4, reichweite: 160, schaden: 70, nebenSchaden: 45, kegel: 0.45, pause: 0.95, laut: 1.3, ueberraschung: 1.5, bild: 1 },
  // Granatwerfer: Bogenschuss auf den Zielpunkt (bis 60 m, in der Verwaltung bis 100 m; Projektil ~4× so schnell wie ein Wurf), Explosion wie Handgranate (Schaden = Zombieschaden), Granaten (40 mm) als Vorrat
  granatwerfer: { fern: true, granate: true, vorrat: 'granaten', magazin: 1, nachlade: 3, reichweite: 60 * 8, schaden: 220, pause: 2.2, laut: 1.5, ueberraschung: 1, bild: 1 },
  // Handgranaten als Waffe: kein Auto-Schuss (wurf), Wurf auf den angetippten Punkt (Bogen 60° vor der Figur), Magazin 5, Aufschlagzündung
  handgranate: { fern: true, wurf: true, vorrat: 'handgranaten', magazin: 5, nachlade: 1.5, reichweite: 200, schaden: 220, pause: 0.6, laut: 1, ueberraschung: 1, bild: 0 },
  schlaeger: { reichweite: 42, schaden: 40, pause: 0.6, stoss: true, ueberraschung: 3, bild: 2 },
  sense: { reichweite: 58, schaden: 55, bogen: 1.4, pause: 0.85, ueberraschung: 3, bild: 2 },
  messer: { reichweite: 36, schaden: 30, pause: 0.45, ueberraschung: 4, bild: 3 },
  faust: { reichweite: WERTE.nahkampfReichweite, schaden: 20, pause: 0.7, stoss: true, ueberraschung: 2.5, bild: 0 },
};
// Vorrat für die Fernwaffe (außerhalb des Magazins): Granaten beim Granatwerfer, Pfeile bei der Armbrust, sonst Munition
export const vorratFeld = w => w?.vorrat === 'handgranaten' ? 'handgranaten' : w?.vorrat === 'granaten' ? 'granaten' : w?.pfeil ? 'pfeile' : 'munition';
export const vorratVon = (p, w) => p[vorratFeld(w)] ?? 0;
// Magazingröße der Waffe (0 = keine Fernwaffe)
export const magazinGroesse = w => (w?.fern ? (w.magazin ?? 1) : 0);
// Munition insgesamt für die gehaltene Waffe: Magazin + Vorrat (für Bots und die Anzeige „leer?“)
export const munitionGesamt = p => (p.magazin ?? 0) + (vorratVon(p, WAFFEN[p.waffe]));
// womit kämpft der Spieler gerade? (Fernwaffe ohne Munition in Magazin und Vorrat → Faust)
export function aktiveWaffe(p) {
  const w = WAFFEN[p.waffe];
  return w && (!w.fern || munitionGesamt(p) > 0) ? [p.waffe, w] : ['faust', WAFFEN.faust];
}

// Über einen Gartenzaun, eine Hecke oder Gartenmauer steigen: Zaunfeld direkt vor der Figur (Blickrichtung zuerst,
// dann die vier Hauptrichtungen) und ein freier Landeplatz dahinter. Rückgabe { x, y, art } oder null.
// streng = nur genau in Laufrichtung und direkt vor der Figur (für das automatische Klettern beim Dagegenlaufen)
export function zaunUeberstieg(welt, x, y, richtung, rad, streng = false) {
  const zaunart = welt.details?.zaunart;
  if (!zaunart) return null;
  if (welt.fein) {
    // feines Raster: Zaunfeld (2) kurz vor der Figur suchen, Landeplatz dahinter
    const richtungen = streng ? [richtung, richtung + 0.35, richtung - 0.35] : [richtung, richtung + 0.5, richtung - 0.5, 0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (const w of richtungen) {
      const dx = Math.cos(w), dy = Math.sin(w);
      for (let a = rad; a <= rad + (streng ? 8 : 12); a += 2) {
        if (feinWert(welt, x + dx * a, y + dy * a) !== 2) continue;
        const kx = Math.floor((x + dx * a) / KACHEL), ky = Math.floor((y + dy * a) / KACHEL);
        const art = 'hzmw'.includes(zaunart[ky * BREITE + kx]) ? zaunart[ky * BREITE + kx] : 'z';
        for (let b = a + 6; b <= a + 44; b += 3) {
          const zx = x + dx * (b + rad), zy = y + dy * (b + rad);
          if (frei(welt, zx, zy, rad)) return { x: zx, y: zy, art };
        }
        break;
      }
    }
    return null;
  }
  const richtungen = [richtung, 0, Math.PI / 2, Math.PI, -Math.PI / 2]
    .sort((a, b) => Math.abs(Math.atan2(Math.sin(a - richtung), Math.cos(a - richtung))) - Math.abs(Math.atan2(Math.sin(b - richtung), Math.cos(b - richtung))));
  for (const w of richtungen) {
    const dx = Math.cos(w), dy = Math.sin(w);
    for (const abstand of [rad + 6, rad + 14]) {
      const kx = Math.floor((x + dx * abstand) / KACHEL), ky = Math.floor((y + dy * abstand) / KACHEL);
      if (welt.hole(kx, ky) !== T.ZAUN) continue;
      const art = zaunart[ky * BREITE + kx];
      if (!'hzmw'.includes(art)) continue;
      const mx = (kx + 0.5) * KACHEL, my = (ky + 0.5) * KACHEL;
      for (const weiter of [KACHEL * 0.5 + rad + 4, KACHEL * 0.8 + rad, KACHEL * 1.3 + rad]) {
        const zx = mx + dx * weiter, zy = my + dy * weiter;
        if (frei(welt, zx, zy, rad)) return { x: zx, y: zy, art };
      }
    }
  }
  return null;
}
export const ZAUN_NAME = { h: 'die Hecke', z: 'den Zaun', m: 'den Zaun', w: 'die Mauer' };

// Fingerabdruck der festen Welt (Häuser, Behälter, Stützpunkt-Kisten, Tor, Start): Client und Server bauen die Welt
// getrennt aus Karte + Seed; weicht ein Gerät ab (alter Code im Speicher, andere Rechengenauigkeit), stehen Kisten
// und Wände dort woanders. Der Client schickt den Wert nach dem Aufbau, der Server vergleicht (raum.mjs 'weltpruefung').
export function weltFingerabdruck(w) {
  let h = 0x811c9dc5;
  const mische = v => { h = Math.imul(h ^ (Math.round(Number(v) || 0) | 0), 0x01000193) >>> 0; };
  const text = s => { for (const ch of String(s ?? '')) mische(ch.charCodeAt(0)); };
  mische(WELT_VERSION);
  for (const g of w.haeuser ?? []) { mische(g.x); mische(g.y); mische(g.b); mische(g.h); }
  for (const b of w.behaelter ?? []) { mische(b.x); mische(b.y); text(b.art); }
  for (const b of w.stuetzpunkt?.behaelter ?? []) { mische(b.x); mische(b.y); text(b.art); }
  mische(w.tor?.x); mische(w.tor?.y); mische(w.start?.x); mische(w.start?.y);
  return h.toString(36);
}
