// Fahrbare Fahrzeuge gegen Hindernisse und Rückwärtsgang – gemeinsame Regeln für Server (server/fahrbar.mjs, server/walze.mjs) und Client.
//  - Rückwärts: liegt die Eingaberichtung mehr als ~135° hinter der Fahrzeugachse, fährt das Fahrzeug rückwärts (statt zu wenden) und lenkt
//    wie im Rückwärtsgang (das Heck dreht zur Eingaberichtung). Entscheidung per Skalarprodukt (kein Winkelvergleich mit atan2).
//    PC-Tasten im Fahrzeug: W/↑ vor, S/↓ zurück, A/D lenken (tastenFahrzeug rechnet sie in eine Weltrichtung um).
//  - Zäune und Hecken (Feinraster-Wert 2, nicht Mauern): Boxer, Puma, Leopard und gefahrene Autos walzen sie dauerhaft platt (welt.fein → 0, Kachel ohne
//    Restzaun → Wiese, welt.zaunPlatt für die Zeichnung). Parkende Autos: Leopard drückt sie platt (state.platt), Puma fährt mit 40 %,
//    Boxer mit 30 % Tempo darüber. Bäume: der Leopard walzt kleine Bäume um (welt.baeumeWeg), sonst blockieren Stämme. Hauswände blockieren alle.
// Der Server entscheidet und schickt die Änderungen (Nachricht 'walze'); beide Seiten wenden sie mit walzeAnwenden() gleich an.
import { KACHEL, BREITE, HOEHE, T, FEIN, FEIN_PX } from './welt.mjs';
import { baumVon, baumGruppe, echtGr, echtDeckt } from './aussehen.mjs';

export const STAMM_R = 4;               // Stammradius (px, 0,5 m) für die Kollision der Fahrzeuge
export const RUECK_DOT = -0.7071;       // cos 135°: Eingabe weiter hinten → Rückwärtsgang
export const RUECK_HALTEN = -0.3;       // schon rückwärts unterwegs: bleibt im Rückwärtsgang bis ~107° (kein Flackern)
export const RUECK_ANTEIL = 1 / 3;      // Rückwärts höchstens ein Drittel des Höchsttempos
export const WALZE = {
  leopard: { zaun: true, auto: 'platt', baumMax: 52 },   // Kronen bis 6,5 m Durchmesser walzt er um, größere blockieren
  puma: { zaun: true, auto: 'platt', baumMax: 0 },
  boxer: { zaun: true, auto: 0.3, baumMax: 0 },
  pkw: { zaun: true, auto: 1, baumMax: 0 },   // gefahrenes Auto/Streifenwagen: Zäune und Hecken platt, wird dabei langsamer und verliert Lebenspunkte (server/pkw.mjs gewalzt)
};

// Rückwärtsgang? dot = Skalarprodukt aus Fahrzeugachse und (normierter) Eingaberichtung, v = Tempo (negativ = rückwärts)
export const rueckwaerts = (dot, v = 0) => dot < RUECK_DOT || (v < -0.5 && dot < RUECK_HALTEN);

// PC-Tasten im Fahrzeug → Weltrichtung (Darstellung/Bedienung, keine Weltdaten): vor = +1 (W) / −1 (S), lenk = +1 (D) / −1 (A), w = Fahrtrichtung
export function tastenFahrzeug(vor, lenk, w) {
  let a;
  if (vor > 0) a = w + lenk * 0.6;                 // vorwärts, A/D lenken
  else if (vor < 0) a = w + Math.PI - lenk * 0.5;  // rückwärts: Heck nach links (A) bzw. rechts (D)
  else if (lenk) a = w + lenk * 1.0;               // nur lenken: langsam vorwärts einschlagen
  else return { dx: 0, dy: 0 };
  return { dx: Math.cos(a), dy: Math.sin(a) };
}

