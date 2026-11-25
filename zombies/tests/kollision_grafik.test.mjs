// Kollision passt zur Grafik (client/welt.mjs freiBewegung, osmwelt.mjs baueFein, hindernisse.mjs kollisionsUmrisse):
//  - Zäune/Hecken sperren genau die gezeichnete Linie (Halbdicke je Art), nicht mehr das ganze 1-m-Feld: die Figur kommt bis auf ihren Radius heran;
//  - auf Straßenkacheln neben der gezeichneten Straße sind Hecken/Zäune nicht mehr unsichtbar offen (Ursache „hängen am Straßenende“: die Figur lief
//    in der Hecke den Gehweg entlang und blieb dort stecken, wo die 4-m-Straßenkacheln aufhörten – ohne klettern zu können);
//  - Superuser-Anzeige „Kollision zeigen“ liefert die Umrisse so, wie die Bewegung rechnet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, BREITE, HOEHE, FEIN, FEIN_PX, KACHEL, T, frei, freiBewegung, zaunHalb, zaunIndex, zaunUeberstieg } from '../client/welt.mjs';
import { baueWeltAusKarte, kastenHalb } from '../client/osmwelt.mjs';
import { strassenFlaechen, strassenTiefe, MIT_ZUFAHRT } from '../client/zaunstrasse.mjs';
import { fahrbahnBreite } from '../client/vektor.mjs';
import { walzeAnwenden } from '../client/walze.mjs';
import { kollisionsUmrisse } from '../client/hindernisse.mjs';
import { weltKopieren } from '../client/weltkopie.mjs';

const R = 7;   // Spielerradius (WERTE.spielerRadius)
const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 7);
const fbG = BREITE * FEIN;
const feld = (x, y) => welt.fein[Math.floor(y / FEIN_PX) * fbG + Math.floor(x / FEIN_PX)];

// Punkte entlang aller Linienstücke (Abstand `schritt` px): f(x, y, ux, uy, z)
function entlang(schritt, f, rand = 12) {
  for (const z of welt.details.zaeune) for (let i = 0; i + 3 < z.p.length; i += 2) {
    const ax = z.p[i] * KACHEL, ay = z.p[i + 1] * KACHEL, bx = z.p[i + 2] * KACHEL, by = z.p[i + 3] * KACHEL, L = Math.hypot(bx - ax, by - ay);
    if (L < 2 * rand + 8) continue;
    for (let d = rand; d < L - rand; d += schritt) f(ax + (bx - ax) * d / L, ay + (by - ay) * d / L, (bx - ax) / L, (by - ay) / L, z);
  }
}

test('Zäune und Hecken: die Figur hält genau Radius + gezeichnete Halbdicke Abstand und kommt nicht hindurch', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const st = {};
  entlang(8, (x, y, ux, uy, z) => {
    const nx = -uy, ny = ux;
    if (!frei(welt, x + nx * 30, y + ny * 30, R) || !frei(welt, x - nx * 30, y - ny * 30, R)) return;   // nur freistehende Stücke
    for (let s = -16; s <= 16; s += 2) if (!feld(x + ux * s, y + uy * s)) return;                         // keine Lücke (Türzugang) daneben
    for (const seite of [1, -1]) {
      let halt = null;
      for (let a = 30; a >= -30; a -= 0.25) if (!freiBewegung(welt, x + nx * a * seite, y + ny * a * seite, R)) { halt = a; break; }
      const e = st[z.a] ??= { n: 0, genau: 0, durch: 0 };
      e.n++;
      if (halt === null) e.durch++;
      else if (Math.abs(halt - (R + zaunHalb(z.a))) <= 1) e.genau++;
    }
  });
  for (const a of ['h', 'z']) {
    const e = st[a];
    assert.ok(e && e.n > 1000, `zu wenige Messpunkte (${a}): ${e?.n}`);
    assert.equal(e.durch, 0, `durch die Linie gelaufen (${a})`);
    assert.ok(e.genau / e.n > 0.95, `Abstand passt nicht zur Grafik (${a}): ${e.genau}/${e.n} innerhalb ±1 px von ${R + zaunHalb(a)} px`);
  }
});

