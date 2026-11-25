// Darstellung der Evakuierungsarten (Phaser): Leopard 2A7 mit drehendem Turm und Lader-MG (Level 2), A400M mit drehenden Propellern
// und der Hubschrauber (Evakuierung per Flugzeug). Logik und Zahlen kommen vom Server (server/aufgaben.mjs, client/evak.mjs).
import { LEOPARD, A400M, HELI, heliStand, TANKLASTER, evakArtFuer, ABSTURZ, absturzDauer, absturzStrecke, absturzSeite, absturzPose, absturzAufpralle, ABSTURZ_HERDE, herdOrt } from './evak.mjs';
import { AbsturzFx } from './absturzfx.mjs';
import { weichTextur, weichKreis } from './weichkreis.mjs';
import { fetzen } from './effekte.mjs';
import * as ton from './ton.mjs';
import { kettenSpur } from './ketten.mjs';
import { RauchZeichner } from './kanonenrauch.mjs';

const TAU = Math.PI * 2;
const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function evakLaden(scene) {
  scene.load.image('leopard-wanne', 'grafik/leopard_wanne.webp');   // Draufsichten aus dem eigenen 3D-Modell (Bug rechts, tools/panzer_modell)
  scene.load.image('leopard-turm', 'grafik/leopard_turm.webp');
  scene.load.image('a400m-rumpf', 'grafik/a400m_rumpf.webp');
  scene.load.image('a400m-prop', 'grafik/a400m_prop.webp');
  scene.load.image('nh90-rumpf', 'grafik/nh90_rumpf.webp');        // Hubschrauber NH90: Rumpf und Hauptrotor getrennt (Rotor dreht)
  scene.load.image('nh90-rotor', 'grafik/nh90_rotor.webp');
  scene.load.image('tanklaster', 'grafik/tanklaster.webp');        // Kulisse neben dem gelandeten A400M
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
export function evakFahrzeug(scene, o, f, s, dt, lokal, aktEbene, skalaSoldat = 0.3) {
  const art = evakArtVon(s), jetzt = scene.time.now;
  const panzer = art === 'panzer' && scene.textures.exists('leopard-wanne'), flug = art === 'flugzeug' && scene.textures.exists('a400m-rumpf');
  // nicht mehr gebrauchte Teile (Art gewechselt) entfernen
  if (!panzer && o.turm) { o.turm.destroy(); o.turm = null; for (const q of [o.kdt, o.lader]) q?.destroy(); o.kdt = o.lader = null; }
  if (!flug && o.tank) { o.tank.destroy(); o.tank = null; }
  if (!flug && o.props) { for (const p of o.props) p.destroy(); o.props = null; }
  if (!panzer && !flug) { o.bild.setScale(1); o.sch?.setScale(1); if (o.kette) { ton.sireneStoppen(o.kette); o.kette = null; } return false; }
  o.licht.clear();
  if (panzer) {
    o.bild.setScale(LEOPARD.skala); o.sch?.setScale(LEOPARD.skala);   // Schatten ist die Silhouette derselben Textur: gleich skalieren
    if (!o.turm) {
      o.turm = scene.add.image(LEOPARD.turmX, LEOPARD.turmY, 'leopard-turm').setOrigin(LEOPARD.turmOx, LEOPARD.turmOy).setScale(LEOPARD.skala);
      o.box.addAt(o.turm, 1); o.turmW = Number.isFinite(f.turm) ? f.turm : o.r;
      // Kommandant und Ladeschütze schauen aus den Luken (drehen mit dem Turm), kleiner als normale Figuren
      const soldat = () => scene.add.image(0, 0, 'figuren2', scene.figurBild2('soldat_idle')).setScale(skalaSoldat * 0.8);
      o.kdt = soldat(); o.lader = soldat(); o.box.addAt(o.kdt, 2); o.box.addAt(o.lader, 3);
    }
    // Turmwinkel kommt vom Server (dreht dort gleichmäßig, ca. 40 °/s); hier wird nur geglättet
    o.turmW += winkelDiff(o.turmW, Number.isFinite(f.turm) ? f.turm : o.r) * Math.min(1, dt * 12);
    const loc = o.turmW - o.r, lc = Math.cos(loc), ls = Math.sin(loc);
    o.rueck = Math.max(0, (o.rueck ?? 0) - dt * 2.2);                        // Rückstoß der Hauptkanone: Turm rutscht zurück und kehrt wieder
    const rueck = o.rueck * 4;
    o.turm.setRotation(loc).setPosition(LEOPARD.turmX - lc * rueck, LEOPARD.turmY - ls * rueck);
    const luke = (q, vx, vy) => q.setPosition(LEOPARD.turmX + lc * vx - ls * vy - lc * rueck, LEOPARD.turmY + ls * vx + lc * vy - ls * rueck).setRotation(loc);
    luke(o.kdt, LEOPARD.kommandantX, LEOPARD.kommandantY).setFrame(scene.figurBild2('soldat_idle', Math.floor(jetzt / 300) % 3));
    luke(o.lader, LEOPARD.mgX, LEOPARD.mgY).setFrame(jetzt < (o.mgBis ?? 0) ? scene.figurBild2('soldat_schuss', Math.floor(jetzt / 70)) : scene.figurBild2('soldat_idle', Math.floor(jetzt / 260 + 1) % 3));
    // orangene Rundumleuchte hinten auf dem Wannendeck (Erkennungszeichen des Evakuierungsfahrzeugs)
    const an = Math.floor(jetzt / 260) % 2;
    o.licht.fillStyle(0xff9100, an ? 0.28 : 0.1).fillCircle(-25, 0, an ? 10 : 6);
    o.licht.fillStyle(an ? 0xffab00 : 0x8d4f00, 1).fillCircle(-25, 0, 2);
    o.licht.lineStyle(1, 0x000000, 0.8).strokeCircle(-25, 0, 2);
    // Kettenrasseln, solange er rollt (Ereignis „Panzer fährt“), draußen und in Hörweite
    const bewegt = o.letztPos !== undefined && Math.hypot(o.x - o.letztPos[0], o.y - o.letztPos[1]) > 0.05;
    o.letztPos = [o.x, o.y];
    if (bewegt && !aktEbene) kettenSpur(scene, 'evak', o.x, o.y, o.r, LEOPARD.breite);   // Kettenabdrücke auf dem Boden (client/ketten.mjs)
    o.faehrtT = bewegt ? 0.6 : Math.max(0, (o.faehrtT ?? 0) - dt);
    const hoerbar = lokal && !aktEbene && Math.hypot(o.x - lokal.x, o.y - lokal.y) < 700;
    if (hoerbar && o.faehrtT > 0 && !o.kette) o.kette = ton.schleifeStarten('panzerFaehrt');
    if (o.kette) ton.sireneLage(o.kette, o.x, o.y, 0, 700, !(hoerbar && o.faehrtT > 0));
    return true;
  }
  // A400M: Propeller einzeln, drehen sich (von oben gesehen schmal und breit im Wechsel); nach dem Triebwerksausfall steht alles still
  o.bild.setScale(A400M.skala);
  if (!o.tank && scene.textures.exists('tanklaster') && s.evakPhase !== 'landung') {   // Kulisse: Tanklaster neben der Nase, erst wenn das Flugzeug steht
    o.tank = scene.add.image(TANKLASTER.x, TANKLASTER.y, 'tanklaster').setScale(TANKLASTER.skala);
    o.box.addAt(o.tank, 1);
  }
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

// Schuss des Lader-MGs (Turm dreht der Server): Ladeschütze schießt, Leuchtspur und Mündungsblitz am MG, Ton wie bei den MG-Nestern
export function leopardSchuss(scene, m, s) {
  const id = s ? [...(s.fahrzeuge?.entries() ?? [])].find(([, v]) => v.art === 'evakuierung')?.[0] : null;
  const o = id ? scene.busObj.get(id) : null;
  if (o) o.mgBis = scene.time.now + 260;   // Ladeschütze zeigt soldat_schuss
  const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), mx = m.x1 + Math.cos(w) * 4, my = m.y1 + Math.sin(w) * 4;
  const g = scene.add.graphics().setDepth(7), l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
  g.lineStyle(2, 0xffee58, 1).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  g.lineStyle(1, 0xffffff, 0.9).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  scene.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
  scene.muendungsLicht(mx, my, '', 'mg');
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(w).setScale(0.32).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, duration: 60, onComplete: () => blitz.destroy() });
  if (m.t) fetzen(scene, m.x2, m.y2, w, 0.8);
  const jetzt = performance.now();
  if (jetzt - (scene.letzterBwKnall ?? 0) > 70) { scene.letzterBwKnall = jetzt; ton.schuss(m.x1, m.y1, 1.4, 'gewehr'); }
}

