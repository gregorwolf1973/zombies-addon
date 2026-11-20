// Spielwelt aus einer umgerechneten OpenStreetMap-Karte (tools/osm_karte.py).
// Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0.
import { KACHEL, BREITE, HOEHE, T, zufall, BLOCKIERT, FEIN, FEIN_PX, safeRoomsVervollstaendigen } from './welt.mjs';
import { randParkplaetze, strassenBuchten, fahrbahnBreite } from './vektor.mjs';
import { baueStuetzpunkt } from './stuetzpunkt.mjs';

// Gebäude, die Safe Rooms werden (erster Treffer je Eintrag), mit Anzeigenamen
const SAFE_WUNSCH = [
  [/maria hilf/i, 'Kirche Maria Hilf'],
  [/karl-lederer/i, 'Karl-Lederer-Schule'],
  [/franz-marc/i, 'Franz-Marc-Schule'],
  [/st\.? ?ursula|pflegeheim/i, 'Pflegeheim St. Ursula'],
];
// Zusatzmuster: nur wenn die Hauptliste weniger als 3 Safe Rooms ergibt (andere Karten wie die Isarauen);
// Geretsried findet 4 Treffer und bleibt damit unverändert
const SAFE_ZUSATZ = [
  [/evangelische gemeinschaft|kirche|kapelle/i, 'Evangelische Gemeinschaft'],
  [/g[äa]rtnerei/i, 'Gärtnerei Holzer'],
  [/leitner|bauunternehm/i, 'Bauunternehmung Leitner'],
  [/goldhofer|schauer/i, 'Werkhalle Goldhofer & Schauer'],
  [/feuerwehr|kraftwerk|gasthof|gasthaus|wirtshaus|hof\b/i, null],
  [/m[öo]max|k[üu]chenmarkt|intersport|xxxlutz/i, null],
];
const RICHTUNGEN = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Zäune/Hecken ausdünnen (deterministisch, nach Position): rund 15 % der Linienstücke fallen weg, bevorzugt zwischen eng
// stehenden Gebäuden; zwischen zwei benachbarten Häusern bleibt mindestens eine Lücke. Die JSON-Karte bleibt unverändert,
// es entsteht eine Kopie mit gelichteten Zaunlinien, Zaunart und groben Zaunkacheln.
// Jede Lücke wird nachträglich um je ein Nachbarstück verbreitert (3 Stücke = 2,25 Kacheln = 72 px): Spieler/Zombie-Durchmesser
// 22 px + Zaundicke bis 18 px + Reserve; die Ausgangswahrscheinlichkeiten sind daher niedriger.
const LUECKE_BASIS = 0.01, LUECKE_ENG = 0.05;
const posHash = (x, y) => { let h = (Math.round(x * 8) * 73856093) ^ (Math.round(y * 8) * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
// Fisher-Yates mit dem Welt-Zufall: auf jeder JS-Engine gleich (anders als sort mit Zufallsvergleich)
function mischen(liste, r) {
  for (let i = liste.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [liste[i], liste[j]] = [liste[j], liste[i]]; }
  return liste;
}
export function zaeuneAusduennen(karte) {
  if (!karte.zaeune?.length) return karte;
  const geb = karte.gebaeude.map(g => ({ x0: g.x, y0: g.y, x1: g.x + g.b, y1: g.y + g.h }));
  const abstand = (b, px, py) => Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1));
  const segs = [];
  // Linien in Stücke von höchstens 0,75 Kacheln zerlegen, damit Lücken fein ausfallen
  karte.zaeune.forEach((z, li) => { let nr = 0; for (let i = 0; i + 3 < z.p.length; i += 2) {
    const ax = z.p[i], ay = z.p[i + 1], bx = z.p[i + 2], by = z.p[i + 3], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.75));
    for (let j = 0; j < n; j++) {
      const x0 = ax + (bx - ax) * j / n, y0 = ay + (by - ay) * j / n, x1 = ax + (bx - ax) * (j + 1) / n, y1 = ay + (by - ay) * (j + 1) / n;
      segs.push({ li, i: nr++, ax: x0, ay: y0, bx: x1, by: y1, mx: (x0 + x1) / 2, my: (y0 + y1) / 2, len: Math.hypot(x1 - x0, y1 - y0), weg: false });
    }
  } });
  const nahe = (px, py, r) => { let n = 0; for (const b of geb) if (abstand(b, px, py) <= r && ++n >= 2) break; return n; };
  for (const sg of segs) sg.weg = posHash(sg.mx, sg.my) < (nahe(sg.mx, sg.my, 3) >= 2 ? LUECKE_ENG : LUECKE_BASIS);
  // benachbarte Häuser (Abstand 0,3–4 Kacheln, sich gegenüberstehend): mindestens ein Stück je Zaunlinie im Zwischenraum frei
  for (let a = 0; a < geb.length; a++) for (let c = a + 1; c < geb.length; c++) {
    const A = geb[a], B = geb[c];
    const dx = Math.max(0, A.x0 - B.x1, B.x0 - A.x1), dy = Math.max(0, A.y0 - B.y1, B.y0 - A.y1);
    const ueberX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), ueberY = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    const gap = Math.hypot(dx, dy);
    if (gap > 3.5 || !((dx > 0 && ueberY > 0) || (dy > 0 && ueberX > 0))) continue;
    const x0 = Math.max(A.x0, B.x0) - (dx > 0 ? 0 : 0), x1 = Math.min(A.x1, B.x1), y0 = Math.max(A.y0, B.y0), y1 = Math.min(A.y1, B.y1);
    const rx0 = dx > 0 ? Math.min(A.x1, B.x1) - 0.5 : x0, rx1 = dx > 0 ? Math.max(A.x0, B.x0) + 0.5 : x1;
    const ry0 = dy > 0 ? Math.min(A.y1, B.y1) - 0.5 : y0, ry1 = dy > 0 ? Math.max(A.y0, B.y0) + 0.5 : y1;
    const cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2;
    const korridor = segs.filter(sg => sg.mx >= rx0 && sg.mx <= rx1 && sg.my >= ry0 && sg.my <= ry1);
    const nachLinie = new Map();
    for (const sg of korridor) { (nachLinie.get(sg.li) ?? nachLinie.set(sg.li, []).get(sg.li)).push(sg); }
    for (const liste of nachLinie.values()) {
      if (liste.some(sg => sg.weg)) continue;
      liste.sort((p, q) => Math.hypot(p.mx - cx, p.my - cy) - Math.hypot(q.mx - cx, q.my - cy));
      liste[0].weg = true;
    }
  }
  // jede Lücke um je ein Nachbarstück verbreitern (mind. 3 Stücke ≈ 72 px, Figur passt sicher durch)
  const nachLi = new Map();
  for (const n of segs) (nachLi.get(n.li) ?? nachLi.set(n.li, new Map()).get(n.li)).set(n.i, n);
  for (const sg of segs.filter(s => s.weg)) for (const d of [-1, 1]) { const n = nachLi.get(sg.li).get(sg.i + d); if (n) n.weg = true; }
  const zaeune = [];
  karte.zaeune.forEach((z, li) => {
    let teil = null;
    for (const sg of segs) {
      if (sg.li !== li) continue;
      if (sg.weg) { teil = null; continue; }
      if (!teil) { teil = { a: z.a, p: [sg.ax, sg.ay] }; zaeune.push(teil); }
      teil.p.push(sg.bx, sg.by);
    }
  });
  // grobe Zaunkacheln, die nur zu entfernten Stücken gehören, wieder zur Wiese machen
  const alle = segs, bleibt = segs.filter(sg => !sg.weg);
  const nah = (liste, px, py) => liste.some(sg => {
    const L2 = (sg.bx - sg.ax) ** 2 + (sg.by - sg.ay) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - sg.ax) * (sg.bx - sg.ax) + (py - sg.ay) * (sg.by - sg.ay)) / L2));
    return Math.hypot(sg.ax + t * (sg.bx - sg.ax) - px, sg.ay + t * (sg.by - sg.ay) - py) <= 0.6;
  });
  const kach = karte.kacheln.split(''), art = karte.zaunart.split('');
  for (let i = 0; i < kach.length; i++) {
    if (kach[i] !== String(T.ZAUN) || !'hzmw'.includes(art[i])) continue;
    const px = (i % BREITE) + 0.5, py = Math.floor(i / BREITE) + 0.5;
    if (nah(alle, px, py) && !nah(bleibt, px, py)) { kach[i] = String(T.WIESE); art[i] = '.'; }
  }
  return { ...karte, zaeune, kacheln: kach.join(''), zaunart: art.join('') };
}

