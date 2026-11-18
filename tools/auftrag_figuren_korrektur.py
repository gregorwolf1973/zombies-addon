#!/usr/bin/env python3
"""Zweite Runde: DeepSeek korrigiert zeichneMensch/zeichneZombie/zeichneMenschLiegend nach Rückmeldung."""
import pathlib, re, sys
from bridge import Bridge
ziel = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "figuren.mjs"
code = ziel.read_text(encoding="utf-8")
RUECKMELDUNG = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else ""
prompt = f"""Hier ist dein Modul figuren.mjs:
```js
{code}
```
Rückmeldung nach dem Ansehen im Spiel:
{RUECKMELDUNG}
Gib das KOMPLETTE korrigierte Modul zurück (alle Funktionen, gleiche Exporte und Parameter), NUR als ```js-Block."""
a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.2, max_tokens=16000,
                   system="Du bist ein erfahrener Spiele-Grafikprogrammierer (Canvas 2D, Top-down-Spiele).")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
ziel.write_text("// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro, 2. Runde nach Claude-Rückmeldung)\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], f"→ {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)
