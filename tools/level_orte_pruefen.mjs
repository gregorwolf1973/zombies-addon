// Level-Orte einer Karte prüfen (wie „Seed 7 geprüft: frei und vom Start erreichbar“ in zombies/client/karten/LEVELORTE.md).
// Aufruf: node tools/level_orte_pruefen.mjs <karte|Pfad.json> [seed …]      (Standard-Seeds 7, 12345, 987654321)
// Je Seed: Start frei, Ortsausgang (Abholort Bus/Panzer) erreichbar und Querfeld-Plan für den Panzer, Safe Rooms erreichbar,
// Anteil erreichbarer betretbarer Häuser, Missionsorte (Level 1–3) erreichbar + frei begehbare Tür, Zeit für den Weltbau.
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse, frei, findeWeg } from '../zombies/client/welt.mjs';
import { baueWeltAusKarte } from '../zombies/client/osmwelt.mjs';
import { missionsPlan } from '../zombies/server/mission.mjs';
import { querfeldPlan } from '../zombies/server/querfeld.mjs';
import { levelorteSetzen } from '../zombies/server/levelorte.mjs';
import { absturzPlan, heliPlan } from '../zombies/server/flugplatz.mjs';
import { boxerStandort } from '../zombies/server/boxer.mjs';

const arg = process.argv[2];
if (!arg) { console.error('Aufruf: level_orte_pruefen.mjs <karte|Pfad.json> [seed …]'); process.exit(2); }
const pfad = arg.endsWith('.json') ? arg : new URL(`../zombies/client/karten/${arg}.json`, import.meta.url);
const name = arg.replace(/^.*\//, '').replace(/\.json$/, '');
const kname = name.replace(/_alt$/, '');
const karte = JSON.parse(fs.readFileSync(pfad, 'utf8'));
const seeds = process.argv.slice(3).map(Number).filter(Number.isFinite);
if (!seeds.length) seeds.push(7, 12345, 987654321);
const mitte = (x, y) => [(x + 0.5) * KACHEL, (y + 0.5) * KACHEL];
setzeKartengroesse(karte.breite, karte.hoehe);
let fehler = 0;
const melde = (ok, text) => { if (!ok) fehler++; console.log(`  ${ok ? 'ok    ' : 'FEHLER'} ${text}`); };
for (const seed of seeds) {
  const t0 = performance.now();
  const w = baueWeltAusKarte(karte, seed);
  const ms = Math.round(performance.now() - t0);
  console.log(`${name} Seed ${seed}: ${karte.breite}x${karte.hoehe}, Weltbau ${ms} ms, Häuser ${w.haeuser.length} (betretbar ${w.haeuser.filter(h => h.betretbar).length}), Start Kachel ${Math.floor(w.start.x / KACHEL)},${Math.floor(w.start.y / KACHEL)}`);
  melde(frei(w, w.start.x, w.start.y, 11), 'Start frei');
  const weg = (x, y) => findeWeg(w, w.start.x, w.start.y, x, y, 11, 800000);
  // Ortsausgang = Abholort der Straßenfahrzeuge (aufgaben.mjs torPunkt), Panzer: Querfeld-Plan
  const tor = w.tor ? { x: (w.tor.x + 1) * KACHEL, y: (w.tor.y + 1) * KACHEL } : null;
  melde(!!tor, `Ortsausgang (tor) vorhanden: ${tor ? Math.floor(tor.x / KACHEL) + ',' + Math.floor(tor.y / KACHEL) : '-'}`);
  if (tor) {
    const qp = querfeldPlan(w, tor);
    melde(!!qp, `Panzer-Querfeldplan${qp ? (qp.verschoben ? ' (Abholpunkt verschoben auf ' + Math.floor(qp.ziel.x / KACHEL) + ',' + Math.floor(qp.ziel.y / KACHEL) + ')' : ' (Abholpunkt = Ortsausgang)') + ', ' + qp.weg.length + ' Wegpunkte' : ''}`);
    const ziel = frei(w, tor.x, tor.y, 11) ? tor : null;
    if (ziel) melde(!!weg(tor.x, tor.y), 'Ortsausgang vom Start zu Fuß erreichbar'); else console.log('  (Ortsausgang selbst nicht frei, Abholpunkt wird verschoben)');
  }
  // Kartenspezifisch: Landebahn/Absturzplan/Boxer (Königsdorf), Hubschrauberplatz (Kochel)
  levelorteSetzen(w, kname);
  if (w.landebahn) {
    const l = w.landebahn, c = Math.cos(l.w), sn = Math.sin(l.w);
    let freiN = 0, n = 0; for (let d = 0; d <= l.laenge; d += 32) { n++; if (frei(w, l.x + c * d, l.y + sn * d, 11)) freiN++; }
    melde(freiN >= n * 0.97, `Landebahn (${Math.floor(l.x / KACHEL)},${Math.floor(l.y / KACHEL)}) Länge ${Math.round(l.laenge / KACHEL)} Kacheln: ${freiN}/${n} Punkte frei`);
    const ap = absturzPlan(w, seed);
    melde(!!ap && frei(w, ap.heli.x, ap.heli.y, 11) && !!weg(ap.heli.x, ap.heli.y), `Absturzplan A400M: Wrack ${Math.floor(ap.x / KACHEL)},${Math.floor(ap.y / KACHEL)}, Hubschrauberplatz erreichbar`);
    const bx = boxerStandort(w);
    melde(!!bx && frei(w, bx.x, bx.y, 11) && !!weg(bx.x, bx.y), `Boxer-Standort ${bx ? Math.floor(bx.x / KACHEL) + ',' + Math.floor(bx.y / KACHEL) : '-'} frei und erreichbar`);
    melde(w.piste?.b > 0, 'Piste (karte.piste) vorhanden');
  }
  if (w.heliplatz) melde(frei(w, w.heliplatz.x, w.heliplatz.y, 70) && !!weg(w.heliplatz.x, w.heliplatz.y), `Hubschrauberplatz ${Math.floor(w.heliplatz.x / KACHEL)},${Math.floor(w.heliplatz.y / KACHEL)} (Radius 70 px frei) erreichbar`);
  const sr = w.safeRooms ?? [];
  melde(sr.length >= 3, `Safe Rooms: ${sr.length} (${sr.map(s => s.name).join(', ')})`);
  for (const s of sr) melde(!!weg(...mitte(s.haus.tuer.x, s.haus.tuer.y)), `Safe Room „${s.name}“ erreichbar (Tür ${s.haus.tuer.x},${s.haus.tuer.y})`);
  const tueren = w.haeuser.filter(h => h.betretbar);
  const erreicht = tueren.filter(h => weg(...mitte(h.tuer.x, h.tuer.y))).length;
  melde(erreicht >= tueren.length * 0.9, `betretbare Häuser vom Start erreichbar: ${erreicht}/${tueren.length}`);
  for (const level of [1, 2, 3]) {
    const plan = missionsPlan(seed, level, kname, w);
    melde(plan.length >= 3 || kname === 'geretsried', `Missionsorte Level ${level}: ${plan.length} (${plan.map(m => m.ding + '@' + Math.floor(m.x / KACHEL) + ',' + Math.floor(m.y / KACHEL)).join(' ')})`);
    for (const m of plan) { const h = w.haeuser[m.nr]; melde(!!h?.tuer && !!weg(...mitte(h.tuer.x, h.tuer.y)), `  ${m.id} in Haus ${m.nr}${h?.name ? ' (' + h.name + ')' : ''}: Tür erreichbar`); }
  }
}
console.log(fehler ? `${fehler} Fehler` : 'alle Prüfungen ok');
process.exit(fehler ? 1 : 0);
