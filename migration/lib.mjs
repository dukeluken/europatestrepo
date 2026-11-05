// Gemeinsame Logik für Migration und Verifikation: Google Sheet (Apps-Script-Export) -> Firestore.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MIGRATION_DIR = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(MIGRATION_DIR, 'backup');
export const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyFs9N1rfcNhDeZ7jausQ9w7jVFU3uHqXVNp_3dwEfFm2zaIcn_jr6QAFKckcIzb7Sgzw/exec';

export function parseArgs(argv) {
  const args = { source: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
  }
  return args;
}

/** Lädt den Export aus Datei oder live aus dem Apps Script. Live-Abrufe werden immer zuerst als Backup gespeichert. */
export async function loadSource(source) {
  let raw;
  if (source && !/^https?:\/\//.test(source)) {
    raw = fs.readFileSync(source, 'utf8');
    console.log(`Quelle: Datei ${source}`);
  } else {
    const url = source || SHEET_URL;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Export-Abruf fehlgeschlagen: HTTP ${res.status}`);
    raw = await res.text();
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, `sheet-export-${stamp}.json`);
    fs.writeFileSync(file, raw);
    console.log(`Quelle: live aus Google Sheet, Backup gespeichert unter ${file}`);
  }
  const data = JSON.parse(raw);
  for (const key of ['stammdaten', 'bewertungen', 'nutzer']) {
    if (!Array.isArray(data[key])) throw new Error(`Export ungültig: "${key}" fehlt.`);
  }
  return data;
}

/**
 * Übersetzt den Export in Firestore-Dokumente. Werte werden 1:1 übernommen.
 * Einzige Normalisierung: ungepolsterte Folge-IDs (z. B. "F-22") werden auf die ID aus den
 * Stammdaten ("F-022") gesetzt; der Originalwert bleibt in legacyFolgeId erhalten.
 * Bei allem, was nicht eindeutig ist, wird abgebrochen statt geraten.
 */
export function buildTargetDocs(data) {
  const errors = [];
  const warnings = [];

  const episodes = new Map();
  data.stammdaten.forEach((e, index) => {
    const id = String(e.folgeId || '').trim();
    if (!id) return errors.push(`Folge ohne Folge-ID in Zeile ${index + 2}: ${JSON.stringify(e)}`);
    if (id.includes('/')) return errors.push(`Ungültige Folge-ID: ${id}`);
    if (episodes.has(id)) return errors.push(`Doppelte Folge-ID: ${id}`);
    episodes.set(id, { nr: e.nr, titel: e.titel, jahr: e.jahr, cover: e.cover, folgeId: id, order: index });
  });

  const users = new Map();
  data.nutzer.forEach((u, index) => {
    const id = String(u.id ?? '').trim();
    if (!id) return errors.push(`Nutzer ohne ID in Zeile ${index + 2}: ${JSON.stringify(u)}`);
    if (users.has(id)) return errors.push(`Doppelte Nutzer-ID: ${id}`);
    users.set(id, { id, name: u.name, registriertAm: u.registriertAm, authUid: null });
  });

  const ratings = new Map();
  data.bewertungen.forEach((b, index) => {
    const where = `Bewertung Zeile ${index + 2} (ID ${b.id})`;
    if (b.id === '' || b.id === null || b.id === undefined) return errors.push(`${where}: keine ID`);
    const docId = String(b.id);
    if (ratings.has(docId)) return errors.push(`${where}: doppelte ID`);

    let folgeId = String(b.folgeId || '');
    let legacyFolgeId;
    if (!episodes.has(folgeId)) {
      const candidates = [...episodes.values()].filter(e =>
        String(e.nr).toLowerCase() !== 'special' && String(e.nr) === String(b.folgenNr));
      if (candidates.length !== 1) {
        return errors.push(`${where}: Folge-ID "${folgeId}" unbekannt und Folgenummer ${b.folgenNr} nicht eindeutig zuordenbar`);
      }
      legacyFolgeId = b.folgeId;
      folgeId = candidates[0].folgeId;
    }
    const episode = episodes.get(folgeId);
    if (String(episode.nr) !== String(b.folgenNr)) {
      errors.push(`${where}: Folgenummer ${b.folgenNr} passt nicht zu ${folgeId} (Nr. ${episode.nr})`);
    }
    if (!users.has(String(b.nutzerId))) errors.push(`${where}: Nutzer-ID ${b.nutzerId} existiert nicht`);
    else if (users.get(String(b.nutzerId)).name !== b.nutzerName) {
      warnings.push(`${where}: Name "${b.nutzerName}" weicht vom aktuellen Nutzernamen ab (wird unverändert übernommen)`);
    }
    if (!Number.isInteger(b.punkte) || b.punkte < 1 || b.punkte > 10) {
      warnings.push(`${where}: Punkte ${JSON.stringify(b.punkte)} außerhalb 1–10 (wird unverändert übernommen)`);
    }

    const doc = {
      id: b.id,
      nutzerId: String(b.nutzerId),
      nutzerName: b.nutzerName,
      folgenNr: b.folgenNr,
      folgeId,
      punkte: b.punkte,
      kommentar: b.kommentar,
      datum: b.datum
    };
    if (legacyFolgeId !== undefined) doc.legacyFolgeId = legacyFolgeId;
    ratings.set(docId, doc);
  });

  return { episodes, users, ratings, errors, warnings };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameDoc(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export function newInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}

export async function initAdmin() {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const keyFile = path.join(MIGRATION_DIR, 'service-account.json');
  const credential = fs.existsSync(keyFile)
    ? cert(JSON.parse(fs.readFileSync(keyFile, 'utf8')))
    : applicationDefault();
  initializeApp({ credential, projectId: 'ddf-ranking-opzic' });
  return getFirestore();
}

export async function readCollection(db, name) {
  const snap = await db.collection(name).get();
  return new Map(snap.docs.map(d => [d.id, d.data()]));
}
