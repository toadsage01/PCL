/**
 * ============================================================================
 * PRAPER CONTEST LEAGUE — Google Apps Script backend
 * ============================================================================
 * Receives submissions from the PCL form (fetch POST, JSON in a simple
 * request) and keeps track of data + metrics:
 *
 *   doPost → 1. saves attachments (base64) to a Google Drive folder
 *               (skips anything over MAX_FILE_MB — server-side guard)
 *            2. appends one row per submission to a "Submissions" sheet
 *               (columns auto-extend when you add new questions)
 *            3. replies {ok:true, id:"…"}
 *
 *   doGet  → metrics JSON: {ok, totalSubmissions, lastSubmissionAt}
 *
 * ----------------------------------------------------------------------------
 * SETUP (5 minutes, all free):
 *   1. Open https://script.google.com → New project.
 *   2. Paste this whole file into Code.gs and save.
 *   3. (Optional) If you want a specific spreadsheet instead of a new one,
 *      put its ID in SHEET_ID below (the long string in the sheet's URL).
 *   4. Deploy → New deployment → type: Web app
 *        - Description:        PCL submissions v1
 *        - Execute as:         Me (your account)
 *        - Who has access:     Anyone          ← required for contestants
 *      Approve the Drive/Sheets permission prompts.
 *   5. Copy the Web app URL (ends in /exec) into js/gas-endpoint.js
 *      → gasWebAppUrl, then redeploy or just save that file.
 *
 * NOTE: whenever you edit Code.gs, create a NEW deployment version
 *       (Deploy → Manage deployments → edit → New version) so /exec
 *       picks up the changes.
 * ============================================================================
 */

/** ---------- CONFIG ---------- */
var SHEET_ID = '';                                   // '' = use bound/new sheet
var SHEET_NAME = 'Submissions';
var DRIVE_FOLDER_NAME = 'Praper Contest League Uploads';
var MAX_FILE_MB = 5;                                 // mirrors js/gas-endpoint.js
var RAW_JSON_COLUMN = 'Raw JSON';
var FIXED_COLUMNS = ['Timestamp', 'Submission ID'];

/** ---------- ENTRY POINTS ---------- */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var id = payload.submissionId || Utilities.getUuid();
    var data = payload.data || {};

    var folder = getDriveFolder_();
    var display = processAnswers_(data, folder, id);

    var sheet = getSheet_(Object.keys(display));
    var headers = getHeaders_(sheet);

    var row = [];
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (h === 'Timestamp') row.push(new Date());
      else if (h === 'Submission ID') row.push(id);
      else if (h === RAW_JSON_COLUMN) row.push(JSON.stringify(payload));
      else row.push(display.hasOwnProperty(h) ? display[h] : '');
    }
    sheet.appendRow(row);

    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  try {
    var sheet = getSheet_([]);   // GET must never mutate headers
    var total = Math.max(0, sheet.getLastRow() - 1);
    var last = null;
    if (total > 0) {
      var v = sheet.getRange(sheet.getLastRow(), 1).getValue();
      last = v instanceof Date ? v.toISOString() : String(v);
    }
    return json_({ ok: true, totalSubmissions: total, lastSubmissionAt: last });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** ---------- SHEET ---------- */

function getSpreadsheet_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet() ||
         SpreadsheetApp.create('Praper Contest League — Data');
}

function getSheet_(answerKeys) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(FIXED_COLUMNS.concat(
      answerKeys.sort(), [RAW_JSON_COLUMN]));
    sheet.setFrozenRows(1);
  }
  // Auto-extend headers when new questions appear in the form config.
  if (answerKeys.length) {
    var headers = getHeaders_(sheet);
    var fresh = answerKeys.filter(function (k) {
      return headers.indexOf(k) === -1;
    });
    if (fresh.length) {
      sheet.getRange(1, headers.length + 1, 1, fresh.length)
           .setValues([fresh.sort()]);
    }
  }
  return sheet;
}

function getHeaders_(sheet) {
  var cols = sheet.getLastColumn();
  if (cols < 1) return [];
  return sheet.getRange(1, 1, 1, cols).getValues()[0].filter(String);
}

/** ---------- ANSWER → DRIVE ---------- */

// Turns raw survey answers into display values; saves file answers to Drive.
function processAnswers_(data, folder, submissionId) {
  var out = {};
  Object.keys(data).forEach(function (key) {
    var value = data[key];

    if (isFile_(value)) {
      out[key] = saveFile_(value, folder, submissionId, key);
    } else if (Array.isArray(value) && value.length &&
               value.every(isFile_)) {
      out[key] = value.map(function (f) {
        return saveFile_(f, folder, submissionId, key);
      }).join('  |  ');
    } else if (value !== null && typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  });
  return out;
}

function isFile_(v) {
  return v && typeof v === 'object' && !Array.isArray(v) &&
         typeof v.content === 'string' && typeof v.name === 'string';
}

function saveFile_(file, folder, submissionId, questionName) {
  var base64 = file.content.split(',')[1] || '';   // strip data-URL prefix
  var bytes = Utilities.base64Decode(base64);

  if (bytes.length > MAX_FILE_MB * 1024 * 1024) {
    return 'REJECTED — over ' + MAX_FILE_MB + ' MB cap (' +
           file.name + ')';
  }

  var safe = submissionId + '_' + questionName + '_' +
             file.name.replace(/[^\w.\-]+/g, '_');
  var blob = Utilities.newBlob(bytes, file.type || 'application/octet-stream',
                               safe);
  var stored = folder.createFile(blob);
  try {
    stored.setSharing(DriveApp.Access.ANYONE_WITH_LINK,
                      DriveApp.Permission.VIEW);
  } catch (ignore) { /* domain policies may forbid — link still works for owner */ }
  return file.name + ' — ' + stored.getUrl();
}

function getDriveFolder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next()
                      : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/** ---------- HELPERS ---------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
