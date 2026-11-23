// Level 2: Isarauen (OpenStreetMap, Isar bei Wolfratshausen/Gelting mit B-11a-Brücke)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, setzeKartengroesse, frei, findeWeg } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { ladeKarte } from '../server/index.mjs';
import { KARTEN } from '../server/einstellungen.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/isarauen.json', import.meta.url)));
const mitte = (x, y) => [(x + 0.5) * KACHEL, (y + 0.5) * KACHEL];

test('Isarauen: Karte registriert und ladbar, Größe im Rahmen', () => {
  assert.ok(KARTEN.includes('isarauen'));
  assert.equal(ladeKarte('isarauen').name, 'isarauen');
  assert.ok(karte.quelle.includes('OpenStreetMap'));
  assert.ok(karte.breite <= 320 && karte.hoehe <= 240);
});

test('Isarauen: Wasser, Safe Rooms, Start, Haustüren, Brücke über die Isar', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const w = baueWeltAusKarte(karte, 7);
    let wasser = 0;
    for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) if (w.hole(x, y) === T.WASSER) wasser++;
    assert.ok(wasser > 1500, 'zu wenig Wasser: ' + wasser);
    assert.ok(w.safeRooms.length >= 3, 'Safe Rooms: ' + w.safeRooms.map(s => s.name));
    assert.ok(frei(w, w.start.x, w.start.y, 11), 'Start blockiert');
    for (const s of w.safeRooms) {
      assert.ok(findeWeg(w, w.start.x, w.start.y, ...mitte(s.haus.tuer.x, s.haus.tuer.y), 11, 80000), `${s.name} nicht erreichbar`);
    }
    const tueren = w.haeuser.filter(h => h.betretbar);
    assert.ok(tueren.length > 50);
    const erreicht = tueren.filter(h => findeWeg(w, w.start.x, w.start.y, ...mitte(h.tuer.x, h.tuer.y), 11, 80000)).length;
    assert.ok(erreicht >= tueren.length * 0.9, `nur ${erreicht}/${tueren.length} Haustüren erreichbar`);
    // Brücke: die B 11a quert die Isar bei y ≈ 108; links und rechts davon ist festes Land, dazwischen Wasser/Brücke
    const y = 108;
    const westen = [90, y + 4], osten = [125, y - 3];
    assert.ok(frei(w, ...mitte(...westen), 11), 'Westufer blockiert');
    assert.ok(frei(w, ...mitte(...osten), 11), 'Ostufer blockiert');
    assert.ok(findeWeg(w, ...mitte(...westen), ...mitte(...osten), 11, 80000), 'Brücke über die Isar nicht begehbar');
    // und die Brücke ist nötig: ohne die Brückenkacheln gäbe es zwischen den Ufern Wasser
    let wasserZwischen = 0;
    for (let yy = 100; yy < 125; yy++) for (let x = 98; x < 118; x++) if (w.hole(x, yy) === T.WASSER) wasserZwischen++;
    assert.ok(wasserZwischen > 40, 'Fluss fehlt zwischen den Ufern');
  } finally { setzeKartengroesse(64, 48); }
});

