#!/usr/bin/env python3
"""Held-Streifen (<figur>_<auftrag>_streifen.png + _meta.json aus held_streifen.py) -> je Figur ein WebP-Atlas (nur der Körper, OHNE Waffen) + ein Waffen-Sprite-Atlas + gemeinsame JSON,
Farbstil C (aufgehellt, Gamma 0,72 wie atlas_bauen.py, ohne Kontur). Maßstab wie die Zombie-Atlanten (80 Atlas-px je echtem Meter bei Render gross=2; 160-px-Feld = 4 Welteinheiten).
Aufruf: PYTHONPATH=<pil> python3 helden_atlas_bauen.py <ordner mit Streifen> <ausgabeordner = client/grafik> [waffen.txt = Ausgabe von held.html?waffen=1]
Layout: eine Zeile je Auftrag in der Reihenfolge von helden_jobs.json (Feld je Auftrag, Bilder nebeneinander ab x = 0), alle Figuren gleich.
JSON helden_neu.json: figuren (Ids), atlas {id: Datei}, groesse [w,h], clips[<auftrag>] = {y, feld, n, einmal, dauer (s), weg (Spielpixel je Zyklus, nur Schleifen)},
  pos[<id>][<auftrag>][<waffe>] = [[x, y, winkel, längenfaktor] je Bild] (Griffpunkt der Waffe in Atlas-Pixeln ab Bildmitte, x nach vorn, y nach unten, Winkel der Waffenachse),
  vorschau {datei, kachel}: Kacheln in der Reihenfolge von figuren,
  waffen[<name>] = {y, w, h, ox, oy (Griffpunkt im Sprite), laenge, griff, lampe [vorwärts, seitlich] (Atlas-px, nur Zweihand-Waffen)}, waffenAtlas."""
import sys, json, os, io, base64
from PIL import Image
D, OUT = sys.argv[1].rstrip('/') + '/', sys.argv[2].rstrip('/') + '/'
WTXT = sys.argv[3] if len(sys.argv) > 3 else None
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(HERE + '/helden_jobs.json'))
jobs = [a['name'] for a in cfg['auftraege'] if not a['name'].startswith('_')]   # '_vorschau' = Vorschaubild für die Startwahl
FIG = [f for f in cfg['figuren'] if os.path.exists(f'{D}{f}_{jobs[0]}_meta.json')]
GAMMA = [round(255 * (v / 255) ** 0.72) for v in range(256)]
def hell(s):
    a = s.split()[3]; r = s.convert('RGB').point(GAMMA * 3).convert('RGBA'); r.putalpha(a); return r
clips = {}; breite = 0; hoehe = 0
for n in jobs:
    m = json.load(open(f'{D}{FIG[0]}_{n}_meta.json')); breite = max(breite, m['N'] * m['f'])
    weg = round(m.get('weg_m', 0) * 8, 1)   # Weg je Schrittzyklus in Spielpixeln (8 px/m), aus der Hüftbewegung des Clips
    if not weg and n.endswith('gehen'): weg = round(44 * m['dauer'], 1)    # Clips ohne Hüftweg (Mixamo „in place“): bei Gehtempo 44 px/s
    if not weg and n.endswith('rennen'): weg = round(80 * m['dauer'], 1)   # Rennen ~80 px/s
    clips[n] = {'y': hoehe, 'feld': m['f'], 'n': m['N'], 'einmal': m['einmal'], 'dauer': round(m['dauer'], 3), 'weg': weg if n.endswith(('gehen', 'rennen')) else 0}
    hoehe += m['f']
pos = {}
for fz in FIG:
    atlas = Image.new('RGBA', (breite, hoehe), (0, 0, 0, 0)); pos[fz] = {}
    for n in jobs:
        s = Image.open(f'{D}{fz}_{n}_streifen.png').convert('RGBA'); m = json.load(open(f'{D}{fz}_{n}_meta.json')); c = clips[n]
        assert m['f'] == c['feld'] and m['N'] == c['n'], (fz, n)
        for i in range(c['n']): atlas.alpha_composite(hell(s.crop((i * c['feld'], 0, (i + 1) * c['feld'], c['feld']))), (i * c['feld'], c['y']))
        if m.get('pos'): pos[fz][n] = {w: [[p[0], p[1], round(p[2], 2), round(p[3], 2)] for p in v] for w, v in m['pos'].items()}
    atlas.save(f'{OUT}helden_{fz}.webp', quality=82, alpha_quality=90, method=6)
    print(fz, atlas.size, os.path.getsize(f'{OUT}helden_{fz}.webp') // 1024, 'KB')
# Vorschaubilder der Startwahl: eine Kachel je Held (Pistole in der Hand, Blick nach oben), 160 px, nebeneinander in der Reihenfolge von FIG
KACHEL = 160
vs = Image.new('RGBA', (KACHEL * len(FIG), KACHEL), (0, 0, 0, 0))
for i, fz in enumerate(FIG):
    t = Image.open(f'{D}{fz}__vorschau_streifen.png').convert('RGBA'); t = t.crop((0, 0, t.height, t.height)).rotate(90).resize((KACHEL, KACHEL), Image.LANCZOS)
    vs.alpha_composite(hell(t), (i * KACHEL, 0))
vs.save(OUT + 'helden_vorschau.webp', quality=88, alpha_quality=95, method=6); print('vorschau', vs.size, os.path.getsize(OUT + 'helden_vorschau.webp') // 1024, 'KB')
res = {'vorschau': {'datei': 'helden_vorschau.webp', 'kachel': KACHEL}, 'figuren': FIG, 'atlas': {k: f'helden_{k}.webp' for k in FIG}, 'groesse': [breite, hoehe], 'clips': clips, 'pos': pos}
if WTXT:
    t = open(WTXT).read().split('\n'); k = json.loads(t[1][7:]); CW, CH, PX, S = k['CW'], k['CH'], k['PX'], k['S']
    sheet = Image.open(io.BytesIO(base64.b64decode(t[2].split(',', 1)[1]))).convert('RGBA')
    sc = 0.5   # Render 80 px/Welteinheit -> Atlas 40 px/Welteinheit (wie die Körper: Feld 160 für 4 Einheiten)
    w2, h2 = round(CW * sc), round(CH * sc); res['waffen'] = {}
    wa = Image.new('RGBA', (w2, h2 * len(k['infos'])), (0, 0, 0, 0))
    for i, inf in enumerate(k['infos']):
        wa.alpha_composite(hell(sheet.crop((0, i * CH, CW, (i + 1) * CH)).resize((w2, h2), Image.LANCZOS)), (0, i * h2))
        L = inf['laenge'] * S * PX * sc   # Waffenlänge in Atlas-px
        d = {'y': i * h2, 'w': w2, 'h': h2, 'ox': round(w2 / 2 - (0.5 - inf['griff']) * L, 1), 'oy': h2 / 2, 'laenge': round(L, 1), 'griff': inf['griff']}
        lm = cfg['waffen'][inf['name']].get('lampe')
        if lm: d['lampe'] = [round(lm[0] * S * PX * sc, 1), round(lm[1] * S * PX * sc, 1)]
        res['waffen'][inf['name']] = d
    wa.save(OUT + 'helden_waffen.webp', quality=88, alpha_quality=95, method=6); res['waffenAtlas'] = 'helden_waffen.webp'
    print('waffen', wa.size, os.path.getsize(OUT + 'helden_waffen.webp') // 1024, 'KB')
json.dump(res, open(OUT + 'helden_neu.json', 'w'), separators=(',', ':'))
print('json', os.path.getsize(OUT + 'helden_neu.json') // 1024, 'KB')
