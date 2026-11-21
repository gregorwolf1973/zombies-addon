#!/usr/bin/env python3
"""Misst die sichtbare Schulterbreite aller Figuren und schreibt client/groessen.mjs.

Aufruf (aus zombies/):  PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/groessen_messen.py [--tabelle]

Alle Figuren blicken im Bogen nach rechts: Höhe der sichtbaren Rahmenbox (Alpha > 40) = Schulterbreite,
Breite = Länge inkl. Waffe/Arme. Bezug ist der Survivor (bleibt unverändert, Faktor 1):
  alle Menschen (Spieler m/w/s/Held/Heldin, Bewohner, Soldaten, Ärzte, Verwundete) = Schulterbreite des Survivors
  lebende Zombies     = 1,0 × Menschen (Zombiegröße 100 % = gleich breit)
  Leichen             = Körperlänge (Kopf–Fuß, ohne Blutlache) 1,9 × Zombie-Schulterbreite
Der Faktor wird im Spiel (spiel.mjs) und in der Vorschau (verwaltung.html) zusätzlich zum bisherigen
Maßstab und zu den Reglern (menschenGroesse, zombieGroesse, groesseGesamt) eingerechnet. Kollisionen/Spiellogik bleiben unberührt.
"""
import json, os, statistics as st, sys
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
GRAFIK = os.path.join(HIER, '..', 'client', 'grafik')
AUS = os.path.join(HIER, '..', 'client', 'groessen.mjs')
BOEGEN = {'figuren': 'figuren.png', 'figuren2': 'figuren2.webp', 'figuren3': 'figuren3.webp', 'helden160': 'helden160.webp', 'buerger160': 'buerger160.webp'}
M_ALT, M_B2 = 0.42, 0.476            # bisherige Grundmaßstäbe (wie spiel.mjs)
ZOMBIE_FAKTOR, LEICHE_FAKTOR = 1.0, 1.9      # Zombie 100 % = gleich breit wie die Menschen

_cache = {}
def bogen(b):
    if b not in _cache:
        im = Image.open(os.path.join(GRAFIK, BOEGEN[b])).convert('RGBA')
        l = json.load(open(os.path.join(GRAFIK, b + '.json')))
        _cache[b] = (im, l['feld'], l.get('bilder', l))
    return _cache[b]

