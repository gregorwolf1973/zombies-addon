// Spielraum: der Server entscheidet über Bewegung, Zombies, Treffer, Gegenstände und Safe Rooms.
import crypto from 'node:crypto';
import { holeFragen } from './fragenquelle.mjs';
import { mischeAntworten, waehleFrage } from './raetsel.mjs';
import { botSchritt, BOT_NAMEN, botGegenangebot, botEinverstanden } from './bots.mjs';
import { botBefehl } from './botplan.mjs';
import { Mensch, Stadtleben, VERSTECK_WEITE } from './menschen.mjs';
import { Hund, Hunde } from './hund.mjs';
import { Fahrzeug, Verkehr } from './verkehr.mjs';
import { Feuer, Brandstifter } from './feuer.mjs';
import { Zombiewelle } from './welle.mjs';
import { Aufgabe, Aufgaben, Mission, levelSchluessel } from './aufgaben.mjs';
import { schwierigkeit, LEVEL_VORGABE } from './schwierigkeit.mjs';
import { Stuetzpunkt } from './stuetzpunkt.mjs';
import { mitMunitionsglueck, munitionsDinge, naechsteSerie } from './munitionsglueck.mjs';
import { levelorteSetzen } from './levelorte.mjs';
import { drahtPruefen, haengendStart, haengtSchritt } from './haengend.mjs';
import { Finale } from './finale.mjs';
import * as SU from './superuser.mjs';
import { imLager } from '../client/stuetzpunkt.mjs';
import { waehleZiel, schussGuete, ersterBaum } from './baumschuss.mjs';
import { aussehenMigriert } from '../client/figurbild.mjs';
import { Granaten } from './granaten.mjs';
import { Radios } from './radio.mjs';
import * as WP from './waffenplaetze.mjs';
import { hat, zaehle, flach, indexVon, entferne, nimmEins, nimmStapel, fuegeHinzu, kannAufnehmen, blockGrund, platzFuer, verschiebe, laden as stapelLaden, dingId, dingN, istTasche } from '../client/stapel.mjs';
import { munitionGeben, kisteOeffnen, munitionPruefen } from './munition.mjs';
import { SzeneB11 } from './szene_b11.mjs';
import * as FK from './faehigkeiten.mjs';
import { alleKandidaten, nimmWeite, ALLE_FRAGEN, ALLE_SPERRE } from '../client/durchsuche_alle.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { weltBeschaffen } from './weltcache.mjs';
import { lautstaerke } from '../client/sprache_regeln.mjs';
import { Room, ServerError } from '@colyseus/core';
import { Nebel, NEBEL_VORGABE, zombieSichtFaktor } from './nebel.mjs';
import { schema, t, StateView } from '@colyseus/schema';
import { einstellungenBereinigen } from '../client/einstellungen_regeln.mjs';
import {
  KACHEL, BREITE, HOEHE, kachelVon, breiteVon, hoeheVon, tempoVon, reichVon, abstandBehaelter, abstandTuer, setzeTuerKacheln, tuerAnZelle, T, WERTE as W, baueWelt, bewege, frei, sichtfrei, sichtGuete, drinnen, istNacht, hausHell, aktiveWaffe, zaunUeberstieg, baumFaktor, durchsuchDauer, freiTier, tierGelaende,
  bewaffnetSoll, zufall, schlossArt, safeRoomVon, WELT_VERSION, INNEN_FEIN, setzeInnenFein, setzeInnenTempo, setzeTageszeiten,
  WAFFEN, GRANATE, DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEUTE, MUNITION_PRO_FUND, AKTION_ABSTAND,
  BLOCKIERT, ziehe, MUNITIONSKISTE_SCHUSS, MUNITION_KISTE_AB, MUNITION_MAX, PFEILE_MAX, PFEILE_PRO_FUND, GRANATEN_MAX, HANDGRANATEN_MAX, GRANATEN_PRO_FUND, vorratVon, vorratFeld, TEMPO_MG, traegtMg, BEUTE_BONUS, setzeKartengroesse, INFEKTION_DAUER, ZOMBIE_ZEIT, LEICHE_SELTEN, LEICHE_OFT, LEICHE_WOHNUNG, ladenArt, LEICHE_DAUER, LEICHEN_MAX, BODEN_DAUER, TAUSCH_ABSTAND, weltFingerabdruck } from '../client/welt.mjs';

export const Spieler = schema({
  name: t.string(),
  aussehen: t.string(),     // Figur: 'm|w,Haarfarbe,Kleidfarbe', z. B. 'w,2,5' (siehe client/figurbild.mjs)
  x: t.number(), y: t.number(),
  richtung: t.number(),
  hp: t.number(),
  kamera: t.boolean(),      // Superuser im Kameraflug: Figur steht, unverwundbar, für Zombies unsichtbar (server/superuser.mjs)
  anBord: t.boolean(),      // sitzt im Evakuierungsfahrzeug (Bus, Panzer, A400M, Hubschrauber): Position folgt ihm, Zombies lassen ihn in Ruhe
  durst: t.uint8(),         // 100 = satt, 0 = verdurstet (Server rechnet genau, übertragen wird die ganze Zahl)
  hunger: t.uint8(),
  unten: t.boolean(),
  afk: t.boolean(),         // true = untätig, ein Bot steuert die Figur (Client: 🤖 hinter dem Namen)
  hilfe: t.number(),        // Fortschritt beim Aufhelfen 0..1
  waffe: t.string(),        // Name aus WAFFEN (pistole, gewehr, schrotflinte, schlaeger, sense, messer) oder ""
  munition: t.uint8(),
  pfeile: t.uint8(),        // Pfeile für die Armbrust (Vorrat wie Munition)
  handgranaten: t.uint8(),  // Vorrat an Handgranaten für einen Waffenplatz (Magazin 5, Rest hier)
  wurfweite: t.uint8(),     // Wurfweite der Handgranaten in Metern (für den Bogen im Client)
  faust: t.boolean(),       // true = Hand leer (✊), der aktive Waffenplatz behält seine Waffe
  granaten: t.uint8(),      // Granaten (40 mm) für den Granatwerfer (Vorrat wie Munition)
  magazin: t.uint8(),       // Schuss im Magazin der Waffe in der Hand (munition/pfeile/granaten = Vorrat außerhalb des Magazins)
  magmax: t.uint8(),        // Magazingröße der Waffe in der Hand (Einstellung der Verwaltung)
  nachladen: t.number(),    // Fortschritt des Nachladens 0..1 (0 = lädt nicht nach)
  wplatz: t.uint8(),        // aktiver Waffenplatz: 0 = Platz 1, 1 = Platz 2 (nur noch zwei Plätze)
  wp0: t.string(), wp1: t.string(), wp2: t.string(),   // Waffen der Plätze (wp2 ungenutzt, bleibt leer; der aktive spiegelt p.waffe)
  mg0: t.uint8(), mg1: t.uint8(), mg2: t.uint8(),      // Schuss im Magazin je Waffenplatz (für die Knöpfe im HUD)
  mx0: t.uint8(), mx1: t.uint8(), mx2: t.uint8(),      // Magazingröße je Waffenplatz (0 = Nahwaffe)
  ebene: t.string(),        // '' = draußen, sonst z. B. 'h5eg', 'h5keller', 'h5dach'
  lampe: t.uint16(),        // Restzeit der Taschenlampe in Sekunden (leuchtet drinnen von selbst; übertragen ganzzahlig)
  rucksack: t.array("string"),
  plaetze: t.uint8(),       // Größe des Rucksacks (8, 12 oder 16)
  farbe: t.uint8(),
  schleicht: t.boolean(),
  verbunden: t.boolean(),
  sicher: t.string(),       // Id des Safe Rooms, in dem man steht, sonst ""
  aktion: t.string(),       // "durchsuchen" | "barrikade" | ""
  fortschritt: t.number(),
  besiegt: t.uint16(),
  kleidung: t.uint8(),      // Haltbarkeit der festen Kleidung 0..100 (Schutz vor Bissen)
  infektion: t.uint16(),    // Sekunden bis zur Verwandlung, 0 = gesund (übertragen ganzzahlig, Server rechnet genau)
  zombie: t.uint16(),       // Sekunden, die man noch Zombie ist, 0 = Mensch
  ruht: t.boolean(),        // ruht auf einem Feldbett im Safe Room (Leben +1/s, Hunger/Durst halb so schnell)
  su: t.boolean(),          // Superuser (Testzugang): zeigt nur ⭐ neben dem Namen
  spricht: t.boolean(),     // spricht gerade ins Mikrofon (Sprachübertragung, zeigt 🔊 über der Figur)
  seq: t.uint16(),          // Nummer der letzten ganz verarbeiteten Eingabe (Client gleicht seine Vorhersage damit ab)
}, 'Spieler');

// Positionen als int16 (Karte < 32768 px): der Server rechnet weiter mit Kommazahlen, übertragen werden ganze Pixel.
// Die Blickrichtung z.richtung (Bogenmaß) ist nur noch eine Server-Eigenschaft; übertragen wird rq = Richtung in 256 Stufen.
export const Zombie = schema({
  x: t.int16(), y: t.int16(),
  rq: t.uint8(),
  jagt: t.boolean(),
  hp: t.uint8(),
  kriecht: t.boolean(),     // „nicht ganz tot“: robbt am Boden
  haengt: t.boolean(),      // hängt im S-Draht fest (Kriecher-Bild, zappelt; server/haengend.mjs)
  ebene: t.string(),
  variante: t.uint8(),      // Zombietyp 0–24 (Reihenfolge ZOMBIE_TYPEN in einstellungen.mjs)
}, 'Zombie');

export const Behaelter = schema({ rest: t.uint8() }, 'Behaelter');
// alter (Sekunden) ist nur Server-Eigenschaft; übertragen wird blass (0 = voll, 10 = verschwunden) in den letzten 20 s
export const Leiche = schema({ x: t.number(), y: t.number(), richtung: t.number(), rest: t.uint8(), blass: t.uint8(), variante: t.uint8(), ebene: t.string(), fest: t.boolean(), deko: t.boolean() }, 'Leiche');  // fest: Tote in Wohnungen, verschwinden nie
export const BodenDing = schema({ x: t.number(), y: t.number(), ding: t.string(), blass: t.uint8(), ebene: t.string() }, 'BodenDing');
// Türen: Zimmertüren ('ebene:x,y') und Haustüren ('haus:nr'). barrikade und hp 0–100, kaputt = zerbrochen (bleibt offen)
export const Tuer = schema({ offen: t.boolean(), verschlossen: t.boolean(), barrikade: t.number(), hp: t.number(), kaputt: t.boolean() }, 'Tuer');
function neueTuer(offen, verschlossen) {
  const st = new Tuer();
  st.offen = !!offen; st.verschlossen = !!verschlossen; st.barrikade = 0; st.hp = TUER_HP; st.kaputt = false;
  return st;
}
export const Safe = schema({ barrikade: t.number(), kiste: t.array("string") }, 'Safe');

export const Zustand = schema({
  seed: t.number(),
  karte: t.string(),        // '' = Dorf (erzeugt), sonst Name der OSM-Karte, z. B. 'geretsried'
  phase: t.string(),        // "spiel" | "erwischt"
  zeit: t.number(),         // Spielzeit in Sekunden (wird gespeichert)
  besiegt: t.uint16(),
  gerettet: t.uint16(),     // gerettete Bewohner (wird gespeichert)
  verwandelt: t.uint16(),   // Bewohner, die sich nach einem Biss in Zombies verwandelt haben (wird gespeichert)
  torGeloest: t.uint8(),    // richtig beantwortete Rätsel am Tor (3 = offen)
  level: t.uint8(),         // 1 = erste Karte, nach jedem geschafften Evakuierungsbus eins mehr (server/aufgaben.mjs)
  funk: t.boolean(),        // Funkspruch abgesetzt: der Evakuierungsbus kommt
  busAnkunft: t.number(),   // Ankunftszeit des Busses (Spielminuten am Tag), -1 = noch kein Funkspruch
  busAb: t.number(),        // Abfahrtszeit des wartenden Busses (Spielminuten am Tag)
  busDa: t.boolean(),       // der Bus steht am Ortsausgang
  busSteht: t.boolean(),    // ... und steht (Einsteigen nur dann); false = er fährt noch ein (Level 2: Evakuierungspanzer)
  busBord: t.uint8(),       // so viele sind an Bord ...
  busGesamt: t.uint8(),     // ... von so vielen lebenden Spielern (mit Bots)
  evakArt: t.string(),      // Evakuierungsart dieser Karte: 'bus' | 'panzer' (Leopard 2A7) | 'flugzeug' (A400M, dann Hubschrauber)
  evakPhase: t.string(),    // Flugzeug: '' | 'landung' | 'einsteigen' | 'heliAnflug' | 'heli' | 'abflug' (server/aufgaben.mjs)
  evakX: t.number(),        // Abholpunkt (Pixel) abweichend vom Ortsausgang (Flugzeug: Heckrampe, danach Hubschrauberplatz); <= 0 = Ortsausgang
  evakY: t.number(),
  evakAX: t.number(),       // Absturzstelle des A400M (Wrack, Pixel; 0 = keine) und Anflugrichtung
  evakAY: t.number(),
  evakW: t.number(),
  evakRest: t.uint16(),     // Sekunden, bis der Hubschrauber landet
  finaleRest: t.uint16(),   // Finale (Andermatt): Sekunden bis zum Atomschlag, 0 = kein Countdown (server/finale.mjs)
  aufgaben: t.map(Aufgabe), // gemeinsame Aufgaben dieses Levels
  missionen: t.map(Mission),   // Suchkreise der Missionsgegenstände (Mitte/Radius in px, nie der genaue Ort)
  missionOffen: t.uint8(),     // noch nicht abgegebene Missionsgegenstände (0 = alle da oder keine Mission)
  tag: t.number(),          // Spieltag seit Start dieser Welt (1 = erster Tag; Maßstab wie spieltage())
  uhr: t.number(),          // Tageszeit in Spielminuten (0–1439)
  tagAb: t.number(),        // ab hier ganz hell (Einstellung, für die Clients)
  nachtAb: t.number(),      // ab hier ganz dunkel
  nachtDunkel: t.number(),  // Nachtdunkelheit in % (Einstellung, für die Clients)
  nebel: t.number(),        // Nebeldichte 0..1 (Wetterlage, server/nebel.mjs), in 0,02-Stufen
  nebelSicht: t.number(),   // Sichtweite im Nebel in Metern bei voller Dichte (Einstellung)
  menschenGroesse: t.number(),   // Menschengröße in % (Einstellung, für die Clients)
  zombieGroesse: t.number(),   // Zombiegröße in % im Verhältnis zu den Menschen (Leichen folgen)
  groesseGesamt: t.number(),  // Gesamtgröße (alles) in %
  autos: t.uint8(),         // Autodichte der Welt (10 = normal), gilt bis zum Neustart der Welt
  spieler: t.map(Spieler),
  zombies: t.map(Zombie).view(),   // jeder Client sieht nur Zombies in seinem Bildausschnitt (+ Rand), siehe sichtAktualisieren()
  zombieZahl: t.uint16(),   // alle Zombies der Welt (für die Anzeige „unterwegs“)
  takt: t.uint32(),         // Server-Uhr in ms seit Raumstart (Zeitstempel der Positionen für die Glättung im Client)
  behaelter: t.map(Behaelter),   // nur schon durchsuchte
  leichen: t.map(Leiche),       // tote Zombies, die eine Weile liegen bleiben
  boden: t.map(BodenDing),      // weggeworfene Gegenstände
  tueren: t.map(Tuer),          // Zimmertüren der betretenen Häuser ('ebene:x,y') und Haustüren mit Zustand ('haus:nr')
  safes: t.map(Safe),
  hunde: t.map(Hund),               // Streuner und Begleiter-Hunde (server/hund.mjs)
  menschen: t.map(Mensch).view(),   // Bewohner der Stadt (Abschnitt 4); wie Zombies nur im Bildausschnitt (+ Rand)
  fahrzeuge: t.map(Fahrzeug),   // Linienbus, Verkehr, Polizei, Feuerwehr, Wracks
  feuer: t.map(Feuer),
  verbrannt: t.map('boolean'),  // 'haus:nr', 'auto:bID', 'bus:ID', 'fz:ID'
  platt: t.map('int32'),        // Szene „Stau auf der B11“: von Panzern plattgefahrene geparkte Autos, Behälter-Id → Schub (client/b11_platt.mjs)
  optionen: t.uint8(),          // Schalter für die Clients (Bits): 1 = Sichtkegel der Zombies anzeigen, 2 = maßstäbliche Innenräume (Einstellung/ZOMBIES_INNEN1M; der Client baut sie genauso, client/innen_fein.mjs)
  tuerFrei: t.uint8(), tuerRaetsel: t.uint8(), tuerSchluessel: t.uint8(),   // Anteile der Schlossarten verschlossener Zimmertüren in % (Einstellung, der Client berechnet damit schlossArt)
  stuetzpunkt: t.string(),      // Bundeswehr-Stützpunkt: '' = keiner, 'steht', 'gefallen' oder 'aus' (server/stuetzpunkt.mjs)
  bwTurm: t.number(),           // Drehwinkel des Puma-Turms (Bogenmaß), der Turm dreht sich zum Ziel
  bwX: t.number(), bwY: t.number(), bwW: t.number(),   // Puma: Position (Turmmitte) und Fahrtrichtung der Wanne, er patrouilliert an der Front
}, 'Zustand');

const ZETTEL_CHANCE = 0.06;  // Zettel bei einer Leiche draußen: Hinweis auf einen Missionsgegenstand
const TUER_HP = 100;          // Haltbarkeit einer Tür (nach der Barrikade)
const TUER_SCHADEN = 4;       // hp pro Sekunde und hämmerndem Zombie
const TUER_SCHADEN_ZU = 2.8;  // verschlossene Zimmertüren halten länger
const BARRIKADE_SCHADEN = 2;  // Barrikade pro Sekunde und Zombie
const BRETT_STAERKE = 35;

const TICK = 50; // ms → 20 Simulationsschritte pro Sekunde
const PATCH = 100; // ms → 10 Zustands-Updates pro Sekunde an die Clients (der Client glättet dazwischen)
const SICHT_RAND = 260, SICHT_LOESEN = 220;   // Pixel um den Bildausschnitt: dort werden Zombies schon geschickt; erst so viel weiter wieder entfernt
const SICHT_VORGABE = { w: 1100, h: 700 }, SICHT_MAX = 2600, SICHT_MAX_FLUG = 6000;   // halbe Ausschnittgröße in Pixeln, bis der Client seine meldet
const EINGABE_GUTHABEN_MAX = 1.5;   // Sekunden Bewegung, die der Server nach einem Netz-Hänger nachholt
const ZWEI_PI = Math.PI * 2;
const ZOMBIE_HP = 100;   // Vorgabe; wirksam ist die Einstellung zombieLeben
const STOSS_WEG = 11;   // Schläger und Faust stoßen den Zombie etwa 1,4 m zurück (echter Maßstab 8 px/m; früher 34 px = 4 m; Waffenwerte: WAFFEN in client/welt.mjs)
const ANKUNFT_ZOMBIEFREI = 144;   // Pixel (4,5 Kacheln): so weit um den Ankunftspunkt entstehen beim ersten Betreten keine Zombies
const SCHONZEIT_EBENE = 1;   // Sekunden nach einem Ebenenwechsel, in denen Zombies nicht beißen
const BISS_PRO_SEK = 14;
const KRIECHER_CHANCE = 0.25, KRIECHER_HP = 35, KRIECHER_TEMPO = 0.28, KRIECHER_SPUERT = 110;
const UNTEN_ABSTAND = 110;   // so nah an einem am Boden liegenden Spieler halten sich Zombies nicht auf
const BISS_CHANCE = 0.12;   // pro Sekunde Kontakt: Wahrscheinlichkeit für einen infizierenden Biss
const SPRITZE_ABSTAND = 50;
const LAMPE_DAUER = 3600;   // eine Taschenlampe leuchtet etwa eine Stunde
const START_MUNITION = 24;
const DURST_DAUER = 3600, HUNGER_DAUER = 5400;   // Sekunden von voll bis leer
const SPEICHER_TAKT = 30;
const ID_MUSTER = /^[a-f0-9]{32}$/;
// Wegfeld der Zombies: geschlossene Zimmertüren zählen als Weg (sie hämmern sie auf), alles andere Blockierte nicht
const BLOCKIERT_FELD = new Set([...BLOCKIERT, T.WASSER].filter(t => t !== T.INNENTUER));
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const FERN_WEITE = 900;     // weiter als so viele px von allen Spielern weg: nur jeden FERN_TAKT-ten Takt rechnen
const FERN_TAKT = 4;
const AFK_SEKUNDEN = 60;    // so lange ohne Eingabe, dann übernimmt die Bot-Steuerung die Figur
const RASTER = 96;          // Zellgröße des Zombie-Rasters (px), je Takt neu befüllt
const WEGEFELD_TIEFE = 60;  // Wegefeld nur so viele Kacheln weit um die Spieler (2000 px) berechnen
const AUSSEHEN = /^[mwshf],[0-5],[0-7]$/;   // m/w = eigene Figur mit Farben, s = Survivor (feste Figur), h/f = Held/Heldin (Gemini, mit Farben)
export const TOR_RAETSEL = 3;
const TOR_ABSTAND = 70;

function winkelDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

export function sauberName(n) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16);
  return s || 'Unbekannt';
}

const RTC_MAX = 20000;          // größte Signalisierungsnachricht (JSON-Zeichen)
const SPRACH_PAKET_MAX = 2048;  // größtes Sprachpaket über den Server (Bytes)
const SPRACH_RATE = 60, SPRACH_BURST = 30;   // Sprachpakete je Sekunde und Absender (Eimer: Nachfüllrate, Größe)
const SPRICHT_PAUSE = 250;      // ms: höchstens 4 Wechsel je Sekunde und Spieler
const REDEN_LAERM = 200;        // px (25 m): so weit lockt Reden Zombies, wenn die Einstellung „Reden lockt“ an ist

const CHAT_MAX = 300, CHAT_VERLAUF = 100, CHAT_ANZAHL = 5, CHAT_FENSTER = 10000;

// Ausblenden in den letzten 20 s: 0 = voll sichtbar … 10 = weg (nur 10 Stufen, damit nicht jeder Takt übertragen wird)
const blassStufe = rest => rest >= 20 ? 0 : Math.max(0, Math.min(10, Math.ceil((20 - rest) / 2)));

// Spielerdaten in der Form, die lautstaerke() erwartet
const sprachDaten_ = p => ({ x: p.x, y: p.y, ebene: p.ebene ?? '', rucksack: flach(p.rucksack) });

const KLETTER_ZEIT = 0.25, KLETTER_SPRUNG = 0.3;   // s: Dagegenlaufen bis zum Sprung; Ruhe der Eingabe während des Sprungs
export class SpielRaum extends Room {
  maxClients = 10;
  // Gesendet wird direkt nach jedem PATCH/TICK-ten Simulationsschritt (siehe setSimulationInterval), damit der Zeitstempel
  // state.takt genau zu den Positionen passt. Der eingebaute Patch-Zeitgeber läuft deshalb praktisch nie (11 Tage).
  // NICHT null setzen: dann startet Colyseus einen 16-ms-Uhrtakt, und die Simulation bekäme viel zu kleine Zeitschritte.
  patchRate = 1e9;

  setSimulationInterval(cb, ms = TICK) {
    let n = 0;
    const jeder = Math.max(1, Math.round(PATCH / ms));
    return super.setSimulationInterval(dt => { cb(dt); if (++n % jeder === 0) this.broadcastPatch(); }, ms);
  }

  // vor jedem Versand: Zeitstempel, Zombie-Zahl und -Richtung (256 Stufen), Sichtbarkeit je Client
  broadcastPatch() {
    try { this.netzAbgleich(); } catch (e) { if (!this.netzFehler) { console.error('Netzabgleich:', e.message); this.netzFehler = true; } }
    return super.broadcastPatch();
  }

  netzAbgleich() {
    const s = this.state;
    if (!s?.zombies) return;
    this.startZeit ??= performance.now();
    s.takt = Math.round(performance.now() - this.startZeit) >>> 0;
    if (s.zombieZahl !== s.zombies.size) s.zombieZahl = s.zombies.size;
    // erst ab 2 Stufen (~3°) Änderung neu senden: Schwarm-Zombies zittern sonst ständig in der Richtung (der Client dreht ohnehin weich)
    const rq = o => { const r = o.richtung; if (typeof r !== 'number') return; const q = ((Math.round(r / ZWEI_PI * 256) % 256) + 256) % 256;
      const d = Math.abs(q - (o.rq ?? -9)); if (Math.min(d, 256 - d) >= 2 || o.rq === undefined) o.rq = q; };
    for (const z of s.zombies.values()) rq(z);
    if (s.menschen) for (const m of s.menschen.values()) rq(m);
    this.sichtAktualisieren();
  }

  // Zombies nur an Clients, in deren Bildausschnitt (+ Rand) sie stehen – auf derselben Ebene; mit Abstand zum Entfernen,
  // damit Zombies am Rand nicht ständig hinzukommen und wegfallen
  sichtAktualisieren() {
    const s = this.state;
    for (const c of this.clients) {
      if (!c.view) { c.view = new StateView(); c.sichtZ = new Set(); c.sichtM = new Set(); }
      const p = s.spieler.get(c.sessionId);
      if (!p) continue;
      const w = c.sicht?.w ?? SICHT_VORGABE.w, h = c.sicht?.h ?? SICHT_VORGABE.h, eb = p.ebene ?? '';
      const ax = w + SICHT_RAND, ay = h + SICHT_RAND, lx = ax + SICHT_LOESEN, ly = ay + SICHT_LOESEN;
      const kam = p.kamera ? this.extra.get(c.sessionId)?.kameraPos ?? null : null;
      const pruefe = (karte, ids, ebeneVon) => {
        if (!karte) return;
        for (const id of ids) if (!karte.has(id)) ids.delete(id);
        for (const [id, o] of karte) {
          const gleich = ebeneVon(o) === eb;
          let dx = Math.abs(o.x - p.x), dy = Math.abs(o.y - p.y);
          const k = kam;   // Kameraflug: auch rund um die Kamera senden (näherer der beiden Mittelpunkte zählt)
          if (k) { const kx = Math.abs(o.x - k.x), ky = Math.abs(o.y - k.y); if (Math.max(kx - ax, ky - ay) < Math.max(dx - ax, dy - ay)) { dx = kx; dy = ky; } }
          if (ids.has(id)) {
            if (!gleich || dx > lx || dy > ly) { c.view.remove(o); ids.delete(id); }
          } else if (gleich && dx <= ax && dy <= ay) { c.view.add(o); ids.add(id); }
        }
      };
      pruefe(s.zombies, c.sichtZ ??= new Set(), z => z.ebene ?? '');
      pruefe(s.menschen, c.sichtM ??= new Set(), m => m.sichtbar === false ? '\u0000' : (m.ebene ?? ''));   // Bewohner im Haus/Bus: nirgends sichtbar
    }
  }

  // Eingabe des Clients. Neue Form { dx, dy, s, n, d }: „d Sekunden lang so gelaufen“, laufende Nummer n – der Server arbeitet
  // die Warteschlange in Echtzeit ab (holt nach einem Netz-Hänger bis EINGABE_GUTHABEN_MAX nach) und meldet p.seq zurück.
  // Alte Form ohne n/d (Tests, ältere Clients): gilt, bis die nächste kommt.
  eingabeEmpfangen(client, m) {
    if (!m || typeof m !== 'object') return null;
    let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const x = this.extra.get(client.sessionId);
    if (!x) return null;
    x.feuerAus = m.f === false;   // Feuerknopf-Modus: Client meldet f:false, solange der Knopf nicht gehalten wird (fehlt f: wie bisher automatisch)
    const n = Number(m.n), d = Number(m.d);
    if (Number.isInteger(n) && n >= 0 && Number.isFinite(d)) {
      x.warte ??= [];
      x.warte.push({ dx, dy, s: !!m.s, d: Math.max(0, Math.min(0.25, d)), n: n & 0xffff });
      if (x.warte.length > 80) x.warte.splice(0, x.warte.length - 80);
    } else { x.warte = null; x.eingabe = { dx, dy, s: !!m.s }; }
    return { x, bewegt: Math.hypot(dx, dy) > 0.05 };
  }

  // Bewegungsstücke dieses Takts: [[eingabe, sekunden], …]
  eingabeSchritte(p, x, dt) {
    if (x.bot || !x.warte) return [[x.eingabe, dt]];
    const schritte = [];
    x.guthaben = Math.min(EINGABE_GUTHABEN_MAX, (x.guthaben ?? 0) + dt);
    while (x.warte.length && x.guthaben > 1e-4) {
      const w = x.warte[0], nimm = Math.min(w.d, x.guthaben);
      if (nimm > 0) schritte.push([w, nimm]);
      w.d -= nimm; x.guthaben -= nimm;
      x.eingabe = { dx: w.dx, dy: w.dy, s: w.s };
      if (w.d <= 1e-4) { x.warte.shift(); p.seq = w.n; }
    }
    return schritte;
  }

  // Warteschlange verwerfen (am Boden, an Bord, Ebenenwechsel …): alles gilt als verarbeitet
  eingabeVerwerfen(p, x) {
    if (!x?.warte?.length) { if (x) x.guthaben = 0; return; }
    p.seq = x.warte[x.warte.length - 1].n; x.warte.length = 0; x.guthaben = 0;
  }

