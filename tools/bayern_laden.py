#!/usr/bin/env python3
"""Rohdaten einer Karte aus Bayern Open Data (CC BY 4.0, https://geodaten.bayern.de/opengeodata/) laden und Auszüge schneiden.
Aufruf: python3 tools/bayern_laden.py <karte> [teil,teil,…]      Teile: dgm1 dom20 dop20rgb dop20cir parzellar basisdlm hausumringe baeume osm
Ohne Teile: alle. Fenster, Kacheln und Ordner stehen in tools/karten_gebiete.json (siehe tools/gebiet.py); Ablage unter
tools/luftbild/cache/bayern/<daten>/ (gitignored). Bereits vorhandene Dateien werden nicht erneut geladen.
Fair zum Server: nacheinander (ein Strom), Pause zwischen den Abrufen, eigener User-Agent, Wiederholung mit Wartezeit.
Quellen:
  dgm1 / dom20 / dop20rgb   Kachel-Dateien download1.bayernwolke.de (1-km-Kacheln)
  dop20cir / parzellar      WMS-Export je 1-km-Kachel (Adresse über den Metalink-Dienst poly2metalink; Parzellarkarte als PNG 5000×5000)
  basisdlm                  WFS ogc_atkis_basisdlm.cgi mit BBOX (AX_*-Objektarten)
  hausumringe               Auszug aus dem Oberbayern-Shapefile (ZIP, gemeinsam: cache/bayern/hausumringe/) -> <daten>/hausumringe/hausumringe_gebiet.json
  baeume                    Einzelbaumstandorte Blatt <blatt> (GeoPackage, ~590 MB, einmal je Karte) -> Auszug <daten>/einzelbaeume/…
  osm                       OSM-Fußgängerüberwege (Overpass, ein Abruf) -> <daten>/auswertung/_npy/osm_crossings.json (nur für amtlich.py: Zebrastreifen)
Die Tatsächliche Nutzung (ALKIS, Landkreis-Shapefile tn/shp/Nutzung) wird gemeinsam genutzt und hier nicht geladen (Datei vorhanden prüfen)."""
import json, math, os, pathlib, re, sqlite3, struct, sys, time, urllib.parse, urllib.request, zipfile
HIER = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HIER))
import gebiet as G

UA = "zombies-spielkarte-daten/1.0 (Hobby-Spiel; Bayern Open Data, nacheinander geladen)"
PAUSE = 1.0
DGM = "https://download1.bayernwolke.de/a/dgm/dgm1/{x}_{y}.tif"
DOM = "https://download1.bayernwolke.de/a/dom20/DOM/32{x}_{y}_20_DOM.tif"
DOP = "https://download1.bayernwolke.de/a/dop20/data/32{x}_{y}.tif"
METALINK = "https://geoservices.bayern.de/services/poly2metalink/metalink/{d}?data={d}&service=polygon"
WFS = ("https://geoservices.bayern.de/wfs/v1/ogc_atkis_basisdlm.cgi?service=WFS&version=2.0.0&request=GetFeature&typeNames=adv:{t}"
       "&namespaces=xmlns(adv,http://www.adv-online.de/namespaces/adv/gid/7.1)&bbox={b},urn:ogc:def:crs:EPSG::25832")
DLM = ["AX_Strassenachse", "AX_Fahrbahnachse", "AX_Fahrwegachse", "AX_WegPfadSteig", "AX_Gleis", "AX_Gewaesserachse", "AX_Strassenverkehr", "AX_Platz", "AX_Strasse"]

def holen(url, ziel, daten=None, kopf=None, timeout=600):
    ziel = pathlib.Path(ziel)
    if ziel.exists() and ziel.stat().st_size > 0: print("  vorhanden:", ziel.name); return
    ziel.parent.mkdir(parents=True, exist_ok=True)
    for versuch in range(4):
        try:
            h = {"User-Agent": UA}; h.update(kopf or {})
            with urllib.request.urlopen(urllib.request.Request(url, data=daten, headers=h), timeout=timeout) as r, open(str(ziel) + ".teil", "wb") as f:
                n = 0
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b); n += len(b)
            os.replace(str(ziel) + ".teil", ziel); print(f"  geladen: {ziel.name} ({n / 1e6:.1f} MB)", flush=True); time.sleep(PAUSE); return
        except Exception as e:
            print("  Wiederholung", ziel.name, e, file=sys.stderr, flush=True); time.sleep(5 + 10 * versuch)
    raise SystemExit("nicht ladbar: " + url)

