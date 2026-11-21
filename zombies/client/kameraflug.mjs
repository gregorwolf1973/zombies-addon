// Kameraflug (nur Superuser) und zuverlässiger Mausrad-Zoom.
// Kameraflug: die Figur steht (unverwundbar, für Zombies unsichtbar – das erledigt der Server nach der Nachricht su/kamera),
// die Kamera löst sich von ihr und fliegt mit WASD/Pfeilen (Umschalt = schneller), Ziehen, Mausrad und Klick auf die Karte.
// Mausrad: ein Fensterhörer (nicht nur Phaser-Canvas), damit auch durchlässige HUD-Flächen zoomen; Menüs, Fenster und Eckkarte nicht.

export const FLUG_TEMPO = 60 * 8, FLUG_TEMPO_SCHNELL = 200 * 8;   // Pixel/s (8 px = 1 m): 60 m/s bzw. 200 m/s
export const ZOOM_MIN = 0.4, ZOOM_MAX = 2.5, FLUG_ZOOM_MIN = 0.12;   // ZOOM_MAX größer: näher heran an die kleineren Figuren
export const MELDE_ABSTAND_MS = 250;   // Kameraposition an den Server: 4×/s

// Elemente, die ihr eigenes Mausrad haben oder Fenster/Menüs sind: dort zoomt das Spiel nicht
export const RAD_AUSNAHMEN = '#kartenbox, #sumenue, #popup, #kiste, #handel, #tausch, #raetsel, #einstellungen, #start, #chat, #aufgabenkoerper, #liste, #abspann, #laden, #aufheben-wahl, #fundliste, .fenster, input, textarea, select, details';

// Mausrad-Ereignis → Pixelschritte (deltaMode: 0 Pixel, 1 Zeilen, 2 Seiten), je Ereignis begrenzt
export function radPixel(e) {
  const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const d = (Number(e.deltaY) || 0) * m;
  return Math.max(-300, Math.min(300, d));
}
// Zoomfaktor für Pixelschritte: eine Raststufe (100 px) ≈ ×1,13, Trackpad-Kleinstschritte summieren sich weich
export const radFaktor = dy => Math.exp(-dy * 0.0012);

// true, wenn ein Mausrad-Ereignis über diesem Ziel das Spiel zoomen soll
export function radZoomtSpiel(ziel) {
  if (!ziel || ziel.nodeType !== 1) return true;
  if (ziel.tagName === 'CANVAS' && ziel.id !== 'karte') return true;
  if (ziel.closest?.(RAD_AUSNAHMEN)) return false;
  // sonst: scrollbare Fläche (eigenes Rad) nicht stören
  for (let el = ziel; el && el !== document.body; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY;
    if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return false;
  }
  return true;
}

// Mausrad ans Spiel hängen: szene.radZoom(faktor) wird je Ereignis aufgerufen; Rückgabe: Abbauer
export function radEinrichten(szene) {
  const h = e => {
    if (e.ctrlKey || e.metaKey || !e.deltaY) return;   // Browser-Zoom (Strg+Rad) bleibt dem Browser
    if (!szene.bereit || !radZoomtSpiel(e.target)) return;
    e.preventDefault();
    szene.radZoom(radFaktor(radPixel(e)));
  };
  window.addEventListener('wheel', h, { passive: false });
  return () => window.removeEventListener('wheel', h);
}

export class Kameraflug {
  constructor(szene, raum) {
    this.szene = szene; this.raum = raum;
    this.aktiv = false; this.rueck = false;
    this.x = 0; this.y = 0; this.meldeZeit = 0; this.gemeldet = null;
  }

  // Mittelpunkt der Kamera, solange sie frei fliegt; sonst null (alles andere folgt dann der Figur)
  zentrum() { return this.aktiv && !this.rueck ? { x: this.x, y: this.y } : null; }

