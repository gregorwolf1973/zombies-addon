// Phase B: Ebenen, Betreten/Verlassen, Treppen, Türen, schlafende Zombies, Bots im Haus
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, T, sichtfrei } from '../client/welt.mjs';

const PORT = 27300 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(f, ms = 3000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

async function beitreten(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0;
  for (const [id, z] of raum.state.zombies) if (!z.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  return { c, raum, p: raum.state.spieler.get(c.sessionId) };
}
const mitte = k => ({ x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });

// Haus mit Keller suchen
function hausMitKeller(raum) {
  for (const h of raum.welt.haeuser) {
    if (!h.betretbar) continue;
    if (raum.wv(`h${h.nr}eg`).hatKeller) return h;
  }
  return null;
}

test('Betreten, Treppe in den Keller, wieder hinauf und hinaus', async () => {
  const { c, raum, p } = await beitreten('Hausbesucher');
  try {
    const h = hausMitKeller(raum);
    assert.ok(h, 'kein Haus mit Keller');
    const vor = mitte(h.tuer), raus = h.tuer.y === h.y ? -1 : 1;
    p.x = vor.x; p.y = vor.y + raus * KACHEL * 1.0;   // direkt vor der Tür ist immer frei
    c.send('eingabe', { dx: 0, dy: -raus });
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 4000), 'nicht hineingekommen');
    c.send('eingabe', { dx: 0, dy: 0 });
    assert.ok(await bis(() => c.state.spieler.get(c.sessionId)?.ebene === `h${h.nr}eg`), 'Client sieht Ebene nicht');
    const eg = raum.wv(p.ebene);
    const treppe = eg.treppen.find(t => t.ziel === 'keller');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const t = mitte(treppe); p.x = t.x; p.y = t.y;
    assert.ok(await bis(() => p.ebene === `h${h.nr}keller`, 2000), 'nicht in den Keller');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const k = raum.wv(p.ebene), hoch = mitte(k.treppen.find(t => t.ziel === 'eg'));
    p.x = hoch.x; p.y = hoch.y;
    assert.ok(await bis(() => p.ebene === `h${h.nr}eg`, 2000), 'nicht zurück ins EG');
    await warte(400); raum.extra.get(c.sessionId).ankunft = null;
    const a = mitte(eg.ausgang); p.x = a.x; p.y = a.y;
    assert.ok(await bis(() => p.ebene === '', 2000), 'nicht hinaus');
    assert.ok(Math.hypot(p.x - vor.x, p.y - vor.y) < 70, 'nicht vor der Haustür gelandet');
  } finally { await c.leave(); }
});

test('Türen: öffnen/schließen, Schlüssel, Brechstange, Rätsel; schlafender Zombie wacht erst bei offener Tür auf', async () => {
  const { c, raum, p } = await beitreten('Türöffner');
  try {
    const fragen = [];
    c.onMessage('raetsel', m => fragen.push(m));
    // Haus mit verschlossener Tür und Zombieplatz suchen
    let w = null;
    for (const h of raum.welt.haeuser) {
      if (!h.betretbar) continue;
      const kand = raum.wv(`h${h.nr}eg`);
      if (kand.tueren.some(t => t.verschlossen) && kand.tueren.some(t => !t.verschlossen)) { w = kand; break; }
    }
    assert.ok(w, 'kein passendes Haus');
    for (const [id, z] of raum.state.zombies) if (z.ebene === w.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    w.behaelter = [];   // Durchsuchen hätte Vorrang vor „Tür schließen“
    p.ebene = w.ebene;
    const nebenTuer = t => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (w.hole(t.x + dx, t.y + dy) === T.BODEN) return { x: (t.x + dx + 0.5) * KACHEL, y: (t.y + dy + 0.5) * KACHEL }; };
    const offen = w.tueren.find(t => !t.verschlossen), key = `${w.ebene}:${offen.x},${offen.y}`;
    Object.assign(p, nebenTuer(offen));
    c.send('aktion');
    assert.ok(await bis(() => raum.state.tueren.get(key).offen), 'Tür geht nicht auf');
    assert.equal(w.hole(offen.x, offen.y), T.TUER_OFFEN);
    c.send('aktion');
    assert.ok(await bis(() => !raum.state.tueren.get(key).offen), 'Tür geht nicht zu');
    // verschlossen: mit Schlüssel
    const zu = w.tueren.filter(t => t.verschlossen);
    const k1 = `${w.ebene}:${zu[0].x},${zu[0].y}`;
    Object.assign(p, nebenTuer(zu[0])); p.rucksack.clear(); p.rucksack.push('schluessel');
    c.send('aktion');
    assert.ok(await bis(() => raum.state.tueren.get(k1).offen, 3000), 'Schlüssel wirkt nicht');
    assert.ok(p.rucksack.includes('schluessel'), 'Schlüsselbund verbraucht');
    // ohne Werkzeug: Rätsel (an einer anderen verschlossenen Tür, notfalls derselben nach Zurücksetzen)
    const t2 = zu[1] ?? zu[0], k2 = `${w.ebene}:${t2.x},${t2.y}`;
    raum.state.tueren.get(k2).verschlossen = true; raum.setzeTuer(k2, false); raum.state.tueren.get(k2).verschlossen = true;
    Object.assign(p, nebenTuer(t2)); p.rucksack.clear();
    c.send('aktion');
    assert.ok(await bis(() => fragen.length === 1 && fragen[0].tuer), 'kein Türrätsel');
    const offenR = raum.offeneRaetsel.get(c.sessionId);
    c.send('antwort', { id: fragen[0].id, index: offenR.richtigIndex });
    assert.ok(await bis(() => raum.state.tueren.get(k2).offen), 'Rätsel öffnet nicht');
    // Brechstange
    raum.setzeTuer(k2, false); raum.state.tueren.get(k2).verschlossen = true;
    p.rucksack.push('brechstange');
    c.send('aktion');
    assert.ok(await bis(() => raum.state.tueren.get(k2).offen, 4000), 'Brechstange wirkt nicht');
  } finally { await c.leave(); }
});

