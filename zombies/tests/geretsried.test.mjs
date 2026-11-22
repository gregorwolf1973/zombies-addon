// Phase C: Geretsried aus OpenStreetMap
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { KACHEL, T, setzeKartengroesse, frei, findeWeg, seiteVon } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { baueInnenraum } from '../client/innen.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));

test('Geretsried: Karte, Safe Rooms, Häuser, Start und Ortsausgang', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  assert.ok(karte.quelle.includes('OpenStreetMap'));
  assert.equal(w.safeRooms.length, 4, 'Safe Rooms: ' + w.safeRooms.map(s => s.name));
  assert.ok(w.haeuser.filter(h => h.betretbar).length > 200);
  assert.ok(frei(w, w.start.x, w.start.y, 11), 'Start blockiert');
  assert.ok(w.behaelter.filter(b => b.art === 'auto').length >= 20, 'zu wenige Autos');
  // Wege: vom Start zu den Safe Rooms und zu Haustüren
  for (const s of w.safeRooms) assert.ok(findeWeg(w, w.start.x, w.start.y, (s.haus.tuer.x + 0.5) * KACHEL, (s.haus.tuer.y + 0.5) * KACHEL, 11, 60000), `${s.name} nicht erreichbar`);
  const tueren = w.haeuser.filter(h => h.betretbar).slice(0, 40);
  const erreicht = tueren.filter(h => findeWeg(w, w.start.x, w.start.y, (h.tuer.x + 0.5) * KACHEL, (h.tuer.y + 0.5) * KACHEL, 11, 60000)).length;
  assert.ok(erreicht >= 30, `nur ${erreicht}/40 Haustüren erreichbar`);
  // Innenräume aller Seiten
  for (const h of w.haeuser.filter(h => h.betretbar).slice(0, 12)) {
    const i = baueInnenraum(7, h.nr, 'eg', seiteVon(h));
    assert.equal(i.hole(i.ausgang.x, i.ausgang.y), T.AUSGANG);
  }
  setzeKartengroesse(64, 48);
});

test('Geretsried: Autos meist in Parkbuchten/auf Parkplätzen, Buchten frei, keine Überlappung', () => {
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  const autos = w.behaelter.filter(b => b.art === 'auto');
  const geordnet = autos.filter(b => b.platz === 'bucht' || b.platz === 'parkplatz').length;
  assert.ok(autos.every(b => ['bucht', 'parkplatz', 'rand'].includes(b.platz)), 'Auto ohne Platzart');
  assert.ok(geordnet >= autos.length * 0.8, `nur ${geordnet}/${autos.length} Autos in Buchten/auf Parkplätzen`);
  assert.ok(w.parkbuchten.length >= 20, 'zu wenige Parkbuchten');
  const OK = new Set([T.WIESE, T.STRASSE, T.PLATZ]);
  for (const b of w.parkbuchten) {
    for (const l of [-b.laenge / 2, 0, b.laenge / 2]) for (const q of [-b.tiefe / 2, 0, b.tiefe / 2]) {
      const px = b.x + b.ux * l - b.uy * q, py = b.y + b.uy * l + b.ux * q;
      assert.ok(OK.has(w.hole(Math.floor(px / KACHEL), Math.floor(py / KACHEL))), 'Bucht auf Haus/Zaun');
    }
  }
  for (let i = 0; i < autos.length; i++) for (let j = i + 1; j < autos.length; j++) {
    assert.ok(Math.hypot(autos[i].x - autos[j].x, autos[i].y - autos[j].y) >= 40, 'Autos überlappen sich');
  }
  setzeKartengroesse(64, 48);
});

