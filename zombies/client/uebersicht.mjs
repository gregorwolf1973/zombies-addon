// Übersichtskarte: klein in der Ecke, angetippt groß. Häuser und Straßen nach den echten Umrissen (OSM),
// Zoom mit +/−, Mausrad oder zwei Fingern, in der großen Ansicht verschiebbar.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';

const S = 4;   // Pixel je Kachel im Grundbild

function grundbild(welt) {
  const c = document.createElement('canvas');
  c.width = BREITE * S; c.height = HOEHE * S;
  const g = c.getContext('2d');
  g.fillStyle = '#5b8f45'; g.fillRect(0, 0, c.width, c.height);
  const v = welt.vektor;
  if (!v) {
    // erzeugtes Dorf: aus dem Raster
    const F = { [T.STRASSE]: '#8a8b8f', [T.WAND]: '#b0634a', [T.LEER]: '#b0634a', [T.BODEN]: '#c08a6a', [T.TUER]: '#ffd54f',
      [T.WASSER]: '#3a83b0', [T.BAUM]: '#386b2e', [T.PLATZ]: '#c8bba0', [T.ZAUN]: '#4e342e', [T.DEKO]: '#777' };
    for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
      const f = F[welt.hole(x, y)];
      if (f) { g.fillStyle = f; g.fillRect(x * S, y * S, S, S); }
    }
    return c;
  }
  const pfad = (p, zu) => {
    g.beginPath(); g.moveTo(p[0] * S, p[1] * S);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * S, p[i + 1] * S);
    if (zu) g.closePath();
  };
  const FL = { wald: '#3c6e31', parkplatz: '#9c9c98', platz: '#cfc3a6', gruen: '#6aa352', acker: '#a08f5c', sport: '#6fae55', friedhof: '#517a49' };
  for (const f of v.flaechen) if (FL[f.a]) { pfad(f.p, true); g.fillStyle = FL[f.a]; g.fill(); }
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const t = welt.hole(x, y);
    if (t === T.BAUM) { g.fillStyle = 'rgba(30,70,25,.55)'; g.fillRect(x * S, y * S, S, S); }
    else if (t === T.WASSER) { g.fillStyle = '#3a83b0'; g.fillRect(x * S, y * S, S, S); }
  }
  g.lineJoin = g.lineCap = 'round';
  const WEG = new Set(['footway', 'path', 'cycleway', 'track']);
  for (const s of v.strassen) if (WEG.has(s.t)) { pfad(s.p); g.strokeStyle = '#d8c9a3'; g.lineWidth = 1.5; g.stroke(); }
  for (const s of v.strassen) if (!WEG.has(s.t)) { pfad(s.p); g.strokeStyle = '#4b4b4b'; g.lineWidth = s.b * S + 2.5; g.stroke(); }
  for (const s of v.strassen) if (!WEG.has(s.t)) { pfad(s.p); g.strokeStyle = s.t === 'service' ? '#c9c9c9' : '#f2f2ee'; g.lineWidth = s.b * S; g.stroke(); }
  for (const h of v.gebaeude) {
    pfad(h.p, true);
    g.fillStyle = h.safe ? '#64b5f6' : '#c9775c'; g.fill();
    g.strokeStyle = h.safe ? '#0d47a1' : '#5d2c1d'; g.lineWidth = 1.2; g.stroke();
  }
  return c;
}

// Für jeden Straßennamen die längsten Abschnitte (je Weg der längste, nach Länge sortiert) als Beschriftungsplätze
function strassenNamen(welt) {
  const plaetze = [];
  for (const s of welt.vektor?.strassen ?? []) {
    if (!s.n) continue;
    let best = null;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      const l = Math.hypot(s.p[i + 2] - s.p[i], s.p[i + 3] - s.p[i + 1]);
      if (!best || l > best.l) best = { name: s.n, ax: s.p[i], ay: s.p[i + 1], bx: s.p[i + 2], by: s.p[i + 3], l };
    }
    if (best && best.l > 4) plaetze.push(best);
  }
  return plaetze.sort((a, b) => b.l - a.l);
}

export class Uebersicht {
  constructor(welt, box) {
    this.welt = welt; this.box = box;
    this.el = box.querySelector('canvas');
    this.basis = grundbild(welt);
    this.namen = strassenNamen(welt);
    this.zoom = 1;          // 1 = ganze Karte passt hinein
    this.mitte = null;      // null = folgt mir; sonst {x, y} in Kacheln (verschoben)
    this.gross = false;
    box.style.display = 'block';
    box.style.setProperty('--seiten', String(BREITE / HOEHE));   // für die Größe der aufgeklappten Karte (stil.css)
    this.bedienung();
  }

  umschalten(gross = !this.gross) {
    this.gross = gross;
    this.box.classList.toggle('gross', gross);
    if (!gross) { this.mitte = null; }
    this.zeichneNeu = true;
  }

