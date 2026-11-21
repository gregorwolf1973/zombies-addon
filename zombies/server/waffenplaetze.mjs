// Magazine, Nachladen und Waffenplätze (zwei Plätze: 1 = Haupt, 2 = Neben; Nahkampf = Faust oder eine Nahwaffe in Platz 2).
// p.waffe ist immer die Waffe in der Hand = der Inhalt des aktiven Platzes p.wplatz; alter Code, der p.waffe setzt, bleibt
// deshalb gültig – abgleich() übernimmt die Hand jeden Tick in den aktiven Platz und verwaltet das Magazin dazu.
// p.munition / p.pfeile / p.granaten sind der Vorrat AUSSERHALB des Magazins (p.magazin = Schuss im Magazin der Hand).
import { zaehle, entferne, fuegeHinzu, kannAufnehmen, dingId, nimmEins } from '../client/stapel.mjs';
import { WAFFEN, DINGE, GRANATE, vorratFeld, vorratVon, magazinGroesse, MUNITION_MAX, PFEILE_MAX, GRANATEN_MAX, HANDGRANATEN_MAX } from '../client/welt.mjs';

export const PLATZ_FELD = ['wp0', 'wp1'];   // wp2/mg2/mx2 im Schema sind aus der Zeit mit drei Plätzen übrig und bleiben leer
export const PLATZ_NAME = ['Platz 1', 'Platz 2'];
export const PLATZ_ANZAHL = PLATZ_FELD.length;
const VORRAT_MAX = { munition: MUNITION_MAX, pfeile: PFEILE_MAX, granaten: GRANATEN_MAX, handgranaten: HANDGRANATEN_MAX };

// Magazingröße / Nachladedauer: Verwaltung (einst.waffen) vor Vorgabe aus WAFFEN
export const magGroesse = (name, einst) => { const w = WAFFEN[name]; return w?.fern ? Math.max(1, Math.round(einst?.waffen?.[name]?.magazin ?? magazinGroesse(w))) : 0; };
export const nachladeDauer = (name, einst) => Math.max(0.3, einst?.waffen?.[name]?.nachlade ?? WAFFEN[name]?.nachlade ?? 4);

// Magazin aus dem Vorrat füllen (Rückgabe: geladene Schuss)
function fuelle(p, name, einst, schon = 0) {
  const w = WAFFEN[name], f = vorratFeld(w);
  const n = Math.max(0, Math.min(magGroesse(name, einst) - schon, p[f] ?? 0));
  p[f] -= n;
  return n;
}
// Schuss einer abgelegten/ersetzten Waffe zurück in den Vorrat
function erstatte(p, name, n) {
  const f = vorratFeld(WAFFEN[name]);
  p[f] = Math.min(VORRAT_MAX[f], (p[f] ?? 0) + n);
}

