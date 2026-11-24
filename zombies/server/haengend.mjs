// S-Draht: Zombies bleiben hängen (Bundeswehr-Lager und Flugfeld Königsdorf), dazu die Deko am Flugfeld (Tote, hängende Zombies).
// Rollen: client/stuetzpunkt.mjs (Teile 'sdraht', Feinwert 1: niemand kommt durch) und client/flugfeld_deko.mjs (welt.flugfeld.draht).
// Läuft ein Zombie an eine Rolle (Rand DRAHT_RAND px), bleibt er mit DRAHT_CHANCE hängen: Kriecher-Aussehen (z.kriecht + z.haengt),
// bewegt sich nicht, zappelt (Client), beißt, ist erschießbar, und reißt sich nach DRAHT_DAUER Sekunden los (dann normaler Kriecher).
import { WERTE, KACHEL } from '../client/welt.mjs';

export const DRAHT_CHANCE = 0.4, DRAHT_DAUER = 60, DRAHT_RAND = 9;   // Wahrscheinlichkeit je Berührung, Sekunden, Zuschlag (px) zum Zombieradius (Feinraster: die Figur stoppt bis ~14 px vor der Rolle)
const cache = new WeakMap();
export const HAENG_DREH = 0.6;   // rad/s: so schnell dreht sich ein Zombie im Draht höchstens zu seinem Ziel

// Winkel von alt in Richtung neu drehen, höchstens um max (kürzester Weg)
export function drehBegrenzt(alt, neu, max) {
  if (!Number.isFinite(alt)) return neu;
  let d = neu - alt;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return alt + Math.max(-max, Math.min(max, d));
}

// alle Rollen der Welt als orientierte Rechtecke { x, y, hl, hb, c, s, ausen: [nx, ny] | null, lager }
export function drahtRollen(welt) {
  let l = cache.get(welt);
  if (l) return l;
  l = [];
  const sp = welt.stuetzpunkt;
  if (sp) {
    const mx = (sp.x + sp.b / 2) * KACHEL, my = (sp.y + sp.h / 2) * KACHEL;   // Lagermitte (Weltachsen)
    for (const t of sp.teile) {
      if (t.art !== 'sdraht') continue;
      const c = Math.cos(t.winkel), s = Math.sin(t.winkel);
      let nx = -s, ny = c;   // Querachse der Rolle; zeigt vom Lager weg
      if ((t.x - mx) * nx + (t.y - my) * ny < 0) { nx = -nx; ny = -ny; }
      l.push({ x: t.x, y: t.y, hl: t.w / 2, hb: t.d / 2, c, s, ausen: [nx, ny], lager: true });
    }
  }
  for (const t of welt.flugfeld?.draht ?? []) l.push({ x: t.x, y: t.y, hl: t.w / 2, hb: t.d / 2, c: Math.cos(t.winkel), s: Math.sin(t.winkel), ausen: null, lager: false });
  cache.set(welt, l);
  return l;
}

const beruehrt = (q, x, y, zu) => {
  const dx = x - q.x, dy = y - q.y;
  if (Math.abs(dx) > q.hl + zu + 2 && Math.abs(dy) > q.hl + zu + 2) return false;
  return Math.abs(dx * q.c + dy * q.s) <= q.hl + zu && Math.abs(-dx * q.s + dy * q.c) <= q.hb + zu;
};

// nach jedem Schritt eines gehenden Zombies draußen: berührt er eine Rolle (neu), würfelt er das Hängenbleiben
export function drahtPruefen(raum, z, info) {
  if (z.haengt || z.kriecht) return;
  const rollen = drahtRollen(raum.welt);
  if (!rollen.length) return;
  const zu = WERTE.zombieRadius + DRAHT_RAND;
  if (!rollen.some(q => beruehrt(q, z.x, z.y, zu))) { info.imDraht = false; return; }
  if (info.imDraht) return;   // ein Wurf je Berührung
  info.imDraht = true;
  if (raum.rnd() < DRAHT_CHANCE) raum.haengenBleiben(z, info, DRAHT_DAUER);
}

// Zeit im Draht: nach Ablauf reißt er sich los (bleibt Kriecher)
export function haengtSchritt(raum, z, info, dt) {
  info.haengtT = (info.haengtT ?? DRAHT_DAUER) - dt;
  if (info.haengtT <= 0) z.haengt = false;
}

// beim Weltstart: je Lager-Rolle 1–2, je Flugfeld-Rolle 2–3 Zombies, die schon im Draht hängen (dauerhaft), und die toten Deko-Leichen
export function haengendStart(raum) {
  const welt = raum.welt;
  for (const q of drahtRollen(welt)) {
    const n = q.lager ? 1 + Math.floor(raum.rnd() * 2) : 2 + Math.floor(raum.rnd() * 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5 + (raum.rnd() - 0.5) * 0.12, seite = q.ausen ? 1 : (raum.rnd() < 0.5 ? 1 : -1);
      const nx = q.ausen ? q.ausen[0] : -q.s, ny = q.ausen ? q.ausen[1] : q.c;
      const x = q.x + q.c * t * q.hl * 1.7 + nx * seite * (q.hb + 5), y = q.y + q.s * t * q.hl * 1.7 + ny * seite * (q.hb + 5);
      const id = raum.setzeZombie(x, y, '');
      const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
      info.bleibt = true;
      raum.haengenBleiben(z, info, Infinity);
      z.richtung = Math.atan2(-ny * seite, -nx * seite);   // dem Draht zugewandt
    }
  }
  for (const t of welt.flugfeld?.tote ?? []) {
    const id = raum.neueLeiche({ x: t.x, y: t.y, richtung: t.richtung, variante: t.variante, ebene: '' }, true);
    const l = raum.state.leichen.get(id);
    l.rest = 0; l.deko = true;   // nichts zu finden, bleiben liegen, zählen nicht zu LEICHEN_MAX
    raum.leichenInhalt.set(id, []);
  }
}
