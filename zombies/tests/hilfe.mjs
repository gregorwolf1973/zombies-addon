// Gemeinsame Testhilfen (keine Test-Datei: Endung .mjs ohne .test)
import net from 'node:net';

// Freien TCP-Port vom Betriebssystem holen (statt zufälliger fester Bereiche, die sich bei parallelen Testläufen überschnitten)
export function freierPort() {
  return new Promise((ok, fehl) => {
    const s = net.createServer();
    s.once('error', fehl);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

// Math.random durch einen festen Zufallsstrom ersetzen (mulberry32) – macht Sim-Tests mit Zufall wiederholbar
export function seedZufall(seed = 12345) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Auf eine Bedingung warten (großzügiges Limit; bricht sofort ab, sobald sie gilt)
export async function bisBedingung(bedingung, ms = 5000, takt = 20) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await bedingung()) return true; await new Promise(r => setTimeout(r, takt)); }
  return !!(await bedingung());
}

// Diese Tests gehen von den früheren, schnellen Tempi aus (Held 67,5 km/h, Zombie 47 km/h): feste Wartezeiten/Wege.
// Die Vorgaben (20/9/15/4 km/h) prüft tests/tempo_kmh.test.mjs.
export function altesTempo(SpielRaum) {
  SpielRaum.prototype.tempoWerte = () => ({ gehen: 67.5, schleichen: 31.5, jagen: 47.25, wandern: 13.5 });
}
