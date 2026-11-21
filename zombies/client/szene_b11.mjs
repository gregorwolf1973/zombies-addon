// Darstellung der Szene „Stau auf der B11“ (Karte geretsried2, Verhalten: server/szene_b11.mjs): 8 Infanteristen, Puma mit drehendem Turm, Schüsse.
// Autos, Wracks, Feuer, Feuerwehr und der Mörserpanzer sind gewöhnliche Fahrzeuge/Feuer im Spielzustand und werden von spiel.mjs gezeichnet.
// Nachrichten: 'b11' { s: [[nr, x, y, blick, tot]], p: [x, y, w, turm] | 0, aus } (jede Sekunde), 'b11schuss', 'b11tot'.
import * as ton from './ton.mjs';
import { PUMA_BILD } from './stuetzpunkt.mjs';
import { fetzen } from './effekte.mjs';

// ctx: { skala: () => Soldatengröße, raum } aus spiel.mjs
export function b11Registrieren(scene, raum, ctx) {
  scene.b11 = { soldaten: new Map(), leichen: new Map(), puma: null, ctx };
  raum.onMessage('b11', m => b11Sync(scene, m));
  raum.onMessage('b11schuss', m => b11Schuss(scene, m));
  raum.onMessage('b11tot', m => { const l = scene.b11.leichen.get(m.i); if (!l) b11Leiche(scene, m.i, m.x, m.y, m.w); ton.ereignis('menschGebissen', m.x, m.y); fetzen(scene, m.x, m.y, m.w ?? 0, 1.4); });
}

function b11Leiche(scene, i, x, y, w) {
  const b = scene.b11;
  if (b.leichen.has(i)) return;
  const bild = scene.add.image(x, y, 'figuren2', scene.figurBild2('verwundet', i)).setScale(b.ctx.leicheSkala()).setRotation(w ?? 0).setDepth(0.6).setTint(0xb0a0a0);
  b.leichen.set(i, bild);
}

function b11Soldat(scene, i, x, y, blick) {
  const sk = scene.b11.ctx.skala();
  const fuesse = scene.add.image(0, 0, 'figuren2', scene.figurBild2('sv_fuesse_idle')).setScale(sk);
  const bild = scene.add.image(0, 0, 'figuren2', scene.figurBild2('soldat_idle', i)).setScale(sk);
  const box = scene.add.container(x, y, [fuesse, bild]).setDepth(3.5).setRotation(blick);
  return { box, bild, fuesse, i, blick, schussBis: 0, w: blick, ziel: { x, y, w: blick } };
}

function b11Puma(scene, p) {
  const m = scene.pumaMasse(113), tb = scene.textures.get('puma-turm').getSourceImage();
  const wanne = scene.add.image(p[0], p[1], 'puma-wanne').setRotation(p[2]).setScale(m.skala).setDepth(5);
  const turm = scene.add.image(0, 0, 'puma-turm').setOrigin((PUMA_BILD.turmMx + m.R) / tb.width, (PUMA_BILD.turmMy + m.R) / tb.height)
    .setRotation(p[3]).setScale(m.skala).setDepth(5.1);
  const c = Math.cos(p[2]), s = Math.sin(p[2]), vx = PUMA_BILD.turmX * m.f, vy = PUMA_BILD.turmY * m.f;
  turm.setPosition(p[0] + c * vx - s * vy, p[1] + s * vx + c * vy);
  return { wanne, turm, f: m.f, soll: p[3] };
}

function b11Sync(scene, m) {
  const b = scene.b11;
  for (const [i, x, y, w, tot] of m.s ?? []) {
    let e = b.soldaten.get(i);
    if (!e) { e = b11Soldat(scene, i, x, y, w); b.soldaten.set(i, e); }
    e.ziel = { x, y, w }; e.tot = tot;
    if (tot === 1 && !b.leichen.has(i)) b11Leiche(scene, i, x, y, w);
    if (tot === 2 && b.leichen.has(i)) { b.leichen.get(i).destroy(); b.leichen.delete(i); }
  }
  if (m.p && !b.puma && scene.textures.exists('puma-wanne-bild')) b.puma = b11Puma(scene, m.p);
  if (m.p && b.puma) b.puma.soll = m.p[3];
  b.aus = !!m.aus;
}

