// Welten in IndexedDB (je Schlüssel aus weltSchluessel, enthält WELT_VERSION). Läuft im Haupt-Thread und im Web Worker.
// Jede Funktion fällt bei Fehlern (privater Modus, Kontingent, gesperrte DB) still auf „nicht vorhanden“ zurück.
const DB = 'zob_welten', STORE = 'welten', BEHALTEN = 3;

function oeffnen() {
  return new Promise((ja, nein) => {
    if (typeof indexedDB === 'undefined') return nein(new Error('kein IndexedDB'));   // i18n-ok: nur intern
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => ja(q.result);
    q.onerror = () => nein(q.error);
    q.onblocked = () => nein(new Error('blockiert'));
  });
}
const anfrage = r => new Promise((ja, nein) => { r.onsuccess = () => ja(r.result); r.onerror = () => nein(r.error); });
const fertig = tx => new Promise((ja, nein) => { tx.oncomplete = () => ja(); tx.onerror = () => nein(tx.error); tx.onabort = () => nein(tx.error); });

// Zwischengespeicherte Welt (ohne `hole`) oder null
export async function weltAusIdb(key) {
  let db;
  try {
    db = await oeffnen();
    const rec = await anfrage(db.transaction(STORE).objectStore(STORE).get(key));
    return rec?.welt ?? null;
  } catch { return null; } finally { try { db?.close(); } catch { /* egal */ } }
}

export async function weltHatIdb(key) {
  let db;
  try { db = await oeffnen(); return (await anfrage(db.transaction(STORE).objectStore(STORE).count(key))) > 0; }
  catch { return false; } finally { try { db?.close(); } catch { /* egal */ } }
}

// Welt speichern (ohne `hole`) und alte Einträge entfernen (nur die letzten BEHALTEN bleiben)
export async function weltInIdb(key, welt) {
  let db;
  try {
    db = await oeffnen();
    const tx = db.transaction(STORE, 'readwrite'), os = tx.objectStore(STORE);
    os.put({ t: Date.now(), welt }, key);
    const alle = await new Promise((ja, nein) => {
      const r = os.openCursor(), liste = [];
      r.onsuccess = () => { const c = r.result; if (c) { liste.push({ k: c.key, t: c.value?.t ?? 0 }); c.continue(); } else ja(liste); };
      r.onerror = () => nein(r.error);
    });
    alle.sort((a, b) => b.t - a.t);
    for (const e of alle.slice(BEHALTEN)) os.delete(e.k);
    await fertig(tx);
    return true;
  } catch { return false; } finally { try { db?.close(); } catch { /* egal */ } }
}