def wms_url(g, dienst, x, y):
    poly = f"SRID=25832;POLYGON(({x * 1000} {y * 1000},{x * 1000 + 1000} {y * 1000},{x * 1000 + 1000} {y * 1000 + 1000},{x * 1000} {y * 1000 + 1000},{x * 1000} {y * 1000}))"
    req = urllib.request.Request(METALINK.format(d=dienst), data=poly.encode(), headers={"User-Agent": UA, "Content-Type": "text/plain"})
    xml = urllib.request.urlopen(req, timeout=60).read().decode()
    m = re.search(r"<url>([^<]+)</url>", xml)
    if not m: raise SystemExit("Metalink ohne Adresse: " + xml[:200])
    time.sleep(0.3)
    return m.group(1).replace("&amp;", "&")

def teil_kacheln(g, ordner, vorlage, endung_name):
    for x, y in g.kacheln_km():
        holen(vorlage.format(x=x, y=y), g.wurzel / ordner / endung_name(x, y))

def teil_cir(g):
    for x, y in g.kacheln_km():
        ziel = g.wurzel / "dop20cir" / f"{x}000_{y}000.tiff"
        if ziel.exists() and ziel.stat().st_size > 0: print("  vorhanden:", ziel.name); continue
        holen(wms_url(g, "dop20cir", x, y), ziel)

def teil_parzellar(g):
    for x, y in g.kacheln_km():
        ziel = g.wurzel / "parzellar" / f"{x}000_{y}000.png"
        if ziel.exists() and ziel.stat().st_size > 0: print("  vorhanden:", ziel.name); continue
        u = wms_url(g, "parzellarkarte", x, y)
        # PNG, 5000 x 5000 (20 cm/Pixel) bei 96 dpi: pixelgleich mit den zuerst geladenen Kacheln (300 dpi/11811 px würde Linien dünner/anders zeichnen)
        u = (u.replace("format=image/tiff", "format=image/png").replace("WIDTH=11811", "WIDTH=5000").replace("HEIGHT=11811", "HEIGHT=5000")
             .replace("DPI=300", "DPI=96").replace("MAP_RESOLUTION=300", "MAP_RESOLUTION=96").replace("dpi:300", "dpi:96"))
        holen(u, ziel)

def teil_basisdlm(g):
    f = g.tn_bbox; b = ",".join(str(v) for v in f)
    for t in DLM:
        u = WFS.format(t=t, b=b)
        holen(u, g.wurzel / "basisdlm" / f"{t}.gml", timeout=180)

def teil_hausumringe(g):
    ziel = g.wurzel / g.haus_auszug
    if ziel.exists(): print("  vorhanden:", ziel.name); return
    zip_pfad = G.BAYERN / g.hausumringe_zip
    if not zip_pfad.exists():
        holen("https://download1.bayernwolke.de/a/odd/m/3/daten/hausumringe/bezirk/data/091_Oberbayern_Hausumringe.zip", zip_pfad)
    x0, y0, x1, y1 = g.tn_bbox; erg = []
    with zipfile.ZipFile(zip_pfad) as z:
        dbf = z.read("hausumringe.dbf")
        nrec, hl, rl = struct.unpack("<IHH", dbf[4:12]); felder = []; o = 32
        while dbf[o] != 0x0D: felder.append((dbf[o:o + 11].split(b"\0")[0].decode(), dbf[o + 16])); o += 32
        with z.open("hausumringe.shp") as f:
            f.read(100); i = 0
            while True:
                kopf = f.read(8)
                if len(kopf) < 8: break
                rec = f.read(struct.unpack(">2i", kopf)[1] * 2)
                if struct.unpack("<i", rec[:4])[0] == 5:
                    bb = struct.unpack("<4d", rec[4:36])
                    if not (bb[2] < x0 or bb[0] > x1 or bb[3] < y0 or bb[1] > y1):
                        npart, npt = struct.unpack("<2i", rec[36:44]); teile = list(struct.unpack("<%di" % npart, rec[44:44 + 4 * npart])) + [npt]
                        pts = struct.unpack("<%dd" % (2 * npt), rec[44 + 4 * npart:44 + 4 * npart + 16 * npt])
                        r = dbf[hl + i * rl + 1:hl + (i + 1) * rl]; a = {}; q = 0
                        for nm, ln in felder: a[nm] = r[q:q + ln].decode("utf8", "replace").strip(); q += ln
                        erg.append({"attr": a, "ringe": [[[round(pts[2 * j], 2), round(pts[2 * j + 1], 2)] for j in range(teile[k], teile[k + 1])] for k in range(npart)]})
                i += 1
    ziel.parent.mkdir(parents=True, exist_ok=True); ziel.write_text(json.dumps(erg, separators=(",", ":")))
    print(f"  Hausumringe im Auszug: {len(erg)}")

