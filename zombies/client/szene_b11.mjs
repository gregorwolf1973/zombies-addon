// Darstellung der Szene „Stau auf der B11“ (Karte geretsried2, Verhalten: server/szene_b11.mjs): 8 Infanteristen, Puma und Leopard 2 (streifen
// langsam, Turm dreht, hinterlassen Kettenspuren), plattgefahrene Autos auf dem Parkplatz, Schüsse.
// Autos, Wracks, Feuer, Feuerwehr und der Mörserpanzer sind gewöhnliche Fahrzeuge/Feuer im Spielzustand und werden von spiel.mjs gezeichnet.
// Nachrichten: 'b11' { s: [[nr, x, y, blick, tot]], p/l: [x, y, w, turm] | 0 (Puma/Leopard), aus } (jede Sekunde), 'b11f' { p, l } (5 mal je
// Sekunde, solange ein Panzer rollt), 'b11schuss', 'b11tot', 'b11platt' { x, y, w } (Auto überfahren). Plattgefahrene Autos: state.platt (client/b11_platt.mjs).
import * as ton from './ton.mjs';
import { PUMA_BILD } from './stuetzpunkt.mjs';
import { fetzen } from './effekte.mjs';
import { LEOPARD } from './evak.mjs';
import { fzPx } from './masse.mjs';
import { kettenSpur, kettenAnimieren } from './ketten.mjs';
import { plattLesen } from './b11_platt.mjs';

// ctx: { skala: () => Soldatengröße, raum } aus spiel.mjs
export function b11Registrieren(scene, raum, ctx) {
  scene.b11 = { soldaten: new Map(), leichen: new Map(), puma: null, leopard: null, ctx, raum, platt: { stand: '', gfx: null, autos: null } };
  raum.onMessage('b11', m => b11Sync(scene, m));
  raum.onMessage('b11f', m => b11Fahrzeuge(scene, m));
  raum.onMessage('b11platt', m => b11Staub(scene, m));
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
  const m = scene.pumaMasse(fzPx('puma')[0]), tb = scene.textures.get('puma-turm').getSourceImage();
  const wanne = scene.add.image(p[0], p[1], 'puma-wanne').setRotation(p[2]).setScale(m.skala).setDepth(5);
  const turm = scene.add.image(0, 0, 'puma-turm').setOrigin((PUMA_BILD.turmMx + m.R) / tb.width, (PUMA_BILD.turmMy + m.R) / tb.height)
    .setRotation(p[3]).setScale(m.skala).setDepth(5.1);
  const c = Math.cos(p[2]), s = Math.sin(p[2]), vx = PUMA_BILD.turmX * m.f, vy = PUMA_BILD.turmY * m.f;
  turm.setPosition(p[0] + c * vx - s * vy, p[1] + s * vx + c * vy);
  return { wanne, turm, f: m.f, soll: p[3], ziel: { x: p[0], y: p[1], w: p[2] }, w: p[2], breite: fzPx('puma')[1] };
}

// Leopard 2 (Bilder wie der Evakuierungspanzer: Wanne, Turm mit Drehpunkt, Kommandant und Ladeschütze in den Luken)
function b11Leopard(scene, l) {
  const wanne = scene.add.image(l[0], l[1], 'leopard-wanne').setRotation(l[2]).setScale(LEOPARD.skala).setDepth(5);
  const turm = scene.add.image(l[0], l[1], 'leopard-turm').setOrigin(LEOPARD.turmOx, LEOPARD.turmOy).setRotation(l[3]).setScale(LEOPARD.skala).setDepth(5.1);
  const sk = scene.b11.ctx.skala() * 0.8, soldat = () => scene.add.image(0, 0, 'figuren2', scene.figurBild2('soldat_idle')).setScale(sk).setDepth(5.2);
  return { wanne, turm, kdt: soldat(), lader: soldat(), soll: l[3], ziel: { x: l[0], y: l[1], w: l[2] }, w: l[2], breite: LEOPARD.breite };
}

function b11FzZiel(e, a) { if (e && a) { e.ziel = { x: a[0], y: a[1], w: a[2] }; e.soll = a[3]; } }
function b11Fahrzeuge(scene, m) { const b = scene.b11; b11FzZiel(b.puma, m.p); b11FzZiel(b.leopard, m.l); }