// Schuss der Hauptkanone: großes Mündungsfeuer am Rohrende, Rauch, Rückstoß, Knall; der Einschlag kommt als 'explosion'
export function leopardKanone(scene, m, s) {
  const id = s ? [...(s.fahrzeuge?.entries() ?? [])].find(([, v]) => v.art === 'evakuierung')?.[0] : null;
  const o = id ? scene.busObj.get(id) : null;
  if (o) o.rueck = 1;
  const w = m.w, c = Math.cos(w), sn = Math.sin(w);
  scene.muendungsLicht(m.x1, m.y1, '', 'leopard');
  const blitz = scene.add.image(m.x1, m.y1, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(w).setScale(1.1).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, duration: 160, onComplete: () => blitz.destroy() });
  // Feuerball, dichter Rauchkegel nach vorn, Staubring um den Panzer, Staub an der Schussbahn (Pool, kanonenrauch.mjs)
  const rauch = scene.kanonenRauch ??= new RauchZeichner(scene), ab = LEOPARD.muendung + LEOPARD.turmX;
  rauch.schuss(m.x1, m.y1, w, m.x1 - c * ab, m.y1 - sn * ab);
  const g = scene.add.graphics().setDepth(7);   // Leuchtspur der Granate
  g.lineStyle(3, 0xffcc80, 1).lineBetween(m.x1, m.y1, m.x2, m.y2);
  scene.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
  if (scene.lokal && Math.hypot(scene.lokal.x - m.x1, scene.lokal.y - m.y1) < 500) scene.cameras.main.shake(110, 0.003);
  ton.kanone(m.x1, m.y1);
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
  const st = heliStand(scene.welt, s.evakX, s.evakY);   // landet 20 m neben dem Landelicht (evakX/evakY)
  if (!h) {
    const anflug = (Math.round(st.x) * 0.0137 + Math.round(st.y) * 0.0071) % TAU;      // Anflugrichtung: fest je Landeplatz
    const echt = scene.textures.exists('nh90-rumpf') && scene.textures.exists('nh90-rotor');   // NH90-Bilder, sonst die gezeichnete Ersatzfigur
    const koerper = echt ? scene.add.image(HELI.rumpfX, HELI.rumpfY, 'nh90-rumpf').setScale(HELI.skala) : heliKoerper(scene);
    const rotor = scene.add.graphics(), blatt = echt ? scene.add.image(0, 0, 'nh90-rotor').setScale(HELI.skala) : null;
    h = scene.heliObj = { box: scene.add.container(st.x, st.y, blatt ? [koerper, rotor, blatt] : [koerper, rotor]).setDepth(7), rotor, blatt, wink: 0, anflug, t: 0, phase: ph, ab: 0 };
  }
  if (h.phase !== ph) { h.phase = ph; h.ab = 0; }
  h.wink += dt * (ph === 'heliAnflug' && s.evakRest > 3 ? 26 : 30);
  if (h.blatt) { h.rotor.clear().fillStyle(0xffffff, 0.1).fillCircle(0, 0, 64); h.blatt.setRotation(h.wink).setAlpha(0.85); } else heliRotor(h.rotor, h.wink);
  const richtung = h.anflug + Math.PI;      // fliegt auf den Landeplatz zu
  let abstand = 0, hoehe = 0;
  if (ph === 'heliAnflug') { const k = Math.max(0, Math.min(1, s.evakRest / 9)); abstand = k * k * 900; hoehe = k; }
  else if (ph === 'abflug') { h.ab += dt; const k = Math.min(1, h.ab / 4); abstand = -k * k * 700; hoehe = k; }
  const dx = Math.cos(h.anflug), dy = Math.sin(h.anflug);
  h.box.setPosition(st.x + dx * abstand, st.y + dy * abstand).setRotation(richtung).setScale(1 + hoehe * 0.35).setDepth(hoehe > 0.05 ? 7 : 4.5);
  h.box.setVisible(aktEbene === '');
  // Abwind: ein Staubring unter dem gelandeten Hubschrauber
  if (ph === 'heli' && Math.random() < dt * 6) {
    const a = Math.random() * TAU, r = 45 + Math.random() * 25;
    const staub = scene.add.circle(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r, 5, 0xbcaaa4, 0.35).setDepth(4.4);
    scene.tweens.add({ targets: staub, x: staub.x + Math.cos(a) * 60, y: staub.y + Math.sin(a) * 60, alpha: 0, scale: 3, duration: 900, onComplete: () => staub.destroy() });
  }
}

