# Changelog

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
