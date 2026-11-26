# Zweisprachigkeit – Servertexte (Liste für Phase 2)

**Stand Phase 2 (Zweig `i18n-server`): umgesetzt.** Der Server schickt alle Spieltexte als Schlüssel + Werte (`server/texte.mjs`:
`M('gruppe.schluessel', { … }, L)` → `{ k: 'srv.gruppe.schluessel', w, lang }`; Gegenstände `D(id)`, Orte `ortK(name)`, Listen `[…]` bzw. `{ l: […], s: ' · ' }`).
Die Texte stehen in `client/i18n/de.mjs` + `en.mjs` im Abschnitt `srv`; jeder Client übersetzt in seiner Sprache (`textAus`), Bots sprechen im Chat
so in der Sprache des Empfängers und verstehen auch englische Befehle („Resi, get water“). Schemafelder (Aufgabentext, Missionsort) tragen `{ k, w }` als JSON
(`alsFeld`/`feldText`, `client/servertext.mjs`), Safe-Room-Gattungsnamen übersetzt `ortName()`, Eigennamen bleiben. Alte reine Texte zeigt der Client weiter an.
Prüfung: `node tools/i18n_pruefen.mjs` (Client + Server, 0 Treffer; Ausnahmen per `i18n-ok`, Verwaltung/Logs bleiben deutsch), Test `tests/i18n.test.mjs`
(auch: jeder gesendete Schlüssel existiert in de und en). Servertests vergleichen über `textAus(m)` (deutsch, unverändert streng).
Offen für Phase 3: Verwaltung (`einstellungen.mjs`, `index.mjs`-API), Rätselfragen, gesprochene Ansagen.

Die Liste unten ist der Stand aus Phase 1 (Zeilennummern veraltet).

Stand Phase 1 (Zweig `i18n`): Der **Client** zeigt alle eigenen Texte über `client/i18n.mjs` (`t()`, Dateien `client/i18n/de.mjs` und `en.mjs`).
Der **Server** schickt dagegen noch fertigen deutschen Text. Diese Liste sammelt die Stellen, die in Phase 2 auf Schlüssel umgestellt werden.

## Vorgehen für Phase 2

- Server schickt statt `{ text: '…' }` die Form `{ k: 'gruppe.schluessel', w: { name: 'Sepp', n: 3 } }`.
  Werte, die selbst übersetzt werden müssen (Gegenstand, Behälter), als verschachtelter Schlüssel: `w: { ding: { k: 'ding.wasser' } }`.
- Der Client übersetzt beim Anzeigen mit `textAus(m)` (in `client/i18n.mjs`). Schon vorbereitet:
  `meldung()` in `spiel.mjs` nimmt Text **oder** `{ k, w }`, der Handler für `'meldung'` und der Fall „Nichts gefunden“ (`'gefunden'`) reichen `{ k, w }` durch.
- `client/i18n.mjs` läuft unverändert im Node-Server (immer Deutsch, solange niemand `setzeSprache()` ruft); `tIn(sprache, k, w)` liefert gezielt eine Sprache,
  z. B. für Bot-Chat oder Texte, die als Zeichenkette ins Schema gehen müssen.
- Servertests prüfen heute deutsche Texte (`m.text`). Beim Umbau die Tests auf `m.k` umstellen oder `textAus(m)` vergleichen.
- Gegenstandsnamen (`DINGE[x].name`), Behälternamen (`BEHAELTER_NAME`), Handelspartner (`HANDEL.arzt.name`), Zaunnamen (`ZAUN_NAME`) und Heldennamen (`HF_LISTE[i].name`)
  sind schon Getter auf `t()` – im Server deutsch, im Browser in der gewählten Sprache. Servertexte, die sie einbauen, sollten stattdessen den Schlüssel schicken.

## Stellen im Client, die heute Servertext anzeigen

