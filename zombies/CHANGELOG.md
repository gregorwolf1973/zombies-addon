# Changelog

## 0.42.0 – 19.11.2026

- Einheitliche Figurgrößen: jedes Bild bekommt einen eigenen Ausgleich (client/groessen.mjs, gemessen mit tools/groessen_messen.py); Bewohner so breit wie der Survivor, alle Zombie-Typen etwa 10 % breiter, Leichen passend lang. Die Größenregler wirken auf diese Grundgröße, Vorschau und Spiel rechnen gleich.
- Verbindung beendet: Hinweis antippen lädt neu (in der installierten App geht Herunterziehen nicht); kommt die App aus dem Hintergrund zurück, lädt sie von selbst neu.
- Drei Türarten für verschlossene Zimmertüren: frei, nur per Rätsel (❓), nur mit Schlüsselbund (🔑); Anteile in der Verwaltung (Vorgabe 50/25/25 %); Brechstange öffnet keine verschlossenen Zimmertüren mehr.

## 0.41.0 – 19.11.2026

- Neue Chat-Nachrichten mit Handy-Benachrichtigungston; Chat über den ganzen Bildschirm; Tastatur auf dem Handy erst beim Antippen des Eingabefelds.
- Eckkarte, Symbolleiste und Uhrzeit ganz oben; Safe-Room-Infofeld (Barrikade, Ausruhen) unter der Uhrzeit.
- Verwaltung: Größenvorschau zeigt Survivor, Bewohner, Zombie und Leiche im Spielmaßstab mit sichtbarer Größe in Spielpixeln.

## 0.40.1 – 19.11.2026

- Safe Rooms auf der Karte deutlicher: grünes Haus, grüner Kreis mit Schild, auf der großen Karte „SAFE“.

## 0.40.0 – 19.11.2026

- Großer Aktionsknopf wieder entfernt: normale Aktionsknöpfe rechts über dem Inventar.
- Symbolleiste (⭐ 💬 🎤 Zoom ⚙️) rechts oben über der Eckkarte statt ☰-Menü, Uhrzeit unter der Eckkarte.
- Aufgaben ganz oben links über den Balken; die aufgeklappte Liste liegt deckend über allem.

## 0.39.0 – 19.11.2026

- Gesundheit, Wasser und Hunger als drei Balken oben links (blinken unter 20 %).
- Spielerliste eingeklappt als farbige Punkte (rot blinkend am Boden, grau bei AFK/Bot).
- Eckkarte wieder in voller Größe, halbtransparent (Stufe wählbar).
- Großer, verschiebbarer Aktionsknopf (rechts in der Bildmitte), weitere Aktionen bei langem Druck.
- Neue Spieler-Einstellungen (⚙️): Lautstärke, Aktionsknopf verschieben/zurücksetzen, Kartentransparenz.
- Meldungen unten direkt über dem Inventar.
- Verwaltung: Größe der Zombies und Leichen verständlicher (Einzelregler, Global ±50 % mit Knöpfen, Ergebniszeile) und große Vorschau.

## 0.38.0 – 19.11.2026

- Handy: Inventar als schmale Leiste ganz unten, Aufgaben als Knopf (pulsiert bei neuen), Spielerliste einklappbar, Kopfleisten-Knöpfe im ☰-Menü, kleinere Karte, höchstens 2 Meldungen.
- Zoom-Knöpfe nur noch am PC (Touch: Zwei-Finger-Zoom).
- Ton insgesamt leiser (etwa 45 %), 🔊-Knopf schaltet 100/50/25 %/stumm und merkt sich die Stufe.
- Startseite auf dem Handy scrollbar und kompakter, das Namensfeld bleibt beim Tippen sichtbar.

## 0.37.0 – 19.11.2026

- Verwaltung: Gesamtgröße für Zombies und Leichen (−50 % … +50 %), Zombie-Lebenspunkte einstellbar (Kriecher 35 % davon).
- Verwaltung: bei jeder Waffe, beim MG-Nest und beim Puma live „Treffer bis Tod“ (normal/überrascht) und Schaden pro Sekunde.
- Verwaltung: alle Zeitangaben mit Einheit (echte Zeit oder Spielzeit mit Umrechnung bei aktueller Tageslänge).

## 0.36.0 – 19.11.2026

- Verwaltung: Zombie- und Leichengröße getrennt einstellbar (50–200 %) mit Live-Vorschau neben einer Spielerfigur, Vorschau-Typ wählbar.
- Verwaltung als Akkordeon: je Reiter ist nur ein Abschnitt offen, der zuletzt geöffnete wird gemerkt.

## 0.35.0 – 19.11.2026

- Eigene Totenbilder (mit Google Gemini erzeugt) für 15 Zombie-Typen, jeweils passend zum lebenden Zombie, mit Blutlache; Tarn-Zombie mit neuem Totenbild.

## 0.34.0 – 19.11.2026

- Keine lauten Schüsse und Schreie mehr direkt nach dem Beitritt (Ortstöne erst, wenn die eigene Position bekannt ist).
- Blutspritzer bei Spielertreffern auf Zombies, auch in Gebäuden.
- Innenräume: Möbel auf alle Zimmer verteilt, meist mit der Längsseite an der Wand, mit Abstand zueinander (Welt wird neu gebaut).
- Neue Zombies kleiner und mit Armen.
- Puma fährt frei im Lagerinneren zum Hotspot mit den meisten Zombies (alle Seiten), fährt rückwärts statt zu wenden; Lager mit breiter Fahrgasse umgebaut.
- Munitionskisten der Bundeswehr: für jeden Mitspieler 100 Schuss, eine Schusswaffe und eine Taschenlampe.
- Verwaltung: Töne nach Bereichen gruppiert, Mehrfachauswahl je Ereignis mit nur passenden Dateien und Probehören; Vorschaubilder bei den Zombietypen.

## 0.33.0 – 19.11.2026