// Hinweiszeile zur Evakuierung per Flugzeug / Hubschrauber (null = andere Evakuierungsart oder noch nichts los)
export function evakHudText(s, an, uhrText) {
  const ph = s.evakPhase, art = evakArtVon(s);
  if (art === 'bunker') {
    if (ph === 'sieg') return '☢️ Der Bunker hat gehalten – ihr habt überlebt!';
    if (ph === 'niederlage') return '☢️ Der Schlag hat euch draußen erwischt …';
    return `☢️ Bunker offen · ${s.busBord}/${s.busGesamt} drinnen${an ? ' · ☢️ du bist drin' : ''} – wer beim Ende des Countdowns drin ist, überlebt`;
  }
  if (art === 'heli') return ph === 'heli' ? `🚁 NH90 steht bereit · ${s.busBord}/${s.busGesamt} an Bord${an ? ' · 🚁 du bist an Bord' : ''} – Abflug, sobald alle Aufgaben erledigt sind` : (ph === 'abflug' ? '🚁 Der Hubschrauber hebt ab …' : null);
  if (art === 'absturz' && ph === 'absturz') return '✈️ Ein A400M kommt im Landeanflug …';
  if (art === 'absturz' && ph === 'wrack') return '🔥 A400M bruchgelandet, Wrack in Flammen – ein NH90 kommt, sobald alle Aufgaben erledigt sind';
  if (art === 'absturz' && !['heliAnflug', 'heli', 'abflug'].includes(ph)) return s.funk && s.busAnkunft >= 0 ? `✈️ Der A400M kommt um ${uhrText(s.busAnkunft)}` : '📻 Funkspruch fehlt – ohne ihn kommt keine Maschine';
  if (art !== 'flugzeug' && art !== 'absturz') return null;
  if (ph === 'landung') return '✈️ Ein A400M setzt zur Landung an – einsteigen geht an der Heckrampe, sobald er steht';
  if (ph === 'einsteigen') return `✈️ A400M wartet bis ${uhrText(s.busAb)} · ${s.busBord}/${s.busGesamt} an Bord${an ? ' · ✈️ du bist an Bord' : ''}`;
  if (ph === 'heliAnflug') return `🔥 Triebwerksbrand, Start abgebrochen – zu Fuß zum Hubschrauber-Landeplatz (📍), er landet in ${s.evakRest} s`;
  if (ph === 'heli') return `🚁 Hubschrauber wartet bis ${uhrText(s.busAb)} · ${s.busBord}/${s.busGesamt} an Bord${an ? ' · 🚁 du bist an Bord' : ''}`;
  if (ph === 'abflug') return '🚁 Der Hubschrauber hebt ab …';
  if (s.funk && s.busAnkunft >= 0) return `✈️ Der A400M landet um ${uhrText(s.busAnkunft)} auf dem markierten Landeplatz`;
  return '📻 Funkspruch fehlt – ohne ihn kommt keine Maschine';
}

