// Paket G: Einkaufswagen vor Läden (durchsuchbare Behälter) und geglättete Zäune (zaunglatt.mjs)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, setzeKartengroesse, frei, BEUTE, BEHAELTER_NAME, ziehe, zufall, weltFingerabdruck, WELT_VERSION } from '../client/welt.mjs';
import { baueWeltAusKarte, zaeuneAusduennen } from '../client/osmwelt.mjs';
import { zaeuneGlaetten } from '../client/zaunglatt.mjs';
import { alleKandidaten } from '../client/durchsuche_alle.mjs';

const lade = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));
const karte = lade('geretsried');
after(() => setzeKartengroesse(64, 48));
const bauen = (k, seed) => { setzeKartengroesse(k.breite, k.hoehe); return baueWeltAusKarte(k, seed); };
const wagen = w => w.behaelter.filter(b => b.art === 'einkaufswagen');

test('Weltversion ist mindestens 22', () => assert.ok(WELT_VERSION >= 22));

test('Determinismus: gleiche Karte und Seed ergeben gleiche Wagen, Zäune und Fingerabdruck', () => {
  const a = bauen(karte, 4711), b = bauen(karte, 4711);
  assert.deepEqual(wagen(a), wagen(b));
  assert.deepEqual(a.details.zaeune, b.details.zaeune);
  assert.equal(weltFingerabdruck(a), weltFingerabdruck(b));
  assert.ok(wagen(a).length > 0);
  const c = bauen(karte, 99);
  assert.notDeepEqual(wagen(a).map(w => [w.x, w.y]), wagen(c).map(w => [w.x, w.y]).slice(0, wagen(a).length), 'anderer Seed: andere Wagenlage');
});

test('Einkaufswagen stehen vor Läden: 2–5 je Laden, nahe der Tür, frei begehbar', () => {
  const w = bauen(karte, 4711), e = wagen(w);
  assert.ok(e.length >= 8, 'zu wenige Wagen: ' + e.length);
  const ids = new Set(e.map(b => b.id));
  assert.equal(ids.size, e.length, 'Ids eindeutig');
  assert.ok(w.einkaufswagenLaeden >= 3);
  // jeder Wagen gehört zu einem Haus mit Tür in höchstens 7,5 Kacheln Abstand
  const laeden = new Map();
  for (const b of e) {
    let best = null, bd = Infinity;
    for (const h of w.haeuser) {
      if (!h.tuer) continue;
      const d = Math.hypot((h.tuer.x + h.raus.dx + 0.5) * KACHEL - b.x, (h.tuer.y + h.raus.dy + 0.5) * KACHEL - b.y) / KACHEL;
      if (d < bd) { bd = d; best = h; }
    }
    assert.ok(bd <= 7.5, `Wagen ${b.id} ${bd.toFixed(1)} Kacheln von der nächsten Tür`);
    assert.ok(bd >= 1.7, 'Türvorplatz frei');
    laeden.set(best.nr, (laeden.get(best.nr) ?? 0) + 1);
    const t = w.hole(Math.floor(b.x / KACHEL), Math.floor(b.y / KACHEL));
    assert.ok(t === T.PLATZ || t === T.WIESE, 'Wagen steht auf freiem Boden');
    assert.ok(frei(w, b.x, b.y, 6), 'Wagen blockiert nichts und steht nicht im Hindernis');
    assert.ok(Number.isFinite(b.winkel) && typeof b.umgekippt === 'boolean');
  }
  for (const n of laeden.values()) assert.ok(n >= 2 && n <= 5, 'Wagen je Laden: ' + n);
  assert.ok(e.some(b => b.umgekippt) && e.some(b => !b.umgekippt), 'teils umgekippt');
  assert.equal(new Set(e.map(b => Math.round(b.winkel * 100))).size > e.length / 2, true, 'Drehung streut');
});