test('Schlafender Zombie hinter geschlossener Tür bleibt liegen, wacht bei offener Tür auf', async () => {
  const { c, raum, p } = await beitreten('Weckdienst');
  try {
    p.waffe = ''; p.munition = 0;
    let w = null, tuer = null, zid = null;
    for (const h of raum.welt.haeuser) {
      if (!h.betretbar) continue;
      w = raum.wv(`h${h.nr}eg`);
      for (const [id, z] of raum.state.zombies) {
        if (z.ebene !== w.ebene) continue;
        // Tür, von der aus man (offen) den Zombie sehen würde
        tuer = w.tueren.find(t => {
          const cx = (t.x + 0.5) * KACHEL, cy = (t.y + 0.5) * KACHEL;
          if (Math.hypot(cx - z.x, cy - z.y) > 125) return false;
          const alt = w.kacheln[t.y * 64 + t.x]; w.kacheln[t.y * 64 + t.x] = T.TUER_OFFEN;
          const ok = sichtfrei(w, cx, cy, z.x, z.y); w.kacheln[t.y * 64 + t.x] = alt;
          return ok;
        });
        if (tuer) { zid = id; break; }
      }
      if (zid) break;
    }
    assert.ok(zid, 'kein schlafender Zombie neben einer Tür');
    const z = raum.state.zombies.get(zid), key = `${w.ebene}:${tuer.x},${tuer.y}`;
    raum.setzeTuer(key, false);
    // Spieler auf die andere Seite der Tür
    let seite = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const q = { x: (tuer.x + dx * 1.5 + 0.5) * KACHEL, y: (tuer.y + dy * 1.5 + 0.5) * KACHEL };
      if (w.hole(tuer.x + dx, tuer.y + dy) === T.BODEN && Math.hypot(q.x - z.x, q.y - z.y) > Math.hypot((tuer.x + 0.5) * KACHEL - z.x, (tuer.y + 0.5) * KACHEL - z.y)) seite = q;
    }
    assert.ok(seite);
    p.ebene = w.ebene; p.x = seite.x; p.y = seite.y;
    const z0 = { x: z.x, y: z.y };
    await warte(800);
    assert.equal(raum.zombieInfo.get(zid).schlaeft, true, 'Zombie wacht durch die geschlossene Tür auf');
    assert.ok(Math.hypot(z.x - z0.x, z.y - z0.y) < 2, 'schlafender Zombie bewegt sich');
    raum.setzeTuer(key, true);
    // Sicht kann vom Winkel abhängen: Spieler in die Tür stellen
    p.x = (tuer.x + 0.5) * KACHEL; p.y = (tuer.y + 0.5) * KACHEL;
    assert.ok(await bis(() => !raum.zombieInfo.get(zid)?.schlaeft, 3000), 'Zombie wacht bei offener Tür nicht auf');
  } finally { await c.leave(); }
});

