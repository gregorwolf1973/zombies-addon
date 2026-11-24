// Fahrbare Fahrzeuge: Rückwärtsgang (Eingabe > 135° hinter der Achse, gespiegelte Lenkung, 1/3 Tempo, PC-Tasten) und Hindernisse
// (client/walze.mjs, server/walze.mjs): Zäune/Hecken plattwalzen (dauerhaft, Lücke für alle, Client wendet dieselbe Änderung an),
// Mauern blockieren, Bäume blockieren Puma/Boxer, der Leopard walzt kleine Bäume um, parkende Autos: Leopard platt, Puma 40 %, Boxer 30 %.
// Schnelle Simulation mit Ersatz-Raum (kein Netz), Takt 50 ms wie auf dem Server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREITE, HOEHE, FEIN, FEIN_PX, KACHEL, T, kmhZuPx, frei } from '../client/welt.mjs';
import { KLASSEN } from '../server/fahrbar.mjs';
import { Walze } from '../server/walze.mjs';
import { FAHRBAR } from '../client/fahrbar.mjs';
import { rueckwaerts, tastenFahrzeug, walzeAnwenden, stammBei, WALZE, RUECK_ANTEIL } from '../client/walze.mjs';
import { plattLesen } from '../client/b11_platt.mjs';

const DT = 0.05, fb = BREITE * FEIN;
function welt() {
  const kacheln = new Uint8Array(BREITE * HOEHE);
  const w = { fein: new Uint8Array(fb * HOEHE * FEIN), kacheln, behaelter: [], details: { zaunart: Array(BREITE * HOEHE).fill('') } };
  w.hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? kacheln[y * BREITE + x] : T.ZAUN;
  return w;
}
// senkrechte Zaunlinie bei x (px) von y0 bis y1, Art a ('z' Holz, 'h' Hecke, 'w' Mauer); Kacheln darunter werden Zaunkacheln
function zaun(w, x, y0, y1, a = 'z') {
  const fx = Math.floor(x / FEIN_PX);
  for (let y = y0; y <= y1; y += FEIN_PX) for (const dx of [0, 1]) {
    const fy = Math.floor(y / FEIN_PX), i = fy * fb + fx + dx;
    w.fein[i] = 2;
    const t = Math.floor(fy / FEIN) * BREITE + Math.floor((fx + dx) / FEIN);
    w.kacheln[t] = T.ZAUN; w.details.zaunart[t] = a;
  }
}
function raum(w = welt()) {
  const r = {
    welt: w, extra: new Map([['a', {}]]), clients: [], gesendet: [],
    state: { spieler: new Map(), fahrzeuge: new Map(), zombies: new Map(), platt: new Map(), verbrannt: new Map(), behaelter: new Map(), phase: 'spiel', besiegt: 0, seed: 3, takt: 0 },
    einstellungen: () => ({ bundeswehr: {} }), rnd: Math.random, broadcast(t, m) { this.gesendet.push([t, m]); }, laerm() {},
    setzeInhalt(id, l) { this.state.behaelter.set(id, { rest: l.length }); },
  };
  r.walze = new Walze(r);
  return r;
}
function fahrzeug(r, art, x, y, w = 0) {
  const fz = new KLASSEN[art](r, { id: 'fz' });
  fz.aufstellen(x, y, w);
  fz.schiessen = () => {};   // Turmwaffen sind hier nicht Thema
  const p = { x, y, hp: 100, anBord: true, imBoxer: true, verbunden: true, ebene: '' };
  r.state.spieler.set('a', p); fz.insassen = ['a'];
  return fz;
}
function fahre(fz, sek, e, bis = () => false) {
  let vmin = 0, vmax = 0;
  for (let t = 0; t < sek; t += DT) { fz.fahrerEingabe('a', e); fz.schritt(DT); vmin = Math.min(vmin, fz.v); vmax = Math.max(vmax, fz.v); if (bis()) break; }
  return { vmin, vmax };
}

