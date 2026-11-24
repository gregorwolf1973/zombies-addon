#!/usr/bin/env python3
"""Mixamo-Streifen (<figur>_<clip>_streifen.png aus alle.sh) -> je Figur ein WebP-Atlas + gemeinsame JSON-Liste, Farbstil C
(aufgehellt, Gamma 0,72 wie farbvarianten.py, ohne Kontur, keine Sättigungsänderung).
Aufruf: PYTHONPATH=<pil> python3 atlas_bauen.py <ordner mit Streifen> <ausgabeordner = client/grafik>
Layout je Atlas: eine Zeile je Clip in fester Reihenfolge (walk, run, idle, attack, neckbite = 160er Felder; crawl, dying, tod2, tod3 = 200er Felder; tod2/tod3 = weitere Sterbebewegungen),
16 Bilder je Zeile. JSON: bilder[<figur>_<clip>_<nn>] = [x, y, b, h] (Rahmen im Atlas der Figur), clips[<clip>] = Meta."""
import sys, json
from PIL import Image
D, OUT = sys.argv[1].rstrip('/') + '/', sys.argv[2].rstrip('/') + '/'
FIG = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero']
CLIPS = [('walk', 160, True), ('run', 160, True), ('idle', 160, True), ('attack', 160, True), ('neckbite', 160, True), ('crawl', 200, True), ('dying', 200, False), ('tod2', 200, False), ('tod3', 200, False)]
N = 16; GAMMA = [round(255 * (v / 255) ** 0.72) for v in range(256)]
def hell(s):
    a = s.split()[3]; r = s.convert('RGB').point(GAMMA * 3).convert('RGBA'); r.putalpha(a); return r
bilder = {}; clips = {}; hoehe = sum(f for _, f, _ in CLIPS); breite = N * max(f for _, f, _ in CLIPS)
for fig in FIG:
    atlas = Image.new('RGBA', (breite, hoehe), (0, 0, 0, 0)); y = 0
    for clip, feld, schleife in CLIPS:
        s = Image.open(f'{D}{fig}_{clip}_streifen.png').convert('RGBA'); assert s.height == feld and s.width == N * feld, (fig, clip, s.size)
        for i in range(N):
            atlas.alpha_composite(hell(s.crop((i * feld, 0, (i + 1) * feld, feld))), (i * feld, y)); bilder[f'{fig}_{clip}_{i:02d}'] = [i * feld, y, feld, feld]
        clips[clip] = {'feld': feld, 'n': N, 'schleife': schleife}; y += feld
    atlas.save(f'{OUT}zombies_{fig}.webp', quality=82, alpha_quality=90, method=6)
    print(fig, atlas.size)
json.dump({'figuren': FIG, 'atlas': {f: f'zombies_{f}.webp' for f in FIG}, 'groesse': [breite, hoehe], 'clips': clips, 'bilder': bilder},
          open(OUT + 'zombies_neu.json', 'w'), separators=(',', ':'))