// Fluss glätten: Wasserkacheln (nur Wiese <-> Wasser) per Weichzeichner mit Schwelle 0,5 neu entscheiden; Straßen/Brücken,
// Zäune, Gebäude bleiben unberührt, neues Wasser entsteht nur mitten in freier Wiese.
function wasserGlaetten(k, hole, setze, durchgaenge = 3, R = 4) {
  for (let d = 0; d < durchgaenge; d++) {
    const aend = [];
    for (let y = 1; y < HOEHE - 1; y++) for (let x = 1; x < BREITE - 1; x++) {
      const t = k[y * BREITE + x];
      if (t !== T.WIESE && t !== T.WASSER) continue;
      let summe = 0, n = 0, rein = true;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const w = (R + 1 - Math.abs(dx)) * (R + 1 - Math.abs(dy)), v = hole(x + dx, y + dy);
        summe += w * (v === T.WASSER ? 1 : v === T.WIESE ? 0 : (t === T.WASSER ? 1 : 0)); n += w;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && v !== T.WIESE && v !== T.WASSER) rein = false;
      }
      const neu = summe / n > 0.5 ? T.WASSER : T.WIESE;
      if (neu !== t && (neu === T.WIESE || rein)) aend.push([x, y, neu]);
    }
    for (const [x, y, v] of aend) setze(x, y, v);
  }
}

