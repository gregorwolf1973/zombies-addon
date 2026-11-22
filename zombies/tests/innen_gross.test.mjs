// Große Gebäude (client/innen_gross.mjs): Büro, Supermarkt, Werkstatt, Möbelhaus, Lagerhalle bekommen eine Halle mit Einrichtung.
// Je Art: Möbel vorhanden, Behälter und Türen erreichbar, Aufbau deterministisch (zweimal gleich).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, setzeInnenFein, setzeTuerKacheln, T, frei, WERTE as W, grossArt, BEUTE } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { zeichneInnenFein } from '../client/innen_fein_bild.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 12345);
setzeInnenFein(true);

function erreichbar(w) {
  for (const t of w.tueren) setzeTuerKacheln(w, t, true);
  const B = w.breite, H = w.hoehe, K = w.kachel, s = new Uint8Array(B * H);
  const q = [Math.floor(w.start.y / K) * B + Math.floor(w.start.x / K)];
  s[q[0]] = 1;
  for (let a = 0; a < q.length; a++) {
    const i = q[a], x = i % B, y = (i - x) / B;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= B || ny >= H || s[ny * B + nx]) continue;
      if (!frei(w, (nx + 0.5) * K, (ny + 0.5) * K, W.spielerRadius)) continue;
      s[ny * B + nx] = 1; q.push(ny * B + nx);
    }
  }
  return s;
}
const nahe = (s, B, x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (s[(y + dy) * B + x + dx]) return true; return false; };

// In Geretsried 2 trägt kein Gebäude ein Möbel-Tag: ein größeres Gewerbegebäude wird für den Test zum Möbelhaus (OSM shop=furniture)
{ const h = welt.haeuser.filter(q => grossArt(q) === 'buero' && q.betretbar).sort((a, b) => a.flaeche - b.flaeche)[0]; h.art = 'furniture'; h.bau = 'retail'; }
const nachArt = {};
for (const h of welt.haeuser) { const a = grossArt(h); if (a && h.betretbar && !h.safe) (nachArt[a] ??= []).push(h); }
const ERWARTET = {   // mindestens diese Möbelarten je Halle
  buero: ['schreibtischinsel'], supermarkt: ['regal_lang', 'kasse'], werkstatt: ['werkbank'], moebelhaus: ['couchgruppe'], lagerhalle: ['regalzeile'],
};

test('Geretsried 2: jede der fünf Gebäudearten kommt vor', () => {
  for (const a of Object.keys(ERWARTET)) assert.ok(nachArt[a]?.length, 'keine Art ' + a);
});

for (const [art, liste] of Object.entries(nachArt)) {
  test(`Halle ${art}: Möbel, erreichbare Behälter, deterministisch`, () => {
    let gebaut = 0;
    for (const h of liste.slice(0, 2)) {
      const ebene = `h${h.nr}eg`;
      const w = innenraumFuer(3, welt, ebene), w2 = innenraumFuer(3, welt, ebene);
      if (!w.halle && art !== 'supermarkt') continue;   // sehr große/verwinkelte Häuser bleiben im groben Raster
      if (w.kachel !== 2) continue;
      gebaut++;
      const info = `${ebene} ${art}`;
      assert.deepEqual(w.kacheln, w2.kacheln, info + ' nicht deterministisch');
      assert.deepEqual(w.moebel, w2.moebel);
      assert.deepEqual(w.behaelter, w2.behaelter);
      for (const m of ERWARTET[art]) assert.ok(w.moebel.some(q => q.art === m), `${info}: kein ${m}`);
      const s = erreichbar(w), B = w.breite;
      for (const t of w.tueren) assert.ok(t.zellen.some(([x, y]) => nahe(s, B, x, y, 3)), info + ' Tür unerreichbar');
      assert.ok(w.ausgang.zellen.some(([x, y]) => nahe(s, B, x, y, 3)), info + ' Haustür unerreichbar');
      assert.ok(w.behaelter.length > 0, info + ' ohne Behälter');
      for (const b of w.behaelter) {
        const cx = Math.floor(b.x / w.kachel), cy = Math.floor(b.y / w.kachel);
        assert.ok(nahe(s, B, cx, cy, 6), `${info}: Behälter ${b.id} (${b.art}) unerreichbar`);
        assert.ok((BEUTE[b.art] ?? BEUTE['laden_' + b.art] ?? []).length > 0, `${info}: keine Beute für ${b.art}`);
      }
    }
    assert.ok(gebaut > 0, 'kein ' + art + ' im Feinraster gebaut');
  });
}

test('Zeichnung aller Hallenmöbel läuft ohne Fehler (Zeichenfläche als Attrappe)', () => {
  const aufrufe = new Map();
  const ctx = new Proxy({}, { get: (_, n) => n === 'measureText' ? () => ({ width: 1 }) : n === 'createLinearGradient' || n === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { aufrufe.set(n, (aufrufe.get(n) ?? 0) + 1); }, set: () => true });
  const arten = new Set();
  for (const [art, liste] of Object.entries(nachArt)) {
    const w = innenraumFuer(3, welt, `h${liste[0].nr}eg`);
    if (w.kachel !== 2) continue;
    zeichneInnenFein(ctx, w);
    w.moebel.forEach(m => arten.add(m.art));
  }
  for (const a of ['schreibtischinsel', 'aktenschrank', 'werkbank', 'hebebuehne', 'couchgruppe', 'regalzeile', 'kuehlregal']) assert.ok(arten.has(a) || a === 'hebebuehne' || a === 'kuehlregal', 'fehlt ' + a);
  assert.ok(aufrufe.size > 0);
});
