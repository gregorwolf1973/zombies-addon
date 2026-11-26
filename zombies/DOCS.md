# Zombies in Oberbayern

Kooperatives Zombie-Survival für 2–10 Spieler im Handy-Browser. Das Add-on ist der Spielserver:
Er liefert das Spiel aus und entscheidet über Bewegung, Zombies und Treffer.

## Mitspielen

- **Über die Seitenleiste** („Zombies“) – dort öffnen sich die Einstellungen; „▶ Hier spielen“ startet das Spiel
  (ohne Zugangscode, weil schon bei Home Assistant angemeldet).
- **Über Port 8775** im Heimnetz, z. B. `http://homeassistant.local:8775`.
- **Von unterwegs** über einen Reverse Proxy oder Cloudflare-Tunnel auf Port 8775
  (WebSockets müssen durchgereicht werden).

Alle landen im selben Spiel.

## Einstellungen

Alles Wichtige stellst du bequem in der Seitenleiste „Zombies“ ein. Änderungen gelten sofort, ohne Neustart:

- **Zombies:** Menge draußen, Menge in Häusern (10 = normal), Tempo in Prozent
- **Spiel:** Karte (`geretsried` = Stadtmitte aus OpenStreetMap oder `dorf`), Bots (simulierte Mitspieler, solange nur
  ein Mensch spielt), „Jede Spielrunde mit frischer Welt beginnen“, Zugangscode für Mitspieler von außen
- **Fundhäufigkeit** je Gegenstand (10 = normal, 0 = nie, 20 = doppelt)
- **Testwerkzeuge:** Unsterblichkeit je Spieler, Zeitraffer (gilt bis zum nächsten Add-on-Neustart)
- **Tag und Nacht:** Länge eines Spieltags (Vorgabe 48 Minuten), wie viele Zombies nachts zusätzlich draußen sind,
  Uhrzeit setzen zum Testen. Dämmerung 5–7 Uhr und 19:30–21:30 Uhr. Tagsüber sind etwa 70 % der Häuser hell,
  nachts alles dunkel – dann hilft draußen wie drinnen nur die Taschenlampe.
- **Geparkte Autos:** Menge (10 = normal), gilt für neue Welten. Kofferräume gehen nur mit Brechstange auf.
- **Geräusche:** Tondateien (MP3, OGG, WAV, M4A bis 8 MB) hochladen und Ereignissen zuordnen – Zombie stirbt, Kriecher,
  Zombie stöhnt, Zombie entdeckt dich, Stadtgeräusche, Zombieland (Tag/Nacht), Nachteinbruch. Bei mehreren Dateien wird
  zufällig gewählt, ohne Zuordnung erzeugt das Spiel selbst einen Ton. Mitgelieferte Töne liegen in `/share/zombies/toene`
  (dort kann auch eine `zuordnung.json` als Startzuordnung liegen), hochgeladene in `/data/toene`.
- **Welt neu starten:** Stadt beginnt neu (Kisten, Türen, Zombies); Rucksäcke bleiben, wenn gewünscht

