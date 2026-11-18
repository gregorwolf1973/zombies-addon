// Innenraum-Generator – Entwurf von DeepSeek (v4-pro), nach Testrückmeldung korrigiert
// Innenraum-Generator – Entwurf von DeepSeek (v4-pro), von Claude geprüft
import { KACHEL, BREITE, HOEHE, T, zufall } from './welt.mjs';

export const MOEBEL_NAMEN = {
  sofa: 'Sofa',
  couchtisch: 'Couchtisch',
  schrank: 'Schrank',
  regal: 'Regal',
  herd: 'Herd',
  kuehlschrank: 'Kühlschrank',
  spuele: 'Spüle',
  esstisch: 'Esstisch',
  bett: 'Bett',
  kommode: 'Kommode',
  badewanne: 'Badewanne',
  waschbecken: 'Waschbecken',
  klo: 'Toilette',
  garderobe: 'Garderobe',
  kiste: 'Kiste',
  heizung: 'Heizung',
  alter_schrank: 'Alter Schrank',
};

const BEHAELTER_ARTEN = new Set(['schrank', 'kuehlschrank', 'kommode', 'kiste', 'alter_schrank', 'garderobe']);

// Hilfsfunktion: Index im Raster
function idx(x, y) {
  return y * BREITE + x;
}

// Hilfsfunktion: Prüft, ob Koordinaten im Haus-Innenbereich liegen
function imHaus(x, y, ox, oy, b, h) {
  return x >= ox && x < ox + b && y >= oy && y < oy + h;
}

// Hilfsfunktion: Breitensuche über begehbare Kacheln
function alleBodenKachelnErreichbar(kacheln, ox, oy, b, h) {
  // Startkachel finden: erste Bodenkachel im Haus
  let startX = -1, startY = -1;
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + b; x++) {
      const t = kacheln[idx(x, y)];
      if (t === T.BODEN || t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH || t === T.AUSGANG || t === T.TUER_OFFEN || t === T.INNENTUER) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== -1) break;
  }
  if (startX === -1) return true; // Keine Bodenkacheln

  const besucht = new Uint8Array(BREITE * HOEHE);
  const queue = [[startX, startY]];
  besucht[idx(startX, startY)] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const nachbarn = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nachbarn) {
      if (nx < 0 || nx >= BREITE || ny < 0 || ny >= HOEHE) continue;
      if (besucht[idx(nx, ny)]) continue;
      const t = kacheln[idx(nx, ny)];
      if (t === T.BODEN || t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH || t === T.AUSGANG || t === T.TUER_OFFEN || t === T.INNENTUER) {
        besucht[idx(nx, ny)] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  // Prüfen, ob alle Bodenkacheln besucht wurden
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + b; x++) {
      const t = kacheln[idx(x, y)];
      if (t === T.BODEN || t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH || t === T.AUSGANG || t === T.TUER_OFFEN || t === T.INNENTUER) {
        if (!besucht[idx(x, y)]) return false;
      }
    }
  }
  return true;
}

// Hilfsfunktion: Prüft, ob eine Kachel an eine Wand grenzt (4er-Nachbarschaft)
function grenztAnWand(kacheln, x, y, ox, oy, b, h) {
  const nachbarn = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  for (const [nx, ny] of nachbarn) {
    if (nx < ox || nx >= ox + b || ny < oy || ny >= oy + h) continue;
    if (kacheln[idx(nx, ny)] === T.WAND) return true;
  }
  return false;
}

// Hilfsfunktion: Prüft, ob eine Kachel neben einer Tür, Ausgang oder Treppe liegt
function nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h) {
  const nachbarn = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  for (const [nx, ny] of nachbarn) {
    if (nx < ox || nx >= ox + b || ny < oy || ny >= oy + h) continue;
    const t = kacheln[idx(nx, ny)];
    if (t === T.INNENTUER || t === T.TUER_OFFEN || t === T.AUSGANG || t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH) {
      return true;
    }
  }
  return false;
}

// Hilfsfunktion: Prüft, ob ein Rechteck für Möbel frei ist
function moebelPlatzFrei(kacheln, x, y, b, h, ox, oy, hausB, hausH) {
  if (x < ox || y < oy || x + b > ox + hausB || y + h > oy + hausH) return false;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < b; dx++) {
      const t = kacheln[idx(x + dx, y + dy)];
      if (t !== T.BODEN) return false;
      // Nicht neben Türen, Ausgang oder Treppen
      if (nebenTuerOderTreppe(kacheln, x + dx, y + dy, ox, oy, hausB, hausH)) return false;
    }
  }
  return true;
}

