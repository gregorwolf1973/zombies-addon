// Spielstand in SQLite (node:sqlite, ab Node 22 eingebaut – keine nativen Pakete nötig)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export class Speicher {
  constructor(datei = ':memory:') {
    if (datei !== ':memory:') fs.mkdirSync(path.dirname(datei), { recursive: true });
    this.db = new DatabaseSync(datei);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS welt (
        schluessel TEXT PRIMARY KEY,
        wert TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS spieler (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        daten TEXT NOT NULL,
        geaendert INTEGER NOT NULL
      );
    `);
    this._weltLesen = this.db.prepare('SELECT wert FROM welt WHERE schluessel = ?');
    this._weltSchreiben = this.db.prepare(
      'INSERT INTO welt (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert');
    this._spielerLesen = this.db.prepare('SELECT name, daten FROM spieler WHERE id = ?');
    this._spielerSchreiben = this.db.prepare(
      `INSERT INTO spieler (id, name, daten, geaendert) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, daten = excluded.daten, geaendert = excluded.geaendert`);
  }

  ladeWelt() {
    const z = this._weltLesen.get('stand');
    return z ? JSON.parse(z.wert) : null;
  }

  speichereWelt(stand) {
    this._weltSchreiben.run('stand', JSON.stringify(stand));
  }

  ladeSpieler(id) {
    const z = this._spielerLesen.get(id);
    return z ? { name: z.name, ...JSON.parse(z.daten) } : null;
  }

  speichereSpieler(id, name, daten) {
    this._spielerSchreiben.run(id, name, JSON.stringify(daten), Date.now());
  }

  // mehrere Schreibvorgänge in einem Rutsch
  transaktion(f) {
    this.db.exec('BEGIN');
    try { f(); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  schliessen() { try { this.db.close(); } catch {} }
}
