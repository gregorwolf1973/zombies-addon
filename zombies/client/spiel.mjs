// Browser-Client: zeigt den Zustand vom Server, schickt nur die Eingaben.
import { KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege } from './welt.mjs';

const FARBEN = [0x42a5f5, 0xffca28, 0xab47bc, 0xff7043, 0x26c6da, 0xec407a, 0x9ccc65, 0xd7ccc8, 0xffffff, 0x5c6bc0];
const css = f => '#' + f.toString(16).padStart(6, '0');
const $ = id => document.getElementById(id);

// Basisadresse: funktioniert direkt (zombies.example.org/) und hinter dem HA-Ingress-Pfad
const BASIS = location.href.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');

let raum = null;
let meineId = null;

// ---------- Startschirm ----------
const nameFeld = $('name');
try { nameFeld.value = localStorage.getItem('zob_name') || ''; } catch {}
$('los').addEventListener('click', () => mitspielen());
nameFeld.addEventListener('keydown', e => { if (e.key === 'Enter') mitspielen(); });

async function mitspielen() {
  const name = nameFeld.value.trim();
  if (!name) { $('fehler').textContent = 'Bitte gib einen Namen ein.'; nameFeld.focus(); return; }
  try { localStorage.setItem('zob_name', name); } catch {}
  $('los').disabled = true;
  $('fehler').textContent = '';
  try {
    const client = new Colyseus.Client(BASIS);
    let r = null;
    let token = null;
    try { token = sessionStorage.getItem('zob_token'); } catch {}
    if (token) { try { r = await client.reconnect(token); } catch { r = null; } }
    if (!r) r = await client.joinOrCreate('zombies', { name });
    raum = r;
    meineId = r.sessionId;
    try { sessionStorage.setItem('zob_token', r.reconnectionToken); } catch {}
    raum.onDrop(() => { $('verbindung').style.display = 'block'; });
    raum.onReconnect(() => {
      $('verbindung').style.display = 'none';
      try { sessionStorage.setItem('zob_token', raum.reconnectionToken); } catch {}
    });
    raum.onLeave(() => {
      try { sessionStorage.removeItem('zob_token'); } catch {}
      $('verbindung').textContent = 'Verbindung beendet – Seite neu laden, um wieder mitzuspielen.';
      $('verbindung').style.display = 'block';
    });
    if (raum.state && raum.state.seed) starteSpiel();
    else raum.onStateChange.once(() => starteSpiel());
  } catch (e) {
    console.error(e);
    $('fehler').textContent = 'Verbindung zum Spielserver fehlgeschlagen: ' + (e.message || e);
    $('los').disabled = false;
  }
}

let gestartet = false;
function starteSpiel() {
  if (gestartet) return;
  gestartet = true;
  $('start').style.display = 'none';
  $('hud').style.display = 'block';
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#1b2a1b',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 3 },
    scene: [Ort],
  });
}

// ---------- Meldungen und Anzeige ----------
function meldung(text, lang = false) {
  const d = document.createElement('div');
  d.textContent = text;
  $('meldungen').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; }, lang ? 3500 : 2000);
  setTimeout(() => d.remove(), lang ? 4100 : 2600);
}

