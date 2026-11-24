// Darstellung der Autos, die Spieler mit dem Autoschlüssel fahren (Regeln: client/pkw.mjs, Server: server/pkw.mjs), und der Unfallszene
// (server/unfallszene.mjs): Bild des genommenen Autos (gleiche Variante wie geparkt), Lebensbalken, Motorgeräusch (Ereignis 'autoMotor',
// Tonhöhe nach Tempo), weggefahrene Autos aus den Kartenstücken entfernen (Nachricht 'autosWeg'), offene Autotüren ('autotuer').
import { KACHEL } from './welt.mjs';
import { autoVonOben, zeichneBoden } from './aussehen.mjs';
import { parkAutoWeg, pkwBehaelterId, PKW, PKW_VORGABE } from './pkw.mjs';
import * as ton from './ton.mjs';

let weg = { seed: null, ids: [], plaetze: PKW_VORGABE.plaetze };

// Nachricht 'autosWeg' { seed, ids, plaetze } (bei jedem Wegfahren und beim Beitritt)
export function autosWegEmpfangen(m) {
  if (!m || !Array.isArray(m.ids)) return;
  weg = { seed: m.seed ?? null, ids: m.ids.map(String), plaetze: Number(m.plaetze) || PKW_VORGABE.plaetze };
}
export const pkwPlaetze = () => weg.plaetze;

// je Bild: noch nicht übernommene weggefahrene Autos in die eigene Welt eintragen (Kletter-Index wie auf dem Server) und die
// Bodenbilder der betroffenen Kartenstücke neu malen (das gemalte Auto verschwindet)
export function autosWegAbgleich(scene, seed) {
  const welt = scene.welt;
  if (!welt || !weg.ids.length || (weg.seed !== null && seed !== undefined && weg.seed !== seed)) return;
  for (const id of weg.ids) {
    if (welt.autosWeg?.has(id)) continue;
    const b = parkAutoWeg(welt, id);
    if (b) stueckeNeuMalen(scene, b.x, b.y, 40);
  }
}

// Bodenbild (enthält die geparkten Autos) der Kartenstücke um (x, y) neu malen, ohne das Stück abzubauen
function stueckeNeuMalen(scene, x, y, rand) {
  for (const st of scene.stuecke?.values() ?? []) {
    const r = st.rect, x0 = r.x0 * KACHEL, y0 = r.y0 * KACHEL, x1 = r.x1 * KACHEL, y1 = r.y1 * KACHEL;
    if (x + rand < x0 || x - rand > x1 || y + rand < y0 || y - rand > y1) continue;
    const key = 'boden-' + st.key;
    if (!scene.textures.exists(key)) continue;
    const t = scene.textures.get(key), ctx = t.getContext?.();
    if (!ctx) continue;
    ctx.clearRect(0, 0, st.B, st.H);
    zeichneBoden(ctx, scene.welt, r);
    t.refresh();
  }
}

// Bild des gefahrenen Autos: dieselbe Variante/Farbe wie das geparkte Auto (Behälter-Id steckt in der Fahrzeug-Id), Front nach rechts
export function pkwTextur(scene, id, f) {
  const bid = pkwBehaelterId(id), key = 'fz-pkw-' + bid;
  if (scene.textures.exists(key)) return key;
  const b = (scene.welt?.behaelter ?? []).find(q => q.id === bid);
  if (!b) return scene.fahrzeugTextur('auto', f.farbe ?? 0);
  const breit = 60, hoch = 28, t = scene.textures.createCanvas(key, breit, hoch), c = t.getContext();
  const flip = !b.vorwaerts && (b.farbe + Math.round(b.x)) % 2;   // wie autoVonOben: so gedreht, dass die Front nach rechts zeigt
  c.save(); c.translate(breit / 2 - b.x, hoch / 2 - b.y);
  autoVonOben(c, { ...b, winkel: flip ? Math.PI : 0, senkrecht: false, ohneSchatten: true });
  c.restore(); t.refresh();
  return key;
}