- Zombiewellen bis 300; der Server rechnet Zombies und Menschen fern aller Spieler nur jeden 4. Takt, nutzt ein Raster für Nähe-Suchen und baut das Wegefeld nur bei Bedarf neu (auf dem PC etwa 2,5× weniger Rechenzeit je Takt).
- Untätige Spieler: nach 60 s ohne Eingabe steuert die Bot-Logik die Figur (folgt, wehrt sich, versorgt sich), 🤖 am Namen; die nächste Eingabe gibt die Kontrolle zurück.
- Fähigkeiten: Erfahrung und Level, je Aufstieg ein Punkt für Zielen, Tempo, Leben, Ausdauer, Leise, Sanitäter, Tragen (je 5 Stufen, ⭐ bzw. Taste K); in der Verwaltung abschaltbar, mit XP-Faktor.
- Bundeswehr: größerer Puma, der hinter dem Draht patrouilliert und zu den Angreifern fährt; Fetzen bei Treffern; nachts Scheinwerfer auf die Angriffsstellen und Lampen im Lager.
- Aufheben mit Auswahl, wenn mehrere Dinge beieinander liegen; bei vollem Rucksack wählbar, was abgelegt wird.
- 18 neue Zombie-Typen (mit Google Gemini erzeugt), in der Verwaltung einzeln schaltbar.
- Neue Töne: Durst (Männer- bzw. Frauenstimme), Schrotflinte, Kettenrasseln des Puma, Hülse fällt in Räumen.

## 0.32.0 – 19.11.2026

- Verwaltung: Schaden und Schussfolge je Waffe, Schussfolge des Puma (Vorgabe 2,5 s), Zombietypen einzeln an/aus, Ansteckung der Spieler in %, Verwandlungszeit der Menschen in Spielminuten.
- Zombies verfolgen Menschen gezielt; ein Biss genügt, Menschen fliehen langsamer.
- Tod: volle Werte nach dem Aufwachen, die gesamte Ausrüstung bleibt einen Spieltag am Sterbeort liegen.
- Innenräume: Möbel berühren sich nicht mehr über Eck; Bad/Toilette oft mit Wasser; Safe-Room-Kühlschrank als Notvorrat (unter 30 %, einmal je Spielstunde).
- Mülltonnen mit Essen, Seil, Wasser.
- Bundeswehr: Munitionskisten mit eigenem Inhalt für jeden Mitspieler; Tausch bei Soldaten und Arzt mit höchstens 3 Gegenstandstypen oder 6 richtigen Rätseln am Stück.
- Karte: etwa 15 % weniger Zäune und Hecken, Durchgang zwischen Nachbarhäusern; Fluss geglättet (Welt wird neu gebaut).
- Startmusik beginnt sofort (bzw. bei der ersten Berührung, wenn der Browser blockiert).
- Wer den Tab über 5 Minuten im Hintergrund hat, wird abgemeldet, damit der Server ruht; beim Zurückkommen lädt die Seite neu.

## 0.31.0 – 19.11.2026

- Evakuierungsbus auf Karte und Eckkarte auffällig (pulsierendes Bussymbol mit Ring); Mitspieler am Boden als blinkendes rotes Kreuz.
- Meldungen kleiner, halbtransparent, ganz oben und kürzer sichtbar.
- Bildschirmtastatur verdeckt Chat und Eingaben nicht mehr (visualViewport).
- Rätsel: richtige Antwort nur kurz bestätigt, dann schließt sich das Fenster bzw. die nächste Frage folgt.
- Ton pausiert, wenn der Tab im Hintergrund oder das Handy gesperrt ist (Sprachchat läuft weiter).
- Dämmerung: weicher, neutraler Übergang über eine Spielstunde; Nachtdunkelheit draußen einstellbar (Vorgabe 92 %).
- Treppen: Ebenenwechsel löst schneller aus; nach jedem Wechsel 1 s Schutz vor Bissen, und in ca. 18 m um den Ankunftspunkt entstehen keine Zombies.

## 0.30.0 – 18.11.2026

- Bundeswehr verteidigt den Stützpunkt: MG-Nester feuern Salven, der Puma dreht den Turm und schießt, jeder Soldat
  schießt von seinem Posten mit dem Gewehr – auf alle Zombies in der Nähe, auch auf die, die ins Lager gelangen. Die
  Soldaten bleiben im Lager. Die Abschüsse zählen nicht für die Aufgabe „Zombies erledigen“
- Der Stützpunkt fällt nach einigen Spieltagen (Einstellung „Bundeswehr“, Vorgabe 3, 0 = nie): dann stehen Zombies an
  den Posten, die Kisten bleiben plünderbar
- Neue Waffen nur bei der Bundeswehr: Handgranate (Taste Q oder zweiter Knopf, Explosion nach 2 s), Maschinenpistole,
  Maschinengewehr (MG-Träger laufen langsamer); Munition bis 150
- Tauschen mit Ärzten (Verband, Spritze) und Soldaten im Lager (Handgranate, 100 Schuss) zu festen Preisen; Ärzte
  heilen in ihrer Nähe; Feldbetten im Sanitätszelt zum Ausruhen; Funkspruch auch im Funkzelt
- Bots arbeiten selbständig an den Aufgaben: je Mensch bleibt ein Begleiter, die anderen sammeln Wasser, Essen,
  Medizin und Bretter und bringen sie in die Safe-Room-Kiste, setzen den Funkspruch ab, jagen Zombies und gehen zum Bus.
  Sie sagen im Chat, was sie tun, und folgen Befehlen: „Resi, hol wasser“, „alle folgt mir“, „Sepp, bleib hier“,
  „Vroni, funk“, „Resi, frei“
- Bots räumen die Vorratskiste nicht mehr aus: Sie nehmen nur, was sie gerade dringend brauchen, und nie die
  Vorräte für die Aufgabe
- Bots nehmen Geschenke an (z. B. eine Ersatz-Taschenlampe); bei vollem Rucksack sagen sie es
- Ton: ungültige Positionen können die Tonausgabe und das Bild nicht mehr anhalten

## 0.29.0 – 18.11.2026

- Aufgaben und Evakuierung: Jede Runde hat gemeinsame Aufgaben (Pflicht: Funkspruch am Funktisch eines Safe Rooms;
  dazu z. B. Vorräte in die Kiste, Medizin holen, Zombies erledigen, Tor öffnen). Mit Funkspruch kommt um 18 Uhr ein
  gelber Evakuierungsbus zum Ortsausgang und wartet; wer an Bord ist und genug Aufgaben geschafft hat, fährt ins
  nächste Level (Geretsried ↔ Isarauen). Aufgabenliste links oben (📋), Bus auf der Eckkarte; Einstellungen
  „Aufgaben & Evakuierung“
