# Puma-Draufsichten (aus tools/glb_draufsicht, px=4 Bildpunkte je Modelleinheit) verkleinern und als WebP nach client/grafik
# Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/puma_bilder.py <ordner mit wanne.png und turm.png>
import sys, os
from PIL import Image
quelle = sys.argv[1]
ziel = os.path.join(os.path.dirname(__file__), '..', 'client', 'grafik')
F = 0.6   # px 4 -> 2.4 Bildpunkte je Modelleinheit
for name in ('wanne', 'turm'):
    b = Image.open(os.path.join(quelle, name + '.png')).convert('RGBA')
    k = b.resize((round(b.width * F), round(b.height * F)), Image.LANCZOS)
    k.save(os.path.join(ziel, 'puma_' + name + '.webp'), 'WEBP', quality=88, method=6)
    print(name, b.size, '->', k.size, os.path.getsize(os.path.join(ziel, 'puma_' + name + '.webp')), 'Bytes')
