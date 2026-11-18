// Steuerung der simulierten Mitspieler (zweite Fassung, Claude): Wegsuche über Kacheln, feste Plätze hinter
// dem Anführer, Abstand zu allen Figuren, bewaffnete Bots kämpfen. Ein Bot steuert sich nur über x.eingabe.
import { frei, sichtfrei, safeRoomAn, findeWeg, KACHEL } from '../client/welt.mjs';

export const BOT_NAMEN = ['Resi', 'Vroni', 'Sepp', 'Wastl', 'Kathi', 'Hias', 'Burgi', 'Girgl', 'Loisl', 'Zenzi'];

const RAD = 11;
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function bewaffnet(p) {
  if (p.waffe === 'pistole' && p.munition > 0) return 'fern';
  if (p.waffe === 'messer' || p.waffe === 'schlaeger') return 'nah';
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
  if (!p.waffe) for (const w of ['messer', 'schlaeger', 'pistole']) if (nimm(w, () => { p.waffe = w; })) return;
}

// zum Ziel gehen: Weg berechnen (gelegentlich neu), Wegpunkten folgen, Abstand zu anderen halten
function geheZu(raum, sid, p, x, ziel, tempo = 1, halt = 14) {
  const b = x.bot, jetzt = raum.uhr;
  if (abstand(p, ziel) < halt) { x.eingabe = { dx: 0, dy: 0, s: false }; return true; }
  const neu = !b.weg || jetzt - b.wegZeit > 0.8 || !b.wegZiel || abstand(b.wegZiel, ziel) > 40;
  const welt = raum.wv(p.ebene);
  if (neu) {
    b.weg = findeWeg(welt, p.x, p.y, ziel.x, ziel.y, RAD) ?? [{ x: ziel.x, y: ziel.y }];
    b.wegZeit = jetzt; b.wegZiel = { x: ziel.x, y: ziel.y };
  }
  while (b.weg.length > 1 && abstand(p, b.weg[0]) < 10) b.weg.shift();
  const wp = b.weg[0];
  let dx = wp.x - p.x, dy = wp.y - p.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // Abstand zu anderen Figuren (nicht durch Mitspieler hindurchdrängeln)
  for (const [osid, o] of raum.state.spieler) {
    if (osid === sid || o.ebene !== p.ebene) continue;
    const d = abstand(p, o);
    if (d > 0 && d < 30) { dx += (p.x - o.x) / d * (30 - d) / 30 * 1.2; dy += (p.y - o.y) / d * (30 - d) / 30 * 1.2; }
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
  versorgen(p, b, raum.uhr);

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

  // 3. Dem nächsten Menschen folgen – auf festem Platz hinter ihm (ist er auf einer anderen Ebene: zum Übergang)
  const ueberall = alleSpieler.filter(([s, o]) => !raum.extra.get(s)?.bot && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  if (ueberall.length && !ueberall.some(o => o.ebene === p.ebene)) {
    const punkt = raum.uebergangsPunkt(p.ebene, ueberall[0].ebene);
    if (punkt) { b.uebergangZiel = punkt; geheZu(raum, sid, p, x, punkt, 1, 2); return; }
  }
  const menschen = spieler.filter(([s, o]) => !raum.extra.get(s)?.bot && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  const anfuehrer = naechster(menschen, p, Infinity);
  if (anfuehrer) {
    const bots = spieler.filter(([s]) => raum.extra.get(s)?.bot).map(([s]) => s).sort();
    const nr = bots.indexOf(sid), n = Math.max(1, bots.length);
    const winkel = anfuehrer.richtung + Math.PI + (nr - (n - 1) / 2) * 0.55;
    const drinnen = !!p.ebene || safeRoomAn(raum.welt, anfuehrer.x, anfuehrer.y) || raum.welt.hole(Math.floor(anfuehrer.x / KACHEL), Math.floor(anfuehrer.y / KACHEL)) === 3;
    const entf = drinnen ? 38 : 48 + (nr % 2) * 22;
    let platz = { x: anfuehrer.x + Math.cos(winkel) * entf, y: anfuehrer.y + Math.sin(winkel) * entf };
    if (!frei(welt, platz.x, platz.y, RAD) || !sichtfrei(welt, anfuehrer.x, anfuehrer.y, platz.x, platz.y)) platz = anfuehrer;
    const d = abstand(p, anfuehrer);
    if (d < 30) {   // zu nah am Menschen: Platz machen
      const w = Math.atan2(p.y - anfuehrer.y, p.x - anfuehrer.x);
      x.eingabe = { dx: Math.cos(w) * 0.5, dy: Math.sin(w) * 0.5, s: true };
      return;
    }
    const tempo = anfuehrer.schleicht ? 0.45 : d > 160 ? 1 : 0.8;
    geheZu(raum, sid, p, x, platz, tempo, platz === anfuehrer ? 40 : 16);
    return;
  }

  // 4. Niemand da: nach draußen und in den nächsten Safe Room
  if (p.ebene) { const raus = raum.uebergangsPunkt(p.ebene, ''); if (raus) { b.uebergangZiel = raus; geheZu(raum, sid, p, x, raus, 1, 2); } return; }
  const safe = naechster(raum.welt.safeRooms.map(r => r.innen), p, Infinity);
  if (safe) geheZu(raum, sid, p, x, safe, 1, 20);
}
