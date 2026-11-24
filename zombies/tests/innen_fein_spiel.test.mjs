// Maßstäbliche Innenräume (Schalter AN, ZOMBIES_INNEN1M): dieselben Kernszenarien wie innenraum.test.mjs, vorrat.test.mjs usw. mit dem Server:
// Betreten/Treppen/Hinaus, Tempo drinnen wie draußen im Maßstab, Reichweiten, Türen, Safe Room (Kiste, Barrikade, Tür unzerstörbar),
// schlafende Zombies, Bots, Hund, Missionsbehälter auf der Karte, Umschalten im laufenden Spiel und Spielstand mit anderem Modus.
process.env.ZOMBIES_INNEN1M = '1';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, T, INNEN_FEIN, WERTE as W, frei, sichtfrei, kachelVon, reichVon, tempoVon, AKTION_ABSTAND, safeRoomVon, poolFaktor } from '../client/welt.mjs';
import { BOTPLAN } from '../server/botplan.mjs';
import { hat } from '../client/stapel.mjs';
import { freierPort, altesTempo } from './hilfe.mjs';
altesTempo(SpielRaum);
BOTPLAN.an = false;

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-fein-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = crypto.randomBytes(16).toString('hex')) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0;
  for (const [id, z] of raum.state.zombies) if (!z.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  return { c, raum, p: raum.state.spieler.get(c.sessionId), spielerId };
}
const mitte = (w, k) => ({ x: (k.x + 0.5) * kachelVon(w), y: (k.y + 0.5) * kachelVon(w) });
const zellMitte = (w, [x, y]) => ({ x: (x + 0.5) * kachelVon(w), y: (y + 0.5) * kachelVon(w) });
const hausMit = (raum, f) => { for (const h of raum.welt.haeuser) { if (!h.betretbar || h.safe) continue; const w = raum.wv(`h${h.nr}eg`); if (f(w, h)) return { h, w }; } return null; };
const eingabe = (c, dx, dy) => c.send('eingabe', { dx, dy });

test('Schalter ist an, Innenräume sind maßstäblich (Zellen, dünne Wände, eigenes Raster)', async () => {
  const { c, raum } = await beitreten('Maßstab');
  try {
    assert.equal(INNEN_FEIN, true);
    assert.ok(await bis(() => (c.state.optionen & 2) === 2), 'Client sieht den Schalter nicht');
    const { w } = hausMit(raum, () => true);
    assert.equal(w.kachel, 2); assert.ok(w.breite > 30 && w.reich < 1 && tempoVon(w) < 1);
    assert.ok(w.ausgang.rect && w.ausgang.zellen.length === 10);
  } finally { await c.leave(); }
});

test('Tempo drinnen im Maßstab des Raums, draußen unverändert (Laufen und Schleichen)', async () => {
  const { c, raum, p } = await beitreten('Läufer');
  try {
    const lauf = async (dx, dy, s = 0.9) => {   // eine Sekunde Eingabe, gemessene Strecke
      const x0 = p.x, y0 = p.y;
      const t0 = Date.now(); while (Date.now() - t0 < s * 1000) { eingabe(c, dx, dy); await warte(50); }
      eingabe(c, 0, 0); await warte(150);
      return { d: Math.hypot(p.x - x0, p.y - y0), s: (Date.now() - t0) / 1000 };
    };
    // draußen: freie Stelle suchen
    const w0 = raum.wv('');
    let ok = false;
    for (let i = 0; i < 400 && !ok; i++) {
      const x = (6 + (i % 20) * 2) * KACHEL, y = (6 + Math.floor(i / 20) * 2) * KACHEL;
      if (frei(w0, x, y, 9) && frei(w0, x + 200, y, 9) && [0, 40, 80, 120, 160, 200].every(a => frei(w0, x + a, y, 9) && poolFaktor(w0, x + a, y) === 1)) { p.x = x; p.y = y; p.ebene = ''; ok = true; }
    }
    assert.ok(ok);
    const aussen = await lauf(1, 0);
    // drinnen: lange Strecke in einem Raum
    let start = null, w = null;
    const streifen = w => { for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++) { if ([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44].every(a => frei(w, (x + a + 0.5) * 2, (y + 0.5) * 2, 7))) return { x: (x + 0.5) * 2, y: (y + 0.5) * 2 }; } return null; };
    for (const h of raum.welt.haeuser) { if (!h.betretbar || h.safe) continue; const k = raum.wv(`h${h.nr}eg`); if (!k.kachel) continue; const q = streifen(k); if (q) { w = k; start = q; break; } }
    assert.ok(start, 'kein langer freier Streifen');
    p.ebene = w.ebene;
    Object.assign(p, start);
    const innen = await lauf(1, 0, 0.7);
    const vAussen = aussen.d / aussen.s, vInnen = innen.d / innen.s;
    assert.ok(vAussen > W.tempoGehen * 0.7 && vAussen < W.tempoGehen * 1.6, `draußen ${vAussen.toFixed(0)} px/s`);
    assert.ok(Math.abs(vInnen / vAussen - tempoVon(w)) < 0.12, `drinnen ${vInnen.toFixed(0)} px/s gegenüber ${vAussen.toFixed(0)} draußen (Faktor ${tempoVon(w)})`);
    // Zombie-Tempo: im selben Raum jagender Zombie legt in 1 s etwa zombieTempoJagen × Faktor zurück
    const zid = raum.setzeZombie(start.x + 40, start.y, w.ebene, false);
    const z = raum.state.zombies.get(zid), info = raum.zombieInfo.get(zid);
    info.tempo = 1; info.ziel = c.sessionId; z.jagt = true;
    p.x = start.x; p.y = start.y;
    const x0 = z.x; await warte(1000);
    const vz = Math.abs(z.x - x0);
    assert.ok(vz > 10 && vz < W.zombieTempoJagen * 1.05, `Zombie ${vz.toFixed(0)} px/s drinnen`);
    raum.state.zombies.delete(zid); raum.zombieInfo.delete(zid);
  } finally { await c.leave(); }
});

