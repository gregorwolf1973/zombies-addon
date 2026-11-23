#!/usr/bin/env python3
"""Zusammenbau der Vorschau-Dateien aus den Streifen (walk/run) und dem alten Sprite.
PYTHONPATH=<pil> python3 anschauen.py <ordner mit walk_streifen.png run_streifen.png alt0..5.png> """
import sys, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont
D = sys.argv[1] + '/'
F = 160; SK = 0.42 * 0.699 * 0.7   # Spielmaßstab: ZOMBIE_GROESSE * groesse(zombie_hemd) * mg() (groesseGesamt 70 %)
def streifen(n, k=16): s = Image.open(D + n + '_streifen.png'); return [s.crop((i * F, 0, i * F + F, F)) for i in range(k)]
def kontur(s, d=3):   # dunkle Kontur wie beim heutigen Sprite (nur Bild von oben, Sichtbarkeit von Armen/Füßen)
    a = s.split()[3].filter(ImageFilter.MaxFilter(2 * d + 1)); k = Image.new('RGBA', s.size, (28, 32, 22, 255)); k.putalpha(a.point(lambda v: 255 if v > 40 else 0))
    k.alpha_composite(s); return k
KONTUR = '--ohne-kontur' not in sys.argv
walk, run = streifen('walk'), streifen('run')
if KONTUR: walk, run = [kontur(f) for f in walk], [kontur(f) for f in run]
alt = [Image.open(D + f'alt{i}.png') for i in range(6)]
random.seed(4)
def wiese(w, h):
    b = Image.new('RGBA', (w, h), (104, 146, 70, 255)); px = b.load()
    for y in range(h):
        for x in range(w):
            n = random.randint(-5, 5); r, g, bl, _ = px[x, y]; px[x, y] = (r + n, g + n + 2, bl + n // 2, 255)
    return b.filter(ImageFilter.GaussianBlur(0.7))
def mit_schatten(s):   # weicher Bodenschatten: unscharfe Silhouette, leicht versetzt
    a = s.split()[3].point(lambda v: int(v * 0.42)).filter(ImageFilter.GaussianBlur(5))
    sch = Image.new('RGBA', s.size, (20, 30, 10, 0)); sch.putalpha(a)
    o = Image.new('RGBA', s.size, (0, 0, 0, 0)); o.alpha_composite(sch, (6, 9)); o.alpha_composite(s); return o
def spiel(s, zoom, bg=None, drehen=0):
    k = SK * zoom; s2 = mit_schatten(s)
    if drehen: s2 = s2.rotate(-drehen, Image.BICUBIC)
    return s2.resize((max(1, round(F * k)), max(1, round(F * k))), Image.LANCZOS)
fnt = ImageFont.load_default()
def beschr(img, t, xy=(4, 3)): ImageDraw.Draw(img).text(xy, t, fill=(255, 255, 255, 255), font=fnt, stroke_width=1, stroke_fill=(0, 0, 0, 255))

# --- Phasenbild
ph = Image.new('RGBA', (F * 8, F * 5), (104, 146, 70, 255))
for r, (n, L) in enumerate([('Walk', walk), ('Run', run)]):
    for i, f in enumerate(L): ph.alpha_composite(f, ((i % 8) * F, (r * 2 + i // 8) * F))
    beschr(ph, n + ' 16 Phasen', (4, r * 2 * F + 3))
for i, f in enumerate(alt): ph.alpha_composite(f, (i * F, 4 * F))
beschr(ph, 'heute: zombie_hemd (6 Bilder)', (4, 4 * F + 3))
ph.save(D + 'mixamo_proto_phasen.png')

# --- Vergleichs-GIF
SPALTEN = [('Warzombie Walk', walk, 90), ('Warzombie Run', run, 50), ('heute zombie_hemd', alt, 120)]
BIG = 4 * 80   # 4x der Spielbild-Pixel? hier: Bild 320 px
dauer = 0.9 * 1000; frames = []; MS = 30   # 30 ms Raster
nframes = 48
panel_w = 340
for t in range(nframes):
    im = Image.new('RGBA', (panel_w * 3, 330 + 170), (30, 30, 30, 255))
    for c, (name, L, ms) in enumerate(SPALTEN):
        idx = int(t * MS // ms) % len(L); f = L[idx]
        big = wiese(panel_w - 10, 320) if t == 0 else None
        if t == 0: wiese.cache = getattr(wiese, 'cache', {})
        key = ('big', c)
        if key not in wiese.cache: wiese.cache[key] = wiese(panel_w - 10, 320)
        pn = wiese.cache[key].copy(); fb = mit_schatten(f.resize((320, 320), Image.LANCZOS)); pn.alpha_composite(fb, (-5, 0)); beschr(pn, name)
        im.paste(pn, (c * panel_w + 5, 5))
        for j, z in enumerate((1.0, 1.9)):
            key = ('klein', c, j)
            if key not in wiese.cache: wiese.cache[key] = wiese(panel_w // 2 - 8, 160)
            kp = wiese.cache[key].copy(); sp = spiel(f, z); kp.alpha_composite(sp, ((kp.width - sp.width) // 2, (kp.height - sp.height) // 2)); beschr(kp, f'Zoom {z}')
            im.paste(kp, (c * panel_w + 5 + j * (panel_w // 2 - 3), 335))
    frames.append(im.convert('RGB').quantize(48, dither=Image.NONE))
frames[0].save(D + 'mixamo_proto.gif', save_all=True, append_images=frames[1:], duration=MS, loop=0, optimize=True)

# --- Kreis-GIF: Laufrichtung = Drehung des Bildes (Zoom 1.9 -> noch 2x vergrößert, damit man es sieht)
P = 300; R = 95; Z = 1.9 * 2
bgs = [wiese(P, P) for _ in range(3)]
frames = []; NF = 96
for t in range(NF):
    im = Image.new('RGBA', (P * 3, P), (30, 30, 30, 255))
    for c, (name, L, ms) in enumerate(SPALTEN):
        pn = bgs[c].copy(); th = 2 * math.pi * t / NF * (1 if c != 1 else 1)
        x = P / 2 + R * math.cos(th); y = P / 2 + R * math.sin(th); kopf = math.degrees(th) + 90
        idx = int(t * MS * 2 // ms) % len(L)
        sp = spiel(L[idx], Z, drehen=kopf); pn.alpha_composite(sp, (round(x - sp.width / 2), round(y - sp.height / 2))); beschr(pn, name + ' (Zoom 1.9 x2)')
        im.paste(pn, (c * P, 0))
    frames.append(im.convert('RGB').quantize(48, dither=Image.NONE))
frames[0].save(D + 'mixamo_proto_kreis.gif', save_all=True, append_images=frames[1:], duration=MS * 2, loop=0)
