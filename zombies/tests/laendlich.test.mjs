// Paket B1: ländliche Details (Baumdichte), Determinismus des Weltaufbaus, B-11-Ausdünnung, feste Safehouses per Kachel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { T, setzeKartengroesse, weltFingerabdruck, WELT_VERSION } from '../client/welt.mjs';
import { baueWeltAusKarte, festeSafesVon, SAFE_MAX } from '../client/osmwelt.mjs';
import { b11Kreuzung } from '../client/laendlich.mjs';

const lade = name => JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
const baue = (karte, seed = 4711, opt) => { setzeKartengroesse(karte.breite, karte.hoehe); return baueWeltAusKarte(karte, seed, opt); };
const zaehle = (w, karte, art) => { let n = 0; for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) if (w.hole(x, y) === art) n++; return n; };

test('Weltversion 21', () => { assert.ok(WELT_VERSION >= 21); });

test('Ländliche Karten: mindestens 60 Baumkacheln je 1000, Heuballen und Zäune vorhanden', () => {
  for (const name of ['isarauen', 'koenigsdorf', 'kochel', 'andermatt']) for (const seed of [4711, 99]) {
    const karte = lade(name), w = baue(karte, seed);
    const dichte = zaehle(w, karte, T.BAUM) / (karte.breite * karte.hoehe) * 1000;
    assert.ok(dichte >= 60, `${name} Seed ${seed}: ${dichte.toFixed(1)} Baumkacheln je 1000`);
  }
  const k = lade('koenigsdorf'), w = baue(k);
  assert.ok(w.deko.some(d => d.art === 'heu'), 'Heuballen als Deko');
  assert.ok(w.details.zaeune.length > k.zaeune.length, 'Weidezäune und Hecken ergänzt');
  assert.ok(w.vektor.strassen.length > k.strassen.length, 'Feldwege/Bankette an Landstraßen ergänzt');
});

test('Dichte Karten (Geretsried) bekommen keine zusätzlichen ländlichen Details', () => {
  const karte = lade('geretsried'), w = baue(karte);
  assert.equal(w.deko.filter(d => d.art === 'heu').length, 0);
  assert.equal(w.vektor.strassen.length, karte.strassen.length);
});

test('Weltaufbau ist deterministisch (gleicher Fingerabdruck, auch nach dem Bau anderer Karten) und verändert die Eingabekarte nicht', () => {
  for (const name of ['isarauen', 'kochel', 'geretsried2']) {
    const karte = lade(name), vorher = JSON.stringify([karte.strassen, karte.zaeune, karte.zaunart, karte.kacheln]);
    const a = weltFingerabdruck(baue(karte, 12345));
    baue(lade('andermatt'), 7);   // andere Karte dazwischen
    const b = weltFingerabdruck(baue(karte, 12345));
    assert.equal(a, b, name);
    assert.equal(JSON.stringify([karte.strassen, karte.zaeune, karte.zaunart, karte.kacheln]), vorher, name + ': Eingabekarte unverändert');
    assert.notEqual(a, weltFingerabdruck(baue(karte, 54321)), name + ': anderer Seed, andere Welt');
  }
});

test('Weidezäune haben ein Tor, Hecken haben Lücken: alle Zäune der neuen Details sind umgehbar (Start erreicht den Kartenrand-Ausgang)', () => {
  for (const name of ['isarauen', 'koenigsdorf', 'kochel', 'andermatt']) {
    const karte = lade(name), w = baue(karte);
    // Flutung über begehbare Kacheln vom Start aus: die Mehrheit der freien Wiese muss erreichbar bleiben
    const ok = t => t !== T.WAND && t !== T.WASSER && t !== T.ZAUN && t !== T.TOR && t !== T.DEKO && t !== T.LEER;
    const B = karte.breite, H = karte.hoehe, gesehen = new Uint8Array(B * H);
    const sx = Math.floor(w.start.x / 32), sy = Math.floor(w.start.y / 32), q = [sy * B + sx]; gesehen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % B, y = (q[i] - x) / B;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= B || ny >= H || gesehen[ny * B + nx] || !ok(w.hole(nx, ny))) continue;
        gesehen[ny * B + nx] = 1; q.push(ny * B + nx);
      }
    }
    // die Mehrheit der freien Wiese bleibt vom Start aus erreichbar (Zäune mit Toren, Hecken mit Lücken)
    let frei = 0; for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) if (w.hole(x, y) === T.WIESE) frei++;
    let erreicht = 0; for (let i = 0; i < gesehen.length; i++) if (gesehen[i] && w.hole(i % B, Math.floor(i / B)) === T.WIESE) erreicht++;
    assert.ok(erreicht / frei > 0.5, `${name}: nur ${(erreicht / frei * 100).toFixed(0)} % der Wiese erreichbar`);
  }
});