test('Betreten, Treppe in den Keller, wieder hinauf und hinaus', async () => {
  const { c, raum, p } = await beitreten('Hausbesucher');
  try {
    const { h, w: eg0 } = hausMit(raum, w => w.hatKeller);
    const vor = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL }, raus = h.tuer.y === h.y ? -1 : 1;
    p.x = vor.x; p.y = vor.y + raus * KACHEL * 1.0; p.ebene = '';
    eingabe(c, 0, -raus);
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 4000), 'nicht hineingekommen');
    eingabe(c, 0, 0);
    const eg = raum.wv(p.ebene);
    assert.ok(frei(eg, p.x, p.y, W.spielerRadius), 'Ankunft in einer Wand');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const treppe = eg.treppen.find(t => t.ziel === 'keller');
    const tm = zellMitte(eg, treppe.zellen[Math.floor(treppe.zellen.length / 2)]); p.x = tm.x; p.y = tm.y;
    assert.ok(await bis(() => p.ebene === `h${h.nr}keller`, 2000), 'nicht in den Keller');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const k = raum.wv(p.ebene);
    assert.ok(frei(k, p.x, p.y, W.spielerRadius), 'Ankunft im Keller in einer Wand');
    const hoch = k.treppen.find(t => t.ziel === 'eg'), hm = zellMitte(k, hoch.zellen[Math.floor(hoch.zellen.length / 2)]);
    p.x = hm.x; p.y = hm.y;
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 2000), 'nicht zurück ins EG');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const am = zellMitte(eg, eg.ausgang.zellen[Math.floor(eg.ausgang.zellen.length / 2)]); p.x = am.x; p.y = am.y;
    assert.ok(await bis(() => p.ebene === '', 2000), 'nicht hinaus');
    assert.ok(Math.hypot(p.x - vor.x, p.y - vor.y) < 70, 'nicht vor der Haustür gelandet');
  } finally { await c.leave(); }
});

