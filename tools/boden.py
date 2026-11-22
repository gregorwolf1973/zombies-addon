#!/usr/bin/env python3
"""Kulisse „Gezeichneter Boden“: stilisierter, ruhiger Boden aus amtlichen Nutzungsflächen (reine Optik, die Spielwelt bleibt gleich).
Quellen (Bayerische Vermessungsverwaltung, CC BY 4.0, https://geodaten.bayern.de/opengeodata/):
  ALKIS Tatsächliche Nutzung (Shapefile, tools/luftbild/cache/bayern/tn/shp/Nutzung.*): Flächenart (nutzart, bez) → Grundmaterial
  Zwischendaten aus dem 20-cm-Luftbild (tools/luftbild/cache/bayern/auswertung/_npy: rgb, ndvi, ndom, asphalt, haus; 0,2 m): innerhalb der Flächen
  Rasen / Gebüsch / Baumfläche / Asphalt / Pflaster / Kies unterscheiden. Nur die Klasse wird übernommen, nie Foto-Pixel.
Aufruf: python3 tools/boden.py <karte>                  alle Kacheln (geretsried2)
        python3 tools/boden.py <karte> --kachel kx ky   nur eine Kachel (zum Prüfen; mit --vorschau PNG neben das Luftbild legen)
Ergebnis in zombies/client/karten/kulisse/<karte>/boden/: <kx>_<ky>.webp + index.json
  gleiche Aufteilung und Projektion wie tools/kulisse.py (128 m × 128 m = 512 px, Kachel (kx, ky) beginnt bei Spielkachel (kx*32, ky*32)),
  Klassen als weiche Masken (Antialiasing, nie treppig), Textur aus Weltkoordinaten (keine Nähte zwischen Kacheln).
Straßen und Wasser zeichnet das Spiel weiter selbst darüber (aussehen.mjs → zeichneStrassen/zeichneWasser); der Boden liefert Gehweg, Randstreifen, Grundstücke."""
import io, json, math, os, pathlib, struct, sys
for p in ("/home/gregor/code/zombies-addon/tools/.pylib", str(pathlib.Path(__file__).resolve().parent / ".pylib"), os.path.expanduser("~/code/ahnen-werkzeuge/pil")):
    if os.path.isdir(p): sys.path.insert(0, p)
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kulisse import Karte, KARTEN, KACHEL_KK, PX, PPK, index_schreiben
RAND = 40                   # Rand beim Rechnen (Median, Ausrundung der Straßenecken), wird abgeschnitten; größer als in kulisse.py, damit Kacheln nahtlos bleiben

WURZEL = pathlib.Path(__file__).resolve().parent
LB = WURZEL / "luftbild" / "cache" / "bayern"
NPY = LB / "auswertung" / "_npy"
SHP = LB / "tn" / "shp" / "Nutzung"
QUELLE = ("© Bayerische Vermessungsverwaltung, ALKIS Tatsächliche Nutzung und Digitales Orthophoto (nur als Klassifizierung ausgewertet; gezeichneter Boden) (CC BY 4.0)")
QUALITAET = 80
SS = 2                      # Überabtastung der Flächenkarte (Antialiasing)
X0, Y1, RES = 683670.0, 5306840.0, 0.2     # Raster der Zwischendaten (UTM32)

# ---------- Flächenarten ----------
Z = {n: i + 1 for i, n in enumerate("grund gewerbe strasse weg platz parkplatz gruen acker spiel sport wald gehoelz unland fliess steh bahn".split())}
def zone(nutzart, bez):
    if nutzart in ("Wohnbaufläche", "Fläche gemischter Nutzung", "Fläche besonderer funktionaler Prägung"):
        return Z["gewerbe"] if bez in ("Landwirtschaftliche Betriebsfläche",) else Z["grund"]
    if nutzart == "Industrie- und Gewerbefläche": return Z["gewerbe"]
    if nutzart == "Straßenverkehr": return Z["platz"] if bez == "Fußgängerzone" else Z["strasse"]
    if nutzart == "Weg": return Z["weg"]
    if nutzart == "Platz": return Z["parkplatz"] if bez in ("Parkplatz", "Rastplatz") else Z["platz"]
    if nutzart == "Landwirtschaft": return Z["acker"] if bez == "Ackerland" else Z["gruen"]
    if nutzart.startswith("Sport"):
        return Z["sport"] if bez in ("Sportanlage", "Freizeitanlage") else Z["spiel"] if bez.startswith("Spielplatz") else Z["gruen"]
    if nutzart == "Wald": return Z["wald"]
    if nutzart == "Gehölz": return Z["gehoelz"]
    if nutzart.startswith("Unland"): return Z["unland"]
    if nutzart == "Fließgewässer": return Z["fliess"]
    if nutzart == "Stehendes Gewässer": return Z["steh"]
    if nutzart == "Bahnverkehr": return Z["bahn"]
    return 0

