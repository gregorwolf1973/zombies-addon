# Zombies in Oberbayern

Kooperatives Zombie-Survival für 2–10 Spieler im Handy-Browser. Das Add-on ist der Spielserver:
Er liefert das Spiel aus und entscheidet über Bewegung, Zombies und Treffer.

## Mitspielen

- **Über die Seitenleiste** („Zombies“) – für alle mit Home-Assistant-Konto.
- **Über Port 8775** im Heimnetz, z. B. `http://homeassistant.local:8775`.
- **Von unterwegs** über einen Reverse Proxy oder Cloudflare-Tunnel auf Port 8775
  (WebSockets müssen durchgereicht werden).

Alle landen im selben Spiel.

## Optionen

| Option | Bedeutung |
|---|---|
| `zombie_faktor` | Mehr oder weniger Zombies (0,2–3, Standard 1) |
| `zugangscode` | Wenn gesetzt, braucht jeder Mitspieler außerhalb der Seitenleiste diesen Code |
| `bots` | Simulierte Mitspieler (0–9), solange nur ein Mensch spielt – zum Testen allein |
| `wiki_adresse` | Adresse eines DokuWiki (z. B. `https://wiki.example.org`) für die Links nach jedem Rätsel |

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

## Spielstand

Welt, Safe Rooms und Spieler werden in `/data/zombies.db` gespeichert und sind damit in den
HA-Backups enthalten. Jeder Browser bekommt einen geheimen Spieler-Schlüssel; wer Browserdaten
löscht, beginnt neu. Abmelden geht nur in einem Safe Room – wer draußen geht, wartet 2 Minuten
und taucht beim nächsten Mal im letzten Safe Room auf.
