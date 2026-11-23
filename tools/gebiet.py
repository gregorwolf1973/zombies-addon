#!/usr/bin/env python3
"""Kartenbeschreibung für die amtliche Werkzeugkette (Bayern Open Data): liest tools/karten_gebiete.json.
Die Karte wird über die Umgebungsvariable KARTE gewählt (Vorgabe geretsried2); tools/karte_bauen.py setzt sie.
Felder je Karte (UTM32 / EPSG:25832, Meter):
  bbox            [süd, west, nord, ost] WGS84 wie in der Karten-JSON
  x0, y1          Nordwestecke des Auswertungsfensters (0,2-m-Raster der Zwischendaten, a0–a8, boden.py)
  breite_m, hoehe_m  Größe des Fensters (Karte plus ca. 100 m Rand)
  daten           Unterordner unter tools/luftbild/cache/bayern für Rohdaten und Auswertung ("" = Hauptordner, so liegen die Daten von geretsried2)
  tn_bbox         Filter für die ALKIS-Nutzung (Shapefile, gemeinsam je Landkreis: tn_shp)
  parkplatz_bbox  Filter für die TN-Parkplätze (amtlich.py)
  kern            Fenster für Einzelbäume (a4)
  ref, amtlich_e0 Stützpunkt der Projektion und Rasterherkunft in amtlich.py
  haus_auszug, baeume_auszug  Auszüge (relativ zu daten); hausumringe_zip, tn_shp  gemeinsame Quellen (relativ zu cache/bayern)
Hilfsaufruf: python3 tools/gebiet.py neu <karte>   gibt einen Eintrag für karten_gebiete.json aus (aus der bbox der Karten-JSON)"""
import json, math, os, pathlib, sys

HIER = pathlib.Path(__file__).resolve().parent
BAYERN = HIER / "luftbild" / "cache" / "bayern"
KARTEN = HIER.parent / "zombies" / "client" / "karten"
RES = 0.2

def alle():
    return json.loads((HIER / "karten_gebiete.json").read_text())

class Gebiet:
    def __init__(self, name):
        d = alle()
        if name not in d: raise SystemExit(f"Karte {name!r} fehlt in tools/karten_gebiete.json")
        self.name = name; self.d = d[name]
        for k, v in self.d.items(): setattr(self, k, v)
        self.W = int(round(self.breite_m / RES)); self.H = int(round(self.hoehe_m / RES))
        self.X0 = float(self.x0); self.Y1 = float(self.y1)
        self.wurzel = BAYERN / self.daten if self.daten else BAYERN                # Rohdaten dieser Karte
        # Auswertung kann für Vergleichsläufe umgeleitet werden (AUSW_DIR), damit vorhandene Ergebnisse nicht überschrieben werden
        self.auswertung = pathlib.Path(os.environ["AUSW_DIR"]) if os.environ.get("AUSW_DIR") else self.wurzel / "auswertung"
        self.tn_pfad = BAYERN / self.tn_shp
    def kacheln_km(self):
        """alle 1-km-Kacheln (x, y = Südwestecke in km), die das Fenster berühren"""
        xs = range(int(self.X0 // 1000), int((self.X0 + self.breite_m - 1e-6) // 1000) + 1)
        n0 = self.Y1 - self.hoehe_m
        ys = range(int(n0 // 1000), int((self.Y1 - 1e-6) // 1000) + 1)
        return [(x, y) for x in xs for y in ys]
    def fenster(self): return (self.X0, self.Y1 - self.hoehe_m, self.X0 + self.breite_m, self.Y1)

def aktuell():
    return Gebiet(os.environ.get("KARTE", "geretsried2"))

def neu(name):
    sys.path.insert(0, str(HIER))
    import hausumringe as HU
    k = json.loads((KARTEN / f"{name}.json").read_text())
    s, w, n, o = k["bbox"]
    pts = [HU.utm32(la, lo) for la in (s, n) for lo in (w, o)]
    e0 = math.floor((min(p[0] for p in pts) - 100) / 10) * 10; e1 = math.ceil((max(p[0] for p in pts) + 100) / 10) * 10
    n0 = math.floor((min(p[1] for p in pts) - 100) / 10) * 10; n1 = math.ceil((max(p[1] for p in pts) + 100) / 10) * 10
    return {"bbox": k["bbox"], "meterProKachel": k["meterProKachel"], "x0": e0, "y1": n1, "breite_m": e1 - e0, "hoehe_m": n1 - n0, "daten": name,
            "tn_bbox": [e0 - 100, n0 - 100, e1 + 100, n1 + 100], "parkplatz_bbox": [e0 - 100, n0 - 100, e1 + 100, n1 + 100],
            "kern": [e0 + 7, n0 + 6, e1 - 3, n1 - 5], "ref": [round((e0 + e1) / 2, -2), round((n0 + n1) / 2, -2)], "amtlich_e0": e0,
            "tn_shp": "tn/shp/Nutzung", "hausumringe_zip": "hausumringe/091_Oberbayern_Hausumringe.zip",
            "haus_auszug": "hausumringe/hausumringe_gebiet.json", "baeume_auszug": "einzelbaeume/baeume_gebiet_125046.json", "blatt": "125046"}

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "neu": print(json.dumps({sys.argv[2]: neu(sys.argv[2])}, indent=1))
    else: print(__doc__)