test('Bot folgt ins Haus und in den Keller', async () => {
  const vorher = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...vorher, bots: 1 };
  const { c, raum, p } = await beitreten('Kellerkind');
  try {
    const [bid] = [...raum.extra.entries()].find(([, x]) => x.bot);
    const bot = raum.state.spieler.get(bid);
    bot.waffe = ''; bot.munition = 0;
    const h = hausMitKeller(raum);
    // der Mensch ist durch die Türen gegangen: alle Türen im Erdgeschoss offen
    const eg = raum.wv(`h${h.nr}eg`);
    for (const t of eg.tueren) raum.setzeTuer(`${eg.ebene}:${t.x},${t.y}`, true);
    for (const [id, z] of raum.state.zombies) if (z.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    const vor = mitte(h.tuer), raus = h.tuer.y === h.y ? -1 : 1;
    bot.x = vor.x; bot.y = vor.y + raus * KACHEL;   // direkt vor der Tür (zwei Kacheln wären evtl. der Randzaun)
    globalThis.__botSpur = [];
    const spur = setInterval(() => globalThis.__botSpur.push([Math.round(bot.x), Math.round(bot.y), bot.ebene]), 500);
    after(() => clearInterval(spur));
    p.ebene = `h${h.nr}keller`; const k = raum.wv(p.ebene); p.x = k.start.x; p.y = k.start.y;
    for (const [id, z] of raum.state.zombies) if (z.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
    assert.ok(await bis(() => bot.ebene === `h${h.nr}eg`, 8000), 'Bot geht nicht ins Haus: Tür ' + JSON.stringify(h.tuer) + ' Spur ' + JSON.stringify(globalThis.__botSpur.slice(-6)));
    const tr = eg.treppen.find(t => t.ziel === 'keller');
    assert.ok(await bis(() => bot.ebene === `h${h.nr}keller`, 12000), 'Bot geht nicht in den Keller: Treppe ' + JSON.stringify([(tr.x + 0.5) * KACHEL, (tr.y + 0.5) * KACHEL]) + ' Spur ' + JSON.stringify(globalThis.__botSpur.slice(-5)) + ' Ziel ' + JSON.stringify(raum.extra.get(bid).bot.uebergangZiel) + ' Weg ' + JSON.stringify(raum.extra.get(bid).bot.weg));
  } finally {
    await c.leave();
    SpielRaum.einstellungen = vorher;
  }
});

test('Nach dem Betreten läuft man mit gehaltener Taste nicht sofort wieder hinaus', async () => {
  const { c, raum, p } = await beitreten('Tastenhalter');
  try {
    const h = raum.welt.haeuser.find(h => h.betretbar && h.tuer.y !== h.y) ?? raum.welt.haeuser.find(h => h.betretbar);
    const vor = mitte(h.tuer), raus = h.tuer.y === h.y ? -1 : 1;
    p.x = vor.x; p.y = vor.y + raus * KACHEL;
    c.send('eingabe', { dx: 0, dy: -raus });          // auf die Tür zu …
    assert.ok(await bis(() => p.ebene !== '', 4000), 'nicht hineingekommen');
    c.send('eingabe', { dx: 0, dy: 1 });              // … und mit gedrückter Taste nach unten weiter (Ausgang liegt unten)
    await warte(1500);
    assert.notEqual(p.ebene, '', 'sofort wieder draußen');
    // weggehen und zurück: dann geht es hinaus
    c.send('eingabe', { dx: 0, dy: -1 }); await warte(700);
    c.send('eingabe', { dx: 0, dy: 1 });
    assert.ok(await bis(() => p.ebene === '', 4000), 'kommt nicht mehr hinaus');
    c.send('eingabe', { dx: 0, dy: 0 });
  } finally { await c.leave(); }
});

test('Taschenlampe: schaltet drinnen ein, verbraucht sich, nächste aus dem Rucksack', async () => {
  const { c, raum, p } = await beitreten('Lampenträger');
  try {
    p.rucksack.clear(); p.rucksack.push('taschenlampe'); p.rucksack.push('taschenlampe');
    await warte(300);
    assert.equal(p.lampe, 0, 'leuchtet draußen');
    const h = raum.welt.haeuser.find(h => h.betretbar);
    p.ebene = `h${h.nr}eg`; const w = raum.wv(p.ebene); p.x = w.start.x; p.y = w.start.y;
    assert.ok(await bis(() => p.lampe > 3590), 'schaltet nicht ein');
    assert.equal(p.rucksack.length, 1);
    const l0 = p.lampe; await warte(500);
    assert.ok(p.lampe < l0, 'verbraucht sich nicht');
    p.lampe = 0.01;
    assert.ok(await bis(() => p.rucksack.length === 0 && p.lampe > 3590), 'nächste Lampe nicht genommen');
  } finally { await c.leave(); }
});
