// Fahrzeuge und Helden: über stehende/geparkte Autos klettern (20 % Tempo), fahrende Fahrzeuge blockieren und stoßen (Taumeln, leichter Schaden,
// nie tödlich); Server und Client-Vorhersage rechnen mit denselben Funktionen (client/fzkollision.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { setzeKartengroesse, frei, bewege, WERTE as W } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { fzRechtecke, autoTempo, bewegeFz, AUTO_KLETTERN, STOSS_TAUMEL_FAKTOR } from '../client/fzkollision.mjs';
import { Fahrzeug } from '../server/verkehr.mjs';
import { freierPort } from './hilfe.mjs';
let fahrzeugZaehler = 0;

let server;
const PORT = await freierPort();
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(name = 'Kontakt') {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  for (const id of [...raum.state.fahrzeuge.keys()]) { raum.state.fahrzeuge.delete(id); raum.verkehr.info.delete(id); }
  raum.kriecherChance = 0;
  for (const z of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(z); raum.zombieInfo.delete(z); }
  const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  return { c, raum, p, x };
}

// freie Fläche (±70 px) in der Welt suchen
function freiePlatz(w) {
  for (let y = 150; y < 1400; y += 40) for (let x = 150; x < 1400; x += 40) {
    let ok = true;
    for (let dy = -70; dy <= 70 && ok; dy += 14) for (let dx = -70; dx <= 70; dx += 14) if (!frei(w, x + dx, y + dy, 8)) { ok = false; break; }
    if (ok) return { x, y };
  }
  throw new Error('keine freie Fläche');
}
function aufstellen(raum, p, x, ort) {
  raum.welt.behaelter = (raum.welt.behaelter ?? []).filter(b => b.art !== 'auto');
  raum.welt._parkIdx = undefined;
  p.x = ort.x; p.y = ort.y; p.ebene = ''; p.unten = false; p.zombie = 0; p.sicher = ''; p.hp = 100; p.anBord = false; p.imBoxer = false;
  x.warte = null; x.bot = false; x.taumelT = 0; x.kontaktT = 0; x.stoss = null; x.sprungT = 0;
}
function fahrzeug(raum, art, fx, fy, richtung, haelt) {
  const id = "T" + (fahrzeugZaehler++), fz = new Fahrzeug();
  fz.x = fx; fz.y = fy; fz.richtung = richtung; fz.art = art; fz.haelt = haelt; fz.farbe = 0;
  raum.state.fahrzeuge.set(id, fz);
  return fz;
}

test('Parkendes Auto: darüber klettern mit 20 % Tempo statt Durchlaufen', async () => {
  const { c, raum, p, x } = await beitreten();
  try {
    const ort = freiePlatz(raum.welt);
    aufstellen(raum, p, x, { x: ort.x - 60, y: ort.y });
    raum.welt.behaelter.push({ id: 'bT', art: 'auto', x: ort.x, y: ort.y, winkel: 0, farbe: 0 });
    raum.welt._parkIdx = undefined;
    x.eingabe = { dx: 1, dy: 0, s: false };
    const schritte = [];
    for (let i = 0; i < 200; i++) { const x0 = p.x; raum.kontakt.schritt(0.05); raum.spielerSchritt(c.sessionId, p, x, 0.05); schritte.push([p.x, p.x - x0]); }
    const vor = schritte[1][1];                                          // freier Schritt
    const drauf = schritte.filter(([px]) => px > ort.x - 18 - 6 && px < ort.x + 18 - 6).map(s => s[1]);   // Kreis (Radius ~6) liegt auf dem Auto
    assert.ok(vor > 1, 'freier Lauf: ' + vor);
    assert.ok(drauf.length >= 6, 'war auf dem Auto: ' + drauf.length);
    const mittel = drauf.slice(1, -1).reduce((a, b) => a + b, 0) / (drauf.length - 2);
    assert.ok(Math.abs(mittel / vor - AUTO_KLETTERN) < 0.04, `Tempo auf dem Auto ${mittel} statt ${vor * AUTO_KLETTERN}`);
    assert.ok(p.x > ort.x + 30, 'läuft danach wieder frei weiter und kommt hinüber: ' + p.x);
    // Zombie: ebenfalls langsam über das parkende Auto
    const zf = { x: ort.x - 10, y: ort.y, ebene: '', jagt: true }, z0 = { x: ort.x - 60, y: ort.y, ebene: '', jagt: true };
    raum.zombieGehen(zf, 0, 4, 0.05); raum.zombieGehen(z0, 0, 4, 0.05);
    assert.ok(Math.abs((zf.x - (ort.x - 10)) / (z0.x - (ort.x - 60)) - AUTO_KLETTERN) < 0.05, 'Zombie auf dem Auto langsam');
  } finally { await c.leave(); }
});

