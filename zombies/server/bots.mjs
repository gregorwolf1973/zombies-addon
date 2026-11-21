// Steuerung der simulierten Mitspieler (zweite Fassung, Claude): Wegsuche über Kacheln, feste Plätze hinter
// dem Anführer, Abstand zu allen Figuren, bewaffnete Bots kämpfen. Ein Bot steuert sich nur über x.eingabe.
import { hat, zaehle, flach, entferne, nimmEins, fuegeHinzu, kannAufnehmen, freiePlaetze, dingId } from '../client/stapel.mjs';
import { planSchritt, entnahmeFrei } from './botplan.mjs';   // Team-Planer (Aufträge, Rollen, Chat-Befehle)
import { WERTE as W, frei, sichtfrei, sichtGuete, safeRoomVon, findeWeg, KACHEL, T, WAFFEN, DINGE, AKTION_ABSTAND, kachelVon, reichVon, tempoVon, KISTE_PLAETZE, durchsuchDauer, MUNITION_MAX, munitionGesamt } from '../client/welt.mjs';

export const BOT_NAMEN = ['Resi', 'Vroni', 'Sepp', 'Wastl', 'Kathi', 'Hias', 'Burgi', 'Girgl', 'Loisl', 'Zenzi'];

const RAD = W.spielerRadius;
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function bewaffnet(p) {
  const w = WAFFEN[p.waffe];
  if (w?.fern && munitionGesamt(p) > 0) return 'fern';   // Magazin + Vorrat
  if (w && !w.fern) return 'nah';
  return null;
}

// Selbstversorgung direkt am Zustand (höchstens alle 1 s)
function versorgen(p, b, jetzt) {
  if (jetzt - (b.versorgt ?? 0) < 1) return;
  const nimm = (d, f) => { if (entferne(p.rucksack, d, 1) < 1) return false; f(); b.versorgt = jetzt; return true; };
  if (p.infektion > 0 && nimm('spritze', () => { p.infektion = 0; })) return;
  if (p.hp < 40 && nimm('verband', () => { p.hp = Math.min(100, p.hp + 45); })) return;
  if (p.durst < 35 && nimm('wasser', () => { p.durst = Math.min(100, p.durst + 45); })) return;
  if (p.hunger < 35 && (nimm('essen', () => { p.hunger = Math.min(100, p.hunger + 45); }) || nimm('schokoriegel', () => { p.hunger = Math.min(100, p.hunger + 20); }))) return;
  // bessere Waffe aus dem Rucksack nehmen (die alte kommt hinein); Fernwaffen nur mit Munition
  const rang = w => (WAFFEN[w]?.fern && !p.munition) ? 0 : WAFFEN_RANG.indexOf(w) + 1;
  const besser = WAFFEN_RANG.filter(w => hat(p.rucksack, w) && rang(w) > rang(p.waffe)).at(-1);
  if (besser && nimm(besser, () => { if (p.waffe && fuegeHinzu(p.rucksack, p.plaetze, p.waffe) < 1) p.rucksack.push(p.waffe); p.waffe = besser; })) return;
  // aufgehobene Munitionsschachtel einlegen
  if (p.munition < 30 && nimm('munition', () => { p.munition = Math.min(MUNITION_MAX, p.munition + 12); })) return;
  // größere Tasche umpacken
  for (const t of ['trekking', 'tasche']) {
    if (hat(p.rucksack, t) && (DINGE[t]?.plaetze ?? 0) > p.plaetze && nimm(t, () => { p.plaetze = DINGE[t].plaetze; })) return;
  }
}
// (Maschinenpistole und Maschinengewehr von der Bundeswehr stehen über dem Gewehr)
export const WAFFEN_RANG = ['messer', 'schlaeger', 'pistole', 'sense', 'schrotflinte', 'gewehr', 'mp', 'mg'];

// so viele Stück eines Dings will ein Bot höchstens tragen (Waffen: die getragene zählt mit); der Rest fliegt raus
export const GRENZE = { wasser: 3, essen: 3, schokoriegel: 3, verband: 3, spritze: 2, bretter: 3, munition: 4, schluessel: 1, brechstange: 1, seil: 1,
  taschenlampe: 2, kleidung: 1, tasche: 0, trekking: 0,
  granate: 2 };   // Bots werfen keine Granaten – nur zwei behalten, damit sie nicht horten