- Bundeswehr-Stützpunkt (Aufbau): je Karte eine Feldstellung mit S-Draht und Durchfahrt, Schützenpanzer Puma,
  Sandsackstellungen, MG-Nestern, Sanitätszelt mit Feldbetten, Verwundeten und Ärzten, Funkzelt und Lager mit
  Munitionskisten, Container und LKW; Kisten durchsuchbar, ✚ auf der Eckkarte
- Zombiewellen: alle 20 Spielminuten (einstellbar) zieht eine Gruppe von 20–50 Zombies von Westen oder Osten quer
  durchs Bild; Zombies laufen unterschiedlich schnell (±10 %)
- Sirene: Blaulicht-Fahrten viel seltener (Einstellung aus/selten/normal), Sirene nur in der Nähe und nur während der
  Fahrt
- Mehr und größere Bäume; Baumkronen sind durchscheinend und verdecken keine Figuren mehr; Blumenbeete entfernt
- Viele neue Autos (OpenGameArt: Unlucky Studio, looneybits, TRBRY, Cliipso), Polizei mit Blaulicht-Bildern, echte
  Laster
- Tag- und Nachtbeginn einstellbar (Dämmerung je 2 Stunden davor)
- Einstellungsseite in Reitern (Spiel, Zombies, Welt & Ausbruch, Funde & Waffen, Sprache & Töne, Aufgaben, Test &
  Neustart) – Gliederung mit DeepSeek erarbeitet
- Die Welt wird einmal neu erzeugt

## 0.28.0 – 18.11.2026

- Safe Rooms als Notlager: Feldbetten, Vorratsregale und Erste-Hilfe-Kasten (durchsuchbar), Funktisch, Generator,
  Kanister; wer neben einem Feldbett stillsteht, ruht (💤: Leben steigt, Hunger und Durst sinken langsamer);
  Sandsäcke vor der Haustür
- Türen: Zombies folgen Spielern durch offene Haustüren in jedes Haus. Geschlossene Haus- und Zimmertüren müssen sie
  erst zerbrechen (Barrikade zuerst, dann die Tür); zerbrochene Türen bleiben offen. Jede Tür lässt sich mit
  Brettern verbarrikadieren; zweiter Aktionsknopf (z. B. „Haustür schließen“ neben „verbarrikadieren“)
- Level 2 „Isarauen“ (Wolfratshausen/Gelting) mit Isar, Brücke und 5 Safe Rooms, in der Verwaltung wählbar;
  Wasserrauschen in der Nähe von Wasser
- Karte: dezente Gehwege, Blumenbeete, Mülltonnen (grau, gelb, grün, braun, blau) an den Häusern, Container und
  Glas-Iglus zum Durchsuchen, 1–2 Straßensperren (Autos fahren außen herum), Parkbuchten mit freien Plätzen
- Bots: kein Stau mehr an Türen, folgen dem Menschen vor Kiste/Ablegen, Gegenangebote beim Tauschen (nie die einzige
  Waffe), gehen langsamer durch Hecken und über Holzzäune – Zombies ebenso; Metallzäune und Mauern bleiben dicht
- Durchsuchen geht schneller (Schrank 1,5 s, Auto 2,2 s, Leiche 0,9 s)
- Laster im Verkehr, ein neues Auto-Modell (CC0) in 8 Farben, Polizisten unter den Stadtbewohnern
- Startseite: bei http-Adressen Link zur https-Adresse (neue Option externe_adresse)
- Kamera folgt der Figur auch, wenn man im Safe Room startet (0.27.1)
- Die Welt wird einmal neu erzeugt

## 0.27.0 – 18.11.2026

- Startseite fragt gleich nach dem Mikrofon und zeigt den Stand (erlaubt, gesperrt – mit Hinweis, wie man es
  freigibt). In der Home-Assistant-Seitenleiste erlaubt der Browser kein Mikrofon: dann ein Link, um das Spiel im
  eigenen Fenster zu öffnen
- Danach wird „📲 Als App installieren“ angeboten (iPhone: Hinweis „Teilen → Zum Home-Bildschirm“); App-Symbole als
  PNG, Service Worker mit Hinweisseite ohne Netz
- Sprache: Ausweichweg über den Server, wenn keine direkte Verbindung zustande kommt (z. B. im Mobilfunk) – Opus über
  WebCodecs, sonst 8-kHz-μ-law; weitergeleitet wird nur in Hörweite oder per Funkgerät; Meldung „📡 Verbindung läuft
  über den Server“
- Chat: Am PC kamen W, A, S, D, E, Leertaste und Umschalt nicht im Eingabefeld an – behoben
- Große Karte: passt jetzt ganz ins Fenster (Zoom-Knöpfe waren unten abgeschnitten), +/− zoomen um die Mitte des
  Ausschnitts, Verschieben bleibt in der Karte, Zwei-Finger-Zoom springt nicht mehr

## 0.26.0 – 18.11.2026

- Sprechen mit den Mitspielern, dauerhaft an (direkt von Gerät zu Gerät, WebRTC). Beim Start fragt der Browser nach
  dem Mikrofon (nur über HTTPS); ohne Mikrofon hört man die anderen trotzdem. Knopf 🎤 oben rechts schaltet stumm,
  über sprechenden Figuren erscheint 🔊. Kopfhörer vermeiden Echo
- Lautstärke nach Lage: draußen voll bis 5 m, dann leiser bis zur Hörweite (40 m), links/rechts nach Richtung; im
  selben Haus und Stockwerk fast voll, anderes Stockwerk 35 %, drinnen ↔ draußen 10 % (nach Abstand zur Haustür),
  verschiedene Häuser stumm
- Neues Fundstück 📻 Funkgerät: Wer eins trägt, hört andere Funkgerät-Träger überall, mit Funkklang
- Einstellungen: neue Karte „🎙 Sprache“ (an/aus, Hörweite, Stockwerk, drinnen/draußen, Funk, „Reden lockt Zombies
  an“ – aus). Add-on-Optionen stun_server, turn_server, turn_username, turn_password für Verbindungen von unterwegs

## 0.25.0 – 18.11.2026

