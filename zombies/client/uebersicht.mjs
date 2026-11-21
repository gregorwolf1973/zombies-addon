// Übersichtskarte: klein in der Ecke, angetippt groß. Häuser und Straßen nach den echten Umrissen (OSM),
// Zoom mit +/−, Mausrad oder zwei Fingern, in der großen Ansicht verschiebbar.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';
import { kartenbildLesen, GERAET_SCHLUESSEL } from './einstellungen_regeln.mjs';

const S = 4;   // Pixel je Kachel im Grundbild

// Eigene Position pulsiert nach Spielbeitritt/Levelstart und nach dem Öffnen der großen Karte: wachsender, verblassender Ring.
export const MISSION_PERIODE_MS = 1500;   // Ring um Missionsgegenstände: Periode
export const PULS_DAUER_MS = 5000, PULS_PERIODE_MS = 1100;
// Phase 0..1 des Rings (0 = klein/deckend, 1 = groß/verblasst) oder -1, wenn das Pulsieren vorbei ist
export function pulsPhase(jetzt, bis, periode = PULS_PERIODE_MS) {
  if (!(bis > jetzt)) return -1;
  return 1 - ((((bis - jetzt) % periode) + periode) % periode) / periode;
}

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
    g.fillStyle = h.safe ? '#66bb6a' : '#c9775c'; g.fill();
    g.strokeStyle = h.safe ? '#1b5e20' : '#5d2c1d'; g.lineWidth = h.safe ? 2.2 : 1.2; g.stroke();
  }
  return c;
}

