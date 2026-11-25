# Draufsichten der selbst gebauten Panzermodelle (tools/panzer_modell, gerendert mit render.mjs, 4-fach überabgetastet) verkleinern
# und als WebP nach client/grafik: puma_wanne.webp, puma_turm.webp, leopard_wanne.webp, leopard_turm.webp.
# Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/panzer_bilder.py <ordner mit den PNGs von render.mjs> [zielordner]
import sys, os, json
from PIL import Image, ImageFilter

quelle = sys.argv[1]
ziel = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'grafik')
masse = json.load(open(os.path.join(quelle, 'masse.json')))
for modell, teile in masse.items():
    for teil in ('wanne', 'turm'):
        info = teile[teil]
        b = Image.open(os.path.join(quelle, f'{modell}_{teil}.png')).convert('RGBA')
        # vormultipliziert verkleinern (keine hellen/dunklen Säume an den Alphakanten)
        k = b.convert('RGBa').resize((info['w'], info['h']), Image.LANCZOS).convert('RGBA')
        if teil == 'turm':
            # weicher dunkler Rand um den Turm (0,25 m Platz im Rahmen): hebt ihn im Spiel von der gleichfarbigen Wanne ab
            px = info['px']
            a = k.getchannel('A').filter(ImageFilter.MaxFilter(2 * round(0.05 * px) + 1)).filter(ImageFilter.GaussianBlur(0.09 * px))
            schatten = Image.new('RGBA', k.size, (12, 14, 8, 0)); schatten.putalpha(a.point(lambda v: v * 0.6))
            k = Image.alpha_composite(schatten, k)
        datei = os.path.join(ziel, f'{modell}_{teil}.webp')
        k.save(datei, 'WEBP', quality=88, alpha_quality=95, method=6)
        r = info['rahmen']
        print(modell, teil, b.size, '->', k.size, os.path.getsize(datei), 'Bytes',
              f"Drehpunkt ({-r['x0'] * info['px']:.1f}, {-r['z0'] * info['px']:.1f}) px" if teil == 'turm' else '')