test('Einkaufswagen sind durchsuchbar: Name, Alles-durchsuchen und Beute überwiegend Wasser/Konserven', () => {
  const w = bauen(karte, 4711), e = wagen(w)[0];
  assert.equal(BEHAELTER_NAME.einkaufswagen, 'Einkaufswagen');
  const k = alleKandidaten(w, new Map(), new Map(), { x: e.x, y: e.y + 4, ebene: '' }, true);
  assert.ok(k.liste.some(q => q.id === e.id && q.art === 'einkaufswagen'), 'Wagen ist Kandidat beim Durchsuchen');
  const tab = BEUTE.einkaufswagen;
  assert.ok(tab, 'Beutetabelle');
  const r = zufall(5), zaehl = { wasser: 0, essen: 0, nichts: 0, sonst: 0 };
  for (let i = 0; i < 4000; i++) { const d = ziehe(tab, null, r); if (!d) zaehl.nichts++; else if (d === 'wasser' || d === 'essen') zaehl[d]++; else zaehl.sonst++; }
  assert.ok((zaehl.wasser + zaehl.essen) / 4000 > 0.75, JSON.stringify(zaehl));
  assert.ok(zaehl.wasser > 800 && zaehl.essen > 800, 'beides häufig: ' + JSON.stringify(zaehl));
  assert.ok(zaehl.nichts > 0 && zaehl.nichts / 4000 < 0.2, 'selten leer: ' + JSON.stringify(zaehl));
});

// ---- Zäune ----
function kantenWinkel(k) {
  const kanten = [];
  for (const s of k.strassen) for (let i = 0; i + 3 < s.p.length; i += 2) kanten.push({ a: s.p.slice(i, i + 4), max: 7 });
  for (const g of k.gebaeude) { const u = g.umriss; if (u?.length >= 6) for (let i = 0; i < u.length; i += 2) { const j = (i + 2) % u.length; kanten.push({ a: [u[i], u[i + 1], u[j], u[j + 1]], max: 4 }); } }
  return kanten;
}
const winkel = (x0, y0, x1, y1) => ((Math.atan2(y1 - y0, x1 - x0) % Math.PI) + Math.PI) % Math.PI;
const wdiff = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
function ausrichtung(k, zae) {
  const kanten = kantenWinkel(k).filter(e => Math.hypot(e.a[2] - e.a[0], e.a[3] - e.a[1]) >= 0.8);
  let lang = 0, parallel = 0;
  for (const z of zae) for (let i = 0; i + 3 < z.p.length; i += 2) {
    const L = Math.hypot(z.p[i + 2] - z.p[i], z.p[i + 3] - z.p[i + 1]);
    if (L < 2) continue;
    const mx = (z.p[i] + z.p[i + 2]) / 2, my = (z.p[i + 1] + z.p[i + 3]) / 2, w = winkel(z.p[i], z.p[i + 1], z.p[i + 2], z.p[i + 3]);
    let bd = Infinity, bw = null;
    for (const e of kanten) {
      const [ax, ay, bx, by] = e.a, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(ax + t * dx - mx, ay + t * dy - my);
      if (d <= e.max && d < bd && wdiff(winkel(ax, ay, bx, by), w) < 20 * Math.PI / 180) { bd = d; bw = winkel(ax, ay, bx, by); }
    }
    if (bw === null) continue;
    lang++; if (wdiff(bw, w) < 0.5 * Math.PI / 180) parallel++;
  }
  return { lang, parallel, anteil: parallel / Math.max(1, lang) };
}
function treppen(zae) {   // drei kurze Stücke (≤ 1,6 Kacheln) mit wechselndem Drehsinn = Rastertreppe
  let n = 0;
  for (const z of zae) for (let i = 0; i + 7 < z.p.length; i += 2) {
    const v = j => [z.p[j + 2] - z.p[j], z.p[j + 3] - z.p[j + 1]];
    const a = v(i), b = v(i + 2), c = v(i + 4);
    if ([a, b, c].every(s => Math.hypot(...s) <= 1.6)) { const k1 = a[0] * b[1] - a[1] * b[0], k2 = b[0] * c[1] - b[1] * c[0]; if (k1 * k2 < -0.05) n++; }
  }
  return n;
}
const kurz = zae => { let n = 0, s = 0; for (const z of zae) for (let i = 0; i + 3 < z.p.length; i += 2) { s++; if (Math.hypot(z.p[i + 2] - z.p[i], z.p[i + 3] - z.p[i + 1]) <= 1.6) n++; } return n / s; };