test('Rückwärtsgang: Regel per Skalarprodukt, PC-Tasten (W/S/A/D) ergeben dieselbe Entscheidung wie der Stick', () => {
  assert.equal(rueckwaerts(-1), true);
  assert.equal(rueckwaerts(-0.75), true, '> 135° hinten');
  assert.equal(rueckwaerts(-0.6), false, '127° → noch vorwärts (wenden)');
  assert.equal(rueckwaerts(-0.6, -10), true, 'schon rückwärts unterwegs: bleibt im Rückwärtsgang');
  assert.equal(rueckwaerts(0.2, -10), false);
  for (const w of [0, 0.7, 2, -2.5]) {
    const dot = ({ dx, dy }) => dx * Math.cos(w) + dy * Math.sin(w);
    assert.equal(rueckwaerts(dot(tastenFahrzeug(-1, 0, w))), true, 'S = rückwärts');
    assert.equal(rueckwaerts(dot(tastenFahrzeug(-1, 1, w))), true, 'S+D = rückwärts');
    assert.equal(rueckwaerts(dot(tastenFahrzeug(-1, -1, w))), true, 'S+A = rückwärts');
    assert.equal(rueckwaerts(dot(tastenFahrzeug(1, -1, w))), false, 'W+A = vorwärts');
    assert.equal(rueckwaerts(dot(tastenFahrzeug(0, 1, w))), false, 'D = vorwärts einlenken');
  }
  assert.ok(Math.abs(RUECK_ANTEIL - 1 / 3) < 1e-9);
});

for (const art of ['boxer', 'puma', 'leopard']) {
  test(`${art}: Eingabe nach hinten → fährt rückwärts statt zu wenden (höchstens 1/3 Tempo), Lenkung gespiegelt`, () => {
    const r = raum(), fz = fahrzeug(r, art, 1000, 700, 0);
    const vm = fz.fahrwerk().vmax;
    const { vmin } = fahre(fz, 6, { dx: -1, dy: 0 });
    assert.ok(fz.f.x < 1000 - 40, 'nicht rückwärts gefahren');
    assert.ok(Math.abs(fz.f.richtung) < 0.01, 'hat gewendet: ' + fz.f.richtung);
    assert.ok(vmin < -vm * RUECK_ANTEIL * 0.95 && vmin >= -vm * RUECK_ANTEIL - 1e-6, 'Rückwärtstempo ' + vmin / vm);
    // nach hinten links (Stick): das Heck dreht dorthin, die Nase also nach rechts (Rückwärtsgang)
    const a = 0.25 * Math.PI;   // Eingabe: 180° - 45° = hinten oben (y nach unten: oben = negative y)
    fahre(fz, 2.5, { dx: -Math.cos(a), dy: -Math.sin(a) });
    assert.ok(fz.v < 0, 'nicht mehr rückwärts');
    assert.ok(fz.f.richtung > 0.2, 'Lenkung nicht gespiegelt: ' + fz.f.richtung);
    // 120° hinten: kein Rückwärtsgang, das Fahrzeug wendet vorwärts
    const r2 = raum(), f2 = fahrzeug(r2, art, 1000, 700, 0);
    const b = 2 * Math.PI / 3;
    const { vmin: v2 } = fahre(f2, 3, { dx: Math.cos(b), dy: Math.sin(b) });
    assert.ok(v2 >= 0 && f2.f.richtung > 0.5, 'bei 120° rückwärts statt wenden');
  });
}

for (const art of ['boxer', 'puma', 'leopard']) {
  test(`${art}: walzt Holzzaun und Hecke platt (dauerhaft, Kachel offen, Client gleich), Mauer blockiert`, () => {
    const w = welt(); zaun(w, 1100, 600, 800, 'z'); zaun(w, 1300, 600, 800, 'h'); zaun(w, 1500, 600, 800, 'w');
    const kopie = welt(); zaun(kopie, 1100, 600, 800, 'z'); zaun(kopie, 1300, 600, 800, 'h'); zaun(kopie, 1500, 600, 800, 'w');
    const r = raum(w), fz = fahrzeug(r, art, 1000, 700, 0);
    assert.ok(!frei(w, 1100, 700, 3) && !frei(w, 1300, 700, 3));
    fahre(fz, 15, { dx: 1, dy: 0 }, () => fz.v === 0 && fz.f.x > 1400);
    assert.ok(fz.f.x > 1400 && fz.f.x < 1500, 'nicht durch Zaun/Hecke oder durch die Mauer: ' + fz.f.x);
    assert.ok(frei(w, 1100, 700, 3) && frei(w, 1300, 700, 3), 'Lücke nicht offen');
    assert.ok(!frei(w, 1500, 700, 3), 'Mauer plattgewalzt');
    assert.ok(!frei(w, 1100, 620, 3), 'Zaun außerhalb der Spur weg');
    // Zaunkacheln ohne Restzaun sind im groben Raster offen (Wegsuche, Wegefeld), solche mit Rest bleiben Zaun
    let offen = 0;
    for (let ky = Math.floor(600 / KACHEL); ky <= Math.floor(800 / KACHEL); ky++) for (const kx of [Math.floor(1100 / KACHEL), Math.floor(1300 / KACHEL)]) {
      let rest = false;
      for (let dy = 0; dy < FEIN; dy++) for (let dx = 0; dx < FEIN; dx++) if (w.fein[(ky * FEIN + dy) * fb + kx * FEIN + dx]) rest = true;
      if (w.hole(kx, ky) === T.WIESE) offen++;
      assert.equal(w.hole(kx, ky) === T.ZAUN, rest, `Kachel ${kx},${ky}`);
    }
    if (art !== 'boxer') assert.ok(offen > 0, 'keine Zaunkachel geöffnet');
    // Client: gleiche Nachrichten anwenden → gleiches Feinraster
    for (const [typ, m] of r.gesendet) if (typ === 'walze') walzeAnwenden(kopie, m);
    assert.deepEqual([...kopie.fein], [...w.fein], 'Client-Feinraster weicht ab');
    assert.deepEqual([...kopie.kacheln], [...w.kacheln]);
    assert.ok(r.walze.liste().zaun.length > 0 && r.walze.liste().voll);
  });
}