test('Straßenkacheln: Hecken/Zäune neben der gezeichneten Straße sperren (vorher unsichtbar offen → Hängenbleiben am Straßenende)', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const fl = strassenFlaechen(karte.strassen, KACHEL, fahrbahnBreite, MIT_ZUFAHRT);
  const tuerNah = (x, y) => welt.haeuser.some(h => h.tuer && Math.abs((h.tuer.x + 0.5) * KACHEL - x) < 4 * KACHEL && Math.abs((h.tuer.y + 0.5) * KACHEL - y) < 4 * KACHEL);
  let n = 0, offen = 0, steckt = 0, start = 0;
  entlang(4, (x, y, ux, uy) => {
    if (welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL)) !== T.STRASSE) return;
    if (strassenTiefe(fl, x, y, -2.4) || tuerNah(x, y)) return;   // auf der gezeichneten Fahrbahn/dem Gehweg oder Türzugang: absichtlich offen
    n++;
    if (freiBewegung(welt, x, y, R)) offen++;
  }, 4);
  assert.ok(n > 2000, 'zu wenige Linienpunkte auf Straßenkacheln: ' + n);
  assert.ok(offen / n < 0.05, `Hecke/Zaun auf Straßenkachel neben der Straße begehbar: ${offen}/${n}`);   // bis WELT_VERSION 38: fast alle
  // Laufprobe: auf der Linie über einer Straßenkachel stehen und sie entlanglaufen – wer dort überhaupt stehen kann, steckt fest, ohne klettern zu können?
  entlang(24, (x, y, ux, uy) => {
    if (welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL)) !== T.STRASSE || !freiBewegung(welt, x, y, R)) return;
    start++;
    const p = { x, y };
    for (let i = 0; i < 50; i++) { const x0 = p.x, y0 = p.y; for (let k = 0; k < 2; k++) { if (freiBewegung(welt, p.x + ux * 2, p.y + uy * 2, R)) { p.x += ux * 2; p.y += uy * 2; } } if (p.x === x0 && p.y === y0) break; }
    if ((p.x - x) * ux + (p.y - y) * uy < 100 && !zaunUeberstieg(welt, p.x, p.y, Math.atan2(uy, ux), R, true)) steckt++;
  }, 4);
  assert.ok(steckt < 60, `in Hecken über Straßenkacheln festgesteckt: ${steckt} (Start ${start}; vorher ~150)`);
});

// ---------- kleine Testwelt ----------
function testwelt() {
  setzeKartengroesse(64, 48);
  const fb = BREITE * FEIN, kacheln = new Uint8Array(BREITE * HOEHE);
  const w = { fein: new Uint8Array(fb * HOEHE * FEIN), kacheln, behaelter: [], details: { zaunart: Array(BREITE * HOEHE).fill(''), zaeune: [] } };
  w.hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? kacheln[y * BREITE + x] : T.ZAUN;
  return w;
}
// waagrechte Linie bei y (px) von x0 bis x1 eintragen wie baueFein (Feldmitte ≤ 4 px, Hecke 5 px von der Linie)
function linie(w, a, x0, x1, y) {
  w.details.zaeune.push({ a, p: [x0 / KACHEL, y / KACHEL, x1 / KACHEL, y / KACHEL] });
  const fb = BREITE * FEIN, d = a === 'h' ? 5 : 4;
  for (let fy = 0; fy < HOEHE * FEIN; fy++) for (let fx = 0; fx < fb; fx++) {
    const cx = (fx + 0.5) * FEIN_PX, cy = (fy + 0.5) * FEIN_PX, qx = Math.max(x0, Math.min(x1, cx)) - cx, qy = y - cy;
    if (qx * qx + qy * qy <= d * d) w.fein[fy * fb + fx] = 2;
  }
  w.details.zaeune = [...w.details.zaeune];   // neues Feld → Index baut sich neu
}

test('freiBewegung: Kreis gegen die Linie (Halbdicke je Art), runde Enden, plattgewalzte Felder offen, Felder ohne Linie ganz zu', () => {
  const w = testwelt();
  linie(w, 'h', 400, 600, 300); linie(w, 'z', 400, 600, 500);
  for (const [y, a] of [[300, 'h'], [500, 'z']]) {
    const g = R + zaunHalb(a);
    assert.ok(!freiBewegung(w, 500, y - g + 0.3, R) && freiBewegung(w, 500, y - g - 0.3, R), `Abstand ${a}`);
    assert.ok(!freiBewegung(w, 500, y + g - 0.3, R) && freiBewegung(w, 500, y + g + 0.3, R));
    assert.ok(!freiBewegung(w, 600 + g * 0.7, y + g * 0.7, R) && freiBewegung(w, 600 + g * 0.72, y + g * 0.72, R), `rundes Ende ${a}`);
  }
  // Feld unter der Hecke plattwalzen: dort offen, daneben weiter zu
  const fb = BREITE * FEIN, i = Math.floor(300 / FEIN_PX) * fb + Math.floor(500 / FEIN_PX);
  walzeAnwenden(w, { zaun: [i - 1, i, i + 1] });   // 3 m breite Lücke (Felder 488–512 px)
  assert.ok(freiBewegung(w, 500, 300, R), 'plattgewalzte Felder sperren noch');
  assert.ok(!freiBewegung(w, 500 + 13, 300, R) && !freiBewegung(w, 500 - 13, 300, R), 'Hecke neben der Lücke offen');
  // Zaunfeld ohne Linie (Testwelten/alte Daten): ganzes Feld sperrt
  w.fein[Math.floor(100 / FEIN_PX) * fb + Math.floor(100 / FEIN_PX)] = 2;
  assert.ok(!freiBewegung(w, 100 + R + 1, 100 + 4, R) && freiBewegung(w, 104 + R + 4.5, 100 + 4, R));
  // Index ist beim Kopieren (Worker, IndexedDB) nicht dabei und baut sich neu
  zaunIndex(w);
  const k = weltKopieren(w);
  assert.ok(!Object.keys(k).some(n => n.startsWith('_zaun')), 'Index als Welt-Eigenschaft');
  assert.equal(freiBewegung(k, 500, 300 - R - 3, R), freiBewegung(w, 500, 300 - R - 3, R));
});

