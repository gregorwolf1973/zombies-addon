// Steuerung der simulierten Mitspieler (zweite Fassung, Claude): Wegsuche über Kacheln, feste Plätze hinter
// dem Anführer, Abstand zu allen Figuren, bewaffnete Bots kämpfen. Ein Bot steuert sich nur über x.eingabe.
import { frei, sichtfrei, safeRoomAn, findeWeg, KACHEL, WAFFEN, DINGE, AKTION_ABSTAND } from '../client/welt.mjs';

export const BOT_NAMEN = ['Resi', 'Vroni', 'Sepp', 'Wastl', 'Kathi', 'Hias', 'Burgi', 'Girgl', 'Loisl', 'Zenzi'];

const RAD = 11;
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function bewaffnet(p) {
  const w = WAFFEN[p.waffe];
  if (w?.fern && p.munition > 0) return 'fern';
  if (w && !w.fern) return 'nah';
  return null;
}

// Selbstversorgung direkt am Zustand (höchstens alle 1 s)
function versorgen(p, b, jetzt) {
  if (jetzt - (b.versorgt ?? 0) < 1) return;
  const nimm = (d, f) => { const i = p.rucksack.indexOf(d); if (i < 0) return false; p.rucksack.splice(i, 1); f(); b.versorgt = jetzt; return true; };
  if (p.infektion > 0 && nimm('spritze', () => { p.infektion = 0; })) return;
  if (p.hp < 40 && nimm('verband', () => { p.hp = Math.min(100, p.hp + 45); })) return;
  if (p.durst < 35 && nimm('wasser', () => { p.durst = Math.min(100, p.durst + 45); })) return;
  if (p.hunger < 35 && (nimm('essen', () => { p.hunger = Math.min(100, p.hunger + 45); }) || nimm('schokoriegel', () => { p.hunger = Math.min(100, p.hunger + 20); }))) return;
  // bessere Waffe aus dem Rucksack nehmen (die alte kommt hinein); Fernwaffen nur mit Munition
  const rang = w => (WAFFEN[w]?.fern && !p.munition) ? 0 : WAFFEN_RANG.indexOf(w) + 1;
  const besser = WAFFEN_RANG.filter(w => p.rucksack.includes(w) && rang(w) > rang(p.waffe)).at(-1);
  if (besser && nimm(besser, () => { if (p.waffe) p.rucksack.push(p.waffe); p.waffe = besser; })) return;
  // aufgehobene Munitionsschachtel einlegen
  if (p.munition < 30 && nimm('munition', () => { p.munition = Math.min(99, p.munition + 12); })) return;
  // größere Tasche umpacken
  for (const t of ['trekking', 'tasche']) {
    if (p.rucksack.includes(t) && (DINGE[t]?.plaetze ?? 0) > p.plaetze && nimm(t, () => { p.plaetze = DINGE[t].plaetze; })) return;
  }
}
const WAFFEN_RANG = ['messer', 'schlaeger', 'pistole', 'sense', 'schrotflinte', 'gewehr'];

// so viele Stück eines Dings will ein Bot höchstens tragen (Waffen: die getragene zählt mit); der Rest fliegt raus
const GRENZE = { wasser: 3, essen: 3, schokoriegel: 3, verband: 3, spritze: 2, bretter: 3, munition: 4, schluessel: 1, brechstange: 1, seil: 1,
  taschenlampe: 1, kleidung: 1, tasche: 0, trekking: 0 };
const grenze = d => GRENZE[d] ?? (WAFFEN[d] ? 1 : 2);
const anzahl = (p, d) => p.rucksack.filter(q => q === d).length + (p.waffe === d ? 1 : 0);
function willHaben(p, d) {
  if ((d === 'tasche' || d === 'trekking') && (DINGE[d]?.plaetze ?? 0) > p.plaetze) return true;   // größere Tasche
  if (WAFFEN[d] && WAFFEN_RANG.indexOf(d) < WAFFEN_RANG.indexOf(p.waffe) && p.rucksack.some(q => WAFFEN[q])) return false;   // schlechtere Waffe, Ersatz schon da
  return anzahl(p, d) < grenze(d);
}