// Staubwolke und Knirschen, wenn ein Panzer ein geparktes Auto überfährt
function b11Staub(scene, m) {
  for (let i = 0; i < 4; i++) {
    const r = scene.add.circle(m.x + (Math.random() - 0.5) * 24, m.y + (Math.random() - 0.5) * 14, 5 + Math.random() * 4, 0x8d8579, 0.5).setDepth(6.4);
    scene.tweens.add({ targets: r, x: r.x + (Math.random() - 0.5) * 30, y: r.y - 6 - Math.random() * 10, alpha: 0, scale: 2.2, duration: 900, onComplete: () => r.destroy() });
  }
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
  if (m.l && !b.leopard && scene.textures.exists('leopard-wanne') && scene.textures.exists('leopard-turm')) b.leopard = b11Leopard(scene, m.l);
  b11Fahrzeuge(scene, m);
  b.aus = !!m.aus;
}

// pro Bild: Soldaten ziehen weich nach, schießen sichtbar; Panzer rollen weich zum Server-Stand, Türme drehen zum Server-Winkel
export function b11Animieren(scene) {
  const b = scene.b11;
  if (!b) return;
  kettenAnimieren(scene);
  b11Platt(scene);
  if (!b.soldaten.size && !b.puma && !b.leopard) return;
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
  const p = b.puma, l = b.leopard;
  if (p) {
    b11Rollen(scene, p, dt, draussen, 'b11puma');
    const c = Math.cos(p.wanne.rotation), s = Math.sin(p.wanne.rotation), vx = PUMA_BILD.turmX * p.f, vy = PUMA_BILD.turmY * p.f;
    p.turm.setPosition(p.wanne.x + c * vx - s * vy, p.wanne.y + s * vx + c * vy);
    p.turm.setVisible(draussen);
  }
  if (l) {
    b11Rollen(scene, l, dt, draussen, 'b11leopard');
    const c = Math.cos(l.wanne.rotation), s = Math.sin(l.wanne.rotation), tx = l.wanne.x + c * LEOPARD.turmX, ty = l.wanne.y + s * LEOPARD.turmX;
    const loc = l.turm.rotation, lc = Math.cos(loc), ls = Math.sin(loc), luke = (q, vx, vy) => q.setPosition(tx + lc * vx - ls * vy, ty + ls * vx + lc * vy).setRotation(loc).setVisible(draussen);
    l.turm.setPosition(tx, ty).setVisible(draussen);
    luke(l.kdt, LEOPARD.kommandantX, LEOPARD.kommandantY).setFrame(scene.figurBild2('soldat_idle', Math.floor(jetzt / 300) % 3));
    luke(l.lader, LEOPARD.mgX, LEOPARD.mgY).setFrame(scene.figurBild2('soldat_idle', Math.floor(jetzt / 260 + 1) % 3));
  }
}

// Wanne weich zum Server-Stand rollen/drehen, Turm drehen, Kettenspur legen
function b11Rollen(scene, e, dt, draussen, id) {
  const k = Math.min(1, dt * 6), z = e.ziel, w = e.wanne;
  const vorher = { x: w.x, y: w.y };
  if (Math.hypot(z.x - w.x, z.y - w.y) > 200) w.setPosition(z.x, z.y);   // Sprung (Neustart): nicht quer über die Karte gleiten
  else w.setPosition(w.x + (z.x - w.x) * k, w.y + (z.y - w.y) * k);
  w.setRotation(w.rotation + Math.atan2(Math.sin(z.w - w.rotation), Math.cos(z.w - w.rotation)) * k);
  w.setVisible(draussen);
  let d = e.soll - e.turm.rotation; d = Math.atan2(Math.sin(d), Math.cos(d));
  e.turm.setRotation(e.turm.rotation + d * Math.min(1, dt * 8));
  if (draussen && Math.hypot(w.x - vorher.x, w.y - vorher.y) > 0.01) kettenSpur(scene, id, w.x, w.y, w.rotation, e.breite);
}