// ---------- Königsdorf: Bruchlandung des A400M (Hüpfer, Schlittern, Brand) – das Wrack bleibt als brennende Kulisse ----------
// Lage und Zeitplan rechnet client/evak.mjs (absturzPose, fest je Seed, wie im Server); Feuer/Rauch/Funken/Staub aus client/absturzfx.mjs.
// Die Brandherde sind zusätzlich echte Feuer des Servers (state.feuer, Art 'a400m': Licht, Knistern, Schaden) – gezeichnet werden sie nur hier.
const SPUR_SCHRITT = 0.1;                      // s zwischen zwei Stücken der Bodenspur
const FX_WEITE = 2600;                         // weiter weg von der Kamera ruht die Teilchenwolke (Leistung)
function absturzLoesen(scene) {
  const a = scene.absturzObj;
  if (!a) return;
  a.box.destroy(); a.fx?.zerstoeren(); scene.absturzObj = null;
}
// Bodenspur bis zur Zeit t: Krater an den Aufprallstellen, im Schlittern eine Furche unter dem Rumpf, Kratzer und eine Schleifspur der Tragfläche
function spurBis(a, s, t) {
  const g = a.boden, P = { x: s.evakAX, y: s.evakAY, w: s.evakW }, c = a.c, sn = a.sn, prallen = a.prallen;
  while (a.spurK < prallen.length && prallen[a.spurK] <= t) {   // Aufprall: dunkle, aufgerissene Stelle
    const p = absturzPose(P, c, sn, prallen[a.spurK], a.seite), pc = Math.cos(p.richtung), ps = Math.sin(p.richtung), gross = a.spurK === 0 ? 1.3 : 1 - a.spurK * 0.15;
    g.fillStyle(0x2a2016, 0.22);
    for (let k = -5; k <= 5; k++) g.fillCircle(p.x + pc * k * 9 * gross, p.y + ps * k * 9 * gross, (19 - Math.abs(k) * 2.2) * gross);   // längliche Mulde
    g.fillStyle(0x5a4a38, 0.5).fillCircle(p.x - pc * 30 + (a.spurK % 2 ? 1 : -1) * ps * 18, p.y - ps * 30, 9 * gross);
    a.spurK++;
  }
  const ab = prallen[prallen.length - 1];
  while (a.spurT + SPUR_SCHRITT <= t) {
    const t0 = a.spurT, t1 = a.spurT + SPUR_SCHRITT;
    a.spurT = t1;
    if (t0 < ab) continue;
    const p0 = absturzPose(P, c, sn, t0, a.seite), p1 = absturzPose(P, c, sn, t1, a.seite);
    const linie = (p, ox, oy) => { const pc = Math.cos(p.richtung), ps = Math.sin(p.richtung); return [p.x + pc * ox - ps * oy, p.y + ps * ox + pc * oy]; };
    const strich = (b, farbe, al, ox, oy) => { const [x0, y0] = linie(p0, ox, oy), [x1, y1] = linie(p1, ox, oy); g.lineStyle(b, farbe, al).lineBetween(x0, y0, x1, y1); };
    strich(16, 0x2b2117, 0.42, -20, 0);                              // Furche unter dem Bauch
    strich(2, 0x9a9187, 0.55, -20, -9); strich(2, 0x9a9187, 0.5, -20, 8);   // helle Kratzer im Belag
    strich(5, 0x231b14, 0.45, 40, a.seite * 104);                    // Triebwerk 1 bzw. 4 schleift mit
    strich(3, 0x231b14, 0.35, 0, a.seite * 166);                     // Flügelspitze
  }
}
export function absturzAktualisieren(scene, s, dt, aktEbene) {
  const ph = s.evakPhase, aktiv = evakArtVon(s) === 'absturz' && ['absturz', 'wrack', 'heliAnflug', 'heli', 'abflug'].includes(ph) && s.evakAX > 0 && scene.textures.exists('a400m-rumpf');
  let a = scene.absturzObj;
  if (!aktiv) { if (a) absturzLoesen(scene); return; }
  const jetzt = scene.time.now, ende = absturzDauer();
  if (a && (a.ax !== s.evakAX || a.ay !== s.evakAY || a.w !== s.evakW || (a.wrack && ph === 'absturz'))) { absturzLoesen(scene); a = null; }   // neue Absturzstelle bzw. neuer Anflug
  if (!a) {
    weichTextur(scene);
    const bild = scene.add.image(0, 0, 'a400m-rumpf').setScale(A400M.skala), licht = scene.add.graphics();
    const glut = ABSTURZ_HERDE.map(hd => [weichKreis(scene, hd.x, hd.y, hd.r * 1.6, 0xff4a00, 0).setBlendMode('ADD'), weichKreis(scene, hd.x, hd.y, hd.r * 0.6, 0xffc040, 0).setBlendMode('ADD')]).flat();
    const props = A400M.naben.map(([x, y]) => scene.add.image(x, y, 'a400m-prop').setScale(A400M.skala));
    const boden = scene.add.graphics().setDepth(4.3);
    const schatten = (scene.fahrzeugSchattenTextur ? scene.add.image(0, 0, scene.fahrzeugSchattenTextur('a400m-rumpf')) : scene.add.image(0, 0, 'a400m-rumpf').setTintFill(0x000000)).setScale(A400M.skala).setAlpha(0.3).setDepth(4.4);
    // wer mitten im Anflug dazukommt, sieht die Maschine dort, wo sie nach der Serveruhr gerade ist (evakRest = Rest bis zum Stand)
    const schon = ph === 'absturz' ? Math.max(0, ende - s.evakRest) * 1000 : (ende + 10) * 1000;   // Wrack steht schon: kein Knall beim Dazukommen
    a = scene.absturzObj = {
      box: scene.add.container(s.evakAX, s.evakAY, [bild, ...props, licht, ...glut]).setDepth(4.6), bild, props, licht, glut, boden, schatten,
      t0: jetzt - schon, wrack: false, spin: 0, ax: s.evakAX, ay: s.evakAY, w: s.evakW, c: Math.cos(s.evakW), sn: Math.sin(s.evakW), seite: absturzSeite(s.seed),
      prallen: absturzAufpralle(), prallT: -1, spurT: ABSTURZ.anflug, spurK: 0, takte: new Array(ABSTURZ_HERDE.length).fill(0), blechT: 0, fxT: 0,
      fx: new AbsturzFx(scene),
    };
    a.box.on('destroy', () => { boden.destroy(); schatten.destroy(); });
    a.prallT = a.prallen.findIndex(z => z > (jetzt - a.t0) / 1000);   // schon vergangene Aufpralle nicht nachholen
    if (a.prallT < 0) a.prallT = a.prallen.length;
  }
  const draussen = aktEbene === '';
  a.box.setVisible(draussen); a.boden.setVisible(draussen); a.schatten.setVisible(draussen);
  a.licht.clear();
  const steht = ph !== 'absturz';
  const t = steht ? ende : Math.min(ende, (jetzt - a.t0) / 1000);
  const P = { x: s.evakAX, y: s.evakAY, w: s.evakW }, pose = absturzPose(P, a.c, a.sn, t, a.seite);
  const pc = Math.cos(pose.richtung), ps = Math.sin(pose.richtung);
  const tempo = steht ? 0 : (pose.d - absturzStrecke(Math.min(ende, t + 0.1))) / 0.1;
  const kaputt = t >= ABSTURZ.anflug;
  // Rumpf, Schatten (je höher, desto weiter versetzt), Größe (näher an der Kamera = größer)
  a.box.setPosition(pose.x, pose.y).setRotation(pose.richtung + (pose.phase === 'anflug' ? Math.sin(t * 2.2) * 0.03 * pose.h : 0)).setScale(1 + pose.h * 0.3);
  a.schatten.setPosition(pose.x + 10 + pose.h * 70, pose.y + 8 + pose.h * 46).setRotation(pose.richtung).setScale(A400M.skala * (1 - pose.h * 0.08)).setAlpha(0.32 - pose.h * 0.14);
  // Propeller: drehen im Anflug, beim ersten Aufprall zerschellt (stehen schief, verrußt)
  if (!kaputt) {
    a.spin += dt * 17;
    a.props.forEach((p, i) => p.setScale(A400M.skala, A400M.skala * (0.35 + 0.65 * Math.abs(Math.cos(a.spin + i * 1.3)))));
  } else if (!a.propsKaputt) {
    a.propsKaputt = true;
    a.props.forEach((p, i) => p.setTint(0x3a3633).setScale(A400M.skala * (i === 2 ? 0.6 : 0.85)).setRotation(0.4 + i * 0.9));
  }
  // Rumpf verrußt mit der Zeit, im Stand ausgebrannt
  a.bild.setTint(steht ? 0x3d3a38 : kaputt ? (pose.phase === 'huepfen' ? 0xb8b0a8 : 0x8a8480) : 0xffffff);
  // Aufpralle: Staubwolke, Funkenregen, Krach; der erste mit Explosion am Triebwerk
  const lokal = scene.lokal, nah = lokal ? Math.hypot(lokal.x - pose.x, lokal.y - pose.y) : 0;
  while (a.prallT < a.prallen.length && a.prallen[a.prallT] <= t) {
    const k = a.prallT++, st = 1 - k * 0.2;
    if (draussen) {
      a.fx.pool.staub(pose.x - pc * 20, pose.y - ps * 20, Math.round(26 * st * a.fx.anteil), 1.2 * st);
      a.fx.pool.funken(pose.x - pc * 40, pose.y - ps * 40, pc, ps, Math.round(34 * st * a.fx.anteil), 1.1);
      if (k === 0) {
        const hd = ABSTURZ_HERDE[0], o = herdOrt(hd, pose.x, pose.y, pc, ps);
        scene.explosion?.(o.x, o.y, 70, 1.0);
      }
    }
    if (!ton.ereignis('krach', pose.x, pose.y)) { ton.schuss(pose.x, pose.y, 1.8 * st); ton.stoss(pose.x, pose.y, false); }
    if (lokal && nah < 900) scene.cameras.main.shake(260 * st, 0.007 * st * (1 - nah / 900));
  }
  // Schlittern: Funkenspur unter dem Bauch und am schleifenden Triebwerk, Staubfahnen, Blech kreischt
  if (kaputt && !steht && pose.phase === 'schlittern' && tempo > 6 && draussen) {
    const v = Math.min(1, tempo / ABSTURZ.tempo);
    a.fxT += dt * a.fx.anteil;
    while (a.fxT > 0.03) {
      a.fxT -= 0.03;
      if (Math.random() < 0.3 + v) a.fx.pool.funken(pose.x - pc * 30 - ps * (Math.random() - 0.5) * 30, pose.y - ps * 30 + pc * (Math.random() - 0.5) * 30, pc, ps, 2, 0.4 + v);
      const o = herdOrt({ x: 40, y: a.seite * 104 }, pose.x, pose.y, pc, ps);
      if (Math.random() < 0.6 * v + 0.1) a.fx.pool.funken(o.x, o.y, pc, ps, 1, 0.3 + v);
      if (Math.random() < 0.25 + 0.3 * v) a.fx.pool.staub(pose.x - pc * 90, pose.y - ps * 90, 1, 0.6 + 0.6 * v);
    }
    a.blechT -= dt;
    if (a.blechT <= 0) { a.blechT = 0.45; if (!ton.ereignis('blech', pose.x, pose.y)) ton.stoss(pose.x, pose.y, false); }
  }
  // Bodenspur
  if (kaputt) spurBis(a, s, t);
  // Stillstand: Explosion einmal, Brandfleck, danach brennt das Wrack bis zum Levelwechsel
  if (steht && !a.wrack) {
    a.wrack = true;
    if (draussen && (jetzt - a.t0) / 1000 < ende + 2) scene.explosion?.(pose.x, pose.y, 90, 1.3);   // nur wer es miterlebt (kein Knall beim Dazukommen)
    if (lokal && nah < 700) scene.cameras.main.shake(300, 0.006);
    for (const hd of ABSTURZ_HERDE) {   // Ruß und verbranntes Gras um die Brandherde (mehrere blasse Flecken statt einer Scheibe)
      const o = herdOrt(hd, pose.x, pose.y, pc, ps);
      for (let k = 0; k < 4; k++) a.boden.fillStyle(0x0d0b09, 0.13).fillCircle(o.x + ((k * 37 + hd.x) % 23 - 11) * hd.r / 30, o.y + ((k * 53 + hd.y) % 19 - 9) * hd.r / 30, hd.r * (0.7 + k * 0.22));
    }
  }
  if (steht) {   // Bruchstelle im Rumpf
    a.licht.fillStyle(0x0b0a09, 0.85).fillRect(-14, -26, 28, 52);
    a.licht.fillStyle(0x0b0a09, 0.85).fillTriangle(-14, -26, -6, -40, 4, -26).fillTriangle(14, 26, 8, 42, -2, 26);
  }
  // Brandherde: Glut (flackernd, im Rumpf-Rahmen), Flammen, Glutfunken und Rauch (Weltkoordinaten, bleiben hinter der Maschine zurück)
  const kamera = scene.cameras.main.worldView, imBild = Math.abs(pose.x - kamera.centerX) < FX_WEITE && Math.abs(pose.y - kamera.centerY) < FX_WEITE;
  const brennt = Math.min(1, Math.max(0, t - ABSTURZ.anflug) / 8 + 0.45);   // Feuer wächst nach dem Aufprall, im Stand Vollbrand
  ABSTURZ_HERDE.forEach((hd, i) => {
    if (hd.ab > pose.herde) return;
    const fl = 0.6 + 0.25 * Math.sin(jetzt / 90 + i * 1.7) + 0.15 * Math.sin(jetzt / 37 + i);
    const st = steht ? 1 : brennt * (hd.ab === 1 ? 1 : 0.75);
    a.glut[i * 2].setAlpha(0.32 * fl * st); a.glut[i * 2 + 1].setAlpha(0.6 * fl * st);   // Feuerschein und Glutkern (additiv, weich)
    if (!draussen || !imBild) return;
    const o = herdOrt(hd, pose.x, pose.y, pc, ps), anteil = a.fx.anteil;
    a.takte[i] += dt * anteil;
    const flammenTakt = 1 / (16 + hd.r * 0.25), rauchTakt = steht ? 0.42 : 0.3, glutTakt = 0.35;
    while (a.takte[i] > flammenTakt) {   // Flammen; Rauch und Glut über Zufall im selben Takt (spart Zähler)
      a.takte[i] -= flammenTakt;
      a.fx.pool.flamme(o.x, o.y, hd.r, st);
      if (Math.random() < flammenTakt / rauchTakt) a.fx.pool.rauch(o.x, o.y - 6, st);
      if (Math.random() < flammenTakt / glutTakt) a.fx.pool.glut(o.x, o.y);
    }
  });
  a.fx.zeichne(dt, draussen && imBild);
}

