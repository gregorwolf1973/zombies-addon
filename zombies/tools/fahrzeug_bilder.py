# Draufsichten für Hubschrauber (NH90), Tanklaster und Panzermörser (M113): aus tools/glb_draufsicht rendern (Modelle in modelle/, gitignored), dann
#   PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/fahrzeug_bilder.py <ordner mit nhk.png nhr.png ft.png m113.png>
# Rendern (seite.html, Bug nach rechts = drehung=90):
#   nhk:  datei=modelle/nh90_low_poly.glb&px=24&drehung=90&turm=nh90_lowpoly_main_rotor_0&teil=wanne    (Rumpf ohne Rotor)
#   nhr:  … &teil=turm                                                                                  (Hauptrotor allein)
#   ft:   datei=modelle/fuel_truck.glb&px=20&drehung=90
#   m113: datei=modelle/m113.glb&px=0.0767&drehung=90
# Der Mörser im M113 (offene Dachluke hinten, Mörserlager) wird hier selbst eingezeichnet; das Rohr zeichnet der Client nach dem Ziel.
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
m = laden('m113')
d = ImageDraw.Draw(m)
# offene Dachluke im Heck (links): Rahmen, dunkler Kampfraum, aufgeklappte Lukendeckel oben und unten
d.rounded_rectangle((18, 24, 100, 104), 6, fill=(44, 48, 38, 255), outline=(30, 32, 26, 255), width=3)
d.rectangle((26, 32, 92, 96), fill=(28, 30, 24, 255))
d.rectangle((26, 80, 92, 96), fill=(58, 62, 48, 255))                                      # Boden des Kampfraums
d.rounded_rectangle((16, 14, 102, 25), 3, fill=(86, 94, 66, 255), outline=(40, 44, 30, 255))   # Deckel oben (aufgeklappt)
d.rounded_rectangle((16, 103, 102, 114), 3, fill=(86, 94, 66, 255), outline=(40, 44, 30, 255))  # Deckel unten
d.ellipse((48, 52, 72, 76), fill=(70, 74, 62, 255), outline=(20, 22, 18, 255), width=2)    # Mörserlager (Bodenplatte)
d.ellipse((55, 59, 65, 69), fill=(34, 36, 30, 255))
speichern(m, 'm113_moerser')
