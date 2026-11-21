// Plattgefahrene Autos der Szene „Stau auf der B11“ (Server: server/szene_b11.mjs, Darstellung: client/szene_b11.mjs).
// state.platt: Behälter-Id des geparkten Autos → ein Zahlenwert mit dem Schub (Pixel), den die Ketten das Wrack in Fahrtrichtung
// weitergeschoben haben (je Achse −64…+63, ganzzahlig). Beide Seiten brauchen dieselbe Kodierung.
export const PLATT_MAX = 12;   // so weit (Pixel) wird ein Auto höchstens aus seiner Parklücke geschoben (rund 1,5 m)

export const plattKodieren = (dx, dy) => (((Math.round(dx) + 64) & 255) << 8) | ((Math.round(dy) + 64) & 255);
export const plattLesen = v => ({ dx: ((v >> 8) & 255) - 64, dy: (v & 255) - 64 });