// Spielstand aus der Datenbank übernehmen (Plätze, Magazine); danach gleicht abgleich() alles an
export function lade(p, x, g) {
  x.mag = [null, null];
  const ok = n => DINGE[n]?.waffe ? n : '';
  let wpl = Number.isInteger(g?.wplatz) && g.wplatz >= 0 && g.wplatz <= 2 ? g.wplatz : 0;
  // alter Stand mit drei Plätzen: [Platz 1, Platz 2, ehemaliger Platz 3]; der aktive Platz trägt die Waffe aus p.waffe
  const slots = [0, 1, 2].map(i => i === wpl ? p.waffe : ok(g?.['wp' + i]));
  const mags = [0, 1, 2].map(i => {
    const n = Array.isArray(g?.mag) ? Number(g.mag[i]) : 0;
    return slots[i] && WAFFEN[slots[i]]?.fern && Number.isFinite(n) && n > 0 ? { waffe: slots[i], n: Math.min(255, Math.floor(n)) } : null;
  });
  x.ueberlauf = [];   // Waffen ohne Platz: der Raum legt sie nach dem Laden in den Rucksack (sonst verfallen sie)
  if (slots[2]) {
    const frei = [0, 1].find(i => !slots[i]);
    if (frei !== undefined) { slots[frei] = slots[2]; mags[frei] = mags[2]; if (wpl === 2) wpl = frei; }
    else {
      const name = slots[2], n = mags[2]?.n ?? 0;
      if (istHg(name)) { const anzahl = n + (p.handgranaten ?? 0); p.handgranaten = 0; for (let k = 0; k < Math.min(anzahl, HANDGRANATEN_MAX); k++) x.ueberlauf.push('granate'); }
      else { if (n > 0) erstatte(p, name, n); x.ueberlauf.push(name); }
      if (wpl === 2) wpl = 0;
    }
  }
  p.wplatz = wpl; p.waffe = slots[wpl]; p.wp2 = ''; p.mg2 = 0; p.mx2 = 0;
  PLATZ_FELD.forEach((f, i) => { p[f] = slots[i]; x.mag[i] = mags[i]; });
  p.magazin = x.mag[p.wplatz]?.n ?? 0;
  p.nachladen = 0;
}
export const speicherDaten = (p, x) => ({ wplatz: p.wplatz, wp0: p.wp0, wp1: p.wp1, mag: [0, 1].map(i => i === p.wplatz && !p.faust ? p.magazin : x.mag?.[i]?.n ?? 0) });

// Hand ↔ Platz ↔ Magazin angleichen (jeden Tick, billig)
export function abgleich(p, x, einst) {
  abgleich1(p, x, einst);
  const wm = Math.min(255, Math.round(einst?.reichweite?.handgranate ?? GRANATE.wurfWeite / 8));
  if (p.wurfweite !== wm) p.wurfweite = wm;
  [0, 1].forEach(i => {   // Magazinstand je Platz für den Client (HUD-Knöpfe)
    const name = p[PLATZ_FELD[i]], gm = magGroesse(name, einst);
    const n = !gm ? 0 : i === p.wplatz && !p.faust ? p.magazin : (x.mag[i]?.waffe === name ? x.mag[i].n : 0);
    if (p['mg' + i] !== n) p['mg' + i] = n;
    if (p['mx' + i] !== gm) p['mx' + i] = Math.min(255, gm);
  });
}
function abgleich1(p, x, einst) {
  x.mag ??= [null, null];
  const a = p.wplatz;
  if (p.faust) {   // Faust: Hand leer, der Platz behält Waffe und Magazin; wird von außen eine Waffe in die Hand gesetzt, endet die Faust
    if (!p.waffe) { p.magazin = 0; p.magmax = 0; p.nachladen = 0; return; }
    p.faust = false;
  }
  p[PLATZ_FELD[a]] = p.waffe;
  const e = x.mag[a], gm = magGroesse(p.waffe, einst);
  if (e && e.waffe !== p.waffe) {   // Waffe im Platz ausgetauscht (z. B. gegen eine aus dem Rucksack): Schuss zurück in den Vorrat
    if (e.n > 0) erstatte(p, e.waffe, e.n);
    x.mag[a] = null; p.magazin = 0; p.nachladen = 0; x.nRest = 0;
  }
  p.magmax = gm;
  if (!gm) { p.magazin = 0; p.nachladen = 0; x.mag[a] = null; return; }
  if (!x.mag[a]) { p.nachladen = 0; p.magazin = fuelle(p, p.waffe, einst); }   // frisch aufgenommen: gleich geladen
  if (p.magazin > gm) { erstatte(p, p.waffe, p.magazin - gm); p.magazin = gm; }   // Einstellung verkleinert
  x.mag[a] = { waffe: p.waffe, n: p.magazin };
}

// Ist die Waffe in Platz i noch brauchbar (Nahwaffe oder Schuss da)?
function brauchbar(p, x, i) {
  const name = p[PLATZ_FELD[i]];
  if (!name) return false;
  const w = WAFFEN[name];
  if (!w?.fern) return true;
  return (x.mag?.[i]?.waffe === name ? x.mag[i].n : 0) + vorratVon(p, w) > 0;
}