Gespeichert wird in `/data/einstellungen.json`. Im Konfigurations-Reiter des Add-ons stehen nur noch die `externe_adresse`
(https-Adresse des Spiels von außen; wird auf der Startseite als Link „Mit Mikrofon spielen“ gezeigt, wenn die Seite per
http:// geöffnet wurde, weil das Mikrofon https braucht) und `stun_server` bzw. optional `turn_*` (Sprachfunk). Alles andere,
auch die Wiki-Adresse (Links nach den Rätseln), Impressum und Datenschutz, wird auf der Einstellungsseite des Spiels
unter „Zugang & Test“ eingetragen. Alte Optionen (`karte`, `zombies`, `funde`, `zugangscode`, `bots`) wirken nur noch beim allerersten Start.

## Rätsel

Das Tor am Ortsausgang hat drei Schlösser. Die Fragen liest das Add-on aus der DokuWiki-Seite
`krisenvorsorge:spielfragen` (Datei `/share/dokuwiki/data/pages/krisenvorsorge/spielfragen.txt`),
sonst nimmt es die mitgelieferten Fragen. Format: eine Tabelle
`^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^`, eine Zeile pro Frage.

Wer das Spiel aus dem Internet erreichbar macht, sollte einen Zugangscode setzen.

## Steuerung

- Handy: auf den Bildschirm tippen und ziehen; wenig ziehen heißt schleichen.
- PC: WASD oder Pfeiltasten, Umschalttaste zum Schleichen.
- Angegriffen wird automatisch: mit Pistole auf Abstand, sonst wird gestoßen.
- Wer am Boden liegt, steht wieder auf, wenn ein Mitspieler neben ihm stehen bleibt
  (mit Verbandskasten 3 Sekunden, ohne 8 Sekunden).
- Aktionsknopf unten rechts oder Taste E: durchsuchen, verbarrikadieren, Vorratskiste öffnen.
- Rucksack unten: antippen zum Benutzen oder Wegwerfen, am PC Tasten 1–8.
- Im Fahrzeug (als Fahrer): Tempo-Knopf 🐢 30 / 50 / 🚀 max neben dem Inventar oder Taste T schaltet das Höchsttempo reihum (wie ein Tempomat-Deckel); am PC Umschalt gedrückt = langsam (30 km/h).

## Häuser

Alle Häuser außer den Safe Rooms sind betretbar. Innen gibt es mehrere Zimmer, Möbel zum Durchsuchen,
manchmal Keller und Dachboden. Verschlossene Türen öffnen sich mit dem Schlüsselbund, laut mit der
Brechstange oder mit einer richtig beantworteten Frage. Hinter geschlossenen Türen lauern Zombies.
Drinnen ist es dunkel – eine Taschenlampe im Rucksack leuchtet weit voraus.

## Spielstand

Welt, Safe Rooms und Spieler werden in `/data/zombies.db` gespeichert und sind damit in den
HA-Backups enthalten. Jeder Browser bekommt einen geheimen Spieler-Schlüssel; wer Browserdaten
löscht, beginnt neu. Abmelden geht nur in einem Safe Room – wer draußen geht, wartet 2 Minuten
und taucht beim nächsten Mal im letzten Safe Room auf.

## Hinweis zu Tönen

Aus Lizenzgründen werden keine Ton- oder Musikdateien mitgeliefert; ohne eigene Dateien erzeugt das Spiel seine Töne selbst.
Eigene Töne lassen sich in der Verwaltung hochladen oder unter `/share/zombies/toene` ablegen.

Quellen und Lizenzen der Grafiken, Karten und Bibliotheken: siehe `CREDITS.md` im Repository.
Das Spiel enthält Gewalt gegen Zombies und Waffen – empfohlen ab 16 Jahren.

## Unterstützen

Gefällt dir das Spiel? [☕ Buy me a coffee](https://buymeacoffee.com/gregorwolf1973) · [💛 Liberapay](https://liberapay.com/Gregor_Wolf/donate)

---

# Zombies in Oberbayern (English)

Cooperative zombie survival for 1–10 players in the phone or PC browser. This add-on is the game server: it serves
the game and is authoritative for movement, zombies and hits. The game itself is in German.
Content warning: zombie violence and firearms, recommended for ages 16 and up.

## How to join

- **Via the sidebar** ("Zombies"): the settings open there; "▶ Hier spielen" starts the game (no access code needed,
  you are already signed in to Home Assistant).
- **Via port 8775** on your home network, e.g. `http://homeassistant.local:8775`.
- **From outside** through a reverse proxy or Cloudflare tunnel to port 8775 (WebSockets must be passed through).
  Always set an access code (`zugangscode`) if the game is reachable from the internet.

Everybody ends up in the same game. The microphone (voice chat) needs https: set your https address as `externe_adresse`.

## Settings

Most things are set in the sidebar panel "Zombies" and apply immediately, without a restart:

- **Zombies:** amount outside and inside houses (10 = normal), speed in percent
- **Game:** current map (the game then follows the level sequence: Geretsried 1, Geretsried 2, Isarauen, Königsdorf, Kochel, Andermatt – each can be moved or switched off), bots (simulated teammates while only one human plays),
  "start every round with a fresh world", access code for outside players
- **Item frequency** per item (10 = normal, 0 = never, 20 = double)
- **Test tools:** invulnerability, time lapse (until the next add-on restart)
- **Day and night:** length of a game day (default 48 minutes), extra zombies at night, set the time of day.
  By day about 70 % of the houses are lit, at night everything is dark – only a torch helps, indoors and outdoors.
- **Parked cars:** amount (10 = normal); applies to new worlds. Car boots only open with a crowbar.
- **Sounds:** upload audio files (MP3, OGG, WAV, M4A up to 8 MB) and assign them to events. With several files one is
  picked at random; without an assignment the game synthesises a sound. Bundled sounds live in `/share/zombies/toene`
  (a `zuordnung.json` there can serve as the initial assignment), uploaded ones in `/data/toene`. **No audio files are
  shipped with the add-on.**
- **Restart world:** the town starts over (chests, doors, zombies); backpacks stay if you like.

Settings are stored in `/data/einstellungen.json`. The add-on's Configuration tab only holds `externe_adresse` (https
address of the game from outside; shown as a "play with microphone" link when the page was opened over http) and
`stun_server` / optional `turn_*` (voice chat servers; the default STUN server is a public Google one – leave it empty to
disable it). Everything else, including the wiki address (links after each quiz), imprint and privacy notice, is entered on the
game's settings page under "Zugang & Test". Old options (`karte`, `zombies`, `funde`, `zugangscode`, `bots`) only act on the very first start.

## Puzzles

The gate at the edge of town has three locks. The questions are read from the DokuWiki page `krisenvorsorge:spielfragen`
if a wiki address (settings page) and a DokuWiki share are available; otherwise the bundled questions are used. Format: a table
`^ Topic ^ Question ^ Correct ^ Wrong 1 ^ Wrong 2 ^ Page ^`, one row per question.

## Controls

- Phone: touch and drag on the screen; dragging a little means sneaking.
- PC: WASD or arrow keys, Shift to sneak, mouse wheel to zoom.
- Attacks are automatic: with a pistol from a distance, otherwise shoving.
- Action button (bottom right) or **E**: search, barricade, open the supply chest, enter/leave a vehicle.
- Backpack at the bottom: tap to use or drop, on PC keys 1–8.
- In a vehicle (as driver): the speed button 🐢 30 / 50 / 🚀 max next to the inventory or the **T** key cycles through the
  top-speed steps; on PC holding Shift drives slowly (30 km/h).
- A downed player gets up when a teammate stays next to them (3 seconds with a first-aid kit, 8 seconds without).

## Houses

All houses except the safe rooms can be entered. Inside there are several rooms, furniture to search, sometimes a
cellar and an attic. Locked doors open with the key ring, loudly with the crowbar, or with a correctly answered question.
Zombies lurk behind closed doors. It is dark inside – a torch in your backpack lights the way.

## Saving

The world, safe rooms and players are saved in `/data/zombies.db` and are therefore included in Home Assistant backups.
Every browser receives a secret player key; clearing browser data starts you over. You can only log out in a safe room;
if you leave outside, your character waits 2 minutes and appears in the last safe room next time.

## System requirements

amd64 or aarch64 with roughly 400 MB of free RAM (measured 325–420 MB with one player and about 40 zombies) and one to
two CPU cores.

## Support

Enjoying the game? [☕ Buy me a coffee](https://buymeacoffee.com/gregorwolf1973) · [💛 Liberapay](https://liberapay.com/Gregor_Wolf/donate)
