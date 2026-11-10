// Vollständige Sicherung aller Firestore-Collections als JSON.
//
//   node export.mjs
//
// Schreibt nach migration/backup/firestore-export-<Zeitstempel>.json (nicht im Git).
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, initAdmin } from './lib.mjs';

const db = await initAdmin();
const collections = await db.listCollections();
const result = { exportedAt: new Date().toISOString(), collections: {} };

for (const collection of collections) {
  const snap = await collection.get();
  result.collections[collection.id] = Object.fromEntries(snap.docs.map(doc => [doc.id, doc.data()]));
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const file = path.join(BACKUP_DIR, `firestore-export-${result.exportedAt.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(result, null, 2));

console.log(`Sicherung gespeichert: ${file}`);
for (const [name, docs] of Object.entries(result.collections)) {
  console.log(`  ${name.padEnd(14)} ${Object.keys(docs).length} Dokumente`);
}