def shp_lesen(pfad, bbox):
    """[(bbox, [Ringe als (n,2)-Arrays], attrs)] im bbox (Polygon-Shapefile + dbf, nur Standardbibliothek + numpy)"""
    shp = open(str(pfad) + ".shp", "rb").read(); dbf = open(str(pfad) + ".dbf", "rb").read()
    nrec, hl, rl = struct.unpack("<IHH", dbf[4:12]); felder = []; o = 32
    while dbf[o] != 0x0D: felder.append((dbf[o:o + 11].split(b"\0")[0].decode(), dbf[o + 16])); o += 32
    erg = []; p = 100; i = 0
    while p < len(shp):
        cl = struct.unpack(">2i", shp[p:p + 8])[1] * 2; rec = shp[p + 8:p + 8 + cl]; p += 8 + cl
        if struct.unpack("<i", rec[:4])[0] == 5:
            bb = struct.unpack("<4d", rec[4:36])
            if not (bb[2] < bbox[0] or bb[0] > bbox[2] or bb[3] < bbox[1] or bb[1] > bbox[3]):
                npart, npt = struct.unpack("<2i", rec[36:44])
                teile = list(struct.unpack("<%di" % npart, rec[44:44 + 4 * npart])) + [npt]
                pts = np.frombuffer(rec, "<f8", npt * 2, 44 + 4 * npart).reshape(-1, 2)
                r = dbf[hl + i * rl + 1:hl + (i + 1) * rl]; a = {}; q = 0
                for nm, ln in felder: a[nm] = r[q:q + ln].decode("utf8", "replace").strip(); q += ln
                erg.append((bb, [pts[teile[k]:teile[k + 1]] for k in range(npart)], a))
        i += 1
    return erg

# ---------- Rauschen aus Weltkoordinaten (Meter) ----------
def _hash(ix, iy, s=0):
    h = (ix.astype(np.int64) * 73856093 ^ iy.astype(np.int64) * 19349663 ^ (s * 83492791 + 12345)) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0xFFFFFFFF
    return h / 4294967295.0