test('B-11-Kreuzung (geretsried2): Bäume im Umkreis von 40 Kacheln stark ausgedünnt, weiter entfernt unverändert dicht', () => {
  const karte = lade('geretsried2'), w = baue(karte);
  const kr = b11Kreuzung(karte);
  assert.ok(kr && Math.hypot(kr[0] - 123.6, kr[1] - 370.5) < 3, 'Kreuzung bei Kachel (123.6, 370.5)');
  let innen = 0, flaeche = 0, aussen = 0, aussenFlaeche = 0;
  for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) {
    const d = Math.hypot(x + 0.5 - kr[0], y + 0.5 - kr[1]);
    if (d <= 40) { flaeche++; if (w.hole(x, y) === T.BAUM) innen++; }
    else if (d > 80 && d < 140) { aussenFlaeche++; if (w.hole(x, y) === T.BAUM) aussen++; }
  }
  const di = innen / flaeche * 1000, da = aussen / aussenFlaeche * 1000;
  assert.ok(di < 25, `Umkreis 40: ${di.toFixed(1)} Baumkacheln je 1000`);
  assert.ok(da > 3 * di, `außen ${da.toFixed(1)} sollte deutlich dichter sein als innen ${di.toFixed(1)}`);
  // die anderen Karten haben keine B-11-Zone
  assert.equal(b11Kreuzung(lade('isarauen')), null);
});

test('Feste Safehouses per Kachel: Haus wird Safe Room, höchstens SAFE_MAX, ohne Eintrag bleibt alles wie zuvor', () => {
  const karte = lade('geretsried2');
  const ohne = baue(karte);
  assert.deepEqual(festeSafesVon(karte).map(f => f.name), ['Wohnhaus'], 'Vorbelegung: ein festes Wohnhaus');
  assert.ok(ohne.safeRooms.some(s => s.name === 'Wohnhaus'), 'festes Wohnhaus ist Safe Room');
  // zusätzliches Haus per Kartenfeld: Kachel (210, 41) liegt im Umriss des Hauses (207, 38) (Enzianweg 28, amtlicher Hausumring)
  const mit = baue({ ...karte, festeSafes: [{ x: 210, y: 41, name: 'Testhaus' }] });
  assert.ok(mit.safeRooms.length >= ohne.safeRooms.length && mit.safeRooms.length <= SAFE_MAX);
  const s = mit.safeRooms.find(s => s.name === 'Testhaus');
  assert.ok(s && s.haus.safe && s.haus.x === 207 && s.haus.y === 38);
  assert.ok(mit.safeRooms.length <= SAFE_MAX);
  // Kachel in einer Wiese ohne Haus in Reichweite: nichts passiert
  assert.equal(baue({ ...karte, festeSafes: [...festeSafesVon(karte), { x: 300, y: 300 }] }).safeRooms.length, ohne.safeRooms.length);
  // Obergrenze
  const viele = baue({ ...karte, festeSafes: Array.from({ length: 12 }, (_, i) => ({ x: 216 + (i % 2) * 4, y: 22 + i * 2 })) });
  assert.ok(viele.safeRooms.length <= SAFE_MAX);
});
