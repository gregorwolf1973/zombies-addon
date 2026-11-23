// Beute-Regeln: Möbelanteil, Kofferraum-Munition, Munition bei Leichen, Granatwerfer im Container, Karte (Fundorte, Ring) – server/raum.mjs, fundorte.mjs, aufgaben.mjs
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
import { BEUTE, LEICHE_SELTEN, LEICHE_OFT, MOEBEL_ANTEIL, MOEBEL_ARTEN, KACHEL } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { gesuchteDinge, fundorteListe, behaelterPosition } from '../server/fundorte.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-beute-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });
async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
async function beitreten(name = 'Sepp') {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), client: { sessionId: c.sessionId, send(t, m) { (this.log ??= []).push([t, m]); } } };
}
const fuell = (raum, art, i, extra = {}) => { const b = { id: `test:${art}:${i}`, art, x: 0, y: 0, ...extra }; raum.befuelle(b); return raum.inhalte.get(b.id); };

test('Konstanten und Einstellung: Möbelanteil 30 %, Munition nicht mehr in Kofferraum-/Leichentabelle, kein Munitionsglück mehr', () => {
  assert.equal(MOEBEL_ANTEIL, 30);
  assert.equal(vorgaben().beute.moebel, 30);
  assert.equal(bereinige({ beute: { moebel: 55 } }).beute.moebel, 55);
  assert.equal(bereinige({ beute: { moebel: 999 } }).beute.moebel, 100);
  assert.equal(bereinige({ munitionsglueck: { schritt: 5 }, beute: {} }).munitionsglueck, undefined, 'alte Werte dürfen nichts kaputtmachen, fallen aber weg');
  assert.ok(!BEUTE.auto.includes('munition') && !BEUTE.auto.includes('munitionskiste'));
  assert.ok(!LEICHE_SELTEN.includes('munition') && !LEICHE_OFT.includes('munition'));
  assert.ok(!BEUTE.bw_container.includes('granatwerfer'));
  for (const a of MOEBEL_ARTEN) assert.ok(!/^laden|^bw_|^auto$|^bus$|^leiche$/.test(a), a + ' darf kein Möbel im Sinne der Regel sein');
});

