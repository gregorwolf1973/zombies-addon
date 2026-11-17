#!/usr/bin/env python3
"""Lässt Gemini die Zeichenfunktionen aus dem Einzelspieler-Prototyp für das Mehrspieler-Spiel umbauen.
Ergebnis: zombies/client/aussehen.mjs. Aufruf: python3 tools/auftrag_aussehen.py <prototyp.html> [provider]"""
import pathlib, re, sys
from bridge import Bridge

proto = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
provider = sys.argv[2] if len(sys.argv) > 2 else "gemini"
basis = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client"
welt = (basis / "welt.mjs").read_text(encoding="utf-8")
skript = max(re.findall(r"<script[^>]*>(.*?)</script>", proto, re.S), key=len)

prompt = f"""Ein Browser-Spiel (top-down, Oberbayern, Zombies) gibt es als Einzelspieler-Prototyp mit schön
gezeichneter Welt (Canvas 2D). Die Mehrspieler-Fassung zeichnet bisher nur einfarbige Kacheln. Übernimm das
AUSSEHEN des Prototyps in ein neues ES-Modul `aussehen.mjs` für die Mehrspieler-Fassung.

=== Prototyp (nur das Skript) ===
```js
{skript}
```

=== Kartenmodul der Mehrspieler-Fassung (welt.mjs) ===
```js
{welt}
```

Schreibe `aussehen.mjs` (ES-Modul, keine Abhängigkeiten, läuft im Browser). Beginn:
```js
import {{ KACHEL, BREITE, HOEHE, T, zufall }} from './welt.mjs';
```
Exportiere genau diese Funktionen; alle zeichnen nur auf den übergebenen CanvasRenderingContext2D, deterministisch
(Zufall nur über zufall(seed) bzw. eine Hash-Funktion der Koordinaten, nie Math.random):

1. `zeichneBoden(ctx, welt)` – die ganze Karte (BREITE*KACHEL × HOEHE*KACHEL Pixel, 1:1) im Stil des Prototyps
   (drawGround/grassy/tufts/feldCol/noise usw. nachbauen): Wiese mit Grasbüscheln und leichten Farbwolken,
   Straßen als Asphalt mit Randlinien/Leitpfosten, T.PLATZ als Pflaster, T.WASSER mit Wellen und Uferkante,
   Schilf am Ufer, Zaun (T.ZAUN) als Holzzaun, T.TOR als Holztor, in Häusern T.BODEN als Dielenboden und T.WAND
   als Mauer, T.TUER als Türschwelle. Bäume (T.BAUM) NICHT hier zeichnen.
   Deko, die nicht im Weg steht, deterministisch platzieren: Maibaum mitten auf welt.markt (wie maibaum()),
   2–3 Biertische am Marktrand (biertisch()), auf größeren Wiesenflächen ein paar Kühe (kuh()), eine
   Vogelscheuche, ein Traktor (traktor()), Heuballen, Enten auf dem Wasser (ente()), ein Hochsitz am Ortsrand.
   Deko nur auf Kacheln T.WIESE (bzw. Wasser für Enten), nie auf Straßen, Wegen, vor Türen oder in Häusern.
2. `zeichneBaum(ctx, x, y, variante)` – ein Baum mit Mittelpunkt x,y (Pixel), Krone darf ca. 22 px Radius haben,
   variante 0 = Fichte (fichte()), 1 = Laubbaum (laubbaum()), 2 = Birke (birke()); mit Schatten.
3. `zeichneDach(ctx, b, h, art)` – Dach für ein Haus von b×h Kacheln, gezeichnet ab (0,0) bis (b*KACHEL, h*KACHEL),
   im Stil von house() aus dem Prototyp (Ziegel, First, Kamin, Schatten). art: 'normal' (rote Ziegel),
   'safe' (graues Blechdach, gut erkennbar), 'kirche' (für die Sakristei: Kirchendach mit kleinem Turm wie kirche()).
4. `zeichneAuto(ctx, farbe, senkrecht)` – Auto mit Mittelpunkt (0,0) – der Aufrufer verschiebt vorher –,
   46×22 px (waagrecht) bzw. 22×46 (senkrecht), farbe als CSS-Farbe.
5. `zeichneBehaelter(ctx, art)` – 24×24 px um (0,0): 'schrank' (Holzschrank), 'kuehlschrank', 'spind' (Metallspind).
6. `zeichneMensch(ctx, farbe)` – Spielfigur von oben, Blickrichtung nach rechts (+x), etwa 30×30 px um (0,0),
   im Stil von sepp()/drawPlayer()/playerHead() (Hut, Gesicht, Schultern), farbe = Jacke (CSS-Farbe).
7. `zeichneZombie(ctx, variante)` – Zombie von oben, Blickrichtung nach rechts, etwa 30×30 px um (0,0), im Stil
   von drawZombie() (grüne Haut, ausgestreckte Arme, rote Augen), variante 0–2 leicht verschieden (Kleidung).

Achte darauf: Koordinaten der Karte sind Pixel = Kachel*KACHEL; welt.hole(x,y) liefert den Kacheltyp;
welt.markt = {{x,y,b,h}} in Kacheln; welt.haeuser = [{{x,y,b,h,tuer,safe}}] in Kacheln.
Übernimm die Farben und Formen des Prototyps so genau wie möglich, aber ohne seine Spiellogik.
Antworte NUR mit dem vollständigen Inhalt von aussehen.mjs in einem ```js-Block, deutsche Kommentare."""

antwort = Bridge().frage(provider, prompt, temperature=0.2, max_tokens=60000,
                         system="Du bist ein erfahrener Spiele-Grafikprogrammierer (Canvas 2D).")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", antwort, re.S)
if not m:
    print(antwort[:3000], file=sys.stderr); sys.exit(1)
ziel = basis / "aussehen.mjs"
ziel.write_text(f"// Aussehen aus dem Einzelspieler-Prototyp – Entwurf von {provider}, von Claude geprüft\n" + m.group(1), encoding="utf-8")
print(antwort.split("\n```", 1)[0][:300], file=sys.stderr)
print(f"geschrieben: {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