def wert(E, N, skala, s=0):
    """weiches Wertrauschen, eine Zelle = skala Meter"""
    x, y = E / skala, N / skala; xi, yi = np.floor(x), np.floor(y); xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b, c, d = _hash(xi, yi, s), _hash(xi + 1, yi, s), _hash(xi, yi + 1, s), _hash(xi + 1, yi + 1, s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

def korn(E, N, zelle, s=0):
    """Pixelkorn: je Zelle (Meter) ein Zufallswert, ohne Glättung"""
    return _hash(np.floor(E / zelle), np.floor(N / zelle), s)

# ---------- Farben (an aussehen.mjs / vektor.mjs angelehnt) ----------
def hexf(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)
F = {k: hexf(v) for k, v in dict(
    rasen="#4d8c3b", rasen_hell="#6aa44a", rasen_dunkel="#3b7a33", gepflegt="#5d9b44", gebuesch="#3a7030", baum="#3f7634", waldboden="#3d6b2f", wald_dunkel="#2f5a28",
    trocken="#8a9a52", acker="#8a7a4e", asphalt="#5e5e5d", gehweg="#c9c3b6", pflaster="#bfb39a", ziegel="#b58a73", kies="#c0b290", beton="#b4b1a8",
    sand="#ddc995", sport="#5a9c45", tartan="#a95a43", wasser="#2a7098", wasser_tief="#1f5c85", ufer="#d3bf8a", schotter="#8f8a82", haus="#8e887d").items()}

# ---------- Rasterdaten (0,2 m) auf das Kachelfenster abbilden ----------
class Daten:
    def __init__(self):
        self.rgb = np.load(NPY / "rgb.npy", mmap_mode="r"); self.ndvi = np.load(NPY / "ndvi.npy", mmap_mode="r"); self.ndom = np.load(NPY / "ndom.npy", mmap_mode="r")
        self.asph = np.load(NPY / "asphalt.npy", mmap_mode="r"); self.haus = np.load(NPY / "haus.npy", mmap_mode="r")
        self.H, self.W = self.ndvi.shape
    def probe(self, E, N):
        """liefert dict float32-Felder im Format von E (Fenster); außerhalb des Rasters: None"""
        c = (E - X0) / RES - 0.5; r = (Y1 - N) / RES - 0.5
        c0, c1, r0, r1 = int(c.min()) - 2, int(c.max()) + 3, int(r.min()) - 2, int(r.max()) + 3
        if c0 < 0 or r0 < 0 or c1 > self.W or r1 > self.H: return None
        co = np.array([r - r0, c - c0])
        f = lambda a: ndi.map_coordinates(np.asarray(a[r0:r1, c0:c1], dtype=np.float32), co, order=1, mode="nearest")
        return {"rgb": np.stack([f(self.rgb[..., k]) if False else ndi.map_coordinates(np.asarray(self.rgb[r0:r1, c0:c1, k], dtype=np.float32), co, order=1, mode="nearest") for k in range(3)], -1),
                "ndvi": f(self.ndvi), "ndom": f(self.ndom), "asph": f(self.asph), "haus": f(self.haus)}

def glatt(a, s): return ndi.gaussian_filter(a, s, mode="nearest")
def klar(a, lo, hi): return np.clip((a - lo) / (hi - lo), 0, 1)

def kante(m, E, N, s, r_px=0, stark=1.0, sperre=None, zone=None):
    """Straßen-/Wegmasken: Ecken ausrunden (Schließen mit Radius r_px, nur in `zone`, nie über `sperre`) und die Kanten
    leicht verwischen: niederfrequente Abweichung ±0,2–0,3 m (Wellenlänge ~9 m) plus feine Ausfransung, weicher Rand ~0,4 m (Antialiasing, nie treppig)."""
    out = m
    if r_px > 0:
        b = m > 0.5
        dil = ndi.distance_transform_edt(~b) <= r_px
        zu = ndi.distance_transform_edt(dil) > r_px              # Schließen = Dilatation, dann Erosion: füllt nur konkave Ecken
        zusatz = (zu & ~b).astype(np.float32)
        if sperre is not None: zusatz *= (sperre < 0.5)
        if zone is not None: zusatz *= zone
        out = np.maximum(m, glatt(zusatz, 1.2))
    mb = glatt(out, 1.4)
    nz = (wert(E, N, 9.0, s) - 0.5) * 2 * 0.27 + (wert(E, N, 1.3, s + 1) - 0.5) * 2 * 0.10
    return klar(mb, 0.3 + nz * stark, 0.7 + nz * stark)

class Welt:
    def __init__(self, karte):
        self.karte = karte; self.K = Karte(karte)
        self.daten = Daten() if (NPY / "ndvi.npy").exists() else None
        zone_bb = (683500, 5304700, 685500, 5307000)
        polys = shp_lesen(SHP, zone_bb); self.polys = []
        for bb, ringe, a in polys:
            z = zone(a["nutzart"], a["bez"])
            if not z: continue
            flaeche = (bb[2] - bb[0]) * (bb[3] - bb[1])
            self.polys.append((flaeche, z, ringe, bb))
        self.polys.sort(key=lambda p: -p[0])   # große zuerst, kleine (Inseln, Wege in Flächen) darüber
        print(f"Nutzungsflächen: {len(self.polys)}", flush=True)

    def fenster(self, kx, ky):
        K = self.K; r = RAND / PPK; ax, ay = kx * KACHEL_KK - r, ky * KACHEL_KK - r; W = PX + 2 * RAND
        e0, n0 = K.utm(ax, ay); e1, n1 = K.utm(ax + W / PPK, ay); e2, n2 = K.utm(ax, ay + W / PPK)
        u = (np.arange(W) + 0.5) / W
        E = e0 + (e1 - e0) * u[None, :] + (e2 - e0) * u[:, None]; N = n0 + (n1 - n0) * u[None, :] + (n2 - n0) * u[:, None]
        return W, E, N, (e0, n0, e1, n1, e2, n2)

    def zonen(self, W, geo):
        """Flächenarten als weiche Masken je Art (Überabtastung SS → Mittel); gibt {art: float32 (W,W)}"""
        e0, n0, e1, n1, e2, n2 = geo; S = W * SS
        # UTM → Pixel (affin, Umkehr der Fensterabbildung)
        a = np.array([[(e1 - e0) / S, (e2 - e0) / S], [(n1 - n0) / S, (n2 - n0) / S]]); ai = np.linalg.inv(a)
        lab = Image.new("L", (S, S), 0); dr = ImageDraw.Draw(lab)
        xs = [e0, e1, e2, e1 + e2 - e0]; ys = [n0, n1, n2, n1 + n2 - n0]
        for _, z, ringe, bb in self.polys:
            if bb[2] < min(xs) or bb[0] > max(xs) or bb[3] < min(ys) or bb[1] > max(ys): continue
            for ring in ringe:
                # Löcher (gegen den Uhrzeigersinn) überspringen: Inseln liegen als eigene, kleinere Fläche darüber
                x, y = ring[:, 0], ring[:, 1]
                if 0.5 * np.sum(x[:-1] * y[1:] - x[1:] * y[:-1]) > 0: continue
                p = (ai @ np.stack([x - e0, y - n0])).T
                dr.polygon([tuple(q) for q in p.tolist()], fill=z)
        L = np.asarray(lab)
        out = {}
        for nm, z in Z.items():
            m = (L == z)
            if m.any(): out[nm] = m.reshape(W, SS, W, SS).mean((1, 3)).astype(np.float32)
        return out

def rendern(welt, kx, ky):
    W, E, N, geo = welt.fenster(kx, ky)
    Zn = welt.zonen(W, geo); d = welt.daten.probe(E, N) if welt.daten else None
    z = lambda *n: sum((Zn[k] for k in n if k in Zn), np.zeros((W, W), np.float32))
    rest = np.clip(1 - z(*Z), 0, 1)           # keine Fläche → Rasen
    if d is not None:
        # Farbmerkmale vorab glätten (Autos, Dachfenster, Schatten kantenfrei): Median gegen Ausreißer, dann Gauß
        rgb = np.stack([glatt(ndi.median_filter(d["rgb"][..., k], size=7), 1.2) for k in range(3)], -1); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        nd = glatt(ndi.median_filter(d["ndvi"], size=7), 1.0)
        gruen = klar(nd, 128, 144) * 0.5 + klar((g - r) / (g + r + 1), 0.015, 0.1) * klar((g - b) / (g + b + 1), -0.02, 0.08) * 0.5
        gruen = glatt(ndi.median_filter(np.clip(gruen * 1.3, 0, 1), size=7), 1.2)
        nm = glatt(ndi.median_filter(d["ndom"], size=5), 1.0)
        hoch = klar(nm, 1.0, 3.0) * gruen                              # Baum-/Gebüschfläche
        baum = klar(nm, 2.5, 6.0) * gruen
        asph = glatt(ndi.median_filter(d["asph"], size=7), 1.2)
        # Gebäude: amtlicher Umriss, zusätzlich hohe nicht grüne Flächen (neuere Bauten, die noch nicht in den Hausumringen stehen)
        haus = np.maximum(glatt(d["haus"], 0.8), glatt(ndi.median_filter((nm > 2.5).astype(np.float32) * (1 - np.round(gruen)), size=7), 1.0))
        rot = klar(r - g, 8, 22) * klar(r - b, 10, 40)               # Ziegel/Terrassenplatten
        warm = klar(r - b, 30, 55) * (1 - rot) * klar(lum, 95, 135)  # Kies, Sandwege
        hell = klar(lum, 115, 155)
        hell_g = glatt(ndi.median_filter(hell, size=17), 2.0)       # nur große helle Flächen (Gehweg), keine Autos
    else:
        gruen = np.ones((W, W), np.float32); hoch = baum = asph = haus = rot = warm = hell = hell_g = np.zeros((W, W), np.float32)
    # Straßen und Wege: Ecken ausrunden (Straße ~4 m, Weg ~2,5 m), Kanten dezent verwischen/ausfransen; Fläche nehmen/geben die übrigen Arten
    def abgeben(nm, neu):
        gew = np.clip(neu - Zn[nm], 0, 1)
        for k in Zn:
            if k != nm: Zn[k] = Zn[k] * (1 - gew)
        Zn[nm] = neu
    strasse0 = Zn.get("strasse")
    if "strasse" in Zn: abgeben("strasse", kante(Zn["strasse"], E, N, 41, 0, 0.8))
    if "weg" in Zn: abgeben("weg", kante(Zn["weg"], E, N, 45, 10, 1.2, sperre=haus))
    if d is not None:
        zone = np.zeros((W, W), np.float32) if strasse0 is None else (ndi.distance_transform_edt(~(strasse0 > 0.3)) <= 6).astype(np.float32)
        asph = kante(asph, E, N, 43, 14, 1.0, sperre=haus, zone=zone)
    rest = np.clip(1 - z(*Z), 0, 1)
    # Maßstabsfreies Rauschen (Meter-Koordinaten)
    wolke = wert(E, N, 11.0, 1) * 0.55 + wert(E, N, 3.2, 2) * 0.3 + wert(E, N, 1.1, 3) * 0.15
    korn1, korn2 = korn(E, N, 0.25, 4), korn(E, N, 0.5, 5)
    def moduliere(c, wolkenstaerke, kornstaerke, helle=0.0):
        f = 1 + (wolke - 0.5) * wolkenstaerke * 0.65 + (korn1 - 0.5) * kornstaerke * 0.7 + helle
        return c[None, None, :] * f[..., None]
    # Rasen: Wolken wie in aussehen.mjs (hell/dunkel), feines Korn, selten Gräsertupfen
    wiese = moduliere(F["rasen"], 0.55, 0.10)
    tupf = klar(wert(E, N, 0.9, 6), 0.72, 0.85)[..., None] * 0.07
    wiese = wiese * (1 - tupf) + F["rasen_dunkel"][None, None] * tupf
    garten = klar(wert(E, N, 40.0, 9), 0.35, 0.6)[..., None] * 0.12
    rasen = wiese * (1 - garten) + F["gepflegt"][None, None] * garten
    gebuesch = moduliere(F["gebuesch"], 0.5, 0.22)
    baumb = moduliere(F["baum"], 0.45, 0.2)
    wald = moduliere(F["waldboden"], 0.7, 0.30)
    wald = wald * (1 - klar(wert(E, N, 1.6, 7), 0.62, 0.8)[..., None] * 0.25) + F["wald_dunkel"][None, None] * klar(wert(E, N, 1.6, 7), 0.62, 0.8)[..., None] * 0.25
    gruen_mat = rasen * (1 - hoch[..., None] * 0.7) + (gebuesch * (1 - baum[..., None]) + baumb * baum[..., None]) * hoch[..., None] * 0.7
    # Asphalt wie echt: warmes Anthrazit (Alter 0,92…1,08), Splitt in zwei Körnungen mit hellen/dunklen Körnern, Flickstellen, vereinzelte Risse
    alter = 0.92 + wert(E, N, 35.0, 21) * 0.16
    flick = klar(wert(E, N, 7.0, 22) * 0.6 + wert(E, N, 2.4, 23) * 0.4, 0.60, 0.64)           # weiche Kante, kein Treppeneffekt
    flick_hell = klar(wert(E, N, 23.0, 24), 0.48, 0.52)
    risse_wo = klar(wert(E, N, 15.0, 26), 0.66, 0.72)
    riss = (1 - klar(np.abs(wert(E, N, 3.3, 25) - 0.5), 0.0, 0.022)) * risse_wo
    k1 = korn(E, N, 0.25, 31); k2 = wert(E, N, 0.7, 32); k3 = korn(E, N, 0.25, 33)
    splitt = (k1 - 0.5) * 0.12 + (k2 - 0.5) * 0.08 + (k3 > 0.965) * 0.16 - (k3 < 0.04) * 0.14
    af = alter * (1 + (wolke - 0.5) * 0.10) * (1 - flick * (1 - flick_hell) * 0.10 + flick * flick_hell * 0.06) * (1 - riss * 0.18) + splitt
    asphalt = F["asphalt"][None, None, :] * (np.stack([af * 1.01, af, af * 0.985], -1))
    kies = moduliere(F["kies"], 0.18, 0.16)
    pflaster = moduliere(F["pflaster"], 0.10, 0.07)
    gehweg = moduliere(F["gehweg"], 0.08, 0.06)
    beton = moduliere(F["beton"], 0.08, 0.06)
    ziegel = moduliere(F["ziegel"], 0.1, 0.07)
    sand = moduliere(F["sand"], 0.12, 0.10)
    sport = moduliere(F["sport"], 0.35, 0.06)
    tartan = moduliere(F["tartan"], 0.1, 0.08)
    acker = moduliere(F["acker"], 0.30, 0.12)
    streifen = (0.5 + 0.5 * np.sin((E * 0.8 + N * 0.6) * 2 * math.pi / 2.6))[..., None] * 0.14   # Ackerfurchen
    acker = acker * (1 - streifen)
    trocken = moduliere(F["trocken"], 0.5, 0.2)
    schotter = moduliere(F["schotter"], 0.2, 0.32)
    haus_m = moduliere(F["haus"], 0.06, 0.05)
    # harter Belag je Fläche (Spielraum: Asphalt aus dem Luftbild, sonst nach Farbe)
    farbe_hart = kies * warm[..., None] + ziegel * rot[..., None] * (1 - warm[..., None])
    grau = np.clip(1 - warm - rot, 0, 1)[..., None]
    def hart(basis_hell, basis_dunkel):
        """Belag nach Helligkeit: helle graue Fläche → basis_hell (Gehweg/Beton), dunkle → basis_dunkel (Asphalt)"""
        h = hell[..., None]
        return (basis_hell * h + basis_dunkel * (1 - h)) * grau + farbe_hart
    a3 = asph[..., None]
    # je Fläche: grünes und hartes Material; Asphalt aus dem Luftbild gilt überall
    def fl(gr, ha):
        g = gruen[..., None]
        m = gr * g + ha * (1 - g)
        return m * (1 - a3) + asphalt * a3
    mat = {
        "grund": fl(gruen_mat, hart(pflaster, asphalt)),
        "gewerbe": fl(gruen_mat, hart(beton, asphalt)),
        "strasse": fl(gruen_mat, asphalt * (1 - klar(hell_g, 0.5, 0.9)[..., None] * grau) + gehweg * klar(hell_g, 0.5, 0.9)[..., None] * grau + farbe_hart),
        "weg": fl(gruen_mat, kies),
        "platz": fl(gruen_mat, pflaster),
        "parkplatz": fl(gruen_mat, asphalt),
        "gruen": fl(gruen_mat, kies),
        "acker": fl(gruen_mat, acker),
        "spiel": fl(gruen_mat, sand),
        "sport": fl(sport, tartan),
        "wald": wald * (1 - gruen[..., None] * hoch[..., None] * 0.3) + baumb * gruen[..., None] * hoch[..., None] * 0.3,
        "gehoelz": wald * 0.5 + gruen_mat * 0.5,
        "unland": fl(rasen * 0.65 + trocken * 0.35, kies),
        "bahn": fl(gruen_mat, schotter),
    }
    # Wasser: Flächen-Maske, Ufer als Kiesband außen, Tiefe zur Mitte
    wasser = z("fliess", "steh")
    tief = np.clip(glatt(wasser, 6) * 1.4 - 0.3, 0, 1)[..., None]
    wcol = moduliere(F["wasser"], 0.10, 0.04) * (1 - tief) + moduliere(F["wasser_tief"], 0.08, 0.03) * tief
    rip = klar(wert(E * 1.0, N * 0.35, 0.8, 11), 0.62, 0.8)[..., None] * 0.18
    wcol = wcol * (1 - rip) + 255 * rip * 0.9
    ufer = np.clip(glatt(wasser, 1.8) - wasser, 0, 1)[..., None]    # nur außen
    # Zusammensetzen: Σ Fläche_k · Material_k (unbedeckte Reste = Rasen)
    wsum = np.zeros((W, W), np.float32); acc = np.zeros((W, W, 3), np.float32)
    for nm, m in mat.items():
        w = z(nm)
        if not w.any(): continue
        acc += w[..., None] * m; wsum += w
    acc += wasser[..., None] * wcol; wsum += wasser
    acc += rest[..., None] * rasen; wsum += rest
    acc /= np.maximum(wsum, 1e-3)[..., None]
    acc = acc * (1 - ufer * 0.85) + ufer * 0.85 * moduliere(F["ufer"], 0.15, 0.2)
    # unter Gebäuden: neutraler Grund (die Dächer liegen darüber; so schimmert bei kleinen Abweichungen kein Rasen durch)
    hm = np.clip(haus * 1.0, 0, 1)[..., None]
    acc = acc * (1 - hm) + haus_m * hm
    img = Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).crop((RAND, RAND, RAND + PX, RAND + PX))
    return img

