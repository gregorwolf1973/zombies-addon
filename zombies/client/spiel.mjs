// Browser-Client: zeigt den Zustand vom Server, schickt nur Eingaben und Wünsche.
import { fzPx } from './masse.mjs';
import { ASSETS } from './basis.mjs';
import { groesse } from './groessen.mjs';
import {
  KACHEL, kachelVon, breiteVon, setzeInnenFein, setzeTuerKacheln, tempoVon, reichVon, abstandBehaelter, abstandTuer, INNEN_FEIN, INNEN_TEMPO, setzeInnenTempo, INNEN_REICH, ladenArt, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, sichtfrei, safeRoomVon, setzeKartengroesse,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEHAELTER_NAME, AKTION_ABSTAND, INFEKTION_DAUER, LEICHE_DAUER,
  BODEN_DAUER, HANDEL_RAETSEL, TAUSCH_ABSTAND, BUS_ABSTAND, WAFFEN, aktiveWaffe, vorratVon, HANDEL, HANDEL_ABSTAND, bezahlung, MUNITION_MAX, TEMPO_MG, traegtMg, GRANATE, zaunUeberstieg, ZAUN_NAME, baumFaktor, helligkeit, istNacht, hausHell, fensterLicht, uhrText, setzeTageszeiten, schlossArt, weltFingerabdruck } from './welt.mjs';
import { NebelEbene } from './nebel.mjs';
import { dingId, dingN, hat, zaehle, flach, kannAufnehmen, entferne as entferneStueck } from './stapel.mjs';
import { laternen, tuerPose, zeichneSafeEingang } from './vektor.mjs';
import { HAARFARBEN, KLEIDFARBEN, WAFFEN_BILD, istHeld, aussehenLesen, aussehenText, umgefaerbt, aussehenMigriert } from './figurbild.mjs';
import { zeichneSandsaecke } from './safe_moebel.mjs';
import { setzeMoebelBilder } from './moebel_bilder.mjs';
import { zeichneBoden, zeichneSchattenStueck, zeichneOben, zeichneKronen, hatBaeume, zeichneDaecher, zeichneSafeDach, DACH_RAND, zeichneInnen, busVonOben, autoVonOben, FZ_SCHATTEN, setzeAutoBilder, autoEintraege, autoAnimEintrag, zeichneAutoBild } from './aussehen.mjs';
import { PUMA_SKALA, PUMA_BILD, handelPartner } from './stuetzpunkt.mjs';
import { zeichneFlugfeldDeko } from './flugfeld_deko.mjs';
import { RadioAnzeige } from './radio.mjs';
import { fetzen, fetzenBeiSchuss, fetzenBeiExplosion, BwLicht } from './effekte.mjs';
import { evakLaden, evakArtVon, evakFahrzeugBild, evakFahrzeug, leopardSchuss, leopardKanone, leopardUeberrollt, heliAktualisieren, absturzAktualisieren, bunkerAktualisieren, evakHudText } from './evakdarstellung.mjs';
import { baueWeltAusKarte } from './osmwelt.mjs';
import { weltBeschaffen, weltVorrechnen } from './weltladen.mjs';
import { ladeKulisse, kulisseVorhanden, kulHatFoto, kulHatDaecher, kulisse, kulBoden, kulFoto, kulHatGezeichnet, kulSchatten, fotoStatus, fotoWunsch } from './kulisse.mjs';
import { KUL_SCHLUESSEL, schattenFaktor } from './kulisse_regeln.mjs';
import { finaleHud, finaleAbspann } from './finale.mjs';
import { TUT, tutorialKnopf, tutorialStart } from './tutorial.mjs';   // Schießstand / Tutorial (eigener Raum 'schiessstand')
import { baueSchiessstandWelt, SS_B, SS_H } from './schiessstand_welt.mjs';

let KARTE = null;   // OSM-Karte (z. B. Geretsried), sonst erzeugtes Dorf
const SCHATTEN_ZELLE = 4, SCHATTEN_DUNKEL = 0.35;   // Raster der Schattenprüfung (px) und Abdunklung der Figuren im Schatten
// Schattenbild (Deckkraft der gezeichneten Schatten) → Raster b × h, 1 = Schatten (Alpha ab ~50 %)
function schattenMaske(ctx, B, H) {
  try {
    const b = Math.ceil(B / SCHATTEN_ZELLE), h = Math.ceil(H / SCHATTEN_ZELLE), d = new Uint8Array(b * h), px = ctx.getImageData(0, 0, B, H).data;
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < b; cx++) {
      const x = Math.min(B - 1, cx * SCHATTEN_ZELLE + 2), y = Math.min(H - 1, cy * SCHATTEN_ZELLE + 2);
      if (px[(y * B + x) * 4 + 3] > 128) d[cy * b + cx] = 1;
    }
    return { b, h, d };
  } catch { return null; }
}
// Tönung (0xRRGGBB) mit Faktor f (0..1) abdunkeln
const tintMal = (c, f) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);
const STUECK = 16;   // Kartenstücke à 16×16 Kacheln (512 px: kurz genug zum Bauen in einem Bild, auch am Handy)
import { innenraumFuer } from './innen.mjs';
import { zeichneInnenFein, zeichneTuerFein, BILD_SKALA, INNEN_ZOOM_FEIN } from './innen_fein_bild.mjs';
import { lichtRichtungWelt, lichtSeite, fensterFlecken } from './fensterlicht.mjs';
import { Blitzliste, WEICH_RADIUS, MUENDUNG_MAX } from './muendungslicht.mjs';
// ?innen1m in der Adresse: nur noch zum Testen vorgesehen; maßgeblich ist der Schalter des Servers (state.optionen, siehe erzeuge())
import { hindernisFelder, hindernisFelderFein, hindernisPixel } from './hindernisse.mjs';
import * as ton from './ton.mjs';
import { HundAnzeige, eigenerHund } from './hund.mjs';
import { naheBodenDinge, auswahlAuf, auswahlPruefen, brauchtPlatz } from './aufheben.mjs';
import { fundZeigen, fundZu, fundPruefen } from './fundliste.mjs';
import { alleKandidaten } from './durchsuche_alle.mjs';
import * as sprache from './sprache.mjs';
import { merkzettelAnschliessen, merkzettelErwarten } from './merkzettel.mjs';
import { istEigen, hoertEbene as hoertEbeneRegel } from './ton_regeln.mjs';
import { GERAET_SCHLUESSEL, kartenbildLesen, stimmenFaktorLesen, anAusLesen, schiessModusLesen, feuerErlaubt as feuerErlaubtRegel } from './einstellungen_regeln.mjs';
import { fkStart } from './faehigkeiten.mjs';
import { startwahlStart } from './startwahl.mjs';
import { Uebersicht } from './uebersicht.mjs';
import { Kameraflug, radEinrichten, ZOOM_MIN, ZOOM_MAX, FLUG_ZOOM_MIN } from './kameraflug.mjs';
import { b11Registrieren, b11Animieren } from './szene_b11.mjs';

const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const INNEN_ZOOM = 1.6;
// Seit 0.69.4 ist der Grundzoom ×1,4 näher: Ring und Kegel draußen auf die frühere Bildschirmgröße zurückrechnen
const AUSSEN_ZOOM_KORREKTUR = 1 / 1.4;
import { zeichneMensch, zeichneMenschLiegend } from './figuren.mjs';
import { NetzPuffer, nachSeq, ausStufe, verzFuerServer, naheAnzeigeVerz } from './netzpuffer.mjs';
import { dingIcon, dingHtml, setzeDingListe, dingRahmen, hatDingBild } from './dingbild.mjs';

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
// tf/ff: drinnen im Feinraster sind Tempo und Figur kleiner (Schrittlänge schrumpft mit der Figur, Schwelle fürs Gehen mit dem Tempo)
function laufBild(f, dx, dy, dt, schrittLaenge, tf = 1, ff = 1) {
  const weg = Math.hypot(dx, dy);
  f.lauf = (f.lauf ?? 0) + weg / ff;
  let geht = weg / Math.max(dt, 0.001) > 12 * tf;
  // Stand-Bild erst nach 250 ms ohne Bewegung (kurzer Netz-Hänger lässt nicht alle gleichzeitig erstarren)
  if (geht) f.ruheT = 0; else { f.ruheT = (f.ruheT ?? 1) + dt; if (f.ruheT < 0.25) geht = true; }
  return geht ? Math.floor((f.lauf / schrittLaenge) % 1 * LAUFBILDER) : -1;
}

const FARBEN = [0x42a5f5, 0xffca28, 0xab47bc, 0xff7043, 0x26c6da, 0xec407a, 0x9ccc65, 0xd7ccc8, 0xffffff, 0x5c6bc0];
const css = f => '#' + f.toString(16).padStart(6, '0');
const $ = id => document.getElementById(id);

// Basisadresse: funktioniert direkt (zombies.example.org/) und hinter dem HA-Ingress-Pfad
const BASIS = location.href.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');

let raum = null;
let meineId = null;
let wikiAdresse = '', externeAdresse = '';

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
// Versionsabgleich: lief die App über ein Update hinweg im Hintergrund weiter, hat sie noch alten Code (andere Welt!) →
// vor dem Anmelden und beim Zurückkehren neu laden (danach tritt sie von selbst wieder bei)
let seitenVersion = null;
async function veraltet() {
  try { const v = (await (await fetch('info', { cache: 'no-store' })).json()).version; return !!(seitenVersion && v && v !== seitenVersion); } catch { return false; }
}
// Autostart nach Neuladen (Update, Levelwechsel, Weltwechsel): ein eingegebenes Testzugang-Passwort überlebt das Neuladen nur kurz im Tab (sessionStorage) und wird beim Wiederbeitreten sofort gelöscht
function autostartMerken() { try { sessionStorage.setItem('zob_autostart', '1'); const pw = $('testpw')?.value; if (pw) sessionStorage.setItem('zob_testpwtmp', pw); } catch {} }
function frischLaden(wiederBeitreten) { if (wiederBeitreten) autostartMerken(); location.reload(); }
document.addEventListener('visibilitychange', async () => { if (!document.hidden && await veraltet()) frischLaden(!!window.szene); });
fetch('info').then(r => r.json()).then(i => { seitenVersion = i.version || null; $('codeblock').hidden = !i.code; wikiAdresse = i.wiki || ''; externeAdresse = i.extern || ''; if (mikroNurHttps) mikroLink(); ton.toeneZuordnen(i.toene); ton.toneEinstellungen(i); }).catch(() => {});
$('los').addEventListener('click', () => { ton.tonStarten(); sprache.vorbereiten(); mitspielen(); });
tutorialKnopf(() => { ton.tonStarten(); sprache.vorbereiten(); mitspielen(); });   // „🎯 Schießstand / Tutorial“ unter „Mitspielen“

// ---------- Startseite: Freigaben (Mikrofon) abfragen, danach Installation als App anbieten ----------
let installEreignis = null, freigabenFertig = false;
const alsApp = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
function installAnbieten() {
  if (!freigabenFertig || alsApp()) return;
  if (installEreignis) $('installieren').hidden = false;
  else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) $('fgIos').hidden = false;
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEreignis = e; installAnbieten(); });
window.addEventListener('appinstalled', () => { installEreignis = null; $('installieren').hidden = true; });
$('installieren').onclick = async () => {
  if (!installEreignis) return;
  installEreignis.prompt();
  try { await installEreignis.userChoice; } catch { /* abgebrochen */ }
  installEreignis = null; $('installieren').hidden = true;
};
let mikroNurHttps = false;
// Ohne sicheren Kontext (http:// außer localhost) geht kein Mikrofon: Link zur https-Adresse anbieten, falls eingestellt
function mikroLink() {
  const a = /^https:\/\//i.test(externeAdresse) ? externeAdresse : '';
  const z = $('fgMikro'); z.textContent = 'nur über https:// möglich';
  if (!a) return;
  z.textContent = 'Mit Mikrofon spielen: ';
  const l = document.createElement('a'); l.href = a; l.textContent = a; l.rel = 'noopener'; z.append(l);
}
async function freigabenAbfragen() {
  const text = t => { $('fgMikro').textContent = t; };
  const imRahmen = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (imRahmen) { $('fgRahmen').hidden = false; $('fgEigen').href = location.href; }
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { mikroNurHttps = true; mikroLink(); return; }
    let stand = 'prompt';
    try { stand = (await navigator.permissions.query({ name: 'microphone' })).state; } catch { /* Safari kennt das nicht überall */ }
    if (stand === 'granted') { text('erlaubt ✓'); return; }
    if (stand === 'denied') { text('gesperrt – oben links am Schloss-Symbol erlauben und neu laden'); return; }
    text('bitte im Browser erlauben …');
    const strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    strom.getTracks().forEach(t => t.stop());   // nur die Erlaubnis holen; das Spiel öffnet das Mikrofon später selbst
    text('erlaubt ✓');
    $('fgMikroKnopf').hidden = true;
  } catch (e) {
    text(imRahmen ? 'nicht möglich (Seitenleiste)' : 'nicht erlaubt – du hörst die anderen trotzdem');
    if (!imRahmen) $('fgMikroKnopf').hidden = false;
    console.warn('Mikrofon-Freigabe:', e?.message ?? e);
  } finally { freigabenFertig = true; installAnbieten(); }
}
$('fgMikroKnopf').onclick = () => freigabenAbfragen();
freigabenAbfragen();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e?.message ?? e));
// Startmusik: sofort beim Öffnen versuchen; blockiert der Browser den Ton, startet sie bei der ersten Berührung/Taste
ton.musikSofort(() => $('start').style.display !== 'none');

// ---------- Figurenwahl ----------
let meinAussehen = aussehenLesen(null), aussehenAngefasst = false;   // angefasst: in der Anmeldung selbst gewählt
try { meinAussehen = aussehenLesen(aussehenMigriert(localStorage.getItem('zob_aussehen'))); if (/^[mw],/.test(localStorage.getItem('zob_aussehen') ?? '')) localStorage.setItem('zob_aussehen', aussehenText(meinAussehen)); } catch {}
const figurVorlage = { bild: new Image(), liste: null, bild2: new Image(), liste2: null, bild3: new Image(), liste3: null };
figurVorlage.bild3.src = ASSETS + 'grafik/helden160.webp';
fetch(ASSETS + 'grafik/helden160.json').then(r => r.json()).then(j => { figurVorlage.liste3 = j; vorschauZeichnen(); }).catch(() => {});
figurVorlage.bild3.onload = () => vorschauZeichnen();
figurVorlage.bild.src = ASSETS + 'grafik/figuren.png';
fetch(ASSETS + 'grafik/figuren.json').then(r => r.json()).then(j => { figurVorlage.liste = j; vorschauZeichnen(); }).catch(() => {});
figurVorlage.bild.onload = () => vorschauZeichnen();
figurVorlage.bild2.src = ASSETS + 'grafik/figuren2.webp';
fetch(ASSETS + 'grafik/figuren2.json').then(r => r.json()).then(j => { figurVorlage.liste2 = j; vorschauZeichnen(); }).catch(() => {});
figurVorlage.bild2.onload = () => vorschauZeichnen();
function vorschauZeichnen() {
  const l = figurVorlage.liste;
  if (!l || !figurVorlage.bild.complete) return;
  const c = $('figurvorschau'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  document.querySelector('.figurknoepfe')?.classList.toggle('fest', meinAussehen.g === 's');   // Farbwahl nur bei Survivor gesperrt
  if (meinAussehen.g === 's') {
    // Survivor: feste Figur aus dem zweiten Bogen (160er Felder)
    const l2 = figurVorlage.liste2;
    if (!l2 || !figurVorlage.bild2.complete) return;
    const nr = l2.bilder.sv_pistole_idle[0], F = l2.feld, sx = (nr % l2.spalten) * F, sy = Math.floor(nr / l2.spalten) * F;
    const fn = l2.bilder.sv_fuesse_idle[0], fx = (fn % l2.spalten) * F, fy = Math.floor(fn / l2.spalten) * F;
    ctx.save(); ctx.translate(80, 112); ctx.rotate(-Math.PI / 2); ctx.scale(1.12, 1.12);
    ctx.drawImage(figurVorlage.bild2, fx, fy, F, F, -F / 2, -F / 2, F, F);
    ctx.drawImage(figurVorlage.bild2, sx, sy, F, F, -F / 2, -F / 2, F, F);
    ctx.restore();
    return;
  }
  if (istHeld(meinAussehen.g)) {
    // Held/Heldin: Füße (Stiefel, ungefärbt) + umgefärbter Körper aus dem Gemini-Bogen
    const l3 = figurVorlage.liste3;
    if (!l3 || !figurVorlage.bild3.complete) return;
    const gg = meinAussehen.g === 'f' ? 'w' : 'm', F = l3.feld, fn = l3.bilder[`held_${gg}_stiefel_stehen`][0];
    ctx.save(); ctx.translate(80, 112); ctx.rotate(-Math.PI / 2); ctx.scale(1.2, 1.2); ctx.translate(-80, -80);
    ctx.drawImage(figurVorlage.bild3, (fn % l3.spalten) * F, Math.floor(fn / l3.spalten) * F, F, F, 0, 0, F, F);
    umgefaerbt(ctx, figurVorlage.bild3, F, l3.bilder[`held_${gg}_leer`][0], l3.spalten, 0, 0, meinAussehen);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(80, 80); ctx.rotate(-Math.PI / 2); ctx.scale(1.45, 1.45); ctx.translate(-80, -80);   // nach oben schauend, vergrößert
  umgefaerbt(ctx, figurVorlage.bild, l.feld, l.bilder[(meinAussehen.g === 'w' ? 'frau' : 'mann') + '_hand'][0], 8, 0, 0, meinAussehen);
  ctx.restore();
}
function figurWahlAufbauen() {
  const markieren = (speichern = true) => {
    document.querySelectorAll('.geschlecht button').forEach(b => b.classList.toggle('an', b.dataset.g === meinAussehen.g));
    [...$('haarwahl').children].forEach((b, i) => b.classList.toggle('an', i === meinAussehen.haar));
    [...$('kleidwahl').children].forEach((b, i) => b.classList.toggle('an', i === meinAussehen.kleid));
    if (speichern) { aussehenAngefasst = true; try { localStorage.setItem('zob_aussehen', aussehenText(meinAussehen)); } catch {} }   // nur nach echter Wahl, nicht beim Aufbau
    vorschauZeichnen();
  };
  document.querySelectorAll('.geschlecht button').forEach(b => { b.onclick = () => { meinAussehen.g = b.dataset.g; markieren(true); }; });
  for (const [box, farben, feld] of [[$('haarwahl'), HAARFARBEN, 'haar'], [$('kleidwahl'), KLEIDFARBEN, 'kleid']]) {
    farben.forEach((f, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = f.name; b.setAttribute('aria-label', f.name);
      b.style.background = `rgb(${f.rgb.join(',')})`;
      b.onclick = () => { meinAussehen[feld] = i; markieren(true); };
      box.appendChild(b);
    });
  }
  markieren(false);
}
figurWahlAufbauen();
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') mitspielen(); });
nameFeld.addEventListener('keydown', e => { if (e.key === 'Enter') mitspielen(); });
// Nach dem automatischen Neuladen (Welt wich ab) gleich wieder beitreten, statt auf der Anmeldung zu landen
try {
  if (sessionStorage.getItem('zob_autostart') === '1') {
    sessionStorage.removeItem('zob_autostart');
    { const pw = sessionStorage.getItem('zob_testpwtmp'); sessionStorage.removeItem('zob_testpwtmp'); if (pw && $('testpw')) { $('testpw').value = pw; $('testzugang').open = true; } }
    if (nameFeld.value.trim()) setTimeout(() => { ton.tonStarten(); mitspielen(); }, 0);
    else ladenAus();   // Ladeanzeige aus index.html wieder weg, wenn kein Name gemerkt ist
  }
} catch { ladenAus(); }

// Gepanzerter Schulbus von oben (Front rechts, Länge 124 px): knallgelb-orange, Warnstreifen, Gitter vor den Fenstern, Gewehrläufe, rotes Dachschild
function zeichneSchulbus(c, breit, hoch) {
  const L = 124, B = 30, x0 = (breit - L) / 2, y0 = (hoch - B) / 2, mx = breit / 2, my = hoch / 2;
  // Gewehrläufe seitlich aus den Fenstern (unter dem Aufbau gezeichnet, ragen heraus)
  c.strokeStyle = '#1c1c1c'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (const fx of [26, 50, 74, 98]) for (const sg of [-1, 1]) {
    const px = x0 + fx, py = my + sg * (B / 2 - 3);
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + 9, py + sg * 7); c.stroke();
  }
  c.lineCap = 'butt';
  // Karosserie
  c.fillStyle = '#ffb300'; c.beginPath(); c.roundRect(x0, y0, L, B, 6); c.fill();
  c.fillStyle = '#ff8f00'; c.fillRect(x0 + 3, y0 + 2, L - 6, 3); c.fillRect(x0 + 3, y0 + B - 5, L - 6, 3);
  // Dach: Stahlplatten mit Nieten
  c.fillStyle = '#ffca28'; c.fillRect(x0 + 14, y0 + 6, L - 36, B - 12);
  c.strokeStyle = '#6d4c00'; c.lineWidth = 1;
  for (let x = x0 + 14; x <= x0 + L - 22; x += 20) { c.beginPath(); c.moveTo(x, y0 + 6); c.lineTo(x, y0 + B - 6); c.stroke(); }
  c.fillStyle = '#5d4037';
  for (let x = x0 + 16; x < x0 + L - 24; x += 20) for (const yy of [y0 + 8, y0 + B - 8]) c.fillRect(x, yy - 0.7, 1.6, 1.6);
  // Fenster mit Gitter und Stahlklappen
  for (const sg of [0, 1]) {
    const yy = sg ? y0 + B - 5.5 : y0 + 1.5;
    for (let x = x0 + 18; x < x0 + L - 26; x += 24) {
      c.fillStyle = '#1b1b1b'; c.fillRect(x, yy, 18, 4);
      c.strokeStyle = '#9e9e9e'; c.lineWidth = 0.8;
      for (let g = x + 2; g < x + 18; g += 3) { c.beginPath(); c.moveTo(g, yy); c.lineTo(g, yy + 4); c.stroke(); }
      c.fillStyle = '#78909c'; c.fillRect(x + 19, yy, 4, 4);
    }
  }
  // Windschutzscheibe (vergittert) und Front
  c.fillStyle = '#1b1b1b'; c.fillRect(x0 + L - 9, y0 + 4, 5, B - 8);
  c.strokeStyle = '#9e9e9e'; c.lineWidth = 0.8;
  for (let y = y0 + 6; y < y0 + B - 4; y += 4) { c.beginPath(); c.moveTo(x0 + L - 9, y); c.lineTo(x0 + L - 4, y); c.stroke(); }
  // Warnstreifen Front und Heck
  for (const xs of [x0 + L - 3, x0]) {
    c.save(); c.beginPath(); c.rect(xs, y0, 3, B); c.clip();
    c.fillStyle = '#ffd600'; c.fillRect(xs, y0, 3, B); c.fillStyle = '#111';
    for (let y = y0 - 4; y < y0 + B + 4; y += 6) { c.beginPath(); c.moveTo(xs, y); c.lineTo(xs + 3, y + 3); c.lineTo(xs + 3, y + 6); c.lineTo(xs, y + 3); c.fill(); }
    c.restore();
  }
  for (const [xs, w] of [[x0 + 4, 9], [x0 + L - 18, 9]]) {
    c.save(); c.beginPath(); c.rect(xs, y0 + 7, w, B - 14); c.clip();
    c.fillStyle = '#ffd600'; c.fillRect(xs, y0 + 7, w, B - 14); c.fillStyle = '#111';
    for (let y = y0; y < y0 + B + 10; y += 7) { c.beginPath(); c.moveTo(xs, y); c.lineTo(xs + w, y - 5); c.lineTo(xs + w, y - 2); c.lineTo(xs, y + 3); c.fill(); }
    c.restore();
  }
  c.strokeStyle = '#3e2723'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(x0 + 0.75, y0 + 0.75, L - 1.5, B - 1.5, 6); c.stroke();
  // großes rotes Dachschild
  c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 3; c.strokeStyle = '#fff'; c.strokeText('EVAKUIERUNG', mx - 2, my);
  c.fillStyle = '#d50000'; c.fillText('EVAKUIERUNG', mx - 2, my + 0.5);
}

// ---------- Ladebildschirm ----------
function ladenZeigen(prozent, text, titel = '') {
  const el = $('laden'); if (!el) return;
  el.classList.add('an');
  $('ladentitel').textContent = titel;
  $('ladentext').textContent = text;
  $('ladefuell').style.width = Math.max(0, Math.min(100, prozent)) + '%';
  $('ladeprozent').textContent = `${Math.round(prozent)} %`;
}
function ladenAus() { $('laden')?.classList.remove('an'); }
const einFrame = () => new Promise(ok => requestAnimationFrame(() => setTimeout(ok, 30)));

async function mitspielen() {
  sprache.vorbereiten();   // AudioContext in der Nutzergeste (iOS), auch beim Start mit Enter
  const name = nameFeld.value.trim();
  if (!name) { $('fehler').textContent = 'Bitte gib einen Namen ein.'; nameFeld.focus(); return; }
  if (await veraltet()) { frischLaden(true); return; }   // Server wurde aktualisiert: erst frischen Code laden
  const code = $('code').value.trim();
  try { localStorage.setItem('zob_name', name); localStorage.setItem('zob_code', code); } catch {}
  $('los').disabled = true;
  ladenZeigen(5, 'Generiere Welt … verbinde mit dem Server');
  $('fehler').textContent = '';
  $('fehler').classList.remove('gut');
  try {
    const client = new Colyseus.Client(BASIS);
    let r = null;
    let token = null;
    try { token = sessionStorage.getItem('zob_token'); } catch {}
    const testpw = ($('testpw')?.value ?? '').slice(0, 200);   // Testzugang: nur beim Beitritt gesendet, nirgends gespeichert
    if (token && !TUT.an && !testpw) { try { r = await client.reconnect(token); } catch { r = null; } }   // mit Testzugang kein reconnect (dort läuft kein onAuth)
    const beitritt = { name, code, ...(testpw ? { testzugang: testpw } : {}), spielerId: spielerId(), aussehen: aussehenText(meinAussehen), aussehenGewaehlt: aussehenAngefasst };
    if (!r) r = TUT.an ? await client.create('schiessstand', beitritt) : await client.joinOrCreate('zombies', beitritt);   // Schießstand: eigener Raum, nichts für die Hauptwelt
    raum = r;
    ladenZeigen(15, 'Generiere Welt … verbunden');
    ton.musikAusblenden(4);   // Startmusik sanft ausblenden
    meineId = r.sessionId;
    try { if (!TUT.an) sessionStorage.setItem('zob_token', r.reconnectionToken); } catch {}
    raum.onDrop(() => { $('verbindung').style.display = 'block'; });
    raum.onReconnect(() => {
      $('verbindung').style.display = 'none';
      try { sessionStorage.setItem('zob_token', raum.reconnectionToken); } catch {}
    });
    let abgeloest = false;
    raum.onMessage('abgeloest', () => {   // dieselbe Spieler-ID spielt jetzt in einem anderen Fenster weiter
      abgeloest = abgemeldet = true;
      try { sessionStorage.removeItem('zob_token'); } catch {}
      const v = $('verbindung');
      v.textContent = 'In einem anderen Fenster weitergespielt';
      v.style.display = 'block'; v.style.pointerEvents = 'none';
    });
    raum.onLeave(() => {
      try { sessionStorage.removeItem('zob_token'); } catch {}
      if (abgemeldet || abgeloest) return;
      // In der installierten App gibt es kein Neuladen per Wischen: Hinweis antippen lädt neu,
      // und kommt die App aus dem Hintergrund zurück, lädt sie von selbst neu
      const v = $('verbindung');
      v.textContent = '🔄 Verbindung beendet – hier tippen zum Weiterspielen';
      v.style.display = 'block'; v.style.pointerEvents = 'auto'; v.style.cursor = 'pointer'; v.style.padding = '14px 8px';
      v.onclick = () => location.reload();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) location.reload(); }, { once: true });
    });
    merkzettelAnschliessen(raum, { zombies_lautstaerke: v => ton.lautstaerkeSetzen(Number(v)) });   // Einstellungen je Spieler vom Server
    chatAnschliessen(raum);
    // Pi entlasten: Tab länger als 5 min im Hintergrund → abmelden (Fortschritt ist gespeichert), beim Zurückkommen neu laden
    let versteckTimer = null, autoGetrennt = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(versteckTimer);
        versteckTimer = setTimeout(() => { if (abgeloest) return; autoGetrennt = true; abgemeldet = true; try { raum.leave(true); } catch {} }, 5 * 60 * 1000);
      } else {
        clearTimeout(versteckTimer);
        if (autoGetrennt) location.reload();
      }
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
    await merkzettelErwarten(1500);   // gemerkte Einstellungen (Zoom, Liste, Karte …) vor dem Aufbau des Spiels übernehmen
    if (raum.state && raum.state.seed) starteSpiel();
    else raum.onStateChange.once(() => starteSpiel());
  } catch (e) {
    console.error(e);
    const text = String(e.message || e);
    if (/Zugangscode/.test(text)) { $('codeblock').hidden = false; $('fehler').textContent = 'Der Zugangscode stimmt nicht.'; $('code').focus(); }
    else if (/anderen Fenster/.test(text)) $('fehler').textContent = 'Du spielst schon in einem anderen Fenster oder Tab.';
    else $('fehler').textContent = 'Verbindung zum Spielserver fehlgeschlagen: ' + text;
    $('los').disabled = false;
    ladenAus();
  }
}
let abgemeldet = false;

// einklappbare Spielerliste
function oberflaecheEinrichten() {
  // Spielerliste: auf schmalen Bildschirmen standardmäßig zu, Wahl bleibt im Browser
  let zu = true;
  try { const v = localStorage.getItem('zob_liste'); if (v === '0') zu = false; else if (v === '1') zu = true; } catch { /* egal */ }
  const setze = z => { $('hud').classList.toggle('listezu', z); $('listeknopf').setAttribute('aria-expanded', String(!z)); };
  setze(zu);
  $('listeknopf').onclick = () => {
    zu = !$('hud').classList.contains('listezu'); setze(zu);
    try { localStorage.setItem('zob_liste', zu ? '1' : '0'); } catch { /* egal */ }
  };
  einstellungenEinrichten();
}

// ---------- Spieler-Einstellungen ----------
function einstellungenEinrichten() {
  const fenster = $('einstellungen');
  const auf = () => { markieren(); fenster.classList.add('offen'); };
  const zu = () => fenster.classList.remove('offen');
  const markieren = () => {
    for (const b of document.querySelectorAll('#eg-ton button')) b.classList.toggle('an', Number(b.dataset.v) === ton.lautstaerke());
    let a = '0.6'; try { a = localStorage.getItem('zob_kartealpha') ?? '0.6'; } catch { /* egal */ }
    for (const b of document.querySelectorAll('#eg-karte button')) b.classList.toggle('an', b.dataset.v === a);
    $('eg-hund').hidden = !eigenerHund(raum?.state?.hunde, meineId);   // „Hund wegschicken“ nur mit Hund
    kulisseSchalterZeigen();   // erst beim Öffnen prüfen: beim Seitenstart ist die Karte noch nicht geladen
    geraetMarkieren();
  };
  geraetEinstellungenEinrichten(markieren);
  $('einstellknopf').onclick = auf;
  $('einstellzu').onclick = zu;
  $('hundweg').onclick = () => { raum.send('hundWeg'); $('eg-hund').hidden = true; zu(); };
  fenster.addEventListener('click', e => { if (e.target === fenster) zu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') zu(); });
  for (const b of document.querySelectorAll('#eg-ton button')) b.onclick = () => {
    ton.tonStarten(); ton.lautstaerkeSetzen(Number(b.dataset.v)); markieren();
    $('einstellknopf').title = `Spieler-Einstellungen (Lautstärke ${ton.lautstaerke() ? Math.round(ton.lautstaerke() * 100) + ' %' : 'aus'})`;
  };
  const alpha = a => { document.documentElement.style.setProperty('--kartealpha', a); };
  try { alpha(localStorage.getItem('zob_kartealpha') ?? '0.6'); } catch { alpha('0.6'); }
  for (const b of document.querySelectorAll('#eg-karte button')) b.onclick = () => {
    alpha(b.dataset.v); try { localStorage.setItem('zob_kartealpha', b.dataset.v); } catch { /* egal */ } markieren();
  };
}

// ---------- Geräte-Einstellungen: Schießen per Knopf, Stimmen, Zombiegeräusche, Musik (client/einstellungen_regeln.mjs) ----------
let schiessModus = 'auto', feuerHalten = false;
// false nur im Modus „per Knopf“, solange der Knopf (oder die Leertaste) nicht gehalten wird; der Server schießt dann nicht
const feuerErlaubt = () => feuerErlaubtRegel(schiessModus, feuerHalten);
function feuerUiAnwenden() {
  document.body.classList.toggle('feuerknopf-an', schiessModus === 'knopf' && gestartet);
  if (schiessModus !== 'knopf') feuerSetzen(false);
}
function feuerSetzen(an) {
  feuerHalten = !!an;
  $('feuerknopf')?.classList.toggle('gedrueckt', feuerHalten);
}
// Kulisse-Schalter nur auf Karten mit Kulisse-Daten sichtbar (je Schalter nur, wenn die Daten dafür da sind)
function kulisseSchalterZeigen() {
  const da = kulisseVorhanden();
  $('eg-kulisse').hidden = !da;
  if (da) {
    $('eg-kul-boden-z').hidden = !kulHatFoto(); $('eg-kul-daecher-z').hidden = !kulHatDaecher(); $('eg-kul-gezeichnet-z').hidden = !kulHatGezeichnet();
    for (const [id, an] of [['boden', kulHatFoto()], ['daecher', kulHatDaecher()], ['gezeichnet', kulHatGezeichnet()]]) $('eg-kul-' + id).hidden = !an;
  }
}
function geraetEinstellungenEinrichten(markieren) {
  const lies = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const merke = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };
  const K = GERAET_SCHLUESSEL;
  kulisseSchalterZeigen();
  schiessModus = schiessModusLesen(lies(K.schiessen));
  const stimmenAnzeige = () => { const pr = Math.round(stimmenFaktorLesen(lies(K.stimmen)) * 100); $('eg-stimmen').value = String(pr); $('eg-stimmen-wert').textContent = pr + ' %'; };
  const gruppe = (id, wert, setzen, schluessel) => {
    for (const b of document.querySelectorAll(`#${id} button`)) b.onclick = () => { setzen(b.dataset.v); merke(schluessel, b.dataset.v); markieren(); };
    return () => { const w = wert(); for (const b of document.querySelectorAll(`#${id} button`)) b.classList.toggle('an', b.dataset.v === w); };
  };
  const marks = [
    gruppe('eg-schiessen', () => schiessModus, v => { schiessModus = schiessModusLesen(v); feuerUiAnwenden(); }, K.schiessen),
    gruppe('eg-kartenbild', () => kartenbildLesen(lies(K.kartenbild)), v => document.dispatchEvent(new CustomEvent('zob-kartenbild', { detail: kartenbildLesen(v) })), K.kartenbild),
    ...['boden', 'gezeichnet', 'daecher', 'schatten'].map(w => gruppe('eg-kul-' + w, () => (kulisse()?.an[w] ? 'an' : 'aus'),
      v => { const k = kulisse(); if (!k) return; k.an[w] = anAusLesen(v); document.dispatchEvent(new CustomEvent('zob-kulisse')); }, KUL_SCHLUESSEL[w])),
    gruppe('eg-zombieton', () => (anAusLesen(lies(K.zombieTon)) ? 'an' : 'aus'), v => ton.zombieTonSetzen(anAusLesen(v)), K.zombieTon),
    gruppe('eg-musik', () => (anAusLesen(lies(K.musik)) ? 'an' : 'aus'), v => { ton.tonStarten(); ton.musikSetzen(anAusLesen(v)); }, K.musik),
  ];
  $('eg-stimmen').oninput = e => { merke(K.stimmen, e.target.value); sprache.stimmenFaktorSetzen(e.target.value); stimmenAnzeige(); };
  // beim Öffnen des Menüs die Markierungen nachziehen (markieren() ruft der Aufrufer auf)
  geraetMarkieren = () => { marks.forEach(m => m()); stimmenAnzeige(); };
  geraetMarkieren();
  ton.zombieTonSetzen(anAusLesen(lies(K.zombieTon)));
  sprache.stimmenFaktorSetzen(lies(K.stimmen) ?? 100);
  // Feuerknopf: Halten = Feuer frei (Touch, Maus), Leertaste am PC
  const fk = $('feuerknopf');
  fk.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { fk.setPointerCapture(e.pointerId); } catch { /* egal */ } feuerSetzen(true); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) fk.addEventListener(t, () => feuerSetzen(false));
  fk.addEventListener('contextmenu', e => e.preventDefault());
  const tippt = () => document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  document.addEventListener('keydown', e => { if (e.code === 'Space' && schiessModus === 'knopf' && !tippt()) { e.preventDefault(); feuerSetzen(true); } });
  document.addEventListener('keyup', e => { if (e.code === 'Space') feuerSetzen(false); });
  window.addEventListener('blur', () => feuerSetzen(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) feuerSetzen(false); });
  feuerUiAnwenden();
}
let geraetMarkieren = () => {};

