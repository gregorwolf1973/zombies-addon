// Autos mit Autoschlüssel (server/pkw.mjs, client/pkw.mjs): Tempo-Grenze, Aufprall-Schaden proportional zum Tempo, Mitfahrer (auch Bots),
// Zombies überfahren, Wrack bei 0 Lebenspunkten, gemeinsame Einstiegsregel Client/Server. Schnelle Simulation ohne Netz: ein kleiner
// Ersatz-Raum mit freiem Feinraster (eine Wand bei x = WAND), Takt 50 ms wie auf dem Server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREITE, HOEHE, FEIN, FEIN_PX, kmhZuPx } from '../client/welt.mjs';
import { FahrbarPkw, PkwVerwaltung, schluesselFund, kmhVon } from '../server/pkw.mjs';
import { PKW, PKW_VORGABE, crashAnteil, crashAutoSchaden, pkwEinsteigbar, pkwKontext, parkAutoBei, parkAutoWeg, parkWinkel } from '../client/pkw.mjs';
import { aufParkAuto } from '../client/fzkollision.mjs';

const DT = 0.05, WAND = 1700;
function welt(mitWand = true) {
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, fein = new Uint8Array(fb * fh);
  if (mitWand) { const wx = Math.floor(WAND / FEIN_PX); for (let y = 0; y < fh; y++) fein[y * fb + wx] = 1; }
  return { fein, behaelter: [] };
}
function raum(einst = {}, w = welt()) {
  const r = {
    welt: w, extra: new Map(), clients: [], gesendet: [],
    state: { spieler: new Map(), fahrzeuge: new Map(), zombies: new Map(), behaelter: new Map(), phase: 'spiel', besiegt: 0, seed: 7 },
    einstellungen: () => ({ zombieLeben: 100, funde: {}, ...einst, auto: { ...PKW_VORGABE, ...(einst.auto ?? {}) } }),
    rnd: Math.random, broadcast(typ, m) { this.gesendet.push([typ, m]); }, laerm() {},
    schaden(id, z, menge) { z.hp = Math.max(0, z.hp - menge); if (z.hp === 0) this.state.zombies.delete(id); },
    unsterblich: () => false, liegtAmBoden(p) { p.unten = true; },
    setzeInhalt(id, l) { this.state.behaelter.set(id, { rest: l.length }); },
    verkehr: { unfaelle: { liste: new Map() } },
  };
  r.fahrbare = { liste: [] };
  return r;
}
function spieler(r, sid, x, y, { schluessel = false, bot = false } = {}) {
  const p = { x, y, richtung: 0, hp: 100, ebene: '', rucksack: schluessel ? ['autoschluessel'] : [], anBord: false, imBoxer: false, unten: false, zombie: 0, kamera: false, verbunden: true, name: sid };
  r.state.spieler.set(sid, p); r.extra.set(sid, bot ? { bot: {} } : {});
  return p;
}
function auto(r, x = 300, y = 400, w = 0) {
  const fz = new FahrbarPkw(r, 'b1');
  const f = fz.aufstellen(x, y, w); f.leben = 100;
  r.fahrbare.liste.push(fz);
  return fz;
}
// so lange fahren (Fahrer drückt nach rechts), bis die Bedingung gilt; Rückgabe größtes Tempo
function fahre(r, fz, sek, bis = () => false, dx = 1) {
  let vmax = 0;
  for (let t = 0; t < sek; t += DT) { fz.fahrerEingabe(fz.fahrer, { dx, dy: 0 }); fz.schritt(DT); vmax = Math.max(vmax, Math.abs(fz.v)); if (!fz.f || bis()) break; }
  return vmax;
}

test('Regeln: Aufprall ab 20 km/h, 50 % bei 80 km/h, linear; Autoschaden ebenso', () => {
  assert.equal(crashAnteil(15), 0);
  assert.equal(crashAnteil(20), 0);
  assert.ok(Math.abs(crashAnteil(80) - 0.5) < 1e-9);
  assert.ok(Math.abs(crashAnteil(50) - 0.25) < 1e-9);
  assert.ok(crashAnteil(100) > 0.5 && crashAnteil(400) <= 1);
  assert.equal(crashAutoSchaden(10), 0);
  assert.ok(Math.abs(crashAutoSchaden(80) - PKW_VORGABE.crashAuto) < 1e-9);
  assert.ok(Math.abs(crashAnteil(80, { crashAb: 20, crashSchaden: 30 }) - 0.3) < 1e-9, 'Einstellung wirkt');
  assert.equal(PKW_VORGABE.tempo, 80);
});

