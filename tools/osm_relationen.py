#!/usr/bin/env python3
"""Ergänzt eine Rohdatei von osm_karte.py um Seen/Flächen, die in OSM als Multipolygon-Relation stehen
(Außenringe werden zu geschlossenen Wegen mit den Tags der Relation). Daten © OpenStreetMap-Mitwirkende, ODbL 1.0.
Aufruf: python3 tools/osm_relationen.py <roh.json> <relations-id> [<relations-id> …]   (danach osm_karte.py normal aufrufen)"""
import json, sys, os, urllib.request, urllib.parse
roh = json.load(open(sys.argv[1]))
q = "[out:json][timeout:60];(" + "".join(f"relation({i});" for i in sys.argv[2:]) + ");out geom;"
req = urllib.request.Request(os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
                             data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "zombies-karte/0.1"})
rels = json.loads(urllib.request.urlopen(req, timeout=120).read())["elements"]
nid = -1; wid = -1
for r in rels:
    segs = [[(p["lat"], p["lon"]) for p in m["geometry"]] for m in r["members"] if m["type"] == "way" and m.get("role") == "outer" and m.get("geometry")]
    while segs:
        ring = segs.pop(0)
        ok = True
        while ring[0] != ring[-1] and ok:
            ok = False
            for s in segs:
                for c in (s, s[::-1]):
                    if c[0] == ring[-1]: ring += c[1:]; segs.remove(s); ok = True; break
                if ok: break
        ids = []
        for lat, lon in ring:
            roh["elements"].append({"type": "node", "id": nid, "lat": lat, "lon": lon}); ids.append(nid); nid -= 1
        roh["elements"].append({"type": "way", "id": wid, "nodes": ids, "tags": {k: v for k, v in r["tags"].items() if k in ("natural", "water", "name", "waterway")}}); wid -= 1
        print("Ring", len(ring), "Punkte", "geschlossen" if ring[0] == ring[-1] else "OFFEN")
json.dump(roh, open(sys.argv[1], "w"))
