// Aufheben mit Auswahl: Leiste mit großen Symbol-Knöpfen (Handy), bei vollem Rucksack zweiter Schritt "Was ablegen?"
import { DINGE, AKTION_ABSTAND } from './welt.mjs';
import { dingIcon, dingHtml } from './dingbild.mjs';
import { dingId, dingN, kannAufnehmen, blockGrund } from './stapel.mjs';

// Bodengegenstände im Aufhebe-Radius, nächster zuerst: [{ id, ding, d }]
export function naheBodenDinge(boden, ich) {
  const l = [];
  for (const [id, b] of boden) {
    if ((b.ebene ?? '') !== (ich.ebene ?? '')) continue;
    const d = Math.hypot(b.x - ich.x, b.y - ich.y);
    if (d < AKTION_ABSTAND) l.push({ id, ding: b.ding, d });
  }
  return l.sort((a, b) => a.d - b.d);
}

// braucht der Gegenstand einen Rucksackplatz? (Waffe/Munition/Lampe/Kleidung werden direkt genutzt)
export function brauchtPlatz(ding, ich) {
  return !((DINGE[ding]?.waffe && !ich.waffe) || ding === 'munition' || ding === 'pfeil' || ding === 'granate40' || (ding === 'taschenlampe' && !(ich.lampe > 0)) || (ding === 'kleidung' && !(ich.kleidung > 0)));
}

let leiste = null, zustand = null;   // zustand: { raum, schritt: 'wahl' | { item }, sig, weg: Set }
export function auswahlZu() {
  if (leiste) { leiste.remove(); leiste = null; }
  zustand = null;
  document.removeEventListener('keydown', escZu);
}
function escZu(e) { if (e.key === 'Escape') auswahlZu(); }
export const auswahlOffen = () => !!leiste;

function knopf(zeichen, text, onclick, klasse = '') {
  const b = document.createElement('button');
  b.className = 'aufh-knopf ' + klasse;
  b.innerHTML = `<span class="z">${zeichen}</span><span class="t">${text}</span>`;
  b.onclick = e => { e.stopPropagation(); onclick(); };
  return b;
}

function hinstellen(titel, knoepfe) {
  if (leiste) { leiste.remove(); leiste = null; }
  leiste = document.createElement('div');
  leiste.id = 'aufheben-wahl';
  const t = document.createElement('div'); t.className = 'aufh-titel'; t.innerHTML = titel;   // HTML: Titel mit Gegenstands-Icon
  const reihe = document.createElement('div'); reihe.className = 'aufh-reihe';
  reihe.append(...knoepfe);
  leiste.append(t, reihe);
  leiste.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.appendChild(leiste);
  document.removeEventListener('keydown', escZu);
  document.addEventListener('keydown', escZu);
}

// Das Fenster bleibt offen und zeigt immer den aktuellen Inhalt; es schließt nur, wenn nichts mehr da ist (auswahlPruefen),
// oder auf ✖/Esc.
function zeichne(ich, dinge) {
  const z = zustand;
  const abbruch = knopf('✖', 'Abbrechen', auswahlZu, 'zweit');
  const wahl = () => { z.schritt = 'wahl'; z.sig = null; zeichne(ich, dinge); };
  const gesendet = id => { z.weg.add(id); z.schritt = 'wahl'; z.sig = null; };
  const waehle = it => {   // bei zweiter Tasche antwortet der Server mit einer Meldung
    if (!brauchtPlatz(it.ding, ich) || kannAufnehmen(ich.rucksack, ich.plaetze, it.ding) || blockGrund(ich.rucksack, ich.plaetze, it.ding) === 'tasche') {
      z.raum.send('aufheben_wahl', { id: it.id }); gesendet(it.id); zeichne(ich, dinge.filter(d => d.id !== it.id)); return;
    }
    z.schritt = { item: it };
    zeichne(ich, dinge);
  };
  if (z.schritt !== 'wahl') {
    const it = z.schritt.item;
    const plaetze = [...ich.rucksack].map((e, i) => knopf(dingIcon(dingId(e), 34), (DINGE[dingId(e)]?.name ?? dingId(e)) + (dingN(e) > 1 ? ` ×${dingN(e)}` : ''), () => {
      z.raum.send('aufheben_wahl', { id: it.id, platz: i }); gesendet(it.id); zeichne(ich, dinge.filter(d => d.id !== it.id));
    }));
    const zurueck = knopf('↩', 'Zurück', wahl, 'zweit');
    hinstellen(`Rucksack voll – was ablegen für ${dingHtml(it.ding, 22)}?`, [...plaetze, zurueck, abbruch]);
    return;
  }
  if (!dinge.length) { auswahlZu(); return; }
  hinstellen('Was aufheben?', [...dinge.map(it => knopf(dingIcon(it.ding, 34), DINGE[it.ding]?.name ?? it.ding, () => waehle(it))), abbruch]);
}

// raum: Colyseus-Raum, ich: eigener Spieler, dinge: naheBodenDinge()
export function auswahlAuf(raum, ich, dinge) {
  zustand = { raum, schritt: 'wahl', sig: dinge.map(d => d.id).join(','), weg: new Set() };
  zeichne(ich, dinge);
}

// Pro Frame: Inhalt aktualisieren (nichts schließt von selbst, außer es ist nichts mehr zum Aufheben da)
export function auswahlPruefen(boden, ich, pos) {
  if (!zustand || !leiste) return;
  const nah = naheBodenDinge(boden, { x: pos.x, y: pos.y, ebene: ich.ebene }).filter(d => !zustand.weg.has(d.id));
  for (const id of [...zustand.weg]) if (!boden.has(id)) zustand.weg.delete(id);
  if (!nah.length) return auswahlZu();
  if (zustand.schritt !== 'wahl') {
    if (!nah.some(d => d.id === zustand.schritt.item.id)) zustand.schritt = 'wahl';   // gewählter Gegenstand ist weg → zurück zur Liste
    else return;
  }
  const sig = nah.map(d => d.id).join(',');
  if (sig === zustand.sig && zustand.schritt === 'wahl') return;
  zustand.sig = sig;
  zeichne(ich, nah);
}
