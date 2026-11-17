#!/usr/bin/env python3
"""Lässt ein Modell (Standard: Gemini) zweideutige Quizfragen markieren (falsche Antworten, die eigentlich auch stimmen).
Aufruf: python3 tools/fragen_pruefen.py <spielfragen.belege.json>"""
import json, re, sys
from bridge import Bridge
d = json.load(open(sys.argv[1], encoding="utf-8"))
liste = "\n".join(f"{i}. {z['frage']} | RICHTIG: {z['richtig']} | FALSCH: {z['falsch1']} || {z['falsch2']}"
                  for i, z in enumerate(d["gueltig"]))
prompt = ("Prüfe diese Quizfragen zur Krisenvorsorge/Erste Hilfe für ein Lernspiel. Markiere NUR Fragen mit echtem "
          "Problem: eine 'FALSCH'-Antwort ist nach gängigem Fachwissen (Rotes Kreuz, BBK, Feuerwehr) ebenfalls richtig "
          "oder vertretbar, die RICHTIG-Antwort ist fachlich falsch, oder die Frage ist ohne Zusammenhang unverständlich. "
          'Antworte nur mit JSON: [{"nr": 0, "problem": "kurz"}], leeres Array wenn alles passt.\n\n' + liste)
a = Bridge().frage(sys.argv[2] if len(sys.argv) > 2 else "gemini", prompt, temperature=0, max_tokens=6000)
m = re.search(r"\[\s*(\{.*\})?\s*\]", a.split("\n", 1)[1] if a.startswith("[") else a, re.S)
if not m: print(a[:1500]); sys.exit(1)
for f in json.loads(m.group(0)):
    z = d["gueltig"][f["nr"]]
    print(f"{f['nr']}: {z['frage']} | R: {z['richtig']} | F: {z['falsch1']} || {z['falsch2']}\n   → {f['problem']}")
