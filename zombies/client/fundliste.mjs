// Fundliste nach „Alles durchsuchen“: alle Funde der Behälter, „Alles nehmen“ und einzeln nehmen
import { DINGE, BEHAELTER_NAME } from './welt.mjs';
import { dingIcon } from './dingbild.mjs';
import { NIMM_WEITE } from './durchsuche_alle.mjs';

let feld = null, ursprung = null;
export function fundZu() { if (feld) { feld.remove(); feld = null; ursprung = null; } }

// Schließt die Liste, wenn man sich weit entfernt hat (der Server nimmt dann ohnehin nichts mehr heraus)
export function fundPruefen(lok) {
  if (feld && ursprung && lok && Math.hypot(lok.x - ursprung.x, lok.y - ursprung.y) > NIMM_WEITE + 40) fundZu();
}

const sicher = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// raum: Colyseus-Raum; m: { eintraege: [{ id, art, dinge }] }; lok: eigene Position
export function fundZeigen(raum, m, lok, meldung) {
  const liste = (m?.eintraege ?? []).filter(e => e.dinge?.length);
  if (!liste.length) { fundZu(); if (m?.neu) meldung?.('Nichts Brauchbares gefunden'); return; }
  if (!feld) { ursprung = lok ? { x: lok.x, y: lok.y } : null; }
  const alt = feld;
  feld = document.createElement('div');
  feld.id = 'aufheben-wahl';
  feld.classList.add('fundliste');
  alt?.remove();
  const titel = document.createElement('div'); titel.className = 'aufh-titel'; titel.textContent = '🔍 Gefunden';
  feld.append(titel);
  for (const e of liste) {
    const z = document.createElement('div'); z.className = 'fund-zeile';
    const n = document.createElement('div'); n.className = 'fund-name'; n.innerHTML = sicher(BEHAELTER_NAME[e.art] ?? e.art);
    const r = document.createElement('div'); r.className = 'aufh-reihe';
    e.dinge.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'aufh-knopf'; b.innerHTML = `<span class="z">${dingIcon(d, 28)}</span><span class="t">${sicher(DINGE[d]?.name ?? d)}</span>`;
      b.onclick = ev => { ev.stopPropagation(); raum.send('fund_nimm', { id: e.id, i }); };
      r.append(b);
    });
    z.append(n, r); feld.append(z);
  }
  const fuss = document.createElement('div'); fuss.className = 'aufh-reihe'; fuss.style.marginTop = '8px';
  const alle = document.createElement('button'); alle.className = 'aufh-knopf'; alle.innerHTML = '<span class="z">🎒</span><span class="t">Alles nehmen</span>';
  alle.onclick = ev => { ev.stopPropagation(); raum.send('fund_nimm', { alle: true }); };
  const zu = document.createElement('button'); zu.className = 'aufh-knopf zweit'; zu.innerHTML = '<span class="z">✖</span><span class="t">Schließen</span>';
  zu.onclick = ev => { ev.stopPropagation(); fundZu(); };
  fuss.append(alle, zu); feld.append(fuss);
  feld.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.appendChild(feld);
}