test('Reichweiten drinnen: Durchsuchen nur nah am Möbelstück, Schrank im Nachbarraum nicht', async () => {
  const { c, raum, p } = await beitreten('Sucher');
  try {
    const { w } = hausMit(raum, w => w.behaelter.length >= 3 && w.moebel.length > 6);
    let b = null, m = null, nah = null;
    for (const kand of w.behaelter) {
      const mm = w.moebel.find(q => { const cx = Math.floor(kand.x / 2), cy = Math.floor(kand.y / 2); return cx >= q.x && cx < q.x + q.b && cy >= q.y && cy < q.y + q.h; });
      if (!mm) continue;
      const weitVon = (x, y) => ![...w.tueren, ...w.treppen, ...(w.ausgang ? [w.ausgang] : [])].some(t => t.zellen.some(([zx, zy]) => Math.hypot(zx * 2 - x, zy * 2 - y) < 24));
      for (let dy = -4; dy <= mm.h + 3 && !nah; dy++) for (let dx = -4; dx <= mm.b + 3; dx++) {
        const x = (mm.x + dx + 0.5) * 2, y = (mm.y + dy + 0.5) * 2;
        if (w.hole(mm.x + dx, mm.y + dy) === T.BODEN && frei(w, x, y, 7) && Math.hypot(x - kand.x, y - kand.y) < reichVon(w, AKTION_ABSTAND) - 1 && weitVon(x, y)) { nah = { x, y }; break; }
      }
      if (nah) { b = kand; m = mm; break; }
    }
    assert.ok(nah, 'kein Standpunkt am Möbel');
    p.ebene = w.ebene; Object.assign(p, nah);
    assert.equal(raum.kontext(p)?.art, 'durchsuchen', 'direkt am Möbel nicht durchsuchbar');
    // 5 m (alte Reichweite) vom Behälter weg: nichts mehr (freie Zelle ≥ 20 px entfernt, andere Behälter ebenfalls fern)
    let fern = null;
    for (let y = w.oy; y < w.oy + w.h && !fern; y++) for (let x = w.ox; x < w.ox + w.b; x++) {
      const px = (x + 0.5) * 2, py = (y + 0.5) * 2;
      if (frei(w, px, py, 7) && w.behaelter.every(q => Math.hypot(q.x - px, q.y - py) > reichVon(w, AKTION_ABSTAND) + 6) && !w.tueren.some(t => t.zellen.some(([zx, zy]) => Math.hypot(zx * 2 - px, zy * 2 - py) < 26)) && !(w.ausgang?.zellen.some(([zx, zy]) => Math.hypot(zx * 2 - px, zy * 2 - py) < 26))) { fern = { x: px, y: py }; break; }
    }
    assert.ok(fern, 'kein ferner Punkt');
    Object.assign(p, fern);
    const k = raum.kontext(p);
    assert.ok(!k || k.art !== 'durchsuchen', 'durchsuchbar aus der Ferne: ' + k?.art);
  } finally { await c.leave(); }
});

test('Zimmertüren: öffnen, schließen, mehrzellig; Zombie hämmert gegen die geschlossene Tür', async () => {
  const { c, raum, p } = await beitreten('Türöffner');
  try {
    raum.state.tuerFrei = 100; raum.state.tuerRaetsel = 0; raum.state.tuerSchluessel = 0;
    const { w } = hausMit(raum, w => w.tueren.length >= 2);
    w.behaelter = [];
    const t = w.tueren[0], key = `${w.ebene}:${t.x},${t.y}`;
    assert.ok(t.zellen.length >= 4 && t.zellen.every(([x, y]) => w.hole(x, y) === T.INNENTUER));
    const seite = t.senkrecht ? [[-3, 0], [3, 0]] : [[0, -3], [0, 3]];
    const [a, b] = seite.map(([dx, dy]) => zellMitte(w, [t.x + dx, t.y + dy]));
    p.ebene = w.ebene; Object.assign(p, a);
    raum.state.tueren.get(key) ?? raum.baueEbene?.(w.ebene);
    raum.setzeTuer(key, false);
    assert.ok(t.zellen.every(([x, y]) => w.hole(x, y) === T.INNENTUER), 'Tür geschlossen: nicht alle Zellen zu');
    c.send('aktion');
    assert.ok(await bis(() => raum.state.tueren.get(key).offen), 'Tür geht nicht auf (Reichweite)');
    assert.ok(t.zellen.every(([x, y]) => w.hole(x, y) === T.TUER_OFFEN), 'offene Tür: nicht alle Zellen offen');
    assert.ok(frei(w, b.x, b.y, 7) && frei(w, t.zellen[2][0] * 2 + 1, t.zellen[2][1] * 2 + 1, 7), 'offene Tür nicht passierbar');
    raum.setzeTuer(key, false);
    // Zombie auf der anderen Seite, Spieler hinter der Tür: er hämmert
    const zid = raum.setzeZombie(b.x, b.y, w.ebene, false), z = raum.state.zombies.get(zid), info = raum.zombieInfo.get(zid);
    info.ziel = c.sessionId; z.jagt = true; info.tempo = 1;
    const hp0 = raum.state.tueren.get(key).hp;
    assert.ok(await bis(() => raum.state.tueren.get(key).hp < hp0 || raum.state.tueren.get(key).barrikade < 0, 6000) || await bis(() => raum.state.tueren.get(key).hp < hp0, 4000), 'Zombie hämmert nicht gegen die Tür');
    raum.state.zombies.delete(zid); raum.zombieInfo.delete(zid);
  } finally { await c.leave(); }
});