function zeitText(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

// ---------- Szene ----------
class Ort extends Phaser.Scene {
  constructor() { super('ort'); }

  create() {
    const s = raum.state;
    this.welt = baueWelt(s.seed);
    this.zeichneKarte();

    this.figuren = new Map();   // sessionId → {box, ...}
    this.zombies = new Map();
    this.kegel = this.add.graphics().setDepth(2);
    this.effekte = this.add.graphics().setDepth(7);
    this.lokal = null;          // vorhergesagte eigene Position
    this.eingabe = { dx: 0, dy: 0, s: false };
    this.gesendet = { dx: 9, dy: 9, s: false, t: 0 };

    const wb = BREITE * KACHEL, wh = HOEHE * KACHEL;
    this.cameras.main.setBounds(0, 0, wb, wh);
    this.passeZoomAn();
    this.scale.on('resize', () => this.passeZoomAn());

    this.tasten = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT');
    this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 };
    this.stick = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.input.on('pointerdown', p => {
      if (this.joystick.id !== null) return;
      this.joystick = { id: p.id, bx: p.x, by: p.y, vx: 0, vy: 0 };
    });
    this.input.on('pointermove', p => {
      if (p.id !== this.joystick.id) return;
      let vx = (p.x - this.joystick.bx) / 60, vy = (p.y - this.joystick.by) / 60;
      const l = Math.hypot(vx, vy);
      if (l > 1) { vx /= l; vy /= l; }
      this.joystick.vx = vx; this.joystick.vy = vy;
    });
    const loslassen = p => { if (p.id === this.joystick.id) this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 }; };
    this.input.on('pointerup', loslassen);
    this.input.on('pointerupoutside', loslassen);

    raum.onMessage('schuss', m => this.schuss(m));
    raum.onMessage('stoss', m => this.stoss(m));
    raum.onMessage('weg', m => this.puff(m.x, m.y));
    raum.onMessage('entdeckt', m => this.ausruf(m.x, m.y));
    raum.onMessage('meldung', m => meldung(m.text, m.lang));
    raum.onMessage('pong', () => {});

    this.hudZeit = 0;
  }

  passeZoomAn() {
    const kurz = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(Phaser.Math.Clamp(kurz / 520, 0.55, 1.6));
  }

  zeichneKarte() {
    const g = this.add.graphics().setDepth(0);
    const r = (x, y) => ((x * 73856093) ^ (y * 19349663)) % 7;
    const farbe = {
      [T.WIESE]: 0x4a7a3a, [T.STRASSE]: 0x5a5a5a, [T.WAND]: 0x5d4037, [T.BODEN]: 0xb8a48c,
      [T.TUER]: 0x8d6e63, [T.WASSER]: 0x2a6fa8, [T.BAUM]: 0x4a7a3a, [T.PLATZ]: 0x9e9a92,
      [T.ZAUN]: 0x3e2723, [T.TOR]: 0xffb300,
    };
    for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
      const t = this.welt.hole(x, y);
      let f = farbe[t];
      if (t === T.WIESE || t === T.BAUM) f = Phaser.Display.Color.IntegerToColor(f).darken(r(x, y)).color;
      g.fillStyle(f, 1).fillRect(x * KACHEL, y * KACHEL, KACHEL, KACHEL);
      if (t === T.STRASSE && (x + y) % 3 === 0) g.fillStyle(0x666666, 1).fillRect(x * KACHEL + 6, y * KACHEL + 6, 3, 3);
      if (t === T.PLATZ) g.lineStyle(1, 0x8a867e, 1).strokeRect(x * KACHEL, y * KACHEL, KACHEL, KACHEL);
      if (t === T.WASSER) g.fillStyle(0x3b82c0, 1).fillRect(x * KACHEL + (y * 7) % 20, y * KACHEL + 12, 10, 2);
    }
    // Bäume als Kronen etwas größer als die Kachel
    for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
      if (this.welt.hole(x, y) !== T.BAUM) continue;
      const cx = x * KACHEL + 16, cy = y * KACHEL + 16;
      this.add.circle(cx + 3, cy + 4, 19, 0x000000, 0.25).setDepth(5);
      this.add.circle(cx, cy, 19, 0x2e5d2a).setDepth(5);
      this.add.circle(cx - 5, cy - 5, 9, 0x3d7a37).setDepth(5);
    }
    // Maibaum auf dem Marktplatz
    const m = this.welt.markt;
    const mx = (m.x + m.b / 2) * KACHEL, my = (m.y + m.h / 2) * KACHEL;
    this.add.circle(mx, my, 7, 0x1565c0).setDepth(1);
    this.add.circle(mx, my, 3, 0xffffff).setDepth(1);
    this.add.text((this.welt.tor.x + 1) * KACHEL + 4, (this.welt.tor.y) * KACHEL + 18, 'Ortsausgang', {
      fontSize: '12px', fontStyle: 'bold', color: '#ffe082',
    }).setDepth(1);

    // Dächer: verdecken, was drinnen ist, solange man draußen steht
    this.daecher = this.welt.haeuser.map(h => {
      const d = this.add.graphics().setDepth(5);
      const x = h.x * KACHEL, y = h.y * KACHEL, b = h.b * KACHEL, hh = h.h * KACHEL;
      d.fillStyle(0x000000, 0.3).fillRect(x + 4, y + 5, b, hh);
      d.fillStyle(0xa1442f, 1).fillRect(x, y, b, hh);
      d.fillStyle(0x8a3826, 1).fillRect(x, y + hh / 2, b, hh / 2);
      d.lineStyle(2, 0x6d2a1c, 1).lineBetween(x, y + hh / 2, x + b, y + hh / 2);
      // Tür auch von außen erkennbar: Vordach über dem Eingang
      const tx = h.tuer.x * KACHEL, oben = h.tuer.y === h.y;
      const ty = oben ? y - 4 : y + hh - 6;
      d.fillStyle(0x3e2723, 1).fillRect(tx + 3, ty, KACHEL - 6, 10);
      d.fillStyle(0xffe082, 1).fillRect(tx + 13, oben ? ty : ty + 7, 6, 3);
      return { haus: h, grafik: d };
    });
  }

  // ---------- Figuren ----------
  neueFigur(p, id) {
    const farbe = FARBEN[p.farbe % FARBEN.length];
    const ich = id === meineId;
    const box = this.add.container(p.x, p.y).setDepth(ich ? 6 : 4);
    const schatten = this.add.ellipse(2, 9, 22, 8, 0x000000, 0.3);
    const koerper = this.add.circle(0, 0, W.spielerRadius, farbe).setStrokeStyle(2, ich ? 0xffffff : 0x000000, ich ? 1 : 0.5);
    const nase = this.add.circle(9, 0, 4, 0xffe0b2);
    const name = this.add.text(0, -26, p.name, { fontSize: '11px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const hp = this.add.rectangle(-12, -16, 24, 3, 0x66bb6a).setOrigin(0, 0.5);
    box.add([schatten, koerper, nase, name, hp]);
    return { box, koerper, nase, name, hp, x: p.x, y: p.y };
  }

  neuerZombie(z) {
    const box = this.add.container(z.x, z.y).setDepth(3);
    const schatten = this.add.ellipse(2, 9, 22, 8, 0x000000, 0.3);
    const koerper = this.add.circle(0, 0, W.zombieRadius, 0x7cb342).setStrokeStyle(2, 0x33691e);
    const arm1 = this.add.rectangle(8, -6, 10, 4, 0x689f38);
    const arm2 = this.add.rectangle(8, 6, 10, 4, 0x689f38);
    const auge = this.add.circle(5, 0, 2.5, 0xd50000);
    box.add([schatten, arm1, arm2, koerper, auge]);
    return { box, koerper, x: z.x, y: z.y, r: z.richtung };
  }

  abgleichen(dt) {
    const s = raum.state;
    const glatt = Math.min(1, dt * 14);
    // Spieler
    for (const [id, p] of s.spieler) {
      let f = this.figuren.get(id);
      if (!f) { f = this.neueFigur(p, id); this.figuren.set(id, f); }
      if (id === meineId) continue;
      f.x += (p.x - f.x) * glatt; f.y += (p.y - f.y) * glatt;
      f.box.setPosition(f.x, f.y);
      f.koerper.setAlpha(p.verbunden ? 1 : 0.5);
      this.figurDarstellen(f, p);
    }
    for (const [id, f] of this.figuren) if (!s.spieler.has(id)) { f.box.destroy(); this.figuren.delete(id); }
    // Zombies
    this.kegel.clear();
    const cam = this.cameras.main.worldView;
    for (const [id, z] of s.zombies) {
      let f = this.zombies.get(id);
      if (!f) { f = this.neuerZombie(z); this.zombies.set(id, f); }
      f.x += (z.x - f.x) * glatt; f.y += (z.y - f.y) * glatt;
      f.r = Phaser.Math.Angle.RotateTo(f.r, z.richtung, dt * 6);
      f.box.setPosition(f.x, f.y).setRotation(f.r);
      f.koerper.setFillStyle(z.jagt ? 0xc0ca33 : 0x7cb342);
      if (cam.contains(f.x, f.y) || Phaser.Math.Distance.Between(f.x, f.y, cam.centerX, cam.centerY) < cam.width) {
        this.kegel.fillStyle(z.jagt ? 0xff5252 : 0xfff59d, z.jagt ? 0.18 : 0.13);
        this.kegel.slice(f.x, f.y, W.sichtWeite, f.r - W.sichtWinkel / 2, f.r + W.sichtWinkel / 2, false).fillPath();
      }
    }
    for (const [id, f] of this.zombies) if (!s.zombies.has(id)) { f.box.destroy(); this.zombies.delete(id); }
  }

  figurDarstellen(f, p) {
    f.box.setRotation(0);
    f.koerper.setRotation(p.richtung);
    f.nase.setPosition(Math.cos(p.richtung) * 9, Math.sin(p.richtung) * 9);
    f.hp.width = 24 * Math.max(0, p.hp) / 100;
    f.hp.setFillStyle(p.hp > 50 ? 0x66bb6a : p.hp > 25 ? 0xffca28 : 0xe53935);
    if (p.unten) { f.koerper.setScale(1.15, 0.6); f.nase.setVisible(false); }
    else { f.koerper.setScale(p.schleicht ? 0.85 : 1); f.nase.setVisible(true); }
  }

  // ---------- eigene Figur mit Vorhersage ----------
  eigeneFigur(dt) {
    const p = raum.state.spieler.get(meineId);
    if (!p) return null;
    const f = this.figuren.get(meineId);
    if (!f) return p;
    if (!this.lokal) { this.lokal = { x: p.x, y: p.y }; this.cameras.main.startFollow(f.box, true, 0.15, 0.15); }
    const e = this.eingabe;
    const l = Math.hypot(e.dx, e.dy);
    if (!p.unten && raum.state.phase === 'spiel' && l > 0.05) {
      const schleicht = e.s || l < 0.55;
      const tempo = schleicht ? W.tempoSchleichen : W.tempoGehen;
      const weg = Math.min(1, l / (schleicht ? 0.55 : 1)) * tempo * dt;
      bewege(this.welt, this.lokal, e.dx / l * weg, e.dy / l * weg, W.spielerRadius);
    }
    // sanft zum Server hinziehen, bei großem Abstand springen
    const d = Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y);
    if (d > 64 || p.unten) { this.lokal.x = p.x; this.lokal.y = p.y; }
    else {
      const k = Math.min(1, dt * (l > 0.05 ? 2.5 : 10));
      this.lokal.x += (p.x - this.lokal.x) * k; this.lokal.y += (p.y - this.lokal.y) * k;
    }
    f.x = this.lokal.x; f.y = this.lokal.y;
    f.box.setPosition(f.x, f.y);
    this.figurDarstellen(f, p);
    return p;
  }

  leseEingabe() {
    const k = this.tasten;
    let dx = 0, dy = 0;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    let s = k.SHIFT.isDown;
    if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
    else if (this.joystick.id !== null) { dx = this.joystick.vx; dy = this.joystick.vy; s = false; }
    this.eingabe = { dx, dy, s };
    const g = this.gesendet, jetzt = this.time.now;
    const anders = Math.abs(g.dx - dx) > 0.05 || Math.abs(g.dy - dy) > 0.05 || g.s !== s;
    if ((anders && jetzt - g.t > 60) || jetzt - g.t > 250) {
      raum.send('eingabe', { dx: +dx.toFixed(3), dy: +dy.toFixed(3), s });
      this.gesendet = { dx, dy, s, t: jetzt };
    }
  }

  zeichneStick() {
    const j = this.joystick;
    this.stick.clear();
    if (j.id === null) return;
    this.stick.fillStyle(0xffffff, 0.12).fillCircle(j.bx, j.by, 60);
    this.stick.lineStyle(2, 0xffffff, 0.3).strokeCircle(j.bx, j.by, 60);
    this.stick.lineStyle(1, 0xffffff, 0.2).strokeCircle(j.bx, j.by, 33);
    this.stick.fillStyle(0xffffff, 0.45).fillCircle(j.bx + j.vx * 60, j.by + j.vy * 60, 22);
  }

  // ---------- Effekte ----------
  schuss(m) {
    const l = this.add.line(0, 0, m.x1, m.y1, m.x2, m.y2, 0xfff176, 0.9).setOrigin(0).setLineWidth(2).setDepth(7);
    this.tweens.add({ targets: l, alpha: 0, duration: 140, onComplete: () => l.destroy() });
    const blitz = this.add.circle(m.x1, m.y1, 7, 0xffeb3b, 0.8).setDepth(7);
    this.tweens.add({ targets: blitz, alpha: 0, scale: 1.6, duration: 120, onComplete: () => blitz.destroy() });
  }

  stoss(m) {
    const g = this.add.graphics().setDepth(7);
    g.lineStyle(3, 0xffffff, 0.8).beginPath().arc(m.x, m.y, 26, m.w - 0.7, m.w + 0.7).strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  puff(x, y) {
    for (let i = 0; i < 7; i++) {
      const c = this.add.circle(x, y, 4 + Math.random() * 4, i % 2 ? 0x558b2f : 0x8bc34a, 0.9).setDepth(7);
      const w = Math.random() * Math.PI * 2, d = 14 + Math.random() * 18;
      this.tweens.add({ targets: c, x: x + Math.cos(w) * d, y: y + Math.sin(w) * d, alpha: 0, duration: 450, onComplete: () => c.destroy() });
    }
  }

  ausruf(x, y) {
    const t = this.add.text(x, y - 22, '!', { fontSize: '22px', fontStyle: 'bold', color: '#ff5252', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- Schleife ----------
  update(_t, ms) {
    const dt = Math.min(0.1, ms / 1000);
    this.leseEingabe();
    this.zeichneStick();
    this.abgleichen(dt);
    const ich = this.eigeneFigur(dt);
    if (ich && this.lokal) {
      // Dach des Hauses, in dem man steht, wird durchsichtig
      for (const d of this.daecher) {
        const h = d.haus;
        const innen = this.lokal.x >= h.x * KACHEL && this.lokal.x <= (h.x + h.b) * KACHEL
                   && this.lokal.y >= h.y * KACHEL && this.lokal.y <= (h.y + h.h) * KACHEL;
        const ziel = innen ? 0 : 1;
        d.grafik.alpha += (ziel - d.grafik.alpha) * Math.min(1, dt * 8);
      }
    }
    this.hudZeit -= dt;
    if (this.hudZeit <= 0) { this.hudZeit = 0.2; this.hud(ich); }
  }

  hud(ich) {
    const s = raum.state;
    if (ich) {
      $('hp').firstElementChild.style.width = Math.max(0, ich.hp) + '%';
      $('waffe').textContent = ich.waffe === 'pistole'
        ? (ich.munition > 0 ? `🔫 Pistole · ${ich.munition} Schuss` : '🔫 Keine Munition – stoßen')
        : '✊ Unbewaffnet – stoßen';
      $('besiegt').textContent = `🧟 ${s.besiegt} erledigt`;
    }
    $('zeit').textContent = zeitText(s.zeit);
    const liste = [...s.spieler.entries()].map(([id, p]) => {
      const zusatz = p.unten ? ' – am Boden' : !p.verbunden ? ' – Verbindung weg' : '';
      const klasse = p.unten ? 'unten' : !p.verbunden ? 'weg' : '';
      return `<li class="${klasse}"><span class="punkt" style="background:${css(FARBEN[p.farbe % FARBEN.length])}"></span>${escapeHtml(p.name)}${id === meineId ? ' (du)' : ''}${zusatz}</li>`;
    }).join('');
    if ($('liste').innerHTML !== liste) $('liste').innerHTML = liste;

    let hinweis = '';
    if (s.phase === 'erwischt') hinweis = 'Erwischt! 🧟<br>Neue Runde gleich …';
    else if (ich && ich.unten) hinweis = `Du liegst am Boden.<br>Ein Mitspieler muss dir aufhelfen.${balken(ich.hilfe)}`;
    else if (ich) {
      for (const p of s.spieler.values()) {
        if (p === ich || !p.unten) continue;
        const d = Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y);
        if (d < 110) { hinweis = `${escapeHtml(p.name)} liegt am Boden – bleib bei ihm stehen.${balken(p.hilfe)}`; break; }
      }
    }
    const h = $('hinweis');
    h.style.display = hinweis ? 'block' : 'none';
    if (h.innerHTML !== hinweis) h.innerHTML = hinweis;
  }
}

function balken(wert) {
  return `<div class="balken"><div style="width:${Math.round(wert * 100)}%"></div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