test('Stehendes Fahrzeug (haelt): klettern; fahrendes: blockiert, kein Durchlaufen; Vorhersage = Server', async () => {
  const { c, raum, p, x } = await beitreten('Block');
  try {
    const ort = freiePlatz(raum.welt);
    // stehend
    aufstellen(raum, p, x, { x: ort.x - 60, y: ort.y });
    const steh = fahrzeug(raum, 'auto', ort.x, ort.y, 0, true);
    x.eingabe = { dx: 1, dy: 0, s: false };
    let langsam = 0;
    for (let i = 0; i < 200; i++) { const x0 = p.x; raum.kontakt.schritt(0.05); raum.spielerSchritt(c.sessionId, p, x, 0.05); if (p.x > ort.x - 15 && p.x < ort.x + 10) langsam = Math.max(langsam, p.x - x0); }
    assert.ok(langsam > 0 && langsam < 0.6, 'auf dem stehenden Auto langsam: ' + langsam);
    assert.ok(p.x > ort.x + 20, 'hinüber gekommen');
    // fahrend: quer zur Laufrichtung (Fahrt nach +y), der Held läuft von der Seite hinein
    raum.state.fahrzeuge.delete([...raum.state.fahrzeuge.keys()][0]);
    aufstellen(raum, p, x, { x: ort.x - 50, y: ort.y });
    p.hp = 100;
    const fahr = fahrzeug(raum, 'auto', ort.x, ort.y - 400, Math.PI / 2, false);
    fahr.y = ort.y - 60; fahr.richtung = Math.PI / 2;
    // Fahrzeug bewegt sich 4 px je Tick (80 px/s = 36 km/h); der Held läuft quer vor/in die Flanke
    fahr.x = ort.x; fahr.y = ort.y - 60;
    x.eingabe = { dx: 1, dy: 0, s: false };
    let minAbstand = 1e9;
    for (let i = 0; i < 40; i++) {
      fahr.y += 4;
      raum.kontakt.schritt(0.05);
      raum.spielerSchritt(c.sessionId, p, x, 0.05);
      const q = fzRechtecke(raum.state.fahrzeuge).faehrt[0];
      const dx = p.x - q.x, dy = p.y - q.y, u = dx * q.c + dy * q.s, v = -dx * q.s + dy * q.c;
      minAbstand = Math.min(minAbstand, Math.max(Math.abs(u) - q.hl, Math.abs(v) - q.hb));
      if (x.taumelT > 0) break;
    }
    assert.ok(p.hp < 100 && p.hp >= 85, 'leichter Schaden 5–15 HP: ' + p.hp);
    assert.ok(x.taumelT > 0, 'taumelt');
    assert.ok(minAbstand > -1.5, 'kein Eindringen ins fahrende Fahrzeug: ' + minAbstand);
  } finally { await c.leave(); }
});

test('Fahrendes Fahrzeug fährt auf einen stehenden Helden: Stoß zur Seite, Schaden nach Tempo, nie tödlich, Pause', async () => {
  const { c, raum, p, x } = await beitreten('Stoss');
  try {
    const ort = freiePlatz(raum.welt);
    const SR = raum.constructor, alt = SR.einstellungen.fahrzeugStoss;
    SR.einstellungen.fahrzeugStoss = 15;
    const nachrichten = []; const altB = raum.broadcast.bind(raum); raum.broadcast = (typ, ...r) => { nachrichten.push(typ); return altB(typ, ...r); };
    const lauf = (tempo, hp0) => {
      aufstellen(raum, p, x, ort); p.hp = hp0; x.eingabe = { dx: 0, dy: 0, s: false };
      for (const k of [...raum.state.fahrzeuge.keys()]) raum.state.fahrzeuge.delete(k);
      raum.kontakt.alt.clear();
      const f = fahrzeug(raum, 'auto', ort.x - 60, ort.y + 3, 0, false);   // fährt in +x, trifft den Helden (y leicht versetzt = trifft auf Seite +y)
      let n = 0;
      for (let i = 0; i < 60 && !(x.taumelT > 0); i++, n++) { f.x += tempo * 0.05; raum.kontakt.schritt(0.05); raum.spielerSchritt(c.sessionId, p, x, 0.05); }
      const nachStoss = { x: p.x, y: p.y };
      for (let i = 0; i < 20; i++) { f.x += tempo * 0.05; raum.kontakt.schritt(0.05); raum.spielerSchritt(c.sessionId, p, x, 0.05); }
      return { hp: p.hp, vorher: nachStoss, nachher: { x: p.x, y: p.y }, taumel: x.taumelT };
    };
    const langsam = lauf(30, 100), schnell = lauf(110, 100);
    assert.ok(100 - langsam.hp >= 5 && 100 - langsam.hp <= 15, 'langsam: ' + (100 - langsam.hp));
    assert.ok(100 - schnell.hp === 15, 'schnell voller Schaden 15: ' + (100 - schnell.hp));
    assert.ok(100 - schnell.hp > 100 - langsam.hp, 'Schaden wächst mit dem Tempo');
    assert.ok(Math.abs(schnell.nachher.y - ort.y) > 8, 'zur Seite gestoßen (quer zur Fahrtrichtung): ' + (schnell.nachher.y - ort.y));
    assert.ok(Math.abs(schnell.nachher.y - ort.y) > Math.abs(schnell.nachher.x - ort.x) - 1, 'Stoß quer, nicht längs');
    assert.ok(nachrichten.includes('taumel') && nachrichten.includes('aufprall'), 'Meldungen für Ton/Wackeln');
    // nie tödlich
    const tot = lauf(110, 4);
    assert.ok(tot.hp >= 1 && !p.unten, 'kein Tod durch leichten Kontakt: ' + tot.hp);
    // Pause: kein zweiter Schaden unmittelbar danach
    aufstellen(raum, p, x, ort); p.hp = 100; x.eingabe = { dx: 0, dy: 0, s: false };
    x.taumelT = 0; x.kontaktT = 1;
    for (const k of [...raum.state.fahrzeuge.keys()]) raum.state.fahrzeuge.delete(k);
    const g = fahrzeug(raum, 'auto', ort.x - 5, ort.y, 0, false);
    raum.kontakt.alt.clear(); g.x += 6; raum.kontakt.schritt(0.05);
    assert.equal(p.hp, 100, 'in der Schutzzeit kein Schaden');
    // Einstellung 0 = kein Schaden (Stoß bleibt)
    SR.einstellungen.fahrzeugStoss = 0;
    const ohne = lauf(110, 100); assert.equal(ohne.hp, 100);
    SR.einstellungen.fahrzeugStoss = alt;
    raum.broadcast = altB;
  } finally { await c.leave(); }
});

