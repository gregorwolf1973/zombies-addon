// Browser-Client: zeigt den Zustand vom Server, schickt nur Eingaben und Wünsche.
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, sichtfrei, safeRoomAn, setzeKartengroesse, seiteVon, ladenArt,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEHAELTER_NAME, AKTION_ABSTAND, INFEKTION_DAUER, LEICHE_DAUER,
  BODEN_DAUER, TAUSCH_ABSTAND, WAFFEN, aktiveWaffe, zaunUeberstieg, ZAUN_NAME, helligkeit, istNacht, hausHell, fensterLicht, uhrText,
} from './welt.mjs';
import { laternen } from './vektor.mjs';
import { HAARFARBEN, KLEIDFARBEN, WAFFEN_BILD, aussehenLesen, aussehenText, umgefaerbt } from './figurbild.mjs';
import { zeichneBoden, zeichneOben, zeichneDaecher, zeichneSafeDach, DACH_RAND, zeichneInnen, busVonOben, autoVonOben } from './aussehen.mjs';
import { baueWeltAusKarte } from './osmwelt.mjs';

let KARTE = null;   // OSM-Karte (z. B. Geretsried), sonst erzeugtes Dorf
const STUECK = 32;   // Kartenstücke à 32×32 Kacheln
import { baueInnenraum } from './innen.mjs';
import * as ton from './ton.mjs';
import { Uebersicht } from './uebersicht.mjs';

const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const INNEN_ZOOM = 1.6;
import { zeichneMensch, zeichneMenschLiegend } from './figuren.mjs';

const HAARE = ['#5d4037', '#212121', '#ffd54f', '#8d6e63', '#bf360c', '#424242', '#6d4c41', '#fbc02d', '#3e2723', '#9e9e9e'];
const LAUFBILDER = 8;

// Figuren einmal als Bildstreifen vorzeichnen: Bild 0 = stehen, 1–8 = Laufzyklus
function streifen(szene, schluessel, w, h, bilder, zeichne) {
  const tex = szene.textures.createCanvas(schluessel, w * bilder, h);
  const ctx = tex.getContext();
  for (let i = 0; i < bilder; i++) {
    ctx.save(); ctx.translate(w * i + w / 2, h / 2); zeichne(ctx, i); ctx.restore();
    tex.add(i, 0, w * i, 0, w, h);
  }
  tex.refresh();
}
function figurenVorzeichnen(szene) {
  FARBEN.forEach((f, n) => {
    const art = { haar: HAARE[n % HAARE.length], hut: n % 3 === 2 };
    streifen(szene, 'mensch-' + n, 48, 48, LAUFBILDER + 1, (ctx, i) => zeichneMensch(ctx, css(f), i === 0 ? null : (i - 1) / LAUFBILDER, art));
    streifen(szene, 'liegend-' + n, 56, 56, 1, ctx => zeichneMenschLiegend(ctx, css(f), art));
  });
}
// Laufbild aus der zurückgelegten Strecke
function laufBild(f, dx, dy, dt, schrittLaenge) {
  const weg = Math.hypot(dx, dy);
  f.lauf = (f.lauf ?? 0) + weg;
  const geht = weg / Math.max(dt, 0.001) > 12;
  return geht ? Math.floor((f.lauf / schrittLaenge) % 1 * LAUFBILDER) : -1;
}

const FARBEN = [0x42a5f5, 0xffca28, 0xab47bc, 0xff7043, 0x26c6da, 0xec407a, 0x9ccc65, 0xd7ccc8, 0xffffff, 0x5c6bc0];
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
fetch('info').then(r => r.json()).then(i => { $('codeblock').hidden = !i.code; wikiAdresse = i.wiki || ''; ton.toeneZuordnen(i.toene); }).catch(() => {});
$('los').addEventListener('click', () => { ton.tonStarten(); mitspielen(); });
// Startmusik: der Browser erlaubt Ton erst nach einer Berührung – also beim ersten Antippen der Startseite
const musikAn = () => { if ($('start').style.display !== 'none') ton.musikStarten(); };
document.addEventListener('pointerdown', musikAn, { once: true });
document.addEventListener('keydown', musikAn, { once: true });