// Hilfsfunktion: Möbel platzieren
function platziereMoebel(kacheln, moebelListe, behaelterListe, art, x, y, b, h, ox, oy, hausB, hausH, behaelterZaehler) {
  if (!moebelPlatzFrei(kacheln, x, y, b, h, ox, oy, hausB, hausH)) return false;

  // Temporär platzieren
  const alteWerte = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < b; dx++) {
      alteWerte.push({ x: x + dx, y: y + dy, t: kacheln[idx(x + dx, y + dy)] });
      kacheln[idx(x + dx, y + dy)] = T.MOEBEL;
    }
  }

  // Prüfen, ob alle Bodenkacheln noch zusammenhängen
  if (!alleBodenKachelnErreichbar(kacheln, ox, oy, hausB, hausH)) {
    // Rückgängig machen
    for (const { x: mx, y: my, t } of alteWerte) {
      kacheln[idx(mx, my)] = t;
    }
    return false;
  }

  // Möbel erfolgreich platziert
  moebelListe.push({ art, x, y, b, h });

  // Behälter hinzufügen
  if (BEHAELTER_ARTEN.has(art)) {
    const behaelterArt = art === 'kiste' ? 'spind' : (art === 'alter_schrank' || art === 'garderobe' || art === 'kommode' ? 'schrank' : art);
    // Pixelmitte der Kachel, die an Boden grenzt
    // (Claude) Kachel des Möbels mit Boden daneben suchen; ohne Zugang kein Behälter
    let bx = -1, by = -1;
    suche: for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < b; dx++) {
        const mx = x + dx, my = y + dy;
        for (const [nx, ny] of [[mx + 1, my], [mx - 1, my], [mx, my + 1], [mx, my - 1]]) {
          if (nx >= ox && nx < ox + hausB && ny >= oy && ny < oy + hausH && kacheln[idx(nx, ny)] === T.BODEN) {
            bx = mx; by = my; break suche;
          }
        }
      }
    }
    if (bx < 0) return true;
    behaelterListe.push({
      id: 'm' + (behaelterZaehler.count++),
      art: behaelterArt,
      x: bx * KACHEL + KACHEL / 2,
      y: by * KACHEL + KACHEL / 2,
    });
  }

  return true;
}

// (Claude) Position für ein Möbelstück: bündig an einer Wand (ganze Seite liegt an), davor ein freier
// Streifen Boden. Tische stehen frei im Raum, aber mit einem Ring freien Bodens rundherum.
const FREISTEHEND = new Set(['esstisch', 'couchtisch']);
function findeMoebelPosition(kacheln, raum, moebelB, moebelH, ox, oy, hausB, hausH, rng, art) {
  const { x: rx, y: ry, b: rb, h: rh } = raum;
  const istWand = (x, y) => kacheln[idx(x, y)] === T.WAND;
  const istBoden = (x, y) => kacheln[idx(x, y)] === T.BODEN;
  const kandidaten = [];
  for (const [b, h] of moebelB === moebelH ? [[moebelB, moebelH]] : [[moebelB, moebelH], [moebelH, moebelB]]) {
    for (let y = ry; y <= ry + rh - h; y++) {
      for (let x = rx; x <= rx + rb - b; x++) {
        if (!moebelPlatzFrei(kacheln, x, y, b, h, ox, oy, hausB, hausH)) continue;
        if (FREISTEHEND.has(art)) {
          let ring = true;
          for (let dy = -1; dy <= h && ring; dy++) for (let dx = -1; dx <= b; dx++) {
            if ((dy === -1 || dy === h || dx === -1 || dx === b) && !istBoden(x + dx, y + dy)) { ring = false; break; }
          }
          if (ring) kandidaten.push({ x, y, b, h });
          continue;
        }
        // eine ganze Seite an der Wand, gegenüber frei
        const reihe = (x0, y0, n, ddx, ddy, f) => { for (let i = 0; i < n; i++) if (!f(x0 + i * ddx, y0 + i * ddy)) return false; return true; };
        const seiten = [
          reihe(x, y - 1, b, 1, 0, istWand) && reihe(x, y + h, b, 1, 0, istBoden),
          reihe(x, y + h, b, 1, 0, istWand) && reihe(x, y - 1, b, 1, 0, istBoden),
          reihe(x - 1, y, h, 0, 1, istWand) && reihe(x + b, y, h, 0, 1, istBoden),
          reihe(x + b, y, h, 0, 1, istWand) && reihe(x - 1, y, h, 0, 1, istBoden),
        ];
        if (seiten.some(Boolean)) kandidaten.push({ x, y, b, h });
      }
    }
  }
  if (kandidaten.length === 0) return null;
  return kandidaten[Math.floor(rng() * kandidaten.length)];
}