// Überzähliges ablegen (höchstens eins je Sekunde); der Bot merkt sich das Ding, damit er es nicht wieder aufhebt
function ueberzaehligesAblegen(raum, p, b) {
  if (raum.uhr - (b.abgelegt ?? 0) < 1) return false;
  const d = p.rucksack.find((q, i) => p.rucksack.slice(0, i + 1).filter(r => r === q).length + (p.waffe === q ? 1 : 0) > grenze(q)
    && !((q === 'tasche' || q === 'trekking') && (DINGE[q]?.plaetze ?? 0) > p.plaetze));
  if (!d) return false;
  p.rucksack.splice(p.rucksack.lastIndexOf(d), 1);
  const id = raum.legeHin(d, p.x, p.y, p.ebene ?? '');
  (b.verschmaeht ??= new Set()).add(id);
  b.abgelegt = raum.uhr;
  return true;
}

// Dinge vom Boden aufheben, die der Bot brauchen kann (z. B. was ein Mitspieler fallen lässt)
function aufheben(raum, sid, p, x, welt) {
  const b = x.bot;
  if (p.rucksack.length >= p.plaetze) return false;
  const kandidaten = [];
  for (const [id, d] of raum.state.boden) {
    if ((d.ebene ?? '') !== (p.ebene ?? '') || b.verschmaeht?.has(id) || !willHaben(p, d.ding)) continue;
    kandidaten.push({ id, x: d.x, y: d.y });
  }
  const ziel = naechster(kandidaten, p, 220, c => sichtfrei(welt, p.x, p.y, c.x, c.y));
  if (!ziel) return false;
  if (abstand(p, ziel) > AKTION_ABSTAND - 8) { geheZu(raum, sid, p, x, ziel, 0.9, AKTION_ABSTAND - 12); return true; }
  p.aktion = 'aufheben'; p.fortschritt = 0; x.aktionZiel = { art: 'aufheben', id: ziel.id, dauer: 0.4 };
  return true;
}

// Gelegenheit nutzen: nahe Schränke, Kofferräume (mit Brechstange) und tote Zombies durchsuchen
function durchsuchen(raum, sid, p, x, welt) {
  const b = x.bot;
  b.durchsucht ??= new Set();
  if (p.rucksack.length >= p.plaetze) return false;
  const kandidaten = [];
  for (const c of welt.behaelter ?? []) {
    if (b.durchsucht.has(c.id) || raum.state.behaelter.get(c.id)?.rest === 0) continue;
    if (c.art === 'auto' && !p.rucksack.includes('brechstange')) continue;
    kandidaten.push(c);
  }
  for (const [id, l] of raum.state.leichen) if ((l.ebene ?? '') === (p.ebene ?? '') && l.rest !== 0 && !b.durchsucht.has(id)) kandidaten.push({ id, x: l.x, y: l.y, leiche: true });
  const ziel = naechster(kandidaten, p, 170, c => sichtfrei(welt, p.x, p.y, c.x, c.y));
  if (!ziel) return false;
  if (abstand(p, ziel) > AKTION_ABSTAND - 8) { geheZu(raum, sid, p, x, ziel, 0.9, AKTION_ABSTAND - 12); return true; }
  // genau diesen Behälter durchsuchen (nicht, was zufällig am nächsten liegt – z. B. ein verschlossenes Auto)
  b.durchsucht.add(ziel.id);
  const behaelter = ziel.leiche ? { id: ziel.id, art: 'leiche', x: ziel.x, y: ziel.y } : ziel;
  const dauer = behaelter.art === 'auto' || behaelter.art === 'bus' ? 3.5 : behaelter.art === 'leiche' ? 1.5 : 2.5;
  p.aktion = 'durchsuchen'; p.fortschritt = 0; x.aktionZiel = { art: 'durchsuchen', behaelter, dauer }; x.laermUhr = 0;
  return true;
}