test('Möbel: nur 30 % enthalten etwas (dann mindestens 1 Ding); Läden, Autos, Bundeswehr-Kisten bleiben unberührt', async () => {
  await frisch();
  const { c, raum } = await beitreten();
  try {
    const N = 3000, einst = SpielRaum.einstellungen;
    const quote = art => { let voll = 0; for (let i = 0; i < N; i++) { const f = fuell(raum, art, i); if (f.length) voll++; } return voll / N; };
    for (const art of ['schrank', 'spind', 'herd', 'kuehlschrank', 'bad', 'muelltonne', 'container', 'aktenschrank', 'werkbank', 'kartonstapel']) {
      const q = quote(art);
      assert.ok(q > 0.24 && q < 0.36, `${art}: gefüllt ${q}`);
    }
    // 30 % ziehen wie bisher, aber ohne Nullergebnis: nie ein leerer Behälter unter den gefüllten (Länge ≥ 1 ist oben schon die Bedingung für „voll“)
    einst.beute = { moebel: 100 };
    for (let i = 0; i < 500; i++) assert.ok(fuell(raum, 'muelltonne', 'a' + i).length >= 1, 'gefüllter Müllbehälter ohne Inhalt');
    einst.beute = { moebel: 0 };
    for (let i = 0; i < 300; i++) assert.equal(fuell(raum, 'schrank', 'b' + i).length, 0, 'Möbel trotz 0 % gefüllt');
    // Ausnahmen: Läden unabhängig vom Möbelanteil
    let laden = 0; for (let i = 0; i < 500; i++) if (fuell(raum, 'laden_lebensmittel', i).length) laden++;
    assert.ok(laden / 500 > 0.8, 'Laden vom Möbelanteil betroffen: ' + laden / 500);
    let bw = 0; for (let i = 0; i < 300; i++) if (fuell(raum, 'bw_container', i).length) bw++;
    assert.ok(bw / 300 > 0.8, 'Bundeswehr-Container vom Möbelanteil betroffen');
    // Missionsgegenstände kommen immer dazu, auch in einem leeren Möbel
    const m = raum.aufgaben.mission[0];
    raum.inhalte.delete(m.behaelter); raum.befuelle({ id: m.behaelter, art: 'schrank', x: 0, y: 0 });
    assert.ok(raum.inhalte.get(m.behaelter).includes(m.ding), 'Missionsgegenstand fehlt im leeren Möbel');
    einst.beute = { moebel: MOEBEL_ANTEIL };
  } finally { SpielRaum.einstellungen.beute = { moebel: MOEBEL_ANTEIL }; await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('Kofferraum: Munition mit 15 %, Bundeswehr-Container: Granatwerfer mit 30 %', async () => {
  await frisch();
  const { c, raum } = await beitreten();
  try {
    const N = 4000;
    let mun = 0, gw = 0;
    for (let i = 0; i < N; i++) { if (fuell(raum, 'auto', i).some(d => d === 'munition' || d === 'munitionskiste')) mun++; if (fuell(raum, 'bw_container', i).includes('granatwerfer')) gw++; }
    assert.ok(mun / N > 0.12 && mun / N < 0.18, 'Auto-Munition ' + mun / N);
    assert.ok(gw / N > 0.26 && gw / N < 0.34, 'Granatwerfer ' + gw / N);
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('Tote Zombies: 15 % Munition mit 5–12 Schuss (je Leiche gespeichert), Menge beim Nehmen und in der Fundliste', async () => {
  await frisch();
  const { c, raum, p, client } = await beitreten();
  try {
    const N = 3000, mengen = [];
    p.x = 100; p.y = 100;
    for (let i = 0; i < N; i++) {
      const id = raum.neueLeiche({ x: 100, y: 100, richtung: 0, ebene: '' }, true);
      if (raum.leichenInhalt.get(id).includes('munition')) mengen.push([id, raum.leichenMunition.get(id)]);
    }
    assert.ok(mengen.length / N > 0.12 && mengen.length / N < 0.19, 'Leichen-Munition ' + mengen.length / N);
    assert.ok(mengen.every(([, n]) => n >= 5 && n <= 12), 'Menge außerhalb 5–12');
    assert.ok(new Set(mengen.map(([, n]) => n)).size >= 6, 'Mengen nicht gestreut');
    // Nehmen per Durchsuchen
    const [id, n] = mengen[0];
    p.munition = 0; p.waffe = 'pistole';
    raum.leicheDurchsucht(client, p, id);
    assert.equal(p.munition, n, 'Menge je Leiche nicht übernommen');
    assert.equal(client.log.at(-1)[1].schuss, n);
    // Fundliste/fundNimm
    const [id2, n2] = mengen[1];
    const x = raum.extra.get(client.sessionId); x.fundIds = [id2];
    raum.state.leichen.get(id2).x = p.x; raum.state.leichen.get(id2).y = p.y;
    raum.fundSenden(client, p);
    const liste = client.log.filter(l => l[0] === 'fundliste').at(-1)[1].eintraege.find(e => e.id === id2);
    assert.equal(liste.mengen.munition, n2, 'Menge fehlt in der Fundliste');
    p.munition = 0;
    raum.fundNimm(client, { id: id2, i: liste.dinge.indexOf('munition') });
    assert.equal(p.munition, n2, 'fundNimm gibt feste Menge nicht');
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('Karte: Ring folgt dem Missionsgegenstand (getragen = weg, am Boden = dort), gesuchte Dinge in offenen Behältern als Fundorte', async () => {
  await frisch();
  const { c, raum, p } = await beitreten();
  try {
    const ag = raum.aufgaben, m = ag.mission[0], q = raum.state.missionen.get(m.id);
    assert.equal(q.getragen, false);
    ag.orteSync();
    assert.equal(q.x, Math.round(m.x));
    // getragen: Ring weg
    p.rucksack.push(m.ding); ag.orteSync();
    assert.equal(q.getragen, true);
    // fallen gelassen: Ring dort
    p.rucksack.splice(0, p.rucksack.length);
    const id = raum.legeHin(m.ding, 1234, 567, '');
    ag.orteSync();
    const bd = raum.state.boden.get(id);
    assert.equal(q.getragen, false); assert.equal(q.x, Math.round(bd.x)); assert.equal(q.y, Math.round(bd.y)); assert.ok(Math.hypot(q.x - 1234, q.y - 567) < 60);
    raum.state.boden.delete(id); ag.orteSync();
    assert.equal(q.x, Math.round(m.x), 'zurück am Plan-Ort');
    // Fundorte: gesuchte Dinge in einem geöffneten Behälter (Wohnhaus) und am Boden
    for (const a of raum.state.aufgaben.values()) a.erledigt = true;
    assert.equal(gesuchteDinge(raum.state).size, 0);
    const a = raum.state.aufgaben.get('vorraete') ?? (() => { ag.neu('vorraete', false); return raum.state.aufgaben.get('vorraete'); })();
    a.erledigt = false;
    assert.deepEqual([...gesuchteDinge(raum.state)].sort(), ['essen', 'wasser']);
    const haus = raum.welt.haeuser.find(h => h.betretbar && !h.safe), w = raum.wv(`h${haus.nr}eg`);
    const bh = w.behaelter[0];
    raum.inhalte.set(bh.id, ['wasser', 'seil']);
    raum.legeHin('essen', 400, 300, '');
    const liste = fundorteListe(raum, gesuchteDinge(raum.state));
    const imHaus = liste.find(([, , d]) => d === 'wasser');
    assert.ok(imHaus, 'Wasser im Behälter fehlt');
    assert.ok(imHaus[0] >= haus.x * KACHEL - 8 && imHaus[0] <= (haus.x + haus.b) * KACHEL + 8 && imHaus[1] >= haus.y * KACHEL - 8 && imHaus[1] <= (haus.y + haus.h) * KACHEL + 8, 'Punkt nicht am Haus');
    assert.ok(liste.some(([x, y, d]) => d === 'essen' && Math.hypot(x - 400, y - 300) < 60), 'Boden-Essen fehlt');
    assert.ok(!liste.some(([, , d]) => d === 'seil'));
    // Nachricht geht an die Clients (bei Änderung)
    const msgs = []; const alt = raum.broadcast.bind(raum); raum.broadcast = (t, mm) => { if (t === 'fundorte') msgs.push(mm); return alt(t, mm); };
    ag.orteJson = null; ag.orteSek = 1; ag.orteSync();
    assert.ok(msgs.length === 1 && msgs[0].l.length >= 2, 'fundorte nicht gesendet');
    ag.orteSek = 1; ag.orteSync(); assert.equal(msgs.length, 1, 'ohne Änderung nicht erneut senden');
    raum.broadcast = alt;
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});

test('Aufgaben-Funde: fest in passende Behälter gelegt (Bedarf + Reserve), garantiert auch in leeren Möbeln, Punkt weg nach Entnahme, wird gespeichert', async () => {
  await frisch();
  const { c, raum, p, client } = await beitreten();
  try {
    const ag = raum.aufgaben, s = raum.state;
    for (const id of ['medizin', 'vorraete', 'lampen', 'bretter']) { if (!s.aufgaben.has(id)) ag.neu(id, false); s.aufgaben.get(id).erledigt = false; }
    ag.fundePlanen();
    const plan = ag.fundePlan, je = d => plan.filter(e => e.ding === d);
    assert.equal(je('spritze').length, 2, 'Spritze: Bedarf 1 + Reserve');
    assert.ok(je('wasser').length >= 3 && je('essen').length >= 3 && je('taschenlampe').length >= 2 && je('bretter').length >= 2, JSON.stringify(plan));
    assert.equal(new Set(plan.map(e => e.behaelter)).size, plan.length, 'Behälter doppelt belegt');
    // passende Behälterarten (soweit Häuser dafür da sind): Spritze bevorzugt Apotheke/Sanitätsraum
    const art = id => raum.wv(/^h\d+eg/.exec(id)[0]).behaelter.find(b => b.id === id)?.art;
    for (const e of plan) assert.ok(art(e.behaelter), 'Behälter existiert nicht: ' + e.behaelter);
    const apo = raum.welt.haeuser.some(h => h.betretbar && !h.safe && h.art && ['pharmacy', 'chemist'].includes(h.art));
    if (apo) assert.ok(je('spritze').some(e => ['laden_apotheke', 'erstehilfe', 'sanikiste'].includes(art(e.behaelter))), 'Spritze nicht in passendem Behälter');
    // deterministisch und ohne die übrige Zufallsfolge zu verschieben
    const r0 = raum.rnd;
    assert.deepEqual(aufgabenFundePlanGleich(raum), plan);
    assert.equal(raum.rnd, r0);
    // garantiert beim Befüllen, auch bei 0 % Möbelanteil
    SpielRaum.einstellungen.beute = { moebel: 0 };
    const e0 = plan[0];
    raum.befuelle({ id: e0.behaelter, art: 'schrank', x: 0, y: 0 });
    assert.ok(raum.inhalte.get(e0.behaelter).includes(e0.ding), 'Aufgaben-Fund fehlt im leeren Möbel');
    SpielRaum.einstellungen.beute = { moebel: MOEBEL_ANTEIL };
    // Punkte: ungeöffnete Behälter zeigen den Punkt, geöffnete mit Inhalt auch, nach Entnahme nicht mehr
    let liste = fundorteListe(raum, gesuchteDinge(s, ag.medizin));
    const ist = e => behaelterPosition(raum, e.behaelter);
    const hat = e => { const [x, y] = ist(e); return liste.some(([px, py, d]) => d === e.ding && Math.abs(px - x) < 9 && Math.abs(py - y) < 9); };
    assert.ok(plan.slice(1).every(hat), 'Punkt fehlt an eingeplantem Behälter');
    assert.ok(hat(e0), 'Punkt fehlt am geöffneten Behälter mit Inhalt');
    raum.inhalte.set(e0.behaelter, raum.inhalte.get(e0.behaelter).filter(d => d !== e0.ding));
    liste = fundorteListe(raum, gesuchteDinge(s, ag.medizin));
    assert.ok(!hat(e0), 'Punkt bleibt nach Entnahme');
    // Aufgabe erledigt: Punkte dieser Aufgabe weg
    s.aufgaben.get('medizin').erledigt = true;
    assert.ok(!fundorteListe(raum, gesuchteDinge(s, ag.medizin)).some(([, , d]) => d === 'spritze'));
    // Speichern/Laden
    const gespeichert = JSON.parse(JSON.stringify(ag.speichern()));
    assert.deepEqual(gespeichert.funde, plan);
    ag.fundePlan = [];
    ag.fundePlanen(gespeichert.funde);
    assert.deepEqual(ag.fundePlan, plan);
  } finally { SpielRaum.einstellungen.beute = { moebel: MOEBEL_ANTEIL }; await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
});
function aufgabenFundePlanGleich(raum) { const alt = raum.aufgaben.fundePlan; raum.aufgaben.fundePlanen(); const neu = raum.aufgaben.fundePlan; raum.aufgaben.fundePlan = alt; return neu; }
