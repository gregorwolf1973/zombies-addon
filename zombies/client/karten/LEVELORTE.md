# Level-Orte der neuen Karten (Kachelkoordinaten x,y; 1 Kachel = 4 m, y nach Süden)

Karten: koenigsdorf 430x374, kochel 338x415, andermatt 281x208 (Werte aus dem Weltaufbau, Seed 7 geprüft: frei und vom Start erreichbar).
Daten © OpenStreetMap-Mitwirkende, ODbL 1.0 (wie geretsried/isarauen; Feld "quelle" in jeder Karte, Hinweis in ../../../README.md).

## koenigsdorf (Segelflugplatz Königsdorf, bbox 47.8165 11.4595 47.83 11.4825)
- Graspiste 10/28 (550 m): Anfang West (58,20), Mitte (138,34), Ende Ost (217,48). Die Piste läuft von links oben nach rechts unten.
- Asphaltpiste (575 m): West (40,25) bis Ost (166,48), südlich/parallel zur Gras-Seite.
- Hangars (Reihe am Nordrand, Türen zeigen nach Norden): FSV Bad Tölz Haus 136,6 (8x8) Tür 137,6; Akaflieg München 121,4 Tür 127,5; SG Isartal 148,8 Tür 149,8; LSC Alpenflug 161,11 (10x8) Tür 163,11; Privathangar 156,9 Tür 157,10; BLVM 105,1 Tür 111,4; Segelflieger-Club 187,17 Tür 189,17; Windenschuppen/Feuerwehr 178,15.
- Ort Königsdorf unten rechts (Feuerwehr 320,300; Kirche St. Laurentius 377,369).
- Weltstart (Seed 7): Kachel 242,192 (zwischen Piste und Ort).

## kochel (Kochel am See, bbox 47.65 11.352 47.665 11.37)
- Kochelsee liegt im Nordwesten (Relation 337712, ~25 600 Wasserkacheln; per tools/osm_relationen.py ergänzt, osm_karte.py allein kennt keine Multipolygon-Seen).
- Hubschrauber-Landeplatz: offene Wiese (16x16 Kacheln frei) bei 169,207 (Kartenmitte, südlich des Ortskerns); Reserve: 168,207 / 169,208.
- Weltstart (Seed 7): Kachel 122,249.

## andermatt (Ortskern, bbox 46.6315 8.5865 46.639 8.6012, Reuss mit --fluss=12 = 3 Kacheln breit)
- Bunkertor-Platz: offene Wiese (12x12 frei) am Nordrand/Hang bei 222,9 (erreichbar); Alternativen: 271,9 (NO-Ecke), 198,52 (näher am Ort), 58,27 / 73,15 (NW).
- Südrand: 30,198 oder 267,198. Weltstart (Seed 7): Kachel 125,115.
- Höhenlinien gibt es im Spiel nicht; "Hang" ist nur nach Lage (Nordrand, Gütsch-Seite) gewählt.