let VORWELT = null;   // { seed, autos, p: Promise<{ welt, quelle }|null> } – Welt aus Worker/IndexedDB
let gestartet = false;
async function starteSpiel() {
  if (gestartet) return;
  gestartet = true;
  feuerUiAnwenden();
  ladenZeigen(25, 'Generiere Welt … lade Karte');
  if (raum.state.karte) {
    try { KARTE = await (await fetch(`${ASSETS}karten/${raum.state.karte}.json`)).json(); }
    catch (e) { console.error('Karte nicht geladen', e); }
  }
  if (raum.state.karte) { try { await ladeKulisse(raum.state.karte); } catch (e) { console.error('Kulisse nicht geladen', e); } }   // Luftbild/Dächer/Schatten, falls die Karte Kulisse-Daten hat
  ladenZeigen(40, 'Generiere Welt … Karte geladen');
  // Welt schon jetzt im Web Worker bauen bzw. aus IndexedDB holen (läuft parallel zum Laden der Bilder und Töne); create() wartet darauf
  if (KARTE && !TUT.an) {
    const seed = raum.state.seed, autos = (raum.state.autos ?? 10) / 10;
    VORWELT = { seed, autos, t0: performance.now(), p: weltBeschaffen(KARTE, seed, autos).catch(e => { console.error('Welt-Vorbau', e); return null; }) };
  }
  $('start').style.display = 'none';
  $('hud').style.display = 'block';
  $('unten').style.display = 'flex';
  oberflaecheEinrichten();
  const spielObj = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#1b2a1b',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 3 },
    scene: [Ort],
  });
  bildschirmDrehenEinrichten(spielObj);
  sprache.starte({ raum, meineId, welt: () => chatSzene?.welt ?? null, meldung });
}

// Drehen/Größenänderung (Tablet): Canvas auf die echte Fenstergröße bringen, Zoom und Chunks neu berechnen.
// Mobile Browser melden nach dem Drehen oft zuerst alte Maße → entprellt nach 250 ms und nochmal nach 600 ms.
function bildschirmDrehenEinrichten(game) {
  const messen = () => {
    const vv = window.visualViewport;
    const b = Math.round(vv?.width || window.innerWidth), h = Math.round(window.innerHeight || vv?.height);
    if (!(b > 0 && h > 0)) return;
    window.scrollTo(0, 0);
    if (game.scale.width !== b || game.scale.height !== h) game.scale.resize(b, h);
    game.scale.refresh();
    const ort = game.scene.getScene('ort') ?? game.scene.scenes[0];
    try { ort?.passeZoomAn?.(); ort?.chunksAktualisieren?.(); ort?.uebersichtZeichnen?.(); } catch { /* Szene noch nicht bereit */ }
  };
  let t1 = 0, t2 = 0;
  const plane = () => { clearTimeout(t1); clearTimeout(t2); t1 = setTimeout(messen, 250); t2 = setTimeout(messen, 600); };
  window.addEventListener('orientationchange', plane);
  window.addEventListener('resize', plane);
  window.visualViewport?.addEventListener('resize', plane);
  screen.orientation?.addEventListener?.('change', plane);
  window.__messen = messen;
}

// Rechteck im Koordinatensystem eines geparkten Autos (wie autoVonOben gedreht): längs von a bis b, quer ±halb
function autoFlaeche(g, b, a, e, halb) {
  const w = (Number.isFinite(b.winkel) ? b.winkel : b.senkrecht ? Math.PI / 2 : 0) + ((b.farbe + Math.round(b.x)) % 2 ? Math.PI : 0);
  const c = Math.cos(w), s = Math.sin(w), p = (x, y) => ({ x: b.x + x * c - y * s, y: b.y + x * s + y * c });
  g.fillPoints([p(a, -halb), p(e, -halb), p(e, halb), p(a, halb)], true);
}

// ---------- Bildschirmtastatur: Oberfläche über der Tastatur halten (visualViewport) ----------
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const an = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const root = document.documentElement.style;
    root.setProperty('--kb', kb + 'px');
    root.setProperty('--vvtop', Math.round(vv.offsetTop) + 'px');
    document.body.classList.toggle('tastatur', kb > 80);
    if (kb > 80) { const l = $('chatliste'); if (l) l.scrollTop = l.scrollHeight; }
  };
  vv.addEventListener('resize', an); vv.addEventListener('scroll', an);
  document.addEventListener('focusin', e => {
    if (e.target?.matches?.('input, textarea')) setTimeout(() => { an(); try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* egal */ } }, 300);
  });
  document.addEventListener('focusout', () => setTimeout(() => { an(); window.scrollTo(0, 0); }, 100));
  an();
})();

// ---------- Meldungen und Anzeige ----------
let suAn = false;
const anzeigeName = p => (p.su ? '⭐ ' : '') + (p.afk && !p.name.includes('🤖') ? p.name + ' 🤖' : p.name);   // ⭐ = Superuser (Testzugang)

// ---------- Superuser-Testmenü (nur sichtbar, wenn der Server die Anmeldung bestätigt hat; der Server prüft jeden Befehl) ----------
function suMenueEinrichten(szene) {
  const knopf = $('suknopf');
  let fenster = $('sumenue');
  if (!fenster) {
    fenster = document.createElement('div'); fenster.id = 'sumenue';
    const b = (befehl, text, extra = {}) => `<button type="button" data-su='${JSON.stringify({ befehl, ...extra })}'>${text}</button>`;
    const bs = (befehl, text) => `<button type="button" class="umschalter" data-schalter="${befehl}" data-text="${text}" data-su='${JSON.stringify({ befehl })}'>${text}: …</button>`;   // Umschalter: zeigt AN/AUS vom Server
    fenster.innerHTML = `<div class="fenster"><div class="kopfzeile"><b>☰ Testmenü</b><button type="button" id="suzu" aria-label="Schließen">✕</button></div>
      <div class="titel">Springen</div>
      <button type="button" data-flug="1">🎥 Kameraflug</button>
      ${b('bw', '🎖 Zur Bundeswehr')}${b('evak', '📍 Zum Evakuierungspunkt')}${b('horde_hin', '🧟 Zur Zombiehorde (50 m davor)')}
      <div class="titel">Bots und Ausrüstung</div>
      ${b('bots', '🤖 Alle Bots zu mir (heilen)')}${b('auffuellen', '🎒 Ausrüstung auffüllen')}${bs('unsterblich', '⭐ Unsterblich')}
      <div class="titel">Horde jetzt starten</div>
      <div class="zeile">${b('horde', '50', { groesse: 50 })}${b('horde', '200', { groesse: 200 })}${b('horde', '500', { groesse: 500 })}</div>
      ${bs('hordeanzeige', '🎯 Horden-Ziele anzeigen')}
      <button type="button" class="umschalter" data-hind="1" data-text="🧱 Hindernisse zeigen">🧱 Hindernisse zeigen: AUS</button>
      <div class="titel">Tageszeit</div>
      <div class="zeile">${b('zeit', '☀️ 12:00', { stunde: 12 })}${b('zeit', '🌙 23:00', { stunde: 23 })}</div>
      ${bs('nebel', '🌫 Nebel')}
      <div class="titel">Verkehr</div>
      ${b('unfall', '💥 Unfall in der Nähe auslösen')}
      <div class="titel">Zeitraffer</div>
      <div class="zeile">${[1, 5, 10, 60].map(n => b('zeitraffer', `⏩ ${n}×`, { faktor: n }).replace('<button ', `<button data-zr="${n}" `)).join('')}</div>
      <div class="titel">Evakuierung und Lager</div>
      ${b('evakrufen', '🚌 Evakuierung sofort rufen')}${b('alleaufgaben', '✅ Alle Aufgaben erledigt')}
      <div class="zeile">${b('lager', '💥 Lager fallen', { zustand: 'gefallen' })}${b('lager', '🎖 Lager aufbauen', { zustand: 'steht' })}</div>
      <div class="titel">Level springen (Test)</div>
      <div class="zeile">${[1, 2, 3, 4, 5].map(n => b('level', `Level ${n}`, { level: n })).join('')}</div>
      ${b('countdown', '☢️ Countdown auf 60 s (nur Andermatt)', { sekunden: 60 })}</div>`;
    document.body.appendChild(fenster);
    const zu = () => fenster.classList.remove('offen');
    fenster.querySelector('#suzu').onclick = zu;
    fenster.addEventListener('click', e => {
      if (e.target === fenster) return zu();
      if (e.target.closest('button[data-flug]')) { zu(); szene?.flug?.starten(); return; }
      if (e.target.closest('button[data-hind]')) { hindernisAn = !hindernisAn; hindernisKnopf(); return; }   // rein lokal, kein Server
      const bt = e.target.closest('button[data-su]');
      if (!bt) return;
      try { raum?.send('su', JSON.parse(bt.dataset.su)); } catch { /* egal */ }
      if (!bt.dataset.schalter && !bt.dataset.zr) zu();   // Umschalter bleiben offen: der Zustand springt sichtbar um
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') zu(); });
  }
  knopf.style.display = 'block';
  const ue = szene?.uebersicht; if (ue) ue.hinSpringen = (x, y) => raum?.send('su', { befehl: 'hin', x: Math.round(x), y: Math.round(y) });   // Karte: Rechtsklick/langer Druck → Hierhin springen
  if (suStatusRaum !== raum) {
    suStatusRaum = raum;
    raum?.onMessage('suStatus', st => suStatusZeigen(st));
  }
  knopf.onclick = () => { fenster.classList.add('offen'); try { raum?.send('su', { befehl: 'status' }); } catch { /* egal */ } };   // beim Öffnen den echten Zustand holen
}

// Zustand der Umschalter im Testmenü anzeigen (AN grün, AUS grau); Werte kommen als 'suStatus' vom Server
let suStatusRaum = null;
let hindernisAn = false;   // „Hindernisse zeigen“ (nur lokal, nur Superuser)
function hindernisKnopf() {
  const bt = $('sumenue')?.querySelector('button[data-hind]'); if (!bt) return;
  bt.textContent = `${bt.dataset.text}: ${hindernisAn ? 'AN' : 'AUS'}`;
  bt.classList.toggle('an', hindernisAn); bt.setAttribute('aria-pressed', hindernisAn ? 'true' : 'false');
}
function suStatusZeigen(st) {
  const f = $('sumenue'); if (!f || !st) return;
  hindernisKnopf();
  for (const bt of f.querySelectorAll('button[data-schalter]')) {
    const an = !!st[bt.dataset.schalter];
    bt.textContent = `${bt.dataset.text}: ${an ? 'AN' : 'AUS'}`;
    bt.classList.toggle('an', an); bt.setAttribute('aria-pressed', an ? 'true' : 'false');
  }
  for (const bt of f.querySelectorAll('button[data-zr]')) {
    const an = Number(bt.dataset.zr) === Number(st.zeitraffer ?? 1);
    bt.classList.toggle('an', an); bt.setAttribute('aria-pressed', an ? 'true' : 'false');
  }
}

function meldung(text, lang = false) {
  const d = document.createElement('div'), box = $('meldungen');
  d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 2) box.firstElementChild.remove();   // höchstens zwei auf einmal
  // Lesezeit nach Länge: ~14 Zeichen/s, mindestens wie bisher, höchstens 15 s
  const zeit = Math.min(15000, Math.max(lang ? 2800 : 1600, 1200 + String(text).length * 70));
  setTimeout(() => { d.style.opacity = '0'; }, zeit);
  setTimeout(() => d.remove(), zeit + 500);
}

// ---------- Chat (Nachrichten 'chat' / 'chatVerlauf' vom Server) ----------
let chatSzene = null, chatUngelesen = 0;
const chatOffen = () => $('chat').classList.contains('offen');
// beim Tippen im Chat: Spieltasten aus UND Phasers Tastenfang lösen (sonst schluckt er W, A, S, D, E, Leertaste, Umschalt)
function chatTasten(an) {
  const k = chatSzene?.input?.keyboard;
  if (!k) return;
  k.enabled = an;
  if (an) k.enableGlobalCapture(); else { k.disableGlobalCapture(); k.resetKeys?.(); }
}

function chatZaehler() {
  const z = $('chatzaehler');
  z.textContent = chatUngelesen > 99 ? '99+' : String(chatUngelesen);
  z.style.display = chatUngelesen ? 'block' : 'none';
}

function chatZeile(n) {
  const d = document.createElement('div');
  d.className = 'nachricht' + (n.ich ? ' ich' : '');
  if (!n.ich) {
    const a = document.createElement('div');
    a.className = 'absender'; a.textContent = n.name;
    a.style.color = css(FARBEN[(Number(n.farbe) || 0) % FARBEN.length]);
    d.appendChild(a);
  }
  const t = document.createElement('div');
  t.textContent = n.text;
  const f = document.createElement('div');
  f.className = 'fuss';
  const z = new Date(n.zeit);
  f.textContent = String(z.getHours()).padStart(2, '0') + ':' + String(z.getMinutes()).padStart(2, '0') + (n.ort ? ' · ' + n.ort : '');
  d.append(t, f);
  return d;
}

function chatAnhaengen(n) {
  const liste = $('chatliste');
  liste.querySelector('.leer')?.remove();
  const unten = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 40;
  liste.appendChild(chatZeile(n));
  while (liste.children.length > 100) liste.firstElementChild.remove();
  if (unten || n.ich) liste.scrollTop = liste.scrollHeight;
}

function chatOeffnen() {
  $('chat').classList.add('offen');
  chatUngelesen = 0; chatZaehler();
  $('chatliste').scrollTop = $('chatliste').scrollHeight;
  // Tastatur erst auf Tipp ins Eingabefeld; am PC mit Maus/Tastatur gleich fokussieren
  if (window.matchMedia?.('(pointer: fine)').matches) $('chattext').focus();
}
function chatSchliessen() {
  if (!chatOffen()) return;
  $('chat').classList.remove('offen');
  $('chattext').blur();
  chatTasten(true);
}

function chatAnschliessen(raum) {
  $('chatknopf').style.display = 'block';
  $('chatknopf').onclick = () => (chatOffen() ? chatSchliessen() : chatOeffnen());
  $('chatzu').onclick = chatSchliessen;
  $('chatform').onsubmit = e => {
    e.preventDefault();
    const text = $('chattext').value.trim();
    if (!text) return;
    raum.send('chat', { text });
    $('chattext').value = '';
  };
  // solange getippt wird, steuern Tasten nicht die Spielfigur
  $('chattext').addEventListener('focus', () => chatTasten(false));
  $('chattext').addEventListener('blur', () => chatTasten(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && chatOffen()) chatSchliessen(); });
  // eigene Nachrichten erkennt man an der Kurzkennung, die der Server beim Beitritt schickt (ältere: am Namen)
  const meinName = () => raum.state?.spieler?.get?.(meineId)?.name;
  let meineKennung = '';
  const vonMir = n => meineKennung && n.von ? n.von === meineKennung : n.name === meinName();
  const verlaufZeigen = liste => {
    $('chatliste').replaceChildren();
    if (!liste.length) {
      const l = document.createElement('div'); l.className = 'leer'; l.textContent = 'Noch keine Nachrichten'; $('chatliste').appendChild(l);
    }
    for (const n of liste) chatAnhaengen({ ...n, ich: vonMir(n) });
    $('chatliste').scrollTop = $('chatliste').scrollHeight;
  };
  raum.onMessage('baumTempo', v => { if (Number.isFinite(v)) baumTempoWert = v; });   // Einstellung „Tempo unter Bäumen“ (%), für die Vorhersage
  raum.onMessage('chatVerlauf', m => {
    const liste = m.nachrichten ?? [];
    meineKennung = m.ich ?? '';
    if (meinName()) verlaufZeigen(liste);
    else raum.onStateChange.once(() => verlaufZeigen(liste));   // Zustand ist noch nicht da
  });
  raum.onMessage('chat', n => {
    const ich = vonMir(n);
    chatAnhaengen({ ...n, ich });
    if (ich) return;
    ton.nachricht();
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* nicht verfügbar */ }
    if (chatOffen()) return;
    chatUngelesen++; chatZaehler();
    const kurz = n.text.length > 60 ? n.text.slice(0, 59) + '…' : n.text;
    meldung(`💬 ${n.name}: ${kurz}`);
  });
}

function zeitText(s) {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = Math.floor(s % 60);
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

const dingText = d => `${DINGE[d]?.zeichen ?? '?'} ${DINGE[d]?.name ?? d}`;

// ---------- Szene ----------
const GRAFIK = ['baum_gross', 'baum_klein', 'baum_herbst', 'baum_herbst_klein', 'busch', 'busch_herbst', 'fels1', 'fels2', 'kiste'];
// Figuren (Kenney „Topdown Shooter“, CC0): je Spielerfarbe eine Person
const MENSCH_GROESSE = 0.42, ZOMBIE_GROESSE = 0.42, BOGEN2_GROESSE = 0.476;   // figuren2: 160er Felder
// Größen: ALLE Menschen (Spieler m/w/s/Held/Heldin, Bots, Bewohner, Soldaten, Ärzte, Verwundete) sind bei 100 % gleich
// breit (Schulterbreite, Ausgleich je Bild in groessen.mjs). Menschengröße × Gesamtgröße = mg(); Zombies zusätzlich × Zombiegröße,
// Leichen folgen der Zombiegröße. Kollisionsradien bleiben unberührt.
// Blickrichtung von Zombies und Bewohnern: Server schickt 256 Stufen (rq), ältere Stände das Bogenmaß
// Zombies in der Nähe: Sieht man keinen (z. B. drinnen), schickt der Server die Liste gar nicht – dann leer
const LEERE_KARTE = new Map();
const zombieKarte = () => raum?.state?.zombies ?? LEERE_KARTE;
const fzRichtung = f => (typeof f.rq === 'number' ? ausStufe(f.rq) : f.richtung ?? 0);   // Fahrzeuge: ebenfalls 256 Stufen
const zRichtung = o => (typeof o.rq === 'number' ? ausStufe(o.rq) : o.richtung ?? 0);
let baumTempoWert = 25;
// Maßstäbliche Innenräume: in Innenräumen mit 1-m-Raster (8 px = 1 m) erscheinen Figuren nur halb so groß (Schulterbreite sonst 1,1 m statt ~0,5 m)
const INNEN_FIGUR = 0.5;
let szeneRef = null;   // die laufende Spielszene (für Größenfaktor drinnen)
const innenFigur = () => (szeneRef?.feinInnen() ? INNEN_FIGUR : 1);
const mg = () => ((raum.state?.menschenGroesse || 100) / 100) * ((raum.state?.groesseGesamt || 70) / 100) * innenFigur();
const zg = () => mg() * ((raum.state?.zombieGroesse || 100) / 100);
const VERWUNDET_GROESSE = 0.42 * 1.26;
const ZOMBIE_TYPEN = ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose', 'z6', 'z7',
  'kaminkehrer', 'bauarbeiter', 'koch', 'holzfaeller', 'mechaniker', 'brandmeister', 'kehrer', 'strassenarbeiter', 'baecker', 'flanell', 'werkstatt', 'vogelscheuche', 'postbote', 'streife', 'wachtmeister', 'landstreicher', 'mantel', 'langhaar'];   // z6/z7 aus figuren2 (Riley Gombart), ab 'kaminkehrer' aus figuren3 (Gemini)
const GEMINI_TYPEN = new Set(ZOMBIE_TYPEN.slice(7));
const GEMINI_LEICHEN = ['hemd', 'tarn', 'lederhose', 'dirndl', 'feuerwehr'];   // Sterbebilder: vorhandene Leichen, nach Typ gewählt
const ZIEL_NAMEN = { pharmacy: 'Apotheke', chemist: 'Drogerie', doctors: 'Arzt', dentist: 'Zahnarzt', medical_supply: 'Sanitätshaus', supermarket: 'Supermarkt', convenience: 'Laden', bakery: 'Bäcker', butcher: 'Metzger', kiosk: 'Kiosk', beverages: 'Getränke', greengrocer: 'Gemüse', department_store: 'Kaufhaus', hardware: 'Baumarkt', doityourself: 'Baumarkt', sports: 'Sport', outdoor: 'Outdoor',
  apotheke: 'Apotheke', lebensmittel: 'Lebensmittel', kaufhaus: 'Kaufhaus' };
const ZIEL_SYMBOL = { apotheke: '💊', lebensmittel: '🛒', kaufhaus: '🔦' };
const HELD_HALTUNGEN = ['leer', 'pistole', 'gewehr', 'messer', 'lampe', 'pistole_lampe', 'gewehr_lampe', 'messer_lampe',
  'schrotflinte', 'mp', 'mg', 'armbrust', 'scharfschuetze', 'granatwerfer', 'sense', 'schlaeger', 'handgranate', 'faust'];   // ab 'schrotflinte': eigene Bilder ohne Lampen-Variante
const HELD_WAFFE = { pistole: 'pistole', gewehr: 'gewehr', schrotflinte: 'schrotflinte', mp: 'mp', mg: 'mg', armbrust: 'armbrust', scharfschuetze: 'scharfschuetze', schlaeger: 'schlaeger', sense: 'sense', messer: 'messer', brechstange: 'messer', granatwerfer: 'granatwerfer', handgranate: 'handgranate', faust: 'faust' };   // sonst keine Waffe in der Hand
const SV_WAFFE = { pistole: 'pistole', gewehr: 'gewehr', schrotflinte: 'schrot', messer: 'messer', mp: 'pistole', mg: 'gewehr', armbrust: 'gewehr', scharfschuetze: 'gewehr', granatwerfer: 'gewehr' };   // sonst Taschenlampe

class Ort extends Phaser.Scene {
  constructor() { super('ort'); }

  preload() {
    if (ASSETS) this.load.setBaseURL(ASSETS);   // Grafiken aus dem versionierten Ordner (lange zwischengespeichert)
    this.load.on('progress', v => ladenZeigen(40 + 30 * v, 'Generiere Welt … lade Grafiken'));
    for (const g of GRAFIK) this.load.image(g, 'grafik/' + g + '.png');
    // Figuren aus den KI-Bögen (tools/figuren_schneiden.py): 160er-Felder, Drehpunkt in der Feldmitte
    this.load.spritesheet('figuren', 'grafik/figuren.png', { frameWidth: 160, frameHeight: 160 });
    this.load.json('figurenliste', 'grafik/figuren.json');
    // zweiter Bogen: Survivor, Zombies und Bürger von OpenGameArt (siehe grafik/LIZENZ.txt)
    this.load.spritesheet('figuren2', 'grafik/figuren2.webp', { frameWidth: 160, frameHeight: 160 });
    this.load.json('figurenliste2', 'grafik/figuren2.json');
    // dritter Bogen: 18 weitere Zombies (mit Google Gemini erzeugt, tools/gemini_zombies_schneiden.py)
    this.load.spritesheet('figuren3', 'grafik/figuren3.webp', { frameWidth: 160, frameHeight: 160 });
    this.load.json('figurenliste3', 'grafik/figuren3.json');
    // Helden (Gemini): Körper mit roten Haaren/blauer Jacke zum Umfärben + Stiefel als eigene Ebene
    this.load.spritesheet('helden160', 'grafik/helden160.webp', { frameWidth: 160, frameHeight: 160 });
    this.load.json('heldenliste', 'grafik/helden160.json');
    // Bewohner-Typen (Gemini, tools/gemini_buerger_schneiden.py): dick, oma, jogger …
    this.load.spritesheet('buerger160', 'grafik/buerger160.webp', { frameWidth: 160, frameHeight: 160 });
    this.load.json('buergerliste', 'grafik/buerger160.json');
    // Auto-Bogen (CC0, tools/autos_schneiden.py); fehlt er, bleiben die Autos gezeichnet
    this.load.spritesheet('hund', 'grafik/hund.webp', { frameWidth: 100, frameHeight: 100 });   // Begleiter-Hund (harrison-lord, CC-BY 3.0)
    this.load.json('hundliste', 'grafik/hund.json');
    this.load.image('autos', 'grafik/autos.webp');
    this.load.image('puma-wanne-bild', 'grafik/puma_wanne.webp');   // Draufsicht aus dem 3D-Modell (Bug rechts)
    this.load.image('puma-turm-bild', 'grafik/puma_turm.webp');
    this.load.json('autosliste', 'grafik/autos.json');
    evakLaden(this);   // Leopard 2A7, A400M (Draufsichten, siehe grafik/LIZENZ.txt)
    this.load.image('moebel', 'grafik/moebel.webp');
    this.load.json('moebelliste', 'grafik/moebel.json');
    // Gegenstands-Icons (Gemini, tools/dinge_bilder.py); fehlen sie, bleiben die Emojis
    this.load.image('dinge', 'grafik/dinge.webp');
    this.load.json('dingeliste', 'grafik/dinge.json');
  }

  create() {
    ladenZeigen(72, 'Generiere Welt … baue Häuser und Straßen');
    this.bereit = false;
    // erst einen Frame zeichnen lassen, damit die Anzeige sichtbar ist – das Bauen der Welt blockiert 1–2 s
    einFrame().then(async () => {
      this.vorwelt = null;
      if (VORWELT) {
        const w = await VORWELT.p;
        if (w && VORWELT.seed === raum.state.seed && VORWELT.autos === (raum.state.autos ?? 10) / 10) { this.vorwelt = w.welt; window.__weltQuelle = w.quelle; window.__weltMs = Math.round(performance.now() - VORWELT.t0); }
      }
      this.erzeuge(); this.bereit = true;
      if (TUT.an) tutorialStart(this, raum, meineId, { abmelden: () => { abgemeldet = true; } });   // Marken am Boden, Bedienfeld, Auswertung
      // Welt mit dem Server abgleichen (weicht sie ab, stehen Kisten und Wände woanders)
      try { raum.send('weltpruefung', { fp: this.weltFp, ua: navigator.userAgent, karte: raum.state.karte, seed: raum.state.seed, autos: raum.state.autos, b: BREITE, h: HOEHE, kartenB: KARTE?.breite, kartenH: KARTE?.hoehe }); } catch {}
    });
  }