export function baueInnenraum(seed, nr, stock, seite = 'unten') {   // seite: wo draußen die Haustür ist
  const rng = zufall(seed ^ Math.imul(nr + 1, 7919) ^ (stock === 'eg' ? 0 : stock === 'keller' ? 0x51ed : 0xa77e));
  const kacheln = new Uint8Array(BREITE * HOEHE).fill(T.LEER);

  // Hausgröße bestimmen
  let b, h;
  if (stock === 'eg') {
    b = 16 + Math.floor(rng() * 7); // 16-22
    h = 11 + Math.floor(rng() * 5); // 11-15
  } else if (stock === 'keller') {
    b = 10 + Math.floor(rng() * 7); // 10-16
    h = 8 + Math.floor(rng() * 4);  // 8-11
  } else {
    b = 12 + Math.floor(rng() * 7); // 12-18
    h = 6 + Math.floor(rng() * 4);  // 6-9
  }

  const ox = 2;
  const oy = 2;

  // Außenwände und Boden
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + b; x++) {
      if (x === ox || x === ox + b - 1 || y === oy || y === oy + h - 1) {
        kacheln[idx(x, y)] = T.WAND;
      } else {
        kacheln[idx(x, y)] = T.BODEN;
      }
    }
  }

  // Zufallszahlen für Keller/Dach (nur eg)
  let hatKeller = false;
  let hatDach = false;
  if (stock === 'eg') {
    hatKeller = rng() < 0.5;
    hatDach = rng() < 0.4;
  }

  // BSP: Zimmer aufteilen
  const raeume = [];
  const initialRaum = { x: ox + 1, y: oy + 1, b: b - 2, h: h - 2 };
  const queue = [initialRaum];

  let maxZimmer;
  if (stock === 'eg') maxZimmer = 4 + Math.floor(rng() * 4); // 4-7
  else if (stock === 'keller') maxZimmer = 2 + Math.floor(rng() * 3); // 2-4
  else maxZimmer = 1 + Math.floor(rng() * 3); // 1-3

  while (queue.length > 0 && raeume.length + queue.length < maxZimmer) {
    const raum = queue.shift();
    // Prüfen, ob geteilt werden kann
    const kannTeilenVertikal = raum.b >= 8; // 2 * 4 + 1 Wand
    const kannTeilenHorizontal = raum.h >= 8;

    if (!kannTeilenVertikal && !kannTeilenHorizontal) {
      raeume.push(raum);
      continue;
    }

    // Entscheiden, ob geteilt wird
    // (Claude) bis zur Mindestzahl immer teilen
    const mindest = stock === 'eg' ? 4 : stock === 'keller' ? 2 : 1;
    const teilen = raeume.length + queue.length < mindest || rng() < 0.7;
    if (!teilen) {
      raeume.push(raum);
      continue;
    }

    let geteilt = false;
    if (kannTeilenVertikal && kannTeilenHorizontal) {
      if (rng() < 0.5) {
        // Vertikal teilen
        const wandX = raum.x + 4 + Math.floor(rng() * (raum.b - 8));
        for (let y = raum.y; y < raum.y + raum.h; y++) {
          kacheln[idx(wandX, y)] = T.WAND;
        }
        queue.push({ x: raum.x, y: raum.y, b: wandX - raum.x, h: raum.h });
        queue.push({ x: wandX + 1, y: raum.y, b: raum.x + raum.b - wandX - 1, h: raum.h });
        geteilt = true;
      } else {
        // Horizontal teilen
        const wandY = raum.y + 4 + Math.floor(rng() * (raum.h - 8));
        for (let x = raum.x; x < raum.x + raum.b; x++) {
          kacheln[idx(x, wandY)] = T.WAND;
        }
        queue.push({ x: raum.x, y: raum.y, b: raum.b, h: wandY - raum.y });
        queue.push({ x: raum.x, y: wandY + 1, b: raum.b, h: raum.y + raum.h - wandY - 1 });
        geteilt = true;
      }
    } else if (kannTeilenVertikal) {
      const wandX = raum.x + 4 + Math.floor(rng() * (raum.b - 8));
      for (let y = raum.y; y < raum.y + raum.h; y++) {
        kacheln[idx(wandX, y)] = T.WAND;
      }
      queue.push({ x: raum.x, y: raum.y, b: wandX - raum.x, h: raum.h });
      queue.push({ x: wandX + 1, y: raum.y, b: raum.x + raum.b - wandX - 1, h: raum.h });
      geteilt = true;
    } else if (kannTeilenHorizontal) {
      const wandY = raum.y + 4 + Math.floor(rng() * (raum.h - 8));
      for (let x = raum.x; x < raum.x + raum.b; x++) {
        kacheln[idx(x, wandY)] = T.WAND;
      }
      queue.push({ x: raum.x, y: raum.y, b: raum.b, h: wandY - raum.y });
      queue.push({ x: raum.x, y: wandY + 1, b: raum.b, h: raum.y + raum.h - wandY - 1 });
      geteilt = true;
    }

    if (!geteilt) {
      raeume.push(raum);
    }
  }

  // Restliche Räume aus der Queue übernehmen
  while (queue.length > 0) {
    raeume.push(queue.shift());
  }

  // Räume sortieren: größte zuerst (für Zimmerarten)
  raeume.sort((a, c) => c.b * c.h - a.b * a.h);

  // Türen zwischen benachbarten Zimmern platzieren
  const tueren = [];
  const verbunden = new Array(raeume.length).fill(false);
  const adjazenz = [];

  // Adjazenzliste erstellen
  for (let i = 0; i < raeume.length; i++) adjazenz[i] = [];   // (Claude) vorab für alle
  for (let i = 0; i < raeume.length; i++) {
    for (let j = i + 1; j < raeume.length; j++) {
      const r1 = raeume[i];
      const r2 = raeume[j];
      // Prüfen, ob sie eine gemeinsame Wand haben
      let gemeinsameWand = null;
      // Vertikale Nachbarschaft
      // (Claude) Zimmer sind durch eine Wandkachel getrennt: rechtes Zimmer beginnt bei Wand + 1
      if (r1.x + r1.b + 1 === r2.x && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h) {
        const yStart = Math.max(r1.y, r2.y);
        const yEnd = Math.min(r1.y + r1.h, r2.y + r2.h);
        if (yEnd - yStart >= 3) {
          gemeinsameWand = { x: r1.x + r1.b, yStart, yEnd, richtung: 'vertikal' };
        }
      } else if (r2.x + r2.b + 1 === r1.x && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h) {
        const yStart = Math.max(r1.y, r2.y);
        const yEnd = Math.min(r1.y + r1.h, r2.y + r2.h);
        if (yEnd - yStart >= 3) {
          gemeinsameWand = { x: r2.x + r2.b, yStart, yEnd, richtung: 'vertikal' };
        }
      }
      // Horizontale Nachbarschaft
      if (!gemeinsameWand && r1.y + r1.h + 1 === r2.y && r1.x < r2.x + r2.b && r2.x < r1.x + r1.b) {
        const xStart = Math.max(r1.x, r2.x);
        const xEnd = Math.min(r1.x + r1.b, r2.x + r2.b);
        if (xEnd - xStart >= 3) {
          gemeinsameWand = { y: r1.y + r1.h, xStart, xEnd, richtung: 'horizontal' };
        }
      } else if (!gemeinsameWand && r2.y + r2.h + 1 === r1.y && r1.x < r2.x + r2.b && r2.x < r1.x + r1.b) {
        const xStart = Math.max(r1.x, r2.x);
        const xEnd = Math.min(r1.x + r1.b, r2.x + r2.b);
        if (xEnd - xStart >= 3) {
          gemeinsameWand = { y: r2.y + r2.h, xStart, xEnd, richtung: 'horizontal' };
        }
      }

      if (gemeinsameWand) {
        adjazenz[i].push({ raum: j, wand: gemeinsameWand });
        adjazenz[j].push({ raum: i, wand: gemeinsameWand });
      }
    }
  }

  // Spannbaum über adjazenz
  const besucht = new Array(raeume.length).fill(false);
  besucht[0] = true;
  const spannbaumKanten = [];
  const queue2 = [0];

  while (queue2.length > 0) {
    const aktuell = queue2.shift();
    for (const { raum: nachbar, wand } of adjazenz[aktuell]) {
      if (!besucht[nachbar]) {
        besucht[nachbar] = true;
        spannbaumKanten.push({ von: aktuell, nach: nachbar, wand });
        queue2.push(nachbar);
      }
    }
  }

  // Türen für Spannbaumkanten platzieren
  const tuerPositionen = new Set();
  for (const { wand } of spannbaumKanten) {
    let tx, ty;
    if (wand.richtung === 'vertikal') {
      tx = wand.x;
      const moeglicheY = [];
      for (let y = wand.yStart + 1; y < wand.yEnd - 1; y++) {
        // Nicht an Ecken/Wandkreuzungen
        if (kacheln[idx(tx - 1, y)] === T.BODEN && kacheln[idx(tx + 1, y)] === T.BODEN) {
          moeglicheY.push(y);
        }
      }
      if (moeglicheY.length === 0) continue;
      ty = moeglicheY[Math.floor(rng() * moeglicheY.length)];
    } else {
      ty = wand.y;
      const moeglicheX = [];
      for (let x = wand.xStart + 1; x < wand.xEnd - 1; x++) {
        if (kacheln[idx(x, ty - 1)] === T.BODEN && kacheln[idx(x, ty + 1)] === T.BODEN) {
          moeglicheX.push(x);
        }
      }
      if (moeglicheX.length === 0) continue;
      tx = moeglicheX[Math.floor(rng() * moeglicheX.length)];
    }
    kacheln[idx(tx, ty)] = T.INNENTUER;
    tuerPositionen.add(`${tx},${ty}`);
    tueren.push({ x: tx, y: ty, verschlossen: false });
  }

  // Zusätzliche Tür (höchstens 1)
  const zusaetzlicheKanten = [];
  for (let i = 0; i < raeume.length; i++) {
    for (const { raum: j, wand } of adjazenz[i]) {
      if (i < j) {
        const schonVerbunden = spannbaumKanten.some(k => (k.von === i && k.nach === j) || (k.von === j && k.nach === i));
        if (!schonVerbunden) {
          zusaetzlicheKanten.push({ von: i, nach: j, wand });
        }
      }
    }
  }

  if (zusaetzlicheKanten.length > 0 && rng() < 0.5) {
    const kante = zusaetzlicheKanten[Math.floor(rng() * zusaetzlicheKanten.length)];
    const { wand } = kante;
    let tx, ty;
    if (wand.richtung === 'vertikal') {
      tx = wand.x;
      const moeglicheY = [];
      for (let y = wand.yStart + 1; y < wand.yEnd - 1; y++) {
        if (kacheln[idx(tx - 1, y)] === T.BODEN && kacheln[idx(tx + 1, y)] === T.BODEN && !tuerPositionen.has(`${tx},${y}`)) {
          moeglicheY.push(y);
        }
      }
      if (moeglicheY.length > 0) {
        ty = moeglicheY[Math.floor(rng() * moeglicheY.length)];
        kacheln[idx(tx, ty)] = T.INNENTUER;
        tuerPositionen.add(`${tx},${ty}`);
        tueren.push({ x: tx, y: ty, verschlossen: false });
      }
    } else {
      ty = wand.y;
      const moeglicheX = [];
      for (let x = wand.xStart + 1; x < wand.xEnd - 1; x++) {
        if (kacheln[idx(x, ty - 1)] === T.BODEN && kacheln[idx(x, ty + 1)] === T.BODEN && !tuerPositionen.has(`${x},${ty}`)) {
          moeglicheX.push(x);
        }
      }
      if (moeglicheX.length > 0) {
        tx = moeglicheX[Math.floor(rng() * moeglicheX.length)];
        kacheln[idx(tx, ty)] = T.INNENTUER;
        tuerPositionen.add(`${tx},${ty}`);
        tueren.push({ x: tx, y: ty, verschlossen: false });
      }
    }
  }

  // Haustür (nur eg)
  let ausgang = null;
  let flurIndex = 0;
  if (stock === 'eg') {
    // (Claude) Haustür auf der Seite, auf der sie draußen liegt (oben, unten, links, rechts),
    // nur dort, wo innen Boden ist (nicht vor einer Trennwand)
    const nach = { oben: [0, 1], unten: [0, -1], links: [1, 0], rechts: [-1, 0] }[seite] ?? [0, -1];
    const moeglich = [];
    if (seite === 'links' || seite === 'rechts') {
      const ax = seite === 'links' ? ox : ox + b - 1;
      for (let y = oy + 2; y < oy + h - 2; y++) if (kacheln[idx(ax + nach[0], y)] === T.BODEN) moeglich.push([ax, y]);
      if (!moeglich.length) moeglich.push([ax, oy + 1 + Math.floor(rng() * (h - 2))]);
    } else {
      const ay = seite === 'oben' ? oy : oy + h - 1;
      for (let x = ox + 2; x < ox + b - 2; x++) if (kacheln[idx(x, ay + nach[1])] === T.BODEN) moeglich.push([x, ay]);
      if (!moeglich.length) moeglich.push([ox + 1 + Math.floor(rng() * (b - 2)), ay]);
    }
    const [ausgangX, ausgangY] = moeglich[Math.floor(rng() * moeglich.length)];
    kacheln[idx(ausgangX, ausgangY)] = T.AUSGANG;
    ausgang = { x: ausgangX, y: ausgangY, nach };
    // Flur = Zimmer hinter der Haustür
    const fx = ausgangX + nach[0], fy = ausgangY + nach[1];
    for (let i = 0; i < raeume.length; i++) {
      const r = raeume[i];
      if (fx >= r.x && fx < r.x + r.b && fy >= r.y && fy < r.y + r.h) { flurIndex = i; break; }
    }
  }

  // Zimmerarten zuweisen
  const raumTypen = new Array(raeume.length).fill('');
  if (stock === 'eg') {
    raumTypen[flurIndex] = 'flur';
    const typen = ['wohnzimmer', 'kueche', 'schlafzimmer', 'bad', 'kinderzimmer', 'abstellraum'];
    let typIndex = 0;
    for (let i = 0; i < raeume.length; i++) {
      if (i === flurIndex) continue;
      if (typIndex < typen.length) {
        raumTypen[i] = typen[typIndex++];
      } else {
        raumTypen[i] = 'abstellraum';
      }
    }
  } else if (stock === 'keller') {
    const typen = ['kellerraum', 'heizungsraum', 'vorratskeller'];
    for (let i = 0; i < raeume.length; i++) {
      raumTypen[i] = typen[Math.min(i, typen.length - 1)];
    }
  } else {
    for (let i = 0; i < raeume.length; i++) {
      raumTypen[i] = 'dachboden';
    }
  }

  // Treppen platzieren
  const treppen = [];
  if (stock === 'eg') {
    if (hatKeller) {
      // Treppe runter im Flur oder angrenzendem Zimmer
      const kandidaten = [];
      for (let i = 0; i < raeume.length; i++) {
        if (i === flurIndex || adjazenz[flurIndex].some(a => a.raum === i)) {
          const r = raeume[i];
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.b; x++) {
              if (kacheln[idx(x, y)] === T.BODEN && grenztAnWand(kacheln, x, y, ox, oy, b, h) && !nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h)) {
                kandidaten.push({ x, y });
              }
            }
          }
        }
      }
      if (kandidaten.length > 0) {
        const pos = kandidaten[Math.floor(rng() * kandidaten.length)];
        kacheln[idx(pos.x, pos.y)] = T.TREPPE_RUNTER;
        treppen.push({ x: pos.x, y: pos.y, art: 'runter', ziel: 'keller' });
      }
    }
    if (hatDach) {
      const kandidaten = [];
      for (let i = 0; i < raeume.length; i++) {
        if (i === flurIndex || adjazenz[flurIndex].some(a => a.raum === i)) {
          const r = raeume[i];
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.b; x++) {
              if (kacheln[idx(x, y)] === T.BODEN && grenztAnWand(kacheln, x, y, ox, oy, b, h) && !nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h)) {
                kandidaten.push({ x, y });
              }
            }
          }
        }
      }
      if (kandidaten.length > 0) {
        const pos = kandidaten[Math.floor(rng() * kandidaten.length)];
        kacheln[idx(pos.x, pos.y)] = T.TREPPE_HOCH;
        treppen.push({ x: pos.x, y: pos.y, art: 'hoch', ziel: 'dach' });
      }
    }
  } else if (stock === 'keller') {
    // Treppe hoch zurück ins EG
    const kandidaten = [];
    for (const r of raeume) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.b; x++) {
          if (kacheln[idx(x, y)] === T.BODEN && grenztAnWand(kacheln, x, y, ox, oy, b, h) && !nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h)) {
            kandidaten.push({ x, y });
          }
        }
      }
    }
    if (kandidaten.length > 0) {
      const pos = kandidaten[Math.floor(rng() * kandidaten.length)];
      kacheln[idx(pos.x, pos.y)] = T.TREPPE_HOCH;
      treppen.push({ x: pos.x, y: pos.y, art: 'hoch', ziel: 'eg' });
    }
  } else {
    // Dach: Treppe runter zurück ins EG
    const kandidaten = [];
    for (const r of raeume) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.b; x++) {
          if (kacheln[idx(x, y)] === T.BODEN && grenztAnWand(kacheln, x, y, ox, oy, b, h) && !nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h)) {
            kandidaten.push({ x, y });
          }
        }
      }
    }
    if (kandidaten.length > 0) {
      const pos = kandidaten[Math.floor(rng() * kandidaten.length)];
      kacheln[idx(pos.x, pos.y)] = T.TREPPE_RUNTER;
      treppen.push({ x: pos.x, y: pos.y, art: 'runter', ziel: 'eg' });
    }
  }

  // Möbel platzieren
  const moebel = [];
  const behaelter = [];
  const behaelterZaehler = { count: 0 };

  for (let i = 0; i < raeume.length; i++) {
    const raum = raeume[i];
    const typ = raumTypen[i];
    const moebelArten = [];

    switch (typ) {
      case 'wohnzimmer':
        moebelArten.push({ art: 'sofa', b: 3, h: 1 });
        moebelArten.push({ art: 'couchtisch', b: 2, h: 1 });
        moebelArten.push({ art: 'schrank', b: 2, h: 1 });
        moebelArten.push({ art: 'regal', b: 1, h: 2 });
        break;
      case 'kueche':
        moebelArten.push({ art: 'herd', b: 1, h: 1 });
        moebelArten.push({ art: 'kuehlschrank', b: 1, h: 1 });
        moebelArten.push({ art: 'spuele', b: 1, h: 1 });
        moebelArten.push({ art: 'esstisch', b: 2, h: 2 });
        break;
      case 'schlafzimmer':
      case 'kinderzimmer':
        moebelArten.push({ art: 'bett', b: 2, h: 3 });
        moebelArten.push({ art: 'schrank', b: 2, h: 1 });
        moebelArten.push({ art: 'kommode', b: 1, h: 1 });
        break;
      case 'bad':
        if (rng() < 0.5) {
          moebelArten.push({ art: 'badewanne', b: 1, h: 2 });
        } else {
          moebelArten.push({ art: 'badewanne', b: 2, h: 1 });
        }
        moebelArten.push({ art: 'waschbecken', b: 1, h: 1 });
        moebelArten.push({ art: 'klo', b: 1, h: 1 });
        break;
      case 'flur':
        moebelArten.push({ art: 'garderobe', b: 1, h: 1 });
        moebelArten.push({ art: 'kommode', b: 1, h: 1 });
        break;
      case 'abstellraum':
        moebelArten.push({ art: 'regal', b: 1, h: 2 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        break;
      case 'kellerraum':
      case 'vorratskeller':
        moebelArten.push({ art: 'regal', b: 1, h: 2 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        break;
      case 'heizungsraum':
        moebelArten.push({ art: 'heizung', b: 2, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        break;
      case 'dachboden':
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'kiste', b: 1, h: 1 });
        moebelArten.push({ art: 'alter_schrank', b: 2, h: 1 });
        break;
    }

    // Möbel platzieren
    for (const m of moebelArten) {
      // Versuche, eine Position zu finden
      const pos = findeMoebelPosition(kacheln, raum, m.b, m.h, ox, oy, b, h, rng, m.art);
      if (pos) {
        platziereMoebel(kacheln, moebel, behaelter, m.art, pos.x, pos.y, pos.b, pos.h, ox, oy, b, h, behaelterZaehler);
      }
    }
  }

  // Türen verschließen (Claude: ca. 30 %; vom Flur aus bleibt mindestens eine Tür offen)
  const amFlur = t => {
    if (stock !== 'eg') return false;
    const f = raeume[flurIndex];
    return [[t.x + 1, t.y], [t.x - 1, t.y], [t.x, t.y + 1], [t.x, t.y - 1]]
      .some(([nx, ny]) => nx >= f.x && nx < f.x + f.b && ny >= f.y && ny < f.y + f.h);
  };
  let offeneAmFlur = tueren.filter(amFlur).length;
  for (const tuer of tueren) {
    if (rng() >= 0.3) continue;
    if (amFlur(tuer)) { if (offeneAmFlur <= 1) continue; offeneAmFlur--; }
    tuer.verschlossen = true;
  }


  // Zombie-Plätze
  const zombiePlaetze = [];
  for (let i = 0; i < raeume.length; i++) {
    if (stock === 'eg' && i === flurIndex) continue;
    if (rng() < 0.45) {
      const raum = raeume[i];
      const kandidaten = [];
      for (let y = raum.y; y < raum.y + raum.h; y++) {
        for (let x = raum.x; x < raum.x + raum.b; x++) {
          if (kacheln[idx(x, y)] === T.BODEN && !nebenTuerOderTreppe(kacheln, x, y, ox, oy, b, h)) {
            kandidaten.push({ x, y });
          }
        }
      }
      if (kandidaten.length > 0) {
        const pos = kandidaten[Math.floor(rng() * kandidaten.length)];
        zombiePlaetze.push({
          x: pos.x * KACHEL + KACHEL / 2,
          y: pos.y * KACHEL + KACHEL / 2,
        });
      }
    }
  }

  // Startposition
  let start;
  if (stock === 'eg') {
    // Bodenkachel direkt innen vor dem Ausgang
    const sx = ausgang.x + ausgang.nach[0];
    const sy = ausgang.y + ausgang.nach[1];
    start = { x: sx * KACHEL + KACHEL / 2, y: sy * KACHEL + KACHEL / 2 };
  } else {
    // Neben der Treppe
    if (treppen.length > 0) {
      const treppe = treppen[0];
      const nachbarn = [[treppe.x + 1, treppe.y], [treppe.x - 1, treppe.y], [treppe.x, treppe.y + 1], [treppe.x, treppe.y - 1]];
      let gefunden = false;
      for (const [nx, ny] of nachbarn) {
        if (nx >= ox && nx < ox + b && ny >= oy && ny < oy + h && kacheln[idx(nx, ny)] === T.BODEN) {
          start = { x: nx * KACHEL + KACHEL / 2, y: ny * KACHEL + KACHEL / 2 };
          gefunden = true;
          break;
        }
      }
      if (!gefunden) {
        // Fallback: erste Bodenkachel
        for (let y = oy; y < oy + h; y++) {
          for (let x = ox; x < ox + b; x++) {
            if (kacheln[idx(x, y)] === T.BODEN) {
              start = { x: x * KACHEL + KACHEL / 2, y: y * KACHEL + KACHEL / 2 };
              gefunden = true;
              break;
            }
          }
          if (gefunden) break;
        }
      }
    } else {
      // Fallback: erste Bodenkachel
      for (let y = oy; y < oy + h; y++) {
        for (let x = ox; x < ox + b; x++) {
          if (kacheln[idx(x, y)] === T.BODEN) {
            start = { x: x * KACHEL + KACHEL / 2, y: y * KACHEL + KACHEL / 2 };
            break;
          }
        }
      }
    }
  }

  // Räume mit Typen zurückgeben
  const raeumeMitTyp = raeume.map((r, i) => ({
    x: r.x,
    y: r.y,
    b: r.b,
    h: r.h,
    typ: raumTypen[i],
  }));

  // (Claude) Behälter, deren Zugang später zugestellt wurde, auf eine zugängliche Kachel ihres Möbels setzen
  const GEHBAR = new Set([T.BODEN, T.TUER_OFFEN, T.INNENTUER, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH]);
  const zugang = (mx, my) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => GEHBAR.has(kacheln[idx(mx + dx, my + dy)]));
  for (let i = behaelter.length - 1; i >= 0; i--) {
    const bh = behaelter[i];
    const kx = Math.floor(bh.x / KACHEL), ky = Math.floor(bh.y / KACHEL);
    if (zugang(kx, ky)) continue;
    const m = moebel.find(m => kx >= m.x && kx < m.x + m.b && ky >= m.y && ky < m.y + m.h);
    let neu = null;
    if (m) for (let dy = 0; dy < m.h && !neu; dy++) for (let dx = 0; dx < m.b && !neu; dx++) if (zugang(m.x + dx, m.y + dy)) neu = [m.x + dx, m.y + dy];
    if (neu) { bh.x = neu[0] * KACHEL + KACHEL / 2; bh.y = neu[1] * KACHEL + KACHEL / 2; }
    else behaelter.splice(i, 1);
  }

  return {
    seed,
    nr,
    stock,
    ox,
    oy,
    b,
    h,
    kacheln,
    hole: (x, y) => {
      if (x < 0 || x >= BREITE || y < 0 || y >= HOEHE) return T.LEER;
      return kacheln[idx(x, y)];
    },
    start,
    ausgang,
    hatKeller,
    hatDach,
    treppen,
    tueren,
    raeume: raeumeMitTyp,
    moebel,
    behaelter,
    zombiePlaetze,
  };
}
