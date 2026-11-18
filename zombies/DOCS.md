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
- **Welt neu starten:** Stadt beginnt neu (Kisten, Türen, Zombies); Rucksäcke bleiben, wenn gewünscht

Gespeichert wird in `/data/einstellungen.json`. Die Add-on-Optionen (`karte`, `zombies`, `funde`, `zugangscode`, `bots`)
dienen nur noch beim allerersten Start als Startwerte. `wiki_adresse` (Adresse eines DokuWiki für die Links nach jedem
Rätsel) bleibt eine Add-on-Option.

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
