# Changelog

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