test('Zimmertür öffnet automatisch: 0,5 s davorstehen (nicht früher), auch im Feinraster', async () => {
  const { c, raum, p } = await beitreten('Steher');
  try {
    raum.state.tuerFrei = 100; raum.state.tuerRaetsel = 0; raum.state.tuerSchluessel = 0;
    const { w } = hausMit(raum, w => w.tueren.length >= 1);
    const t = w.tueren[0], key = `${w.ebene}:${t.x},${t.y}`;
    const [a] = (t.senkrecht ? [[-3, 0]] : [[0, -3]]).map(([dx, dy]) => zellMitte(w, [t.x + dx, t.y + dy]));
    raum.state.tueren.get(key) ?? raum.baueEbene?.(w.ebene);
    const st = raum.state.tueren.get(key), x = raum.extra.get(c.sessionId);
    p.ebene = w.ebene; Object.assign(p, a);
    await warte(150);   // erster Schritt nach dem Versetzen bringt die Zeit seit dem Beitreten mit
    raum.setzeTuer(key, false); st.verschlossen = false; raum.setzeBarrikade?.(key, 0);
    x.ankunft = null; x.tuerT = 0; x.tuerKey = null; x.tuerSperre = null;
    await warte(250);
    assert.equal(st.offen, false, 'nach 0,25 s schon offen');
    assert.ok(await bis(() => st.offen === true, 2000), 'Tür geht im Stehen nicht auf');
  } finally { await c.leave(); }
});

test('Langes Regal: Durchsuchen auch am Ende (Reichweite zählt bis zum Möbelrand, nicht zur Mitte)', async () => {
  const { c, raum, p } = await beitreten('Regalsucher');
  try {
    const { w } = hausMit(raum, w => w.behaelter.length >= 1);
    const reich = reichVon(w, AKTION_ABSTAND);
    const a = w.behaelter[0], r = a.rect;
    assert.ok(r && r.x1 > r.x0, 'Behälter ohne Möbelrechteck');
    // künstliches langes Regal (Ladenreihe): Mitte weiter als die Reichweite vom Standpunkt, Rand aber nah
    const st = { x: (r.x0 + r.x1) / 2, y: r.y1 + 4 };
    const lang = { id: w.ebene + ':lang', art: 'laden', x: st.x + reich + 10, y: st.y, rect: { x0: st.x + 2, y0: st.y - 2, x1: st.x + 2 * reich + 20, y1: st.y + 2 } };
    const alt = w.behaelter; w.behaelter = [lang];
    p.ebene = w.ebene; Object.assign(p, st);
    assert.ok(Math.hypot(lang.x - p.x, lang.y - p.y) > reich, 'Aufbau: Mitte müsste außer Reichweite liegen');
    const k = raum.kontext(p);
    assert.equal(k?.art, 'durchsuchen', 'am Regalrand nicht durchsuchbar: ' + k?.art);
    // und ein echter Behälter: Standpunkt am Rand statt in der Mitte funktioniert weiterhin (Bestandstest oben)
    w.behaelter = alt;
  } finally { await c.leave(); }
});

