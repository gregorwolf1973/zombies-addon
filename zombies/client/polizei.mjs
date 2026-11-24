// Darstellung der Polizisten an den Straßensperren (Verhalten: server/polizei.mjs) und Blaulicht-Flackern der Streifenwagen
// (der Wagen selbst ist Teil der Kulisse: client/aussehen.mjs zeichneSperren, Lage aus welt.sperren).
// Nachrichten: 'pol' { s: [[nr, x, y, blick, tot]], aus } (Sekundentakt), 'polschuss' { i, x, y, x2, y2, w, t } (Pistolenknall + Mündungsblitz, keine Leuchtspur), 'poltot'.
import * as ton from './ton.mjs';
import { fetzen } from './effekte.mjs';

// ctx: { skala: () => Figurengröße, leicheSkala: () => Größe der Leiche } aus spiel.mjs
export function polizeiRegistrieren(scene, raum, ctx) {
  scene.pol = { beamte: new Map(), leichen: new Map(), ctx, gfx: null, wagen: null };
  raum.onMessage('pol', m => polSync(scene, m));
  raum.onMessage('polschuss', m => polSchuss(scene, m));
  raum.onMessage('poltot', m => { if (!scene.pol.leichen.has(m.i)) polLeiche(scene, m.i, m.x, m.y, m.w); ton.ereignis('menschGebissen', m.x, m.y); fetzen(scene, m.x, m.y, m.w ?? 0, 1.2); });
}

// Neue Polizisten (Mixamo-SWAT dunkelblau, grafik/polizei.webp + polizei.json): Rahmen einmalig anlegen; null = alte Sprites
function polNeu(scene) {
  const p = scene.pol;
  if (p.neu !== undefined) return p.neu;
  const j = scene.cache.json.get('polizeineu');
  if (!j?.clips || !scene.textures.exists('polizei_neu') || !p.ctx.neuSkala) return (p.neu = null);
  const tex = scene.textures.get('polizei_neu'), namen = {};
  for (const [c, k] of Object.entries(j.clips)) {
    namen[c] = [];
    for (let i = 0; i < k.n; i++) {
      const n = `pol_${c}_${i}`, q = p.ctx.rahmenHalb([i * k.feld, k.y, k.feld, k.feld], p.ctx.halb());
      if (!tex.has(n)) tex.add(n, 0, q[0], q[1], q[2], q[3]);
      namen[c].push(n);
    }
  }
  return (p.neu = { clips: j.clips, namen });
}
const POL_TOD_MS = 1300;   // Sterbebewegung (Mixamo-Clip in ~1,3 s), danach liegt er

function polLeiche(scene, i, x, y, w, sofort = false) {
  const p = scene.pol;
  if (p.leichen.has(i)) return;
  const neu = polNeu(scene);
  if (neu) {
    const o = scene.add.image(x, y, 'polizei_neu', neu.namen.tod[0]).setScale(p.ctx.neuSkala()).setRotation(w ?? 0).setDepth(0.6);
    o.tod = { t0: sofort ? -1e9 : scene.time.now, fertig: false };   // sofort: schon vorher gestorben (beim Beitreten) – gleich liegend
    p.leichen.set(i, o);
    return;
  }
  p.leichen.set(i, scene.add.image(x, y, 'figuren2', scene.figurBild2('polizist')).setScale(p.ctx.leicheSkala()).setRotation((w ?? 0) + Math.PI / 2).setDepth(0.6).setTint(0xb0a0a0));
}

function polFigur(scene, x, y, blick) {
  const neu = polNeu(scene);
  const bild = neu ? scene.add.image(0, 0, 'polizei_neu', neu.namen.stehen[0]).setScale(scene.pol.ctx.neuSkala())
    : scene.add.image(0, 0, 'figuren2', scene.figurBild2('polizist')).setScale(scene.pol.ctx.skala());
  const box = scene.add.container(x, y, [bild]).setDepth(3.5).setRotation(blick);
  return { box, bild, blick, ziel: { x, y, w: blick }, tot: 0, neu: !!neu, lauf: 0, versatz: Math.random() * 1000, schussT: -1e9 };
}

function polSync(scene, m) {
  const p = scene.pol, da = new Set();
  for (const [i, x, y, w, tot] of m.s ?? []) {
    da.add(i);
    let e = p.beamte.get(i);
    if (!e) { e = polFigur(scene, x, y, w); p.beamte.set(i, e); }
    e.ziel = { x, y, w }; e.tot = tot;
    if (tot === 1 && !p.leichen.has(i)) polLeiche(scene, i, x, y, w, true);
    if (tot === 2 && p.leichen.has(i)) { p.leichen.get(i).destroy(); p.leichen.delete(i); }
  }
  // nicht mehr gemeldet (Schalter aus): Figuren und Leichen weg; sonst nur in der Nähe gesendet, dann bleiben sie stehen
  if (m.aus || (m.s?.length === 0 && p.beamte.size)) {
    for (const e of p.beamte.values()) e.box.destroy();
    for (const l of p.leichen.values()) l.destroy();
    p.beamte.clear(); p.leichen.clear();
  }
}

