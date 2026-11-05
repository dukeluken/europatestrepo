// Legt einen neuen Nutzer an und erzeugt einen Einladungscode (ersetzt das Eintragen im Blatt "Nutzer").
//
//   node add-user.mjs "Name"
//
// Einen Google-Login wieder lösen: in der Firebase Console bei users/<id> das Feld authUid auf null setzen
// und mit "node add-user.mjs --code <userId>" einen neuen Code erzeugen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BACKUP_DIR, initAdmin, newInviteCode } from './lib.mjs';

const [first, second] = process.argv.slice(2);
if (!first) {
  console.error('Aufruf: node add-user.mjs "Name"   oder   node add-user.mjs --code <userId>');
  process.exit(1);
}

const db = await initAdmin();
let userId;
let name;

if (first === '--code') {
  userId = second;
  const snap = await db.doc(`users/${userId}`).get();
  if (!snap.exists) throw new Error(`Nutzer ${userId} existiert nicht.`);
  name = snap.data().name;
} else {
  name = first.trim();
  const existing = await db.collection('users').where('name', '==', name).get();
  if (!existing.empty) throw new Error(`Es gibt bereits einen Nutzer "${name}".`);
  userId = `user_${crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 9)}`;
  await db.doc(`users/${userId}`).create({ id: userId, name, registriertAm: new Date().toISOString(), authUid: null });
  console.log(`Nutzer angelegt: ${name} (${userId})`);
}

const code = newInviteCode();
await db.doc(`inviteCodes/${code}`).create({ userId, createdAt: new Date().toISOString() });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.appendFileSync(path.join(BACKUP_DIR, 'invite-codes.txt'), `${name}\t${userId}\t${code}\n`);
console.log(`Einladungscode für ${name}: ${code}`);