  erzeuge() {
    const s = raum.state;
    // „Maßstäbliche Innenräume“: der Server gibt den Schalter vor (Einstellung); wird er umgeschaltet, lädt der Client neu
    if (!TUT.an) {
      setzeInnenFein(!!((s.optionen ?? 0) & 2)); setzeInnenTempo((((s.optionen ?? 0) >> 2) & 63) * 2 / 100);
      raum.onStateChange(st => {
        if (this.bereit && !!((st?.optionen ?? 0) & 2) !== INNEN_FEIN) setTimeout(() => location.reload(), 300);
        else setzeInnenTempo((((st?.optionen ?? 0) >> 2) & 63) * 2 / 100);   // Tempo drinnen kann im Spiel geändert werden
      });
    }
    if (TUT.an) { setzeKartengroesse(SS_B, SS_H); this.welt = baueSchiessstandWelt(); }   // Schießstand: kleine erzeugte Übungswelt
    else if (KARTE) { setzeKartengroesse(KARTE.breite, KARTE.hoehe); this.welt = this.vorwelt ?? baueWeltAusKarte(KARTE, s.seed, { autos: (s.autos ?? 10) / 10 }); this.vorwelt = null; }
    else { setzeKartengroesse(64, 48); this.welt = baueWelt(s.seed); }
    this.weltFp = weltFingerabdruck(this.welt);   // sofort nach dem Aufbau – später kommen Haufen, Leichen usw. aus dem Spielstand dazu
    try { setzeAutoBilder(this.textures.get('autos').getSourceImage(), this.cache.json.get('autosliste')); } catch { setzeAutoBilder(null, null); }   // vor den ersten Kartenstücken
    try { setzeMoebelBilder(this.textures.get('moebel').getSourceImage(), this.cache.json.get('moebelliste')); } catch { setzeMoebelBilder(null, null); }
    figurenVorzeichnen(this);
    try { setzeDingListe(this.cache.json.get('dingeliste')); dingRahmen(this); } catch {}
    ladenZeigen(85, 'Generiere Welt … zeichne Karte');
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
    this.hundAnz = new HundAnzeige(this, this.cache.json.get('hundliste'));   // Hunde (client/hund.mjs)
    this.busObj = new Map();
    this.leichen = new Map();
    this.bodenObj = new Map();
    this.kegel = this.add.graphics().setDepth(2);
    this.lokal = null;          // vorhergesagte eigene Position
    this.eingabe = { dx: 0, dy: 0, s: false };
    this.gesendet = { dx: 0, dy: 0, s: false, t: 0 };   // Eingabe, die seit t gilt (wird beim nächsten Senden mit ihrer Dauer gemeldet)
    this.offen = [];            // gesendete, vom Server noch nicht bestätigte Eingaben { n, dx, dy, s, d }
    this.eingabeNr = undefined; // laufende Nummer (beginnt bei der zuletzt bestätigten des Servers)
    this.basis = null; this.korr = { x: 0, y: 0 };   // Serverstand der letzten Vorhersage, Restfehler (klingt sanft ab)
    this.puffer = new NetzPuffer();   // Glättung fremder Figuren (client/netzpuffer.mjs)
    this.pufferPos = { x: 0, y: 0 };
    // Eingabe auch bei niedriger Bildrate (viele Zombies, weite Ansicht) alle 50 ms melden, nicht nur je Frame
    if (window.__eingabeTimer) clearInterval(window.__eingabeTimer);   // Szene neu gestartet: der alte Zeitgeber darf nicht weiter senden
    this.eingabeTimer = window.__eingabeTimer = setInterval(() => { if (this.tasten && this.joystick && this.bereit !== false && !document.hidden) { try { this.leseEingabe(); } catch {} } }, 50);
    this.kontext = null;

    const wb = BREITE * KACHEL, wh = HOEHE * KACHEL;
    this.cameras.main.setBounds(0, 0, wb, wh);
    this.passeZoomAn();
    this.scale.on('resize', () => this.passeZoomAn());

    this.tasten = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,Q,R,F,X,C,SPACE,ESC');
    this.tasten.E.on('down', () => this.aktion());
    this.tasten.Q.on('down', () => this.granateWerfen());
    this.tasten.C.on('down', () => this.alleSuchen());
    this.tasten.R.on('down', () => raum.send('nachladen'));            // Nachladen von Hand
    this.tasten.F.on('down', () => raum.send('waffenplatz', { weiter: true }));   // nächster Waffenplatz
    this.tasten.X.on('down', () => raum.send('faust'));   // Faust: nichts in der Hand (nochmal = zurück)
    this.tasten.SPACE.on('down', () => { if (this.kontext?.art !== 'aussteigen') this.aktion(); });   // Leertaste steigt nie versehentlich aus (E oder Knopf)
    chatSzene = this;
    this.tasten.ESC.on('down', () => { kisteZu(); popupZu(); handelZu(); });
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
      this.tippStart = { id: p.id, t: performance.now(), x: p.x, y: p.y };   // kurzes Tippen = Handgranate auf den Punkt werfen
    });
    this.input.on('pointermove', p => {
      if (this.finger.has(p.id)) this.finger.set(p.id, { x: p.x, y: p.y });
      if (this.kneifen && this.finger.size >= 2) {
        this.zoomWahl = Phaser.Math.Clamp(this.kneifen.zoom * fingerAbstand() / this.kneifen.abstand, ...this.zoomGrenzen());
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
      const tipp = this.tippStart;
      if (tipp && tipp.id === p.id) {
        this.tippStart = null;
        const ich = raum.state.spieler.get(meineId);
        if (ich && ich.waffe === 'handgranate' && !ich.faust && !ich.unten && performance.now() - tipp.t < 350 && Math.hypot(p.x - tipp.x, p.y - tipp.y) < 14 && !this.kneifen) {
          const w = this.cameras.main.getWorldPoint(p.x, p.y);
          raum.send('wurf', { x: Math.round(w.x), y: Math.round(w.y) });
        }
      }
      if (this.kneifen && this.finger.size < 2) {
        if (this.finger.size === 0) { this.kneifen = null; if (!this.flug?.aktiv) { try { localStorage.setItem('zob_zoom', this.zoomWahl.toFixed(2)); } catch {} } }
        return;
      }
      if (p.id === this.joystick.id) this.joystick = { id: null, bx: 0, by: 0, vx: 0, vy: 0 };
    };
    this.input.on('pointerup', loslassen);
    this.input.on('pointerupoutside', loslassen);

    const naechsteFigur = (x, y) => { let best = null, bd = 30; for (const f of this.figuren.values()) { const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } } return best; };
    // Eigener Schuss/Stoß: Der Server meldet den Ort seines (bestätigten) Stands, die gezeichnete Figur läuft mit der Vorhersage
    // aber um Laufzeit + Sendetakt (bis ~35 px bei 150 px/s) voraus – mit dem festen 30-px-Umkreis fand sie ihren eigenen Schuss
    // beim Laufen nicht mehr (keine Schusshaltung, Mündungsblitz hinter dem Helden). Daher zuerst den eigenen Serverstand prüfen.
    const eigeneTreffer = (x, y) => {
      const ich = raum.state.spieler.get(meineId), f = this.figuren.get(meineId);
      if (!ich || !f || !this.lokal || (ich.ebene ?? '') !== (this.aktEbene ?? '')) return null;
      const dich = Math.hypot(ich.x - x, ich.y - y);
      if (dich > 64) return null;
      for (const [id, o] of this.figuren) if (id !== meineId && Math.hypot(o.x - x, o.y - y) < dich) return null;   // ein Mitspieler steht näher
      return f;
    };
    const hoertEbene = m => hoertEbeneRegel(m, raum.state.spieler.get(meineId)?.ebene);   // Koordinaten gelten nur in derselben Ebene (draußen / Haus / Stockwerk)
    raum.onMessage('schuss', m => {
      const eigen = eigeneTreffer(m.x1, m.y1);
      const fs = eigen ?? naechsteFigur(m.x1, m.y1); if (fs) { fs.schussBis = this.time.now + 150; fs.zielW = Math.atan2(m.y2 - m.y1, m.x2 - m.x1); fs.zielBis = this.time.now + 300; }   // Körper dreht nur kurz zum Ziel
      if (eigen) m = { ...m, x1: this.lokal.x, y1: this.lokal.y };   // Mündung an der gezeichneten Figur
      this.schuss(m);
      fetzenBeiSchuss(this, zombieKarte().values(), m);
      // Schrot kommt als mehrere Linien – nur ein Knall
      const jetzt = performance.now();
      const ichSchuetze = istEigen(m, meineId);   // eigener Schuss: immer hörbar, am eigenen Helden (die Ebene im Patch kann dem Server noch hinterherhinken)
      const gleicheEbene = ichSchuetze || hoertEbene(m);
      const knallKey = m.von ?? '';
      this.letzterKnall ??= new Map();
      if (gleicheEbene && jetzt - (this.letzterKnall.get(knallKey) ?? 0) > 60) {
        const px = ichSchuetze ? null : m.x1, py = ichSchuetze ? null : m.y1;
        ton.schuss(px, py, m.art === 'scharfschuetze' ? 1.8 : m.art === 'armbrust' ? 0.3 : m.art === 'gewehr' ? 1.3 : m.art === 'mg' ? 1.4 : m.art === 'schrotflinte' ? 1.2 : 1, m.art);
        this.letzterKnall.set(knallKey, jetzt);
        if (m.ebene && m.art !== 'mg' && m.art !== 'mp' && m.art !== 'armbrust') ton.huelse(px, py);
      }
    });
    raum.onMessage('bwschuss', m => m.evak === 'panzer' ? leopardSchuss(this, m, raum.state) : this.bwSchuss(m));   // Evakuierungspanzer: Lader-MG im Turm
    raum.onMessage('ueberrollt', m => leopardUeberrollt(this, m));
    raum.onMessage('leopardkanone', m => leopardKanone(this, m, raum.state));   // Leopard-Hauptkanone: Mündungsfeuer, Rückstoß, Knall
    raum.onMessage('bunkerEnde', m => finaleAbspann(this, m, meineId, ton, this.lokal ?? raum.state.spieler.get(meineId)));   // Atomschlag: weißer Blitz, Abspann
    b11Registrieren(this, raum, { skala: () => BOGEN2_GROESSE * groesse('figuren2', 'soldat_idle') * mg(), leicheSkala: () => VERWUNDET_GROESSE * groesse('figuren2', 'verwundet') * mg() });   // Szene „Stau auf der B11“
    raum.onMessage('bwSoldaten', m => this.soldatenSync(m));
    raum.onMessage('soldatTot', m => this.soldatStirbt(m, true));
    raum.onMessage('granate', m => this.granateFliegt(m));
    raum.onMessage('nachladen', m => { if ((m.ebene ?? '') === this.aktEbene) ton.nachladen(m.x, m.y); });
    this.radioAnz = new RadioAnzeige(this);
    raum.onMessage('radio', m => this.radioAnz.setze(m));
    raum.onMessage('radios', m => this.radioAnz.alle(m));
    raum.onMessage('radioWeg', m => this.radioAnz.weg(m));
    raum.onMessage('explosion', m => { this.explosion(m.x, m.y, m.r, 1, m.ebene ?? ''); if (!m.ebene) fetzenBeiExplosion(this, zombieKarte().values(), m.x, m.y, m.r ?? 40); });
    raum.onMessage('handel', m => { meldung(m.text); if (m.ok) ton.aufheben(); });
    raum.onMessage('stoss', m => { const eigen = eigeneTreffer(m.x, m.y); const fs = eigen ?? naechsteFigur(m.x, m.y); if (fs) { fs.schlagBis = this.time.now + 400; if (typeof m.w === 'number') { fs.zielW = m.w; fs.zielBis = this.time.now + 400; } } if (eigen) m = { ...m, x: this.lokal.x, y: this.lokal.y }; this.stoss(m); if (istEigen(m, meineId)) ton.stoss(null, null, m.messer); else if (hoertEbene(m)) ton.stoss(m.x, m.y, m.messer); });
    raum.onMessage('feuer', m => { if (hoertEbene(m)) if (!ton.ereignis('feuer', m.x, m.y)) ton.schuss(m.x, m.y, 1.4); });
    raum.onMessage('krach', m => { if (hoertEbene(m) && !ton.ereignis('krach', m.x, m.y)) { ton.schuss(m.x, m.y, 1.8); ton.stoss(m.x, m.y, false); } this.krachEffekt(m.x, m.y); });
    raum.onMessage('blech', m => { if (!ton.ereignis('blech', m.x, m.y)) ton.stoss(m.x, m.y, false); });
    raum.onMessage('menschGebissen', m => { if (hoertEbene(m)) ton.ereignis('menschGebissen', m.x, m.y); });
    raum.onMessage('hundBellen', m => { if ((m.ebene ?? '') === this.aktEbene) ton.hundBellen(m.x, m.y); });
    raum.onMessage('soldatRuf', m => {
      ton.ereignis('soldatRuf', m.x, m.y);
      const e = this.stuetzpunktObj?.soldaten.find(q => q.n === m.n);
      if (e?.tot) return;
      const t = this.add.text(m.x, m.y - 34, m.t ? 'Keine Bewegung!' : 'Halt! Stehen bleiben!', { fontSize: '11px', fontFamily: 'sans-serif', color: '#fff', backgroundColor: '#000a', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: t, y: t.y - 10, alpha: 0, delay: 1500, duration: 700, onComplete: () => t.destroy() });
    });
    raum.onMessage('hilferufe', m => { ton.ereignis('hilferufe', m.x, m.y); });
    raum.onMessage('wimmern', m => { if (!ton.ereignis('wimmern', m.x, m.y)) ton.stoehnen(m.x, m.y, 0.15); });   // ohne Tondatei ein leises Stöhnen als Ersatz
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
    raum.onMessage('weg', m => { this.puff(m.x, m.y); if (istEigen(m, meineId)) ton.zombieWeg(null, null); else if (hoertEbene(m)) ton.zombieWeg(m.x, m.y); });   // eigener Kill immer hörbar
    raum.onMessage('entdeckt', m => { if (hoertEbene(m)) ton.entdeckt(m.x, m.y); });
    raum.onMessage('tonEinst', m => ton.toneEinstellungen(m));   // Backend hat Musik/Radio/Horde geändert
    raum.onMessage('meldung', m => { meldung(m.text, m.lang); if (m.lang) ton.ereignis('funk'); });
    // eigene Welt passt nicht zum Server: einmal neu laden (frischer Code), danach nur noch warnen
    raum.onMessage('weltFalsch', m => {
      let schon = null; try { schon = sessionStorage.getItem('zob_weltneu'); sessionStorage.setItem('zob_weltneu', m.soll); } catch {}
      if (schon !== m.soll) { autostartMerken(); location.reload(); return; }
      meldung('⚠️ Deine Karte weicht vom Server ab – Kisten und Türen stehen evtl. woanders. Bitte App ganz schließen und neu öffnen.', true);
    });
    fkStart(raum, meldung);
    startwahlStart(raum);   // Startwahl vor Level 1 (5 Punkte + Gegenstand)
    { const fk = document.getElementById('fkknopf'); if (fk) $('leiste').prepend(fk); }   // Symbolleiste über der Eckkarte
    raum.onMessage('gefunden', m => {
      if (m.kiste && m.rest === 0) (this.leereKisten ??= new Set()).add(m.kiste);   // Munitionskiste: für mich leer
      if (m.dinge.length) ton.aufheben(); else if (m.rest || !ton.ereignis('truheLeer')) ton.suchen();
      if (m.dinge.length) meldung('Gefunden: ' + m.dinge.map(d => d === 'munition' ? '🧰 12 Schuss' : d === 'pfeil' ? '➶ 6 Pfeile' : dingText(d)).join(', '));
      else if (m.rest) meldung('Rucksack voll – der Rest bleibt hier');
      else meldung('Nichts Brauchbares gefunden');
      if (m.dinge.length && m.rest) meldung('Rucksack voll – der Rest bleibt hier');
    });
    raum.onMessage('fundliste', m => fundZeigen(raum, m, this.lokal, meldung));
    raum.onMessage('alle_sperre', m => { this.alleSperreBis = Date.now() + (m.sek ?? 30) * 1000; });
    raum.onMessage('pong', () => {});
    raum.onMessage('raetsel', m => zeigeRaetsel(m));
    raum.onMessage('tausch', m => zeigeTausch(m));
    raum.onMessage('tausch_ende', m => {
      tauschZu();
      meldung(m.grund === 'fertig' ? '🤝 Getauscht!' : 'Tausch abgebrochen');
    });
    raum.onMessage('aufloesung', m => zeigeAufloesung(m));
    // Server kündigt das nächste Level an (Karte + Seed): schon jetzt im Worker rechnen und in IndexedDB legen, dann lädt der Levelwechsel sie von dort
    raum.onMessage('weltvorschau', async m => {
      try {
        if (TUT.an || !m?.karte || !/^[a-z0-9_-]+$/.test(m.karte) || !Number.isInteger(m.seed)) return;
        const k = await (await fetch(`karten/${m.karte}.json`)).json();
        await weltVorrechnen(k, m.seed, (m.autos ?? 10) / 10);
      } catch { /* egal: der Levelwechsel baut dann normal */ }
    });
    raum.onMessage('neustart', m => {
      abgemeldet = true;
      if (m?.level) ladenZeigen(30, 'Generiere nächstes Level …', `🎉 Level ${m.level - 1} abgeschlossen!`); else ladenZeigen(30, 'Generiere Welt neu …');
      setTimeout(() => ladenZeigen(60, m?.level ? 'Generiere nächstes Level … Karte wird vorbereitet' : 'Generiere Welt neu …', m?.level ? `🎉 Level ${m.level - 1} abgeschlossen!` : ''), 1200);
      meldung(m?.level ? `🚌 Level ${m.level} – die Fahrt geht los, gleich geht es weiter …` : '🔄 Die Welt wird neu gestartet – gleich geht es weiter …', true);
      autostartMerken();
      setTimeout(() => location.reload(), 2500);
    });
    raum.onMessage('tor', () => meldung(raum.state.aufgaben?.size
      ? (raum.state.funk ? '🔓 Das Tor ist offen! Der Evakuierungsbus holt euch dort ab.' : '🔓 Das Tor ist offen! Setzt am Funktisch im Safe Room einen 📻 Funkspruch ab – dann kommt der Evakuierungsbus.')
      : '🔓 Das Tor ist offen!', true));

    $('aktion').onclick = () => this.aktion();
    $('aktion2').onclick = () => this.aktion2();
    $('alleknopf').onclick = () => this.alleSuchen();
    $('handelzu').onclick = () => handelZu();
    $('ausruhen').onclick = () => raum.send('ausruhen');
    $('kistezu').onclick = () => kisteZu();
    $('raetselzu').onclick = () => raetselZu();
    // Aufgabenliste ein- und ausklappen (Wahl bleibt im Browser)
    {
      const box = $('aufgaben');
      // Standard: eingeklappt (nur der Knopf); nur wer sie selbst aufgeklappt hat, sieht sie beim nächsten Mal offen
      let zuStart = true;
      try { if (localStorage.getItem('aufgabenZu') === '0') zuStart = false; } catch { /* ohne Speicher: zu */ }
      box.classList.toggle('zu', zuStart); $('aufgabenknopf').setAttribute('aria-expanded', String(!zuStart));
      $('aufgabenknopf').onclick = () => {
        box.classList.remove('puls');
        const zu = box.classList.toggle('zu');
        $('aufgabenknopf').setAttribute('aria-expanded', String(!zu));
        try { localStorage.setItem('aufgabenZu', zu ? '1' : '0'); } catch { /* egal */ }
      };
    }
    $('tauschok').onclick = () => raum.send('tausch_ok');
    $('tauschab').onclick = () => raum.send('tausch_ende');
    this.hudZeit = 0;
    // Zoom: Mausrad, Zwei-Finger-Zoom, Tasten + und − (keine Knöpfe)
    // (Mausrad: Fensterhörer in kameraflug.mjs – Phasers eigener Hörer sah nur Ereignisse über dem Canvas)
    if (window.__radAb) window.__radAb();
    window.__radAb = radEinrichten(this);
    this.flug = new Kameraflug(this, raum);   // Superuser-Kameraflug (Server prüft)
    this.input.keyboard.on('keydown', e => {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === '+' || e.key === '=') this.zoomen(1.25);
      else if (e.key === '-') this.zoomen(0.8);
    });
    // Messhilfe: mit ?debug oben FPS und sichtbare/gesamte Zombies
    if (new URLSearchParams(location.search).has('debug')) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:99;font:12px monospace;color:#0f0;background:#000a;padding:2px 6px;pointer-events:none';
      document.body.appendChild(el);
      this.messZeit = setInterval(() => { const m = this.messZombies ?? [0, 0]; el.textContent = `FPS ${Math.round(this.game.loop.actualFps)} | Zombies ${m[0]}/${m[1]}`; }, 500);
    }
    // Prüfhilfe Horde (nur Superuser): Server schickt 'hordeInfo', wenn hordeZieleZeigen an ist oder im ☰-Menü/mit ?debug eingeschaltet
    this.hordeGfx = this.add.graphics().setDepth(900);
    this.hordeFahne = this.add.text(0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: '#ffd1e0', stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5, 1).setDepth(901).setVisible(false);
    this.hordeListe = document.createElement('div');
    // Prüfhilfe nur für Superuser: steht direkt unter der Eckkarte
    this.hordeListe.id = 'hordeliste';
    this.hordeListe.style.display = 'none';
    const kartenbox = $('kartenbox');
    if (kartenbox) kartenbox.after(this.hordeListe); else document.body.appendChild(this.hordeListe);
    raum.onMessage('hordeInfo', m => this.hordeInfoEmpfangen(m));
    if (new URLSearchParams(location.search).has('debug')) raum.send('hordeDebug', { an: true });
    szeneRef = this;
    // Test-Hilfe: mit ?debug in der Adresse ist die Szene in der Konsole erreichbar
    if (new URLSearchParams(location.search).has('debug')) { window.szene = this; window.raum = raum; window.meineId = meineId; }
  }

  passeZoomAn() {
    const kurz = Math.min(this.scale.width, this.scale.height);
    // Grundzoom ×1,4 näher als früher (kurz / 520): Figuren sind seit 0.69.4 maßstäblicher (Größe gesamt 50 statt 70 %)
    this.grundZoom = Phaser.Math.Clamp(kurz / 370, 0.75, 2.3);
    if (this.zoomWahl === undefined) { this.zoomWahl = 1; try { this.zoomWahl = Phaser.Math.Clamp(Number(localStorage.getItem('zob_zoom')) || 1, ZOOM_MIN, ZOOM_MAX); } catch {} }
    this.cameras.main.setZoom(this.zielZoom());
  }

  // ist die aktuelle Ebene ein maßstäblicher Innenraum?
  feinInnen() { return !!(this.aktEbene && this.wv(this.aktEbene)?.kachel); }

  // Maßstab für Bildschirmelemente in der Welt (Namen, Balken, Symbole, Stick): drinnen läuft die Kamera 3,4-fach näher,
  // diese Dinge sollen aber so groß wirken wie draußen (= Grundzoom × Wahl) – also durch den Innenzoom teilen
  uiMass() {
    const z = this.cameras.main.zoom;
    if (!(z > 0)) return 1;
    const deckel = 1.18 / z;   // Namen (11 px) wachsen beim Ranzoomen nicht über ~13 px Bildschirmhöhe
    if (!this.feinInnen()) return Math.min(1, deckel);
    return Math.min(1, deckel, this.grundZoom * this.zoomWahl / z);
  }

  // Kamerazoom: Bildschirmgröße × eigene Wahl (Knöpfe, Mausrad, +/−) × drinnen näher
  zielZoom(ebene = this.aktEbene) { return this.grundZoom * this.zoomWahl * (ebene ? (this.innenWelten.get(ebene)?.kachel ? INNEN_ZOOM_FEIN : INNEN_ZOOM) : 1); }

  // Zoom-Grenzen: im Kameraflug darf man weiter hinaus
  zoomGrenzen() { return [this.flug?.aktiv ? FLUG_ZOOM_MIN : ZOOM_MIN, ZOOM_MAX]; }

  // Mausrad (kameraflug.mjs): jede Raststufe wirkt, auch mitten in einer laufenden Bewegung – Phasers zoomTo() hätte
  // neue Zielwerte verworfen, solange ein früherer Zoom noch lief; darum setzt update() den Zoom selbst weich nach
  radZoom(faktor) { this.zoomen(faktor); }

  zoomen(faktor) {
    const [lo, hi] = this.zoomGrenzen();
    this.zoomWahl = Phaser.Math.Clamp((this.zoomWahl ?? 1) * faktor, lo, hi);
    if (!this.flug?.aktiv) { try { localStorage.setItem('zob_zoom', this.zoomWahl.toFixed(2)); } catch {} }
    this.cameras.main.zoomEffect?.reset?.();   // ein laufender Szenenwechsel-Zoom darf den Radzoom nicht blockieren
    this.zoomGlatt = true;
  }

  // jede Bildfolge: Kamerazoom weich auf den Zielwert ziehen (unabhängig von der Bildrate)
  zoomNachziehen(dt) {
    const cam = this.cameras.main;
    // Kamera-Rundung (startFollow) rastet den Bildausschnitt auf ganze WELT-Pixel: drinnen bei Zoom ~3,4 sind das 3,4 Bildschirmpixel –
    // Bild und Figuren ruckeln. Nur bei kleinem Zoom runden.
    cam.roundPixels = cam.zoom <= 1.5;
    if (cam.zoomEffect?.isRunning) return;   // Szenenwechsel-Zoom (innen/außen) läuft
    const ziel = this.zielZoom(), d = ziel - cam.zoom;
    if (Math.abs(d) < 0.0005) { if (d) cam.setZoom(ziel); return; }
    cam.setZoom(cam.zoom + d * (1 - Math.exp(-dt * 16)));
  }

  zeichneKarte() {
    // Boden, Bäume, Deko und Dächer entstehen stückweise beim Hinsehen (chunksAktualisieren)
    this.bilder = Object.fromEntries(GRAFIK.map(g => [g, this.textures.get(g).getSourceImage()]));
    this.figurListe = this.cache.json.get('figurenliste')?.bilder ?? {};
    this.figurListe2 = this.cache.json.get('figurenliste2')?.bilder ?? {};
    this.figurListe3 = this.cache.json.get('figurenliste3')?.bilder ?? {};
    this.heldenListe = this.cache.json.get('heldenliste')?.bilder ?? {};
    this.buergerListe = this.cache.json.get('buergerliste')?.bilder ?? {};
    this.stuecke = new Map();
    document.addEventListener('zob-kulisse', () => this.kulisseNeuBauen());
    this.torGrafik = this.add.graphics().setDepth(1.5);
    this.torStand = -1;
    this.add.text((this.welt.tor.x + (this.welt.tor.x === 0 ? 1 : 0)) * KACHEL + 4, (this.welt.tor.y + (this.welt.tor.y === 0 ? 1 : 0)) * KACHEL + 18, 'Ortsausgang', {
      fontSize: '12px', fontStyle: 'bold', color: '#ffe082',
    }).setDepth(1);

    // Behälter: Schränke, Kühlschränke, Spinde (unter dem Dach) und Autos
    this.behaelterObj = new Map();
    for (const b of this.welt.behaelter) {
      const c = this.add.container(b.x, b.y).setDepth(1);
      if (b.art === 'bus' || b.art === 'container' || b.art === 'einkaufswagen' || b.art === 'muelltonne' || b.art === 'sanikiste' || b.art.startsWith('bw_')) { /* Bus: obere Ebene, Container und Stützpunkt-Kisten: Kartenstücke (aussehen.mjs, stuetzpunkt.mjs) */ }
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
    this.baueStuetzpunktFiguren();
    zeichneFlugfeldDeko(this);   // Königsdorf: verlassene Panzer und Drahtrollen am Flugfeld

    // Dächer der Safe Rooms als eigene Bilder (grau, mit Schild); die übrigen Dächer stecken in den Kartenstücken
    this.daecher = this.welt.safeRooms.map(s => {
      const h = s.haus, schluessel = 'dach-' + s.id;
      const tex = this.textures.createCanvas(schluessel, h.b * KACHEL + DACH_RAND * 2, h.h * KACHEL + DACH_RAND * 2);
      zeichneSafeDach(tex.getContext(), this.welt, h);
      tex.refresh();
      const bild = this.add.image(h.x * KACHEL - DACH_RAND, h.y * KACHEL - DACH_RAND, schluessel).setOrigin(0).setDepth(5.2);
      return { haus: h, grafik: bild };
    });
    // Eingang jedes Safe Rooms über dem Dach: Tür, grüner Leuchtfleck und Schild „SAFE“ (bei großen/unregelmäßigen Gebäuden liegt die Rastertür unter dem Dach)
    for (const s of this.welt.safeRooms) {
      const h = s.haus, r = h.raus ?? { dx: 0, dy: 1 }, pose = this.welt.vektor ? tuerPose(this.welt, h) : null;
      const x = pose ? pose.x : (h.tuer.x + 0.5 + r.dx * 0.5) * KACHEL, y = pose ? pose.y : (h.tuer.y + 0.5 + r.dy * 0.5) * KACHEL;
      const schluessel = 'eingang-' + s.id, tex = this.textures.createCanvas(schluessel, 160, 160), c3 = tex.getContext();
      c3.translate(80, 80); zeichneSafeEingang(c3, pose ? pose.w : Math.atan2(r.dy, r.dx) - Math.PI / 2); tex.refresh();
      this.add.image(x, y, schluessel).setDepth(5.3);   // gehört zur Außenwelt (aussenObjekte entsteht danach)
    }
    // Sandsack-Wall links und rechts der Haustür jedes Safe Rooms (nur Grafik, die Tür bleibt frei)
    for (const s of this.welt.safeRooms) {
      const h = s.haus, r = h.raus ?? { dx: 0, dy: 1 }, schluessel = 'sand-' + s.id;
      const tex = this.textures.createCanvas(schluessel, 160, 160), c2 = tex.getContext();
      // bei schräg stehenden Häusern parallel zur echten Hauswand an der Tür (Winkel aus dem Gebäudeumriss), sonst am Raster
      const pose = this.welt.vektor ? tuerPose(this.welt, h) : null;
      c2.translate(80, 80); c2.rotate(pose ? pose.w : Math.atan2(r.dy, r.dx) - Math.PI / 2);
      zeichneSandsaecke(c2); tex.refresh();
      this.add.image(pose ? pose.wx : (h.tuer.x + 0.5 + r.dx * 0.5) * KACHEL, pose ? pose.wy : (h.tuer.y + 0.5 + r.dy * 0.5) * KACHEL, schluessel).setDepth(0.9);   // gehört zur Außenwelt (aussenObjekte entsteht danach)
    }
    // Namen der Geschäfte und Einrichtungen auf den Dächern (OSM)
    for (const h of this.welt.haeuser) {
      if (!h.name || h.safe) continue;
      this.add.text((h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL, h.name, {
        fontSize: '11px', fontStyle: 'bold', color: '#fff8e1', stroke: '#3e2723', strokeThickness: 3, align: 'center',
        wordWrap: { width: Math.max(80, h.b * KACHEL) },
      }).setOrigin(0.5).setDepth(6);
    }
    // Schilder der Safe Rooms; Haustüren (Barrikaden, geschlossen, zerbrochen) zeichnet zeichneBarrikaden() für alle Häuser
    this.hausTueren = new Map();
    for (const s of this.welt.safeRooms) {
      const h = s.haus;
      this.add.text((h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL, '🛡 ' + s.name, {
        fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#263238', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6);
    }
  }

  // Abholstelle am Ortsausgang: sobald alle Pflichtaufgaben erledigt sind (wie im Server: tor + 1 Kachel)
  abholAktiv() {
    const a = raum.state.aufgaben;
    if (['heliAnflug', 'heli', 'bunker'].includes(raum.state.evakPhase) || evakArtVon(raum.state) === 'bunker') return true;   // A400M ausgefallen: Hubschrauber-Landeplatz
    return !!(a && a.size && this.welt?.tor && [...a.values()].every(x => !x.pflicht || x.erledigt) && [...a.values()].some(x => x.pflicht));
  }

  // Abholpunkt in Pixeln: Ortsausgang, bei A400M/Hubschrauber der Server-Punkt (Heckrampe bzw. Landeplatz)
  abholPunkt() {
    const st = raum.state;
    if (st.evakX > 0 && st.evakY > 0) return { x: st.evakX, y: st.evakY, heli: ['heliAnflug', 'heli'].includes(st.evakPhase), bunker: evakArtVon(st) === 'bunker' };
    return this.welt?.tor ? { x: (this.welt.tor.x + 1) * KACHEL, y: (this.welt.tor.y + 1) * KACHEL } : null;
  }

  abholstelleAktualisieren() {
    const an = this.abholAktiv(), pkt = this.abholPunkt();
    if (this.abholObj && pkt && (this.abholObj.x !== pkt.x || this.abholObj.y !== pkt.y)) {   // Punkt hat gewechselt (Hubschrauberplatz): neu anlegen
      for (const k of [this.abholObj.kreis, this.abholObj.glut, this.abholObj.rauch, this.abholObj.stab, this.abholObj.text]) k.destroy();
      this.abholObj = null;
    }
    if (!an && !this.abholObj) return;
    if (an && !this.abholObj && pkt) {
      const x = pkt.x, y = pkt.y;
      if (!this.textures.exists('abholglut')) {
        const t = this.textures.createCanvas('abholglut', 64, 64), c = t.getContext(), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.refresh();
      }
      const kreis = this.add.graphics().setDepth(1.4);
      kreis.fillStyle(0xff1744, 0.035).fillCircle(x, y, 800);
      kreis.lineStyle(3, 0xff5252, 0.22).strokeCircle(x, y, 800);
      const glut = this.add.image(x, y, 'abholglut').setTint(0xff1744).setBlendMode('ADD').setDepth(5.7);
      const rauch = this.add.particles(x, y, 'abholglut', {
        speed: { min: 14, max: 34 }, angle: { min: 255, max: 285 }, scale: { start: 0.35, end: 1.6 }, alpha: { start: 0.55, end: 0 },
        lifespan: 2600, frequency: 90, tint: [0xff1744, 0xff5252, 0xd50000], blendMode: 'ADD',
      }).setDepth(5.7);
      const stab = this.add.graphics().setDepth(5.75);
      stab.fillStyle(0x212121, 1).fillRect(x - 2, y - 10, 4, 14);
      stab.fillStyle(0xff1744, 1).fillRect(x - 3, y - 12, 6, 5);
      const text = this.add.text(x, y - 48, pkt.bunker ? '📍 Bunker' : pkt.heli ? '📍 Hubschrauber' : '📍 Abholung', {
        fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#b71c1c', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(6);
      this.abholObj = { kreis, glut, rauch, stab, text, x, y };
    }
    const o = this.abholObj;
    if (!o) return;
    const sichtbar = an && this.aktEbene === '';
    for (const k of [o.kreis, o.glut, o.rauch, o.stab, o.text]) k.setVisible(sichtbar);
    if (sichtbar) {
      const p = 0.5 + 0.5 * Math.sin(this.time.now / 260);
      o.glut.setScale(2.2 + 1.6 * p).setAlpha(0.45 + 0.4 * p);
      o.text.setScale(1 + 0.06 * p);
    }
  }

  hordeInfoEmpfangen(m) {
    this.hordeInfo = m?.aktiv ? { ...m, ab: performance.now() } : null;
    if (this.uebersicht) this.uebersicht.horde = this.hordeInfo ? { mitte: { x: m.mitte.x / KACHEL, y: m.mitte.y / KACHEL }, ziel: { x: m.ziel.x / KACHEL, y: m.ziel.y / KACHEL }, name: `🎯 ${m.name}` } : null;
    if (!this.hordeInfo) { this.hordeGfx.clear(); this.hordeFahne.setVisible(false); this.hordeListe.style.display = 'none'; return; }
    const GRUND = { zeit: 'Zeit', angekommen: 'angekommen', festgefahren: 'festgefahren', laerm: 'Lärm', start: 'Start', dauer: 'Hordendauer um' };
    // Hordenliste: je Horde Größe, Restzeit und nächstes Ziel (Zielwechsel in …)
    const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const horden = m.horden?.length ? m.horden : [m];
    this.hordeListe.textContent = horden.map((h, i) => `Horde ${i + 1}: ${h.n} Zombies · ${h.abzug ? 'Abzug zum Rand' : `noch ${mmss(h.restDauer ?? 0)}`}\n  → ${h.name}${h.abzug ? '' : ` (in ${mmss(h.rest)})`}`).join('\n')
      + `\nletzte Ziele\n` + [...m.wechsel].reverse().map(w => `${uhrText(w.zeit)} ${w.name} (${GRUND[w.grund] ?? w.grund})`).join('\n');
    this.hordeListe.style.display = 'block';
  }

  // Superuser „Hindernisse zeigen“: halbtransparentes Bild (1 Pixel = 1-m-Feld) über dem sichtbaren Ausschnitt samt Rand;
  // neu gerechnet nur, wenn die Kamera den gerechneten Bereich verlässt (oder Ebene/Zoom wechseln) – höchstens 4-mal je Sekunde
  hindernisAktualisieren() {
    const an = hindernisAn && suAn;
    if (!an) { if (this.hindBild) { this.hindBild.destroy(); this.hindBild = null; this.textures.remove('hindernisse'); this.hindStand = null; } return; }
    const jetzt = performance.now();
    if (this.hindStand && jetzt - this.hindStand.t < 250) return;
    const v = this.cameras.main.worldView, ebene = this.aktEbene, welt = this.wv(ebene), fein = !!welt.kachel, FP = fein ? welt.kachel : KACHEL / 4;
    const sx0 = Math.floor(v.x / FP), sy0 = Math.floor(v.y / FP), sx1 = Math.ceil((v.x + v.width) / FP), sy1 = Math.ceil((v.y + v.height) / FP);
    const h = this.hindStand;
    if (h && h.ebene === ebene && this.hindBild && sx0 >= h.x0 && sy0 >= h.y0 && sx1 <= h.x0 + h.nx && sy1 <= h.y0 + h.ny) return;
    const rand = fein ? 8 : 24;
    const x0 = Math.max(0, sx0 - rand), y0 = Math.max(0, sy0 - rand), nx = Math.min(fein ? welt.breite : BREITE * 4, sx1 + rand) - x0, ny = Math.min(fein ? welt.hoehe : HOEHE * 4, sy1 + rand) - y0;
    if (nx <= 0 || ny <= 0) return;
    const grenze = ebene ? { x0: welt.ox, y0: welt.oy, x1: welt.ox + welt.b, y1: welt.oy + welt.h } : null;
    const codes = fein ? hindernisFelderFein(welt, x0, y0, nx, ny, W.spielerRadius) : hindernisFelder(welt, x0, y0, nx, ny, W.spielerRadius, grenze);
    this.hindBild?.destroy(); this.hindBild = null;
    if (this.textures.exists('hindernisse')) this.textures.remove('hindernisse');
    const tex = this.textures.createCanvas('hindernisse', nx, ny), c = tex.getContext(), bd = c.createImageData(nx, ny);
    hindernisPixel(codes, bd.data); c.putImageData(bd, 0, 0); tex.refresh(); tex.setFilter(1);   // 1 = NEAREST: scharfe Felder
    this.hindBild = this.add.image(x0 * FP, y0 * FP, 'hindernisse').setOrigin(0).setScale(FP).setDepth(8.6);
    this.hindStand = { t: jetzt, x0, y0, nx, ny, ebene };
  }

  // Zielfahne, gestrichelte Linie und Countdown (jedes Bild, nur wenn Infos da sind)
  hordeZeichnen() {
    const h = this.hordeInfo, g = this.hordeGfx;
    g.clear();
    if (!h || this.aktEbene) { this.hordeFahne.setVisible(false); return; }
    const rest = Math.max(0, h.rest - (performance.now() - h.ab) / 1000), min = Math.floor(rest / 60), sek = String(Math.floor(rest % 60)).padStart(2, '0');
    for (const q of (h.horden?.length ? h.horden : [h])) {   // jede Horde: gestrichelte Linie zum Ziel und Mittelpunkt; Fahne nur für die erste
      const dx = q.ziel.x - q.mitte.x, dy = q.ziel.y - q.mitte.y, d = Math.hypot(dx, dy) || 1;
      g.lineStyle(3, 0xff4081, 0.85);
      for (let t = 0; t < d; t += 28) g.lineBetween(q.mitte.x + dx / d * t, q.mitte.y + dy / d * t, q.mitte.x + dx / d * Math.min(d, t + 14), q.mitte.y + dy / d * Math.min(d, t + 14));
      g.fillStyle(0xff1744, 0.9).fillCircle(q.mitte.x, q.mitte.y, 8);
    }
    g.lineStyle(3, 0xffffff, 1).lineBetween(h.ziel.x, h.ziel.y, h.ziel.x, h.ziel.y - 34);
    g.fillStyle(0xff1744, 1).fillTriangle(h.ziel.x, h.ziel.y - 34, h.ziel.x + 22, h.ziel.y - 27, h.ziel.x, h.ziel.y - 20);
    this.hordeFahne.setText(`🎯 ${h.name}\nZielwechsel in ${min}:${sek}`).setPosition(h.ziel.x, h.ziel.y - 38).setVisible(true);
  }

  // ---------- Übersichtskarte (client/uebersicht.mjs) ----------
  uebersichtVorbereiten() {
    this.uebersicht = new Uebersicht(this.welt, $('kartenbox'), raum.state.karte || null);
    $('einstellknopf').style.display = 'block';
    ton.umgebung(false);
    this.input.keyboard.on('keydown-M', () => { this.uebersicht.umschalten(); this.uebersichtZeichnen(); });
  }

  // Aufgabenliste im HUD (einklappbar), Level, Evakuierungsbus mit Abfahrtszeit und „an Bord“
  aufgabenZeigen(ich) {
    const s = raum.state, box = $('aufgaben'), n = s.aufgaben?.size ?? 0;
    finaleHud(s);
    box.style.display = n ? 'block' : 'none';
    if (!n) return;
    const liste = [...s.aufgaben.values()];
    const fertig = liste.filter(a => a.erledigt).length;
    textSetzen('aufgabenkopf', `${n - fertig} offen · Level ${s.level || 1}`);
    $('aufgabenknopf').title = `Aufgaben: ${fertig}/${n} erledigt`;
    // neue Aufgabe: Knopf kurz pulsieren lassen statt die Liste aufzuklappen
    const kennung = [...s.aufgaben.keys()];
    if (this.aufgabenBekannt) {
      if (kennung.some(k => !this.aufgabenBekannt.has(k)) && box.classList.contains('zu')) {
        box.classList.add('puls'); clearTimeout(this.aufgabenPuls); this.aufgabenPuls = setTimeout(() => box.classList.remove('puls'), 5000);
      }
    }
    this.aufgabenBekannt = new Set(kennung);
    const zeilen = liste.map(a => {
      const zahl = a.ziel > 1 && !a.erledigt ? ` <span class="ag-zahl">${Math.round(a.fortschritt)}/${Math.round(a.ziel)}</span>` : '';
      return `<li class="${a.erledigt ? 'fertig' : ''}">${a.erledigt ? '✓' : a.pflicht ? '★' : '•'} ${a.symbol} <span class="ag-text">${escapeHtml(a.text)}</span>${zahl}</li>`;
    }).join('');
    if ($('aufgabenliste').innerHTML !== zeilen) $('aufgabenliste').innerHTML = zeilen;
    let bus = '';
    const flugPos = ich && this.lokal ? this.lokal : ich;
    const flugText = ['flugzeug', 'absturz', 'heli', 'bunker'].includes(evakArtVon(s)) ? evakHudText(s, !!(ich?.anBord || s.busSteht && flugPos && !ich.ebene && s.evakX > 0 && Math.hypot(flugPos.x - s.evakX, flugPos.y - s.evakY) < (['heli', 'bunker'].includes(s.evakPhase) ? 90 : BUS_ABSTAND)), uhrText) : null;
    if (flugText) bus = flugText;
    else if (s.busDa) {
      const f = [...(s.fahrzeuge?.values() ?? [])].find(v => v.art === 'evakuierung');
      const px = ich && this.lokal ? this.lokal.x : ich?.x, py = ich && this.lokal ? this.lokal.y : ich?.y;
      const an = !!ich?.anBord || (s.busSteht && f && ich && !ich.ebene && Math.hypot(px - f.x, py - f.y) < BUS_ABSTAND);
      const pz = evakArtVon(s) === 'panzer', sym = pz ? '🪖' : '🚌', fzg = pz ? 'Evakuierungspanzer' : 'Bus';
      bus = s.busSteht ? `${sym} ${fzg} wartet am Ortsausgang bis ${uhrText(s.busAb)} · ${s.busBord}/${s.busGesamt} an Bord${an ? ` · ${sym} du bist an Bord` : ''}`
        : `${sym} ${fzg} fährt zum Ortsausgang vor – einsteigen geht, sobald er steht`;
    } else if (s.funk && s.missionOffen > 0) bus = `🧩 Der ${evakArtVon(s) === 'panzer' ? 'Panzer' : 'Bus'} kommt erst, wenn alle Missionsgegenstände abgegeben sind (noch ${s.missionOffen})`;
    else if (s.funk && s.busAnkunft >= 0) bus = evakArtVon(s) === 'panzer' ? `🪖 Der Evakuierungspanzer kommt um ${uhrText(s.busAnkunft)} zum Ortsausgang` : `🚌 Der Bus kommt um ${uhrText(s.busAnkunft)} zum Ortsausgang`;
    else bus = `📻 Funkspruch fehlt – ohne ihn kommt kein ${evakArtVon(s) === 'panzer' ? 'Panzer' : 'Bus'}`;
    textSetzen('busanzeige', bus);
  }

  uebersichtZeichnen() {
    if (!this.uebersicht) return;
    const bf = raum.state.busDa ? [...(raum.state.fahrzeuge?.values() ?? [])].find(v => v.art === 'evakuierung') : null;
    const abholP = this.abholAktiv() ? this.abholPunkt() : null;
    this.uebersicht.abhol = abholP ? { x: abholP.x / KACHEL, y: abholP.y / KACHEL } : null;
    this.uebersicht.bus = bf ? { x: bf.x / KACHEL, y: bf.y / KACHEL } : null;
    const spieler = [...raum.state.spieler.entries()].map(([id, p]) => ({
      x: id === meineId && this.lokal ? this.lokal.x : p.x, y: id === meineId && this.lokal ? this.lokal.y : p.y,
      ebene: p.ebene ?? '', name: anzeigeName(p), ich: id === meineId, unten: !!p.unten, farbe: css(FARBEN[p.farbe % FARBEN.length]),
    }));
    // Zielorte offener Aufgaben (Apotheke, Supermarkt, Kaufhaus); erledigte fallen weg
    const offen = new Set([...(raum.state.aufgaben?.values() ?? [])].filter(a => !a.erledigt).map(a => a.id));
    const KAT = { medizin: 'apotheke', vorraete: 'lebensmittel', lampen: 'kaufhaus' };
    const kats = new Set(Object.entries(KAT).filter(([id]) => offen.has(id)).map(([, k]) => k));
    this.uebersicht.ziele = kats.size ? this.welt.haeuser.filter(h => !h.safe && kats.has(ladenArt(h))).map(h => ({
      x: h.x + h.b / 2, y: h.y + h.h / 2, name: ZIEL_NAMEN[h.art] ?? ZIEL_NAMEN[ladenArt(h)] ?? 'Laden', symbol: ZIEL_SYMBOL[ladenArt(h)] ?? '⭐',
    })) : [];
    // offene Missionsgegenstände: exakte Position vom Server (Mitte = Gegenstand), mit Gegenstandsbild, falls vorhanden
    const dTex = this.textures.exists('dinge') ? this.textures.get('dinge') : null;
    const dBild = ding => { const n = ding === 'handgranate' ? 'granate' : ding; if (!dTex || !hatDingBild(ding) || !dTex.has(n)) return null; const f = dTex.get(n); return { img: f.source.image, sx: f.cutX, sy: f.cutY, s: f.cutWidth }; };
    this.uebersicht.kreise = [...(raum.state.missionen?.values() ?? [])].filter(q => !q.abgegeben).map(q => ({
      x: q.x / KACHEL, y: q.y / KACHEL, r: q.r / KACHEL, symbol: DINGE[q.ding]?.zeichen ?? '❓', bild: dBild(q.ding), name: (DINGE[q.ding]?.name ?? q.ding) + (q.nummer && q.von > 1 ? ` ${q.nummer}/${q.von}` : ''),
    }));
    this.uebersicht.zeichne(spieler, e => { const m = EBENE_MUSTER.exec(e); return m ? this.welt.haeuser[Number(m[1])] : null; });
  }

  // Kartenstücke um die Kamera herum erzeugen, entfernte freigeben (große Karten passen nicht in ein Bild)
  chunksAktualisieren(alle = false) {
    if (this.aktEbene) return;
    const v = this.cameras.main.worldView, K = KACHEL * STUECK;
    const nx = Math.ceil(BREITE / STUECK) - 1, ny = Math.ceil(HOEHE / STUECK) - 1;
    // Vorlauf 320 px: Stücke entstehen, bevor sie ins Bild kommen
    const cx0 = Math.max(0, Math.floor((v.x - 320) / K)), cx1 = Math.min(nx, Math.floor((v.right + 320) / K));
    const cy0 = Math.max(0, Math.floor((v.y - 320) / K)), cy1 = Math.min(ny, Math.floor((v.bottom + 320) / K));
    // je Bild nur ein halbes Stück (Boden oder obere Ebene), sonst ruckelt es auf schwachen Handys
    let budget = alle || !this.stuecke.size ? 99 : 1;
    for (const st of this.stuecke.values()) if (!st.oben && budget > 0) { budget--; this.baueStueckOben(st); }
    // Kulisse „Luftbild-Boden“: Stücke erst bauen, wenn ihre Bildkacheln da sind (nächste zuerst anfordern); nicht ladbar → gezeichneter Boden
    const fehlend = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.stuecke.has(cx + ',' + cy)) fehlend.push([cx, cy]);
    if (kulBoden() && fehlend.length) {
      const mx = (v.x + v.right) / 2, my = (v.y + v.bottom) / 2;
      fehlend.sort((a, b) => Math.hypot((a[0] + 0.5) * K - mx, (a[1] + 0.5) * K - my) - Math.hypot((b[0] + 0.5) * K - mx, (b[1] + 0.5) * K - my));
      fotoWunsch(fehlend.map(([cx, cy]) => ({ x0: cx * STUECK, y0: cy * STUECK, x1: Math.min(BREITE, (cx + 1) * STUECK), y1: Math.min(HOEHE, (cy + 1) * STUECK) })));
    }
    for (const [cx, cy] of fehlend) {
      if (budget <= 0) break;
      if (kulBoden() && fotoStatus({ x0: cx * STUECK, y0: cy * STUECK, x1: Math.min(BREITE, (cx + 1) * STUECK), y1: Math.min(HOEHE, (cy + 1) * STUECK) }) === 'laedt') continue;
      budget--; const st = this.baueStueck(cx, cy);
      if (budget > 0) { budget--; this.baueStueckOben(st); }
    }
    // Kronen-Ebene zuletzt und ebenfalls schrittweise (nur Stücke mit Bäumen bekommen eine Textur)
    for (const st of this.stuecke.values()) if (st.oben && st.baum === undefined && budget > 0) { budget--; this.baueStueckBaeume(st); }
    for (const [key, st] of this.stuecke) {
      // freigeben erst ab 640 px außerhalb des Bildes (kein Hin und Her an der Grenze, aber nicht zu viel Speicher)
      if ((st.cx + 1) * K > v.x - 640 && st.cx * K < v.right + 640 && (st.cy + 1) * K > v.y - 640 && st.cy * K < v.bottom + 640) continue;
      st.boden.destroy(); st.oben?.destroy(); st.baum?.destroy(); st.schatten?.destroy();
      this.textures.remove('boden-' + key); this.textures.remove('oben-' + key); if (this.textures.exists('baum-' + key)) this.textures.remove('baum-' + key);
      if (this.textures.exists('schatten-' + key)) this.textures.remove('schatten-' + key);
      this.stuecke.delete(key);
    }
  }

  baueStueck(cx, cy) {
    const rect = { x0: cx * STUECK, y0: cy * STUECK, x1: Math.min(BREITE, (cx + 1) * STUECK), y1: Math.min(HOEHE, (cy + 1) * STUECK) };
    const B = (rect.x1 - rect.x0) * KACHEL, H = (rect.y1 - rect.y0) * KACHEL, key = cx + ',' + cy;
    const tb = this.textures.createCanvas('boden-' + key, B, H);
    const foto = kulFoto() && fotoStatus(rect) === 'bereit';   // gleiche Bedingung wie in zeichneBoden: Luftbild (zeigt Bäume selbst); beim gezeichneten Boden zeichnet das Spiel die Bäume
    zeichneBoden(tb.getContext(), this.welt, rect); tb.refresh(); this.kanteFesthalten(tb);
    const boden = this.add.image(rect.x0 * KACHEL, rect.y0 * KACHEL, 'boden-' + key).setOrigin(0).setDepth(0).setVisible(!this.aktEbene);
    const st = { cx, cy, key, rect, B, H, foto, boden, oben: null, baum: undefined, schatten: null };
    this.stuecke.set(key, st);
    if (kulSchatten()) this.baueStueckSchatten(st);
    return st;
  }

  // Phaser lässt Texturen mit Zweierpotenz-Größe (512er Stücke) „wiederholen“; dann mischt der Kantenfilter die
  // gegenüberliegende Kante hinein und an jeder Stücknaht erscheint eine feine Linie. Kante festhalten (wie setTextureFilter).
  kanteFesthalten(tex) {
    const r = this.game.renderer, gl = r.gl, w = tex.source?.[0]?.glTexture;
    if (!gl || !w?.webGLTexture) return;
    gl.activeTexture(gl.TEXTURE0);
    const vorher = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, w.webGLTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    w.wrapS = w.wrapT = gl.CLAMP_TO_EDGE;   // auch nach verlorenem Grafikkontext
    if (vorher) gl.bindTexture(gl.TEXTURE_2D, vorher);
  }

  // Kulisse „Schatten“: eigenes durchscheinendes Bild über dem Boden; die Deckkraft folgt Tageszeit und Nebel (schattenAlphaSetzen)
  baueStueckSchatten(st) {
    const ts = this.textures.createCanvas('schatten-' + st.key, st.B, st.H);
    if (!zeichneSchattenStueck(ts.getContext(), st.B, st.H, this.welt, st.rect)) { this.textures.remove('schatten-' + st.key); return; }
    ts.refresh(); this.kanteFesthalten(ts);
    st.maske = schattenMaske(ts.getContext(), st.B, st.H);   // Schattenraster für „Figuren im Schatten dunkler“
    st.schatten = this.add.image(st.rect.x0 * KACHEL, st.rect.y0 * KACHEL, 'schatten-' + st.key).setOrigin(0).setDepth(0.5).setAlpha(this.schattenAlpha ?? 0.28).setVisible(!this.aktEbene);
  }
  // Liegt (x, y) im Haus- oder Baumschatten? Raster 4 px je Zelle aus dem Schattenbild des Kartenstücks (nur Boden, nicht drinnen)
  imSchatten(x, y) {
    const st = this.stuecke.get(Math.floor(x / (STUECK * KACHEL)) + ',' + Math.floor(y / (STUECK * KACHEL)));
    const m = st?.maske;
    if (!m) return false;
    const cx = Math.floor((x - st.rect.x0 * KACHEL) / SCHATTEN_ZELLE), cy = Math.floor((y - st.rect.y0 * KACHEL) / SCHATTEN_ZELLE);
    return cx >= 0 && cy >= 0 && cx < m.b && cy < m.h && m.d[cy * m.b + cx] === 1;
  }
  // Figur im Schatten: Tönung (Mischfaktor f = 1 … 0,65) sanft überblenden (~150 ms), Prüfung höchstens alle 100 ms.
  // o = Figur-Objekt (merkt sich Stufe/Zeit), base = vorhandene Tönung der Figur (0xffffff, Infiziert-Grün …), die damit multipliziert wird
  schattenTon(o, x, y, base = 0xffffff) {
    const jetzt = this.time.now;
    let ziel = 0;
    if (kulSchatten() && !this.aktEbene && (this.schattenAlpha ?? 0) > 0.02) {
      if (!(jetzt < (o._schBis ?? 0))) { o._schBis = jetzt + 100; o._schZiel = this.imSchatten(x, y) ? 1 : 0; }
      ziel = (o._schZiel ?? 0) * Math.min(1, this.schattenAlpha / 0.15);   // nachts/Nebel verschwindet der Schatten, die Figur wird wieder hell
    }
    const stufe = o._schStufe ?? 0;
    if (stufe === ziel && base === 0xffffff && ziel === 0) return base;
    const dt = Math.min(0.2, Math.max(0, (jetzt - (o._schZeit ?? jetzt)) / 150));
    o._schZeit = jetzt;
    o._schStufe = Math.abs(ziel - stufe) <= dt ? ziel : stufe + Math.sign(ziel - stufe) * dt;
    return tintMal(base, 1 - SCHATTEN_DUNKEL * o._schStufe);
  }
  schattenAlphaSetzen() {
    const st = raum.state, uhr = st.uhr ?? 480;
    const a = 0.28 * schattenFaktor(1 - helligkeit(uhr), st.nebel ?? 0);
    if (Math.abs(a - (this.schattenAlpha ?? -1)) < 0.004) return;
    this.schattenAlpha = a;
    for (const s of this.stuecke.values()) s.schatten?.setAlpha(a);
  }
  // Kulisse-Schalter geändert: alle Stücke neu bauen (Boden, Dächer, Schatten, Kronen)
  kulisseNeuBauen() {
    for (const [key, st] of this.stuecke) {
      st.boden.destroy(); st.oben?.destroy(); st.baum?.destroy(); st.schatten?.destroy();
      for (const n of ['boden-', 'oben-', 'baum-', 'schatten-']) if (this.textures.exists(n + key)) this.textures.remove(n + key);
    }
    this.stuecke.clear();
    this.chunksAktualisieren(true);
  }

  baueStueckOben(st) {
    const to = this.textures.createCanvas('oben-' + st.key, st.B, st.H);
    const ctx = to.getContext();
    zeichneOben(ctx, this.welt, this.bilder, st.rect);
    zeichneDaecher(ctx, this.welt, st.rect);
    to.refresh(); this.kanteFesthalten(to);
    st.oben = this.add.image(st.rect.x0 * KACHEL, st.rect.y0 * KACHEL, 'oben-' + st.key).setOrigin(0).setDepth(5).setVisible(!this.aktEbene);
  }

  // Baumkronen eines Stücks: eigene Ebene über den Figuren, halbtransparent, damit man darunter alles sieht (auch sich selbst)
  baueStueckBaeume(st) {
    if (st.foto || !hatBaeume(this.welt, st.rect)) { st.baum = null; return; }   // Luftbild: das Foto zeigt die Bäume, im Boden stehen nur Stamm-/Schattenpunkte
    const tk = this.textures.createCanvas('baum-' + st.key, st.B, st.H);
    zeichneKronen(tk.getContext(), this.welt, this.bilder, st.rect);
    tk.refresh(); this.kanteFesthalten(tk);
    st.baum = this.add.image(st.rect.x0 * KACHEL, st.rect.y0 * KACHEL, 'baum-' + st.key).setOrigin(0).setDepth(6.5).setAlpha(0.55).setVisible(!this.aktEbene);
  }

  // Haustüren draußen: geschlossen = dunkler Balken, Barrikade = Bretter, zerbrochen = Splitter
  zeichneBarrikaden() {
    for (const [key, st] of raum.state.tueren) {
      if (!key.startsWith('haus:')) continue;
      const wert = Math.ceil((st.barrikade ?? 0) / 34), stand = `${st.offen ? 1 : 0}${wert}${st.kaputt ? 1 : 0}`;
      let b = this.hausTueren.get(key);
      if (!b) {
        const h = this.welt.haeuser[Number(key.slice(5))];
        if (!h) continue;
        b = { grafik: this.add.graphics().setDepth(5.5), stand: '', haus: h };
        this.hausTueren.set(key, b);
      }
      if (stand === b.stand) continue;
      b.stand = stand;
      const g = b.grafik.clear(), h = b.haus, tx = h.tuer.x * KACHEL, ty = h.tuer.y * KACHEL;
      const quer = (h.raus?.dy ?? 1) !== 0;   // Tür in waagrechter Wand
      if (!st.offen) {   // geschlossen: dunkles Türblatt (Haustüren sind sonst offen gezeichnet)
        g.fillStyle(0x3e2723, 0.9);
        if (quer) g.fillRect(tx + 3, ty + 13, KACHEL - 6, 6); else g.fillRect(tx + 13, ty + 3, 6, KACHEL - 6);
      }
      if (st.kaputt) {   // zerbrochen: Splitter des Türblatts
        g.fillStyle(0x5d4037, 1);
        g.fillTriangle(tx + 4, ty + 6, tx + 13, ty + 9, tx + 7, ty + 15);
        g.fillTriangle(tx + 20, ty + 22, tx + 29, ty + 18, tx + 25, ty + 28);
        g.fillTriangle(tx + 16, ty + 5, tx + 24, ty + 8, tx + 18, ty + 11);
        g.fillStyle(0x8d6e63, 1).fillRect(tx + 8, ty + 24, 6, 2).fillRect(tx + 22, ty + 7, 5, 2);
      }
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
    // eigener Spieler: sehr dezenter, weicher Lichtschein statt Ring (ADD-Blend, geringe Deckkraft)
    if (ich && !this.textures.exists('eigenschein')) {
      const t = this.textures.createCanvas('eigenschein', 96, 96), c = t.getContext(), gr = c.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 96, 96); t.refresh();
    }
    const ring = ich ? this.add.image(0, 0, 'eigenschein').setDisplaySize(64, 64).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD)
      : this.add.ellipse(0, 0, 34, 34).setVisible(false);
    const bild = this.add.image(0, 0, this.menschTextur(p.aussehen), 0).setScale(MENSCH_GROESSE * groesse('figuren', (aussehenLesen(p.aussehen).g === 'w' ? 'frau' : 'mann') + '_hand') * mg());
    const fuesse = this.add.image(0, 0, 'figuren2', this.figurBild2('sv_fuesse_idle')).setScale(BOGEN2_GROESSE * mg()).setVisible(false);
    const name = this.add.text(0, -28, anzeigeName(p), { fontSize: '11px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const hp = this.add.rectangle(-12, -18, 24, 3, 0x66bb6a).setOrigin(0, 0.5);
    const tun = this.add.text(16, -16, '', { fontSize: '13px' }).setOrigin(0.5);
    const sprechen = this.add.text(-18, -16, '🔊', { fontSize: '11px' }).setOrigin(0.5).setVisible(false);   // spricht gerade (Sprachübertragung)
    box.add([ring, fuesse, bild, name, hp, tun, sprechen]);
    return { box, bild, fuesse, koerper: bild, name, hp, tun, sprechen, farbe, n, x: p.x, y: p.y, altX: p.x, altY: p.y };
  }

  neuerZombie(z) {
    const box = this.add.container(z.x, z.y).setDepth(3);
    const bild = this.add.image(0, 0, 'figuren', this.figurBild('zombie_hemd', 0)).setScale(ZOMBIE_GROESSE * groesse('figuren', 'zombie_hemd') * zg());
    box.add([bild]);
    return { box, bild, x: z.x, y: z.y, r: zRichtung(z), lauf: Math.random() * 400 };   // zufällige Laufphase: Horde läuft nicht im Gleichschritt
  }

  // Fahrzeugbilder einmalig zeichnen (Front zeigt nach rechts)
  // anim: Blaulicht-Bild 1..3 der Polizei (nur mit Bild-Sprite)
  fahrzeugTextur(art, farbe = 0, anim = 0) {
    // Bild-Sprites (autos.webp): Laster je nach Farbe truck/Mini_truck, Polizei mit wechselnden Blaulichtbildern
    if (art === 'evakuierung') { const eb = evakFahrzeugBild(this, raum.state); if (eb) return eb; }   // Leopard-Wanne / A400M-Rumpf
    const sprite = art === 'laster' ? autoEintraege('laster') : art === 'polizei' ? autoEintraege('polizei') : [];
    const sp = sprite.length ? sprite[farbe % sprite.length] : null;
    const panzer = art === 'evakuierung' && evakArtVon(raum.state) === 'panzer';   // Ersatz, falls die Leopard-Bilder fehlen: Puma-Wanne
    const key = panzer ? 'fz-evakuierung-panzer' : art === 'auto' ? 'fz-auto-' + (farbe % 8) : art === 'laster' ? (sp ? 'fz-laster-s' + (farbe % sprite.length) : 'fz-laster-' + (farbe % 4))
      : art === 'polizei' && sp ? 'fz-polizei-s' + anim : 'fz-' + art;
    if (this.textures.exists(key)) return key;
    const breit = panzer ? 80 : art === 'bus' || art === 'evakuierung' ? 112 : art === 'laster' ? 84 : art === 'feuerwehr' ? 84 : 60;
    const hoch = panzer ? 40 : art === 'bus' || art === 'evakuierung' ? 32 : sp && art === 'laster' ? 32 : 28;
    const t = this.textures.createCanvas(key, breit, hoch), c = t.getContext();
    if (panzer) {
      // Puma-Draufsicht aus dem 3D-Modell (Wanne + Turm nach vorn), Bug nach rechts wie bei allen Fahrzeugen; Wanne 7,3 m = 58 px lang
      const m = this.pumaMasse(fzPx('puma')[0]), wb = this.textures.get('puma-wanne').getSourceImage(), tb = this.textures.get('puma-turm').getSourceImage();
      c.save(); c.translate(breit / 2, hoch / 2); c.scale(m.skala, m.skala); c.drawImage(wb, -wb.width / 2, -wb.height / 2);
      c.translate(PUMA_BILD.turmX * PUMA_BILD.px, PUMA_BILD.turmY * PUMA_BILD.px); c.drawImage(tb, -PUMA_BILD.turmMx - m.R, -PUMA_BILD.turmMy - m.R); c.restore();
    } else if (sp) {
      // echte Maße (Laster 9 × 2,9 m, Polizei 4,9 × 2 m; client/masse.mjs, LAENGE in server/verkehr.mjs): zeichneAutoBild bringt das Sprite darauf
      const e = art === 'polizei' ? autoAnimEintrag(sp, anim) : sp;
      c.save(); c.translate(breit / 2, hoch / 2); zeichneAutoBild(c, e, 0, 0); c.restore();
    } else if (art === 'bus') busVonOben(c, breit / 2, hoch / 2, false, 0.6, true);
    else if (art === 'evakuierung') {   // Schulbus 12 × 2,7 m (gezeichnet für 124 × 30 px)
      const [l, b] = fzPx('evakuierung');
      c.save(); c.translate(breit / 2, hoch / 2); c.scale(l / 124, b / 30); c.translate(-breit / 2, -hoch / 2); zeichneSchulbus(c, breit, hoch); c.restore();
    } else if (art === 'feuerwehr') {
      c.save(); c.translate(0, hoch / 2); c.scale(1, 22 / 24); c.translate(0, -hoch / 2);   // Drehleiter 9,5 × 2,7 m
      c.fillStyle = '#c62828'; c.beginPath(); c.roundRect(2, 4, 76, 24, 5); c.fill();
      c.fillStyle = '#eceff1'; c.fillRect(8, 8, 44, 16);                     // Drehleiter
      c.strokeStyle = '#90a4ae'; c.lineWidth = 1.5; for (let x = 10; x < 52; x += 6) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 24); c.stroke(); }
      c.fillStyle = '#263238'; c.fillRect(64, 7, 8, 18);                     // Frontscheibe
      c.fillStyle = '#fff59d'; c.fillRect(76, 6, 2, 4); c.fillRect(76, 22, 2, 4);
      c.restore();
    } else if (art === 'laster') {
      c.save(); c.translate(breit / 2, hoch / 2); c.scale(72 / 87, 23 / 26); c.translate(-breit / 2, -hoch / 2);   // gezeichnete Fassung auf 9 × 2,9 m
      // Kastenwagen: Ladefläche mit Plane, Fahrerhaus vorn (rechts)
      const plane = ['#eceff1', '#1565c0', '#f9a825', '#2e7d32'][farbe % 4];
      c.fillStyle = plane; c.beginPath(); c.roundRect(2, 4, 64, 26, 3); c.fill();
      c.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 10; x < 62; x += 10) c.fillRect(x, 5, 1.5, 24);
      c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(4, 6, 60, 3);
      c.fillStyle = '#455a64'; c.beginPath(); c.roundRect(67, 6, 22, 22, 4); c.fill();      // Fahrerhaus
      c.fillStyle = '#1f2a33'; c.fillRect(77, 8, 8, 18);                                    // Frontscheibe
      c.fillStyle = '#fff59d'; c.fillRect(87, 8, 2, 4); c.fillRect(87, 22, 2, 4);
      c.fillStyle = '#e53935'; c.fillRect(2, 7, 2, 4); c.fillRect(2, 23, 2, 4);
      c.restore();
    } else if (art === 'wrack') {
      autoVonOben(c, { x: breit / 2, y: hoch / 2, senkrecht: false, farbe: 4, gezeichnet: true, ohneSchatten: true });
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(30,20,15,.8)'; c.fillRect(0, 0, breit, hoch);
      c.fillStyle = 'rgba(120,60,20,.5)'; for (let i = 0; i < 12; i++) c.fillRect(8 + Math.random() * 44, 8 + Math.random() * 18, 3, 3);
      c.globalCompositeOperation = 'source-over';
    } else {
      const f = art === 'polizei' ? 2 : farbe;
      autoVonOben(c, { id: 'fz' + art + f * 7919, x: breit / 2 + ((f + Math.round(breit / 2)) % 2 ? 1 : 0), y: hoch / 2, senkrecht: false, farbe: f, vorwaerts: true, gezeichnet: art === 'polizei', ohneSchatten: true });
      if (art === 'polizei') { c.fillStyle = '#1565c0'; c.fillRect(14, hoch / 2 - 7, 32, 2); c.fillRect(14, hoch / 2 + 5, 32, 2); c.fillStyle = '#263238'; c.fillRect(28, hoch / 2 - 4, 5, 8); }
    }
    t.refresh();
    return key;
  }

  // Schattenbild eines Fahrzeugs: schwarze Silhouette der Fahrzeugtextur (Textur 'sh-<key>'); wird in Weltrichtung versetzt (FZ_SCHATTEN), nicht mit dem Fahrzeug gedreht
  fahrzeugSchattenTextur(key) {
    const k = 'sh-' + key;
    if (this.textures.exists(k)) return k;
    const q = this.textures.get(key).getSourceImage(), t = this.textures.createCanvas(k, q.width, q.height), c = t.getContext();
    c.drawImage(q, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#000'; c.fillRect(0, 0, q.width, q.height); t.refresh();
    return k;
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
        // Fahrzeuge im echten Maßstab (Auto ~4,5 m): kleinere, feinere Flammen, mehr Zungen, wenig Schein/Rauch (sonst ein unscharfer Fleck über dem Auto)
        const k = haus ? 1 : 0.45, dicht = haus ? 1 : 2.2;
        const zone = anHerd(haus ? 26 : 16), kernZone = anHerd(haus ? 14 : 8);
        const scheinMass = haus ? f.r / 9 : f.r / 22;
        const schein = this.add.image(f.x, f.y, 'flamme').setTint(0xff6d00).setBlendMode('ADD').setDepth(1.2).setScale(scheinMass).setAlpha(0.35);
        const flammen = this.add.particles(f.x, f.y, 'zunge', {
          speed: { min: 35 * k, max: 90 * k }, angle: { min: 258, max: 282 }, scale: { start: 1.0 * k, end: 0.25 * k }, alpha: { start: 0.85, end: 0 },
          lifespan: { min: 380, max: 800 }, frequency: 12 / menge / dicht, tint: [0xffa726, 0xff7043, 0xf4511e, 0xc62828], blendMode: 'ADD', emitZone: zone,
        }).setDepth(5.6);
        const kern = this.add.particles(f.x, f.y, 'zunge', {
          speed: { min: 15 * k, max: 45 * k }, angle: { min: 255, max: 285 }, scale: { start: 0.65 * k, end: 0 }, alpha: { start: 0.9, end: 0 },
          lifespan: { min: 250, max: 500 }, frequency: 25 / menge / dicht, tint: [0xffffff, 0xfff59d, 0xffe082], blendMode: 'ADD', emitZone: kernZone,
        }).setDepth(5.65);
        const funken = this.add.particles(f.x, f.y, 'flamme', {
          speed: { min: 50 * k, max: 140 * k }, angle: { min: 225, max: 315 }, gravityY: 25 * k, scale: { start: 0.18 * Math.sqrt(k), end: 0.05 }, alpha: { start: 1, end: 0 },
          lifespan: { min: 700, max: 1500 }, frequency: 110 / menge, tint: [0xffd180, 0xffab40], blendMode: 'ADD', emitZone: kernZone,
        }).setDepth(5.66);
        const rauch = this.add.particles(f.x, f.y, 'flamme', {
          speedY: { min: -60 * k, max: -25 * k }, speedX: { min: 5 * k, max: 30 * k }, scale: { start: 1.1 * k, end: 3.8 * k }, alpha: { start: haus ? 0.3 : 0.22, end: 0 },
          lifespan: { min: 2400, max: 3600 }, frequency: 70 / menge, tint: [0x2b2b2b, 0x3d3d3d, 0x4a4542], emitZone: zone, rotate: { min: 0, max: 360 },
        }).setDepth(5.7);
        o = { schein, scheinMass, teile: [flammen, kern, funken, rauch], basis: [18 / menge / dicht, 25 / menge / dicht, 110 / menge, 70 / menge] };
        this.feuerObj.set(id, o);
      }
      const st = Math.max(0.05, f.staerke), sichtbar = this.aktEbene === '';
      o.teile.forEach((t, i) => { t.frequency = o.basis[i] / st; t.setVisible(sichtbar); });
      o.schein.setVisible(sichtbar).setAlpha((0.22 + Math.random() * 0.12) * st).setScale(o.scheinMass * (0.95 + Math.random() * 0.1));
    }
    for (const [id, o] of this.feuerObj) if (!s.feuer?.has(id)) { o.teile.forEach(t => t.destroy()); o.schein.destroy(); this.feuerObj.delete(id); }
    // Ruinen und ausgebrannte Autos/Busse (nur neu zeichnen, wenn sich etwas ändert)
    const stand = s.verbrannt?.size ?? 0;
    // Wracks und Ruinen gehören zur Außenwelt: im Innenraum ausblenden (sonst liegt ein dunkles Autowrack mit braunem Quadrat über den Möbeln)
    this.ruinenGfx?.setVisible(!this.aktEbene); this.wrackGfx?.setVisible(!this.aktEbene);
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
        if (art === 'auto') { autoFlaeche(w.fillStyle(0x15100c, 0.92), b, -18, 18, 8); w.fillStyle(0x6d3a1a, 0.6).fillRect(b.x - 4, b.y - 4, 8, 8); }
        else { const d = this.welt.deko.find(q => q.art === 'bus' && Math.hypot(q.x - b.x, q.y - b.y) < 4); const sk = d?.senkrecht; g.fillStyle(0x15100c, 0.9).fillRect(b.x - (sk ? 15 : 62), b.y - (sk ? 62 : 15), sk ? 30 : 124, sk ? 124 : 30); }
      }
    }
  }

  // durchsuchte Behälter erkennbar machen: draußen offener Kofferraum, drinnen offene Türen; leer = ausgegraut
  spurenDarstellen(s) {
    let stand = '';
    for (const [id, b] of s.behaelter) stand += id + b.rest;
    stand += '|' + [...(this.leereKisten ?? [])].join(',');
    if (stand === this.spurenStand && this.spurenEbene === this.aktEbene) return;
    this.spurenStand = stand; this.spurenEbene = this.aktEbene;
    this.spurenGfx ??= this.add.graphics().setDepth(1.08);
    const g = this.spurenGfx.clear();
    const gk = (this.kistenGfx ??= this.add.graphics().setDepth(5.05)).clear().setVisible(!this.aktEbene);   // Stützpunkt-Kisten liegen im Kartenstück 'oben' (Tiefe 5)
    const w = this.wv(this.aktEbene);
    for (const b of w.behaelter ?? []) {
      // Stützpunkt-Kisten: leer = für DIESEN Spieler ausgeräumt (Munitionskisten: je Spieler eigener Inhalt, Meldung 'gefunden' mit kiste-Id)
      if (b.art === 'bw_kiste' || b.art === 'sanikiste' || b.art === 'bw_container') {
        if (!(b.art === 'bw_kiste' ? this.leereKisten?.has(b.id) : s.behaelter.get(b.id)?.rest === 0)) continue;
        const t = this.welt.stuetzpunkt?.teile.find(q => (q.art === 'kiste' || q.art === 'container') && Math.hypot(q.x - b.x, q.y - b.y) < 3);
        const hw = (t ? t.w : 20) / 2, hd = (t ? t.d : 16) / 2, wi = t ? t.winkel : (b.winkel ?? 0), cs = Math.cos(wi), sn = Math.sin(wi);
        const pkt = (u, v) => ({ x: b.x + u * cs - v * sn, y: b.y + u * sn + v * cs });
        const flaeche = (a, f, al) => { const q = [pkt(-a * hw, -a * hd), pkt(a * hw, -a * hd), pkt(a * hw, a * hd), pkt(-a * hw, a * hd)]; gk.fillStyle(f, al).fillPoints(q, true); return q; };
        flaeche(1, 0x8a8a84, 0.55);        // ausgegraut
        flaeche(0.72, 0x1c1c1a, 0.7);      // offener, leerer Kasten
        const k = (x0, y0, x1, y1) => { const p0 = pkt(x0, y0), p1 = pkt(x1, y1); gk.lineStyle(1.5, 0xbdbdbd, 0.8).lineBetween(p0.x, p0.y, p1.x, p1.y); };
        k(-5, -4, 5, 4); k(5, -4, -5, 4);  // kleines Leer-Kreuz
        continue;
      }
      const z = s.behaelter.get(b.id);
      if (!z) continue;
      const leer = z.rest === 0;
      if (b.art === 'auto') {
        continue;   // Autos sehen immer normal aus (keine Markierung für durchsuchte/leere Kofferräume)
      } else if (b.art !== 'bus') {
        // das Möbelstück, zu dem der Behälter gehört (Rahmen und Kreuz liegen genau auf dem gedrehten Möbelbild = ganzes Möbelrechteck)
        const KW = kachelVon(w), kx = Math.floor(b.x / KW), ky = Math.floor(b.y / KW), ra = w.kachel ? 0.5 : 3;
        const m = (w.moebel ?? []).find(q => kx >= q.x && kx < q.x + q.b && ky >= q.y && ky < q.y + q.h);
        if (m) {
          const x0 = m.x * KW + ra, y0 = m.y * KW + ra, bw = m.b * KW - 2 * ra, bh = m.h * KW - 2 * ra;
          if (leer) {
            const lw = w.kachel ? 0.35 : 1.5, ei = w.kachel ? 0.8 : 3;
            g.fillStyle(0x6e6e6e, 0.28).fillRect(x0, y0, bw, bh);
            g.lineStyle(lw, 0xbdbdbd, 0.55).strokeRect(x0, y0, bw, bh);
            g.lineStyle(lw, 0xbdbdbd, 0.45).lineBetween(x0 + ei, y0 + ei, x0 + bw - ei, y0 + bh - ei).lineBetween(x0 + bw - ei, y0 + ei, x0 + ei, y0 + bh - ei);
          } else {
            if (!w.kachel) g.fillStyle(0x111111, 0.3).fillRect(b.x - 9, b.y - 9, 18, 18);   // geöffnete Türen
            else g.fillStyle(0x111111, 0.22).fillRect(x0, y0, bw, bh);
            g.lineStyle(w.kachel ? 0.35 : 1.5, 0xffd54f, 0.6).strokeRect(x0, y0, bw, bh);
          }
        } else {
          g.lineStyle(2, leer ? 0x9e9e9e : 0xffd54f, 0.9).strokeRect(b.x - 12, b.y - 12, 24, 24);
          g.fillStyle(0x111111, 0.55).fillRect(b.x - 9, b.y - 9, 18, 18);
          if (leer) g.lineStyle(2, 0xbdbdbd, 0.9).lineBetween(b.x - 6, b.y - 6, b.x + 6, b.y + 6).lineBetween(b.x + 6, b.y - 6, b.x - 6, b.y + 6);
        }
      }
    }
    g.setDepth(this.aktEbene ? 0.45 : 1.08);
  }

  // kleines Symbol über Behältern in der Nähe (< 2 Kacheln): 📦 = noch etwas drin bzw. noch nicht durchsucht, ∅ = leer.
  // Nutzt nur den Zustand, den alle Clients ohnehin haben (state.behaelter: rest nur für durchsuchte).
  behaelterSymbole(s) {
    const pool = this.behSymbole ??= [];
    const lok = this.lokal, w = this.wv(this.aktEbene);
    let n = 0;
    if (lok && w) {
      for (const b of w.behaelter ?? []) {
        if (n >= 6) break;
        if (b.art === 'bw_kiste' || b.art === 'bus' || b.art === 'auto') continue;   // Autos/Kofferräume ohne Symbol
        if (Math.hypot(b.x - lok.x, b.y - lok.y) > (w.kachel ? 20 : 2 * KACHEL)) continue;
        if (b.art === 'auto' && s.verbrannt?.has('auto:' + b.id)) continue;
        const leer = b.art === 'bw_kiste' ? this.leereKisten?.has(b.id) : s.behaelter.get(b.id)?.rest === 0;
        const t = pool[n] ??= this.add.text(0, 0, '', { fontSize: '13px', fontFamily: 'sans-serif', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(6);
        t.setText(leer ? '∅' : '📦').setAlpha(leer ? 0.6 : 0.95).setScale(this.uiMass()).setPosition(b.x, b.y - 14 * (w.kachel ? 0.3 : 1)).setVisible(true);
        n++;
      }
    }
    for (let i = n; i < pool.length; i++) pool[i].setVisible(false);
  }

  // Missionsgegenstand im Haus: der Behälter, in dem er liegt, glänzt goldgelb und pulsiert (solange er nicht durchsucht ist)
  missionGlanz(s) {
    const w = this.aktEbene ? this.wv(this.aktEbene) : null;
    const liste = w ? [...(s.missionen?.values() ?? [])].filter(q => !q.abgegeben && q.behaelter && q.behaelter.startsWith(this.aktEbene + ':') && !s.behaelter.has(q.behaelter)) : [];
    if (!liste.length) { this.glanzGfx?.clear(); return; }
    const g = (this.glanzGfx ??= this.add.graphics().setDepth(6.2)).clear();
    const ph = (this.time.now % 1500) / 1500;
    for (const q of liste) {
      const b = (w.behaelter ?? []).find(x => x.id === q.behaelter);
      if (!b) continue;
      const puls = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
      const k = w.kachel ? 0.3 : 1;   // maßstäblich: Glanz im Maßstab des Möbelstücks
      g.fillStyle(0xffd600, 0.18 + 0.14 * puls); g.fillCircle(b.x, b.y, (17 + 3 * puls) * k);
      g.lineStyle(2 * k, 0xffe57f, 0.9 * (1 - ph)); g.strokeCircle(b.x, b.y, (12 + 22 * ph) * k);
      g.lineStyle(2 * k, 0xffd600, 0.85); g.strokeCircle(b.x, b.y, 15 * k);
    }
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

  // umgefärbter Held/Heldin: acht Körperbilder (Haltungen) nebeneinander; Stiefel bleiben im Bogen 'helden160'
  heldenTextur(aussehenTextWert) {
    const a = aussehenLesen(aussehenTextWert), key = 'held_' + aussehenText(a);
    if (this.textures.exists(key)) return key;
    const quelle = this.textures.get('helden160').getSourceImage(), FELD = 160, gg = a.g === 'f' ? 'w' : 'm';
    const tex = this.textures.createCanvas(key, FELD * HELD_HALTUNGEN.length, FELD), ctx = tex.getContext();
    HELD_HALTUNGEN.forEach((h, k) => {
      const nr = this.heldenListe[`held_${gg}_${h}`]?.[0] ?? 0;
      umgefaerbt(ctx, quelle, FELD, nr, 25, k * FELD, 0, a);
      tex.add(k, 0, k * FELD, 0, FELD, FELD);
    });
    tex.refresh();
    return key;
  }
  heldBild(name, i = 0) {
    const l = this.heldenListe[name];
    return l?.length ? l[((i % l.length) + l.length) % l.length] : 0;
  }

  // ---------- Ebenen: Innenräume ----------
  wv(ebene) {
    if (!ebene) return this.welt;
    let w = this.innenWelten.get(ebene);
    if (!w) {
      w = innenraumFuer(raum.state.seed, this.welt, ebene);
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
    const K = kachelVon(w), SK = w.kachel ? BILD_SKALA : 1;   // Feinraster: Bild in höherer Auflösung
    const B = w.b * K, H = w.h * K, X = w.ox * K, Y = w.oy * K;
    const tex = this.textures.createCanvas('innen-' + ebene, B * SK, H * SK);
    if (w.kachel) zeichneInnenFein(tex.getContext(), w); else zeichneInnen(tex.getContext(), w);
    tex.refresh();
    const bild = this.add.image(X, Y, 'innen-' + ebene).setOrigin(0).setDepth(0.2).setScale(1 / SK);
    const tueren = this.add.graphics().setDepth(0.4);
    const symbole = this.add.container(0, 0).setDepth(0.5);   // ❓/🔑 an verschlossenen Türen
    const dunkel = this.add.renderTexture(X, Y, B, H).setOrigin(0).setDepth(9);
    const nebel = this.add.graphics().setDepth(9.5);   // Räume hinter nie geöffneten Türen: ganz schwarz
    // Safe Room: Vorratskiste (Kistenbild) und Bretter an der Eingangstür
    const safe = w.kiste && !w.kachel ? this.add.image(w.kiste.x, w.kiste.y, 'kiste').setScale(0.62).setDepth(0.45) : null;   // maßstäblich: Vorratskiste ist ein gezeichnetes Möbelstück
    const bretter = this.add.graphics().setDepth(0.46);
    const schild = w.safe ? this.add.text(X + B / 2, Y - 14, '🛡 ' + (w.safeName ?? 'Safe Room'), {
      fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#263238', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9.6).setScale(w.kachel ? 0.3 : 1) : null;   // maßstäblich: Schild nicht mit dem Innenzoom aufblasen
    a = { w, bild, tueren, symbole, dunkel, nebel, safe, bretter, schild, X, Y, B, H, stand: '', bekannt: new Set(), nebelStand: -1, bretterWert: -1 };
    this.innenAnsichten.set(ebene, a);
    return a;
  }

  wechsleAnsicht(ebene) {
    this.aktEbene = ebene;
    for (const o of this.aussenObjekte) o.setVisible(!ebene);
    for (const st of this.stuecke.values()) { st.boden.setVisible(!ebene); st.oben?.setVisible(!ebene); st.baum?.setVisible(!ebene); }
    const teile = a => [a.bild, a.tueren, a.symbole, a.dunkel, a.nebel, a.safe, a.bretter, a.schild].filter(Boolean);
    for (const [e, a] of this.innenAnsichten) for (const o of teile(a)) o.setVisible(e === ebene);
    const cam = this.cameras.main;
    if (ebene) {
      const a = this.innenAnsicht(ebene);
      for (const o of teile(a)) o.setVisible(true);
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
    // Bretter an der Haustür (am Ausgang) je nach Barrikade (34 % je Brett); Safe Rooms zeigen den Wert aus ihrem Safe
    if (w.ausgang && w.nr !== undefined) {
      const wert = Math.ceil(((w.safe ? raum.state.safes.get(w.safe)?.barrikade : raum.state.tueren.get('haus:' + w.nr)?.barrikade) ?? 0) / 34);
      if (wert !== a.bretterWert) {
        a.bretterWert = wert;
        const g = a.bretter.clear();
        if (w.kachel) {   // maßstäblich: Bretter quer vor der Haustür, von der Türöffnung ins Zimmer gestapelt (1,25 m breit, je Brett 0,25 m)
          const r = w.ausgang.rect, K = w.kachel, [nx, ny] = w.ausgang.nach;
          for (let i = 0; i < wert; i++) {
            const off = (i + 0.5) * 1.7;
            const [bx, by, bw, bh] = ny !== 0
              ? [r.x * K - 0.6, (ny > 0 ? r.y * K : (r.y + r.h) * K) - ny * off - 0.55, r.b * K + 1.2, 1.1]
              : [(nx > 0 ? r.x * K : (r.x + r.b) * K) - nx * off - 0.55, r.y * K - 0.6, 1.1, r.h * K + 1.2];
            g.fillStyle(0xa1887f, 1).fillRect(bx, by, bw, bh); g.lineStyle(0.25, 0x4e342e, 1).strokeRect(bx, by, bw, bh);
            g.fillStyle(0x424242, 1).fillRect(bx + 0.4, by + 0.4, 0.3, 0.3).fillRect(bx + bw - 0.7, by + bh - 0.7, 0.3, 0.3);
          }
        } else {
          const tx = w.ausgang.x * KACHEL, ty = w.ausgang.y * KACHEL;
          const quer = w.hole(w.ausgang.x - 1, w.ausgang.y) === T.WAND;   // Tür in waagrechter Wand
          for (let i = 0; i < wert; i++) {
            const o = 4 + i * 9;
            if (quer) { g.fillStyle(0xa1887f, 1).fillRect(tx - 4, ty + o, KACHEL + 8, 6); g.lineStyle(1, 0x4e342e, 1).strokeRect(tx - 4, ty + o, KACHEL + 8, 6); }
            else { g.fillStyle(0xa1887f, 1).fillRect(tx + o, ty - 4, 6, KACHEL + 8); g.lineStyle(1, 0x4e342e, 1).strokeRect(tx + o, ty - 4, 6, KACHEL + 8); }
          }
        }
      }
    }
    let stand = '', zus = '';
    for (const t of w.tueren) {
      const st = raum.state.tueren.get(`${ebene}:${t.x},${t.y}`);
      const offen = !!st?.offen, zu = st ? st.verschlossen : t.verschlossen;
      setzeTuerKacheln(w, t, offen);
      const sa = zu && !offen ? this.schlossArtVon(`${ebene}:${t.x},${t.y}`) : 'frei';   // frei: geht einfach auf, kein Schloss zu sehen
      stand += offen ? 'o' : sa === 'raetsel' ? 'r' : sa === 'schluessel' ? 's' : 'z';
      zus += `${Math.ceil((st?.barrikade ?? 0) / 34)}${st?.kaputt ? 'k' : ''},`;   // Bretter und Bruch
    }
    if (stand !== a.stand || zus !== a.zus) {
      a.zus = zus;
      if (a.stand) for (let i = 0; i < stand.length; i++) if ((stand[i] === 'o') !== (a.stand[i] === 'o')) { ton.tuer(stand[i] === 'o'); break; }
      a.stand = stand;
      const zusListe = zus.split(',');
      const g = a.tueren.clear();
      a.symbole.removeAll(true);
      w.tueren.forEach((t, i) => {
        if (w.kachel) { zeichneTuerFein(g, this, a, w, t, stand[i], zusListe[i]); return; }
        const x = t.x * KACHEL, y = t.y * KACHEL, z = stand[i];
        const senkrecht = w.hole(t.x, t.y - 1) === T.WAND;   // Wand oben/unten → Tür in senkrechter Wand
        if (z === 'o') {
          g.fillStyle(0x6d4c41, 1);
          if (senkrecht) g.fillRect(x + 2, y + 1, 26, 5); else g.fillRect(x + 1, y + 2, 5, 26);
        } else {
          g.fillStyle(z === 'r' || z === 's' ? 0x5d4037 : 0x8d6e63, 1).fillRect(x + 2, y + 2, KACHEL - 4, KACHEL - 4);
          g.lineStyle(2, 0x3e2723, 1).strokeRect(x + 2, y + 2, KACHEL - 4, KACHEL - 4);
          g.fillStyle(0xffd54f, 1).fillCircle(x + KACHEL - 9, y + KACHEL / 2, 2.5);
          if (z === 'r' || z === 's') {
            a.symbole.add(this.add.text(x + KACHEL / 2, y + KACHEL / 2 - 9, z === 'r' ? '❓' : '🔑', { fontSize: '12px' }).setOrigin(0.5)); g.fillStyle(0xb0bec5, 1).fillRect(x + KACHEL / 2 - 4, y + KACHEL / 2 - 2, 8, 7); g.lineStyle(2, 0xb0bec5, 1).strokeCircle(x + KACHEL / 2, y + KACHEL / 2 - 3, 3); }
        }
        const brett = parseInt(zusListe[i]) || 0;
        if (zusListe[i].includes('k')) {   // zerbrochen: Splitter am Rahmen
          g.fillStyle(0x5d4037, 1);
          g.fillTriangle(x + 3, y + 5, x + 12, y + 8, x + 6, y + 14);
          g.fillTriangle(x + 21, y + 22, x + 29, y + 18, x + 25, y + 28);
          g.fillStyle(0x8d6e63, 1).fillRect(x + 9, y + 24, 6, 2).fillRect(x + 20, y + 6, 5, 2);
        }
        const quer = w.hole(t.x - 1, t.y) === T.WAND;   // Wand verläuft waagrecht: Bretter längs
        for (let k = 0; k < brett; k++) {
          const o = 4 + k * 9;
          g.fillStyle(0xa1887f, 1); g.lineStyle(1, 0x4e342e, 1);
          if (quer) { g.fillRect(x - 4, y + o, KACHEL + 8, 6); g.strokeRect(x - 4, y + o, KACHEL + 8, 6); }
          else { g.fillRect(x + o, y - 4, 6, KACHEL + 8); g.strokeRect(x + o, y - 4, 6, KACHEL + 8); }
        }
      });
    }
    this.nebelAktualisieren(a);
    const d = a.dunkel;
    // tagsüber fällt in etwa 70 % der Häuser Licht durch die Fenster: keine Lampe nötig
    const m = EBENE_MUSTER.exec(ebene), uhr = raum.state.uhr ?? 480;
    if (m && (a.w.safe || hausHell(Number(m[1]), m[2], uhr))) {   // Safe Rooms haben Notlicht
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
    this.fensterLichtZeichnen(d, a, m, 1 - helligkeit(uhr));
    const lx = this.lokal.x - a.X, ly = this.lokal.y - a.Y;
    const lk = w.kachel ? 0.3 : 1;   // maßstäblich: Lichtkreis um die Figur im Maßstab des Raums (Radius ~2 m statt ~12 m)
    this.lichtPinsel.setScale((lampe ? 0.42 : 0.36) * lk).setAlpha(lampe ? 1 : 0.8);
    d.erase(this.lichtPinsel, lx, ly);
    if (lampe) {
      this.lampeKegel(d, lx, ly, this.lampenRichtung(ich), true);
    }
    this.fremdeLampen(d, a.X, a.Y, ebene);
    this.muendungsAufhellen(d, a.X, a.Y, ebene);
    this.setzeGrau(!lampe);
  }

  // Nachts fällt durch die Fenster der Laternenseite schwaches Licht (bläulich-gelblich) auf den Boden: in die Abdunklung radiert, nicht im Keller.
  // Die Flecken werden je Ebene einmal berechnet (a.fenster), pro Bild nur die nahen gezeichnet.
  fensterLichtZeichnen(d, a, m, daemmer) {
    const w = a.w;
    if (!m || !w.kachel || w.stock === 'keller' || daemmer < 0.05) return;
    if (!a.fenster) {
      const haus = this.welt.haeuser?.[Number(m[1])];
      const seite = haus ? lichtSeite(w, lichtRichtungWelt(haus, this.laternenListe, this.welt, KACHEL, T.STRASSE)) : null;
      a.fenster = fensterFlecken(w, seite);
    }
    if (!a.fenster.length) return;
    const v = this.cameras.main.worldView, P = this.weichPinsel, k = Math.min(1, daemmer * 1.4);
    P.setAlpha(0.14 * k);
    for (const f of a.fenster) {
      if (a.X + f.x < v.x - 160 || a.X + f.x > v.right + 160 || a.Y + f.y < v.y - 160 || a.Y + f.y > v.bottom + 160) continue;
      P.setScale(f.sx, f.sy); d.erase(P, f.x, f.y);
    }
    P.setTint(0xdfe8ff).setAlpha(0.05 * k);   // leicht kühler Schimmer über dem aufgehellten Boden
    for (const f of a.fenster) {
      if (a.X + f.x < v.x - 160 || a.X + f.x > v.right + 160 || a.Y + f.y < v.y - 160 || a.Y + f.y > v.bottom + 160) continue;
      P.setScale(f.sx, f.sy); d.draw(P, f.x, f.y);
    }
    P.clearTint();
  }

  // Taschenlampen der Mitspieler: Kegel in Blickrichtung (weich nachgeführt), gleiche Pinsel-Technik wie der eigene; höchstens 8 (nächste zuerst).
  // Drinnen nur Mitspieler auf derselben Ebene (Haus und Stockwerk), draußen nur Mitspieler draußen.
  // Mündungsfeuer erhellt die Umgebung (client/muendungslicht.mjs): Blitz anlegen; gezeichnet wird in aussenLicht/innenAnsicht (radiert die Abdunklung)
  // und als schwacher additiver Warmschein im Weltbild (feste Bildpool, kein neues Objekt pro Frame)
  muendungsLicht(x, y, ebene, art) {
    this.blitzListe ??= new Blitzliste();
    this.blitzListe.neu(x, y, ebene ?? this.aktEbene ?? '', art, performance.now());
  }

  muendungsSchein() {
    const liste = this.blitzListe;
    if (!liste) return;
    const pool = this.blitzSchein ??= Array.from({ length: MUENDUNG_MAX }, () => this.add.image(0, 0, 'lichtweich').setBlendMode('ADD').setTint(0xffb050).setDepth(7.5).setVisible(false));
    const jetzt = performance.now();
    let i = 0;
    liste.jeder(jetzt, this.aktEbene ?? '', (b, s) => {
      pool[i++].setPosition(b.x, b.y).setScale(b.r / WEICH_RADIUS).setAlpha(0.15 * s).setVisible(true);
    });
    for (; i < pool.length; i++) if (pool[i].visible) pool[i].setVisible(false);
  }

  // Blitze radieren die Abdunklung (rt/d: Maske; ox, oy: Ursprung der Maske in Weltkoordinaten)
  muendungsAufhellen(ziel, ox, oy, ebene) {
    const liste = this.blitzListe;
    if (!liste) return;
    const P = this.weichPinsel;
    liste.jeder(performance.now(), ebene, (b, s) => {
      P.setScale(b.r / WEICH_RADIUS).setAlpha(s);
      ziel.erase(P, b.x - ox, b.y - oy);
    });
  }

  // Ein Kegel für alle (eigene, Mitspieler, Bots, Nebel): gleicher Pinsel, gleiche Länge/Helligkeit; drinnen etwas kürzer
  lampeKegel(ziel, x, y, winkel, innen, alpha = 1) {
    this.lampenPinsel.setRotation(winkel).setScale((innen ? 0.8 : AUSSEN_ZOOM_KORREKTUR) * (innen && this.feinInnen() ? 0.13 : 1)).setAlpha(alpha);   // maßstäblich: Lichtkegel ~7 m lang
    ziel.erase(this.lampenPinsel, x, y);
  }

  // Alle leuchtenden Lampen draußen für den Nebel: eigene + Mitspieler/Bots (Winkel wie bei der Nachtdunkelheit)
  lampenListeAussen(ich) {
    const l = [];
    if (ich?.lampe > 0 && this.lokal) l.push({ x: this.lokal.x, y: this.lokal.y, winkel: this.lampenRichtung(ich) });
    this.fremdeLampen(null, 0, 0, '', l);
    return l;
  }

  fremdeLampen(ziel, ox, oy, ebene, sammeln = null) {
    if (!this.lampenWinkelAndere) this.lampenWinkelAndere = new Map();
    const v = this.cameras.main.worldView, r = 360, liste = [];
    for (const [id, p] of raum.state.spieler) {
      if (id === meineId) continue;
      if (!(p.lampe > 0) || (p.ebene ?? '') !== (ebene ?? '') || p.zombie > 0 || p.unten || !p.verbunden) continue;
      if (p.x < v.x - r || p.x > v.right + r || p.y < v.y - r || p.y > v.bottom + r) continue;
      liste.push([Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y), id, p]);
    }
    liste.sort((a, b) => a[0] - b[0]);
    const dt = this.game.loop.delta / 1000, benutzt = new Set(), bild = this.game.loop.frame, neuerBild = this.lampenBild !== bild;
    this.lampenBild = bild;
    for (const [, id, p] of liste.slice(0, 8)) {
      benutzt.add(id);
      let neu = this.lampenWinkelAndere.get(id) ?? p.richtung;
      if (neuerBild) { neu = Phaser.Math.Angle.RotateTo(neu, p.richtung, dt * 3.5); this.lampenWinkelAndere.set(id, neu); }   // je Bild nur einmal nachführen (mehrere Zeichner)
      if (sammeln) sammeln.push({ x: p.x, y: p.y, winkel: neu });
      else this.lampeKegel(ziel, p.x - ox, p.y - oy, neu, !!ebene);
    }
    for (const id of this.lampenWinkelAndere.keys()) if (!benutzt.has(id) && !raum.state.spieler.get(id)?.lampe) this.lampenWinkelAndere.delete(id);
  }

  // Kegel folgt der Laufrichtung weich (nicht jedem Ruck, z. B. beim automatischen Zielen)
  lampenRichtung(ich) {
    if (this.lampenRichtungBild === this.game.loop.frame && this.lampenWinkel !== undefined) return this.lampenWinkel;   // je Bild nur einmal nachführen
    this.lampenRichtungBild = this.game.loop.frame;
    // ohne eigene Eingabe (Stillstand oder AFK-Bot steuert den Helden) zählt die Blickrichtung vom Server
    const e = this.eingabe, ziel = Math.hypot(e.dx, e.dy) > 0.1 ? Math.atan2(e.dy, e.dx) : (ich.richtung ?? this.lampenWinkel ?? 0);
    this.lampenWinkel = Phaser.Math.Angle.RotateTo(this.lampenWinkel ?? ziel, ziel, this.game.loop.delta / 1000 * 3.5);
    return this.lampenWinkel;
  }

  // Nebel (client/nebel.mjs): Dichte und Sichtweite kommen vom Server
  nebelZeichnen(ich, dt) {
    const n = this.nebelEbene ??= new NebelEbene(this), st = raum.state;
    if (!ich || !this.lokal) { n.verstecken(); return; }
    const fz = this.flug?.zentrum();
    n.aktualisiere(this.cameras.main.worldView, fz ? fz.x : this.lokal.x, fz ? fz.y : this.lokal.y, st.nebel ?? 0, st.nebelSicht || 20, 1 - helligkeit(st.uhr ?? 480), this.lampenListeAussen(ich), dt, !!this.aktEbene, (d => d * d * (3 - 2 * d) * (st.nachtDunkel ?? 92) / 100)(1 - helligkeit(st.uhr ?? 480)), (ziel, ox, oy, lp, alpha) => this.lampeKegel(ziel, lp.x - ox, lp.y - oy, lp.winkel, false, alpha));
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
    // nur dunkler/heller: neutrale, leicht bläuliche Nacht ohne Farbwechsel; Stärke = Einstellung „Nachtdunkelheit“
    const sanft = dunkel * dunkel * (3 - 2 * dunkel);
    rt.fill(0x060a14, Math.min(1, sanft * (raum.state.nachtDunkel ?? 92) / 100));
    this.muendungsAufhellen(rt, ox, oy, '');
    if (dunkel < 0.3) return;
    const sicht = (x, y, r) => x > v.x - r && x < v.right + r && y > v.y - r && y < v.bottom + r;
    const P = this.weichPinsel;
    for (const f of raum.state.feuer?.values() ?? []) if (sicht(f.x, f.y, 300)) { P.setScale(f.r / 60 + 0.6).setAlpha(Math.min(1, 0.6 + f.staerke * 0.4) * (0.85 + Math.random() * 0.15)); rt.erase(P, f.x - ox, f.y - oy); }
    if (this.bwLicht && raum.state.stuetzpunkt === 'steht') this.bwLicht.zeichne(rt, P, this.lampenPinsel, ox, oy, sicht, dunkel, zombieKarte().values(), this.game.loop.delta / 1000);
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
    this.fremdeLampen(rt, ox, oy, '');
    const fz = this.flug?.zentrum();
    const lx = (fz ? fz.x : this.lokal.x) - ox, ly = (fz ? fz.y : this.lokal.y) - oy;   // Kameraflug: Schein um die Kamera
    // Ring um den Spieler: ohne Taschenlampe wie früher (Bildschirmgröße), mit Lampe nur ein schwacher Schein (~2 m)
    if (ich.lampe > 0 && !fz) P.setScale(0.125).setAlpha(0.3); else P.setScale(0.6 * AUSSEN_ZOOM_KORREKTUR).setAlpha(0.8);
    rt.erase(P, lx, ly);
    if (ich.lampe > 0 && !fz) this.lampeKegel(rt, lx, ly, this.lampenRichtung(ich), false);
  }

  // Von der eigenen Position aus alles erkunden, was ohne geschlossene Tür erreichbar ist; einmal gesehen bleibt sichtbar
  nebelAktualisieren(a) {
    const w = a.w, KW = kachelVon(w), BR = breiteVon(w), tx = Math.floor(this.lokal.x / KW), ty = Math.floor(this.lokal.y / KW);
    const start = ty * BR + tx;
    if (a.bekannt.has(start) && a.nebelStand === a.stand) return;
    a.nebelStand = a.stand;
    const drin = (x, y) => x >= w.ox && x < w.ox + w.b && y >= w.oy && y < w.oy + w.h;
    const sperre = t => t === T.WAND || t === T.INNENTUER || t === T.LEER;
    const offen = [[tx, ty]], gesehen = new Set([start]);
    while (offen.length) {
      const [x, y] = offen.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = ny * BR + nx;
        if (!drin(nx, ny) || gesehen.has(k)) continue;
        gesehen.add(k);
        a.bekannt.add(k);                                       // Wände und Türen am Rand sind auch zu sehen
        if (!sperre(w.hole(nx, ny)) && (dx === 0 || dy === 0)) offen.push([nx, ny]);
        else gesehen.delete(k);                                 // schräg/gesperrt: sichtbar, aber nicht weiter suchen
      }
    }
    a.bekannt.add(start);
    const g = a.nebel.clear().fillStyle(0x000000, 1);
    const ueb = w.kachel ? 0.1 : 0.5;
    for (let y = w.oy; y < w.oy + w.h; y++) {
      for (let x = w.ox; x < w.ox + w.b; x++) {
        if (a.bekannt.has(y * BR + x)) continue;
        let x2 = x; while (x2 + 1 < w.ox + w.b && !a.bekannt.has(y * BR + x2 + 1)) x2++;   // zusammenhängende Strecke in einem Rechteck
        g.fillRect(x * KW - ueb, y * KW - ueb, (x2 - x + 1) * KW + 2 * ueb, KW + 2 * ueb);
        x = x2;
      }
    }
  }

  // drinnen ohne Licht: alles schwarz-weiß (Farbmatrix der Kamera, nur mit WebGL)
  setzeGrau(an) {
    if (this.grauAn === an) return;
    this.grauAn = an;
    const fx = this.cameras.main.postFX;
    if (!fx) return;
    if (!this.grau) this.grau = fx.addColorMatrix();
    if (an) this.grau.grayscale(1);
    else { fx.remove(this.grau); this.grau = null; }   // Kamera-Nachbearbeitung ganz entfernen: sonst kostet sie auch ohne Wirkung einen Vollbild-Durchgang je Frame
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
    // neuer Stand vom Server: Positionen mit Server-Zeitstempel merken (Glättung in client/netzpuffer.mjs)
    const pf = this.puffer, pp = this.pufferPos;
    if (!raum.__ankunftHaken) {   // genauer Ankunftszeitpunkt jedes Zustands (nicht erst beim nächsten Bild)
      raum.__ankunftHaken = true;
      raum.onStateChange(st => { if (st?.takt !== raum.__ankunftTakt) { raum.__ankunftTakt = st?.takt; raum.__ankunft = performance.now(); } });
    }
    if (pf.patch(s.takt, raum.__ankunftTakt === s.takt && raum.__ankunft ? raum.__ankunft : performance.now())) {
      for (const [id, p] of s.spieler) if (id !== meineId) pf.merke('s' + id, p.x, p.y, s.takt);
      for (const [id, z] of zombieKarte()) pf.merke('z' + id, z.x, z.y, s.takt, true);
      for (const [id, m] of s.menschen ?? []) pf.merke('m' + id, m.x, m.y, s.takt, true);
    }
    const rt = typeof s.takt === 'number' ? pf.zeit(performance.now()) : null;   // Anzeigezeit (Server-Uhr minus Verzögerung)
    // Spieler
    for (const [id, p] of s.spieler) {
      let f = this.figuren.get(id);
      if (!f) { f = this.neueFigur(p, id); this.figuren.set(id, f); }
      if (id === meineId && p.su && !suAn) { suAn = true; suMenueEinrichten(this); }   // Superuser: Testmenü-Knopf (Server prüft jeden Befehl)
      { const nm = anzeigeName(p); if (f.name.text !== nm) f.name.setText(nm); }   // AFK: ein Bot steuert die Figur
      if (id === meineId) continue;
      f.box.setVisible((p.ebene ?? '') === this.aktEbene && !p.anBord);   // an Bord eines Evakuierungsfahrzeugs: Figur ausgeblendet
      if ((f.ebene ?? '') !== (p.ebene ?? '')) { f.x = p.x; f.y = p.y; f.ebene = p.ebene; pf.vergiss('s' + id); }
      if (pf.pos('s' + id, rt, pp)) { f.x = pp.x; f.y = pp.y; }
      else { f.x += (p.x - f.x) * glatt; f.y += (p.y - f.y) * glatt; }
      f.box.setPosition(f.x, f.y);
      f.bild.setAlpha(p.verbunden ? 1 : 0.5);
      this.figurDarstellen(f, p, dt);
    }
    for (const [id, f] of this.figuren) if (!s.spieler.has(id)) { f.box.destroy(); this.figuren.delete(id); pf.vergiss('s' + id); }
    // Zombies
    this.kegel.clear();
    const cam = this.cameras.main.worldView;
    const zf = zg();   // Menschengröße × Gesamtgröße × Zombiegröße
    const RAND = 150, rx0 = cam.x - RAND, rx1 = cam.right + RAND, ry0 = cam.y - RAND, ry1 = cam.bottom + RAND;   // Ausschnitt + Rand: nur dort wird gezeichnet
    let gesamtZ = 0, sichtbarZ = 0;
    const eigen = this.lokal && Number.isFinite(this.lokal.x) ? this.lokal : null;   // vorhergesagte Position des eigenen Helden
    for (const [id, z] of zombieKarte()) {
      let f = this.zombies.get(id);
      if (!f) { f = this.neuerZombie(z); this.zombies.set(id, f); }
      const vx = f.x, vy = f.y;
      if (f.zh === undefined) { let h = 2166136261; for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619); h = (h >>> 0) / 4294967296; f.zh = h; f.zs = 0.75 + h * 0.5; f.zv = ((h * 7919) % 1) * 1000; }   // je Zombie: Schrittfrequenz ±25 %, Versatz
      // nah am eigenen Helden (< ~3 m): weniger Verzögerung, damit Biss und Anzeige zusammenpassen (fließend über den Abstand)
      let rtZ = rt;
      if (rt !== null && eigen) rtZ = rt + naheAnzeigeVerz(pf.verz, Math.hypot(f.x - eigen.x, f.y - eigen.y));
      if (pf.pos('z' + id, rtZ, pp)) { f.x = pp.x; f.y = pp.y; }
      else { f.x += (z.x - f.x) * glatt; f.y += (z.y - f.y) * glatt; }
      f.r = Phaser.Math.Angle.RotateTo(f.r, zRichtung(z), dt * 6);
      gesamtZ++;
      // außerhalb des Ausschnitts (+ Rand): nur Position mitführen, nichts zeichnen oder animieren
      if (f.x < rx0 || f.x > rx1 || f.y < ry0 || f.y > ry1) { if (f.box.visible) f.box.setVisible(false); continue; }
      f.box.setPosition(f.x, f.y).setRotation(f.r);
      const zeigen = this.sichtbar(z);
      if (zeigen) sichtbarZ++;
      f.box.setVisible(zeigen);
      const bildNr = laufBild(f, f.x - vx, f.y - vy, dt, (z.kriecht ? 18 : 30) / f.zs, this.feinInnen() ? INNEN_TEMPO : 1, this.feinInnen() ? INNEN_FIGUR : 1);
      const typ = ZOMBIE_TYPEN[(z.variante ?? 0) % ZOMBIE_TYPEN.length];
      const neu = !z.kriecht && (typ === 'z6' || typ === 'z7');
      const gem = !z.kriecht && GEMINI_TYPEN.has(typ);
      const tex = gem ? 'figuren3' : neu ? 'figuren2' : 'figuren';
      if (f.bild.texture.key !== tex) f.bild.setTexture(tex, 0);
      if (z.kriecht) {
        f.bild.setFrame(this.figurBild('kriecher_' + 'abcd'[(z.variante ?? 0) % 4], z.haengt ? Math.floor(this.time.now / 170 + z.x) : bildNr < 0 ? 0 : Math.floor((f.lauf ?? 0) / 16)));
        f.bild.setRotation(z.haengt ? Math.sin(this.time.now / 80 + z.x * 0.7) * 0.16 : 0).setScale(ZOMBIE_GROESSE * zf * groesse('figuren', 'kriecher_' + 'abcd'[(z.variante ?? 0) % 4]));
      } else if (gem) {
        // Einzelbild (Gemini): beim Gehen leicht wanken, Maßstab wie die übrigen Zombies
        const l3 = this.figurListe3[typ];
        f.bild.setFrame(l3 ? l3[0] : 0).setRotation(bildNr < 0 ? 0 : Math.sin((f.lauf ?? 0) / 9 * f.zs + f.zv) * 0.07).setScale(ZOMBIE_GROESSE * zf * groesse('figuren3', typ));
      } else if (neu) {
        // flüssig animierte Zombies (Riley Gombart): Laufen, Angriff, Stehen
        let nah = false;
        if (z.jagt) for (const p of s.spieler.values()) if ((p.ebene ?? '') === (z.ebene ?? '') && Math.hypot(p.x - z.x, p.y - z.y) < (W.spielerRadius + W.zombieRadius + 16) * (this.feinInnen() ? INNEN_REICH : 1)) { nah = true; break; }
        const art = nah ? 'angriff' : bildNr < 0 ? 'stehen' : 'laufen';
        const i = art === 'laufen' ? Math.floor((f.lauf ?? 0) / 6 * f.zs) : Math.floor((this.time.now + f.zv) / ((art === 'angriff' ? 70 : 140) / f.zs));
        f.bild.setFrame(this.figurBild2(`${typ}_${art}`, i)).setRotation(0).setScale(BOGEN2_GROESSE * zf * groesse('figuren2', typ + '_laufen'));
      } else {
        // Angriff: beim Zubeißen das Bild mit offenem Mund (wo vorhanden)
        let nah = false;
        if (z.jagt) for (const p of s.spieler.values()) if ((p.ebene ?? '') === (z.ebene ?? '') && Math.hypot(p.x - z.x, p.y - z.y) < (W.spielerRadius + W.zombieRadius + 16) * (this.feinInnen() ? INNEN_REICH : 1)) { nah = true; break; }
        const angriff = nah && this.figurListe['zombie_' + typ + '_angriff'];
        f.bild.setFrame(angriff ? angriff[0] : this.figurBild('zombie_' + typ, bildNr < 0 ? 0 : Math.floor((f.lauf ?? 0) / 11)));
        // schlurfen: leicht wanken
        f.bild.setRotation(bildNr < 0 ? 0 : Math.sin((f.lauf ?? 0) / 9 * f.zs + f.zv) * 0.07).setScale(ZOMBIE_GROESSE * zf * groesse('figuren', 'zombie_' + typ) * (angriff ? 1.06 : 1));
      }
      f.bild.setTint(this.schattenTon(f, f.x, f.y, z.jagt ? 0xffd2c8 : 0xffffff));
      if ((s.optionen & 1) && zeigen && !this.aktEbene && (cam.contains(f.x, f.y) || Phaser.Math.Distance.Between(f.x, f.y, cam.centerX, cam.centerY) < cam.width)) {
        if (z.kriecht) {
          // Kriecher sehen nicht, sie spüren ringsum
          this.kegel.lineStyle(1, 0xff8a65, 0.35).strokeCircle(f.x, f.y, 110);
        } else {
          this.kegel.fillStyle(z.jagt ? 0xff5252 : 0xfff59d, z.jagt ? 0.18 : 0.13);
          this.kegel.slice(f.x, f.y, W.sichtWeite, f.r - W.sichtWinkel / 2, f.r + W.sichtWinkel / 2, false).fillPath();
        }
      }
    }
    for (const [id, f] of this.zombies) if (!zombieKarte().has(id)) { f.box.destroy(); this.zombies.delete(id); pf.vergiss('z' + id); }
    this.messZombies = [sichtbarZ, gesamtZ];
    // Leichen: liegen flach, leere sind blasser, die letzten 20 s blenden sie aus
    for (const [id, l] of s.leichen) {
      let o = this.leichen.get(id);
      if (!o) {
        // passend zum Zombietyp; Dirndl, Feuerwehr und Lederhose gibt es in zwei Fassungen
        const typ = ZOMBIE_TYPEN[(l.variante ?? 0) % ZOMBIE_TYPEN.length], zweite = this.figurListe['leiche_' + typ + '2'] && (Math.round(l.x) + Math.round(l.y)) % 2;
        // beide neuen Arten mit den bisherigen Leichenbildern (die Sterbebilder von z7 gefielen nicht)
        const tot3 = this.figurListe3['leiche_' + typ];   // Gemini-Totenbild (figuren3), Kopf nach links wie die alten Leichen
        const altName = 'leiche_' + (typ === 'z6' ? 'hemd' : typ === 'z7' ? 'tarn' : GEMINI_TYPEN.has(typ) ? GEMINI_LEICHEN[ZOMBIE_TYPEN.indexOf(typ) % GEMINI_LEICHEN.length] : typ) + (zweite ? '2' : '');
        o = tot3 ? this.add.image(l.x, l.y, 'figuren3', tot3[0]).setScale(ZOMBIE_GROESSE).setDepth(1.6).setRotation(l.richtung)
          : this.add.image(l.x, l.y, 'figuren', this.figurBild(altName)).setScale(ZOMBIE_GROESSE).setDepth(1.6).setRotation(l.richtung);
        o.gf = tot3 ? groesse('figuren3', 'leiche_' + typ) : groesse('figuren', altName);   // Größenausgleich (groessen.mjs)
        this.leichen.set(id, o);
      }
      if (l.x < rx0 || l.x > rx1 || l.y < ry0 || l.y > ry1) { if (o.visible) o.setVisible(false); continue; }
      o.setScale(ZOMBIE_GROESSE * (o.gf ?? 1) * zg());   // Leichen folgen der Zombiegröße
      o.setVisible((l.ebene ?? '') === this.aktEbene);
      const ausblenden = l.fest ? 1 : 1 - (l.blass ?? 0) / 10;   // Server: blass 0..10 in den letzten 20 s
      o.setAlpha((l.rest === 0 && !l.deko ? 0.5 : 1) * Math.max(0, ausblenden));   // deko: Tote am Flugfeld, voll sichtbar
    }
    for (const [id, o] of this.leichen) if (!s.leichen.has(id)) { o.destroy(); this.leichen.delete(id); }
    // Bewohner: gehen umher, fliehen, verschwinden in Häusern und im Bus; Gebissene werden grünlich
    for (const [id, m] of s.menschen ?? []) {
      let o = this.menschenObj.get(id);
      if (!o) {
        // Bürger (KonitaTutorials) mit Laufanimation, Sorte nach Kennung
        // m.typ: Gemini-Typ (buerger160, Standbild), sonst Bürger/Polizist mit Laufanimation
        const typ = this.buergerListe?.[m.typ]?.length ? m.typ : '';
        const sorte = typ || (String(m.aussehen ?? '').startsWith('p') ? 'polizist' : 'buerger' + (1 + (id.charCodeAt(id.length - 1) % 3)));
        const bogen = typ ? 'buerger160' : 'figuren2', gs = typ ? MENSCH_GROESSE : BOGEN2_GROESSE * 0.95;
        const bild = this.add.image(0, 0, bogen, typ ? this.buergerListe[typ][0] : this.figurBild2(sorte)).setScale(gs * groesse(bogen, sorte) * mg());
        o = { box: this.add.container(m.x, m.y, [bild]).setDepth(3.5), bild, sorte, typ, bogen, gs, x: m.x, y: m.y, r: zRichtung(m) };
        this.menschenObj.set(id, o);
      }
      const vx = o.x, vy = o.y;
      // Versteckte (geduckt): eigenes Bild <typ>_versteckt; ältere Bürgerbilder ohne diese Variante kleiner und abgedunkelt.
      // Beim Fliehen und Folgen (versteckt = false bzw. folgt) wieder das normale Bild.
      const duckt = !!m.versteckt && !m.folgt, vk = duckt && o.typ && this.buergerListe?.[o.typ + '_versteckt']?.length ? o.typ + '_versteckt' : null;
      if (o.typ) { const fr = this.buergerListe[vk ?? o.typ][0]; if (o.frame !== fr) { o.frame = fr; o.bild.setFrame(fr); } }
      o.bild.setScale(o.gs * groesse(o.bogen, vk ?? o.sorte) * mg() * (duckt && !vk ? 0.8 : 1));
      if (pf.pos('m' + id, rt, pp)) { o.x = pp.x; o.y = pp.y; }
      else o.x += (m.x - o.x) * glatt, o.y += (m.y - o.y) * glatt;
      if (Math.hypot(m.x - o.x, m.y - o.y) > 200) { o.x = m.x; o.y = m.y; }   // aus Haus oder Bus aufgetaucht
      o.r = Phaser.Math.Angle.RotateTo(o.r, zRichtung(m), dt * 8);
      if (o.x < rx0 || o.x > rx1 || o.y < ry0 || o.y > ry1) { if (o.box.visible) o.box.setVisible(false); continue; }
      const weg = Math.hypot(o.x - vx, o.y - vy);
      o.lauf = (o.lauf ?? 0) + weg;
      o.box.setPosition(o.x, o.y).setRotation(o.r);
      if (o.typ) o.bild.setAngle(weg > 0.2 && !duckt ? Math.sin(o.lauf / 5) * 5 : 0);   // Standbild: leichtes Wiegen beim Gehen
      else o.bild.setFrame(this.figurBild2(o.sorte, weg > 0.2 ? Math.floor(o.lauf / 7) : 0));
      o.box.setVisible(m.sichtbar && this.aktEbene === (m.ebene ?? ''));
      // Versteckte in Häusern zeigen sich erst, wenn man nah genug ist (Wimmern verrät sie vorher)
      o.box.setAlpha(m.ebene && duckt && this.lokal && Math.hypot(m.x - this.lokal.x, m.y - this.lokal.y) > 130 ? 0 : 1);
      o.bild.setTint(this.schattenTon(o, o.x, o.y, m.infiziert ? 0xb5d99c : duckt && !vk ? 0x777777 : 0xffffff));
    }
    for (const [id, o] of this.menschenObj) if (!s.menschen?.has(id)) { o.box.destroy(); this.menschenObj.delete(id); pf.vergiss('m' + id); }
    this.hundAnz.aktualisieren(s.hunde, dt, mg(), this.aktEbene, { x0: rx0, x1: rx1, y0: ry0, y1: ry1 });
    // Fahrzeuge: Linienbus, Verkehr, Polizei und Feuerwehr (mit Blaulicht), Wracks
    const blink = Math.floor(this.time.now / 180) % 2;
    for (const [id, f] of s.fahrzeuge ?? []) {
      let o = this.busObj.get(id);
      const key = this.fahrzeugTextur(f.art, f.farbe, f.art === 'polizei' ? 1 + Math.floor(this.time.now / 150) % 3 : 0);
      if (!o) {
        const bild = this.add.image(0, 0, key);
        const licht = this.add.graphics();
        const sch = f.art === 'evakuierung' && evakArtVon(raum.state) === 'flugzeug' ? null : this.add.image(0, 0, this.fahrzeugSchattenTextur(key)).setDepth(4.55).setAlpha(FZ_SCHATTEN.alpha);
        o = { box: this.add.container(f.x, f.y, [bild, licht]).setDepth(4.6), bild, licht, sch, x: f.x, y: f.y, r: fzRichtung(f) };
        this.busObj.set(id, o);
      }
      if (o.bild.texture.key !== key) { o.bild.setTexture(key); o.sch?.setTexture(this.fahrzeugSchattenTextur(key)); }
      o.x += (f.x - o.x) * glatt; o.y += (f.y - o.y) * glatt;
      o.r = Phaser.Math.Angle.RotateTo(o.r, fzRichtung(f), dt * 6);
      o.box.setPosition(o.x, o.y).setRotation(o.r).setVisible(this.aktEbene === '');
      o.sch?.setPosition(o.x + FZ_SCHATTEN.dx, o.y + FZ_SCHATTEN.dy).setRotation(o.r).setVisible(this.aktEbene === '' && o.box.visible);
      o.licht.clear();
      // dicht vorbeifahrende Autos und Busse rauschen vorbei; jedes dritte Auto hat das Radio an
      if ((f.art === 'auto' || f.art === 'bus' || f.art === 'laster') && this.lokal && !this.aktEbene) {
        const d = Math.hypot(o.x - this.lokal.x, o.y - this.lokal.y);
        if (d < 170 && o.vorher !== undefined && d > o.vorher && !o.vorbei && !f.haelt) { ton.ereignis('autoVorbei', o.x, o.y); o.vorbei = true; }
        if (d > 400) o.vorbei = false;
        if (f.art === 'auto' && (id.charCodeAt(id.length - 1) % 3 === 0)) {
          if (!o.radio) o.radio = ton.schleifeStarten('autoradio');
          if (o.radio) ton.sireneLage(o.radio, o.x, o.y, o.vorher === undefined ? 0 : (o.vorher - d) / Math.max(dt, 0.001));
        }
        o.vorher = d;
      }
      // Rauch über einem verunglückten Fahrzeug (Server setzt Fahrzeug.rauch bis das Feuer erloschen ist)
      if (f.rauch && !this.aktEbene && this.lokal && Math.hypot(o.x - this.lokal.x, o.y - this.lokal.y) < 900) {
        o.rauchUhr = (o.rauchUhr ?? 0) - dt;
        if (o.rauchUhr <= 0) {
          o.rauchUhr = 0.18 + Math.random() * 0.12;
          const q = this.add.circle(o.x + (Math.random() - 0.5) * 14, o.y + (Math.random() - 0.5) * 10, 5 + Math.random() * 4, 0x555555, 0.55).setDepth(7.6);
          this.tweens.add({ targets: q, y: q.y - 34 - Math.random() * 20, x: q.x + 8 + Math.random() * 10, alpha: 0, scale: 2.6, duration: 1500 + Math.random() * 600, onComplete: () => q.destroy() });
        }
      }
      if (f.art === 'evakuierung' && !evakFahrzeug(this, o, f, s, dt, this.lokal, this.aktEbene, BOGEN2_GROESSE * groesse('figuren2', 'soldat_idle') * mg())) {
        // blinkende orange Rundumleuchte; ohne Leopard-Bilder (Puma-Ersatz) zusätzlich Fahne am Heck
        const pz = evakArtVon(s) === 'panzer', lx = pz ? -12 : -8, an = Math.floor(this.time.now / 260) % 2;
        o.licht.fillStyle(0xff9100, an ? 0.3 : 0.12).fillCircle(lx, 0, an ? 24 : 16);
        o.licht.fillStyle(an ? 0xffab00 : 0x8d4f00, 1).fillCircle(lx, 0, 3);
        o.licht.lineStyle(1.2, 0x000000, 0.8).strokeCircle(lx, 0, 3);
        if (pz) {
          const w = Math.sin(this.time.now / 140) * 3;
          o.licht.lineStyle(1.2, 0x212121, 1).lineBetween(-24, -8, -24, -16);
          o.licht.fillStyle(0xd50000, 1).fillTriangle(-24, -16, -24, -11, -33, -13.5 + w);
        }
      }
      if (f.art === 'polizei' || f.art === 'feuerwehr') {
        // Sirene nur, solange das Fahrzeug fährt und nah ist (bis ca. 45 m = 360 px, draußen; im Haus halb so weit);
        // steht es (Feuerwehr am Brand), ist sie nach 4 s aus
        const d = this.lokal ? Math.hypot(o.x - this.lokal.x, o.y - this.lokal.y) : Infinity;
        const weite = this.aktEbene ? 180 : 360;
        o.haltT = f.haelt ? (o.haltT ?? 0) + dt : 0;
        const stumm = o.haltT > 4;
        if (!o.sirene && !stumm && f.farbe !== 200 && d < weite * 1.2) o.sirene = ton.sireneStarten();
        else if (o.sirene && (d > weite * 1.6 || (stumm && o.haltT > 7))) { ton.sireneStoppen(o.sirene); o.sirene = null; }
        if (o.sirene) {
          const naeher = o.letzterAbstand === undefined ? 0 : (o.letzterAbstand - d) / Math.max(dt, 0.001);
          ton.sireneLage(o.sirene, o.x, o.y, naeher, weite, stumm);
        }
        o.letzterAbstand = d;
        const vx = f.art === 'feuerwehr' ? 16 : 2;
        if (f.art === 'polizei' && autoEintraege('polizei').length) continue;   // Blaulicht steckt im Sprite
        o.licht.fillStyle(blink ? 0x2962ff : 0x82b1ff, 1).fillCircle(vx, -5, 3.5);
        o.licht.fillStyle(blink ? 0x82b1ff : 0x2962ff, 1).fillCircle(vx, 5, 3.5);
        o.licht.fillStyle(0x448aff, 0.18).fillCircle(vx, 0, blink ? 26 : 18);
      }
    }
    for (const [id, o] of this.busObj) if (!s.fahrzeuge?.has(id) || s.fahrzeuge.get(id).art === 'wrack') {
      ton.sireneStoppen(o.sirene); ton.sireneStoppen(o.radio); ton.sireneStoppen(o.kette); o.sirene = o.radio = o.kette = null;
      if (!s.fahrzeuge?.has(id)) { o.box.destroy(); o.sch?.destroy(); this.busObj.delete(id); }
    }
    this.feuerDarstellen(s);
    this.spurenDarstellen(s);
    // (kein Kistensymbol 📦/∅ über Behältern – bewusst keine „noch nicht durchsucht“-Anzeige)
    this.missionGlanz(s);
    // liegende Gegenstände
    for (const [id, b] of s.boden) {
      let o = this.bodenObj.get(id);
      if (!o) {
        o = this.add.container(b.x, b.y).setDepth(1.7);
        const bild = hatDingBild(b.ding) && this.textures.get('dinge').has(b.ding === 'handgranate' ? 'granate' : b.ding)
          ? this.add.image(0, 0, 'dinge', b.ding === 'handgranate' ? 'granate' : b.ding).setScale(24 / 128).setOrigin(0.5)
          : this.add.text(0, 0, DINGE[b.ding]?.zeichen ?? '?', { fontSize: '16px' }).setOrigin(0.5);
        o.add([this.add.ellipse(0, 7, 20, 6, 0x000000, 0.3), bild]);
        this.tweens.add({ targets: o, y: b.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.bodenObj.set(id, o);
      }
      o.setVisible((b.ebene ?? '') === this.aktEbene);
      o.setScale(this.innenWelten.get(b.ebene ?? '')?.kachel ? 0.3 : 1);   // maßstäblich: Beute in echter Größe zur halb so großen Figur
      o.setAlpha(Math.max(0.2, 1 - (b.blass ?? 0) / 10));
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

  // Puma-Texturen 'puma-wanne'/'puma-turm' aus den Modell-Draufsichten (mit Rand R und weichem Schlagschatten, einmal angelegt);
  // liefert für eine Wannenlänge L (Spielpixel) f = Spielpixel je Modelleinheit und den Bildmaßstab skala
  pumaMasse(L) {
    const R = 8;
    for (const [teil, schatten] of [['wanne', 0.45], ['turm', 0.35]]) {
      const key = 'puma-' + teil;
      if (this.textures.exists(key)) continue;
      const img = this.textures.get(key + '-bild').getSourceImage();
      const tex = this.textures.createCanvas(key, img.width + 2 * R, img.height + 2 * R), c = tex.getContext();
            c.drawImage(img, R, R); tex.refresh();
    }
    const f = L / PUMA_BILD.laenge;
    return { f, skala: f / PUMA_BILD.px, R };
  }

  // Turm auf den Turmring der Wanne setzen (Versatz im Wannen-Rahmen, dreht mit der Wanne)
  pumaTurmSetzen() {
    const o = this.stuetzpunktObj, w = o?.wanne, v = o?.pumaVersatz;
    if (!w || !v || !o.turm) return;
    const c = Math.cos(w.rotation), s = Math.sin(w.rotation);
    o.turm.setPosition(w.x + c * v.x - s * v.y, w.y + s * v.x + c * v.y);
  }

  // Bundeswehr-Stützpunkt (client/stuetzpunkt.mjs): Soldaten, Ärzte, Verwundete und der Puma-Turm als eigene Objekte, einmal beim
  // Aufbau der Welt angelegt (nur draußen sichtbar, über aussenObjekte). Verhalten kommt vom Server später; hier nur Darstellung.
  baueStuetzpunktFiguren() {
    const sp = this.welt.stuetzpunkt;
    const o = this.stuetzpunktObj = { turm: null, soldaten: [], aerzte: [], verwundete: [] };
    if (!sp) return;
    const pumaT = sp.teile.find(t => t.art === 'puma');
    if (pumaT) {
      // Wanne und Turm als eigene Bilder (Draufsicht aus dem 3D-Modell); der Puma fährt (bwX, bwY, bwW), der Turm dreht (bwTurm)
      // und sitzt wie im Original links hinter der Mitte (Versatz dreht mit der Wanne, siehe pumaTurmSetzen)
      const m = this.pumaMasse(pumaT.laenge), tb = this.textures.get('puma-turm').getSourceImage(), k = PUMA_SKALA * m.f;
      o.pumaVersatz = { x: PUMA_BILD.turmX * k, y: PUMA_BILD.turmY * k };
      o.pumaMuendung = PUMA_BILD.muendung * k;
      o.wanneSchatten = this.add.image(pumaT.x + FZ_SCHATTEN.dx, pumaT.y + FZ_SCHATTEN.dy, this.fahrzeugSchattenTextur('puma-wanne')).setRotation(pumaT.winkel).setScale(PUMA_SKALA * m.skala).setDepth(4.9).setAlpha(FZ_SCHATTEN.alpha);
      o.wanne = this.add.image(pumaT.x, pumaT.y, 'puma-wanne').setRotation(pumaT.winkel).setScale(PUMA_SKALA * m.skala).setDepth(5);
      o.turm = this.add.image(0, 0, 'puma-turm').setOrigin((PUMA_BILD.turmMx + m.R) / tb.width, (PUMA_BILD.turmMy + m.R) / tb.height)
        .setRotation(pumaT.turm.winkel).setScale(PUMA_SKALA * m.skala).setDepth(5.1);
      this.pumaTurmSetzen();
    }
    this.bwLicht = new BwLicht(this, sp);
    const soldat = (x, y, blick, phase, n = -1) => {
      const fuesse = this.add.image(0, 0, 'figuren2', this.figurBild2('sv_fuesse_idle')).setScale(BOGEN2_GROESSE * groesse('figuren2', 'soldat_idle') * mg());
      const bild = this.add.image(0, 0, 'figuren2', this.figurBild2('soldat_idle', phase)).setScale(BOGEN2_GROESSE * groesse('figuren2', 'soldat_idle') * mg());
      const box = this.add.container(x, y, [fuesse, bild]).setDepth(3.5).setRotation(blick);
      const e = { box, bild, fuesse, phase, blick, schussBis: 0, n };
      o.soldaten.push(e);
    };
    sp.teile.forEach((t, i) => {
      if (t.art === 'mgnest') soldat(t.x - Math.cos(t.blick) * 5, t.y - Math.sin(t.blick) * 5, t.blick, i, i);   // hinter dem MG
      else if (t.art === 'posten' && t.rolle === 'soldat') soldat(t.x, t.y, t.blick, i, i);   // n = Teil-Nummer: Schüsse vom Server zeigen den Soldaten feuernd
      else if (t.art === 'posten' && t.rolle === 'arzt') {
        const bild = this.add.image(0, 0, 'figuren2', this.figurBild2('arzt', i)).setScale(BOGEN2_GROESSE * 0.95 * groesse('figuren2', 'arzt') * mg());
        o.aerzte.push({ box: this.add.container(t.x, t.y, [bild]).setDepth(3.5).setRotation(t.blick), bild });
      } else if (t.art === 'posten' && t.rolle === 'verwundet') {
        const bild = this.add.image(t.x, t.y, 'figuren2', this.figurBild2('verwundet', t.variante)).setScale(VERWUNDET_GROESSE * groesse('figuren2', 'verwundet') * mg()).setRotation(t.blick).setDepth(0.6);
        o.verwundete.push({ bild, s0: VERWUNDET_GROESSE * groesse('figuren2', 'verwundet') * mg(), phase: i });
      }
    });
  }

  // Soldaten wechseln langsam das Haltung, Verwundete atmen; MG-Schützen zeigen beim Schießen soldat_schuss und drehen sich zum Ziel;
  // der Puma-Turm dreht weich zum Winkel vom Server; ist der Stützpunkt gefallen (oder aus), sind alle Figuren weg
  stuetzpunktAnimieren() {
    const o = this.stuetzpunktObj;
    if (!o || this.aktEbene) return;
    const jetzt = this.time.now, steht = raum.state.stuetzpunkt === 'steht';
    const dtS = this.game.loop.delta / 1000;
    for (const l of o.leichen ?? []) l.setVisible(steht);
    for (const s of o.soldaten) {
      s.box.setVisible(steht && !s.tot);
      if (!steht || s.tot) continue;
      let geht = false;
      if (s.ziel) {   // Server-Position (Soldaten laufen bei Angriffen zum Hotspot und zurück), weich nachgezogen
        const dx = s.ziel.x - s.box.x, dy = s.ziel.y - s.box.y;
        geht = Math.hypot(dx, dy) > 2;
        const k = Math.min(1, dtS * 8);
        s.box.x += dx * k; s.box.y += dy * k;
        let db = s.ziel.w - s.blick; db = Math.atan2(Math.sin(db), Math.cos(db)); s.blick += db * Math.min(1, dtS * 8);
      }
      s.fuesse?.setFrame(geht ? this.figurBild2('sv_fuesse_walk', Math.floor(jetzt / 110)) : this.figurBild2('sv_fuesse_idle'));
      const schiesst = s.schussBis > jetzt;
      s.bild.setFrame(schiesst ? this.figurBild2('soldat_schuss', Math.floor(jetzt / 70)) : this.figurBild2('soldat_idle', Math.floor(jetzt / 220 + s.phase * 3)));
      if (s.n >= 0) s.box.setRotation(schiesst && s.w !== undefined ? s.w : s.blick);
    }
    for (const a of o.aerzte) a.box.setVisible(steht);
    for (const v of o.verwundete) { v.bild.setVisible(steht); if (steht) v.bild.setScale(v.s0 * (1 + Math.sin(jetzt / 900 + v.phase) * 0.012)); }
    if (o.wanne && raum.state.bwX > 0) {   // der Puma fährt: Position und Richtung vom Server, weich nachgezogen
      const k = Math.min(1, this.game.loop.delta / 1000 * 10), st = raum.state;
      o.wanne.x += (st.bwX - o.wanne.x) * k; o.wanne.y += (st.bwY - o.wanne.y) * k;
      let dw = st.bwW - o.wanne.rotation; dw = Math.atan2(Math.sin(dw), Math.cos(dw));
      o.wanne.setRotation(o.wanne.rotation + dw * k);
      this.pumaTurmSetzen();
      o.wanneSchatten?.setPosition(o.wanne.x + FZ_SCHATTEN.dx, o.wanne.y + FZ_SCHATTEN.dy).setRotation(o.wanne.rotation);
      // Kettenrasseln (Ereignis „Panzer fährt“), nur solange er sich bewegt, draußen und in Hörweite
      const faehrt = o.letztX !== undefined && Math.hypot(st.bwX - o.letztX, st.bwY - o.letztY) > 0.05;
      o.letztX = st.bwX; o.letztY = st.bwY;
      o.faehrtT = faehrt ? 0.6 : Math.max(0, (o.faehrtT ?? 0) - this.game.loop.delta / 1000);
      const hoerbar = this.lokal && !this.aktEbene && Math.hypot(o.wanne.x - this.lokal.x, o.wanne.y - this.lokal.y) < 700;
      if (hoerbar && o.faehrtT > 0 && !o.kette) o.kette = ton.schleifeStarten('panzerFaehrt');
      if (o.kette) ton.sireneLage(o.kette, o.wanne.x, o.wanne.y, 0, 700, !(hoerbar && o.faehrtT > 0));
    } else if (o.kette) { ton.sireneStoppen(o.kette); o.kette = null; }
    if (o.turm && Number.isFinite(raum.state.bwTurm)) {
      let d = raum.state.bwTurm - o.turm.rotation;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      o.turm.setRotation(o.turm.rotation + d * Math.min(1, this.game.loop.delta / 1000 * 8));
    }
  }

  // Positionen der beweglichen Soldaten vom Server: [n, x, y, Blickwinkel, tot]
  soldatenSync(m) {
    const o = this.stuetzpunktObj;
    if (!o) return;
    for (const [n, x, y, w, tot] of m.s ?? []) {
      const e = o.soldaten.find(q => q.n === n);
      if (!e) continue;
      if (!e.ziel) { e.box.setPosition(x, y); e.blick = w; }
      e.ziel = { x, y, w };
      if (tot && !e.tot) this.soldatStirbt({ n, x, y, w }, false);
    }
  }

  // ein Soldat ist gefallen: Figur weg, Leiche bleibt liegen (laut = gerade passiert: Schrei und Blut)
  soldatStirbt(m, laut) {
    const o = this.stuetzpunktObj, e = o?.soldaten.find(q => q.n === m.n);
    if (!e || e.tot) return;
    e.tot = true;
    const bild = this.add.image(m.x, m.y, 'figuren2', this.figurBild2('verwundet', m.n)).setScale(VERWUNDET_GROESSE * groesse('figuren2', 'verwundet') * mg()).setRotation(m.w ?? 0).setDepth(0.6).setTint(0xb0a0a0);
    (o.leichen ??= []).push(bild);
    if (laut) { ton.ereignis('menschGebissen', m.x, m.y); fetzen(this, m.x, m.y, m.w ?? 0, 1.4); }
  }

  // Schuss der Bundeswehr: 'mg' aus einem Nest (Leuchtspur, Mündungsblitz, Schütze zeigt soldat_schuss) oder 'kanone' vom Puma (Turm, Einschlag)
  bwSchuss(m) {
    const o = this.stuetzpunktObj, w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), c = Math.cos(w), sn = Math.sin(w);
    const kanone = m.art === 'kanone', vorn = kanone ? 58 * PUMA_SKALA : 30;
    // Mündung: Stützpunkt-Puma = Turmdrehpunkt + Rohrlänge in Richtung des (gedrehten) Turms; Evakuierungspanzer (Level 2) = Fahrzeugmitte
    // + Versatz Turm → Mündung (feststehender Turm, Fahrzeugrichtung); sonst Soldat/Bus: Abstand in Schussrichtung
    let mx = m.x1 + c * vorn, my = m.y1 + sn * vorn, wb = w;
    const evak = !kanone && m.n === -1 && raum.state.karte === 'isarauen' && this.textures.exists('puma-wanne')
      ? [...(raum.state.fahrzeuge?.values() ?? [])].find(v => v.art === 'evakuierung' && Math.hypot(v.x - m.x1, v.y - m.y1) < 2) : null;
    if (kanone && o?.turm) {
      wb = o.turm.rotation; mx = o.turm.x + Math.cos(wb) * o.pumaMuendung; my = o.turm.y + Math.sin(wb) * o.pumaMuendung;
    } else if (evak) {
      const f = fzPx('puma')[0] / PUMA_BILD.laenge, r = this.busObj.get([...raum.state.fahrzeuge.entries()].find(([, v]) => v === evak)?.[0])?.r ?? fzRichtung(evak);
      const ox = (PUMA_BILD.turmX + PUMA_BILD.muendung) * f, oy = PUMA_BILD.turmY * f;
      mx = evak.x + Math.cos(r) * ox - Math.sin(r) * oy; my = evak.y + Math.sin(r) * ox + Math.cos(r) * oy; wb = r;
    }
    if (!kanone) {
      const sold = o?.soldaten.find(q => q.n === m.n);
      if (sold) { sold.schussBis = this.time.now + 260; sold.w = w; }
    }
    // Leuchtspur: kurzer heller Streifen, der zum Ziel läuft
    const g = this.add.graphics().setDepth(7);
    const l0 = 0.0, l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
    g.lineStyle(kanone ? 3 : 2, kanone ? 0xffcc80 : 0xffee58, 1).lineBetween(mx + (m.x2 - mx) * l0, my + (m.y2 - my) * l0, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
    g.lineStyle(1, 0xffffff, 0.9).lineBetween(mx + (m.x2 - mx) * l0, my + (m.y2 - my) * l0, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
    this.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
    this.muendungsLicht(mx, my, '', kanone ? (o?.turm ? 'puma' : 'kanone') : (evak ? 'leopard' : 'mg'));
    // Mündungsblitz (additiv) und Pulverrauch
    const blitz = this.add.image(mx, my, 'figuren2', this.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(wb)
      .setScale(kanone || evak ? 0.6 : 0.32).setDepth(7);
    this.tweens.add({ targets: blitz, alpha: 0, duration: kanone ? 100 : 60, onComplete: () => blitz.destroy() });
    if (kanone) {
      for (let i = 0; i < 6; i++) {
        const r = this.add.circle(mx + (Math.random() - 0.5) * 10, my + (Math.random() - 0.5) * 10, 5 + Math.random() * 5, 0xbdbdbd, 0.55).setDepth(6.5);
        this.tweens.add({ targets: r, x: r.x + c * (10 + Math.random() * 24) + (Math.random() - 0.5) * 16, y: r.y + sn * (10 + Math.random() * 24) + (Math.random() - 0.5) * 16, alpha: 0, scale: 2.2, duration: 700, onComplete: () => r.destroy() });
      }
      this.explosion(m.x2, m.y2, 24, 0.45);
    }
    if (m.t) fetzen(this, m.x2, m.y2, w, kanone ? 2 : 0.8);   // Treffer: Fetzen fliegen
    const jetzt = performance.now();
    if (jetzt - (this.letzterBwKnall ?? 0) > (kanone ? 0 : 70)) { this.letzterBwKnall = jetzt; if (kanone) ton.kanone(m.x1, m.y1); else ton.schuss(m.x1, m.y1, 1.4, 'gewehr'); }
  }

  // Handgranate: fliegt in einem Bogen (0,6 s), liegt dann blinkend bis zur Explosion
  granateFliegt(m) {
    if ((m.ebene ?? '') !== this.aktEbene) return;
    // Start an der Figur, wie sie auf dem Bildschirm steht (die Serverposition hängt bei langsamer Leitung hinterher –
    // sonst kam die Granate beim Laufen scheinbar von hinten/der Seite)
    const werfer = m.wer === meineId ? this.lokal : this.figuren?.get(m.wer)?.box;
    if (werfer && Math.hypot(werfer.x - m.x1, werfer.y - m.y1) < 160) m = { ...m, x1: werfer.x, y1: werfer.y };
    const schatten = this.add.circle(m.x1, m.y1, 4, 0x000000, 0.3).setDepth(3.9);
    const bild = this.add.circle(m.x1, m.y1, 4.5, 0x4b5320).setStrokeStyle(1, 0x1d2112).setDepth(7.5);
    const t0 = this.time.now, flug = m.flug * 1000;
    const tick = () => {
      const k = Math.min(1, (this.time.now - t0) / flug);
      const x = m.x1 + (m.x2 - m.x1) * k, y = m.y1 + (m.y2 - m.y1) * k;
      schatten.setPosition(x, y);
      bild.setPosition(x, y - Math.sin(k * Math.PI) * (m.werfer ? 9 : 26)).setScale(1 + Math.sin(k * Math.PI) * 0.5);
      if (k >= 1) { this.events.off('update', tick); bild.setFillStyle(0x6a6f3a); this.tweens.add({ targets: bild, alpha: 0.35, yoyo: true, repeat: 5, duration: 140 }); }
    };
    this.events.on('update', tick);
    this.time.delayedCall(m.zeit * 1000 - 40, () => { this.events.off('update', tick); bild.destroy(); schatten.destroy(); });
  }

  // Autounfall: Funken, Splitter und eine Staubwolke, leichtes Kamerawackeln (Rauch danach: Fahrzeug.rauch in abgleichen)
  krachEffekt(x, y) {
    if (this.aktEbene) return;
    for (let i = 0; i < 10; i++) {
      const w = Math.random() * Math.PI * 2, d = 14 + Math.random() * 26;
      const f = this.add.circle(x, y, 1.5 + Math.random() * 2, i % 2 ? 0xffd54f : 0xcfd8dc, 0.95).setDepth(7.8);
      this.tweens.add({ targets: f, x: x + Math.cos(w) * d, y: y + Math.sin(w) * d, alpha: 0, duration: 260 + Math.random() * 240, ease: 'Cubic.easeOut', onComplete: () => f.destroy() });
    }
    const staub = this.add.circle(x, y, 10, 0x9e9e9e, 0.5).setDepth(7.7);
    this.tweens.add({ targets: staub, scale: 3, alpha: 0, duration: 900, onComplete: () => staub.destroy() });
    if (this.lokal) {
      const nah = Math.max(0, 1 - Math.hypot(this.lokal.x - x, this.lokal.y - y) / 300);
      if (nah > 0) this.cameras.main.shake(100, 0.0015 + 0.003 * nah);
    }
  }

  // Explosion: Blitz, Druckwelle, Feuer- und Rauchteilchen, Kamerawackeln (stärker, je näher man ist)
  explosion(x, y, r = 40, staerke = 1, ebene = '') {
    if (ebene !== this.aktEbene) return;
    const blitz = this.add.circle(x, y, r * 0.5, 0xfff3c0, 0.95).setBlendMode('ADD').setDepth(8);
    this.tweens.add({ targets: blitz, scale: 2.2, alpha: 0, duration: 220, onComplete: () => blitz.destroy() });
    const ring = this.add.circle(x, y, r * 0.4).setStrokeStyle(3, 0xffe0b2, 0.9).setFillStyle().setDepth(7.9);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
    const n = Math.round(14 * staerke) + 4;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * Math.PI * 2, d = r * (0.5 + Math.random() * 0.9);
      const f = this.add.circle(x, y, 3 + Math.random() * 5, [0xffd54f, 0xff9800, 0xf4511e, 0xd84315][i % 4], 0.95).setBlendMode('ADD').setDepth(7.8);
      this.tweens.add({ targets: f, x: x + Math.cos(w) * d, y: y + Math.sin(w) * d, alpha: 0, scale: 0.4, duration: 350 + Math.random() * 300, ease: 'Cubic.easeOut', onComplete: () => f.destroy() });
    }
    for (let i = 0; i < Math.round(9 * staerke) + 2; i++) {
      const w = Math.random() * Math.PI * 2, d = r * (0.2 + Math.random() * 0.8);
      const rauch = this.add.circle(x, y, 6 + Math.random() * 7, 0x4a4a4a, 0.6).setDepth(7.7);
      this.tweens.add({ targets: rauch, x: x + Math.cos(w) * d, y: y + Math.sin(w) * d - 14 - Math.random() * 16, alpha: 0, scale: 2.4 + Math.random() * 1.2, duration: 1100 + Math.random() * 700, delay: 80, onComplete: () => rauch.destroy() });
    }
    const brand = this.add.circle(x, y, r * 0.35, 0x1b1b1b, 0.5).setDepth(0.95);   // Brandfleck am Boden
    this.tweens.add({ targets: brand, alpha: 0, duration: 6000, onComplete: () => brand.destroy() });
    if (this.lokal) {
      const d = Math.hypot(this.lokal.x - x, this.lokal.y - y);
      if (staerke < 0.5) {   // Puma-Einschlag: nur leichtes Zucken, 25 m Umkreis
        const nah = Math.max(0, 1 - d / 200);
        if (nah > 0) this.cameras.main.shake(100, 0.0008 * nah);
      } else {
        const nah = Math.max(0, 1 - d / 450);
        if (nah > 0) this.cameras.main.shake(60 + 110 * staerke * nah, 0.002 + 0.006 * staerke * nah);
      }
    }
    if (staerke >= 0.9) ton.explosion(x, y);
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
    if (f.sprechen.visible !== !!p.spricht) f.sprechen.setVisible(!!p.spricht);
    const zombie = p.zombie > 0;
    const weg = Math.hypot(f.x - f.altX, f.y - f.altY);
    f.altX = f.x; f.altY = f.y;
    const tfa = p.ebene && this.feinInnen() ? INNEN_TEMPO : 1;   // drinnen im Feinraster: Tempo und Figurgröße kleiner
    f.lauf = (f.lauf ?? 0) + weg / (tfa < 1 ? INNEN_FIGUR : 1);
    const geht = weg / Math.max(dt, 0.001) > 12 * tfa;
    // Haltung nach Ausrüstung: Pistole, Nahkampf/Lampe in der Hand, sonst ohne
    let textur, bild = 0;
    const survivor = !p.unten && !zombie && String(p.aussehen ?? '').startsWith('s');
    const held = !p.unten && !zombie && istHeld(String(p.aussehen ?? '')[0]);
    const tempo = weg / Math.max(dt, 0.001) / tfa;
    // Laufrichtung: Füße und (außer kurz beim Schuss/Schlag) Körper zeigen immer in Laufrichtung; der eigene Held nimmt sie sofort aus der Eingabe
    let lr = p.richtung;
    if (f === this.figuren.get(meineId) && this.eingabe && Math.hypot(this.eingabe.dx, this.eingabe.dy) > 0.05) lr = Math.atan2(this.eingabe.dy, this.eingabe.dx);
    const kr = !p.unten && f.zielBis > this.time.now && typeof f.zielW === 'number' ? f.zielW : lr;
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
      f.fuesse.setRotation(lr).setScale(BOGEN2_GROESSE * mg() * (p.schleicht ? 0.92 : 1));
    }
    else if (held) {
      // Held/Heldin (Gemini): Haltung nach Waffe und Taschenlampe, Stiefel als eigene Ebene
      const a = aussehenLesen(p.aussehen), gg = a.g === 'f' ? 'w' : 'm', wf = HELD_WAFFE[aktiveWaffe(p)[0]] ?? '', lampe = p.lampe > 0;
      const haltung = wf ? (lampe && HELD_HALTUNGEN.includes(wf + '_lampe') ? wf + '_lampe' : wf) : (lampe ? 'lampe' : 'leer');
      textur = this.heldenTextur(p.aussehen); bild = Math.max(0, HELD_HALTUNGEN.indexOf(haltung));
      const fb = !geht ? this.heldBild(`held_${gg}_stiefel_stehen`)
        : this.heldBild(`held_${gg}_stiefel_${tempo > W.tempoGehen * 1.25 ? 'laufen' : 'gehen'}`, Math.floor(f.lauf / 6));
      if (f.fuesse.texture.key !== 'helden160' || f.fuesse.frame.name != fb) f.fuesse.setTexture('helden160', fb);   // eslint-disable-line eqeqeq
      f.fuesse.setRotation(lr).setScale(ZOMBIE_GROESSE * groesse('helden160', `held_${gg}_stiefel_stehen`) * mg() * (p.schleicht ? 0.92 : 1));
    }
    else {
      textur = this.menschTextur(p.aussehen);
      bild = aktiveWaffe(p)[1].bild;
    }
    if (!survivor && !held && f.fuesse.texture.key !== 'figuren2') f.fuesse.setTexture('figuren2', this.figurBild2('sv_fuesse_idle'));
    f.fuesse.setVisible(survivor || held);
    if (f.bild.texture.key !== textur || f.bild.frame.name != bild) f.bild.setTexture(textur, bild);   // eslint-disable-line eqeqeq
    // beim Gehen leicht wippen
    const wipp = geht ? Math.sin(f.lauf / 7) : 0;
    f.bild.setRotation(p.unten ? 0 : kr + wipp * 0.07);
    const gg0 = aussehenLesen(p.aussehen).g === 'f' ? 'w' : 'm';
    const s0 = p.unten ? 1 : zombie ? ZOMBIE_GROESSE * groesse('figuren', 'zombie_hemd') * zg() : survivor ? BOGEN2_GROESSE * mg()
      : held ? ZOMBIE_GROESSE * groesse('helden160', `held_${gg0}_leer`) * mg()
      : MENSCH_GROESSE * groesse('figuren', (aussehenLesen(p.aussehen).g === 'w' ? 'frau' : 'mann') + '_hand') * mg();
    f.bild.setScale(s0 * (p.schleicht && !p.unten ? 0.92 : 1) * (1 + Math.abs(wipp) * 0.03));
    const ton = this.schattenTon(f, f.x, f.y);   // Spieler/Bots: im Schatten dunkler (Körper und Füße)
    f.bild.setTint(ton); f.fuesse.setTint(ton);
    // Name, Lebensbalken und Symbole: drinnen auf Bildschirmgröße wie draußen zurückrechnen, Abstände zur (halb so großen) Figur
    const k = this.uiMass(), fp = this.feinInnen() ? INNEN_FIGUR : 1;
    f.name.setScale(k).setY(-28 * fp);
    f.hp.setScale(k).setPosition(-12 * k, -18 * fp);
    f.tun.setScale(k).setPosition(16 * k, -16 * fp);
    f.sprechen.setScale(k).setPosition(-18 * k, -16 * fp);
    f.hp.width = 24 * Math.max(0, p.hp) / 100;
    f.hp.setFillStyle(p.hp > 50 ? 0x66bb6a : p.hp > 25 ? 0xffca28 : 0xe53935);
    const tun = zombie ? '🧟' : p.aktion === 'klettern' ? '🧗' : p.aktion === 'durchsuchen' ? '🔍' : p.aktion === 'barrikade' ? '🔨' : p.aktion === 'funk' ? '📻' : p.ruht ? '💤' : p.infektion > 0 ? '🦠' : '';
    if (f.tun.text !== tun) f.tun.setText(tun);
  }

  // ---------- eigene Figur mit Vorhersage ----------
  eigeneFigur(dt) {
    const p = raum.state.spieler.get(meineId);
    if (!p) return null;
    const f = this.figuren.get(meineId);
    if (!f) return p;
    if (!this.lokal) this.lokal = { x: p.x, y: p.y };
    // Kamera hängt an der eigenen Figur – auch wenn man (z. B. im Safe Room) drinnen startet und die Position
    // schon beim Ebenenwechsel gesetzt wurde, oder die Figur neu angelegt wurde
    if (this.folgtFigur !== f.box && !this.flug?.aktiv) { this.folgtFigur = f.box; this.cameras.main.startFollow(f.box, true, 0.15, 0.15); this.cameras.main.centerOn(this.lokal.x, this.lokal.y); }
    if (this.sprung) {
      const sp = this.sprung;
      sp.t = Math.min(1, sp.t + dt / 0.32);
      const k = sp.t * sp.t * (3 - 2 * sp.t);
      this.lokal.x = sp.vx + (sp.nx - sp.vx) * k; this.lokal.y = sp.vy + (sp.ny - sp.vy) * k;
      f.x = this.lokal.x; f.y = this.lokal.y;
      f.box.setPosition(f.x, f.y).setScale(1 + Math.sin(sp.t * Math.PI) * 0.18);   // kleiner Hüpfer
      if (sp.t >= 1) { this.sprung = null; f.box.setScale(1); }
      this.basis = null; this.korr.x = 0; this.korr.y = 0;   // nach dem Sprung neu vom Serverstand aus vorhersagen
      this.figurDarstellen(f, p, dt);
      return p;
    }
    if (typeof p.seq !== 'number') {
      // Server ohne Eingabe-Bestätigung: wie früher sanft zum Server hinziehen
      const e = this.eingabe, l = Math.hypot(e.dx, e.dy);
      if (!p.unten && !p.anBord && raum.state.phase === 'spiel') this.schrittSim(p, this.wv(p.ebene), this.lokal, e.dx, e.dy, e.s, dt);
      const d = Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y);
      if (d > 64 || p.unten || p.anBord) { this.lokal.x = p.x; this.lokal.y = p.y; }
      else { const k = Math.min(1, dt * (l > 0.05 ? 2.5 : 10)); this.lokal.x += (p.x - this.lokal.x) * k; this.lokal.y += (p.y - this.lokal.y) * k; }
    } else {
      // Vorhersage vom letzten Serverstand aus; ändert sich der Serverstand, wird der Unterschied zur alten Vorhersage
      // als Restfehler übernommen und klingt sanft ab (kein Ruck, kein Zurückziehen bei Netz-Hängern)
      const basis = { x: p.x, y: p.y, seq: p.seq, ebene: p.ebene ?? '' };
      const pred = this.vorhersage(p, basis);
      const b0 = this.basis;
      if (b0 && (b0.x !== basis.x || b0.y !== basis.y || b0.seq !== basis.seq)) {
        if (b0.ebene === basis.ebene && !p.unten && !p.anBord) {
          const alt = this.vorhersage(p, b0);
          this.korr.x += alt.x - pred.x; this.korr.y += alt.y - pred.y;
        } else { this.korr.x = 0; this.korr.y = 0; }
        this.offen = this.offen.filter(o => nachSeq(o.n, basis.seq));
      }
      this.basis = basis;
      const abkl = Math.exp(-dt * 6);
      this.korr.x *= abkl; this.korr.y *= abkl;
      if (Math.hypot(this.korr.x, this.korr.y) > 96 || p.unten || p.anBord) { this.korr.x = 0; this.korr.y = 0; }
      this.lokal.x = pred.x + this.korr.x; this.lokal.y = pred.y + this.korr.y;
    }
    f.x = this.lokal.x; f.y = this.lokal.y;
    f.box.setPosition(f.x, f.y);
    this.figurDarstellen(f, p, dt);
    f.box.setVisible(!p.anBord);   // an Bord: Figur weg, die Kamera folgt weiter (dem Fahrzeug)
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
    if (window.__startwahlOffen || this.flug?.aktiv) { dx = 0; dy = 0; s = false; }   // Kameraflug: die Figur steht, die Tasten steuern die Kamera
    if (false) { dx = 0; }   // Startwahl-Dialog offen: Figur steht still
    const f = feuerErlaubt();   // false nur im Modus „per Knopf“ ohne gedrückten Feuerknopf
    this.eingabe = { dx, dy, s };
    // Gemeldet wird immer das abgelaufene Stück: „d Sekunden lang mit (dx, dy, s) gelaufen“, mit laufender Nummer n.
    // Der Server arbeitet die Stücke in Echtzeit ab und bestätigt die Nummer (p.seq) – so geht nach einem Netz-Hänger
    // keine Bewegung verloren und die eigene Figur wird nicht zurückgezogen (siehe eigeneFigur / vorhersage).
    const g = this.gesendet, jetzt = performance.now();   // echte Uhr: bei niedriger Bildrate nicht an Frames gebunden
    if (!g.t) { this.gesendet = { dx, dy, s, f, t: jetzt }; return; }
    const anders = Math.abs(g.dx - dx) > 0.05 || Math.abs(g.dy - dy) > 0.05 || g.s !== s || g.f !== f;
    const steht = Math.hypot(g.dx, g.dy) <= 0.05;
    if ((anders && jetzt - g.t > 15) || jetzt - g.t >= (steht ? 250 : 50)) {
      if (this.eingabeNr === undefined) this.eingabeNr = raum.state?.spieler?.get(meineId)?.seq ?? 0;
      const n = this.eingabeNr = (this.eingabeNr + 1) & 0xffff;
      // kompakt senden (Meldung 'e': Feld-Array statt Objekt, Richtung in Hundertsteln, Dauer in ms); die Vorhersage rechnet mit denselben gerundeten Werten wie der Server
      const q = v => Math.round(v * 100), dms = Math.max(0, Math.min(250, Math.round(jetzt - g.t)));
      const stueck = { dx: q(g.dx) / 100, dy: q(g.dy) / 100, s: g.s, f: f, n, d: dms / 1000 };
      const feld = [n, q(g.dx), q(g.dy), (g.s ? 1 : 0) | (f ? 2 : 0), dms];
      // Anzeigeverzögerung der fremden Figuren (ms) für die Biss-Prüfung des Servers (Lag-Kompensation), alle ~1,5 s
      if (jetzt - (this.verzGemeldet ?? 0) > 1500) { this.verzGemeldet = jetzt; stueck.verz = verzFuerServer(this.puffer.verz); feld.push(stueck.verz); }
      raum.send('e', feld);
      this.offen.push(stueck);
      if (this.offen.length > 120) this.offen.shift();
      this.gesendet = { dx, dy, s, f, t: jetzt };
    }
  }

  // ein Stück Bewegung wie auf dem Server (raum.mjs spielerSchritt) auf pos anwenden
  schrittSim(p, welt, pos, dx, dy, s, d) {
    const l = Math.hypot(dx, dy);
    if (l <= 0.05 || d <= 0) return;
    const zombie = p.zombie > 0, schleicht = !zombie && (s || l < 0.55);
    const tempo = zombie ? W.zombieTempoJagen * 1.15
      : (schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1) * (traegtMg(p) ? TEMPO_MG : 1);
    const weg = (zombie ? Math.min(1, l) : Math.min(1, l / (schleicht ? 0.55 : 1))) * tempo * d * tempoVon(welt) * baumFaktor(welt, pos.x, pos.y, baumTempoWert);   // drinnen Maßstab-Tempo, unter Bäumen langsamer (wie raum.mjs)
    const n = Math.max(1, Math.ceil(weg / 4));   // Teilschritte wie auf dem Server (raum.mjs spielerSchritt)
    for (let i = 0; i < n; i++) bewege(welt, pos, dx / l * weg / n, dy / l * weg / n, W.spielerRadius);
  }

  // Vorhersage: Serverstand (basis) + alle noch nicht bestätigten Eingaben + das laufende, noch nicht gesendete Stück
  vorhersage(p, basis) {
    const pos = { x: basis.x, y: basis.y };
    if (p.unten || p.anBord || raum.state.phase !== 'spiel') return pos;
    const welt = this.wv(p.ebene);
    for (const o of this.offen) if (nachSeq(o.n, basis.seq)) this.schrittSim(p, welt, pos, o.dx, o.dy, o.s, o.d);
    const g = this.gesendet;
    if (g.t) this.schrittSim(p, welt, pos, g.dx, g.dy, g.s, Math.min(0.25, (performance.now() - g.t) / 1000));
    return pos;
  }

  // halbe Größe des Bildausschnitts in Weltpixeln an den Server: er schickt nur Zombies und Bewohner darin (+ Rand)
  sichtMelden() {
    const jetzt = performance.now();
    if (jetzt - (this.sichtZeit ?? 0) < 500) return;
    this.sichtZeit = jetzt;
    const wv = this.cameras.main.worldView, w = Math.round(wv.width / 2), h = Math.round(wv.height / 2);
    const alt = this.sichtGemeldet;
    if (w > 0 && h > 0 && (!alt || Math.abs(alt.w - w) > alt.w * 0.08 || Math.abs(alt.h - h) > alt.h * 0.08)) {
      this.sichtGemeldet = { w, h };
      raum.send('sicht', { w, h });
    }
  }

  zeichneStick() {
    const j = this.joystick;
    this.stick.clear();
    if (j.id === null) return;
    // scrollFactor 0 wird trotzdem vom Kamerazoom gestreckt (um die Bildmitte): drinnen (Zoom ×3,4) auf die Größe draußen zurückrechnen
    // konstante Bildschirmgröße: den Kamerazoom (Streckung um die Bildmitte) herausrechnen, drinnen wie draußen
    const cam = this.cameras.main, cx = cam.width / 2, cy = cam.height / 2, k = cam.zoom > 0 ? 1 / cam.zoom : 1;
    const X = v => (v - cx) * k + cx, Y = v => (v - cy) * k + cy;
    this.stick.fillStyle(0xffffff, 0.08).fillCircle(X(j.bx), Y(j.by), 80 * k);
    this.stick.lineStyle(1.5 * k, 0xffffff, 0.22).strokeCircle(X(j.bx), Y(j.by), 80 * k);
    this.stick.lineStyle(1 * k, 0xffffff, 0.15).strokeCircle(X(j.bx), Y(j.by), 48 * k);
    this.stick.fillStyle(0xffffff, 0.35).fillCircle(X(j.bx + j.vx * 60), Y(j.by + j.vy * 60), 28 * k);
  }

  // ---------- Aktionen ----------
  // was kann man hier gerade tun? (gleiche Regeln wie auf dem Server)
  // nächste bedienbare Tür: Zimmertür, Haustür von innen (am Ausgang) oder von außen
  tuerWahl(ich) {
    if (!this.lokal) return null;
    const { x, y } = this.lokal;
    let best = null, bd = Infinity;
    if (ich.ebene) {
      const w = this.wv(ich.ebene);
      const KW = kachelVon(w);
      for (const t of w.tueren) {
        const d = abstandTuer(w, t, x, y);
        if (d < (w.kachel ? 14 : 42) && d < bd) { bd = d; best = { key: `${ich.ebene}:${t.x},${t.y}`, tuer: t }; }
      }
      if (w.ausgang && w.nr !== undefined) {
        const d = Math.hypot((w.ausgang.x + 0.5) * KW - x, (w.ausgang.y + 0.5) * KW - y);
        if (d < (w.kachel ? 16 : 48) && d < bd) best = { key: 'haus:' + w.nr, nr: w.nr, safe: w.safe };
      }
    } else {
      if (!this.hausTuerKarte) {
        this.hausTuerKarte = new Map();
        for (const h of this.welt.haeuser) if (h.betretbar) this.hausTuerKarte.set(h.tuer.y * BREITE + h.tuer.x, h);
      }
      const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const h = this.hausTuerKarte.get((ky + dy) * BREITE + kx + dx);
        if (!h) continue;
        const d = Math.hypot((h.tuer.x + 0.5) * KACHEL - x, (h.tuer.y + 0.5) * KACHEL - y);
        if (d < 44 && d < bd) { bd = d; best = { key: 'haus:' + h.nr, nr: h.nr, safe: this.welt.safeRooms.find(r => r.haus === h)?.id }; }
      }
    }
    return best;
  }

  // Schlossart einer Zimmertür aus den Anteilen im Spielstand (gleiche Funktion wie auf dem Server)
  schlossArtVon(key) {
    const s = raum.state;
    return schlossArt(key, s.seed, { frei: s.tuerFrei ?? 50, raetsel: s.tuerRaetsel ?? 25, schluessel: s.tuerSchluessel ?? 25 });
  }

  // wie auf dem Server: 'auf' = geschlossene Tür bedienen, 'zu' = offene Tür verbarrikadieren (mit Brettern) oder schließen, 'zweit' = die jeweils andere Möglichkeit
  tuerKontext(ich, modus = 'auf') {
    if (modus === true) modus = 'zu';
    const wahl = this.tuerWahl(ich);
    if (!wahl) return null;
    const st = raum.state.tueren.get(wahl.key);
    if (!st && wahl.tuer) return null;
    const haus = wahl.nr !== undefined, name = haus ? 'Haustür' : 'Tür';
    const offen = st ? st.offen : true, kaputt = !!st?.kaputt;
    const bar = (wahl.safe ? raum.state.safes.get(wahl.safe)?.barrikade : st?.barrikade) ?? 0;
    const schliessen = () => kaputt ? null : { art: 'tuer_zu', text: `🚪 ${name} schließen` };
    const oeffnen = () => {
      const sa = st?.verschlossen && !haus ? this.schlossArtVon(wahl.key) : 'frei';
      if (sa === 'frei') return { art: 'tuer_auf', text: `🚪 ${name} öffnen` };
      if (sa === 'raetsel') return { art: 'schlossraetsel', text: '❓ Rätsel lösen' };
      if (hat(ich.rucksack, 'schluessel')) return { art: 'aufschliessen', text: '🔑 Aufschließen' };
      return { art: 'schluessel_noetig', text: '🔑 Schlüssel nötig', aus: true };
    };
    const brett = () => hat(ich.rucksack, 'bretter') && bar < 100 ? { art: 'barrikade', text: `🔨 ${name} verbarrikadieren` } : null;
    if (modus === 'auf') return offen ? null : oeffnen();
    if (modus === 'zu') return offen ? (brett() ?? schliessen()) : null;
    const b = brett();
    return b ? (offen ? (kaputt ? null : schliessen()) : b) : (offen ? schliessen() : null);   // wie auf dem Server
  }

  bestimmeKontext(ich) {
    this.handelKontext = null;
    if (ich?.anBord) return { art: 'aussteigen', text: '🚪 Aussteigen' };   // an Bord eines Evakuierungsfahrzeugs: Taste E/Leertaste und Knopf
    if (!ich || ich.unten || ich.aktion || ich.zombie > 0 || raum.state.phase !== 'spiel' || !this.lokal) return null;
    const { x, y } = this.lokal;
    // Arzt oder Soldat im Lager in Reichweite (nur solange der Stützpunkt steht)
    const hp = !ich.ebene && raum.state.stuetzpunkt === 'steht' ? handelPartner(this.welt.stuetzpunkt, x, y, HANDEL_ABSTAND) : null;
    if (hp) this.handelKontext = { art: 'handel', wer: hp.wer, text: hp.wer === 'arzt' ? '🩺 Mit dem Arzt tauschen' : '🎖 Mit dem Soldaten tauschen' };
    const w = this.wv(ich.ebene);
    const safe = safeRoomVon(this.welt, ich);
    const tuer = this.tuerKontext(ich, 'auf');
    if (tuer) return tuer;
    if (safe && w.ausgang) {
      const KW = kachelVon(w), tx = (w.ausgang.x + 0.5) * KW, ty = (w.ausgang.y + 0.5) * KW;
      const bar = raum.state.safes.get(safe.id)?.barrikade ?? 0;
      if (Math.hypot(x - tx, y - ty) < reichVon(w, 56)) {
        const imWeg = [...raum.state.leichen.values()].some(l => (l.ebene ?? '') === safe.ebene && Math.hypot(l.x - tx, l.y - ty) < reichVon(w, 44));
        if (imWeg) return { art: 'wegziehen', text: '🧟 Toten Zombie aus der Tür ziehen' };
        if (hat(ich.rucksack, 'bretter') && bar < 100) return { art: 'barrikade', text: '🔨 Eingangstür verbarrikadieren' };
      }
      const funkTisch = raum.state.aufgaben?.size && !raum.state.funk ? w.moebel?.find(q => q.art === 'funktisch') : null;
      if (funkTisch) {
        const nx = Math.max(funkTisch.x * KW, Math.min((funkTisch.x + funkTisch.b) * KW, x)), ny = Math.max(funkTisch.y * KW, Math.min((funkTisch.y + funkTisch.h) * KW, y));
        if (Math.hypot(x - nx, y - ny) < reichVon(w, 44)) return { art: 'funk', text: '📻 Funkspruch absetzen' };
      }
      if (w.kuehlschrank && Math.hypot(x - w.kuehlschrank.x, y - w.kuehlschrank.y) < reichVon(w, AKTION_ABSTAND + 20)) {
        return { art: 'kuehlschrank', text: 'Kühlschrank öffnen (Notvorrat, unter 30 %)' };
      }
      if (w.kiste && Math.hypot(x - w.kiste.x, y - w.kiste.y) < reichVon(w, AKTION_ABSTAND + 20)) {
        return { art: 'kiste', text: 'Vorräte öffnen', safe };
      }
    }
    // Funkzelt des Bundeswehr-Stützpunkts: Funkspruch wie am Funktisch
    const funkPunkt = !ich.ebene && raum.state.aufgaben?.size && !raum.state.funk ? this.welt.stuetzpunkt?.teile.find(q => q.art === 'funkzelt')?.funkpunkt : null;
    if (funkPunkt && Math.hypot(x - funkPunkt[0], y - funkPunkt[1]) < 44) return { art: 'funk', text: '📻 Funkspruch absetzen' };
    // Vorratskisten des Bundeswehr-Lagers (Safe House, solange es steht): gemeinsame Kisten, Munition darf hinein
    if (!ich.ebene && raum.state.stuetzpunkt === 'steht') {
      const vk = this.welt.stuetzpunkt?.teile.find(q => q.art === 'vorratskiste' && Math.hypot(x - q.x, y - q.y) < AKTION_ABSTAND + 20);
      if (vk) return { art: 'kiste', text: 'Vorratskiste öffnen (Lager)', safe: { id: vk.id, name: 'Bundeswehr-Lager' } };
    }
    {
      const nah = naheBodenDinge(raum.state.boden, { x, y, ebene: ich.ebene }, reichVon(w, AKTION_ABSTAND));
      if (nah.length === 1 && (!brauchtPlatz(nah[0].ding, ich) || kannAufnehmen(ich.rucksack, ich.plaetze, nah[0].ding))) return { art: 'aufheben', text: `${DINGE[nah[0].ding]?.name ?? 'Gegenstand'} aufheben` };
      if (nah.length) return { art: 'aufheben_wahl', text: `Aufheben … (${nah.length})`, nah };
    }
    // Mensch in der Nähe (versteckt oder verängstigt): ansprechen, dann folgt er dir bis in den Safe Room
    {
      let nah = null, nd = reichVon(w, 56);
      for (const m of raum.state.menschen?.values() ?? []) {
        if (!m.sichtbar || m.infiziert || m.folgt || (m.ebene ?? '') !== (ich.ebene ?? '')) continue;
        const dd = Math.hypot(m.x - x, m.y - y);
        if (dd < nd) { nd = dd; nah = m; }
      }
      if (nah) return { art: 'ansprechen', text: '🙋 Ansprechen' };
    }
    const tor = this.welt.tor;
    if (!ich.ebene && (raum.state.torGeloest ?? 0) < 3 && Math.hypot(x - (tor.x + 1) * KACHEL, y - (tor.y + 1) * KACHEL) < 70) {
      return { art: 'raetsel', text: `🔐 Schloss knacken (${raum.state.torGeloest ?? 0}/3)` };
    }
    let best = null, bd = reichVon(w, AKTION_ABSTAND);
    for (const b of w.behaelter) {
      const d = abstandBehaelter(b, x, y);
      if (d >= bd) continue;
      if (raum.state.behaelter.get(b.id)?.rest === 0 || this.leereKisten?.has(b.id)) continue;
      if (!ich.ebene && !sichtfrei(w, x, y, b.x, b.y)) continue;
      bd = d; best = b;
    }
    for (const l of raum.state.leichen.values()) {
      if ((l.ebene ?? '') !== (ich.ebene ?? '')) continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bd && l.rest !== 0) { bd = d; best = { art: 'leiche' }; }
    }
    if (best?.art === 'auto' && !hat(ich.rucksack, 'brechstange')) return { art: 'durchsuchen', text: 'Kofferraum (Brechstange nötig)' };
    if (best) return { art: 'durchsuchen', text: `${BEHAELTER_NAME[best.art]} ${best.art === 'auto' ? 'aufbrechen' : OEFFNEN.has(best.art) ? 'öffnen' : 'durchsuchen'}` };
    const zu = this.tuerKontext(ich, 'zu');
    if (zu) return zu;
    if (!ich.ebene) {
      const z = zaunUeberstieg(this.welt, x, y, ich.richtung, W.spielerRadius);
      if (z) return { art: 'klettern', text: `🧗 Über ${ZAUN_NAME[z.art] ?? 'den Zaun'} steigen` };
    }
    if (this.handelKontext && !handelOffen) return this.handelKontext;
    // jemanden berühren → tauschen
    if (!tauschOffen) {
      for (const [sid, o] of raum.state.spieler) {
        if (sid === meineId || o.unten || o.zombie > 0 || o.ebene !== ich.ebene) continue;
        if (Math.hypot(o.x - x, o.y - y) < reichVon(w, TAUSCH_ABSTAND + 6)) return { art: 'tausch', mit: sid, text: `🤝 Tauschen mit ${o.name}` };
      }
    }
    return null;
  }

  aktion() {
    const k = this.kontext;
    if (!k) return;
    if (k.art === 'kiste') kisteAuf(k.safe);
    else if (k.art === 'kuehlschrank') raum.send('kuehlschrank');
    else if (k.art === 'tausch') raum.send('tausch_start', { mit: k.mit });
    else if (k.art === 'handel') handelAuf(k.wer);
    else if (k.art === 'aussteigen') raum.send('aussteigen');
    else if (k.art === 'aufheben_wahl') auswahlAuf(raum, raum.state.spieler.get(meineId), k.nah);
    else raum.send('aktion');
    if (k.art === 'raetsel') $('aktion').style.display = 'none';
  }

  // „Alles durchsuchen“ (Taste C / Knopf): nur wenn es mindestens zwei Behälter/Leichen in Reichweite gibt
  alleSuchen() {
    if (!suAn) return;   // nur noch für Superuser
    if ((this.alleSperreBis ?? 0) > Date.now()) return;
    if (this.alleKand && (this.aktEbene ? this.alleKand.drinnen : this.alleKand.liste.length >= 2)) raum.send('durchsuche_alle');
  }

  // Handgranate werfen (Taste Q / Granatenfeld): wie bisher „wurf“ an den Server
  granateWerfen() {
    if (this.granateBereit) raum.send('wurf');
  }

  // zweiter Knopf: andere Türmöglichkeit oder Handel (wenn der Hauptknopf etwas anderes tut)
  aktion2() {
    const z = this.zweit;
    if (!z) return;
    if (z.art === 'handel') handelAuf(z.wer);
    else raum.send('aktion2');
  }

  // ---------- Effekte ----------
  // Schuss: Mündungsblitz und ein kurzer, angedeuteter Feuerstrahl Richtung Ziel (kein durchgehender Strich)
  schuss(m) {
    const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), c = Math.cos(w), sn = Math.sin(w);
    // Armbrust: kein Mündungsblitz, ein sichtbarer Bolzen fliegt zum Ziel
    if (m.art === 'armbrust') {
      const g = this.add.graphics().setDepth(7).setRotation(w);
      g.lineStyle(2.5, 0x6d4c41, 1).lineBetween(-9, 0, 5, 0);
      g.lineStyle(2.5, 0xcfd8dc, 1).lineBetween(5, 0, 9, 0);
      g.lineStyle(1.5, 0xeeeeee, 0.9).lineBetween(-9, -2, -12, -3).lineBetween(-9, 2, -12, 3);
      g.setPosition(m.x1 + c * 14, m.y1 + sn * 14);
      this.tweens.add({ targets: g, x: m.x2, y: m.y2, duration: Math.min(260, 60 + Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * 0.7), onComplete: () => g.destroy() });
      return;
    }
    const schrot = m.art === 'schrotflinte', gewehr = m.art === 'gewehr' || m.art === 'mg' || m.art === 'scharfschuetze';
    this.muendungsLicht(m.x1 + c * 16, m.y1 + sn * 16, m.ebene, m.art);
    const vorn = 16, fk = gewehr ? 0.55 : schrot ? 0.65 : 0.4, lang = (gewehr ? 38 : schrot ? 22 : 26) * fk, br = 3.5 * fk;
    const g = this.add.graphics().setDepth(7);
    // Feuerzunge: breit und gelb an der Mündung, schmal und rot nach vorn auslaufend
    g.fillStyle(0xffe082, 0.95);
    g.fillTriangle(m.x1 + c * vorn - sn * br, m.y1 + sn * vorn + c * br, m.x1 + c * vorn + sn * br, m.y1 + sn * vorn - c * br, m.x1 + c * (vorn + lang), m.y1 + sn * (vorn + lang));
    g.fillStyle(0xff7043, 0.8);
    g.fillTriangle(m.x1 + c * (vorn + 4) - sn * br * 0.57, m.y1 + sn * (vorn + 4) + c * br * 0.57, m.x1 + c * (vorn + 4) + sn * br * 0.57, m.y1 + sn * (vorn + 4) - c * br * 0.57, m.x1 + c * (vorn + lang * 0.7), m.y1 + sn * (vorn + lang * 0.7));
    this.tweens.add({ targets: g, alpha: 0, duration: schrot ? 90 : 110, onComplete: () => g.destroy() });
    // Mündungsblitz (Survivor-Paket), additiv: das Schwarz im Bild verschwindet
    const blitz = this.add.image(m.x1 + c * (vorn - 4), m.y1 + sn * (vorn - 4), 'figuren2', this.figurBild2('muendungsblitz')).setOrigin(0.5)
      .setBlendMode('ADD').setRotation(w).setScale(gewehr ? 0.32 : schrot ? 0.34 : 0.17).setDepth(7);
    this.tweens.add({ targets: blitz, alpha: 0, duration: 60, onComplete: () => blitz.destroy() });
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

  // ---------- Schleife ----------
  update(_t, ms) {
    if (!this.bereit) return;
    const dt = Math.min(0.1, ms / 1000);
    if (this.hordeInfo) this.hordeZeichnen();
    this.hindernisAktualisieren();
    // Tag/Nacht-Zeiten vom Server (Einstellung) übernehmen
    if (raum.state.tagAb && (raum.state.tagAb !== this.tagAb || raum.state.nachtAb !== this.nachtAb)) {
      this.tagAb = raum.state.tagAb; this.nachtAb = raum.state.nachtAb; setzeTageszeiten(this.tagAb, this.nachtAb);
    }
    this.leseEingabe();
    this.flug?.update(dt);
    this.zoomNachziehen(dt);
    this.zeichneStick();
    this.abgleichen(dt);
    this.ladeRingeZeichnen();
    this.wurfBogenZeichnen();
    this.stuetzpunktAnimieren();
    b11Animieren(this);
    if (this.lokal) this.radioAnz?.update(this.aktEbene, this.lokal.x, this.lokal.y);
    const meine = raum.state.spieler.get(meineId);
    if (meine && (meine.ebene ?? '') !== this.aktEbene) {
      this.wechsleAnsicht(meine.ebene ?? '');
      this.lokal = { x: meine.x, y: meine.y };
      const f = this.figuren.get(meineId); if (f) { f.x = f.altX = meine.x; f.y = f.altY = meine.y; f.box.setPosition(meine.x, meine.y); }
      this.cameras.main.centerOn(meine.x, meine.y);   // sofort dort, nicht von der alten Stelle herüberziehen
    }
    const ich = this.eigeneFigur(dt);
    this.sichtMelden();
    this.innenAktualisieren(ich);
    if (ich) this.aussenLicht(ich);
    this.muendungsSchein();
    this.nebelZeichnen(ich, dt);
    if (kulSchatten()) this.schattenAlphaSetzen();
    this.chunksAktualisieren();
    this.abholstelleAktualisieren();
    heliAktualisieren(this, raum.state, dt, this.aktEbene);
    absturzAktualisieren(this, raum.state, dt, this.aktEbene);   // Königsdorf: A400M-Absturz und Wrack
    bunkerAktualisieren(this, raum.state, this.aktEbene);        // Finale: Bunkertor   // Hubschrauber (A400M-Evakuierung)
    this.hudZeit -= dt;
    if (this.hudZeit <= 0) { this.hudZeit = 0.15; this.hud(ich); }
    this.geraeusche(ich, dt);
    this.karteZeit = (this.karteZeit ?? 0) - dt;
    if (this.karteZeit <= 0 || this.uebersicht?.zeichneNeu) { this.karteZeit = this.uebersicht?.gross ? 0.15 : (this.uebersicht?.bus || this.uebersicht?.abhol || this.uebersicht?.pulsAktiv() || [...raum.state.spieler.values()].some(q => q.unten)) ? 0.12 : 0.4; this.uebersichtZeichnen(); }
    if (!this.ladenFertig) { this.ladenFertig = true; ladenZeigen(100, 'Generiere Welt … fertig'); setTimeout(ladenAus, 150); }
  }

  // Schritte, Treffer am eigenen Leib, Stöhnen naher Zombies
  geraeusche(ich, dt) {
    if (!ich || !this.lokal) return;
    const fz = this.flug?.zentrum();
    ton.hoerer(fz ? fz.x : this.lokal.x, fz ? fz.y : this.lokal.y);   // Kameraflug: gehört wird an der Kamera
    const l = this.letzterOrt ?? this.lokal;
    this.schrittWeg = (this.schrittWeg ?? 0) + Math.hypot(this.lokal.x - l.x, this.lokal.y - l.y);
    this.letzterOrt = { x: this.lokal.x, y: this.lokal.y };
    if (this.schrittWeg > (this.feinInnen() ? 46 * INNEN_FIGUR : 46)) { this.schrittWeg = 0; ton.schritt(!!this.aktEbene); }
    if (this.altHp != null && ich.hp < this.altHp - 2) ton.biss();
    // Wassermangel: alle ~25 s ein trockenes Husten mit Tropfen, solange Durst unter der Schwelle (nicht im Hintergrund)
    if (ich.durst < 20 && ich.hp > 0 && !document.hidden) {
      this.durstUhr = (this.durstUhr ?? 6) - dt;
      if (this.durstUhr <= 0) { ton.durst(); this.durstUhr = 22 + Math.random() * 8; }
    } else this.durstUhr = 6;
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
    // Wasserrauschen: Lautstärke nach Abstand zur nächsten Wasserkachel (nur draußen, höchstens 4×/s)
    this.wasserZeit = (this.wasserZeit ?? 0) - dt;
    if (this.wasserZeit <= 0) {
      this.wasserZeit = 0.25;
      if (this.wasserWelt !== this.welt) {   // einmal beim Laden der Welt: Wasserkacheln sammeln
        const w = this.welt, liste = [];
        for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) if (w.hole(x, y) === T.WASSER) liste.push(x, y);
        this.wasserKarte = liste.length ? liste : null; this.wasserWelt = w;
      }
      let naechste = Infinity;
      if (this.wasserKarte && !this.aktEbene) {
        const cx = this.lokal.x / KACHEL - 0.5, cy = this.lokal.y / KACHEL - 0.5, wk = this.wasserKarte;
        for (let i = 0; i < wk.length; i += 2) {
          const dx = wk[i] - cx, dy = wk[i + 1] - cy;
          if (Math.abs(dx) < 12 && Math.abs(dy) < 12) naechste = Math.min(naechste, dx * dx + dy * dy);
        }
        naechste = Math.sqrt(naechste);
      }
      if (this.wasserKarte) {
        if (naechste < 12 && !this.wasserTon && (this.wasserVersuch = (this.wasserVersuch ?? 0) + 1) % 8 === 1) this.wasserTon = ton.schleifeStarten('wasser');
        if (this.wasserTon) ton.schleifeLaut(this.wasserTon, naechste < 12 ? (1 - naechste / 12) ** 1.5 : 0);
      }
    }
    // jede Sekunde: Hordengeräusch (Zahl hörbarer Zombies) und Hintergrundmusik (Level, Lager, Safe, Finale)
    this.tonTakt = (this.tonTakt ?? 0) - dt;
    if (this.tonTakt <= 0) {
      this.tonTakt = 1;
      ton.hordeLage(zombieKarte().values(), { x: this.lokal.x, y: this.lokal.y, ebene: this.aktEbene ?? '' });
      const st = raum.state, tot = (ich.zombie ?? 0) > 0 || ich.hp <= 0;
      ton.musikLage({ level: st.level || 1, lager: ich.sicher === 'lager' && !tot, safe: !!ich.sicher && ich.sicher !== 'lager' && !tot, finale: (st.finaleRest || 0) > 0 });
    }
    this.stoehnZeit = (this.stoehnZeit ?? 2) - dt;
    if (this.stoehnZeit <= 0) {
      this.stoehnZeit = 1 + Math.random() * 2;
      // nur die nächsten ~6 Zombies kommen als Einzellaut in Frage; die Zahl in Hörweite steuert das Horden-Grollen
      const nahe = [];
      for (const z of zombieKarte().values()) {
        if ((z.ebene ?? '') !== this.aktEbene) continue;
        const d = Math.hypot(z.x - this.lokal.x, z.y - this.lokal.y);
        if (d < 700) nahe.push({ z, d });
      }
      nahe.sort((p, q) => p.d - q.d);
      // die 6 nächsten plus ein zufälliger weiterer (Einzelne am Rand): sonst belegt eine dichte Horde allein alle Plätze
      const rest = nahe.slice(6), wahl = nahe.slice(0, 6);
      if (rest.length) wahl.push(rest[Math.floor(Math.random() * rest.length)]);
      // jagende Zombies klingen eher (aufgeregter), bis zu zwei Laute je Runde
      const jagende = wahl.filter(q => q.z.jagt);
      for (let k = 0; k < (wahl.length > 3 && Math.random() < 0.5 ? 2 : 1) && wahl.length; k++) {
        const quelle = jagende.length && Math.random() < 0.5 ? jagende : wahl;
        const z = quelle[Math.floor(Math.random() * quelle.length)].z;
        ton.stoehnen(z.x, z.y, z.kriecht ? 0.35 : 0.55, z.kriecht);
      }
    }
  }

  hud(ich) {
    const s = raum.state;
    if (ich) {
      balkenSetzen('hp', ich.hp);
      balkenSetzen('durst', ich.durst);
      balkenSetzen('hunger', ich.hunger);
      const wf = WAFFEN[ich.waffe], d = DINGE[ich.waffe];
      const pfeile = ich.pfeile && !wf?.pfeil ? ` · ${dingIcon('pfeil', 18, '➶')} ${ich.pfeile} Pfeile` : '';
      let waffe;
      if (!wf) waffe = `${dingIcon('faust', 16, '✊')} Unbewaffnet – stoßen${ich.munition ? ` · ${dingIcon('munition', 18)} ${ich.munition} Schuss` : ''}${pfeile}`;
      else if (wf.fern) {
        // „🔫 Pistole 12/15 · 48“: Magazin/Max · Vorrat (Pfeile bzw. Granaten beim Armbrust/Granatwerfer)
        const vorrat = vorratVon(ich, wf), leer = !(ich.magazin > 0) && vorrat <= 0;
        waffe = `${dingIcon(ich.waffe, 16)} ${d.name} ${ich.magazin ?? 0}/${ich.magmax || wf.magazin} · ${vorrat}${ich.nachladen > 0 ? ` · <b style="color:#ffb300">🔄 Nachladen … ${Math.round(Math.min(1, ich.nachladen) * 100)} %</b>` : leer ? ' – leer, stoßen' : ''}${wf.pfeil || wf.granate ? '' : pfeile}`;
      } else waffe = `${dingIcon(ich.waffe, 16)} ${d.name}${ich.munition ? ` · ${dingIcon('munition', 18)} ${ich.munition} Schuss` : ''}${pfeile}`;
      htmlSetzen('waffe', waffe + (ich.kleidung > 0 ? ` · 🧥 ${Math.ceil(ich.kleidung)} %` : '')
        + (ich.lampe > 0 ? ` · 🔦 ${Math.ceil(ich.lampe / 60)} min${ich.ebene ? ' an' : ''}` : ''));
      this.waffenplaetzeZeigen(ich);   // Waffenfelder (Antippen wechselt, Doppeltippen lädt nach, Taste R lädt auch nach)
      this.granatenfeldZeigen(ich);
      textSetzen('besiegt', `besiegt ${ich.besiegt} / ${Math.max(s.besiegt, ich.besiegt)}`); $('besiegt').title = 'besiegt: von dir / gesamt';
      textSetzen('verwandelt', `🦠 ${s.verwandelt ?? 0} · 🙋 ${s.gerettet ?? 0}`);
      textSetzen('zombiezahl', `🧟 ${s.zombieZahl || zombieKarte().size}`);   // der Client kennt nur die Zombies in seiner Nähe
      const safe = ich.sicher === 'lager' ? { id: 'lager', name: 'Bundeswehr-Lager', lager: true } : ich.sicher ? this.welt.safeRooms.find(r => r.id === ich.sicher) : null;
      $('sicher').style.display = safe ? 'flex' : 'none';
      if (safe?.lager) textSetzen('sichername', `🛡 ${safe.name} · bewacht`);
      else if (safe) {
        const bar = Math.round(s.safes.get(safe.id)?.barrikade ?? 0);
        textSetzen('sichername', `🛡 ${safe.name} · Barrikade ${bar} %`);
      }
      this.rucksackZeigen(ich);
      const gruen = ich.zombie > 0 ? 0.35 : ich.infektion > 0 ? 0.08 + 0.3 * (1 - ich.infektion / INFEKTION_DAUER) : 0;
      const g = $('gruen');
      if (g.style.opacity !== gruen.toFixed(2)) g.style.opacity = gruen.toFixed(2);
    }
    this.aufgabenZeigen(ich);
    const uhr = s.uhr ?? 480, hellJetzt = helligkeit(uhr);
    textSetzen('zeit', `${istNacht(uhr) ? '🌙' : hellJetzt < 1 ? '🌅' : '☀️'} ${uhrText(uhr)} · Tag ${s.tag || 1}`);
    ton.tageszeit(istNacht(uhr));
    const liste = [...s.spieler.entries()].map(([id, p]) => {
      const zusatz = p.unten ? ' – am Boden' : !p.verbunden ? ' – Verbindung weg' : p.sicher ? ' 🛡' : '';
      const klasse = p.unten ? 'unten' : !p.verbunden ? 'weg' : '';
      return `<li class="${klasse}"><span class="punkt" style="background:${css(FARBEN[p.farbe % FARBEN.length])}"></span>${p.su ? '⭐ ' : ''}${escapeHtml(p.name)}${p.afk && !p.name.includes('🤖') ? ' 🤖' : ''}${id === meineId ? ' (du)' : ''}${zusatz}</li>`;
    }).join('');
    if ($('liste').innerHTML !== liste) $('liste').innerHTML = liste;
    const punkte = [...s.spieler.entries()].map(([id, p]) => {
      const afk = p.afk || p.name.includes('🤖');
      const kl = ['pt', p.unten ? 'unten' : '', afk ? 'afk' : '', !p.verbunden ? 'weg' : ''].filter(Boolean).join(' ');
      return `<i class="${kl}" style="background:${css(FARBEN[p.farbe % FARBEN.length])}">${afk ? '🤖' : ''}</i>`;
    }).join('');
    if ($('punkte').innerHTML !== punkte) $('punkte').innerHTML = punkte;
    $('listeknopf').title = `${s.spieler.size} Spieler – antippen für die Liste`;

    // Aktionsknopf
    this.kontext = this.bestimmeKontext(ich);
    // zweiter Knopf: andere Möglichkeit an derselben Tür (z. B. schließen statt verbarrikadieren)
    const frei2 = ich && !ich.unten && !ich.aktion && !(ich.zombie > 0) && s.phase === 'spiel' && this.lokal;
    let zweit = frei2 ? this.tuerKontext(ich, 'zweit') : null;
    if (frei2 && !zweit && this.handelKontext && this.kontext !== this.handelKontext && !handelOffen) zweit = this.handelKontext;
    if (zweit && this.kontext?.art === zweit.art && this.kontext.text === zweit.text) zweit = null;   // dieselbe Aktion nicht doppelt anbieten
    this.zweit = zweit;
    const knopf = $('aktion'), knopf2 = $('aktion2');
    knopf.style.display = this.kontext ? 'block' : 'none';
    if (this.kontext && knopf.__text !== this.kontext.text) {   // nur Text, keine Icons; Taste E klein dahinter (nur mit Tastatur sichtbar)
      knopf.__text = this.kontext.text;
      knopf.textContent = nurText(this.kontext.text);
      const tk = document.createElement('small'); tk.className = 'tk'; tk.textContent = ' (E)'; knopf.append(tk);
    }
    knopf.style.opacity = this.kontext?.aus ? '0.5' : '';   // ausgegraut (Schlüssel nötig), Klick zeigt nur den Hinweis
    knopf2.style.display = zweit ? 'block' : 'none';
    {   // „Alles durchsuchen“
      const kand = frei2 ? alleKandidaten(this.wv(this.aktEbene), s.behaelter, s.leichen, { x: this.lokal.x, y: this.lokal.y, ebene: ich.ebene ?? '' }, hat(ich.rucksack, 'brechstange')) : null;
      this.alleKand = kand;
      // drinnen: Quiz + alle Türen, daher immer anbieten, solange im Stockwerk noch ein Behälter ungesucht ist
      if (kand) kand.drinnen = !!ich.ebene && (this.wv(this.aktEbene).behaelter ?? []).some(b => b.art !== 'bw_kiste' && !s.behaelter.get(b.id));
      const ak = $('alleknopf'), zeige = !!kand && (kand.drinnen || kand.liste.length >= 2);
      ak.style.display = zeige && suAn ? 'block' : 'none';   // nur für Superuser
      const sperre = Math.ceil(((this.alleSperreBis ?? 0) - Date.now()) / 1000);
      if (zeige) { const t = sperre > 0 && ich.ebene ? `Alles durchsuchen in ${sperre} s` : kand.drinnen ? 'Alles durchsuchen (3 Rätsel)' : `Alles durchsuchen (${kand.liste.length}, ${Math.round(kand.dauer * 10) / 10} s)`; if (ak.textContent !== t) ak.textContent = t; }
      fundPruefen(this.lokal, this.aktEbene ? this.wv(this.aktEbene) : null);
    }
    if (zweit && knopf2.__text !== zweit.text) { knopf2.__text = zweit.text; knopf2.textContent = nurText(zweit.text); }
    if (kisteOffen && (!this.kontext || this.kontext.art !== 'kiste')) kisteZu();
    if (ich && this.lokal) auswahlPruefen(raum.state.boden, ich, { x: this.lokal.x, y: this.lokal.y }, reichVon(this.wv(ich.ebene), AKTION_ABSTAND));   // bleibt offen, aktualisiert sich, schließt nur wenn nichts mehr da ist
    if (kisteOffen) kisteZeigen(ich, kisteOffen);
    tauschRucksack();
    if (handelOffen) handelZeigen(ich, this.welt.stuetzpunkt);

    let hinweis = '';
    if (s.phase === 'erwischt') hinweis = 'Erwischt! 🧟<br>Ihr schleppt euch in die Safe Rooms …';
    else if (ich && ich.zombie > 0) hinweis = `🧟 Du bist ein Zombie! Beiß die anderen.<br>Noch ${zeitText(ich.zombie)}, dann wachst du im Safe Room auf.`;
    else if (ich && ich.unten) hinweis = `Du liegst am Boden.<br>Ein Mitspieler muss dir aufhelfen.${balken(ich.hilfe)}`;
    else if (ich && ich.aktion) hinweis = `${{ funk: '📻 Funkspruch läuft', barrikade: '🔨 Verbarrikadieren', wegziehen: '🧟 Wegziehen', aufheben: '✋ Aufheben', aufbrechen: '⚒️ Aufbrechen', aufschliessen: '🔑 Aufschließen', tuer_auf: '🚪 Öffnen', tuer_zu: '🚪 Schließen', ansprechen: '🙋 Ansprechen' }[ich.aktion] ?? '🔍 Durchsuchen'} … nicht bewegen${balken(ich.fortschritt)}`;
    else if (ich) {
      for (const p of s.spieler.values()) {
        if (p === ich || !p.unten) continue;
        const d = Math.hypot(p.x - this.lokal.x, p.y - this.lokal.y);
        if (d < 110) {
          const mit = hat(ich.rucksack, 'verband') ? ' (mit Verbandskasten schneller)' : '';
          hinweis = `${escapeHtml(p.name)} liegt am Boden – bleib bei ihm stehen${mit}.${balken(p.hilfe)}`;
          break;
        }
      }
      if (!hinweis && ich.infektion > 0) {
        const spritze = hat(ich.rucksack, 'spritze') ? ' – du hast eine 💉 im Rucksack!' : ' – du brauchst eine 💉 Rettungsspritze!';
        hinweis = `🦠 Infiziert: noch ${zeitText(ich.infektion)}${ich.sicher ? ' (ruht im Safe Room)' : ''}${spritze}`;
      }
      if (!hinweis && ich.ruht) hinweis = '💤 Du ruhst dich aus';
      if (!hinweis && (ich.durst < 15 || ich.hunger < 15)) hinweis = ich.durst < ich.hunger ? '💧 Du hast großen Durst!' : '🥫 Du hast großen Hunger!';
    }
    const h = $('hinweis');
    h.style.display = hinweis ? 'block' : 'none';
    if (h.innerHTML !== hinweis) h.innerHTML = hinweis;
  }

  // Waffenfelder (zwei Plätze, im HUD oben links unter den Mitspielern): großes Waffensymbol, nur das Magazin „3/15“ (Nahwaffe: nichts).
  // Antippen wechselt, Doppeltippen lädt nach, gedrückt halten bzw. Rechtsklick öffnet das Menü; Taste F wechselt, R lädt nach, X = Faust.
  // Ohne Waffe in der Hand (leer oder Faust) kämpft die Figur mit der Faust.
  waffenplaetzeZeigen(ich) {
    const leiste = $('waffenplaetze');
    const namen = ['Platz 1', 'Platz 2'], waffen = [ich.wp0, ich.wp1], akt = ich.wplatz ?? 0;
    if (!ich.faust) waffen[akt] = ich.waffe;
    const mg = [ich.mg0, ich.mg1], mx = [ich.mx0, ich.mx1];
    if (!ich.faust) mg[akt] = ich.magazin ?? 0;
    const zeilen = waffen.map((w, i) => {
      const d = w ? DINGE[w] : null, wf = w ? WAFFEN[w] : null;
      const vorrat = wf?.fern ? vorratVon(ich, wf) : 0;
      return { w, d, wf, vorrat, m: mg[i] ?? 0, max: mx[i] || (wf?.fern ? wf.magazin : 0) };
    });
    const schluessel = zeilen.map((z, i) => `${z.w}:${z.m}/${z.max}:${z.vorrat}${i === akt && !ich.faust ? '*' : ''}`).join('|') + (ich.faust ? '|faust' : '') + `|${ich.rucksack.length}`;
    if (schluessel !== this.waffenplatzSchluessel) {
      this.waffenplatzSchluessel = schluessel;
      leiste.innerHTML = '';
      zeilen.forEach((z, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const leer = z.wf?.fern && z.m <= 0 && z.vorrat <= 0;
        b.className = (i === akt && !ich.faust ? 'aktiv ' : '') + (z.w ? '' : 'leer ') + (leer ? 'rot' : '');
        const zahl = z.wf?.fern ? `<span class="mag">${z.m}/${z.max}</span>` : '';
        b.innerHTML = `<span class="zz">${z.d ? dingIcon(z.w, 40) : ''}</span>${zahl}<i class="lad"></i>`;
        b.title = `${namen[i]}: ${z.d ? z.d.name : 'leer'}${z.wf?.fern ? ` – Magazin ${z.m}/${z.max}, Vorrat ${z.vorrat}` : ''} (Taste F wechselt, R lädt nach)`;
        b.setAttribute('aria-label', b.title);
        // Antippen = in die Hand, zweimal schnell = nachladen; gedrückt halten (Handy) bzw. Rechtsklick (PC) = Menü (Rucksack, Fallen lassen, Tauschen)
        let lang = false, timer = 0;
        const menue = () => { lang = true; platzMenue(b, i); };
        b.addEventListener('pointerdown', () => { lang = false; clearTimeout(timer); timer = setTimeout(menue, 500); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
        b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); clearTimeout(timer); if (!lang) menue(); });
        b.onclick = e => {
          e.stopPropagation();
          if (lang) { lang = false; return; }
          const jetzt = performance.now(), k = this.waffenKlick;
          this.waffenKlick = { i, t: jetzt };
          if (k && k.i === i && jetzt - k.t < 400) { this.waffenKlick = null; raum.send('waffenplatz', { platz: i }); raum.send('nachladen'); return; }   // Doppeltipp: nachladen
          raum.send('waffenplatz', { platz: i });
        };
        leiste.appendChild(b);
      });
    }
    const lad = ich.faust ? null : leiste.children[akt]?.querySelector('.lad');   // Nachladefortschritt (ohne Neuaufbau)
    if (lad) lad.style.width = ich.nachladen > 0 ? `${Math.round(Math.min(1, ich.nachladen) * 100)}%` : '0';
  }

  // Granatenfeld neben den Waffenfeldern: fester Platz, Anzahl der Handgranaten; nur sichtbar, wenn man werfen kann (Platz bleibt reserviert)
  granatenfeldZeigen(ich) {
    const feld = $('granatenfeld');
    const inHand = ich.waffe === 'handgranate' && !ich.faust;
    let n = (ich.handgranaten ?? 0) + zaehle(ich.rucksack, 'granate');
    [0, 1].forEach(i => { if (ich['wp' + i] === 'handgranate') n += i === (ich.wplatz ?? 0) && !ich.faust ? (ich.magazin ?? 0) : (ich['mg' + i] ?? 0); });
    const bereit = !ich.unten && !(ich.zombie > 0) && this.lokal && (hat(ich.rucksack, 'granate') || (inHand && ich.magazin > 0) || ich.handgranaten > 0);
    this.granateBereit = !!bereit;
    const sicht = bereit ? 'visible' : 'hidden';
    if (feld.style.visibility !== sicht) feld.style.visibility = sicht;
    textSetzen('granatenzahl', bereit ? String(n) : '');
    if (!feld.__an) { feld.__an = true; feld.onclick = e => { e.stopPropagation(); this.granateWerfen(); }; }
  }

  // Handgranaten in der Hand: dezenter 60°-Bogen vor der Figur bis zur maximalen Wurfweite (Tippen wirft genau dorthin)
  wurfBogenZeichnen() {
    const g = this.wurfBogen ??= this.add.graphics().setDepth(59);
    g.clear();
    const ich = raum.state.spieler.get(meineId);
    if (!ich || ich.waffe !== 'handgranate' || ich.faust || ich.unten || !(ich.zombie <= 0) || !this.lokal || (ich.ebene ?? '') !== this.aktEbene) return;
    const r = (ich.wurfweite || GRANATE.wurfWeite / 8) * 8, a = ich.richtung, h = GRANATE.bogen / 2, x = this.lokal.x, y = this.lokal.y;
    g.fillStyle(0xffffff, 0.07).beginPath().moveTo(x, y).arc(x, y, r, a - h, a + h, false).closePath().fillPath();
    g.lineStyle(1.5, 0xffffff, 0.3).beginPath().moveTo(x + Math.cos(a - h) * 20, y + Math.sin(a - h) * 20).lineTo(x + Math.cos(a - h) * r, y + Math.sin(a - h) * r)
      .moveTo(x + Math.cos(a + h) * 20, y + Math.sin(a + h) * 20).lineTo(x + Math.cos(a + h) * r, y + Math.sin(a + h) * r).strokePath();
    g.lineStyle(2.5, 0xffd54f, 0.55).beginPath().arc(x, y, r, a - h, a + h, false).strokePath();   // Linie der maximalen Wurfweite
  }

  // Nachlade-Fortschritt als Ring um die Figur (alle Spieler)
  ladeRingeZeichnen() {
    const g = this.ladeRing ??= this.add.graphics().setDepth(60);
    g.clear();
    for (const [id, p] of raum.state.spieler) {
      if (!(p.nachladen > 0) || (p.ebene ?? '') !== this.aktEbene) continue;
      const f = this.figuren.get(id), x = id === meineId && this.lokal ? this.lokal.x : f?.x, y = id === meineId && this.lokal ? this.lokal.y : f?.y;
      if (x === undefined) continue;
      g.lineStyle(3, 0x000000, 0.45).beginPath().arc(x, y, 17, 0, Math.PI * 2).strokePath();
      g.lineStyle(3, 0xffb300, 0.95).beginPath().arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.nachladen)).strokePath();
    }
  }

  rucksackZeigen(ich) {
    const schluessel = ich.plaetze + ':' + [...ich.rucksack].join(',');
    if (schluessel === this.rucksackSchluessel) return;
    this.rucksackSchluessel = schluessel;
    const leiste = $('rucksack');
    leiste.innerHTML = '';
    for (let i = 0; i < (ich.plaetze || RUCKSACK_PLAETZE); i++) {
      const e = ich.rucksack[i], d = e ? dingId(e) : '', n = e ? dingN(e) : 0;
      const b = document.createElement('button');
      b.className = 'platz' + (d ? '' : ' leer');
      b.innerHTML = d ? dingIcon(d, 32) + (n > 1 ? `<span class="stapelzahl">×${n}</span>` : '') : '';
      b.title = d ? `${DINGE[d]?.name}${n > 1 ? ` ×${n}` : ''} (Taste ${i + 1})` : 'leer';
      b.dataset.i = i;
      if (d) { b.onclick = e => { e.stopPropagation(); if (zieheJuengst) return; popupAuf(b, i, d); }; rucksackZiehen(b, i); }
      leiste.appendChild(b);
    }
  }
}

// ---------- Rucksack-Menü, Vorratskiste ----------
// Fach ziehen und auf ein anderes legen: Maus nach ~6 px Bewegung, Touch erst nach langem Drücken (~400 ms)
let zieheJuengst = false;
function rucksackZiehen(knopf, von) {
  knopf.style.touchAction = 'manipulation';
  knopf.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const touch = e.pointerType !== 'mouse', x0 = e.clientX, y0 = e.clientY;
    let zieht = false, geist = null, timer = null;
    const los = () => { clearTimeout(timer); document.removeEventListener('pointermove', bewegt); document.removeEventListener('pointerup', ende); document.removeEventListener('pointercancel', ab); document.removeEventListener('touchmove', sperre); };
    const sperre = ev => { if (zieht) ev.preventDefault(); };
    const starte = () => {
      zieht = true; popupZu(); knopf.classList.add('zieht');
      geist = knopf.cloneNode(true); geist.style.cssText = 'position:fixed;z-index:60;pointer-events:none;opacity:.85;transform:translate(-50%,-50%)';
      document.body.append(geist); navigator.vibrate?.(20);
    };
    const ziel = ev => document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('#rucksack .platz');
    const bewegt = ev => {
      if (!zieht) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > (touch ? 10 : 6)) { if (touch) los(); else starte(); }
        return;
      }
      geist.style.left = ev.clientX + 'px'; geist.style.top = ev.clientY + 'px';
      document.querySelectorAll('#rucksack .platz.ziel').forEach(q => q.classList.remove('ziel'));
      ziel(ev)?.classList.add('ziel');
    };
    const aufraeumen = () => { geist?.remove(); knopf.classList.remove('zieht'); document.querySelectorAll('#rucksack .platz.ziel').forEach(q => q.classList.remove('ziel')); };
    const ende = ev => {
      const z = zieht ? ziel(ev) : null;
      los(); aufraeumen();
      if (zieht) {
        zieheJuengst = true; setTimeout(() => { zieheJuengst = false; }, 50);
        const nach = z ? Number(z.dataset.i) : -1;
        if (nach >= 0 && nach !== von) raum.send('rucksack_tausch', { von, nach });
      }
    };
    const ab = () => { los(); aufraeumen(); };
    document.addEventListener('pointermove', bewegt);
    document.addEventListener('pointerup', ende);
    document.addEventListener('pointercancel', ab);
    document.addEventListener('touchmove', sperre, { passive: false });
    if (touch) timer = setTimeout(() => { starte(); bewegt(e); }, 400);
  });
}
function popupAuf(knopf, platz, ding) {
  const p = $('popup');
  p.innerHTML = '';
  const titel = document.createElement('div');
  titel.className = 'titel'; titel.innerHTML = dingHtml(ding, 24);
  const nutzen = document.createElement('button');
  nutzen.textContent = DINGE[ding]?.waffe ? 'In die Hand' : ding === 'munitionskiste' ? 'Öffnen (+30 Schuss)' : ding === 'granate' ? 'Werfen' : ding === 'radio' ? 'Einschalten' : ding === 'bretter' ? 'Wofür?' : 'Benutzen';
  nutzen.onclick = () => { raum.send('benutze', { platz }); popupZu(); };
  const weg = document.createElement('button');
  weg.textContent = 'Wegwerfen'; weg.className = 'zweit';
  weg.onclick = () => { raum.send('wegwerfen', { platz }); popupZu(); };
  const x = document.createElement('button');
  x.textContent = '✕'; x.className = 'zweit'; x.title = 'Schließen'; x.setAttribute('aria-label', 'Schließen'); x.style.cssText = 'float:right;padding:0 8px;margin-left:8px';
  x.onclick = popupZu;
  titel.prepend(x);
  p.append(titel);
  const anz = raum.state.spieler.get(meineId)?.rucksack.length ?? 0;
  const reihe = document.createElement('div'); reihe.style.cssText = 'display:flex;gap:6px';
  [['◀', -1, 'Ein Fach nach links'], ['▶', 1, 'Ein Fach nach rechts']].forEach(([z, d, tip]) => {
    const b = document.createElement('button');
    b.textContent = z; b.title = tip; b.setAttribute('aria-label', tip); b.className = 'zweit'; b.style.flex = '1';
    b.disabled = platz + d < 0 || platz + d >= anz;
    b.onclick = () => {   // Fenster bleibt offen und folgt dem Gegenstand an seinen neuen Platz (nach der Server-Antwort)
      const nach = platz + d;
      raum.send('rucksack_tausch', { von: platz, nach });
      b.disabled = true;
      let n = 0;
      const warte = setInterval(() => {
        if ($('popup').style.display === 'none') return clearInterval(warte);
        const ich = raum.state.spieler.get(meineId);
        if ((ich?.rucksack[nach] && dingId(ich.rucksack[nach]) === ding) || ++n > 25) {
          clearInterval(warte);
          const nk = document.querySelector(`#rucksack .platz[data-i="${nach}"]`);
          if (ich?.rucksack[nach] && dingId(ich.rucksack[nach]) === ding && nk) popupAuf(nk, nach, ding); else popupZu();
        }
      }, 40);
    };
    reihe.append(b);
  });
  p.append(reihe);
  if (DINGE[ding]?.waffe || ding === 'granate') {   // Waffe/Handgranaten in einen Waffenplatz legen
    ['Haupt', 'Neben', 'Ersatz'].forEach((n, i) => {
      const b = document.createElement('button');
      const inh = raum.state.spieler.get(meineId)?.['wp' + i];
      b.innerHTML = `→ Platz ${i + 1} (${n}${inh && DINGE[inh] ? ': ' + dingIcon(inh, 20) : ''})`; b.className = 'zweit';
      b.onclick = () => { raum.send('platz_aktion', { platz: i, aktion: 'tausch', rs: platz }); popupZu(); };
      p.append(b);
    });
  }
  // „Wegwerfen“ und „In die Hand“/„Benutzen“ immer ganz unten (nah am Inventar, Daumen)
  p.append(weg, nutzen);
  const r = knopf.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left + r.width / 2 - p.offsetWidth / 2)) + 'px';
  p.style.top = 'auto';
  p.style.bottom = (window.innerHeight - r.top + 8) + 'px';
}
function popupZu() { $('popup').style.display = 'none'; }
// Menü am Waffenplatz-Knopf (gedrückt halten / Rechtsklick): in den Rucksack, fallen lassen, tauschen mit einer Waffe aus dem Rucksack
function platzMenue(knopf, platz) {
  const ich = raum.state.spieler.get(meineId);
  if (!ich || ich.unten) return;
  const name = ich['wp' + platz] || '', p = $('popup');
  p.innerHTML = '';
  const titel = document.createElement('div');
  titel.className = 'titel'; titel.innerHTML = name ? `${['Platz 1', 'Platz 2'][platz]}: ${dingHtml(name, 24)}` : `${['Platz 1', 'Platz 2'][platz]}: leer`;
  p.append(titel);
  const knopfMit = (text, daten, zweit, html) => {
    const b = document.createElement('button');
    if (html) b.innerHTML = html; else b.textContent = text;
    if (zweit) b.className = 'zweit';
    b.onclick = () => { raum.send('platz_aktion', { platz, ...daten }); popupZu(); };
    p.append(b);
  };
  if (name && kannAufnehmen(ich.rucksack, ich.plaetze || RUCKSACK_PLAETZE, name === 'handgranate' ? 'granate' : name)) knopfMit('In den Rucksack', { aktion: 'rucksack' });
  if (name) knopfMit('Fallen lassen', { aktion: 'fallen' }, true);
  const gesehen = new Set();
  [...ich.rucksack].forEach((e, rs) => {
    const d = dingId(e);
    if (!(DINGE[d]?.waffe || d === 'granate') || gesehen.has(d)) return;
    gesehen.add(d);
    const n = d === 'granate' ? ` (${zaehle(ich.rucksack, 'granate')})` : '';
    knopfMit('', { aktion: 'tausch', rs }, true, `${name ? 'Tauschen mit' : 'Hierhin:'} ${dingHtml(d, 22)}${n}`);
  });
  const r = knopf.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left)) + 'px';
  p.style.bottom = 'auto';
  p.style.top = Math.max(8, Math.min(window.innerHeight - p.offsetHeight - 8, r.bottom + 8)) + 'px';   // das Feld sitzt oben links: Menü darunter
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') popupZu(); });
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
    [...liste].forEach((e, i) => {
      const b = document.createElement('button'), n = dingN(e);
      b.className = 'ding'; b.innerHTML = dingHtml(dingId(e), 22) + (n > 1 ? ` <b>×${n}</b>` : '');
      b.onclick = () => raum.send('kiste', { richtung, platz: i });
      raster.appendChild(b);
    });
    if (!liste.length) raster.innerHTML = '<span class="leer">leer</span>';
    el.appendChild(raster);
  };
  fuellen($('kisteinhalt'), kiste, KISTE_PLAETZE, 'raus', 'Kiste');
  fuellen($('kisterucksack'), ich.rucksack, ich.plaetze || RUCKSACK_PLAETZE, 'rein', 'Rucksack');
}

