// Browser-Client: zeigt den Zustand vom Server, schickt nur Eingaben und Wünsche.
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, sichtfrei, safeRoomAn,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEHAELTER_NAME, AKTION_ABSTAND, INFEKTION_DAUER,
} from './welt.mjs';
import { zeichneBoden, zeichneOben, zeichneDach, DACH_RAND } from './aussehen.mjs';

const FARBEN = [0x42a5f5, 0xffca28, 0xab47bc, 0xff7043, 0x26c6da, 0xec407a, 0x9ccc65, 0xd7ccc8, 0xffffff, 0x5c6bc0];
const AUTOFARBEN = [0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6d4c41, 0xeceff1];
const css = f => '#' + f.toString(16).padStart(6, '0');
const $ = id => document.getElementById(id);

// Basisadresse: funktioniert direkt (zombies.example.org/) und hinter dem HA-Ingress-Pfad
const BASIS = location.href.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');

let raum = null;
let meineId = null;
let wikiAdresse = '';

// fester, geheimer Spieler-Schlüssel dieses Browsers – daran hängt der Spielstand
function spielerId() {
  let id = null;
  try { id = localStorage.getItem('zob_id'); } catch {}
  if (!/^[a-f0-9]{32}$/.test(id || '')) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    id = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('zob_id', id); } catch {}
  }
  return id;
}

// ---------- Startschirm ----------
const nameFeld = $('name');
try { nameFeld.value = localStorage.getItem('zob_name') || ''; } catch {}
try { $('code').value = localStorage.getItem('zob_code') || ''; } catch {}
try {
  const m = sessionStorage.getItem('zob_meldung');
  if (m) { $('fehler').textContent = m; $('fehler').classList.add('gut'); sessionStorage.removeItem('zob_meldung'); }
} catch {}
fetch('info').then(r => r.json()).then(i => { $('codeblock').hidden = !i.code; wikiAdresse = i.wiki || ''; }).catch(() => {});
$('los').addEventListener('click', () => mitspielen());
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') mitspielen(); });
nameFeld.addEventListener('keydown', e => { if (e.key === 'Enter') mitspielen(); });

async function mitspielen() {
  const name = nameFeld.value.trim();
  if (!name) { $('fehler').textContent = 'Bitte gib einen Namen ein.'; nameFeld.focus(); return; }
  const code = $('code').value.trim();
  try { localStorage.setItem('zob_name', name); localStorage.setItem('zob_code', code); } catch {}
  $('los').disabled = true;
  $('fehler').textContent = '';
  $('fehler').classList.remove('gut');
  try {
    const client = new Colyseus.Client(BASIS);
    let r = null;
    let token = null;
    try { token = sessionStorage.getItem('zob_token'); } catch {}
    if (token) { try { r = await client.reconnect(token); } catch { r = null; } }
    if (!r) r = await client.joinOrCreate('zombies', { name, code, spielerId: spielerId() });
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
      if (abgemeldet) return;
      $('verbindung').textContent = 'Verbindung beendet – Seite neu laden, um wieder mitzuspielen.';
      $('verbindung').style.display = 'block';
    });
    raum.onMessage('ausgeruht', async () => {
      abgemeldet = true;
      try {
        sessionStorage.removeItem('zob_token');
        sessionStorage.setItem('zob_meldung', 'Gespeichert. Gute Nacht im Safe Room – bis zum nächsten Mal!');
      } catch {}
      await raum.leave(true).catch(() => {});
      location.reload();
    });
    if (raum.state && raum.state.seed) starteSpiel();
    else raum.onStateChange.once(() => starteSpiel());
  } catch (e) {
    console.error(e);
    const text = String(e.message || e);
    if (/Zugangscode/.test(text)) { $('codeblock').hidden = false; $('fehler').textContent = 'Der Zugangscode stimmt nicht.'; $('code').focus(); }
    else if (/anderen Fenster/.test(text)) $('fehler').textContent = 'Du spielst schon in einem anderen Fenster oder Tab.';
    else $('fehler').textContent = 'Verbindung zum Spielserver fehlgeschlagen: ' + text;
    $('los').disabled = false;
  }
}
let abgemeldet = false;

