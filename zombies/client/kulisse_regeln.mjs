// Kulisse „Echt“ – reine Regeln ohne Browser (testbar): Schalter, Index der Luftbild-Kacheln, Kachelwahl, Speichergrenze,
// Dachdaten (LoD2) lesen und für die Darstellung aufbereiten, Sonne/Schatten.
// Reine Darstellung: nichts davon geht in die Spielwelt (Fingerabdruck bleibt gleich).

// Geräte-Schalter (localStorage); Standard: alle an, nur ein ausdrückliches 'aus' schaltet ab
export const KUL_SCHLUESSEL = { boden: 'zob_kul_boden', daecher: 'zob_kul_daecher', schatten: 'zob_kul_schatten' };
export function schalterLesen(boden, daecher, schatten) {
  return { boden: boden !== 'aus', daecher: daecher !== 'aus', schatten: schatten !== 'aus' };
}

export const PUFFER_MAX = 12;   // Luftbild-Kacheln gleichzeitig im Speicher
export const GLEICHZEITIG = 3;  // gleichzeitig ladende Kacheln

// index.json einer Kulisse prüfen; null, wenn unbrauchbar
export function indexLesen(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const kachel = Number(roh.kachel), nx = Number(roh.nx), ny = Number(roh.ny);
  const foto = !!roh.foto && kachel > 0 && nx > 0 && ny > 0;
  const daecher = !!roh.daecher;
  if (!foto && !daecher) return null;
  return { kachel: kachel > 0 ? kachel : 32, px: Number(roh.px) || 512, nx: nx || 0, ny: ny || 0, breite: Number(roh.breite) || 0, hoehe: Number(roh.hoehe) || 0,
    foto, daecher, quelle: String(roh.quelle ?? ''), format: roh.format === 'png' ? 'png' : 'webp' };
}

export const kachelName = (kx, ky) => kx + '_' + ky;

// Welche Bildkacheln überdecken einen Ausschnitt (in Spielkacheln: x0,y0 inklusive, x1,y1 exklusive)?
export function kachelnFuerRect(index, rect) {
  if (!index?.foto) return [];
  const k = index.kachel, erg = [];
  const kx0 = Math.max(0, Math.floor(rect.x0 / k)), kx1 = Math.min(index.nx - 1, Math.ceil(rect.x1 / k) - 1);
  const ky0 = Math.max(0, Math.floor(rect.y0 / k)), ky1 = Math.min(index.ny - 1, Math.ceil(rect.y1 / k) - 1);
  for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) erg.push([kx, ky]);
  return erg;
}

// Speichergrenze: aus dem Wunsch (nach Wichtigkeit sortierte Schlüssel), den vorhandenen und den ladenden Kacheln ergibt sich,
// was geladen werden soll (nie mehr als max insgesamt) und was entladen wird (am längsten unbenutzt, nie Gewünschtes).
// vorhanden: Schlüssel in Benutzungsreihenfolge (älteste zuerst); laedt: Schlüssel, die gerade geladen werden.
export function puffer(wunsch, vorhanden, laedt, max = PUFFER_MAX, gleichzeitig = GLEICHZEITIG) {
  const w = [...new Set(wunsch)].slice(0, max), wset = new Set(w);
  const hat = new Set(vorhanden), im = new Set(laedt);
  const brauch = w.filter(k => !hat.has(k) && !im.has(k));
  const belegt = hat.size + im.size;
  const entladen = [];
  let frei = max - belegt;
  const kandidaten = vorhanden.filter(k => !wset.has(k));
  const noetig = Math.min(brauch.length, gleichzeitig - im.size);
  while (frei < Math.max(0, noetig) && kandidaten.length) { entladen.push(kandidaten.shift()); frei++; }
  const laden = brauch.slice(0, Math.max(0, Math.min(gleichzeitig - im.size, frei)));
  return { laden, entladen };
}

