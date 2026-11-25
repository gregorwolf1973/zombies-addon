// Gefahrenes Auto (server/pkw.mjs, server/walze.mjs): Zäune und Hecken werden plattgefahren wie bei den Panzern (Lücke bleibt offen, Client gleich),
// das Auto wird dabei deutlich langsamer (auto.zaunBremse) und verliert Lebenspunkte ∝ Tempo (auto.zaunSchaden bei 80 km/h); Mauern blockieren weiter.
// Schnelle Simulation mit Ersatz-Raum (kein Netz), Takt 50 ms wie auf dem Server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREITE, HOEHE, FEIN, FEIN_PX, KACHEL, T, frei } from '../client/welt.mjs';
import { FahrbarPkw, kmhVon, ZAUN_PAUSE } from '../server/pkw.mjs';
import { Walze } from '../server/walze.mjs';
import { PKW_VORGABE, zaunAutoSchaden, zaunTempoFaktor } from '../client/pkw.mjs';
import { walzeAnwenden, WALZE } from '../client/walze.mjs';
import { bereinigeAuto } from '../server/einstellungen.mjs';

const DT = 0.05, fb = BREITE * FEIN;
function welt() {
  const kacheln = new Uint8Array(BREITE * HOEHE);
  const w = { fein: new Uint8Array(fb * HOEHE * FEIN), kacheln, behaelter: [], details: { zaunart: Array(BREITE * HOEHE).fill('') } };
  w.hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? kacheln[y * BREITE + x] : T.ZAUN;
  return w;
}
// senkrechte Zaunlinie bei x (px) von y0 bis y1, Art a ('z' Holz, 'h' Hecke, 'w' Mauer), zwei Feinfelder breit wie in tests/walze.test.mjs
function zaun(w, x, y0, y1, a = 'z') {
  const fx = Math.floor(x / FEIN_PX);
  for (let y = y0; y <= y1; y += FEIN_PX) for (const dx of [0, 1]) {
    const fy = Math.floor(y / FEIN_PX), i = fy * fb + fx + dx;
    w.fein[i] = 2;
    const t = Math.floor(fy / FEIN) * BREITE + Math.floor((fx + dx) / FEIN);
    w.kacheln[t] = T.ZAUN; w.details.zaunart[t] = a;
  }
}
function raum(w, auto = {}) {
  const r = {
    welt: w, extra: new Map(), clients: [], gesendet: [],
    state: { spieler: new Map(), fahrzeuge: new Map(), zombies: new Map(), platt: new Map(), verbrannt: new Map(), behaelter: new Map(), phase: 'spiel', besiegt: 0, seed: 3, takt: 0 },
    einstellungen: () => ({ zombieLeben: 100, funde: {}, bundeswehr: {}, auto: { ...PKW_VORGABE, ...auto } }),
    rnd: () => 0.5, broadcast(t, m) { this.gesendet.push([t, m]); }, laerm() {},
    setzeInhalt(id, l) { this.state.behaelter.set(id, { rest: l.length }); },
    unsterblich: () => false, liegtAmBoden(p) { p.unten = true; }, verkehr: { unfaelle: { liste: new Map() } },
  };
  r.walze = new Walze(r);
  r.fahrbare = { liste: [] };
  return r;
}
function auto(r, x, y) {
  const fz = new FahrbarPkw(r, 'b1');
  fz.aufstellen(x, y, 0).leben = 100;
  r.fahrbare.liste.push(fz);
  const p = { x, y, richtung: 0, hp: 100, ebene: '', rucksack: ['autoschluessel'], anBord: false, imBoxer: false, unten: false, zombie: 0, kamera: false, verbunden: true, name: 'f' };
  r.state.spieler.set('f', p); r.extra.set('f', {});
  fz.zusteigen('f');
  return fz;
}
// Gas geben (nach rechts) bis zur Bedingung; Rückgabe: Tempo-Verlauf [x, v] je Takt
function fahre(fz, sek, bis = () => false) {
  const verlauf = [];
  for (let t = 0; t < sek && fz.f; t += DT) { fz.fahrerEingabe('f', { dx: 1, dy: 0 }); fz.schritt(DT); if (fz.f) verlauf.push([fz.f.x, fz.v]); if (bis()) break; }
  return verlauf;
}

