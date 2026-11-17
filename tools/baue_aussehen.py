#!/usr/bin/env python3
"""Baut zombies/client/proto_grafik.mjs: die Zeichenfunktionen des Einzelspieler-Prototyps wörtlich,
gekapselt in erzeugeZeichner(ctx). Aufruf: python3 tools/baue_aussehen.py <prototyp.html>"""
import re, sys, pathlib, subprocess
html = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
src = max(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S), key=len)

def block_ende(i):
    tiefe, j, s = 0, i, None
    while j < len(src):
        c = src[j]
        if s:
            if c == "\\": j += 2; continue
            if c == s: s = None
        elif c in "'\"`": s = c
        elif c in "{[(": tiefe += 1
        elif c in "}])":
            tiefe -= 1
            if tiefe == 0: return j + 1
        j += 1
    return j

def funktion(name):
    m = re.search(r"function\s+" + name + r"\s*\(", src)
    a = m.start(); return src[a:block_ende(src.index("{", m.end()))]

def konstante(name):
    # const NAME=... bis zum Ende des Ausdrucks (Klammern zählen, dann bis , oder ;)
    m = re.search(r"\bconst\s+" + name + r"\s*=", src)
    i = m.end(); j = i
    while j < len(src) and src[j] not in ",;\n":
        if src[j] in "[{(": j = block_ende(j)
        else: j += 1
    return f"const {name}={src[i:j]};"

FUNKTIONEN = sys.argv[2].split(",")
KONSTANTEN = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else []
teile = [konstante(k) for k in KONSTANTEN] + [funktion(f) for f in FUNKTIONEN]
inhalt = ("// Zeichenfunktionen aus dem Einzelspieler-Prototyp „Zombies in Oberbayern“ – wörtlich übernommen\n"
          "// und von tools/baue_aussehen.py erzeugt. Nicht von Hand ändern, sondern neu erzeugen.\n"
          "/* eslint-disable */\n"
          "export function erzeugeZeichner(ctx) {\n"
          "  const TAU = Math.PI * 2;\n  let time = 0;\n"
          + "\n".join(teile) +
          "\n  return { setzeZeit(t) { time = t; }, " + ", ".join(FUNKTIONEN) + " };\n}\n")
ziel = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "proto_grafik.mjs"
ziel.write_text(inhalt, encoding="utf-8")
print(f"{ziel.name}: {len(inhalt)} Zeichen, {len(FUNKTIONEN)} Funktionen, {len(KONSTANTEN)} Konstanten")
