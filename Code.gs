/**
 * Google Apps Script für Die drei ??? Ranking.
 *
 * Erwartete Tabellenblätter und Spalten:
 * Stammdaten: Folgenummer | Titel | Jahr | Cover
 * Bewertungen: ID | Nutzer-ID | Nutzername | Folgenummer | Punkte | Kommentar | Datum
 * Nutzer: ID | Name | Registriert am
 */

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stammdatenSheet = ss.getSheetByName('Stammdaten');
  var bewertungenSheet = ss.getSheetByName('Bewertungen');
  var nutzerSheet = ss.getSheetByName('Nutzer');

  var stammdatenRows = getDataRows_(stammdatenSheet);
  var bewertungenRows = getDataRows_(bewertungenSheet);
  var nutzerRows = getDataRows_(nutzerSheet);

  var result = {
    stammdaten: stammdatenRows.map(function (row) {
      return {
        nr: row[0],
        titel: row[1],
        jahr: row[2],
        cover: row[3] || ''
      };
    }),
    bewertungen: bewertungenRows.map(function (row) {
      return {
        id: row[0],
        nutzerId: row[1],
        nutzerName: row[2],
        folgenNr: row[3],
        punkte: row[4],
        kommentar: row[5],
        datum: row[6]
      };
    }),
    nutzer: nutzerRows.map(function (row) {
      return {
        id: row[0],
        name: row[1],
        registriertAm: row[2]
      };
    })
  };

  return jsonOutput_(result);
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Es wurden keine Daten übermittelt.');
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Bewertungen');

    if (!sheet) {
      throw new Error("Tabellenblatt 'Bewertungen' nicht gefunden.");
    }

    if (data.action === 'addRating') {
      var rating = validateRating_(data);
      sheet.appendRow([
        Date.now(),
        String(data.nutzerId || 'guest'),
        String(data.nutzerName || 'Anonym'),
        rating.folgenNr,
        rating.punkte,
        rating.kommentar,
        new Date().toISOString()
      ]);

      return jsonOutput_({ status: 'success', action: 'addRating' });
    }

    if (data.action === 'updateRating') {
      var userId = String(data.nutzerId || '');
      if (!userId) {
        throw new Error('Nutzer-ID fehlt; die Review wurde nicht geändert.');
      }

      var update = validateRating_(data);
      var originalFolgenNr = data.originalFolgenNr !== undefined && data.originalFolgenNr !== null
        ? String(data.originalFolgenNr)
        : String(data.folgenNr);
      var lastRow = sheet.getLastRow();

      if (lastRow < 2) {
        throw new Error('Es gibt keine Reviews zum Aktualisieren.');
      }

      // Die Datenzeilen beginnen unter der Kopfzeile und umfassen die Spalten A bis G.
      var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      var targetRow = -1;
      var hasId = data.id !== undefined && data.id !== null && String(data.id) !== '';

      if (hasId) {
        for (var i = 0; i < rows.length; i++) {
          var rowId = String(rows[i][0]);
          var rowUserId = String(rows[i][1] || '');

          if (rowId === String(data.id) && rowUserId === userId) {
            targetRow = i + 2;
            break;
          }
        }

        if (targetRow === -1) {
          throw new Error('Review-ID nicht gefunden oder sie gehört nicht zu dieser Nutzer-ID.');
        }
      } else {
        // Fallback für alte Reviews ohne ID. Nur ein eindeutiger Treffer darf geändert werden.
        var matchingRows = [];
        for (var j = 0; j < rows.length; j++) {
          if (
            String(rows[j][1] || '') === userId &&
            String(rows[j][3]) === originalFolgenNr
          ) {
            matchingRows.push(j + 2);
          }
        }

        if (matchingRows.length !== 1) {
          throw new Error(matchingRows.length === 0
            ? 'Eigene Review anhand Nutzer-ID und ursprünglicher Folgenummer nicht gefunden.'
            : 'Mehrere Reviews passen. Für eine sichere Änderung muss die Review-ID mitgesendet werden.');
        }

        targetRow = matchingRows[0];
      }

      var existingName = sheet.getRange(targetRow, 3).getValue();
      sheet.getRange(targetRow, 3, 1, 5).setValues([[
        String(data.nutzerName || existingName || 'Anonym'),
        update.folgenNr,
        update.punkte,
        update.kommentar,
        new Date().toISOString()
      ]]);

      return jsonOutput_({ status: 'success', action: 'updateRating', id: data.id || null });
    }

    throw new Error('Unbekannte Aktion: ' + String(data.action || '(keine Aktion)'));
  } catch (err) {
    return jsonOutput_({
      status: 'error',
      message: err && err.message ? err.message : String(err)
    });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

/**
 * Füllt fehlende Cover-URLs im Tabellenblatt Stammdaten.
 * Numerische Folgen verwenden die Europa-CDN-URL; Sonderfolgen werden über iTunes gesucht.
 */
function autoFillCovers() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Stammdaten');
  if (!sheet) {
    throw new Error("Tabellenblatt 'Stammdaten' nicht gefunden.");
  }

  var data = sheet.getDataRange().getValues();
  var completed = 0;
  var failed = [];

  for (var i = 1; i < data.length; i++) {
    var folgeNr = data[i][0];
    var titel = data[i][1];

    if (!folgeNr || (data[i][3] && data[i][3] !== '')) {
      continue;
    }

    var parsedNr = parseInt(folgeNr, 10);
    if (!isNaN(parsedNr) && parsedNr > 0) {
      var paddedNr = ('000' + parsedNr).slice(-3);
      var cdnUrl = 'https://cdn-p.smehost.net/sites/374be6422f2b494ab9128079a4bd7dfd/produktcover/0-2022/ddf/ddf-cd-' + paddedNr + '.jpg';
      sheet.getRange(i + 1, 4).setValue(cdnUrl);
      completed++;
      continue;
    }

    var query = encodeURIComponent('Die drei ??? ' + folgeNr + ' ' + (titel || ''));
    var url = 'https://itunes.apple.com/search?term=' + query + '&entity=album&limit=1';
    var foundCover = false;

    // Begrenzte Wiederholungsversuche verhindern, dass ein dauerhaftes 429 endlos läuft.
    for (var attempt = 0; attempt < 3 && !foundCover; attempt++) {
      try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var statusCode = response.getResponseCode();

        if (statusCode === 200) {
          var json = JSON.parse(response.getContentText());
          if (json.results && json.results.length > 0 && json.results[0].artworkUrl100) {
            var coverUrl = json.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
            sheet.getRange(i + 1, 4).setValue(coverUrl);
            completed++;
            foundCover = true;
          }
          break;
        }

        if (statusCode === 429 && attempt < 2) {
          Utilities.sleep(5000);
          continue;
        }

        console.log('iTunes-Antwort ' + statusCode + ' für Folge ' + folgeNr);
        break;
      } catch (err) {
        console.log('Fehler bei Folge ' + folgeNr + ': ' + err);
        break;
      }
    }

    if (!foundCover) {
      failed.push(String(folgeNr));
    }
    Utilities.sleep(1200);
  }

  SpreadsheetApp.getUi().alert(
    'Fertig! ' + completed + ' Cover-URLs wurden eingetragen.' +
    (failed.length ? '\nOhne Cover: ' + failed.join(', ') : '')
  );
}

function getDataRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function validateRating_(data) {
  var folgenNr = parseInt(data.folgenNr, 10);
  var punkte = parseInt(data.punkte, 10);

  if (!Number.isInteger(folgenNr) || folgenNr < 1) {
    throw new Error('Ungültige Folgenummer.');
  }
  if (!Number.isInteger(punkte) || punkte < 1 || punkte > 10) {
    throw new Error('Punkte müssen eine ganze Zahl zwischen 1 und 10 sein.');
  }

  return {
    folgenNr: folgenNr,
    punkte: punkte,
    kommentar: String(data.kommentar || '')
  };
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
