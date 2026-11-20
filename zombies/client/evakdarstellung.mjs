// Darstellung der Evakuierungsarten (Phaser): Leopard 2A7 mit drehendem Turm und Lader-MG (Level 2), A400M mit drehenden Propellern
// und der Hubschrauber (Evakuierung per Flugzeug). Logik und Zahlen kommen vom Server (server/aufgaben.mjs, client/evak.mjs).
import { LEOPARD, A400M, evakArtFuer } from './evak.mjs';
import { fetzen } from './effekte.mjs';
import * as ton from './ton.mjs';

const TAU = Math.PI * 2;
const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function evakLaden(scene) {
  scene.load.image('leopard-wanne', 'grafik/leopard_wanne.webp');   // Draufsichten aus dem 3D-Modell (Bug rechts), siehe grafik/LIZENZ.txt
  scene.load.image('leopard-turm', 'grafik/leopard_turm.webp');
  scene.load.image('a400m-rumpf', 'grafik/a400m_rumpf.webp');
  scene.load.image('a400m-prop', 'grafik/a400m_prop.webp');
}

// Art der Evakuierung dieser Welt (Server: state.evakArt; ältere Stände: nach Karte)
export const evakArtVon = s => s.evakArt || evakArtFuer(s.karte);

// Bild des Evakuierungsfahrzeugs: Leopard-Wanne bzw. A400M-Rumpf statt des Busbildes (null = Standardbild)
export function evakFahrzeugBild(scene, s) {
  const art = evakArtVon(s);
  if (art === 'panzer' && scene.textures.exists('leopard-wanne')) return 'leopard-wanne';
  if (art === 'flugzeug' && scene.textures.exists('a400m-rumpf')) return 'a400m-rumpf';
  return null;
}

// Zusatzteile und Bewegung des Evakuierungsfahrzeugs (Container o: box, bild, licht; Rotation des Containers = Fahrzeugrichtung).
// Liefert true, wenn die Darstellung hier vollständig ist (Panzer/Flugzeug), false beim Bus (Rundumleuchte macht spiel.mjs).
export function evakFahrzeug(scene, o, f, s, dt, lokal, aktEbene) {
  const art = evakArtVon(s), jetzt = scene.time.now;
  const panzer = art === 'panzer' && scene.textures.exists('leopard-wanne'), flug = art === 'flugzeug' && scene.textures.exists('a400m-rumpf');
  // nicht mehr gebrauchte Teile (Art gewechselt) entfernen
  if (!panzer && o.turm) { o.turm.destroy(); o.turm = null; }
  if (!flug && o.props) { for (const p of o.props) p.destroy(); o.props = null; }
  if (!panzer && !flug) { o.bild.setScale(1); if (o.kette) { ton.sireneStoppen(o.kette); o.kette = null; } return false; }
  o.licht.clear();
  if (panzer) {
    o.bild.setScale(LEOPARD.skala);
    if (!o.turm) {
      o.turm = scene.add.image(LEOPARD.turmX, LEOPARD.turmY, 'leopard-turm').setOrigin(LEOPARD.turmOx, LEOPARD.turmOy).setScale(LEOPARD.skala);
      o.box.addAt(o.turm, 1); o.turmW = o.r;
    }
    // Turm dreht zum Ziel (zuletzt geschossen), danach zurück nach vorn
    const ziel = jetzt < (o.turmBis ?? 0) ? o.turmZiel : o.r;
    o.turmW += winkelDiff(o.turmW, ziel) * Math.min(1, dt * 6);
    o.turm.setRotation(o.turmW - o.r);
    // orangene Rundumleuchte hinten auf dem Wannendeck (Erkennungszeichen des Evakuierungsfahrzeugs)
    const an = Math.floor(jetzt / 260) % 2;
    o.licht.fillStyle(0xff9100, an ? 0.28 : 0.1).fillCircle(-46, 0, an ? 17 : 11);
    o.licht.fillStyle(an ? 0xffab00 : 0x8d4f00, 1).fillCircle(-46, 0, 3.5);
    o.licht.lineStyle(1.2, 0x000000, 0.8).strokeCircle(-46, 0, 3.5);
    // Kettenrasseln, solange er rollt (Ereignis „Panzer fährt“), draußen und in Hörweite
    const bewegt = o.letztPos !== undefined && Math.hypot(o.x - o.letztPos[0], o.y - o.letztPos[1]) > 0.05;
    o.letztPos = [o.x, o.y];
    o.faehrtT = bewegt ? 0.6 : Math.max(0, (o.faehrtT ?? 0) - dt);
    const hoerbar = lokal && !aktEbene && Math.hypot(o.x - lokal.x, o.y - lokal.y) < 700;
    if (hoerbar && o.faehrtT > 0 && !o.kette) o.kette = ton.schleifeStarten('panzerFaehrt');
    if (o.kette) ton.sireneLage(o.kette, o.x, o.y, 0, 700, !(hoerbar && o.faehrtT > 0));
    return true;
  }
  // A400M: Propeller einzeln, drehen sich (von oben gesehen schmal und breit im Wechsel); nach dem Triebwerksausfall steht alles still
  o.bild.setScale(A400M.skala);
  if (!o.props) {
    o.props = A400M.naben.map(([x, y]) => scene.add.image(x, y, 'a400m-prop').setScale(A400M.skala));
    for (const p of o.props) o.box.addAt(p, 2);
  }
  const defekt = ['heliAnflug', 'heli', 'abflug'].includes(s.evakPhase);
  o.spin = (o.spin ?? 0) + dt * (defekt ? 0 : 17);
  o.props.forEach((p, i) => {
    const ph = o.spin + i * 1.3, aus = defekt || (i === 2 && s.evakPhase === 'heliAnflug');
    p.setScale(A400M.skala, A400M.skala * (aus ? 1 : 0.35 + 0.65 * Math.abs(Math.cos(ph))));
    const [x, y] = A400M.naben[i], r = 34 * A400M.skala;
    if (!aus) o.licht.fillStyle(0xffffff, 0.16).fillEllipse(x, y, 7, r * 2);   // Drehscheibe (Unschärfe)
  });
  if (defekt) {
    // Triebwerk 3 (rechts innen) brennt und qualmt, der Rauch zieht (in Weltrichtung) nach oben
    const [x, y] = A400M.naben[2], c = Math.cos(o.r), sn = Math.sin(o.r);
    const flamme = 0.65 + 0.35 * Math.sin(jetzt / 70);
    for (let k = 0; k < 8; k++) {   // Rauch zuerst (unter der Flamme)
      const t = ((jetzt / 2200 + k / 8) % 1), wx = Math.sin(k * 5.1) * 12 + t * 30, wy = -t * 190;
      const lx = c * wx + sn * wy, ly = -sn * wx + c * wy;
      o.licht.fillStyle(0x2b2b2b, 0.75 * (1 - t)).fillCircle(x + 14 + lx, y + ly, 11 + t * 30);
    }
    o.licht.fillStyle(0xff3d00, 0.45 * flamme).fillCircle(x + 14, y, 34 * flamme);
    o.licht.fillStyle(0xff9100, 0.9).fillCircle(x + 14, y, 16 * flamme);
    o.licht.fillStyle(0xffee58, 1).fillCircle(x + 14, y, 8 * flamme);
    o.box.bringToTop(o.licht);
  }
  return true;
}

