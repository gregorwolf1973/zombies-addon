// Fahrzeuge lenken weich (alle Arten: Auto, Boxer, Puma, Leopard): Lenkrate fällt mit dem Tempo, Totzone, Drehrate ∝ Abweichung;
// Abgleiten an Wänden statt Hängenbleiben (schräg gleiten, frontal stehen); Spurhilfe auf Straßen; Backend-Werte.
// Schnelle Simulation ohne Netz (Ersatz-Raum wie tests/pkw.test.mjs), Takt 50 ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREITE, HOEHE, FEIN, FEIN_PX, KACHEL, T, kmhZuPx } from '../client/welt.mjs';
import { FahrbarPkw } from '../server/pkw.mjs';
import { FahrbarBoxer, FahrbarPuma, FahrbarLeopard, lenkWerte, LENK_VORGABE } from '../server/fahrbar.mjs';
import { strassenRichtung, richtungsRaster } from '../server/spurhilfe.mjs';
import { PKW, PKW_VORGABE } from '../client/pkw.mjs';
import { bereinigeAuto, bereinige } from '../server/einstellungen.mjs';

const DT = 0.05, WAND = 1700, GRAD = Math.PI / 180;
const winkel = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function welt(mitWand = true, extra = {}) {
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, fein = new Uint8Array(fb * fh);
  if (mitWand) { const wx = Math.floor(WAND / FEIN_PX); for (let y = 0; y < fh; y++) fein[y * fb + wx] = 1; }
  return { fein, behaelter: [], ...extra };
}
function raum(einst = {}, w = welt()) {
  const r = {
    welt: w, extra: new Map(), clients: [], gesendet: [],
    state: { spieler: new Map(), fahrzeuge: new Map(), zombies: new Map(), behaelter: new Map(), phase: 'spiel', besiegt: 0, seed: 7 },
    einstellungen: () => ({ zombieLeben: 100, funde: {}, ...einst, auto: { ...PKW_VORGABE, ...(einst.auto ?? {}) }, bundeswehr: { ...(einst.bundeswehr ?? {}) } }),
    rnd: () => 0.5, broadcast(typ, m) { this.gesendet.push([typ, m]); }, laerm() {},
    schaden() {}, unsterblich: () => false, liegtAmBoden(p) { p.unten = true; },
    verkehr: { unfaelle: { liste: new Map() } },
  };
  r.fahrbare = { liste: [] };
  return r;
}
const ARTEN = {
  pkw: r => new FahrbarPkw(r, 'b1'),
  boxer: r => new FahrbarBoxer(r), puma: r => new FahrbarPuma(r), leopard: r => new FahrbarLeopard(r),
};
function fahrzeug(art, r, x = 300, y = 400, w = 0) {
  const fz = ARTEN[art](r);
  fz.aufstellen(x, y, w); fz.andere = [];
  return fz;
}
// Drehrate (rad/s) bei festgehaltenem Tempo v und Stick um `ab` neben der Fahrtrichtung (Mittel über die letzten 0,5 s von 1 s)
function drehrate(art, anteil, ab, einst = {}) {
  const r = raum(einst, welt(false)), fz = fahrzeug(art, r, 800, 700);
  const V = fz.fahrwerk().vmax * anteil;
  let w0 = 0;
  for (let i = 0; i < 20; i++) {
    if (i === 10) w0 = fz.f.richtung;
    fz.v = V;
    const z = fz.f.richtung + ab;
    fz.fahren({ dx: Math.cos(z), dy: Math.sin(z) }, DT);
    fz.f.x = 800; fz.f.y = 700;   // auf der Stelle halten (nur die Lenkung zählt)
  }
  return winkel(w0, fz.f.richtung) / 0.5;
}

