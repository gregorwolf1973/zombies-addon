// Phase B: Ebenen, Betreten/Verlassen, Treppen, Türen, schlafende Zombies, Bots im Haus
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, T, sichtfrei, frei } from '../client/welt.mjs';
import { hausHell, helligkeit, istNacht } from '../client/welt.mjs';

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
    // normal gehen (nicht schleichen) – still stehende oder schleichende Spieler wecken ihn erst aus der Nähe
    const l = Math.hypot(z.x - p.x, z.y - p.y);
    c.send('eingabe', { dx: (z.x - p.x) / l, dy: (z.y - p.y) / l });
    assert.ok(await bis(() => !raum.zombieInfo.get(zid)?.schlaeft, 3000), 'Zombie wacht bei offener Tür nicht auf');
    c.send('eingabe', { dx: 0, dy: 0 });
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
    // schlafende Zombies im Haus könnten aufwachen und die Figur festhalten – hier geht es nur um die Tür
    for (const [id, z] of raum.state.zombies) if (z.ebene === p.ebene) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
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
    raum.state.uhr = 12 * 60;   // mittags: draußen hell
    await warte(300);
    assert.equal(p.lampe, 0, 'leuchtet draußen');
    // ein Haus, das tagsüber dunkel ist (etwa 30 %)
    const h = raum.welt.haeuser.find(h => h.betretbar && !hausHell(h.nr, 'eg', 12 * 60));
    p.ebene = `h${h.nr}eg`; const w = raum.wv(p.ebene); p.x = w.start.x; p.y = w.start.y;
    assert.ok(await bis(() => p.lampe > 3590), 'schaltet nicht ein');
    assert.equal(p.rucksack.length, 1);
    const l0 = p.lampe; await warte(500);
    assert.ok(p.lampe < l0, 'verbraucht sich nicht');
    p.lampe = 0.01;
    assert.ok(await bis(() => p.rucksack.length === 0 && p.lampe > 3590), 'nächste Lampe nicht genommen');
  } finally { await c.leave(); }
});

test('Tag und Nacht: Dämmerung, helle Häuser, Lampe draußen nur nachts', async () => {
  assert.equal(helligkeit(12 * 60), 1); assert.equal(helligkeit(0), 0);
  assert.ok(helligkeit(20 * 60) > 0 && helligkeit(20 * 60) < 1, 'Abenddämmerung');
  assert.ok(istNacht(23 * 60) && !istNacht(10 * 60));
  const hell = Array.from({ length: 400 }, (_, i) => hausHell(i, 'eg', 720)).filter(Boolean).length;
  assert.ok(hell > 240 && hell < 320, `tagsüber hell: ${hell} von 400`);
  assert.ok(!hausHell(3, 'keller', 720) && !hausHell(3, 'eg', 0), 'Keller und Nacht dunkel');
  const { c, raum, p } = await beitreten('Nachtwanderer');
  try {
    p.rucksack.clear(); p.rucksack.push('taschenlampe'); p.ebene = '';
    raum.state.uhr = 23 * 60;
    assert.ok(await bis(() => p.lampe > 0), 'Lampe geht nachts draußen nicht an');
    raum.zombieFaktor = 1;
    const nachts = raum.zombieSollJetzt(); raum.state.uhr = 12 * 60;
    assert.ok(nachts > raum.zombieSollJetzt(), 'nachts nicht mehr Zombies');
    raum.zombieFaktor = 0;
  } finally { await c.leave(); }
});

test('Anschleichen: von hinten schleichend unbemerkt, erster Schlag mit Überraschung, dann jagt er', async () => {
  const { c, raum, p } = await beitreten('Pirscher');
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    p.ebene = ''; p.waffe = 'messer'; p.munition = 0;
    const welt = raum.welt;
    // freie Stelle draußen suchen
    let ort = null;
    for (let y = 5; y < 40 && !ort; y++) for (let x = 5; x < 60 && !ort; x++) {
      const px = x * KACHEL + 16, py = y * KACHEL + 16;
      if ([0, 40, 80].every(dx => frei(welt, px + dx, py, 16))) ort = { x: px, y: py };
    }
    assert.ok(ort, 'kein freier Platz');
    raum.setzeZombie(ort.x + 80, ort.y, '');
    const [zid, z] = [...raum.state.zombies.entries()].at(-1);
    z.richtung = 0;                                     // schaut nach rechts, weg vom Spieler
    raum.zombieInfo.get(zid).wechsel = 99;
    p.x = ort.x; p.y = ort.y;
    // der Zombie bleibt stehen und schaut weg, solange er nichts bemerkt (hier wird nur das Bemerken geprüft)
    const halten = setInterval(() => { if (!raum.zombieInfo.get(zid)?.ziel) { z.x = ort.x + 80; z.y = ort.y; z.richtung = 0; } }, 20);
    c.send('eingabe', { dx: 0.4, dy: 0, s: true });     // schleichen
    try { assert.ok(await bis(() => z.hp < 100 || !raum.state.zombies.has(zid), 6000), 'kein Schlag'); } finally { clearInterval(halten); }
    // Messer von hinten: 30 × 4 = tödlich
    assert.ok(!raum.state.zombies.has(zid) || z.kriecht, 'Überraschungsschlag nicht tödlich');
  } finally { c.send('eingabe', { dx: 0, dy: 0 }); await c.leave(); }
});