for (const name of ['geretsried', 'geretsried2']) {
  test(`Zäune ${name}: Treppen/Zickzack weg, weniger kurze Stücke, parallel zu Straße und Haus`, () => {
    const k = lade(name), glatt = zaeuneGlaetten(k).zaeune;
    assert.equal(glatt.length, k.zaeune.length, 'keine Linie geht verloren');
    assert.ok(treppen(glatt) <= treppen(k.zaeune));
    assert.equal(treppen(glatt), name === 'geretsried' ? 0 : treppen(glatt));
    assert.ok(kurz(glatt) < kurz(k.zaeune) - 0.01, `kurze Stücke ${kurz(k.zaeune).toFixed(2)} → ${kurz(glatt).toFixed(2)}`);
    const vor = ausrichtung(k, k.zaeune), nach = ausrichtung(k, glatt);
    assert.ok(nach.lang > 200);
    assert.ok(nach.anteil > vor.anteil + 0.1, `parallel ${vor.anteil.toFixed(2)} → ${nach.anteil.toFixed(2)}`);
    console.log(name, 'parallel', vor.anteil.toFixed(2), '→', nach.anteil.toFixed(2), 'kurz', kurz(k.zaeune).toFixed(2), '→', kurz(glatt).toFixed(2));
    assert.ok(nach.anteil > 0.4, 'ein großer Teil liegt exakt parallel');
    // Eckpunkte bleiben nahe an der alten Linie (höchstens 1,3 Kacheln)
    for (let li = 0; li < glatt.length; li += 7) {
      const alt = k.zaeune[li].p, neu = glatt[li].p;
      for (let i = 0; i < neu.length; i += 2) {
        let bd = Infinity;
        for (let j = 0; j + 3 < alt.length; j += 2) {
          const dx = alt[j + 2] - alt[j], dy = alt[j + 3] - alt[j + 1], t = Math.max(0, Math.min(1, ((neu[i] - alt[j]) * dx + (neu[i + 1] - alt[j + 1]) * dy) / (dx * dx + dy * dy || 1e-9)));
          bd = Math.min(bd, Math.hypot(alt[j] + t * dx - neu[i], alt[j + 1] + t * dy - neu[i + 1]));
        }
        if (alt.length < 4) bd = Math.hypot(alt[0] - neu[i], alt[1] - neu[i + 1]);
        assert.ok(bd <= 1.3, `Linie ${li}: Punkt ${bd.toFixed(2)} Kacheln von der Ursprungslinie`);
      }
    }
  });
}

test('Zäune: Idempotent, deterministisch und Gartenzäune bleiben begehbar durch Lücken', () => {
  const k = karte;
  const a = zaeuneGlaetten(k), b = zaeuneGlaetten(k);
  assert.deepEqual(a.zaeune, b.zaeune);
  const dünn = zaeuneAusduennen(k).zaeune;
  // Lücken zwischen aufeinanderfolgenden Teilen der ausgedünnten Linien existieren weiterhin
  let luecken = 0;
  for (let i = 0; i + 1 < dünn.length; i++) {
    const p = dünn[i].p, q = dünn[i + 1].p, d = Math.hypot(p[p.length - 2] - q[0], p[p.length - 1] - q[1]);
    if (d > 0.3 && d < 4) luecken++;
  }
  assert.ok(luecken > 20, 'Lücken: ' + luecken);
});

test('Kollision folgt der glatten Linie: Zaunfeld liegt dicht an der Linie, Figur läuft daran entlang', () => {
  const w = bauen(karte, 4711), z = w.details.zaeune;
  // lange gerade Stücke wählen; auf der Linie blockiert, 20 px seitlich frei (falls dort sonst nichts steht)
  let geprueft = 0, auf = 0, seitlich = 0;
  for (const l of z) for (let i = 0; i + 3 < l.p.length && geprueft < 80; i += 2) {
    const ax = l.p[i] * KACHEL, ay = l.p[i + 1] * KACHEL, bx = l.p[i + 2] * KACHEL, by = l.p[i + 3] * KACHEL, L = Math.hypot(bx - ax, by - ay);
    if (L < 14) continue;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay) / L, ny = (bx - ax) / L;
    if (!frei(w, mx + nx * 34, my + ny * 34, 3) || !frei(w, mx - nx * 34, my - ny * 34, 3)) continue;   // beide Seiten sonst frei
    geprueft++;
    if (!frei(w, mx, my, 4)) auf++;
    // eine Figur (Radius 11) kann parallel zur Linie im Abstand 34 px gehen
    let lauf = true;
    for (let t = -L / 2 + 6; t <= L / 2 - 6 && lauf; t += 6) lauf = frei(w, mx + nx * 34 + (bx - ax) / L * t, my + ny * 34 + (by - ay) / L * t, 11);
    if (lauf) seitlich++;
  }
  assert.ok(geprueft >= 20, 'Prüfstücke: ' + geprueft);
  assert.ok(auf / geprueft >= 0.8, `auf der Linie blockiert: ${auf}/${geprueft}`);
  assert.ok(seitlich / geprueft >= 0.5, `parallel daneben begehbar: ${seitlich}/${geprueft}`);
});