- Text-Chat für alle Mitspieler, egal wie weit weg: Knopf 💬 oben rechts mit Zähler für Ungelesenes, Fenster wie
  WhatsApp (eigene Nachrichten rechts, Uhrzeit und Ort des Absenders). Der Verlauf (letzte 100 Nachrichten) wird mit
  der Welt gespeichert; neue Nachrichten erscheinen bei geschlossenem Fenster kurz als Meldung. Beim Tippen bewegt sich
  die Figur nicht
- Parkbuchten an Wohn- und Nebenstraßen; etwa 90 % der geparkten Autos stehen in Buchten oder auf Parkplätzen, der
  Rest längs am Fahrbahnrand. Die Welt wird einmal neu erzeugt

## 0.24.0 – 18.11.2026

- Safe Rooms sind jetzt echte Innenräume: Man betritt sie durch die Haustür wie andere Häuser. Drinnen ist es immer
  hell, alle Türen sind offen, es gibt keine schlafenden Zombies und keine Treppen. Die Vorratskiste steht drinnen
  (als Holzkiste), oben steht der Name des Safe Rooms
- Barrikade: Die Eingangstür wird von innen verbarrikadiert (Bretter sind drinnen an der Tür zu sehen, draußen wie
  bisher). Zombies hämmern draußen dagegen; ist die Barrikade weg und jemand drin, dringen sie ein
- Aufwachen, Weiterspielen nach dem Abmelden und „alle erwischt“ führen in den Innenraum des Safe Rooms
- Bots nutzen die Vorratskiste: Im Safe Room legen sie Überzähliges hinein und nehmen heraus, was ihnen fehlt;
  ohne Mitspieler warten sie im Safe Room
- Die Welt wird einmal neu erzeugt (neue Weltversion)

## 0.23.2 – 18.11.2026

- Neue Einstellung „Biss-Chance bei Stadtbewohnern“ (Tag, Nacht, Ausbruch): Bei Berührung versucht ein Zombie einmal
  pro Sekunde zu beißen; 100 % wie bisher, 0 % nie
- Meldungen erscheinen klein oben unter der Anzeige statt mitten im Bild, höchstens drei auf einmal
- Geparkte Autos stehen gerade längs am Straßenrand, nach der Straße ausgerichtet (auch Wrack und offener Kofferraum)
- Fahrende Autos und Busse halten Abstand zum Vordermann statt übereinander zu fahren; steht der Vordermann länger
  als 5 s, wird vorbeigefahren. Busse halten nicht mehr vor Haustüren
- Bots heben brauchbare Dinge vom Boden auf (z. B. was ein Mitspieler fallen lässt), legen Überzähliges ab und legen
  aufgehobene Munition ein
- Der neue Zombie, der rückwärts lief, läuft jetzt vorwärts; die neuen Zombies hinterlassen wieder die bisherigen Leichen

## 0.23.1 – 18.11.2026

- Handy: Der Figurenbogen ist kleiner (4000×1760 statt 2688×5152 Pixel, WebP 0,5 MB statt 2,8 MB). Viele Handys laden
  Texturen nur bis 4096 Pixel, die neuen Figuren hätten dort gefehlt; außerdem braucht er viel weniger Grafikspeicher
- Flüssiger beim Laufen durch die Stadt: Kartenstücke sind kleiner (512 statt 1024 Pixel) und werden verteilt auf zwei
  Bilder gebaut, die Wiese wird viel schneller gezeichnet und Dachbilder werden gemerkt. Längstes Bild beim Durchfahren
  am PC 19 ms statt 65 ms
- Feine Linien an den Nähten der Kartenstücke beseitigt
- Server: Stadtbewohner gehen zu nahen Läden und Haltestellen und suchen höchstens einen Weg je Takt (Spitzen 22 → 5 ms
  am PC); Wegsuche der Bots begrenzt
- Einstellungsseite: „Leistung des Servers“ unter „Gerade im Spiel“ zeigt die Rechenzeit je Spieltakt und Teil; dazu
  einmal pro Minute eine Zeile im Add-on-Log

## 0.23.0 – 18.11.2026

- Neue Spielfigur „Survivor“ zur Auswahl auf der Startseite: eigene Animationen für Stehen, Laufen (mit Füßen),
  Schießen, Nahkampf und Nachladen, je nach Waffe Pistole, Gewehr, Schrotflinte oder Messer; Bots nehmen sie manchmal
- Zwei neue Zombiearten, eine davon mit Sterbeanimation (die Leiche bleibt liegen)
- Stadtbewohner als eigene Bürgerfiguren mit Laufanimation
- Mündungsblitz als Bild statt gezeichnetem Blitz
- Grafiken von OpenGameArt (Riley Gombart, KonitaTutorials, Survivor Spine); Namensnennung in grafik/LIZENZ.txt,
  README und auf der Startseite

## 0.22.1 – 18.11.2026

- Neue Geräusch-Ereignisse mit Tondateien: Schüsse je Waffe (Pistole, Jagdgewehr, Schrotflinte), Tür auf und zu,
  Auto fährt vorbei, Autoradio (läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren), Startmusik (nach
  dem ersten Antippen der Startseite, blendet beim Spielbeginn aus), Funkgerät-Klick bei wichtigen Meldungen,
  Wasser (für Level 2)

## 0.22.0 – 18.11.2026

- Feines Kollisionsraster (1 m statt 4 m) draußen: Man stößt genau an der gezeichneten Hauswand und am gezeichneten
  Zaun bzw. an der Hecke an, schmale Durchgänge zwischen Häusern bleiben begehbar
- Jede Haustür bleibt ohne Klettern erreichbar (wird beim Start geprüft und notfalls geöffnet)
- Drübersteigen klappt auch, wenn man schräg an einem Zaun entlangrutscht – es zählt, wie lange direkt vor einem
  ein Zaun ist
- Bots und Bewohner meiden bei der Wegsuche Stellen, die im feinen Raster versperrt sind

## 0.21.2 – 18.11.2026

- Haustüren zeigen zur Straße statt zum Fußweg zwischen zwei Häusern (35 Türen verlegt, 18 Häuser mehr betretbar);
  die Welt beginnt deshalb einmal neu (Rucksäcke bleiben)