test('Backend: Vorgaben weich lenken / Lenkung bei Tempo / Totzone / Spurhilfe, Panzer eigene Werte, Unsinn fällt auf Vorgaben', () => {
  const a = bereinigeAuto({});
  assert.equal(a.lenkWeich, 0.5); assert.equal(a.lenkTempo, 40); assert.equal(a.lenkTotzone, 3); assert.equal(a.spurhilfe, true);
  for (const k of ['lenkWeich', 'lenkTempo', 'lenkTotzone', 'spurhilfe']) assert.equal(PKW_VORGABE[k], LENK_VORGABE[k], k);
  assert.equal(bereinigeAuto({ spurhilfe: false }).spurhilfe, false);
  assert.equal(bereinigeAuto({ lenkWeich: 'x', lenkTempo: -3 }).lenkWeich, 0.5);
  assert.ok(bereinigeAuto({ lenkTempo: -3 }).lenkTempo >= 5);
  const e = bereinige({});
  assert.equal(e.bundeswehr.panzerLenkWeich, 0.6); assert.equal(e.bundeswehr.panzerLenkTempo, 50);
  assert.equal(e.auto.spurhilfe, true);
  assert.equal(bereinige({ auto: { spurhilfe: false } }).auto.spurhilfe, false);
  const l = lenkWerte(undefined, 40, 3, undefined);
  assert.equal(l.weich, 0.5); assert.ok(Math.abs(l.tempo - 0.4) < 1e-9); assert.ok(Math.abs(l.totzone - 3 * GRAD) < 1e-9); assert.equal(l.spurhilfe, true);
});

test('Weich lenken: bei Höchsttempo deutlich langsamer als bei mäßigem Tempo – für alle Fahrzeuge', () => {
  for (const art of Object.keys(ARTEN)) {
    const langsam = drehrate(art, 0.3, 90 * GRAD), schnell = drehrate(art, 1, 90 * GRAD);
    assert.ok(langsam > 0.3, `${art}: dreht überhaupt (${langsam})`);
    const soll = art === 'pkw' ? 0.4 : 0.5;
    assert.ok(Math.abs(schnell / langsam - soll) < 0.08, `${art}: Höchsttempo ${schnell.toFixed(3)} / langsam ${langsam.toFixed(3)} ≈ ${soll}`);
  }
  // Backend-Wert wirkt: Lenkung bei Höchsttempo 80 % statt 40 %
  const r40 = drehrate('pkw', 1, 90 * GRAD), r80 = drehrate('pkw', 1, 90 * GRAD, { auto: { lenkTempo: 80 } });
  assert.ok(Math.abs(r80 / r40 - 2) < 0.15, `lenkTempo 80: ${r80} vs ${r40}`);
  const p50 = drehrate('boxer', 1, 90 * GRAD), p100 = drehrate('boxer', 1, 90 * GRAD, { bundeswehr: { panzerLenkTempo: 100 } });
  assert.ok(Math.abs(p100 / p50 - 2) < 0.15, `panzerLenkTempo 100: ${p100} vs ${p50}`);
});

test('Weich lenken: Drehrate wächst mit der Abweichung, Totzone (3°) = geradeaus, auch für Panzer', () => {
  for (const art of ['pkw', 'boxer', 'leopard']) {
    const klein = drehrate(art, 0.5, 2 * GRAD), mittel = drehrate(art, 0.5, 8 * GRAD), gross = drehrate(art, 0.5, 20 * GRAD);
    assert.ok(Math.abs(klein) < 1e-6, `${art}: 2° Stick dreht nicht (${klein})`);
    assert.ok(mittel > 0 && gross > mittel * 1.8, `${art}: 8° → ${mittel.toFixed(3)}, 20° → ${gross.toFixed(3)}`);
  }
  // Totzone 0 im Backend: auch 2° drehen ein wenig
  assert.ok(drehrate('pkw', 0.5, 2 * GRAD, { auto: { lenkTotzone: 0 } }) > 0);
});

// Fahrer drückt dauerhaft in Richtung `w`; Ergebnis: Pose, Tempo und Höchsttempo nach `sek`
function fahreGegen(art, w, sek, { x = 1500, y = 400, start = w, einst = {}, vorher } = {}) {
  const r = raum({ auto: { tempo: 50 }, bundeswehr: { boxerTempo: 50, pumaTempo: 50, leopardTempo: 50 }, ...einst }), fz = fahrzeug(art, r, x, y, start);
  if (art === 'pkw') { r.state.spieler.set('a', { x, y: y - 20, richtung: 0, hp: 100, ebene: '', rucksack: ['autoschluessel'], anBord: false, imBoxer: false, unten: false, zombie: 0, kamera: false, verbunden: true, name: 'a' }); r.extra.set('a', {}); r.fahrbare.liste.push(fz); assert.ok(fz.einsteigen('a')); }
  vorher?.(fz);
  let vmax = 0, vKontakt = null;
  for (let t = 0; t < sek; t += DT) {
    if (art === 'pkw') { fz.fahrerEingabe('a', { dx: Math.cos(w), dy: Math.sin(w) }); fz.schritt(DT); }
    else fz.fahren({ dx: Math.cos(w), dy: Math.sin(w) }, DT);
    if (!fz.f) break;
    vmax = Math.max(vmax, Math.abs(fz.v));
    if (fz.gleitet && vKontakt === null) vKontakt = Math.abs(fz.v);
  }
  return { fz, vmax, vKontakt };
}