const grenze = d => GRENZE[d] ?? (WAFFEN[d] ? 1 : 2);
const anzahl = (p, d) => zaehle(p.rucksack, d) + (p.waffe === d ? 1 : 0);
function willHaben(p, d) {
  if ((d === 'tasche' || d === 'trekking') && (DINGE[d]?.plaetze ?? 0) > p.plaetze) return true;   // größere Tasche
  if (WAFFEN[d] && WAFFEN_RANG.indexOf(d) < WAFFEN_RANG.indexOf(p.waffe) && flach(p.rucksack).some(q => WAFFEN[q])) return false;   // schlechtere Waffe, Ersatz schon da
  return anzahl(p, d) < grenze(d);
}

// Überzähliges ablegen (höchstens eins je Sekunde); der Bot merkt sich das Ding, damit er es nicht wieder aufhebt
const ueberzaehlig = p => flach(p.rucksack).find((q, i, fl) => fl.slice(0, i + 1).filter(r => r === q).length + (p.waffe === q ? 1 : 0) > grenze(q)
  && !((q === 'tasche' || q === 'trekking') && (DINGE[q]?.plaetze ?? 0) > p.plaetze));
function ueberzaehligesAblegen(raum, p, b) {
  if (raum.uhr - (b.abgelegt ?? 0) < 1) return false;
  const d = ueberzaehlig(p);
  if (!d) return false;
  entferne(p.rucksack, d, 1);
  const id = raum.legeHin(d, p.x, p.y, p.ebene ?? '');
  (b.verschmaeht ??= new Set()).add(id);
  b.abgelegt = raum.uhr;
  return true;
}

// ---------- Tauschen mit Menschen (Ablauf und Nachrichten in raum.mjs: tauschStart, tauschGeaendert, tauschOk) ----------
// Was der Mensch offensichtlich braucht (wichtigstes zuerst)
function menschBraucht(m) {
  const r = [];
  if (m.infektion > 0) r.push('spritze');
  if (m.hp < 50) r.push('verband');
  if (m.durst < 40) r.push('wasser');
  if (m.hunger < 40) r.push('essen', 'schokoriegel');
  if (WAFFEN[m.waffe]?.fern && m.munition < 15) r.push('munition');
  return r;
}
// Was der Bot für sich selbst behält, wenn er gerade knapp dran ist
function reserve(p, d) {
  if (d === 'verband') return p.hp < 70 ? 99 : 0;
  if (d === 'spritze') return p.infektion > 0 ? 99 : 0;
  if (d === 'wasser') return p.durst < 60 ? 99 : 0;
  if (d === 'essen' || d === 'schokoriegel') return p.hunger < 60 ? 99 : 0;
  if (d === 'munition') return WAFFEN[p.waffe]?.fern ? 1 : 0;
  return 0;
}
const waffenZahl = p => (p.waffe ? 1 : 0) + flach(p.rucksack).filter(q => WAFFEN[q]).length;
// darf der Bot dieses Ding hergeben? übrig (über der Bedarfsgrenze) oder der Mensch braucht es und der Bot hat genug; nie die einzige Waffe
function abgebbar(p, d, braucht) {
  if (WAFFEN[d] && waffenZahl(p) <= 1) return false;
  const n = anzahl(p, d);
  const tascheGross = (d === 'tasche' || d === 'trekking') && (DINGE[d]?.plaetze ?? 0) > p.plaetze;
  if (n > grenze(d) && !tascheGross) return true;
  return braucht && !WAFFEN[d] && n - 1 >= reserve(p, d);
}
// Gegenangebot des Bots (Liste von Dingen aus seinem Rucksack) zu dem, was der Mensch (H) anbietet: ungefähr gleich viele Dinge
export function botGegenangebot(bot, mensch, H) {
  const braucht = menschBraucht(mensch), platz = freiePlaetze(mensch.rucksack, mensch.plaetze);
  const ziel = Math.min(platz, Math.max(1, H.length)), angebot = [];
  // Rucksack des Bots als Kopie, aus der beim Auswählen schon abgezogen wird (zählt für Bedarfsgrenze und Reserve)
  const ich = { rucksack: [...bot.rucksack], waffe: bot.waffe, hp: bot.hp, durst: bot.durst, hunger: bot.hunger, infektion: bot.infektion, plaetze: bot.plaetze };
  const kandidaten = [...new Set(flach(ich.rucksack))].map(d => ({ d, braucht: braucht.includes(d) }))
    .sort((a, b) => (b.braucht - a.braucht) || (H.includes(a.d) - H.includes(b.d)));
  for (const k of kandidaten) {
    while (angebot.length < ziel && abgebbar(ich, k.d, k.braucht)) { entferne(ich.rucksack, k.d, 1); angebot.push(k.d); }
  }
  return angebot;
}
// Stimmt der Bot dem Tausch zu? (H = Angebot des Menschen, B = sein eigenes, schon aus dem Rucksack genommen)
export function botEinverstanden(bot, H, B) {
  if (!H.length) return true;
  const t = [...bot.rucksack];   // B ist schon aus dem Rucksack genommen: passt H hinein?
  for (const d of H) if (fuegeHinzu(t, bot.plaetze, d) < 1) return false;
  if (!B.length) return true;   // Geschenk eines Mitspielers: immer annehmen, solange Platz ist (Überzähliges legt er später ab)
  return B.length >= H.length || H.some(d => willHaben(bot, d));
}

