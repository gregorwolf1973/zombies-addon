#!/usr/bin/env python3
"""Zweite Runde: DeepSeek korrigiert zeichneMensch/zeichneZombie/zeichneMenschLiegend nach Rückmeldung."""
import pathlib, re, sys
from bridge import Bridge
ziel = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "figuren.mjs"
code = ziel.read_text(encoding="utf-8")
prompt = f"""Hier ist dein Modul figuren.mjs:
```js
{code}
```
Rückmeldung nach dem Ansehen (Raster mit 3-facher Vergrößerung):
- zeichneLeiche und zeichneKriecher sind gut – NICHT ändern.
- zeichneMensch ist FALSCH: Das ist eine Vorderansicht (Gesicht mit Augen sichtbar, Füße hängen unten heraus).
  Gewünscht ist die Ansicht GENAU VON OBEN, Blick nach rechts (+x): Man sieht den Oberkopf (Haare bzw. Hut) als
  Kreis in der Mitte, KEIN Gesicht – höchstens eine kleine Nasenspitze am rechten Rand des Kopfes. Die Schultern
  sind ein breites Oval QUER zur Blickrichtung (also in y-Richtung lang, ca. 26 px hoch, 14 px breit), mittig unter
  dem Kopf. Die Arme liegen oben und unten (±y) an den Schultern und zeigen nach vorn/hinten (±x). Beim Gehen
  schwingen die Arme gegengleich entlang x, und die Füße (zwei kleine dunkle Ovale) erscheinen abwechselnd VOR
  (+x) und HINTER (−x) den Schultern – sie dürfen nie unterhalb (±y außerhalb) hervorschauen. Stehend (phase null)
  sind die Füße kaum sichtbar unter den Schultern.
- zeichneZombie ist halb Seitenansicht (Beine hängen unten heraus). Gewünscht wie beim Menschen GENAU VON OBEN:
  grüner Oberkopf als Kreis etwas vor (+x) der Schultermitte, zerrissenes Hemd als Schulter-Oval quer (in y lang),
  beide Arme parallel nach vorn (+x) gestreckt mit Krallenhänden, rote Augenpunkte am rechten Kopfrand,
  Füße wie beim Menschen nur vorn/hinten. Schlurfen: Arme pendeln leicht in y, ganzer Körper wackelt ±3°.
- zeichneMenschLiegend: ebenfalls von oben, seitlich zusammengekrümmt, kein Gesicht von vorn.
Gib das KOMPLETTE korrigierte Modul zurück (alle Funktionen, gleiche Exporte und Parameter), NUR als ```js-Block."""
a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.2, max_tokens=16000,
                   system="Du bist ein erfahrener Spiele-Grafikprogrammierer (Canvas 2D, Top-down-Spiele).")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
ziel.write_text("// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro, 2. Runde nach Claude-Rückmeldung)\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], f"→ {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
