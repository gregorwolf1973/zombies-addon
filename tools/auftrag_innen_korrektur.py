#!/usr/bin/env python3
"""DeepSeek korrigiert innen.mjs anhand von Testausgaben und Grundrissen (Datei mit Rückmeldung als Argument)."""
import pathlib, re, sys
from bridge import Bridge
basis = pathlib.Path(__file__).resolve().parent.parent / "zombies"
code = (basis / "client" / "innen.mjs").read_text(encoding="utf-8")
tests = (basis / "tests" / "innen.test.mjs").read_text(encoding="utf-8")
rueck = open(sys.argv[1], encoding="utf-8").read()
prompt = f"""Dein Innenraum-Generator innen.mjs:
```js
{code}
```
Die Abnahmetests (müssen alle bestehen):
```js
{tests}
```
Rückmeldung (Testausgabe und Grundrisse als Text; Legende: # Wand, _ Boden, | geschlossene Tür, A Ausgang,
v Treppe runter, ^ Treppe hoch, m Möbel, Leerzeichen außerhalb):
{rueck}
Finde die Ursachen und behebe sie. Prüfe deine Logik gedanklich an den gezeigten Grundrissen. Gib das KOMPLETTE
korrigierte Modul zurück (gleiche Exporte), NUR als ```js-Block."""
a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.1, max_tokens=18000,
                   system="Du bist ein sorgfältiger JavaScript-Entwickler für prozedurale Spielwelten.")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
(basis / "client" / "innen.mjs").write_text("// Innenraum-Generator – Entwurf von DeepSeek (v4-pro), nach Testrückmeldung korrigiert\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], file=sys.stderr)