// ---------- Bäume ----------
// Stämme mit Mittelpunkt in Kachel (kx, ky): Kachelbäume wie gezeichnet (aussehen.mjs baumKronen) und echte Einzelbäume
function stammListe(welt, kx, ky) {
  const memo = welt._stamm ??= new Map(), i = ky * BREITE + kx;
  let l = memo.get(i);
  if (l) return l;
  l = [];
  const echt = !!welt.baeumeEcht?.length;
  if (welt.hole(kx, ky) === T.BAUM && !(echt && echtDeckt(welt, kx, ky))
    && (((kx + ky) & 1) === 0 || (welt.hole(kx - 1, ky) !== T.BAUM && welt.hole(kx + 1, ky) !== T.BAUM && welt.hole(kx, ky - 1) !== T.BAUM && welt.hole(kx, ky + 1) !== T.BAUM))) {
    const b = baumVon(kx, ky, baumGruppe(welt, kx, ky));
    l.push({ k: 'k' + kx + ',' + ky, x: b.x, y: b.y, gr: b.gr });
  }
  if (echt) {
    if (!welt._stammEcht) {
      const m = welt._stammEcht = new Map();
      for (const b of welt.baeumeEcht) { const j = Math.floor(b.y / KACHEL) * BREITE + Math.floor(b.x / KACHEL); (m.get(j) ?? m.set(j, []).get(j)).push({ k: 'e' + Math.round(b.x) + ',' + Math.round(b.y), x: b.x, y: b.y, gr: echtGr(b) }); }
    }
    for (const b of welt._stammEcht.get(i) ?? []) l.push(b);
  }
  memo.set(i, l);
  return l;
}
// alle noch stehenden Stämme mit Mittelpunkt im Rechteck (px) – Superuser-Anzeige „Kollision zeigen“ (sperren nur Fahrzeuge)
export function staemmeIn(welt, x0, y0, x1, y1) {
  const aus = [];
  if (!welt?.hole || welt.kachel || welt.ebene) return aus;
  for (let j = Math.max(0, Math.floor(y0 / KACHEL)); j <= Math.min(HOEHE - 1, Math.floor(y1 / KACHEL)); j++)
    for (let i = Math.max(0, Math.floor(x0 / KACHEL)); i <= Math.min(BREITE - 1, Math.floor(x1 / KACHEL)); i++)
      for (const b of stammListe(welt, i, j)) if (!welt.baeumeWeg?.has(b.k)) aus.push(b);
  return aus;
}
// Stamm, den ein Kreis (x, y, rad) berührt, oder null (nur draußen)
export function stammBei(welt, x, y, rad) {
  if (!welt?.hole || welt.kachel || welt.ebene) return null;
  const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL), g = (STAMM_R + rad) * (STAMM_R + rad);
  for (let j = ky - 1; j <= ky + 1; j++) for (let i = kx - 1; i <= kx + 1; i++) {
    if (i < 0 || j < 0 || i >= BREITE || j >= HOEHE) continue;
    for (const b of stammListe(welt, i, j)) {
      if (welt.baeumeWeg?.has(b.k)) continue;
      if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < g) return b;
    }
  }
  return null;
}

// ---------- Zäune und Hecken ----------
// walzbares Zaunfeld (Feinwert 2, Kachel keine Mauer)?
export function zaunWalzbar(welt, fi) {
  if (!welt?.fein || welt.fein[fi] !== 2) return false;
  const fb = BREITE * FEIN, fx = fi % fb, fy = (fi - fx) / fb, kx = Math.floor(fx / FEIN), ky = Math.floor(fy / FEIN);
  if (kx <= 0 || ky <= 0 || kx >= BREITE - 1 || ky >= HOEHE - 1) return false;   // Kartenrand bleibt zu
  return (welt.details?.zaunart?.[ky * BREITE + kx] ?? 'z') !== 'w';
}
// walzbare Zaunfelder unter einem Kreis (x, y, rad) in die Menge `aus`
export function zaunZellen(welt, x, y, rad, aus = new Set()) {
  if (!welt?.fein || welt.kachel || welt.ebene) return aus;
  const fb = BREITE * FEIN, fh = HOEHE * FEIN;
  const x0 = Math.max(0, Math.floor((x - rad) / FEIN_PX)), x1 = Math.min(fb - 1, Math.floor((x + rad) / FEIN_PX));
  const y0 = Math.max(0, Math.floor((y - rad) / FEIN_PX)), y1 = Math.min(fh - 1, Math.floor((y + rad) / FEIN_PX));
  for (let fy = y0; fy <= y1; fy++) for (let fx = x0; fx <= x1; fx++) { const i = fy * fb + fx; if (welt.fein[i] === 2 && zaunWalzbar(welt, i)) aus.add(i); }
  return aus;
}

// Änderungen anwenden (Server und Client gleich): { zaun: [Feinindex], baum: [{ k, x, y, w }] }; Rückgabe: geänderte Kacheln (Index)
export function walzeAnwenden(welt, { zaun = [], baum = [] } = {}) {
  const kacheln = new Set();
  if (!welt) return kacheln;
  const f = welt.fein, fb = BREITE * FEIN;
  welt.zaunPlatt ??= new Set();
  for (const i of zaun) {
    if (!f || !(i >= 0 && i < f.length)) continue;
    if (f[i] === 2) f[i] = 0;
    welt.zaunPlatt.add(i);
    const fx = i % fb, fy = (i - fx) / fb;
    kacheln.add(Math.floor(fy / FEIN) * BREITE + Math.floor(fx / FEIN));
  }
  // Zaunkachel ohne Restzaun: im groben Raster offen (Wegsuche der Bots und Bewohner, Wegefeld der Zombies)
  for (const t of kacheln) {
    const kx = t % BREITE, ky = (t - kx) / BREITE;
    if (welt.hole(kx, ky) !== T.ZAUN || !welt.kacheln) continue;
    let rest = false;
    for (let dy = 0; dy < FEIN && !rest; dy++) for (let dx = 0; dx < FEIN; dx++) if (f[(ky * FEIN + dy) * fb + kx * FEIN + dx]) { rest = true; break; }
    if (!rest) welt.kacheln[t] = T.WIESE;
  }
  welt.baeumeWeg ??= new Map();
  for (const b of baum) if (b?.k && !welt.baeumeWeg.has(b.k)) welt.baeumeWeg.set(b.k, { x: b.x, y: b.y, w: b.w ?? 0, gr: b.gr ?? 40 });
  return kacheln;
}