test('Bäume: Puma und Boxer bleiben am Stamm stehen, der Leopard walzt kleine Bäume um, große blockieren auch ihn', () => {
  const mitBaum = d => { const w = welt(); w.baeumeEcht = [{ x: 1200, y: 700, d }]; w.kacheln[Math.floor(700 / KACHEL) * BREITE + Math.floor(1200 / KACHEL)] = T.BAUM; return w; };
  for (const art of ['boxer', 'puma']) {
    const r = raum(mitBaum(4)), fz = fahrzeug(r, art, 1000, 700, 0);
    assert.ok(stammBei(r.welt, 1200, 700, 1), 'Stamm fehlt');
    fahre(fz, 8, { dx: 1, dy: 0 }, () => fz.v === 0 && fz.f.x > 1050);
    assert.ok(fz.f.x < 1200 - FAHRBAR[art].laenge / 2, `${art} fährt durch den Baum`);
  }
  const r = raum(mitBaum(4)), fz = fahrzeug(r, 'leopard', 1000, 700, 0);
  fahre(fz, 8, { dx: 1, dy: 0 }, () => fz.f.x > 1300);
  assert.ok(fz.f.x > 1300, 'Leopard bleibt am kleinen Baum hängen');
  assert.ok(r.welt.baeumeWeg.size === 1 && r.gesendet.some(([t, m]) => t === 'walze' && m.baum.length));
  assert.equal(stammBei(r.welt, 1200, 700, 1), null, 'umgewalzter Baum blockiert noch');
  const r2 = raum(mitBaum(10)), f2 = fahrzeug(r2, 'leopard', 1000, 700, 0);
  fahre(f2, 8, { dx: 1, dy: 0 }, () => f2.v === 0 && f2.f.x > 1050);
  assert.ok(f2.f.x < 1200 - 20, 'Leopard walzt großen Baum um');
  assert.equal(WALZE.leopard.baumMax, 52);
});

test('Parkende Autos: Leopard drückt sie platt (Kofferraum leer), Puma fährt mit 40 %, Boxer mit 30 % Tempo darüber', () => {
  for (const [art, faktor] of [['puma', 0.4], ['boxer', 0.3]]) {
    const w = welt(); w.behaelter.push({ id: 'b1', art: 'auto', x: 1250, y: 700, winkel: Math.PI / 2, farbe: 1 });
    const r = raum(w), fz = fahrzeug(r, art, 1000, 700, 0), vm = fz.fahrwerk().vmax;
    let vUeber = 0, ueber = false;
    for (let t = 0; t < 12 && fz.f.x < 1450; t += DT) {
      fz.fahrerEingabe('a', { dx: 1, dy: 0 }); fz.schritt(DT);
      if (Math.abs(fz.f.x - 1250) < 4) { ueber = true; vUeber = Math.max(vUeber, fz.v); }
    }
    assert.ok(ueber && fz.f.x >= 1450, `${art} kommt nicht über das Auto`);
    assert.ok(vUeber <= vm * faktor + 1e-6 && vUeber > vm * faktor * 0.5, `${art} Tempo über dem Auto ${vUeber / vm}`);
    assert.ok(!r.state.platt.has('b1'));
  }
  const w = welt(); w.behaelter.push({ id: 'b1', art: 'auto', x: 1250, y: 700, winkel: Math.PI / 2, farbe: 1 });
  const r = raum(w), fz = fahrzeug(r, 'leopard', 1000, 700, 0);
  fahre(fz, 10, { dx: 1, dy: 0 }, () => fz.f.x > 1400);
  assert.ok(r.state.platt.has('b1'), 'Auto nicht platt');
  const { dx } = plattLesen(r.state.platt.get('b1'));
  assert.ok(dx > 0, 'nicht in Fahrtrichtung geschoben');
  assert.equal(r.state.behaelter.get('b1')?.rest, 0, 'Kofferraum nicht leer');
});