- Beim Drübersteigen gleitet die eigene Figur in einem kurzen Hüpfer hinüber, statt dass das Bild springt

## 0.21.1 – 18.11.2026

- Drübersteigen per Knopf: An Hecke, Zaun oder Gartenmauer zeigt der Aktionsknopf (Taste E) „Über die Hecke steigen“;
  automatisches Klettern klappt jetzt auch, wenn man schräg dagegenläuft
- Polizei und Feuerwehr fahren mit Dauersirene – sie blendet mit der Entfernung ein und aus, kommt aus der richtigen
  Richtung und ändert beim Vorbeifahren die Tonhöhe; ohne zugeordnete Datei ein echtes Martinshorn
- Feuer echter: Flammenzungen an mehreren Brandherden, heller Kern, Funkenflug, Rauchsäule, flackernder Schein;
  dazu Brandrauschen und lauteres Knistern in der Nähe

## 0.21.0 – 18.11.2026

- Brände: In der Anfangsphase (einstellbar, Vorgabe die ersten 20 Minuten) fängt etwa jede Minute ein Haus, ein
  geparktes oder fahrendes Auto oder ein Bus Feuer – mit Flammen, Rauch, Knistern und Lichtschein in der Nacht. Feuer
  verletzt Spieler und verbrennt Zombies; Autos und Busse bleiben als Wrack, Häuser als Ruine. Brennende Häuser kann man
  nicht betreten
- Verkehr: Am Anfang fahren Autos vor allem auf den Hauptstraßen (Anzahl und Dauer einstellbar), ab und zu rasen
  Polizei und Feuerwehr mit Blaulicht und Sirene durch – die Feuerwehr fährt zum Brand
- Alle Fahrzeuge fahren auf den echten Straßenlinien auf der rechten Spur, ohne Zick-Zack, und halten vor Menschen
- Gartenzäune und Hecken als glatte Linien statt Treppen; über Hecken, Zäune und Gartenmauern steigen, indem man etwa
  eine Sekunde dagegenläuft
- Durchsuchte Schränke und Spinde zeigen offene Türen (leer: ausgegraut), durchsuchte Autos einen offenen Kofferraum
- Sichtkegel der Zombies ausblendbar (Vorgabe: aus); automatische Schussreichweite je Schusswaffe einstellbar
- Zoomen mit zwei Fingern am Handy
- Neue Töne: Schrei, wenn ein Bewohner gebissen wird; Sirene; eigenes Ereignis „Feuer bricht aus“
- Menschen zittern nicht mehr an Zäunen und Hindernissen und laufen nicht mehr ineinander

## 0.20.2 – 18.11.2026

- Bots durchsuchen gezielt den Schrank, zu dem sie gehen – vorher blieben sie hängen, wenn ein verschlossenes Auto oder
  eine Tür näher lag

## 0.20.1 – 18.11.2026

- Wasser gibt es dort, wo man es erwartet, um die Hälfte häufiger: Lebensmittelläden, Kaufhäuser, Gaststätten und
  Eisdielen (Kaufhäuser haben jetzt überhaupt Wasser)
- Haustüren sitzen genau auf der echten Hauswand, entlang der Wand gedreht und unter dem Dachüberstand sichtbar

## 0.20.0 – 18.11.2026

- Ausbruch: In Geretsried leben 50 Menschen (einstellbar). Sie gehen von zu Hause zum Einkaufen in echte Läden, zum
  Platz und zur Bushaltestelle und verschwinden in Häusern; ein Linienbus fährt die Haltestellen ab und nimmt Wartende mit
- Zu Beginn sind nur wenige Zombies in der Stadt. Zombies jagen Menschen; Gebissene werden grünlich und verwandeln sich
  nach 5 Minuten (einstellbar) selbst in Zombies – Menschen fliehen, wenn sie Zombies sehen
- Solange viele Menschen gesund sind, kommen weniger Zombies aus dem Umland – die Gefahr wächst mit dem Ausbruch;
  Zombies aus der Stadt verschwinden nicht mehr, wenn man weit weg ist
- Einstellungsseite: Menschenzahl, Ansteckungszeit und eine Anzeige, wie viele gerade gesund, gebissen oder Zombie sind

## 0.19.0 – 18.11.2026

- Viel mehr Details in Geretsried: jedes Wohnhaus hat einen Garten mit Hecke, Holz- oder Metallzaun oder Mauer und
  Gartentor zur Straße (Zäune versperren den Weg); in den Gärten Gartenhäuser, Pools, Trampoline, Blumenbeete,
  Sitzgruppen und Obstbäume
- Sportplätze mit Spielfeldlinien (Fußball, Basketball), Laufbahn, Spielplätze mit Schaukel, Rutsche, Sandkasten und
  Wippe, Parkplätze mit Parkbuchten, Friedhof mit Gräbern, Gewerbeflächen
- Mehr Flachdächer mit Lüftungsgeräten und Solarfeldern, Solaranlagen und Kamine auf Satteldächern
- Alleebäume an größeren Straßen, Bäume, Bänke, Mülleimer und Bushaltestellen aus OpenStreetMap
- Straßen so breit wie in echt (OSM-Breite und Spuren, sonst Bundes-, Staats- oder Kreisstraße, sonst Straßenart),
  Straßennamen und -nummern leicht sichtbar auf der Fahrbahn
- Bots durchsuchen Schränke, Kofferräume (mit Brechstange) und tote Zombies in der Nähe, nehmen bessere Waffen in die
  Hand und packen in größere Taschen um
- Die Welt beginnt wegen der neuen Karte einmal neu (Rucksäcke bleiben)

## 0.18.1 – 18.11.2026

- Straßen wie im Prototyp: schmalere Fahrbahn mit dunkler Kante, Gehweg nur angedeutet, Fußwege als helle Linien
- Zoomen: Knöpfe − und + oben rechts, Mausrad oder Tasten + und −; die Wahl wird gespeichert
- Schüsse zeigen nur noch Mündungsblitz und einen kurzen Feuerstrahl Richtung Ziel statt eines durchgehenden Strichs
- Sense schwingt breiter

## 0.18.0 – 18.11.2026

- Anschleichen: Wer schleicht oder still steht, kann sich von hinten an Zombies heranpirschen – sie merken es erst
  beim ersten Schlag. Der Überraschungsschlag macht viel mehr Schaden (Messer von hinten: ein Stich genügt)