test('Abgleiten: schräg (45°) an der Wand gleitet das Fahrzeug weiter und verliert nur etwas Tempo; frontal bleibt es stehen', () => {
  for (const art of ['pkw', 'boxer', 'puma']) {
    const y0 = 400;
    const { fz, vKontakt } = fahreGegen(art, 45 * GRAD, 5, { x: 1500, y: y0 });
    assert.ok(fz.f.x < WAND, `${art}: nicht durch die Wand (${fz.f.x})`);
    assert.ok(fz.f.y - y0 > 150, `${art}: an der Wand entlang geglitten (${(fz.f.y - y0).toFixed(0)} px)`);
    assert.ok(Math.abs(fz.v) > 0.2 * fz.fahrwerk().vmax, `${art}: rollt noch (${fz.v.toFixed(1)})`);
    assert.ok(vKontakt > 0, `${art}: Gleiten erkannt`);
    // frontal (10° zur Normalen): stehen bleiben vor der Wand
    const fr = fahreGegen(art, 10 * GRAD, 5, { x: 1500, y: y0 }).fz;
    assert.ok(fr.f.x < WAND && fr.f.x > WAND - 60, `${art}: steht vor der Wand (${fr.f.x})`);
    assert.ok(Math.abs(fr.f.y - y0) < 60, `${art}: frontal kaum seitlich (${(fr.f.y - y0).toFixed(0)} px)`);
    assert.ok(Math.abs(fr.v) < 1, `${art}: frontal steht (${fr.v})`);
  }
});

test('Abgleiten: Pfahl mittig getroffen = stehen bleiben, nur mit der Ecke gestreift = vorbeigleiten', () => {
  const mitPfahl = () => { const w = welt(false), fb = BREITE * FEIN; w.fein[Math.floor(400 / FEIN_PX) * fb + Math.floor(1200 / FEIN_PX)] = 1; return w; };
  for (const art of ['pkw', 'boxer']) {
    const r = raum({}, mitPfahl()), fz = fahrzeug(art, r, 1000, 404, 0);
    for (let t = 0; t < 6; t += DT) fz.fahren({ dx: 1, dy: 0 }, DT);
    assert.ok(fz.f.x < 1200 && Math.abs(fz.v) < 1, `${art}: mittig steht (${fz.f.x.toFixed(0)}, v ${fz.v.toFixed(1)})`);
    const hb = fz.m.breite / 2, r2 = raum({}, mitPfahl()), f2 = fahrzeug(art, r2, 1000, 409 + hb, 0);   // Pfahl-Feld 400…408, Wannenrand bei 409 (streift knapp)
    for (let t = 0; t < 6; t += DT) f2.fahren({ dx: 1, dy: 0 }, DT);
    assert.ok(f2.f.x > 1260, `${art}: Ecke gleitet vorbei (${f2.f.x.toFixed(0)})`);
  }
});

test('Abgleiten Auto: streifender Anstoß kostet wenig Leben, frontaler viel', () => {
  const schraeg = fahreGegen('pkw', 60 * GRAD, 8, { x: 1000, einst: { auto: { tempo: 80 } } }).fz;
  const frontal = fahreGegen('pkw', 0, 8, { x: 1000, einst: { auto: { tempo: 80 } } }).fz;
  const hpS = 100 - schraeg.raum.state.spieler.get('a').hp, hpF = 100 - frontal.raum.state.spieler.get('a').hp;
  assert.ok(hpF >= 40, `frontal 80 km/h: ${hpF}`);
  assert.ok(hpS < hpF / 2, `schräg weniger Schaden: ${hpS} vs ${hpF}`);
});