// ---------- Finale: Bunkertor (Evakuierungspunkt, Einsteigen = hineingehen) ----------
export function bunkerAktualisieren(scene, s, aktEbene) {
  const aktiv = evakArtVon(s) === 'bunker' && s.evakX > 0;
  let b = scene.bunkerObj;
  if (!aktiv) { if (b) { b.box.destroy(); scene.bunkerObj = null; } return; }
  if (!b) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-52, -30, 112, 70, 8);                          // Schatten
    g.fillStyle(0x6d6f70, 1).fillRoundedRect(-56, -36, 112, 72, 8).lineStyle(3, 0x3c3e3f, 1).strokeRoundedRect(-56, -36, 112, 72, 8);   // Betonrahmen
    g.fillStyle(0x4a4c4d, 1).fillRoundedRect(-44, -26, 88, 52, 4);                              // Laibung
    g.fillStyle(0x1b1d1e, 1).fillRect(-30, -20, 60, 40);                                       // dunkler Gang
    g.fillStyle(0x78828a, 1).fillRect(-40, -22, 14, 44).fillRect(26, -22, 14, 44);              // aufgeschobene Torflügel (Stahl)
    for (let i = 0; i < 4; i++) { g.fillStyle(0xffc400, 1).fillRect(-40, -20 + i * 11, 14, 5).fillRect(26, -20 + i * 11, 14, 5); }   // Warnstreifen
    const zeichen = scene.add.text(0, -48, '☢', { fontSize: '22px', color: '#ffd600', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    b = scene.bunkerObj = { box: scene.add.container(s.evakX, s.evakY, [g, zeichen]).setDepth(4.4) };
  }
  b.box.setVisible(aktEbene === '');
}