// Schuss des Lader-MGs: Turm zum Ziel drehen, Leuchtspur und Mündungsblitz am MG, Ton wie bei den MG-Nestern
export function leopardSchuss(scene, m, s) {
  const id = s ? [...(s.fahrzeuge?.entries() ?? [])].find(([, v]) => v.art === 'evakuierung')?.[0] : null;
  const o = id ? scene.busObj.get(id) : null;
  if (o) { o.turmZiel = m.tw; o.turmBis = scene.time.now + 2200; }
  const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), mx = m.x1 + Math.cos(w) * 4, my = m.y1 + Math.sin(w) * 4;
  const g = scene.add.graphics().setDepth(7), l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
  g.lineStyle(2, 0xffee58, 1).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  g.lineStyle(1, 0xffffff, 0.9).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  scene.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(w).setScale(0.55).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, scale: 0.7, duration: 90, onComplete: () => blitz.destroy() });
  if (m.t) fetzen(scene, m.x2, m.y2, w, 0.8);
  const jetzt = performance.now();
  if (jetzt - (scene.letzterBwKnall ?? 0) > 70) { scene.letzterBwKnall = jetzt; ton.schuss(m.x1, m.y1, 1.4, 'gewehr'); }
}

// Zombie unter den Ketten: dunkler Fleck und Fetzen
export function leopardUeberrollt(scene, m) {
  fetzen(scene, m.x, m.y, Math.random() * TAU, 1.3);
}

// ---------- Hubschrauber (Evakuierung per Flugzeug, Phasen heliAnflug / heli / abflug) ----------
// Von oben gezeichnet, Bug nach rechts: Rumpf, Heckausleger mit Heckrotor, Kanzel, Stummelflügel; Hauptrotor als Drehscheibe mit Blättern
function heliKoerper(scene) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillEllipse(4, 7, 96, 30);                                  // Schatten
  g.fillStyle(0x4d5a3a, 1).fillRoundedRect(-84, -4, 76, 8, 3);                            // Heckausleger
  g.fillStyle(0x3b4730, 1).fillTriangle(-84, -3, -92, -16, -76, -3).fillTriangle(-84, 3, -92, 12, -76, 3);   // Leitwerk
  g.fillStyle(0x4d5a3a, 1).fillEllipse(0, 0, 100, 34);                                    // Rumpf
  g.fillStyle(0x3b4730, 1).fillRoundedRect(-18, -29, 30, 10, 3).fillRoundedRect(-18, 19, 30, 10, 3);   // Stummelflügel mit Außenlasten
  g.fillStyle(0x1f2a33, 1).fillEllipse(33, 0, 26, 24);                                    // Kanzel
  g.fillStyle(0x6fa3c7, 0.55).fillEllipse(36, 0, 14, 16);
  g.fillStyle(0x263238, 1).fillCircle(0, 0, 6);                                           // Rotorkopf
  g.lineStyle(1.5, 0x263238, 0.8).strokeEllipse(0, 0, 100, 34);
  return g;
}
function heliRotor(g, wink) {
  g.clear();
  g.fillStyle(0xffffff, 0.12).fillCircle(0, 0, 70);                                       // Drehscheibe
  g.lineStyle(4, 0x1b1b1b, 0.85);
  for (let k = 0; k < 4; k++) { const a = wink + k * Math.PI / 2; g.lineBetween(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * 70, Math.sin(a) * 70); }
  g.lineStyle(2, 0x1b1b1b, 0.7).lineBetween(-88, -10 * Math.sin(wink * 1.5), -88, 10 * Math.sin(wink * 1.5));   // Heckrotor
}