// zum Ziel gehen: Weg berechnen (gelegentlich neu), Wegpunkten folgen, Abstand zu anderen halten
function geheZu(raum, sid, p, x, ziel, tempo = 1, halt = 14) {
  const b = x.bot, jetzt = raum.uhr;
  if (abstand(p, ziel) < halt) { x.eingabe = { dx: 0, dy: 0, s: false }; return true; }
  const neu = !b.weg || jetzt - b.wegZeit > 0.8 || !b.wegZiel || abstand(b.wegZiel, ziel) > 40;
  const welt = raum.wv(p.ebene);
  if (neu) {
    b.weg = findeWeg(welt, p.x, p.y, ziel.x, ziel.y, RAD, 40000) ?? [{ x: ziel.x, y: ziel.y }];
    b.wegZeit = jetzt; b.wegZiel = { x: ziel.x, y: ziel.y };
  }
  while (b.weg.length > 1 && abstand(p, b.weg[0]) < 10) b.weg.shift();
  const wp = b.weg[0];
  let dx = wp.x - p.x, dy = wp.y - p.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // Abstand zu anderen Figuren (nicht durch Mitspieler hindurchdrängeln)
  for (const [osid, o] of raum.state.spieler) {
    if (osid === sid || o.ebene !== p.ebene || !raum.extra.get(osid)?.bot) continue;
    const d = abstand(p, o);
    if (d > 0 && d < 44) { dx += (p.x - o.x) / d * (44 - d) / 44 * 1.4; dy += (p.y - o.y) / d * (44 - d) / 44 * 1.4; }
  }
  const n = Math.hypot(dx, dy) || 1;
  // festhängen: nach 1 s ohne Fortschritt Weg neu und kurz seitlich
  b.messZeit = (b.messZeit ?? 0) + raum.dt;
  if (b.messZeit > 1) {
    if (b.messPos && abstand(b.messPos, p) < 6) { b.weg = null; b.seitlich = 0.5; b.seite = -(b.seite || 1); }
    b.messZeit = 0; b.messPos = { x: p.x, y: p.y };
  }
  if (b.seitlich > 0) {
    b.seitlich -= raum.dt;
    const sx = -dy / n * b.seite, sy = dx / n * b.seite;
    if (frei(welt, p.x + sx * 20, p.y + sy * 20, RAD)) { x.eingabe = { dx: sx, dy: sy, s: false }; return false; }
  }
  x.eingabe = { dx: dx / n * tempo, dy: dy / n * tempo, s: tempo < 0.55 };
  return false;
}

function naechster(liste, p, max, bedingung = () => true) {
  let best = null, bd = max;
  for (const e of liste) { const d = abstand(p, e); if (d < bd && bedingung(e)) { bd = d; best = e; } }
  return best;
}

