# Boxer-CRV-Draufsichten (aus tools/glb_draufsicht/boxer.html, px=160 Bildpunkte je Modelleinheit) verkleinern und als WebP nach client/grafik.
# Das Modell hat keinen eigenen Turm-Knoten: Turm = Dreiecke oberhalb der Dachkante (Schwerpunkt y >= 1,0) und hinter x >= -0,7 (Waffenstation, Aufbau, Rohr),
# Wanne = alles andere. Rendern (Bug rechts; beide Bilder haben dieselbe Leinwand):
#   boxer.html?datei=boxer.glb&px=160&amb=0.5&sonne=2.8&drehung=90&y0=1.0&x0=-0.7[&inv=1]     (ohne inv = Turm, mit inv = Wanne)
# Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/boxer_bilder.py <ordner mit wanne.png und turm.png>
# Gibt die Maße für BOXER (client/boxer.mjs) aus.
import sys, os
from PIL import Image, ImageEnhance
quelle = sys.argv[1]
ziel = os.path.join(os.path.dirname(__file__), '..', 'client', 'grafik')
PX = 160.0                # Bildpunkte je Modelleinheit beim Rendern
MIN_X, MIN_Z, MAX_X, MAX_Z = -1.848355531692505, -0.6264081001281743, 1.9856816530227663, 0.6253423094749455   # Leinwand (Weltkoordinaten nach der Drehung)
DREH = (-0.0965, 0.0)     # Turmdrehpunkt (Mitte des Aufbaus), Modelleinheiten (Längs, quer)
BREITE_PX = 24.0          # echte Breite 3,0 m (Bild ist schmaler: ohne Spiegel, Räder; es wird quer gestreckt)
LAENGE_M = 7.9            # echte Wannenlänge (Meter)
F = 0.75                  # Verkleinerung: 120 Bildpunkte je Modelleinheit = 58 je Meter (Puma: 48)
KONTRAST = 1.18           # etwas satter: Kontrast und Sättigung
cx, cz = (MIN_X + MAX_X) / 2, (MIN_Z + MAX_Z) / 2
b = {n: Image.open(os.path.join(quelle, n + '.png')).convert('RGBA') for n in ('wanne', 'turm')}
W, H = b['wanne'].size
assert b['turm'].size == (W, H)
def pix(x, z): return (x - cx) * PX + W / 2, (z - cz) * PX + H / 2   # Leinwandpunkt eines Modellpunkts
def box(img):
    a = img.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    return a.getbbox()
bw, bt = box(b['wanne']), box(b['turm'])
R = 2   # Rand
bw = (bw[0] - R, bw[1] - R, bw[2] + R, bw[3] + R); bt = (bt[0] - R, bt[1] - R, bt[2] + R, bt[3] + R)
px_, pz_ = pix(*DREH)
# Maße in Bildpunkten des Endbilds
def klein(img, bx):
    k = img.crop(bx); k = k.resize((round(k.width * F), round(k.height * F)), Image.LANCZOS)
    a = k.getchannel('A'); rgb = ImageEnhance.Contrast(ImageEnhance.Color(k.convert('RGB')).enhance(1.15)).enhance(KONTRAST)
    rgb.putalpha(a); return rgb
w, t = klein(b['wanne'], bw), klein(b['turm'], bt)
w.save(os.path.join(ziel, 'boxer_wanne.webp'), 'WEBP', quality=88, method=6)
t.save(os.path.join(ziel, 'boxer_turm.webp'), 'WEBP', quality=88, method=6)
lw = (bw[2] - bw[0]) * F   # Wannenlänge im Bild (Bildpunkte)
mx = (bw[0] + bw[2]) / 2   # Wannenmitte (Leinwand)
my = (bw[1] + bw[3]) / 2
muend = (bt[2] - px_)      # Rohrende vor dem Drehpunkt (Leinwandpunkte)
print('wanne', w.size, 'turm', t.size)
print('Wanne im Bild %.1f px lang -> echte %.1f m' % (lw, LAENGE_M))
# Spielpixel je Bildpunkt: 7,9 m * 8 px/m / Bildlänge der Wanne ohne Rand
lang_ohne_rand = (bw[2] - bw[0] - 2 * R) * F
skala = LAENGE_M * 8 / lang_ohne_rand
print('skala (Spielpixel je Bildpunkt): %.4f' % skala)
print('turmX (vorn, Spielpixel): %.2f  turmY: %.2f' % ((px_ - mx) * F * skala, (pz_ - my) * F * skala))
print('turmOx %.4f turmOy %.4f (Drehpunkt im Turmbild, Anteile)' % ((px_ - bt[0]) / (bt[2] - bt[0]), (pz_ - bt[1]) / (bt[3] - bt[1])))
print('muendung (Spielpixel vor dem Drehpunkt): %.2f' % (muend * F * skala))
print('laenge %.1f breite %.1f' % (LAENGE_M * 8, (bw[3] - bw[1] - 2 * R) * F * skala))
breite_bild = (bw[3] - bw[1] - 2 * R) * F * skala
print('skalaQuer (Querstreckung auf %.1f px Breite): %.4f' % (BREITE_PX, BREITE_PX / breite_bild * skala))
