# Draufsichten für Hubschrauber (NH90) und Tanklaster: aus tools/glb_draufsicht rendern (Modelle in modelle/, gitignored), dann
#   PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/fahrzeug_bilder.py <ordner mit nhk.png nhr.png ft.png>
# Rendern (seite.html, Bug nach rechts = drehung=90):
#   nhk:  datei=modelle/nh90_low_poly.glb&px=24&drehung=90&turm=nh90_lowpoly_main_rotor_0&teil=wanne    (Rumpf ohne Rotor)
#   nhr:  … &teil=turm                                                                                  (Hauptrotor allein)
#   ft:   datei=modelle/fuel_truck.glb&px=20&drehung=90
import sys, os
from PIL import Image, ImageDraw, ImageFilter
q = sys.argv[1]
ziel = os.path.join(os.path.dirname(__file__), '..', 'client', 'grafik')
def laden(n): return Image.open(os.path.join(q, n + '.png')).convert('RGBA')
def speichern(b, name, F=1.0):
    k = b.resize((round(b.width * F), round(b.height * F)), Image.LANCZOS) if F != 1 else b
    k.save(os.path.join(ziel, name + '.webp'), 'WEBP', quality=88, method=6)
    print(name, b.size, '->', k.size, os.path.getsize(os.path.join(ziel, name + '.webp')), 'Bytes')
speichern(laden('nhk'), 'nh90_rumpf', 0.5)       # 12 Bildpunkte je Meter (Spiel: 8 px je Meter -> skala 0.667)
speichern(laden('nhr'), 'nh90_rotor', 0.5)
speichern(laden('ft'), 'tanklaster', 0.5)         # 10 Bildpunkte je Meter, im Spiel auf 100 px Länge (skala 0.667)