test('Steuerung im Taumeln eingeschränkt; Vorhersage (gemeinsame Funktionen) = Server', async () => {
  const { c, raum, p, x } = await beitreten('Taumel');
  try {
    const ort = freiePlatz(raum.welt);
    aufstellen(raum, p, x, ort);
    x.eingabe = { dx: 0, dy: 1, s: false };
    const y0 = p.y;
    for (let i = 0; i < 10; i++) raum.spielerSchritt(c.sessionId, p, x, 0.05);
    const voll = p.y - y0;
    aufstellen(raum, p, x, ort); x.taumelT = 5;
    for (let i = 0; i < 10; i++) raum.spielerSchritt(c.sessionId, p, x, 0.05);
    const taumelnd = p.y - ort.y;
    assert.ok(Math.abs(taumelnd / voll - STOSS_TAUMEL_FAKTOR) < 0.03, `Taumeln ${taumelnd} statt ${voll * STOSS_TAUMEL_FAKTOR}`);
    // Vorhersage: derselbe Weg mit den gemeinsamen Funktionen (so rechnet schrittSim im Client) – über ein stehendes und gegen ein fahrendes Fahrzeug
    for (const [art, haelt] of [['auto', true], ['auto', false]]) {
      for (const k of [...raum.state.fahrzeuge.keys()]) raum.state.fahrzeuge.delete(k);
      aufstellen(raum, p, x, { x: ort.x - 60, y: ort.y });
      fahrzeug(raum, art, ort.x, ort.y, Math.PI / 2, haelt);
      raum.kontakt.alt.clear();
      const sim = { x: p.x, y: p.y }, tempo = W.tempoGehen;
      x.eingabe = { dx: 1, dy: 0, s: false };
      for (let i = 0; i < (haelt ? 180 : 40); i++) {
        raum.kontakt.schritt(0.05);
        raum.spielerSchritt(c.sessionId, p, x, 0.05);
        const fz = fzRechtecke(raum.state.fahrzeuge);
        const weg = tempo * 0.05 * autoTempo(raum.welt, fz, sim.x, sim.y, W.spielerRadius), n = Math.max(1, Math.ceil(weg / 4));
        for (let j = 0; j < n; j++) bewegeFz(bewege, raum.welt, sim, weg / n, 0, W.spielerRadius, fz);
        assert.ok(Math.hypot(sim.x - p.x, sim.y - p.y) < 4, `Vorhersage weicht ab (${art}, haelt=${haelt}) bei ${i}: ${sim.x} ${sim.y} / ${p.x} ${p.y}`);
      }
      if (!haelt) assert.ok(p.x < ort.x - 8, 'fahrendes Auto blockiert (kein Durchlaufen): ' + p.x);
      else assert.ok(p.x > ort.x + 10, 'stehendes Auto: hinüber');
    }
  } finally { await c.leave(); }
});

test('Einstellung fahrzeugStoss: Vorgabe 15, 0–100', () => {
  assert.equal(vorgaben().fahrzeugStoss, 15);
  assert.equal(bereinige({ fahrzeugStoss: 0 }, {}).fahrzeugStoss, 0);
  assert.equal(bereinige({ fahrzeugStoss: 40 }, {}).fahrzeugStoss, 40);
  assert.equal(bereinige({}, {}).fahrzeugStoss, 15);
});
