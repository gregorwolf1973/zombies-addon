#!/usr/bin/env python3
"""Mixamo-Streifen (<figur>_<clip>_streifen.png aus alle.sh) -> je Figur ein WebP-Atlas + gemeinsame JSON-Liste, Farbstil C
(aufgehellt, Gamma 0,72 wie farbvarianten.py, ohne Kontur, keine Sättigungsänderung).
Aufruf: PYTHONPATH=<pil> python3 atlas_bauen.py <ordner mit Streifen> <ausgabeordner = client/grafik>
Layout je Atlas (Breite 3200): die Bilder fließen zeilenweise hintereinander, zuerst alle 160er Felder (walk, run, idle, attack, neckbite und die
Gang-Varianten walk2, walk3, run2 mit 12 Bildern), dann die 200er Felder (crawl, dying, tod2, tod3). So bleibt kein Rest am Zeilenende frei.
Pflicht-Clips müssen für jede Figur da sein; Varianten (walk2, walk3, run2, tod2, tod3) nur, wenn sie für ALLE Figuren gerendert sind.
JSON: bilder[<figur>_<clip>_<nn>] = [x, y, b, h] (Rahmen im Atlas der Figur, alle Figuren gleich), clips[<clip>] = { feld, n, schleife }."""
import sys, json, os
from PIL import Image
D, OUT = sys.argv[1].rstrip('/') + '/', sys.argv[2].rstrip('/') + '/'
FIG = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero']
# (clip, Feld px, Schleife, Pflicht)
CLIPS = [('walk', 160, True, True), ('run', 160, True, True), ('idle', 160, True, True), ('attack', 160, True, True), ('neckbite', 160, True, True),
         ('walk2', 160, True, False), ('walk3', 160, True, False), ('run2', 160, True, False),
         ('crawl', 200, True, True), ('dying', 200, False, True), ('tod2', 200, False, False), ('tod3', 200, False, False)]
BREITE = 3200
GAMMA = [round(255 * (v / 255) ** 0.72) for v in range(256)]
def hell(s):
    a = s.split()[3]; r = s.convert('RGB').point(GAMMA * 3).convert('RGBA'); r.putalpha(a); return r
datei = lambda fig, clip: f'{D}{fig}_{clip}_streifen.png'
aktiv = [c for c in CLIPS if c[3] or all(os.path.exists(datei(f, c[0])) for f in FIG)]
# Bildzahl je Clip aus dem Streifen der ersten Figur; Platz im Atlas fließend vergeben
plan, clips, x, y, feld_alt = {}, {}, 0, 0, None
for clip, feld, schleife, _ in aktiv:
    s = Image.open(datei(FIG[0], clip)); n = s.width // feld
    assert s.height == feld and s.width == n * feld, (clip, s.size)
    if feld_alt is not None and feld != feld_alt and x > 0: x = 0; y += feld_alt   # neue Feldgröße: neue Zeile
    feld_alt = feld
    for i in range(n):
        if x + feld > BREITE: x = 0; y += feld
        plan[(clip, i)] = (x, y, feld); x += feld
    clips[clip] = {'feld': feld, 'n': n, 'schleife': schleife}
hoehe = y + (feld_alt if x > 0 else 0)
bilder = {}
for fig in FIG:
    atlas = Image.new('RGBA', (BREITE, hoehe), (0, 0, 0, 0))
    for clip, feld, _, _ in aktiv:
        s = Image.open(datei(fig, clip)).convert('RGBA'); n = clips[clip]['n']
        assert s.height == feld and s.width == n * feld, (fig, clip, s.size)
        for i in range(n):
            px, py, _ = plan[(clip, i)]
            atlas.alpha_composite(hell(s.crop((i * feld, 0, (i + 1) * feld, feld))), (px, py)); bilder[f'{fig}_{clip}_{i:02d}'] = [px, py, feld, feld]
    atlas.save(f'{OUT}zombies_{fig}.webp', quality=82, alpha_quality=90, method=6)
    print(fig, atlas.size, f'{os.path.getsize(f"{OUT}zombies_{fig}.webp") // 1024} kB, Grafikspeicher {BREITE * hoehe * 4 / 1e6:.1f} MB')
json.dump({'figuren': FIG, 'atlas': {f: f'zombies_{f}.webp' for f in FIG}, 'groesse': [BREITE, hoehe], 'clips': clips, 'bilder': bilder},
          open(OUT + 'zombies_neu.json', 'w'), separators=(',', ':'))
print('Clips:', ', '.join(f'{c}({clips[c]["n"]})' for c in clips))
