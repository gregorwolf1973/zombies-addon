#!/usr/bin/env python3
"""Zwischenstand-Seite: Raster Figuren x Clips als GIF (Spielgröße x3) + Szene mit gemischten Läufern, alles in eine HTML-Datei.
PYTHONPATH=<pil> python3 zwischenstand.py <ordner mit <figur>_<clip>_streifen.png> <ausgabe.html>"""
import sys, io, base64, math, random
from PIL import Image, ImageFilter
D = sys.argv[1] + '/'; OUT = sys.argv[2]
FIG = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero']
CLIPS = [('walk', 90, 1), ('run', 50, 1), ('crawl', 90, 1), ('idle', 120, 1), ('attack', 100, 0), ('neckbite', 100, 0), ('dying', 90, 0)]
SK = 0.42 * 0.699 * 0.7; FF = 200   # Spielmaßstab je Atlas-Pixel; Bilder auf 200er Felder gebracht
def lade(f, c):
    s = Image.open(f'{D}{f}_{c}_streifen.png'); h = s.height; out = []
    for i in range(s.width // h):
        b = s.crop((i * h, 0, (i + 1) * h, h)); k = Image.new('RGBA', (FF, FF), (0, 0, 0, 0)); k.alpha_composite(b, ((FF - h) // 2, (FF - h) // 2)); out.append(k)
    return out
random.seed(4)
def wiese(w, h):
    b = Image.new('RGBA', (w, h), (104, 146, 70, 255)); px = b.load()
    for y in range(h):
        for x in range(w):
            n = random.randint(-5, 5); r, g, bl, _ = px[x, y]; px[x, y] = (r + n, g + n + 2, bl + n // 2, 255)
    return b.filter(ImageFilter.GaussianBlur(0.7))
def schatten(s):
    a = s.split()[3].point(lambda v: int(v * 0.42)).filter(ImageFilter.GaussianBlur(5)); sh = Image.new('RGBA', s.size, (20, 30, 10, 0)); sh.putalpha(a)
    o = Image.new('RGBA', s.size, (0, 0, 0, 0)); o.alpha_composite(sh, (6, 9)); o.alpha_composite(s); return o
def fig(s, zoom, dreh=0):
    s2 = schatten(s)
    if dreh: s2 = s2.rotate(-dreh, Image.BICUBIC)
    n = round(FF * SK * zoom); return s2.resize((n, n), Image.LANCZOS)
def gif64(frames, ms, hold_last=False):
    q = [f.convert('RGB').quantize(64, dither=Image.NONE) for f in frames]; b = io.BytesIO()
    d = [ms] * len(q)
    if hold_last: d[-1] = 1200
    q[0].save(b, 'GIF', save_all=True, append_images=q[1:], duration=d, loop=0, optimize=True)
    return 'data:image/gif;base64,' + base64.b64encode(b.getvalue()).decode()
# Raster
PW = round(FF * SK * 3) + 20; bg = wiese(PW, PW)
zellen = {}
for f in FIG:
    for c, ms, schleife in CLIPS:
        L = lade(f, c); fr = []
        for s in L:
            p = bg.copy(); sp = fig(s, 3); p.alpha_composite(sp, ((PW - sp.width) // 2, (PW - sp.height) // 2)); fr.append(p)
        zellen[(f, c)] = gif64(fr, ms, hold_last=not schleife)
# Szene
SW, SH = 760, 440; sbg = wiese(SW, SH); Z = 1.9 * 2
läufer = []
for i, f in enumerate(FIG):
    for j, c in enumerate(('walk', 'run')):
        k = i * 2 + j; cx = 110 + (k % 5) * 135 + random.randint(-15, 15); cy = 110 + (k // 5) * 200 + random.randint(-10, 10)
        läufer.append(dict(L=lade(f, c), ms=dict((a, b) for a, b, _ in CLIPS)[c], cx=cx, cy=cy, R=45 + 12 * (k % 3), ph=random.random() * 6.28, dir=1 if k % 2 else -1, w=(0.55 if c == 'walk' else 1.3)))
NF = 96; fr = []
for t in range(NF):
    im = sbg.copy(); obj = []
    for l in läufer:
        th = l['ph'] + l['dir'] * 2 * math.pi * t / NF * (1 if l['w'] < 1 else 2)
        x = l['cx'] + l['R'] * math.cos(th); y = l['cy'] + l['R'] * math.sin(th)
        kopf = math.degrees(th) + (90 if l['dir'] > 0 else -90)
        idx = int(t * 50 / l['ms'] * (1 if l['w'] < 1 else 1)) % len(l['L'])
        obj.append((y, fig(l['L'][idx], Z, kopf), x, y))
    for _, sp, x, y in sorted(obj, key=lambda o: o[0]): im.alpha_composite(sp, (round(x - sp.width / 2), round(y - sp.height / 2)))
    fr.append(im)
szene = gif64(fr, 50)
h = ['<!doctype html><meta charset=utf-8><title>Zombie-Zwischenstand</title><style>body{background:#222;color:#eee;font:14px sans-serif;margin:16px}table{border-collapse:collapse}td,th{padding:2px;text-align:center;font-size:12px}img{display:block}</style>',
     '<h2>Zwischenstand Mixamo-Zombies (Draufsicht, Spielgröße x3; Szene Zoom 1,9 x2)</h2><img src="%s"><p>Szene: 5 Figuren, je walk und run, gemischt im Kreis</p><table><tr><th></th>' % szene]
h += ['<th>%s</th>' % c for c, _, _ in CLIPS]; h.append('</tr>')
for f in FIG:
    h.append('<tr><th>%s</th>' % f + ''.join('<td><img src="%s"></td>' % zellen[(f, c)] for c, _, _ in CLIPS) + '</tr>')
h.append('</table>'); open(OUT, 'w').write(''.join(h)); print(OUT, len(''.join(h)) // 1024, 'KB')
