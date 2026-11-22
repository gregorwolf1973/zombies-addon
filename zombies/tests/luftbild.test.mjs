// Paket H: Kulisse nach Luftbildern – Bäume folgen dem Feld "luftbild", Weltaufbau deterministisch, Freihaltebereiche frei
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { T, setzeKartengroesse, weltFingerabdruck, KACHEL } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { freihalteKreise } from '../client/laendlich.mjs';
import { luftbildFeld, luftbildAcker, LB_BAUM } from '../client/luftbild.mjs';

const KARTEN = ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt'];
const lade = name => JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
const baue = (karte, seed = 4711) => { setzeKartengroesse(karte.breite, karte.hoehe); return baueWeltAusKarte(karte, seed); };

test('Alle Karten haben ein Luftbild-Feld, Quelle und ein Bild', () => {
  for (const n of KARTEN) {
    const k = lade(n);
    setzeKartengroesse(k.breite, k.hoehe);
    assert.ok(luftbildFeld(k), n + ': luftbild-Feld passt zur Kartengröße');
    assert.match(k.luftbildQuelle, /Bayerische Vermessungsverwaltung|swisstopo/);
    assert.ok(fs.statSync(new URL(`../client/karten/${n}_luftbild.webp`, import.meta.url)).size < 260_000, n + ': Bild ≤ 250 KB');
    assert.ok(k.gebaeude.some(g => g.dach && g.dachart), n + ': Dachdaten vorhanden');
  }
});

test('Bäume folgen dem Luftbild: neue Bäume nur auf Luftbild-Baumkacheln', () => {
  for (const n of ['geretsried2', 'isarauen']) {
    const karte = lade(n), w = baue(karte), lb = karte.luftbild;
    let neu = 0, falsch = 0, ziel = 0, gesetzt = 0;
    for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) {
      const i = y * karte.breite + x, war = karte.kacheln.charCodeAt(i) - 48, ist = w.hole(x, y);
      if (ist === T.BAUM && war !== T.BAUM) {
        neu++;
        if (karte.amtlich) {   // amtliche Einzelbäume: neue Baumkachel nur unter einer Krone (Radius + 1 Kachel)
          const mx = (x + 0.5) * KACHEL, my = (y + 0.5) * KACHEL;
          if (!karte.baeumeLuftbild.some(b => (b.x - mx) ** 2 + (b.y - my) ** 2 <= (b.d * 4 + KACHEL) ** 2)) falsch++;
        } else if (lb.charCodeAt(i) - 48 !== LB_BAUM) falsch++;
      }
      if (war === T.WIESE && lb.charCodeAt(i) - 48 === LB_BAUM) { ziel++; if (ist === T.BAUM) gesetzt++; }
    }
    assert.ok(neu > 100, `${n}: es entstehen Bäume (${neu})`);
    assert.ok(falsch <= neu * 0.01, `${n}: generierte Bäume außerhalb des Luftbild-Baums: ${falsch} von ${neu} (nur Reste anderer Weltteile erlaubt)`);
    if (!karte.amtlich) assert.ok(gesetzt / ziel > 0.4, `${n}: Anteil gesetzter Luftbild-Baumkacheln ${(gesetzt / ziel).toFixed(2)}`);
  }
});

test('Deterministisch (auch nach Bau einer anderen Karte) und Eingabekarte unverändert', () => {
  for (const n of ['geretsried', 'kochel']) {
    const karte = lade(n), vor = JSON.stringify([karte.luftbild, karte.kacheln, karte.gebaeude.length]);
    const a = weltFingerabdruck(baue(karte, 777));
    baue(lade('andermatt'), 5);
    assert.equal(weltFingerabdruck(baue(karte, 777)), a, n);
    assert.equal(JSON.stringify([karte.luftbild, karte.kacheln, karte.gebaeude.length]), vor);
  }
});

test('Freihaltebereiche bleiben baumfrei (Landeplatz Kochel, Bunkertor Andermatt, Start, Haustür-Vorkacheln)', () => {
  for (const n of ['kochel', 'andermatt', 'geretsried2']) {
    const karte = lade(n), w = baue(karte);
    for (const [cx, cy, r] of freihalteKreise(karte)) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r && karte.kacheln.charCodeAt(y * karte.breite + x) - 48 !== T.BAUM) assert.notEqual(w.hole(x, y), T.BAUM, `${n} ${x},${y}`);
    }
    const sx = Math.floor(w.start.x / KACHEL), sy = Math.floor(w.start.y / KACHEL);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (karte.kacheln.charCodeAt((sy + dy) * karte.breite + sx + dx) - 48 !== T.BAUM) assert.notEqual(w.hole(sx + dx, sy + dy), T.BAUM, `${n} Start`);   // OSM-Wald bleibt, neue Bäume nie
    for (const h of w.haeuser) if (h.tuer && h.raus) assert.notEqual(w.hole(h.tuer.x + h.raus.dx, h.tuer.y + h.raus.dy), T.BAUM, `${n}: Haustür-Vorkachel`);
  }
});

test('Acker-Flächen aus dem Luftbild: Rechtecke im Flächenformat', () => {
  const karte = lade('isarauen'), w = baue(karte);
  const acker = luftbildAcker(karte, Uint8Array.from(karte.kacheln, c => c.charCodeAt(0) - 48));
  assert.ok(acker.length > 0);
  assert.ok(w.vektor.flaechen.filter(f => f.a === 'acker').length >= acker.length);
  for (const f of acker) assert.equal(f.p.length, 8);
});
