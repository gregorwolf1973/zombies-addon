// Munitionszähler (p.munition, höchstens MUNITION_MAX) und Munitionskisten (Reserve im Rucksack, 30 Schuss je Kiste).
// - munitionGeben: füllt den Zähler; Überschuss wird gesammelt, je 30 Schuss wandern als Kiste in den Rucksack (wenn Platz)
// - munitionPruefen (jeden Tick): fällt der Zähler auf MUNITION_KISTE_AB oder weniger, wird automatisch eine Kiste geöffnet
// - kisteOeffnen: auch von Hand („Benutzen“ im Rucksack)
import { M } from './texte.mjs';
import { MUNITION_MAX, MUNITIONSKISTE_SCHUSS, MUNITION_KISTE_AB } from '../client/welt.mjs';
import { fuegeHinzu, entferne, hat } from '../client/stapel.mjs';

const ueberschuss = new WeakMap();   // gesammelter Überschuss je Spieler (Schuss, die nicht mehr in den Zähler passten)

// n Schuss aufnehmen. Liefert { zaehler, kisten }: in den Zähler gewandert bzw. als Munitionskisten eingepackt
export function munitionGeben(p, n) {
  const rein = Math.max(0, Math.min(n, MUNITION_MAX - (p.munition ?? 0)));
  p.munition = (p.munition ?? 0) + rein;
  let kisten = 0;
  const rest = n - rein;
  if (rest > 0) {
    let u = (ueberschuss.get(p) ?? 0) + rest;
    while (u >= MUNITIONSKISTE_SCHUSS && fuegeHinzu(p.rucksack, p.plaetze, 'munitionskiste', 1) === 1) { u -= MUNITIONSKISTE_SCHUSS; kisten++; }
    ueberschuss.set(p, Math.min(u, 2 * MUNITIONSKISTE_SCHUSS));   // ohne Platz bleibt höchstens etwas Vorrat gemerkt
  }
  return { zaehler: rein, kisten };
}

// Eine Kiste öffnen: +30 Schuss (höchstens MUNITION_MAX). Liefert true, wenn eine Kiste verbraucht wurde.
export function kisteOeffnen(p) {
  if (!hat(p.rucksack, 'munitionskiste') || (p.munition ?? 0) >= MUNITION_MAX) return false;
  entferne(p.rucksack, 'munitionskiste', 1);
  p.munition = Math.min(MUNITION_MAX, (p.munition ?? 0) + MUNITIONSKISTE_SCHUSS);
  return true;
}

// Jeden Tick: Zähler ≤ MUNITION_KISTE_AB → eine Kiste öffnen (genau eine je Aufruf). send({ k, w }) optional für die Meldung.
export function munitionPruefen(p, send) {
  if ((p.munition ?? 0) > MUNITION_KISTE_AB || !hat(p.rucksack, 'munitionskiste')) return false;
  if (!kisteOeffnen(p)) return false;
  send?.(M('inv.kisteAuf', { n: MUNITIONSKISTE_SCHUSS }));
  return true;
}
