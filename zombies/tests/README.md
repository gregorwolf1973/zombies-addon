# Tests

- `npm run test:schnell` – ca. 1,5 min. Kern-/Logiktests (Welt/Fingerabdruck, Einstellungen, Kampf, Ton-Regeln, Netz, Verwaltung, Diagnose); die Dateiliste steht in `schnell.txt`. Für laufende Arbeit und vor jedem Commit.
- `npm test` – alles (ca. 6 min). Vor Version/Einspielen. Enthält zusätzlich die langen Echtzeit-Simulationen (Bots, Stützpunkt, Evakuierung, Vorräte u. a., je 20–60 s).
- Neue Testdatei: kurz und ohne feste Wartezeiten, dann in `schnell.txt` eintragen; lange Simulationen nur in die volle Stufe.

Regeln für stabile Tests (`hilfe.mjs`):
- Port immer mit `await freierPort()` (nie feste/zufällige Bereiche, parallele Läufe kollidierten).
- Zufall in Sim-Tests mit `seedZufall(n)` festlegen (die Welt hängt sonst vom Zufall ab).
- Auf Bedingungen warten (`bis`/`bisBedingung` mit großzügigem Limit), nicht feste Zeit schlafen; Nachrichten vom Server kommen über das Netz, also nie sofort prüfen.
- Server in `after()` mit `await server.gracefullyShutdown(false)` beenden. Der Welt-Worker (`server/weltcache.mjs`) ist `unref()`; nach dem letzten Test darf der Prozess nicht warten.