test('Zimmertür schließen: Standpunkt neben der offenen Tür, auch mit Schrank in der Nähe; belegt nur, wenn jemand im Türrechteck steht', async () => {
  const { c, raum, p } = await beitreten('Türschließer');
  try {
    raum.state.tuerFrei = 100; raum.state.tuerRaetsel = 0; raum.state.tuerSchluessel = 0;
    const { w } = hausMit(raum, w => w.tueren.length >= 2);
    const t = w.tueren[0], key = `${w.ebene}:${t.x},${t.y}`;
    raum.state.tueren.get(key) ?? raum.baueEbene?.(w.ebene);
    raum.setzeTuer(key, true);
    const seite = t.senkrecht ? [3, 0] : [0, 3];
    const a = zellMitte(w, [t.x - seite[0], t.y - seite[1]]);
    p.ebene = w.ebene; Object.assign(p, a);
    const zu = raum.tuerKontext(p, 'zu');
    assert.equal(zu?.art, 'tuer_zu', 'offene Tür lässt sich nicht schließen (Kontext): ' + zu?.art);
    // ein Behälter direkt daneben belegt die erste Taste – die zweite Taste schließt trotzdem
    const alt = w.behaelter; w.behaelter = [{ id: w.ebene + ':test', art: 'schrank', x: a.x + 3, y: a.y, rect: { x0: a.x + 1, y0: a.y - 4, x1: a.x + 5, y1: a.y + 4 } }];
    assert.equal(raum.kontext(p)?.art, 'durchsuchen');
    assert.equal(raum.tuerKontext(p, 'zweit')?.art, 'tuer_zu', 'zweite Taste schließt nicht');
    w.behaelter = alt;
    // wer im Türrechteck steht (nicht nur in der Mitte), verhindert das Schließen
    const rand = zellMitte(w, t.zellen[0]);
    const zid = raum.setzeZombie(rand.x, rand.y, w.ebene, false);
    assert.ok(raum.tuerBlockiert(raum.tuerKontext(p, 'zu'), p), 'Zombie in der Tür: Schließen müsste gesperrt sein');
    {   // Aktion wird mit Meldung verweigert
      const msgs = []; const cl = raum.clients.find(q => q.sessionId === c.sessionId), alt2 = cl.send; cl.send = (t, m) => { if (t === 'meldung') msgs.push(m.text); };
      raum.starteAktion(cl);
      cl.send = alt2;
      assert.equal(p.aktion, '', 'Aktion trotz blockierter Tür gestartet');
      assert.ok(msgs.some(m => /blockiert/.test(m)), 'keine Meldung „Tür blockiert“: ' + msgs);
    }
    raum.state.zombies.delete(zid); raum.zombieInfo.delete(zid);
    w.behaelter = [];
    // wer direkt in der Tür steht, blockiert sich nicht selbst und wird auf seine Seite geschoben
    { const m = zellMitte(w, t.zellen[0]); Object.assign(p, m);
      const k = raum.tuerKontext(p, 'zu');
      assert.ok(!raum.tuerBlockiert(k, p), 'Schließender blockiert sich selbst');
      raum.tuerSchieben(k, p);
      const r = raum.tuerRechteck({ tuer: t, ebene: w.ebene });
      assert.ok(p.x <= r.x0 || p.x >= r.x1 || p.y <= r.y0 || p.y >= r.y1, 'Schließender steht noch im Türblatt'); }
    Object.assign(p, a);
    c.send('aktion');
    assert.ok(await bis(() => !raum.state.tueren.get(key).offen), 'Tür geht nicht zu');
    assert.ok(t.zellen.every(([x, y]) => w.hole(x, y) === T.INNENTUER), 'geschlossene Tür: nicht alle Zellen zu');
  } finally { await c.leave(); }
});

