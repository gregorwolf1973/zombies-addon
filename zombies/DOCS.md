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

Wer das Spiel aus dem Internet erreichbar macht, sollte einen Zugangscode setzen.

## Steuerung

- Handy: auf den Bildschirm tippen und ziehen; wenig ziehen heißt schleichen.
- PC: WASD oder Pfeiltasten, Umschalttaste zum Schleichen.
- Angegriffen wird automatisch: mit Pistole auf Abstand, sonst wird gestoßen.
- Wer am Boden liegt, steht wieder auf, wenn ein Mitspieler 3 Sekunden neben ihm stehen bleibt.
