#!/usr/bin/env python3
"""Schneidet Funktionen wörtlich aus dem Prototyp-Skript (Klammern zählen, Strings beachten).
Aufruf: python3 proto_funktionen.py <prototyp.html> [--liste | name1 name2 ...]"""
import re, sys, pathlib
html = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
src = max(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S), key=len)

def ende(i):
    tiefe, j, s = 0, i, None
    while j < len(src):
        c = src[j]
        if s:
            if c == "\\": j += 2; continue
            if c == s: s = None
        elif c in "'\"`": s = c
        elif c == "{": tiefe += 1
        elif c == "}":
            tiefe -= 1
            if tiefe == 0: return j + 1
        j += 1
    return j

funcs = {}
for m in re.finditer(r"function\s+([A-Za-z_]\w*)\s*\(", src):
    funcs[m.group(1)] = (m.start(), ende(src.index("{", m.end())))
if sys.argv[2] == "--liste":
    for n, (a, e) in sorted(funcs.items(), key=lambda x: x[1][0]):
        kopf = src[a:src.index("{", a)]
        print(f"{e-a:6} {kopf}")
else:
    for n in sys.argv[2:]:
        a, e = funcs[n]; print(src[a:e]); print()
