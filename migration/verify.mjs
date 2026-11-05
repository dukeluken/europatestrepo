// Prüft, dass jeder Datensatz aus dem Google Sheet vollständig und unverändert in Firestore liegt.
//
//   node verify.mjs                    # gegen den aktuellen Live-Stand des Sheets
//   node verify.mjs --source <datei>   # gegen einen gespeicherten Export
//
// Exit-Code 0 = nichts verloren, 1 = Abweichungen gefunden.
import { buildTargetDocs, initAdmin, loadSource, parseArgs, readCollection, sameDoc } from './lib.mjs';

export async function verify(db, data) {
  const target = buildTargetDocs(data);
  if (target.errors.length) {
    target.errors.forEach(e => console.error(`FEHLER im Export: ${e}`));
    return false;
  }

  const actual = {
    episodes: await readCollection(db, 'episodes'),
    users: await readCollection(db, 'users'),
    ratings: await readCollection(db, 'ratings')
  };

  let ok = true;
  const report = (collection, docs, compareKeys) => {
    const missing = [];
    const changed = [];
    const editedLater = [];
    for (const [id, expected] of docs) {
      const doc = actual[collection].get(id);
      if (!doc) { missing.push(id); continue; }
      const pick = obj => compareKeys ? Object.fromEntries(compareKeys.map(k => [k, obj[k]])) : obj;
      if (sameDoc(pick(doc), pick(expected))) continue;
      // Bewertung wurde nach der Migration in der neuen App bearbeitet: kein Verlust.
      if (collection === 'ratings' && doc.id === expected.id && doc.nutzerId === expected.nutzerId
          && new Date(doc.datum) > new Date(expected.datum)) {
        editedLater.push(id);
        continue;
      }
      changed.push(`${id}\n      Firestore: ${JSON.stringify(pick(doc))}\n      Sheet:     ${JSON.stringify(pick(expected))}`);
    }
    const onlyInFirestore = [...actual[collection].keys()].filter(id => !docs.has(id)).length;
    const status = missing.length || changed.length ? 'FEHLER' : 'OK';
    console.log(`  [${status}] ${collection.padEnd(9)} Sheet: ${docs.size}  vorhanden & identisch: ${docs.size - missing.length - changed.length - editedLater.length}`
      + `${editedLater.length ? `  später in App bearbeitet: ${editedLater.length}` : ''}`
      + `  nur in Firestore (neu): ${onlyInFirestore}`);
    missing.forEach(id => console.log(`      FEHLT: ${id}`));
    changed.forEach(c => console.log(`      ABWEICHUNG: ${c}`));
    if (missing.length || changed.length) ok = false;
  };

  console.log('Verifikation Sheet -> Firestore:');
  report('episodes', target.episodes);
  report('users', target.users, ['id', 'name', 'registriertAm']);
  report('ratings', target.ratings);
  console.log(ok ? '\nERGEBNIS: Alle Datensätze aus dem Sheet sind vollständig in Firestore.' : '\nERGEBNIS: Es gibt fehlende oder abweichende Datensätze!');
  return ok;
}

if (process.argv[1] && process.argv[1].endsWith('verify.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const data = await loadSource(args.source);
  const db = await initAdmin();
  process.exit((await verify(db, data)) ? 0 : 1);
}