// pro Bild je gefahrenem Auto (o = Fahrzeugobjekt aus spiel.mjs busObj): Lebensbalken und Motorgeräusch
export function pkwDarstellung(scene, o, id, f, dt, lokal, aktEbene, s) {
  const d = lokal ? Math.hypot(o.x - lokal.x, o.y - lokal.y) : Infinity;
  // Tempo aus der gezeichneten Bewegung (px/s)
  const v = o.pkwLetzt ? Math.hypot(o.x - o.pkwLetzt[0], o.y - o.pkwLetzt[1]) / Math.max(dt, 0.001) : 0;
  o.pkwLetzt = [o.x, o.y];
  o.pkwV = (o.pkwV ?? 0) + (v - (o.pkwV ?? 0)) * Math.min(1, dt * 4);
  // Lebensbalken über dem Auto (nur beschädigt und in der Nähe)
  const leben = f.leben || 100, zeige = !aktEbene && d < 500 && leben < 100;
  if (zeige) {
    o.pkwBalken ??= scene.add.graphics().setDepth(7.2);
    const g = o.pkwBalken.clear().setVisible(true), k = scene.uiMass?.() ?? 1, w = 26 * k, h = 3.5 * k, x = o.x - w / 2, y = o.y - PKW.laenge / 2 - 8 * k;
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(leben > 50 ? 0x66bb6a : leben > 25 ? 0xffca28 : 0xef5350, 1).fillRect(x, y, w * leben / 100, h);
  } else o.pkwBalken?.setVisible(false);
  // Motor: Schleife aus der Zuordnung 'autoMotor' (ohne Datei still), lauter und höher mit dem Tempo, solange jemand drinsitzt oder es rollt
  const laeuft = !f.haelt || o.pkwV > 2 || [...(s?.spieler?.values() ?? [])].some(q => q.imBoxer && Math.abs(q.x - f.x) < 24 && Math.abs(q.y - f.y) < 24);
  const hoerbar = !aktEbene && d < 600 && laeuft;
  if (hoerbar && !o.motor && !o.motorVersucht) { o.motor = ton.schleifeStarten('autoMotor', true); o.motorVersucht = !o.motor; }
  if (!hoerbar) o.motorVersucht = false;
  if (o.motor) {
    ton.sireneLage(o.motor, o.x, o.y, 0, 600, !hoerbar);
    try { o.motor.rate?.setTargetAtTime?.(0.75 + 0.75 * Math.min(1, o.pkwV / 178), 0, 0.15); } catch { /* ältere Browser */ }
    if (!hoerbar && d > 800) { ton.sireneStoppen(o.motor); o.motor = null; }
  }
}
// Aufräumen, wenn das Fahrzeug verschwindet oder zum Wrack wird
export function pkwAufraeumen(o) {
  o.pkwBalken?.destroy(); o.pkwBalken = null;
  if (o.motor) { ton.sireneStoppen(o.motor); o.motor = null; }
}

// Unfallszene: Tür(en) eines Unfallautos gehen auf (Server: 'autotuer' { x, y, w, s: Seite der Fahrertür ±1, z: Beifahrertür auch })
export function autoTuer(scene, m) {
  if (scene.aktEbene) return;
  const seiten = m.z ? [m.s, -m.s] : [m.s];
  seiten.forEach((seite, i) => {
    const g = scene.add.graphics().setDepth(4.7);
    const c = Math.cos(m.w), s = Math.sin(m.w), hb = PKW.breite / 2, lang = 9;
    // Scharnier vorn an der Tür (etwas vor der Fahrzeugmitte), Tür klappt nach außen
    const sx = m.x + c * 4 - s * seite * hb, sy = m.y + s * 4 + c * seite * hb;
    const z = { a: 0 };
    const malen = () => {
      const a = m.w + Math.PI + seite * z.a;   // geschlossen: zeigt nach hinten; offen: um bis zu 70° nach außen gedreht
      g.clear().lineStyle(2.2, 0x263238, 1).lineBetween(sx, sy, sx + Math.cos(a) * lang, sy + Math.sin(a) * lang);
      g.lineStyle(1, 0xb0bec5, 0.9).lineBetween(sx, sy, sx + Math.cos(a) * lang * 0.8, sy + Math.sin(a) * lang * 0.8);
    };
    malen();
    scene.tweens.add({ targets: z, a: -1.22, duration: 380, delay: i * 350, ease: 'Back.Out', onUpdate: malen });
    scene.tweens.add({ targets: g, alpha: 0, delay: 45000, duration: 2000, onComplete: () => g.destroy() });
  });
}