// Aus der gemeinsamen Kiste nimmt ein Bot nur, was er gerade dringend selbst braucht – wie ein Mensch.
// Sonst räumen Bots die Vorräte weg, die die Gruppe für ihre Aufgaben sammelt.
function brauchtDringend(p, d) {
  if (d === 'wasser') return p.durst < 40;
  if (d === 'essen' || d === 'schokoriegel') return p.hunger < 40;
  if (d === 'verband') return p.hp < 50 && !hat(p.rucksack, 'verband');
  if (d === 'spritze') return p.infektion > 0;
  if (d === 'munition') return WAFFEN[p.waffe]?.fern && p.munition < 10;
  if (WAFFEN[d]?.pfeil || WAFFEN[d]?.granate) return false;   // Bots nutzen Armbrust und Granatwerfer nicht (Pfeile/Granaten als eigener Vorrat)
  if (WAFFEN[d]) return !p.waffe || (WAFFEN_RANG.indexOf(d) > WAFFEN_RANG.indexOf(p.waffe) && !(WAFFEN[d]?.fern && !p.munition));
  if (d === 'tasche' || d === 'trekking') return (DINGE[d]?.plaetze ?? 0) > p.plaetze;
  return false;   // Bretter, Lampen, Seile, Schlüssel … bleiben für die Gruppe in der Kiste
}

// Im Safe Room: Überzähliges in die Vorratskiste legen, dringend Gebrauchtes herausnehmen (ein Stück je 0,8 s)
function vorratskiste(raum, sid, p, x, welt) {
  const safe = safeRoomVon(raum.welt, p), kiste = safe && raum.state.safes.get(safe.id)?.kiste;
  if (!kiste || !welt.kiste) return false;
  const b = x.bot, u0 = ueberzaehlig(p), ueber = u0 && kannAufnehmen(kiste, KISTE_PLAETZE, u0, 1, true) ? u0 : null;
  const fehlt = [...kiste].findIndex(e => { const d = dingId(e); return kannAufnehmen(p.rucksack, p.plaetze, d) && brauchtDringend(p, d) && willHaben(p, d) && entnahmeFrei(raum, d, p); });
  if (!ueber && fehlt < 0) return false;
  if (abstand(p, welt.kiste) > reichVon(welt, AKTION_ABSTAND - 4)) { geheZu(raum, sid, p, x, welt.kiste, 0.8, reichVon(welt, AKTION_ABSTAND - 10)); return true; }
  if (raum.uhr - (b.kisteZeit ?? 0) < 0.8) return true;
  b.kisteZeit = raum.uhr;
  if (ueber) { entferne(p.rucksack, ueber, 1); fuegeHinzu(kiste, KISTE_PLAETZE, ueber, 1, true); }
  else { const d = dingId(kiste[fehlt]); nimmEins(kiste, fehlt); fuegeHinzu(p.rucksack, p.plaetze, d); }
  return true;
}

