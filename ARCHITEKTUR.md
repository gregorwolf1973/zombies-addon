# Architektur – Zombies in Oberbayern

Kurzlandkarte für Änderungen (v. a. durch KI-Agenten): erst hier nachsehen, dann gezielt per `grep -n` in die Dateien.
Version steht nur in `zombies/config.yaml` und `zombies/CHANGELOG.md` (`zombies/package.json` bleibt fest auf 1.0.0).

## Aufbau

- `zombies/server/` – Colyseus-Server (Node 22, ES-Module). Eintritt `index.mjs`, Spiellogik `raum.mjs`.
- `zombies/client/` – Phaser-3-Browserclient, vom Server statisch ausgeliefert. Eintritt `index.html` → `spiel.mjs`.
- `zombies/tests/` – `node --test` (rund 110 Dateien). `zombies/tools/` – Hilfswerkzeuge (z. B. glb_draufsicht).
- `tools/` (Repo-Wurzel) – Python/Node-Werkzeuge für Karten, Luftbild, Bilder, Töne, Einspielen. Nicht im Add-on-Image.
- Dockerfile kopiert nur `server/`, `client/`, `config.yaml`, `run.sh`; `run.sh` startet `node server/index.mjs` (App-Pfad `/app`).
- Server und Client teilen Code: Der Server importiert `../client/welt.mjs`, `osmwelt.mjs` usw. (Weltaufbau).

## Server (zombies/server)

Wichtige Dateien:
- `index.mjs` – Express + Colyseus, Verwaltungsseite/API, Ton-Auslieferung (`/toene/:datei`), Live-Einstellungen (`tonEinst`).
- `raum.mjs` – `SpielRaum` (Room): Schema, Tick, alle Nachrichten, Spieler/Zombies/Türen/Durchsuchen/Tausch.
- `netzfeld.mjs` – `entkoppeln`/`netzKopie`: genaue Position intern, ganzzahlig und gedrosselt ins Schema.
- `einstellungen.mjs` + `vorlage.json` – Einstellungen (Grundwerte, Vorlage, Datei `/data/einstellungen.json`).
- `aufgaben.mjs` (Level, Missionen, Evakuierung, `level1Karte`), `mission*.mjs`, `finale.mjs`, `schwierigkeit.mjs`, `welle.mjs`.
- `weltcache.mjs` + `weltworker.mjs` – Welt im Worker-Thread bauen, nächstes Level vorbauen.
- `zielwahl.mjs`, `botplan.mjs`, `bots.mjs` – Bots und Zielwahl; `menschen.mjs` (Bewohner), `hund.mjs`, `verkehr.mjs`, `unfall.mjs`, `feuer.mjs`.
- `waffenplaetze.mjs`, `munition*.mjs`, `granaten.mjs`, `baumschuss.mjs`, `ueberrollen.mjs`, `faehigkeiten.mjs` – Kampf und Ausrüstung.
- `stuetzpunkt.mjs`, `szene_b11*.mjs`, `leopard.mjs`, `flugplatz.mjs`, `haengend.mjs` – Lager und Sonderszenen.
- `a400m_kisten.mjs` – Königsdorf: Munitionskisten fallen während der Landerolle aus dem A400M (je Echtspieler 2, fester Inhalt, Bodengegenstände `a400m_kiste_a/b`, Nachricht `kistenFall`, Fundorte, Spielstand über `aufgaben.speichern`).
- `speicher.mjs` (Spielstand), `superuser.mjs` (Testmenü, Zugangscode-Hash), `radio.mjs`, `raetsel.mjs`/`spielfragen.txt`, `nebel.mjs`.

### Schema und Sichtfilter
- Das Schema (`schema(...)`, `t.map(...)`) steht oben in `raum.mjs` (Spieler, Zombie, Mensch, Fahrzeug, Hund, Zustand).
  Colyseus-Grenze: höchstens 63 Felder je Klasse; ist nichts frei, per Nachricht senden (Beispiel `baumTempo`).