## geretsried2 (zweite Level-1-Karte, Geretsried Nord/Ost, bbox 47.872 11.4584 47.8872 11.4766)
- 340x421 Kacheln, OSM-Rohdaten wie bei den anderen Karten nur lokal (tools/osm/roh_*.json ist ignoriert).
- Gebäude = amtliche Hausumringe (Bayerische Vermessungsverwaltung, CC BY 4.0; WELT_VERSION 30), OSM liefert nur Name/Art/Adresse. Neuaufbau: `python3 tools/hausumringe.py geretsried2` (Auszug aus tools/luftbild/cache/bayern/hausumringe), dann `python3 tools/osm_karte.py 47.872 11.4584 47.8872 11.4766 4 zombies/client/karten/geretsried2.json --hausumringe=tools/osm/hausumringe_geretsried2.json` (behält Luftbild-Felder), danach `python3 tools/luftbild.py --nur-daecher geretsried2`, `python3 tools/nebengebaeude.py geretsried2`, `python3 tools/kulisse.py geretsried2 daecher`.
- Reihenhäuser (gemeinsame Wand, 40–160 m²) sind zu einem Umriss vereinigt; Bauten unter 4 Rasterkacheln sind Nebengebäude (karte.nebengebaeude, nicht betretbar).
- Festes Safehouse „Kirche Hl. Familie“ (FESTES_SAFEHOUSE_G2 in client/osmwelt.mjs): Kachel 270,232.
- Eigenes Level „Geretsried 2“ (Vorgabe: Level 2 hinter Geretsried 1, in der Level-Reihenfolge verschieb- und abschaltbar; früher Zufallswahl in Level 1). Missionen, Evakuierung (Bus zum Ortsausgang), Musik/Radio-Durchsage („Level 1“) wie Geretsried; Biss-Wert eigener Regler (anfangs von Geretsried übernommen).
- Weltstart (Seed 7): Pixel 6352,7120 (vor den Hausumringen 5168,6288); 3 Safe Rooms (Kirche Hl. Familie, Evangelische Gemeinschaft, Feuerwehr), Bundeswehr-Stützpunkt vorhanden (Kachel 109,383).
- Amtliche Daten (WELT_VERSION 31): `python3 tools/amtlich.py geretsried2` (nach dem Kartenbau, osm_karte.py verwirft die Felder) schreibt Hecken/Zäune (Flurstücksgrenzen, Hecken-/Zaunklassifikation, TN-Regel), Einzelbäume (`baeumeLuftbild`, Kronendurchmesser aus dem Oberflächenmodell), Fahrbahnbreiten (Basis-DLM, sonst OSM-Angabe, sonst Schätzung) und Gehwege (`gl`/`gr` je Straße, aus TN „Straßenverkehr“), Zebrastreifen, Laternen und Mülltonnengruppen in die Karte; Kennung `amtlich`. Der Weltaufbau (osmwelt.mjs) liest nur fertige Koordinaten, ohne Zufall.

## isarauen (neu seit WELT_VERSION 34: amtliche Daten wie geretsried2; bbox 47.8948 11.414 47.9023 11.429, 280x208 Kacheln)
- Gebaut mit `tools/karte_bauen.sh isarauen --neu-anlegen` (Konfiguration in tools/karten_gebiete.json: Fenster E 680300..681660, N 5307320..5308400; `osm_fluss` 40 = Loisach 40 m breit wie in der alten Karte). Die alte Karte liegt als `isarauen_alt.json` im Zweig (bis Gregor entscheidet).
- Gebäude = amtliche Hausumringe (229, davon 82 betretbar; 219 Nebengebäude aus LoD2), Dächer LoD2 (224 von 229), Luftbild-Boden und gezeichneter Boden unter kulisse/isarauen, 1860 Einzelbäume, 634 Hecken-/Zaunlinien, Laternen 131; 115 Gehwegseiten, 23 Mülltonnengruppen, keine Zebrastreifen (in OSM dort nicht erfasst). Gebäude ohne LoD2-Dach (5, Neubauten wie das Einkaufszentrum) bekommen ein graues Flachdach (tools/kulisse.py).
- Geprüft mit `node tools/level_orte_pruefen.mjs isarauen` (Seeds 7, 12345, 987654321): Start (179,53) frei, Ortsausgang (1,12) wie bisher (Panzer-Abholpunkt auf 2,12 verschoben), 5 Safe Rooms erreichbar (Evangelische Gemeinschaft, Gärtnerei Holzer, Bauunternehmung Leitner, Werkhalle Goldhofer & Schauer, Mömax), Missionsorte Funk/Antenne/Landefeuer in je einem erreichbaren Haus (Smart Workout, Intersport Reiser).

## koenigsdorf und kochel (neu seit WELT_VERSION 35, gebaut mit `tools/karte_bauen.sh <karte> --neu-anlegen`, alte Karten als *_alt.json)
- koenigsdorf: `piste` (Landebahn/Rollweg) wird aus koenigsdorf_alt.json übernommen (Config `uebernehmen`); Gebäude amtlich, Hangars/Boxer/A400M-Plan geprüft mit `node tools/level_orte_pruefen.mjs koenigsdorf`.
- kochel: Kochelsee (Relation 337712) stammt aus dem Overpass-Rohcache (osm_relationen.py); Einzelbäume aus Blatt 124041 (Tabellen je km-Reihe). Hubschrauberplatz (levelorte.mjs) geprüft.
- Die Nutzungs-Codes in tn_codes.json sind seit dieser Änderung fest (1–15 wie geretsried2, weitere Arten danach); vorher verschob eine zusätzliche Nutzungsart (Friedhof, Flugverkehr) die Codes und amtlich.py las falsche Flächenarten (Isarauen wurde deshalb neu gerechnet).