// Dinge vom Boden aufheben, die der Bot brauchen kann (z. B. was ein Mitspieler fallen lässt)
function aufheben(raum, sid, p, x, welt) {
  const b = x.bot;
  const kandidaten = [];
  for (const [id, d] of raum.state.boden) {
    if ((d.ebene ?? '') !== (p.ebene ?? '') || b.verschmaeht?.has(id) || !willHaben(p, d.ding) || !kannAufnehmen(p.rucksack, p.plaetze, d.ding)) continue;
    kandidaten.push({ id, x: d.x, y: d.y });
  }
  const ziel = naechster(kandidaten, p, 220, c => sichtfrei(welt, p.x, p.y, c.x, c.y));
  if (!ziel) return false;
  if (abstand(p, ziel) > reichVon(welt, AKTION_ABSTAND - 8)) { geheZu(raum, sid, p, x, ziel, 0.9, reichVon(welt, AKTION_ABSTAND - 12)); return true; }
  p.aktion = 'aufheben'; p.fortschritt = 0; x.aktionZiel = { art: 'aufheben', id: ziel.id, dauer: 0.4 };
  return true;
}

// Gelegenheit nutzen: nahe Schränke, Kofferräume (mit Brechstange) und tote Zombies durchsuchen
function durchsuchen(raum, sid, p, x, welt) {
  const b = x.bot;
  b.durchsucht ??= new Set();
  if (p.rucksack.length >= p.plaetze) return false;
  const kandidaten = [];
  for (const c of welt.behaelter ?? []) {
    if (b.durchsucht.has(c.id) || raum.state.behaelter.get(c.id)?.rest === 0) continue;
    if (c.art === 'auto' && !hat(p.rucksack, 'brechstange')) continue;
    kandidaten.push(c);
  }
  for (const [id, l] of raum.state.leichen) if ((l.ebene ?? '') === (p.ebene ?? '') && l.rest !== 0 && !b.durchsucht.has(id)) kandidaten.push({ id, x: l.x, y: l.y, leiche: true });
  const ziel = naechster(kandidaten, p, 170, c => sichtfrei(welt, p.x, p.y, c.x, c.y));
  if (!ziel) return false;
  if (abstand(p, ziel) > reichVon(welt, AKTION_ABSTAND - 8)) { geheZu(raum, sid, p, x, ziel, 0.9, reichVon(welt, AKTION_ABSTAND - 12)); return true; }
  // genau diesen Behälter durchsuchen (nicht, was zufällig am nächsten liegt – z. B. ein verschlossenes Auto)
  b.durchsucht.add(ziel.id);
  const behaelter = ziel.leiche ? { id: ziel.id, art: 'leiche', x: ziel.x, y: ziel.y } : ziel;
  const dauer = durchsuchDauer(behaelter.art);
  p.aktion = 'durchsuchen'; p.fortschritt = 0; x.aktionZiel = { art: 'durchsuchen', behaelter, dauer }; x.laermUhr = 0;
  return true;
}

