// Importiert die TKKG-Stammdaten (migration/data/tkkg-episodes.json) nach Firestore: tkkg_episodes.
//
//   node import-tkkg.mjs --dry-run   # nur prüfen
//   node import-tkkg.mjs             # anlegen + verifizieren
//
// Wie die Migration: legt nur fehlende Dokumente an, überschreibt nie und bricht ab,
// wenn ein vorhandenes Dokument abweicht. Bestehende Drei-???-Daten werden nicht berührt.
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATION_DIR, initAdmin, readCollection, sameDoc } from './lib.mjs';

const COLLECTION = 'tkkg_episodes';
const dryRun = process.argv.includes('--dry-run');
const source = JSON.parse(fs.readFileSync(path.join(MIGRATION_DIR, 'data', 'tkkg-episodes.json'), 'utf8'));

const docs = new Map();
const errors = [];
source.episodes.forEach((episode, index) => {
  const id = String(episode.folgeId || '');
  if (!/^[FS]-\d{3}$/.test(id)) errors.push(`Ungültige Folge-ID: ${JSON.stringify(episode)}`);
  if (docs.has(id)) errors.push(`Doppelte Folge-ID: ${id}`);
  if (!episode.titel) errors.push(`Folge ohne Titel: ${id}`);
  docs.set(id, { nr: episode.nr, titel: episode.titel, jahr: episode.jahr, cover: '', folgeId: id, order: index });
});
if (errors.length) {
  errors.forEach(e => console.error(`FEHLER: ${e}`));
  process.exit(1);
}

const db = await initAdmin();
const existing = await readCollection(db, COLLECTION);
const toCreate = [];
const conflicts = [];
for (const [id, doc] of docs) {
  const current = existing.get(id);
  if (!current) toCreate.push([id, doc]);
  else if (!sameDoc(current, doc)) conflicts.push(`${id}\n    Firestore: ${JSON.stringify(current)}\n    Datei:     ${JSON.stringify(doc)}`);
}

console.log(`Datei: ${docs.size} Folgen | Firestore: ${existing.size} | neu: ${toCreate.length} | identisch: ${docs.size - toCreate.length - conflicts.length} | Konflikte: ${conflicts.length}`);
if (conflicts.length) {
  conflicts.forEach(c => console.error(`KONFLIKT: ${c}`));
  console.error('Abbruch: Es wurde nichts geschrieben.');
  process.exit(1);
}
if (dryRun) {
  console.log('--dry-run: Es wurde nichts geschrieben.');
  process.exit(0);
}

for (let i = 0; i < toCreate.length; i += 400) {
  const batch = db.batch();
  toCreate.slice(i, i + 400).forEach(([id, doc]) => batch.create(db.collection(COLLECTION).doc(id), doc));
  await batch.commit();
}
console.log(`${toCreate.length} Folgen angelegt.`);

const after = await readCollection(db, COLLECTION);
const missing = [...docs.keys()].filter(id => !after.has(id) || !sameDoc(after.get(id), docs.get(id)));
console.log(missing.length ? `VERIFIKATION FEHLGESCHLAGEN: ${missing.join(', ')}` : `VERIFIKATION OK: alle ${docs.size} Folgen identisch in ${COLLECTION}.`);
process.exit(missing.length ? 1 : 0);