// ---------- Handel mit Ärzten und Soldaten im Bundeswehr-Lager ----------
let handelOffen = null, handelSchluessel = '', handelAngebot = '';
function handelAuf(wer) { handelOffen = wer; handelSchluessel = ''; $('handel').style.display = 'flex'; }
function handelZu() { handelOffen = null; $('handel').style.display = 'none'; }
function handelZeigen(ich, sp) {
  const h = HANDEL[handelOffen];
  const nah = ich && !ich.ebene && raum.state.stuetzpunkt === 'steht' && handelPartner(sp, ich.x, ich.y, HANDEL_ABSTAND + 14, handelOffen);
  if (!h || !nah) return handelZu();
  const schluessel = handelOffen + '|' + [...ich.rucksack].join(',') + '|' + ich.munition + '|' + ich.plaetze;
  if (schluessel === handelSchluessel) return;
  handelSchluessel = schluessel;
  $('handeltitel').textContent = `${h.zeichen} Mit dem ${h.name} tauschen`;
  const anz = d => zaehle(ich.rucksack, d);
  const habe = [...new Set(flach(ich.rucksack))].map(d => `${dingIcon(d, 20)} ${anz(d)}`).join('  ') || 'nichts';
  $('handelhabe').innerHTML = `Du hast: ${habe}${ich.munition ? `  ${dingIcon('munition', 20)} ${ich.munition} Schuss` : ''}`;
  const box = $('handelangebote');
  box.innerHTML = '';
  for (const a of h.angebote) {
    const zeile = document.createElement('div'); zeile.className = 'angebot';
    const gibt = a.gibt === 'munition' ? `${dingIcon('munition', 22)} ${a.menge} Schuss Munition` : `${dingIcon(a.gibt, 22)} ${a.menge > 1 ? a.menge + '× ' : ''}${DINGE[a.gibt].name}`;
    const kostet = `${a.kostet.anzahl} beliebige aus ${a.kostet.aus.map(d => dingIcon(d, 20)).join(' ')}`;
    const zahl = bezahlung(ich.rucksack, a.kostet);
    const platzOk = a.gibt === 'munition' ? ich.munition < MUNITION_MAX : (() => { const probe = [...ich.rucksack]; for (const d of zahl ?? []) entferneStueck(probe, d); return kannAufnehmen(probe, ich.plaetze, a.gibt, a.menge); })();
    const text = document.createElement('div'); text.className = 'text';
    text.innerHTML = `<b>${gibt}</b><span>kostet ${kostet}</span>${zahl ? `<span class="zahlt">zahlt: ${zahl.map(d => dingIcon(d, 20)).join(' ')}</span>` : '<span class="fehlt">dafür fehlt dir etwas</span>'}`;
    const knopf = document.createElement('button'); knopf.textContent = 'Tauschen';
    knopf.disabled = !zahl || !platzOk;
    if (zahl && !platzOk) knopf.title = a.gibt === 'munition' ? 'Munition voll' : 'Rucksack voll';
    knopf.onclick = () => raum.send('handel', { wer: handelOffen, angebot: a.id });
    const rknopf = document.createElement('button'); rknopf.textContent = `🎓 ${HANDEL_RAETSEL} Rätsel`;
    rknopf.title = `Statt zu bezahlen: ${HANDEL_RAETSEL} Rätselfragen hintereinander richtig beantworten`;
    rknopf.disabled = !platzOk;
    rknopf.onclick = () => { handelAngebot = a.id; raum.send('handel_raetsel', { wer: handelOffen, angebot: a.id }); };
    zeile.append(text, knopf, rknopf); box.appendChild(zeile);
  }
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
      const b = document.createElement('button'); b.className = 'ding'; b.innerHTML = dingHtml(d, 22);
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
  [...(ich?.rucksack ?? [])].forEach((e, i) => {
    const b = document.createElement('button'), n = dingN(e); b.className = 'ding'; b.innerHTML = dingHtml(dingId(e), 22) + (n > 1 ? ` <b>×${n}</b>` : '');
    b.onclick = () => raum.send('tausch_anbieten', { platz: i });
    el.appendChild(b);
  });
}
function tauschZu() { tauschOffen = null; $('tausch').style.display = 'none'; $('tauschrucksack').dataset.k = ''; }