export function botSchritt(raum, sid, p, x, dt) {
  raum.dt = dt; raum.uhr = (raum.state.zeit ?? 0);
  const b = x.bot;
  x.eingabe = { dx: 0, dy: 0, s: false };
  b.uebergangZiel = null;
  if (p.unten || p.zombie > 0) { b.weg = null; return; }
  if (raum.tausche?.has(sid)) return;   // beim Tauschen stillhalten
  versorgen(p, b, raum.uhr);
  // beim Durchsuchen stillstehen – außer ein Zombie kommt zu nah
  if (p.aktion) {
    const nah = [...raum.state.zombies.values()].some(z => (z.ebene ?? '') === (p.ebene ?? '') && abstand(p, z) < 110);
    if (!nah) return;
    p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
  }

  const welt = raum.wv(p.ebene);
  const alleSpieler = [...raum.state.spieler.entries()];
  const spieler = alleSpieler.filter(([, o]) => o.ebene === p.ebene);
  const zombies = [...raum.state.zombies.values()].filter(z => (z.ebene ?? '') === p.ebene);

  // 1. Liegenden Mitspieler aufhelfen
  const liegend = naechster(spieler.map(([, o]) => o), p, 420, o => o !== p && o.unten && !(o.zombie > 0));
  if (liegend) { geheZu(raum, sid, p, x, liegend, 1, 24); return; }

  // 2. Kämpfen oder fliehen
  const waffe = bewaffnet(p);
  const gefahr = naechster(zombies, p, waffe === 'fern' ? 260 : 170, z => sichtfrei(welt, p.x, p.y, z.x, z.y));
  if (gefahr) {
    const d = abstand(p, gefahr);
    if (waffe === 'fern') {
      // Schussabstand halten: zu nah → zurück, zu weit → heran (schießen tut der Server)
      if (d < 90) { const w = Math.atan2(p.y - gefahr.y, p.x - gefahr.x); const ziel = { x: p.x + Math.cos(w) * 60, y: p.y + Math.sin(w) * 60 }; if (frei(welt, ziel.x, ziel.y, RAD)) { geheZu(raum, sid, p, x, ziel); return; } }
      else if (d > 200) { geheZu(raum, sid, p, x, gefahr, 1, 180); return; }
      else return;   // im Schussabstand stehen bleiben
    } else if (waffe === 'nah') {
      // auf Zombies losgehen, die jemanden jagen oder nah sind
      if (gefahr.jagt || d < 80) { geheZu(raum, sid, p, x, gefahr, 1, 22); return; }
    } else if (gefahr.jagt && d < 100) {
      const w = Math.atan2(p.y - gefahr.y, p.x - gefahr.x);
      for (const dw of [0, 0.6, -0.6, 1.2, -1.2]) {
        const ziel = { x: p.x + Math.cos(w + dw) * 70, y: p.y + Math.sin(w + dw) * 70 };
        if (frei(welt, ziel.x, ziel.y, RAD)) { geheZu(raum, sid, p, x, ziel); return; }
      }
    }
  }

  // 2b. Gelegenheit: Überzähliges ablegen, Brauchbares aufheben, in der Nähe durchsuchen – solange der Mensch nicht weit weg ist
  if (!gefahr && ueberzaehligesAblegen(raum, p, b)) return;
  const mensch = naechster(spieler.filter(([s, o]) => !raum.extra.get(s)?.bot && !o.unten).map(([, o]) => o), p, Infinity);
  if (!gefahr && mensch && abstand(p, mensch) < 260 && (aufheben(raum, sid, p, x, welt) || durchsuchen(raum, sid, p, x, welt))) return;

  // 3. Dem nächsten Menschen folgen – auf festem Platz hinter ihm (ist er auf einer anderen Ebene: zum Übergang)
  const ueberall = alleSpieler.filter(([s, o]) => !raum.extra.get(s)?.bot && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  if (ueberall.length && !ueberall.some(o => o.ebene === p.ebene)) {
    const punkt = raum.uebergangsPunkt(p.ebene, ueberall[0].ebene);
    if (punkt) { b.uebergangZiel = punkt; geheZu(raum, sid, p, x, punkt, 1, 2); return; }
  }
  const menschen = spieler.filter(([s, o]) => !raum.extra.get(s)?.bot && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  const anfuehrer = naechster(menschen, p, Infinity);
  if (anfuehrer) {
    const bots = alleSpieler.filter(([s]) => raum.extra.get(s)?.bot).map(([s]) => s).sort();
    const nr = Math.max(0, bots.indexOf(sid));
    const d = abstand(p, anfuehrer);
    const drinnen = !!p.ebene || !!safeRoomAn(raum.welt, anfuehrer.x, anfuehrer.y);
    // Erkunder (alle außer den ersten beiden): streifen draußen in der Nähe umher, kommen bei Abstand näher
    if (nr >= 2 && !drinnen && d < 320) {
      if (!b.streifZiel || raum.uhr > b.streifBis || abstand(b.streifZiel, anfuehrer) > 300) {
        for (let v = 0; v < 12; v++) {
          const w = Math.random() * Math.PI * 2, r = 120 + Math.random() * 140;
          const z = { x: anfuehrer.x + Math.cos(w) * r, y: anfuehrer.y + Math.sin(w) * r };
          if (frei(welt, z.x, z.y, RAD)) { b.streifZiel = z; break; }
        }
        b.streifBis = raum.uhr + 6 + Math.random() * 6;
      }
      if (b.streifZiel) { geheZu(raum, sid, p, x, b.streifZiel, 0.6, 18); return; }
    }
    // Begleiter: feste, weit verteilte Plätze hinter dem Menschen – kein Zurückweichen, wenn er herankommt
    const n = Math.min(2, Math.max(1, bots.length));
    const winkel = anfuehrer.richtung + Math.PI + ((nr % 2) - (n - 1) / 2) * 1.1;
    const entf = drinnen ? 55 : 75 + (nr % 2) * 30;
    let platz = { x: anfuehrer.x + Math.cos(winkel) * entf, y: anfuehrer.y + Math.sin(winkel) * entf };
    if (!frei(welt, platz.x, platz.y, RAD) || !sichtfrei(welt, anfuehrer.x, anfuehrer.y, platz.x, platz.y)) platz = anfuehrer;
    // nah genug: stehen bleiben (auch wenn der Mensch auf den Bot zugeht) – aber nicht in der Tür seines Safe Rooms
    const seinSafe = safeRoomAn(raum.welt, anfuehrer.x, anfuehrer.y);
    const imSelbenRaum = !seinSafe || p.ebene || safeRoomAn(raum.welt, p.x, p.y) === seinSafe;
    if (d < 70 && imSelbenRaum) return;
    const tempo = anfuehrer.schleicht ? 0.45 : d > 180 ? 1 : 0.8;
    geheZu(raum, sid, p, x, platz, tempo, platz === anfuehrer ? 60 : 18);
    return;
  }

  // 4. Niemand da: nach draußen und in den nächsten Safe Room
  if (p.ebene) { const raus = raum.uebergangsPunkt(p.ebene, ''); if (raus) { b.uebergangZiel = raus; geheZu(raum, sid, p, x, raus, 1, 2); } return; }
  const safe = naechster(raum.welt.safeRooms.map(r => r.innen), p, Infinity);
  if (safe) geheZu(raum, sid, p, x, safe, 1, 20);
}
