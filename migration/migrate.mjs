// Migriert Folgen, Nutzer und Bewertungen aus dem Google Sheet nach Firestore.
//
//   node migrate.mjs                    # live aus dem Sheet (Backup wird zuerst gespeichert)
//   node migrate.mjs --source <datei>   # aus einem gespeicherten Export
//   node migrate.mjs --dry-run          # nur planen und prüfen, nichts schreiben
//
// Sicherheitsprinzipien:
//  - Es wird erst vollständig geplant und geprüft, danach geschrieben.
//  - Bestehende Dokumente werden nie überschrieben. Weicht ein vorhandenes Dokument ab,
//    bricht die Migration ab, bevor irgendetwas geschrieben wird.
//  - Erneutes Ausführen ist gefahrlos: identische Dokumente werden übersprungen,
//    nur fehlende ergänzt (z. B. Bewertungen, die nach dem ersten Lauf noch im Sheet entstanden).
//  - Nichts wird gelöscht. Danach läuft automatisch die Verifikation.
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_DIR, buildTargetDocs, initAdmin, loadSource, newInviteCode, parseArgs, readCollection, sameDoc
} from './lib.mjs';
import { verify } from './verify.mjs';

const args = parseArgs(process.argv.slice(2));
const data = await loadSource(args.source);
const target = buildTargetDocs(data);

console.log(`Export: ${target.episodes.size} Folgen, ${target.users.size} Nutzer, ${target.ratings.size} Bewertungen`);
target.warnings.forEach(w => console.warn(`WARNUNG: ${w}`));
if (target.errors.length) {
  target.errors.forEach(e => console.error(`FEHLER: ${e}`));
  console.error('\nAbbruch: Der Export ist nicht eindeutig migrierbar. Es wurde nichts geschrieben.');
  process.exit(1);
}

const db = await initAdmin();
const existing = {
  episodes: await readCollection(db, 'episodes'),
  users: await readCollection(db, 'users'),
  ratings: await readCollection(db, 'ratings')
};

const writes = [];
const conflicts = [];
const stats = { episodes: [0, 0], users: [0, 0], ratings: [0, 0] }; // [neu, unverändert]

function plan(collection, docs, compareKeys) {
  for (const [id, doc] of docs) {
    const current = existing[collection].get(id);
    if (!current) {
      writes.push({ collection, id, doc });
      stats[collection][0]++;
      continue;
    }
    const pick = obj => compareKeys ? Object.fromEntries(compareKeys.map(k => [k, obj[k]])) : obj;
    if (sameDoc(pick(current), pick(doc))) stats[collection][1]++;
    else conflicts.push(`${collection}/${id}\n    Firestore: ${JSON.stringify(pick(current))}\n    Sheet:     ${JSON.stringify(pick(doc))}`);
  }
}

plan('episodes', target.episodes);
// Bei Nutzern nur die Sheet-Felder vergleichen (authUid/linkCode entstehen erst beim Verknüpfen).
plan('users', target.users, ['id', 'name', 'registriertAm']);
plan('ratings', target.ratings);

if (conflicts.length) {
  console.error(`\n${conflicts.length} Konflikt(e) – vorhandene Firestore-Dokumente weichen vom Sheet ab:`);
  conflicts.forEach(c => console.error(`  ${c}`));
  console.error('\nAbbruch: Es wurde nichts geschrieben. Bitte Konflikte manuell klären.');
  process.exit(1);
}

// Einladungscodes nur für neu angelegte Nutzer.
const newUserIds = writes.filter(w => w.collection === 'users').map(w => w.id);
const invites = newUserIds.map(userId => ({ userId, name: target.users.get(userId).name, code: newInviteCode() }));
invites.forEach(i => writes.push({ collection: 'inviteCodes', id: i.code, doc: { userId: i.userId, createdAt: new Date().toISOString() } }));

// Fall des Tages: aktuellen Stand übernehmen, falls noch keiner existiert.
const dailyRef = db.doc('meta/daily');
const dailyExists = (await dailyRef.get()).exists;
if (!dailyExists && data.dailyState && data.dailyState.selectedEpisodeId && target.episodes.has(data.dailyState.selectedEpisodeId)) {
  writes.push({
    collection: 'meta', id: 'daily', doc: {
      caseDate: data.dailyState.caseDate,
      shufflePeriodKey: data.dailyState.periodKey,
      selectedEpisodeId: data.dailyState.selectedEpisodeId,
      selectedAt: data.dailyState.selectedAt,
      shufflesByUser: {}
    }
  });
}

console.log('\nPlan:');
for (const [name, [created, unchanged]] of Object.entries(stats)) {
  console.log(`  ${name.padEnd(9)} neu: ${String(created).padStart(4)}   bereits identisch vorhanden: ${unchanged}`);
}
console.log(`  inviteCodes neu: ${invites.length}`);

if (args.dryRun) {
  console.log('\n--dry-run: Es wurde nichts geschrieben.');
  process.exit(0);
}

// Schreiben in Batches; create() schlägt fehl, falls ein Dokument inzwischen doch existiert.
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  writes.slice(i, i + 400).forEach(w => batch.create(db.collection(w.collection).doc(w.id), w.doc));
  await batch.commit();
}
console.log(`\n${writes.length} Dokumente geschrieben.`);

if (invites.length) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, 'invite-codes.txt');
  fs.appendFileSync(file, invites.map(i => `${i.name}\t${i.userId}\t${i.code}`).join('\n') + '\n');
  console.log(`\nEinladungscodes (auch gespeichert in ${file}):`);
  invites.forEach(i => console.log(`  ${i.name.padEnd(12)} ${i.code}`));
}

console.log('\nStarte Verifikation…');
const ok = await verify(db, data);
process.exit(ok ? 0 : 1);
