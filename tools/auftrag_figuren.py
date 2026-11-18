#!/usr/bin/env python3
"""DeepSeek zeichnet die Figuren (Canvas 2D, von oben, mit Laufanimation) → zombies/client/figuren.mjs"""
import pathlib, re, sys
from bridge import Bridge
ziel = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "figuren.mjs"
prompt = """Schreibe das ES-Modul `figuren.mjs` (Browser, keine Abhängigkeiten): Zeichenfunktionen für Spielfiguren
eines Top-down-Zombiespiels, Comic-Stil, Ansicht GENAU VON OBEN (Vogelperspektive, wie bei klassischen
Top-down-Shootern). Jede Funktion zeichnet um den Ursprung (0,0) auf einen CanvasRenderingContext2D, die Figur
blickt nach rechts (+x). Größe: Mensch und Zombie etwa 34×34 px (Kopf ca. 14 px Durchmesser), kräftige Konturen
(1.5 px, dunkel), einfache Schattierung (hellere Fläche oben links), kleiner weicher Schatten darunter.
Kein Text, kein Math.random – alles deterministisch aus den Parametern.

Exportiere:
1. `zeichneMensch(ctx, farbe, phase, art)` – Mensch von oben: Kopf als Kreis (Haare/Mütze in `art.haar`,
   z. B. '#5d4037'), darunter breite Schultern/Oberkörper als Oval quer zur Blickrichtung in der Jackenfarbe
   `farbe` (CSS-Farbe), Arme seitlich an den Schultern. Laufzyklus über `phase` (0..1, 0 = stehen):
   Arme schwingen gegengleich vor und zurück (entlang x), Füße/Schuhe schauen abwechselnd vorne und hinten unter
   dem Körper hervor. Bei phase === null stehend (Füße nebeneinander, Arme ruhig). Optional art.hut = true:
   Trachtenhut mit Krempe statt Haare.
2. `zeichneZombie(ctx, variante, phase)` – Zombie von oben, gebückt: grüner kahler Kopf (#7cb342-Töne) etwas
   vor den Schultern, zerrissenes Hemd (Farbe je variante 0–3: '#5d4037', '#37474f', '#6a1b9a', '#8d6e63') mit
   Rissen, BEIDE Arme nach vorn (+x) ausgestreckt, grüne Hände mit Krallenfingern. Schlurfender Gang: Arme
   pendeln leicht auf und ab (entlang y), Körper wackelt ±3°. Rote Augenpunkte vorn am Kopf.
3. `zeichneKriecher(ctx, variante, phase)` – halb toter Zombie, der auf dem Bauch kriecht (wie eine Zombiefrau,
   die vorne liegt): lang gestreckter Körper (etwa 40×20 px), wirres langes Haar (#4e342e) auf dem Kopf vorne,
   Arme weit nach vorn gestreckt und abwechselnd greifend (phase), Beine hinten nachschleifend, zerrissenes
   dunkles Kleid, ein paar dunkelrote Flecken.
4. `zeichneLeiche(ctx, variante)` – toter Zombie auf dem Rücken liegend, alle Viere ausgestreckt
   (Arme über dem Kopf gespreizt, Beine gespreizt, wie ein „X“), etwa 44×44 px, Kopf vorne (+x), dunkelrote
   Lache darunter, Farbe des Hemds wie bei zeichneZombie(variante).
5. `zeichneMenschLiegend(ctx, farbe, art)` – verletzter Mensch, der am Boden liegt (seitlich, eingerollt).

Zeichne mit Pfaden (ellipse, arc, quadraticCurveTo), nicht nur mit Rechtecken. Saubere Proportionen, damit es
auf 32-px-Kacheln gut lesbar ist. Antworte NUR mit dem vollständigen Inhalt von figuren.mjs in einem
```js-Block, deutsche Kommentare."""
a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.3, max_tokens=14000,
                   system="Du bist ein erfahrener Spiele-Grafikprogrammierer (Canvas 2D, Pixel- und Comic-Stil).")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
ziel.write_text("// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro), von Claude geprüft\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], f"→ {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
