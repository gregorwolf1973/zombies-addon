// Superuser-Anzeige „Hindernisse zeigen“: rechnet mit der Logik der Bewegung (frei() in welt.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, FEIN, FEIN_PX, WERTE, KACHEL, frei, setzeKartengroesse } from '../client/welt.mjs';
import { hindernisFelder, hindernisPixel, H_FREI, H_FEST, H_ZAUN, H_FLANDERN, H_RAND } from '../client/hindernisse.mjs';

function weltMitFein(b, h, setze) {
  setzeKartengroesse(b, h);
  const fein = new Uint8Array(b * FEIN * h * FEIN);
  setze(fein, b * FEIN);
  return { hole: () => T.WIESE, fein };
}

test('Feines Raster: Codes fest/Zaun/Flandern, Randstreifen nach Spielerradius, Rest frei', () => {
  const w = weltMitFein(8, 8, (f, fb) => { f[10 * fb + 10] = 1; f[10 * fb + 20] = 2; f[10 * fb + 25] = 4; });
  const c = hindernisFelder(w, 0, 0, 32, 32);
  assert.equal(c[10 * 32 + 10], H_FEST);
  assert.equal(c[10 * 32 + 20], H_ZAUN);
  assert.equal(c[10 * 32 + 25], H_FLANDERN);
  assert.equal(c[10 * 32 + 11], H_RAND, 'Nachbarfeld: Figurmitte darf nicht hin');
  assert.equal(c[20 * 32 + 5], H_FREI);
});

test('Anzeige stimmt exakt mit frei() überein: freies Feld = Figur passt, sonst blockiert', () => {
  const w = weltMitFein(8, 8, (f, fb) => { for (let i = 8; i < 14; i++) f[12 * fb + i] = 1; f[3 * fb + 3] = 2; });
  const c = hindernisFelder(w, 0, 0, 32, 32);
  let falsch = 0;
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const ok = frei(w, (i + 0.5) * FEIN_PX, (j + 0.5) * FEIN_PX, WERTE.spielerRadius);
    if ((c[j * 32 + i] === H_FREI) !== ok) falsch++;
  }
  assert.equal(falsch, 0);
});

test('Grobes Raster (ohne Fein, z. B. Innenräume): Wand fest, Zaun orange, Grenze beschneidet', () => {
  setzeKartengroesse(8, 8);
  const w = { hole: (x, y) => x < 0 || y < 0 || x >= 8 || y >= 8 ? T.LEER : x === 3 ? T.WAND : x === 5 ? T.ZAUN : T.BODEN };
  const c = hindernisFelder(w, 0, 0, 32, 8);
  assert.equal(c[2 * 32 + 3 * FEIN + 1], H_FEST);
  assert.equal(c[2 * 32 + 5 * FEIN + 1], H_ZAUN);
  assert.equal(c[2 * 32 + 1 * FEIN], H_FREI);
  const g = hindernisFelder(w, 0, 0, 32, 8, WERTE.spielerRadius, { x0: 4, y0: 0, x1: 8, y1: 8 });
  assert.equal(g[2 * 32 + 3 * FEIN + 1], H_FREI, 'außerhalb der Grenze bleibt alles frei');
  assert.equal(g[2 * 32 + 5 * FEIN + 1], H_ZAUN);
});

test('Pixel: freie Felder durchsichtig, Hindernisse rot, Randstreifen blasser', () => {
  const p = hindernisPixel(Uint8Array.from([H_FREI, H_FEST, H_RAND, H_ZAUN]), new Uint8ClampedArray(16));
  assert.equal(p[3], 0);
  assert.ok(p[4] > 200 && p[7] > 80);
  assert.ok(p[11] < p[7], 'Rand blasser als Hindernis');
  assert.ok(p[12] > 200 && p[13] > 100, 'Zaun orange');
  void KACHEL;
});