- `zombies`, `menschen`, `fahrzeuge` sind `.view()`-Maps: Jeder Client sieht nur Objekte in seinem Bildausschnitt plus Rand,
  gepflegt von `sichtAktualisieren()` (StateView je Client, Sets `sichtZ/sichtM/sichtF`; gleiche Ebene Pflicht; Hysterese
  `SICHT_LOESEN`; Evakuierungsfahrzeug immer sichtbar). Der Client meldet seine Bildgröße mit der Nachricht `sicht`.

### Tick und Netz
- `TICK` 50 ms (20 Schritte/s) in `schritt(dt)`; `PATCH` 100 ms (10 Updates/s). Colyseus' eigener Patch-Timer ist aus
  (`patchRate = 1e9`); `setSimulationInterval` ruft nach jedem n-ten Schritt `broadcastPatch()`. Nicht `patchRate = null` setzen (16-ms-Takt).
- `broadcastPatch()` ruft vorher `netzAbgleich()`: setzt `state.takt` (Serveruhr, ms), Zombie-Richtung in 256 Stufen,
  kopiert genaue Positionen per `netzKopie` (ferne Zombies nur jeden 2. Patch), dann `sichtAktualisieren()`.
- Positionen im Schema sind Ganzzahlen; die Rechengenauigkeit liegt in verdeckten Symbolfeldern (`entkoppeln`).
  Sprünge ab `SPRUNG_SOFORT` (48 px) gehen sofort durch. Positionen nur über die Felder setzen, nie am Abgleich vorbei.
- Eingabe: Client sendet `{dx,dy,s,n,d}` (Dauer d, laufende Nummer n); `eingabeEmpfangen`/`eingabeSchritte` arbeiten die
  Warteschlange ab, `p.seq` meldet die letzte verarbeitete Nummer zurück (Grundlage der Client-Vorhersage).
- Meldungen: `broadcast(typ, msg)` an alle; Orts-Nachrichten tragen `x`, `y`, oft `ebene` und `von` (Sitzungs-Id des Urhebers).
  `sendeNah(typ, msg, punkte, weite)` sendet nur an Clients in der Nähe und nur bei Änderung.
  Der Client filtert nach `ebene` (nur Hörer auf gleicher Ebene) und `von` (eigene Schüsse immer hörbar): `client/ton_regeln.mjs`.

### Hauptabschnitte raum.mjs (ungefähr, nach Funktionsnamen suchen)
- Netz/Sicht: `netzAbgleich`, `sendeNah`, `sichtAktualisieren`, `eingabeEmpfangen`.
- Lebenszyklus: `onCreate` (alle `onMessage`-Handler, Weltaufbau), `onJoin`, `onDrop/onReconnect/onLeave`, `onDispose`, `weltNeuStarten`.
- Sprache/Chat: `sprach*`, `rtcWeiter`, `chat`. Speichern: `speichereSpieler/Welt/Alles`.
- Ebenen/Innenräume: `kontext`, `wv(ebene)`, `baueEbene`, `uebergang`, `uebergangsPunkt`, `innenUmschalten`.
- Türen: `tuerWahl`, `tuerKontext`, `setzeTuer`, `tuerSchlag`, `tuerAuto`, Barrikaden (`setzeBarrikade`).
- Beute/Inventar: `starteAktion`, `aktionSchritt`, `durchsucht`, `befuelle`, `fundNimm`, `benutze`, `nimmAuf`, `kiste`, `tausch*`, `starteAlle`.
- Rätsel/Handel: `stelleRaetsel`, `antwort`. Spielerzustand: `beduerfnisse`, `verwandeln`, `schaden`.
- Tick: `schritt` (Takt, Messung `messen`), `spielerSchritt`, `waffeSchritt` (Schüsse, `broadcast('schuss')`).
- Zombies: `baueFeld`/`feldRichtung` (Flowfield), `zombieSchritt`, `zombieGehen`, `zombieAbstand`, `neuerZombie`, `zombiesAuffuellen`, `laerm`.

## Client (zombies/client)