// pro Bild aufrufen (spiel.mjs update): legt den Hubschrauber an, bewegt ihn und räumt ihn weg
export function heliAktualisieren(scene, s, dt, aktEbene) {
  const ph = s.evakPhase, aktiv = (ph === 'heliAnflug' && s.evakRest <= 9) || ph === 'heli' || ph === 'abflug';
  let h = scene.heliObj;
  if (!aktiv || !(s.evakX > 0)) { if (h) { h.box.destroy(); scene.heliObj = null; } return; }
  if (!h) {
    const anflug = (Math.round(s.evakX) * 0.0137 + Math.round(s.evakY) * 0.0071) % TAU;      // Anflugrichtung: fest je Landeplatz
    const koerper = heliKoerper(scene), rotor = scene.add.graphics();
    h = scene.heliObj = { box: scene.add.container(s.evakX, s.evakY, [koerper, rotor]).setDepth(7), rotor, wink: 0, anflug, t: 0, phase: ph, ab: 0 };
  }
  if (h.phase !== ph) { h.phase = ph; h.ab = 0; }
  h.wink += dt * (ph === 'heliAnflug' && s.evakRest > 3 ? 26 : 30);
  heliRotor(h.rotor, h.wink);
  const richtung = h.anflug + Math.PI;      // fliegt auf den Landeplatz zu
  let abstand = 0, hoehe = 0;
  if (ph === 'heliAnflug') { const k = Math.max(0, Math.min(1, s.evakRest / 9)); abstand = k * k * 900; hoehe = k; }
  else if (ph === 'abflug') { h.ab += dt; const k = Math.min(1, h.ab / 4); abstand = -k * k * 700; hoehe = k; }
  const dx = Math.cos(h.anflug), dy = Math.sin(h.anflug);
  h.box.setPosition(s.evakX + dx * abstand, s.evakY + dy * abstand).setRotation(richtung).setScale(1 + hoehe * 0.35).setDepth(hoehe > 0.05 ? 7 : 4.5);
  h.box.setVisible(aktEbene === '');
  // Abwind: ein Staubring unter dem gelandeten Hubschrauber
  if (ph === 'heli' && Math.random() < dt * 6) {
    const a = Math.random() * TAU, r = 45 + Math.random() * 25;
    const staub = scene.add.circle(s.evakX + Math.cos(a) * r, s.evakY + Math.sin(a) * r, 5, 0xbcaaa4, 0.35).setDepth(4.4);
    scene.tweens.add({ targets: staub, x: staub.x + Math.cos(a) * 60, y: staub.y + Math.sin(a) * 60, alpha: 0, scale: 3, duration: 900, onComplete: () => staub.destroy() });
  }
}

// Hinweiszeile zur Evakuierung per Flugzeug / Hubschrauber (null = andere Evakuierungsart oder noch nichts los)
export function evakHudText(s, an, uhrText) {
  const ph = s.evakPhase;
  if (evakArtVon(s) !== 'flugzeug') return null;
  if (ph === 'landung') return '✈️ Ein A400M setzt zur Landung an – einsteigen geht an der Heckrampe, sobald er steht';
  if (ph === 'einsteigen') return `✈️ A400M wartet bis ${uhrText(s.busAb)} · ${s.busBord}/${s.busGesamt} an Bord${an ? ' · ✈️ du bist an Bord' : ''}`;
  if (ph === 'heliAnflug') return `🔥 Triebwerksbrand, Start abgebrochen – zu Fuß zum Hubschrauber-Landeplatz (📍), er landet in ${s.evakRest} s`;
  if (ph === 'heli') return `🚁 Hubschrauber wartet bis ${uhrText(s.busAb)} · ${s.busBord}/${s.busGesamt} an Bord${an ? ' · 🚁 du bist an Bord' : ''}`;
  if (ph === 'abflug') return '🚁 Der Hubschrauber hebt ab …';
  if (s.funk && s.busAnkunft >= 0) return `✈️ Der A400M landet um ${uhrText(s.busAnkunft)} auf dem markierten Landeplatz`;
  return '📻 Funkspruch fehlt – ohne ihn kommt keine Maschine';
}