- Getroffene Zombies greifen sofort an, statt erst zum Geräusch zu laufen; schleichende Spieler wecken schlafende
  Zombies in Häusern erst aus der Nähe
- Neue Waffen: Schrotflinte (trifft alle im Kegel, kurze Reichweite), Jagdgewehr (sehr weit, ein Schuss genügt meist),
  Sense (mäht alle Zombies im Bogen vor dir); Gewehre in Spinden, Schrotflinten auch im Kofferraum, Sensen in Schränken
- Alle Waffenwerte stehen in einer gemeinsamen Tabelle; Bots nehmen die neuen Waffen auch

## 0.17.1 – 18.11.2026

- Einstellungsseite: Zeitraffer-Knöpfe, Unsterblich-Schalter und die Namensliste zeigen nach dem Klicken sofort den
  gespeicherten Stand (blieben vorher auf dem alten stehen)
- Geräusche: Ankreuzen einer Tondatei wird jetzt gespeichert, auch bei schnellem Anklicken mehrerer Dateien
- Schalter „Jede Spielrunde mit frischer Welt beginnen“ wird richtig dargestellt (lag über dem Text)
- Die Seite übernimmt in der Seitenleiste die Farben des Home-Assistant-Designs (hell oder dunkel)

## 0.17.0 – 18.11.2026

- Neue Figuren: Zombies mit Laufanimation von oben – Tarnjacke, Dirndl, Feuerwehr, Hemd und Lederhose –, beim
  Zubeißen mit offenem Mund
- Neue Kriecher (vier Arten, im Wechsel ziehend) und neue tote Zombies mit Blutlache, passend zum Zombietyp
- Eigene Spielfigur: Auf der Startseite Mann oder Frau, Haarfarbe und Kleidungsfarbe wählen (mit Vorschau); die Wahl
  wird gespeichert und alle Mitspieler sehen dich so, je nach Waffe mit Pistole, Schläger oder Messer in der Hand
- Bots bekommen ein zufälliges Aussehen

## 0.16.0 – 18.11.2026

- Tag und Nacht: Spieluhr (ein Spieltag dauert einstellbar 48 Minuten), Dämmerung mit warmem Licht, nachts dunkel
  mit Straßenlaternen, erleuchteten Fenstern und einem kleinen Schein um jeden Spieler
- Taschenlampe leuchtet nachts auch draußen; tagsüber sind etwa 70 % der Häuser durch die Fenster hell (Keller nie)
- Nachts sind mehr Zombies unterwegs (einstellbar), Geräusche für Nachteinbruch und Zombieland bei Nacht
- Viel mehr geparkte Autos am Straßenrand und in Reihen auf den Parkplätzen, schöner gezeichnet; Menge einstellbar
- Kofferräume lassen sich nur noch mit Brechstange aufbrechen (dafür ist mehr drin); Brechstangen gibt es jetzt auch
  in Schränken und Kaufhäusern
- Einstellungsseite: neuer Abschnitt „Tag und Nacht“ mit Uhrzeit, Tageslänge, Zombies nachts und Autos

## 0.15.0 – 18.11.2026

- Geräusche aus Tondateien: Auf der Einstellungsseite lassen sich Dateien hochladen, probehören und Ereignissen zuordnen
  (Zombie stirbt, Kriecher, Zombie stöhnt, Zombie entdeckt dich, Stadtgeräusche, Zombieland Tag und Nacht, Nachteinbruch),
  jeweils mit eigener Lautstärke; bei mehreren Dateien wird zufällig gewählt
- Stadtgeräusche laufen draußen als Schleife (drinnen leise), ferne Zombies ertönen ab und zu aus wechselnder Richtung
- Ohne Zuordnung bleibt es bei den im Browser erzeugten Tönen

## 0.14.0 – 18.11.2026

- Einstellungsseite in der Seitenleiste „Zombies“: Zombies (Menge draußen, in Häusern, Tempo), Bots, Karte,
  Fundhäufigkeit, Zugangscode und frische Welt je Spielrunde – gilt sofort, ohne Neustart; „▶ Hier spielen“ öffnet das Spiel
- Testwerkzeuge auf der Einstellungsseite: Unsterblichkeit je Spieler und Zeitraffer (×5, ×10, ×60)
- „Welt neu starten“: Die Stadt beginnt neu, alle Mitspieler werden kurz getrennt; Rucksäcke bleiben auf Wunsch erhalten
- Übersichtskarte mit echten Umrissen von Häusern und Straßen, Zoom (+/−, Mausrad, zwei Finger), in der großen Ansicht
  verschiebbar, mit Maßstab und Straßennamen (beim Hineinzoomen und in der großen Ansicht)
- Bots bleiben nicht mehr in der Tür eines Safe Rooms stehen und sperren damit die anderen aus
- Beim Verlassen eines Hauses springt das Bild sofort zur Haustür, statt quer über die Karte zu ziehen

## 0.13.0 – 18.11.2026

- Übersichtskarte oben rechts: zeigt dich und alle Mitspieler in Geretsried (wer drinnen ist, steht an seiner Haustür),
  Safe Rooms und den Ortsausgang; antippen oder Taste M vergrößert sie mit Namen
- Geräusche, im Browser erzeugt (keine Tondateien): Schüsse, Schläge, Stöhnen naher Zombies (nach Richtung und
  Entfernung), Fauchen beim Entdecken, Türen, Durchsuchen, Aufheben, Biss, Schritte, Rätsel richtig/falsch, Wind draußen
  und Brummen drinnen; Lautsprecher-Knopf neben der Karte
- Räume hinter noch nie geöffneten Türen sind ganz schwarz, bis jemand die Tür öffnet
- Möbel stehen nicht mehr vor Türen und Treppen (eine Kachel rundum frei, zwei geradeaus)
- Echtere Stadt: Dächer folgen den echten Gebäudeumrissen aus OpenStreetMap, als Walmdach mit Graten, Ziegelreihen und
  Schatten (große Gebäude mit Flachdach); Straßen als glatte Bänder mit Gehweg, Bordstein und Mittellinie, dazu Fußwege,
  Parkplätze, Wald- und Sportflächen; Spielfeld und Kollision bleiben unverändert