test('Schlafender Zombie hinter geschlossener Tür bleibt liegen, wacht bei offener Tür auf; Biss nur aus Nahdistanz', async () => {
  const { c, raum, p } = await beitreten('Weckdienst');
  try {
    p.waffe = ''; p.munition = 0;
    const { w } = hausMit(raum, w => w.tueren.length >= 1 && w.zombiePlaetze.length >= 1);
    const zp = w.zombiePlaetze[0];
    for (const [id, z] of raum.state.zombies) if (z.ebene === w.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    p.ebene = w.ebene;
    // Spieler 2 m neben dem Zombie, durch Wand/Tür getrennt wäre schwer zu bauen: wir prüfen die Abstände direkt
    const zid = raum.setzeZombie(zp.x, zp.y, w.ebene, true), z = raum.state.zombies.get(zid), info = raum.zombieInfo.get(zid);
    // Spieler 20 m entfernt (160 px), sichtbar: schlafender Zombie bemerkt nicht (Schwelle 70 px × Maßstab)
    let weit = null;
    for (let y = w.oy; y < w.oy + w.h && !weit; y++) for (let x = w.ox; x < w.ox + w.b; x++) { const q = { x: (x + 0.5) * 2, y: (y + 0.5) * 2 }; if (frei(w, q.x, q.y, 7) && w.hole(x, y) === T.BODEN && Math.hypot(q.x - zp.x, q.y - zp.y) > 90 && Math.hypot(q.x - zp.x, q.y - zp.y) < 140) { weit = q; break; } }
    assert.ok(weit, 'kein ferner Punkt');
    Object.assign(p, weit); p.ebene = w.ebene;
    await warte(300);
    assert.ok(info.schlaeft, 'Zombie wacht ohne Grund auf');
    // Spieler direkt daneben (nah, laufend): wacht auf und jagt
    let nahPunkt = null;
    for (let a = 0; a < 16 && !nahPunkt; a++) { const q = { x: zp.x + Math.cos(a * Math.PI / 8) * 8, y: zp.y + Math.sin(a * Math.PI / 8) * 8 }; if (frei(w, q.x, q.y, 7) && w.hole(Math.floor(q.x / 2), Math.floor(q.y / 2)) === T.BODEN && sichtfrei(w, zp.x, zp.y, q.x, q.y)) nahPunkt = q; }
    assert.ok(nahPunkt);
    Object.assign(p, nahPunkt); p.ebene = w.ebene;
    assert.ok(await bis(() => !info.schlaeft, 3000), 'Zombie bemerkt den Spieler direkt neben sich nicht ' + JSON.stringify({ z: [z.x, z.y], p: [p.x, p.y], zp, ebene: [p.ebene, z.ebene, w.ebene], unten: p.unten, kamera: p.kamera, zombie: p.zombie, gute: (await import('../client/welt.mjs')).sichtGuete(w, z.x, z.y, p.x, p.y), info: { ziel: info.ziel, schlaeft: info.schlaeft } }));
    raum.state.zombies.delete(zid); raum.zombieInfo.delete(zid);
    // Biss-Reichweite: ein jagender Zombie 6 m entfernt beißt nicht
    const z2 = raum.setzeZombie(nahPunkt.x, nahPunkt.y, w.ebene, false), i2 = raum.zombieInfo.get(z2);
    raum.state.zombies.get(z2).x = zp.x + 1; raum.state.zombies.get(z2).y = zp.y + 1;
    i2.ziel = c.sessionId; p.hp = 100;
    Object.assign(p, { x: zp.x + 40, y: zp.y });   // 5 m weg (durch Wände evtl. blockiert) – kein Biss in den ersten 200 ms
    raum.schonT = 0; raum.extra.get(c.sessionId).schonT = 0;
    await warte(200);
    assert.equal(p.hp, 100, 'Biss aus 5 m Entfernung');
    raum.state.zombies.delete(z2); raum.zombieInfo.delete(z2);
  } finally { await c.leave(); }
});

test('Safe Room: Vorratskiste, Kühlschrank, Funktisch, Betten; Kiste und Kühlschrank erreichbar; Tür-Barrikade', async () => {
  const { c, raum, p } = await beitreten('Lagerist');
  try {
    assert.ok(raum.welt.safeRooms.length >= 1);
    for (const s of raum.welt.safeRooms) {
      const w = raum.wv(s.ebene);
      assert.equal(w.kachel, 2, 'Safe Room nicht maßstäblich');
      assert.ok(w.kiste && w.kuehlschrank, `${s.name}: Kiste/Kühlschrank fehlen`);
      assert.ok(w.moebel.some(m => m.art === 'funktisch') && w.moebel.filter(m => m.art === 'feldbett').length >= 2 && w.moebel.some(m => m.art === 'vorratskiste'), `${s.name}: Einrichtung`);
      assert.equal(w.treppen.length, 0); assert.ok(w.tueren.every(t => !t.verschlossen));
      assert.equal(w.zombiePlaetze.length, 0);
      // Kiste und Kühlschrank für die Figur erreichbar (nächste freie Zelle am Möbel, Weg vom Start dorthin)
      const { findeWeg } = await import('../client/welt.mjs');
      for (const ziel of [w.kiste, w.kuehlschrank]) {
        let ok = false;
        for (let r = 5; r <= 11 && !ok; r += 2) for (let i = 0; i < 16 && !ok; i++) { const t = { x: ziel.x + Math.cos(i * Math.PI / 8) * r, y: ziel.y + Math.sin(i * Math.PI / 8) * r }; if (frei(w, t.x, t.y, 7) && findeWeg(w, w.start.x, w.start.y, t.x, t.y, 7, 40000, false)) ok = true; }
        assert.ok(ok, `${s.name}: Kiste/Kühlschrank unerreichbar`);
      }
    }
    // Kiste öffnen aus Reichweite, nicht aus der Ferne; Barrikade an der Haustür
    const s = raum.welt.safeRooms[0], w = raum.wv(s.ebene);
    p.ebene = s.ebene; p.x = w.kiste.x + 3; p.y = w.kiste.y + 6;
    if (!frei(w, p.x, p.y, 7)) { const q = raum.freierPlatz(w.kiste, 0, s.ebene); p.x = q.x; p.y = q.y; }
    const innen = raum.nebenKachel(w, w.ausgang);
    p.x = innen.x; p.y = innen.y; p.rucksack.clear(); p.rucksack.push('bretter');
    const k = raum.kontext(p);
    assert.equal(k?.art, 'barrikade', 'keine Barrikade-Aktion an der Haustür des Safe Rooms: ' + JSON.stringify(k?.art));
    raum.state.safes.get(s.id).barrikade = 0;
    c.send('aktion');
    assert.ok(await bis(() => raum.state.safes.get(s.id).barrikade > 0, 5000), 'Barrikade wird nicht gesetzt');
  } finally { await c.leave(); }
});

test('Bots folgen durch die Haustür hinein und nutzen die Vorratskiste im Safe Room', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1, zombieFaktor: 0 };
  const a = await beitreten('Lagerchef');
  try {
    const { raum, p } = a;
    const [bid] = [...raum.extra.entries()].find(([, e]) => e.bot);
    const bot = raum.state.spieler.get(bid);
    raum.state.aufgaben.clear();
    const s = raum.welt.safeRooms[0], w = raum.wv(s.ebene), kiste = raum.state.safes.get(s.id).kiste;
    kiste.clear(); kiste.push('verband'); kiste.push('bretter');
    const innen = raum.nebenKachel(w, w.ausgang);
    p.ebene = s.ebene; p.x = w.start.x; p.y = w.start.y;
    bot.ebene = s.ebene; bot.x = innen.x; bot.y = innen.y;
    bot.rucksack.clear(); for (let i = 0; i < 5; i++) bot.rucksack.push('wasser');
    bot.durst = 100; bot.hp = 45;
    assert.ok(await bis(() => !hat(kiste, 'verband'), 15000), 'Bot nutzt die Kiste nicht: ' + JSON.stringify([...bot.rucksack]) + ' Kiste ' + JSON.stringify([...kiste]) + ` bot (${bot.x.toFixed(0)},${bot.y.toFixed(0)}) kiste (${w.kiste.x.toFixed(0)},${w.kiste.y.toFixed(0)})`);
    assert.equal(raum.state.boden.size, 0, 'Bot wirft im Safe Room auf den Boden');
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});