`spiel.mjs` (~4000 Zeilen, eine Phaser-Szene). Abschnitte nach Kommentarzeilen `// ----------`:
- Startschirm, Figurenwahl, Ladebildschirm (`mitspielen`), Spieler- und Geräte-Einstellungen, Bildschirmtastatur, Chat, Superuser-Menü.
- Szene (Klasse mit `constructor`, `preload`, `create`, `erzeuge`): Zoom (`passeZoomAn`, `uiMass`, `feinInnen`), Karte/Kulisse in
  Stücken (`chunksAktualisieren`, `baueStueck*`), Figuren (`neueFigur`, `figurDarstellen`, `eigeneFigur`), Licht/Nebel (`aussenLicht`, `nebelZeichnen`),
  Ansichtswechsel Innen/Außen (`innenAnsicht`, `wechsleAnsicht`, `innenAktualisieren`),
  `abgleichen` (Serverzustand → Figuren), Effekte (`feuerDarstellen`, `explosion`, `schuss`), Bedienung (`leseEingabe`, `bestimmeKontext`, `aktion`),
  `update` (Frame), `geraeusche`, `hud`, Rucksack (`rucksackZeigen`).
- Danach Rucksack/Kiste, Handel, Tauschen, Rätsel (eigene Funktionen unterhalb der Szene).
- Eigene Figur mit Vorhersage: `leseEingabe` → `schrittSim`/`vorhersage` rechnen dieselbe Bewegung wie der Server (`basis` = letzter Serverstand,
  `korr` = Restfehler, klingt ab); Eingaben nummeriert, bestätigt über `p.seq`.
- Fremde Figuren: `netzpuffer.mjs` (`NetzPuffer`) zeigt Zombies/Mitspieler um eine selbstanpassende Verzögerung (110–450 ms) versetzt und
  interpoliert zwischen Serverständen anhand `state.takt`; Sprünge > 200 px gleiten nicht.
- Weitere Module (je Datei ein Thema): `welt.mjs` (Konstanten, Waffen, Dinge, Hash/Zufall, Fingerabdruck), `osmwelt.mjs` (Weltaufbau aus Karte),
  `vektor.mjs` (glatte Straßen/Flächen, nur Darstellung), `kulisse*.mjs`/`luftbild*.mjs`/`laendlich.mjs` (Optik), `innen*.mjs` (Innenräume),
  `masse.mjs` (echte Fahrzeugmaße), `aussehen.mjs`/`figuren*.mjs`/`dingbild.mjs` (Bilder), `ton*.mjs`/`hordenlogik.mjs`/`musiklogik.mjs`/`radio.mjs` (Ton),
  `weltarbeiter.mjs`/`weltidb.mjs`/`weltkopie.mjs`/`weltladen.mjs` (Weltaufbau im Worker, Zwischenspeicher), `einstellungen_regeln.mjs`, `sprache*.mjs`,
  `uebersicht.mjs` (Karte), `tutorial.mjs`, `verwaltung.html` (Backend-Seite), `sw.js` (Service Worker), `karten/*.json` (Kartendaten).

## Welt-Erzeugung (deterministisch, Server UND Client)

- `baueWeltAusKarte(karte, seed)` in `osmwelt.mjs` baut aus Karte + Seed die Welt; Server (Worker, `weltcache.mjs`) und jeder Client rechnen
  sie unabhängig und müssen **bit-gleich** dasselbe Ergebnis haben. Beteiligt: `welt.mjs`, `osmwelt.mjs`, `innen*.mjs`, `innen_fein*.mjs`,
  `laendlich.mjs`, `stuetzpunkt.mjs`, `flugfeld_deko.mjs`, `einkaufswagen.mjs`, `zaun*.mjs`, `nebenobjekte.mjs`, `szene_b11.mjs` u. a.
- Regeln für Entscheidungen im Weltcode (Platzieren, Sperren, Wege, Auswahl): nur `+ − × ÷`, `Math.sqrt`, Rundung (`Math.round/floor/ceil`), der vorhandene Hash
  und `zufall(seed)`/Rng. Kein `Math.random`; kein `atan2`, `sin`, `cos`, `hypot` für Entscheidungen (kann je Engine/Plattform abweichen).
  Reine Darstellung darf trigonometrisch sein, fließt aber nie in Weltdaten zurück. Iterationsreihenfolgen stabil halten.
