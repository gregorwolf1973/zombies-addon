// Stimmenverwaltung: Dauerfeuer darf nie still werden
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stimmeZuweisen } from '../client/tonlogik.mjs';

test('MG-Dauerfeuer: jeder Schuss wird abgespielt, der älteste eigene Ton wird abgelöst', () => {
  const stimmen = [];
  // 11 Schüsse pro Sekunde, jeder 1 s lang, dazu 4 Zombie-Stimmen
  for (let i = 0; i < 4; i++) stimmen.push({ ende: 99, v: 0.6, zombie: true, quelle: null });
  let jetzt = 0, verworfen = 0;
  for (let i = 0; i < 60; i++) {
    jetzt += 0.09;
    const r = stimmeZuweisen(stimmen, { jetzt, zombie: false, v: 0.3, quelle: 'schussGewehr:0,0' });
    if (!r.ok) { verworfen++; continue; }
    stimmen.push({ ende: jetzt + 1, v: 0.3, zombie: false, quelle: 'schussGewehr:0,0' });
  }
  assert.equal(verworfen, 0);
  assert.ok(stimmen.filter(q => q.quelle).length <= 3);
});

test('ohne Quelle: alte Begrenzung (leiseste weicht, leisere neue wird verworfen)', () => {
  const stimmen = [];
  for (let i = 0; i < 10; i++) stimmen.push({ ende: 9, v: 0.5, zombie: false, quelle: null });
  assert.equal(stimmeZuweisen(stimmen, { jetzt: 0, zombie: false, v: 0.2 }).ok, false);
  assert.equal(stimmeZuweisen(stimmen, { jetzt: 0, zombie: false, v: 0.9 }).ok, true);
  assert.equal(stimmen.length, 9);
});

test('Zombie-Stimmen bleiben auf 5 begrenzt', () => {
  const stimmen = [];
  for (let i = 0; i < 5; i++) stimmen.push({ ende: 9, v: 0.5, zombie: true, quelle: null });
  assert.equal(stimmeZuweisen(stimmen, { jetzt: 0, zombie: true, v: 0.1 }).ok, false);
});