test('Kollision zeigen: Umrisse wie die Bewegung (feste Felder, Zaunstücke mit Halbdicke, Zaunfeld ohne Linie, Autos, Stämme)', () => {
  const w = testwelt(), fb = BREITE * FEIN;
  for (let fy = 20; fy < 24; fy++) for (let fx = 20; fx < 22; fx++) w.fein[fy * fb + fx] = 1;   // festes Rechteck 2 × 4 Felder
  linie(w, 'h', 400, 600, 300);
  w.fein[Math.floor(100 / FEIN_PX) * fb + Math.floor(700 / FEIN_PX)] = 2;                          // Zaunfeld ohne Linie
  w.behaelter.push({ id: 'a1', art: 'auto', x: 800, y: 200, winkel: 0 });
  const u = kollisionsUmrisse(w, 40, 40, 1000, 600);
  const laenge = l => l.reduce((s, [a, b, c, d]) => s + Math.abs(c - a) + Math.abs(d - b), 0);
  assert.equal(laenge(u.fest), 2 * (2 + 4) * FEIN_PX, 'Umfang des festen Rechtecks');
  assert.equal(u.zaun.length, 1, 'Hecke als ein Stück');
  assert.ok(Math.abs(u.zaun[0].ax - 400) < 1e-6 && Math.abs(u.zaun[0].bx - 600) < 1e-6 && u.zaun[0].h === zaunHalb('h'));
  assert.equal(laenge(u.zaunFeld), 4 * FEIN_PX);
  assert.equal(u.autos.length, 1);
  // plattgewalzte Mitte: zwei Stücke
  walzeAnwenden(w, { zaun: [Math.floor(300 / FEIN_PX) * fb + Math.floor(500 / FEIN_PX)] });
  const u2 = kollisionsUmrisse(w, 40, 40, 1000, 600);
  assert.equal(u2.zaun.length, 2, 'Lücke nicht sichtbar');
  // echte Welt: Stücke liegen auf den Linien, Halbdicke je Art
  setzeKartengroesse(karte.breite, karte.hoehe);
  const g = kollisionsUmrisse(welt, 5000, 5000, 6000, 6000);
  assert.ok(g.zaun.length > 20 && g.fest.length > 20, 'zu wenig Umrisse in der Stadtmitte');
  assert.ok(g.zaun.every(z => [3.5, 1, 0.75, 5].includes(z.h)));
});

test('Container/Mülltonnen: nur der gezeichnete Umriss sperrt (Großtonne 1,4 × 1,1 m statt 4 × 4 m), Figur kommt bis auf ihren Radius heran', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const cont = welt.behaelter.filter(b => b.art === 'container');
  assert.ok(cont.length > 20 && welt.kaesten.length === cont.length, 'Container ohne Umriss');
  for (const typ of ['gross', 'glas', 'mulde']) {
    const c = cont.find(q => q.typ === typ), k = welt.kaesten.find(q => q.id === c.id);
    assert.ok(c && k, 'kein Container ' + typ);
    const [hx, hy] = kastenHalb(c);
    assert.ok(Math.abs(k.x1 - k.x0 - 2 * hx) < 1e-9 && Math.abs(k.y1 - k.y0 - 2 * hy) < 1e-9);
    for (const [dx, dy, h] of [[1, 0, hx], [-1, 0, hx], [0, 1, hy], [0, -1, hy]]) {
      assert.ok(!freiBewegung(welt, c.x + dx * (h + R - 0.2), c.y + dy * (h + R - 0.2), R), `${typ}: Figur steckt im Container`);
      const x = c.x + dx * (h + R + 0.2), y = c.y + dy * (h + R + 0.2);
      if (feld(x, y) !== 1 && freiBewegung(welt, x + dx * 6, y + dy * 6, R)) assert.ok(freiBewegung(welt, x, y, R), `${typ}: Sperrfläche größer als die Grafik`);
    }
  }
  // höchstens so viele Felder wie der Umriss überdeckt (früher je Container die ganze 4-m-Kachel = 16 Felder, Mulden decken bis 20)
  let n = 0; for (const v of welt.fein) if (v === 5) n++;
  assert.ok(n < cont.length * 14, 'zu viele Container-Felder: ' + n);
});