test('Einsteigen nur mit Schlüssel; Mitfahrer ohne Schlüssel, solange jemand mit Schlüssel fährt; Plätze begrenzt', () => {
  const r = raum(), fz = auto(r);
  const ohne = spieler(r, 'ohne', 300, 400 + PKW.breite / 2 + 8), mit = spieler(r, 'mit', 300, 400 - PKW.breite / 2 - 8, { schluessel: true });
  assert.ok(!fz.einsteigen('ohne'), 'ohne Schlüssel in ein leeres Auto');
  assert.ok(fz.einsteigen('mit') && mit.imBoxer && mit.anBord);
  assert.equal(fz.fahrer, 'mit');
  assert.ok(fz.einsteigen('ohne'), 'Mitfahrer braucht keinen Schlüssel');
  assert.equal(fz.fahrer, 'mit', 'Mitfahrer fährt nicht');
  for (const n of ['c', 'd', 'e']) spieler(r, n, 300, 400 + PKW.breite / 2 + 6);
  assert.ok(fz.einsteigen('c') && fz.einsteigen('d'));
  assert.ok(!fz.einsteigen('e'), 'mehr als 4 Plätze');
  assert.ok(!fz.einsteigen('weit') && !spieler(r, 'fern', 300, 480, { schluessel: true }).imBoxer);
  // Fahrer steigt aus: niemand mit Schlüssel am Steuer, das Auto rollt aus
  fz.aussteigen('mit');
  assert.ok(!mit.imBoxer && !mit.anBord);
  assert.equal(fz.fahrer, null);
  // gemeinsame Regel (Server = Client)
  assert.equal(pkwEinsteigbar([], false, 4), false);
  assert.equal(pkwEinsteigbar([], true, 4), true);
  assert.equal(pkwEinsteigbar([{ schluessel: true, bot: false }], false, 4), true);
  assert.equal(pkwEinsteigbar([{ schluessel: true, bot: true }], false, 4), false, 'ein Bot fährt nie');
  assert.equal(pkwEinsteigbar(Array(4).fill({ schluessel: true }), true, 4), false);
});

test('Höchsttempo 80 km/h (Backend-Wert), Einstellung auto.tempo wirkt', () => {
  for (const kmh of [80, 50]) {
    const r = raum({ auto: { tempo: kmh } }, welt(false)), fz = auto(r, 200, 400);
    spieler(r, 'a', 200, 400 - 16, { schluessel: true });
    assert.ok(fz.einsteigen('a'));
    const vmax = fahre(r, fz, 8);
    assert.ok(Math.abs(fz.fahrwerk().vmax - kmhZuPx(kmh)) < 1e-9);
    assert.ok(vmax > kmhZuPx(kmh) * 0.97 && vmax <= kmhZuPx(kmh) + 1e-6, `${kmh}: ${kmhVon(vmax)} km/h`);
  }
});

test('Aufprall: Fahrer und Mitfahrer verlieren Leben je nach Tempo (80 km/h ≈ 50 %, 50 km/h ≈ 25 %, langsam nichts), das Auto Lebenspunkte', () => {
  const ergebnis = {};
  for (const kmh of [80, 50, 15]) {
    const r = raum({ auto: { tempo: kmh } }), fz = auto(r, 1000, 400);
    const a = spieler(r, 'a', 1000, 384, { schluessel: true }), b = spieler(r, 'b', 1000, 416);
    assert.ok(fz.einsteigen('a') && fz.einsteigen('b'));
    fahre(r, fz, 40, () => fz.v === 0 && fz.f.x > 1100);
    assert.ok(fz.f.x < WAND && fz.f.x > WAND - 40, 'steht vor der Wand ' + fz.f.x);
    ergebnis[kmh] = { a: 100 - a.hp, b: 100 - b.hp, auto: fz.lebenMax - fz.leben };
  }
  assert.ok(Math.abs(ergebnis[80].a - 50) <= 4 && ergebnis[80].a === ergebnis[80].b, JSON.stringify(ergebnis));
  assert.ok(Math.abs(ergebnis[50].a - 25) <= 4 && ergebnis[50].a === ergebnis[50].b, JSON.stringify(ergebnis));
  assert.equal(ergebnis[15].a, 0); assert.equal(ergebnis[15].auto, 0);
  assert.ok(ergebnis[80].auto > ergebnis[50].auto && ergebnis[50].auto > 0);
});