// ---------- Rätsel am Tor ----------
let raetselId = null, raetselTuer = false, raetselNoetig = 0, raetselTimer = null, raetselHandel = null;
function zeigeRaetsel(m) {
  clearTimeout(raetselTimer);
  raetselId = m.id; raetselTuer = !!m.tuer; raetselAlle = !!m.alle; raetselNoetig = m.noetig; raetselHandel = m.handel ? { wer: handelOffen, angebot: handelAngebot } : null;
  $('raetseltitel').textContent = (m.alle ? `🔍 Alles durchsuchen – Frage ${m.alle.nr} von ${m.alle.von}` : m.handel ? `🎓 Rätsel-Tausch ${m.handel.nr + 1} von ${m.handel.von}` : m.tuer ? '🔐 Verschlossene Tür' : `🔐 Schloss ${m.geloest + 1} von ${m.noetig}`) + (m.thema ? ` · ${m.thema}` : '');
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
  const hd = m.handel;
  const al = m.alle;
  $('raetselergebnis').innerHTML = (al ? (m.richtig ? (al.fertig ? '✅ Alle richtig! Die Türen gehen auf.' : `✅ Richtig! (${al.nr}/${al.von})`) : '❌ Falsch – richtig ist: <b>' + escapeHtml(m.loesung) + '</b>. Erst in 30 s wieder.') : hd ? (m.richtig ? `✅ Richtig! (${hd.nr}/${hd.von})${hd.text ? ' ' + escapeHtml(hd.text) : ''}` : '❌ Falsch – richtig ist: <b>' + escapeHtml(m.loesung) + '</b>. Die Serie beginnt von vorn.') : m.richtig ? '✅ Richtig! Das Schloss springt auf.' : `❌ Falsch – richtig ist: <b>${escapeHtml(m.loesung)}</b>. Die Zombies haben es gehört!`) + link;
  if (m.richtig) {
    // kurze Bestätigung, dann von selbst weiter: nächste Frage am Tor (falls noch Schlösser offen) oder Fenster zu
    const id = raetselId;
    clearTimeout(raetselTimer);
    raetselTimer = setTimeout(() => {
      if (raetselId !== id || $('raetsel').style.display === 'none') return;
      if (al) { raetselZu(); if (al.weiter) raum.send('durchsuche_alle', { weiter: true }); return; }
      if (raetselHandel) { const rh = raetselHandel; raetselZu(); if (hd?.weiter) raum.send('handel_raetsel', { wer: rh.wer, angebot: rh.angebot, weiter: true }); return; }
      const weiter = !raetselTuer && (raum.state.torGeloest ?? 0) < raetselNoetig;
      raetselZu();
      if (weiter) raum.send('aktion');
    }, 1000);
  }
}
let raetselAlle = false;
function raetselZu() { clearTimeout(raetselTimer); if (raetselId) raum.send('raetsel_abbruch', { id: raetselId }); raetselId = null; $('raetsel').style.display = 'none'; }

function balkenSetzen(id, wert) {
  const el = $(id).firstElementChild;
  $(id).classList.toggle('kritisch', wert < 20);
  const w = Math.max(0, Math.min(100, wert)).toFixed(0) + '%';
  if (el.style.width !== w) el.style.width = w;
}
// Aktionsknöpfe zeigen nur Text: Emojis/Symbole raus
const nurText = t => String(t ?? '').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
// Behälter, bei denen der Knopf „öffnen“ heißt (Schrank, Kiste, Kofferraum, Container …)
const OEFFNEN = new Set(['schrank', 'kuehlschrank', 'spind', 'spind_belohnung', 'container', 'bw_kiste', 'kiste']);

function textSetzen(id, text) { const el = $(id); if (el.textContent !== text) el.textContent = text; }
// wie textSetzen, aber mit HTML (Gegenstands-Icons); nur bei Änderung neu setzen
function htmlSetzen(id, html) { const el = $(id); if (el.__html !== html) { el.__html = html; el.innerHTML = html; } }

function balken(wert) {
  return `<div class="balken"><div style="width:${Math.round(wert * 100)}%"></div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