let server;
const PORT = 27700 + Math.floor(Math.random() * 200);
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('Geretsried im Spiel: Zombies nur in der Nähe, Haus betreten', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Geretsrieder', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const p = raum.state.spieler.get(c.sessionId);
    assert.equal(raum.state.karte, 'geretsried');
    assert.ok(await bis(() => c.state.karte === 'geretsried'));
    assert.ok(await bis(() => raum.state.zombies.size > 5, 4000), 'keine Zombies');
    const weit = [...raum.state.zombies.entries()].filter(([id, z]) => !z.ebene && !raum.zombieInfo.get(id)?.bleibt && Math.hypot(z.x - p.x, z.y - p.y) > 1600).length;
    assert.equal(weit, 0, 'Zombies weit weg erzeugt');
    // Geschäfte: PENNY mit Lebensmittelregalen, Apotheke mit Apothekenregalen
    const penny = raum.welt.haeuser.find(h => /penny/i.test(h.name));
    assert.ok(penny, 'PENNY fehlt');
    assert.ok(raum.wv(`h${penny.nr}eg`).behaelter.some(b => b.art === 'laden_lebensmittel'), 'PENNY ohne Lebensmittelregal');
    const apo = raum.welt.haeuser.find(h => /apotheke/i.test(h.name));
    assert.ok(raum.wv(`h${apo.nr}eg`).behaelter.some(b => b.art === 'laden_apotheke'), 'Apotheke ohne Regal');
    // Haus betreten (Tür in beliebiger Richtung)
    const h = raum.welt.haeuser.find(h => h.betretbar);
    const q = h.tuerPos;   // Haustür: an der Wand gezielt hineinlaufen
    p.x = q.x + q.nx * 24; p.y = q.y + q.ny * 24;
    c.send('eingabe', { dx: -q.nx, dy: -q.ny });
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 4000), 'nicht hineingekommen');
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Geretsried: Vektordaten fürs Aussehen (Umrisse, Straßen, Flächen) passen zum Raster', async () => {
  const { readFileSync } = await import('node:fs');
  const karte = JSON.parse(readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
  assert.ok(karte.strassen.length > 100, 'zu wenige Straßen');
  assert.ok(karte.flaechen.length > 10, 'zu wenige Flächen');
  const mitUmriss = karte.gebaeude.filter(g => g.umriss?.length >= 6);
  assert.equal(mitUmriss.length, karte.gebaeude.length, 'Gebäude ohne Umriss');
  // Umriss liegt um das gerasterte Gebäude herum (höchstens eine Kachel daneben)
  // (einzelne Gebäude ragen in OSM über eine Straße – dort ist das Raster abgeschnitten, der Client beschneidet das Dach)
  const daneben = mitUmriss.filter(g => {
    const xs = g.umriss.filter((_, i) => i % 2 === 0), ys = g.umriss.filter((_, i) => i % 2 === 1);
    return !(Math.min(...xs) > g.x - 1.5 && Math.max(...xs) < g.x + g.b + 1.5 && Math.min(...ys) > g.y - 1.5 && Math.max(...ys) < g.y + g.h + 1.5);
  });
  assert.ok(daneben.length < mitUmriss.length * 0.05, `${daneben.length} Umrisse passen nicht zum Raster`);
});

test('Stadtleben: Menschen gehen umher, Gebissene werden zu Zombies, der Bus fährt', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Bürgermeister', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const s = raum.state;
    assert.ok(s.menschen.size >= 40, 'zu wenige Menschen: ' + s.menschen.size);
    const busOf = () => [...s.fahrzeuge.values()].find(f => f.art === 'bus');
    assert.ok(busOf(), 'kein Bus');
    assert.ok([...s.fahrzeuge.values()].filter(f => f.art === 'auto' || f.art === 'laster').length >= 3, 'kein Verkehr');
    // jemand bewegt sich
    const vorher = new Map([...s.menschen.entries()].map(([id, m]) => [id, [m.x, m.y, m.sichtbar]]));
    const bus0 = { x: busOf().x, y: busOf().y };
    await new Promise(r => setTimeout(r, 12000));
    const bewegt = [...s.menschen.entries()].filter(([id, m]) => { const v = vorher.get(id); return v && (Math.hypot(m.x - v[0], m.y - v[1]) > 20 || m.sichtbar !== v[2]); }).length;
    assert.ok(bewegt >= 2, 'Menschen bewegen sich nicht: ' + bewegt);   // die Mehrheit sitzt versteckt, nur Panik-Läufer (ca. 12 %) bewegen sich
    const bus = busOf();
    assert.ok(Math.hypot(bus.x - bus0.x, bus.y - bus0.y) > 50, 'Bus fährt nicht');
    // Fahrzeuge bleiben auf den Straßenlinien (nicht quer über Wiesen und Häuser)
    for (const f of s.fahrzeuge.values()) assert.ok([0, 1, -1].some(dx => [0, 1, -1].some(dy => [T.STRASSE, T.PLATZ, T.DEKO].includes(raum.welt.hole(Math.floor(f.x / KACHEL) + dx, Math.floor(f.y / KACHEL) + dy)))), 'Fahrzeug neben der Straße');
    // Biss → nach der Ansteckungszeit ein Zombie
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar && !q.infiziert);
    m.infiziert = true; raum.stadt.info.get(mid).inf = 0.5;
    assert.ok(await bis(() => !s.menschen.has(mid), 3000), 'Gebissener verwandelt sich nicht');
    const zid = raum.stadt.zuletztVerwandelt;
    assert.ok(zid && s.zombies.has(zid), 'kein neuer Zombie');
    assert.ok(raum.zombieInfo.get(zid).bleibt, 'verwandelter Zombie würde wieder verschwinden');
  } finally { await c.leave(); }
});