let gestartet = false;
function starteSpiel() {
  if (gestartet) return;
  gestartet = true;
  $('start').style.display = 'none';
  $('hud').style.display = 'block';
  $('unten').style.display = 'flex';
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
  setTimeout(() => { d.style.opacity = '0'; }, lang ? 3500 : 2200);
  setTimeout(() => d.remove(), lang ? 4100 : 2800);
}

function zeitText(s) {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = Math.floor(s % 60);
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

const dingText = d => `${DINGE[d]?.zeichen ?? '?'} ${DINGE[d]?.name ?? d}`;

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
    this.lokal = null;          // vorhergesagte eigene Position
    this.eingabe = { dx: 0, dy: 0, s: false };
    this.gesendet = { dx: 9, dy: 9, s: false, t: 0 };
    this.kontext = null;

    const wb = BREITE * KACHEL, wh = HOEHE * KACHEL;
    this.cameras.main.setBounds(0, 0, wb, wh);
    this.passeZoomAn();
    this.scale.on('resize', () => this.passeZoomAn());

    this.tasten = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,SPACE,ESC');
    this.tasten.E.on('down', () => this.aktion());
    this.tasten.SPACE.on('down', () => this.aktion());
    this.tasten.ESC.on('down', () => { kisteZu(); popupZu(); });
    for (let i = 1; i <= 8; i++) {
      this.input.keyboard.on('keydown-' + ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'][i - 1],
        () => raum.send('benutze', { platz: i - 1 }));
    }
    this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 };
    this.stick = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.input.on('pointerdown', p => {
      popupZu();
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
    raum.onMessage('gefunden', m => {
      if (m.dinge.length) meldung('Gefunden: ' + m.dinge.map(d => d === 'munition' ? '🧰 12 Schuss' : dingText(d)).join(', '));
      else if (m.rest) meldung('Rucksack voll – der Rest bleibt hier');
      else meldung('Nichts Brauchbares gefunden');
      if (m.dinge.length && m.rest) meldung('Rucksack voll – der Rest bleibt hier');
    });
    raum.onMessage('pong', () => {});
    raum.onMessage('raetsel', m => zeigeRaetsel(m));
    raum.onMessage('aufloesung', m => zeigeAufloesung(m));
    raum.onMessage('tor', () => meldung('🎉 Level 1 geschafft! Level 2 – der Wald an der Isar – kommt bald.', true));

    $('aktion').onclick = () => this.aktion();
    $('ausruhen').onclick = () => raum.send('ausruhen');
    $('kistezu').onclick = () => kisteZu();
    $('raetselzu').onclick = () => raetselZu();
    this.hudZeit = 0;
    // Test-Hilfe: mit ?debug in der Adresse ist die Szene in der Konsole erreichbar
    if (new URLSearchParams(location.search).has('debug')) { window.szene = this; window.raum = raum; window.meineId = meineId; }
  }

  passeZoomAn() {
    const kurz = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(Phaser.Math.Clamp(kurz / 520, 0.55, 1.6));
  }

  zeichneKarte() {
    const W = BREITE * KACHEL, H = HOEHE * KACHEL;
    // Boden und Deko im Stil des Prototyps, einmal in große Canvas-Texturen gezeichnet
    const boden = this.textures.createCanvas('boden', W, H);
    zeichneBoden(boden.getContext(), this.welt);
    boden.refresh();
    this.add.image(0, 0, 'boden').setOrigin(0).setDepth(0);
    const g = this.add.graphics().setDepth(0.5);
    // Böden der Safe Rooms etwas wärmer
    for (const s of this.welt.safeRooms) {
      const h = s.haus;
      g.fillStyle(0xd7c4a3, 1).fillRect((h.x + 1) * KACHEL, (h.y + 1) * KACHEL, (h.b - 2) * KACHEL, (h.h - 2) * KACHEL);
      // Vorratskiste
      g.fillStyle(0x6d4c41, 1).fillRect(s.kiste.x - 12, s.kiste.y - 9, 24, 18);
      g.lineStyle(2, 0x3e2723, 1).strokeRect(s.kiste.x - 12, s.kiste.y - 9, 24, 18);
      g.fillStyle(0xffca28, 1).fillRect(s.kiste.x - 2, s.kiste.y - 3, 4, 5);
    }
    const oben = this.textures.createCanvas('oben', W, H);
    zeichneOben(oben.getContext(), this.welt);
    oben.refresh();
    this.add.image(0, 0, 'oben').setOrigin(0).setDepth(5);
    this.torGrafik = this.add.graphics().setDepth(1.5);
    this.torStand = -1;
    this.add.text((this.welt.tor.x + 1) * KACHEL + 4, (this.welt.tor.y) * KACHEL + 18, 'Ortsausgang', {
      fontSize: '12px', fontStyle: 'bold', color: '#ffe082',
    }).setDepth(1);

    // Behälter: Schränke, Kühlschränke, Spinde (unter dem Dach) und Autos
    this.behaelterObj = new Map();
    for (const b of this.welt.behaelter) {
      const c = this.add.container(b.x, b.y).setDepth(1);
      if (b.art === 'auto') {
        const lang = 46, breit = 22;
        const [w, h] = b.senkrecht ? [breit, lang] : [lang, breit];
        const k = this.add.graphics();
        k.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, 6);
        k.fillStyle(AUTOFARBEN[b.farbe % AUTOFARBEN.length], 1).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
        k.fillStyle(0x263238, 0.85);
        if (b.senkrecht) { k.fillRect(-w / 2 + 3, -h / 2 + 9, w - 6, 8); k.fillRect(-w / 2 + 3, h / 2 - 15, w - 6, 6); }
        else { k.fillRect(-w / 2 + 9, -h / 2 + 3, 8, h - 6); k.fillRect(w / 2 - 15, -h / 2 + 3, 6, h - 6); }
        c.add(k);
      } else {
        const f = { schrank: 0x8d6e63, kuehlschrank: 0xeceff1, spind: 0x78909c }[b.art];
        const k = this.add.graphics();
        k.fillStyle(f, 1).fillRect(-11, -11, 22, 22);
        k.lineStyle(2, 0x000000, 0.45).strokeRect(-11, -11, 22, 22);
        k.lineStyle(1, 0x000000, 0.4).lineBetween(0, -10, 0, 10);
        c.add(k);
      }
      this.behaelterObj.set(b.id, c);
    }

    // Dächer: Häuser aus dem Prototyp; verdecken, was drinnen ist, solange man draußen steht
    this.daecher = this.welt.haeuser.map((h, nr) => {
      const schluessel = 'dach' + nr;
      const tex = this.textures.createCanvas(schluessel, h.b * KACHEL + DACH_RAND * 2, h.h * KACHEL + DACH_RAND * 2);
      zeichneDach(tex.getContext(), h, nr);
      tex.refresh();
      const bild = this.add.image(h.x * KACHEL - DACH_RAND, h.y * KACHEL - DACH_RAND, schluessel).setOrigin(0).setDepth(5.2);
      return { haus: h, grafik: bild };
    });
    // Schilder und Barrikaden der Safe Rooms
    this.barrikaden = new Map();
    for (const s of this.welt.safeRooms) {
      const h = s.haus;
      this.add.text((h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL, '🛡 ' + s.name, {
        fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#263238', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6);
      this.barrikaden.set(s.id, { grafik: this.add.graphics().setDepth(5.5), wert: -1, haus: h });
    }
  }

  zeichneBarrikaden() {
    for (const [id, b] of this.barrikaden) {
      const wert = Math.ceil((raum.state.safes.get(id)?.barrikade ?? 0) / 34);
      if (wert === b.wert) continue;
      b.wert = wert;
      const g = b.grafik.clear();
      const tx = b.haus.tuer.x * KACHEL, ty = b.haus.tuer.y * KACHEL;
      for (let i = 0; i < wert; i++) {
        g.fillStyle(0xa1887f, 1).fillRect(tx - 3, ty + 6 + i * 8, KACHEL + 6, 6);
        g.lineStyle(1, 0x4e342e, 1).strokeRect(tx - 3, ty + 6 + i * 8, KACHEL + 6, 6);
        g.fillStyle(0x424242, 1).fillRect(tx + 1, ty + 8 + i * 8, 2, 2).fillRect(tx + KACHEL - 3, ty + 8 + i * 8, 2, 2);
      }
    }
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
    const tun = this.add.text(14, -14, '', { fontSize: '13px' }).setOrigin(0.5);
    box.add([schatten, koerper, nase, name, hp, tun]);
    return { box, koerper, nase, name, hp, tun, farbe, x: p.x, y: p.y };
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
      if (f.name.text !== p.name) f.name.setText(p.name);
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
    // leere Behälter blasser
    for (const [id, b] of s.behaelter) {
      const o = this.behaelterObj.get(id);
      if (o) o.setAlpha(b.rest === 0 ? 0.45 : 1);
    }
    this.zeichneBarrikaden();
    this.zeichneTor();
  }

  zeichneTor() {
    const n = raum.state.torGeloest ?? 0;
    if (n === this.torStand) return;
    this.torStand = n;
    const g = this.torGrafik.clear(), t = this.welt.tor;
    const offen = n >= 3;
    g.fillStyle(offen ? 0x66bb6a : 0xffb300, 1).fillRect(t.x * KACHEL, t.y * KACHEL, KACHEL, KACHEL * 2);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(i < n ? 0x66bb6a : 0x5d4037, 1).fillCircle(t.x * KACHEL + 16, t.y * KACHEL + 12 + i * 20, 6);
      g.lineStyle(2, 0x212121, 1).strokeCircle(t.x * KACHEL + 16, t.y * KACHEL + 12 + i * 20, 6);
    }
  }

  figurDarstellen(f, p) {
    f.box.setRotation(0);
    const zombie = p.zombie > 0;
    const fuellung = zombie ? 0x7cb342 : f.farbe;
    if (f.koerper.fillColor !== fuellung) f.koerper.setFillStyle(fuellung);
    f.nase.setFillStyle(zombie ? 0xd50000 : 0xffe0b2);
    f.nase.setPosition(Math.cos(p.richtung) * 9, Math.sin(p.richtung) * 9);
    f.hp.width = 24 * Math.max(0, p.hp) / 100;
    f.hp.setFillStyle(p.hp > 50 ? 0x66bb6a : p.hp > 25 ? 0xffca28 : 0xe53935);
    if (p.unten) { f.koerper.setScale(1.15, 0.6); f.nase.setVisible(false); }
    else { f.koerper.setScale(p.schleicht ? 0.85 : 1); f.nase.setVisible(true); }
    const tun = zombie ? '🧟' : p.aktion === 'durchsuchen' ? '🔍' : p.aktion === 'barrikade' ? '🔨' : p.infektion > 0 ? '🦠' : '';
    if (f.tun.text !== tun) f.tun.setText(tun);
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
      const schleicht = !(p.zombie > 0) && (e.s || l < 0.55);
      const tempo = p.zombie > 0 ? W.zombieTempoJagen * 1.15
        : (schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1);
      const weg = (p.zombie > 0 ? Math.min(1, l) : Math.min(1, l / (schleicht ? 0.55 : 1))) * tempo * dt;
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
    const tippen = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (!tippen) {
      if (k.A.isDown || k.LEFT.isDown) dx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) dx += 1;
      if (k.W.isDown || k.UP.isDown) dy -= 1;
      if (k.S.isDown || k.DOWN.isDown) dy += 1;
    }
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

  // ---------- Aktionen ----------
  // was kann man hier gerade tun? (gleiche Regeln wie auf dem Server)
  bestimmeKontext(ich) {
    if (!ich || ich.unten || ich.aktion || raum.state.phase !== 'spiel' || !this.lokal) return null;
    const { x, y } = this.lokal;
    const safe = safeRoomAn(this.welt, x, y);
    if (safe) {
      const tx = (safe.haus.tuer.x + 0.5) * KACHEL, ty = (safe.haus.tuer.y + 0.5) * KACHEL;
      const bar = raum.state.safes.get(safe.id)?.barrikade ?? 0;
      if (Math.hypot(x - tx, y - ty) < 56 && ich.rucksack.includes('bretter') && bar < 100) {
        return { art: 'barrikade', text: '🔨 Verbarrikadieren' };
      }
      if (Math.hypot(x - safe.kiste.x, y - safe.kiste.y) < AKTION_ABSTAND + 20) {
        return { art: 'kiste', text: '📦 Vorräte', safe };
      }
    }
    const tor = this.welt.tor;
    if ((raum.state.torGeloest ?? 0) < 3 && Math.hypot(x - (tor.x + 1) * KACHEL, y - (tor.y + 1) * KACHEL) < 70) {
      return { art: 'raetsel', text: `🔐 Schloss knacken (${raum.state.torGeloest ?? 0}/3)` };
    }
    let best = null, bd = AKTION_ABSTAND;
    for (const b of this.welt.behaelter) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d >= bd) continue;
      if (raum.state.behaelter.get(b.id)?.rest === 0) continue;
      if (!sichtfrei(this.welt, x, y, b.x, b.y)) continue;
      bd = d; best = b;
    }
    if (best) return { art: 'durchsuchen', text: `🔍 ${BEHAELTER_NAME[best.art]} durchsuchen` };
    return null;
  }

  aktion() {
    const k = this.kontext;
    if (!k) return;
    if (k.art === 'kiste') kisteAuf(k.safe);
    else raum.send('aktion');
    if (k.art === 'raetsel') $('aktion').style.display = 'none';
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
    g.lineStyle(m.schlag ? 5 : 3, m.schlag ? 0xd7ccc8 : 0xffffff, 0.85).beginPath().arc(m.x, m.y, m.schlag ? 34 : 26, m.w - 0.8, m.w + 0.8).strokePath();
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
    if (this.hudZeit <= 0) { this.hudZeit = 0.15; this.hud(ich); }
  }

  hud(ich) {
    const s = raum.state;
    if (ich) {
      balkenSetzen('hp', ich.hp);
      balkenSetzen('durst', ich.durst);
      balkenSetzen('hunger', ich.hunger);
      const waffe = ich.waffe === 'pistole'
        ? (ich.munition > 0 ? `🔫 Pistole · ${ich.munition} Schuss` : `🔫 Keine Munition – stoßen`)
        : ich.waffe === 'schlaeger' ? `🏏 Baseballschläger${ich.munition ? ` · 🧰 ${ich.munition} Schuss` : ''}`
        : `✊ Unbewaffnet – stoßen${ich.munition ? ` · 🧰 ${ich.munition} Schuss` : ''}`;
      textSetzen('waffe', waffe);
      textSetzen('besiegt', `🧟 ${ich.besiegt} von dir · ${s.besiegt} gesamt`);
      const safe = ich.sicher ? this.welt.safeRooms.find(r => r.id === ich.sicher) : null;
      $('sicher').style.display = safe ? 'flex' : 'none';
      if (safe) {
        const bar = Math.round(s.safes.get(safe.id)?.barrikade ?? 0);
        textSetzen('sichername', `🛡 ${safe.name} · Barrikade ${bar} %`);
      }
      this.rucksackZeigen(ich);
      const gruen = ich.zombie > 0 ? 0.35 : ich.infektion > 0 ? 0.08 + 0.3 * (1 - ich.infektion / INFEKTION_DAUER) : 0;
      const g = $('gruen');
      if (g.style.opacity !== gruen.toFixed(2)) g.style.opacity = gruen.toFixed(2);
    }
    textSetzen('zeit', zeitText(s.zeit));
    const liste = [...s.spieler.entries()].map(([id, p]) => {
      const zusatz = p.unten ? ' – am Boden' : !p.verbunden ? ' – Verbindung weg' : p.sicher ? ' 🛡' : '';
      const klasse = p.unten ? 'unten' : !p.verbunden ? 'weg' : '';
      return `<li class="${klasse}"><span class="punkt" style="background:${css(FARBEN[p.farbe % FARBEN.length])}"></span>${escapeHtml(p.name)}${id === meineId ? ' (du)' : ''}${zusatz}</li>`;
    }).join('');
    if ($('liste').innerHTML !== liste) $('liste').innerHTML = liste;

    // Aktionsknopf
    this.kontext = this.bestimmeKontext(ich);
    const knopf = $('aktion');
    knopf.style.display = this.kontext ? 'block' : 'none';
    if (this.kontext && knopf.textContent !== this.kontext.text) knopf.textContent = this.kontext.text;
    if (kisteOffen && (!this.kontext || this.kontext.art !== 'kiste')) kisteZu();
    if (kisteOffen) kisteZeigen(ich, kisteOffen);

    let hinweis = '';
    if (s.phase === 'erwischt') hinweis = 'Erwischt! 🧟<br>Ihr schleppt euch in die Safe Rooms …';
    else if (ich && ich.zombie > 0) hinweis = `🧟 Du bist ein Zombie! Beiß die anderen.<br>Noch ${zeitText(ich.zombie)}, dann wachst du im Safe Room auf.`;
    else if (ich && ich.unten) hinweis = `Du liegst am Boden.<br>Ein Mitspieler muss dir aufhelfen.${balken(ich.hilfe)}`;
    else if (ich && ich.aktion) hinweis = `${ich.aktion === 'barrikade' ? '🔨 Verbarrikadieren' : '🔍 Durchsuchen'} … nicht bewegen${balken(ich.fortschritt)}`;
    else if (ich) {
      for (const p of s.spieler.values()) {
        if (p === ich || !p.unten) continue;
        const d = Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y);
        if (d < 110) {
          const mit = ich.rucksack.includes('verband') ? ' (mit Verbandskasten schneller)' : '';
          hinweis = `${escapeHtml(p.name)} liegt am Boden – bleib bei ihm stehen${mit}.${balken(p.hilfe)}`;
          break;
        }
      }
      if (!hinweis && ich.infektion > 0) {
        const spritze = ich.rucksack.includes('spritze') ? ' – du hast eine 💉 im Rucksack!' : ' – du brauchst eine 💉 Rettungsspritze!';
        hinweis = `🦠 Infiziert: noch ${zeitText(ich.infektion)}${ich.sicher ? ' (ruht im Safe Room)' : ''}${spritze}`;
      }
      if (!hinweis && (ich.durst < 15 || ich.hunger < 15)) hinweis = ich.durst < ich.hunger ? '💧 Du hast großen Durst!' : '🥫 Du hast großen Hunger!';
    }
    const h = $('hinweis');
    h.style.display = hinweis ? 'block' : 'none';
    if (h.innerHTML !== hinweis) h.innerHTML = hinweis;
  }

  rucksackZeigen(ich) {
    const schluessel = [...ich.rucksack].join(',');
    if (schluessel === this.rucksackSchluessel) return;
    this.rucksackSchluessel = schluessel;
    const leiste = $('rucksack');
    leiste.innerHTML = '';
    for (let i = 0; i < RUCKSACK_PLAETZE; i++) {
      const d = ich.rucksack[i];
      const b = document.createElement('button');
      b.className = 'platz' + (d ? '' : ' leer');
      b.textContent = d ? DINGE[d]?.zeichen ?? '?' : '';
      b.title = d ? `${DINGE[d]?.name} (Taste ${i + 1})` : 'leer';
      if (d) b.onclick = e => { e.stopPropagation(); popupAuf(b, i, d); };
      leiste.appendChild(b);
    }
  }
}

