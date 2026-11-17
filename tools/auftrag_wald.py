#!/usr/bin/env python3
"""Lässt DeepSeek den Kartengenerator für Level 2 (Wald an der Isar) schreiben und legt ihn als
zombies/client/wald.mjs ab. Aufruf: python3 tools/auftrag_wald.py"""
import pathlib, re, sys
from bridge import Bridge

ziel = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "wald.mjs"
welt = (ziel.parent / "welt.mjs").read_text(encoding="utf-8")
# nur der Teil bis zum Ende von baueWelt als Vorbild (Stil, Kacheltypen, Rückgabe)
vorbild = welt[: welt.index("// Safe Room, in dem der Punkt liegt")]

prompt = f"""Du schreibst für ein Browser-Spiel (Node.js 22 + Browser, ES-Module, keine Abhängigkeiten) eine
Kartenerzeugung für Level 2 „Wald an der Isar“. Hier ist die bestehende Datei für Level 1 als Vorbild
(Stil, Kacheltypen T, Zufallsgenerator zufall, Form des Rückgabeobjekts):

```js
{vorbild}
```

Schreibe die Datei `wald.mjs`, die so beginnt:
```js
import {{ KACHEL, BREITE, HOEHE, T, zufall }} from './welt.mjs';
export function baueWald(seed) {{ ... }}
```
Anforderungen an baueWald(seed) – gleiche Kartengröße BREITE×HOEHE (64×48 Kacheln), deterministisch aus seed:
1. Rand: Zaun (T.ZAUN) oben, unten und links. Die Isar (T.WASSER) fließt von Nord nach Süd, ungefähr bei
   x = 42 bis 50, 6–8 Kacheln breit, leicht geschwungen (Sinus + Zufall). Östlich davon ein schmales Ufer
   (T.WIESE) bis x = 62, ganz rechts x = 63 Zaun.
2. Westlich der Isar dichter Wald: etwa 40 % der Wiesenkacheln werden T.BAUM, aber nie auf Wegen, Lichtungen
   oder direkt neben Türen.
3. Waldwege (T.STRASSE, 2 Kacheln breit) als geschwungene Linien, die verbinden:
   Start-Lichtung am Westrand (start, Lichtung 7×7 aus T.PLATZ bei x≈2–8, y≈20–26),
   Jägerhütte, Forsthaus, Bootshaus am Westufer und den Steg.
4. Häuser wie in Level 1 (Wand T.WAND rundherum, Boden T.BODEN, genau eine Tür T.TUER in der Wand zum Weg hin),
   Größe 6–8 × 5–6: „Jägerhütte“ (Nordwesten), „Forsthaus“ (Mitte-Süd), „Bootshaus“ (am Westufer, Tür zum
   Weg). Zusätzlich 3–5 kleine Schuppen (5×4) an Wegen.
5. Der Steg: eine Reihe T.STRASSE-Kacheln (1 Kachel breit) quer über die Isar etwa in der Kartenmitte (y≈24),
   aber mit einer Lücke von 3 Wasserkacheln in der Mitte (kaputter Steg). Gib zurück:
   steg = {{ y, x0, x1, luecke: [x-Koordinaten der 3 Lückenkacheln] }}.
6. Funkmast auf dem Ostufer: funkmast = {{ x, y }} in Pixeln (Mitte einer T.PLATZ-Fläche 3×3 auf dem Ostufer).
7. Rückgabe: {{ seed, level: 2, kacheln, hole, haeuser, start, steg, funkmast, safeRooms, behaelter,
   markt: <die Start-Lichtung als {{x,y,b,h}}>, tor: {{ x: steg.luecke[0], y: steg.y }} }}
   - haeuser: Liste {{x, y, b, h, tuer: {{x, y}}}} wie im Vorbild; Häuser, die Safe Rooms sind, bekommen
     safe = Name und safeId = 's0', 's1'.
   - safeRooms: genau 2 Einträge wie im Vorbild (id, name, haus, kiste {{x,y}} in Pixeln auf einer Bodenkachel
     gegenüber der Tür, innen {{x,y}} = Pixelmitte des Hauses): „Jägerhütte“ (s0) und „Bootshaus“ (s1).
   - behaelter: wie im Vorbild {{id:'b'+n, art, x, y}} in Pixeln (Kachelmitte), in jedem Haus 1–2 an
     Innenwänden (art 'schrank' oder 'spind', nicht vor der Tür, nicht auf der Kiste), im Forsthaus zusätzlich
     ein 'kuehlschrank'; dazu 4–6 Forstautos (art 'auto', senkrecht true/false, farbe 0–5) auf Wegen.
   - start: Pixelmitte der Start-Lichtung.
8. Alles Begehbare (T.WIESE, T.STRASSE, T.BODEN, T.TUER, T.PLATZ) westlich der Isar muss von start aus
   zusammenhängend erreichbar sein, ebenso alle Türen, Behälter und das Westende des Stegs.
   Prüfe das am Ende mit einer Breitensuche und entferne notfalls Bäume, die etwas abschneiden.
Antworte NUR mit dem vollständigen Inhalt von wald.mjs in einem ```js-Block, deutsche Kommentare, keine Erklärung."""

antwort = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.2, max_tokens=32000,
                         system="Du bist ein sorgfältiger JavaScript-Entwickler für Spiele.")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", antwort, re.S)
if not m:
    print(antwort[:2000], file=sys.stderr); sys.exit(1)
ziel.write_text("// Kartenerzeugung Level 2 – Entwurf von DeepSeek (deepseek-v4-pro), von Claude geprüft\n" + m.group(1),
                encoding="utf-8")
print(antwort.split("\n", 1)[0], file=sys.stderr)
print(f"geschrieben: {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