// optionen.autos: Faktor für geparkte Autos (1 = normal)
export function baueWeltAusKarte(karteOrig, seed, optionen = {}) {
  const karte = zaeuneAusduennen(karteOrig);
  const autoFaktor = Number.isFinite(optionen.autos) ? Math.max(0, optionen.autos) : 1;
  const r = zufall(seed ^ 0x6a09e667);
  const k = new Uint8Array(BREITE * HOEHE);
  for (let i = 0; i < k.length; i++) k[i] = karte.kacheln.charCodeAt(i) - 48;
  const setze = (x, y, v) => { if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) k[y * BREITE + x] = v; };
  const hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? k[y * BREITE + x] : T.ZAUN;
  wasserGlaetten(k, hole, setze);

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

  // Abstand (Kacheln, Weg um Wände/Wasser herum) zur nächsten Straße: bestimmt, an welcher Hausseite die Tür sitzt
  const strDist = new Int16Array(BREITE * HOEHE).fill(32767);
  { const q = [];
    for (let i = 0; i < k.length; i++) if (k[i] === T.STRASSE) { strDist[i] = 0; q.push(i); }
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % BREITE, y = (c - x) / BREITE;
      for (const [dx, dy] of RICHTUNGEN) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
        const n = ny * BREITE + nx, t = k[n];
        if (strDist[n] !== 32767 || t === T.WAND || t === T.LEER || t === T.WASSER || t === T.BODEN || t === T.TUER) continue;
        strDist[n] = strDist[c] + 1; q.push(n);
      }
    }
  }
  const AUSSEN_OK = new Set([T.WIESE, T.PLATZ, T.STRASSE, T.BAUM]);
  const ENG = new Set([T.WAND, T.LEER, T.WASSER]);
  // Türseite wählen (deterministisch, ohne Zufall): OSM-Eingang (g.eingang) hat Vorrang; sonst bleibt die Kartentür, wenn sie ins Freie führt,
  // dort mindestens 2 Kacheln bis zum Nachbarhaus/Hindernis frei sind und die Straße nicht deutlich weiter entfernt ist als an der besten Seite;
  // andernfalls wandert die Tür an die Wandkachel mit dem kürzesten Weg zur Straße (Safe-Room-Kandidaten nur oben/unten).
  const tuerWaehlen = (g, raus) => {
    const innenOk = (x, y) => hole(x, y) === T.BODEN;
    const pruefe = (x, y, dx, dy) => {
      const t = hole(x, y);
      if ((t !== T.TUER && t !== T.WAND) || !innenOk(x - dx, y - dy)) return null;
      const aussen = hole(x + dx, y + dy);
      if (!AUSSEN_OK.has(aussen) || ENG.has(hole(x + 2 * dx, y + 2 * dy))) return null;
      return strDist[(y + dy) * BREITE + x + dx];
    };
    if (g.eingang) for (const [dx, dy] of RICHTUNGEN) {
      const d = pruefe(g.eingang.x, g.eingang.y, dx, dy);
      if (d !== null) return { tuer: { x: g.eingang.x, y: g.eingang.y }, raus: { dx, dy } };
    }
    const alt = pruefe(g.tuer.x, g.tuer.y, raus.dx, raus.dy);
    const moeglichSafe = g.flaeche >= 40 || SAFE_WUNSCH.some(([m]) => m.test(g.name ?? '')) || SAFE_ZUSATZ.some(([m]) => m.test(g.name ?? ''));
    let best = null;
    for (let y = g.y - 1; y <= g.y + g.h; y++) for (let x = g.x - 1; x <= g.x + g.b; x++) for (const [dx, dy] of RICHTUNGEN) {
      if (moeglichSafe && dx !== 0) continue;
      const d = pruefe(x, y, dx, dy); if (d === null) continue;
      const w = d * 1000 + Math.abs(x - g.tuer.x) + Math.abs(y - g.tuer.y);
      if (!best || w < best.w) best = { w, d, tuer: { x, y }, raus: { dx, dy } };
    }
    if (!best) return { tuer: { ...g.tuer }, raus };
    if (alt !== null && alt <= best.d + 3) return { tuer: { ...g.tuer }, raus };
    return { tuer: best.tuer, raus: best.raus };
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
    const wahl = tuerWaehlen(g, raus);
    if (wahl.tuer.x !== g.tuer.x || wahl.tuer.y !== g.tuer.y) {
      if (hole(g.tuer.x, g.tuer.y) === T.TUER) setze(g.tuer.x, g.tuer.y, T.WAND);
      setze(wahl.tuer.x, wahl.tuer.y, T.TUER);
    }
    const h = { x: g.x, y: g.y, b: g.b, h: g.h, tuer: { ...wahl.tuer }, raus: wahl.raus, nr: haeuser.length, name: g.name ?? '',
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
    safeRooms.push({ id: h.safeId, name: anzeige, haus: h });   // Kiste und Schrank stehen im Innenraum
  }
  // Zu wenige benannte Treffer (andere Karte): Zusatzmuster, dann die größten Gebäude mit Tür
  if (safeRooms.length < 3) {
    const nimm = (h, anzeige) => {
      const zellen = flaecheVon(h).filter(([x, y]) => hole(x, y) === T.BODEN);
      if (zellen.length < 6 || BLOCKIERT.has(hole(h.tuer.x + h.raus.dx, h.tuer.y + h.raus.dy))) return;   // Tür muss ins Freie führen
      h.safe = anzeige; h.safeId = 's' + safeRooms.length;
      safeRooms.push({ id: h.safeId, name: anzeige, haus: h });
    };
    for (const [muster, anzeige] of SAFE_ZUSATZ) {
      if (safeRooms.length >= 5) break;
      const h = haeuser.find(h => !h.safe && muster.test(h.name));
      if (h) nimm(h, anzeige ?? h.name);
    }
    const gross = haeuser.filter(h => !h.safe && h.flaeche >= 40).sort((a, b) => b.flaeche - a.flaeche);
    for (const h of gross) { if (safeRooms.length >= 3) break; nimm(h, h.name || 'Lagerhalle'); }
  }
  safeRoomsVervollstaendigen(safeRooms);
  // betretbare Häuser (auch Safe Rooms): Außenhülle nicht begehbar (das Innere ist ein eigener Innenraum)
  for (const h of haeuser) {
    h.betretbar = true;
    for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) if (hole(x, y) === T.BODEN) setze(x, y, T.LEER);
  }

  // Startplatz: größter zusammenhängender Platz in der Kartenmitte (er muss zum großen Gehgebiet gehören,
  // nicht in einer abgeschnittenen Ecke z. B. am Flussufer liegen)
  const imPlatz = new Uint8Array(BREITE * HOEHE);
  const plaetze = [];
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
    if (zellen.length >= 12) plaetze.push({ zellen, mx, my, wert });
  }
  plaetze.sort((a, b) => b.wert - a.wert);
  let besterPlatz = plaetze[0] ?? null;
  if (besterPlatz) {
    // Gehgebiete bestimmen (nur Kacheln mit freier Nachbarschaft, damit schmale Uferstreifen nicht zählen);
    // der erste Platz in einem nicht winzigen Gebiet gewinnt
    const frei3 = i => {
      const cx = i % BREITE, cy = (i - cx) / BREITE;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (BLOCKIERT.has(hole(cx + dx, cy + dy))) return false;
      return true;
    };
    const gebiet = new Int32Array(BREITE * HOEHE).fill(-1), groessen = [];
    for (let i = 0; i < gebiet.length; i++) {
      if (gebiet[i] >= 0 || !frei3(i)) continue;
      const q = [i]; gebiet[i] = groessen.length;
      for (let j = 0; j < q.length; j++) {
        const cx = q[j] % BREITE, cy = (q[j] - cx) / BREITE;
        for (const [dx, dy] of RICHTUNGEN) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
          const n = ny * BREITE + nx;
          if (gebiet[n] < 0 && frei3(n)) { gebiet[n] = gebiet[i]; q.push(n); }
        }
      }
      groessen.push(q.length);
    }
    const gross = Math.max(...groessen);
    const zaehlt = p => {
      const z = p.zellen.reduce((a, c) => Math.hypot(c[0] - p.mx, c[1] - p.my) < Math.hypot(a[0] - p.mx, a[1] - p.my) ? c : a);
      const g = gebiet[z[1] * BREITE + z[0]];
      return g >= 0 && groessen[g] >= gross * 0.08;   // Platz in einer abgeschnittenen Ecke zählt nicht
    };
    if (!zaehlt(besterPlatz)) besterPlatz = plaetze.find(zaehlt) ?? besterPlatz;
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
  // Parkbuchten an Wohnstraßen: nur auf freiem Gelände, nicht vor Haustüren, ohne Überlappung
  const BUCHT_OK = new Set([T.WIESE, T.STRASSE, T.PLATZ]);
  const imRechteck = (b, px, py, rand = 0) => {
    const dx = px - b.x, dy = py - b.y, lx = dx * b.ux + dy * b.uy, ly = -dx * b.uy + dy * b.ux;
    return Math.abs(lx) <= b.laenge / 2 + rand && Math.abs(ly) <= b.tiefe / 2 + rand;
  };
  const abstandRechteck = (b, px, py) => {
    const dx = px - b.x, dy = py - b.y, lx = dx * b.ux + dy * b.uy, ly = -dx * b.uy + dy * b.ux;
    return Math.hypot(Math.max(0, Math.abs(lx) - b.laenge / 2), Math.max(0, Math.abs(ly) - b.tiefe / 2));
  };
  const bPunkte = b => {
    const pts = [];
    const ls = []; for (let l = -b.laenge / 2; l < b.laenge / 2; l += 12) ls.push(l);
    ls.push(b.laenge / 2);   // Ende immer mitprüfen
    for (const l of ls) for (const q of [-1, 0, 1]) {
      const t = q * b.tiefe / 2, wx = b.x + b.ux * l - b.uy * t, wy = b.y + b.uy * l + b.ux * t;
      pts.push([wx, wy]);
    }
    return pts;
  };
  const vorTueren = haeuser.filter(h => h.tuer).map(h => [(h.tuer.x + h.raus.dx + 0.5) * KACHEL, (h.tuer.y + h.raus.dy + 0.5) * KACHEL]);
  const buchten = [];
  if (karte.strassen && autoFaktor > 0) {
    for (const b of strassenBuchten(karte.strassen)) {
      if (!bPunkte(b).every(([px, py]) => BUCHT_OK.has(hole(Math.floor(px / KACHEL), Math.floor(py / KACHEL))))) continue;
      if (vorTueren.some(([px, py]) => abstandRechteck(b, px, py) < 2 * KACHEL)) continue;
      if (abstandRechteck(b, start.x, start.y) < KACHEL * 4) continue;
      if (buchten.some(o => Math.hypot(o.x - b.x, o.y - b.y) < o.laenge / 2 + b.laenge / 2 + 30 && (bPunkte(b).some(([px, py]) => imRechteck(o, px, py, 3)) || bPunkte(o).some(([px, py]) => imRechteck(b, px, py, 3))))) continue;
      buchten.push(b);
    }
  }
  // Autos auf Buchtplätzen: etwa 70 % belegt, Lücken dazwischen
  // In jeder Bucht bleibt mindestens ein Platz frei; längere Buchten (b.extra) lassen entsprechend mehr Plätze frei
  let nBucht = 0;
  for (const b of buchten) {
    const belegt = b.plaetze.map(() => r() <= 0.7 * autoFaktor);
    let n = belegt.filter(Boolean).length;
    const hoechstens = b.plaetze.length - Math.max(1, b.extra ?? 0);
    while (n > hoechstens) { const i = Math.floor(r() * belegt.length); if (belegt[i]) { belegt[i] = false; n--; } }
    b.belegt = n;
    b.plaetze.forEach((q, i) => {
      if (!belegt[i]) return;
      behaelter.push({ id: 'b' + behaelter.length, art: 'auto', platz: 'bucht', x: q.x, y: q.y, winkel: b.winkel + (r() < 0.5 ? Math.PI : 0), farbe: Math.floor(r() * 6) });
      nBucht++;
    });
  }

  // Parkplätze (OSM-Flächen): Autos in Reihen, Lücken dazwischen
  const imPolygon = (px, py, p) => {
    let drin = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > py) !== (p[j + 1] > py) && px < (p[j] - p[i]) * (py - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) drin = !drin;
    }
    return drin;
  };
  let nPark = 0;
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
      if (behaelter.some(b => Math.hypot(b.x - px, b.y - py) < 40)) continue;   // nie übereinander
      behaelter.push({ id: 'b' + behaelter.length, art: 'auto', platz: 'parkplatz', x: px, y: py, senkrecht: quer, farbe: Math.floor(r() * 6) });
      nPark++;
    }
  }

  const autos = Math.round(Math.min(260, randStrasse.length / 16) * autoFaktor);
  if (karte.strassen) {
    // Rest: längs am Fahrbahnrand
    const nRand = Math.max(Math.round(autos * 0.1), Math.round((nBucht + nPark) / 9), autos - nBucht - nPark);
    // längs am Rand der echten Straßenlinie, gerade nach der Straße ausgerichtet
    const plaetze = randParkplaetze(karte.strassen);
    const PLATZ_OK = new Set([T.STRASSE, T.PLATZ, T.WIESE, T.TUER]);
    const passt = q => [-20, 0, 20].every(d => {
      const kx = Math.floor((q.x + q.ux * d) / KACHEL), ky = Math.floor((q.y + q.uy * d) / KACHEL);
      return PLATZ_OK.has(hole(kx, ky)) && hole(kx, ky) !== T.TUER;
    });
    for (let n = 0, v = 0; n < nRand && v < nRand * 20 && plaetze.length; v++) {
      const q = plaetze[Math.floor(r() * plaetze.length)];
      if (!passt(q)) continue;
      if (behaelter.some(b => Math.hypot(b.x - q.x, b.y - q.y) < 52)) continue;
      if (Math.hypot(q.x - start.x, q.y - start.y) < KACHEL * 4) continue;
      behaelter.push({ id: 'b' + behaelter.length, art: 'auto', platz: 'rand', x: q.x, y: q.y, winkel: q.winkel, farbe: Math.floor(r() * 6) });
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
    if (buchten.some(bu => kacheln.some(([a, c]) => abstandRechteck(bu, (a + 0.5) * KACHEL, (c + 0.5) * KACHEL) < KACHEL * 0.75))) continue;
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

  // ---- Straßendeko ----
  function strassenDeko() {
    const garten = karte.garten, objektKachel = new Set();
    for (const o of karte.objekte ?? []) for (let y = o.y; y < o.y + (o.h ?? 1); y++) for (let x = o.x; x < o.x + (o.b ?? 1); x++) objektKachel.add(y * BREITE + x);
    const imGarten = (x, y) => { const g = garten?.[y * BREITE + x]; return !!g && g !== '.'; };
    const tuerVorn = haeuser.filter(h => h.tuer).map(h => [h.tuer.x + h.raus.dx, h.tuer.y + h.raus.dy]);
    const nahTuer = (x, y, d) => tuerVorn.some(([a, b]) => Math.abs(a - x) <= d && Math.abs(b - y) <= d);
    const bauart = new Map(karte.gebaeude.map(g => [g.x + ',' + g.y + ',' + g.b + ',' + g.h, g.building ?? '']));

    // 1. Mülltonnen: Gruppen aus 2–4 Tonnen an der Hauswand neben der Haustür (nie auf der Vorkachel der Tür selbst)
    const TONNEN = ['gelb', 'gruen', 'braun', 'blau'];
    for (const h of haeuser) {
      if (!h.tuer || !h.betretbar) continue;
      const wohnblock = bauart.get(h.x + ',' + h.y + ',' + h.b + ',' + h.h) === 'apartments';
      if (r() > (wohnblock ? 0.9 : 0.5)) continue;
      const fx = h.tuer.x + h.raus.dx, fy = h.tuer.y + h.raus.dy, px = -h.raus.dy, py = h.raus.dx;
      const seite = r() < 0.5 ? 1 : -1;
      for (const s of [seite, -seite]) {
        const tx = fx + px * s, ty = fy + py * s;
        const t = hole(tx, ty);
        if (t !== T.WIESE && t !== T.PLATZ) continue;
        if (objektKachel.has(ty * BREITE + tx)) continue;
        const wand = hole(tx - h.raus.dx, ty - h.raus.dy);
        if (wand !== T.WAND && wand !== T.LEER) continue;                      // Tonnen stehen an der Wand
        if (tuerVorn.some(([a, b]) => (a !== fx || b !== fy) && Math.abs(a - tx) <= 1 && Math.abs(b - ty) <= 1)) continue;   // nicht vor fremden Türen
        const n = wohnblock ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
        const farben = ['grau'];
        const rest = mischen(TONNEN.slice(), r);
        while (farben.length < n) farben.push(rest.pop() ?? 'grau');
        mischen(farben, r);
        muell.tonnen.push({ x: (tx + 0.5) * KACHEL + h.raus.dx * 3, y: (ty + 0.5) * KACHEL + h.raus.dy * 3, winkel: Math.atan2(h.raus.dy, h.raus.dx), farben, rund: r() < 0.25, haus: h.nr });
        behaelter.push({ id: 't' + muell.tonnen.length, art: 'muelltonne', x: (tx + 0.5) * KACHEL + h.raus.dx * 3, y: (ty + 0.5) * KACHEL + h.raus.dy * 3 });   // Tonnengruppe ist durchsuchbar
        break;
      }
    }

    // 2. Container (durchsuchbar): Wertstoffinseln auf Parkplätzen, Mulden und Großtonnen an Läden/Gewerbe/Wohnblocks
    const GEWERBE = new Set(['retail', 'industrial', 'commercial', 'supermarket', 'warehouse', 'office', 'kindergarten', 'school']);
    const behTile = (b) => [Math.floor(b.x / KACHEL), Math.floor(b.y / KACHEL)];
    const containerOK = (x, y) => {
      const t = hole(x, y);
      if ((t !== T.WIESE && t !== T.PLATZ) || imGarten(x, y) || objektKachel.has(y * BREITE + x)) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (BLOCKIERT.has(hole(x + dx, y + dy))) return false;   // nie eine Engstelle zustellen
      if (nahTuer(x, y, 2)) return false;
      const cx = (x + 0.5) * KACHEL, cy = (y + 0.5) * KACHEL;
      if (Math.hypot(cx - start.x, cy - start.y) < KACHEL * 5) return false;
      if (behaelter.some(b => Math.hypot(b.x - cx, b.y - cy) < (b.art === 'bus' ? 80 : b.art === 'container' ? KACHEL * 0.9 : 52))) return false;
      if (buchten.some(bu => abstandRechteck(bu, cx, cy) < KACHEL)) return false;
      if (muell.tonnen.some(g => Math.hypot(g.x - cx, g.y - cy) < KACHEL * 1.3)) return false;
      return true;
    };
    const setzeContainer = (x, y, typ, farbe, winkel = 0) => {
      setze(x, y, T.DEKO);
      behaelter.push({ id: 'c' + behaelter.filter(b => b.art === 'container').length, art: 'container', typ, farbe, winkel, x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL });
    };
    const GLAS = ['gruen', 'weiss', 'braun'], MULDE = ['blau', 'gruen', 'braun'];
    // Gebäude
    for (const h of haeuser) {
      const bau = bauart.get(h.x + ',' + h.y + ',' + h.b + ',' + h.h) ?? '';
      const gewerbe = !!h.art || GEWERBE.has(bau), block = bau === 'apartments';
      if (!gewerbe && !block) continue;
      if (r() > (block ? 0.3 : 0.75)) continue;
      for (let v = 0; v < 30; v++) {
        const x = h.x - 3 + Math.floor(r() * (h.b + 6)), y = h.y - 3 + Math.floor(r() * (h.h + 6));
        if (x >= h.x && x < h.x + h.b && y >= h.y && y < h.y + h.h) continue;
        if (!containerOK(x, y)) continue;
        if (block) setzeContainer(x, y, r() < 0.5 ? 'gross' : 'glas', r() < 0.5 ? 'grau' : GLAS[Math.floor(r() * 3)], 0);
        else setzeContainer(x, y, r() < 0.55 ? 'mulde' : 'gross', MULDE[Math.floor(r() * 3)], r() < 0.5 ? 0 : Math.PI / 2);
        break;
      }
    }
    // Parkplätze: Wertstoffinsel aus bis zu drei Glascontainern (grün, weiß, braun) nebeneinander
    for (const f of karte.flaechen ?? []) {
      if (f.a !== 'parkplatz' || r() > 0.5) continue;
      const xs = f.p.filter((_, i) => i % 2 === 0), ys = f.p.filter((_, i) => i % 2 === 1);
      const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      for (let v = 0; v < 40; v++) {
        const x = x0 + Math.floor(r() * (x1 - x0 + 1)), y = y0 + Math.floor(r() * (y1 - y0 + 1));
        if (!imPolygon(x + 0.5, y + 0.5, f.p) || !containerOK(x, y)) continue;
        let n = 0;
        for (let i = 0; i < 3; i++) {
          if (i > 0 && !(imPolygon(x + i + 0.5, y + 0.5, f.p) && containerOK(x + i, y))) break;
          setzeContainer(x + i, y, 'glas', GLAS[i], 0); n++;
          if (i < 2 && r() < 0.3) break;
        }
        if (n) break;
      }
    }

    // 3. Straßensperren: 1–2 Absperrungen quer über eine Fahrstraße, nie die einzige Verbindung
    const ART = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);
    const FAHR = new Set([...ART, 'service']);
    const innen = (x, y) => x > 1.5 && y > 1.5 && x < BREITE - 1.5 && y < HOEHE - 1.5;
    const sk = (x, y) => x.toFixed(1) + ',' + y.toFixed(1);   // wie Knoten in server/verkehr.mjs
    const knoten = new Map(), kanten = [];
    for (const s of karte.strassen ?? []) {
      if (!FAHR.has(s.t)) continue;
      for (let i = 0; i + 3 < s.p.length; i += 2) {
        const [ax, ay, bx, by] = [s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]];
        if (!innen(ax, ay) || !innen(bx, by) || sk(ax, ay) === sk(bx, by)) continue;
        for (const q of [sk(ax, ay), sk(bx, by)]) if (!knoten.has(q)) knoten.set(q, []);
        knoten.get(sk(ax, ay)).push(sk(bx, by)); knoten.get(sk(bx, by)).push(sk(ax, ay));
        if (ART.has(s.t)) kanten.push({ s, ax, ay, bx, by });
      }
    }
    // Hängt a ohne die Kante a–b (und ihre Doppelgänger) noch mit b zusammen?
    const umfahrbar = (a, b) => {
      const gesehen = new Set([a]), q = [a];
      for (let i = 0; i < q.length; i++) for (const n of knoten.get(q[i])) {
        if ((q[i] === a && n === b) || (q[i] === b && n === a)) continue;
        if (n === b) return true;
        if (!gesehen.has(n)) { gesehen.add(n); q.push(n); }
      }
      return false;
    };
    const kandidaten = [];
    for (const e of kanten) {
      const laenge = Math.hypot(e.bx - e.ax, e.by - e.ay);
      if (laenge < 6) continue;
      const mx = (e.ax + e.bx) / 2, my = (e.ay + e.by) / 2, ux = (e.bx - e.ax) / laenge, uy = (e.by - e.ay) / laenge;
      const fb = fahrbahnBreite({ t: e.s.t, ref: e.s.ref, spuren: Number(e.s.spuren) || 0, breite: parseFloat(e.s.breite) || 0 });
      // Kacheln quer über die Fahrbahn: alle müssen Straße sein (keine Brücke, kein Haus)
      const quer = [];
      for (let o = -fb / 2; o <= fb / 2 + 0.01; o += 4) {
        const kx = Math.floor((mx * KACHEL - uy * o) / KACHEL), ky = Math.floor((my * KACHEL + ux * o) / KACHEL);
        if (hole(kx, ky) !== T.STRASSE) { quer.length = 0; break; }
        if (!quer.some(([a, b]) => a === kx && b === ky)) quer.push([kx, ky]);
      }
      if (!quer.length) continue;
      kandidaten.push({ e, mx, my, ux, uy, fb, quer, breit: quer.length >= 3 });
    }
    // deterministisch mischen, breitere Straßen zuerst (stabile Sortierung nach dem Mischen – kein Zufall im Vergleich,
    // sonst hängt das Ergebnis von der Sortier-Umsetzung der JS-Engine ab und Server/Geräte bauen verschiedene Welten)
    mischen(kandidaten, r).sort((a, b) => b.breit - a.breit);
    for (const c of kandidaten) {
      if (sperren.length >= 2) break;
      const px = c.mx * KACHEL, py = c.my * KACHEL;
      if (Math.hypot(px - start.x, py - start.y) < KACHEL * 14) continue;
      if (sperren.some(o => Math.hypot(o.x - px, o.y - py) < KACHEL * 40)) continue;
      if (c.quer.some(([a, b]) => nahTuer(a, b, 4))) continue;
      if (behaelter.some(b => Math.hypot(b.x - px, b.y - py) < 90)) continue;
      if (buchten.some(bu => abstandRechteck(bu, px, py) < 80)) continue;
      if (deko.some(d => Math.hypot(d.x - px, d.y - py) < 150)) continue;
      if (!umfahrbar(sk(c.e.ax, c.e.ay), sk(c.e.bx, c.e.by))) continue;
      // Fußgänger: mittlere Fahrbahnkacheln sind dicht, die äußeren bleiben als Lücke frei
      const dicht = c.quer.length >= 3 ? c.quer.slice(1, -1) : [];
      for (const [a, b] of dicht) setze(a, b, T.DEKO);
      sperren.push({ x: px, y: py, winkel: Math.atan2(c.uy, c.ux), breite: Math.max(24, c.fb - 2), seite: r() < 0.5 ? 1 : -1,
        kante: [c.e.ax, c.e.ay, c.e.bx, c.e.by], kacheln: dicht });
    }
  }

  // Mülltonnen an Häusern, Container an Läden/Gewerbe/Parkplätzen, Straßensperren (Lage deterministisch über r())
  const muell = { tonnen: [] }, sperren = [];
  strassenDeko();

  // ---- Mehr Bäume: Alleen an Straßen, Gruppen auf Wiesen, in Gärten, Grünflächen und im Wald (ca. +50 % zu den OSM-Bäumen) ----
  function mehrBaeume() {
    const WEG = new Set(['footway', 'path', 'cycleway', 'track', 'steps', 'pedestrian']);
    const nein = new Uint8Array(BREITE * HOEHE);   // 1 = hier darf kein Baum stehen
    const sperre = (x, y, rad = 0) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < BREITE && y + dy < HOEHE) nein[(y + dy) * BREITE + x + dx] = 1; };
    for (const s of karte.strassen ?? []) {   // Fuß-, Rad- und Feldwege bleiben frei
      if (!WEG.has(s.t)) continue;
      for (let i = 0; i + 3 < s.p.length; i += 2) {
        const [ax, ay, bx, by] = [s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
        for (let j = 0; j <= n; j++) sperre(Math.floor(ax + (bx - ax) * j / n), Math.floor(ay + (by - ay) * j / n));
      }
    }
    for (const o of karte.objekte ?? []) for (let y = o.y; y < o.y + (o.h ?? 1); y++) for (let x = o.x; x < o.x + (o.b ?? 1); x++) sperre(x, y);
    for (const h of haeuser) if (h.tuer) sperre(h.tuer.x + h.raus.dx, h.tuer.y + h.raus.dy, 1);   // Haustür-Vorkachel samt Umgebung
    for (const d of deko) sperre(Math.floor(d.x / KACHEL), Math.floor(d.y / KACHEL));
    for (const g of muell.tonnen) sperre(Math.floor(g.x / KACHEL), Math.floor(g.y / KACHEL), 1);
    for (const b of behaelter) sperre(Math.floor(b.x / KACHEL), Math.floor(b.y / KACHEL), b.art === 'auto' ? 0 : 1);
    for (const sp of sperren) sperre(Math.floor(sp.x / KACHEL), Math.floor(sp.y / KACHEL), 2);
    // Flächen: 1 = Wald/Park/Friedhof (bevorzugt), 2 = Sportplatz, Acker, Parkplatz, Spielplatz … (kein Baum)
    const zone = new Uint8Array(BREITE * HOEHE);
    const ZONE = { wald: 1, gruen: 1, friedhof: 1, sport: 2, laufbahn: 2, acker: 2, parkplatz: 2, spielplatz: 2, gewerbe: 2 };
    for (const f of karte.flaechen ?? []) {
      const z = ZONE[f.a]; if (!z) continue;
      const xs = f.p.filter((_, i) => i % 2 === 0), ys = f.p.filter((_, i) => i % 2 === 1);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(BREITE - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(HOEHE - 1, Math.ceil(Math.max(...ys)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (imPolygon(x + 0.5, y + 0.5, f.p)) zone[y * BREITE + x] = Math.max(zone[y * BREITE + x], z);
    }
    const frei = (x, y) => {
      if (x < 2 || y < 2 || x >= BREITE - 2 || y >= HOEHE - 2) return false;
      const i = y * BREITE + x;
      if (hole(x, y) !== T.WIESE || nein[i] || zone[i] === 2) return false;
      if (RICHTUNGEN.some(([a, c]) => hole(x + a, y + c) === T.BAUM)) return false;
      const px = (x + 0.5) * KACHEL, py = (y + 0.5) * KACHEL;
      if (Math.hypot(px - start.x, py - start.y) < KACHEL * 4) return false;
      return !buchten.some(b => abstandRechteck(b, px, py) < KACHEL * 0.9);
    };
    let n0 = 0; for (let i = 0; i < k.length; i++) if (k[i] === T.BAUM) n0++;
    const ziel = Math.round(n0 * 0.5);
    let neu = 0;
    // Alleen: jede dritte freie Wiesenkachel am Straßenrand
    for (let y = 2; y < HOEHE - 2 && neu < ziel * 0.3; y++) for (let x = 2; x < BREITE - 2 && neu < ziel * 0.3; x++) {
      if ((x + y) % 3 !== 0 || r() > 0.35 || !frei(x, y) || !RICHTUNGEN.some(([a, c]) => hole(x + a, y + c) === T.STRASSE)) continue;
      setze(x, y, T.BAUM); neu++;
    }
    // Gruppen von 1–4 Bäumen, in Grünflächen und Wald bevorzugt
    for (let v = 0; neu < ziel && v < ziel * 40; v++) {
      const x = 2 + Math.floor(r() * (BREITE - 4)), y = 2 + Math.floor(r() * (HOEHE - 4));
      if (!frei(x, y) || (zone[y * BREITE + x] !== 1 && r() > 0.6)) continue;
      setze(x, y, T.BAUM); neu++;
      for (let m = Math.floor(r() * 4); m > 0; m--) {
        const gx = x + Math.floor(r() * 5) - 2, gy = y + Math.floor(r() * 5) - 2;
        if (frei(gx, gy)) { setze(gx, gy, T.BAUM); neu++; }
      }
    }
  }
  mehrBaeume();

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
  const welt = { seed, karte: true, kacheln: k, hole, haeuser, parkbuchten: buchten, markt, tor, start, safeRooms, behaelter, deko, vektor: karte.strassen ? vektor : null, details, muell, sperren };
  if (karte.zaeune) welt.fein = baueFein(welt, karte);
  baueStuetzpunkt(welt, seed, setze);   // Bundeswehr-Stützpunkt (eigener Zufall, nach allem anderen)
  tuerenFreihalten(welt, setze, abstandRechteck);   // LETZTER Schritt: Vorplätze leeren, Wege zur Straße öffnen
  return welt;
}

// Feines Kollisionsraster (1 m) aus den echten Umrissen: Häuser nach ihrem OSM-Polygon, Gartenzäune und Hecken nach den
// geglätteten Zaunlinien; alles andere (Wasser, Gartenhäuser, Kartenrand, Busse …) wie im groben Raster.
// Wo das grobe Raster begehbar ist und der Kachelmittelpunkt frei liegt, bleibt der Weg offen (Wegsuche bleibt grob).
function baueFein(welt, karte) {
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, f = new Uint8Array(fb * fh);
  const hole = welt.hole, zaunart = welt.details?.zaunart ?? '';
  const grob = new Uint8Array(BREITE * HOEHE);   // 1 = Kachel wird grob übernommen
  for (const o of welt.details?.objekte ?? []) if (o.a === 'gartenhaus' || o.a === 'pool') for (let y = o.y; y < o.y + (o.h ?? 1); y++) for (let x = o.x; x < o.x + (o.b ?? 1); x++) grob[y * BREITE + x] = 1;
  const kachelFuellen = (kx, ky, wert) => { for (let dy = 0; dy < FEIN; dy++) for (let dx = 0; dx < FEIN; dx++) f[(ky * FEIN + dy) * fb + kx * FEIN + dx] = wert; };
  // 1. grob übernehmen – außer Hauswänden (Polygon) und Gartenzäunen (Linien)
  for (let ky = 0; ky < HOEHE; ky++) for (let kx = 0; kx < BREITE; kx++) {
    const t = hole(kx, ky), i = ky * BREITE + kx;
    if (!BLOCKIERT.has(t)) continue;
    const haus = (t === T.WAND || t === T.LEER) && !grob[i];
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
    const kx0 = Math.max(0, g.x - 2), ky0 = Math.max(0, g.y - 2), kx1 = Math.min(BREITE - 1, g.x + g.b + 1), ky1 = Math.min(HOEHE - 1, g.y + g.h + 1);
    for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) {
      const t = hole(kx, ky), i = ky * BREITE + kx;
      if (grob[i] || t === T.STRASSE || t === T.PLATZ || t === T.TUER || t === T.ZAUN) continue;
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
  const W2 = 1;   // Spielerradius 7 px: die Figur überdeckt höchstens 3 × 3 Feinfelder → Fenster ±1 (Rest macht tuerenFreihalten)
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
  // Suchspeicher einmal anlegen; „marke“ zeigt, ob ein Eintrag zur aktuellen Suche gehört (statt Map je Haus).
  // Warteschlange ohne Array.shift/unshift (bei großen Karten quadratisch, früher ~20 s im Hauptthread):
  // vorn = Stapel für Felder ohne Kosten (wie unshift+shift), hinten = Schlange mit Lesezeiger (wie push+shift) – gleiche Reihenfolge.
  const kostenA = new Int32Array(fb * fh), vorA = new Int32Array(fb * fh), marke = new Uint32Array(fb * fh);
  let lauf = 0;
  for (const h of welt.haeuser) {
    if (!h.tuer || !h.betretbar) continue;
    // Vorplatz (gut eine Kachel vor der Tür, freigehalten) muss erreichbar sein
    const vx = Math.floor((h.tuer.x + 0.5 + h.raus.dx * 1.3) * FEIN), vy = Math.floor((h.tuer.y + 0.5 + h.raus.dy * 1.3) * FEIN);
    const ziel = vy * fb + vx;
    if ([0, -1, -fb, -fb - 1, 1, fb].some(d => erreicht[ziel + d])) continue;
    // Suche: freie Felder kosten 0, Zaun 1, Hausumriss 6 (notfalls ein Stück freigeben); grob feste Dinge sind tabu
    lauf++;
    marke[ziel] = lauf; kostenA[ziel] = 0; vorA[ziel] = -1;
    const vorn = [ziel], hinten = []; let hk = 0;
    const preis = n => !belegt[n] ? 0 : umriss[n] ? 6 : 1;
    let gefunden = -1;
    while (vorn.length || hk < hinten.length) {
      const c = vorn.length ? vorn.pop() : hinten[hk++];
      if (erreicht[c]) { gefunden = c; break; }
      for (const n of nach(c)) {
        if (fest[n]) continue;   // zu nah an festen Dingen: dort passt die Figur nicht durch
        const k = kostenA[c] + preis(n);
        if (marke[n] !== lauf || k < kostenA[n]) { marke[n] = lauf; kostenA[n] = k; vorA[n] = c; if (preis(n)) hinten.push(n); else vorn.push(n); }
      }
    }
    if (gefunden < 0) continue;
    for (let c = gefunden; c >= 0 && c !== ziel; c = vorA[c]) {
      const x = c % fb, y = (c - x) / fb;
      for (let dy = -W2; dy <= W2; dy++) for (let dx = -W2; dx <= W2; dx++) { const i = (y + dy) * fb + x + dx; if (f[i] === 2 || f[i] === 3) f[i] = 0; }
    }
  }
}

// Prüfung: Häuser (betretbar, mit Tür), deren Vorplatz keinen freien Weg (Feinraster, Spielerradius) zu einer Straßenkachel hat.
// Rückwärts-Flutung von allen freien Straßen-Feinfeldern aus; Vorplatz = Kachel vor der Tür.
export function tuerenOhneWeg(welt, rad = 7) {
  const f = welt.fein; if (!f) return [];
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, hole = welt.hole;
  const fr = new Uint8Array(fb * fh);   // 1 = Figur (Radius rad) passt mit Mittelpunkt in dieses Feinfeld
  const FP = FEIN_PX, rf = Math.ceil(rad / FP);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) {
    let ok = 1;
    const x0 = Math.floor(((x + 0.5) * FP - rad) / FP), x1 = Math.floor(((x + 0.5) * FP + rad) / FP);
    const y0 = Math.floor(((y + 0.5) * FP - rad) / FP), y1 = Math.floor(((y + 0.5) * FP + rad) / FP);
    if (x0 < 0 || y0 < 0 || x1 >= fb || y1 >= fh) ok = 0;
    for (let yy = y0; ok && yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (f[yy * fb + xx]) { ok = 0; break; }
    fr[y * fb + x] = ok;
  }
  void rf;
  const erreicht = new Uint8Array(fb * fh), q = [];
  for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) {
    const c = y * fb + x;
    if (fr[c] && hole(Math.floor(x / FEIN), Math.floor(y / FEIN)) === T.STRASSE) { erreicht[c] = 1; q.push(c); }
  }
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % fb, y = (c - x) / fb;
    if (x > 0 && fr[c - 1] && !erreicht[c - 1]) { erreicht[c - 1] = 1; q.push(c - 1); }
    if (x < fb - 1 && fr[c + 1] && !erreicht[c + 1]) { erreicht[c + 1] = 1; q.push(c + 1); }
    if (y > 0 && fr[c - fb] && !erreicht[c - fb]) { erreicht[c - fb] = 1; q.push(c - fb); }
    if (y < fh - 1 && fr[c + fb] && !erreicht[c + fb]) { erreicht[c + fb] = 1; q.push(c + fb); }
  }
  return welt.haeuser.filter(h => {
    if (!h.tuer || !h.betretbar) return false;
    const vx = Math.floor((h.tuer.x + h.raus.dx + 0.5) * FEIN), vy = Math.floor((h.tuer.y + h.raus.dy + 0.5) * FEIN);
    return !erreicht[vy * fb + vx] && !erreicht[vy * fb + vx - 1] && !erreicht[(vy - 1) * fb + vx] && !erreicht[(vy - 1) * fb + vx - 1];
  });
}

// ---- Letzter Schritt des Weltaufbaus: freie Türen ----
// 1. Vorplatz (1,5 × 1,5 Kacheln vor der Tür): kein Zaun, keine Hecke, kein Auto, keine Parkbucht, keine Mülltonne, kein Baum, keine Deko.
// 2. Weg Vorplatz → Straße im Feinraster mit Spielerradius 7 (Figur überdeckt 3 × 3 Feinfelder): Dijkstra, freie Felder kosten 0,
//    Zaun-/Heckenfelder 1, Zaun-/Deko-Kacheln des groben Rasters 4; Hauswände sind tabu. Auf dem Weg werden Zäune geöffnet.
// Alles deterministisch (feste Reihenfolge, keine Zufallsvergleiche) – Server und Geräte bauen dieselbe Welt.
function tuerenFreihalten(welt, setze, abstandRechteck) {
  const hole = welt.hole, K = KACHEL;
  const betr = welt.haeuser.filter(h => h.tuer && h.betretbar);
  // 1. Vorplatz leeren
  for (const h of betr) {
    const cx = (h.tuer.x + 0.5 + h.raus.dx * 1.25) * K, cy = (h.tuer.y + 0.5 + h.raus.dy * 1.25) * K, hw = 0.75 * K;
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hw, y1 = cy + hw;
    const drin = (px, py, m = 0) => px >= x0 - m && px <= x1 + m && py >= y0 - m && py <= y1 + m;
    for (let i = welt.behaelter.length - 1; i >= 0; i--) {
      const b = welt.behaelter[i];
      if ((b.art === 'auto' && drin(b.x, b.y, 22)) || ((b.art === 'muelltonne' || b.art === 'container') && drin(b.x, b.y, 0))) welt.behaelter.splice(i, 1);
    }
    for (let i = welt.muell.tonnen.length - 1; i >= 0; i--) if (drin(welt.muell.tonnen[i].x, welt.muell.tonnen[i].y, 0)) welt.muell.tonnen.splice(i, 1);
    for (let i = welt.parkbuchten.length - 1; i >= 0; i--) {
      const b = welt.parkbuchten[i];
      if (abstandRechteck(b, cx, cy) >= hw * 1.42) continue;
      for (let j = welt.behaelter.length - 1; j >= 0; j--) { const a = welt.behaelter[j]; if (a.art === 'auto' && a.platz === 'bucht' && abstandRechteck(b, a.x, a.y) < 8) welt.behaelter.splice(j, 1); }
      welt.parkbuchten.splice(i, 1);
    }
    for (let i = welt.deko.length - 1; i >= 0; i--) {
      const d = welt.deko[i];
      if (d.art !== 'busch' && d.art !== 'bus') continue;
      if (!(d.kx + d.b > x0 / K && d.kx < x1 / K && d.ky + d.h > y0 / K && d.ky < y1 / K)) continue;
      for (let yy = d.ky; yy < d.ky + d.h; yy++) for (let xx = d.kx; xx < d.kx + d.b; xx++) if (hole(xx, yy) === T.DEKO) setze(xx, yy, d.art === 'bus' ? T.STRASSE : T.WIESE);
      welt.deko.splice(i, 1);
    }
    for (let ky = Math.floor(y0 / K); ky <= Math.floor((y1 - 0.01) / K); ky++) for (let kx = Math.floor(x0 / K); kx <= Math.floor((x1 - 0.01) / K); kx++) {
      const t = hole(kx, ky);
      if (t === T.BAUM || t === T.ZAUN) setze(kx, ky, T.WIESE);
    }
  }
  const f = welt.fein; if (!f) return;
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, N = fb * fh;
  // Fein-Klassen je Feld: 0 frei, 1 Zaun/Hecke (öffenbar), 2 Zaun-/Deko-Kachel des groben Rasters (öffenbar, teuer), 3 fest
  const klasse = new Uint8Array(N), fenster = new Uint8Array(N);
  const feld = c => {
    const v = f[c]; if (!v) return 0;
    if (v === 2) return 1;
    const x = c % fb, y = (c - x) / fb, t = hole(Math.floor(x / FEIN), Math.floor(y / FEIN));
    return t === T.ZAUN || (t === T.DEKO && welt.deko.some(d => (d.art === 'busch') && d.kx === Math.floor(x / FEIN) && d.ky === Math.floor(y / FEIN))) ? 2 : 3;
  };
  const baueKlassen = () => {
    for (let c = 0; c < N; c++) klasse[c] = f[c] ? feld(c) : 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) {
      let m = 0;
      if (x === 0 || y === 0 || x === fb - 1 || y === fh - 1) m = 3;
      else for (let dy = -1; dy <= 1 && m < 3; dy++) for (let dx = -1; dx <= 1; dx++) { const v = klasse[(y + dy) * fb + x + dx]; if (v > m) m = v; }
      fenster[y * fb + x] = m;
    }
  };
  const flut = () => {
    const erreicht = new Uint8Array(N), q = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) { const c = y * fb + x; if (!fenster[c] && hole(Math.floor(x / FEIN), Math.floor(y / FEIN)) === T.STRASSE) { erreicht[c] = 1; q.push(c); } }
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % fb, y = (c - x) / fb;
      if (x > 0 && !fenster[c - 1] && !erreicht[c - 1]) { erreicht[c - 1] = 1; q.push(c - 1); }
      if (x < fb - 1 && !fenster[c + 1] && !erreicht[c + 1]) { erreicht[c + 1] = 1; q.push(c + 1); }
      if (y > 0 && !fenster[c - fb] && !erreicht[c - fb]) { erreicht[c - fb] = 1; q.push(c - fb); }
      if (y < fh - 1 && !fenster[c + fb] && !erreicht[c + fb]) { erreicht[c + fb] = 1; q.push(c + fb); }
    }
    return erreicht;
  };
  baueKlassen();
  let erreicht = flut();
  const KOSTEN = [0, 1, 4];
  const startFelder = h => {
    const vx = Math.floor((h.tuer.x + h.raus.dx + 0.5) * FEIN), vy = Math.floor((h.tuer.y + h.raus.dy + 0.5) * FEIN);
    return [vy * fb + vx, vy * fb + vx - 1, (vy - 1) * fb + vx, (vy - 1) * fb + vx - 1];
  };
  for (const h of betr) {
    const starts = startFelder(h);
    if (starts.some(c => erreicht[c])) continue;
    // Dijkstra (Binärhalde, Gleichstand nach Feldnummer: deterministisch)
    const kost = new Int32Array(N).fill(1 << 30), vor = new Int32Array(N).fill(-1), halde = [];
    const hoch = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    const push = e => { halde.push(e); let i = halde.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!hoch(halde[i], halde[p])) break; [halde[i], halde[p]] = [halde[p], halde[i]]; i = p; } };
    const pop = () => { const top = halde[0], last = halde.pop(); if (halde.length) { halde[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r2 = l + 1; if (l < halde.length && hoch(halde[l], halde[m])) m = l; if (r2 < halde.length && hoch(halde[r2], halde[m])) m = r2; if (m === i) break; [halde[i], halde[m]] = [halde[m], halde[i]]; i = m; } } return top; };
    for (const c of starts) if (fenster[c] < 3) { kost[c] = KOSTEN[fenster[c]]; push([kost[c], c]); }
    let ziel = -1;
    while (halde.length) {
      const [k0, c] = pop();
      if (k0 > kost[c]) continue;
      if (erreicht[c]) { ziel = c; break; }
      const x = c % fb, y = (c - x) / fb;
      for (const n of [x > 0 ? c - 1 : -1, x < fb - 1 ? c + 1 : -1, y > 0 ? c - fb : -1, y < fh - 1 ? c + fb : -1]) {
        if (n < 0 || fenster[n] >= 3) continue;
        const nk = k0 + KOSTEN[fenster[n]];
        if (nk < kost[n]) { kost[n] = nk; vor[n] = c; push([nk, n]); }
      }
    }
    if (ziel < 0) continue;   // Haus eingemauert (Hauswände ringsum): nichts zu öffnen
    for (let c = ziel; c >= 0; c = vor[c]) {
      const x = c % fb, y = (c - x) / fb;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = (y + dy) * fb + x + dx;
        if (!f[i]) continue;
        const kx = Math.floor((x + dx) / FEIN), ky = Math.floor((y + dy) / FEIN), t = hole(kx, ky);
        if (f[i] === 2) f[i] = 0;
        else if (t === T.ZAUN || t === T.DEKO) {
          if (t === T.DEKO) { const di = welt.deko.findIndex(d => d.art === 'busch' && d.kx === kx && d.ky === ky); if (di < 0) continue; welt.deko.splice(di, 1); }
          setze(kx, ky, T.WIESE);
          for (let yy = 0; yy < FEIN; yy++) for (let xx = 0; xx < FEIN; xx++) f[(ky * FEIN + yy) * fb + kx * FEIN + xx] = 0;
        }
      }
    }
    baueKlassen(); erreicht = flut();
  }
  // Feinraster am Vorplatz: Zaunfelder im Vorplatzfenster entfernen (auch wenn schon ein Weg besteht)
  for (const h of betr) {
    const x0 = Math.floor((h.tuer.x + 0.5 + h.raus.dx * 1.25 - 0.75) * FEIN), x1 = Math.ceil((h.tuer.x + 0.5 + h.raus.dx * 1.25 + 0.75) * FEIN);
    const y0 = Math.floor((h.tuer.y + 0.5 + h.raus.dy * 1.25 - 0.75) * FEIN), y1 = Math.ceil((h.tuer.y + 0.5 + h.raus.dy * 1.25 + 0.75) * FEIN);
    for (let y = Math.max(0, y0); y < Math.min(fh, y1); y++) for (let x = Math.max(0, x0); x < Math.min(fb, x1); x++) if (f[y * fb + x] === 2) f[y * fb + x] = 0;
  }
}
