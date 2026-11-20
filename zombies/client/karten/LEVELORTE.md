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