test('Hund geht mit hinein und folgt drinnen im Maßstab', async () => {
  const { c, raum, p } = await beitreten('Hundeführer');
  try {
    const { w } = hausMit(raum, w => w.kachel && w.breite > 40 && frei(w, w.start.x, w.start.y, 7));
    p.ebene = w.ebene; p.x = w.start.x; p.y = w.start.y;
    const hid = raum.hunde.neuer(p.x + 4, p.y, '', c.sessionId), h = raum.state.hunde.get(hid);
    raum.extra.get(c.sessionId).hund = true;
    assert.ok(await bis(() => h.ebene === w.ebene, 3000), 'Hund kommt nicht mit hinein');
    assert.ok(frei(w, h.x, h.y, 7), 'Hund steht in der Wand');
    assert.ok(Math.hypot(h.x - p.x, h.y - p.y) < 60, 'Hund zu weit weg');
  } finally { await c.leave(); }
});

test('Umschalten im laufenden Spiel: wer drinnen ist, kommt an die Haustür; Safe-Room-Spieler landen im neuen Safe Room', async () => {
  const { c, raum, p } = await beitreten('Umzug');
  const e = SpielRaum.einstellungen;
  const alt = e.innenMassstab;
  try {
    process.env.ZOMBIES_INNEN1M = '';
    const { w, h } = hausMit(raum, () => true);
    p.ebene = w.ebene; p.x = w.start.x; p.y = w.start.y;
    e.innenMassstab = false;
    raum.einstellungenGeaendert();
    assert.equal(INNEN_FEIN, false, 'Schalter nicht aus');
    assert.equal(raum.state.optionen & 2, 0);
    assert.equal(p.ebene, '', 'Spieler noch drinnen');
    assert.ok(frei(raum.wv(''), p.x, p.y, W.spielerRadius));
    assert.ok(Math.hypot(p.x - (h.tuer.x + 0.5) * KACHEL, p.y - (h.tuer.y + 0.5) * KACHEL) < 90, 'nicht an der Haustür');
    assert.equal(raum.wv(`h${h.nr}eg`).kachel, undefined, 'Innenraum noch maßstäblich');
    // wieder an, diesmal im Safe Room
    process.env.ZOMBIES_INNEN1M = '1';
    raum.einstellungenGeaendert();
    assert.equal(INNEN_FEIN, true);
    const s = raum.welt.safeRooms[0];
    const w2 = raum.wv(s.ebene); p.ebene = s.ebene; p.x = w2.start.x; p.y = w2.start.y;
    process.env.ZOMBIES_INNEN1M = '';
    raum.einstellungenGeaendert();
    assert.equal(p.ebene, s.ebene, 'Safe-Room-Spieler muss im Safe Room bleiben');
    const w3 = raum.wv(s.ebene);
    assert.equal(w3.kachel, undefined);
    assert.ok(frei(w3, p.x, p.y, W.spielerRadius), 'Safe-Room-Spieler steht in der Wand des neuen Raums');
  } finally { process.env.ZOMBIES_INNEN1M = '1'; e.innenMassstab = alt; raum.einstellungenGeaendert(); await c.leave(); }
});