// plattgefahrene Autos: dunkler Fleck über dem gemalten Auto, darauf die zerquetschte Karosserie, um den Schub in Fahrtrichtung verschoben
const PLATT_FARBEN = [0x6b6f75, 0x5e2222, 0x24394f, 0x2c2c2c, 0x8d8d80, 0x234a2e];
function b11Platt(scene) {
  const b = scene.b11, st = b.raum?.state?.platt;
  if (!st) return;
  b.platt.t = (b.platt.t ?? 0) + 1;
  if (b.platt.t % 6 && b.platt.gfx) { b.platt.gfx.setVisible(!scene.aktEbene); return; }
  let stand = '';
  for (const [id, v] of st) stand += id + ':' + v + ',';
  stand += scene.welt?.behaelter ? '' : '-';
  if (stand === b.platt.stand && b.platt.gfx) { b.platt.gfx.setVisible(!scene.aktEbene); return; }
  b.platt.stand = stand;
  b.platt.autos ??= new Map((scene.welt?.behaelter ?? []).filter(q => q.art === 'auto').map(q => [q.id, q]));
  const g = (b.platt.gfx ??= scene.add.graphics().setDepth(1.06)).clear().setVisible(!scene.aktEbene);
  for (const [id, v] of st) {
    const a = b.platt.autos.get(id);
    if (!a || b.raum.state.verbrannt?.has?.('auto:' + id)) continue;
    const { dx, dy } = plattLesen(v), w0 = (Number.isFinite(a.winkel) ? a.winkel : a.senkrecht ? Math.PI / 2 : 0) + ((a.farbe + Math.round(a.x)) % 2 ? Math.PI : 0);
    const n = parseInt(id.slice(1), 10) || 0, jit = i => Math.sin(n * 12.9898 + i * 78.233) * 0.5;
    const rot = (x, y, cx, cy, w) => ({ x: cx + x * Math.cos(w) - y * Math.sin(w), y: cy + x * Math.sin(w) + y * Math.cos(w) });
    // 1. Maske in Autoform (abgerundet, leicht größer als das gemalte Auto 36 × 16 = 4,5 × 2 m; Maße unten noch für 46 × 22 gezeichnet, Faktor S) verdeckt das Original
    const S = 36 / 46, rotS = (x, y, cx, cy, w) => rot(x * S, y * S, cx, cy, w);
    const rund = (hl, hb, r, cx, cy, w) => {
      hl *= S; hb *= S; r *= S;
      const pts = [];
      for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) for (let k = 0; k <= 4; k++) {
        const a = a0 + k * Math.PI / 8;
        pts.push(rot(sx * (hl - r) + Math.cos(a) * r, sy * (hb - r) + Math.sin(a) * r, cx, cy, w));
      }
      return pts;
    };
    g.fillStyle(0x3b3b3d, 1).fillPoints(rund(25, 13, 9, a.x, a.y, w0), true);
    // 2. zerknautschtes Auto: gleiche Silhouette, abgedunkelte Farbe, eingedrückte Mitte, Knicke, Glassplitter
    const cx = a.x + dx, cy = a.y + dy, farbe = PLATT_FARBEN[(a.farbe ?? 0) % PLATT_FARBEN.length];
    g.fillStyle(0x2b2b2d, 1).fillPoints(rund(24, 12.5, 9, cx, cy, w0), true);   // gleich großes Wrack: deckt auch den Schubrand ab
    g.fillStyle(farbe, 1).fillPoints(rund(22, 11, 8, cx, cy, w0), true);
    g.fillStyle(0x000000, 0.4).fillPoints(rund(22, 11, 8, cx, cy, w0), true);
    g.fillStyle(0x000000, 0.35).fillPoints(rund(9 + jit(1) * 2, 8.5, 6, cx, cy, w0), true);   // eingedrückte Mitte
    g.lineStyle(1, 0x000000, 0.65);
    for (let i = 0; i < 3; i++) { const p1 = rotS(-13 + i * 11, -10, cx, cy, w0), p2 = rotS(-10 + i * 11 + jit(i) * 4, 10, cx, cy, w0); g.lineBetween(p1.x, p1.y, p2.x, p2.y); }
    g.lineStyle(1, 0xffffff, 0.12);
    for (let i = 0; i < 2; i++) { const p1 = rotS(-8 + i * 14, -10, cx, cy, w0), p2 = rotS(-6 + i * 14, 10, cx, cy, w0); g.lineBetween(p1.x + 1, p1.y, p2.x + 1, p2.y); }
    g.fillStyle(0xcfd8dc, 0.85);
    for (let i = 0; i < 5; i++) { const q = rotS(-15 + i * 7.5 + jit(i + 80) * 5, jit(i + 90) * 16, cx, cy, w0); g.fillRect(q.x - 1, q.y - 1, 2, 1.4); }
    // 3. Kettenabdrücke quer über das Wrack (in Schubrichtung)
    const sw = Math.atan2(dy || 0.001, dx || 0.001);
    g.lineStyle(2, 0x14110e, 0.3);
    for (const ver of [-7, 7]) { const p1 = rotS(-26, ver, cx, cy, sw), p2 = rotS(26, ver, cx, cy, sw); g.lineBetween(p1.x, p1.y, p2.x, p2.y); }
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