test('Feuer: Auto brennt, verletzt Zombies, erlischt und bleibt als Wrack', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Feuerwehrmann', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const s = raum.state;
    const auto = raum.welt.behaelter.find(b => b.art === 'auto' && !s.verbrannt.has('auto:' + b.id));
    const fid = raum.brand.anzuenden({ k: 'auto:' + auto.id, x: auto.x, y: auto.y, art: 'auto', r: 42 });
    assert.ok(s.feuer.has(fid));
    const zid = raum.setzeZombie(auto.x + 10, auto.y, '');
    const z = s.zombies.get(zid); raum.zombieInfo.get(zid).steht = true;
    const halten = setInterval(() => { if (s.zombies.has(zid)) { z.x = auto.x + 10; z.y = auto.y; } }, 20);
    try { assert.ok(await bis(() => !s.zombies.has(zid) || z.hp < 80, 6000), 'Feuer verletzt den Zombie nicht'); } finally { clearInterval(halten); }
    raum.brand.info.get(fid).alter = 1e6;   // abgebrannt
    assert.ok(await bis(() => !s.feuer.has(fid), 2000), 'Feuer erlischt nicht');
    assert.ok(s.verbrannt.has('auto:' + auto.id), 'kein Wrack');
  } finally { await c.leave(); }
});

test('Über Gartenzäune steigen: länger dagegenlaufen, dann drüber; Kartenrand bleibt zu', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Kletterer', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId), w = raum.welt, p = raum.state.spieler.get(c.sessionId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    // im feinen Raster eine gerade, waagrechte Zaunlinie (mind. 10 Felder) mit freier Fläche darüber und darunter
    const fb = 281 * 4, f = w.fein;
    let ort = null;
    for (let fy = 20; fy < 208 * 4 - 20 && !ort; fy++) for (let fx = 20; fx < fb - 30 && !ort; fx++) {
      let gut = true;
      for (let i = 0; i < 10 && gut; i++) {
        if (f[fy * fb + fx + i] !== 2) gut = false;
        for (let d = 2; d <= 9 && gut; d++) if (f[(fy - d) * fb + fx + i] || f[(fy + d) * fb + fx + i]) gut = false;
      }
      if (gut) ort = { x: (fx + 5) / 4, y: (fy + 0.5) / 4 };   // in Kacheln
    }
    assert.ok(ort, 'keine gerade Zaunlinie');
    ort = { x: ort.x - 0.5, y: Math.floor(ort.y), fy: ort.y };
    // 1. schräg dagegenlaufen (am Handy selten genau senkrecht)
    p.ebene = ''; p.x = (ort.x + 0.5) * KACHEL; p.y = (ort.fy - 1.1) * KACHEL;
    c.send('eingabe', { dx: 0.3, dy: 0.95 });
    const t0 = Date.now();
    assert.ok(await bis(() => p.y > (ort.fy + 0.4) * KACHEL, 5000), 'nicht automatisch hinübergestiegen: ' + Math.round(p.x) + ',' + Math.round(p.y) + ' Ort ' + JSON.stringify(ort) + ' fein ' + !!w.fein);
    c.send('eingabe', { dx: 0, dy: 0 });
    // Sprung kommt schnell (Anlauf ~1 s + 0,25 s Dagegenlaufen), Landung direkt hinter dem Zaun (Zaun 1 m = 8 px; kein Weitsprung)
    assert.ok(Date.now() - t0 < 2500, 'Überstieg dauert zu lange: ' + (Date.now() - t0) + ' ms');
    assert.ok(p.y - (ort.fy + 0.125) * KACHEL < 24, 'Landung zu weit hinter dem Zaun: ' + Math.round(p.y - (ort.fy + 0.125) * KACHEL) + ' px');
    const ly = p.y; await new Promise(r => setTimeout(r, 500));
    assert.ok(Math.abs(p.y - ly) < 1, 'Figur läuft nach dem Sprung nach');
    // 2. mit dem Aktionsknopf zurück
    await new Promise(r => setTimeout(r, 300));
    p.x = (ort.x + 0.5) * KACHEL; p.y = ort.fy * KACHEL + 16; p.richtung = -Math.PI / 2;
    const k = raum.kontext(p);
    assert.equal(k?.art, 'klettern', 'kein Drübersteigen angeboten: ' + k?.art);
    c.send('aktion');
    assert.ok(await bis(() => p.y < ort.fy * KACHEL - 8, 3000), 'Aktionsknopf steigt nicht hinüber');
  } finally { await c.leave(); }
});