- `WELT_VERSION` (`welt.mjs`) bei jeder Änderung an Weltdaten erhöhen, `INNEN_VERSION` bei Innenraum-Änderungen. Sie gehen in `weltFingerabdruck`
  und in den Zwischenspeicher-Schlüssel (`weltSchluessel` in `weltkopie.mjs`) ein; sonst liefern alte Caches alte Welten.
- Fingerabdruck-Vergleich: `weltFingerabdruck(welt)` je Karte und Seed; lokal gegen Zielsystem mit `tools/fp_vergleich.mjs` (von `tools/einspielen.sh` aufgerufen).
- Kartendaten: `client/karten/<name>.json`; die Kartenprüfsumme steckt im Cache-Schlüssel.

## Maßstab

- Draußen: `KACHEL` = 32 px = 4 m, also **8 px = 1 m** (`PX_M` in `masse.mjs`); Fahrzeuge in echten Metern (`FZ_M`, `fzPx`).
- Drinnen (Schalter `INNEN_FEIN`, Backend-Option `innenMassstab`, der Server gibt ihn vor): Zelle `INNEN_Z` = 0,25 m, eigene Rastergröße `w.breite/w.hoehe`,
  Figurenradius `w.rs`, Faktoren `w.tempo` (`INNEN_TEMPO`) und `w.reich` (`INNEN_REICH` = 0,35; Helfer `reichVon`, `tempoVon`) – das ist der Raumfaktor R:
  Aktionsreichweiten und Tempo drinnen werden damit skaliert. Figuren erscheinen drinnen halb so groß (`INNEN_FIGUR` = 0,5 in `spiel.mjs`), die Kamera ist näher.
- Client: `uiMass()` hält Namen, Balken, Symbole in Bildschirmgröße konstant (teilt durch den Innenzoom); `feinInnen()` fragt ab, ob die Ebene Feinraster hat.
- Effekte und Reichweiten in Metern denken und mit 8 px/m umrechnen (`masse.mjs`, `hordenlogik.mjs` `PIXEL_JE_METER`).

## Einstellungen

- `server/einstellungen.mjs`: Grundwerte (`grundwerte()`), Vorlage `server/vorlage.json` (im Backend gesetzte Werte als neue Vorgabe, Arrays werden ersetzt),
  persistent in `/data/einstellungen.json`. `vorgaben()` liefert unter `node --test` (Umgebungsvariable `NODE_TEST_CONTEXT`) nur die Grundwerte,
  damit Tests nicht von der Vorlage abhängen.
- Backend: `client/verwaltung.html` (Seite in der HA-Seitenleiste) + API in `index.mjs`. Neue Einstellung = Grundwert + Prüfung/Bereinigung in
  `einstellungen.mjs` + Eingabefeld in `verwaltung.html` + (braucht der Client sie) Weiterreichen über `state.optionen` oder Nachricht.
- Geräte-/Spielereinstellungen im Client: `einstellungen_regeln.mjs`; Server-Seite `einstellungenMerken` (`raum.mjs`).

## Töne

- Geräusche werden im Browser per WebAudio erzeugt (`ton.mjs`), dazu optionale Tondateien. Regeln: `ton_regeln.mjs` (wer hört was), `tonlogik.mjs`
  (Stimmenverwaltung), `hordenlogik.mjs` (Hordenteppich), `musiklogik.mjs` (Musik je Level), `radio.mjs` (Client und Server: Radiostream).
- Tondateien liegen **nie im Repo** (Lizenz): mitgelieferte unter `/share/zombies/toene` (Umgebungsvariable `ZOMBIES_TOENE`), hochgeladene unter `/data/toene`.
  `toene-lokal/` ist gitignored. Ton-Einstellungen werden live per Nachricht `tonEinst` verteilt.

