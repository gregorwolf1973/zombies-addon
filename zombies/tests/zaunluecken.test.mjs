// Zaunlücken müssen für Figuren (Radius 11 px) breit genug sein
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse, findeWeg, frei } from '../client/welt.mjs';
import { baueWeltAusKarte, zaeuneAusduennen } from '../client/osmwelt.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));

test('Zaunlücken sind (fast alle) mindestens 1,4 Kacheln breit', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const k = zaeuneAusduennen(karte), z = k.zaeune;
  let luecken = 0, breit = 0;
  for (let i = 0; i + 1 < z.length; i++) {
    const a = z[i].p, b = z[i + 1].p;
    const d = Math.hypot(a[a.length - 2] - b[0], a[a.length - 1] - b[1]);
    if (d > 0.3 && d < 4) { luecken++; if (d >= 1.4) breit++; }   // Abstand kann an Ecken kürzer ausfallen (Sehne)
  }
  assert.ok(luecken > 20, 'zu wenige Lücken: ' + luecken);
  assert.ok(breit / luecken >= 0.85, `nur ${breit}/${luecken} Lücken ≥ 1,4 Kacheln`);
});

test('Durch Zaunlücken führt ein Weg (feines Raster)', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7), z = zaeuneAusduennen(karte).zaeune;
  let geprueft = 0, ok = 0, beide = 0, weg = 0;
  for (let i = 0; i + 1 < z.length && geprueft < 40; i++) {
    const a = z[i].p, b = z[i + 1].p, ax = a[a.length - 2], ay = a[a.length - 1], bx = b[0], by = b[1];
    const d = Math.hypot(ax - bx, ay - by);
    if (d < 2.05 || d > 2.5) continue;   // gerade Lücken (3 Stücke)
    const mx = (ax + bx) / 2 * KACHEL, my = (ay + by) / 2 * KACHEL;
    if (!frei(w, mx, my, 11)) continue;   // Mitte liegt z. B. in einem Haus
    geprueft++;
    // Querrichtung: im Zaunbereich (±16 px um die Lückenmitte) muss die Figur (11 px) im feinen Raster durchgängig passen
    const nx = -(by - ay) / d, ny = (bx - ax) / d;
    let durch = true;
    for (let t = -16; t <= 16 && durch; t += 4) durch = frei(w, mx + nx * t, my + ny * t, 11);
    if (durch) ok++;
    // zusätzlich: wo beide Seiten frei sind, findet die Wegsuche meist den Weg (Rest: Gärten mit weiteren Zäunen/Häusern ringsum, Paarung der Linienenden ist nur geschätzt)
    const p = [mx + nx * 48, my + ny * 48], q = [mx - nx * 48, my - ny * 48];
    if (frei(w, p[0], p[1], 11) && frei(w, q[0], q[1], 11)) { beide++; if (findeWeg(w, p[0], p[1], q[0], q[1], 11, 20000)) weg++; }
  }
  assert.ok(geprueft >= 5, 'zu wenige Prüfpunkte ' + geprueft);
  assert.ok(ok / geprueft >= 0.8, `nur ${ok}/${geprueft} Lücken passierbar`);
  assert.ok(beide >= 3 && weg / beide >= 0.5, `Wegsuche: ${weg}/${beide}`);
});