test('Zombies überfahren: schnell = tot, langsam = verletzt und weggeschleudert; das Auto nimmt Schaden', () => {
  for (const [kmh, tot] of [[60, true], [12, false]]) {
    const r = raum({ auto: { tempo: kmh } }, welt(false)), fz = auto(r, 200, 400);
    spieler(r, 'a', 200, 384, { schluessel: true }); fz.einsteigen('a');
    fahre(r, fz, 10, () => fz.v >= kmhZuPx(kmh) - 0.01);   // auf Tempo
    const z = { x: fz.f.x + 60, y: 400, hp: 100, ebene: '', richtung: 0 };
    r.state.zombies.set('z1', z);
    const vorher = fz.leben;
    fahre(r, fz, 4, () => !r.state.zombies.has('z1') || z.hp < 100);
    if (tot) assert.ok(!r.state.zombies.has('z1'), 'Zombie lebt noch bei ' + kmh);
    else { assert.ok(r.state.zombies.has('z1') && z.hp < 100 && z.hp > 0, 'langsam: verletzt ' + z.hp); assert.ok(Math.abs(z.y - 400) > 4, 'nicht weggeschleudert'); }
    assert.ok(fz.leben < vorher, 'Auto ohne Schaden');
    assert.ok(r.gesendet.some(([t]) => t === 'aufprall'));
  }
});

test('Lebenspunkte aufgebraucht: alle steigen aus, Wrack raucht und brennt (Unfall-Ablauf), Auto ist nicht mehr fahrbar', () => {
  const r = raum({ auto: { leben: 10 } }), fz = auto(r, 1400, 400);
  const a = spieler(r, 'a', 1400, 384, { schluessel: true }), b = spieler(r, 'b', 1400, 416);
  fz.einsteigen('a'); fz.einsteigen('b');
  const id = fz.id, f = fz.f;
  fahre(r, fz, 20, () => !fz.f);
  assert.equal(fz.f, null);
  assert.ok(!a.imBoxer && !b.imBoxer && !a.anBord && !b.anBord, 'Insassen sitzen noch');
  assert.equal(f.art, 'wrack'); assert.ok(f.rauch && f.haelt);
  assert.ok(r.verkehr.unfaelle.liste.has(id), 'kein Brand-Ablauf');
  assert.ok(!r.fahrbare.liste.includes(fz));
});

test('Bots steigen zu, wenn ein Mensch im stehenden Auto sitzt, und wieder aus, wenn er aussteigt', () => {
  const r = raum(), fz = auto(r);
  spieler(r, 'a', 300, 384, { schluessel: true });
  const bot = spieler(r, 'bot', 300, 470, { bot: true }), weit = spieler(r, 'bot2', 300, 700, { bot: true });
  assert.ok(!fz.einsteigen('bot'), 'Bots steigen nicht selbst per Taste ein');
  fz.einsteigen('a');
  fz.schritt(DT);
  assert.ok(bot.imBoxer && bot.anBord && fz.sitzt('bot'), 'Bot steigt nicht zu');
  assert.ok(!weit.imBoxer, 'ferner Bot steigt zu');
  fz.aussteigen('a');
  fz.botUhr = 0; fz.schritt(DT);
  assert.ok(!bot.imBoxer && !fz.sitzt('bot'), 'Bot bleibt allein sitzen');
});

