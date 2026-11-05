// Ordnet eine Google-E-Mail-Adresse einem Nutzer zu. Beim ersten Login mit diesem Konto
// verknüpft die App automatisch – ohne Einladungscode.
//
//   node link-email.mjs <userId> <email>
import { initAdmin } from './lib.mjs';

const [userId, rawEmail] = process.argv.slice(2);
if (!userId || !rawEmail || !rawEmail.includes('@')) {
  console.error('Aufruf: node link-email.mjs <userId> <email>');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();

const db = await initAdmin();
const user = await db.doc(`users/${userId}`).get();
if (!user.exists) throw new Error(`Nutzer ${userId} existiert nicht.`);

const existing = await db.collection('emailLinks').where('userId', '==', userId).get();
const other = existing.docs.filter(d => d.id !== email).map(d => d.id);
if (other.length) throw new Error(`Nutzer ${userId} ist bereits anderen Adressen zugeordnet: ${other.join(', ')}`);

await db.doc(`emailLinks/${email}`).set({ userId, createdAt: new Date().toISOString() });
console.log(`${email} -> ${user.data().name} (${userId})`);
