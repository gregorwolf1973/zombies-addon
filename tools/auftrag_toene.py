#!/usr/bin/env python3
"""DeepSeek schreibt den Abschnitt „Geräusche“ für client/verwaltung.html → tools/toene_abschnitt.html"""
import pathlib, re, sys
from bridge import Bridge
hier = pathlib.Path(__file__).resolve().parent
prompt = (hier / "auftrag_toene_prompt.txt").read_text(encoding="utf-8")
system = "Du bist ein sorgfältiger Frontend-Entwickler. Antworte ausschließlich mit dem HTML-Stück, ohne Erklärungen, ohne Markdown-Codezaun."
antwort = Bridge().frage("deepseek", prompt, system=system, max_tokens=24000)
kopf, _, text = antwort.partition("\n") if antwort.startswith("[DeepSeek") else ("", "", antwort)
text = re.sub(r"^\s*```(?:html)?\s*|\s*```\s*$", "", text.strip())
if "toeneKarte" not in text: print("Unerwartet:", antwort[:400]); sys.exit(1)
(hier / "toene_abschnitt.html").write_text(text, encoding="utf-8")
print(kopf, len(text), "Zeichen")