## Karten-Werkzeugkette

- Kartenbau: `tools/osm_karte.py`, `hausumringe.py`, `luftbild.py`, `nebengebaeude.py`, `kulisse.py`, `amtlich.py` (Reihenfolge und Befehle in
  `zombies/client/karten/LEVELORTE.md`). `osm_karte.py` verwirft Luftbild-/amtliche Felder, daher danach `amtlich.py` erneut laufen lassen.
- Nach jeder Kartenänderung `WELT_VERSION` erhöhen und den Fingerabdruck prüfen. Quellen: OpenStreetMap (ODbL), Bayern Open Data (CC BY 4.0) – Hinweise erhalten.

## Tests

- Alle: `cd zombies && npm test` (= `node --test --test-concurrency=3 tests/*.test.mjs`, ca. 6 min). Schnell: `npm run test:schnell` (ca. 1,5 min, Liste in `tests/schnell.txt`; Kern-/Logiktests ohne lange Echtzeit-Simulation). Mehr in `zombies/tests/README.md`. Einzeln: `cd zombies && node --test tests/<datei>.test.mjs`.
- Voraussetzung: `zombies/node_modules` (im Worktree als Symlink auf das Hauptverzeichnis; nicht committen).
- Tests starten echte Colyseus-Räume im Speicher (Datenbank `:memory:`); `NODE_TEST_CONTEXT` setzt die Grundwerte.
  `innen_fein_spiel.test.mjs` schaltet per `ZOMBIES_INNEN1M` den Feinraster ein.
- Während der Arbeit `npm run test:schnell` und betroffene Einzeldateien, vor dem Einspielen die ganze Suite. Testhilfen (freier Port, Seed) in `tests/hilfe.mjs`.
- Bekannt wacklig (besonders unter Last/parallelen Läufen): Hund-Tests (`hund.test.mjs`), Pool-/Tempo-Tests (`pooltempo.test.mjs`),
  zeitabhängige Netz-/Verkehrstests (`netz*.test.mjs`). Bei Fehlschlag zuerst allein wiederholen, bevor Code geändert wird.
- Vor dem Einspielen: `shellcheck` für Shell-Skripte, `node --check` für geänderte JS-Dateien.

## Einspielen und Veröffentlichen

- `tools/einspielen.sh` (Umgebungsvariablen `ZOMBIES_*`, optional lokale Datei `tools/einspielen.env.lokal`, gitignored): Prüfung, Fingerabdruck, Hochladen,
  Supervisor-Update, Nachprüfung. `--nur-pruefen` lädt nichts hoch. `tools/release.sh <version>` setzt die Version und legt den CHANGELOG-Kopf an.
- Version nur in `zombies/config.yaml` (`version:`) und im obersten Eintrag von `zombies/CHANGELOG.md`.

## Häufige Fallstricke

- Worktree-Agenten: zuerst `git merge --ff-only main`, sonst ist der Stand veraltet.
- Parallele Änderungen an `client/spiel.mjs` und `server/raum.mjs` kollidieren fast immer; neue Logik in eigene Module auslagern
  (wie `hordenlogik.mjs`, `waffenplaetze.mjs`) und in den Großdateien nur einhängen.
- Weltänderung ohne `WELT_VERSION`-Erhöhung → alte Zwischenspeicher, Client und Server sind uneins (Fingerabdruck, Geister-Hindernisse).
- Nicht-deterministischer Code im Weltaufbau (Regeln oben) führt zu Abweichungen zwischen Server und Browsern.
- Schema: neue Felder zählen gegen die Grenze von 63; Positionen nur über `netzfeld` ändern.
- Zeitmessungen und Tests unter Last wackeln; Ergebnisse nie während paralleler Läufe vergleichen.
- Öffentliches Repo: keine Personennamen, Adressen, Hostnamen, Zugangsdaten, Tondateien oder privaten Pfade committen.
- Glatte Linien: Flüsse, Zäune, Hecken, Flächen nie zackig im 4-m-Raster zeichnen (`zaunglatt.mjs`, `vektor.mjs`).