// ---------- Dächer (LoD2) ----------
export const SONNE_AZ = 135, SONNE_EL = 40;   // Südost, Vormittag
const aRad = SONNE_AZ * Math.PI / 180, eRad = SONNE_EL * Math.PI / 180;
export const SONNE = [Math.cos(eRad) * Math.sin(aRad), -Math.cos(eRad) * Math.cos(aRad), Math.sin(eRad)];   // Ost, Süd, oben
// Schatten: Pixel Versatz je Meter Höhe (Schatten fällt von der Sonne weg, 8 px = 1 m)
export const SCHATTEN_JE_M = (() => { const l = Math.hypot(SONNE[0], SONNE[1]), f = 8 / Math.tan(eRad); return { dx: -SONNE[0] / l * f, dy: -SONNE[1] / l * f }; })();

// daecher.json → Map „x,y des OSM-Gebäudes“ → Liste von LoD2-Gebäuden (ein OSM-Haus kann mehrere Teile haben)
export function daecherLesen(roh) {
  const m = new Map();
  if (!roh || !Array.isArray(roh.g)) return m;
  for (const b of roh.g) {
    if (!Array.isArray(b?.k) || !Array.isArray(b.f)) continue;
    const key = b.k[0] + ',' + b.k[1];
    (m.get(key) ?? m.set(key, []).get(key)).push({ h: (b.h || 0) / 10, t: (b.t || 0) / 10, f: b.f });
  }
  return m;
}

// Dachfläche → { pts:[[x,y,z m]], hell (Sonnenhelligkeit 0.7…1.2), flach, first:[Kanten], zmax }
// Höhe je Ecke aus Neigung n, Richtung a (Abwärtsrichtung, 0 = Nord, im Uhrzeigersinn) und der tiefsten Ecke e (dm)
export function flaecheAufbereiten(f) {
  const P = f.p, n = P.length >> 1;
  if (n < 3) return null;
  const neig = (f.n || 0) * Math.PI / 180, flach = !(f.n >= 5) || !(f.a >= 0);
  const dx = flach ? 0 : Math.sin(f.a * Math.PI / 180), dy = flach ? 0 : -Math.cos(f.a * Math.PI / 180);   // abwärts, Ost/Süd
  const e = (f.e || 0) / 10, t = Math.tan(neig);
  let smin = Infinity;
  const s = [];
  for (let i = 0; i < n; i++) { const v = -(P[2 * i] * dx + P[2 * i + 1] * dy) / 8; s.push(v); smin = Math.min(smin, v); }
  const pts = []; let zmax = -Infinity;
  for (let i = 0; i < n; i++) { const z = flach ? e : e + t * (s[i] - smin); pts.push([P[2 * i], P[2 * i + 1], z]); zmax = Math.max(zmax, z); }
  const lambert = flach ? SONNE[2] : Math.max(0, Math.sin(neig) * (dx * SONNE[0] + dy * SONNE[1]) + Math.cos(neig) * SONNE[2]);
  const first = [];
  if (!flach) for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a[2] > zmax - 0.25 && b[2] > zmax - 0.25 && Math.hypot(a[0] - b[0], a[1] - b[1]) > 6) first.push([a[0], a[1], b[0], b[1]]);
  }
  return { pts, hell: flach ? 1 : 0.7 + 0.5 * lambert, flach, first, zmax };
}

// Sichtbarkeit der Schatten: nachts (dunkel 0…1, geglättet) und bei Nebel (0…1) ausblenden
export function schattenFaktor(dunkel, nebel) {
  const d = Math.max(0, Math.min(1, dunkel)), n = Math.max(0, Math.min(1, nebel));
  const sanft = d * d * (3 - 2 * d);
  return Math.max(0, (1 - sanft) * (1 - 0.85 * n));
}

// Schätzhöhe eines Baums in Metern aus dem Kronendurchmesser in Pixeln
export const baumHoehe = gr => Math.min(20, Math.max(6, 1.15 * (gr / 8) + 3));
export const STANDARD_HAUSHOEHE = 6.5;
