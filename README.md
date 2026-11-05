# Die drei ??? – Ranking

PWA zum Bewerten von „Die drei ???“-Folgen. Hosting, Login und Datenbank laufen über Firebase (Projekt `ddf-ranking-opzic`).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `public/` | Die Web-App (`index.html`, Service Worker, Manifest, Icons, Cover) – wird per Firebase Hosting ausgeliefert |
| `firestore.rules` | Zugriffsregeln (wer darf was schreiben) |
| `migration/` | Einmalige Migration aus dem Google Sheet + Admin-Werkzeuge |
| `cover_finder.py` | Lädt Cover nach `public/ddf_covers/` |
| `Code.gs` | Altes Google-Apps-Script-Backend (nur bis zur Umstellung) |

## Firestore-Datenmodell

- `episodes/{folgeId}` – `nr`, `titel`, `jahr`, `cover`, `folgeId`, `order`
- `users/{userId}` – `id`, `name`, `registriertAm`, `authUid` (verknüpfter Google-Login)
- `ratings/{id}` – `id`, `nutzerId`, `nutzerName`, `folgenNr`, `folgeId`, `punkte`, `kommentar`, `datum`
- `inviteCodes/{code}` – `userId` (für Clients nicht lesbar)
- `meta/daily` – gemeinsamer Fall des Tages inkl. Misch-Zähler pro Nutzer

## Login

Anmeldung mit Google. Beim ersten Login verknüpft man sich einmalig per Einladungscode mit seinem Nutzer;
danach kann nur dieser Google-Account im Namen des Nutzers bewerten. Ohne Login ist alles lesbar.

Ist die Google-Adresse einem Nutzer zugeordnet, passiert das Verknüpfen beim ersten Login automatisch:
`cd migration && node link-email.mjs <userId> <email>` (gespeichert in `emailLinks/{email}`, nicht öffentlich lesbar).

Neuer Nutzer: `cd migration && node add-user.mjs "Name"` → gibt einen Einladungscode aus.

## Migration aus dem Google Sheet

Voraussetzung: Service-Account-Schlüssel als `migration/service-account.json`
(Firebase Console → Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren). Die Datei ist in `.gitignore`.

```sh
cd migration
npm install
node migrate.mjs --dry-run   # nur prüfen
node migrate.mjs             # migrieren + automatisch verifizieren
node verify.mjs              # jederzeit erneut: Sheet vs. Firestore vergleichen
```

- Jeder Lauf speichert zuerst den kompletten Sheet-Export in `migration/backup/`.
- Es wird nichts überschrieben oder gelöscht; abweichende vorhandene Daten führen zum Abbruch.
- Erneutes Ausführen ergänzt nur fehlende Datensätze.

## Deploy

```sh
firebase deploy --only hosting,firestore
```
