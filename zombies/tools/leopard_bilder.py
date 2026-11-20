# Leopard-2A7-Draufsichten (aus tools/glb_draufsicht, px=44 Bildpunkte je Modelleinheit = Meter) verkleinern und als WebP nach client/grafik
# Rendern (Bug rechts, Turm = Knoten Tourelle_01):
#   seite.html?datei=leopard/source/GER_Leo_2A7_Trophy.glb&turm=Tourelle_01&teil=wanne|turm&px=44
# Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/leopard_bilder.py <ordner mit wanne.png und turm.png>
import sys, os
from PIL import Image
quelle = sys.argv[1]
ziel = os.path.join(os.path.dirname(__file__), '..', 'client', 'grafik')
F = 0.6   # px 44 -> 26.4 Bildpunkte je Meter
for name in ('wanne', 'turm'):
    b = Image.open(os.path.join(quelle, name + '.png')).convert('RGBA')
    k = b.resize((round(b.width * F), round(b.height * F)), Image.LANCZOS)
    k.save(os.path.join(ziel, 'leopard_' + name + '.webp'), 'WEBP', quality=88, method=6)
    print(name, b.size, '->', k.size, os.path.getsize(os.path.join(ziel, 'leopard_' + name + '.webp')), 'Bytes')