  // vom Server beim Start gesetzt (nicht über Client-Optionen änderbar)
  static einstellungen = { zugangscode: '', zombieFaktor: 1, haeuserFaktor: 1, tempoFaktor: 1, bots: 0, funde: {}, zeitraffer: 1, unsterblich: new Set() };
  static speicher = null;
  static aktiv = null;   // laufender Raum (für die Verwaltungsseite)
  static testSetzen = null;      // vom Server gesetzt: speichert Testschalter (z. B. Zeitraffer) wie die Verwaltung
  static kartenWechsel = null;   // vom Server gesetzt: stellt die Karte für die nächste Welt ein (Levelwechsel)

  // läuft bei der Anfrage zum Beitreten: Zugangscode prüfen.
  // Wer über die HA-Seitenleiste (Ingress) kommt, ist schon bei HA angemeldet.
  static async onAuth(_token, optionen = {}, kontext = {}) {
    const code = SpielRaum.einstellungen.zugangscode;
    const ingress = kontext.headers?.get?.('x-ingress-path');
    if (code && !ingress && String(optionen.code ?? '').trim() !== code) throw new ServerError(403, 'Falscher Zugangscode');
    // Testzugang (Superuser): nur mit in den Einstellungen gesetztem Passwort; Fehlversuche je IP und Spieler-ID begrenzt
    const sid = ID_MUSTER.test(String(optionen.spielerId ?? '')) ? optionen.spielerId : '';
    return SU.anmelden(SpielRaum.einstellungen.superuserHash, optionen.testzugang, [kontext.ip ? 'ip:' + kontext.ip : 'ohne-ip', sid ? 'id:' + sid : '']);
  }