test('Feines Kollisionsraster: jede Haustür ist ohne Klettern erreichbar', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  assert.ok(w.fein, 'kein feines Raster');
  const fb = karte.breite * 4, fh = karte.hoehe * 4;
  const ok = new Uint8Array(fb * fh), da = new Uint8Array(fb * fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fb; x++) ok[y * fb + x] = frei(w, (x + 0.5) * 8, (y + 0.5) * 8, 11) ? 1 : 0;
  const s0 = Math.floor(w.start.y / 8) * fb + Math.floor(w.start.x / 8), q = [s0]; da[s0] = 1;
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % fb; for (const n of [c - 1, c + 1, c - fb, c + fb]) if (n >= 0 && n < fb * fh && Math.abs((n % fb) - x) <= 1 && ok[n] && !da[n]) { da[n] = 1; q.push(n); } }
  const fehlt = w.haeuser.filter(h => (h.betretbar || h.safe) && h.tuer).filter(h => {
    const cx = Math.floor((h.tuer.x + 0.5 + h.raus.dx * 1.3) * 4), cy = Math.floor((h.tuer.y + 0.5 + h.raus.dy * 1.3) * 4);
    return ![0, 1, -1, fb, -fb].some(d => da[cy * fb + cx + d]);
  });
  assert.equal(fehlt.length, 0, 'unerreichbare Türen: ' + fehlt.map(h => h.nr).join(','));
  setzeKartengroesse(64, 48);
});

test('Biss-Chance: 0 % beißt nie, 100 % sofort', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Bader', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const s = raum.state, e = raum.einstellungen(), vorher = e.bissChance;
    const versuch = (chance, sekunden) => {
      e.bissChance = chance;
      const [, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar && !q.infiziert && frei(raum.welt, q.x, q.y, 12));
      const zid = raum.setzeZombie(m.x, m.y, ''), z = s.zombies.get(zid);
      for (let i = 0; i < sekunden * 20 && !m.infiziert; i++) {
        z.x = m.x; z.y = m.y; raum.zombieInfo.get(zid).ziel = null; raum.zombieInfo.get(zid).bissVersuch = undefined;
        raum.stadt.takt += 0.05; raum.stadt.zombiesWittern([[zid, z]]);
      }
      s.zombies.delete(zid); raum.zombieInfo.delete(zid);
      return m.infiziert;
    };
    try {
      assert.equal(versuch(0, 30), false, 'bei 0 % gebissen');
      assert.equal(versuch(1, 1), true, 'bei 100 % nicht gebissen');
    } finally { e.bissChance = vorher; }
  } finally { await c.leave(); }
});

test('Verkehr: Fahrzeuge fahren nicht übereinander', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Schupo', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    const s = raum.state, v = raum.verkehr;
    // 20 s Verkehr laufen lassen und nachmessen: kein Paar auf derselben Spur ineinander
    let schlimm = 0;
    for (let t = 0; t < 400; t++) {
      v.schritt(0.05);
      const liste = [...s.fahrzeuge.values()].filter(f => f.art !== 'wrack');
      for (const a of liste) for (const b of liste) {
        if (a === b) continue;
        const c2 = Math.cos(a.richtung), sn = Math.sin(a.richtung), rx = b.x - a.x, ry = b.y - a.y;
        const vor = rx * c2 + ry * sn, quer = -rx * sn + ry * c2;
        const gleicheRichtung = Math.cos(a.richtung - b.richtung) > 0.9;
        if (gleicheRichtung && Math.abs(quer) < 10 && vor > 0 && vor < 30) schlimm++;
      }
    }
    assert.ok(schlimm < 20, 'Fahrzeuge übereinander: ' + schlimm);
  } finally { await c.leave(); }
});