// ---------- Rucksack-Menü, Vorratskiste ----------
function popupAuf(knopf, platz, ding) {
  const p = $('popup');
  p.innerHTML = '';
  const titel = document.createElement('div');
  titel.className = 'titel'; titel.textContent = dingText(ding);
  const nutzen = document.createElement('button');
  nutzen.textContent = DINGE[ding]?.waffe ? 'In die Hand' : ding === 'bretter' ? 'Wofür?' : 'Benutzen';
  nutzen.onclick = () => { raum.send('benutze', { platz }); popupZu(); };
  const weg = document.createElement('button');
  weg.textContent = 'Wegwerfen'; weg.className = 'zweit';
  weg.onclick = () => { raum.send('wegwerfen', { platz }); popupZu(); };
  p.append(titel, nutzen, weg);
  const r = knopf.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left + r.width / 2 - p.offsetWidth / 2)) + 'px';
  p.style.bottom = (window.innerHeight - r.top + 8) + 'px';
}
function popupZu() { $('popup').style.display = 'none'; }
document.addEventListener('pointerdown', e => {
  if (!$('popup').contains(e.target) && !e.target.classList?.contains('platz')) popupZu();
});

let kisteOffen = null;
let kisteSchluessel = '';
function kisteAuf(safe) { kisteOffen = safe; kisteSchluessel = ''; $('kiste').style.display = 'flex'; }
function kisteZu() { kisteOffen = null; $('kiste').style.display = 'none'; }
function kisteZeigen(ich, safe) {
  const kiste = raum.state.safes.get(safe.id)?.kiste ?? [];
  const schluessel = [...kiste].join(',') + '|' + [...ich.rucksack].join(',');
  if (schluessel === kisteSchluessel) return;
  kisteSchluessel = schluessel;
  $('kistetitel').textContent = `📦 Vorräte im ${safe.name}`;
  const fuellen = (el, liste, max, richtung, titel) => {
    el.innerHTML = `<div class="kopf">${titel} (${liste.length}/${max}) – antippen zum ${richtung === 'raus' ? 'Nehmen' : 'Ablegen'}</div>`;
    const raster = document.createElement('div'); raster.className = 'raster';
    [...liste].forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'ding'; b.textContent = dingText(d);
      b.onclick = () => raum.send('kiste', { richtung, platz: i });
      raster.appendChild(b);
    });
    if (!liste.length) raster.innerHTML = '<span class="leer">leer</span>';
    el.appendChild(raster);
  };
  fuellen($('kisteinhalt'), kiste, KISTE_PLAETZE, 'raus', 'Kiste');
  fuellen($('kisterucksack'), ich.rucksack, RUCKSACK_PLAETZE, 'rein', 'Rucksack');
}