// ---------- Figurenwahl ----------
let meinAussehen = aussehenLesen(null);
try { meinAussehen = aussehenLesen(localStorage.getItem('zob_aussehen')); } catch {}
const figurVorlage = { bild: new Image(), liste: null, bild2: new Image(), liste2: null };
figurVorlage.bild.src = 'grafik/figuren.png';
fetch('grafik/figuren.json').then(r => r.json()).then(j => { figurVorlage.liste = j; vorschauZeichnen(); }).catch(() => {});
figurVorlage.bild.onload = () => vorschauZeichnen();
figurVorlage.bild2.src = 'grafik/figuren2.png';
fetch('grafik/figuren2.json').then(r => r.json()).then(j => { figurVorlage.liste2 = j; vorschauZeichnen(); }).catch(() => {});
figurVorlage.bild2.onload = () => vorschauZeichnen();
function vorschauZeichnen() {
  const l = figurVorlage.liste;
  if (!l || !figurVorlage.bild.complete) return;
  const c = $('figurvorschau'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  document.querySelector('.figurknoepfe')?.classList.toggle('fest', meinAussehen.g === 's');
  if (meinAussehen.g === 's') {
    // Survivor: feste Figur aus dem zweiten Bogen (224er Felder)
    const l2 = figurVorlage.liste2;
    if (!l2 || !figurVorlage.bild2.complete) return;
    const nr = l2.bilder.sv_pistole_idle[0], F = l2.feld, sx = (nr % l2.spalten) * F, sy = Math.floor(nr / l2.spalten) * F;
    const fn = l2.bilder.sv_fuesse_idle[0], fx = (fn % l2.spalten) * F, fy = Math.floor(fn / l2.spalten) * F;
    ctx.save(); ctx.translate(80, 112); ctx.rotate(-Math.PI / 2); ctx.scale(0.8, 0.8);
    ctx.drawImage(figurVorlage.bild2, fx, fy, F, F, -F / 2, -F / 2, F, F);
    ctx.drawImage(figurVorlage.bild2, sx, sy, F, F, -F / 2, -F / 2, F, F);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(80, 80); ctx.rotate(-Math.PI / 2); ctx.scale(1.45, 1.45); ctx.translate(-80, -80);   // nach oben schauend, vergrößert
  umgefaerbt(ctx, figurVorlage.bild, l.feld, l.bilder[(meinAussehen.g === 'w' ? 'frau' : 'mann') + '_hand'][0], 8, 0, 0, meinAussehen);
  ctx.restore();
}
function figurWahlAufbauen() {
  const markieren = () => {
    document.querySelectorAll('.geschlecht button').forEach(b => b.classList.toggle('an', b.dataset.g === meinAussehen.g));
    [...$('haarwahl').children].forEach((b, i) => b.classList.toggle('an', i === meinAussehen.haar));
    [...$('kleidwahl').children].forEach((b, i) => b.classList.toggle('an', i === meinAussehen.kleid));
    try { localStorage.setItem('zob_aussehen', aussehenText(meinAussehen)); } catch {}
    vorschauZeichnen();
  };
  document.querySelectorAll('.geschlecht button').forEach(b => { b.onclick = () => { meinAussehen.g = b.dataset.g; markieren(); }; });
  for (const [box, farben, feld] of [[$('haarwahl'), HAARFARBEN, 'haar'], [$('kleidwahl'), KLEIDFARBEN, 'kleid']]) {
    farben.forEach((f, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = f.name; b.setAttribute('aria-label', f.name);
      b.style.background = `rgb(${f.rgb.join(',')})`;
      b.onclick = () => { meinAussehen[feld] = i; markieren(); };
      box.appendChild(b);
    });
  }
  markieren();
}
figurWahlAufbauen();
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
    if (!r) r = await client.joinOrCreate('zombies', { name, code, spielerId: spielerId(), aussehen: aussehenText(meinAussehen) });
    raum = r;
    ton.musikAusblenden(4);   // Startmusik sanft ausblenden
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
async function starteSpiel() {
  if (gestartet) return;
  gestartet = true;
  if (raum.state.karte) {
    try { KARTE = await (await fetch(`karten/${raum.state.karte}.json`)).json(); }
    catch (e) { console.error('Karte nicht geladen', e); }
  }
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
const GRAFIK = ['baum_gross', 'baum_klein', 'baum_herbst', 'baum_herbst_klein', 'busch', 'busch_herbst', 'fels1', 'fels2', 'kiste'];
// Figuren (Kenney „Topdown Shooter“, CC0): je Spielerfarbe eine Person
const MENSCH_GROESSE = 0.42, ZOMBIE_GROESSE = 0.42, BOGEN2_GROESSE = 0.34;   // figuren2: 224er Felder
const ZOMBIE_TYPEN = ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose', 'z6', 'z7'];   // z6/z7 aus figuren2 (Riley Gombart)
const SV_WAFFE = { pistole: 'pistole', gewehr: 'gewehr', schrotflinte: 'schrot', messer: 'messer' };   // sonst Taschenlampe

class Ort extends Phaser.Scene {
  constructor() { super('ort'); }

  preload() {
    for (const g of GRAFIK) this.load.image(g, 'grafik/' + g + '.png');
    // Figuren aus den KI-Bögen (tools/figuren_schneiden.py): 160er-Felder, Drehpunkt in der Feldmitte
    this.load.spritesheet('figuren', 'grafik/figuren.png', { frameWidth: 160, frameHeight: 160 });
    this.load.json('figurenliste', 'grafik/figuren.json');
    // zweiter Bogen: Survivor, Zombies und Bürger von OpenGameArt (siehe grafik/LIZENZ.txt)
    this.load.spritesheet('figuren2', 'grafik/figuren2.png', { frameWidth: 224, frameHeight: 224 });
    this.load.json('figurenliste2', 'grafik/figuren2.json');
  }

  create() {
    const s = raum.state;
    if (KARTE) { setzeKartengroesse(KARTE.breite, KARTE.hoehe); this.welt = baueWeltAusKarte(KARTE, s.seed, { autos: (s.autos ?? 10) / 10 }); }
    else { setzeKartengroesse(64, 48); this.welt = baueWelt(s.seed); }
    figurenVorzeichnen(this);
    this.zeichneKarte();
    this.aussenObjekte = this.children.list.slice();   // alles, was zur Außenwelt gehört
    this.uebersichtVorbereiten();
    this.laternenListe = this.welt.vektor ? laternen(this.welt) : [];
    this.innenWelten = new Map();   // Ebene → Innenraum (wie auf dem Server erzeugt)
    this.innenAnsichten = new Map();
    this.aktEbene = '';
    this.lichtTexturen();

    this.figuren = new Map();   // sessionId → {box, ...}
    this.zombies = new Map();
    this.menschenObj = new Map();   // Bewohner (Abschnitt 4)
    this.busObj = new Map();
    this.leichen = new Map();
    this.bodenObj = new Map();
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
    // zwei Finger: zoomen (der Laufstick pausiert, solange zwei Finger liegen)
    this.input.addPointer(2);
    this.finger = new Map();
    const fingerAbstand = () => { const [a, b] = [...this.finger.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.input.on('pointerdown', p => {
      popupZu();
      if (p.wasTouch) this.finger.set(p.id, { x: p.x, y: p.y });
      if (this.finger.size >= 2) {
        this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 };
        this.kneifen = { abstand: Math.max(20, fingerAbstand()), zoom: this.zoomWahl ?? 1 };
        return;
      }
      if (this.joystick.id !== null || this.kneifen) return;
      this.joystick = { id: p.id, bx: p.x, by: p.y, vx: 0, vy: 0 };
    });
    this.input.on('pointermove', p => {
      if (this.finger.has(p.id)) this.finger.set(p.id, { x: p.x, y: p.y });
      if (this.kneifen && this.finger.size >= 2) {
        this.zoomWahl = Phaser.Math.Clamp(this.kneifen.zoom * fingerAbstand() / this.kneifen.abstand, 0.4, 1.8);
        this.cameras.main.setZoom(this.zielZoom());
        return;
      }
      if (p.id !== this.joystick.id) return;
      let vx = (p.x - this.joystick.bx) / 60, vy = (p.y - this.joystick.by) / 60;
      const l = Math.hypot(vx, vy);
      if (l > 1) { vx /= l; vy /= l; }
      this.joystick.vx = vx; this.joystick.vy = vy;
    });
    const loslassen = p => {
      this.finger.delete(p.id);
      if (this.kneifen && this.finger.size < 2) {
        if (this.finger.size === 0) { this.kneifen = null; try { localStorage.setItem('zob_zoom', this.zoomWahl.toFixed(2)); } catch {} }
        return;
      }
      if (p.id === this.joystick.id) this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 };
    };
    this.input.on('pointerup', loslassen);
    this.input.on('pointerupoutside', loslassen);

    const naechsteFigur = (x, y) => { let best = null, bd = 30; for (const f of this.figuren.values()) { const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } } return best; };
    raum.onMessage('schuss', m => {
      const fs = naechsteFigur(m.x1, m.y1); if (fs) fs.schussBis = this.time.now + 150;
      this.schuss(m);
      // Schrot kommt als mehrere Linien – nur ein Knall
      const jetzt = performance.now();
      if (jetzt - (this.letzterKnall ?? 0) > 60) { ton.schuss(m.x1, m.y1, m.art === 'gewehr' ? 1.3 : m.art === 'schrotflinte' ? 1.2 : 1, m.art); this.letzterKnall = jetzt; }
    });
    raum.onMessage('stoss', m => { const fs = naechsteFigur(m.x, m.y); if (fs) fs.schlagBis = this.time.now + 400; this.stoss(m); ton.stoss(m.x, m.y, m.messer); });
    raum.onMessage('feuer', m => { if (!ton.ereignis('feuer', m.x, m.y)) ton.schuss(m.x, m.y, 1.4); });
    raum.onMessage('menschGebissen', m => { ton.ereignis('menschGebissen', m.x, m.y); });
    raum.onMessage('klettern', m => {
      // eigene Figur: in einem kurzen Sprung hinübergleiten statt springen
      if (m.id === meineId && this.lokal) this.sprung = { vx: this.lokal.x, vy: this.lokal.y, nx: m.x, ny: m.y, t: 0 };
      ton.schritt(false); ton.schritt(false);
      for (let i = 0; i < 5; i++) {
        const c = this.add.circle(m.x + (Math.random() - 0.5) * 16, m.y + 8, 3 + Math.random() * 3, 0xa1887f, 0.7).setDepth(3.9);
        this.tweens.add({ targets: c, y: c.y - 10, alpha: 0, scale: 1.8, duration: 450, onComplete: () => c.destroy() });
      }
    });
    raum.onMessage('sirene', () => {});   // die Sirene läuft dauernd am Fahrzeug (fahrzeuge in abgleichen)
    raum.onMessage('weg', m => { this.puff(m.x, m.y); ton.zombieWeg(m.x, m.y); });
    raum.onMessage('entdeckt', m => { this.ausruf(m.x, m.y); ton.entdeckt(m.x, m.y); });
    raum.onMessage('meldung', m => { meldung(m.text, m.lang); if (m.lang) ton.ereignis('funk'); });
    raum.onMessage('gefunden', m => {
      if (m.dinge.length) ton.aufheben(); else ton.suchen();
      if (m.dinge.length) meldung('Gefunden: ' + m.dinge.map(d => d === 'munition' ? '🧰 12 Schuss' : dingText(d)).join(', '));
      else if (m.rest) meldung('Rucksack voll – der Rest bleibt hier');
      else meldung('Nichts Brauchbares gefunden');
      if (m.dinge.length && m.rest) meldung('Rucksack voll – der Rest bleibt hier');
    });
    raum.onMessage('pong', () => {});
    raum.onMessage('raetsel', m => zeigeRaetsel(m));
    raum.onMessage('tausch', m => zeigeTausch(m));
    raum.onMessage('tausch_ende', m => {
      tauschZu();
      meldung(m.grund === 'fertig' ? '🤝 Getauscht!' : 'Tausch abgebrochen');
    });
    raum.onMessage('aufloesung', m => zeigeAufloesung(m));
    raum.onMessage('neustart', () => {
      abgemeldet = true;
      meldung('🔄 Die Welt wird neu gestartet – gleich geht es weiter …', true);
      setTimeout(() => location.reload(), 2500);
    });
    raum.onMessage('tor', () => meldung('🎉 Level 1 geschafft! Level 2 – der Wald an der Isar – kommt bald.', true));

    $('aktion').onclick = () => this.aktion();
    $('ausruhen').onclick = () => raum.send('ausruhen');
    $('kistezu').onclick = () => kisteZu();
    $('raetselzu').onclick = () => raetselZu();
    $('tauschok').onclick = () => raum.send('tausch_ok');
    $('tauschab').onclick = () => raum.send('tausch_ende');
    this.hudZeit = 0;
    // Zoom: Knöpfe, Mausrad, Tasten + und −
    $('zoomrein').style.display = $('zoomraus').style.display = 'block';
    $('zoomrein').onclick = () => this.zoomen(1.25);
    $('zoomraus').onclick = () => this.zoomen(0.8);
    this.input.on('wheel', (_p, _o, _dx, dy) => this.zoomen(dy < 0 ? 1.12 : 1 / 1.12));
    this.input.keyboard.on('keydown', e => {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === '+' || e.key === '=') this.zoomen(1.25);
      else if (e.key === '-') this.zoomen(0.8);
    });
    // Test-Hilfe: mit ?debug in der Adresse ist die Szene in der Konsole erreichbar
    if (new URLSearchParams(location.search).has('debug')) { window.szene = this; window.raum = raum; window.meineId = meineId; }
  }

  passeZoomAn() {
    const kurz = Math.min(this.scale.width, this.scale.height);
    this.grundZoom = Phaser.Math.Clamp(kurz / 520, 0.55, 1.6);
    if (this.zoomWahl === undefined) { this.zoomWahl = 1; try { this.zoomWahl = Phaser.Math.Clamp(Number(localStorage.getItem('zob_zoom')) || 1, 0.4, 1.8); } catch {} }
    this.cameras.main.setZoom(this.zielZoom());
  }

  // Kamerazoom: Bildschirmgröße × eigene Wahl (Knöpfe, Mausrad, +/−) × drinnen näher
  zielZoom(ebene = this.aktEbene) { return this.grundZoom * this.zoomWahl * (ebene ? INNEN_ZOOM : 1); }

  zoomen(faktor) {
    this.zoomWahl = Phaser.Math.Clamp((this.zoomWahl ?? 1) * faktor, 0.4, 1.8);
    try { localStorage.setItem('zob_zoom', this.zoomWahl.toFixed(2)); } catch {}
    this.cameras.main.zoomTo(this.zielZoom(), 160, 'Sine.easeOut');
  }

  zeichneKarte() {
    // Boden, Bäume, Deko und Dächer entstehen stückweise beim Hinsehen (chunksAktualisieren)
    this.bilder = Object.fromEntries(GRAFIK.map(g => [g, this.textures.get(g).getSourceImage()]));
    this.figurListe = this.cache.json.get('figurenliste')?.bilder ?? {};
    this.figurListe2 = this.cache.json.get('figurenliste2')?.bilder ?? {};
    this.stuecke = new Map();
    const g = this.add.graphics().setDepth(0.5);
    // Böden der Safe Rooms etwas wärmer
    for (const s of this.welt.safeRooms) {
      const h = s.haus;
      if (!this.welt.karte) g.fillStyle(0xd7c4a3, 1).fillRect((h.x + 1) * KACHEL, (h.y + 1) * KACHEL, (h.b - 2) * KACHEL, (h.h - 2) * KACHEL);
      // Vorratskiste
      g.fillStyle(0x6d4c41, 1).fillRect(s.kiste.x - 12, s.kiste.y - 9, 24, 18);
      g.lineStyle(2, 0x3e2723, 1).strokeRect(s.kiste.x - 12, s.kiste.y - 9, 24, 18);
      g.fillStyle(0xffca28, 1).fillRect(s.kiste.x - 2, s.kiste.y - 3, 4, 5);
    }
    this.torGrafik = this.add.graphics().setDepth(1.5);
    this.torStand = -1;
    this.add.text((this.welt.tor.x + (this.welt.tor.x === 0 ? 1 : 0)) * KACHEL + 4, (this.welt.tor.y + (this.welt.tor.y === 0 ? 1 : 0)) * KACHEL + 18, 'Ortsausgang', {
      fontSize: '12px', fontStyle: 'bold', color: '#ffe082',
    }).setDepth(1);

    // Behälter: Schränke, Kühlschränke, Spinde (unter dem Dach) und Autos
    this.behaelterObj = new Map();
    for (const b of this.welt.behaelter) {
      const c = this.add.container(b.x, b.y).setDepth(1);
      if (b.art === 'bus') { /* der Bus selbst ist in der oberen Ebene gezeichnet */ }
      else if (b.art === 'auto') { /* geparkte Autos sind in die Kartenstücke gezeichnet (aussehen.mjs) */
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

    // Dächer der Safe Rooms als eigene Bilder (werden beim Hineingehen durchsichtig); die übrigen Dächer stecken in den Kartenstücken
    this.daecher = this.welt.safeRooms.map(s => {
      const h = s.haus, schluessel = 'dach-' + s.id;
      const tex = this.textures.createCanvas(schluessel, h.b * KACHEL + DACH_RAND * 2, h.h * KACHEL + DACH_RAND * 2);
      zeichneSafeDach(tex.getContext(), this.welt, h);
      tex.refresh();
      const bild = this.add.image(h.x * KACHEL - DACH_RAND, h.y * KACHEL - DACH_RAND, schluessel).setOrigin(0).setDepth(5.2);
      return { haus: h, grafik: bild };
    });
    // Namen der Geschäfte und Einrichtungen auf den Dächern (OSM)
    for (const h of this.welt.haeuser) {
      if (!h.name || h.safe) continue;
      this.add.text((h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL, h.name, {
        fontSize: '11px', fontStyle: 'bold', color: '#fff8e1', stroke: '#3e2723', strokeThickness: 3, align: 'center',
        wordWrap: { width: Math.max(80, h.b * KACHEL) },
      }).setOrigin(0.5).setDepth(6);
    }
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

  // ---------- Übersichtskarte (client/uebersicht.mjs) ----------
  uebersichtVorbereiten() {
    this.uebersicht = new Uebersicht(this.welt, $('kartenbox'));
    const knopf = $('ton');
    knopf.style.display = 'block';
    knopf.textContent = ton.tonAn() ? '🔊' : '🔇';
    knopf.onclick = () => { ton.tonStarten(); knopf.textContent = ton.tonUmschalten() ? '🔊' : '🔇'; };
    ton.umgebung(false);
    this.input.keyboard.on('keydown-M', () => { this.uebersicht.umschalten(); this.uebersichtZeichnen(); });
  }

  uebersichtZeichnen() {
    if (!this.uebersicht) return;
    const spieler = [...raum.state.spieler.entries()].map(([id, p]) => ({
      x: id === meineId && this.lokal ? this.lokal.x : p.x, y: id === meineId && this.lokal ? this.lokal.y : p.y,
      ebene: p.ebene ?? '', name: p.name, ich: id === meineId, farbe: css(FARBEN[p.farbe % FARBEN.length]),
    }));
    this.uebersicht.zeichne(spieler, e => { const m = EBENE_MUSTER.exec(e); return m ? this.welt.haeuser[Number(m[1])] : null; });
  }

  // Kartenstücke um die Kamera herum erzeugen, entfernte freigeben (große Karten passen nicht in ein Bild)
  chunksAktualisieren(alle = false) {
    if (this.aktEbene) return;
    const v = this.cameras.main.worldView, K = KACHEL * STUECK;
    const nx = Math.ceil(BREITE / STUECK) - 1, ny = Math.ceil(HOEHE / STUECK) - 1;
    const cx0 = Math.max(0, Math.floor((v.x - 160) / K)), cx1 = Math.min(nx, Math.floor((v.right + 160) / K));
    const cy0 = Math.max(0, Math.floor((v.y - 160) / K)), cy1 = Math.min(ny, Math.floor((v.bottom + 160) / K));
    let budget = alle || !this.stuecke.size ? 99 : 1;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (this.stuecke.has(cx + ',' + cy) || budget <= 0) continue;
      budget--; this.baueStueck(cx, cy);
    }
    for (const [key, st] of this.stuecke) {
      if (st.cx >= cx0 - 1 && st.cx <= cx1 + 1 && st.cy >= cy0 - 1 && st.cy <= cy1 + 1) continue;
      st.boden.destroy(); st.oben.destroy();
      this.textures.remove('boden-' + key); this.textures.remove('oben-' + key);
      this.stuecke.delete(key);
    }
  }

  baueStueck(cx, cy) {
    const rect = { x0: cx * STUECK, y0: cy * STUECK, x1: Math.min(BREITE, (cx + 1) * STUECK), y1: Math.min(HOEHE, (cy + 1) * STUECK) };
    const B = (rect.x1 - rect.x0) * KACHEL, H = (rect.y1 - rect.y0) * KACHEL, key = cx + ',' + cy;
    const tb = this.textures.createCanvas('boden-' + key, B, H);
    zeichneBoden(tb.getContext(), this.welt, rect); tb.refresh();
    const to = this.textures.createCanvas('oben-' + key, B, H);
    const ctx = to.getContext();
    zeichneOben(ctx, this.welt, this.bilder, rect);
    zeichneDaecher(ctx, this.welt, rect);
    to.refresh();
    const boden = this.add.image(rect.x0 * KACHEL, rect.y0 * KACHEL, 'boden-' + key).setOrigin(0).setDepth(0).setVisible(!this.aktEbene);
    const oben = this.add.image(rect.x0 * KACHEL, rect.y0 * KACHEL, 'oben-' + key).setOrigin(0).setDepth(5).setVisible(!this.aktEbene);
    this.stuecke.set(key, { cx, cy, boden, oben });
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
    const n = p.farbe % FARBEN.length;
    // eigener Spieler: heller Ring am Boden
    const ring = this.add.ellipse(0, 0, 34, 34).setStrokeStyle(2, 0xffffff, ich ? 0.7 : 0).setFillStyle(0x000000, 0);
    const bild = this.add.image(0, 0, this.menschTextur(p.aussehen), 0).setScale(MENSCH_GROESSE);
    const fuesse = this.add.image(0, 0, 'figuren2', this.figurBild2('sv_fuesse_idle')).setScale(BOGEN2_GROESSE).setVisible(false);
    const name = this.add.text(0, -28, p.name, { fontSize: '11px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const hp = this.add.rectangle(-12, -18, 24, 3, 0x66bb6a).setOrigin(0, 0.5);
    const tun = this.add.text(16, -16, '', { fontSize: '13px' }).setOrigin(0.5);
    box.add([ring, fuesse, bild, name, hp, tun]);
    return { box, bild, fuesse, koerper: bild, name, hp, tun, farbe, n, x: p.x, y: p.y, altX: p.x, altY: p.y };
  }

  neuerZombie(z) {
    const box = this.add.container(z.x, z.y).setDepth(3);
    const bild = this.add.image(0, 0, 'figuren', this.figurBild('zombie_hemd', 0)).setScale(ZOMBIE_GROESSE);
    box.add([bild]);
    return { box, bild, x: z.x, y: z.y, r: z.richtung };
  }

  // Fahrzeugbilder einmalig zeichnen (Front zeigt nach rechts)
  fahrzeugTextur(art, farbe = 0) {
    const key = art === 'auto' ? 'fz-auto-' + (farbe % 8) : 'fz-' + art;
    if (this.textures.exists(key)) return key;
    const breit = art === 'bus' ? 136 : art === 'feuerwehr' ? 84 : 60, hoch = art === 'bus' ? 40 : 34;
    const t = this.textures.createCanvas(key, breit, hoch), c = t.getContext();
    if (art === 'bus') busVonOben(c, breit / 2, hoch / 2, false, 0.6);
    else if (art === 'feuerwehr') {
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(6, 7, 74, 24);
      c.fillStyle = '#c62828'; c.beginPath(); c.roundRect(2, 4, 76, 24, 5); c.fill();
      c.fillStyle = '#eceff1'; c.fillRect(8, 8, 44, 16);                     // Drehleiter
      c.strokeStyle = '#90a4ae'; c.lineWidth = 1.5; for (let x = 10; x < 52; x += 6) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 24); c.stroke(); }
      c.fillStyle = '#263238'; c.fillRect(64, 7, 8, 18);                     // Frontscheibe
      c.fillStyle = '#fff59d'; c.fillRect(76, 6, 2, 4); c.fillRect(76, 22, 2, 4);
    } else if (art === 'wrack') {
      autoVonOben(c, { x: breit / 2, y: hoch / 2, senkrecht: false, farbe: 4 });
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(30,20,15,.8)'; c.fillRect(0, 0, breit, hoch);
      c.fillStyle = 'rgba(120,60,20,.5)'; for (let i = 0; i < 12; i++) c.fillRect(8 + Math.random() * 44, 8 + Math.random() * 18, 3, 3);
      c.globalCompositeOperation = 'source-over';
    } else {
      const f = art === 'polizei' ? 2 : farbe;
      autoVonOben(c, { x: breit / 2 + ((f + Math.round(breit / 2)) % 2 ? 1 : 0), y: hoch / 2, senkrecht: false, farbe: f });
      if (art === 'polizei') { c.fillStyle = '#1565c0'; c.fillRect(10, hoch / 2 - 11, 40, 3); c.fillRect(10, hoch / 2 + 8, 40, 3); c.fillStyle = '#263238'; c.fillRect(27, hoch / 2 - 6, 6, 12); }
    }
    t.refresh();
    return key;
  }

  // Brände: Flammen und Rauch als Partikel; ausgebrannte Häuser und Autos dunkel
  feuerDarstellen(s) {
    this.feuerObj ??= new Map();
    if (!this.textures.exists('flamme')) {
      const t = this.textures.createCanvas('flamme', 32, 32), c = t.getContext(), g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 32, 32); t.refresh();
      // Flammenzunge: tropfenförmig, unten kräftig, oben spitz auslaufend
      const z = this.textures.createCanvas('zunge', 24, 48), d = z.getContext();
      const v = d.createLinearGradient(0, 0, 0, 48);
      v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.35, 'rgba(255,255,255,.55)'); v.addColorStop(0.8, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,.7)');
      d.fillStyle = v; d.beginPath(); d.moveTo(12, 0); d.bezierCurveTo(23, 18, 23, 36, 12, 47); d.bezierCurveTo(1, 36, 1, 18, 12, 0); d.fill(); z.refresh();
    }
    for (const [id, f] of s.feuer ?? []) {
      let o = this.feuerObj.get(id);
      if (!o) {
        // Häuser brennen auf der ganzen Dachfläche, Fahrzeuge kompakt
        const haus = f.art === 'haus', menge = Math.max(1, f.r / 45);
        // Brandherde: Häuser an 3–5 Stellen, Fahrzeuge an einer; jede Flamme startet an einem Herd
        const herde = [];
        const anzahl = haus ? 3 + Math.floor(Math.random() * 3) : 1;
        for (let i = 0; i < anzahl; i++) { const w = Math.random() * Math.PI * 2, rr = haus ? f.r * (0.15 + Math.random() * 0.45) : 0; herde.push({ x: Math.cos(w) * rr, y: Math.sin(w) * rr }); }
        const anHerd = streu => ({ type: 'random', source: { getRandomPoint: p => { const h = herde[Math.floor(Math.random() * herde.length)]; p.x = h.x + (Math.random() - 0.5) * streu; p.y = h.y + (Math.random() - 0.5) * streu * 0.6; return p; } } });
        const zone = anHerd(haus ? 26 : 22), kernZone = anHerd(haus ? 14 : 12);
        const schein = this.add.image(f.x, f.y, 'flamme').setTint(0xff6d00).setBlendMode('ADD').setDepth(1.2).setScale(f.r / 9).setAlpha(0.35);
        const flammen = this.add.particles(f.x, f.y, 'zunge', {
          speed: { min: 35, max: 90 }, angle: { min: 258, max: 282 }, scale: { start: 1.0, end: 0.25 }, alpha: { start: 0.85, end: 0 },
          lifespan: { min: 380, max: 800 }, frequency: 12 / menge, tint: [0xffa726, 0xff7043, 0xf4511e, 0xc62828], blendMode: 'ADD', emitZone: zone,
        }).setDepth(5.6);
        const kern = this.add.particles(f.x, f.y, 'zunge', {
          speed: { min: 15, max: 45 }, angle: { min: 255, max: 285 }, scale: { start: 0.65, end: 0 }, alpha: { start: 0.9, end: 0 },
          lifespan: { min: 250, max: 500 }, frequency: 25 / menge, tint: [0xffffff, 0xfff59d, 0xffe082], blendMode: 'ADD', emitZone: kernZone,
        }).setDepth(5.65);
        const funken = this.add.particles(f.x, f.y, 'flamme', {
          speed: { min: 50, max: 140 }, angle: { min: 225, max: 315 }, gravityY: 25, scale: { start: 0.18, end: 0.05 }, alpha: { start: 1, end: 0 },
          lifespan: { min: 700, max: 1500 }, frequency: 110 / menge, tint: [0xffd180, 0xffab40], blendMode: 'ADD', emitZone: kernZone,
        }).setDepth(5.66);
        const rauch = this.add.particles(f.x, f.y, 'flamme', {
          speedY: { min: -60, max: -25 }, speedX: { min: 5, max: 30 }, scale: { start: 1.1, end: 3.8 }, alpha: { start: 0.3, end: 0 },
          lifespan: { min: 2400, max: 3600 }, frequency: 70 / menge, tint: [0x2b2b2b, 0x3d3d3d, 0x4a4542], emitZone: zone, rotate: { min: 0, max: 360 },
        }).setDepth(5.7);
        o = { schein, teile: [flammen, kern, funken, rauch], basis: [18 / menge, 25 / menge, 110 / menge, 70 / menge] };
        this.feuerObj.set(id, o);
      }
      const st = Math.max(0.05, f.staerke), sichtbar = this.aktEbene === '';
      o.teile.forEach((t, i) => { t.frequency = o.basis[i] / st; t.setVisible(sichtbar); });
      o.schein.setVisible(sichtbar).setAlpha((0.22 + Math.random() * 0.12) * st).setScale(f.r / 9 * (0.95 + Math.random() * 0.1));
    }
    for (const [id, o] of this.feuerObj) if (!s.feuer?.has(id)) { o.teile.forEach(t => t.destroy()); o.schein.destroy(); this.feuerObj.delete(id); }
    // Ruinen und ausgebrannte Autos/Busse (nur neu zeichnen, wenn sich etwas ändert)
    const stand = s.verbrannt?.size ?? 0;
    if (stand === this.ruinenStand) return;
    this.ruinenStand = stand;
    this.ruinenGfx ??= this.add.graphics().setDepth(5.15);
    this.wrackGfx ??= this.add.graphics().setDepth(1.05);
    const g = this.ruinenGfx.clear(), w = this.wrackGfx.clear();
    for (const k of s.verbrannt?.keys() ?? []) {
      const [art, rest] = k.split(':');
      if (art === 'haus') {
        const h = this.welt.haeuser[Number(rest)];
        const gb = h && this.welt.vektor?.gebaeude.find(q => q.x === h.x && q.y === h.y);
        if (!gb) continue;
        g.fillStyle(0x1e1610, 0.78).beginPath();
        g.moveTo(gb.p[0] * KACHEL, gb.p[1] * KACHEL);
        for (let i = 2; i < gb.p.length; i += 2) g.lineTo(gb.p[i] * KACHEL, gb.p[i + 1] * KACHEL);
        g.closePath().fillPath();
        g.fillStyle(0x5d4037, 0.6);
        for (let i = 0; i < 6; i++) g.fillRect((h.x + Math.random() * h.b) * KACHEL, (h.y + Math.random() * h.h) * KACHEL, 6, 4);
      } else {
        const b = this.welt.behaelter.find(q => q.id === rest);
        if (!b) continue;
        if (art === 'auto') { const sk = b.senkrecht; w.fillStyle(0x15100c, 0.92).fillRoundedRect(b.x - (sk ? 11 : 23), b.y - (sk ? 23 : 11), sk ? 22 : 46, sk ? 46 : 22, 5); w.fillStyle(0x6d3a1a, 0.6).fillRect(b.x - 4, b.y - 4, 8, 8); }
        else { const d = this.welt.deko.find(q => q.art === 'bus' && Math.hypot(q.x - b.x, q.y - b.y) < 4); const sk = d?.senkrecht; g.fillStyle(0x15100c, 0.9).fillRect(b.x - (sk ? 15 : 62), b.y - (sk ? 62 : 15), sk ? 30 : 124, sk ? 124 : 30); }
      }
    }
  }

  // durchsuchte Behälter erkennbar machen: draußen offener Kofferraum, drinnen offene Türen; leer = ausgegraut
  spurenDarstellen(s) {
    let stand = '';
    for (const [id, b] of s.behaelter) stand += id + b.rest;
    if (stand === this.spurenStand && this.spurenEbene === this.aktEbene) return;
    this.spurenStand = stand; this.spurenEbene = this.aktEbene;
    this.spurenGfx ??= this.add.graphics().setDepth(1.08);
    const g = this.spurenGfx.clear();
    const w = this.wv(this.aktEbene);
    for (const b of w.behaelter ?? []) {
      const z = s.behaelter.get(b.id);
      if (!z) continue;
      const leer = z.rest === 0;
      if (b.art === 'auto') {
        if (s.verbrannt?.has('auto:' + b.id)) continue;
        const sk = b.senkrecht;
        g.fillStyle(0x111111, 0.85).fillRect(b.x - (sk ? 9 : 25), b.y - (sk ? 25 : 9), sk ? 18 : 9, sk ? 9 : 18);   // offener Kofferraum
        if (leer) g.fillStyle(0x9e9e9e, 0.45).fillRoundedRect(b.x - (sk ? 11 : 23), b.y - (sk ? 23 : 11), sk ? 22 : 46, sk ? 46 : 22, 5);
      } else if (b.art !== 'bus') {
        g.lineStyle(2, leer ? 0x9e9e9e : 0xffd54f, 0.9).strokeRect(b.x - 12, b.y - 12, 24, 24);
        g.fillStyle(0x111111, 0.55).fillRect(b.x - 9, b.y - 9, 18, 18);                    // geöffnete Türen
        if (leer) { g.lineStyle(2, 0xbdbdbd, 0.9).lineBetween(b.x - 6, b.y - 6, b.x + 6, b.y + 6).lineBetween(b.x + 6, b.y - 6, b.x - 6, b.y + 6); }
      }
    }
    g.setDepth(this.aktEbene ? 0.45 : 1.08);
  }

  figurBild2(name, i = 0) {
    const l = this.figurListe2[name];
    return l?.length ? l[((i % l.length) + l.length) % l.length] : 0;
  }

  // Bildnummer im Figurenbogen (Name aus figuren.json, i-tes Bild der Folge)
  figurBild(name, i = 0) {
    const l = this.figurListe[name];
    return l?.length ? l[((i % l.length) + l.length) % l.length] : 0;
  }

  // umgefärbte Spielerfigur (vier Haltungen: ohne Waffe, Pistole, Schläger, Messer) als eigene Textur
  menschTextur(aussehenTextWert) {
    const a = aussehenLesen(aussehenTextWert), key = 'mensch_' + aussehenText(a);
    if (this.textures.exists(key)) return key;
    const quelle = this.textures.get('figuren').getSourceImage(), FELD = 160;
    const tex = this.textures.createCanvas(key, FELD * 4, FELD), ctx = tex.getContext();
    WAFFEN_BILD.forEach((w, k) => {
      umgefaerbt(ctx, quelle, FELD, this.figurBild((a.g === 'w' ? 'frau_' : 'mann_') + w), 8, k * FELD, 0, a);
      tex.add(k, 0, k * FELD, 0, FELD, FELD);
    });
    tex.refresh();
    return key;
  }

  // ---------- Ebenen: Innenräume ----------
  wv(ebene) {
    if (!ebene) return this.welt;
    let w = this.innenWelten.get(ebene);
    if (!w) {
      const m = EBENE_MUSTER.exec(ebene);
      const haus = this.welt.haeuser[Number(m[1])];
      const kat = ladenArt(haus);
      w = baueInnenraum(raum.state.seed, Number(m[1]), m[2], seiteVon(haus), !!kat);
      if (kat) w.behaelter.forEach(b => { if (b.art === 'laden') b.art = 'laden_' + kat; });
      w.ebene = ebene; w.nr = Number(m[1]); w.stock = m[2];
      w.behaelter = w.behaelter.map(b => ({ ...b, id: ebene + ':' + b.id }));
      this.innenWelten.set(ebene, w);
    }
    return w;
  }

  lichtTexturen() {
    const licht = this.textures.createCanvas('licht', 256, 256), c = licht.getContext();
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256); licht.refresh();
    // Lichtkegel mit weichen Rändern: viele übereinandergelegte, immer breitere Kegel mit wenig Deckkraft
    const lampe = this.textures.createCanvas('lampe', 512, 512), d = lampe.getContext();
    for (let i = 0; i < 14; i++) {
      const w = 0.16 + i * 0.03;
      const h = d.createRadialGradient(0, 256, 10, 0, 256, 512);
      h.addColorStop(0, 'rgba(255,255,255,0.14)'); h.addColorStop(0.55, 'rgba(255,255,255,0.09)'); h.addColorStop(1, 'rgba(255,255,255,0)');
      d.fillStyle = h; d.beginPath(); d.moveTo(0, 256); d.arc(0, 256, 512, -w, w); d.closePath(); d.fill();
    }
    lampe.refresh();
    this.lichtPinsel = this.make.image({ key: 'licht', add: false });
    // weicher Schein für draußen (Laternen, Fenster): fällt gleichmäßig ab, ohne helle Scheibe
    const weich = this.textures.createCanvas('lichtweich', 256, 256), w = weich.getContext();
    const gw = w.createRadialGradient(128, 128, 0, 128, 128, 128);
    gw.addColorStop(0, 'rgba(255,255,255,1)'); gw.addColorStop(0.25, 'rgba(255,255,255,.75)'); gw.addColorStop(0.6, 'rgba(255,255,255,.28)'); gw.addColorStop(1, 'rgba(255,255,255,0)');
    w.fillStyle = gw; w.fillRect(0, 0, 256, 256); weich.refresh();
    this.weichPinsel = this.make.image({ key: 'lichtweich', add: false });
    this.lampenPinsel = this.make.image({ key: 'lampe', add: false }).setOrigin(0, 0.5);
  }

  innenAnsicht(ebene) {
    let a = this.innenAnsichten.get(ebene);
    if (a) return a;
    const w = this.wv(ebene);
    const B = w.b * KACHEL, H = w.h * KACHEL, X = w.ox * KACHEL, Y = w.oy * KACHEL;
    const tex = this.textures.createCanvas('innen-' + ebene, B, H);
    zeichneInnen(tex.getContext(), w); tex.refresh();
    const bild = this.add.image(X, Y, 'innen-' + ebene).setOrigin(0).setDepth(0.2);
    const tueren = this.add.graphics().setDepth(0.4);
    const dunkel = this.add.renderTexture(X, Y, B, H).setOrigin(0).setDepth(9);
    const nebel = this.add.graphics().setDepth(9.5);   // Räume hinter nie geöffneten Türen: ganz schwarz
    a = { w, bild, tueren, dunkel, nebel, X, Y, B, H, stand: '', bekannt: new Set(), nebelStand: -1 };
    this.innenAnsichten.set(ebene, a);
    return a;
  }

  wechsleAnsicht(ebene) {
    this.aktEbene = ebene;
    for (const o of this.aussenObjekte) o.setVisible(!ebene);
    for (const st of this.stuecke.values()) { st.boden.setVisible(!ebene); st.oben.setVisible(!ebene); }
    for (const [e, a] of this.innenAnsichten) for (const o of [a.bild, a.tueren, a.dunkel, a.nebel]) o.setVisible(e === ebene);
    const cam = this.cameras.main;
    if (ebene) {
      const a = this.innenAnsicht(ebene);
      for (const o of [a.bild, a.tueren, a.dunkel, a.nebel]) o.setVisible(true);
      cam.setBounds(a.X - 200, a.Y - 200, a.B + 400, a.H + 400);
    } else { cam.setBounds(0, 0, BREITE * KACHEL, HOEHE * KACHEL); this.setzeGrau(false); }
    cam.setBackgroundColor(ebene ? '#0b0b0d' : '#1b2a1b');
    ton.umgebung(!!ebene);
    // weich hinein- bzw. herauszoomen
    cam.zoomTo(this.zielZoom(ebene), 450, 'Sine.easeInOut');
    kisteZu(); popupZu();
  }

  // Türzustände vom Server übernehmen und Türen zeichnen; Dunkelheit mit Lichtkegel
  innenAktualisieren(ich) {
    const ebene = this.aktEbene;
    if (!ebene || !ich) return;
    const a = this.innenAnsicht(ebene), w = a.w;
    let stand = '';
    for (const t of w.tueren) {
      const st = raum.state.tueren.get(`${ebene}:${t.x},${t.y}`);
      const offen = !!st?.offen, zu = st ? st.verschlossen : t.verschlossen;
      w.kacheln[t.y * BREITE + t.x] = offen ? T.TUER_OFFEN : T.INNENTUER;
      stand += offen ? 'o' : zu ? 'v' : 'z';
    }
    if (stand !== a.stand) {
      if (a.stand) for (let i = 0; i < stand.length; i++) if ((stand[i] === 'o') !== (a.stand[i] === 'o')) { ton.tuer(stand[i] === 'o'); break; }
      a.stand = stand;
      const g = a.tueren.clear();
      w.tueren.forEach((t, i) => {
        const x = t.x * KACHEL, y = t.y * KACHEL, z = stand[i];
        const senkrecht = w.hole(t.x, t.y - 1) === T.WAND;   // Wand oben/unten → Tür in senkrechter Wand
        if (z === 'o') {
          g.fillStyle(0x6d4c41, 1);
          if (senkrecht) g.fillRect(x + 2, y + 1, 26, 5); else g.fillRect(x + 1, y + 2, 5, 26);
        } else {
          g.fillStyle(z === 'v' ? 0x5d4037 : 0x8d6e63, 1).fillRect(x + 2, y + 2, KACHEL - 4, KACHEL - 4);
          g.lineStyle(2, 0x3e2723, 1).strokeRect(x + 2, y + 2, KACHEL - 4, KACHEL - 4);
          g.fillStyle(0xffd54f, 1).fillCircle(x + KACHEL - 9, y + KACHEL / 2, 2.5);
          if (z === 'v') { g.fillStyle(0xb0bec5, 1).fillRect(x + KACHEL / 2 - 4, y + KACHEL / 2 - 2, 8, 7); g.lineStyle(2, 0xb0bec5, 1).strokeCircle(x + KACHEL / 2, y + KACHEL / 2 - 3, 3); }
        }
      });
    }
    this.nebelAktualisieren(a);
    const d = a.dunkel;
    // tagsüber fällt in etwa 70 % der Häuser Licht durch die Fenster: keine Lampe nötig
    const m = EBENE_MUSTER.exec(ebene), uhr = raum.state.uhr ?? 480;
    if (m && hausHell(Number(m[1]), m[2], uhr)) {
      d.clear();
      const daemmer = 1 - helligkeit(uhr);
      if (daemmer > 0.02) d.fill(0x030405, daemmer * 0.6);
      this.setzeGrau(false);
      return;
    }
    // Dunkelheit: mit Taschenlampe ein langer Kegel; ohne nur ein kleiner, schwacher Lichtkreis in Grau
    const lampe = ich.lampe > 0;
    d.clear();
    d.fill(0x030405, lampe ? (w.stock === 'keller' ? 0.94 : 0.88) : 0.965);
    const lx = this.lokal.x - a.X, ly = this.lokal.y - a.Y;
    this.lichtPinsel.setScale(lampe ? 0.42 : 0.36).setAlpha(lampe ? 1 : 0.8);
    d.erase(this.lichtPinsel, lx, ly);
    if (lampe) {
      this.lampenPinsel.setRotation(this.lampenRichtung(ich)).setScale(0.8).setAlpha(1);
      d.erase(this.lampenPinsel, lx, ly);
    }
    this.setzeGrau(!lampe);
  }

  // Kegel folgt der Laufrichtung weich (nicht jedem Ruck, z. B. beim automatischen Zielen)
  lampenRichtung(ich) {
    const e = this.eingabe, ziel = Math.hypot(e.dx, e.dy) > 0.1 ? Math.atan2(e.dy, e.dx) : (this.lampenWinkel ?? ich.richtung);
    this.lampenWinkel = Phaser.Math.Angle.RotateTo(this.lampenWinkel ?? ziel, ziel, this.game.loop.delta / 1000 * 3.5);
    return this.lampenWinkel;
  }

  // Draußen: Dämmerung färbt warm, nachts dunkelblau; Laternen, Fenster, Taschenlampe und ein kleiner Schein um jeden Spieler
  aussenLicht(ich) {
    let rt = this.nachtRT;
    const uhr = raum.state.uhr ?? 480, dunkel = 1 - helligkeit(uhr);
    if (this.aktEbene || dunkel < 0.01 || !this.lokal) { rt?.setVisible(false); return; }
    const v = this.cameras.main.worldView, R = 40;
    const B = Math.ceil(v.width / 256) * 256 + 2 * R, H = Math.ceil(v.height / 256) * 256 + 2 * R;
    // neu anlegen statt resize() – nach resize() wirkt erase() in Phaser 3.90 nicht mehr
    if (!rt || rt.width !== B || rt.height !== H) { rt?.destroy(); rt = this.nachtRT = this.add.renderTexture(0, 0, B, H).setOrigin(0).setDepth(8); }
    rt.setVisible(true);
    const ox = v.x - R, oy = v.y - R;
    rt.setPosition(ox, oy);
    const mische = (a, b, t) => { const k = (s) => [(a >> s) & 255, (b >> s) & 255]; return [16, 8, 0].reduce((f, s) => { const [x, y] = k(s); return f | (Math.round(x + (y - x) * t) << s); }, 0); };
    rt.clear();
    rt.fill(mische(0xff8a3d, 0x0b1430, Math.min(1, dunkel * 1.5)), 0.18 + dunkel * 0.66);
    if (dunkel < 0.3) return;
    const sicht = (x, y, r) => x > v.x - r && x < v.right + r && y > v.y - r && y < v.bottom + r;
    const P = this.weichPinsel;
    for (const f of raum.state.feuer?.values() ?? []) if (sicht(f.x, f.y, 300)) { P.setScale(f.r / 60 + 0.6).setAlpha(Math.min(1, 0.6 + f.staerke * 0.4) * (0.85 + Math.random() * 0.15)); rt.erase(P, f.x - ox, f.y - oy); }
    for (const l of this.laternenListe ?? []) if (sicht(l.x, l.y, 140)) { P.setScale(0.85).setAlpha(0.75 * dunkel); rt.erase(P, l.x + l.nx * 13 - ox, l.y + l.ny * 13 - oy); }
    for (const h of this.welt.haeuser) {
      if (!fensterLicht(h.nr)) continue;
      const x = (h.x + h.b / 2) * KACHEL, y = (h.y + h.h / 2) * KACHEL;
      if (sicht(x, y, 120)) { P.setScale(0.6).setAlpha(0.5 * dunkel); rt.erase(P, x - ox, y - oy); }
    }
    for (const [id, p] of raum.state.spieler) {
      if ((p.ebene ?? '') !== '' || id === meineId) continue;
      if (sicht(p.x, p.y, 100)) { P.setScale(p.lampe > 0 ? 0.7 : 0.45).setAlpha(0.7); rt.erase(P, p.x - ox, p.y - oy); }
    }
    const lx = this.lokal.x - ox, ly = this.lokal.y - oy;
    P.setScale(0.6).setAlpha(0.8); rt.erase(P, lx, ly);
    if (ich.lampe > 0) { this.lampenPinsel.setRotation(this.lampenRichtung(ich)).setScale(1.0).setAlpha(1); rt.erase(this.lampenPinsel, lx, ly); }
  }

  // Von der eigenen Position aus alles erkunden, was ohne geschlossene Tür erreichbar ist; einmal gesehen bleibt sichtbar
  nebelAktualisieren(a) {
    const w = a.w, tx = Math.floor(this.lokal.x / KACHEL), ty = Math.floor(this.lokal.y / KACHEL);
    const start = ty * BREITE + tx;
    if (a.bekannt.has(start) && a.nebelStand === a.stand) return;
    a.nebelStand = a.stand;
    const drin = (x, y) => x >= w.ox && x < w.ox + w.b && y >= w.oy && y < w.oy + w.h;
    const sperre = t => t === T.WAND || t === T.INNENTUER || t === T.LEER;
    const offen = [[tx, ty]], gesehen = new Set([start]);
    while (offen.length) {
      const [x, y] = offen.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = ny * BREITE + nx;
        if (!drin(nx, ny) || gesehen.has(k)) continue;
        gesehen.add(k);
        a.bekannt.add(k);                                       // Wände und Türen am Rand sind auch zu sehen
        if (!sperre(w.hole(nx, ny)) && (dx === 0 || dy === 0)) offen.push([nx, ny]);
        else gesehen.delete(k);                                 // schräg/gesperrt: sichtbar, aber nicht weiter suchen
      }
    }
    a.bekannt.add(start);
    const g = a.nebel.clear().fillStyle(0x000000, 1);
    for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++)
      if (!a.bekannt.has(y * BREITE + x)) g.fillRect(x * KACHEL - 0.5, y * KACHEL - 0.5, KACHEL + 1, KACHEL + 1);
  }

  // drinnen ohne Licht: alles schwarz-weiß (Farbmatrix der Kamera, nur mit WebGL)
  setzeGrau(an) {
    if (this.grauAn === an) return;
    this.grauAn = an;
    const fx = this.cameras.main.postFX;
    if (!fx) return;
    if (!this.grau) this.grau = fx.addColorMatrix();
    if (an) this.grau.grayscale(1); else this.grau.reset();
  }

  // sichtbar = gleiche Ebene; drinnen zusätzlich nur bei freier Sicht (Türen verdecken)
  sichtbar(o) {
    const e = o.ebene ?? '';
    if (e !== this.aktEbene) return false;
    if (!e || !this.lokal) return true;
    return sichtfrei(this.wv(e), this.lokal.x, this.lokal.y, o.x, o.y);
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
      f.box.setVisible((p.ebene ?? '') === this.aktEbene);
      if ((f.ebene ?? '') !== (p.ebene ?? '')) { f.x = p.x; f.y = p.y; f.ebene = p.ebene; }
      f.x += (p.x - f.x) * glatt; f.y += (p.y - f.y) * glatt;
      f.box.setPosition(f.x, f.y);
      f.bild.setAlpha(p.verbunden ? 1 : 0.5);
      this.figurDarstellen(f, p, dt);
    }
    for (const [id, f] of this.figuren) if (!s.spieler.has(id)) { f.box.destroy(); this.figuren.delete(id); }
    // Zombies
    this.kegel.clear();
    const cam = this.cameras.main.worldView;
    for (const [id, z] of s.zombies) {
      let f = this.zombies.get(id);
      if (!f) { f = this.neuerZombie(z); this.zombies.set(id, f); }
      const vx = f.x, vy = f.y;
      f.x += (z.x - f.x) * glatt; f.y += (z.y - f.y) * glatt;
      f.r = Phaser.Math.Angle.RotateTo(f.r, z.richtung, dt * 6);
      f.box.setPosition(f.x, f.y).setRotation(f.r);
      const zeigen = this.sichtbar(z);
      f.box.setVisible(zeigen);
      const bildNr = laufBild(f, f.x - vx, f.y - vy, dt, z.kriecht ? 18 : 30);
      const typ = ZOMBIE_TYPEN[(z.variante ?? 0) % ZOMBIE_TYPEN.length];
      const neu = !z.kriecht && (typ === 'z6' || typ === 'z7');
      const tex = neu ? 'figuren2' : 'figuren';
      if (f.bild.texture.key !== tex) f.bild.setTexture(tex, 0);
      if (z.kriecht) {
        f.bild.setFrame(this.figurBild('kriecher_' + 'abcd'[(z.variante ?? 0) % 4], bildNr < 0 ? 0 : Math.floor((f.lauf ?? 0) / 16)));
        f.bild.setRotation(0).setScale(ZOMBIE_GROESSE);
      } else if (neu) {
        // flüssig animierte Zombies (Riley Gombart): Laufen, Angriff, Stehen
        let nah = false;
        if (z.jagt) for (const p of s.spieler.values()) if ((p.ebene ?? '') === (z.ebene ?? '') && Math.hypot(p.x - z.x, p.y - z.y) < W.spielerRadius + W.zombieRadius + 16) { nah = true; break; }
        const art = nah ? 'angriff' : bildNr < 0 ? 'stehen' : 'laufen';
        const i = art === 'laufen' ? Math.floor((f.lauf ?? 0) / 6) : Math.floor(this.time.now / (art === 'angriff' ? 70 : 140));
        f.bild.setFrame(this.figurBild2(`${typ}_${art}`, i)).setRotation(0).setScale(BOGEN2_GROESSE * (typ === 'z6' ? 1.05 : 1));
      } else {
        // Angriff: beim Zubeißen das Bild mit offenem Mund (wo vorhanden)
        let nah = false;
        if (z.jagt) for (const p of s.spieler.values()) if ((p.ebene ?? '') === (z.ebene ?? '') && Math.hypot(p.x - z.x, p.y - z.y) < W.spielerRadius + W.zombieRadius + 16) { nah = true; break; }
        const angriff = nah && this.figurListe['zombie_' + typ + '_angriff'];
        f.bild.setFrame(angriff ? angriff[0] : this.figurBild('zombie_' + typ, bildNr < 0 ? 0 : Math.floor((f.lauf ?? 0) / 11)));
        // schlurfen: leicht wanken
        f.bild.setRotation(bildNr < 0 ? 0 : Math.sin((f.lauf ?? 0) / 9) * 0.07).setScale(ZOMBIE_GROESSE * (angriff ? 1.06 : 1));
      }
      f.bild.setTint(z.jagt ? 0xffd2c8 : 0xffffff);
      if (s.kegel && zeigen && !this.aktEbene && (cam.contains(f.x, f.y) || Phaser.Math.Distance.Between(f.x, f.y, cam.centerX, cam.centerY) < cam.width)) {
        if (z.kriecht) {
          // Kriecher sehen nicht, sie spüren ringsum
          this.kegel.lineStyle(1, 0xff8a65, 0.35).strokeCircle(f.x, f.y, 110);
        } else {
          this.kegel.fillStyle(z.jagt ? 0xff5252 : 0xfff59d, z.jagt ? 0.18 : 0.13);
          this.kegel.slice(f.x, f.y, W.sichtWeite, f.r - W.sichtWinkel / 2, f.r + W.sichtWinkel / 2, false).fillPath();
        }
      }
    }
    for (const [id, f] of this.zombies) if (!s.zombies.has(id)) { f.box.destroy(); this.zombies.delete(id); }
    // Leichen: liegen flach, leere sind blasser, die letzten 20 s blenden sie aus
    for (const [id, l] of s.leichen) {
      let o = this.leichen.get(id);
      if (!o) {
        // passend zum Zombietyp; Dirndl, Feuerwehr und Lederhose gibt es in zwei Fassungen
        const typ = ZOMBIE_TYPEN[(l.variante ?? 0) % ZOMBIE_TYPEN.length], zweite = this.figurListe['leiche_' + typ + '2'] && (Math.round(l.x) + Math.round(l.y)) % 2;
        if (typ === 'z7') { const fol = (Math.round(l.x) % 2) ? 'z7_sterben2' : 'z7_sterben'; o = this.add.image(l.x, l.y, 'figuren2', this.figurBild2(fol, -1)).setScale(BOGEN2_GROESSE).setDepth(1.6).setRotation(l.richtung); }
        else o = this.add.image(l.x, l.y, 'figuren', this.figurBild('leiche_' + (typ === 'z6' ? 'hemd' : typ) + (zweite ? '2' : ''))).setScale(ZOMBIE_GROESSE).setDepth(1.6).setRotation(l.richtung);
        this.leichen.set(id, o);
      }
      o.setVisible((l.ebene ?? '') === this.aktEbene);
      const ausblenden = Math.min(1, (LEICHE_DAUER - l.alter) / 20);
      o.setAlpha((l.rest === 0 ? 0.5 : 1) * Math.max(0, ausblenden));
    }
    for (const [id, o] of this.leichen) if (!s.leichen.has(id)) { o.destroy(); this.leichen.delete(id); }
    // Bewohner: gehen umher, fliehen, verschwinden in Häusern und im Bus; Gebissene werden grünlich
    for (const [id, m] of s.menschen ?? []) {
      let o = this.menschenObj.get(id);
      if (!o) {
        // Bürger (KonitaTutorials) mit Laufanimation, Sorte nach Kennung
        const sorte = 'buerger' + (1 + (id.charCodeAt(id.length - 1) % 3));
        const bild = this.add.image(0, 0, 'figuren2', this.figurBild2(sorte)).setScale(BOGEN2_GROESSE * 0.95);
        o = { box: this.add.container(m.x, m.y, [bild]).setDepth(3.5), bild, sorte, x: m.x, y: m.y, r: m.richtung };
        this.menschenObj.set(id, o);
      }
      const vx = o.x, vy = o.y;
      o.x += (m.x - o.x) * glatt; o.y += (m.y - o.y) * glatt;
      if (Math.hypot(m.x - o.x, m.y - o.y) > 200) { o.x = m.x; o.y = m.y; }   // aus Haus oder Bus aufgetaucht
      o.r = Phaser.Math.Angle.RotateTo(o.r, m.richtung, dt * 8);
      const weg = Math.hypot(o.x - vx, o.y - vy);
      o.lauf = (o.lauf ?? 0) + weg;
      o.box.setPosition(o.x, o.y).setRotation(o.r);
      o.bild.setFrame(this.figurBild2(o.sorte, weg > 0.2 ? Math.floor(o.lauf / 7) : 0));
      o.box.setVisible(m.sichtbar && this.aktEbene === '');
      o.bild.setTint(m.infiziert ? 0xb5d99c : 0xffffff);
    }
    for (const [id, o] of this.menschenObj) if (!s.menschen?.has(id)) { o.box.destroy(); this.menschenObj.delete(id); }
    // Fahrzeuge: Linienbus, Verkehr, Polizei und Feuerwehr (mit Blaulicht), Wracks
    const blink = Math.floor(this.time.now / 180) % 2;
    for (const [id, f] of s.fahrzeuge ?? []) {
      let o = this.busObj.get(id);
      const key = this.fahrzeugTextur(f.art, f.farbe);
      if (!o) {
        const bild = this.add.image(0, 0, key);
        const licht = this.add.graphics();
        o = { box: this.add.container(f.x, f.y, [bild, licht]).setDepth(4.6), bild, licht, x: f.x, y: f.y, r: f.richtung };
        this.busObj.set(id, o);
      }
      if (o.bild.texture.key !== key) o.bild.setTexture(key);
      o.x += (f.x - o.x) * glatt; o.y += (f.y - o.y) * glatt;
      o.r = Phaser.Math.Angle.RotateTo(o.r, f.richtung, dt * 6);
      o.box.setPosition(o.x, o.y).setRotation(o.r).setVisible(this.aktEbene === '');
      o.licht.clear();
      // dicht vorbeifahrende Autos und Busse rauschen vorbei; jedes dritte Auto hat das Radio an
      if ((f.art === 'auto' || f.art === 'bus') && this.lokal && !this.aktEbene) {
        const d = Math.hypot(o.x - this.lokal.x, o.y - this.lokal.y);
        if (d < 170 && o.vorher !== undefined && d > o.vorher && !o.vorbei && !f.haelt) { ton.ereignis('autoVorbei', o.x, o.y); o.vorbei = true; }
        if (d > 400) o.vorbei = false;
        if (f.art === 'auto' && (id.charCodeAt(id.length - 1) % 3 === 0)) {
          if (!o.radio) o.radio = ton.schleifeStarten('autoradio');
          if (o.radio) ton.sireneLage(o.radio, o.x, o.y, o.vorher === undefined ? 0 : (o.vorher - d) / Math.max(dt, 0.001));
        }
        o.vorher = d;
      }
      if (f.art === 'polizei' || f.art === 'feuerwehr') {
        // Dauersirene: blendet mit der Entfernung ein und aus, Tonhöhe nach Annäherung (Doppler)
        if (!o.sirene) o.sirene = ton.sireneStarten();
        if (o.sirene && this.lokal) {
          const d = Math.hypot(o.x - this.lokal.x, o.y - this.lokal.y);
          const naeher = o.letzterAbstand === undefined ? 0 : (o.letzterAbstand - d) / Math.max(dt, 0.001);
          o.letzterAbstand = d;
          ton.sireneLage(o.sirene, o.x, o.y, this.aktEbene ? naeher * 0.5 : naeher);
        }
        const vx = f.art === 'feuerwehr' ? 16 : 2;
        o.licht.fillStyle(blink ? 0x2962ff : 0x82b1ff, 1).fillCircle(vx, -5, 3.5);
        o.licht.fillStyle(blink ? 0x82b1ff : 0x2962ff, 1).fillCircle(vx, 5, 3.5);
        o.licht.fillStyle(0x448aff, 0.18).fillCircle(vx, 0, blink ? 26 : 18);
      }
    }
    for (const [id, o] of this.busObj) if (!s.fahrzeuge?.has(id) || s.fahrzeuge.get(id).art === 'wrack') {
      ton.sireneStoppen(o.sirene); ton.sireneStoppen(o.radio); o.sirene = o.radio = null;
      if (!s.fahrzeuge?.has(id)) { o.box.destroy(); this.busObj.delete(id); }
    }
    this.feuerDarstellen(s);
    this.spurenDarstellen(s);
    // liegende Gegenstände
    for (const [id, b] of s.boden) {
      let o = this.bodenObj.get(id);
      if (!o) {
        o = this.add.container(b.x, b.y).setDepth(1.7);
        o.add([this.add.ellipse(0, 6, 18, 6, 0x000000, 0.3), this.add.text(0, 0, DINGE[b.ding]?.zeichen ?? '?', { fontSize: '16px' }).setOrigin(0.5)]);
        this.tweens.add({ targets: o, y: b.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.bodenObj.set(id, o);
      }
      o.setVisible((b.ebene ?? '') === this.aktEbene);
      o.setAlpha(Math.max(0.2, Math.min(1, (BODEN_DAUER - b.alter) / 20)));
    }
    for (const [id, o] of this.bodenObj) if (!s.boden.has(id)) { o.destroy(); this.bodenObj.delete(id); }
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

  figurDarstellen(f, p, dt = 0.016) {
    f.box.setRotation(0);
    const zombie = p.zombie > 0;
    const weg = Math.hypot(f.x - f.altX, f.y - f.altY);
    f.altX = f.x; f.altY = f.y;
    f.lauf = (f.lauf ?? 0) + weg;
    const geht = weg / Math.max(dt, 0.001) > 12;
    // Haltung nach Ausrüstung: Pistole, Nahkampf/Lampe in der Hand, sonst ohne
    let textur, bild = 0;
    const survivor = !p.unten && !zombie && String(p.aussehen ?? '').startsWith('s');
    if (p.unten) textur = 'liegend-' + f.n;
    else if (zombie) { textur = 'figuren'; bild = this.figurBild('zombie_hemd', geht ? Math.floor(f.lauf / 11) : 0); }
    else if (survivor) {
      // Survivor (Riley Gombart): Haltung je Waffe; Schießen, Zuschlagen, Gehen, Stehen
      const w = SV_WAFFE[aktiveWaffe(p)[0]] ?? 'lampe', jetzt = this.time.now;
      let art = 'idle', i = Math.floor(jetzt / 110);
      if (f.schussBis > jetzt && this.figurListe2[`sv_${w}_shoot`]) { art = 'shoot'; i = Math.floor((150 - (f.schussBis - jetzt)) / 50); }
      else if (f.schlagBis > jetzt) { art = 'meleeattack'; i = Math.floor((400 - (f.schlagBis - jetzt)) / 50); }
      else if (geht) { art = 'move'; i = Math.floor(f.lauf / 8); }
      textur = 'figuren2'; bild = this.figurBild2(`sv_${w}_${art}`, i);
      const fb = geht ? this.figurBild2('sv_fuesse_walk', Math.floor(f.lauf / 6)) : this.figurBild2('sv_fuesse_idle');
      if (f.fuesse.frame.name != fb) f.fuesse.setFrame(fb);   // eslint-disable-line eqeqeq
      f.fuesse.setRotation(p.richtung).setScale(BOGEN2_GROESSE * (p.schleicht ? 0.92 : 1));
    }
    else {
      textur = this.menschTextur(p.aussehen);
      bild = aktiveWaffe(p)[1].bild;
    }
    f.fuesse.setVisible(survivor);
    if (f.bild.texture.key !== textur || f.bild.frame.name != bild) f.bild.setTexture(textur, bild);   // eslint-disable-line eqeqeq
    // beim Gehen leicht wippen
    const wipp = geht ? Math.sin(f.lauf / 7) : 0;
    f.bild.setRotation(p.unten ? 0 : p.richtung + wipp * 0.07);
    const s0 = p.unten ? 1 : zombie ? ZOMBIE_GROESSE : survivor ? BOGEN2_GROESSE : MENSCH_GROESSE;
    f.bild.setScale(s0 * (p.schleicht && !p.unten ? 0.92 : 1) * (1 + Math.abs(wipp) * 0.03));
    f.hp.width = 24 * Math.max(0, p.hp) / 100;
    f.hp.setFillStyle(p.hp > 50 ? 0x66bb6a : p.hp > 25 ? 0xffca28 : 0xe53935);
    const tun = zombie ? '🧟' : p.aktion === 'klettern' ? '🧗' : p.aktion === 'durchsuchen' ? '🔍' : p.aktion === 'barrikade' ? '🔨' : p.infektion > 0 ? '🦠' : '';
    if (f.tun.text !== tun) f.tun.setText(tun);
  }

  // ---------- eigene Figur mit Vorhersage ----------
  eigeneFigur(dt) {
    const p = raum.state.spieler.get(meineId);
    if (!p) return null;
    const f = this.figuren.get(meineId);
    if (!f) return p;
    if (!this.lokal) { this.lokal = { x: p.x, y: p.y }; this.cameras.main.startFollow(f.box, true, 0.15, 0.15); }
    if (this.sprung) {
      const sp = this.sprung;
      sp.t = Math.min(1, sp.t + dt / 0.32);
      const k = sp.t * sp.t * (3 - 2 * sp.t);
      this.lokal.x = sp.vx + (sp.nx - sp.vx) * k; this.lokal.y = sp.vy + (sp.ny - sp.vy) * k;
      f.x = this.lokal.x; f.y = this.lokal.y;
      f.box.setPosition(f.x, f.y).setScale(1 + Math.sin(sp.t * Math.PI) * 0.18);   // kleiner Hüpfer
      if (sp.t >= 1) { this.sprung = null; f.box.setScale(1); }
      this.figurDarstellen(f, p, dt);
      return p;
    }
    const e = this.eingabe;
    const l = Math.hypot(e.dx, e.dy);
    if (!p.unten && raum.state.phase === 'spiel' && l > 0.05) {
      const schleicht = !(p.zombie > 0) && (e.s || l < 0.55);
      const tempo = p.zombie > 0 ? W.zombieTempoJagen * 1.15
        : (schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1);
      const weg = (p.zombie > 0 ? Math.min(1, l) : Math.min(1, l / (schleicht ? 0.55 : 1))) * tempo * dt;
      bewege(this.wv(p.ebene), this.lokal, e.dx / l * weg, e.dy / l * weg, W.spielerRadius);
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
    this.figurDarstellen(f, p, dt);
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
  tuerKontext(ich, nurSchliessen) {
    if (!ich.ebene || !this.lokal) return null;
    const w = this.wv(ich.ebene);
    let best = null, bd = 42;
    for (const t of w.tueren) {
      const d = Math.hypot((t.x + 0.5) * KACHEL - this.lokal.x, (t.y + 0.5) * KACHEL - this.lokal.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return null;
    const st = raum.state.tueren.get(`${ich.ebene}:${best.x},${best.y}`);
    if (!st) return null;
    if (st.offen) return nurSchliessen ? { art: 'tuer_zu', text: '🚪 Tür schließen' } : null;
    if (nurSchliessen) return null;
    if (!st.verschlossen) return { art: 'tuer_auf', text: '🚪 Tür öffnen' };
    if (ich.rucksack.includes('schluessel')) return { art: 'aufschliessen', text: '🔑 Aufschließen' };
    if (ich.rucksack.includes('brechstange')) return { art: 'aufbrechen', text: '⚒️ Aufbrechen (laut!)' };
    return { art: 'schlossraetsel', text: '🔐 Schloss knacken (Rätsel)' };
  }

  bestimmeKontext(ich) {
    if (!ich || ich.unten || ich.aktion || raum.state.phase !== 'spiel' || !this.lokal) return null;
    const { x, y } = this.lokal;
    const w = this.wv(ich.ebene);
    const safe = ich.ebene ? null : safeRoomAn(this.welt, x, y);
    const tuer = this.tuerKontext(ich, false);
    if (tuer) return tuer;
    if (safe) {
      const tx = (safe.haus.tuer.x + 0.5) * KACHEL, ty = (safe.haus.tuer.y + 0.5) * KACHEL;
      const bar = raum.state.safes.get(safe.id)?.barrikade ?? 0;
      if (Math.hypot(x - tx, y - ty) < 56) {
        const imWeg = [...raum.state.leichen.values()].some(l => Math.hypot(l.x - tx, l.y - ty) < 30);
        if (imWeg) return { art: 'wegziehen', text: '🧟 Toten Zombie aus der Tür ziehen' };
        if (ich.rucksack.includes('bretter') && bar < 100) return { art: 'barrikade', text: '🔨 Verbarrikadieren' };
      }
      if (Math.hypot(x - safe.kiste.x, y - safe.kiste.y) < AKTION_ABSTAND + 20) {
        return { art: 'kiste', text: '📦 Vorräte', safe };
      }
    }
    if (ich.rucksack.length < ich.plaetze) {
      for (const b of raum.state.boden.values()) {
        if ((b.ebene ?? '') !== (ich.ebene ?? '')) continue;
        if (Math.hypot(b.x - x, b.y - y) < AKTION_ABSTAND) return { art: 'aufheben', text: `✋ ${DINGE[b.ding]?.zeichen ?? ''} aufheben` };
      }
    }
    const tor = this.welt.tor;
    if (!ich.ebene && (raum.state.torGeloest ?? 0) < 3 && Math.hypot(x - (tor.x + 1) * KACHEL, y - (tor.y + 1) * KACHEL) < 70) {
      return { art: 'raetsel', text: `🔐 Schloss knacken (${raum.state.torGeloest ?? 0}/3)` };
    }
    let best = null, bd = AKTION_ABSTAND;
    for (const b of w.behaelter) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d >= bd) continue;
      if (raum.state.behaelter.get(b.id)?.rest === 0) continue;
      if (!ich.ebene && !sichtfrei(w, x, y, b.x, b.y)) continue;
      bd = d; best = b;
    }
    for (const l of raum.state.leichen.values()) {
      if ((l.ebene ?? '') !== (ich.ebene ?? '')) continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bd && l.rest !== 0) { bd = d; best = { art: 'leiche' }; }
    }
    if (best?.art === 'auto' && !ich.rucksack.includes('brechstange')) return { art: 'durchsuchen', text: '🔒 Kofferraum (⚒️ Brechstange nötig)' };
    if (best) return { art: 'durchsuchen', text: `${best.art === 'auto' ? '⚒️' : '🔍'} ${BEHAELTER_NAME[best.art]} ${best.art === 'auto' ? 'aufbrechen' : 'durchsuchen'}` };
    const zu = this.tuerKontext(ich, true);
    if (zu) return zu;
    if (!ich.ebene) {
      const z = zaunUeberstieg(this.welt, x, y, ich.richtung, W.spielerRadius);
      if (z) return { art: 'klettern', text: `🧗 Über ${ZAUN_NAME[z.art] ?? 'den Zaun'} steigen` };
    }
    // jemanden berühren → tauschen
    if (!tauschOffen) {
      for (const [sid, o] of raum.state.spieler) {
        if (sid === meineId || o.unten || o.zombie > 0 || o.ebene !== ich.ebene) continue;
        if (Math.hypot(o.x - x, o.y - y) < TAUSCH_ABSTAND + 6) return { art: 'tausch', mit: sid, text: `🤝 Tauschen mit ${o.name}` };
      }
    }
    return null;
  }

  aktion() {
    const k = this.kontext;
    if (!k) return;
    if (k.art === 'kiste') kisteAuf(k.safe);
    else if (k.art === 'tausch') raum.send('tausch_start', { mit: k.mit });
    else raum.send('aktion');
    if (k.art === 'raetsel') $('aktion').style.display = 'none';
  }

  // ---------- Effekte ----------
  // Schuss: Mündungsblitz und ein kurzer, angedeuteter Feuerstrahl Richtung Ziel (kein durchgehender Strich)
  schuss(m) {
    const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), c = Math.cos(w), sn = Math.sin(w);
    const schrot = m.art === 'schrotflinte', gewehr = m.art === 'gewehr';
    const vorn = 16, lang = gewehr ? 38 : schrot ? 22 : 26;
    const g = this.add.graphics().setDepth(7);
    // Feuerzunge: breit und gelb an der Mündung, schmal und rot nach vorn auslaufend
    g.fillStyle(0xffe082, 0.95);
    g.fillTriangle(m.x1 + c * vorn - sn * 3.5, m.y1 + sn * vorn + c * 3.5, m.x1 + c * vorn + sn * 3.5, m.y1 + sn * vorn - c * 3.5, m.x1 + c * (vorn + lang), m.y1 + sn * (vorn + lang));
    g.fillStyle(0xff7043, 0.8);
    g.fillTriangle(m.x1 + c * (vorn + 4) - sn * 2, m.y1 + sn * (vorn + 4) + c * 2, m.x1 + c * (vorn + 4) + sn * 2, m.y1 + sn * (vorn + 4) - c * 2, m.x1 + c * (vorn + lang * 0.7), m.y1 + sn * (vorn + lang * 0.7));
    this.tweens.add({ targets: g, alpha: 0, duration: schrot ? 90 : 110, onComplete: () => g.destroy() });
    // Mündungsblitz (Survivor-Paket), additiv: das Schwarz im Bild verschwindet
    const blitz = this.add.image(m.x1 + c * (vorn - 4), m.y1 + sn * (vorn - 4), 'figuren2', this.figurBild2('muendungsblitz')).setOrigin(0.5)
      .setBlendMode('ADD').setRotation(w).setScale(gewehr ? 0.42 : schrot ? 0.38 : 0.3).setDepth(7);
    this.tweens.add({ targets: blitz, alpha: 0, duration: 90, onComplete: () => blitz.destroy() });
  }

  stoss(m) {
    const g = this.add.graphics().setDepth(7);
    if (m.sense) { g.lineStyle(4, 0xe0e0e0, 0.9).beginPath().arc(m.x, m.y, 52, m.w - 1.4, m.w + 1.4).strokePath(); g.lineStyle(2, 0x8d6e63, 0.9).beginPath().arc(m.x, m.y, 40, m.w - 1.2, m.w + 1.2).strokePath(); }
    else if (m.messer) g.lineStyle(2, 0xeceff1, 0.95).beginPath().arc(m.x, m.y, 24, m.w - 0.5, m.w + 0.5).strokePath();
    else g.lineStyle(m.schlag ? 5 : 3, m.schlag ? 0xd7ccc8 : 0xffffff, 0.85).beginPath().arc(m.x, m.y, m.schlag ? 34 : 26, m.w - 0.8, m.w + 0.8).strokePath();
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
    const meine = raum.state.spieler.get(meineId);
    if (meine && (meine.ebene ?? '') !== this.aktEbene) {
      this.wechsleAnsicht(meine.ebene ?? '');
      this.lokal = { x: meine.x, y: meine.y };
      const f = this.figuren.get(meineId); if (f) { f.x = f.altX = meine.x; f.y = f.altY = meine.y; f.box.setPosition(meine.x, meine.y); }
      this.cameras.main.centerOn(meine.x, meine.y);   // sofort dort, nicht von der alten Stelle herüberziehen
    }
    const ich = this.eigeneFigur(dt);
    this.innenAktualisieren(ich);
    if (ich) this.aussenLicht(ich);
    this.chunksAktualisieren();
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
    this.geraeusche(ich, dt);
    this.karteZeit = (this.karteZeit ?? 0) - dt;
    if (this.karteZeit <= 0 || this.uebersicht?.zeichneNeu) { this.karteZeit = this.uebersicht?.gross ? 0.15 : 0.4; this.uebersichtZeichnen(); }
  }

  // Schritte, Treffer am eigenen Leib, Stöhnen naher Zombies
  geraeusche(ich, dt) {
    if (!ich || !this.lokal) return;
    ton.hoerer(this.lokal.x, this.lokal.y);
    const l = this.letzterOrt ?? this.lokal;
    this.schrittWeg = (this.schrittWeg ?? 0) + Math.hypot(this.lokal.x - l.x, this.lokal.y - l.y);
    this.letzterOrt = { x: this.lokal.x, y: this.lokal.y };
    if (this.schrittWeg > 46) { this.schrittWeg = 0; ton.schritt(!!this.aktEbene); }
    if (this.altHp != null && ich.hp < this.altHp - 2) ton.biss();
    this.altHp = ich.hp;
    // Brände in der Nähe knistern
    this.knisterZeit = (this.knisterZeit ?? 0) - dt;
    if (this.knisterZeit <= 0) {
      this.knisterZeit = 0.3;
      let rauschen = 0;
      for (const f of raum.state.feuer?.values() ?? []) {
        const d = Math.hypot(f.x - this.lokal.x, f.y - this.lokal.y) - f.r;
        if (this.aktEbene || d > 800) continue;
        rauschen += f.staerke * (f.r / 50) * Math.max(0, 1 - d / 800) ** 2;
        if (Math.random() < 0.8) ton.knistern(f.x, f.y, f.staerke);
      }
      ton.brandRauschen(rauschen * (this.aktEbene ? 0.3 : 1));
    }
    this.stoehnZeit = (this.stoehnZeit ?? 2) - dt;
    if (this.stoehnZeit <= 0) {
      this.stoehnZeit = 1.5 + Math.random() * 3;
      const nahe = [...raum.state.zombies.values()].filter(z => (z.ebene ?? "") === this.aktEbene && Math.hypot(z.x - this.lokal.x, z.y - this.lokal.y) < 700);
      if (nahe.length) { const z = nahe[Math.floor(Math.random() * nahe.length)]; ton.stoehnen(z.x, z.y, z.kriecht ? 0.35 : 0.55, z.kriecht); }
    }
  }

  hud(ich) {
    const s = raum.state;
    if (ich) {
      balkenSetzen('hp', ich.hp);
      balkenSetzen('durst', ich.durst);
      balkenSetzen('hunger', ich.hunger);
      const wf = WAFFEN[ich.waffe], d = DINGE[ich.waffe];
      const waffe = !wf ? `✊ Unbewaffnet – stoßen${ich.munition ? ` · 🧰 ${ich.munition} Schuss` : ''}`
        : wf.fern ? (ich.munition > 0 ? `${d.zeichen} ${d.name} · ${ich.munition} Schuss` : `${d.zeichen} ${d.name} – keine Munition, stoßen`)
        : `${d.zeichen} ${d.name}${ich.munition ? ` · 🧰 ${ich.munition} Schuss` : ''}`;
      textSetzen('waffe', waffe + (ich.kleidung > 0 ? ` · 🧥 ${Math.ceil(ich.kleidung)} %` : '')
        + (ich.lampe > 0 ? ` · 🔦 ${Math.ceil(ich.lampe / 60)} min${ich.ebene ? ' an' : ''}` : ''));
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
    const uhr = s.uhr ?? 480, hellJetzt = helligkeit(uhr);
    textSetzen('zeit', `${istNacht(uhr) ? '🌙' : hellJetzt < 1 ? '🌅' : '☀️'} ${uhrText(uhr)}`);
    ton.tageszeit(istNacht(uhr));
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
    tauschRucksack();

    let hinweis = '';
    if (s.phase === 'erwischt') hinweis = 'Erwischt! 🧟<br>Ihr schleppt euch in die Safe Rooms …';
    else if (ich && ich.zombie > 0) hinweis = `🧟 Du bist ein Zombie! Beiß die anderen.<br>Noch ${zeitText(ich.zombie)}, dann wachst du im Safe Room auf.`;
    else if (ich && ich.unten) hinweis = `Du liegst am Boden.<br>Ein Mitspieler muss dir aufhelfen.${balken(ich.hilfe)}`;
    else if (ich && ich.aktion) hinweis = `${{ barrikade: '🔨 Verbarrikadieren', wegziehen: '🧟 Wegziehen', aufheben: '✋ Aufheben', aufbrechen: '⚒️ Aufbrechen', aufschliessen: '🔑 Aufschließen', tuer_auf: '🚪 Öffnen', tuer_zu: '🚪 Schließen' }[ich.aktion] ?? '🔍 Durchsuchen'} … nicht bewegen${balken(ich.fortschritt)}`;
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
    const schluessel = ich.plaetze + ':' + [...ich.rucksack].join(',');
    if (schluessel === this.rucksackSchluessel) return;
    this.rucksackSchluessel = schluessel;
    const leiste = $('rucksack');
    leiste.innerHTML = '';
    for (let i = 0; i < (ich.plaetze || RUCKSACK_PLAETZE); i++) {
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
  fuellen($('kisterucksack'), ich.rucksack, ich.plaetze || RUCKSACK_PLAETZE, 'rein', 'Rucksack');
}

// ---------- Tauschen ----------
let tauschOffen = null;
function zeigeTausch(m) {
  tauschOffen = m;
  $('tausch').style.display = 'block';
  $('tauschtitel').textContent = `🤝 Tausch mit ${m.partner}`;
  const liste = (el, dinge, wenn) => {
    el.innerHTML = '';
    if (!dinge.length) { el.innerHTML = '<span class="leer">nichts</span>'; return; }
    dinge.forEach((d, i) => {
      const b = document.createElement('button'); b.className = 'ding'; b.textContent = dingText(d);
      if (wenn) b.onclick = () => wenn(i); else b.disabled = true;
      el.appendChild(b);
    });
  };
  liste($('tauschgeben'), m.meins, i => raum.send('tausch_zurueck', { index: i }));
  liste($('tauschbekommen'), m.seins, null);
  $('tauschstatus').textContent = (m.meinOk ? '✔ Du bist einverstanden' : '') + (m.seinOk ? (m.meinOk ? ' · ' : '') + `✔ ${m.partner} ist einverstanden` : '');
  $('tauschok').disabled = m.meinOk;
  tauschRucksack();
}
function tauschRucksack() {
  if (!tauschOffen) return;
  const ich = raum.state.spieler.get(meineId);
  const el = $('tauschrucksack');
  const schluessel = [...(ich?.rucksack ?? [])].join(',');
  if (el.dataset.k === schluessel) return;
  el.dataset.k = schluessel; el.innerHTML = '';
  [...(ich?.rucksack ?? [])].forEach((d, i) => {
    const b = document.createElement('button'); b.className = 'ding'; b.textContent = dingText(d);
    b.onclick = () => raum.send('tausch_anbieten', { platz: i });
    el.appendChild(b);
  });
}
function tauschZu() { tauschOffen = null; $('tausch').style.display = 'none'; $('tauschrucksack').dataset.k = ''; }

// ---------- Rätsel am Tor ----------
let raetselId = null;
function zeigeRaetsel(m) {
  raetselId = m.id;
  $('raetseltitel').textContent = (m.tuer ? '🔐 Verschlossene Tür' : `🔐 Schloss ${m.geloest + 1} von ${m.noetig}`) + (m.thema ? ` · ${m.thema}` : '');
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
  if (m.richtig) ton.richtig(); else ton.falsch();
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
