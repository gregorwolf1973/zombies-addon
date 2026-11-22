// Haustüren sitzen nie auf einer angebauten Wand oder in einem Spalt zwischen Gebäuden; Vorplatz frei und von der Straße erreichbar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse, T, FEIN } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { nachbarPolys, aussenFrei, FREI_M } from '../client/tuerpose.mjs';

for (const name of ['geretsried2', 'geretsried', 'kochel']) {
  test(`${name}: Türen frei von Nachbargebäuden, Vorplatz begehbar und erreichbar`, () => {
    const karte = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
    setzeKartengroesse(karte.breite, karte.hoehe);
    try {
      const w = baueWeltAusKarte(karte, 7), K = KACHEL, polys = nachbarPolys(karte.gebaeude, K);
      const fb = karte.breite * FEIN, fh = karte.hoehe * FEIN, f = w.fein, px = K / FEIN;
      const bl = new Uint8Array(fb * fh);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1 && !m; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= fb || yy >= fh || f[yy * fb + xx]) { m = 1; break; } }
        bl[y * fb + x] = m;
      }
      const er = new Uint8Array(fb * fh), q = [];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) { const c = y * fb + x; if (!bl[c] && w.hole(Math.floor(x / FEIN), Math.floor(y / FEIN)) === T.STRASSE) { er[c] = 1; q.push(c); } }
      for (let i = 0; i < q.length; i++) { const c = q[i], x = c % fb, y = (c - x) / fb; for (const n of [x > 0 ? c - 1 : -1, x < fb - 1 ? c + 1 : -1, y > 0 ? c - fb : -1, y < fh - 1 ? c + fb : -1]) if (n >= 0 && !bl[n] && !er[n]) { er[n] = 1; q.push(n); } }
      const fehler = [];
      const betr = w.haeuser.filter(h => h.tuer && h.betretbar);
      assert.ok(betr.length > 100);
      for (const h of betr) {
        const t = h.tuerPos, id = `${h.nr}@${h.tuer.x},${h.tuer.y}`;
        const rx = (h.tuer.x + 0.5 + h.raus.dx * 0.5) * K, ry = (h.tuer.y + 0.5 + h.raus.dy * 0.5) * K;
        if (aussenFrei(t.x, t.y, t.nx, t.ny, polys, h) < FREI_M) fehler.push(id + ' Pose an Nachbar');
        if (aussenFrei(rx, ry, h.raus.dx, h.raus.dy, polys, h) < FREI_M) fehler.push(id + ' Rastertür an Nachbar');
        const cx = Math.floor((t.x + t.nx * 10) / px), cy = Math.floor((t.y + t.ny * 10) / px);
        if (!er[cy * fb + cx]) fehler.push(id + ' Pose nicht erreichbar');
        const vx = Math.floor((h.tuer.x + h.raus.dx + 0.5) * FEIN), vy = Math.floor((h.tuer.y + h.raus.dy + 0.5) * FEIN);
        if (![vy * fb + vx, vy * fb + vx - 1, (vy - 1) * fb + vx, (vy - 1) * fb + vx - 1].some(c => er[c])) fehler.push(id + ' Rastertür nicht erreichbar');
      }
      assert.deepEqual(fehler, []);
    } finally { setzeKartengroesse(64, 48); }
  });
}
