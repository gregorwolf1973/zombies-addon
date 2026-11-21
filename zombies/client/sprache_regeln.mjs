// Regeln der Sprachübertragung: wie laut hört A den Mitspieler B?  (reine Funktion, ohne Browser testbar)
import { KACHEL } from './welt.mjs';
import { EBENE_MUSTER } from './innen.mjs';

export const PX_PRO_METER = 8;   // 8 px = 1 m (eine Kachel = 4 m)
export const SPRACHE_VORGABE = { hoerweite: 40, stockwerk: 0.35, drinnenDraussen: 0.10, funk: 0.7 };

const klemme = (v, a, b) => Math.max(a, Math.min(b, v));
const hausNr = ebene => { const m = EBENE_MUSTER.exec(ebene ?? ''); return m ? Number(m[1]) : null; };

// Kurve: volle Lautstärke bis zur Hörweite, danach weich (Kosinus) über weitere 50 % der Hörweite auf 0
export const ABKLINGEN = 0.5;
export function kurve(meter, hoerweite) {
  if (meter <= hoerweite) return 1;
  const ende = hoerweite * (1 + ABKLINGEN);
  if (meter >= ende) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * (meter - hoerweite) / (ende - hoerweite)));
}

// → { nah: 0..1, funk: 0..1, pan: -1..1 }
export function lautstaerke(ich, er, welt, e = {}) {
  const c = { ...SPRACHE_VORGABE, ...e };
  const aus = { nah: 0, funk: 0, pan: 0 };
  if (!ich || !er) return aus;
  const funk = (ich.rucksack ?? []).includes('funkgeraet') && (er.rucksack ?? []).includes('funkgeraet') ? c.funk : 0;
  const meter = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) / PX_PRO_METER;
  const ebeneI = ich.ebene ?? '', ebeneE = er.ebene ?? '';
  let nah = 0, pan = 0;
  if (!ebeneI && !ebeneE) {
    nah = kurve(meter(ich.x, ich.y, er.x, er.y), c.hoerweite);
    pan = klemme((er.x - ich.x) / PX_PRO_METER / 15, -0.8, 0.8);
  } else if (ebeneI && ebeneE) {
    const hi = hausNr(ebeneI), he = hausNr(ebeneE);
    if (hi !== null && hi === he) {
      if (ebeneI === ebeneE) nah = Math.max(0.6, kurve(meter(ich.x, ich.y, er.x, er.y), c.hoerweite));
      else nah = c.stockwerk;
    }
  } else {
    // einer drinnen, einer draußen: gedämpft, nach Abstand des Draußen-Spielers zur Haustür-Vorkachel
    const drin = ebeneI ? ebeneI : ebeneE, draussen = ebeneI ? er : ich;
    const haus = welt?.haeuser?.[hausNr(drin)];
    if (haus?.tuer) {
      const r = haus.raus ?? { dx: 0, dy: 1 };
      const vx = (haus.tuer.x + (r.dx ?? 0) + 0.5) * KACHEL, vy = (haus.tuer.y + (r.dy ?? 0) + 0.5) * KACHEL;
      nah = c.drinnenDraussen * kurve(meter(draussen.x, draussen.y, vx, vy), c.hoerweite);
    }
  }
  return { nah: klemme(nah, 0, 1), funk: klemme(funk, 0, 1), pan };
}