export function wechsle(raum, client, p, x, platz, einst, still = false) {
  if (!Number.isInteger(platz) || platz < 0 || platz >= PLATZ_ANZAHL || (platz === p.wplatz && !p.faust)) return false;
  abgleich(p, x, einst);
  const name = p[PLATZ_FELD[platz]];
  p.faust = false; p.wplatz = platz; p.waffe = name; p.nachladen = 0; x.nRest = 0;
  const e = x.mag[platz];
  p.magazin = e && e.waffe === name ? e.n : 0;   // fehlt der Eintrag, füllt abgleich() beim nächsten Schritt
  if (!still) client?.send('meldung', { text: name ? `${DINGE[name].zeichen} ${PLATZ_NAME[platz]}: ${DINGE[name].name}` : `✊ ${PLATZ_NAME[platz]}: leer – Faust` });
  return true;
}

// nächster belegter Platz (Taste F)
export function naechster(p) {
  for (let k = p.faust ? 0 : 1; k < PLATZ_ANZAHL; k++) { const i = (p.wplatz + k) % PLATZ_ANZAHL; if (p[PLATZ_FELD[i]]) return i; }
  return -1;
}

// Eine Waffe aus dem Rucksack in die Hand nehmen: ist ein anderer Platz frei, kommt sie dorthin (die bisherige Waffe bleibt im
// Platz), sonst ersetzt sie die Waffe in der Hand (die wandert in den Rucksack). Rückgabe: Name der bisherigen Waffe, die in den
// Rucksack gehört, oder '' wenn nichts zurückgelegt werden muss.
export function inDieHand(raum, client, p, x, ding, einst) {
  abgleich(p, x, einst);
  if (p.faust) wechsle(raum, null, p, x, p.wplatz, einst, true);   // Aufnehmen beendet die Faust (zurück zum Waffenplatz)
  if (!p.waffe) { p.waffe = ding; return ''; }
  const frei = [1, 0].map(k => (p.wplatz + k) % PLATZ_ANZAHL).find(i => !p[PLATZ_FELD[i]]);
  if (frei === undefined) { const alt = p.waffe; p.waffe = ding; return alt; }
  p[PLATZ_FELD[frei]] = ding;
  wechsle(raum, null, p, x, frei, einst, true);
  return '';
}

// Nachladen starten (von Hand mit R oder automatisch bei leerem Magazin); true = gestartet
export function startNachladen(raum, p, x, einst) {
  abgleich(p, x, einst);
  const w = WAFFEN[p.waffe];
  if (!w?.fern || p.nachladen > 0 || p.unten || p.zombie > 0) return false;
  if (p.magazin >= magGroesse(p.waffe, einst) || vorratVon(p, w) <= 0) return false;
  x.nDauer = x.nRest = nachladeDauer(p.waffe, einst);
  p.nachladen = 0.001;
  raum.broadcast('nachladen', { x: p.x, y: p.y, art: p.waffe, ebene: p.ebene ?? '' });
  return true;
}

