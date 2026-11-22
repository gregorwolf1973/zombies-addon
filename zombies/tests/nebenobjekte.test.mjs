// Darstellung der Luftbild-Objekte (Nebengebäude, Pools, Einzelbäume) auf geretsried2: Hindernis-Anzeige rot, Kronen je Eintrag, Fingerabdruck unverändert
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, FEIN, FEIN_PX, setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { hindernisFelder, H_FEST } from '../client/hindernisse.mjs';
import { baumKronen } from '../client/aussehen.mjs';
import { polyBox } from '../client/nebenobjekte.mjs';

after(() => setzeKartengroesse(64, 48));
const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 12345);

const rot = (o) => {   // Anteil der Feinfelder im Umriss, die die Hindernis-Anzeige als fest (rot) liefert
  const b = polyBox(o), fx0 = Math.floor(b.x0 / FEIN_PX), fy0 = Math.floor(b.y0 / FEIN_PX), nx = Math.ceil((b.x1 - b.x0) / FEIN_PX) + 1, ny = Math.ceil((b.y1 - b.y0) / FEIN_PX) + 1;
  const c = hindernisFelder(welt, fx0, fy0, nx, ny); let n = 0; for (const v of c) if (v === H_FEST) n++;
  return n / (nx * ny);
};

test('Nebengebäude erscheinen in der Hindernis-Anzeige als fest, Pools nicht mehr', () => {
  assert.ok(welt.nebengebaeude.length > 100 && welt.poolsEcht.length > 0);
  for (const o of welt.nebengebaeude.slice(0, 20)) assert.ok(rot(o) > 0.3, 'Nebengebäude rot');
  assert.ok(welt.poolsEcht.filter(q => rot(q) > 0.25).length <= 1, 'Pools sind begehbar, nicht rot');
});

test('Einzelbäume: im Fenster eine Krone je Eintrag in echter Größe, Fingerabdruck der Welt unberührt', () => {
  const b = welt.baeumeEcht[0], kx = Math.floor(b.x / KACHEL), ky = Math.floor(b.y / KACHEL);
  const l = baumKronen(welt, { x0: kx - 6, y0: ky - 6, x1: kx + 7, y1: ky + 7 });
  const echt = l.filter(k => k.echt);
  assert.ok(echt.some(k => k.x === b.x && k.y === b.y && Math.abs(k.gr - Math.max(16, Math.min(240, b.d * 8))) < 1e-9));
  const ohne = baueWeltAusKarte(structuredClone({ ...karte, baeumeLuftbild: undefined, baeumeLuftbildFenster: undefined }), 12345);
  assert.equal(ohne.baeumeEcht, undefined);
  assert.ok(baumKronen(ohne, { x0: kx - 6, y0: ky - 6, x1: kx + 7, y1: ky + 7 }).every(k => !k.echt));
});