  starten() {
    if (this.aktiv) return;
    const s = this.szene, cam = s.cameras.main;
    this.aktiv = true; this.rueck = false;
    this.alterZoom = s.zoomWahl ?? 1;
    this.x = cam.worldView.centerX; this.y = cam.worldView.centerY;
    s.folgtFigur = null; cam.stopFollow();
    this.raum.send('su', { befehl: 'kamera', an: true, x: Math.round(this.x), y: Math.round(this.y) });
    this.gemeldet = { x: this.x, y: this.y }; this.meldeZeit = performance.now();
    this.leiste(true);
    this.taste = e => { if (e.key === 'Escape' && !this.rueck) this.beenden(); };
    document.addEventListener('keydown', this.taste);
    // Ziehen mit Maus/Finger (zwei Finger = Zoom, macht die Szene)
    const cv = s.game.canvas;
    this.zug = null;
    this.runter = e => { if (e.button === 2) return; this.zug = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
    this.bewegt = e => {
      const z = this.zug; if (!z || z.id !== e.pointerId || s.kneifen || (s.finger?.size ?? 0) >= 2) return;
      const f = cam.zoom || 1;
      this.x -= (e.clientX - z.x) / f * (s.scale.width / cv.clientWidth);
      this.y -= (e.clientY - z.y) / f * (s.scale.height / cv.clientHeight);
      z.x = e.clientX; z.y = e.clientY; this.begrenze();
    };
    this.hoch = e => { if (this.zug?.id === e.pointerId) this.zug = null; };
    cv.addEventListener('pointerdown', this.runter);
    window.addEventListener('pointermove', this.bewegt);
    window.addEventListener('pointerup', this.hoch); window.addEventListener('pointercancel', this.hoch);
    const ue = s.uebersicht; if (ue) ue.flugHin = (wx, wy) => this.hin(wx, wy);
  }

  beenden() {
    if (!this.aktiv || this.rueck) return;
    this.rueck = true;
    this.raum.send('su', { befehl: 'kamera', an: false });
    this.leiste(false);
    document.removeEventListener('keydown', this.taste);
    const cv = this.szene.game.canvas;
    cv.removeEventListener('pointerdown', this.runter);
    window.removeEventListener('pointermove', this.bewegt);
    window.removeEventListener('pointerup', this.hoch); window.removeEventListener('pointercancel', this.hoch);
    const ue = this.szene.uebersicht; if (ue) ue.flugHin = null;
    this.zug = null;
    this.szene.zoomWahl = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.alterZoom));   // der Flug-Zoom bleibt nicht hängen
    this.szene.zoomen(1);
  }

  hin(wx, wy) { this.x = wx; this.y = wy; this.begrenze(); }
  begrenze() {
    const w = this.szene.cameras.main.getBounds?.();
    const bx = w && w.width ? w.width : Infinity, by = w && w.height ? w.height : Infinity;
    this.x = Math.max(0, Math.min(bx, this.x)); this.y = Math.max(0, Math.min(by, this.y));
  }

  // jede Bildfolge: Tasten lesen, Kamera setzen, Position gedrosselt melden
  update(dt) {
    if (!this.aktiv) return;
    const s = this.szene, cam = s.cameras.main, k = s.tasten;
    if (this.rueck) {
      const ziel = s.lokal ?? { x: this.x, y: this.y };
      const d = Math.hypot(ziel.x - this.x, ziel.y - this.y), schritt = Math.max(d * (1 - Math.exp(-dt * 7)), Math.min(d, FLUG_TEMPO * dt));
      if (d < 24) { this.aktiv = false; this.rueck = false; s.folgtFigur = null; return; }   // eigeneFigur hängt die Kamera wieder an
      this.x += (ziel.x - this.x) / d * schritt; this.y += (ziel.y - this.y) / d * schritt;
      cam.centerOn(this.x, this.y); return;
    }
    const tippen = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    let dx = 0, dy = 0;
    if (!tippen) {
      if (k.A.isDown || k.LEFT.isDown) dx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) dx += 1;
      if (k.W.isDown || k.UP.isDown) dy -= 1;
      if (k.S.isDown || k.DOWN.isDown) dy += 1;
    }
    if (dx || dy) {
      const l = Math.hypot(dx, dy), v = (k.SHIFT.isDown ? FLUG_TEMPO_SCHNELL : FLUG_TEMPO) * dt / l;
      this.x += dx * v; this.y += dy * v; this.begrenze();
    }
    cam.centerOn(this.x, this.y);
    const jetzt = performance.now();
    if (jetzt - this.meldeZeit >= MELDE_ABSTAND_MS && (!this.gemeldet || Math.hypot(this.gemeldet.x - this.x, this.gemeldet.y - this.y) > 8)) {
      this.meldeZeit = jetzt; this.gemeldet = { x: this.x, y: this.y };
      this.raum.send('su', { befehl: 'kamerapos', x: Math.round(this.x), y: Math.round(this.y) });
    }
  }

  // kleine Leiste oben: „Zurück“
  leiste(an) {
    let el = document.getElementById('kameraleiste');
    if (!an) { el?.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'kameraleiste';
    el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:29;display:flex;gap:8px;align-items:center;background:#000b;color:#fff;border:1px solid #fff4;border-radius:10px;padding:5px 10px;font:600 13px system-ui,sans-serif';
    el.innerHTML = '<span>🎥 Kameraflug · WASD/Pfeile (Umschalt schneller) · Rad zoomt · Karte anklicken springt</span><button type="button" style="width:auto;margin:0;padding:5px 12px;font-size:14px">Zurück (Esc)</button>';
    el.querySelector('button').onclick = () => this.beenden();
    document.body.appendChild(el);
  }
}