def kacheln_alle(karte, nur=None, vorschau=False):
    welt = Welt(karte); B, H = karte["breite"], karte["hoehe"]
    nx, ny = math.ceil(B / KACHEL_KK), math.ceil(H / KACHEL_KK)
    ziel = KARTEN / "kulisse" / sys.argv[1] / "boden"; ziel.mkdir(parents=True, exist_ok=True); summe = 0; n = 0
    for ky in range(ny):
        for kx in range(nx):
            if nur and (kx, ky) != nur: continue
            img = rendern(welt, kx, ky)
            pu = io.BytesIO(); img.save(pu, "WEBP", quality=QUALITAET, method=6)
            (ziel / f"{kx}_{ky}.webp").write_bytes(pu.getvalue()); summe += pu.tell(); n += 1
            if vorschau:
                alt = KARTEN / "kulisse" / sys.argv[1] / f"{kx}_{ky}.webp"
                v = Image.new("RGB", (PX * 2, PX)); v.paste(Image.open(alt).convert("RGB"), (0, 0)); v.paste(img, (PX, 0))
                v.save(vorschau); print("Vorschau", vorschau, f"{pu.tell() // 1024} KB")
        if not nur: print(f"Reihe {ky + 1}/{ny}, bisher {summe // 1024} KB", flush=True)
    if not nur:
        idx = {"kachel": KACHEL_KK, "px": PX, "nx": nx, "ny": ny, "breite": B, "hoehe": H, "meterProPixel": karte["meterProKachel"] / PPK,
               "quelle": QUELLE, "format": "webp", "foto": True, "gezeichnet": True}
        (ziel / "index.json").write_text(json.dumps(idx, indent=1, ensure_ascii=False))
        # Hinweis im Kulisse-Index (Luftbild/Dächer): Quellenzeile ergänzen, Schalter „Gezeichneter Boden“ vorhanden
        index_schreiben(KARTEN / "kulisse" / sys.argv[1], {"boden": True, "bodenQuelle": QUELLE})
        print(f"Gezeichneter Boden: {n} Bildkacheln, {summe / 1e6:.2f} MB")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    karte = json.loads((KARTEN / f"{args[0]}.json").read_text())
    nur = None; vorschau = None
    if "--kachel" in sys.argv:
        i = sys.argv.index("--kachel"); nur = (int(sys.argv[i + 1]), int(sys.argv[i + 2]))
    if "--vorschau" in sys.argv: vorschau = sys.argv[sys.argv.index("--vorschau") + 1]
    kacheln_alle(karte, nur, vorschau)

if __name__ == "__main__":
    main()