  zoomen(f, um = null) {
    const alt = this.zoom;
    this.zoom = Math.max(1, Math.min(8, this.zoom * f));
    // ohne Angabe (Knöpfe): um die Mitte des sichtbaren Ausschnitts zoomen, nicht zum eigenen Punkt springen
    if (!um && this.gross && this.letzteAnsicht) um = { x: this.el.width / 2, y: this.el.height / 2 };
    if (um && this.letzteAnsicht && this.zoom !== alt) {
      // Punkt unter Finger/Maus bleibt stehen
      const a = this.letzteAnsicht, px = a.x0 + um.x / a.m, py = a.y0 + um.y / a.m;
      const m2 = a.m * this.zoom / alt, b = this.el.width / m2, h = this.el.height / m2;
      this.mitte = this.begrenzt({ x: px - um.x / m2 + b / 2, y: py - um.y / m2 + h / 2 }, m2);
      // Ansicht gleich mitführen: beim Zwei-Finger-Zoom kommen mehrere Ereignisse vor dem nächsten Zeichnen
      this.letzteAnsicht = { x0: this.mitte.x - b / 2, y0: this.mitte.y - h / 2, m: m2 };
    }
    if (this.zoom === 1) this.mitte = null;
    this.zeichneNeu = true;
  }

  bedienung() {
    const el = this.el, zeiger = new Map();
    let zug = null, abstand0 = 0, zoom0 = 1;
    const lokal = e => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) * el.width / r.width, y: (e.clientY - r.top) * el.height / r.height }; };
    el.addEventListener('pointerdown', e => {
      try { el.setPointerCapture(e.pointerId); } catch { /* künstliches oder schon beendetes Zeigerereignis */ }
      zeiger.set(e.pointerId, lokal(e));
      // Ziehen startet an der tatsächlich gezeigten Mitte (nicht am eigenen Punkt – sonst springt die Karte)
      const la = this.letzteAnsicht, gezeigt = la ? { x: la.x0 + el.width / la.m / 2, y: la.y0 + el.height / la.m / 2 } : this.aktuelleMitte();
      if (zeiger.size === 1) zug = { start: lokal(e), mitte: gezeigt, bewegt: false };
      if (zeiger.size === 2) { const [a, b] = [...zeiger.values()]; abstand0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.zoom; zug = null; }
      e.stopPropagation(); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.set(e.pointerId, lokal(e));
      if (zeiger.size === 2) {
        const [a, b] = [...zeiger.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (abstand0 > 10) this.zoomen(zoom0 * d / abstand0 / this.zoom, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return;
      }
      if (!zug) return;
      const p = lokal(e), dx = p.x - zug.start.x, dy = p.y - zug.start.y;
      if (Math.hypot(dx, dy) > 8) zug.bewegt = true;
      if (zug.bewegt && this.gross && this.letzteAnsicht) {
        const m = this.letzteAnsicht.m;
        this.mitte = this.begrenzt({ x: zug.mitte.x - dx / m, y: zug.mitte.y - dy / m }, m);
        this.zeichneNeu = true;
      }
    });
    const ende = e => {
      const war = zug;
      zeiger.delete(e.pointerId);
      if (zeiger.size === 0 && war && !war.bewegt) this.umschalten();
      if (zeiger.size === 0) zug = null;
    };
    el.addEventListener('pointerup', ende);
    el.addEventListener('pointercancel', e => { zeiger.delete(e.pointerId); zug = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomen(e.deltaY < 0 ? 1.25 : 0.8, lokal(e)); }, { passive: false });
    this.box.querySelector('.plus').onclick = e => { e.stopPropagation(); this.zoomen(1.5); };
    this.box.querySelector('.minus').onclick = e => { e.stopPropagation(); this.zoomen(1 / 1.5); };
    this.box.querySelector('.mich').onclick = e => { e.stopPropagation(); this.mitte = null; this.zeichneNeu = true; };
  }

  aktuelleMitte() { return this.mitte ?? this.ich ?? { x: BREITE / 2, y: HOEHE / 2 }; }

  // Mitte so begrenzen, dass der Ausschnitt in der Karte bleibt (m = Bildpunkte je Kachel)
  begrenzt(p, m) {
    const bw = this.el.width / m, bh = this.el.height / m;
    return { x: Math.max(bw / 2, Math.min(BREITE - bw / 2, p.x)), y: Math.max(bh / 2, Math.min(HOEHE - bh / 2, p.y)) };
  }

  // spieler: [{x, y (Pixel), ebene, farbe (CSS), name, ich}]
  zeichne(spieler, hausVon) {
    const el = this.el, dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = el.getBoundingClientRect();
    const W = Math.max(50, Math.round(r.width * dpr)), H = Math.max(40, Math.round(r.width * dpr * HOEHE / BREITE));
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
    // drinnen: Punkt an der Haustür
    const punkte = spieler.map(p => {
      const h = hausVon(p.ebene);
      return { ...p, kx: h ? h.tuer.x + 0.5 : p.x / KACHEL, ky: h ? h.tuer.y + 0.5 : p.y / KACHEL };
    });
    const ich = punkte.find(p => p.ich);
    if (ich) this.ich = { x: ich.kx, y: ich.ky };
    const m = W / BREITE * this.zoom;              // Bildpunkte je Kachel
    const bw = W / m, bh = H / m;
    let { x: cx, y: cy } = this.zoom === 1 ? { x: BREITE / 2, y: HOEHE / 2 } : this.aktuelleMitte();
    cx = Math.max(bw / 2, Math.min(BREITE - bw / 2, cx)); cy = Math.max(bh / 2, Math.min(HOEHE - bh / 2, cy));
    if (this.mitte) this.mitte = { x: cx, y: cy };   // verschobene Mitte nicht über den Rand hinaus wachsen lassen
    const x0 = cx - bw / 2, y0 = cy - bh / 2;
    this.letzteAnsicht = { x0, y0, m };
    const c = el.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.drawImage(this.basis, x0 * S, y0 * S, bw * S, bh * S, 0, 0, W, H);
    const pos = (kx, ky) => [(kx - x0) * m, (ky - y0) * m];
    const t = this.welt.tor;
    if (t) { const [x, y] = pos(t.x + 0.5, t.y + 1); c.font = `${Math.round(14 * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🚧', x + 8 * dpr, y); }
    if (this.bus) { const [x, y] = pos(this.bus.x, this.bus.y); c.font = `${Math.round((this.gross ? 18 : 13) * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🚌', x, y); }
    for (const sr of this.welt.safeRooms) {
      const [x, y] = pos(sr.haus.x + sr.haus.b / 2, sr.haus.y + sr.haus.h / 2);
      c.font = `${Math.round((this.gross ? 16 : 11) * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🛡', x, y);
    }
    // Bundeswehr-Stützpunkt
    const sp = this.welt.stuetzpunkt;
    if (sp) {
      const [x, y] = pos(sp.x + sp.b / 2, sp.y + sp.h / 2);
      c.font = `bold ${Math.round((this.gross ? 18 : 12) * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3 * dpr; c.strokeStyle = '#fff'; c.strokeText('✚', x, y); c.fillStyle = '#c62828'; c.fillText('✚', x, y);
    }
    for (const p of [...punkte].sort((a, b) => a.ich - b.ich)) {
      const [x, y] = pos(p.kx, p.ky), rad = (p.ich ? 5.5 : 4) * dpr;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2);
      c.fillStyle = p.farbe; c.fill();
      c.lineWidth = (p.ich ? 2.5 : 1.2) * dpr; c.strokeStyle = p.ich ? '#fff' : '#000'; c.stroke();
      if (this.gross || this.zoom >= 3) {
        c.font = `bold ${Math.round(12 * dpr)}px sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.lineWidth = 3 * dpr; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(p.name, x + rad + 4, y);
        c.fillStyle = '#fff'; c.fillText(p.name, x + rad + 4, y);
      }
    }
    // Straßennamen entlang der Straße, sobald genug Platz ist (groß oder hineingezoomt)
    if (this.gross || this.zoom >= 2) {
      const belegt = [];
      c.font = `600 ${Math.round(11 * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const n of this.namen) {
        const [x1, y1] = pos(n.ax, n.ay), [x2, y2] = pos(n.bx, n.by);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
        if (mx < 0 || my < 0 || mx > W || my > H) continue;
        const breit = c.measureText(n.name).width;
        if (breit > len * 0.95) continue;
        const hx = Math.abs(Math.cos(Math.atan2(y2 - y1, x2 - x1))) * breit / 2, hy = Math.abs(Math.sin(Math.atan2(y2 - y1, x2 - x1))) * breit / 2;
        if (mx - hx < 2 || mx + hx > W - 2 || my - hy < 2 || my + hy > H - 2) continue;   // nicht am Rand abschneiden
        const r = breit / 2 + 4 * dpr;
        if (belegt.some(b => Math.hypot(b.x - mx, b.y - my) < b.r + r)) continue;
        belegt.push({ x: mx, y: my, r });
        let w = Math.atan2(y2 - y1, x2 - x1);
        if (w > Math.PI / 2) w -= Math.PI; else if (w < -Math.PI / 2) w += Math.PI;
        c.save(); c.translate(mx, my); c.rotate(w);
        c.lineWidth = 3 * dpr; c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(n.name, 0, 0);
        c.fillStyle = '#333'; c.fillText(n.name, 0, 0);
        c.restore();
      }
    }
    // Maßstab
    if (this.gross) {
      const meter = [50, 100, 200, 500].find(mm => mm / 4 * m > 60 * dpr) ?? 500, len = meter / 4 * m;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(8 * dpr, H - 22 * dpr, len + 12 * dpr, 16 * dpr);
      c.fillStyle = '#fff'; c.fillRect(14 * dpr, H - 12 * dpr, len, 2 * dpr);
      c.font = `${Math.round(10 * dpr)}px sans-serif`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText(`${meter} m`, 14 * dpr, H - 15 * dpr);
    }
    this.zeichneNeu = false;
  }
}