// jeden Tick je Spieler (auch Bots): Nachladen vorantreiben, bei leerem Magazin selbst nachladen, bei leerer Waffe wechseln
export function schritt(raum, client, p, x, dt, einst) {
  abgleich(p, x, einst);
  const w = WAFFEN[p.waffe];
  if (!w?.fern) return;
  if (p.nachladen > 0) {
    x.nRest -= dt;
    if (x.nRest <= 0) {
      p.magazin += fuelle(p, p.waffe, einst, p.magazin);
      p.nachladen = 0;
      x.mag[p.wplatz] = { waffe: p.waffe, n: p.magazin };
    } else p.nachladen = Math.max(0.001, 1 - x.nRest / x.nDauer);
    return;
  }
  if (p.magazin <= 0 && vorratVon(p, w) > 0) { startNachladen(raum, p, x, einst); return; }
  // Magazin und Vorrat leer: auf den anderen Platz (Fernwaffe mit Schuss oder Nahwaffe), sonst Faust
  if (p.magazin <= 0) {
    const ziel = [1 - p.wplatz].find(i => brauchbar(p, x, i));
    const alt = p.waffe;
    if (ziel !== undefined) {
      wechsle(raum, client, p, x, ziel, einst, true);
      client?.send('meldung', { text: `${DINGE[alt].zeichen} ${DINGE[alt].name} leer – ${DINGE[p.waffe].zeichen} ${DINGE[p.waffe].name}` });
    } else if (!x.bot && !p.unten && p.zombie <= 0) {   // Bots behalten ihre Waffe
      p.faust = true; p.waffe = ''; p.magazin = 0; p.nachladen = 0; x.nRest = 0;
      client?.send('meldung', { text: `${DINGE[alt].zeichen} ${DINGE[alt].name} leer – ✊ Faust` });
    }
  }
}

// Waffen aller Plätze (für den Sterbehaufen)
export const alleWaffen = p => [p.wp0, p.wp1].filter((n, i) => n && (i !== p.wplatz || p.faust));
export function leeren(p, x) { p.wp0 = p.wp1 = p.wp2 = ''; p.wplatz = 0; p.faust = false; p.handgranaten = 0; p.magazin = 0; p.nachladen = 0; if (x) { x.mag = [null, null]; x.nRest = 0; } }

// ---------- Waffenplätze verwalten (Menü am Knopf, Rucksack, Faust) ----------
const istHg = name => name === 'handgranate';
// Platz mit Handgranaten (oder -1)
export const handgranatenPlatz = p => [0, 1].find(i => p[PLATZ_FELD[i]] === 'handgranate') ?? -1;

// Waffe aus Platz i nehmen (Platz danach leer). Schuss im Magazin gehen zurück in den Vorrat; Handgranaten werden zu einzelnen
// 'granate'-Gegenständen (Anzahl = Magazin + Vorrat). Rückgabe { name, anzahl } oder null.
function entnehmen(p, x, i, einst) {
  abgleich(p, x, einst);
  const name = p[PLATZ_FELD[i]];
  if (!name) return null;
  const e = x.mag[i];
  let anzahl = 1;
  if (istHg(name)) { anzahl = (e?.waffe === name ? e.n : 0) + (p.handgranaten ?? 0); p.handgranaten = 0; }
  else if (e?.waffe === name && e.n > 0) erstatte(p, name, e.n);
  x.mag[i] = null; p[PLATZ_FELD[i]] = '';
  if (i === p.wplatz) { p.waffe = ''; p.magazin = 0; p.nachladen = 0; x.nRest = 0; }
  return { name, anzahl };
}
// Entnommenes in den Rucksack (soweit Platz) – der Rest fällt vor die Füße. Rückgabe: wie viele zu Boden gingen.
function ablegenRucksack(raum, p, ding) {
  const name = istHg(ding.name) ? 'granate' : ding.name;
  let boden = 0;
  for (let k = 0; k < ding.anzahl; k++) {
    if (fuegeHinzu(p.rucksack, p.plaetze, name) < 1) { raum.legeHin(name, p.x, p.y, p.ebene); boden++; }
  }
  return boden;
}
// alle 'granate' aus dem Rucksack nehmen (ArraySchema: an Ort und Stelle ändern)
function granatenEntfernen(p) { entferne(p.rucksack, 'granate', zaehle(p.rucksack, 'granate')); }
const frage = (raum, p) => !p || p.unten || p.zombie > 0 || raum.state.phase !== 'spiel';