// ---------- Rätsel am Tor ----------
let raetselId = null;
function zeigeRaetsel(m) {
  raetselId = m.id;
  $('raetseltitel').textContent = `🔐 Schloss ${m.geloest + 1} von ${m.noetig}` + (m.thema ? ` · ${m.thema}` : '');
  $('raetselfrage').textContent = m.frage;
  const box = $('raetselantworten');
  box.innerHTML = '';
  m.antworten.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'ding antwort'; b.textContent = a;
    b.onclick = () => {
      for (const x of box.children) x.disabled = true;
      b.classList.add('gewaehlt');
      raum.send('antwort', { id: m.id, index: i });
    };
    box.appendChild(b);
  });
  $('raetselergebnis').innerHTML = '';
  $('raetsel').style.display = 'flex';
}
function zeigeAufloesung(m) {
  const box = $('raetselantworten');
  for (const b of box.children) {
    if (b.textContent === m.loesung) b.classList.add('richtig');
    else if (b.classList.contains('gewaehlt')) b.classList.add('falsch');
  }
  const link = m.seite && wikiAdresse
    ? ` <a href="${escapeHtml(wikiAdresse.replace(/\/$/, ''))}/doku.php?id=${encodeURIComponent(m.seite)}" target="_blank" rel="noopener">Mehr dazu im Wiki ↗</a>` : '';
  $('raetselergebnis').innerHTML = (m.richtig ? '✅ Richtig! Das Schloss springt auf.' : `❌ Falsch – richtig ist: <b>${escapeHtml(m.loesung)}</b>. Die Zombies haben es gehört!`) + link;
}
function raetselZu() { raetselId = null; $('raetsel').style.display = 'none'; }

function balkenSetzen(id, wert) {
  const el = $(id).firstElementChild;
  const w = Math.max(0, Math.min(100, wert)).toFixed(0) + '%';
  if (el.style.width !== w) el.style.width = w;
}
function textSetzen(id, text) { const el = $(id); if (el.textContent !== text) el.textContent = text; }

function balken(wert) {
  return `<div class="balken"><div style="width:${Math.round(wert * 100)}%"></div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