| Client | Nachricht/Feld | Herkunft (Server) |
|---|---|---|
| `spiel.mjs` `raum.onMessage('meldung')` → `meldung()` | `m.text` | fast alle Dateien, siehe unten |
| `spiel.mjs` `raum.onMessage('handel')` | `m.text` | `stuetzpunkt.mjs` (Handel mit Arzt/Soldat) |
| `spiel.mjs` `raum.onMessage('gefunden')` | `m.text` (nur „leer“-Fall, z. B. nächste Lieferung) | `raum.mjs`, `versorgung.mjs` |
| `spiel.mjs` `aufgabenZeigen()` | Schemafeld `aufgaben[].text` (`symbol`) | `aufgaben.mjs`, `mission*.mjs` |
| `spiel.mjs` `zeigeRaetsel()` / `zeigeAufloesung()` | `m.frage`, `m.antworten`, `m.thema`, `m.loesung`, `m.handel.text` | `raetsel.mjs`, `spielfragen.txt` (Fragen: **Phase 3**), `stuetzpunkt.mjs` |
| `spiel.mjs` `hordeInfoEmpfangen()` (nur Superuser) | `m.name`, `m.horden[].name`, `m.wechsel[].name` | `welle.mjs`/`raum.mjs` (Zielnamen der Horde) |
| `spiel.mjs` `mitspielen()` Fehler beim Beitritt | `e.message` (erkannt per `/Zugangscode/`, `/anderen Fenster/`, sonst roh angezeigt) | `raum.mjs` `onAuth` |
| `spiel.mjs` Chat | Bot-Nachrichten (`name`, `text`), `ort` | `botplan.mjs`, `bots.mjs`, `raum.mjs` `chat` |
| `spiel.mjs` HUD „🛡 …“, Kistenfenster | `safeRooms[].name` (Weltdaten: „Feuerwehrhaus“, „Sakristei“, „Lagerraum“, „Keller“, Ortsnamen aus der Karte) | `client/welt.mjs`, `client/osmwelt.mjs` (gemeinsamer Weltcode) |
| `faehigkeiten.mjs`, Testmenü | `suStatus`-Meldungen, Rückgaben der Befehle | `superuser.mjs` |
| `ton.mjs` Funkansage/Eilmeldung | Tondateien (gesprochene deutsche Ansagen) | `/share/zombies/toene` (Phase 3: englische Aufnahmen) |

Nicht im Spiel sichtbar, eigene Phase: Verwaltungsseite `client/verwaltung.html` und deren Texte aus `server/einstellungen.mjs` (Namen/Beschreibungen der Einstellungen und Töne).

## Fundstellen im Server (automatisch erzeugt)

Erzeugt mit der Heuristik aus `zombies/tools/i18n_pruefen.mjs` über `server/*.mjs` (Zeilennummern Stand Phase 1, ohne Konsolenausgaben und Kommentare).
Art: `meldung` = direkt `send/broadcast('meldung')`, `meldung (Hilfsfunktion)` = über `sag()`/`sendeAn()`/`melde…()`, `text-Feld` = Feld `text:` in Nachricht oder Schema,
`Name` = Namen/Beschreibungen (meist Verwaltung), `Fehler` = Fehlermeldungen. `einstellungen.mjs` betrifft nur die Verwaltung.