test('Neue Waffen: Schrot trifft mehrere und braucht Munition, Sense mäht im Bogen, Gewehr reicht weit', async () => {
  const { c, raum, p } = await beitreten('Waffenmeister');
  let halten = null;
  try {
    raum.zombieFaktor = 0;
    const welt = raum.welt;
    let ort = null;
    for (let y = 5; y < 40 && !ort; y++) for (let x = 5; x < 55 && !ort; x++) {
      const px = x * KACHEL + 16, py = y * KACHEL + 16;
      if ([0, 60, 120, 200, 300].every(dx => [-40, 0, 40].every(dy => frei(welt, px + dx, py + dy, 16)))
        && [[300, 0], [90, -12], [100, 14], [40, -25], [40, 25]].every(([dx, dy]) => sichtfrei(welt, px, py, px + dx, py + dy))) ort = { x: px, y: py };
    }
    assert.ok(ort, 'kein freier Platz');
    const aufstellen = punkte => {
      clearInterval(halten);
      raum.state.zombies.clear(); raum.zombieInfo.clear();
      const plaetze = [];
      for (const [dx, dy] of punkte) { raum.setzeZombie(ort.x + dx, ort.y + dy, ''); const z = [...raum.state.zombies.values()].at(-1); z.richtung = Math.PI; plaetze.push([z, ort.x + dx, ort.y + dy]); }
      for (const [id, z] of raum.state.zombies) { const i = raum.zombieInfo.get(id); i.ziel = c.sessionId; z.jagt = true; }   // kein Überraschungsbonus
      // festhalten: geprüft wird nur, wen die Waffe trifft
      halten = setInterval(() => { for (const [z, x, y] of plaetze) { z.x = x; z.y = y; } p.x = ort.x; p.y = ort.y; p.hp = 100; p.unten = false; }, 10);
      return plaetze.map(q => q[0]);
    };
    p.ebene = ''; p.x = ort.x; p.y = ort.y;
    // Schrotflinte: zwei Zombies nebeneinander vorne
    p.waffe = 'schrotflinte'; p.munition = 3;
    let zs = aufstellen([[90, -12], [100, 14]]);
    assert.ok(await bis(() => zs.every(z => z.hp < 100), 3000), 'Schrot trifft nicht beide: ' + JSON.stringify(zs.map(z => [Math.round(z.hp), Math.round(z.x - ort.x), Math.round(z.y - ort.y)])) + ' Munition ' + p.munition + ' Zombies ' + raum.state.zombies.size);
    assert.ok(p.munition < 3, 'keine Munition verbraucht');
    // Sense: zwei Zombies links und rechts vorne
    p.waffe = 'sense'; p.munition = 0; p.x = ort.x; p.y = ort.y;
    zs = aufstellen([[40, -25], [40, 25]]);
    assert.ok(await bis(() => zs.every(z => z.hp < 100), 3000), 'Sense trifft nicht beide');
    // Gewehr: weit entfernter Zombie
    p.waffe = 'gewehr'; p.munition = 2; p.x = ort.x; p.y = ort.y;
    zs = aufstellen([[300, 0]]);
    assert.ok(await bis(() => zs[0].hp < 100 || !raum.state.zombies.size, 3000), 'Gewehr reicht nicht');
  } finally { clearInterval(halten); await c.leave(); }
});

test('Schussreichweite je Waffe einstellbar', async () => {
  const { c, raum, p } = await beitreten('Scharfschütze');
  const vorher = SpielRaum.einstellungen;
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const welt = raum.welt;
    let ort = null;
    for (let y = 5; y < 40 && !ort; y++) for (let x = 5; x < 55 && !ort; x++) {
      const px = x * KACHEL + 16, py = y * KACHEL + 16;
      if ([0, 80, 160].every(dx => frei(welt, px + dx, py, 16)) && sichtfrei(welt, px, py, px + 160, py)) ort = { x: px, y: py };
    }
    p.ebene = ''; p.waffe = 'pistole'; p.munition = 5; p.x = ort.x; p.y = ort.y;
    const zid = raum.setzeZombie(ort.x + 160, ort.y, ''), z = raum.state.zombies.get(zid);
    raum.zombieInfo.get(zid).ziel = c.sessionId; z.jagt = true;
    const halten = setInterval(() => { z.x = ort.x + 160; z.y = ort.y; p.x = ort.x; p.y = ort.y; p.hp = 100; }, 10);
    try {
      SpielRaum.einstellungen = { ...vorher, reichweite: { pistole: 10 } };    // 10 m = 80 px: zu kurz
      await warte(800);
      assert.equal(z.hp, 100, 'schießt über die eingestellte Reichweite hinaus');
      SpielRaum.einstellungen = { ...vorher, reichweite: { pistole: 40 } };    // 40 m = 320 px
      assert.ok(await bis(() => z.hp < 100 || !raum.state.zombies.has(zid), 2000), 'schießt nicht trotz Reichweite');
    } finally { clearInterval(halten); }
  } finally { SpielRaum.einstellungen = vorher; await c.leave(); }
});