// Pistolenschuss: Knall, Mündungsblitz (kurz), bei Treffer Spritzer – keine Leuchtspur
function polSchuss(scene, m) {
  const e = scene.pol.beamte.get(m.i); if (e) e.schussT = scene.time.now;   // Rückstoß im Bild (polizeiAnimieren)
  const c = Math.cos(m.w), sn = Math.sin(m.w), mx = m.x + c * 14, my = m.y + sn * 14;
  scene.muendungsLicht(mx, my, '', 'pistole');
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(m.w).setScale(0.22).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, duration: 60, onComplete: () => blitz.destroy() });
  if (m.t) fetzen(scene, m.x2, m.y2, m.w, 0.8);
  ton.schuss(m.x, m.y, 1, 'pistole');
}

// Blaulicht der Streifenwagen an den Sperren: wechselndes Rot/Blau über dem gezeichneten Wagen (Lage wie in zeichneSperren)
function polBlaulicht(scene, sichtbar) {
  const p = scene.pol, sperren = scene.welt?.sperren;
  if (!sperren?.length) return;
  p.gfx ??= scene.add.graphics().setDepth(3.4);
  const g = p.gfx.clear().setVisible(sichtbar);
  if (!sichtbar) return;
  const v = scene.cameras.main.worldView, rand = 120, takt = Math.floor(scene.time.now / 180) % 4;
  for (const s of sperren) {
    if (s.x < v.x - rand || s.x > v.right + rand || s.y < v.y - rand || s.y > v.bottom + rand) continue;
    const seite = s.seite ?? 1, B = s.breite;
    // Wagenmitte in der Sperren-Ebene (x Richtung der Straße, y quer), Leuchtbalken 4 px hinter der Mitte, Wagen um 0,3 rad gedreht
    const wa = 0.3 * seite, ax = seite * 30, ay = -B * 0.16, cw = Math.cos(wa), sw = Math.sin(wa);
    const lampe = (ly, farbe, an) => {
      if (!an) return;
      const lx = ax + cw * -3 - sw * ly * 0.76, lyy = ay + sw * -3 + cw * ly * 0.76, c = Math.cos(s.winkel), n = Math.sin(s.winkel);
      const x = s.x + c * lx - n * lyy, y = s.y + n * lx + c * lyy;
      g.fillStyle(farbe, 0.22).fillCircle(x, y, 22); g.fillStyle(farbe, 0.45).fillCircle(x, y, 10); g.fillStyle(0xffffff, 0.8).fillCircle(x, y, 2.5);
    };
    lampe(-4, 0xff1744, takt === 0 || takt === 1);   // rot links
    lampe(4, 0x2979ff, takt === 2 || takt === 3);    // blau rechts, im Wechsel
  }
}

// pro Bild: Figuren ziehen weich zum Serverstand; Blaulicht flackert
export function polizeiAnimieren(scene) {
  const p = scene.pol;
  if (!p) return;
  const draussen = !scene.aktEbene;
  polBlaulicht(scene, draussen);
  if (!p.beamte.size) return;
  const dt = scene.game.loop.delta / 1000, k = Math.min(1, dt * 8);
  const neu = polNeu(scene), jetzt = scene.time.now;
  for (const e of p.beamte.values()) {
    e.box.setVisible(draussen && e.tot === 0);
    if (e.tot !== 0) continue;
    const x0 = e.box.x, y0 = e.box.y;
    e.box.x += (e.ziel.x - e.box.x) * k; e.box.y += (e.ziel.y - e.box.y) * k;
    let db = e.ziel.w - e.blick; db = Math.atan2(Math.sin(db), Math.cos(db)); e.blick += db * k;
    e.box.setRotation(e.blick);
    if (e.neu && neu) {
      // Gehen nach zurückgelegtem Weg (kein Rutschen), sonst Stehen mit Pistole; Schuss: kurzer Rückstoß nach hinten
      const weg = Math.hypot(e.box.x - x0, e.box.y - y0);
      e.lauf += weg;
      const geht = weg / Math.max(dt, 0.001) > 8, kg = neu.clips.gehen, ks = neu.clips.stehen;
      const bild = geht ? neu.namen.gehen[Math.floor(e.lauf / (kg.weg || 30) * kg.n) % kg.n]   // wie die Helden (hfBild): Weg je Zyklus aus dem Clip
        : neu.namen.stehen[Math.floor((jetzt + e.versatz) / (ks.dauer * 1000) * ks.n) % ks.n];
      e.bild.setFrame(bild).setScale(p.ctx.neuSkala());
      e.bild.x = -5 * Math.max(0, 1 - (jetzt - e.schussT) / 130);
    }
  }
  for (const l of p.leichen.values()) {
    l.setVisible(draussen);
    if (l.tod && !l.tod.fertig && neu) {
      const n = neu.namen.tod.length, i = Math.min(n - 1, Math.floor((jetzt - l.tod.t0) / POL_TOD_MS * n));
      l.setFrame(neu.namen.tod[i]); if (i === n - 1) l.tod.fertig = true;
    }
  }
}