def felder(b, name):
    im, f, bl = bogen(b)
    sp = im.width // f
    for nr in bl[name]:
        yield im.crop(((nr % sp) * f, (nr // sp) * f, (nr % sp) * f + f, (nr // sp) * f + f))

def box(c):
    return c.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()

def hoehe(b, namen):
    """Median der Rahmenbox-Höhe (Schulterbreite) über alle Bilder der Namen, in Bildpixeln."""
    hs = []
    for n in namen:
        for c in felder(b, n):
            bb = box(c)
            if bb: hs.append(bb[3] - bb[1])
    return st.median(hs)

def koerperlaenge(b, name):
    """Länge der liegenden Figur (Kopf nach links) ohne Blutlache: Breite der Rahmenbox ohne rote Pixel."""
    c = next(felder(b, name))
    px = c.load(); w, h = c.size
    spalten = set()
    for y in range(h):
        for x in range(w):
            r, g, bl, a = px[x, y]
            if a > 40 and not (r > 1.45 * g and r > 1.45 * bl and r > 60 and g < 90):
                spalten.add(x)
    return max(spalten) - min(spalten) + 1

def main():
    ref_h = hoehe('figuren2', ['sv_pistole_idle'])
    ref = ref_h * M_B2                 # Survivor-Schulterbreite in Spielpixeln
    ziel_m, ziel_z, ziel_l = ref, ref * ZOMBIE_FAKTOR, ref * ZOMBIE_FAKTOR * LEICHE_FAKTOR
    # (Schlüsselnamen, Bogen, Bilder zur Messung, bisheriger Maßstab im Spiel, Ziel)
    gruppen = []
    gruppen.append((['figuren2:' + n for n in ('sv_pistole_idle',)], 'figuren2', ['sv_pistole_idle'], M_B2, None))   # Survivor = Bezug
    for g in ('mann', 'frau'):
        # Messbild = Grundhaltung ohne Waffe (hand); die Waffenbilder bekommen denselben Faktor
        gruppen.append((['figuren:%s_%s' % (g, w) for w in ('hand', 'pistole', 'schlaeger', 'messer')], 'figuren',
                        ['%s_hand' % g], M_ALT, ziel_m))
    gruppen.append((['figuren2:buerger1', 'figuren2:buerger2', 'figuren2:buerger3', 'figuren2:polizist', 'figuren2:arzt'], 'figuren2',
                    ['buerger1', 'buerger2', 'buerger3', 'polizist', 'arzt'], M_B2 * 0.95, ziel_m))
    gruppen.append((['figuren2:soldat_idle', 'figuren2:soldat_schuss'], 'figuren2', ['soldat_idle', 'soldat_schuss'], M_B2, ziel_m))
    gruppen.append((['figuren2:verwundet'], 'figuren2', ['verwundet'], M_ALT * 1.26, ziel_m))   # Verwundete im Lager (liegend, wie im Spiel 0,42 × 1,26)
    # Bewohner-Typen (buerger160, Standbilder): jeder Typ auf die Schulterbreite des Survivors, nur der dicke Mann bekommt den
    # mittleren Faktor der anderen (Ausgleich auf Körpermitte) und bleibt dadurch sichtbar breiter
    alle_bt = list(bogen('buerger160')[2])
    bt = [n for n in alle_bt if n != 'dick' and not n.endswith('_versteckt')]
    fb = [ziel_m / (hoehe('buerger160', [n]) * M_ALT) for n in bt]
    for n in bt: gruppen.append((['buerger160:' + n], 'buerger160', [n], M_ALT, ziel_m))
    gruppen.append((['buerger160:dick'], 'buerger160', ['dick'], M_ALT, hoehe('buerger160', ['dick']) * M_ALT * st.median(fb) * 1.15))   # +15 % zusätzlich: sichtbar dicker
    # Geduckte Bilder (Schlüssel <typ>_versteckt): wie die Normalbilder gemessen, aber ruhig 15 % kleiner (zusammengekauert)
    GEDUCKT = 0.85
    for n in bt: gruppen.append((['buerger160:' + n + '_versteckt'], 'buerger160', [n + '_versteckt'], M_ALT, ziel_m * GEDUCKT)) if n + '_versteckt' in alle_bt else None
    if 'dick_versteckt' in alle_bt:
        gruppen.append((['buerger160:dick_versteckt'], 'buerger160', ['dick_versteckt'], M_ALT, hoehe('buerger160', ['dick']) * M_ALT * st.median(fb) * 1.15 * GEDUCKT))
    HALT = ['leer', 'pistole', 'gewehr', 'messer', 'lampe', 'pistole_lampe', 'gewehr_lampe', 'messer_lampe',
            'schrotflinte', 'mp', 'mg', 'armbrust', 'scharfschuetze', 'granatwerfer', 'sense', 'schlaeger', 'handgranate', 'faust']
    HELDIN = 0.86        # Heldin ist absichtlich schlanker (Bild quer um 0,86 gestaucht): gleicher Maßstab wie der Held, nicht auf Survivor-Breite aufgeblasen
    for g in ('m', 'w'):   # Held/Heldin (helden160): Stiefel-Ebenen bekommen denselben Faktor wie der Körper
        koerper = ['held_%s_%s' % (g, h) for h in HALT]
        stiefel = ['held_%s_stiefel_%s' % (g, a) for a in ('stehen', 'gehen', 'laufen')]
        gruppen.append((['helden160:' + n for n in koerper + stiefel], 'helden160', koerper[:1], M_ALT, ziel_m * (HELDIN if g == 'w' else 1)))   # Messbild = held_<g>_leer
    for t in ('tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose'):
        namen = ['zombie_' + t]
        schl = ['figuren:zombie_' + t]
        try: bogen('figuren')[2]['zombie_' + t + '_angriff']; schl.append('figuren:zombie_' + t + '_angriff')   # Angriffsbild: gleicher Faktor
        except KeyError: pass
        gruppen.append((schl, 'figuren', namen, M_ALT, ziel_z))
    # Kriecher: a/b zeigen die Schultern (Höhe ~70 px), c/d sind flacher geduckt – c/d bekommen denselben Faktor wie a/b
    gruppen.append((['figuren:kriecher_a', 'figuren:kriecher_b', 'figuren:kriecher_c', 'figuren:kriecher_d'], 'figuren', ['kriecher_a', 'kriecher_b'], M_ALT, ziel_z))
    for t in ('z6', 'z7'):
        n = [t + '_laufen', t + '_angriff', t + '_stehen']
        gruppen.append((['figuren2:' + x for x in n], 'figuren2', n, M_B2, ziel_z))
    for n in list(bogen('figuren3')[2]):
        if not n.startswith('leiche_'):
            gruppen.append((['figuren3:' + n], 'figuren3', [n], M_ALT, ziel_z))
    faktoren, tabelle = {}, []
    for schl, b, namen, m, ziel in gruppen:
        h = hoehe(b, namen)
        alt = h * m
        f = 1.0 if ziel is None else ziel / alt
        for s in schl: faktoren[s] = round(f, 3)
        tabelle.append((schl[0] if len(schl) == 1 else schl[0].split(':')[0] + ':' + os.path.commonprefix([s.split(':')[1] for s in schl]) + '*', alt, alt * faktoren[schl[0]], faktoren[schl[0]]))
    # Leichen: Körperlänge
    lt = []
    for b in ('figuren', 'figuren3'):
        for n in bogen(b)[2]:
            if n.startswith('leiche_'):
                alt = koerperlaenge(b, n) * M_ALT
                f = round(ziel_l / alt, 3)
                faktoren['%s:%s' % (b, n)] = f
                lt.append(('%s:%s' % (b, n), alt, alt * f, f))
    with open(AUS, 'w') as fh:
        fh.write('// ERZEUGT von tools/groessen_messen.py – nicht von Hand ändern.\n')
        fh.write('// Ausgleichsfaktor je Bild („<bogen>:<bild>“) relativ zum bisherigen Maßstab (0,42 bzw. 0,476):\n')
        fh.write('// Menschen = Schulterbreite des Survivors (%.1f px), Zombies ×%.1f (%.1f px), Leichen-Körperlänge ×%.1f (%.1f px).\n' % (ref, ZOMBIE_FAKTOR, ziel_z, LEICHE_FAKTOR, ziel_l))
        fh.write('export const GROESSE = {\n')
        for k in sorted(faktoren): fh.write("  '%s': %s,\n" % (k, faktoren[k]))
        fh.write('};\n')
        fh.write('export const groesse = (bogen, bild) => GROESSE[bogen + \':\' + bild] ?? 1;\n')
    print('Survivor-Schulterbreite %.1f px; Ziel Mensch %.1f / Zombie %.1f / Leiche-Länge %.1f' % (ref, ziel_m, ziel_z, ziel_l))
    for t in tabelle + lt:
        print('%-36s alt %5.1f  neu %5.1f  Faktor %.3f' % t)

main()
