#!/usr/bin/env python3
"""Held-Streifen (<figur>_<auftrag>_streifen.png + _meta.json aus held_streifen.py) -> je Figur ein WebP-Atlas + gemeinsame JSON, Farbstil C
(aufgehellt, Gamma 0,72 wie atlas_bauen.py, ohne Kontur). Maßstab wie die Zombie-Atlanten: 160-px-Feld = 4 m (FIG_PX_JE_M = 40 px je Meter, Render gross=2).
Aufruf: PYTHONPATH=<pil> python3 helden_atlas_bauen.py <ordner mit Streifen> <ausgabeordner = client/grafik>
Layout: eine Zeile je Auftrag in der Reihenfolge von helden_jobs.json (Feld 160 px, Tod 200 px), Bilder nebeneinander ab x = 0.
JSON helden_neu.json: clips[<auftrag>] = {y, feld, n, einmal, dauer (s), weg (m je Zyklus, nur Schleifen), mund {held|heldin: [[x,y,winkel] je Bild]} (Mündung in Atlas-Pixeln ab Bildmitte, nur Schussclips)}."""
import sys, json, os
from PIL import Image
D, OUT = sys.argv[1].rstrip('/') + '/', sys.argv[2].rstrip('/') + '/'
HERE = os.path.dirname(os.path.abspath(__file__))
jobs = [a['name'] for a in json.load(open(HERE + '/helden_jobs.json'))['auftraege']]
FIG = [('swatguy', 'held'), ('jennifer', 'heldin')]
GAMMA = [round(255 * (v / 255) ** 0.72) for v in range(256)]
def hell(s):
    a = s.split()[3]; r = s.convert('RGB').point(GAMMA * 3).convert('RGBA'); r.putalpha(a); return r
clips = {}; breite = 0; hoehe = 0
for n in jobs:
    m = json.load(open(f'{D}jennifer_{n}_meta.json')); breite = max(breite, m['N'] * m['f'])
    weg = round(m.get('weg_m', 0) * 8, 1)   # Weg je Schrittzyklus in Spielpixeln (8 px/m), aus der Hüftbewegung des Clips
    if not weg and n.endswith('gehen'): weg = round(44 * m['dauer'], 1)    # Clips ohne Hüftweg (Mixamo „in place“): bei Gehtempo 44 px/s (20 km/h im Spiel)
    if not weg and n.endswith('rennen'): weg = round(80 * m['dauer'], 1)   # Rennen ~80 px/s
    clips[n] = {'y': hoehe, 'feld': m['f'], 'n': m['N'], 'einmal': m['einmal'], 'dauer': round(m['dauer'], 3), 'weg': weg if n.endswith(('gehen', 'rennen')) else 0}
    hoehe += m['f']
for fz, key in FIG:
    atlas = Image.new('RGBA', (breite, hoehe), (0, 0, 0, 0))
    for n in jobs:
        s = Image.open(f'{D}{fz}_{n}_streifen.png').convert('RGBA'); m = json.load(open(f'{D}{fz}_{n}_meta.json')); c = clips[n]
        assert m['f'] == c['feld'] and m['N'] == c['n'], (fz, n)
        for i in range(c['n']): atlas.alpha_composite(hell(s.crop((i * c['feld'], 0, (i + 1) * c['feld'], c['feld']))), (i * c['feld'], c['y']))
        if m.get('mund'): c.setdefault('mund', {})[key] = m['mund']
    atlas.save(f'{OUT}helden_{key}.webp', quality=82, alpha_quality=90, method=6)
    print(key, atlas.size)
json.dump({'figuren': [k for _, k in FIG], 'atlas': {k: f'helden_{k}.webp' for _, k in FIG}, 'groesse': [breite, hoehe], 'clips': clips}, open(OUT + 'helden_neu.json', 'w'), separators=(',', ':'))