// Nachricht 'platz_aktion' { platz, aktion: 'rucksack' | 'fallen' | 'tausch', rs? }
export function platzAktion(raum, client, p, x, m, einst) {
  if (frage(raum, p)) return false;
  const i = Number(m?.platz);
  if (!Number.isInteger(i) || i < 0 || i >= PLATZ_ANZAHL) return false;
  abgleich(p, x, einst);
  if (m.aktion === 'tausch') return ausRucksack(raum, client, p, x, Number(m.rs), i, einst);   // auch in einen leeren Platz
  const name = p[PLATZ_FELD[i]];
  if (!name) return false;
  const z = DINGE[name].zeichen, n = DINGE[name].name;
  if (m.aktion === 'rucksack') {
    if (!kannAufnehmen(p.rucksack, p.plaetze, istHg(name) ? 'granate' : name)) { client?.send('meldung', { text: '🎒 Rucksack voll' }); return false; }
    const ding = entnehmen(p, x, i, einst);
    const boden = ablegenRucksack(raum, p, ding);
    client?.send('meldung', { text: `${z} ${n} in den Rucksack${boden ? ` (${boden} liegen am Boden)` : ''}` });
    return true;
  }
  if (m.aktion === 'fallen') {
    const ding = entnehmen(p, x, i, einst);
    for (let k = 0; k < ding.anzahl; k++) raum.legeHin(istHg(ding.name) ? 'granate' : ding.name, p.x, p.y, p.ebene);
    client?.send('meldung', { text: `${z} ${n} fallen gelassen` });
    return true;
  }
  return false;
}

// Rucksack-Eintrag rs (Waffe oder Handgranate) in Platz i; eine dort liegende Waffe geht in den Rucksack (Tausch)
export function ausRucksack(raum, client, p, x, rs, i, einst) {
  if (frage(raum, p) || !Number.isInteger(rs) || rs < 0 || rs >= p.rucksack.length || !Number.isInteger(i) || i < 0 || i >= PLATZ_ANZAHL) return false;
  const d = dingId(p.rucksack[rs]);
  if (d !== 'granate' && !(DINGE[d]?.waffe && !DINGE[d].intern)) return false;
  abgleich(p, x, einst);
  if (d === 'granate') {
    const anzahl = zaehle(p.rucksack, 'granate');
    const hg = handgranatenPlatz(p);
    if (hg >= 0) {   // es gibt schon einen Handgranaten-Platz: alle Granaten dorthin
      granatenEntfernen(p);
      p.handgranaten = Math.min(HANDGRANATEN_MAX, (p.handgranaten ?? 0) + anzahl);
      client?.send('meldung', { text: `💣 ${anzahl} Handgranate${anzahl > 1 ? 'n' : ''} zum Vorrat (Platz ${hg + 1})` });
      return true;
    }
    granatenEntfernen(p);
    const alt = entnehmen(p, x, i, einst);
    if (alt) ablegenRucksack(raum, p, alt);
    p[PLATZ_FELD[i]] = 'handgranate'; p.handgranaten = Math.min(HANDGRANATEN_MAX, anzahl);
    if (i === p.wplatz && !p.faust) p.waffe = 'handgranate';
    client?.send('meldung', { text: `💣 ${PLATZ_NAME[i]}: ${anzahl} Handgranate${anzahl > 1 ? 'n' : ''}` });
    return true;
  }
  nimmEins(p.rucksack, rs);
  const alt = entnehmen(p, x, i, einst);
  if (alt) ablegenRucksack(raum, p, alt);
  p[PLATZ_FELD[i]] = d;
  if (i === p.wplatz && !p.faust) p.waffe = d;
  client?.send('meldung', { text: `${DINGE[d].zeichen} ${PLATZ_NAME[i]}: ${DINGE[d].name}` });
  return true;
}

// Faust: nichts in der Hand, ohne einen Platz zu leeren (nochmal = zurück zum aktiven Platz)
export function faust(raum, client, p, x, einst) {
  if (frage(raum, p)) return false;
  abgleich(p, x, einst);
  if (p.faust) return wechsle(raum, client, p, x, p.wplatz, einst);
  p.faust = true; p.waffe = ''; p.magazin = 0; p.nachladen = 0; x.nRest = 0;
  client?.send('meldung', { text: '✊ Faust' });
  return true;
}