// Munitionskiste fällt aus dem Heck des A400M (Nachricht 'kistenFall': Heck x0/y0, Liegeplatz x1/y1, dauer s): fliegt in einem Bogen (wird kleiner),
// kommt auf und rutscht aus; danach liegt der Bodengegenstand (Server legt ihn nach `dauer` ab). Nur Darstellung.
export function kisteFaellt(scene, m) {
  const x0 = Number(m?.x0), y0 = Number(m?.y0), x1 = Number(m?.x1), y1 = Number(m?.y1), dauer = Math.max(0.3, Number(m?.dauer) || 1.2);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return;
  const k = scene.add.text(x0, y0, '📦', { fontSize: '26px' }).setOrigin(0.5).setDepth(7.2);
  const schatten = scene.add.ellipse(x0, y0, 18, 10, 0x000000, 0.35).setDepth(4.2);
  const dreh = (Math.round(x1 + y1) % 2 ? 1 : -1) * (0.8 + (Math.abs(Math.round(x1)) % 5) * 0.15);
  const z = { t: 0 };
  scene.tweens.add({
    targets: z, t: 1, duration: dauer * 1000, ease: 'Linear',
    onUpdate: () => {
      const t = z.t, fliegt = Math.min(1, t / 0.55), rutscht = t <= 0.55 ? 0 : (t - 0.55) / 0.45;
      const e = rutscht ? 1 - (1 - rutscht) * (1 - rutscht) : 0;                       // am Boden: auslaufend nach vorn rutschen
      const lauf = fliegt * 0.7 + e * 0.3, hoehe = Math.sin(Math.min(1, fliegt) * Math.PI) * 26 * (1 - rutscht) + (rutscht > 0 && rutscht < 0.25 ? Math.sin(rutscht / 0.25 * Math.PI) * 5 : 0);
      const px = x0 + (x1 - x0) * lauf, py = y0 + (y1 - y0) * lauf;
      k.setPosition(px, py - hoehe).setRotation(dreh * (1 - rutscht) * fliegt * 2).setScale(1 + (1 - lauf) * 0.35);
      schatten.setPosition(px, py).setScale(1 - hoehe / 60).setAlpha(0.35);
    },
    onComplete: () => {
      for (let i = 0; i < 5; i++) {   // Staubwölkchen beim Liegenbleiben
        const a = i * 1.26, r = scene.add.circle(x1, y1, 4, 0xbcaaa4, 0.4).setDepth(4.3);
        scene.tweens.add({ targets: r, x: x1 + Math.cos(a) * 16, y: y1 + Math.sin(a) * 16, alpha: 0, scale: 2.2, duration: 500, onComplete: () => r.destroy() });
      }
      k.destroy(); schatten.destroy();
    },
  });
}
