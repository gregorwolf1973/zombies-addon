#!/usr/bin/env python3
"""DeepSeek schreibt client/verwaltung.html (Einstellungsseite für die HA-Seitenleiste). Aufruf: python3 tools/auftrag_verwaltung.py"""
import pathlib, re, sys
from bridge import Bridge
hier = pathlib.Path(__file__).resolve().parent
prompt = (hier / "auftrag_verwaltung_prompt.txt").read_text(encoding="utf-8")
system = (hier / "auftrag_verwaltung_system.txt").read_text(encoding="utf-8")
modell = sys.argv[1] if len(sys.argv) > 1 else None
antwort = Bridge().frage("deepseek", prompt, system=system, max_tokens=32000, **({"model": modell} if modell else {}))
text = antwort.split("\n", 1)[1] if antwort.startswith("[DeepSeek") else antwort
text = re.sub(r"^\s*```(?:html)?\s*|\s*```\s*$", "", text.strip())
ziel = hier.parent / "zombies" / "client" / "verwaltung.html"
if "<html" not in text.lower():
    print("Keine HTML-Antwort:", antwort[:500]); sys.exit(1)
ziel.write_text(text, encoding="utf-8")
print(antwort.split("\n", 1)[0], "→", ziel, len(text), "Zeichen")