## 0.12.0 – 18.11.2026

- Geschäfte: Verkaufsraum mit Regalreihen und Kasse, dahinter ein Lager
- Funde je Ladenart: Lebensmittel (PENNY, Getränkemarkt …) Konserven/Wasser/Schokoriegel, Apotheke und Drogerie
  (Rehmaus Apotheke, Rossmann) Verbände/Spritzen, Kaufhaus (TEDi, Woolworth, Spielwaren …) große Rucksäcke,
  Taschenlampen, Seile, Kleidung, Messer, Gaststätten Essen/Wasser/Messer
- Namen der Geschäfte und Einrichtungen stehen auf den Dächern

## 0.11.0 – 18.11.2026

- Phase C: Geretsried-Stadtmitte aus OpenStreetMap (etwa 1,1 × 0,8 km, 281 × 208 Kacheln à 4 m) ist die neue Standardkarte
  (Option `karte`: `geretsried` oder `dorf`); Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0
- 293 betretbare Häuser mit echten Türen (auch seitlich), Garagen und Schuppen als geschlossene Blöcke
- Safe Rooms: Kirche Maria Hilf, Karl-Lederer-Schule, Franz-Marc-Schule, Pflegeheim St. Ursula
- Start auf dem Platz bei der Gaststätte Isarwinkel, Ortsausgang am westlichen Kartenrand, Autos und Busse auf den Straßen
- Große Karten werden stückweise gezeichnet (nur der sichtbare Teil), Dächer folgen dem Gebäudeumriss
- Zombies erscheinen im Umkreis der Spieler und verschwinden weit weg (große Karte bleibt leicht für den Server)

## 0.10.0 – 18.11.2026

- Neue Figuren: Menschen und Zombies aus dem Kenney-Paket „Topdown Shooter“ (CC0, kenney.nl), Haltung je nach Ausrüstung
- Bäume, Büsche und Felsen von oben (Kenney); Bäume sind kein Hindernis mehr (darunter kann man sich verstecken)
- Traktor von oben, Hochsitz entfernt, Busse auf den Straßen (versperren eine Spur, lassen sich durchsuchen)
- Ausrüstung braucht keinen Rucksackplatz: Waffe in der Hand, Taschenlampe und Kleidung werden beim Finden direkt
  angelegt, wenn frei – erst weitere Stücke wandern in den Rucksack
- Lichtkegel der Taschenlampe mit weichen Rändern, folgt der Laufrichtung ruhig statt zu zappeln

## 0.9.2 – 18.11.2026

- Der Ausgang liegt innen auf derselben Seite wie die Haustür draußen (oben bzw. unten) –
  man läuft nach dem Hinausgehen nicht mehr sofort wieder hinein
- Die Außenhülle betretbarer Häuser ist nicht mehr begehbar, die Haustür ist nur noch Eingang
- Bots: nur zwei Begleiter bleiben in deiner Nähe (mit mehr Abstand), die übrigen streifen umher;
  Bots weichen nicht mehr aus, wenn du auf sie zugehst, und halten beim Tauschen still

## 0.9.1 – 18.11.2026

- Fehler behoben: Wer mit gehaltener Taste ein Haus betrat oder eine Treppe nahm, landete sofort wieder auf der anderen Seite –
  ein Übergang löst jetzt erst aus, wenn man sich vom Ankunftsort entfernt hat
- Möbel stehen bündig an den Wänden mit freiem Streifen davor, Tische frei mit Abstand rundherum – nichts versperrt mehr den Weg
- Licht: Taschenlampe hält etwa eine Stunde, schaltet sich in Häusern selbst ein und draußen aus, danach kommt die nächste aus
  dem Rucksack; ohne Lampe nur ein kleiner, schwacher Lichtkreis und alles schwarz-weiß

## 0.9.0 – 18.11.2026

- Phase B: Häuser sind betretbar – beim Betreten zoomt die Kamera hinein, innen ein eigener Grundriss
  mit 4–7 Zimmern (Flur, Küche, Wohn-, Schlaf-, Kinderzimmer, Bad, Abstellraum), Möbeln von oben,
  Keller und Dachgeschoss über Treppen; Safe Rooms bleiben vorerst außen
- Türen: öffnen/schließen; verschlossene mit Schlüsselbund, laut mit der Brechstange oder per Wiki-Rätsel
- Zombies lauern hinter geschlossenen Türen und sind erst zu sehen, wenn man sie sieht; innen ist es dunkel –
  Lichtkreis um die Figur, mit Taschenlampe ein langer Lichtkegel
- Bots folgen über Haustür und Treppen (nur gezielt, nicht beim Vorbeilaufen)
- Neue Gegenstände: Schlüsselbund, Brechstange
- Einstellbar: `zombies` (ganzzahlig, 10 = bisherige Menge) und `funde` (je Gegenstand, 10 = normal, 0 = nie, 20 = doppelt)
- Innenraum-Generator: Entwurf DeepSeek, 6 Fehler von Claude behoben, Abnahmetests für 10 Häuser × 3 Stockwerke

## 0.8.0 – 18.11.2026

- Größere Rucksäcke: Sporttasche (12 Plätze) und Trekkingrucksack (16) – selten in Spinden und Kofferräumen
- Weggeworfene Gegenstände bleiben 3 Minuten liegen und können von allen aufgehoben werden
- Tauschen: wer einen Mitspieler berührt, kann tauschen – beide legen etwas ins Angebot und bestätigen;
  das Spiel läuft weiter, wer sich entfernt, bricht ab (Bots nehmen Geschenke an)
- Bots neu: Wegsuche über Kacheln (folgen durch Türen ins Haus), feste Plätze hinter dem Anführer,
  Abstand zu allen Figuren, bewaffnete Bots kämpfen (Pistole: Schussabstand halten, Messer/Schläger: angreifen)
- Ein toter Zombie in der Tür eines Safe Rooms muss erst weggezogen werden, bevor man verbarrikadieren kann
- Schlankere Figuren ohne runden Ring (DeepSeek, 3. Runde)

## 0.7.0 – 18.11.2026

- Hindernisse: Traktor, Heuballen, Kühe, Hochsitz, Felsen, Vogelscheuche, Biertische und Maibaum muss man umgehen
  (Lage kommt jetzt aus der Karte, Server und Browser sperren dieselben Stellen; Büsche bleiben begehbar)