// Grundbild mit Luftbild als Hintergrund (<karte>_luftbild.webp, 2 px je Kachel): Straßen wie im Navi darübergezeichnet
// (dunkler Rand, Hauptstraßen breiter und gelblich), Gebäude leicht hervorgehoben. Wird einmal vorgerendert, nicht je Bild neu skaliert.
function grundbildLuftbild(welt, bild) {
  const v = welt.vektor;
  const c = document.createElement('canvas');
  c.width = BREITE * S; c.height = HOEHE * S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(bild, 0, 0, c.width, c.height);
  const pfad = (p, zu) => {
    g.beginPath(); g.moveTo(p[0] * S, p[1] * S);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * S, p[i + 1] * S);
    if (zu) g.closePath();
  };
  g.lineJoin = g.lineCap = 'round';
  const WEG = new Set(['footway', 'path', 'cycleway', 'track', 'steps', 'pedestrian']);
  const HAUPT = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  g.setLineDash([3, 3]);
  for (const s of v.strassen) if (WEG.has(s.t)) { pfad(s.p); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2; g.stroke(); }
  g.setLineDash([]);
  const fahr = v.strassen.filter(s => !WEG.has(s.t));
  const breite = s => Math.max(3, s.b * S * (HAUPT.has(s.t) ? 1.25 : 1));
  for (const s of fahr) { pfad(s.p); g.strokeStyle = 'rgba(25,25,28,.9)'; g.lineWidth = breite(s) + 3; g.stroke(); }
  for (const s of fahr) { pfad(s.p); g.strokeStyle = HAUPT.has(s.t) ? '#f6d86a' : s.t === 'service' ? '#d6d6d2' : '#f4f4f0'; g.lineWidth = breite(s); g.stroke(); }
  for (const h of v.gebaeude) {
    pfad(h.p, true);
    g.fillStyle = h.safe ? 'rgba(102,187,106,.55)' : 'rgba(255,214,190,.30)'; g.fill();
    g.strokeStyle = h.safe ? '#1b5e20' : 'rgba(55,28,18,.85)'; g.lineWidth = h.safe ? 2.2 : 1; g.stroke();
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
  constructor(welt, box, kartenName = null) {
    this.welt = welt; this.box = box;
    this.el = box.querySelector('canvas');
    this.basisKarte = grundbild(welt); this.basisLuft = null; this.basis = this.basisKarte;
    this.modus = 'luft';
    try { this.modus = kartenbildLesen(localStorage.getItem(GERAET_SCHLUESSEL.kartenbild)); } catch { /* egal */ }
    // Luftbild einmal laden (fehlt es oder gibt es kein Vektor-Gebäudebild: bisherige Darstellung)
    if (kartenName && welt.vektor && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { this.basisLuft = grundbildLuftbild(welt, img); this.basisWaehlen(); };
      img.src = `karten/${kartenName}_luftbild.webp`;
    }
    this.kartenbildHoerer = e => { this.modus = kartenbildLesen(e.detail); this.basisWaehlen(); };
    if (typeof document !== 'undefined') document.addEventListener('zob-kartenbild', this.kartenbildHoerer);
    this.namen = strassenNamen(welt);
    this.zoom = 1;          // 1 = ganze Karte passt hinein
    this.mitte = null;      // null = folgt mir; sonst {x, y} in Kacheln (verschoben)
    this.gross = false;
    this.pulsBis = performance.now() + PULS_DAUER_MS;   // Spielbeitritt/Levelstart (Level wechseln per Neuladen)
    box.style.display = 'block';
    box.style.setProperty('--seiten', String(BREITE / HOEHE));   // für die Größe der aufgeklappten Karte (stil.css)
    this.bedienung();
  }

  basisWaehlen() {
    this.basis = this.modus === 'luft' && this.basisLuft ? this.basisLuft : this.basisKarte;
    this.zeichneNeu = true;
  }

  umschalten(gross = !this.gross) {
    this.gross = gross;
    if (gross) this.pulsBis = performance.now() + PULS_DAUER_MS;   // nach jedem Öffnen der großen Karte
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
      if (zeiger.size === 1) {
        zug = { start: lokal(e), mitte: gezeigt, bewegt: false };
        // Superuser: langer Druck (ohne Verschieben) öffnet „Hierhin springen“
        if (this.hinSpringen) { const z = zug, cx = e.clientX, cy = e.clientY; clearTimeout(this.hinTimer); this.hinTimer = setTimeout(() => { if (zug === z && !z.bewegt && zeiger.size === 1) { z.lang = true; this.hinKnopf(z.start, cx, cy); } }, 600); }
      }
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
    el.addEventListener('contextmenu', e => { if (!this.hinSpringen) return; e.preventDefault(); this.hinKnopf(lokal(e), e.clientX, e.clientY); });
    const ende = e => {
      const war = zug;
      clearTimeout(this.hinTimer);
      zeiger.delete(e.pointerId);
      if (zeiger.size === 0 && war && !war.bewegt && !war.lang && e.button !== 2) {
        const a = this.letzteAnsicht;
        if (this.flugHin && a) { const p = lokal(e); this.flugHin((a.x0 + p.x / a.m) * KACHEL, (a.y0 + p.y / a.m) * KACHEL); }   // Kameraflug: Klick springt dorthin
        else this.umschalten();
      }
      if (zeiger.size === 0) zug = null;
    };
    el.addEventListener('pointerup', ende);
    el.addEventListener('pointercancel', e => { zeiger.delete(e.pointerId); zug = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomen(e.deltaY < 0 ? 1.25 : 0.8, lokal(e)); }, { passive: false });
    this.box.querySelector('.mich').onclick = e => { e.stopPropagation(); this.mitte = null; this.zeichneNeu = true; };
  }

  // Superuser: kleines „📍 Hierhin springen“ an der Klickstelle; this.hinSpringen = (pxX, pxY) => … (Weltpixel)
  hinKnopf(lokalPos, cx, cy) {
    const a = this.letzteAnsicht; if (!a || !this.hinSpringen) return;
    const wx = (a.x0 + lokalPos.x / a.m) * KACHEL, wy = (a.y0 + lokalPos.y / a.m) * KACHEL;
    this.hinWeg();
    const b = document.createElement('button'); b.type = 'button'; b.id = 'hinknopf'; b.textContent = '📍 Hierhin springen';
    b.style.cssText = `position:fixed;z-index:60;left:${Math.max(4, Math.min(innerWidth - 170, cx))}px;top:${Math.max(4, Math.min(innerHeight - 44, cy))}px;padding:8px 12px;font-size:14px;background:#1e2a1e;color:#fff;border:1px solid #fff6;border-radius:8px;box-shadow:0 2px 8px #0008`;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.onclick = e => { e.stopPropagation(); this.hinWeg(); this.hinSpringen(wx, wy); };
    document.body.appendChild(b); this.hinKnopfEl = b;
    this.hinZu = e => { if (e.target !== b) this.hinWeg(); };
    setTimeout(() => document.addEventListener('pointerdown', this.hinZu, true), 0);
    this.hinAus = setTimeout(() => this.hinWeg(), 5000);
  }
  hinWeg() { this.hinKnopfEl?.remove(); this.hinKnopfEl = null; clearTimeout(this.hinAus); if (this.hinZu) document.removeEventListener('pointerdown', this.hinZu, true); this.hinZu = null; }

  pulsAktiv() { return pulsPhase(performance.now(), this.pulsBis) >= 0; }

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
    if (this.abhol) {
      // Abholstelle: zarter 100-m-Wartekreis, auffälliger Pin 📍 mit Beschriftung
      const [x, y] = pos(this.abhol.x, this.abhol.y), ph = (Date.now() % 1200) / 1200, puls = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
      c.beginPath(); c.arc(x, y, 800 / KACHEL * m, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,23,68,.07)'; c.fill(); c.lineWidth = 1.5 * dpr; c.setLineDash([6 * dpr, 5 * dpr]); c.strokeStyle = 'rgba(255,82,82,.55)'; c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(x, y, (this.gross ? 9 : 7) * dpr * (1 + 0.5 * ph), 0, Math.PI * 2); c.strokeStyle = `rgba(255,23,68,${(1 - ph) * 0.9})`; c.lineWidth = 2.5 * dpr; c.stroke();
      c.font = `${Math.round((this.gross ? 26 : 18) * dpr * (1 + 0.12 * puls))}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText('📍', x, y + 3 * dpr);
      c.font = `bold ${Math.round((this.gross ? 12 : 9) * dpr)}px sans-serif`; c.textBaseline = 'middle'; c.lineWidth = 3.5 * dpr; c.strokeStyle = '#000';
      c.strokeText('Abholung', x, y + 10 * dpr); c.fillStyle = '#ff8a80'; c.fillText('Abholung', x, y + 10 * dpr);
    }
    if (this.bus) {
      // Evakuierungsbus: großes, pulsierendes gelb-rotes Symbol mit Ring
      const [x, y] = pos(this.bus.x, this.bus.y), ph = (Date.now() % 1000) / 1000, puls = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
      const R = (this.gross ? 17 : 13) * dpr * (1 + 0.25 * puls);
      c.beginPath(); c.arc(x, y, R + 6 * dpr * ph, 0, Math.PI * 2); c.strokeStyle = `rgba(255,214,0,${(1 - ph) * 0.9})`; c.lineWidth = 3 * dpr; c.stroke();
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fillStyle = puls > 0.5 ? '#ffd600' : '#ff6d00'; c.fill();
      c.lineWidth = 2.5 * dpr; c.strokeStyle = '#000'; c.stroke();
      c.font = `${Math.round((this.gross ? 20 : 15) * dpr * (1 + 0.15 * puls))}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText('🚌', x, y + dpr);
    }
    if (this.horde) {
      // Prüfhilfe: Ziel der Horde (Fahne + gestrichelte Linie von der Hordenmitte)
      const [mx, my] = pos(this.horde.mitte.x, this.horde.mitte.y), [x, y] = pos(this.horde.ziel.x, this.horde.ziel.y);
      c.beginPath(); c.setLineDash([6 * dpr, 5 * dpr]); c.moveTo(mx, my); c.lineTo(x, y); c.lineWidth = 2 * dpr; c.strokeStyle = 'rgba(255,64,129,.9)'; c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(mx, my, 4 * dpr, 0, Math.PI * 2); c.fillStyle = '#ff1744'; c.fill();
      c.font = `${Math.round((this.gross ? 20 : 14) * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = '#fff'; c.fillText('🎯', x, y + 4 * dpr);
      if (this.gross) {
        c.font = `bold ${Math.round(11 * dpr)}px sans-serif`; c.textBaseline = 'top'; c.lineWidth = 3 * dpr; c.strokeStyle = '#000';
        c.strokeText(this.horde.name, x, y + 6 * dpr); c.fillStyle = '#ff80ab'; c.fillText(this.horde.name, x, y + 6 * dpr);
      }
    }
    for (const sr of this.welt.safeRooms) {
      // Safe Room deutlich: grüner Kreis mit weißem Rand und Schild, darunter „SAFE“ (nur große Karte)
      const [x, y] = pos(sr.haus.x + sr.haus.b / 2, sr.haus.y + sr.haus.h / 2), R = (this.gross ? 12 : 9) * dpr;
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fillStyle = '#2e7d32'; c.fill();
      c.lineWidth = 2.5 * dpr; c.strokeStyle = '#fff'; c.stroke();
      c.font = `${Math.round((this.gross ? 14 : 11) * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('🛡', x, y + 0.5 * dpr);
      if (this.gross) {
        c.font = `bold ${Math.round(10 * dpr)}px sans-serif`; c.lineWidth = 3 * dpr; c.strokeStyle = '#000';
        c.strokeText('SAFE', x, y + R + 8 * dpr); c.fillStyle = '#a5ff9e'; c.fillText('SAFE', x, y + R + 8 * dpr);
      }
    }
    // Offene Missionsgegenstände: Symbol (Gegenstandsbild) GENAU auf dem Gegenstand, darum ein gelber Kreis zur Auffindbarkeit;
    // ein sanfter Ring wächst alle 1,5 s und verblasst (Mitte und Radius in Kacheln)
    for (const k of this.kreise ?? []) {
      const [x, y] = pos(k.x, k.y), sym = (this.gross ? 12 : 9) * dpr;   // Radius des Symbols
      const R = Math.max(k.r * m, sym + (this.gross ? 9 : 6) * dpr);       // gelber Grundkreis: Auffindkreis, mindestens um das Symbol
      if (x + R * 1.6 < 0 || y + R * 1.6 < 0 || x - R * 1.6 > W || y - R * 1.6 > H) continue;
      const ph = (Date.now() % MISSION_PERIODE_MS) / MISSION_PERIODE_MS;
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fillStyle = 'rgba(255,193,7,.16)'; c.fill();
      c.lineWidth = 2 * dpr; c.strokeStyle = 'rgba(255,193,7,.95)'; c.stroke();
      const Rp = sym + (R * 1.5 - sym) * ph;
      c.beginPath(); c.arc(x, y, Rp, 0, Math.PI * 2); c.lineWidth = 2.5 * dpr; c.strokeStyle = `rgba(255,214,0,${(1 - ph) * 0.85})`; c.stroke();
      c.beginPath(); c.arc(x, y, sym, 0, Math.PI * 2); c.fillStyle = 'rgba(255,246,205,.95)'; c.fill();
      c.lineWidth = 1.8 * dpr; c.strokeStyle = '#ffd600'; c.stroke();
      if (k.bild) { const d = sym * 1.5; c.drawImage(k.bild.img, k.bild.sx, k.bild.sy, k.bild.s, k.bild.s, x - d / 2, y - d / 2, d, d); }
      else { c.font = `${Math.round(sym * 1.4)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(k.symbol, x, y + dpr * 0.5); }
      if (this.gross) {
        c.font = `bold ${Math.round(11 * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3.5 * dpr; c.strokeStyle = '#000';
        c.strokeText(k.name, x, y + sym + 10 * dpr); c.fillStyle = '#ffe082'; c.fillText(k.name, x, y + sym + 10 * dpr);
      }
    }
    // Zielorte der offenen Aufgaben: orangefarbene Raute mit Symbol; auf der großen Karte mit Namen, in der Ecke nur als Punkt
    for (const z of this.ziele ?? []) {
      const [x, y] = pos(z.x, z.y);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (!this.gross && this.zoom < 3) {
        c.beginPath(); c.arc(x, y, 3.5 * dpr, 0, Math.PI * 2); c.fillStyle = '#ff9100'; c.fill(); c.lineWidth = 1.5 * dpr; c.strokeStyle = '#fff'; c.stroke();
        continue;
      }
      const R = 12 * dpr;
      c.beginPath(); c.moveTo(x, y - R - 3 * dpr); c.lineTo(x + R + 3 * dpr, y); c.lineTo(x, y + R + 3 * dpr); c.lineTo(x - R - 3 * dpr, y); c.closePath();
      c.fillStyle = '#ff9100'; c.fill(); c.lineWidth = 2.5 * dpr; c.strokeStyle = '#fff'; c.stroke();
      c.font = `${Math.round(14 * dpr)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(z.symbol, x, y + dpr);
      c.font = `bold ${Math.round(11 * dpr)}px sans-serif`; c.lineWidth = 3.5 * dpr; c.strokeStyle = '#000';
      c.strokeText(z.name, x, y + R + 12 * dpr); c.fillStyle = '#ffcc80'; c.fillText(z.name, x, y + R + 12 * dpr);
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
      if (p.unten) {
        // am Boden: blinkendes rotes Kreuz statt Punkt
        const an = Math.floor(Date.now() / 350) % 2 === 0, k = (this.gross ? 8 : 6.5) * dpr;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - k, y); c.lineTo(x + k, y); c.moveTo(x, y - k); c.lineTo(x, y + k);
        c.lineWidth = 6.5 * dpr; c.strokeStyle = '#fff'; c.stroke();
        c.lineWidth = 3.5 * dpr; c.strokeStyle = an ? '#ff1744' : '#7f0000'; c.stroke();
        c.lineCap = 'butt';
      } else {
        c.fillStyle = p.farbe; c.fill();
        c.lineWidth = (p.ich ? 2.5 : 1.2) * dpr; c.strokeStyle = p.ich ? '#fff' : '#000'; c.stroke();
      }
      if (p.ich) {   // pulsierender Ring um die eigene Position (5 s)
        const ph = pulsPhase(performance.now(), this.pulsBis);
        if (ph >= 0) {
          const w = ph;   // Ring wächst von der Punktgröße nach außen, während er verblasst
          c.beginPath(); c.arc(x, y, rad + w * (this.gross ? 22 : 16) * dpr, 0, Math.PI * 2);
          c.lineWidth = 2.5 * dpr; c.strokeStyle = `rgba(255,255,255,${(1 - w) * 0.95})`; c.stroke();
        }
      }
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
