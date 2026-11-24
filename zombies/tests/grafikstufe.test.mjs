// Grafikstufe: Automatik-Regel, halb aufgelöste Atlanten (*_klein.webp, halbierte Rahmen), Ladeliste (alte Bögen nur bei Bedarf), Heldenvorladen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRAFIK_WAHL, grafikWahlLesen, grafikAutomatik, grafikStufe, grafikEinstellung, atlasPfad, rahmenHalb, heldenBenoetigt, figurenLadeliste, altBoegenNoetig, GRAFIK } from '../client/grafikstufe.mjs';
import { ZF_FIGUREN } from '../client/zombiefiguren.mjs';
import { HF_FIGUREN, hfFigurVon } from '../client/heldenfiguren.mjs';

const dir = new URL('../client/grafik/', import.meta.url);
const json = n => JSON.parse(fs.readFileSync(new URL(n, dir)));

// Breite/Höhe einer WebP-Datei aus dem Kopf lesen (VP8X, VP8L, VP8)
function webpMasse(name) {
  const b = fs.readFileSync(new URL(name, dir));
  assert.equal(b.toString('latin1', 0, 4), 'RIFF'); assert.equal(b.toString('latin1', 8, 12), 'WEBP');
  const art = b.toString('latin1', 12, 16);
  if (art === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (art === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

test('Wahl: nur bekannte Werte, sonst Automatisch', () => {
  assert.deepEqual(GRAFIK_WAHL, ['auto', 'hoch', 'mittel', 'niedrig']);
  for (const w of GRAFIK_WAHL) assert.equal(grafikWahlLesen(w), w);
  for (const w of [null, undefined, '', 'ultra', 5]) assert.equal(grafikWahlLesen(w), 'auto');
});

test('Automatik: Handy/Tablet, wenig Speicher, kleiner Bildschirm → Mittel, sonst Hoch', () => {
  assert.equal(grafikAutomatik({}), 'hoch');
  assert.equal(grafikAutomatik({ breite: 2560, hoehe: 1440, speicherGB: 8 }), 'hoch');
  assert.equal(grafikAutomatik({ mobil: true }), 'mittel');
  assert.equal(grafikAutomatik({ grob: true }), 'mittel');
  assert.equal(grafikAutomatik({ speicherGB: 4 }), 'mittel');
  assert.equal(grafikAutomatik({ speicherGB: 2 }), 'mittel');
  assert.equal(grafikAutomatik({ speicherGB: 8 }), 'hoch');
  assert.equal(grafikAutomatik({ speicherGB: null }), 'hoch');
  assert.equal(grafikAutomatik({ breite: 1920, hoehe: 600 }), 'mittel');
  assert.equal(grafikAutomatik({ breite: 390, hoehe: 844 }), 'mittel');
});

test('Stufe: feste Wahl gilt immer, Auto folgt der Umgebung', () => {
  const handy = { mobil: true }, pc = { breite: 1920, hoehe: 1080, speicherGB: 16 };
  assert.equal(grafikStufe('auto', handy), 'mittel'); assert.equal(grafikStufe('auto', pc), 'hoch');
  for (const u of [handy, pc]) for (const s of ['hoch', 'mittel', 'niedrig']) assert.equal(grafikStufe(s, u), s);
  assert.equal(grafikStufe('quatsch', pc), 'hoch');
});

test('Einstellung je Stufe: Faktor 2 und Verzicht nur bei halber Auflösung bzw. Niedrig', () => {
  assert.deepEqual(grafikEinstellung('hoch'), { stufe: 'hoch', halb: false, k: 1, partikel: 1, luftbild: true, schatten: true });
  assert.deepEqual(grafikEinstellung('mittel'), { stufe: 'mittel', halb: true, k: 2, partikel: 1, luftbild: true, schatten: true });
  assert.deepEqual(grafikEinstellung('niedrig'), { stufe: 'niedrig', halb: true, k: 2, partikel: 0.5, luftbild: false, schatten: false });
  assert.equal(grafikEinstellung('x').stufe, 'hoch');
  assert.equal(GRAFIK.stufe, 'hoch');   // ohne Browser: Hoch
});

test('Atlas-Varianten: Pfad, Rahmen halbiert, Bildgröße genau halb, Koordinaten gerade', () => {
  assert.equal(atlasPfad('grafik/zombies_yaku.webp', true), 'grafik/zombies_yaku_klein.webp');
  assert.equal(atlasPfad('grafik/zombies_yaku.webp', false), 'grafik/zombies_yaku.webp');
  assert.deepEqual(rahmenHalb([320, 160, 160, 160], true), [160, 80, 80, 80]);
  assert.deepEqual(rahmenHalb([320, 160, 160, 160], false), [320, 160, 160, 160]);
  const zn = json('zombies_neu.json'), hn = json('helden_neu.json');
  for (const f of ZF_FIGUREN) {
    const [w, h] = webpMasse(`zombies_${f}.webp`), [kw, kh] = webpMasse(`zombies_${f}_klein.webp`);
    assert.deepEqual([kw, kh], [w / 2, h / 2], f);
  }
  const [zw, zh] = webpMasse(`zombies_${ZF_FIGUREN[0]}.webp`);   // Atlasgröße aus der Datei (mit drei Sterbebewegungen 3200×1600)
  for (const r of Object.values(zn.bilder)) { for (const v of r) assert.equal(v % 2, 0); assert.ok(r[0] / 2 + r[2] / 2 <= zw / 2 && r[1] / 2 + r[3] / 2 <= zh / 2); }
  for (const f of HF_FIGUREN) {
    const [w, h] = webpMasse(`helden_${f}.webp`), [kw, kh] = webpMasse(`helden_${f}_klein.webp`);
    assert.deepEqual([kw, kh], [w / 2, h / 2], f);
    for (const k of Object.values(hn.clips)) {   // jeder halbierte Rahmen liegt im halben Bild
      assert.equal(k.feld % 2, 0); assert.equal(k.y % 2, 0);
      const q = rahmenHalb([(k.n - 1) * k.feld, k.y, k.feld, k.feld], true);
      assert.ok(q[0] + q[2] <= kw && q[1] + q[3] <= kh, `${f} ${k.n}`);
    }
  }
  const [ww, wh] = webpMasse('helden_waffen.webp'), [kww, kwh] = webpMasse('helden_waffen_klein.webp');
  assert.deepEqual([kww, kwh], [ww / 2, wh / 2]);
  for (const m of Object.values(hn.waffen)) { const q = rahmenHalb([0, m.y, m.w, m.h], true); assert.ok(q[0] + q[2] <= kww && q[1] + q[3] <= kwh); }
});

test('Ladeliste: mit Bit 256 + 512 werden die alten Bögen nicht geladen', () => {
  const l = figurenLadeliste({ optionen: 256 | 512, halb: false, helden: ['jennifer'] }).map(e => e.key);
  assert.ok(!l.includes('figuren3') && !l.includes('helden160'));
  assert.ok(ZF_FIGUREN.every(f => l.includes('zf_' + f)) && l.includes('hf_waffen') && l.includes('hf_jennifer'));
  assert.deepEqual(altBoegenNoetig(256 | 512), { figuren3: false, helden160: false });
});

test('Ladeliste: ohne die Bits kommen die alten Bögen (je Bit einzeln), halbe Pfade bei Mittel/Niedrig', () => {
  const k = o => figurenLadeliste({ optionen: o }).map(e => e.key);
  assert.ok(k(512).includes('figuren3') && !k(512).includes('helden160'));
  assert.ok(k(256).includes('helden160') && !k(256).includes('figuren3'));
  assert.ok(k(0).includes('figuren3') && k(0).includes('helden160'));
  assert.deepEqual(altBoegenNoetig(0), { figuren3: true, helden160: true });
  const halb = figurenLadeliste({ optionen: 768, halb: true, helden: ['alex'] });
  for (const e of halb) if (/^(zf_|hf_)/.test(e.key)) assert.match(e.url, /_klein\.webp$/, e.key);
  for (const e of figurenLadeliste({ optionen: 0, halb: true })) if (/^(figuren3|helden160)$/.test(e.key)) assert.doesNotMatch(e.url, /_klein/);   // alte Bögen bleiben voll
  for (const e of figurenLadeliste({ optionen: 768, halb: true, helden: ['alex'] })) assert.ok(fs.existsSync(new URL('../client/' + e.url, import.meta.url)), e.url);
  assert.ok(figurenLadeliste({ optionen: 768, halb: false }).every(e => fs.existsSync(new URL('../client/' + e.url, import.meta.url))));
});

test('Heldenvorladen: nur der eigene und die anwesenden Helden, nie alle, ohne Doppelte und ohne Nicht-Mixamo-Figuren', () => {
  const ids = heldenBenoetigt({ aussehen: ['h,0,0', 'f,1,1', 'h,2,2', 's,0,0', 'm,0,0', 'r,0,0', undefined], eigenes: 'o,0,0', hfFigurVon });
  assert.deepEqual(ids, ['roth', 'swatguy', 'jennifer', 'remy']);
  assert.ok(ids.length < HF_FIGUREN.length);
  assert.deepEqual(heldenBenoetigt({ aussehen: [], eigenes: null, hfFigurVon }), []);
  assert.deepEqual(heldenBenoetigt({ aussehen: ['h,0,0'], eigenes: 'h,5,5', hfFigurVon }), ['swatguy']);
  const l = figurenLadeliste({ optionen: 768, helden: ids, halb: false }).filter(e => e.key.startsWith('hf_') && e.key !== 'hf_waffen');
  assert.equal(l.length, 4);
  assert.deepEqual(figurenLadeliste({ optionen: 768, helden: ['gibtsnicht'] }).filter(e => e.key.startsWith('hf_') && e.key !== 'hf_waffen'), []);
});

test('Polizisten-Atlas (SWAT dunkelblau, tools/mixamo/polizei_atlas.py): Clips stehen/gehen/tod, Rahmen im Bild, kleine Fassung halb so groß', () => {
  const j = json('polizei.json'), [w, h] = webpMasse('polizei.webp'), [kw, kh] = webpMasse('polizei_klein.webp');
  assert.deepEqual([w, h], j.groesse);
  assert.deepEqual([kw, kh], [w / 2, h / 2]);
  for (const c of ['stehen', 'gehen', 'tod']) {
    const k = j.clips[c];
    assert.ok(k && k.n >= 8, c);
    assert.ok(k.n * k.feld <= w && k.y + k.feld <= h && k.y % 2 === 0 && k.feld % 2 === 0, c);
  }
  assert.ok(j.clips.gehen.weg > 0 && j.clips.tod.einmal);
});