- Holzzäune um einige Gärten (mit Gartentor vor der Haustür) und eine Kuhweide mit Gatter;
  jedes Stück wird verworfen, wenn es einen Weg abschneiden würde
- Figuren von oben mit Laufanimation: Menschen (Haare oder Trachtenhut), schlurfende Zombies mit Krallen,
  Leichen ausgestreckt, Verletzte liegend (Entwurf DeepSeek, zweite Runde nach Rückmeldung)
- „Nicht ganz tot“: etwa jeder vierte erledigte Zombie kriecht am Boden weiter (langsam, spürt ringsum,
  beißt schwächer) und muss ein zweites Mal erledigt werden; erst dann wird er zur durchsuchbaren Leiche

## 0.6.0 – 18.11.2026

- Dächer wieder von oben (Walmdach mit Ziegelreihen, Kamin); Bäume, Kühe, Maibaum und Deko bleiben
- Simulierte Mitspieler: Option `bots` (0–9) – so viele Bots, solange nur ein Mensch spielt; jeder weitere Mensch ersetzt einen.
  Bots folgen dem nächsten Menschen, helfen Liegenden auf, versorgen sich selbst und weichen Zombies aus (Entwurf DeepSeek)
- Tote Zombies bleiben 3 Minuten liegen (höchstens 30) und lassen sich durchsuchen:
  selten (etwa jeder 20.) Pistole, Munition oder Messer, oft feste Kleidung, Seil, Taschenlampe oder Schokoriegel
- Messer: schneller, leiser Nahkampf; feste Kleidung halbiert Biss-Chance und mindert Schaden, nutzt sich ab;
  Schokoriegel +20 Hunger; Seil und Taschenlampe werden für Level 2 und die Innenräume gebraucht

## 0.5.0 – 18.11.2026

- Neues Aussehen aus dem Einzelspieler-Prototyp: bayerische Häuser mit Balkon und Geranien, Kirche als Sakristei,
  Blechdächer für Safe Rooms, Fichten, Laubbäume, Birken, Maibaum, Biertische, Kühe, Traktor, Heu, Hochsitz,
  Vogelscheuche, Enten und Schilf an der Isar, Leitpfosten, Wiese mit Grasbüscheln und Blumen, Pflaster und Asphalt
- Die Zeichenfunktionen werden wörtlich aus dem Prototyp übernommen (tools/baue_aussehen.py → client/proto_grafik.mjs)

## 0.4.0 – 17.11.2026

- Level-1-Ziel: Das Tor am Ortsausgang hat drei Schlösser – jedes öffnet sich mit einer richtig beantworteten Frage
- Fragen kommen aus der Wiki-Seite krisenvorsorge:spielfragen (Add-on bindet /share nur lesend ein, Änderungen gelten nach spätestens einer Minute), sonst aus der mitgelieferten Kopie (28 Fragen aus dem Überlebenshandbuch)
- Falsche Antwort: das Schloss klappert laut und lockt Zombies an; nach jeder Antwort ein Link zur passenden Wiki-Seite (Option wiki_adresse)
- Biss und Infektion: Zombie-Bisse können infizieren (90 Minuten, läuft nur draußen), die Figur wird langsamer und der Bildschirm grüner
- Rettungsspritze (💉) heilt sich selbst oder einen infizierten Mitspieler daneben
- Wer sich verwandelt, spielt 3 Minuten als Zombie gegen die anderen und wacht dann im Safe Room auf (oder früher, wenn er erledigt wird)

## 0.3.0 – 17.11.2026

- Spielstand wird gespeichert (SQLite unter /data): Welt, Behälter, Barrikaden, Vorratskisten und jeder Spieler
- Spieler werden am Browser wiedererkannt (geheimer Schlüssel), der Name darf sich ändern
- Vier Safe Rooms: Feuerwehrhaus, Sakristei, Lagerraum, Keller – mit Vorratskiste (24 Plätze)
- Tür verbarrikadieren mit Brettern; Zombies hämmern dagegen und nutzen die Barrikade ab
- „Ausruhen & abmelden“ nur im Safe Room; wer draußen geht, versteckt sich und taucht im letzten Safe Room wieder auf
- Schränke, Kühlschränke, Spinde und Kofferräume durchsuchen (dauert, macht Lärm); Rucksack mit 8 Plätzen
- Gegenstände: Wasser, Konserve, Verbandskasten, Bretter, Pistole, Baseballschläger, Munition
- Durst und Hunger sinken; im Safe Room erholt man sich
- Aufhelfen mit Verbandskasten in 3 s (70 Lebenspunkte), ohne in 8 s (25)
- Alle am Boden: Aufwachen im Safe Room statt Neustart der Welt
- Fehlerbehebung: abgelehnter Beitritt konnte eine unbehandelte Ablehnung auslösen

## 0.2.0 – 17.11.2026

- Option `zugangscode`: Wer nicht über die HA-Seitenleiste kommt, braucht den Code zum Mitspielen
- Der Ingress-Header gilt nur noch für Anfragen vom HA-Supervisor
- Breitere Häuser, Türen auch von außen erkennbar, Ecken-Hilfe an Türen
- README, Doku und MIT-Lizenz

## 0.1.0 – 17.11.2026

- Erstes Grundgerüst: Spielserver mit Colyseus 0.18 (Node.js 22), Client mit Phaser 3.90
- Mehrspieler im selben Raum (bis 10), Server entscheidet über Bewegung, Zombies und Treffer
- Ort mit Straßen, Marktplatz, Häusern (Dach wird beim Betreten durchsichtig), Bäumen, Isar und Ortsausgang
- Zombies mit sichtbarem Sichtkegel, hören Rennen und Schüsse, folgen einem Wegfeld um Häuser herum
- Schleichen (wenig Joystick oder Umschalttaste), 40 % der Spieler mit Pistole, Rest stößt
- Am Boden liegen und Aufhelfen durch Stehenbleiben daneben; alle unten → neue Runde
- Verbindungsabbruch: Figur bleibt 2 Minuten stehen, automatisches Wiederverbinden auch nach Neuladen
- Zugang über die HA-Seitenleiste (Ingress) und über Port 8775 für Mitspieler