test('Freidrehen: steht das Fahrzeug längs an der Wand, darf es sich wegdrehen', () => {
  const r = raum({}, welt(true)), fz = fahrzeug('boxer', r, 0, 400, Math.PI / 2);
  // so nah wie möglich an die Wand schieben (Längsseite an der Wand)
  let x = WAND - 60; while (fz.frei(r.welt, x + 1, 400, Math.PI / 2)) x += 1;
  fz.f.x = x;
  for (let i = 0; i < 20; i++) fz.fahren({ dx: 0.5, dy: 0.86 }, DT);   // will nach rechts (zur Wand hin) eindrehen
  assert.ok(fz.f.richtung < Math.PI / 2 - 5 * GRAD, `gedreht: ${(fz.f.richtung / GRAD).toFixed(1)}°`);
  assert.ok(fz.frei(r.welt, fz.f.x, fz.f.y, fz.f.richtung));
});

// Straße waagrecht bei y = 12,5 Kacheln (400 px), Breite residential 5 m
const STRASSE = { vektor: { strassen: [{ t: 'residential', p: [2, 12.5, 58, 12.5] }, { t: 'residential', p: [30, 2, 30, 40] }, { t: 'footway', p: [2, 20, 58, 20] }] } };

test('Spurhilfe: Straßenrichtung aus den Straßenlinien (Kreuzung und Fußweg ohne Richtung), Kachelkarte als Ersatz', () => {
  const w = welt(false, STRASSE);
  assert.ok(Math.abs(strassenRichtung(w, 300, 400)) < 1e-9);
  assert.ok(Math.abs(strassenRichtung(w, 300, 412) ?? 9) < 1e-9, 'am Rand der Fahrbahn');
  assert.equal(strassenRichtung(w, 300, 460), null, 'neben der Straße');
  assert.ok(Math.abs(strassenRichtung(w, 30 * KACHEL, 700) - Math.PI / 2) < 1e-9, 'senkrechte Straße');
  assert.equal(strassenRichtung(w, 30 * KACHEL, 400), null, 'Kreuzung');
  assert.equal(strassenRichtung(w, 300, 640), null, 'Fußweg');
  assert.equal(richtungsRaster([]).size, 0);
  // Kachelkarte: Straßenreihe ky = 5
  const kw = { hole: (x, y) => (y === 5 ? T.STRASSE : T.WIESE) };
  assert.equal(strassenRichtung(kw, 10 * KACHEL + 3, 5 * KACHEL + 10), 0);
  assert.equal(strassenRichtung(kw, 10 * KACHEL, 7 * KACHEL), null);
});

function spurFahrt(art, stick, spurhilfe, sek = 4) {
  const r = raum({ auto: { tempo: 50, spurhilfe }, bundeswehr: { boxerTempo: 50 } }, welt(false, STRASSE)), fz = fahrzeug(art, r, 100, 400, 0);
  fz.v = fz.fahrwerk().vmax * 0.8;
  for (let t = 0; t < sek; t += DT) fz.fahren({ dx: Math.cos(stick), dy: Math.sin(stick) }, DT);
  return fz;
}

test('Spurhilfe: leicht schräger Stick auf der Straße → fährt die Straße entlang; abschaltbar; deutlich schräg verlässt man die Straße', () => {
  for (const art of ['pkw', 'boxer']) {
    const an = spurFahrt(art, 7 * GRAD, true, 3), aus = spurFahrt(art, 7 * GRAD, false, 3);
    assert.ok(Math.abs(an.f.richtung) < 2 * GRAD, `${art}: Spurhilfe an, Richtung ${(an.f.richtung / GRAD).toFixed(2)}°`);
    assert.ok(an.spur, `${art}: Spurhilfe aktiv`);
    assert.ok(aus.f.richtung > 3 * GRAD, `${art}: Spurhilfe aus, Richtung ${(aus.f.richtung / GRAD).toFixed(2)}°`);
    assert.ok(Math.abs(an.f.y - 400) < Math.abs(aus.f.y - 400), `${art}: bleibt näher an der Straßenmitte`);
    const quer = spurFahrt(art, 35 * GRAD, true, 2);
    assert.ok(quer.f.richtung > 20 * GRAD, `${art}: 35° Stick biegt ab (${(quer.f.richtung / GRAD).toFixed(1)}°)`);
  }
});
