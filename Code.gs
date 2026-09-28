/**
 * Google Apps Script für Die drei ??? Ranking.
 *
 * Erwartete Tabellenblätter und Spalten:
 * Stammdaten: Folgenummer | Titel | Jahr | Cover | Folge-ID
 * Bewertungen: ID | Nutzer-ID | Nutzername | Folgenummer | Punkte | Kommentar | Datum | Folge-ID
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
        cover: row[3] || '',
        folgeId: String(row[4] || '')
      };
    }),
    bewertungen: bewertungenRows.map(function (row) {
      var folgeId = String(row[7] || '');
      if (!folgeId) {
        var matchingEpisode = stammdatenRows.find(function (episode) {
          return String(episode[0]) === String(row[3]);
        });
        folgeId = matchingEpisode ? String(matchingEpisode[4] || '') : '';
      }
      return {
        id: row[0],
        nutzerId: row[1],
        nutzerName: row[2],
        folgenNr: row[3],
        punkte: row[4],
        kommentar: row[5],
        datum: row[6],
        folgeId: folgeId
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
      var user = validateRatingUser_(data);
      var rating = validateRating_(data);
      sheet.appendRow([
        Date.now(),
        user.id,
        user.name,
        rating.folgenNr,
        rating.punkte,
        rating.kommentar,
        new Date().toISOString(),
        rating.folgeId
      ]);

      return jsonOutput_({ status: 'success', action: 'addRating' });
    }

    if (data.action === 'updateRating') {
      var user = validateRatingUser_(data);
      var userId = user.id;
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
      var rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
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
        user.name || existingName,
        update.folgenNr,
        update.punkte,
        update.kommentar,
        new Date().toISOString()
      ]]);
      sheet.getRange(targetRow, 8).setValue(update.folgeId);

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
    var url = 'https://itunes.apple.com/search?term=' + query + '&entity=album&limit=20';
    var foundCover = false;

    // Begrenzte Wiederholungsversuche verhindern, dass ein dauerhaftes 429 endlos läuft.
    for (var attempt = 0; attempt < 3 && !foundCover; attempt++) {
      try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var statusCode = response.getResponseCode();

        if (statusCode === 200) {
          var json = JSON.parse(response.getContentText());
          var match = (json.results || []).find(function (item) {
            var albumTitle = String(item.collectionName || '');
            return item.artworkUrl100 && albumTitle.toLowerCase().indexOf(String(titel || '').toLowerCase()) !== -1 && !/\b(?:liest|gelesen)\b/i.test(albumTitle);
          });
          if (match) {
            var coverUrl = match.artworkUrl100.replace('100x100bb', '600x600bb');
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
      failed.push(String(data[i][4] || folgeNr));
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
  var folgeId = String(data.folgeId || '');
  var folgenNr = data.folgenNr;
  var episode = null;
  if (folgeId) {
    var stammdaten = getDataRows_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Stammdaten'));
    episode = stammdaten.find(function (row) { return String(row[4] || '') === folgeId; });
    if (!episode) throw new Error('Unbekannte Folge-ID: ' + folgeId);
    folgenNr = episode[0];
  }
  var parsedNr = parseInt(folgenNr, 10);
  var punkte = Number(data.punkte);

  if (!folgeId && (!Number.isInteger(parsedNr) || parsedNr < 1)) {
    throw new Error('Ungültige Folgenummer.');
  }
  if (!Number.isInteger(punkte) || punkte < 1 || punkte > 10) {
    throw new Error('Punkte müssen eine ganze Zahl zwischen 1 und 10 sein.');
  }

  return {
    folgenNr: episode ? episode[0] : parsedNr,
    folgeId: folgeId,
    punkte: punkte,
    kommentar: String(data.kommentar || '')
  };
}

function validateRatingUser_(data) {
  var id = String(data.nutzerId || '').trim();
  var name = String(data.nutzerName || '').trim();
  var genericValues = ['guest', 'gast', 'anonym', 'anonymous'];

  if (!id || id.toLowerCase() === 'guest') {
    throw new Error('Nutzer-ID fehlt. Die Bewertung wurde nicht gespeichert.');
  }
  if (!name || genericValues.indexOf(name.toLowerCase()) !== -1) {
    throw new Error('Bitte einen Nutzernamen angeben. Die Bewertung wurde nicht gespeichert.');
  }

  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Nutzer');
  var registeredUsers = getDataRows_(usersSheet);
  var registeredUser = registeredUsers.find(function (row) {
    return String(row[0] || '').trim() === id && String(row[1] || '').trim() === name;
  });
  if (!registeredUser) {
    throw new Error('Der ausgewählte Nutzer ist nicht im Tabellenblatt Nutzer angelegt.');
  }

  return { id: id, name: name };
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
