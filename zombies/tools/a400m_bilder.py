# A400M-Draufsichten: Rumpf ohne Propeller + ein Propeller (Bug nach rechts, 1 Modelleinheit = 100 m)
# Rendern (tools/glb_draufsicht, px=1565, drehung=-90; Propeller = Knoten G_3D_Object__39_1..4):
#   rumpf: seite.html?datei=airbusa400m.glb&drehung=-90&px=1565&turm=G_3D_Object__39_1,…_2,…_3,…_4&teil=wanne
#   prop:  seite.html?datei=airbusa400m.glb&drehung=-90&px=1565&turm=G_3D_Object__39_1&weg=…_2,…_3,…_4&teil=turm
# Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/a400m_bilder.py <ordner mit rumpf.png und prop1.png>
# Schreibt client/grafik/a400m_rumpf.webp + a400m_prop.webp und gibt die Naben-Versätze (Spielpixel, 8 px = 1 m) aus.
import sys, os
from PIL import Image
quelle = sys.argv[1]
ziel = os.path.join(os.path.dirname(__file__), '..', 'client', 'grafik')
F = 0.75
for name, datei in (('rumpf', 'a400m_rumpf'), ('prop1', 'a400m_prop')):
    b = Image.open(os.path.join(quelle, name + '.png')).convert('RGBA')
    k = b.resize((round(b.width * F), round(b.height * F)), Image.LANCZOS)
    k.save(os.path.join(ziel, datei + '.webp'), 'WEBP', quality=88, method=6)
    print(datei, b.size, '->', k.size, os.path.getsize(os.path.join(ziel, datei + '.webp')), 'Bytes')
# Boxmitten aus der Renderausgabe (Modelleinheiten, Rahmen: x = Bug, z = seitlich nach unten)
hx, hz = (-0.22450376 + 0.2364032) / 2, (-0.5144242 + -0.0856712) / 2
naben = [(0.0929631 + 0.1122546) / 2, (-0.4568192 + -0.4020298) / 2], [(0.1095958 + 0.1288872) / 2, (-0.3975594 + -0.3427699) / 2], \
        [(0.0929631 + 0.1122546) / 2, (-0.1996394 + -0.1448499) / 2], [(0.1095958 + 0.1288872) / 2, (-0.2588992 + -0.2041097) / 2]
print('NABEN', [[round((x - hx) * 800, 1), round((z - hz) * 800, 1)] for x, z in naben])
print('LAENGE', round((0.2364032 + 0.22450376) * 800, 1), 'BREITE', round((0.5144242 - 0.0856712) * 800, 1))
