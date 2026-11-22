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

function polLeiche(scene, i, x, y, w) {
  const p = scene.pol;
  if (p.leichen.has(i)) return;
  p.leichen.set(i, scene.add.image(x, y, 'figuren2', scene.figurBild2('polizist')).setScale(p.ctx.leicheSkala()).setRotation((w ?? 0) + Math.PI / 2).setDepth(0.6).setTint(0xb0a0a0));
}

function polFigur(scene, x, y, blick) {
  const bild = scene.add.image(0, 0, 'figuren2', scene.figurBild2('polizist')).setScale(scene.pol.ctx.skala());
  const box = scene.add.container(x, y, [bild]).setDepth(3.5).setRotation(blick);
  return { box, bild, blick, ziel: { x, y, w: blick }, tot: 0 };
}

function polSync(scene, m) {
  const p = scene.pol, da = new Set();
  for (const [i, x, y, w, tot] of m.s ?? []) {
    da.add(i);
    let e = p.beamte.get(i);
    if (!e) { e = polFigur(scene, x, y, w); p.beamte.set(i, e); }
    e.ziel = { x, y, w }; e.tot = tot;
    if (tot === 1 && !p.leichen.has(i)) polLeiche(scene, i, x, y, w);
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
  for (const e of p.beamte.values()) {
    e.box.setVisible(draussen && e.tot === 0);
    if (e.tot !== 0) continue;
    e.box.x += (e.ziel.x - e.box.x) * k; e.box.y += (e.ziel.y - e.box.y) * k;
    let db = e.ziel.w - e.blick; db = Math.atan2(Math.sin(db), Math.cos(db)); e.blick += db * k;
    e.box.setRotation(e.blick);
  }
  for (const l of p.leichen.values()) l.setVisible(draussen);
}