// pro Bild: Soldaten ziehen weich nach, schießen sichtbar; Puma-Turm dreht zum Server-Winkel
export function b11Animieren(scene) {
  const b = scene.b11;
  if (!b || (!b.soldaten.size && !b.puma)) return;
  const jetzt = scene.time.now, dt = scene.game.loop.delta / 1000, k = Math.min(1, dt * 8);
  const draussen = !scene.aktEbene;
  for (const e of b.soldaten.values()) {
    e.box.setVisible(draussen && e.tot === 0);
    if (e.tot !== 0) continue;
    e.box.x += (e.ziel.x - e.box.x) * k; e.box.y += (e.ziel.y - e.box.y) * k;
    let db = e.ziel.w - e.blick; db = Math.atan2(Math.sin(db), Math.cos(db)); e.blick += db * k;
    const schiesst = e.schussBis > jetzt;
    e.bild.setFrame(schiesst ? scene.figurBild2('soldat_schuss', Math.floor(jetzt / 70)) : scene.figurBild2('soldat_idle', Math.floor(jetzt / 220 + e.i * 3)));
    e.box.setRotation(schiesst ? e.w : e.blick);
  }
  for (const l of b.leichen.values()) l.setVisible(draussen);
  const p = b.puma;
  if (p) {
    p.wanne.setVisible(draussen); p.turm.setVisible(draussen);
    let d = p.soll - p.turm.rotation; d = Math.atan2(Math.sin(d), Math.cos(d));
    p.turm.setRotation(p.turm.rotation + d * Math.min(1, dt * 8));
  }
}

// Gewehr (Soldat nr i) oder Kanone (Puma): Leuchtspur, Mündungsblitz, Rauch, Einschlag
function b11Schuss(scene, m) {
  const b = scene.b11, kanone = m.art === 'kanone', c = Math.cos(m.w), sn = Math.sin(m.w);
  let mx = m.x1 + c * 30, my = m.y1 + sn * 30;
  if (kanone && b.puma) { mx = b.puma.turm.x + Math.cos(b.puma.turm.rotation) * PUMA_BILD.muendung * b.puma.f; my = b.puma.turm.y + Math.sin(b.puma.turm.rotation) * PUMA_BILD.muendung * b.puma.f; }
  const e = !kanone ? b.soldaten.get(m.i) : null;
  if (e) { e.schussBis = scene.time.now + 260; e.w = m.w; }
  const g = scene.add.graphics().setDepth(7), l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
  g.lineStyle(kanone ? 3 : 2, kanone ? 0xffcc80 : 0xffee58, 1).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  g.lineStyle(1, 0xffffff, 0.9).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  scene.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(m.w).setScale(kanone ? 1.0 : 0.5).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, scale: blitz.scale * 1.25, duration: kanone ? 160 : 90, onComplete: () => blitz.destroy() });
  if (kanone) {
    for (let i = 0; i < 6; i++) {
      const r = scene.add.circle(mx + (Math.random() - 0.5) * 10, my + (Math.random() - 0.5) * 10, 5 + Math.random() * 5, 0xbdbdbd, 0.55).setDepth(6.5);
      scene.tweens.add({ targets: r, x: r.x + c * (10 + Math.random() * 24) + (Math.random() - 0.5) * 16, y: r.y + sn * (10 + Math.random() * 24) + (Math.random() - 0.5) * 16, alpha: 0, scale: 2.2, duration: 700, onComplete: () => r.destroy() });
    }
    scene.explosion(m.x2, m.y2, 24, 0.45);
  }
  if (m.t) fetzen(scene, m.x2, m.y2, m.w, kanone ? 2 : 0.8);
  const jetzt = performance.now();
  if (jetzt - (scene.letzterB11Knall ?? 0) > (kanone ? 0 : 70)) { scene.letzterB11Knall = jetzt; if (kanone) ton.kanone(m.x1, m.y1); else ton.schuss(m.x1, m.y1, 1.4, 'gewehr'); }
}
