#!/usr/bin/env python3
"""Waffenlage der Helden nachträglich korrigieren (nur verschieben): Gewehre/MP/MG/Schrot/... mit der Schulterstütze an der rechten Schulter,
nach vorn in Blickrichtung (Winkel 0); Pistole beidhändig vor der Brust. Ohne FBX/Renderer nutzbar: arbeitet auf helden_neu.json.
Aufruf: PYTHONPATH=<pil> python3 tools/mixamo/waffen_schulter.py [ausgabe.json]   (Standard: client/grafik/helden_neu.json wird überschrieben)
Die Rohposen (Griffpunkt aus der Hand-Bone, wie helden_atlas_bauen.py sie liefert) liegen in tools/mixamo/helden_pos_roh.json und werden beim ersten Lauf
angelegt; jeder Lauf rechnet von dort neu (idempotent). Danach: tools/mixamo/polizei_atlas.py (Polizei-Pistole ist ins Bild gebrannt) und tools/grafik_klein.py --neu."""
import json, sys
from pathlib import Path
G = Path(__file__).resolve().parents[2] / 'client' / 'grafik'
ROH = Path(__file__).resolve().parent / 'helden_pos_roh.json'
# Langwaffe: Kolbenende (Atlas-px ab Bildmitte, x nach vorn, y nach rechts/unten) – zwischen Schulter und Brust; SCHWANK = Anteil der Handbewegung, der bleibt
KOLBEN_X, KOLBEN_Y, SCHWANK = 0.0, 11.0, 0.25
# Pistole: Mitte der Pistole vor der Brust (beide Hände); Verschiebung gegenüber der Handlage
PISTOLE_DY = -9.0
LANG = ('gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'schrotflinte')

def mittel(v): return sum(v) / len(v)

def verschieben(j, roh):
    pos = {}
    for fig, clips in roh.items():
        pos[fig] = {}
        for clip, waffen in clips.items():
            neu = {}
            for w, posen in waffen.items():
                if clip.startswith('gewehr_') and w in LANG:
                    m = j['waffen'][w]; mx, my = mittel([p[0] for p in posen]), mittel([p[1] for p in posen])
                    neu[w] = [[round(KOLBEN_X + m['laenge'] * m['griff'] * p[3] + SCHWANK * (p[0] - mx), 1), round(KOLBEN_Y + SCHWANK * (p[1] - my), 1), 0.0, p[3]] for p in posen]
                elif clip.startswith('pistole_') and w == 'pistole':
                    neu[w] = [[p[0], round(p[1] + PISTOLE_DY, 1), p[2], p[3]] for p in posen]
                else: neu[w] = posen
            pos[fig][clip] = neu
    return pos

if __name__ == '__main__':
    j = json.load(open(G / 'helden_neu.json'))
    if not ROH.exists(): json.dump(j['pos'], open(ROH, 'w'), separators=(',', ':'))
    roh = json.load(open(ROH)); j['pos'] = verschieben(j, roh)
    json.dump(j, open(sys.argv[1] if len(sys.argv) > 1 else G / 'helden_neu.json', 'w'), separators=(',', ':'))