def teil_baeume(g):
    ziel = g.wurzel / g.baeume_auszug
    if ziel.exists(): print("  vorhanden:", ziel.name); return
    gpkg = g.wurzel / "einzelbaeume" / f"{g.blatt}_baeume.gpkg"
    holen(f"https://geodaten.bayern.de/odd/m/8/baeume3d/data/{g.blatt}_baeume.gpkg", gpkg)
    c = sqlite3.connect(f"file:{gpkg}?mode=ro", uri=True); x0, y0, x1, y1 = g.tn_bbox
    q = ("select b.fid,b.geom,b.dgmhoehe,b.baumhoehe from rtree_Baumstandorte_geom r join Baumstandorte b on b.fid=r.id "
         "where r.maxx>=? and r.minx<=? and r.maxy>=? and r.miny<=? order by b.fid")
    erg = []
    for fid, geom, d, h in c.execute(q, (x0, x1, y0, y1)):
        x, y = struct.unpack("<2d", geom[13:29]); erg.append([fid, round(x, 1), round(y, 1), d, h])
    erg.sort(key=lambda e: -e[2])   # wie der erste Auszug (von Nord nach Süd)
    ziel.parent.mkdir(parents=True, exist_ok=True); ziel.write_text(json.dumps(erg, separators=(",", ":")))
    print(f"  Bäume im Auszug: {len(erg)}")

def teil_osm(g):
    ziel = g.auswertung / "_npy" / "osm_crossings.json"
    if ziel.exists(): print("  vorhanden:", ziel.name); return
    sys.path.insert(0, str(HIER))
    import hausumringe as HU
    s, w, n, o = g.bbox
    q = f'[out:json][timeout:60];node["highway"="crossing"]({s},{w},{n},{o});out body;'
    req = urllib.request.Request(os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"), data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
    el = json.loads(urllib.request.urlopen(req, timeout=120).read())["elements"]
    erg = []
    for e in el:
        t = e.get("tags", {}); typ = t.get("crossing") or ("zebra" if t.get("crossing_ref") == "zebra" else "unmarked")
        E, N = HU.utm32(e["lat"], e["lon"]); erg.append([E, N, typ, None, None])
    ziel.parent.mkdir(parents=True, exist_ok=True); ziel.write_text(json.dumps(erg))
    print(f"  Fußgängerüberwege: {len(erg)}")

TEILE = {
    "dgm1": lambda g: teil_kacheln(g, "dgm1", DGM, lambda x, y: f"{x}_{y}.tif"),
    "dom20": lambda g: teil_kacheln(g, "dom20", DOM, lambda x, y: f"32{x}_{y}_20_DOM.tif"),
    "dop20rgb": lambda g: teil_kacheln(g, "dop20rgb", DOP, lambda x, y: f"32{x}_{y}.tif"),
    "dop20cir": teil_cir, "parzellar": teil_parzellar, "basisdlm": teil_basisdlm,
    "hausumringe": teil_hausumringe, "baeume": teil_baeume, "osm": teil_osm,
}

def main():
    g = G.Gebiet(sys.argv[1]); teile = sys.argv[2].split(",") if len(sys.argv) > 2 else list(TEILE)
    if not (g.tn_pfad.with_suffix(".shp")).exists(): raise SystemExit(f"Nutzung (TN) fehlt: {g.tn_pfad}.shp (Landkreis-Shapefile, siehe cache/bayern/UEBERSICHT.md)")
    print(f"{g.name}: Fenster {g.fenster()}, Kacheln {g.kacheln_km()} -> {g.wurzel}")
    for t in teile:
        print(t, flush=True); TEILE[t](g)

if __name__ == "__main__":
    main()
