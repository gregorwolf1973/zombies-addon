// A400M (Königsdorf, Art 'absturz'): Steht das Wrack nach der Bruchlandung, fallen hinten aus der Heckrampe Munitionskisten heraus und
// bleiben hinter dem Wrack liegen – neben der Maschine, aber außerhalb der Brandherde (ABSTURZ_HERDE).
// Je Echtspieler zwei Kisten mit festem Inhalt (kein Zufall): Kiste A 50 Schuss + 2 Handgranaten, Kiste B 30 Schuss + 1 Handgranate
// (zusammen je Spieler 80 Schuss und 3 Handgranaten). Sie liegen als Bodengegenstände (state.boden, verschwinden nie), der Client zeigt den Fall
// (Nachricht 'kistenFall'), die Karte zeigt gelbe Punkte (fundorte.mjs), der Spielstand merkt sie sich (aufgaben.speichern/start).
import { A400M, ABSTURZ_HERDE, herdOrt } from '../client/evak.mjs';
import { frei, zufall } from '../client/welt.mjs';

export const KISTEN = {
  a400m_kiste_a: { schuss: 50, granaten: 2 },
  a400m_kiste_b: { schuss: 30, granaten: 1 },
};
export const KISTEN_JE_SPIELER = 2;
export const FALL_DAUER = 1.2;   // s vom Heck bis zum Liegenbleiben (Client-Animation; erst dann gibt es den Bodengegenstand)
export const KISTEN_FEUER_ABSTAND = 28;   // so weit (px) bleiben die Liegeplätze außerhalb jedes Brandherds

// Liegt der Punkt in einem Brandherd des stehenden Wracks (Lage e = { x, y, richtung }), mit Zuschlag?
export function imWrackFeuer(e, x, y, zu = KISTEN_FEUER_ABSTAND) {
  const c = Math.cos(e.richtung), s = Math.sin(e.richtung);
  return ABSTURZ_HERDE.some(hd => { const o = herdOrt(hd, e.x, e.y, c, s); return Math.hypot(x - o.x, y - o.y) < hd.r + zu; });
}

// Plan der fallenden Kisten: [{ zeit (s seit dem Stillstand), ding, x0, y0 (Heckrampe), x1, y1 (Liegeplatz) }]. plan = absturzPlan (mit ende),
// platz: Suche eines begehbaren Punkts in der Nähe
export function kistenPlan(seed, spieler, plan, welt, platz = (x, y) => ({ x, y })) {
  const n = Math.max(1, spieler) * KISTEN_JE_SPIELER, rnd = zufall((seed ^ 0x4b495354) >>> 0), e = plan.ende;
  const cs = Math.cos(e.richtung), sn = Math.sin(e.richtung), aus = [];
  const x0 = e.x - cs * A400M.heck, y0 = e.y - sn * A400M.heck;   // Heckrampe des Wracks
  for (let i = 0; i < n; i++) {
    const zeit = 0.4 + 0.35 * i;
    let rutsch = 30 + rnd() * 80;
    const quer = (rnd() * 2 - 1) * 80 + (i % 2 ? -1 : 1) * 14;   // hinter dem Heck, quer verstreut
    let x1 = 0, y1 = 0;
    for (let k = 0; k < 6; k++, rutsch += 40) {
      x1 = x0 - cs * rutsch - sn * quer; y1 = y0 - sn * rutsch + cs * quer;
      if (welt && !frei(welt, x1, y1, 6)) { const q = platz(x1, y1); x1 = q.x; y1 = q.y; }
      if (!imWrackFeuer(e, x1, y1)) break;
    }
    aus.push({ zeit, ding: i % 2 === 0 ? 'a400m_kiste_a' : 'a400m_kiste_b', x0, y0, x1, y1 });
  }
  return aus;
}

// Jeden Tick im Stand: fällige Kisten auslösen, gefallene als Bodengegenstand ablegen. rollZeit = Sekunden seit dem Stillstand.
// k = { plan: [...], fallend: [...] }; liefert true, solange noch etwas offen ist.
export function kistenSchritt(raum, k, rollZeit, dt) {
  while (k.plan.length && k.plan[0].zeit <= rollZeit) {
    const e = k.plan.shift();
    raum.broadcast('kistenFall', { ding: e.ding, x0: Math.round(e.x0), y0: Math.round(e.y0), x1: Math.round(e.x1), y1: Math.round(e.y1), dauer: FALL_DAUER });
    k.fallend.push({ rest: FALL_DAUER, e });
  }
  for (let i = k.fallend.length - 1; i >= 0; i--) {
    const f = k.fallend[i];
    if ((f.rest -= dt) > 0) continue;
    raum.legeHin(f.e.ding, f.e.x1, f.e.y1, '', 0);
    k.fallend.splice(i, 1);
  }
  return k.plan.length > 0 || k.fallend.length > 0;
}

// Inhalt einer aufgehobenen Kiste in den Spieler (Schuss über munitionNehmen, Handgranaten wie beim Durchsuchen; was nicht passt, bleibt liegen)
export function kisteNehmen(raum, client, p, ding) {
  const k = KISTEN[ding];
  if (!k) return false;
  raum.munitionNehmen(p, k.schuss, client);
  const gr = Array.from({ length: k.granaten }, () => 'granate');
  raum.einpacken(p, gr);
  for (const g of gr) raum.legeHin(g, p.x, p.y, p.ebene);
  client?.send('meldung', { text: `📦 Munitionskiste geöffnet: +${k.schuss} Schuss, +${k.granaten} Handgranate${k.granaten > 1 ? 'n' : ''}` });
  return true;
}

// Bodenkisten für den Spielstand und zurück
export const kistenSpeichern = raum => [...raum.state.boden.values()].filter(b => KISTEN[b.ding] && !b.ebene).map(b => ({ ding: b.ding, x: Math.round(b.x), y: Math.round(b.y) }));
export function kistenLaden(raum, liste) {
  for (const e of Array.isArray(liste) ? liste : []) if (KISTEN[e?.ding] && Number.isFinite(e.x) && Number.isFinite(e.y)) raum.legeHin(e.ding, e.x, e.y, '', 0);
}
