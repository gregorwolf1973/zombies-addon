#!/usr/bin/env python3
"""DeepSeek schreibt den Innenraum-Generator → zombies/client/innen.mjs"""
import pathlib, re, sys
from bridge import Bridge
basis = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client"
welt = (basis / "welt.mjs").read_text(encoding="utf-8")
kopf = welt[:welt.index("export function baueWelt")]
prompt = f"""Schreibe das ES-Modul `innen.mjs` (Browser und Node.js 22, keine Abhängigkeiten) für ein Top-down-Zombiespiel:
einen deterministischen Generator für das Innere von Häusern. Grundlage ist dieses Modul (Anfang von welt.mjs):
```js
{kopf}
```
Beginn von innen.mjs:
```js
import {{ KACHEL, BREITE, HOEHE, T, zufall }} from './welt.mjs';
export function baueInnenraum(seed, nr, stock) {{ ... }}   // stock: 'eg' | 'keller' | 'dach'
```
Zufall NUR über zufall(seed ^ Math.imul(nr + 1, 7919) ^ (stock === 'eg' ? 0 : stock === 'keller' ? 0x51ed : 0xa77e)).

Raster: Uint8Array(BREITE * HOEHE), alles T.LEER; das Haus liegt ab ox = 2, oy = 2 als Rechteck b×h Kacheln
(außen eine Wandreihe T.WAND, innen T.BODEN). Größen: eg b 16–22, h 11–15; keller b 10–16, h 8–11; dach b 12–18, h 6–9.

1. Zimmer per BSP (Binärteilung), Zimmer innen mindestens 4×4, Trennwände 1 Kachel dick (T.WAND). eg: 4–7 Zimmer,
   keller 2–4, dach 1–3.
2. Türen zwischen benachbarten Zimmern: genau 1 Kachel in der gemeinsamen Wand, nicht an Ecken/Wandkreuzungen,
   Kacheltyp T.INNENTUER. Erst ein Spannbaum (alle Zimmer verbunden), dann höchstens 1 zusätzliche Tür.
   Etwa 25 % der Türen sind verschlossen (aber nie die Tür, die vom Eingangszimmer zur Treppe führen würde – es reicht,
   wenn das Eingangszimmer selbst keine verschlossene Tür hat … außer sonst gäbe es keine).
3. Nur eg: Haustür innen = T.AUSGANG in der UNTEREN Außenwand (y = oy + h − 1), nicht in einer Ecke; das Zimmer
   dahinter ist der 'flur'. Ob es Keller/Dach gibt: hatKeller = r() < 0.5, hatDach = r() < 0.4 (in dieser
   Reihenfolge als erste Zufallszahlen ziehen, damit es stabil ist).
4. Treppen (begehbar): eg: T.TREPPE_RUNTER (wenn hatKeller) und T.TREPPE_HOCH (wenn hatDach), jeweils auf einer
   Bodenkachel an einer Wand, bevorzugt im flur oder einem angrenzenden Zimmer; keller: T.TREPPE_HOCH (zurück ins eg);
   dach: T.TREPPE_RUNTER (zurück ins eg).
5. Zimmerarten: eg: Eingangszimmer 'flur', die übrigen der Reihe nach (größte zuerst) 'wohnzimmer', 'kueche',
   'schlafzimmer', 'bad', 'kinderzimmer', 'abstellraum'; keller: 'kellerraum', 'heizungsraum', 'vorratskeller';
   dach: 'dachboden'.
6. Möbel (Kacheln werden T.MOEBEL, NUR an Wänden, nie auf/neben (4er-Nachbarschaft) Türen, AUSGANG oder Treppen),
   als Liste {{ art, x, y, b, h }} (Kacheln, Rechteck):
   wohnzimmer: sofa 3×1, couchtisch 2×1, schrank 2×1, regal 1×2; kueche: herd 1×1, kuehlschrank 1×1, spuele 1×1,
   esstisch 2×2; schlafzimmer/kinderzimmer: bett 2×3, schrank 2×1, kommode 1×1; bad: badewanne 1×2 oder 2×1,
   waschbecken 1×1, klo 1×1; flur: garderobe 1×1, kommode 1×1; abstellraum: regal 1×2, kiste 1×1;
   kellerraum/vorratskeller: regal 1×2, kiste 1×1 (2–3 Stück); heizungsraum: heizung 2×1, kiste 1×1;
   dachboden: kiste 1×1 (3–5), alter_schrank 2×1.
   Passt ein Möbel nicht, wird es weggelassen. Nach jedem Möbelstück prüfen (Breitensuche über begehbare Kacheln,
   Türen dabei als offen zählen), dass alle Bodenkacheln des Hauses noch zusammenhängen – sonst zurücknehmen.
7. Durchsuchbare Behälter = Möbel der Arten schrank, kuehlschrank, kommode, kiste, alter_schrank, garderobe:
   behaelter: [{{ id: 'm' + laufende Nummer, art: (kiste → 'spind', alter_schrank/garderobe/kommode → 'schrank',
   sonst wie Möbel), x, y }}] mit x, y = Pixelmitte der Kachel des Möbels, die an Boden grenzt.
8. zombiePlaetze: in jedem Zimmer außer dem flur mit Wahrscheinlichkeit 0.45 ein Platz {{ x, y }} (Pixelmitte
   einer freien Bodenkachel, nicht neben einer Tür).
9. start = Pixelmitte der Bodenkachel direkt innen vor dem AUSGANG (eg) bzw. neben der Treppe (keller/dach).

Rückgabe: {{ seed, nr, stock, ox, oy, b, h, kacheln, hole, start, ausgang (eg: {{x,y}} Kachel, sonst null),
hatKeller, hatDach (nur eg sinnvoll, sonst false), treppen: [{{ x, y, art: 'runter'|'hoch', ziel: 'keller'|'eg'|'dach' }}],
tueren: [{{ x, y, verschlossen }}], raeume: [{{ x, y, b, h, typ }}] (Innenfläche in Kacheln), moebel, behaelter,
zombiePlaetze }}. hole(x, y) liefert außerhalb des Rasters T.LEER.

Exportiere zusätzlich `MOEBEL_NAMEN` = {{ sofa: 'Sofa', ... }} mit deutschen Namen aller Möbelarten.
Antworte NUR mit dem vollständigen Inhalt von innen.mjs in einem ```js-Block, deutsche Kommentare."""
a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.2, max_tokens=16000,
                   system="Du bist ein sorgfältiger JavaScript-Entwickler für prozedurale Spielwelten.")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
ziel = basis / "innen.mjs"
ziel.write_text("// Innenraum-Generator – Entwurf von DeepSeek (v4-pro), von Claude geprüft\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], f"→ {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