### raum.mjs (72)
- raum.mjs:632 [meldung] 🚨 Blaulicht und Sirene an – Zombies hören dich weithin!
- raum.mjs:997 [meldung] Langsam – zu viele Nachrichten
- raum.mjs:1004 [Text] in einem Haus
- raum.mjs:1037 [meldung] 🤖 ${} ist untätig – ein Bot übernimmt die Figur
- raum.mjs:1227 [meldung] 🌫 Nebel zieht auf – die Sicht wird schlecht
- raum.mjs:1303 [meldung] 🏠 Innenräume jetzt maßstäblich
- raum.mjs:1375 [meldung] ⭐ Level ${} – ${} Punkt${} frei (Taste K)
- raum.mjs:1701 [meldung] 🔥 Das Haus brennt – da kommst du nicht rein
- raum.mjs:2021 [Text] 💥 Die Tür ist zerbrochen!
- raum.mjs:2030 [Text] 🧟 Zombies hämmern gegen die Tür!
- raum.mjs:2043 [meldung] Zum Tauschen musst du direkt neben ihm stehen
- raum.mjs:2103 [meldung] ${}: Mein Rucksack ist voll
- raum.mjs:2109 [meldung] Für den Tausch ist im Rucksack nicht genug Platz
- raum.mjs:2165 [meldung] 🔑 Diese Tür braucht einen Schlüssel
- raum.mjs:2168 [meldung] 📻 Der Funkspruch geht noch nicht – es fehlt: ${} (in die Safe-Room-Kiste legen)
- raum.mjs:2172 [meldung] 🔒 Der Kofferraum ist zu – dafür brauchst du eine ⚒️ Brechstange
- raum.mjs:2174 [meldung] 🚪 Tür blockiert
- raum.mjs:2203 [meldung] ⚒️ Tür aufgebrochen – das war laut!
- raum.mjs:2207 [meldung] 🚪 Tür blockiert
- raum.mjs:2228 [meldung] Den toten Zombie aus der Tür gezogen
- raum.mjs:2231 [meldung] Ein toter Zombie liegt in der Tür – erst wegziehen
- raum.mjs:2236 [meldung] Tür verbarrikadiert (${} %)
- raum.mjs:2248 [meldung] ⏳ Alles durchsuchen: noch ${} s gesperrt
- raum.mjs:2256 [meldung] 🔒 Die Kofferräume sind zu – dafür brauchst du eine ⚒️ Brechstange
- raum.mjs:2288 [meldung] 🔓 ${} Tür${} geöffnet
- raum.mjs:2481 [meldung] 📝 Ein Zettel in der Tasche: Hinweis auf ${} ${} – der Suchkreis auf der Karte ist klei…
- raum.mjs:2561 [meldung] 📦 Munition voll – ${} Munitionskiste${} eingepackt
- raum.mjs:2570 [meldung] 📻 Das Radio geht jetzt nicht an
- raum.mjs:2571 [meldung] 💣 Jetzt geht kein Wurf
- raum.mjs:2577 [meldung] Dein Rucksack ist schon so groß
- raum.mjs:2579 [meldung] ${} Umgepackt – jetzt ${} Plätze
- raum.mjs:2582 [meldung] Du trägst schon feste Kleidung
- raum.mjs:2586 [meldung] 🪢 Ein Seil – brauchst du später am Fluss
- raum.mjs:2587 [meldung] 🔦 Schaltet sich in Häusern von selbst ein (hält etwa eine Stunde)
- raum.mjs:2588 [meldung] 📻 Mit einem zweiten Funkgerät im Rucksack hörst du die Mitspieler überall
- raum.mjs:2590 [meldung] Du bist nicht verletzt
- raum.mjs:2597 [meldung] ${} in der Hand
- raum.mjs:2599 [meldung] 📦 Deine Munition ist schon voll
- raum.mjs:2601 [meldung] 📦 Munitionskiste geöffnet: +${} Schuss
- raum.mjs:2603 [meldung] Bretter: an einer Tür verbarrikadieren (Taste an der Tür)
- raum.mjs:2618 [meldung] Niemand hier ist infiziert – hebe die Spritze auf
- raum.mjs:2622 [text-Feld] 💉 ${} hat sich die Rettungsspritze gesetzt
- raum.mjs:2640 [meldung] 🎒 Rucksack voll
- raum.mjs:2658 [meldung] 🎒 Rucksack voll – wähle, was du ablegst
- raum.mjs:2659 [meldung] 🧩 Missionsgegenstände lassen sich nur in die Safe-Room-Kiste legen
- raum.mjs:2680 [meldung] ${} ${} ist für die Mission wichtig – nur in die Safe-Room-Kiste legen
- raum.mjs:2716 [Text] 🧊 Du hast gerade erst etwas genommen – in ${} Min. wieder
- raum.mjs:2718 [Text] 🧊 Der Kühlschrank ist für den Notfall: erst bei unter 30 % Wasser oder Hunger
- raum.mjs:2720 [Text] Dein Rucksack ist voll
- raum.mjs:2723 [Text] 🧊 Aus dem Kühlschrank: ${} ${}
- raum.mjs:2776 [meldung] Das Schloss klemmt – keine Rätsel gefunden
- raum.mjs:2799 [meldung] 🔓 Das Schloss springt auf
- raum.mjs:2810 [text-Feld] 🔓 ${} hat das letzte Schloss geknackt – das Tor ist offen!
- raum.mjs:2811 [Text] 🔐 ${} hat ein Schloss geknackt (${}/${})
- raum.mjs:2817 [meldung] ${}: falsche Antwort – das Schloss klappert laut!
- raum.mjs:2824 [meldung] Abmelden geht nur in einem Safe Room
- raum.mjs:2875 [meldung] 🌙 Die Nacht bricht herein – Zombies werden mehr. Taschenlampe bereit?
- raum.mjs:2966 [meldung] Alle erwischt! Ihr schleppt euch in die Safe Rooms …
- raum.mjs:3217 [Text] Die Verwandlung lässt nach
- raum.mjs:3244 [meldung] 🧟 ${} hat sich verwandelt! Lauft!
- raum.mjs:3253 [meldung] ${}: ${} wacht im ${} wieder als Mensch auf
- raum.mjs:3258 [meldung] ${} liegt am Boden – hilf ihm auf!
- raum.mjs:3293 [Text] ${} hat den Zombie erledigt
- raum.mjs:3655 [meldung] 🧟 Ein Zombie ist in den ${} eingedrungen!
- raum.mjs:3656 [Text] 🧟 Ein Zombie ist ins Haus eingedrungen!
- raum.mjs:3772 [text-Feld] ${} hat ${} notdürftig aufgeholfen
- raum.mjs:3900 [meldung] Ihr seid im Safe Room aufgewacht – mit Kopfweh, aber lebendig.
### einstellungen.mjs (65)
- einstellungen.mjs:75 [Name] Hauptlied auf ${} – gehört zur Karte und wandert mit, wenn die Level-Reihenfolge geände…
- einstellungen.mjs:76 [Name] Im Bundeswehr-Lager
- einstellungen.mjs:77 [Name] Solange das Hordengeräusch läuft (bleibt danach noch 10 s)
- einstellungen.mjs:78 [Name] Solange du in einem Safe Room bist
- einstellungen.mjs:79 [Name] Wenn in Level 5 der Atomschlag-Countdown läuft
- einstellungen.mjs:84 [Name] Wenn ein Zombie erledigt wird
- einstellungen.mjs:85 [Name] Stöhnen kriechender Zombies in der Nähe
- einstellungen.mjs:86 [Name] Zombie stöhnt
- einstellungen.mjs:87 [Name] Zombie entdeckt dich
- einstellungen.mjs:88 [Name] Schleife, sobald viele Zombies in Hörweite sind (Schwellen unten bei „Hordengeräusch“);…
- einstellungen.mjs:89 [Name] Kurzer Ton, wenn plötzlich eine neue Horde in Hörweite kommt (höchstens alle 30 s)
- einstellungen.mjs:90 [Name] Hintergrund draußen (Verkehr in der Ferne)
- einstellungen.mjs:91 [Name] Ferne Zombies tagsüber – kurze Töne kommen ab und zu aus wechselnder Richtung
- einstellungen.mjs:92 [Name] Ferne Zombies und Schreie in der Nacht
- einstellungen.mjs:93 [Name] Einmal, wenn es dunkel wird
- einstellungen.mjs:94 [Name] Mensch wird gebissen
- einstellungen.mjs:95 [Name] Polizei und Feuerwehr auf der Durchfahrt (aus ihrer Richtung)
- einstellungen.mjs:96 [Name] Ein Mensch wird von Zombies angegriffen und ruft um Hilfe (nicht zu oft, aus seiner Ric…
- einstellungen.mjs:98 [Name] Behälter leer
- einstellungen.mjs:99 [Name] Wenn ein Auto in ein anderes Fahrzeug oder eine Hauswand kracht
- einstellungen.mjs:100 [Name] Wenn ein festgefahrenes Fahrzeug ein anderes zur Seite schiebt
- einstellungen.mjs:101 [Name] Aufprall (Zombie überfahren)
- einstellungen.mjs:102 [Name] Feuer bricht aus
- einstellungen.mjs:103 [Name] Schuss: Pistole
- einstellungen.mjs:104 [Name] Schuss: Jagdgewehr
- einstellungen.mjs:105 [Name] Schuss: Schrotflinte
- einstellungen.mjs:106 [Name] Hauptwaffe von Leopard und Puma; ohne Zuordnung dient die Schrotflinten-Datei bzw. ein …
- einstellungen.mjs:107 [Name] Granate, Unfall, Fahrzeug; ohne Zuordnung dient die Schrotflinten-Datei bzw. ein tiefer…
- einstellungen.mjs:108 [Name] Tür geht auf
- einstellungen.mjs:109 [Name] Tür fällt zu
- einstellungen.mjs:110 [Name] Motorgeräusch eines Autos, das ein Spieler mit dem Autoschlüssel fährt (Schleife, die T…
- einstellungen.mjs:111 [Name] Auto fährt vorbei
- einstellungen.mjs:112 [Name] Nachrichtensprecher im Live-Radio (allgemeine Zombie-Eilmeldung) auf ${}; unterbricht d…
- einstellungen.mjs:113 [Name] Läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren
- einstellungen.mjs:114 [Name] Auf der Startseite (nach dem ersten Antippen), blendet beim Spielbeginn aus
- einstellungen.mjs:115 [Name] Sprachansage nach dem Funkspruch: „Alles klar, sichern Sie die notwendigen Gegenstände …
- einstellungen.mjs:116 [Name] Soldaten im Bundeswehr-Lager rufen „Halt, sofort stehen bleiben!“, wenn sich jemand näh…
- einstellungen.mjs:117 [Name] Kurzer Klick bei wichtigen Meldungen
- einstellungen.mjs:118 [Name] Rauschen in der Nähe von Bach und Fluss
- einstellungen.mjs:119 [Name] Durst (Männerstimme)
- einstellungen.mjs:120 [Name] Bei großem Durst alle 22–30 s; Stimme je Gerät fest
- einstellungen.mjs:121 [Name] Panzer fährt
- einstellungen.mjs:122 [Name] Chat-Nachricht
- einstellungen.mjs:123 [Name] Radio (Gegenstand)
- einstellungen.mjs:124 [Name] Wenn eine Waffe nachgeladen wird (ohne Datei ein kurzer Klick)
- einstellungen.mjs:125 [Name] Der Begleiter-Hund bellt, wenn ein Zombie vor der Haustür steht, und kurz bei Ablenkung…
- einstellungen.mjs:126 [Name] Hülse fällt
- einstellungen.mjs:133 [Name] Musik im Spiel (Level, Lager, Horde …)
### superuser.mjs (59)
- superuser.mjs:40 [Text] Testzugang ist nicht eingerichtet
- superuser.mjs:41 [Text] Zu viele Versuche – bitte eine Minute warten
- superuser.mjs:154 [Text] Kein Bundeswehr-Lager auf dieser Karte
- superuser.mjs:156 [Text] 🎖 Du bist im Bundeswehr-Lager
- superuser.mjs:160 [Text] Kein Evakuierungspunkt gefunden
- superuser.mjs:162 [Text] 📍 Du bist am Evakuierungspunkt
- superuser.mjs:175 [Text] 🤖 ${} Bot${} bei dir, voll geheilt
- superuser.mjs:179 [Text] Gerade keine Horde
- superuser.mjs:183 [Text] Gerade keine Horde
- superuser.mjs:185 [Text] 🧟 Du stehst ca. 50 m vor der Horde
- superuser.mjs:190 [Text] Keine Wellenlogik
- superuser.mjs:191 [Text] Eine Horde wird gerade angesagt
- superuser.mjs:195 [Text] Kein Platz für die Horde gefunden
- superuser.mjs:196 [Text] 🧟 Horde mit ${} Zombies gestartet
- superuser.mjs:203 [Text] Horden-Anzeige: aus
- superuser.mjs:211 [Text] 🎥 Kameraflug: an (Figur unsichtbar und unverwundbar)
- superuser.mjs:219 [Text] Unsterblich: aus
- superuser.mjs:224 [Text] ☀️ Es ist 12:00 Uhr
- superuser.mjs:230 [Text] Nebel: aus
- superuser.mjs:233 [Text] Geh erst nach draußen, dann kann ein Unfall passieren
- superuser.mjs:235 [Text] 💥 Ein Auto verunglückt in deiner Nähe
- superuser.mjs:239 [Text] Unbekannte Waffe
- superuser.mjs:240 [Text] 🔫 ${} in der Hand, Munition voll
- superuser.mjs:244 [Text] Unbekannter Gegenstand
- superuser.mjs:246 [Text] ${} hast du schon im Rucksack
- superuser.mjs:247 [Text] Rucksack voll – erst etwas ablegen
- superuser.mjs:249 [Text] ${} liegt im Rucksack
- superuser.mjs:253 [Text] Unbekanntes Fahrzeug
- superuser.mjs:254 [Text] Geh erst nach draußen, dann kannst du ein Fahrzeug setzen
- superuser.mjs:255 [Text] Steig erst aus, dann kannst du ein Fahrzeug setzen
- superuser.mjs:257 [Text] Kein Platz für das Fahrzeug – such eine freie Fläche
- superuser.mjs:258 [Text] 🛡️ ${} steht neben dir (E zum Einsteigen, lenken wie beim Gehen, der Turm schießt von …
- superuser.mjs:261 [Text] Fahrzeug entfernt
- superuser.mjs:264 [Text] 🎒 Alles aufgefüllt
- superuser.mjs:267 [Text] Aufgaben/Evakuierung sind ausgeschaltet
- superuser.mjs:268 [Text] Das Fahrzeug ist schon da
- superuser.mjs:272 [Text] 🚌 Evakuierung gerufen – das Fahrzeug kommt (übrige Aufgaben bleiben offen)
- superuser.mjs:276 [Text] Aufgaben/Evakuierung sind ausgeschaltet
- superuser.mjs:282 [Text] ✅ Alle Aufgaben erledigt – die Evakuierung kann gerufen werden
- superuser.mjs:288 [Text] 📍 Du bist im Haus
- superuser.mjs:291 [Text] Ungültiger Ort
- superuser.mjs:293 [Text] Dort ist kein freier Platz
- superuser.mjs:295 [Text] 📍 Du bist dort
- superuser.mjs:309 [Text] Ein Levelwechsel läuft schon
- superuser.mjs:313 [Text] 🧪 Wechsel zu Level ${} (${}) …
- superuser.mjs:316 [Text] Kein Atomschlag-Countdown auf dieser Karte (nur Andermatt)
- superuser.mjs:317 [Text] ☢️ Countdown steht jetzt auf ${} s
- superuser.mjs:321 [Text] Kein Bundeswehr-Lager auf dieser Karte
- superuser.mjs:323 [Text] Das Lager steht schon
- superuser.mjs:325 [Text] 🎖 Lager wieder aufgebaut
- superuser.mjs:327 [Text] Das Lager ist schon gefallen
- superuser.mjs:328 [Text] Das Lager ist ausgeschaltet
- superuser.mjs:330 [Text] 💥 Lager ist gefallen
### aufgaben.mjs (58)
- aufgaben.mjs:40 [Text] die Isarauen
- aufgaben.mjs:59 [text-Feld] Funkspruch absetzen (Funktisch im Safe Room)
- aufgaben.mjs:64 [text-Feld] Vorräte sichern: ${} Wasser + ${} Essen in Safe-Room-Kisten
- aufgaben.mjs:69 [text-Feld] Medizin holen: eine Spritze aus der Apotheke
- aufgaben.mjs:74 [text-Feld] Zombies erledigen: zusammen ${}
- aufgaben.mjs:79 [text-Feld] Tor am Ortsausgang öffnen (alle Schlösser)
- aufgaben.mjs:84 [text-Feld] Taschenlampen: jeder hat eine
- aufgaben.mjs:90 [text-Feld] Missionsgegenstände finden und in die Safe-Room-Kiste legen: 
- aufgaben.mjs:96 [text-Feld] Den Funk-Safe-Room zu 100 % verbarrikadieren
- aufgaben.mjs:449 [meldung] 📻 ${} hat den Funkspruch abgesetzt – ${} kommt um ${} zum Ortsausgang!
- aufgaben.mjs:484 [meldung] 📍 Landeplatz steht fest – der A400M landet dort, er ist auf der Karte markiert
- aufgaben.mjs:485 [Text] 📍 Abholstelle am Ortsausgang steht fest – der Panzer holt euch dort ab, sie ist auf de…
- aufgaben.mjs:502 [meldung] ${} ${} kommt um ${} zum Ortsausgang!
- aufgaben.mjs:543 [meldung] ☢️ Alle im Bunker – Tor schließt in ${} s
- aufgaben.mjs:628 [meldung] ⏩ Alle warten am Abholpunkt – die Zeit vergeht schneller, bis ${} kommt
- aufgaben.mjs:649 [meldung] ${} Panzer im Anmarsch aus ${}: ${} m Luftlinie (${} m Fahrt), er trifft um ${} an der …
- aufgaben.mjs:677 [meldung] ${} ${} fährt zum Ortsausgang vor!
- aufgaben.mjs:683 [Name] der Evakuierungspanzer
- aufgaben.mjs:684 [Name] der A400M
- aufgaben.mjs:685 [Name] der NH90
- aufgaben.mjs:686 [Name] der Bunker
- aufgaben.mjs:687 [Name] der Evakuierungsbus
- aufgaben.mjs:693 [meldung] ✈️ Der A400M ist gelandet! Einsteigen an der Heckrampe – Abflug um ${}
- aufgaben.mjs:764 [meldung (Hilfsfunktion)] 🚪 Aussteigen geht erst, wenn das Fahrzeug steht.
- aufgaben.mjs:772 [meldung (Hilfsfunktion)] 🚪 Du bist ausgestiegen. Steig wieder ein, indem du erneut zum Fahrzeug gehst.
- aufgaben.mjs:779 [meldung (Hilfsfunktion)] ☢️ Du bist im Bunker – hier überstehst du den Schlag. Zum Verlassen: Taste E oder Knopf…
- aufgaben.mjs:780 [Text] der Hubschrauber
- aufgaben.mjs:782 [Text] ${} Du bist an Bord. ${} kann aber noch nicht abfliegen/abfahren – es fehlt: ${}. Zum A…
- aufgaben.mjs:783 [Text] ${} Du bist an Bord – es geht los, sobald alle da sind (oder die Wartezeit abläuft).
- aufgaben.mjs:809 [meldung (Hilfsfunktion)] ⏳ ${} Noch ${} s, dann fährt ${} OHNE Erfolg ab und setzt alle ab. Es fehlt: ${}
- aufgaben.mjs:828 [meldung] ✈️ Ein A400M setzt zur Landung an – der Landeplatz ist auf der Karte markiert!
- aufgaben.mjs:865 [meldung] 🔥 Triebwerk 3 des A400M fängt Feuer – Start abgebrochen! Alle raus!
- aufgaben.mjs:866 [meldung] 🚁 Zu Fuß zum Hubschrauber-Landeplatz (auf der Karte markiert) – er landet in ${} s
- aufgaben.mjs:902 [meldung (Hilfsfunktion)] ☢️ Der Bunker hält – ihr habt den Schlag überlebt!
- aufgaben.mjs:903 [meldung (Hilfsfunktion)] ☢️ Der Schlag erwischt euch draußen …
- aufgaben.mjs:924 [meldung] ✈️ Ein A400M kommt im Landeanflug auf die Landebahn …
- aufgaben.mjs:939 [meldung] 💥 Der A400M schlägt hart auf der Piste auf – ein Triebwerk brennt! Weg von der Landebahn!
- aufgaben.mjs:949 [meldung] 🔥 Der A400M ist bruchgelandet und steht im Vollbrand – Abstand vom Feuer! Ein Hubschra…
- aufgaben.mjs:959 [meldung] 🚁 Funkkontakt steht – ein NH90 landet in ${} s auf dem markierten Platz
- aufgaben.mjs:978 [meldung (Hilfsfunktion)] ✈️ Der A400M schlittert über die Piste – du wirst zur Seite gestoßen!
- aufgaben.mjs:1020 [meldung] 🚁 Der Hubschrauber ist gelandet! Einsteigen – Abflug um ${}
- aufgaben.mjs:1044 [meldung] 🚁 Der Hubschrauber ist ohne euch abgeflogen – er kommt in ${} s noch einmal
- aufgaben.mjs:1063 [Text] ${} ${} fährt ohne Erfolg ab – ihr steigt aus. Es fehlte: ${}
- aufgaben.mjs:1068 [meldung] ${} ${} ist ohne euch ${} (es fehlte: ${}) – morgen gibt es ${}
- aufgaben.mjs:1079 [meldung] 🎉 Geschafft! Weiter nach Level ${} – ${}
- aufgaben.mjs:1080 [meldung] ${} Wer nicht an Bord war, kommt trotzdem mit – ihr seid eine Gruppe
### botplan.mjs (20)
- botplan.mjs:28 [Text] eine Spritze
- botplan.mjs:74 [Text] in einem Haus
- botplan.mjs:179 [Text] Ich setz den Funkspruch ab
- botplan.mjs:182 [Text] Ich verbarrikadier den Safe Room
- botplan.mjs:197 [Text] Der Bus ist da – kommt, wir steigen ein!
- botplan.mjs:438 [Text] aus einem Haus
- botplan.mjs:439 [Text] aus einem Kofferraum
- botplan.mjs:464 [Text] Ich hol Vorräte
- botplan.mjs:488 [Text] ${} ${} ${} jetzt in der Kiste im ${}
- botplan.mjs:521 [Text] ${}, hier liegt eine Taschenlampe für dich
- botplan.mjs:530 [Text] Ich such eine Taschenlampe ${}
- botplan.mjs:577 [Text] Funkspruch ist raus – der Bus kommt um ${} Uhr!
- botplan.mjs:629 [Text] Alles klar, ich bleib bei dir
- botplan.mjs:630 [Text] Mach ich – ich hol ${}
- botplan.mjs:631 [Text] Ich bleib hier und pass auf
- botplan.mjs:633 [Text] Der Funkspruch ist schon raus
- botplan.mjs:635 [Text] Okay, ich schau selbst, was zu tun ist
### stuetzpunkt.mjs (17)
- stuetzpunkt.mjs:109 [Text] Alle Soldaten sind gefallen
- stuetzpunkt.mjs:118 [meldung] 📻 ${}er Bundeswehr-Stützpunkt ist gefallen! Soldaten, Ärzte und Verwundete sind verlor…
- stuetzpunkt.mjs:148 [meldung] 📻 Der Bundeswehr-Stützpunkt ist wieder besetzt.
- stuetzpunkt.mjs:431 [meldung] 📦 Soldaten holen Munition
- stuetzpunkt.mjs:692 [meldung (Hilfsfunktion)] Der Stützpunkt ist gefallen – hier tauscht niemand mehr
- stuetzpunkt.mjs:695 [meldung (Hilfsfunktion)] Hier ist kein ${} in der Nähe
- stuetzpunkt.mjs:697 [meldung (Hilfsfunktion)] Dafür fehlt dir etwas im Rucksack
- stuetzpunkt.mjs:699 [meldung (Hilfsfunktion)] Deine Munition ist schon voll
- stuetzpunkt.mjs:703 [meldung (Hilfsfunktion)] Dein Rucksack ist zu voll
- stuetzpunkt.mjs:708 [Text] 🧰 ${} Schuss
- stuetzpunkt.mjs:715 [Text] Deine Munition ist schon voll
- stuetzpunkt.mjs:718 [Text] Dein Rucksack ist zu voll
- stuetzpunkt.mjs:734 [meldung (Hilfsfunktion)] Deine Munition ist schon voll
- stuetzpunkt.mjs:748 [Text] Falsch – die Serie beginnt von vorn
- stuetzpunkt.mjs:755 [Fehler] 🧰 ${} Schuss
### pkw.mjs (7)
- pkw.mjs:105 [meldung (Hilfsfunktion)] 🚗 Du fährst jetzt das Auto.
- pkw.mjs:122 [meldung (Hilfsfunktion)] 🚓 Du fährst den Streifenwagen (Gehen-Taste lenkt, E steigt aus, H = Blaulicht + Sirene…
- pkw.mjs:233 [meldung (Hilfsfunktion)] 💥 Aufprall mit ${} km/h${} · Auto ${} %
- pkw.mjs:245 [meldung (Hilfsfunktion)] 🌿 Durch Zaun und Hecke – das bremst und kostet Blech.
- pkw.mjs:278 [meldung (Hilfsfunktion)] 🔥 Das Auto ist hinüber – alle raus!
### faehigkeiten.mjs (6)
- faehigkeiten.mjs:9 [text-Feld] Chance je Stufe, beim Schießen keine Munition zu verbrauchen
- faehigkeiten.mjs:11 [text-Feld] Du hältst je Stufe ca. 10 % mehr aus (Bisse wirken schwächer)
- faehigkeiten.mjs:12 [text-Feld] Durst und Hunger sinken je Stufe 10 % langsamer
- faehigkeiten.mjs:13 [text-Feld] Zombies hören dich je Stufe 8 % weniger weit
- faehigkeiten.mjs:14 [text-Feld] Aufhelfen und Verbandszeug wirken je Stufe 15 % besser
- faehigkeiten.mjs:15 [text-Feld] +1 Rucksackplatz bei Stufe 3 und noch einer bei Stufe 5
### menschen.mjs (6)
- menschen.mjs:255 [meldung] 🙋 Du hast schon zwei Begleiter
- menschen.mjs:259 [meldung] 🙋 „Bitte bring mich in Sicherheit!“ – Er folgt dir, bring ihn in einen Safe Room.
- menschen.mjs:309 [meldung] 🙋 ${} hat einen Menschen in Sicherheit gebracht!
- menschen.mjs:313 [meldung] 🗺 Der Gerettete verrät dir etwas über ${} ${} – der Suchkreis auf der Karte ist kleine…
- menschen.mjs:316 [meldung] 🎁 Zum Dank: 20 Schuss (Rucksack voll)
- menschen.mjs:668 [meldung] 🧟 Ein gebissener Mensch hat sich verwandelt
### waffenplaetze.mjs (6)
- waffenplaetze.mjs:107 [meldung] ✊ ${}: leer – Faust
- waffenplaetze.mjs:173 [meldung] ${} ${} leer – ${} ${}
- waffenplaetze.mjs:176 [meldung] ${} ${} leer – ✊ Faust
- waffenplaetze.mjs:228 [meldung] 🎒 Rucksack voll
- waffenplaetze.mjs:231 [meldung] ${} ${} in den Rucksack${}
- waffenplaetze.mjs:255 [meldung] 💣 ${} Handgranate${} zum Vorrat (Platz ${})
### finale.mjs (5)
- finale.mjs:71 [meldung] ab in den Bunker!
- finale.mjs:86 [meldung (Hilfsfunktion)] ☢️ Das Bunkertor ist verschlossen – es fehlt: ${}
- finale.mjs:98 [text-Feld] ☢️ Geschafft – ihr habt im Bunker überlebt!
- finale.mjs:99 [text-Feld] ☢️ Game over – niemand hat den Bunker erreicht …
### raetsel.mjs (4)
- raetsel.mjs:45 [Text] Frage, richtige oder falsche Antwort fehlt
- raetsel.mjs:46 [Text] Richtige Antwort steht auch bei den falschen
- raetsel.mjs:47 [Text] Frage zu lang (höchstens 200 Zeichen)
- raetsel.mjs:48 [Text] Antwort zu lang (höchstens 80 Zeichen)
### welle.mjs (4)
- welle.mjs:149 [meldung] 🧟 Eine Zombiehorde kommt von ${}!
- welle.mjs:185 [meldung] 🧟 Eine Zombiehorde kommt von ${}!
- welle.mjs:409 [Text] Spieler-Nähe
- welle.mjs:739 [Text] Abzug zum Kartenrand
### fahrbar.mjs (3)
- fahrbar.mjs:144 [meldung (Hilfsfunktion)] 🛡️ Du fährst den ${} (Gehen-Taste lenkt, E steigt aus). Der Turm schießt von selbst.
- fahrbar.mjs:158 [meldung (Hilfsfunktion)] 🛡️ Du fährst jetzt den ${}.
### panzercrash.mjs (3)
- panzercrash.mjs:126 [meldung (Hilfsfunktion)] 💥 Ein Panzer hat das Auto gerammt!
- panzercrash.mjs:127 [meldung (Hilfsfunktion)] 💥 Vom Panzer gerammt – alle raus!
### versorgung.mjs (3)
- versorgung.mjs:47 [meldung] 🪖 Die Bundeswehr hat neue Versorgung in die Munitionskisten im Lager gelegt: Munition,…
- versorgung.mjs:104 [Text] Keine Lieferungen mehr – die Bundeswehr hat das Lager aufgegeben
- versorgung.mjs:105 [Text] Leer – nächste Lieferung am Tag ${}, ca. ${} Uhr
### hund.mjs (2)
- hund.mjs:144 [meldung] 🐕 Der Hund läuft davon
- hund.mjs:209 [meldung] 🐕 Ein Hund läuft dir zu!
### a400m_kisten.mjs (1)
- a400m_kisten.mjs:69 [meldung] 📦 Munitionskiste geöffnet: +${} Schuss, +${} Handgranate${}
### boxer.mjs (1)
- boxer.mjs:111 [meldung (Hilfsfunktion)] 🧟 Eine Horde (${}) kommt auf den Boxer zu!
### feuer.mjs (1)
- feuer.mjs:102 [meldung] 🔥 Ein Fahrzeug ist in Flammen aufgegangen!
### mission.mjs (1)
- mission.mjs:67 [Text] größeres Gebäude
### munition.mjs (1)
- munition.mjs:36 [Text] 📦 Munitionskiste geöffnet: +${} Schuss
### szene_b11.mjs (1)
- szene_b11.mjs:238 [meldung] 📻 Der Bundeswehr-Posten an der B 11 ist gefallen – Puma und Leopard schweigen.

## Hinweis zur Vollständigkeit

Die Heuristik findet Texte mit Umlauten oder häufigen deutschen Wörtern. Zur Gegenprobe in Phase 2 zusätzlich alle Sendestellen durchgehen:
`grep -nE "send\('(meldung|handel|gefunden)'|broadcast\('(meldung|chat)'|sag\(|sendeAn\(" zombies/server/*.mjs` (Stand Phase 1: rund 160 Zeilen),
außerdem Texte, die über Schemafelder gehen (`aufgaben`, Bot-Namen) und `onAuth`-Fehler.
