// Parkplätze einer Karte für tools/kulisse.py: dieselben Stellplätze, die das Spiel zeichnet (vektor.mjs) – Parkplatz-Buchten und Straßen-Parkbuchten.
// Aufruf: node tools/kulisse_plaetze.mjs <karte>   → JSON [{x, y, winkel, art}] (x, y in Spielpixeln, winkel = Längsachse des Autos)
import fs from 'node:fs';
import { parkplatzBuchten, strassenBuchten } from '../zombies/client/vektor.mjs';
import { KACHEL } from '../zombies/client/welt.mjs';

const name = process.argv[2];
const karte = JSON.parse(fs.readFileSync(new URL(`../zombies/client/karten/${name}.json`, import.meta.url), 'utf8'));
const aus = [];
for (const f of karte.flaechen ?? []) {
  if (f.a !== 'parkplatz') continue;
  const pts = []; for (let i = 0; i < f.p.length; i += 2) pts.push([f.p[i] * KACHEL, f.p[i + 1] * KACHEL]);
  for (const b of parkplatzBuchten(pts).buchten) aus.push({ x: b.x, y: b.y, winkel: b.winkel, art: 'parkplatz' });
}
for (const b of strassenBuchten(karte.strassen ?? [])) for (const q of b.plaetze) aus.push({ x: q.x, y: q.y, winkel: b.winkel, art: 'bucht' });
process.stdout.write(JSON.stringify(aus));
