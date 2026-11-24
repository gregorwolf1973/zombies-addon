#!/usr/bin/env python3
"""Halb aufgelöste Varianten der Figuren-Atlanten (Grafikstufe Mittel/Niedrig): zombies_<figur>.webp, helden_<id>.webp, helden_waffen.webp
-> *_klein.webp (Breite und Höhe halbiert). Die JSON-Rahmen (zombies_neu.json, helden_neu.json) bleiben unverändert; der Client halbiert die
Koordinaten (client/grafikstufe.mjs rahmenHalb) und gleicht die Darstellungsgröße über den Faktor 2 aus.
Aufruf (PIL steht nicht überall: PYTHONPATH=~/code/ahnen-werkzeuge/pil):  python3 tools/grafik_klein.py [--neu]
"""
import json, sys
from pathlib import Path
from PIL import Image

G = Path(__file__).resolve().parent.parent / 'client' / 'grafik'

def halb(quelle: Path, ziel: Path):
    im = Image.open(quelle).convert('RGBA')
    w, h = im.size
    assert w % 2 == 0 and h % 2 == 0, f'{quelle.name}: ungerade Größe {w}x{h}'
    # vormultipliziert verkleinern (keine hellen/dunklen Säume an den Alphakanten)
    klein = im.convert('RGBa').resize((w // 2, h // 2), Image.LANCZOS).convert('RGBA')
    klein.save(ziel, 'WEBP', quality=88, alpha_quality=95, method=6)
    return quelle.stat().st_size, ziel.stat().st_size

def main():
    neu = '--neu' in sys.argv
    zf = json.load(open(G / 'zombies_neu.json'))['figuren']
    hf = json.load(open(G / 'helden_neu.json'))['figuren']
    namen = [f'zombies_{f}' for f in zf] + [f'helden_{f}' for f in hf] + ['helden_waffen']
    for n in namen:
        q, z = G / f'{n}.webp', G / f'{n}_klein.webp'
        if z.exists() and not neu and z.stat().st_mtime >= q.stat().st_mtime:
            continue
        a, b = halb(q, z)
        print(f'{n}: {a // 1024} kB -> {b // 1024} kB')

if __name__ == '__main__':
    main()