test('Regeln: Schaden ∝ Tempo (zaunSchaden bei 80 km/h), Tempo-Faktor aus zaunBremse, Einstellungen mit Vorgaben und Grenzen', () => {
  assert.equal(PKW_VORGABE.zaunBremse, 40); assert.equal(PKW_VORGABE.zaunSchaden, 15);
  assert.ok(Math.abs(zaunAutoSchaden(80) - 15) < 1e-9 && Math.abs(zaunAutoSchaden(40) - 7.5) < 1e-9 && zaunAutoSchaden(0) === 0);
  assert.ok(Math.abs(zaunTempoFaktor() - 0.6) < 1e-9 && zaunTempoFaktor({ zaunBremse: 0 }) === 1);
  const v = bereinigeAuto({});
  assert.equal(v.zaunBremse, 40); assert.equal(v.zaunSchaden, 15);
  const g = bereinigeAuto({ zaunBremse: 500, zaunSchaden: -3 });
  assert.equal(g.zaunBremse, 90, 'höchstens 90 % Tempoverlust'); assert.equal(g.zaunSchaden, 0);
  assert.deepEqual(WALZE.pkw, { zaun: true, auto: 1, baumMax: 0 });
});

test('Auto fährt durch Holzzaun und Hecke: beide platt (Lücke offen, Client gleich), deutlich langsamer, Lebenspunkte ∝ Tempo; Mauer blockiert (Aufprall)', () => {
  const w = welt(); zaun(w, 1300, 600, 800, 'z'); zaun(w, 1600, 600, 800, 'h'); zaun(w, 1900, 600, 800, 'w');
  const kopie = welt(); zaun(kopie, 1300, 600, 800, 'z'); zaun(kopie, 1600, 600, 800, 'h'); zaun(kopie, 1900, 600, 800, 'w');
  const r = raum(w), fz = auto(r, 900, 700);
  const leben0 = fz.leben;
  const verlauf = fahre(fz, 20, () => fz.v === 0 && fz.f.x > 1700);
  assert.ok(fz.f && fz.f.x > 1700 && fz.f.x < 1900, 'durch Zaun und Hecke, aber nicht durch die Mauer: ' + fz.f?.x);
  assert.ok(frei(w, 1300, 700, 3) && frei(w, 1600, 700, 3), 'Lücken nicht offen');
  assert.ok(!frei(w, 1900, 700, 3), 'Mauer plattgefahren');
  assert.ok(!frei(w, 1300, 620, 3), 'Zaun außerhalb der Spur weg');
  // vor und nach dem Zaun: Tempo bricht ein (mindestens um ein Drittel)
  const vor = Math.max(...verlauf.filter(([x]) => x < 1300 - 30 && x > 1150).map(([, v]) => v));
  const nach = Math.min(...verlauf.filter(([x]) => x > 1300 && x < 1340).map(([, v]) => v));
  assert.ok(nach < vor * 0.67, `nicht deutlich langsamer: ${kmhVon(vor).toFixed(0)} → ${kmhVon(nach).toFixed(0)} km/h`);
  // Lebenspunkte: zwei Durchbrüche (je ≤ zaunSchaden) plus Aufprall an der Mauer
  assert.ok(fz.leben < leben0, 'kein Schaden');
  assert.ok(r.gesendet.some(([t]) => t === 'krach'), 'kein Aufprall an der Mauer');
  for (const [typ, m] of r.gesendet) if (typ === 'walze') walzeAnwenden(kopie, m);
  assert.deepEqual([...kopie.fein], [...w.fein], 'Client-Feinraster weicht ab');
});

test('Schaden wächst mit dem Tempo; Pause zwischen zwei Durchbrüchen; Einstellungen wirken', () => {
  const schaden = (kmh, einst = {}) => {
    const w = welt(); zaun(w, 1000 + 120, 600, 800, 'h');
    const r = raum(w, { tempo: kmh, ...einst }), fz = auto(r, 700, 700);
    fahre(fz, 20, () => fz.f.x > 1200);
    return { lp: 100 - fz.leben, fz };
  };
  const langsam = schaden(20), schnell = schaden(80);
  assert.ok(langsam.lp > 0 && schnell.lp > langsam.lp * 2, `Schaden nicht ∝ Tempo: ${langsam.lp.toFixed(1)} / ${schnell.lp.toFixed(1)}`);
  assert.ok(schnell.lp <= 2 * PKW_VORGABE.zaunSchaden + 1e-6, 'zu viel Schaden für eine Hecke: ' + schnell.lp);
  assert.equal(schaden(80, { zaunSchaden: 0 }).lp, 0, 'zaunSchaden 0 wirkt nicht');
  // Pause: zwei Meldungen kurz nacheinander zählen einmal
  const w = welt(), r = raum(w), fz = auto(r, 700, 700);
  fz.v = 100; fz.uhr = 5;
  fz.gewalzt(3); const lp1 = fz.leben, v1 = fz.v;
  fz.gewalzt(3);
  assert.equal(fz.leben, lp1, 'innerhalb der Pause erneut Schaden'); assert.equal(fz.v, v1);
  fz.uhr += ZAUN_PAUSE + 0.01; fz.gewalzt(3);
  assert.ok(fz.leben < lp1 && fz.v < v1);
});
