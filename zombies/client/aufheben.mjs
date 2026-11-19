// Aufheben mit Auswahl: Leiste mit großen Symbol-Knöpfen (Handy), bei vollem Rucksack zweiter Schritt "Was ablegen?"
import { DINGE, AKTION_ABSTAND } from './welt.mjs';

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
  return !((DINGE[ding]?.waffe && !ich.waffe) || ding === 'munition' || (ding === 'taschenlampe' && !(ich.lampe > 0)) || (ding === 'kleidung' && !(ich.kleidung > 0)));
}

let leiste = null;
export function auswahlZu() { if (leiste) { leiste.remove(); leiste = null; } }

function knopf(zeichen, text, onclick, klasse = '') {
  const b = document.createElement('button');
  b.className = 'aufh-knopf ' + klasse;
  b.innerHTML = `<span class="z">${zeichen}</span><span class="t">${text}</span>`;
  b.onclick = e => { e.stopPropagation(); onclick(); };
  return b;
}

function hinstellen(titel, knoepfe) {
  auswahlZu();
  leiste = document.createElement('div');
  leiste.id = 'aufheben-wahl';
  const t = document.createElement('div'); t.className = 'aufh-titel'; t.textContent = titel;
  const reihe = document.createElement('div'); reihe.className = 'aufh-reihe';
  reihe.append(...knoepfe);
  leiste.append(t, reihe);
  leiste.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.appendChild(leiste);
}

// raum: Colyseus-Raum, ich: eigener Spieler, dinge: naheBodenDinge()
export function auswahlAuf(raum, ich, dinge) {
  const abbruch = knopf('✖', 'Abbrechen', auswahlZu, 'zweit');
  const waehle = it => {
    if (!brauchtPlatz(it.ding, ich) || ich.rucksack.length < ich.plaetze) { raum.send('aufheben_wahl', { id: it.id }); auswahlZu(); return; }
    const plaetze = [...ich.rucksack].map((d, i) => knopf(DINGE[d]?.zeichen ?? '?', DINGE[d]?.name ?? d, () => { raum.send('aufheben_wahl', { id: it.id, platz: i }); auswahlZu(); }));
    hinstellen(`Rucksack voll – was ablegen für ${DINGE[it.ding]?.zeichen ?? ''} ${DINGE[it.ding]?.name ?? it.ding}?`, [...plaetze, abbruch]);
  };
  hinstellen('Was aufheben?', [...dinge.map(it => knopf(DINGE[it.ding]?.zeichen ?? '?', DINGE[it.ding]?.name ?? it.ding, () => waehle(it))), abbruch]);
}