// Straßendeko: Mülltonnen, durchsuchbare Container, Straßensperren (Autos umfahren sie), freie Plätze in Parkbuchten
test('Isarauen: Mülltonnen, Container, Straßensperren, freie Parkplätze', async () => {
  const { BEUTE, BEHAELTER_NAME } = await import('../client/welt.mjs');
  const { strassenGraph, naechsterKnoten, route } = await import('../server/verkehr.mjs');
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const w = baueWeltAusKarte(karte, 7);
    // Tonnen: Gruppen mit grauer Restmülltonne, nur auf freiem Boden
    // amtliche Karte (tools/amtlich.py): Tonnen nur an Wohnhäusern am Grundstücksrand – das Gebiet ist überwiegend Gewerbe (vorher OSM-Zufall: ≥ 15 Gruppen)
    assert.ok(w.muell.tonnen.length >= 1, 'zu wenige Tonnengruppen: ' + w.muell.tonnen.length);
    for (const g of w.muell.tonnen) {
      assert.ok(g.farben.includes('grau') && g.farben.length >= 2 && g.farben.every(f => ['grau', 'gelb', 'gruen', 'braun', 'blau'].includes(f)));
      const t = w.hole(Math.floor(g.x / KACHEL), Math.floor(g.y / KACHEL));
      assert.ok(t === T.WIESE || t === T.PLATZ, 'Tonnen auf Art ' + t);
    }
    // Vor Haustüren (Vorkachel) steht nichts
    for (const h of w.haeuser.filter(h => h.tuer)) {
      const fx = h.tuer.x + h.raus.dx, fy = h.tuer.y + h.raus.dy;
      assert.ok(!w.muell.tonnen.some(g => Math.floor(g.x / KACHEL) === fx && Math.floor(g.y / KACHEL) === fy), 'Tonnen vor Haustür ' + h.nr);
      assert.ok(!w.behaelter.some(b => b.art === 'container' && Math.floor(b.x / KACHEL) === fx && Math.floor(b.y / KACHEL) === fy), 'Container vor Haustür ' + h.nr);
    }
    // Container: durchsuchbar (Beute, Name) und zu Fuß erreichbar
    const cont = w.behaelter.filter(b => b.art === 'container');
    assert.ok(cont.length >= 8, 'zu wenige Container: ' + cont.length);
    assert.ok(BEUTE.container.includes('essen') && BEUTE.container.includes('schokoriegel') && BEUTE.container.includes('bretter') && BEUTE.container.includes('kleidung') && BEUTE.container.includes('tasche'));
    assert.ok(BEHAELTER_NAME.container);
    assert.equal(new Set(w.behaelter.map(b => b.id)).size, w.behaelter.length, 'doppelte Behälter-IDs');
    let ok = 0;
    for (const c of cont) {
      const nachbarn = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c.x + dx * KACHEL, c.y + dy * KACHEL]).filter(([x, y]) => frei(w, x, y, 11));
      if (nachbarn.some(([x, y]) => Math.hypot(x - c.x, y - c.y) < 40 && findeWeg(w, w.start.x, w.start.y, x, y, 11, 80000))) ok++;
    }
    assert.ok(ok >= cont.length * 0.9, `nur ${ok}/${cont.length} Container erreichbar`);
    // Sperren: Hindernis im Raster, Verkehrsgraph ohne die Kante, Weg drumherum vorhanden
    assert.ok(w.sperren.length >= 1 && w.sperren.length <= 2, 'Sperren: ' + w.sperren.length);
    const g = strassenGraph(w);
    for (const s of w.sperren) {
      for (const [kx, ky] of s.kacheln) assert.equal(w.hole(kx, ky), T.DEKO);
      const [ax, ay, bx, by] = s.kante, a = naechsterKnoten(g, ax * KACHEL, ay * KACHEL), b = naechsterKnoten(g, bx * KACHEL, by * KACHEL);
      assert.ok(Math.hypot(a.x - ax * KACHEL, a.y - ay * KACHEL) < 2 && Math.hypot(b.x - bx * KACHEL, b.y - by * KACHEL) < 2, 'Sperrenenden nicht im Straßennetz');
      assert.ok(!a.nach.some(e => e.ziel === b), 'gesperrte Kante noch im Graph');
      assert.ok(route(g, a, b)?.length >= 3, 'kein Weg um die Sperre');
      // zu Fuß: der Rand der Straße bleibt offen (Lücke), die Sperre trennt das Gelände nicht
      assert.ok(s.kacheln.length === 0 || s.breite >= 24);
    }
    // Parkbuchten: jede hat mindestens einen freien Platz, längere lassen mehr frei
    const inBucht = w.behaelter.filter(b => b.art === 'auto' && b.platz === 'bucht');
    let lang = 0;
    for (const b of w.parkbuchten) {
      const belegt = b.plaetze.filter(q => inBucht.some(a => Math.hypot(a.x - q.x, a.y - q.y) < 1)).length;
      assert.ok(belegt <= b.plaetze.length - 1, 'Bucht ohne freien Platz');
      assert.ok(belegt <= b.plaetze.length - (b.extra ?? 0), 'lange Bucht nicht frei genug');
      if (b.extra > 0) lang++;
    }
    assert.ok(lang >= w.parkbuchten.length * 0.15, `zu wenige längere Buchten: ${lang}/${w.parkbuchten.length}`);
  } finally { setzeKartengroesse(64, 48); }
});
