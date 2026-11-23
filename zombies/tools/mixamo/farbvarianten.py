#!/usr/bin/env python3
"""Vergleichsseite Farbvarianten (A-H), Figuren x Varianten, Clip walk + Szene in Variante F.
PYTHONPATH=<pil> python3 farbvarianten.py <ordner z (Streifen)> <ordner h (hell gerendert, <figur>_walk_streifen.png)> <ausgabe.html>"""
import sys, io, base64, math, random
from PIL import Image, ImageFilter, ImageEnhance, ImageChops
Z, H, OUT = sys.argv[1] + '/', sys.argv[2] + '/', sys.argv[3]
FIG = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero']
SK = 0.42 * 0.699 * 0.7; FF = 160
def lade(pfad, f, c):
    s = Image.open(f'{pfad}{f}_{c}_streifen.png'); h = s.height
    return [s.crop((i * h, 0, (i + 1) * h, h)) for i in range(s.width // h)]
def rgb_op(s, fn):
    a = s.split()[3]; r = fn(s.convert('RGB')).convert('RGBA'); r.putalpha(a); return r
def sat(s): return rgb_op(s, lambda i: ImageEnhance.Color(i).enhance(1.4))
def hell(s): return rgb_op(s, lambda i: i.point([round(255 * (v / 255) ** 0.72) for v in range(256)] * 3))
def kontur(s, d=2, farbe=(26, 30, 20)):
    a = s.split()[3].filter(ImageFilter.MaxFilter(2 * d + 1)); k = Image.new('RGBA', s.size, farbe + (255,)); k.putalpha(a.point(lambda v: 255 if v > 40 else 0)); k.alpha_composite(s); return k
def rim(s):   # Randlicht: heller Saum innen an den der Sonne (links oben) zugewandten Kanten
    a = s.split()[3]; versch = ImageChops.offset(a, 3, 3); kante = ImageChops.subtract(a, versch).filter(ImageFilter.GaussianBlur(1)).point(lambda v: min(255, v * 2))
    l = Image.new('RGBA', s.size, (255, 244, 205, 255)); l.putalpha(ImageChops.multiply(kante, a).point(lambda v: int(v * 0.8))); o = s.copy(); o.alpha_composite(l); return o
VAR = [('A', 'wie jetzt', lambda f, h: f), ('B', 'Sättigung +40 %', lambda f, h: sat(f)), ('C', 'aufgehellt', lambda f, h: hell(f)), ('D', 'Kontur 2 px', lambda f, h: kontur(f)),
       ('E', 'B+C', lambda f, h: hell(sat(f))), ('F', 'B+C+D', lambda f, h: kontur(hell(sat(f)))), ('G', 'B+C+Randlicht', lambda f, h: rim(hell(sat(f)))), ('H', 'Licht im Render + D', lambda f, h: kontur(h))]
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
def gif64(frames, ms):
    q = [f.convert('RGB').quantize(96, dither=Image.NONE) for f in frames]; b = io.BytesIO()
    q[0].save(b, 'GIF', save_all=True, append_images=q[1:], duration=ms, loop=0, optimize=True); return 'data:image/gif;base64,' + base64.b64encode(b.getvalue()).decode()
PW = round(FF * SK * 3) + 20; bg = wiese(PW, PW)
zellen = {}
for f in FIG:
    W, Hh = lade(Z, f, 'walk'), lade(H, f, 'walk')
    for v, _, fn in VAR:
        fr = []
        for i in range(16):
            p = bg.copy(); sp = fig(fn(W[i], Hh[i]), 3); p.alpha_composite(sp, ((PW - sp.width) // 2, (PW - sp.height) // 2)); fr.append(p)
        zellen[(f, v)] = gif64(fr, 90)
SW, SH = 760, 440; sbg = wiese(SW, SH); ZM = 1.9 * 2; läufer = []; fF = VAR[5][2]
for i, f in enumerate(FIG):
    for j, c in enumerate(('walk', 'run')):
        k = i * 2 + j; L = [fF(x, x) for x in lade(Z, f, c)]
        läufer.append(dict(L=L, ms=90 if c == 'walk' else 50, cx=110 + (k % 5) * 135 + random.randint(-15, 15), cy=110 + (k // 5) * 200, R=45 + 12 * (k % 3), ph=random.random() * 6.28, dir=1 if k % 2 else -1, w=0.55 if c == 'walk' else 1.3))
fr = []
for t in range(96):
    im = sbg.copy(); obj = []
    for l in läufer:
        th = l['ph'] + l['dir'] * 2 * math.pi * t / 96 * (1 if l['w'] < 1 else 2); x = l['cx'] + l['R'] * math.cos(th); y = l['cy'] + l['R'] * math.sin(th)
        obj.append((y, fig(l['L'][int(t * 50 / l['ms']) % len(l['L'])], ZM, math.degrees(th) + (90 if l['dir'] > 0 else -90)), x))
    for y, sp, x in sorted(obj, key=lambda o: o[0]): im.alpha_composite(sp, (round(x - sp.width / 2), round(y - sp.height / 2)))
    fr.append(im)
szene = gif64(fr, 50)
h = ['<!doctype html><meta charset=utf-8><title>Zombies Farbvarianten</title><style>body{background:#222;color:#eee;font:14px sans-serif;margin:16px}table{border-collapse:collapse}td,th{padding:2px;text-align:center;font-size:12px}img{display:block}</style>',
     '<h2>Farbvarianten (walk, Spielgröße x3) und Szene in Variante F (Zoom 1,9 x2)</h2><img src="%s"><table><tr><th></th>' % szene]
h += ['<th>%s<br>%s</th>' % (v, b) for v, b, _ in VAR]; h.append('</tr>')
for f in FIG: h.append('<tr><th>%s</th>' % f + ''.join('<td><img src="%s"></td>' % zellen[(f, v)] for v, _, _ in VAR) + '</tr>')
h.append('</table>'); open(OUT, 'w').write(''.join(h)); print(OUT, len(''.join(h)) // 1024, 'KB')