// ---------- Türen und Übergänge: nicht gegenseitig blockieren ----------
const TUER_ARTEN = new Set([T.TUER, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH, T.INNENTUER, T.TUER_OFFEN]);
// Mitte der nächsten Tür/Treppe (Haustür, Innentür, Ausgang) im Umkreis r um p, sonst null
function tuerNahe(welt, p, r = 44) {
  const K = kachelVon(welt), n = welt.kachel ? Math.ceil(r / K) : 1;   // Feinraster: Zellen sind klein, Suchbereich entsprechend größer
  const kx = Math.floor(p.x / K), ky = Math.floor(p.y / K);
  let best = null, bd = r;
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
    if (!TUER_ARTEN.has(welt.hole(kx + dx, ky + dy))) continue;
    const m = { x: (kx + dx + 0.5) * K, y: (ky + dy + 0.5) * K }, d = abstand(p, m);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
// Standplatz neben einer Tür (nicht in ihrem Bereich, nicht auf einer anderen Figur), von der Tür aus gesehen in Richtung des Bots
function ausweichPunkt(raum, sid, p, welt, tuer, vonWo = null) {
  const R = welt.reich ?? 1;
  const a0 = abstand(p, tuer) > 3 * R ? Math.atan2(p.y - tuer.y, p.x - tuer.x) : (vonWo ? Math.atan2(tuer.y - vonWo.y, tuer.x - vonWo.x) : 0);
  for (const r of [58 * R, 72 * R]) for (const dw of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    const z = { x: tuer.x + Math.cos(a0 + dw) * r, y: tuer.y + Math.sin(a0 + dw) * r };
    if (!frei(welt, z.x, z.y, RAD) || tuerNahe(welt, z, 44 * R) || !sichtfrei(welt, p.x, p.y, z.x, z.y)) continue;
    let besetzt = false;
    for (const [osid, o] of raum.state.spieler) if (osid !== sid && o.ebene === p.ebene && abstand(o, z) < 24 * R) { besetzt = true; break; }
    if (!besetzt) return z;
  }
  return null;
}
// Reihenfolge am Übergang: wer näher an der Tür ist (bei Gleichstand die kleinere Id), geht zuerst; Rang 0 = dran.
// Menschen, die gerade in der Tür stehen, zählen als „davor“.
function tuerRang(raum, sid, p, ziel) {
  const d = abstand(p, ziel), R = raum.wv(p.ebene).reich ?? 1;
  let rang = 0;
  for (const [osid, o] of raum.state.spieler) {
    if (osid === sid || o.ebene !== p.ebene || o.unten) continue;
    const ox = raum.extra.get(osid);
    if (ox?.bot) {
      const z = ox.bot.uebergangZiel;
      if (!z || abstand(z, ziel) > 6 * R) continue;
      const dO = abstand(o, ziel);
      if (dO < d - 3 * R || (Math.abs(dO - d) <= 3 * R && osid < sid)) rang++;
    } else if (abstand(o, ziel) < 26 * R && abstand(o, ziel) < d) rang++;
  }
  return rang;
}

// zum Ziel gehen: Weg berechnen (gelegentlich neu), Wegpunkten folgen, Abstand zu anderen halten
function geheZu(raum, sid, p, x, ziel, tempo = 1, halt = 14) {
  const b = x.bot, jetzt = raum.uhr;
  const welt = raum.wv(p.ebene), R = welt.reich ?? 1;   // R: Maßstab der Nahbereichs-Abstände (drinnen im Feinraster kleiner)
  if (abstand(p, ziel) < halt) { x.eingabe = { dx: 0, dy: 0, s: false }; b.messPos = null; return true; }
  // Übergang (Tür/Treppe): in der Reihe warten, nur der Vorderste geht durch; die anderen stehen seitlich der Tür
  const anTuer = b.uebergangZiel === ziel;
  let dran = true;
  if (anTuer && abstand(p, ziel) < 110 * R) {
    const rang = tuerRang(raum, sid, p, ziel);
    if (rang > 0) {
      b.wartetSeit ??= jetzt;
      if (jetzt - b.wartetSeit < 3) {
        dran = false;
        const dz = abstand(p, ziel);
        if (!b.warteOrt || abstand(b.warteOrt, ziel) < 44 * R || jetzt > (b.warteBis ?? 0)) { b.warteOrt = ausweichPunkt(raum, sid, p, welt, ziel); b.warteBis = jetzt + 1.5; }
        if (b.warteOrt && abstand(p, b.warteOrt) > 8 * R && dz < 110 * R) {
          const w = b.warteOrt, l = abstand(p, w) || 1;
          x.eingabe = { dx: (w.x - p.x) / l * 0.8, dy: (w.y - p.y) / l * 0.8, s: false };
        } else x.eingabe = { dx: 0, dy: 0, s: false };
        b.messPos = null;
        return false;
      }
    } else b.wartetSeit = null;
  } else if (!anTuer) b.wartetSeit = null;
  const neu = !b.weg || jetzt - b.wegZeit > 0.8 || !b.wegZiel || abstand(b.wegZiel, ziel) > 40 * R;
  if (neu) {
    b.weg = findeWeg(welt, p.x, p.y, ziel.x, ziel.y, RAD, 40000, true) ?? [{ x: ziel.x, y: ziel.y }];
    b.wegZeit = jetzt; b.wegZiel = { x: ziel.x, y: ziel.y };
  }
  while (b.weg.length > 1 && abstand(p, b.weg[0]) < 10 * R) b.weg.shift();
  const wp = b.weg[0];
  let dx = wp.x - p.x, dy = wp.y - p.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // Abstand zu anderen Figuren (nicht durch Mitspieler hindurchdrängeln)
  // (wer an der Tür dran ist oder festhängt, drängelt nicht mit)
  const nahTuer = anTuer && dran && abstand(p, ziel) < 80 * R;
  if (!nahTuer && jetzt >= (b.ohneAbstand ?? 0)) for (const [osid, o] of raum.state.spieler) {
    if (osid === sid || o.ebene !== p.ebene || !raum.extra.get(osid)?.bot) continue;
    const d = abstand(p, o);
    if (d > 0 && d < 44 * R) { dx += (p.x - o.x) / d * (44 * R - d) / (44 * R) * 1.4; dy += (p.y - o.y) / d * (44 * R - d) / (44 * R) * 1.4; }
  }
  const n = Math.hypot(dx, dy) || 1;
  // festhängen: nach 1 s ohne Fortschritt Weg neu und kurz seitlich
  b.messZeit = (b.messZeit ?? 0) + raum.dt;
  if (b.messZeit > 1) {
    if (b.messPos && abstand(b.messPos, p) < 6 * tempoVon(welt)) {
      // Türen sind enge Stellen: öfter festgehangen → länger seitlich, und für 2 s nicht mehr von anderen Bots abdrängen lassen
      b.weg = null; b.festZahl = (b.festZahl ?? 0) + 1;
      b.seitlich = 0.5 + 0.25 * Math.min(b.festZahl, 3); b.seite = -(b.seite || 1);
      if (b.festZahl >= 2 || tuerNahe(welt, p, 60 * R)) b.ohneAbstand = jetzt + 2;
    } else b.festZahl = 0;
    b.messZeit = 0; b.messPos = { x: p.x, y: p.y };
  }
  if (b.seitlich > 0) {
    b.seitlich -= raum.dt;
    for (const sg of [b.seite, -b.seite]) {
      const sx = -dy / n * sg, sy = dx / n * sg;
      if (frei(welt, p.x + sx * 20 * R, p.y + sy * 20 * R, RAD)) { x.eingabe = { dx: sx, dy: sy, s: false }; return false; }
    }
  }
  x.eingabe = { dx: dx / n * tempo, dy: dy / n * tempo, s: tempo < 0.55 };
  return false;
}

function naechster(liste, p, max, bedingung = () => true, ort = e => e) {
  let best = null, bd = max;
  for (const e of liste) { const d = abstand(p, ort(e)); if (d < bd && bedingung(e)) { bd = d; best = e; } }
  return best;
}

export function botSchritt(raum, sid, p, x, dt) {
  raum.dt = dt; raum.uhr = (raum.state.zeit ?? 0);
  const b = x.bot, afk = !!b.afk;   // afk: untätiger Mensch, den der Bot spielt (raum.mjs, afkPruefen): folgt, wehrt sich, versorgt sich – kein Planer, kein Erkunden
  // „Mensch“, dem Bots folgen: kein Bot und nicht selbst AFK; ein AFK-Spieler folgt jedem anderen Mitspieler (auch Bots)
  const echt = s => { const o = raum.extra.get(s); return s !== sid && !o?.afkBot && (afk || !o?.bot); };
  x.eingabe = { dx: 0, dy: 0, s: false };
  b.uebergangZiel = null;
  if (p.unten || p.anBord || p.zombie > 0) { b.weg = null; x.eingabe = { dx: 0, dy: 0, s: false }; return; }   // an Bord: sitzt
  if (raum.tausche?.has(sid)) return;   // beim Tauschen stillhalten
  versorgen(p, b, raum.uhr);
  // beim Durchsuchen stillstehen – außer ein Zombie kommt zu nah
  if (p.aktion) {
    const nah = [...raum.state.zombies.values()].some(z => (z.ebene ?? '') === (p.ebene ?? '') && abstand(p, z) < 110 * (raum.wv(p.ebene).reich ?? 1));
    if (!nah) return;
    p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
  }

  const welt = raum.wv(p.ebene), R = welt.reich ?? 1;
  const alleSpieler = [...raum.state.spieler.entries()];
  const spieler = alleSpieler.filter(([, o]) => o.ebene === p.ebene);
  const zombies = [...raum.state.zombies.values()].filter(z => (z.ebene ?? '') === p.ebene);

  // 1. Liegenden Mitspieler aufhelfen
  const liegend = naechster(spieler.map(([, o]) => o), p, 420, o => o !== p && o.unten && !(o.zombie > 0));
  if (liegend) { geheZu(raum, sid, p, x, liegend, 1, 24 * R); return; }

  // 2. Kämpfen oder fliehen
  const waffe = bewaffnet(p);
  const gefahr = naechster(zombies, p, waffe === 'fern' ? 260 : 170, z => waffe === 'fern' ? sichtGuete(welt, p.x, p.y, z.x, z.y) > 0 : sichtfrei(welt, p.x, p.y, z.x, z.y));
  if (gefahr) {
    const d = abstand(p, gefahr);
    if (waffe === 'fern') {
      // Schussabstand halten: zu nah → zurück, zu weit → heran (schießen tut der Server)
      if (d < 90 * R) { const w = Math.atan2(p.y - gefahr.y, p.x - gefahr.x); const ziel = { x: p.x + Math.cos(w) * 60 * R, y: p.y + Math.sin(w) * 60 * R }; if (frei(welt, ziel.x, ziel.y, RAD)) { geheZu(raum, sid, p, x, ziel); return; } }
      else if (d > 200 * R) { geheZu(raum, sid, p, x, gefahr, 1, 180 * R); return; }
      else return;   // im Schussabstand stehen bleiben
    } else if (waffe === 'nah') {
      // auf Zombies losgehen, die jemanden jagen oder nah sind
      if (gefahr.jagt || d < 80 * R) { geheZu(raum, sid, p, x, gefahr, 1, 22 * R); return; }
    } else if (gefahr.jagt && d < 100 * R) {
      const w = Math.atan2(p.y - gefahr.y, p.x - gefahr.x);
      for (const dw of [0, 0.6, -0.6, 1.2, -1.2]) {
        const ziel = { x: p.x + Math.cos(w + dw) * 70 * R, y: p.y + Math.sin(w + dw) * 70 * R };
        if (frei(welt, ziel.x, ziel.y, RAD)) { geheZu(raum, sid, p, x, ziel); return; }
      }
    }
  }

  // 2a. Team-Planer (botplan.mjs): Auftrag ausführen (holen, funken, barrikadieren, jagen, Bus …), sonst weiter unten wie bisher
  if (!afk && (!gefahr || (!gefahr.jagt && abstand(p, gefahr) > 90 * R)) && planSchritt(raum, sid, p, x, { geheZu })) return;

  // 2b. Gelegenheit: Überzähliges ablegen, Brauchbares aufheben, in der Nähe durchsuchen – solange der Mensch nicht weit weg ist
  // sind alle Menschen auf einer anderen Ebene (z. B. schon draußen), hat Folgen Vorrang vor Kiste und Ablegen
  const menschWoanders = [...raum.state.spieler.entries()].some(([s, o]) => echt(s) && !o.unten && !(o.zombie > 0))
    && ![...raum.state.spieler.entries()].some(([s, o]) => echt(s) && !o.unten && !(o.zombie > 0) && o.ebene === p.ebene);
  if (!afk && !gefahr && !menschWoanders && (vorratskiste(raum, sid, p, x, welt) || ueberzaehligesAblegen(raum, p, b))) return;
  const mensch = naechster(spieler.filter(([s, o]) => echt(s) && !o.unten).map(([, o]) => o), p, Infinity);
  if (!afk && !gefahr && mensch && abstand(p, mensch) < 260 && (aufheben(raum, sid, p, x, welt) || durchsuchen(raum, sid, p, x, welt))) return;

  // 3. Dem nächsten Menschen folgen – auf festem Platz hinter ihm (ist er auf einer anderen Ebene: zum Übergang)
  const ueberall = alleSpieler.filter(([s, o]) => echt(s) && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  if (ueberall.length && !ueberall.some(o => o.ebene === p.ebene)) {
    const punkt = raum.uebergangsPunkt(p.ebene, ueberall[0].ebene);
    if (punkt) { b.uebergangZiel = punkt; geheZu(raum, sid, p, x, punkt, 1, 2); return; }
  }
  const menschen = spieler.filter(([s, o]) => echt(s) && !o.unten && !(o.zombie > 0)).map(([, o]) => o);
  const anfuehrer = naechster(menschen, p, Infinity);
  if (anfuehrer) {
    const bots = alleSpieler.filter(([s]) => raum.extra.get(s)?.bot).map(([s]) => s).sort();
    const nr = Math.max(0, bots.indexOf(sid));
    const d = abstand(p, anfuehrer);
    const drinnen = !!p.ebene;
    // Erkunder (alle außer den ersten beiden): streifen draußen in der Nähe umher, kommen bei Abstand näher
    if (nr >= 2 && !drinnen && d < 320) {
      if (!b.streifZiel || raum.uhr > b.streifBis || abstand(b.streifZiel, anfuehrer) > 300) {
        for (let v = 0; v < 12; v++) {
          const w = Math.random() * Math.PI * 2, r = 120 + Math.random() * 140;
          const z = { x: anfuehrer.x + Math.cos(w) * r, y: anfuehrer.y + Math.sin(w) * r };
          if (frei(welt, z.x, z.y, RAD)) { b.streifZiel = z; break; }
        }
        b.streifBis = raum.uhr + 6 + Math.random() * 6;
      }
      if (b.streifZiel) { geheZu(raum, sid, p, x, b.streifZiel, 0.6, 18); return; }
    }
    // Begleiter: feste, weit verteilte Plätze hinter dem Menschen – kein Zurückweichen, wenn er herankommt
    const n = Math.min(2, Math.max(1, bots.length));
    const winkel = anfuehrer.richtung + Math.PI + ((nr % 2) - (n - 1) / 2) * 1.1;
    const entf = drinnen ? 55 * R : 75 + (nr % 2) * 30;
    let platz = { x: anfuehrer.x + Math.cos(winkel) * entf, y: anfuehrer.y + Math.sin(winkel) * entf };
    if (!frei(welt, platz.x, platz.y, RAD) || !sichtfrei(welt, anfuehrer.x, anfuehrer.y, platz.x, platz.y)) platz = anfuehrer;
    // nah genug: stehen bleiben (auch wenn der Mensch auf den Bot zugeht) – im Safe Room aber nicht vor der Eingangstür
    // – nie in einer Tür (Haustür, Innentür, Ausgang, Treppe) stehen bleiben: seitlich daneben Platz machen
    const tuerPunkt = tuerNahe(welt, p, 46 * R);
    if (d < 70 * R && !tuerPunkt) return;
    if (d < 70 * R && tuerPunkt) {
      const aus = ausweichPunkt(raum, sid, p, welt, tuerPunkt, anfuehrer);
      if (aus) { geheZu(raum, sid, p, x, aus, 0.8, 8 * R); return; }
      return;
    }
    const tempo = anfuehrer.schleicht ? 0.45 : d > 180 ? 1 : 0.8;
    geheZu(raum, sid, p, x, platz, tempo, (platz === anfuehrer ? 60 : 18) * R);
    return;
  }

  // 4. Niemand da: nach draußen und in den nächsten Safe Room
  if (safeRoomVon(raum.welt, p)) return;   // schon im Safe Room: dort warten
  if (p.ebene) { const raus = raum.uebergangsPunkt(p.ebene, ''); if (raus) { b.uebergangZiel = raus; geheZu(raum, sid, p, x, raus, 1, 2); } return; }
  const safe = naechster(raum.welt.safeRooms, p, Infinity, () => true, r => r.vorTuer);
  if (safe) { const tuer = raum.uebergangsPunkt('', safe.ebene); b.uebergangZiel = tuer; geheZu(raum, sid, p, x, tuer, 1, 2); }
}