  async onCreate(optionen = {}) {
    this.speicher = SpielRaum.speicher;
    SpielRaum.aktiv = this;
    // „frischer Start“: jede neue Spielrunde beginnt mit einer neuen Welt (Spielerstände bleiben)
    const stand = SpielRaum.einstellungen.frischerStart ? null : (this.speicher?.ladeWelt() ?? null);
    this.state = new Zustand();
    setzeInnenFein(this.innenModus());   // vor dem Weltaufbau: der Fingerabdruck und alle Innenräume hängen davon ab
    this.optionenSetzen();
    this.tageszeitenUebernehmen();
    this.state.seed = Number.isInteger(optionen.seed) ? optionen.seed
      : stand?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const karte = SpielRaum.einstellungen.karte;
    if (karte?.kacheln) {
      setzeKartengroesse(karte.breite, karte.hoehe);
      const passtStand = stand && (stand.karte ?? '') === karte.name && stand.seed === this.state.seed;
      this.state.autos = Math.max(0, Math.min(50, Math.round(passtStand && Number.isFinite(stand.autos) ? stand.autos : (SpielRaum.einstellungen.autoFaktor ?? 1) * 10)));
      this.welt = await weltBeschaffen(karte, this.state.seed, this.state.autos / 10); this.weltFp = weltFingerabdruck(this.welt); levelorteSetzen(this.welt, karte.name);   // sofort, bevor Spielstand/Spiel die Welt verändern
      this.state.karte = karte.name;
    } else {
      setzeKartengroesse(64, 48);
      this.welt = baueWelt(this.state.seed); this.weltFp = weltFingerabdruck(this.welt);
      this.state.karte = '';
    }
    this.rnd = zufall((this.state.seed ^ 0x5bd1e995) + Date.now() % 100000);
    this.state.phase = 'spiel';
    this.state.zeit = stand?.zeit ?? 0;
    this.state.uhr = Number.isFinite(stand?.uhr) ? stand.uhr : 8 * 60;   // neue Welt beginnt morgens um acht
    this.state.besiegt = stand?.besiegt ?? 0;
    this.state.verwandelt = Math.max(0, Math.min(65535, Number(stand?.verwandelt) || 0));
    this.state.gerettet = Math.max(0, Math.min(65535, Number(stand?.gerettet) || 0));
    this.state.torGeloest = Math.min(TOR_RAETSEL, Number(stand?.torGeloest) || 0);
    this.gestellt = new Set(stand?.gestellt ?? []);
    this.offeneRaetsel = new Map();   // sessionId → { id, richtigIndex, seite, richtig, bis }

    this.inhalte = new Map();     // Behälter-Id → verbliebene Gegenstände
    this.leichenInhalt = new Map(); // Leichen-Id → Gegenstände
    this.naechsteLeichenId = 1;
    this.naechsteBodenId = 1;
    this.ebenen = new Map();      // Ebene → Innenraum-Karte (wird beim ersten Betreten gebaut)
    this.felder = new Map();      // Ebene → Wegfeld für Zombies
    this.gespeicherteTueren = {};
    this.chatVerlauf = Array.isArray(stand?.chat) ? stand.chat.slice(-CHAT_VERLAUF) : [];   // letzte Nachrichten, mit der Welt gespeichert
    this.naechsteChatId = (this.chatVerlauf.at(-1)?.id ?? 0) + 1;
    this.chatZeiten = new Map();  // sessionId → Zeitstempel der letzten Nachrichten (Flutbremse)
    this.fkVon = new WeakMap();   // Spieler → Fähigkeiten-Stand (Bots haben keinen)
    this.tausche = new Map();     // sessionId → laufender Tausch (beide Seiten zeigen auf dasselbe Objekt)
    for (const s of this.welt.safeRooms) {
      const safe = new Safe(); safe.barrikade = 0;
      this.state.safes.set(s.id, safe);
    }
    // Bundeswehr-Lager als Safe House: vier gemeinsame Vorratskisten (state.safes 'lager0'…'lager3', wie die Kiste eines Safe Rooms)
    for (const t of this.welt.stuetzpunkt?.teile ?? []) if (t.art === 'vorratskiste') this.state.safes.set(t.id, new Safe());
    const passt = stand && stand.version === WELT_VERSION && stand.seed === this.state.seed && (stand.karte ?? '') === this.state.karte;
    this.gespeichertTueren = null;
    if (passt) {
      // Spielstand mit anderem Innenraum-Modus: Zustände der Innenräume (Zimmertüren, Behälterinhalte) gehören zur alten Raumaufteilung und fallen weg
      const innenAlt = !!stand.innen !== INNEN_FEIN, imInnen = k => /^h\d+(eg|keller|dach):/.test(k);
      if (innenAlt) {
        stand.tueren = Object.fromEntries(Object.entries(stand.tueren ?? {}).filter(([k]) => !imInnen(k)));
        stand.behaelter = Object.fromEntries(Object.entries(stand.behaelter ?? {}).filter(([k]) => !imInnen(k)));
        stand.verbrannt = (stand.verbrannt ?? []).filter(k => !imInnen(String(k)));
      }
      this.gespeicherteTuerenStand = stand.tueren ?? {};
      // Haustüren: Zustand mit Barrikade, Haltbarkeit und Bruch
      for (const [key, g] of Object.entries(this.gespeicherteTuerenStand)) {
        if (!key.startsWith('haus:') || !Array.isArray(g)) continue;
        this.state.tueren.set(key, this.tuerAusStand(g, true));
      }
      for (const [id, inhalt] of Object.entries(stand.behaelter ?? {})) this.setzeInhalt(id, inhalt);
      for (const [id, s] of Object.entries(stand.safes ?? {})) {
        const safe = this.state.safes.get(id);
        if (!safe) continue;
        safe.barrikade = Math.max(0, Math.min(100, Number(s.barrikade) || 0));
        stapelLaden(safe.kiste, s.kiste, KISTE_PLAETZE, true);
      }
    }
    this.spiegleSafeTueren();

    this.extra = new Map();       // sessionId → { spielerId, letzterSafe, pause, eingabe, aktionZiel }
    this.wiederkehr = new Map();  // sessionId → Deferred der erlaubten Wiederverbindung
    this.zombieInfo = new Map();
    this.naechsteZombieId = 1;
    this.feldZeit = 0;
    this.nachspawn = 0;
    this.ersteWelle = true;
    this.erwischtSeit = 0;
    this.teamSafe = '';
    this.speicherUhr = SPEICHER_TAKT;

    // Stadtleben: Menschen, Bus, erste Zombies
    this.stadt = new Stadtleben(this);
    this.stadt.start(this.welt.karte ? (SpielRaum.einstellungen.menschen ?? 50) : 0);
    this.verkehr = new Verkehr(this);
    if (this.welt.karte) this.verkehr.start(this.stadt.haltestellen, SpielRaum.einstellungen.verkehr ?? 6);
    this.brand = new Brandstifter(this);
    this.welle = new Zombiewelle(this);
    this.aufgaben = new Aufgaben(this);
    this.aufgaben.start(stand, !!passt);
    this.finale = new Finale(this);
    this.finale.start();
    this.tageszeitenUebernehmen();   // Nachtlänge hängt vom Level ab
    this.stuetzpunkt = new Stuetzpunkt(this);
    this.stuetzpunkt.start(stand, !!passt);
    haengendStart(this);   // hängende Zombies im S-Draht (Lager, Flugfeld) und Tote am Flugfeld Königsdorf
    this.granaten = new Granaten(this);
    this.radios = new Radios(this);
    this.szeneB11 = new SzeneB11(this); this.szeneB11.start();   // „Stau auf der B11“ (nur geretsried2)
    this.hunde = new Hunde(this); this.hunde.start();   // Streuner-Hunde (Begleiter), siehe server/hund.mjs
    this.optionenSetzen();
    this.tuerAnteileUebernehmen();
    if (stand?.verbrannt && (stand.karte ?? '') === this.state.karte && stand.version === WELT_VERSION) for (const k of stand.verbrannt.slice(0, 2000)) this.state.verbrannt.set(String(k), true);

    this.onMessage('eingabe', (client, m) => {
      const r = this.eingabeEmpfangen(client, m);
      if (r?.bewegt) this.ruehrt(client.sessionId);   // der Client sendet auch im Stand alle 250 ms: nur Bewegung zählt
    });
    // halbe Größe des Bildausschnitts in Weltpixeln (je nach Bildschirm und Zoom): bestimmt, welche Zombies der Client bekommt
    this.onMessage('sicht', (client, m) => {
      const w = Number(m?.w), h = Number(m?.h);
      if (Number.isFinite(w) && Number.isFinite(h)) {
        const flug = this.state.spieler.get(client.sessionId)?.kamera && this.extra.get(client.sessionId)?.superuser;   // Kameraflug: weiter hinaus sehen
        const mx = flug ? SICHT_MAX_FLUG : SICHT_MAX;
        client.sicht = { w: Math.max(200, Math.min(mx, w)), h: Math.max(150, Math.min(mx, h)) };
      }
    });
    // jede dieser Nachrichten zeigt, dass jemand am Gerät ist (Rückkehr aus der AFK-Steuerung)
    {
      const aktiv = new Set(['aktion', 'aktion2', 'durchsuche_alle', 'fund_nimm', 'wurf', 'handel', 'handel_raetsel', 'benutze', 'nachladen', 'waffenplatz', 'platz_aktion', 'faust', 'wegwerfen', 'aufheben_wahl', 'kiste', 'kuehlschrank', 'ausruhen', 'antwort', 'fk_punkt', 'startwahl', 'tausch_start', 'tausch_anbieten', 'tausch_zurueck', 'tausch_ok', 'chat', 'spricht']);
      const om = this.onMessage.bind(this);
      this.onMessage = (typ, cb) => om(typ, aktiv.has(typ) ? (c, m) => { this.ruehrt(c.sessionId); return cb(c, m); } : cb);
    }
    this.hordeDebug = new Set();   // Superuser mit eingeschalteter Horden-Anzeige (☰-Menü oder ?debug) bekommen 'hordeInfo'
    this.hordeAus = new Set();     // Superuser, die die Anzeige ausgeschaltet haben (auch wenn die Einstellung sie für alle einschaltet)
    this.onMessage('hordeDebug', (client, m) => { if (m?.an) this.hordeDebug.add(client.sessionId); else this.hordeDebug.delete(client.sessionId); });
    this.onMessage('aussteigen', client => this.aufgaben?.aussteigen(client.sessionId));   // aus dem Evakuierungsfahrzeug aussteigen (Knopf/Taste)
    this.onMessage('aktion', client => this.starteAktion(client));
    this.onMessage('aktion2', client => this.starteAktion(client, true));
    this.onMessage('durchsuche_alle', (client, m) => this.starteAlle(client, !!m?.weiter));
    this.onMessage('fund_nimm', (client, m) => this.fundNimm(client, m));
    this.onMessage('wurf', (client, m) => this.granaten.werfen(client, m));
    this.onMessage('nachladen', client => { const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId); if (p && x && !p.unten && p.zombie <= 0 && this.state.phase === 'spiel') WP.startNachladen(this, p, x, SpielRaum.einstellungen); });
    this.onMessage('waffenplatz', (client, m) => {
      const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
      if (!p || !x || p.unten || p.zombie > 0 || this.state.phase !== 'spiel') return;
      WP.abgleich(p, x, SpielRaum.einstellungen);
      const ziel = m?.weiter ? WP.naechster(p) : Number(m?.platz);
      WP.wechsle(this, client, p, x, ziel, SpielRaum.einstellungen);
    });
    // Waffenplätze verwalten: { platz, aktion: 'rucksack' | 'fallen' | 'tausch', rs } bzw. Faust (Taste X, Knopf unter den Plätzen)
    this.onMessage('platz_aktion', (client, m) => { const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId); if (p && x) WP.platzAktion(this, client, p, x, m, SpielRaum.einstellungen); });
    this.onMessage('faust', client => { const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId); if (p && x) WP.faust(this, client, p, x, SpielRaum.einstellungen); });
    this.onMessage('handel', (client, m) => this.stuetzpunkt.handel(client, m));
    this.onMessage('handel_raetsel', (client, m) => this.stuetzpunkt.handelRaetsel(client, m));
    this.onMessage('benutze', (client, m) => this.benutze(client, m));
    this.onMessage('wegwerfen', (client, m) => this.wegwerfen(client, m));
    this.onMessage('rucksack_tausch', (client, m) => this.rucksackTausch(client, m));
    this.onMessage('aufheben_wahl', (client, m) => this.aufhebenWahl(client, m));
    this.onMessage('kiste', (client, m) => this.kiste(client, m));
    // Client meldet den Fingerabdruck seiner Welt; weicht er ab, soll er neu laden (sonst stehen Kisten/Wände woanders)
    this.onMessage('weltpruefung', (client, m) => {
      const soll = this.weltFp ??= weltFingerabdruck(this.welt);
      if (String(m?.fp ?? '') === soll) return;
      const p = this.state.spieler.get(client.sessionId);
      const k = v => String(v ?? '?').slice(0, 24);
      console.warn(`Welt weicht ab: ${p?.name ?? client.sessionId} hat ${k(m?.fp)} statt ${soll} | Gerät: Karte ${k(m?.karte)} ${k(m?.b)}×${k(m?.h)} (Datei ${k(m?.kartenB)}×${k(m?.kartenH)}), Seed ${k(m?.seed)}, Autos ${k(m?.autos)} | Server: Karte ${this.state.karte} ${BREITE}×${HOEHE}, Seed ${this.state.seed}, Autos ${this.state.autos} | ${String(m?.ua ?? '').slice(0, 140)}`);
      client.send('weltFalsch', { soll });
    });
    this.onMessage('einstellungen_spieler', (client, m) => this.einstellungenMerken(client, m));
    this.onMessage('kuehlschrank', client => this.kuehlschrank(client));
    this.onMessage('ausruhen', client => this.ausruhen(client));
    this.onMessage('antwort', (client, m) => this.antwort(client, m));
    this.onMessage('fk_punkt', (client, m) => this.fkPunkt(client, m));
    this.onMessage('startwahl', (client, m) => this.startwahl(client, m));
    this.onMessage('tausch_start', (client, m) => this.tauschStart(client, m));
    this.onMessage('tausch_anbieten', (client, m) => this.tauschAnbieten(client, m));
    this.onMessage('tausch_zurueck', (client, m) => this.tauschZurueck(client, m));
    this.onMessage('tausch_ok', client => this.tauschOk(client));
    this.onMessage('tausch_ende', client => { const t = this.tausche.get(client.sessionId); if (t) this.tauschEnde(t, 'abgebrochen'); });
    this.onMessage('chat', (client, m) => this.chat(client, m));
    this.onMessage('rtc', (client, m) => this.rtcWeiter(client, m));
    this.onMessage('spricht', (client, m) => this.sprichtSetzen(client.sessionId, !!m?.an));
    this.onMessage('sprachBereit', client => { this.sprachNeu(client.sessionId); this.sprachStart(client); this.sprachPartner(); });
    this.onMessage('sprachWeg', (client, m) => this.sprachWeg(client, m));
    this.onMessage('sprachKann', (client, m) => this.sprachKann(client, m));
    this.onMessage('_$bsprachDaten', (client, m) => this.sprachDaten(client, m));   // Binärnachrichten (sendBytes) kommen mit Vorsatz _$b
    this.onMessage('su', (client, m) => {
      const text = SU.befehl(this, client, m);
      if (text) client.send('meldung', { text });
      if (this.extra.get(client.sessionId)?.superuser) client.send('suStatus', SU.status(this, client));   // Zustand der Umschalter für das Testmenü
    });
    this.onMessage('ping', (client, m) => client.send('pong', m));

    // weltFp wird direkt nach dem Aufbau der Welt festgehalten (oben)
    this.setSimulationInterval(dt => {
      const t0 = performance.now();
      this.schritt(dt / 1000);
      this.messen('takt', t0);
    }, TICK);
    // Versand der Änderungen an die Spieler mitmessen
    const patch = this.broadcastPatch.bind(this);
    this.broadcastPatch = () => { const t0 = performance.now(); const r = patch(); this.messen('versand', t0); return r; };
  }

  setzeInhalt(id, inhalt) {
    const liste = (inhalt ?? []).filter(d => DINGE[d]);
    this.inhalte.set(id, liste);
    let b = this.state.behaelter.get(id);
    if (!b) { b = new Behaelter(); this.state.behaelter.set(id, b); }
    b.rest = liste.length;
  }

  // ---------- Beitreten, Verlassen, Speichern ----------

  onJoin(client, optionen = {}, auth = null) {
    if (optionen.aussehen) optionen = { ...optionen, aussehen: aussehenMigriert(optionen.aussehen) };   // Mann/Frau gibt es nicht mehr (m→h, w→f)
    const spielerId = ID_MUSTER.test(String(optionen.spielerId ?? '')) ? optionen.spielerId : crypto.randomBytes(16).toString('hex');
    const name = sauberName(optionen.name);

    // dieselbe Person schon da? Verbunden → ablehnen, weg → Figur übernehmen
    for (const [sid, x] of this.extra) {
      if (x.spielerId !== spielerId) continue;
      const alt = this.state.spieler.get(sid);
      if (alt?.verbunden) {   // zweites Fenster/Tab löst das alte ab: altes bekommt Hinweis und wird sauber getrennt
        const altClient = this.clients.find(c => c.sessionId === sid);
        this.sprachNeu(sid);
        try { altClient?.send('abgeloest', {}); } catch { /* egal */ }
        this.tausche.get(sid) && this.tauschEnde(this.tausche.get(sid), 'abgebrochen');
        this.offeneRaetsel.delete(sid);
        setTimeout(() => { try { altClient?.leave(); } catch { /* schon weg */ } }, 300);
      }
      this.wiederkehr.get(sid)?.reject?.(new Error('übernommen'));
      this.wiederkehr.delete(sid);
      this.state.spieler.delete(sid);
      this.extra.delete(sid);
      alt.name = name; alt.verbunden = true; alt.su = !!auth?.su;
      if (optionen.aussehenGewaehlt !== false && AUSSEHEN.test(String(optionen.aussehen ?? ''))) alt.aussehen = optionen.aussehen;
      this.state.spieler.set(client.sessionId, alt);
      this.extra.set(client.sessionId, { ...x, eingabe: { dx: 0, dy: 0, s: false }, afkBot: null, letzteEingabe: Date.now(), superuser: !!auth?.su, suUnsterblich: !!auth?.su && x.suUnsterblich }); alt.afk = false;
      this.hunde?.besitzerWechsel(sid, client.sessionId);
      this.suAnmeldung(client, alt, auth);
      client.send('chatVerlauf', { nachrichten: this.chatVerlauf, ich: this.chatKennung(client.sessionId) });
      client.send('baumTempo', SpielRaum.einstellungen.baumTempo ?? 25);
      this.startwahlSenden(client.sessionId);
      this.einstellungenSenden(client, spielerId, alt.aussehen, optionen.aussehenGewaehlt !== false && AUSSEHEN.test(String(optionen.aussehen ?? '')));
      this.sprachStart(client); this.sprachPartner();
      return;
    }

    const p = new Spieler();
    p.name = name;
    p.farbe = this.freieFarbe();
    const vorschau = AUSSEHEN.test(String(optionen.aussehen ?? ''));
    const gewaehlt = vorschau && optionen.aussehenGewaehlt !== false;   // false: Spieler hat in der Anmeldung nichts gewählt, nur die Vorschau
    const gemerkt = aussehenMigriert(this.speicher?.ladeEinstellungen(spielerId)?.zob_aussehen);   // von einem anderen Gerät
    p.aussehen = gewaehlt ? optionen.aussehen : AUSSEHEN.test(String(gemerkt ?? '')) ? gemerkt : vorschau ? optionen.aussehen : this.zufallsAussehen();
    p.verbunden = true; p.unten = false; p.afk = false; p.hilfe = 0; p.richtung = 0;
    p.schleicht = false; p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0; p.spricht = false;
    const extra = { superuser: !!auth?.su, spielerId, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null, letzteEingabe: Date.now() };
    const gespeichert = this.speicher?.ladeSpieler(spielerId);
    if (gespeichert) {
      p.hp = Math.max(25, Math.min(100, Number(gespeichert.hp) || 100));
      p.durst = Math.max(20, Math.min(100, Number(gespeichert.durst) || 100));
      p.hunger = Math.max(20, Math.min(100, Number(gespeichert.hunger) || 100));
      p.waffe = DINGE[gespeichert.waffe]?.waffe ? gespeichert.waffe : '';
      p.munition = Math.max(0, Math.min(MUNITION_MAX, Number(gespeichert.munition) || 0));
      p.pfeile = Math.max(0, Math.min(PFEILE_MAX, Number(gespeichert.pfeile) || 0));
      p.granaten = Math.max(0, Math.min(GRANATEN_MAX, Number(gespeichert.granaten) || 0));
      p.handgranaten = Math.max(0, Math.min(HANDGRANATEN_MAX, Number(gespeichert.handgranaten) || 0));
      p.besiegt = Math.max(0, Math.min(65535, Number(gespeichert.besiegt) || 0));
      if (!gewaehlt && !AUSSEHEN.test(String(gemerkt ?? '')) && AUSSEHEN.test(aussehenMigriert(gespeichert.aussehen))) p.aussehen = aussehenMigriert(gespeichert.aussehen);
      p.infektion = Math.max(0, Math.min(INFEKTION_DAUER, Number(gespeichert.infektion) || 0));
      p.kleidung = Math.max(0, Math.min(100, Number(gespeichert.kleidung) || 0));
      p.lampe = Math.max(0, Math.min(LAMPE_DAUER, Number(gespeichert.lampe) || 0));
      p.plaetze = [8, 12, 16].includes(Number(gespeichert.plaetze)) ? Number(gespeichert.plaetze) : RUCKSACK_PLAETZE;
      extra.fk = FK.normiere(gespeichert.fk);
      extra.munSerie = Math.max(0, Math.min(50, Number(gespeichert.munSerie) || 0));
      WP.lade(p, extra, gespeichert);
      extra.startOffen = this.state.level === 1 && !!gespeichert.startOffen;   // Startwahl noch nicht getroffen
      p.plaetze += FK.wirkung.rucksack(extra.fk);
      stapelLaden(p.rucksack, gespeichert.rucksack, p.plaetze);
      for (const d of extra.ueberlauf ?? []) fuegeHinzu(p.rucksack, p.plaetze, d);   // ehemaliger dritter Waffenplatz
      delete extra.ueberlauf;
      extra.letzterSafe = gespeichert.letzterSafe ?? '';
      // gespeichert wird nur im Safe Room: dort (im Innenraum) geht es weiter; sonst im letzten Safe Room
      // ohne gespeicherten Ort (neues Level): alle im selben Start-Safe-House
      const safe = !extra.letzterSafe && !Number.isFinite(gespeichert.x) && this.startSafe() || this.safeFuer(extra.letzterSafe, gespeichert.x, gespeichert.y);
      // Abmeldung im Bundeswehr-Lager: genau dort wieder einsteigen, solange das Lager steht; sonst Rückfall auf den nächsten Safe Room
      const imLagerAbgemeldet = gespeichert.lager === true && Number.isFinite(gespeichert.x) && this.state.stuetzpunkt === 'steht' && !!this.welt.stuetzpunkt && imLager(this.welt.stuetzpunkt, gespeichert.x, gespeichert.y);
      const pos = imLagerAbgemeldet ? { ...this.freierPlatz({ x: gespeichert.x, y: gespeichert.y }, this.state.spieler.size), ebene: '' }
        : safe ? this.safePlatz(safe, this.state.spieler.size) : { ...this.freierPlatz(this.welt.start), ebene: '' };
      p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
    } else {
      p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
      extra.startOffen = this.state.level === 1;   // neuer Spielstand in Level 1: erst Startwahl (Punkte + Gegenstand)
      // neues Level (ab Level 2): auch neue Spieler beginnen im gemeinsamen Start-Safe-House
      const startSafe = this.state.level > 1 ? this.startSafe() : null;
      const pos = startSafe ? this.safePlatz(startSafe, this.state.spieler.size) : this.freierPlatz(this.welt.start, this.state.spieler.size);
      p.x = pos.x; p.y = pos.y; if (startSafe) p.ebene = pos.ebene;
      const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe === 'pistole').length;
      if (bewaffnet < bewaffnetSoll(this.state.spieler.size + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; p.pfeile = 0; }
      else { p.waffe = ''; p.munition = 0; p.pfeile = 0; }
      p.granaten = 0; p.handgranaten = 0; p.faust = false;
      p.rucksack.push('wasser');
    }
    if (!gespeichert) WP.lade(p, extra, null);
    if (!extra.fk) { extra.fk = FK.neuerStand(); }
    this.fkVon.set(p, extra.fk);
    p.su = !!auth?.su;
    this.state.spieler.set(client.sessionId, p);
    this.extra.set(client.sessionId, extra);
    this.hunde?.beitritt(client.sessionId, p, extra, gespeichert);
    this.suAnmeldung(client, p, auth);
    this.speichereSpieler(client.sessionId);
    this.fkSenden(client.sessionId);
    this.startwahlSenden(client.sessionId);
    client.send('chatVerlauf', { nachrichten: this.chatVerlauf });
    client.send('baumTempo', SpielRaum.einstellungen.baumTempo ?? 25);
    this.einstellungenSenden(client, spielerId, p.aussehen, gewaehlt);
    this.broadcast('meldung', { text: `${p.name} ist dabei` }, { except: client });
    this.botsAnpassen();
    this.sprachStart(client); this.sprachPartner();
  }

  // ---------- Spieler-Einstellungen (je Spieler-ID in der Datenbank, gelten auf jedem Gerät) ----------
  // Beim Beitritt: gemerkte Werte schicken; das gewählte/aktuelle Aussehen gilt dabei als Einstellung
  einstellungenSenden(client, spielerId, aussehen, gewaehlt) {
    const werte = einstellungenBereinigen(this.speicher?.ladeEinstellungen(spielerId));
    if (AUSSEHEN.test(String(aussehen ?? '')) && (gewaehlt || !werte.zob_aussehen) && werte.zob_aussehen !== aussehen) {
      werte.zob_aussehen = aussehen;
      try { this.speicher?.speichereEinstellungen(spielerId, werte); } catch { /* egal */ }
    }
    client.send('einstellungen_spieler', { werte });
  }

  einstellungenMerken(client, m) {
    const x = this.extra.get(client.sessionId);
    if (!x?.spielerId || !this.speicher) return;
    const jetzt = Date.now();
    if (x.einstSeit && jetzt - x.einstSeit < 150) return;   // nicht öfter als nötig
    x.einstSeit = jetzt;
    const neu = einstellungenBereinigen(m?.werte);
    if (!Object.keys(neu).length) return;
    this.speicher.speichereEinstellungen(x.spielerId, { ...einstellungenBereinigen(this.speicher.ladeEinstellungen(x.spielerId)), ...neu });
    // Aussehen gilt erst beim nächsten Beitritt (während des Spiels ändert es der Spieler nicht)
  }

  // ---------- Sprachübertragung (WebRTC-Signalisierung; die Sprache selbst läuft direkt zwischen den Browsern) ----------
  sprachEinst() {
    const sp = SpielRaum.einstellungen.sprache ?? {};
    return { an: sp.an !== false, hoerweite: sp.hoerweite ?? 40, stockwerk: sp.stockwerk ?? 0.35, drinnenDraussen: sp.drinnenDraussen ?? 0.10, funk: sp.funk ?? 0.7, redenLockt: !!sp.redenLockt };
  }

  // nur an den neuen Client: ICE-Server und Sprach-Einstellungen
  sprachStart(client) {
    client.send('sprachStart', { ice: SpielRaum.einstellungen.ice ?? [], einst: this.sprachEinst() });
  }

  // alle verbundenen Menschen (keine Bots, keine abgerissenen Verbindungen)
  sprachPartner() {
    const ids = [];
    for (const [sid, p] of this.state.spieler) if (!this.extra.get(sid)?.bot && p.verbunden) ids.push(sid);
    this.broadcast('sprachPartner', { ids });
  }

  // Signalisierung: nur an genau einen verbundenen Menschen weiterreichen
  rtcWeiter(client, m) {
    const an = String(m?.an ?? '');
    const von = client.sessionId;
    if (!an || an === von || !this.sprachEinst().an) return;
    if (this.extra.get(von)?.bot || this.extra.get(an)?.bot || !this.state.spieler.get(an)?.verbunden) return;
    let groesse = Infinity;
    try { groesse = JSON.stringify(m.daten ?? null).length; } catch { /* zirkulär o. ä. */ }
    if (groesse > RTC_MAX) return;
    this.clients.find(c => c.sessionId === an)?.send('rtc', { von, daten: m.daten });
  }

  // ---------- Sprache über den Server (Ausweichweg, wenn die direkte WebRTC-Verbindung eines Paars nicht zustande kommt) ----------
  // Paar auf Server-Weg: x.serverPartner (Set von sessionIds, symmetrisch). Binärpaket: siehe client/sprache_kodierung.mjs.
  sprachNr(sid) {
    const x = this.extra.get(sid);
    if (!x) return 0;
    if (x.sprachNr) return x.sprachNr;
    const belegt = new Set([...this.extra.values()].map(e => e.sprachNr));
    let n = (this.sprachZaehler = ((this.sprachZaehler ?? 0) % 255) + 1);
    for (let i = 0; i < 255 && belegt.has(n); i++) n = n % 255 + 1;
    return x.sprachNr = n;
  }

  // Beitritt (neue Seite) oder Verlassen: alle Server-Paare des Spielers lösen, die anderen erfahren es (dann wieder WebRTC)
  sprachNeu(sid) {
    for (const [anderer, y] of this.extra) {
      if (anderer === sid || !y.serverPartner?.delete(sid)) continue;
      this.clients.find(c => c.sessionId === anderer)?.send('sprachWeg', { mit: sid, server: false });
      this.sprachFormatMelden(anderer);
    }
    const x = this.extra.get(sid);
    if (x?.serverPartner?.size) { x.serverPartner.clear(); this.sprachFormatMelden(sid); }
  }

  sprachWeg(client, m) {
    const von = client.sessionId, mit = String(m?.mit ?? '');
    const x = this.extra.get(von), y = this.extra.get(mit);
    if (!x || !y || x.bot || y.bot || von === mit || !m?.server || !this.sprachEinst().an) return;
    if (!this.state.spieler.get(mit)?.verbunden) return;
    (x.serverPartner ??= new Set()).add(mit);
    (y.serverPartner ??= new Set()).add(von);
    client.send('sprachWeg', { mit, server: true, nr: this.sprachNr(mit) });
    this.clients.find(c => c.sessionId === mit)?.send('sprachWeg', { mit: von, server: true, nr: this.sprachNr(von) });
    this.sprachFormatMelden(von); this.sprachFormatMelden(mit);
  }

  sprachKann(client, m) {
    const x = this.extra.get(client.sessionId);
    if (!x || x.bot) return;
    x.kannOpus = m?.opus === true;
    // auch die Formate derer neu prüfen, die diesen Client als Server-Partner haben
    this.sprachFormatMelden(client.sessionId);
    for (const anderer of x.serverPartner ?? []) this.sprachFormatMelden(anderer);
  }

  // Format je Absender: Opus nur, wenn er selbst und alle seine Server-Partner Opus können; sonst μ-law
  sprachFormatMelden(sid) {
    const x = this.extra.get(sid);
    if (!x || x.bot) return;
    let format = x.kannOpus ? 0 : 1;
    for (const q of x.serverPartner ?? []) if (!this.extra.get(q)?.kannOpus) format = 1;
    if (x.sprachFormat === format) return;
    x.sprachFormat = format;
    this.clients.find(c => c.sessionId === sid)?.send('sprachFormat', { format });
  }

  // Binärpaket eines Spielers an seine Server-Partner in Hörweite (oder per Funk)
  sprachDaten(client, bytes) {
    const t0 = performance.now();
    const von = client.sessionId, x = this.extra.get(von);
    if (!x || x.bot || !x.serverPartner?.size || !bytes?.length || bytes.length > SPRACH_PAKET_MAX) return;
    const einst = this.sprachEinst();
    if (!einst.an) return;
    const e = x.sprachEimer ??= { n: SPRACH_BURST, t: t0 };   // Eimer: SPRACH_RATE Pakete/s, kurze Spitzen bis SPRACH_BURST
    e.n = Math.min(SPRACH_BURST, e.n + (t0 - e.t) * SPRACH_RATE / 1000); e.t = t0;
    if (e.n < 1) return;
    e.n -= 1;
    if (bytes[0] !== 0 && bytes[0] !== 1) return;   // unbekanntes Format
    const ich = this.state.spieler.get(von);
    if (!ich?.verbunden) return;
    let paket = null;
    for (const ziel of x.serverPartner) {
      const y = this.extra.get(ziel), er = this.state.spieler.get(ziel);
      if (!y || y.bot || !er?.verbunden) continue;
      const l = lautstaerke(sprachDaten_(er), sprachDaten_(ich), this.welt, einst);   // wie laut hört der Empfänger den Sprecher
      if (!(l.nah > 0.01 || l.funk > 0.01)) continue;
      const c = this.clients.find(k => k.sessionId === ziel);
      if (!c) continue;
      if (!paket) { paket = new Uint8Array(bytes.length + 1); paket[0] = this.sprachNr(von); paket.set(bytes, 1); }
      c.sendBytes('sprachDaten', paket);
    }
    this.messen('sprache', t0);
  }

  sprichtSetzen(sid, an) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || x.bot) return;
    if (an && !this.sprachEinst().an) an = false;
    const jetzt = Date.now();
    if (jetzt - (x.sprichtZeit ?? 0) < SPRICHT_PAUSE) { x.sprichtOffen = an; return; }   // zu schnell: später (im Takt) nachholen
    x.sprichtOffen = undefined; x.sprichtZeit = jetzt;
    p.spricht = an;
  }

  // im Takt: aufgeschobene Wechsel nachholen, Reden lockt Zombies
  sprachSchritt(dt) {
    const jetzt = Date.now();
    for (const [sid, x] of this.extra) {
      if (x.sprichtOffen !== undefined && jetzt - (x.sprichtZeit ?? 0) >= SPRICHT_PAUSE) this.sprichtSetzen(sid, x.sprichtOffen);
    }
    this.redenUhr = (this.redenUhr ?? 0) - dt;
    if (this.redenUhr > 0) return;
    this.redenUhr = 0.5;
    const sp = this.sprachEinst();
    if (!sp.an || !sp.redenLockt) return;
    for (const [sid, p] of this.state.spieler) {
      if (!p.spricht || !p.verbunden || this.extra.get(sid)?.bot) continue;
      this.laerm(p.x, p.y, REDEN_LAERM, false, p.ebene);
    }
  }

  // Text-Chat für alle im Raum, unabhängig von der Entfernung
  // Kurzkennung des Absenders (aus der Spieler-ID abgeleitet, die ID selbst geht nicht an andere – sonst könnte man Figuren übernehmen)
  chatKennung(sid) {
    const id = this.extra.get(sid)?.spielerId ?? sid;
    return crypto.createHash('sha256').update('chat:' + id).digest('hex').slice(0, 12);
  }

  chat(client, m) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || x.bot) return;
    const text = String(m?.text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, CHAT_MAX).trim();
    if (!text) return;
    const jetzt = Date.now();
    const zeiten = (this.chatZeiten.get(client.sessionId) ?? []).filter(z => jetzt - z < CHAT_FENSTER);
    if (zeiten.length >= CHAT_ANZAHL) { this.chatZeiten.set(client.sessionId, zeiten); client.send('meldung', { text: 'Langsam – zu viele Nachrichten' }); return; }
    zeiten.push(jetzt); this.chatZeiten.set(client.sessionId, zeiten);
    let ort = 'draußen';
    const safe = safeRoomVon(this.welt, p);
    if (safe) ort = '🛡 ' + safe.name;
    else if (p.ebene) {
      const e = EBENE_MUSTER.exec(p.ebene);
      ort = (e && this.welt.haeuser?.[Number(e[1])]?.name) || 'in einem Haus';
    }
    const nachricht = { id: this.naechsteChatId++, von: this.chatKennung(client.sessionId), name: p.name, farbe: p.farbe, zeit: jetzt, text, ort };
    this.chatVerlauf.push(nachricht);
    if (this.chatVerlauf.length > CHAT_VERLAUF) this.chatVerlauf.splice(0, this.chatVerlauf.length - CHAT_VERLAUF);
    this.broadcast('chat', nachricht);
    botBefehl(this, client.sessionId, text);   // Befehle an die Bots („Resi, hol wasser“), siehe botplan.mjs
  }

  // AFK: Wer AFK_SEKUNDEN lang nichts getan hat, wird von der Bot-Steuerung gespielt (x.afkBot, p.afk) – bis zur nächsten Eingabe
  ruehrt(sid) {
    const x = this.extra.get(sid);
    if (!x || x.bot) return;
    x.letzteEingabe = Date.now();
    if (x.afkBot) {
      x.afkBot = null; x.eingabe = { dx: 0, dy: 0, s: false };
      const p = this.state.spieler.get(sid);
      if (p) { p.afk = false; this.broadcast('meldung', { text: `${p.name} ist wieder da` }); }
    }
  }

  afkPruefen(sid, p, x) {
    if (p.verbunden === false) {   // Verbindung weg: die Figur steht still und wartet (siehe onDrop)
      if (x.afkBot) { x.afkBot = null; p.afk = false; x.eingabe = { dx: 0, dy: 0, s: false }; }
      return;
    }
    if (x.afkBot) return;
    x.letzteEingabe ??= Date.now();
    if (Date.now() - x.letzteEingabe < (this.afkSekunden ?? AFK_SEKUNDEN) * 1000) return;
    x.afkBot = { nr: 0, afk: true, plan: { rolle: 'begleiter', auftrag: null, pause: 0 } };
    this.eingabeVerwerfen(p, x);
    p.afk = true; p.spricht = false;
    this.broadcast('meldung', { text: `🤖 ${p.name} ist untätig – ein Bot übernimmt die Figur` });
  }

  // Simulierte Mitspieler: bei einem Menschen so viele wie eingestellt, jeder weitere Mensch ersetzt einen
  botsAnpassen() {
    const menschen = [...this.extra.values()].filter(x => !x.bot).length;
    const botIds = [...this.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => sid);
    const soll = menschen > 0 ? Math.max(0, (SpielRaum.einstellungen.bots || 0) + 1 - menschen) : 0;
    while (botIds.length > soll) {
      const sid = botIds.pop();
      this.state.spieler.delete(sid); this.extra.delete(sid);
    }
    let n = 0;
    while (botIds.length < soll && n++ < 20) {
      const belegt = new Set([...this.state.spieler.values()].map(s => s.name));
      const name = BOT_NAMEN.find(b => !belegt.has(b + ' 🤖')) ?? 'Bot';
      const sid = 'bot-' + (this.naechsteBotId = (this.naechsteBotId ?? 0) + 1);
      const p = new Spieler();
      p.name = name + ' 🤖'; p.farbe = this.freieFarbe(); p.aussehen = this.zufallsAussehen();
      p.verbunden = true; p.unten = false; p.hilfe = 0; p.richtung = 0; p.schleicht = false;
      p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0;
      p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
      // in die Nähe des ersten Menschen
      const mensch = [...this.state.spieler.entries()].find(([s]) => !this.extra.get(s)?.bot)?.[1];
      const pos = this.freierPlatz(mensch ?? this.welt.start, this.state.spieler.size, mensch?.ebene ?? '');
      p.x = pos.x; p.y = pos.y; p.ebene = mensch?.ebene ?? '';   // drinnen (z. B. im Start-Safe-House) gleich dort
      const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe === 'pistole').length;
      if (bewaffnet < bewaffnetSoll(this.state.spieler.size + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; p.pfeile = 0; }
      else { p.waffe = ''; p.munition = 0; p.pfeile = 0; }
      p.granaten = 0; p.handgranaten = 0; p.faust = false;
      p.rucksack.push('wasser'); p.rucksack.push('essen');
      this.state.spieler.set(sid, p);
      const bx = { spielerId: null, bot: { nr: botIds.length }, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null };
      WP.lade(p, bx, null);
      this.botStart(p, bx);
      this.extra.set(sid, bx);
      botIds.push(sid);
    }
  }

  zufallsAussehen() {
    const r = this.rnd();
    return `${r < 0.2 ? 's' : r < 0.6 ? 'h' : 'f'},${Math.floor(this.rnd() * 6)},${Math.floor(this.rnd() * 8)}`;
  }

  freieFarbe() {
    const belegt = new Set([...this.state.spieler.values()].map(s => s.farbe));
    for (let i = 0; i < 10; i++) if (!belegt.has(i)) return i;
    return Math.floor(this.rnd() * 10);
  }

  // freier Platz in der Nähe eines Punkts (für mehrere Spieler leicht versetzt)
  freierPlatz(ort, n = 0, ebene = '') {
    const welt = this.wv(ebene);
    for (let ring = 0; ring < 8; ring++) {
      for (let i = 0; i < 8; i++) {
        const w = (n + i) * 2.4, d = (ring === 0 && i === 0 && n === 0 ? 0 : 18 + ring * 14) * (welt.reich ?? 1);
        const x = ort.x + Math.cos(w) * d, y = ort.y + Math.sin(w) * d;
        if (frei(welt, x, y, W.spielerRadius)) return { x, y };
      }
    }
    return { ...this.welt.start };
  }

  // freier Platz im Innenraum eines Safe Rooms (n: für mehrere Spieler leicht versetzt)
  safePlatz(safe, n = 0) {
    const w = this.wv(safe.ebene);
    return { ...this.freierPlatz(w.start, n, safe.ebene), ebene: safe.ebene };
  }

  // Gemeinsames Start-Safe-House der Welt: zufällig, aber nur vom Seed abhängig – alle Spieler und Bots bekommen dasselbe
  startSafe() {
    const l = this.welt.safeRooms;
    if (!l?.length) return null;
    return l[Math.floor(zufall((this.state.seed ^ 0x5afe51) >>> 0)() * l.length)];
  }

  safeFuer(id, x, y) {
    const s = this.welt.safeRooms.find(r => r.id === id);
    if (s) return s;
    let best = this.welt.safeRooms[0], bd = Infinity;
    for (const r of this.welt.safeRooms) {
      const d = Number.isFinite(x) ? Math.hypot(r.vorTuer.x - x, r.vorTuer.y - y) : 0;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  onDrop(client) {
    // Verbindung weg: Figur bleibt 2 Minuten stehen und wartet
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;   // Beitritt wurde abgelehnt – nichts zu halten
    p.verbunden = false; p.aktion = ''; p.spricht = false;
    this.sprachPartner();
    const x = this.extra.get(client.sessionId);
    if (x) x.eingabe = { dx: 0, dy: 0, s: false };
    const zusage = this.allowReconnection(client, 120);
    // läuft die Zeit ab oder wird die Figur übernommen, ist das kein Fehler
    zusage?.catch?.(() => {});
    zusage?.promise?.catch?.(() => {});
    this.wiederkehr.set(client.sessionId, zusage);
  }

  onReconnect(client) {
    this.wiederkehr.delete(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (p) p.verbunden = true;
    this.ruehrt(client.sessionId);
    this.sprachStart(client); this.sprachPartner();
  }

  onLeave(client) {
    this.wiederkehr.delete(client.sessionId);
    const tausch = this.tausche.get(client.sessionId);
    if (tausch) this.tauschEnde(tausch, 'abgebrochen');
    this.offeneRaetsel.delete(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;
    this.speichereSpieler(client.sessionId);
    const text = p.sicher ? `${p.name} ruht sich aus` : `${p.name} hat sich versteckt`;
    this.broadcast('meldung', { text });
    this.state.spieler.delete(client.sessionId);
    this.sprachNeu(client.sessionId);
    this.extra.delete(client.sessionId);
    this.hunde?.spielerWeg(client.sessionId);
    this.botsAnpassen();
    this.sprachPartner();
  }

  onDispose() {
    if (!this.nichtSpeichern) this.speichereAlles();
    if (SpielRaum.aktiv === this) SpielRaum.aktiv = null;
  }

  // von der Verwaltungsseite: neue Werte gelten sofort
  // Spielerzahl für die Zombiemengen: echte Spieler + 0,5 × Bots
  spielerZahl() {
    let n = 0;
    for (const sid of this.state.spieler.keys()) n += this.extra?.get(sid)?.bot ? 0.5 : 1;
    return Math.max(0.5, n);
  }

  // Zeile der Level-Tabelle (Einstellung zombies.level) für das aktuelle Level; fehlende Werte aus der Vorgabe
  levelEinst(level = this.state?.level || 1) {
    const i = Math.max(0, Math.min(LEVEL_VORGABE.length - 1, Math.floor(Number(level) || 1) - 1));
    return { ...LEVEL_VORGABE[i], ...(SpielRaum.einstellungen.zombiesLevel?.[i] ?? {}) };
  }

  // Zombies draußen = (Grund + je Spieler × Spielerzahl) × Nacht × Ausbruch × Tag-Bonus × Regler (Level-Tabelle, siehe LEVEL_VORGABE)
  zombieSollJetzt() {
    const e = SpielRaum.einstellungen, lv = this.levelEinst();
    // this.zombieFaktor: Vorgabe nur für diesen Raum (Tests), sonst der Prüfhaken der Einstellung
    // solange viele Menschen gesund sind, kommen weniger Zombies aus dem Umland – die Gefahr wächst mit dem Ausbruch
    const ausbruch = this.stadt?.anfangs ? 0.6 + 0.4 * (1 - this.stadt.ruheAnteil()) : 1;
    return Math.round((lv.grund + lv.jeSpieler * this.spielerZahl()) * (this.zombieFaktor ?? e.zombieFaktor ?? 1) * (istNacht(this.state.uhr) ? (e.nachtFaktor ?? 1.5) : 1) * ausbruch * this.schwierigkeit().dichte);
  }

  // Taschenlampe nötig: drinnen in dunklen Häusern (Keller immer), draußen nachts
  brauchtLicht(p) {
    if (!p.ebene) return istNacht(this.state.uhr);
    if (safeRoomVon(this.welt, p)) return false;   // Safe Rooms haben Notlicht
    const m = EBENE_MUSTER.exec(p.ebene);
    return !m || !hausHell(Number(m[1]), m[2], this.state.uhr);
  }

  // Nebel (Wetterlage): würfelt morgens/abends, schreibt die Dichte in den Zustand (nur in 0,02-Stufen, damit nicht jeder Takt übertragen wird)
  nebelSchritt() {
    const s = this.state, e = SpielRaum.einstellungen?.nebel ?? NEBEL_VORGABE;
    this.nebel ??= new Nebel();
    const d = this.nebel.schritt(s.uhr, e, s.tagAb, s.nachtAb);
    const q = Math.round(d * 50) / 50;
    if (q !== s.nebel) {
      const kam = s.nebel < 0.05 && q >= 0.05;
      s.nebel = q;
      if (kam && q < 0.2) this.broadcast('meldung', { text: '🌫 Nebel zieht auf – die Sicht wird schlecht', lang: true });
    }
  }

  // Sicht der Zombies im Nebel (1 = unverändert); Hören bleibt gleich
  nebelSichtFaktor() { return zombieSichtFaktor(this.state.nebel, (SpielRaum.einstellungen?.nebel ?? NEBEL_VORGABE).zombie); }

  // Tag/Nacht-Zeiten aus den Einstellungen: für die Regeln auf dem Server und im Zustand für die Clients
  tageszeitenUebernehmen() {
    const e = SpielRaum.einstellungen ?? {};
    // Nachtlänge × Schwierigkeit: die Nacht beginnt früher (Faktor 1 = Einstellung unverändert)
    const tagAb = e.tagAb ?? 420, nachtAb0 = e.nachtAb ?? 1290;
    const f = this.state ? this.schwierigkeit().nacht : 1;
    const nachtAb = f === 1 ? nachtAb0 : Math.max(tagAb + 360, Math.round(nachtAb0 - (f - 1) * (1440 - nachtAb0 + tagAb)));
    setzeTageszeiten(tagAb, nachtAb);
    if (this.state) { this.state.tagAb = tagAb; this.state.nachtAb = nachtAb; this.state.nachtDunkel = e.nachtDunkel ?? 92; this.state.nebelSicht = (e.nebel ?? NEBEL_VORGABE).sicht; this.state.menschenGroesse = e.menschenGroesse ?? 100; this.state.zombieGroesse = e.zombieGroesse ?? 100; this.state.groesseGesamt = e.groesseGesamt ?? 70; }
    const bt = e.baumTempo ?? 25;   // Tempo unter Bäumen (%): kein Schema-Feld mehr frei (Grenze 63), der Client bekommt es als Nachricht
    if (bt !== this.baumTempoSend) { this.baumTempoSend = bt; try { this.broadcast('baumTempo', bt); } catch { /* noch kein Raum */ } }
  }

  // Bits: 1 Sichtkegel, 2 maßstäbliche Innenräume, 4–128 Tempo drinnen in 2-%-Schritten (Vorgabe 35 % → 17)
  optionenSetzen() {
    const tempo = Math.max(5, Math.min(50, Math.round((SpielRaum.einstellungen?.innenTempo ?? 35) / 2)));
    setzeInnenTempo(tempo * 2 / 100);
    this.state.optionen = (SpielRaum.einstellungen?.sichtkegel ? 1 : 0) | (INNEN_FEIN ? 2 : 0) | (tempo << 2);
  }

  // „Maßstäbliche Innenräume“: Einstellung aus der Verwaltung oder Umgebungsvariable ZOMBIES_INNEN1M=1
  innenModus() { return !!process.env.ZOMBIES_INNEN1M || !!SpielRaum.einstellungen?.innenMassstab; }

  // Der Innenraum-Modus wurde umgeschaltet (laufende Welt): alles, was in Innenräumen ist, kommt an die Haustür (Safe Rooms: an den Start des
  // neuen Raums); Zimmertüren, Behälterinhalte, Zombies, Leichen, Bodengegenstände und versteckte Bewohner der alten Räume fallen weg
  innenUmschalten() {
    const an = this.innenModus(), s = this.state;
    const imInnen = k => /^h\d+(eg|keller|dach):/.test(String(k));
    const vorher = new Map();   // Spieler → Haus, in dem er war
    for (const [sid, p] of s.spieler) if (p.ebene) { const m = EBENE_MUSTER.exec(p.ebene); vorher.set(sid, m ? Number(m[1]) : null); }
    setzeInnenFein(an); this.optionenSetzen();
    this.weltFp = weltFingerabdruck(this.welt);
    for (const [id, z] of [...s.zombies]) if (z.ebene) { s.zombies.delete(id); this.zombieInfo.delete(id); }
    for (const [id, l] of [...s.leichen]) if (l.ebene) { s.leichen.delete(id); this.leichenInhalt?.delete(id); }
    for (const [id, b] of [...s.boden]) if (b.ebene) s.boden.delete(id);
    for (const k of [...s.tueren.keys()]) if (imInnen(k)) s.tueren.delete(k);
    for (const k of [...s.behaelter.keys()]) if (imInnen(k)) s.behaelter.delete(k);
    for (const k of [...this.inhalte.keys()]) if (imInnen(k)) this.inhalte.delete(k);
    for (const k of [...s.verbrannt.keys()]) if (imInnen(k)) s.verbrannt.delete(k);
    for (const [id, m] of [...s.menschen]) if (m.ebene && m.versteckt) { s.menschen.delete(id); this.stadt?.info?.delete(id); }
    this.stadt?.hausFertig?.clear();
    this.ebenen.clear(); this.felder.clear();
    for (const [sid, nr] of vorher) {
      const p = s.spieler.get(sid), x = this.extra.get(sid);
      if (!p) continue;
      const safe = this.welt.safeRooms.find(r => r.ebene === p.ebene);
      let pos;
      if (safe) pos = this.safePlatz(safe, 0);
      else {
        const h = nr !== null ? this.welt.haeuser[nr] : null, r = h?.raus ?? { dx: 0, dy: 1 };
        const vor = h ? { x: (h.tuer.x + 0.5 + r.dx * 1.3) * KACHEL, y: (h.tuer.y + 0.5 + r.dy * 1.3) * KACHEL } : this.welt.start;
        pos = { ...this.freierPlatz(vor, 0, ''), ebene: '' };
      }
      p.ebene = pos.ebene ?? ''; p.x = pos.x; p.y = pos.y; p.aktion = ''; p.fortschritt = 0;
      if (x) { x.ankunft = null; x.aktionZiel = null; this.eingabeVerwerfen(p, x); if (x.bot) { x.bot.weg = null; x.bot.uebergangZiel = null; } }
    }
    // Aufgaben-Plan (Missionsorte hängen von den Behältern der Erdgeschosse ab) neu berechnen, Abgaben und Hinweise bleiben
    if (this.aufgaben?.planKey) { this.aufgaben.planen(this.aufgaben.speichern()?.mission ?? null); }
    this.broadcast('meldung', { text: an ? '🏠 Innenräume jetzt maßstäblich' : '🏠 Innenräume wieder im alten Maßstab' });
  }

  einstellungenGeaendert() {
    this.tageszeitenUebernehmen();
    this.botsAnpassen();
    const sprache = this.sprachEinst();
    if (!sprache.an) for (const p of this.state.spieler.values()) p.spricht = false;
    this.broadcast('spracheEinst', { einst: sprache });
    this.optionenSetzen();
    if (this.innenModus() !== INNEN_FEIN) this.innenUmschalten();
    this.tuerAnteileUebernehmen();
    const soll = this.zombieSollJetzt();
    // zu viele Zombies draußen: die am weitesten entfernten, nicht jagenden verschwinden
    const draussen = [...this.state.zombies.entries()].filter(([id, z]) => !z.ebene && !z.jagt && !this.zombieInfo.get(id)?.welle && !this.zombieInfo.get(id)?.bleibt);   // wie beim Nachfüllen: Stadt- und Horden-Zombies zählen nicht
    const spieler = [...this.state.spieler.values()].filter(p => !p.ebene);
    const kpunkte = this.kameraPunkte();
    const abstand = z => Math.min(...spieler.map(p => Math.hypot(p.x - z.x, p.y - z.y)), ...kpunkte.map(k => Math.hypot(k.x - z.x, k.y - z.y)), Infinity);
    draussen.sort((a, b) => abstand(b[1]) - abstand(a[1]));
    for (const [id] of draussen.slice(0, Math.max(0, draussen.length - soll))) { this.state.zombies.delete(id); this.zombieInfo.delete(id); }
  }

  zeitraffer() { return SpielRaum.einstellungen.zeitraffer || 1; }
  einstellungen() { return SpielRaum.einstellungen; }

  unsterblich(p, x = null) { return p.kamera || x?.suUnsterblich || SpielRaum.einstellungen.unsterblich?.has?.(String(p.name).toLowerCase()); }

  // Testzugang: Anmeldung ins Protokoll (nie das Passwort), Rückmeldung nur an den Spieler selbst
  suAnmeldung(client, p, auth) {
    if (auth?.su) { console.log(`[Superuser] ${p.name} hat sich angemeldet`); client.send('su', { an: true }); }
    else if (auth?.grund) { console.log(`[Superuser] Anmeldung von ${p.name} abgelehnt: ${auth.grund}`); client.send('meldung', { text: '🔒 ' + auth.grund }); }
  }

  // von der Verwaltungsseite: alle bekommen Bescheid, die Welt wird verworfen und beim nächsten Beitritt neu gebaut
  // neuerStand: Levelwechsel – statt der leeren Welt wird dieser Anfangsstand (neue Karte, Level) gespeichert
  weltNeuStarten(spielerLoeschen = false, neuerStand = null) {
    this.nichtSpeichern = true;
    this.chatVerlauf = [];   // der Chat gehört zur Welt
    this.speicher?.loescheWelt();
    if (neuerStand) this.speicher?.speichereWelt(neuerStand);
    if (spielerLoeschen) this.speicher?.loescheSpieler();
    else for (const [sid, p] of this.state.spieler) {
      const x = this.extra.get(sid);
      if (!x || x.bot || !this.speicher) continue;
      // Rucksack und Werte bleiben, der Platz wird in der neuen Welt neu bestimmt
      this.speichereSpieler(sid, true);
      const { name, ...daten } = this.speicher.ladeSpieler(x.spielerId) ?? {};
      // neue Welt in Level 1 = neue Runde: Fähigkeiten und Startwahl beginnen von vorn; Levelwechsel behalten alles
      const neu = neuerStand ? {} : { fk: FK.neuerStand(), startOffen: true };
      this.speicher.speichereSpieler(x.spielerId, p.name, { ...daten, ...neu, x: null, y: null, letzterSafe: '', draussen: true });
    }
    this.broadcast('neustart', neuerStand ? { level: neuerStand.level } : {});
    this.clock.setTimeout(() => this.disconnect(), 400);
  }

  // ---------- Erfahrung und Fähigkeiten (Logik in faehigkeiten.mjs) ----------
  fkEinst() { return { an: true, xpFaktor: 100, ...(SpielRaum.einstellungen.faehigkeiten ?? {}) }; }
  fkWert(p, was, standard = 1) {
    const st = this.fkVon.get(p);
    return st && this.fkEinst().an ? FK.wirkung[was](st) : standard;
  }
  fkRucksack(p) { return this.fkWert(p, 'rucksack', 0); }
  fkSenden(sid) {
    const x = this.extra.get(sid), c = this.clients.find(k => k.sessionId === sid);
    if (x?.fk && c) c.send('fk', FK.fuerClient(x.fk, this.fkEinst().an));
  }
  xpGeben(sid, art, menge = FK.XP[art]) {
    const x = this.extra.get(sid), p = this.state.spieler.get(sid), e = this.fkEinst();
    if (!x?.fk || !p || x.bot || !e.an) return;
    const neu = FK.gebeXp(x.fk, menge, e.xpFaktor / 100);
    if (neu > 0) {
      const c = this.clients.find(k => k.sessionId === sid);
      c?.send('meldung', { text: `⭐ Level ${FK.levelAus(x.fk.xp)} – ${FK.freiePunkte(x.fk)} Punkt${FK.freiePunkte(x.fk) === 1 ? '' : 'e'} frei (Taste K)`, lang: true });
      this.speichereSpieler(sid);
    }
    this.fkSenden(sid);
  }
  // Evakuierung geschafft: alle echten Spieler bekommen Erfahrung (Haken aus aufgaben.mjs)
  xpAlle(art) { for (const [sid, x] of this.extra) if (!x.bot) this.xpGeben(sid, art); }
  fkPunkt(client, m) {
    const x = this.extra.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    if (!x?.fk || !p || x.bot || !this.fkEinst().an) return;
    const vorher = this.fkRucksack(p);
    if (!FK.investiere(x.fk, String(m?.id))) return this.fkSenden(client.sessionId);
    p.plaetze += this.fkRucksack(p) - vorher;
    this.speichereSpieler(client.sessionId);
    this.fkSenden(client.sessionId);
  }

  // ---------- Startwahl vor Level 1: 5 Fähigkeitspunkte + ein Startgegenstand, einmal je Spieler und Runde ----------
  startwahlSenden(sid) {
    const x = this.extra.get(sid), c = this.clients.find(k => k.sessionId === sid);
    if (x?.startOffen && c) c.send('startwahl', { punkte: FK.START_PUNKTE, gegenstaende: FK.START_GEGENSTAENDE, anzahl: FK.START_ANZAHL, max: FK.MAX_STUFE });
  }
  startwahl(client, m) {
    const x = this.extra.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    if (!x || !p || x.bot || !x.startOffen || !x.fk) return;
    const items = m?.items;
    if (!FK.startItemsOk(items) || !FK.startVergabe(x.fk, m?.punkte)) return this.startwahlSenden(client.sessionId);
    x.startOffen = false;
    const zufall = this.startAusruestung(p, x, items);
    this.speichereSpieler(client.sessionId);
    this.fkSenden(client.sessionId);
    client.send('startwahl_ok', { zufall });
    client.send('meldung', { text: `🎲 Zufall: ${DINGE[zufall]?.zeichen ?? ''} ${DINGE[zufall]?.name ?? zufall}`, lang: true });
  }
  // zwei gewählte Gegenstände + ein zufälliger; gibt den Zufallsgegenstand zurück
  startAusruestung(p, x, items) {
    const zufall = FK.START_ZUFALL[Math.min(FK.START_ZUFALL.length - 1, Math.floor(this.rnd() * FK.START_ZUFALL.length))];
    for (const d of [...items, zufall]) this.startGegenstand(p, d, x);
    return zufall;
  }
  // Waffen in einen freien Waffenplatz (sonst Rucksack), alles andere über einpacken (Rucksack, sonst neben die Figur)
  startGegenstand(p, d, x) {
    const rest = [d];
    if (DINGE[d]?.waffe) {
      if (d === 'armbrust') rest.push('pfeil');
      rest.shift();
      if (!p.waffe && !p.faust) p.waffe = d;
      else {
        const frei = [0, 1].find(i => i !== p.wplatz && !p[WP.PLATZ_FELD[i]]);
        if (frei !== undefined) p[WP.PLATZ_FELD[frei]] = d; else rest.unshift(d);
      }
    } else if (d === 'pfeil' || d === 'munition') { /* Vorrat, über einpacken */ }
    this.einpacken(p, rest);
    for (const r of rest) this.legeHin(r, p.x, p.y, p.ebene);   // Rucksack voll: neben die Figur
  }
  // Bots: sofort eine sinnvolle Verteilung (Level 1)
  botStart(p, x) {
    if (this.state.level !== 1) return;
    x.fk = FK.neuerStand(); FK.startVergabe(x.fk, FK.START_BOT); this.fkVon.set(p, x.fk);
    for (const d of FK.START_BOT_ITEMS) this.startGegenstand(p, d, x);
  }

  // trotzdem: auch während des Welt-Neustarts speichern (nur weltNeuStarten selbst); danach darf nichts mehr überschreiben,
  // sonst gelten beim Trennen die alten Koordinaten und der alte Safe Room statt des gemeinsamen Starts im neuen Level
  speichereSpieler(sid, trotzdem = false) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || x.bot || !this.speicher || (this.nichtSpeichern && !trotzdem)) return;
    this.speicher.speichereSpieler(x.spielerId, p.name, {
      x: p.x, y: p.y, hp: p.unten ? 25 : p.hp, durst: p.durst, hunger: p.hunger,
      waffe: p.waffe, munition: p.munition, pfeile: p.pfeile, granaten: p.granaten, handgranaten: p.handgranaten, ...WP.speicherDaten(p, x), rucksack: [...p.rucksack], plaetze: p.plaetze - this.fkRucksack(p), besiegt: p.besiegt, fk: x.fk, munSerie: x.munSerie ?? 0,
      startOffen: !!x.startOffen, hund: !!x.hund, aussehen: p.aussehen, letzterSafe: x.letzterSafe, lager: p.sicher === 'lager' && p.zombie <= 0, draussen: !p.sicher || p.zombie > 0, infektion: p.zombie > 0 ? 0 : p.infektion, kleidung: p.kleidung, lampe: p.lampe,
    });
  }

  speichereWelt() {
    if (!this.speicher || this.nichtSpeichern) return;
    const behaelter = {}, safes = {};
    for (const [id, inhalt] of this.inhalte) behaelter[id] = inhalt;
    for (const [id, s] of this.state.safes) safes[id] = { barrikade: Math.round(s.barrikade), kiste: [...s.kiste] };
    this.speicher.speichereWelt({
      version: WELT_VERSION, innen: INNEN_FEIN, karte: this.state.karte, seed: this.state.seed, zeit: this.state.zeit, uhr: this.state.uhr, autos: this.state.autos, besiegt: this.state.besiegt, verwandelt: this.state.verwandelt, gerettet: this.state.gerettet, behaelter, safes,
      torGeloest: this.state.torGeloest, level: this.state.level, aufgaben: this.aufgaben?.speichern() ?? null, gestellt: [...this.gestellt].slice(-500),
      tueren: Object.fromEntries([...this.state.tueren.entries()].map(([k, t]) => [k, [t.offen, t.verschlossen, Math.round(t.barrikade), Math.round(t.hp), t.kaputt]])),
      verbrannt: [...this.state.verbrannt.keys()].filter(k => !k.startsWith('fz:')),
      chat: this.chatVerlauf, stuetzpunkt: this.stuetzpunkt?.speichern() ?? '', stuetzpunktMuni: this.stuetzpunkt?.muniSpeichern() ?? null,
    });
  }

  speichereAlles() {
    if (!this.speicher || this.nichtSpeichern) return;
    try {
      this.speicher.transaktion(() => {
        this.speichereWelt();
        for (const sid of this.state.spieler.keys()) this.speichereSpieler(sid);
      });
    } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
  }

  // ---------- Aktionen der Spieler ----------

  kontext(p) {
    if (p.unten || p.zombie > 0 || this.state.phase !== 'spiel') return null;
    const welt = this.wv(p.ebene);
    const safe = safeRoomVon(this.welt, p);
    const tuer = this.tuerKontext(p);
    if (tuer) return tuer;
    if (safe && welt.ausgang) {
      // die Eingangstür von innen verbarrikadieren
      const tx = (welt.ausgang.x + 0.5) * kachelVon(welt), ty = (welt.ausgang.y + 0.5) * kachelVon(welt);
      const zustand = this.state.safes.get(safe.id);
      if (Math.hypot(p.x - tx, p.y - ty) < reichVon(welt, 56)) {
        // ein toter Zombie in der Tür muss erst weg
        const imWeg = this.leicheInTuer(safe);
        if (imWeg) return { art: 'wegziehen', leiche: imWeg, safe, dauer: 1.5 };
        if (hat(p.rucksack, 'bretter') && zustand.barrikade < 100) return { art: 'barrikade', safe, key: 'haus:' + safe.haus.nr, dauer: 3 };
      }
      const funk = this.aufgaben?.funkKontext(p);
      if (funk) return funk;
    }
    // Funkzelt des Bundeswehr-Stützpunkts: Funkspruch wie am Funktisch im Safe Room
    const funkZelt = !p.ebene ? this.aufgaben?.funkKontext(p) : null;
    if (funkZelt) return funkZelt;
    // Gegenstand am Boden aufheben
    const AKT = reichVon(welt, AKTION_ABSTAND);
    let nahDing = null, nd = AKT;
    for (const [id, b] of this.state.boden) {
      if ((b.ebene ?? '') !== p.ebene) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < nd) { nd = d; nahDing = id; }
    }
    if (nahDing && (!this.bodenBrauchtPlatz(p, this.state.boden.get(nahDing).ding) || kannAufnehmen(p.rucksack, p.plaetze, this.state.boden.get(nahDing).ding))) return { art: 'aufheben', id: nahDing, dauer: 0.4 };
    const mensch = this.stadt?.ansprechbar?.(p);
    if (mensch) return { art: 'ansprechen', id: mensch, dauer: 0.6 };
    if (!p.ebene && this.state.torGeloest < TOR_RAETSEL && this.amTor(p)) return { art: 'raetsel' };
    let best = null, bd = AKT;
    for (const b of welt.behaelter) {
      const d = abstandBehaelter(b, p.x, p.y);
      if (d >= bd) continue;
      const zustand = this.state.behaelter.get(b.id);
      if (zustand && zustand.rest === 0) continue;
      if (b.art !== 'bus' && !sichtfrei(welt, p.x, p.y, b.x, b.y) && !p.ebene) continue;
      bd = d; best = b;
    }
    for (const [id, l] of this.state.leichen) {
      if ((l.ebene ?? '') !== p.ebene) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d >= bd || l.rest === 0) continue;
      bd = d; best = { id, art: 'leiche', x: l.x, y: l.y };
    }
    if (best) return { art: 'durchsuchen', behaelter: best, dauer: durchsuchDauer(best.art) };
    const tuerK = this.tuerKontext(p, 'zu');
    if (tuerK) return tuerK;
    // an einer Hecke, einem Gartenzaun oder einer Gartenmauer: drübersteigen
    if (!p.ebene) { const z = zaunUeberstieg(this.welt, p.x, p.y, p.richtung, W.spielerRadius); if (z) return { art: 'klettern', ziel: z, dauer: 0.25 }; }
    return null;
  }

  amTor(p) {
    const t = this.welt.tor;
    return Math.hypot(p.x - (t.x + 1) * KACHEL, p.y - (t.y + 1) * KACHEL) < TOR_ABSTAND;
  }

  // ---------- Ebenen (Innenräume) ----------

  // von: Ebene, aus der man kommt (nur beim ersten Bauen wichtig: Zombies entstehen nicht am Ankunftspunkt)
  wv(ebene, von) {
    if (!ebene) return this.welt;
    return this.ebenen.get(ebene) ?? this.baueEbene(ebene, von);
  }

  baueEbene(ebene, von) {
    const w = innenraumFuer(this.state.seed, this.welt, ebene);
    if (!w) return this.welt;
    w.safeRooms = [];
    for (const t of w.tueren) {
      const key = `${ebene}:${t.x},${t.y}`;
      let st = this.state.tueren.get(key);
      if (!st) {
        const g = (this.gespeicherteTuerenStand ?? {})[key];
        st = g ? this.tuerAusStand(g) : neueTuer(t.offen, t.verschlossen && this.tuerArt(key) !== 'frei');
        this.state.tueren.set(key, st);
      }
      if (st.offen) setzeTuerKacheln(w, t, true);
    }
    this.ebenen.set(ebene, w);
    this.wohnungsLeiche(ebene, w);
    // schlafende Zombies hinter den Türen
    // Menge über die Einstellung „Zombies in Häusern“ (10 = normal): Plätze ausdünnen oder verdoppeln
    const hf = (SpielRaum.einstellungen.haeuserFaktor ?? 1) * this.levelEinst().haeuser / 10;   // Level-Tabelle: Zombies je Zombieplatz (10 = 1)
    // Ankunftspunkt: von draußen der Start, sonst neben der Treppe zur Herkunftsebene – dort bleibt ein Umkreis zombiefrei
    let meiden = null;
    if (von !== undefined) {
      const zurueck = von ? w.treppen?.find(z => z.ziel === von) : null;
      meiden = zurueck ? this.nebenKachel(w, zurueck) : w.start;
    }
    for (const zp of (w.zombiePlaetze ?? []).filter(zp => !meiden || Math.hypot(zp.x - meiden.x, zp.y - meiden.y) >= reichVon(w, ANKUNFT_ZOMBIEFREI))) {
      for (let n = Math.floor(hf) + (this.rnd() < hf % 1 ? 1 : 0), i = 0; i < n; i++) {
        const dx = i ? (this.rnd() - 0.5) * kachelVon(w) : 0, dy = i ? (this.rnd() - 0.5) * kachelVon(w) : 0;
        if (!i || frei(w, zp.x + dx, zp.y + dy, W.zombieRadius)) this.setzeZombie(zp.x + dx, zp.y + dy, ebene, true);
      }
    }
    this.stadt?.versteckterImHaus?.(ebene, w);   // nur in Häusern ohne Zombies: ein versteckter Mensch
    return w;
  }

  // Tote in Wohnungen: in LEICHE_WOHNUNG (ca. 20 %) der Wohnhaus-Ebenen liegt eine durchsuchbare Leiche (deterministisch aus Seed und Ebene).
  // Nicht in Safe Rooms und Läden.
  wohnungsLeiche(ebene, w) {
    const haus = this.welt.haeuser?.[w.nr];
    if (!haus || haus.safe || ladenArt(haus)) return null;
    let h = 2166136261 ^ (this.state.seed >>> 0);
    for (let i = 0; i < ebene.length; i++) h = Math.imul(h ^ ebene.charCodeAt(i), 16777619) >>> 0;
    const rng = zufall(h ^ 0x7e1c4e);
    if (rng() >= LEICHE_WOHNUNG) return null;
    // Platz: freie Bodenkacheln, nicht an Türen, Treppen, Ausgang und Start
    const K = kachelVon(w), nahe = w.kachel ? 8 : 1;   // Feinraster: 2 m Abstand zu Türen, Treppen, Ausgang und Start
    const sperr = [...(w.tueren ?? []), ...(w.treppen ?? []), ...(w.ausgang ? [w.ausgang] : [])].flatMap(q => q.zellen ?? [[q.x, q.y]]).map(([x, y]) => ({ x, y }));
    if (w.start) sperr.push({ x: Math.floor(w.start.x / K), y: Math.floor(w.start.y / K) });
    const platz = [];
    for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++) {
      if (w.hole(x, y) !== T.BODEN) continue;
      if (sperr.some(q => Math.abs(q.x - x) <= nahe && Math.abs(q.y - y) <= nahe)) continue;
      if (!frei(w, (x + 0.5) * K, (y + 0.5) * K, 14)) continue;
      platz.push({ x: (x + 0.5) * K, y: (y + 0.5) * K });
    }
    if (!platz.length) return null;
    const ort = platz[Math.floor(rng() * platz.length)];
    return this.neueLeiche({ x: ort.x, y: ort.y, richtung: rng() * Math.PI * 2, variante: Math.floor(rng() * 25), ebene }, true);
  }

  setzeZombie(x, y, ebene = '', schlaeft = false) {
    const z = new Zombie();
    z.x = x; z.y = y; z.hp = SpielRaum.einstellungen?.zombieLeben ?? ZOMBIE_HP; z.richtung = this.rnd() * Math.PI * 2; z.jagt = false;
    z.kriecht = false; {
      const erlaubt = SpielRaum.einstellungen.zombieTypen;   // Verwaltung: erlaubte Zombietypen (Nummern), sonst alle
      z.variante = erlaubt?.length ? erlaubt[Math.floor(this.rnd() * erlaubt.length)] : Math.floor(this.rnd() * 25);
    } z.ebene = ebene;
    const id = 'z' + (this.naechsteZombieId++);
    const schnell = this.schwierigkeit().schnell;   // Anteil schneller Zombies („Läufer“) steigt mit Level und Spieltagen
    this.state.zombies.set(id, z);
    // tempo: fester Tempofaktor 0,9–1,1, damit nicht alle gleich schnell sind (Kriecher bleiben langsam, siehe zombieGehen)
    this.zombieInfo.set(id, { ziel: null, punkt: null, wechsel: 0, verloren: 0, steht: schlaeft, schlaeft, tempo: (schnell > 0 && this.rnd() < schnell ? 1.3 : 0.9) + this.rnd() * 0.2 });
    return id;
  }

  // Zombie bleibt im S-Draht hängen: Kriecher-Aussehen, bewegt sich nicht (zombieGehen), beißt Nahe, ist erschießbar; nach dauer Sekunden
  // reißt er sich los (haengtSchritt) und kriecht als normaler Kriecher weiter
  haengenBleiben(z, info, dauer) {
    z.haengt = true; z.kriecht = true; z.jagt = false;
    z.hp = Math.max(1, Math.round(KRIECHER_HP * (SpielRaum.einstellungen?.zombieLeben ?? ZOMBIE_HP) / ZOMBIE_HP));
    info.haengtT = dauer; info.ziel = null; info.punkt = null; info.schlaeft = false; info.steht = false; info.welle = null;
  }

  // Betreten, Verlassen, Treppen: wer auf die Kachel tritt, wechselt die Ebene
  uebergang(id, p, x, dt) {
    if (!x) return;
    x.schonT = Math.max(0, (x.schonT ?? 0) - dt);
    x.wechselSperre = Math.max(0, (x.wechselSperre ?? 0) - dt);
    if (x.wechselSperre > 0) return;
    // nach einem Wechsel erst wieder, wenn man sich vom Ankunftsort entfernt hat
    // (sonst läuft man mit gehaltener Taste sofort zurück durch Tür oder Treppe)
    x.ankunftT = (x.ankunftT ?? 0) + dt;
    // (Bots stehen nach dem Wechsel oft nur einen Schritt von der Tür entfernt und müssen sofort zurück können – nach 1 s darf es)
    // Spieler: Ausgang erst wieder scharf, wenn sie sich vom Ankunftspunkt entfernt haben (gehaltene Taste führt nicht
    // sofort wieder hinaus – mit dem kleineren Kollisionskreis erreicht man den Ausgang sonst nach Ablauf einer Zeitsperre)
    if (x.ankunft && x.bot && x.ankunftT > 1) x.ankunft = null;
    if (x.ankunft) {
      if (x.ankunft.ref && !x.bot) {
        // erst scharf, wenn man sich einmal vom Rückweg-Übergang entfernt hat (weggehen und zurück)
        if (Math.hypot(p.x - x.ankunft.ref.x, p.y - x.ankunft.ref.y) <= x.ankunft.d0 + reichVon(this.wv(p.ebene), 14)) return;
      } else if (Math.hypot(p.x - x.ankunft.x, p.y - x.ankunft.y) < reichVon(this.wv(p.ebene), 36)) return;
      x.ankunft = null;
    }
    // Bots wechseln nur, wenn sie genau diesen Übergang ansteuern (nicht beim Vorbeilaufen)
    if (x.bot && (!x.bot.uebergangZiel || Math.hypot(p.x - x.bot.uebergangZiel.x, p.y - x.bot.uebergangZiel.y) > reichVon(this.wv(p.ebene), 24))) return;
    const welt = this.wv(p.ebene), KW = kachelVon(welt);
    const kx = Math.floor(p.x / KW), ky = Math.floor(p.y / KW);
    const t = welt.hole(kx, ky);
    let ziel = null, pos = null, tuerDraussen = null;
    if (!p.ebene && t === T.TUER) {
      const h = this.welt.haeuser.find(h => h.tuer.x === kx && h.tuer.y === ky);
      if (!h || !h.betretbar) return;
      // brennende Häuser kann man nicht betreten
      if ([...this.brand?.info.values() ?? []].some(i => i.ziel === 'haus:' + h.nr)) {
        if (!x.bot) this.clients.find(c => c.sessionId === id)?.send('meldung', { text: '🔥 Das Haus brennt – da kommst du nicht rein' });
        bewege(welt, p, h.raus.dx * 20, h.raus.dy * 20, W.spielerRadius); return;
      }
      this.haustuerOeffnen(h.nr);   // Menschen gehen durch geschlossene Haustüren hindurch (Barrikaden halten nur Zombies auf)
      ziel = `h${h.nr}eg`; pos = this.wv(ziel, '').start;
    } else if (p.ebene && t === T.AUSGANG) {
      const h = this.welt.haeuser[welt.nr];
      this.haustuerOeffnen(h.nr);
      const r = h.raus ?? { dx: 0, dy: 1 };
      ziel = ''; pos = { x: (h.tuer.x + 0.5 + r.dx * 1.3) * KACHEL, y: (h.tuer.y + 0.5 + r.dy * 1.3) * KACHEL };
      tuerDraussen = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL };
    } else if (p.ebene && (t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH)) {
      const tr = welt.treppen.find(tr => tr.zellen ? tr.zellen.some(([zx, zy]) => zx === kx && zy === ky) : (tr.x === kx && tr.y === ky));
      if (!tr) return;
      ziel = `h${welt.nr}${tr.ziel}`;
      const zw = this.wv(ziel, welt.stock);
      const zurueck = zw.treppen.find(z => z.ziel === welt.stock);
      pos = zurueck ? this.nebenKachel(zw, zurueck) : zw.start;
    } else return;
    const platz = this.freierPlatz(pos, 0, ziel);
    p.ebene = ziel; p.x = platz.x; p.y = platz.y; p.aktion = ''; p.fortschritt = 0;
    // Rückweg-Übergang in der neuen Ebene (Ausgang, Haustür oder Treppe zurück) für die richtungsabhängige Sperre
    let ref = null;
    // Haustür draußen (NICHT kx/ky: das ist die Ausgangskachel in Innenraum-Koordinaten – damit sperrte die Ankunftsregel
    // nach dem Verlassen eines Hauses alle Haustüren, bis man sich weit genug von einem beliebigen Punkt oben links entfernt hatte)
    if (ziel === '') ref = tuerDraussen;
    else {
      const zw = this.wv(ziel, welt.stock ?? '');
      const rk = t === T.TUER ? zw.ausgang : zw.treppen?.find(z => z.ziel === (welt.stock ?? ''));
      if (rk) ref = { x: (rk.x + 0.5) * kachelVon(zw), y: (rk.y + 0.5) * kachelVon(zw) };
    }
    x.wechselSperre = 0.2; x.ankunft = { x: platz.x, y: platz.y, ref, d0: ref ? Math.hypot(platz.x - ref.x, platz.y - ref.y) : 0 }; x.ankunftT = 0; x.schonT = SCHONZEIT_EBENE;
    if (x.bot) { x.bot.weg = null; x.bot.uebergangZiel = null; }
  }

  // begehbare Nachbarkachel einer Treppe (dort landet man)
  nebenKachel(w, k) {
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      if (w.kachel) {   // Feinraster: Treppe mehrzellig, nächste freie Zelle am Rechteck, auf die die Figur passt
        const r = k.rect ?? { x: k.x, y: k.y, b: 1, h: 1 }, tx = dx < 0 ? r.x - 2 : dx > 0 ? r.x + r.b + 1 : r.x + (r.b >> 1), ty = dy < 0 ? r.y - 2 : dy > 0 ? r.y + r.h + 1 : r.y + (r.h >> 1);
        if (w.hole(tx, ty) === T.BODEN && frei(w, (tx + 0.5) * w.kachel, (ty + 0.5) * w.kachel, 7)) return { x: (tx + 0.5) * w.kachel, y: (ty + 0.5) * w.kachel };
        continue;
      }
      if (w.hole(k.x + dx, k.y + dy) === T.BODEN) return { x: (k.x + dx + 0.5) * KACHEL, y: (k.y + dy + 0.5) * KACHEL };
    }
    return w.start;
  }

  // wohin muss man auf dieser Ebene gehen, um Richtung Zielebene zu kommen? (für Bots)
  uebergangsPunkt(von, nach) {
    const mitte = k => { const K = kachelVon(this.wv(von)); return { x: (k.x + 0.5) * K, y: (k.y + 0.5) * K }; };
    const ziel = EBENE_MUSTER.exec(nach ?? '');
    if (!von) {
      if (!ziel) return null;
      return mitte(this.welt.haeuser[Number(ziel[1])].tuer);
    }
    const w = this.wv(von);
    if (w.stock !== 'eg') return mitte(w.treppen.find(t => t.ziel === 'eg') ?? w.treppen[0]);
    if (ziel && Number(ziel[1]) === w.nr && ziel[2] !== 'eg') {
      const tr = w.treppen.find(t => t.ziel === ziel[2]);
      if (tr) return mitte(tr);
    }
    return w.ausgang ? mitte(w.ausgang) : null;
  }

  // ---------- Türen: Zimmertüren und Haustüren ----------

  tuerAnteileUebernehmen() {
    const a = SpielRaum.einstellungen.tueren ?? { frei: 50, raetsel: 25, schluessel: 25 };
    this.state.tuerFrei = a.frei; this.state.tuerRaetsel = a.raetsel; this.state.tuerSchluessel = a.schluessel;
  }

  // Schlossart einer Zimmertür: 'frei' | 'raetsel' | 'schluessel' (Haustüren sind nie verschlossen → 'frei')
  tuerArt(key) {
    if (this.hausNr(key) !== null) return 'frei';
    const s = this.state;
    return schlossArt(key, s.seed, { frei: s.tuerFrei, raetsel: s.tuerRaetsel, schluessel: s.tuerSchluessel });
  }

  tuerAusStand(g, haus = false) {
    const st = neueTuer(haus ? g[0] ?? true : g[0], g[1]);
    st.barrikade = Math.max(0, Math.min(100, Number(g[2]) || 0));
    st.hp = g[3] === undefined ? TUER_HP : Math.max(0, Math.min(100, Number(g[3]) || 0));
    st.kaputt = !!g[4];
    if (st.kaputt) { st.offen = true; st.verschlossen = false; }
    return st;
  }

  hausNr(key) { return key.startsWith('haus:') ? Number(key.slice(5)) : null; }

  safeVonHaus(nr) { return this.welt.safeRooms.find(r => r.haus.nr === nr) ?? null; }

  // Zustand der Haustür (null = nie angefasst: offen, heil, ohne Barrikade)
  hausTuer(nr, anlegen = false) {
    const key = 'haus:' + nr;
    let st = this.state.tueren.get(key);
    if (!st && anlegen) { st = neueTuer(true, false); this.state.tueren.set(key, st); }
    return st ?? null;
  }

  // Die Barrikade eines Safe-Room-Hauses lebt in state.safes (wird gespeichert und im HUD gezeigt), die Haustür spiegelt sie
  spiegleSafeTueren() {
    for (const r of this.welt.safeRooms) {
      const st = this.hausTuer(r.haus.nr, true), b = this.state.safes.get(r.id)?.barrikade ?? 0;
      if (Math.abs(st.barrikade - b) > 0.001) st.barrikade = b;
    }
  }

  tuerBarrikade(key) {
    const nr = this.hausNr(key);
    if (nr !== null) {
      const s = this.safeVonHaus(nr);
      if (s) return this.state.safes.get(s.id)?.barrikade ?? 0;
    }
    return this.state.tueren.get(key)?.barrikade ?? 0;
  }

  setzeBarrikade(key, wert) {
    wert = Math.max(0, Math.min(100, wert));
    const nr = this.hausNr(key);
    let st;
    if (nr !== null) {
      st = this.hausTuer(nr, true);
      const s = this.safeVonHaus(nr);
      if (s) this.state.safes.get(s.id).barrikade = wert;
    } else st = this.state.tueren.get(key);
    if (st) st.barrikade = wert;
  }

  hausAnTuer(kx, ky) {
    if (!this.haeuserTuer) {
      this.haeuserTuer = new Map();
      for (const h of this.welt.haeuser) if (h.betretbar) this.haeuserTuer.set(h.tuer.y * BREITE + h.tuer.x, h);
    }
    return this.haeuserTuer.get(ky * BREITE + kx) ?? null;
  }

  haustuerOeffnen(nr) {
    const st = this.state.tueren.get('haus:' + nr);
    if (st && !st.offen) st.offen = true;
  }

  // Orte (Ebene, Mitte) der Türkachel(n): wer dort steht, verhindert das Schließen
  tuerStellen(wahl) {
    const mitte = (k, ebene) => { const K = ebene ? kachelVon(this.wv(ebene)) : KACHEL; return { ebene, x: (k.x + 0.5) * K, y: (k.y + 0.5) * K }; };
    if (wahl.tuer) return [mitte(wahl.tuer, wahl.ebene)];
    const h = this.welt.haeuser[wahl.nr], a = this.wv(`h${wahl.nr}eg`).ausgang;
    return [mitte(h.tuer, ''), ...(a ? [mitte(a, `h${wahl.nr}eg`)] : [])];
  }

  // nächste bedienbare Tür: Zimmertür, Haustür von innen (am Ausgang) oder von außen
  tuerWahl(p) {
    let best = null, bd = Infinity;
    if (p.ebene) {
      const w = this.wv(p.ebene);
      const KW = kachelVon(w), rt = w.kachel ? 14 : 42;   // Reichweite zur Tür: 1,75 m im Feinraster statt 5 m
      for (const t of w.tueren) {
        const d = abstandTuer(w, t, p.x, p.y);
        if (d < rt && d < bd) { bd = d; best = { key: `${p.ebene}:${t.x},${t.y}`, tuer: t, ebene: p.ebene }; }
      }
      if (w.ausgang && w.nr !== undefined) {
        const d = Math.hypot((w.ausgang.x + 0.5) * KW - p.x, (w.ausgang.y + 0.5) * KW - p.y);
        if (d < (w.kachel ? 16 : 48) && d < bd) best = { key: 'haus:' + w.nr, nr: w.nr, ebene: p.ebene };
      }
    } else {
      const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const h = this.hausAnTuer(kx + dx, ky + dy);
        if (!h) continue;
        const d = Math.hypot((h.tuer.x + 0.5) * KACHEL - p.x, (h.tuer.y + 0.5) * KACHEL - p.y);
        if (d < 44 && d < bd) { bd = d; best = { key: 'haus:' + h.nr, nr: h.nr, ebene: '' }; }
      }
    }
    return best;
  }

  // Türen: öffnen, schließen, aufschließen, aufbrechen, Rätsel, verbarrikadieren
  // modus 'auf': geschlossene Tür bedienen · 'zu': offene Tür verbarrikadieren (mit Brettern) oder schließen · 'zweit': die jeweils andere Möglichkeit
  tuerKontext(p, modus = 'auf') {
    if (modus === true) modus = 'zu';
    const wahl = this.tuerWahl(p);
    if (!wahl) return null;
    const st = this.state.tueren.get(wahl.key);
    if (!st && wahl.tuer) return null;
    const offen = st ? st.offen : true, kaputt = !!st?.kaputt;
    const bar = this.tuerBarrikade(wahl.key);
    const basis = { key: wahl.key, tuer: wahl.tuer, ebene: wahl.ebene };
    const schliessen = () => {
      if (kaputt) return null;
      const wf = wahl.tuer?.zellen ? this.wv(wahl.ebene) : null;   // Feinraster: mehrzellige Tür – belegt, wenn eine Figur das Türrechteck berührt (nicht nur die Mitte)
      const rect = wf ? (() => { const K = kachelVon(wf), xs = wahl.tuer.zellen.map(c => c[0]), ys = wahl.tuer.zellen.map(c => c[1]); return { x0: Math.min(...xs) * K, y0: Math.min(...ys) * K, x1: (Math.max(...xs) + 1) * K, y1: (Math.max(...ys) + 1) * K }; })() : null;
      const belegt = this.tuerStellen(wahl).some(o => [...this.state.spieler.values(), ...this.state.zombies.values()]
        .some(q => (q.ebene ?? '') === o.ebene && (rect ? abstandBehaelter({ rect }, q.x, q.y) < (wf.radMax ?? 3) + 0.5 : Math.hypot(q.x - o.x, q.y - o.y) < reichVon(this.wv(o.ebene), 20))));
      return belegt ? null : { ...basis, art: 'tuer_zu', dauer: 0.25 };
    };
    const oeffnen = () => {
      const art = st?.verschlossen ? this.tuerArt(wahl.key) : 'frei';
      if (art === 'frei') return { ...basis, art: 'tuer_auf', dauer: 0.25 };
      if (art === 'raetsel') return { ...basis, art: 'schlossraetsel' };
      // nur mit Schlüsselbund; die Brechstange hilft hier nicht
      if (hat(p.rucksack, 'schluessel')) return { ...basis, art: 'aufschliessen', dauer: 1 };
      return { ...basis, art: 'schluessel_noetig' };
    };
    const brett = () => hat(p.rucksack, 'bretter') && bar < 100 ? { ...basis, art: 'barrikade', dauer: 3 } : null;
    const umschalten = () => offen ? schliessen() : oeffnen();
    if (modus === 'auf') return offen ? null : oeffnen();
    if (modus === 'zu') return offen ? (brett() ?? schliessen()) : null;
    const b = brett();
    return b ? (offen ? umschalten() : b) : (offen ? schliessen() : null);   // ohne Bretter: Schließen als zweite Möglichkeit (z. B. wenn ein Behälter in der Nähe die erste Taste belegt)
  }

  setzeTuer(key, offen) {
    const nr = this.hausNr(key);
    if (nr !== null) {
      const hs = this.hausTuer(nr, true);
      if (hs.kaputt && !offen) return;
      hs.offen = offen;
      if (offen) hs.verschlossen = false;
      return;
    }
    const st = this.state.tueren.get(key);
    if (!st || (st.kaputt && !offen)) return;
    const [ebene, xy] = key.split(':');
    const [x, y] = xy.split(',').map(Number);
    const w = this.wv(ebene);
    st.offen = offen;
    if (offen) st.verschlossen = false;
    setzeTuerKacheln(w, w.tueren?.find(t => t.x === x && t.y === y) ?? { x, y }, offen);
    // wer hinter der Tür schläft und jemanden sieht, wacht im nächsten Schritt auf (Sichtprüfung)
  }

  // Spieler (Menschen) hinter dieser Tür: im Haus (Haustür) bzw. auf der Ebene (Zimmertür)
  spielerHinterTuer(key) {
    const nr = this.hausNr(key), erg = [];
    for (const [sid, q] of this.state.spieler) {
      if (q.zombie > 0 || !q.ebene) continue;
      const m = EBENE_MUSTER.exec(q.ebene);
      if (nr !== null ? m && Number(m[1]) === nr : q.ebene === key.split(':')[0]) erg.push([sid, q]);
    }
    return erg;
  }

  sageDrin(key, text) {
    for (const [sid] of this.spielerHinterTuer(key)) this.clients.find(c => c.sessionId === sid)?.send('meldung', { text });
  }

  // Gehört die Tür zu einem Safehouse (Haustür oder Tür innen)? Dann hält sie geschlossen/verbarrikadiert immer
  tuerImSafe(key) {
    const nr = this.hausNr(key) ?? Number(EBENE_MUSTER.exec(key.split(':')[0])?.[1] ?? NaN);
    return Number.isFinite(nr) && !!this.welt?.safeRooms?.some(r => r.haus.nr === nr);
  }

  // Ein Zombie schlägt gegen die Tür: erst die Barrikade, dann die Tür selbst
  tuerSchlag(key, dt, z) {
    const st = this.state.tueren.get(key);
    if (!st) return;
    const bar = this.tuerBarrikade(key);
    if (this.tuerImSafe(key)) { /* Safehouse: Tür und Barrikade nehmen keinen Schaden, die Zombies hämmern nur */ }
    else if (bar > 0) this.setzeBarrikade(key, bar - dt * BARRIKADE_SCHADEN);
    else if (!st.kaputt) {
      st.hp = Math.max(0, st.hp - dt * (st.verschlossen ? TUER_SCHADEN_ZU : TUER_SCHADEN));
      if (st.hp <= 0) {
        st.kaputt = true; st.verschlossen = false; st.hp = 0;
        this.setzeTuer(key, true);
        this.sageDrin(key, '💥 Die Tür ist zerbrochen!');
        this.laerm(z.x, z.y, 300, true, z.ebene ?? '', z);
        return;
      }
    }
    // Lärm und Meldung höchstens einmal pro Sekunde bzw. alle 6 s
    const jetzt = Date.now(), u = this.tuerUhr?.get(key) ?? { laerm: 0, meldung: 0 };
    if (!this.tuerUhr) this.tuerUhr = new Map();
    if (jetzt - u.laerm > 1000) { u.laerm = jetzt; this.laerm(z.x, z.y, 220, true, z.ebene ?? '', z); }
    if (jetzt - u.meldung > 6000) { u.meldung = jetzt; this.sageDrin(key, '🧟 Zombies hämmern gegen die Tür!'); }
    this.tuerUhr.set(key, u);
  }

  // ---------- Tauschen (wenn sich zwei Spieler berühren; das Spiel läuft weiter) ----------

  istBot(sid) { return !!this.extra.get(sid)?.bot; }

  tauschStart(client, m) {
    const ich = client.sessionId, du = String(m?.mit ?? '');
    const p = this.state.spieler.get(ich), q = this.state.spieler.get(du);
    if (!p || !q || ich === du || this.tausche.has(ich) || this.tausche.has(du)) return;
    if (p.unten || q.unten || p.zombie > 0 || q.zombie > 0 || p.ebene !== q.ebene) return;
    if (Math.hypot(p.x - q.x, p.y - q.y) > reichVon(this.wv(p.ebene), TAUSCH_ABSTAND + 8)) return client.send('meldung', { text: 'Zum Tauschen musst du direkt neben ihm stehen' });
    const t = { seiten: [ich, du], angebot: { [ich]: [], [du]: [] }, ok: { [ich]: false, [du]: false } };
    this.tausche.set(ich, t); this.tausche.set(du, t);
    this.tauschGeaendert(t);
  }

  tauschSenden(t) {
    const [a, b] = t.seiten;
    for (const [ich, du] of [[a, b], [b, a]]) {
      const c = this.clients.find(k => k.sessionId === ich);
      c?.send('tausch', {
        partner: this.state.spieler.get(du)?.name ?? '?', mit: du,
        meins: t.angebot[ich], seins: t.angebot[du], meinOk: t.ok[ich], seinOk: t.ok[du],
      });
    }
  }

  // Nach jeder Änderung: Bots legen ein Gegenangebot hin und stimmen zu, wenn der Tausch für sie in Ordnung ist
  tauschGeaendert(t) {
    for (const s of t.seiten) {
      const andere = t.seiten.find(q => q !== s);
      if (!this.istBot(s) || this.istBot(andere)) { t.ok[s] = this.istBot(s); continue; }
      const bot = this.state.spieler.get(s), mensch = this.state.spieler.get(andere);
      if (!bot || !mensch) { t.ok[s] = false; continue; }
      for (const d of t.angebot[s]) fuegeHinzu(bot.rucksack, bot.plaetze, d);   // altes Gegenangebot zurücklegen und neu zusammenstellen
      t.angebot[s] = botGegenangebot(bot, mensch, t.angebot[andere]);
      for (const d of t.angebot[s]) entferne(bot.rucksack, d, 1);
      t.ok[s] = botEinverstanden(bot, t.angebot[andere], t.angebot[s]);
    }
    for (const s of t.seiten) if (!this.istBot(s)) t.ok[s] = false;
    this.tauschSenden(t);
  }

  tauschAnbieten(client, m) {
    const t = this.tausche.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!t || !p || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    t.angebot[client.sessionId].push(nimmEins(p.rucksack, i));
    this.tauschGeaendert(t);
  }

  tauschZurueck(client, m) {
    const t = this.tausche.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.index), liste = t?.angebot[client.sessionId];
    if (!t || !p || !Number.isInteger(i) || i < 0 || i >= liste.length || !kannAufnehmen(p.rucksack, p.plaetze, liste[i])) return;
    fuegeHinzu(p.rucksack, p.plaetze, liste[i]); liste.splice(i, 1);
    this.tauschGeaendert(t);
  }

  tauschOk(client) {
    const t = this.tausche.get(client.sessionId);
    if (!t) return;
    t.ok[client.sessionId] = true;
    const [a, b] = t.seiten;
    if (!(t.ok[a] && t.ok[b])) {
      const bs = t.seiten.find(q => this.istBot(q) && !t.ok[q]);
      if (bs) {
        const bot = this.state.spieler.get(bs), name = bot?.name ?? 'Der Bot';
        const H = t.angebot[t.seiten.find(q => q !== bs)] ?? [], B = t.angebot[bs] ?? [];
        const voll = bot && !this.tauschPasst(bot, H);
        this.clients.find(k => k.sessionId === client.sessionId)?.send('meldung', { text: voll ? `${name}: Mein Rucksack ist voll` : `${name} will das so nicht tauschen` });
      }
      return this.tauschSenden(t);
    }
    const pa = this.state.spieler.get(a), pb = this.state.spieler.get(b);
    if (!this.tauschPasst(pa, t.angebot[b]) || !this.tauschPasst(pb, t.angebot[a])) {
      for (const s of t.seiten) this.clients.find(k => k.sessionId === s)?.send('meldung', { text: 'Für den Tausch ist im Rucksack nicht genug Platz' });
      return this.tauschGeaendert(t);
    }
    for (const d of t.angebot[b]) fuegeHinzu(pa.rucksack, pa.plaetze, d);
    for (const d of t.angebot[a]) fuegeHinzu(pb.rucksack, pb.plaetze, d);
    t.angebot[a] = []; t.angebot[b] = [];
    this.tauschEnde(t, 'fertig');
  }

  tauschEnde(t, grund) {
    for (const s of t.seiten) {
      const p = this.state.spieler.get(s);
      for (const d of t.angebot[s] ?? []) {
        if (p && fuegeHinzu(p.rucksack, p.plaetze, d) > 0) { /* zurück im Rucksack */ }
        else if (p) this.legeHin(d, p.x, p.y, p.ebene);
      }
      t.angebot[s] = [];
      this.tausche.delete(s);
      this.clients.find(k => k.sessionId === s)?.send('tausch_ende', { grund });
    }
  }

  tauschPruefen() {
    const gesehen = new Set();
    for (const t of this.tausche.values()) {
      if (gesehen.has(t)) continue;
      gesehen.add(t);
      const [pa, pb] = t.seiten.map(s => this.state.spieler.get(s));
      if (!pa || !pb || pa.unten || pb.unten || pa.zombie > 0 || pb.zombie > 0 || pa.ebene !== pb.ebene || Math.hypot(pa.x - pb.x, pa.y - pb.y) > 70) {
        this.tauschEnde(t, 'abgebrochen');
      }
    }
  }

  // Leiche, die in der Tür eines Safe Rooms liegt (Id) oder null
  leicheInTuer(safe) {
    const a = this.wv(safe.ebene).ausgang;
    if (!a) return null;
    const tx = (a.x + 0.5) * kachelVon(this.wv(safe.ebene)), ty = (a.y + 0.5) * kachelVon(this.wv(safe.ebene));
    for (const [id, l] of this.state.leichen) if ((l.ebene ?? '') === safe.ebene && Math.hypot(l.x - tx, l.y - ty) < reichVon(this.wv(safe.ebene), 44)) return id;
    return null;
  }

  starteAktion(client, zweit = false) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.aktion || p.kamera) return;   // Kameraflug: keine Aktionen
    if (p.anBord) return void this.aufgaben?.aussteigen(client.sessionId);   // an Bord: die Aktionstaste steigt aus
    // zweite Taste: die andere Möglichkeit an derselben Tür (z. B. schließen statt verbarrikadieren)
    const k = zweit ? (p.unten || p.zombie > 0 || this.state.phase !== 'spiel' ? null : this.tuerKontext(p, 'zweit')) : this.kontext(p);
    if (!k) return;
    if (k.art === 'raetsel') return this.stelleRaetsel(client);
    if (k.art === 'schlossraetsel') return this.stelleRaetsel(client, { art: 'tuer', key: k.key, tuer: k.tuer, ebene: k.ebene });
    if (k.art === 'schluessel_noetig') return client.send('meldung', { text: '🔑 Diese Tür braucht einen Schlüssel' });
    if (k.art === 'funk') {   // Funkspruch braucht Funkgerät, Batterie und Antenne (in einer Safe-Room-Kiste abgegeben)
      const fehlt = this.aufgaben?.funkFehlt() ?? [];
      if (fehlt.length) return client.send('meldung', { text: `📻 Der Funkspruch geht noch nicht – es fehlt: ${fehlt.join(', ')} (in die Safe-Room-Kiste legen)`, lang: true });
    }
    // Kofferräume gehen nur mit Brechstange auf
    if (k.art === 'durchsuchen' && k.behaelter?.art === 'auto' && !hat(p.rucksack, 'brechstange')) {
      return client.send('meldung', { text: '🔒 Der Kofferraum ist zu – dafür brauchst du eine ⚒️ Brechstange' });
    }
    p.aktion = k.art; p.fortschritt = 0;
    x.aktionZiel = k;
    x.laermUhr = 0;
  }

  aktionSchritt(sid, p, x, dt) {
    if (!p.aktion) return;
    const e = x.eingabe;
    if (p.unten || Math.hypot(e.dx, e.dy) > 0.05 || this.state.phase !== 'spiel') {
      p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
      return;
    }
    const k = x.aktionZiel;
    p.fortschritt = Math.min(1, p.fortschritt + dt / k.dauer);
    // Durchsuchen und Hämmern machen Lärm – auch durch Wände
    x.laermUhr -= dt;
    if (x.laermUhr <= 0) {
      const weite = { barrikade: 220, funk: 420, aufbrechen: 340, tuer_auf: 60, tuer_zu: 60, aufschliessen: 40, aufheben: 0 }[k.art] ?? 150;
      if (weite) this.laerm(p.x, p.y, weite, true, p.ebene);
      x.laermUhr = 1;
    }
    if (p.fortschritt < 1) return;
    p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
    const client = this.clients.find(c => c.sessionId === sid);
    if (k.art === 'durchsuchen') this.durchsucht(client, p, k.behaelter);
    else if (k.art === 'durchsuchen_alle') this.alleDurchsucht(client, p, k.ids);
    else if (k.art === 'tuer_auf' || k.art === 'aufschliessen' || k.art === 'aufbrechen') {
      this.setzeTuer(k.key, true);
      if (k.art === 'aufbrechen') client?.send('meldung', { text: '⚒️ Tür aufgebrochen – das war laut!' });
    }
    else if (k.art === 'funk') this.aufgaben?.funkAbsetzen(p, k.safe);
    else if (k.art === 'tuer_zu') {
      this.setzeTuer(k.key, false);
      // von Hand geschlossen: die Auto-Öffnung greift für diese Tür erst wieder, wenn man sich > 80 px entfernt hat
      if (k.tuer && !x.bot) x.tuerSperre = { key: k.key, x: (k.tuer.x + 0.5) * kachelVon(this.wv(p.ebene)), y: (k.tuer.y + 0.5) * kachelVon(this.wv(p.ebene)), ebene: p.ebene ?? '' };
    }
    else if (k.art === 'ansprechen') this.stadt?.ansprechen(sid, p, k.id);
    else if (k.art === 'klettern') { p.x = k.ziel.x; p.y = k.ziel.y; x.sprungT = KLETTER_SPRUNG; this.broadcast('klettern', { x: p.x, y: p.y, id: sid }); }
    else if (k.art === 'aufheben') {
      const b = this.state.boden.get(k.id);
      if (!b || (this.bodenBrauchtPlatz(p, b.ding) && !kannAufnehmen(p.rucksack, p.plaetze, b.ding))) return;
      this.nimmAuf(client, p, k.id, b);
    }
    else if (k.art === 'wegziehen') {
      const l = this.state.leichen.get(k.leiche);
      if (!l) return;
      // von der Eingangstür weg in den Raum ziehen
      const sw = this.wv(k.safe.ebene), a = sw.ausgang;
      const tx = (a.x + 0.5) * kachelVon(sw), ty = (a.y + 0.5) * kachelVon(sw), w = Math.atan2(sw.start.y - ty, sw.start.x - tx);
      const ziel = this.freierPlatz({ x: tx + Math.cos(w) * kachelVon(sw) * (sw.kachel ? 12 : 2.2), y: ty + Math.sin(w) * kachelVon(sw) * (sw.kachel ? 12 : 2.2) }, 0, k.safe.ebene);
      l.x = ziel.x; l.y = ziel.y;
      client?.send('meldung', { text: 'Den toten Zombie aus der Tür gezogen' });
    }
    else if (k.art === 'barrikade') {
      if (k.safe && this.leicheInTuer(k.safe)) return client?.send('meldung', { text: 'Ein toter Zombie liegt in der Tür – erst wegziehen' });
      if (!hat(p.rucksack, 'bretter')) return;
      if (this.tuerBarrikade(k.key) >= 100) return;
      entferne(p.rucksack, 'bretter', 1);
      this.setzeBarrikade(k.key, this.tuerBarrikade(k.key) + BRETT_STAERKE);
      client?.send('meldung', { text: `Tür verbarrikadiert (${Math.round(this.tuerBarrikade(k.key))} %)` });
    }
  }

  // „Alles durchsuchen“: alle noch nicht durchsuchten Behälter/Leichen in Reichweite (Innenraum: freie Sicht, geschlossene Türen sperren)
  // am Stück, Dauer 60 % der Einzeldauern; danach Fundliste (nichts wird automatisch genommen)
  // Drinnen erst ein Quiz mit ALLE_FRAGEN Fragen (eine falsche Antwort sperrt 30 s), dann öffnen sich alle Türen des Stockwerks;
  // draußen (Autos, Leichen) ohne Quiz
  starteAlle(client, weiter = false) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.aktion || p.anBord || p.unten || p.zombie > 0 || this.state.phase !== 'spiel') return;
    if (!p.ebene) return this.beginneAlle(client, p, x);
    if ((x.alleSperre ?? 0) > Date.now()) return void client.send('meldung', { text: `⏳ Alles durchsuchen: noch ${Math.ceil((x.alleSperre - Date.now()) / 1000)} s gesperrt` });
    if (!weiter) x.alleQuiz = { nr: 0 };
    else if (!x.alleQuiz) return;
    this.stelleRaetsel(client, { art: 'alle', nr: x.alleQuiz.nr + 1 });
  }

  beginneAlle(client, p, x) {
    const { liste, dauer, autoZu } = alleKandidaten(this.wv(p.ebene), this.state.behaelter, this.state.leichen, p, hat(p.rucksack, 'brechstange'));
    if (!liste.length) return void client.send('meldung', { text: autoZu ? '🔒 Die Kofferräume sind zu – dafür brauchst du eine ⚒️ Brechstange' : 'Hier gibt es nichts mehr zu durchsuchen' });
    p.aktion = 'durchsuchen'; p.fortschritt = 0;
    x.aktionZiel = { art: 'durchsuchen_alle', ids: liste.map(e => e.id), dauer };
    x.laermUhr = 0;
  }

  // alle Türen des Stockwerks auf (auch verschlossene, Rätsel- und Schlüsseltüren); selbst gebaute Barrikaden bleiben
  oeffneAlleTueren(p) {
    const w = this.wv(p.ebene);
    let n = 0;
    for (const t of w.tueren ?? []) {
      const key = `${p.ebene}:${t.x},${t.y}`, st = this.state.tueren.get(key);
      if (!st || st.offen || st.kaputt || st.barrikade > 0) continue;
      this.setzeTuer(key, true); n++;
    }
    return n;
  }

  alleAntwort(client, p, offen, richtig) {
    const x = this.extra.get(client.sessionId), nr = offen.zweck.nr;
    const basis = { loesung: offen.richtig, seite: offen.seite };
    if (!richtig || !x) {
      if (x) { x.alleQuiz = null; x.alleSperre = Date.now() + ALLE_SPERRE * 1000; }
      client.send('meldung', { text: `❌ Falsch – erst in ${ALLE_SPERRE} s wieder` });
      client.send('alle_sperre', { sek: ALLE_SPERRE });
      return client.send('aufloesung', { richtig: false, ...basis, alle: { nr: nr - 1, von: ALLE_FRAGEN, weiter: false } });
    }
    const fertig = nr >= ALLE_FRAGEN;
    x.alleQuiz = fertig ? null : { nr };
    client.send('aufloesung', { richtig: true, ...basis, alle: { nr, von: ALLE_FRAGEN, fertig, weiter: !fertig } });
    if (!fertig || p.aktion || p.unten) return;
    const n = this.oeffneAlleTueren(p);
    if (n) client.send('meldung', { text: `🔓 ${n} Tür${n === 1 ? '' : 'en'} geöffnet` });
    this.beginneAlle(client, p, x);
  }

  alleDurchsucht(client, p, ids) {
    const x = this.extra.get(client?.sessionId);
    const w = this.wv(p.ebene);
    for (const id of ids) {
      const l = this.state.leichen.get(id);
      const b = l ? { id, art: 'leiche' } : w.behaelter.find(q => q.id === id);
      if (!b || (l && ((l.ebene ?? '') !== (p.ebene ?? '') || l.rest === 0))) continue;
      if (!l) {
        if (this.state.behaelter.get(id)) continue;
        if (b.art === 'auto' && !hat(p.rucksack, 'brechstange')) continue;
        if ((b.art === 'auto') && this.state.verbrannt.has('auto:' + b.id)) this.setzeInhalt(b.id, []);
        if (!this.inhalte.has(b.id) && this.ueberraschung(client, p, b)) break;   // Zombie springt heraus: Rest bleibt ungesucht
        this.befuelle(b, p, x);
        this.setzeInhalt(b.id, this.inhalte.get(b.id));
      } else this.leicheDurchsucht(client, p, id, false);
    }
    // Fundliste: alle geöffneten Behälter dieses Raums, die noch etwas enthalten
    const fund = new Set(x?.fundIds ?? []);
    for (const id of ids) if (this.state.behaelter.get(id) || this.state.leichen.get(id)) fund.add(id);
    if (x) x.fundIds = [...fund];
    this.fundSenden(client, p);
  }

  fundInhalt(id) { return this.state.leichen.has(id) ? this.leichenInhalt.get(id) : this.inhalte.get(id); }

  fundSenden(client, p, nur = null) {
    const x = this.extra.get(client?.sessionId);
    if (!x) return;
    const w = this.wv(p.ebene);
    x.fundIds = (x.fundIds ?? []).filter(id => (this.fundInhalt(id)?.length ?? 0) > 0);
    const eintraege = x.fundIds.map(id => ({ id, art: this.state.leichen.has(id) ? 'leiche' : w.behaelter.find(q => q.id === id)?.art ?? '', dinge: [...this.fundInhalt(id)] }));
    client.send('fundliste', { eintraege, neu: !nur });
  }

  // Aus der Fundliste nehmen: { id, i } ein Ding, { alle: true } alles, was in den Rucksack passt
  fundNimm(client, m) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.unten || p.zombie > 0 || this.state.phase !== 'spiel' || !x.fundIds?.length) return;
    const w = this.wv(p.ebene);
    const ort = id => this.state.leichen.get(id) ?? w.behaelter.find(q => q.id === id);
    const ids = m?.alle ? [...x.fundIds] : x.fundIds.includes(m?.id) ? [m.id] : [];
    const genommenAlle = [];
    for (const id of ids) {
      const o = ort(id), inhalt = this.fundInhalt(id);
      if (!o || !inhalt || (o.ebene ?? p.ebene ?? '') !== (p.ebene ?? '') || Math.hypot(o.x - p.x, o.y - p.y) > nimmWeite(w)) continue;
      const genommen = [];
      if (m?.alle) genommen.push(...this.einpacken(p, inhalt));
      else {
        const i = Number(m.i);
        if (!Number.isInteger(i) || i < 0 || i >= inhalt.length) continue;
        const tmp = [inhalt[i]];
        genommen.push(...this.einpacken(p, tmp));
        if (genommen.length) inhalt.splice(i, 1);
      }
      if (this.state.leichen.has(id)) this.state.leichen.get(id).rest = inhalt.length;
      else { this.setzeInhalt(id, inhalt); this.aufgaben?.gefunden(o, genommen); }
      genommenAlle.push(...genommen);
    }
    client.send('gefunden', { dinge: genommenAlle, rest: x.fundIds.reduce((n, id) => n + (this.fundInhalt(id)?.length ?? 0), 0) });
    this.fundSenden(client, p, true);
  }

  durchsucht(client, p, b) {
    if (b.art === 'leiche') return this.leicheDurchsucht(client, p, b.id);
    // Munitionskisten der Bundeswehr: für jeden Mitspieler ein eigener Inhalt (nie leer), der Haufen für die anderen bleibt unberührt
    if (b.art === 'bw_kiste') {
      const schluessel = b.id + '@' + (this.extra.get(client?.sessionId)?.spielerId ?? client?.sessionId ?? 'x');
      // je Mitspieler: 100 Schuss (sofort), 1 Schusswaffe und 1 Taschenlampe
      let extraGenommen = [];
      if (!this.inhalte.has(schluessel)) {
        const waffen = ['pistole', 'gewehr', 'schrotflinte', 'mp'];
        // selten (je Kiste und Mitspieler) ein Maschinengewehr oder Scharfschützengewehr statt der üblichen Waffe
        const sel = this.rnd();
        const waffe = sel < 0.25 ? 'mg' : sel < 0.33 ? 'scharfschuetze' : waffen[Math.floor(this.rnd() * waffen.length)];
        this.inhalte.set(schluessel, [waffe, 'taschenlampe']);
        this.munitionNehmen(p, 100);
        extraGenommen = ['munition'];
      }
      const inhalt = this.inhalte.get(schluessel);
      const genommen = [...extraGenommen, ...this.einpacken(p, inhalt)];
      this.aufgaben?.gefunden(b, genommen);
      return client?.send('gefunden', { dinge: genommen, rest: inhalt.length, kiste: b.id });
    }
    // ausgebrannt: nichts mehr zu holen
    if ((b.art === 'auto' || b.art === 'bus') && this.state.verbrannt.has((b.art === 'auto' ? 'auto:' : 'bus:') + b.id)) this.setzeInhalt(b.id, []);
    // Überraschungszombie: beim ersten Durchsuchen von Schrank/Spind/Müllcontainer/Auto springt selten einer heraus (nicht in Safe Rooms/Lager)
    if (!this.inhalte.has(b.id) && this.ueberraschung(client, p, b)) return;
    this.befuelle(b, p, this.extra.get(client?.sessionId));
    const inhalt = this.inhalte.get(b.id);
    const genommen = this.einpacken(p, inhalt);
    this.setzeInhalt(b.id, inhalt);
    this.aufgaben?.gefunden(b, genommen);
    client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
  }

  // Inhalt eines Behälters auswürfeln (einmalig, danach liegt er in this.inhalte)
  // Mit Spieler p (und seinen extra-Daten x): Munitionsglück (server/munitionsglueck.mjs) hebt dessen Munitionsgewicht nach Pechserie/Lage
  befuelle(b, p = null, x = null) {
    if (this.inhalte.has(b.id)) return;
    let art = b.art;
    // Belohnung: Schrank/Spind in einem Raum hinter einer Tür mit Rätsel-Schloss
    if ((art === 'schrank' || art === 'spind') && b.tuer && this.tuerArt(`${b.id.slice(0, b.id.lastIndexOf(':'))}:${b.tuer[0]},${b.tuer[1]}`) === 'raetsel') art = 'spind_belohnung';
    const tabelle = BEUTE[art] ?? [];
    const funde = [];
    const n = Math.min(5, 1 + (this.rnd() < 0.45 ? 1 : 0) + Math.round(((b.teile ?? 1) - 1) * 0.6));   // langes Regal aus mehreren Modulen: mehr Beute
    let faktoren = this.fundFaktoren(b);
    const glueck = p && x && !x.bot ? SpielRaum.einstellungen.munitionsglueck : null;
    if (glueck) faktoren = mitMunitionsglueck(faktoren, p, x.munSerie, glueck);
    for (let i = 0; i < n; i++) {
      const d = ziehe(tabelle, faktoren, this.rnd, BEUTE_BONUS[art]);
      if (d) funde.push(d);
    }
    if (glueck) { const mun = munitionsDinge(p); x.munSerie = naechsteSerie(x.munSerie, funde.some(d => mun.includes(d))); }
    funde.push(...(this.aufgaben?.missionsFunde(b.id) ?? []));   // Missionsgegenstand dieses Behälters
    this.setzeInhalt(b.id, funde);
  }

  // Überraschungszombie (Einstellung zombies.ueberraschung in %): true = Durchsuchen abgebrochen, Zombie steht daneben.
  // Je Behälter nur einmal (danach geht das Durchsuchen normal).
  ueberraschung(client, p, b) {
    if (!['schrank', 'spind', 'container', 'auto'].includes(b.art)) return false;
    if (p.sicher || safeRoomVon(this.welt, p)) return false;
    if (!this.ueberrascht) this.ueberrascht = new Set();
    if (this.ueberrascht.has(b.id)) return false;
    this.ueberrascht.add(b.id);
    const prozent = SpielRaum.einstellungen.ueberraschung ?? 3;
    if (!(this.rnd() * 100 < prozent)) return false;
    const w = this.wv(p.ebene);
    for (let versuch = 0; versuch < 24; versuch++) {
      const a = this.rnd() * Math.PI * 2, d = 18 + this.rnd() * 14;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!frei(w, x, y, W.zombieRadius + 1) || !sichtfrei(w, p.x, p.y, x, y)) continue;
      const id = this.setzeZombie(x, y, p.ebene ?? '');
      const z = this.state.zombies.get(id), info = this.zombieInfo.get(id);
      z.jagt = true; z.richtung = Math.atan2(p.y - y, p.x - x);
      info.ziel = client?.sessionId ?? null; info.steht = false; info.schlaeft = false; info.verloren = 0;
      this.broadcast('entdeckt', { x, y, ebene: p.ebene ?? '' });
      client?.send('meldung', { text: '🧟 Ein Zombie springt heraus!' });
      return true;
    }
    return false;   // kein Platz: nichts passiert
  }

  // Gegenstände in den Rucksack (Munition direkt zur Pistole); Rest bleibt liegen
  einpacken(p, inhalt) {
    const genommen = [];
    let tascheZu = false;
    for (let i = 0; i < inhalt.length;) {
      const d = inhalt[i];
      if (d === 'munition') { this.munitionNehmen(p, MUNITION_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'pfeil') { p.pfeile = Math.min(PFEILE_MAX, p.pfeile + PFEILE_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'granate40') { p.granaten = Math.min(GRANATEN_MAX, (p.granaten ?? 0) + GRANATEN_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
      // in die Hand bzw. anziehen, wenn frei – das braucht keinen Rucksackplatz
      if (d === 'granate' && WP.handgranatenPlatz(p) >= 0) { p.handgranaten = Math.min(HANDGRANATEN_MAX, (p.handgranaten ?? 0) + 1); genommen.push(d); inhalt.splice(i, 1); continue; }
      if (DINGE[d]?.waffe && !p.waffe && !p.faust) { p.waffe = d; genommen.push(d); inhalt.splice(i, 1); continue; }
      // Maschinengewehr schlägt jede andere Waffe: sofort in die Hand (die bisherige wandert in den Rucksack, wenn Platz ist),
      // sonst liegt es unbemerkt im Rucksack und „schießt nicht“, weil nur die Waffe in der Hand feuert
      if (d === 'mg' && p.waffe && p.waffe !== 'mg' && kannAufnehmen(p.rucksack, p.plaetze, p.waffe)) { fuegeHinzu(p.rucksack, p.plaetze, p.waffe); p.waffe = 'mg'; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'taschenlampe' && !(p.lampe > 0)) { p.lampe = LAMPE_DAUER; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'kleidung' && !(p.kleidung > 0)) { p.kleidung = 100; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (fuegeHinzu(p.rucksack, p.plaetze, d) > 0) { genommen.push(d); inhalt.splice(i, 1); continue; }
      if (istTasche(d) && blockGrund(p.rucksack, p.plaetze, d) === 'tasche') tascheZu = true;
      i++;
    }
    if (tascheZu) this.clients.find(c => this.state.spieler.get(c.sessionId) === p)?.send('meldung', { text: '🎒 Du trägst schon eine Tasche – eine zweite geht nicht' });
    return genommen;
  }

  leicheDurchsucht(client, p, id, nimm = true) {
    const l = this.state.leichen.get(id);
    if (!l) return;
    const inhalt = this.leichenInhalt.get(id) ?? [];
    if (nimm) {
      const genommen = this.einpacken(p, inhalt);
      l.rest = inhalt.length;
      client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
    }
    // draußen selten ein Zettel mit einem Hinweis auf einen Missionsgegenstand (Suchkreis wird halbiert)
    if (!l.fest && !l.ebene && !this.zettelBei?.has(id)) {
      (this.zettelBei ??= new Set()).add(id);
      if (this.rnd() < ZETTEL_CHANCE) {
        const d = this.missionHinweis();
        if (d) client?.send('meldung', { text: `📝 Ein Zettel in der Tasche: Hinweis auf ${DINGE[d].zeichen} ${DINGE[d].name} – der Suchkreis auf der Karte ist kleiner geworden`, lang: true });
      }
    }
  }

  // Schnittstelle für Hinweise (Zettel, gerettete Menschen): Suchkreis halbieren; ding leer = zufällig ein offener Gegenstand; liefert den Gegenstand oder null
  missionHinweis(ding = '') { return this.aufgaben?.missionHinweis(ding) ?? null; }

  // Schwierigkeit jetzt: Level-Tabelle × Tage seit Levelbeginn × Regler (server/schwierigkeit.mjs)
  schwierigkeit() {
    const e = SpielRaum.einstellungen;
    return schwierigkeit({ level: this.state.level || 1, tage: Math.max(0, (this.state.tag || 1) - 1), regler: e.schwierigkeit ?? 'normal' });
  }

  // Fundhäufigkeiten (Einstellung je Gegenstand) mal Beute-/Munitionsfaktor; Missionsorte behalten die Grundausstattung (Faktor 1)
  fundFaktoren(b) {
    const f = SpielRaum.einstellungen.funde ?? {};
    const sw = this.schwierigkeit();
    if (sw.beute === 1 && sw.munition === 1) return f;
    if (this.aufgaben?.mission?.some(m => b.id.startsWith(`h${m.nr}eg:`) || b.id.startsWith(`h${m.nr}keller:`) || b.id.startsWith(`h${m.nr}dach:`))) return f;
    const MUN = new Set(['munition', 'pfeil', 'granate40', 'granate']);
    const aus = {};
    for (const d of Object.keys(DINGE)) aus[d] = (f[d] ?? 10) * (MUN.has(d) ? sw.munition : sw.beute);
    return aus;
  }

  neueLeiche(z, fest = false) {
    const inhalt = [];
    // selten (zusammen 5 %) und oft (zusammen 55 %), jeweils mit der Fundhäufigkeit je Gegenstand
    const f = SpielRaum.einstellungen.funde ?? {};
    const anteile = [
      ...LEICHE_SELTEN.map(d => [d, 0.05 / LEICHE_SELTEN.length * (f[d] ?? 10) / 10]),
      ...LEICHE_OFT.map(d => [d, 0.55 / LEICHE_OFT.length * (f[d] ?? 10) / 10]),
    ];
    const summe = anteile.reduce((a, [, g]) => a + g, 0);
    let r = this.rnd() * Math.max(1, summe);
    for (const [d, g] of anteile) { r -= g; if (r < 0) { inhalt.push(d); break; } }
    const id = 'l' + (this.naechsteLeichenId++);
    const l = new Leiche();
    l.x = z.x; l.y = z.y; l.richtung = z.richtung; l.rest = inhalt.length; l.alter = 0; l.blass = 0; l.variante = z.variante ?? 0; l.ebene = z.ebene ?? ''; l.fest = fest;
    this.state.leichen.set(id, l);
    this.leichenInhalt.set(id, inhalt);
    if (fest) return id;
    // höchstens LEICHEN_MAX (ohne die festen Toten in Wohnungen): die älteste verschwindet
    const lose = [...this.state.leichen].filter(([, q]) => !q.fest);
    if (lose.length > LEICHEN_MAX) { this.state.leichen.delete(lose[0][0]); this.leichenInhalt.delete(lose[0][0]); }
    return id;
  }

  leichenAltern(dt) {
    for (const [id, l] of this.state.leichen) {
      if (l.fest) continue;
      l.alter = (l.alter ?? 0) + dt;
      if (l.alter > LEICHE_DAUER) { this.state.leichen.delete(id); this.leichenInhalt.delete(id); continue; }
      const b = blassStufe(LEICHE_DAUER - l.alter);
      if (l.blass !== b) l.blass = b;
    }
  }

  // Braucht ein Bodengegenstand einen Rucksackplatz? (Waffe in leere Hand, Handgranaten-Platz, Munition/Pfeile/Granaten, Lampe, Kleidung gehen direkt)
  bodenBrauchtPlatz(p, d) {
    return !((DINGE[d]?.waffe && !p.waffe && !p.faust) || (d === 'granate' && WP.handgranatenPlatz(p) >= 0) || d === 'munition' || d === 'pfeil' || d === 'granate40' || (d === 'taschenlampe' && !(p.lampe > 0)) || (d === 'kleidung' && !(p.kleidung > 0)));
  }

  // Passt das Angebot 'an' (Liste einzelner Dinge) noch in den Rucksack? (Das eigene Angebot ist schon herausgenommen.)
  tauschPasst(p, an) {
    const t = [...p.rucksack];
    for (const d of an) if (fuegeHinzu(t, p.plaetze, d) < 1) return false;
    return true;
  }

  // Munition aufnehmen: in den Zähler, Überschuss als Munitionskisten (server/munition.mjs)
  munitionNehmen(p, n, client = null) {
    const { kisten } = munitionGeben(p, n);
    if (kisten > 0) client?.send('meldung', { text: `📦 Munition voll – ${kisten} Munitionskiste${kisten > 1 ? 'n' : ''} eingepackt` });
  }

  benutze(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!p || p.unten || p.zombie > 0 || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    const d = dingId(p.rucksack[i]);
    if (d === 'spritze') return this.spritze(client, p, i);
    if (d === 'radio') { if (!this.radios.aufstellen(client, i)) client.send('meldung', { text: '📻 Das Radio geht jetzt nicht an' }); return; }
    if (d === 'granate') { if (!this.granaten.werfen(client)) client.send('meldung', { text: '💣 Jetzt geht kein Wurf' }); return; }
    if (d === 'wasser') { p.durst = Math.min(100, p.durst + 45); nimmEins(p.rucksack, i); }
    else if (d === 'essen') { p.hunger = Math.min(100, p.hunger + 45); nimmEins(p.rucksack, i); }
    else if (d === 'schokoriegel') { p.hunger = Math.min(100, p.hunger + 20); nimmEins(p.rucksack, i); }
    else if (DINGE[d]?.plaetze) {
      const bonus = this.fkRucksack(p);
      if (DINGE[d].plaetze <= p.plaetze - bonus) return client.send('meldung', { text: 'Dein Rucksack ist schon so groß' });
      p.plaetze = DINGE[d].plaetze + bonus; nimmEins(p.rucksack, i);
      client.send('meldung', { text: `${DINGE[d].zeichen} Umgepackt – jetzt ${p.plaetze} Plätze` });
    }
    else if (d === 'kleidung') {
      if (p.kleidung >= 100) return client.send('meldung', { text: 'Du trägst schon feste Kleidung' });
      p.kleidung = 100; nimmEins(p.rucksack, i);
      client.send('meldung', { text: '🧥 Feste Kleidung angezogen – Bisse gehen seltener durch' });
    }
    else if (d === 'seil') { client.send('meldung', { text: '🪢 Ein Seil – brauchst du später am Fluss' }); }
    else if (d === 'taschenlampe') { client.send('meldung', { text: '🔦 Schaltet sich in Häusern von selbst ein (hält etwa eine Stunde)' }); }
    else if (d === 'funkgeraet') { client.send('meldung', { text: '📻 Mit einem zweiten Funkgerät im Rucksack hörst du die Mitspieler überall' }); }
    else if (d === 'verband') {
      if (p.hp >= 100) return client.send('meldung', { text: 'Du bist nicht verletzt' });
      p.hp = Math.min(100, p.hp + 45 * this.fkWert(p, 'heilen')); nimmEins(p.rucksack, i);
    } else if (DINGE[d]?.waffe) {
      const alt = WP.inDieHand(this, client, p, this.extra.get(client.sessionId), d, SpielRaum.einstellungen);   // freier Waffenplatz, sonst Tausch mit der Hand
      // Hand ↔ Rucksack: ein Messer vom Stapel nehmen; die bisherige Waffe kommt in den Rucksack (nicht auf den Stapel, wenn dort kein Platz frei ist)
      nimmEins(p.rucksack, i);
      if (alt && fuegeHinzu(p.rucksack, p.plaetze, alt) < 1) this.legeHin(alt, p.x, p.y, p.ebene);
      client.send('meldung', { text: `${DINGE[d].name} in der Hand` });
    } else if (d === 'munitionskiste') {
      if (p.munition >= MUNITION_MAX) return client.send('meldung', { text: '📦 Deine Munition ist schon voll' });
      kisteOeffnen(p);
      client.send('meldung', { text: `📦 Munitionskiste geöffnet: +${MUNITIONSKISTE_SCHUSS} Schuss` });
    } else if (d === 'bretter') {
      client.send('meldung', { text: 'Bretter: an einer Tür verbarrikadieren (Taste an der Tür)' });
    }
  }

  spritze(client, p, i) {
    // zuerst sich selbst, sonst den nächsten infizierten Mitspieler daneben
    let ziel = p.infektion > 0 ? p : null;
    if (!ziel) {
      let bd = SPRITZE_ABSTAND;
      for (const o of this.state.spieler.values()) {
        if (o === p || o.infektion <= 0 || o.zombie > 0) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) { bd = d; ziel = o; }
      }
    }
    if (!ziel) return client.send('meldung', { text: 'Niemand hier ist infiziert – hebe die Spritze auf' });
    nimmEins(p.rucksack, i);
    ziel.infektion = 0;
    this.broadcast('meldung', {
      text: ziel === p ? `💉 ${p.name} hat sich die Rettungsspritze gesetzt` : `💉 ${p.name} hat ${ziel.name} die Rettungsspritze gesetzt`,
    });
  }

  // Bodengegenstand einsammeln (Rucksack muss Platz haben, wenn er dort landet)
  nimmAuf(client, p, id, b) {
    const d = b.ding;
    if (DINGE[d]?.waffe && !p.waffe && !p.faust) p.waffe = d;
    else if (d === 'granate' && WP.handgranatenPlatz(p) >= 0) p.handgranaten = Math.min(HANDGRANATEN_MAX, (p.handgranaten ?? 0) + 1);   // Handgranaten-Platz: gleich in den Vorrat
    else if (d === 'mg' && p.waffe && p.waffe !== 'mg' && kannAufnehmen(p.rucksack, p.plaetze, p.waffe)) { fuegeHinzu(p.rucksack, p.plaetze, p.waffe); p.waffe = 'mg'; }   // MG sofort in die Hand
    else if (d === 'munition') this.munitionNehmen(p, MUNITION_PRO_FUND, client);
    else if (d === 'pfeil') p.pfeile = Math.min(PFEILE_MAX, p.pfeile + 1);   // einzelner Pfeil vom Boden
    else if (d === 'granate40') p.granaten = Math.min(GRANATEN_MAX, (p.granaten ?? 0) + 1);
    else if (d === 'taschenlampe' && !(p.lampe > 0)) p.lampe = LAMPE_DAUER;
    else if (d === 'kleidung' && !(p.kleidung > 0)) p.kleidung = 100;
    else {
      const grund = blockGrund(p.rucksack, p.plaetze, d);
      if (grund === 'tasche') return client?.send('meldung', { text: '🎒 Du trägst schon eine Tasche – eine zweite geht nicht' });
      if (grund) return client?.send('meldung', { text: '🎒 Rucksack voll' });
      fuegeHinzu(p.rucksack, p.plaetze, d);
    }
    this.state.boden.delete(id);
    client?.send('meldung', { text: `Aufgehoben: ${DINGE[d]?.zeichen ?? ''} ${DINGE[d]?.name ?? d}` });
  }

  // Aufheben mit Auswahl: { id, platz? } – bei vollem Rucksack räumt "platz" den Platz frei (Gegenstand fällt zu Boden)
  aufhebenWahl(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten || p.zombie > 0 || this.state.phase !== 'spiel' || typeof m?.id !== 'string') return;
    const b = this.state.boden.get(m.id);
    if (!b || (b.ebene ?? '') !== p.ebene || Math.hypot(b.x - p.x, b.y - p.y) >= reichVon(this.wv(p.ebene), AKTION_ABSTAND)) return;
    const d = b.ding;
    // wandert der Gegenstand nicht in den Rucksack (Waffe/Munition/Lampe/Kleidung), braucht er keinen Platz
    if (this.bodenBrauchtPlatz(p, d)) {
      if (blockGrund(p.rucksack, p.plaetze, d) === 'tasche') return client.send('meldung', { text: '🎒 Du trägst schon eine Tasche – eine zweite geht nicht' });
      if (!kannAufnehmen(p.rucksack, p.plaetze, d)) {
        const i = Number(m.platz);
        if (!Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return client.send('meldung', { text: '🎒 Rucksack voll – wähle, was du ablegst' });
        if (DINGE[dingId(p.rucksack[i])]?.mission) return client.send('meldung', { text: '🧩 Missionsgegenstände lassen sich nur in die Safe-Room-Kiste legen' });
        // ein volles Fach wird zum Platzmachen ganz geleert (ein Stück allein würde das Fach nicht freigeben)
        const alt = nimmStapel(p.rucksack, i);
        for (let k = 0; k < alt.n; k++) this.legeHin(alt.id, p.x, p.y, p.ebene);
      }
    }
    this.nimmAuf(client, p, m.id, b);
  }

  // Rucksack umsortieren: Fach „von“ mit Fach „nach“ vertauschen (ein leeres Ziel hinter den Gegenständen = ans Ende schieben)
  rucksackTausch(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || !verschiebe(p.rucksack, m?.von, m?.nach, p.plaetze)) return;
    this.speichereSpieler(client.sessionId);
  }

  wegwerfen(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!p || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    const dd = dingId(p.rucksack[i]);
    if (DINGE[dd]?.mission) return client.send('meldung', { text: `${DINGE[dd].zeichen} ${DINGE[dd].name} ist für die Mission wichtig – nur in die Safe-Room-Kiste legen` });
    const ding = nimmEins(p.rucksack, i);
    this.legeHin(ding, p.x, p.y, p.ebene);
  }

  legeHin(ding, x, y, ebene = '') {
    const b = new BodenDing(); b.ebene = ebene;
    const w = this.rnd() * Math.PI * 2;
    b.x = x + Math.cos(w) * 10; b.y = y + Math.sin(w) * 10; b.ding = ding; b.alter = 0; b.blass = 0;
    const id = 'd' + (this.naechsteBodenId++);
    this.state.boden.set(id, b);
    return id;
  }

  bodenAltern(dt) {
    for (const [id, b] of this.state.boden) {
      b.alter = (b.alter ?? 0) + dt;
      if (DINGE[b.ding]?.mission) continue;   // Missionsgegenstände verschwinden nie
      if (b.alter > BODEN_DAUER) { this.state.boden.delete(id); continue; }
      const st = blassStufe(BODEN_DAUER - b.alter);
      if (b.blass !== st) b.blass = st;
    }
  }

  // Notvorrat im Safe-Room-Kühlschrank: Wasser bzw. Essen nur bei unter 30 %, höchstens einmal je Spieler und Spielstunde
  kuehlschrank(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten || p.zombie > 0) return;
    const s = safeRoomVon(this.welt, p), k = s && this.wv(s.ebene).kuehlschrank;
    if (!k || Math.hypot(k.x - p.x, k.y - p.y) > reichVon(this.wv(p.ebene), AKTION_ABSTAND + 24)) return;
    const sage = text => client.send('meldung', { text });
    const stunde = (SpielRaum.einstellungen.tagMinuten || 48) * 60 / 24;
    const schluessel = this.extra.get(client.sessionId)?.spielerId ?? client.sessionId;
    this.kuehlLetzte ??= new Map();
    const letzte = this.kuehlLetzte.get(schluessel);
    if (letzte !== undefined && this.state.zeit - letzte < stunde) {
      return sage(`🧊 Du hast gerade erst etwas genommen – in ${Math.ceil((stunde - (this.state.zeit - letzte)) / 60)} Min. wieder`);
    }
    if (p.durst >= 30 && p.hunger >= 30) return sage('🧊 Der Kühlschrank ist für den Notfall: erst bei unter 30 % Wasser oder Hunger');
    const ding = p.durst <= p.hunger ? 'wasser' : 'essen';
    if (!kannAufnehmen(p.rucksack, p.plaetze, ding)) return sage('Dein Rucksack ist voll');
    fuegeHinzu(p.rucksack, p.plaetze, ding);
    this.kuehlLetzte.set(schluessel, this.state.zeit);
    sage(`🧊 Aus dem Kühlschrank: ${DINGE[ding].zeichen} ${DINGE[ding].name}`);
  }

  // Das Bundeswehr-Lager zählt als Safe House, solange es steht: Ausruhen, Abmelden/Speichern, Infektion ruht, Vorratskisten
  imLagerSafe(p) {
    return !p.ebene && this.state.stuetzpunkt === 'steht' && !!this.welt.stuetzpunkt && imLager(this.welt.stuetzpunkt, p.x, p.y);
  }

  // Vorratskiste des Lagers in Reichweite (nur solange das Lager steht), sonst null
  lagerKisteNah(p) {
    if (p.ebene || this.state.stuetzpunkt !== 'steht') return null;
    let best = null, bd = AKTION_ABSTAND + 24;
    for (const t of this.welt.stuetzpunkt?.teile ?? []) {
      if (t.art !== 'vorratskiste') continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  kiste(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten) return;
    let kiste;
    const lk = this.lagerKisteNah(p);
    if (lk) kiste = this.state.safes.get(lk.id).kiste;
    else {
      const s = safeRoomVon(this.welt, p), k = s && this.wv(s.ebene).kiste;
      if (!k || Math.hypot(k.x - p.x, k.y - p.y) > reichVon(this.wv(p.ebene), AKTION_ABSTAND + 24)) return;
      kiste = this.state.safes.get(s.id).kiste;
    }
    const i = Number(m?.platz);
    if (m?.richtung === 'rein') {
      // ganzer Stapel (so viel, wie in die Kiste passt)
      if (!Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
      const id = dingId(p.rucksack[i]), n = dingN(p.rucksack[i]);
      const rein = Math.min(n, platzFuer(kiste, KISTE_PLAETZE, id, true));
      if (rein < 1) return;
      fuegeHinzu(kiste, KISTE_PLAETZE, id, rein, true); nimmEins(p.rucksack, i, rein);
    } else if (m?.richtung === 'raus') {
      if (!Number.isInteger(i) || i < 0 || i >= kiste.length) return;
      const id = dingId(kiste[i]), n = dingN(kiste[i]);
      const raus = Math.min(n, platzFuer(p.rucksack, p.plaetze, id));
      if (raus < 1) { if (blockGrund(p.rucksack, p.plaetze, id) === 'tasche') client.send('meldung', { text: '🎒 Du trägst schon eine Tasche – eine zweite geht nicht' }); return; }
      fuegeHinzu(p.rucksack, p.plaetze, id, raus); nimmEins(kiste, i, raus);
    }
  }

  stelleRaetsel(client, zweck = null) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    if (offen && offen.bis > Date.now()) return;   // schon eine Frage offen
    const fragen = holeFragen();
    const f = waehleFrage(fragen, this.gestellt, this.rnd);
    if (!f) return client.send('meldung', { text: 'Das Schloss klemmt – keine Rätsel gefunden' });
    this.gestellt.add(f.id);
    const { antworten, richtigIndex } = mischeAntworten(f, this.rnd);
    this.offeneRaetsel.set(client.sessionId, { id: f.id, richtigIndex, seite: f.seite, richtig: f.richtig, bis: Date.now() + 120000, zweck });
    client.send('raetsel', { id: f.id, thema: f.thema, frage: f.frage, antworten, geloest: this.state.torGeloest, noetig: TOR_RAETSEL, tuer: zweck?.art === 'tuer', alle: zweck?.art === 'alle' ? { nr: zweck.nr, von: ALLE_FRAGEN } : null, handel: zweck?.art === 'handel' ? { nr: zweck.nr, von: zweck.von } : null });
  }

  antwort(client, m) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!offen || !p || m?.id !== offen.id) return;
    this.offeneRaetsel.delete(client.sessionId);
    const richtig = Number(m.index) === offen.richtigIndex && offen.bis > Date.now();
    if (offen.zweck?.art === 'handel') return this.stuetzpunkt.raetselAntwort(client, p, offen, richtig);
    if (offen.zweck?.art === 'alle') return this.alleAntwort(client, p, offen, richtig);
    if (offen.zweck?.art === 'tuer') {
      const z = offen.zweck;
      if (richtig) { this.setzeTuer(z.key, true); this.xpGeben(client.sessionId, 'raetsel'); client.send('meldung', { text: '🔓 Das Schloss springt auf' }); }
      else this.laerm((z.tuer.x + 0.5) * KACHEL, (z.tuer.y + 0.5) * KACHEL, 300, true, z.ebene);
      client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite });
      return;
    }
    const tor = this.welt.tor;
    if (richtig) this.xpGeben(client.sessionId, 'raetsel');
    if (richtig && this.state.torGeloest < TOR_RAETSEL) {
      this.state.torGeloest++;
      const offenJetzt = this.state.torGeloest >= TOR_RAETSEL;
      this.broadcast('meldung', {
        text: offenJetzt ? `🔓 ${p.name} hat das letzte Schloss geknackt – das Tor ist offen!`
          : `🔐 ${p.name} hat ein Schloss geknackt (${this.state.torGeloest}/${TOR_RAETSEL})`, lang: true,
      });
      if (offenJetzt) this.broadcast('tor', {});
    } else if (!richtig) {
      // falsche Antwort: das Schloss klappert laut
      this.laerm((tor.x + 1) * KACHEL, (tor.y + 1) * KACHEL, 420, true);
      this.broadcast('meldung', { text: `${p.name}: falsche Antwort – das Schloss klappert laut!` }, { except: client });
    }
    client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite });
  }

  ausruhen(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || !p.sicher) return client.send('meldung', { text: 'Abmelden geht nur in einem Safe Room' });
    this.speichereSpieler(client.sessionId);
    this.speichereWelt();
    client.send('ausgeruht', {});
  }

  // ---------- Simulation ----------

  // Rechenzeit je Teil sammeln; alle 10 s als Zusammenfassung für die Einstellungsseite ablegen
  messen(teil, t0) {
    const ms = performance.now() - t0;
    const l = this.leistungLauf ??= { seit: Date.now(), teile: {} };
    const e = l.teile[teil] ??= { n: 0, summe: 0, max: 0 };
    e.n++; e.summe += ms; if (ms > e.max) e.max = ms;
    if (teil === 'takt' && Date.now() - l.seit >= 10_000) {
      this.leistung = {
        zeit: Date.now(),
        teile: Object.fromEntries(Object.entries(l.teile).map(([k, v]) => [k, { mittel: +(v.summe / v.n).toFixed(2), max: +v.max.toFixed(1), n: v.n }])),
        zombies: this.state.zombies.size, menschen: this.state.menschen?.size ?? 0, fahrzeuge: this.state.fahrzeuge?.size ?? 0,
        spieler: this.state.spieler.size, speicherMB: Math.round(process.memoryUsage().rss / 1048576),
      };
      this.leistungLauf = { seit: Date.now(), teile: {} };
      // einmal pro Minute ins Add-on-Log (so lässt sich die Last auf dem Pi nachlesen)
      if ((this.leistungZaehler = (this.leistungZaehler ?? 0) + 1) % 6 === 0) {
        const t = this.leistung.teile, f = k => t[k] ? `${k} ${t[k].mittel}/${t[k].max}` : '';
        console.log(`Leistung (ms Mittel/Spitze): ${['takt', 'spieler', 'zombies', 'menschen', 'verkehr', 'wegefeld', 'versand', 'sprache'].map(f).filter(Boolean).join(', ')} · ${this.leistung.zombies} Zombies, ${this.leistung.spieler} Spieler, ${this.leistung.speicherMB} MB`);
      }
    }
  }

  schritt(dt) {
    const s = this.state;
    if (s.spieler.size === 0) return;
    if (this.finale?.schritt(dt)) return;   // Finale: Abspann nach dem Atomschlag, die Welt steht still
    this.speicherUhr -= dt;
    if (this.speicherUhr <= 0) { this.speicherUhr = SPEICHER_TAKT; this.speichereAlles(); }
    if (s.phase === 'erwischt') {
      this.erwischtSeit += dt;
      if (this.erwischtSeit > 6) this.zurueckInDieSafeRooms();
      return;
    }
    const zr = SpielRaum.einstellungen.zeitraffer || 1;   // Testschalter: Spielzeit läuft schneller
    s.zeit += dt * zr;
    const tagVorher = s.tag;
    s.tag = Math.floor(s.zeit / ((SpielRaum.einstellungen.tagMinuten || 48) * 60)) + 1;
    if (s.tag !== tagVorher) this.tageszeitenUebernehmen();   // Schwierigkeit steigt je Spieltag (Nachtlänge)
    // Tageszeit: ein Spieltag dauert tagMinuten echte Minuten
    const vorher = istNacht(s.uhr);
    const raffer = this.aufgaben?.warteRaffer?.() ?? 1;   // Warten am Abholpunkt: nur die Uhr läuft schneller
    s.uhr = (s.uhr + dt * zr * raffer * 1440 / ((SpielRaum.einstellungen.tagMinuten || 48) * 60)) % 1440;
    this.nebelSchritt();
    if (istNacht(s.uhr) !== vorher) this.broadcast('meldung', { text: istNacht(s.uhr) ? '🌙 Die Nacht bricht herein – Zombies werden mehr. Taschenlampe bereit?' : '🌅 Es wird Tag', lang: true });
    this.feldZeit -= dt; this.feldAlter = (this.feldAlter ?? 0) + dt;
    if (this.feldZeit <= 0) {
      this.feldZeit = 0.4;
      // nur neu rechnen, wenn ein Spieler die Kachel gewechselt hat (oder alle 5 s zur Sicherheit)
      const sig = [...s.spieler.values()].filter(p => !p.unten && !(p.zombie > 0)).map(p => `${p.ebene ?? ''}:${Math.floor(p.x / KACHEL)},${Math.floor(p.y / KACHEL)}`).sort().join('|')
        + '#' + [...s.spieler.values()].map(p => p.ebene ?? '').sort().join(',');
      if (sig !== this.feldSig || this.feldAlter > 5) {
        const tf = performance.now();
        this.feldSig = sig; this.feldAlter = 0;
        for (const e of new Set([...s.spieler.values()].map(p => p.ebene ?? ''))) this.baueFeld(e);
        this.messen('wegefeld', tf);
      }
    }

    let t0 = performance.now();
    for (const [id, p] of s.spieler) {
      const x = this.extra.get(id);
      if (!x) continue;
      // untätiger Mensch: die Bot-Steuerung übernimmt (Sicht „x.bot“ = x.afkBot, Schreibzugriffe gehen auf x)
      let xs = x;
      if (!x.bot) { this.afkPruefen(id, p, x); if (x.afkBot) xs = new Proxy(x, { get: (t, k) => k === 'bot' ? t.afkBot : t[k] }); }
      if (xs.bot) {
        try { botSchritt(this, id, p, xs, dt); } catch (e) { x.eingabe = { dx: 0, dy: 0, s: false }; if (!x.fehlerGemeldet) { console.error('Bot-Fehler:', e.message); x.fehlerGemeldet = true; } }
      }
      this.spielerSchritt(id, p, xs, dt);
      this.beduerfnisse(p, x, dt * zr);
      if (p.kamera || this.unsterblich(p, x)) { p.hp = 100; p.unten = false; p.infektion = 0; p.durst = Math.max(p.durst, 30); p.hunger = Math.max(p.hunger, 30); }
      this.aktionSchritt(id, p, x, dt);
    }
    this.messen('spieler', t0); t0 = performance.now();
    this.spiegleSafeTueren();
    this.welle?.schritt(dt);
    // Entlastung: weit von allen Spielern (und vom Stützpunkt) entfernte Zombies nur jeden FERN_TAKT-ten Takt mit gesammeltem dt
    this.takteGezaehlt = (this.takteGezaehlt ?? 0) + 1;
    this.berechneNah();
    this.baueZombieRaster();
    this.hunde?.schritt(dt);
    for (const [id, z] of s.zombies) {
      const info = this.zombieInfo.get(id);
      if (!info) continue;
      let d = dt;
      if (this.istFern(z.x, z.y, z.ebene)) {
        info.stau = (info.stau ?? 0) + dt;
        info.nr ??= Number(id.slice(1)) || 0;
        info.dran = (this.takteGezaehlt + info.nr) % FERN_TAKT === 0;
        if (!info.dran) continue;
        d = info.stau; info.stau = 0;
      } else { info.stau = 0; info.dran = true; }
      this.zombieSchritt(id, z, d);
    }
    this.messen('zombies', t0); t0 = performance.now();
    this.stadt?.schritt(dt);
    this.messen('menschen', t0); t0 = performance.now();
    this.verkehr?.schritt(dt);
    this.zRaster = null;
    this.messen('verkehr', t0); t0 = performance.now();
    this.brand?.schritt(dt);
    this.aufgaben?.schritt(dt);
    this.messen('feuer', t0); t0 = performance.now();
    this.stuetzpunkt?.schritt(dt);
    this.granaten?.schritt(dt);
    this.radios?.schritt(dt);
    this.szeneB11?.schritt(dt);
    this.messen('stuetzpunkt', t0);
    this.sprachSchritt(dt);
    this.aufhelfen(dt);
    this.leichenAltern(dt);
    this.bodenAltern(dt);
    this.tauschPruefen();
    this.zombiesAuffuellen(dt);

    // Bots zählen nicht: erwischt, sobald alle echten (verbundenen) Spieler unten oder verwandelt sind
    const echte = [...s.spieler].filter(([sid, p]) => p.verbunden !== false && !this.extra.get(sid)?.bot);
    const stehend = echte.filter(([, p]) => !p.unten && !(p.zombie > 0));
    if (echte.length > 0 && stehend.length === 0) {
      s.phase = 'erwischt';
      this.erwischtSeit = 0;
      this.broadcast('meldung', { text: 'Alle erwischt! Ihr schleppt euch in die Safe Rooms …', lang: true });
    }
  }

  // Türen automatisch öffnen: 0,5 s vor einer (normalen, unverbarrikadierten) Zimmertür stehen oder dagegenlaufen.
  // Seitlich vorbeilaufen zählt nicht; verschlossene Türen (Rätsel/Schlüssel) öffnen nie von selbst. Nur Spieler.
  tuerAuto(p, x, dt, e) {
    const vorher = x.tuerPos; x.tuerPos = { x: p.x, y: p.y };
    const reset = () => { x.tuerT = 0; x.tuerKey = null; };
    const sp = x.tuerSperre;   // nach manuellem Schließen: Sperre bis > 80 px Abstand zur Tür
    if (sp && (Math.hypot(p.x - sp.x, p.y - sp.y) > reichVon(this.wv(p.ebene), 80) || (p.ebene ?? '') !== sp.ebene)) x.tuerSperre = null;
    if (x.bot || p.unten || p.aktion || p.zombie > 0 || this.state.phase !== 'spiel' || x.ankunft || !p.ebene) return reset();
    const wahl = this.tuerWahl(p);
    if (!wahl?.tuer) return reset();
    const k = this.tuerKontext(p, 'auf');
    if (k?.art !== 'tuer_auf' || this.tuerBarrikade(k.key) > 0) return reset();
    if (x.tuerSperre?.key === k.key) return reset();
    const l = Math.hypot(e.dx, e.dy);
    if (l > 0.05) {   // drückt die Eingabe auf die Tür zu (±45°) und kommt nicht voran?
      const KW = kachelVon(this.wv(p.ebene)), wx = (wahl.tuer.x + 0.5) * KW - p.x, wy = (wahl.tuer.y + 0.5) * KW - p.y, wl = Math.hypot(wx, wy) || 1;
      if ((e.dx * wx + e.dy * wy) / (l * wl) < Math.SQRT1_2) return reset();
      if (vorher && Math.hypot(p.x - vorher.x, p.y - vorher.y) > 1.5 * tempoVon(this.wv(p.ebene))) return reset();
    }
    if (x.tuerKey !== k.key) { x.tuerKey = k.key; x.tuerT = 0; }
    x.tuerT = (x.tuerT ?? 0) + dt;
    if (x.tuerT < 0.5) return;
    reset();
    this.setzeTuer(k.key, true);
    this.laerm(p.x, p.y, 60, true, p.ebene);
  }

  spielerSchritt(id, p, x, dt) {
    const welt = this.wv(p.ebene);
    const safe = safeRoomVon(this.welt, p);
    p.sicher = safe ? safe.id : this.imLagerSafe(p) ? 'lager' : '';
    if (safe) { x.letzterSafe = safe.id; if (!x.bot) this.teamSafe = safe.id; }   // Team-Safe: zuletzt von einem echten Spieler betreten
    if (p.unten || p.anBord || p.kamera) { this.eingabeVerwerfen(p, x); return; }   // an Bord eines Evakuierungsfahrzeugs: sitzt, die Position folgt dem Fahrzeug (server/aufgaben.mjs)
    if (x.sprungT > 0) { x.sprungT -= dt; this.eingabeVerwerfen(p, x); return; }   // Zaunsprung läuft: keine Bewegung, Client und Server bleiben einig
    const schritte = this.eingabeSchritte(p, x, dt);
    const e = x.eingabe;
    if (p.zombie > 0) {
      for (const [se, sd] of schritte) {
        const l = Math.hypot(se.dx, se.dy);
        if (l <= 0.05) continue;
        const f = Math.min(1, l) * W.zombieTempoJagen * 1.15 * sd * tempoVon(this.wv(p.ebene)) * this.baumTempo(this.wv(p.ebene), p);
        bewege(this.wv(p.ebene), p, se.dx / l * f, se.dy / l * f, W.spielerRadius);
        p.richtung = Math.atan2(se.dy, se.dx);
      }
      return this.zombieSpielerSchritt(p, x, e, 0, dt);   // Bewegung ist schon erledigt (laenge 0): nur Übergänge und Bisse
    }
    { const l = Math.hypot(e.dx, e.dy); p.schleicht = e.s || (l > 0 && l < 0.55); }
    let bewegt = false;
    for (const [se, sd] of schritte) {
      const laenge = Math.hypot(se.dx, se.dy);
      if (laenge <= 0.05) continue;
      bewegt = true;
      const schleicht = se.s || laenge < 0.55;
      // infiziert: langsamer
      const tempo = (schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1) * (traegtMg(p) ? TEMPO_MG : 1) * this.fkWert(p, 'tempo') * tempoVon(welt);
      let f = Math.min(1, laenge / (schleicht ? 0.55 : 1)) * tempo * sd * this.baumTempo(welt, p);
      const x0 = p.x, y0 = p.y;
      if (x.bot) {
        // Bots steigen nicht über Zäune, gehen aber durch Hecken und Holzzäune – langsam
        f *= Math.min(tierGelaende(welt, x0, y0, W.spielerRadius) || 1, tierGelaende(welt, x0 + se.dx / laenge * f, y0 + se.dy / laenge * f, W.spielerRadius) || 1);
        bewege(welt, p, se.dx / laenge * f, se.dy / laenge * f, W.spielerRadius, freiTier);
      } else {
        // in Teilschritten von höchstens 4 px – genau wie die Vorhersage im Client (spiel.mjs schrittSim), damit Ecken gleich ausgehen
        const n = Math.max(1, Math.ceil(f / 4));
        for (let i = 0; i < n; i++) bewege(welt, p, se.dx / laenge * f / n, se.dy / laenge * f / n, W.spielerRadius);
      }
      p.richtung = Math.atan2(se.dy, se.dx);
      if (!schleicht) this.laerm(p.x, p.y, W.hoerweiteRennen * this.fkWert(p, 'hoerweite'), false, p.ebene);
      if (!x.bot) this.klettern(id, p, x, se, laenge, ((p.x - x0) * se.dx + (p.y - y0) * se.dy) / laenge < f * 0.35, sd);
    }
    if (!bewegt) x.kletter = 0;
    const ebeneVorher = p.ebene;
    this.uebergang(id, p, x, dt);
    if (p.ebene !== ebeneVorher) this.eingabeVerwerfen(p, x);   // neue Ebene: alte Eingaben gehören zum alten Ort
    else this.tuerAuto(p, x, dt, e);
    // automatischer Angriff (nicht während man durchsucht)
    // Magazin, Nachladen und Waffenwechsel bei leerer Waffe (Server ist maßgeblich; Bots wie Spieler)
    WP.schritt(this, x.bot ? null : this.clients.find(c => c.sessionId === id), p, x, dt, SpielRaum.einstellungen);
    if (p.munition <= MUNITION_KISTE_AB) munitionPruefen(p, x.bot ? null : t => this.clients.find(c => c.sessionId === id)?.send('meldung', { text: t }));   // Reserve-Kiste öffnen
    let pause = x.pause - dt;
    if (pause <= 0 && !p.aktion) {
      const [name, wf0] = aktiveWaffe(p);
      const meter = SpielRaum.einstellungen.reichweite?.[name];
      const ew = SpielRaum.einstellungen.waffen?.[name];   // Verwaltung: Schaden und Abklingzeit je Waffe
      const wf = { ...wf0 };
      if (meter) wf.reichweite = meter * KACHEL / 4;   // eingestellte Reichweite (Meter, 4 m je Kachel)
      if (!wf0.fern && welt.reich) wf.reichweite = Math.round(wf.reichweite * welt.reich);   // Nahkampf drinnen: Reichweite im Maßstab des Raums
      if (ew) {
        if (wf0.nebenSchaden) wf.nebenSchaden = wf0.nebenSchaden * ew.schaden / wf0.schaden;
        wf.schaden = ew.schaden; wf.pause = ew.pause;
      }
      // Fernwaffe lädt nach oder Magazin leer: kein Schuss (der Server lädt von selbst nach)
      const ladet = wf0.fern && (p.nachladen > 0 || p.magazin <= 0);
      let ziel = ladet || wf0.wurf || x.feuerAus ? null : this.naechsterZombie(p.x, p.y, wf.reichweite, p);
      if (ziel && wf.granate && Math.hypot(ziel[1].x - p.x, ziel[1].y - p.y) < GRANATE.radius + 12) ziel = null;   // zu nah: Splitter träfen den Schützen
      if (ziel) {
        const [zid, z] = ziel;
        const w = Math.atan2(z.y - p.y, z.x - p.x);
        // Überraschung: Zombie hat noch niemanden im Visier → deutlich mehr Schaden (von hinten anschleichen)
        const faktor = t => { if (t[0].startsWith('spieler:')) return 1; const info = this.zombieInfo.get(t[0]); return !t[1].jagt && !info?.ziel ? wf.ueberraschung : 1; };
        // Fernwaffe: jeder Baum dazwischen senkt die Trefferchance (Güte); Fehlschuss bleibt im Baum stecken
        const gueteVon = t => !wf.fern ? 1 : (t[2] ?? schussGuete(welt, p.x, p.y, t[1], this.zombieInfo.get(t[0])?.ziel === id && Math.hypot(t[1].x - p.x, t[1].y - p.y) < 40));
        const treffer = (liste, menge) => { for (const t of liste) { if (this.rnd() < gueteVon(t)) this.schaden(t[0], t[1], menge * faktor(t), p, id); } };
        // mehrere Ziele: alle Zombies im Kegel bzw. Bogen
        const imWinkel = winkel => [...this.state.zombies.entries()].filter(([, q]) => (q.ebene ?? '') === (p.ebene ?? '')
          && Math.hypot(q.x - p.x, q.y - p.y) <= wf.reichweite && winkelDiff(Math.atan2(q.y - p.y, q.x - p.x), w) <= winkel
          && (wf.fern ? sichtGuete(welt, p.x, p.y, q.x, q.y) > 0 : sichtfrei(welt, p.x, p.y, q.x, q.y)));
        if (wf.fern) {
          if (!(this.rnd() < this.fkWert(p, 'schussFrei', 0))) p.magazin--;   // Fähigkeit „Zielen“: manchmal kostet der Schuss nichts
          this.laerm(p.x, p.y, W.hoerweiteSchuss * (wf.laut ?? 1) * this.fkWert(p, 'hoerweite'), true, p.ebene);
          if (wf.granate) {
            this.granaten.abfeuern(p, id, z.x, z.y, wf.schaden);   // Bogenschuss, Explosion am Ziel
          } else if (wf.kegel) {
            const alle = imWinkel(wf.kegel).filter(t => t[0] !== zid);
            for (let i = -2; i <= 2; i++) {   // Schrotgarbe
              const ww = w + i * wf.kegel / 2.5;
              this.broadcast('schuss', { x1: p.x, y1: p.y, x2: p.x + Math.cos(ww) * wf.reichweite, y2: p.y + Math.sin(ww) * wf.reichweite, art: name });
            }
            treffer([ziel], wf.schaden); treffer(alle, wf.nebenSchaden);
          } else {
            const baum = gueteVon(ziel) >= 1 ? null : ersterBaum(welt, p.x, p.y, z.x, z.y), fehl = !!baum && !(this.rnd() < gueteVon(ziel));   // Fehlschuss: Spur endet am ersten Baum
            this.broadcast('schuss', fehl ? { x1: p.x, y1: p.y, x2: baum.x, y2: baum.y, art: name } : { x1: p.x, y1: p.y, x2: z.x, y2: z.y, art: name, z: zid });
            if (!fehl) this.schaden(zid, z, wf.schaden * faktor(ziel), p, id);
            if (wf.pfeil) this.legeHin('pfeil', fehl ? baum.x : z.x, fehl ? baum.y : z.y, p.ebene);   // der Pfeil bleibt am Einschlagort liegen und lässt sich aufheben
          }
        } else if (wf.bogen) {
          this.broadcast('stoss', { x: p.x, y: p.y, w, sense: true });
          treffer(imWinkel(wf.bogen), wf.schaden);
        } else {
          if (wf.stoss) bewege(welt, z, Math.cos(w) * STOSS_WEG, Math.sin(w) * STOSS_WEG, W.zombieRadius);
          this.broadcast('stoss', { x: p.x, y: p.y, w, messer: name === 'messer', schlag: name === 'schlaeger' });
          treffer([ziel], wf.schaden);
        }
        pause = wf.pause;
        if (!bewegt) p.richtung = w;   // nur im Stehen zum Ziel drehen; im Lauf bleibt die Laufrichtung (sonst läuft die Figur seitwärts/rückwärts)
      } else pause = 0;
    }
    x.pause = Math.max(0, pause);
  }

  // Über Hecken, Gartenzäune und -mauern steigen: kurz (0,25 s) dagegenlaufen, dann Sprung direkt hinter den Zaun.
  // Kurze Aussetzer (Rutschen am Zaun, Zellkante) setzen den Zähler nicht zurück; während des Sprungs (Client: 0,32 s) ruht die Eingabe.
  klettern(id, p, x, e, laenge, steckt, dt) {
    const z = p.ebene ? null : zaunUeberstieg(this.welt, p.x, p.y, Math.atan2(e.dy, e.dx), W.spielerRadius, true);
    if (!z) { x.kletterLos = (x.kletterLos ?? 0) + dt; if (x.kletterLos > 0.2) x.kletter = 0; return; }
    x.kletterLos = 0;
    x.kletter = (x.kletter ?? 0) + dt;
    if (x.kletter < KLETTER_ZEIT) return;
    x.kletter = 0;
    p.x = z.x; p.y = z.y; x.sprungT = KLETTER_SPRUNG;
    this.broadcast('klettern', { x: z.x, y: z.y, id });
  }

  // Tempo-Faktor unter Bäumen (Einstellung „Tempo unter Bäumen“, 25 = 75 % langsamer); die Baumkachel unter der Figurmitte zählt
  baumTempo(welt, o) { return baumFaktor(welt, o.x, o.y, SpielRaum.einstellungen.baumTempo ?? 25); }

  // als Zombie: schnell, beißt Menschen bei Berührung, sonst nichts
  zombieSpielerSchritt(p, x, e, laenge, dt) {
    p.schleicht = false;
    if (laenge > 0.05) {
      const f = Math.min(1, laenge) * W.zombieTempoJagen * 1.15 * dt * this.baumTempo(this.wv(p.ebene), p);
      bewege(this.wv(p.ebene), p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
    }
    this.uebergang(null, p, x, dt);
    for (const o of this.state.spieler.values()) {
      if (o === p || o.unten || o.zombie > 0 || o.ebene !== p.ebene) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < W.spielerRadius * 2 + 6) {
        o.hp = Math.max(0, o.hp - BISS_PRO_SEK * dt * this.fkWert(o, 'schadenFaktor'));
        if (o.hp <= 0) this.liegtAmBoden(o);
      }
    }
  }

  // Safe Room: auf oder direkt neben einem Feldbett (≤ 1 Kachel) und 2 s ohne Bewegung = ruhen
  ruhtAmBett(p, x, dt) {
    const e = x.eingabe;
    // Safe Room (Innenraum) oder Sanitätszelt des Bundeswehr-Stützpunkts (draußen)
    const zelt = !p.ebene && this.stuetzpunkt?.amFeldbett(p);
    if (!(p.sicher && p.ebene) && !zelt || p.unten || p.aktion || (e && Math.hypot(e.dx, e.dy) > 0.05)) { x.stillSeit = 0; return false; }
    x.stillSeit = (x.stillSeit ?? 0) + dt;
    if (x.stillSeit < 2) return false;
    if (zelt) return true;
    const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
    return !!this.wv(p.ebene).moebel?.some(m => m.art === 'feldbett' && kx >= m.x - 1 && kx <= m.x + m.b && ky >= m.y - 1 && ky <= m.y + m.h);
  }

  beduerfnisse(p, x, dt) {
    if (!p.verbunden) { p.ruht = false; return; }
    if (this.brauchtLicht(p)) {
      if (p.lampe <= 0) {
        if (entferne(p.rucksack, 'taschenlampe', 1) > 0) p.lampe = LAMPE_DAUER;
      } else p.lampe = Math.max(0, p.lampe - dt);
    }
    if (p.zombie > 0) {
      p.ruht = false;
      p.zombie = Math.max(0, p.zombie - dt);
      if (p.zombie === 0) this.zurueckverwandeln(p, x, 'Die Verwandlung lässt nach');
      return;
    }
    // Infektion läuft nur draußen
    if (p.infektion > 0 && !p.sicher) {
      p.infektion = Math.max(0, p.infektion - dt);
      if (p.infektion === 0) return this.verwandeln(p);
    }
    const ruht = this.ruhtAmBett(p, x, dt);
    if (p.ruht !== ruht) p.ruht = ruht;
    const rate = ruht ? 0.5 : 1;
    const fkV = rate * this.fkWert(p, 'verbrauch');
    p.durst = Math.max(0, p.durst - dt * fkV * 100 / DURST_DAUER);
    p.hunger = Math.max(0, p.hunger - dt * fkV * 100 / HUNGER_DAUER);
    if (p.unten) return;
    if (p.durst === 0 || p.hunger === 0) {
      p.hp = Math.max(0, p.hp - dt * 0.25);
      if (p.hp === 0) this.liegtAmBoden(p);
    } else if (ruht && p.hp < 100) {
      p.hp = Math.min(100, p.hp + dt);   // Feldbett: +1 Leben pro Sekunde
    } else if (p.sicher && p.durst > 20 && p.hunger > 20 && p.hp < 100) {
      p.hp = Math.min(100, p.hp + dt * 0.6);   // ausruhen im Safe Room
    }
  }

  verwandeln(p) {
    p.zombie = ZOMBIE_ZEIT; p.hp = 100; p.unten = false; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0;
    this.broadcast('meldung', { text: `🧟 ${p.name} hat sich verwandelt! Lauft!`, lang: true });
    this.broadcast('verwandelt', { name: p.name });
  }

  zurueckverwandeln(p, x, grund) {
    const safe = this.safeFuer(x?.letzterSafe, p.x, p.y);
    const pos = this.safePlatz(safe);
    p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
    p.zombie = 0; p.infektion = 0; p.hp = 50; p.unten = false; p.hilfe = 0;
    this.broadcast('meldung', { text: `${grund}: ${p.name} wacht im ${safe.name} wieder als Mensch auf`, lang: true });
  }

  liegtAmBoden(p) {
    p.unten = true; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0;
    this.broadcast('meldung', { text: `${p.name} liegt am Boden – hilf ihm auf!`, lang: true });
  }

  // Ziel für die automatische Waffe: Bäume verdecken nicht ganz (Güte), Wand/Innentür/Leer vollständig; Ergebnis [id, z, guete]
  naechsterZombie(x, y, reichweite, selbst = null) {
    const ebene = selbst?.ebene ?? '', welt = this.wv(ebene), kand = [];
    const sid = selbst ? [...this.state.spieler].find(([, o]) => o === selbst)?.[0] : null;
    for (const [id, z] of this.state.zombies) {
      if ((z.ebene ?? '') !== ebene) continue;
      kand.push([id, z, !!sid && this.zombieInfo.get(id)?.ziel === sid && Math.hypot(z.x - x, z.y - y) < 40]);
    }
    // verwandelte Mitspieler sind auch Ziele
    for (const [s, o] of this.state.spieler) {
      if (o === selbst || !(o.zombie > 0) || o.ebene !== ebene) continue;
      kand.push(['spieler:' + s, o, false]);
    }
    return waehleZiel(welt, kand, x, y, reichweite);
  }

  schaden(id, z, menge, von, vonSid = null) {
    if (id.startsWith('spieler:')) {
      z.hp = Math.max(0, z.hp - menge);
      if (z.hp === 0) this.zurueckverwandeln(z, this.extra.get(id.slice(8)), `${von.name} hat den Zombie erledigt`);
      return;
    }
    z.hp = Math.max(0, z.hp - menge);
    const info = this.zombieInfo.get(id);
    if (info && !info.ziel) {
      // getroffen: jetzt hat er dich bemerkt
      if (vonSid && z.hp > 0) { info.ziel = vonSid; info.verloren = 0; info.punkt = null; info.schlaeft = false; z.jagt = true; this.broadcast('entdeckt', { x: z.x, y: z.y }); }
      else info.punkt = { x: von.x, y: von.y };
    }
    if (z.hp === 0 && !z.kriecht && this.rnd() < (this.kriecherChance ?? KRIECHER_CHANCE)) {
      // nicht ganz tot: bricht zusammen und kriecht weiter
      z.kriecht = true; z.hp = Math.max(1, Math.round(KRIECHER_HP * (SpielRaum.einstellungen?.zombieLeben ?? ZOMBIE_HP) / ZOMBIE_HP)); z.jagt = false;
      if (info) { info.ziel = null; info.punkt = null; }
      this.broadcast('weg', { x: z.x, y: z.y, halb: true });
      return;
    }
    if (z.hp === 0) {
      this.state.zombies.delete(id);
      this.zombieInfo.delete(id);
      this.state.besiegt++;
      von.besiegt++;
      if (vonSid) this.xpGeben(vonSid, 'zombie');
      this.neueLeiche(z);
      this.broadcast('weg', { x: z.x, y: z.y });
    }
  }

  laerm(x, y, weite, durchWaende, ebene = '', ausser = null) {
    const welt = this.wv(ebene);
    if (!ebene && !ausser) this.welle?.laermHoeren(x, y, weite);   // die Zombiehorde dreht ggf. kurz zum Lärm
    for (const [id, z] of this.state.zombies) {
      if (z === ausser || (z.ebene ?? '') !== ebene) continue;
      if (Math.hypot(z.x - x, z.y - y) > weite) continue;
      const info = this.zombieInfo.get(id);
      if (!info || info.ziel) continue;
      if (!durchWaende && !sichtfrei(welt, z.x, z.y, x, y)) continue;
      info.punkt = { x, y }; info.schlaeft = false;
    }
  }

  // Wegfeld: Abstand jeder Kachel zum nächsten stehenden Spieler (Breitensuche)
  baueFeld(ebene = '') {
    const welt = this.wv(ebene), KW = kachelVon(welt), BR = breiteVon(welt), HO = hoeheVon(welt), tiefe = welt.kachel ? 400 : WEGEFELD_TIEFE;
    const feld = new Int16Array(BR * HO).fill(-1);
    const q = [];
    for (const p of this.state.spieler.values()) {
      if (p.unten || p.anBord || p.kamera || p.zombie > 0 || p.ebene !== ebene) continue;
      const i = Math.floor(p.y / KW) * BR + Math.floor(p.x / KW);
      if (feld[i] === -1) { feld[i] = 0; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % BR, y = (i - x) / BR;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= BR || ny >= HO) continue;
        const j = ny * BR + nx;
        if (feld[j] !== -1) continue;
        if (BLOCKIERT_FELD.has(welt.hole(nx, ny))) continue;
        feld[j] = feld[i] + 1;
        if (feld[j] < tiefe) q.push(j);   // weiter weg ist das Feld nicht nötig (Zombies sehen/hören höchstens ~500 px)
      }
    }
    this.felder.set(ebene, feld);
    if (!ebene) this.feld = feld;
  }

  feldRichtung(x, y, ebene = '') {
    const feld = this.felder.get(ebene);
    if (!feld) return null;
    const welt = this.wv(ebene), KW = kachelVon(welt), BR = breiteVon(welt), HO = hoeheVon(welt);
    const kx = Math.floor(x / KW), ky = Math.floor(y / KW);
    const hier = feld[ky * BR + kx];
    let best = null, bw = hier < 0 ? Infinity : hier;
    for (const [nx, ny] of [[kx + 1, ky], [kx - 1, ky], [kx, ky + 1], [kx, ky - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BR || ny >= HO) continue;
      const w = feld[ny * BR + nx];
      if (w >= 0 && w < bw) { bw = w; best = [nx, ny]; }
    }
    if (!best) return null;
    return Math.atan2((best[1] + 0.5) * KW - y, (best[0] + 0.5) * KW - x);
  }

  // „Nah“-Punkte je Ebene: alle Spieler, dazu für draußen die Haustüren der Häuser mit Spielern darin und die Posten des Stützpunkts
  berechneNah() {
    const m = new Map();
    const add = (e, x, y) => { let l = m.get(e); if (!l) m.set(e, l = []); l.push(x, y); };
    for (const [sid, p] of this.state.spieler) {
      const e = p.ebene ?? '';
      add(e, p.x, p.y);
      if (p.kamera) { const k = this.extra.get(sid)?.kameraPos; if (k) add(e, k.x, k.y); }   // Kameraflug: Zombies am Flugort laufen sauber mit
      if (e) {
        const mm = EBENE_MUSTER.exec(e), h = mm ? this.welt.haeuser[Number(mm[1])] : null;
        if (h) add('', (h.tuer.x + 0.5) * KACHEL, (h.tuer.y + 0.5) * KACHEL);
      }
    }
    const sp = this.stuetzpunkt;
    if (sp) {
      for (const q of sp.schuetzen ?? []) add('', q.x, q.y);
      for (const q of sp.nester ?? []) add('', q.x, q.y);
      if (sp.puma) add('', sp.puma.x, sp.puma.y);
    }
    this.nahPunkte = m;
  }

  // Kameraposition jedes Superusers im Kameraflug (Weltpixel) – dort soll gesehen werden, was sonst nur rund um Spieler existiert
  kameraPunkte() {
    const l = [];
    for (const [sid, p] of this.state.spieler) if (p.kamera) { const k = this.extra.get(sid)?.kameraPos; if (k) l.push(k); }
    return l;
  }

  istFern(x, y, ebene = '') {
    const l = this.nahPunkte?.get(ebene ?? '');
    if (!l) return true;
    const r2 = FERN_WEITE * FERN_WEITE;
    for (let i = 0; i < l.length; i += 2) { const dx = l[i] - x, dy = l[i + 1] - y; if (dx * dx + dy * dy < r2) return false; }
    return true;
  }

  // Raster aller Zombies je Ebene (Zelle → Liste), gilt für den laufenden Takt
  baueZombieRaster() {
    const r = new Map();
    for (const z of this.state.zombies.values()) {
      const e = z.ebene ?? '';
      let g = r.get(e); if (!g) r.set(e, g = new Map());
      const k = Math.floor(z.y / RASTER) * 4096 + Math.floor(z.x / RASTER);
      const l = g.get(k); if (l) l.push(z); else g.set(k, [z]);
    }
    this.zRaster = r;
  }

  // Zombies nahe (x, y) (Radius ≤ 1 Zelle ⇒ Zellen ±zellen); ohne Raster: alle auf der Ebene
  zombiesNahe(x, y, ebene, zellen = 1) {
    const g = this.zRaster?.get(ebene ?? '');
    if (!g) return this.zRaster ? [] : [...this.state.zombies.values()].filter(z => (z.ebene ?? '') === (ebene ?? ''));
    const cx = Math.floor(x / RASTER), cy = Math.floor(y / RASTER), out = [];
    for (let j = cy - zellen; j <= cy + zellen; j++) for (let i = cx - zellen; i <= cx + zellen; i++) { const l = g.get(j * 4096 + i); if (l) for (const z of l) out.push(z); }
    return out;
  }

  // Ein am Boden liegender (rettbarer) Spieler auf derselben Ebene innerhalb von r px, sonst null
  liegenderNahe(x, y, ebene, r) {
    for (const p of this.state.spieler.values()) {
      if (!p.unten || p.zombie > 0 || (p.ebene ?? '') !== ebene) continue;
      if (Math.hypot(p.x - x, p.y - y) < r) return p;
    }
    return null;
  }

  zombieSchritt(id, z, dt) {
    const info = this.zombieInfo.get(id);
    const welt = this.wv(z.ebene);
    const ebene = z.ebene ?? '', R = welt.reich ?? 1;   // R: Maßstab der Nahbereichs-Abstände (drinnen im Feinraster kleiner)
    if (z.haengt) haengtSchritt(this, z, info, dt);   // Zeit im Draht läuft; nach Ablauf frei
    if (info.hundBis && this.hunde?.zombieJagt(z, info, dt)) return;   // lässt sich vom Hund ablenken (server/hund.mjs)
    // Sehen: Kegel in Blickrichtung, schleichende Spieler erst später
    if (!info.ziel) {
      for (const [sid, p] of this.state.spieler) {
        if (p.unten || p.anBord || p.kamera || p.zombie > 0 || p.ebene !== ebene) continue;
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        let weite = p.schleicht ? W.sichtWeiteSchleichen : W.sichtWeite;
        const gute = d < 200 ? sichtGuete(welt, z.x, z.y, p.x, p.y) : 0;   // Bäume mindern die Sicht, verdecken sie aber nie ganz
        weite *= gute * this.nebelSichtFaktor();
        const imKegel = winkelDiff(Math.atan2(p.y - z.y, p.x - z.x), z.richtung) < W.sichtWinkel / 2;
        // wer schleicht oder still steht, kann sich von hinten bis zum ersten Schlag heranpirschen
        const e = this.extra.get(sid)?.eingabe;
        const leise = p.schleicht || !e || Math.hypot(e.dx, e.dy) < 0.05;
        const ganzNah = d < (leise && !imKegel ? 8 : 28) * R;
        // Kriecher spüren ringsum, schlafende (lauernde) Zombies in Häusern auch – aber nur bei freier Sicht
        const bemerkt = z.kriecht ? d < (leise ? KRIECHER_SPUERT * 0.5 : KRIECHER_SPUERT) * R : info.schlaeft ? d < (leise ? 70 : 140) * R : (ganzNah || (d < weite && imKegel));
        if (bemerkt && gute > 0) {
          info.ziel = sid; info.verloren = 0; info.punkt = null; info.schlaeft = false;
          this.broadcast('entdeckt', { x: z.x, y: z.y });
          break;
        }
      }
    }
    let ziel = info.ziel ? this.state.spieler.get(info.ziel) : null;
    if (ziel && (ziel.unten || ziel.anBord || ziel.kamera || ziel.zombie > 0 || ziel.ebene !== ebene)) {
      // der Gejagte ist in ein Haus gelaufen: zur Haustür (letzte bekannte Stelle)
      const m = !ebene && !ziel.unten && !(ziel.zombie > 0) ? EBENE_MUSTER.exec(ziel.ebene ?? '') : null;
      const h = m ? this.welt.haeuser[Number(m[1])] : null;
      if (h && Math.hypot((h.tuer.x + 0.5) * KACHEL - z.x, (h.tuer.y + 0.5) * KACHEL - z.y) < 700) {
        info.punkt = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL };
      }
      info.ziel = null; ziel = null;
    }
    z.jagt = !!ziel;

    // Wer am Boden liegt, wird in Ruhe gelassen: Zombies in seiner Nähe ziehen ab (Mitspieler können ihn retten)
    if (!ziel && !info.mensch) {
      const u = this.liegenderNahe(z.x, z.y, ebene, UNTEN_ABSTAND * R);
      if (u) {
        if (info.punkt && Math.hypot(info.punkt.x - u.x, info.punkt.y - u.y) < (UNTEN_ABSTAND + 40) * R) info.punkt = null;
        const w = Math.atan2(z.y - u.y, z.x - u.x) + (info.versatz ?? (info.versatz = (this.rnd() - 0.5) * 1.2));
        z.richtung = w; info.steht = false;
        this.zombieGehen(z, w, W.zombieTempoJagen * 0.6 * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info);
        return;
      }
    }

    if (ziel) {
      const d = Math.hypot(ziel.x - z.x, ziel.y - z.y);
      const gute = sichtGuete(welt, z.x, z.y, ziel.x, ziel.y);
      const sieht = gute > 0 && (d < 40 * R || d < W.sichtWeite * 1.6 * gute * this.nebelSichtFaktor());
      info.verloren = sieht ? 0 : info.verloren + dt;
      if (info.verloren > 10 || d > W.sichtWeite * 3) {
        info.ziel = null; info.punkt = { x: ziel.x, y: ziel.y }; info.suche = true; z.jagt = false;
      } else {
        const w = sieht ? Math.atan2(ziel.y - z.y, ziel.x - z.x) : (this.feldRichtung(z.x, z.y, ebene) ?? z.richtung);
        z.richtung = w;
        const lahm = z.kriecht ? KRIECHER_TEMPO : 1;
        if (d > (W.spielerRadius + W.zombieRadius + 4) * R) this.zombieGehen(z, w, W.zombieTempoJagen * lahm * dt, dt, info);
        if (d < (W.spielerRadius + W.zombieRadius + 12) * R && !(this.extra.get(info.ziel)?.schonT > 0)) {
          const schutz = ziel.kleidung > 0;
          ziel.hp = Math.max(0, ziel.hp - BISS_PRO_SEK * dt * (schutz ? 0.6 : 1) * (z.kriecht ? 0.6 : 1) * this.fkWert(ziel, 'schadenFaktor'));
          if (schutz) ziel.kleidung = Math.max(0, ziel.kleidung - dt * 4);
          if (!(ziel.infektion > 0) && this.rnd() < (SpielRaum.einstellungen.bissSpielerLevel?.[levelSchluessel(this.state.karte)] ?? SpielRaum.einstellungen.bissSpieler ?? BISS_CHANCE) * dt * (schutz ? 0.5 : 1)) {
            ziel.infektion = INFEKTION_DAUER;
            this.broadcast('meldung', { text: `🦠 ${ziel.name} wurde gebissen! Eine Rettungsspritze hilft.`, lang: true });
          }
          if (ziel.hp <= 0) this.liegtAmBoden(ziel);
        }
        return;
      }
    }

    // Mensch (Stadtbewohner) verfolgen: volle Jagdgeschwindigkeit, bis er gebissen ist oder entkommt (gesetzt in menschen.mjs zombiesWittern)
    if (info.mensch) {
      const m = this.state.menschen.get(info.mensch);
      const d = m ? Math.hypot(m.x - z.x, m.y - z.y) : Infinity;
      if (!m || !m.sichtbar || m.infiziert || ebene || m.ebene || (m.versteckt && d > VERSTECK_WEITE * 1.5) || d > W.sichtWeite * 1.6 || !sichtfrei(welt, z.x, z.y, m.x, m.y)) {
        if (m && m.sichtbar && !m.infiziert && d < W.sichtWeite * 1.6) info.punkt = { x: m.x, y: m.y };   // aus den Augen: letzte Stelle ansteuern
        info.mensch = null;
      } else {
        z.richtung = Math.atan2(m.y - z.y, m.x - z.x); z.jagt = true;
        this.zombieGehen(z, z.richtung, W.zombieTempoJagen * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info);
        return;
      }
    }
    if (info.punkt) {
      // Geräusch nachgehen
      const d = Math.hypot(info.punkt.x - z.x, info.punkt.y - z.y);
      if (d < 16 * R) {
        info.punkt = null; info.wechsel = 0;
        if (info.suche) { info.suche = false; info.sucheT = 4; }   // letzter bekannter Ort erreicht: kurz umsehen, bevor er weiterzieht
      } else {
        const sieht = sichtfrei(welt, z.x, z.y, info.punkt.x, info.punkt.y);
        z.richtung = sieht ? Math.atan2(info.punkt.y - z.y, info.punkt.x - z.x) : (this.feldRichtung(z.x, z.y, ebene) ?? z.richtung);
        if (!this.zombieGehen(z, z.richtung, W.zombieTempoJagen * 0.7 * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info)) info.punkt = null;
      }
      return;
    }

    // Suche am letzten bekannten Ort: stehen bleiben und sich langsam umsehen (Sehen oben greift weiter)
    if (info.sucheT > 0) { info.sucheT -= dt; z.richtung += dt * 1.6; return; }
    // Zombiewelle: gemeinsam zum Gruppenziel
    if (info.welle) return this.welle.gehen(id, z, info, dt);
    // schlafende Zombies (in Häusern) bewegen sich nicht, bis sie jemanden sehen oder hören
    if (info.schlaeft) return;
    // Wandern (wer im Draht hängt, bleibt stehen)
    if (z.haengt) return;
    info.wechsel -= dt;
    if (info.wechsel <= 0) {
      info.wechsel = 2 + this.rnd() * 4;
      info.steht = this.rnd() < 0.4;
      if (!info.steht) z.richtung = this.rnd() * Math.PI * 2;
    }
    if (!info.steht && !this.zombieGehen(z, z.richtung, W.zombieTempoWandern * (z.kriecht ? 0.5 : 1) * dt, dt, info)) {
      z.richtung += Math.PI * (0.5 + this.rnd());
    }
  }

  // Zombie steht in der offenen, unverbarrikadierten Haustür eines Hauses, in dem Menschen sind: er kommt hinein
  hausEindringen(z) {
    const kx = Math.floor(z.x / KACHEL), ky = Math.floor(z.y / KACHEL);
    const h = this.hausAnTuer(kx, ky);
    if (!h) return false;
    const key = 'haus:' + h.nr, st = this.state.tueren.get(key);
    if ((st && !st.offen && !st.kaputt) || this.tuerBarrikade(key) > 0) return false;
    if (!this.spielerHinterTuer(key).length) return false;
    const ebene = `h${h.nr}eg`, w = this.wv(ebene), a = w.ausgang;
    const pos = this.freierPlatz(a ? this.nebenKachel(w, a) : w.start, 0, ebene);
    z.ebene = ebene; z.x = pos.x; z.y = pos.y;
    const info = [...this.zombieInfo.entries()].find(([id]) => this.state.zombies.get(id) === z)?.[1];
    if (info) { info.ziel = null; info.punkt = null; info.schlaeft = false; info.steht = false; }
    const s = this.safeVonHaus(h.nr);
    if (s) this.broadcast('meldung', { text: `🧟 Ein Zombie ist in den ${s.name} eingedrungen!`, lang: true });
    else this.sageDrin(key, '🧟 Ein Zombie ist ins Haus eingedrungen!');
    return true;
  }

  // Tür, gegen die der Zombie gerade läuft und die ihn aufhält (geschlossen oder verbarrikadiert), sonst null
  zombieSperre(z, w, welt) {
    const pruefe = (x, y) => {
      const KW = z.ebene ? kachelVon(welt) : KACHEL, kx = Math.floor(x / KW), ky = Math.floor(y / KW);
      if (!z.ebene) {
        const h = this.hausAnTuer(kx, ky);
        if (!h) return null;
        const key = 'haus:' + h.nr, st = this.state.tueren.get(key);
        return st && (!st.offen || this.tuerBarrikade(key) > 0) ? key : null;
      }
      const t = welt.hole(kx, ky);
      if (t !== T.INNENTUER && t !== T.TUER_OFFEN) return null;
      const td = tuerAnZelle(welt, kx, ky), key = `${z.ebene}:${td ? td.x : kx},${td ? td.y : ky}`, st = this.state.tueren.get(key);
      return st && (!st.offen || this.tuerBarrikade(key) > 0) ? key : null;
    };
    const vor = (W.zombieRadius + 5) * (welt.reich ?? 1);
    return pruefe(z.x + Math.cos(w) * vor, z.y + Math.sin(w) * vor) ?? pruefe(z.x, z.y);
  }

  // Abstand zu anderen Zombies halten (auch vor einer Tür: sonst stapelt sich die Horde dort)
  zombieAbstand(z, welt, info) {
    // Horde: Mindestabstand 1,5 Radien (dichte Traube, aber keine Figuren übereinander); höchstens 40 Nachbarn prüfen (Rastergröße begrenzt die Kosten)
    const horde = !!info?.welle, minD = (horde ? W.zombieRadius * 1.5 : W.zombieRadius * 2) * (welt.reich ?? 1);
    let gepr = 0, eng = 0;
    for (const o of this.zRaster ? this.zombiesNahe(z.x, z.y, z.ebene) : this.state.zombies.values()) {
      if (o === z || o.ebene !== z.ebene) continue;
      if (horde && ++gepr > 40) break;
      const dx = z.x - o.x, dy = z.y - o.y;
      if (Math.abs(dx) >= minD || Math.abs(dy) >= minD) continue;
      const d = Math.hypot(dx, dy);
      if (d < minD) {
        eng++;
        if (d === 0) { const w = this.rnd() * 6.2832; bewege(welt, z, Math.cos(w) * minD / 2, Math.sin(w) * minD / 2, W.zombieRadius); continue; }
        const f = horde ? (minD - d) * 0.8 : (minD - d) / 2;   // Horde: halbe Lücke je Schritt, sonst bremst der Haufen sich selbst aus
        bewege(welt, z, dx / d * f, dy / d * f, W.zombieRadius);
      }
    }
    if (horde) info.eng = eng;   // gedrängt: im nächsten Schritt langsamer (Stau statt Übereinanderlaufen)
  }

  zombieGehen(z, w, weg, dt, info = null) {
    if (z.haengt) return false;   // im S-Draht festgehakt
    const eifrig = z.jagt || weg > W.zombieTempoWandern * dt * 1.5;   // jagt oder folgt einem Geräusch (nicht nur Umherirren)
    weg *= SpielRaum.einstellungen.tempoFaktor ?? 1;   // Einstellung „Tempo“
    weg *= tempoVon(this.wv(z.ebene));                  // drinnen im Feinraster: Tempo im Maßstab des Raums
    if (info && !z.kriecht) weg *= info.tempo ?? 1;     // eigener Tempofaktor des Zombies (0,9–1,1)
    const x0 = z.x, y0 = z.y;
    const welt = this.wv(z.ebene);
    // Hecken und Holzzäune: durchquerbar, aber langsam (Metallzäune und Mauern bleiben zu)
    const schritt = weg * this.baumTempo(welt, z) * Math.min(tierGelaende(welt, x0, y0, W.zombieRadius) || 1, tierGelaende(welt, x0 + Math.cos(w) * weg, y0 + Math.sin(w) * weg, W.zombieRadius) || 1);
    bewege(welt, z, Math.cos(w) * schritt, Math.sin(w) * schritt, W.zombieRadius, freiTier);
    // geschlossene oder verbarrikadierte Tür (Haustür, Zimmertür): nicht durch, sondern dagegen hämmern
    const sperre = this.zombieSperre(z, w, welt);
    if (sperre) {
      z.x = x0; z.y = y0;
      this.zombieAbstand(z, welt, info);
      if (!eifrig) return false;
      // hinter der Tür niemand? Dann gibt er auf (ein Zimmer ohne Menschen ist es nicht wert)
      if (!this.spielerHinterTuer(sperre).length) return false;
      this.tuerSchlag(sperre, dt, z);
      return true;
    }
    if (!z.ebene && this.hausEindringen(z)) { this.zombieAbstand(z, welt, info); return true; }
    // Abstand zu anderen Zombies halten
    this.zombieAbstand(z, welt, info);
    if (!z.ebene && !z.kriecht && info) drahtPruefen(this, z, info);   // läuft er in eine S-Draht-Rolle, bleibt er mit 40 % hängen
    return Math.hypot(z.x - x0, z.y - y0) > schritt * 0.3;
  }

  aufhelfen(dt) {
    const alle = [...this.state.spieler.entries()];
    for (const [, p] of alle) {
      if (!p.unten) continue;
      const helfer = alle.find(([hid, h]) => {
        if (h.unten || h === p || h.zombie > 0 || h.ebene !== p.ebene) return false;
        const e = this.extra.get(hid)?.eingabe;
        const steht = !e || Math.hypot(e.dx, e.dy) < 0.05;
        return steht && Math.hypot(h.x - p.x, h.y - p.y) < reichVon(this.wv(p.ebene), W.aufhelfenAbstand);
      });
      if (helfer) {
        const h = helfer[1];
        const mitVerband = hat(h.rucksack, 'verband');
        p.hilfe = Math.min(1, p.hilfe + dt * this.fkWert(h, 'heilen') / (mitVerband ? W.aufhelfenDauer : 8));
        if (p.hilfe >= 1) {
          if (mitVerband) entferne(h.rucksack, 'verband', 1);
          p.unten = false; p.hp = mitVerband ? 70 : 25; p.hilfe = 0;
          this.xpGeben(helfer[0], 'wiederbelebt');
          this.broadcast('meldung', {
            text: mitVerband ? `${h.name} hat ${p.name} verbunden und aufgeholfen` : `${h.name} hat ${p.name} notdürftig aufgeholfen`,
          });
        }
      } else p.hilfe = Math.max(0, p.hilfe - dt / 6);
    }
  }

  zombiesAuffuellen(dt) {
    this.nachspawn -= dt;
    // weit von allen Spielern entfernte, nicht jagende Zombies draußen verschwinden (große Karten)
    const draussenSpieler = [...this.state.spieler.values()].filter(p => !p.ebene);
    const kameras = this.kameraPunkte();   // Kameraflug: Zombies am Flugort bleiben bestehen
    if (draussenSpieler.length) for (const [id, z] of this.state.zombies) {
      if (z.ebene || z.jagt || this.zombieInfo.get(id)?.bleibt) continue;   // Stadt-Zombies (Ausbruch, Verwandelte) bleiben
      if (draussenSpieler.every(p => Math.hypot(p.x - z.x, p.y - z.y) > 1500) && kameras.every(k => Math.hypot(k.x - z.x, k.y - z.y) > 1500)) { this.state.zombies.delete(id); this.zombieInfo.delete(id); }
    }
    const soll = this.zombieSollJetzt();
    // gezählt werden nur Zombies aus dem Umland – die Stadt-Zombies kommen obendrauf
    const draussen = [...this.state.zombies.entries()].filter(([id, z]) => !z.ebene && !this.zombieInfo.get(id)?.bleibt).length;
    if (draussen >= soll || this.nachspawn > 0) return;
    // beim Start viele auf einmal, danach langsam nachrücken
    const erste = this.ersteWelle;
    const anzahl = erste ? soll - draussen : 1;
    for (let i = 0; i < anzahl; i++) this.neuerZombie(erste ? 380 : 520);
    this.ersteWelle = false;
    // deutlich unter Soll: schneller nachrücken (alle 1 s statt 2,5 s)
    const mangel = soll - draussen;
    this.nachspawn = mangel > Math.max(4, soll * 0.3) ? 1 : 2.5;
  }

  neuerZombie(abstand) {
    // im Ring um einen zufälligen Spieler draußen (bei großen Karten), sonst irgendwo
    const draussen = [...this.state.spieler.values()].filter(p => !p.ebene);
    for (let versuch = 0; versuch < 60; versuch++) {
      let x, y;
      if (draussen.length && abstand > 0) {
        const p = draussen[Math.floor(this.rnd() * draussen.length)];
        const w = this.rnd() * Math.PI * 2, d = abstand + this.rnd() * 450;
        x = p.x + Math.cos(w) * d; y = p.y + Math.sin(w) * d;
        if (x < KACHEL || y < KACHEL || x > (BREITE - 1) * KACHEL || y > (HOEHE - 1) * KACHEL) continue;
      } else { x = (1 + this.rnd() * (BREITE - 8)) * KACHEL; y = (1 + this.rnd() * (HOEHE - 2)) * KACHEL; }
      if (!frei(this.welt, x, y, W.zombieRadius + 2)) continue;
      if (this.welt.safeRooms.some(r => Math.hypot(r.vorTuer.x - x, r.vorTuer.y - y) < 120)) continue;
      const nah = [...this.state.spieler.values()].some(p => Math.hypot(p.x - x, p.y - y) < abstand);
      if (nah) continue;
      // in Häusern lauern auch welche, aber seltener
      if (drinnen(this.welt, x, y)) continue;   // Häuser haben eigene Innenräume
      this.setzeZombie(x, y, '');
      return;
    }
  }

  // Tod: Rucksack, Waffe, Munition, Kleidung und Lampe fallen als Einzelgegenstände an den Sterbeort und bleiben einen Spieltag liegen
  sterbeHaufen(p) {
    const dinge = flach(p.rucksack);
    if (p.waffe) dinge.push(p.waffe);
    dinge.push(...WP.alleWaffen(p));
    const hg = dinge.indexOf('handgranate');   // Handgranaten-Platz: einzelne Granaten statt der internen „Waffe“
    if (hg >= 0) { dinge.splice(hg, 1); const n = (p.handgranaten ?? 0) + (p.waffe === 'handgranate' ? p.magazin : this.extra.get([...this.state.spieler.keys()].find(k => this.state.spieler.get(k) === p))?.mag?.[WP.handgranatenPlatz(p)]?.n ?? 0); for (let k = 0; k < Math.min(5, n); k++) dinge.push('granate'); }
    if (p.magazin > 0) for (let i = 0; i < Math.min(2, Math.ceil(p.magazin / MUNITION_PRO_FUND)); i++) dinge.push(vorratFeld(WAFFEN[p.waffe]) === 'pfeile' ? 'pfeil' : vorratFeld(WAFFEN[p.waffe]) === 'granaten' ? 'granate40' : 'munition');
    for (let i = 0; i < Math.min(3, p.granaten ?? 0); i++) dinge.push('granate40');
    if (p.munition > 0) for (let i = 0; i < Math.min(3, Math.ceil(p.munition / MUNITION_PRO_FUND)); i++) dinge.push('munition');
    for (let i = 0; i < Math.min(5, p.pfeile ?? 0); i++) dinge.push('pfeil');
    if (p.kleidung > 0) dinge.push('kleidung');
    if (p.lampe > 0) dinge.push('taschenlampe');
    const fkB = this.fkRucksack(p);
    if (p.plaetze - fkB > RUCKSACK_PLAETZE) dinge.push(p.plaetze - fkB >= 16 ? 'trekking' : 'tasche');
    const tag = ((SpielRaum.einstellungen.tagMinuten || 48) * 60);
    for (const d of dinge) {
      if (!DINGE[d]) continue;
      const id = this.legeHin(d, p.x, p.y, p.ebene);
      if (!DINGE[d].mission) this.state.boden.get(id).alter = BODEN_DAUER - tag;   // BODEN_DAUER + (Spieltag) Sekunden bis zum Verschwinden
    }
    p.rucksack.splice(0, p.rucksack.length);
    p.waffe = ''; p.munition = 0; p.pfeile = 0; p.granaten = 0; p.handgranaten = 0; WP.leeren(p, this.extra.get([...this.state.spieler.keys()].find(k => this.state.spieler.get(k) === p))); p.kleidung = 0; p.lampe = 0; p.plaetze = RUCKSACK_PLAETZE + fkB;
  }

  // Safe Room fürs gemeinsame Aufwachen: zuletzt von einem echten Spieler betreten, sonst der zur Mitte der echten Spieler nächste
  teamSafeWaehlen() {
    const l = this.welt.safeRooms;
    const t = l.find(r => r.id === this.teamSafe);
    if (t) return t;
    const echte = [...this.state.spieler].filter(([sid, p]) => !this.extra.get(sid)?.bot && Number.isFinite(p.x));
    if (!echte.length) return this.safeFuer('', NaN, NaN);
    const mx = echte.reduce((a, [, p]) => a + p.x, 0) / echte.length;
    const my = echte.reduce((a, [, p]) => a + p.y, 0) / echte.length;
    return this.safeFuer('', mx, my);
  }

  // alle am Boden: alle (echte Spieler und Bots) wachen gemeinsam im selben Safe Room auf, die Welt bleibt erhalten
  zurueckInDieSafeRooms() {
    const s = this.state;
    const safe = this.teamSafeWaehlen();
    let n = 0;
    for (const [, p] of s.spieler) {
      this.sterbeHaufen(p);   // Ausrüstung bleibt am Sterbeort liegen (1 Spieltag)
      const pos = this.safePlatz(safe, n++);
      p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
      p.hp = 100; p.durst = 100; p.hunger = 100; p.unten = false; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0; p.zombie = 0;
    }
    // Zombies rund um die Safe Rooms vertreiben
    for (const [id, z] of s.zombies) {
      if (this.welt.safeRooms.some(r => z.ebene === r.ebene || (!z.ebene && Math.hypot(r.vorTuer.x - z.x, r.vorTuer.y - z.y) < 320))) {
        s.zombies.delete(id); this.zombieInfo.delete(id);
      }
    }
    for (const info of this.zombieInfo.values()) { info.ziel = null; info.punkt = null; }
    s.phase = 'spiel';
    this.broadcast('meldung', { text: 'Ihr seid im Safe Room aufgewacht – mit Kopfweh, aber lebendig.', lang: true });
  }
}