test('Gleichlauf Client/Server: gleiche Einstiegs-Entscheidung am geparkten Auto, gleicher Kletter-Index nach dem Wegfahren', () => {
  const w1 = welt(false), w2 = welt(false);
  const b = { id: 'b9', art: 'auto', x: 500, y: 300, winkel: 0, farbe: 2 };
  w1.behaelter.push({ ...b }); w2.behaelter.push({ ...b });
  const r = raum({}, w1), v = new PkwVerwaltung(r);
  r.fahrbare = { liste: [] };
  const sClient = { fahrzeuge: new Map(), spieler: new Map(), behaelter: new Map(), verbrannt: new Map(), platt: new Map() };
  const richtung = f => f.richtung ?? 0;
  for (const [dx, dy, schl] of [[0, 14, true], [0, 14, false], [0, 40, true], [24, 0, true], [-30, 0, true], [0, -15, true]]) {
    const p = spieler(r, 's' + dx + dy + schl, b.x + dx, b.y + dy, { schluessel: schl });
    const client = !!pkwKontext(w2, sClient, p, p.x, p.y, richtung);
    assert.equal(!!v.amParkAuto(p) && schl, client, `Position ${dx},${dy} Schlüssel ${schl}`);
  }
  assert.ok(aufParkAuto(w1, b.x, b.y, 2) && aufParkAuto(w2, b.x, b.y, 2));
  const p = spieler(r, 'fahrer', b.x, b.y + 14, { schluessel: true });
  r.extra.get('fahrer').bot = undefined;
  assert.ok(v.einsteigen('fahrer'), 'Server: einsteigen');
  parkAutoWeg(w2, 'b9');   // Client nach der Nachricht 'autosWeg'
  for (const [x, y] of [[b.x, b.y], [b.x + 10, b.y + 4], [b.x - 17, b.y]]) assert.equal(aufParkAuto(w1, x, y, 2), aufParkAuto(w2, x, y, 2));
  assert.ok(!aufParkAuto(w2, b.x, b.y, 2), 'Client klettert noch');
  assert.ok(w1.autosWeg.has('b9') && w2.autosWeg.has('b9'));
  assert.equal(parkAutoBei(w2, sClient, b.x, b.y + 14), null, 'weggefahrenes Auto bietet sich noch an');
  assert.equal(r.fahrbare.liste[0].f.richtung, parkWinkel(b));
  assert.ok(p.imBoxer && r.state.behaelter.get('b9')?.rest === 0, 'Kofferraum des weggefahrenen Autos nicht leer');
  assert.deepEqual(r.gesendet.find(([t]) => t === 'autosWeg')?.[1]?.ids, ['b9']);
});

test('Schlüssel-Funde: Möbel, Kofferraum, Leiche nach Backend-Wert; Fundhäufigkeit 0 schaltet ab', () => {
  const r = raum({ auto: { schluesselMoebel: 100, schluesselKofferraum: 0, schluesselLeiche: 100 } });
  assert.deepEqual(schluesselFund(r, 'moebel', 'schrank'), ['autoschluessel']);
  assert.deepEqual(schluesselFund(r, 'moebel', 'kuehlschrank'), [], 'Kühlschrank hat keine Autoschlüssel');
  assert.deepEqual(schluesselFund(r, 'kofferraum'), []);
  assert.deepEqual(schluesselFund(r, 'leiche'), ['autoschluessel']);
  const r0 = raum({ funde: { autoschluessel: 0 }, auto: { schluesselLeiche: 100 } });
  assert.deepEqual(schluesselFund(r0, 'leiche'), []);
  // Vorgabe: etwa 20 % je Kofferraum
  const rv = raum();
  let n = 0; for (let i = 0; i < 4000; i++) n += schluesselFund(rv, 'kofferraum').length;
  assert.ok(n > 650 && n < 950, 'Kofferraum-Anteil ' + n / 4000);
});

test('Superuser-Fahrzeug neben einem gefahrenen Auto setzen: kein Absturz (Auto hat keine FAHRBAR-Maße)', async () => {
  const { Fahrbare } = await import('../server/fahrbar.mjs');
  const r = raum({}, welt(false));
  r.fahrbare = new Fahrbare(r); r.boxer = null;
  const fz = new FahrbarPkw(r, 'b5'); fz.aufstellen(600, 400, 0); r.fahrbare.liste.push(fz);
  const p = spieler(r, 'su', 600, 430);
  const b = r.fahrbare.setzen('su', 'puma', p);
  assert.ok(b && b.art === 'puma', 'Puma nicht gesetzt');
  assert.ok(Math.hypot(b.f.x - 600, b.f.y - 400) > 20, 'Puma steht im Auto');
});
