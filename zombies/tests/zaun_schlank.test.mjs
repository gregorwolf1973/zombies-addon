// Schlanke Zäune und Hecken: Kollision im Feinraster (1-m-Felder) höchstens ~1 Feld breit, aber lückenlos entlang der Linie
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, frei } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 7);

test('Zäune und Hecken: Figur kommt nicht durch die Linie, steht 1,75 m daneben meist frei (Kollision ~1 m statt 1,5–2,3 m)', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const K = 32;
  let auf = 0, aufGesperrt = 0, neben = 0, nebenFrei = 0;
  for (const z of welt.details.zaeune) {
    if (z.a !== 'h' && z.a !== 'z' && z.a !== 'm') continue;
    for (let i = 0; i + 3 < z.p.length; i += 2) {
      const ax = z.p[i] * K, ay = z.p[i + 1] * K, bx = z.p[i + 2] * K, by = z.p[i + 3] * K, L = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
      if (L < 40) continue;
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      for (let d = 12; d < L - 12; d += 6) {
        const x = ax + (bx - ax) * d / L, y = ay + (by - ay) * d / L;
        if (!frei(welt, x + nx * 30, y + ny * 30, 7) || !frei(welt, x - nx * 30, y - ny * 30, 7)) continue;   // nur freistehende Abschnitte (nichts anderes daneben)
        auf++; if (!frei(welt, x, y, 7)) aufGesperrt++;   // Figur (Radius 7 px) passt nicht auf die Linie
        for (const s of [-1, 1]) { neben++; if (frei(welt, x + nx * 14 * s, y + ny * 14 * s, 7)) nebenFrei++; }
      }
    }
  }
  assert.ok(auf > 1000, 'zu wenige Zaunpunkte: ' + auf);
  assert.ok(aufGesperrt / auf > 0.8, `Lücken auf der Linie: ${aufGesperrt}/${auf}`);
  // vorher (Halbbreite 6/9 px) waren 1,75 m neben der Linie nur ~32 % der Punkte frei, jetzt ~63 %
  assert.ok(nebenFrei / neben > 0.5, `1,75 m neben der Linie noch gesperrt: frei ${nebenFrei}/${neben}`);
});
