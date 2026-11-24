// Unfallszene: Kracht ein Auto der Verkehrssimulation (server/unfall.mjs), geht mit der Wahrscheinlichkeit `unfallTuer` (%, Verwaltung → Verkehr,
// Vorgabe 60) die Fahrertür auf, ein Mensch springt heraus und rennt zum nächsten Haus (Bewohnerlogik aus server/menschen.mjs: flieht vor
// Zombies, lässt sich ansprechen und retten). Auf der Beifahrerseite steigt ein Zombie aus (der Beifahrer war schon gebissen) und verfolgt ihn;
// holt er ihn ein, beißt er (Verwandlung nach den üblichen Regeln: Einstellungen biss/verwandlung). Der Client zeichnet die offenen Türen
// (Nachricht 'autotuer', client/pkwdarstellung.mjs). Nur draußen; ohne Stadtleben (keine Wohnhäuser) gibt es keine Szene.
import { frei, sichtfrei } from '../client/welt.mjs';
import { Mensch, typFuerId } from './menschen.mjs';
import { LAENGE, BREITE_FZ } from './verkehr.mjs';

const RAD = 10;

// freier Punkt neben der Tür (Seite `seite` = ±1 quer zur Fahrtrichtung w), etwas weiter draußen, falls nötig
function neben(welt, f, w, seite, hb, rad) {
  const c = Math.cos(w), s = Math.sin(w);
  for (const weg of [hb + rad + 3, hb + rad + 9, hb + rad + 16, hb + rad + 26]) for (const u of [2, -6, 10, -14]) {
    const x = f.x + c * u - s * seite * weg, y = f.y + s * u + c * seite * weg;
    if (frei(welt, x, y, rad)) return { x, y };
  }
  return null;
}

// Szene am Unfallauto f (x, y, richtung) auslösen; Rückgabe { mensch, zombie } (Ids) oder null
export function unfallSzene(raum, f, opt = {}) {
  const s = raum.state, stadt = raum.stadt, welt = raum.welt;
  if (!f || !stadt || !stadt.wohnungen?.length || !welt) return null;
  const prozent = opt.immer ? 100 : Number(raum.einstellungen?.()?.unfallTuer ?? 60);
  if (!(raum.rnd() * 100 < prozent)) return null;
  const w = f.richtung ?? 0, hb = (BREITE_FZ[f.art] ?? BREITE_FZ.auto ?? 16) / 2;
  let seite = raum.rnd() < 0.5 ? 1 : -1;
  let mp = neben(welt, f, w, seite, hb, RAD);
  if (!mp) { seite = -seite; mp = neben(welt, f, w, seite, hb, RAD); }
  if (!mp) return null;
  // Mensch: wie ein Bewohner, Ziel = Haustür des nächsten Wohnhauses (dort verschwindet er im Haus)
  let heim = stadt.wohnungen[0], bd = Infinity;
  for (const h of stadt.wohnungen) { const t = stadt.vorDerTuer(h), d = Math.hypot(t.x - mp.x, t.y - mp.y); if (d < bd) { bd = d; heim = h; } }
  const m = new Mensch();
  m.x = mp.x; m.y = mp.y; m.richtung = w + seite * Math.PI / 2; m.infiziert = false; m.flieht = true; m.sichtbar = true; m.versteckt = false; m.folgt = false; m.ebene = '';
  m.aussehen = `${raum.rnd() < 0.5 ? 'm' : 'w'},${Math.floor(raum.rnd() * 6)},${Math.floor(raum.rnd() * 8)}`;
  const mid = 'm' + stadt.naechsteId++;
  m.typ = typFuerId(mid);
  s.menschen.set(mid, m);
  stadt.info.set(mid, { heim, ziel: { ...stadt.vorDerTuer(heim), art: 'haus' }, weg: null, warte: 0, inf: 0, steckt: 0, modus: '', fluchtZeit: 1.5, unfall: true });
  // Zombie auf der anderen Seite: verfolgt den Menschen sofort
  const zp = neben(welt, f, w, -seite, hb, 9) ?? neben(welt, f, w + Math.PI, -seite, (LAENGE[f.art] ?? 36) / 2, 9);
  let zid = null;
  if (zp) {
    zid = raum.setzeZombie(zp.x, zp.y, '');
    const z = s.zombies.get(zid), info = raum.zombieInfo.get(zid);
    z.richtung = Math.atan2(m.y - z.y, m.x - z.x);
    if (info) { info.bleibt = true; info.schlaeft = false; info.steht = false; info.mensch = sichtfrei(welt, z.x, z.y, m.x, m.y) ? mid : null; info.punkt = { x: m.x, y: m.y }; }
  }
  raum.broadcast('autotuer', { x: f.x, y: f.y, w, s: seite, z: zid ? 1 : 0, ebene: '' });
  return { mensch: mid, zombie: zid };
}
