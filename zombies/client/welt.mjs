// Gemeinsame Spielwelt für Server und Browser.
// Aus demselben Seed entsteht auf beiden Seiten dieselbe Karte, deshalb muss
// der Server die Karte nicht übertragen.

export const KACHEL = 32;
export const BREITE = 64;   // Kacheln
export const HOEHE = 48;

export const T = {
  WIESE: 0, STRASSE: 1, WAND: 2, BODEN: 3, TUER: 4,
  WASSER: 5, BAUM: 6, PLATZ: 7, ZAUN: 8, TOR: 9,
};

const BLOCKIERT = new Set([T.WAND, T.WASSER, T.BAUM, T.ZAUN, T.TOR]);

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
  return { seed, kacheln: k, hole, haeuser, markt, tor, start };
}

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
    if (t === T.WAND || t === T.BAUM) return false;
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