// Straßendeko: Mülltonnen, durchsuchbare Container, Straßensperren (Autos umfahren sie), freie Plätze in Parkbuchten
test('Geretsried: Mülltonnen, Container, Straßensperren, freie Parkplätze', async () => {
  const { BEUTE, BEHAELTER_NAME } = await import('../client/welt.mjs');
  const { strassenGraph, naechsterKnoten, route } = await import('../server/verkehr.mjs');
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const w = baueWeltAusKarte(karte, 7);
    // Tonnen: Gruppen mit grauer Restmülltonne, nur auf freiem Boden
    assert.ok(w.muell.tonnen.length >= 40, 'zu wenige Tonnengruppen: ' + w.muell.tonnen.length);
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
    assert.ok(cont.length >= 10, 'zu wenige Container: ' + cont.length);
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

test('Mehr Bäume: ca. +50 %, nie auf Haustür-Vorkacheln, Parkbuchten, Containern, Sperren oder am Start', async () => {
  const { baumVon, baumKronen, zeichneBoden } = await import('../client/aussehen.mjs');
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 7);
  const zahl = t => { let n = 0; for (const x of w.kacheln) if (x === T.BAUM) n++; return n; };
  let roh = 0; for (let i = 0; i < karte.kacheln.length; i++) if (karte.kacheln.charCodeAt(i) - 48 === T.BAUM) roh++;
  const jetzt = zahl();
  // mit Luftbild-Feld (Paket H) stehen die zusätzlichen Bäume dort, wo das Luftbild Baum zeigt (tests/luftbild.test.mjs); sonst Zufalls-Rückfall +50 %
  if (karte.luftbild) assert.ok(jetzt >= roh, `Bäume ${roh} -> ${jetzt}`);
  else assert.ok(jetzt >= roh * 1.4 && jetzt <= roh * 1.6, `Bäume ${roh} -> ${jetzt}`);
  for (const h of w.haeuser) if (h.tuer) {
    const fx = h.tuer.x + h.raus.dx, fy = h.tuer.y + h.raus.dy;
    assert.notEqual(w.hole(fx, fy), T.BAUM, 'Baum vor Haustür ' + h.nr);
  }
  for (const b of w.behaelter) assert.notEqual(w.hole(Math.floor(b.x / KACHEL), Math.floor(b.y / KACHEL)), T.BAUM, 'Baum unter ' + b.art);
  for (const s of w.sperren) assert.notEqual(w.hole(Math.floor(s.x / KACHEL), Math.floor(s.y / KACHEL)), T.BAUM, 'Baum auf Sperre');
  assert.notEqual(w.hole(Math.floor(w.start.x / KACHEL), Math.floor(w.start.y / KACHEL)), T.BAUM);
  // Kronen maßstäblich: 4–8 m je Baum (8 px = 1 m), Einzelbäume kleiner als Waldbäume (Regeln und Überlappung: tests/baumgruppen.test.mjs)
  for (let i = 0; i < 50; i++) for (const n of [1, 3, 8, 24]) { const b = baumVon(i, 3 * i, n); assert.ok(b.gr >= 4 * 8 - 1e-9 && b.gr <= 8 * 8 + 1e-9, 'Krone ' + b.gr); }
  for (const b of baumKronen(w, { x0: 0, y0: 0, x1: 120, y1: 120 })) assert.ok(b.gr >= 32 - 1e-9 && b.gr <= 64 + 1e-9, 'Krone ' + b.gr);
  assert.equal(typeof zeichneBoden, 'function');
  // Blumenbeete gibt es nicht mehr
  const quelle = fs.readFileSync(new URL('../client/aussehen.mjs', import.meta.url), 'utf8');
  assert.ok(!/zeichneBeet|beetHier/.test(quelle));
});