test('Mehrere Bots folgen einem Menschen durch die Haustür eines normalen Hauses und eines Safe Rooms hinein und wieder hinaus', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 3, zombieFaktor: 0 };
  const a = await beitreten('Tuerfuehrer');
  try {
    const { raum, p } = a;
    const bots = () => [...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum.state.spieler.get(sid));
    assert.equal(bots().length, 3);
    const sicher = new Set(raum.welt.safeRooms.map(r => r.haus));
    const ziele = [raum.welt.haeuser.find(x => x.betretbar && !sicher.has(x) && raum.wv(`h${x.nr}eg`).breite > 40), raum.welt.safeRooms[0].haus];
    for (const h of ziele) {
      const ebene = `h${h.nr}eg`, w = raum.wv(ebene);
      p.ebene = ebene; p.x = w.start.x; p.y = w.start.y;
      const vor = d => ({ x: (h.tuer.x + 0.5 + h.raus.dx * d) * KACHEL, y: (h.tuer.y + 0.5 + h.raus.dy * d) * KACHEL });
      bots().forEach((b, i) => { b.ebene = ''; b.waffe = ''; b.munition = 0; const q = raum.freierPlatz(vor(1.6), i, ''); b.x = q.x; b.y = q.y; });
      const bericht = () => bots().map(b => `${b.ebene}@${Math.round(b.x)},${Math.round(b.y)}`).join(' ');
      assert.ok(await bis(() => bots().every(b => b.ebene === ebene), 25000), `nicht alle Bots kommen ins Haus ${h.nr}: ` + bericht());
      const aus = raum.freierPlatz(vor(3.5), 0, '');
      p.ebene = ''; p.x = aus.x; p.y = aus.y;
      assert.ok(await bis(() => bots().every(b => b.ebene === '' && Math.hypot(b.x - p.x, b.y - p.y) < 260), 25000), `nicht alle Bots kommen aus Haus ${h.nr} heraus: ` + bericht() + ' ' + JSON.stringify([...raum.extra.entries()].filter(([, x]) => x.bot).map(([sid, x]) => ({ z: x.bot.uebergangZiel, ws: x.bot.wartetSeit, e: x.eingabe, fz: x.bot.festZahl, wo: x.bot.warteOrt, ank: x.ankunft && [Math.round(x.ankunft.x), Math.round(x.ankunft.y)], weg: x.bot.weg?.length, ausg: w.ausgang && [w.ausgang.x, w.ausgang.y] }))) + ' DIAG ' + JSON.stringify(bots().filter(b => b.ebene === ebene).map(b => ({ pos: [b.x, b.y], up: raum.uebergangsPunkt(ebene, ''), aktion: b.aktion, unten: b.unten, plan: [...raum.extra.entries()].filter(([sid]) => raum.state.spieler.get(sid) === b).map(([, x]) => x.bot.weg?.slice(0, 3))  }))) + ' ' + JSON.stringify(bots().filter(b => b.ebene === ebene).map(b => { const k = Math.floor(b.x / 2), l = Math.floor(b.y / 2); const z = []; for (let yy = l - 3; yy <= l + 3; yy++) { let r = ''; for (let xx = k - 6; xx <= k + 6; xx++) r += w.hole(xx, yy) + ','; z.push(r); } return { pos: [b.x, b.y], frei: frei(w, b.x, b.y, 7), freiOben: frei(w, b.x, b.y - 1.5, 7), z }; })));
    }
  } finally { await a.c.leave(); SpielRaum.einstellungen = vorher; }
});
