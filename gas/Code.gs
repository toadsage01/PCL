/**
 * ============================================================================
 * PRAPER CONTEST LEAGUE — Google Apps Script backend (Season 2)
 * ============================================================================
 * Receives submissions from the PCL form and maintains the league ledger:
 *
 *   doPost → 1. extracts the MEDIA ID from the post URL (IG shortcode /
 *               YouTube video ID / LinkedIn activity ID) — the dedup key
 *            2. decides NEW vs UPDATE: the same Media ID submitted again is
 *               an UPDATE snapshot of that post's count, never extra views
 *            3. saves the analytics screenshot (base64) to Drive
 *            4. appends one ledger row with claimed count, multiplier and
 *               projected points — leaving the OCR / cross-check / verified
 *               columns empty for the review pipeline to fill in
 *            5. replies {ok:true, id, entryType}
 *
 *   doGet  → metrics JSON: {ok, totalSubmissions, uniqueMedia, lastSubmissionAt}
 *
 * LEDGER LAYOUT ("Submissions" sheet) — one row per submission event:
 *   Identity:   Timestamp · Submission ID · Entry Type · Snapshot # ·
 *               Full Name · Reporting Manager
 *   Media:      Platform · Format · Multiplier · Post URL · Media ID ·
 *               Weekly Challenge · Challenge URL · Notes
 *   Claims:     Claimed Views/Impressions · Projected Points ·
 *               Screenshot File · Screenshot Link
 *   Review:     OCR Count · Cross-Check · Verified Count · Verified Points
 *   Audit:      Raw JSON
 *   (→ pipeline: Name/UID → media + claimed data → OCR'd × cross-verification
 *    → total analytics)
 *
 * Points rule (rulebook §3): Leaderboard Points = views/impressions ×
 * multiplier, fractional points rounded UP. Verified Points always wins over
 * Projected Points once the review pipeline fills it in.
 *
 * ----------------------------------------------------------------------------
 * SETUP (5 minutes, all free):
 *   1. Open https://script.google.com → New project.
 *   2. Paste this whole file into Code.gs and save.
 *   3. (Optional) Put an existing spreadsheet's ID in SHEET_ID below.
 *   4. Deploy → New deployment → type: Web app
 *        - Execute as:     Me (your account)
 *        - Who has access: Anyone          ← required for contestants
 *      Approve the Drive/Sheets permission prompts.
 *   5. Copy the Web app URL (ends in /exec) into js/gas-endpoint.js
 *      → gasWebAppUrl, then create a NEW deployment version so /exec picks
 *      up the changes.
 * ============================================================================
 */

/** ---------- CONFIG ---------- */
var SHEET_ID = '';                    // '' = bound/new spreadsheet
var SHEET_NAME = 'Submissions';
var DRIVE_FOLDER_NAME = 'Praper Contest League Uploads';
var MAX_FILE_MB = 5;                  // mirrors js/gas-endpoint.js

/** Canonical ledger columns — order matters, created on first run. */
var HEADERS = [
  'Timestamp', 'Submission ID', 'Entry Type', 'Snapshot #',
  'Full Name', 'Reporting Manager',
  'Platform', 'Format', 'Multiplier', 'Post URL', 'Media ID',
  'Weekly Challenge', 'Challenge URL', 'Notes',
  'Claimed Views/Impressions', 'Projected Points',
  'Screenshot File', 'Screenshot Link',
  'OCR Count', 'Cross-Check', 'Verified Count', 'Verified Points',
  'Raw JSON'
];

/** Review-pipeline values for the Cross-Check column. */
var CHECK_PENDING = 'PENDING OCR';

/** Rulebook §3 — leaderboard multipliers per format. */
var MULTIPLIERS = {
  ig_reel: 1.25,      // Instagram Reels:  1 view  → 1.25 pts
  ig_post: 1,         // IG Post/Carousel: 1 impr. → 1 pt
  yt_shorts: 1.25,    // YouTube Shorts:   1 view  → 1.25 pts
  yt_long: 2,         // YT Long-Form:     1 view  → 2 pts
  li_post: 1          // LinkedIn Post:    1 impr. → 1 pt
};

var FORMAT_LABELS = {
  ig_reel: 'Instagram Reel',
  ig_post: 'Instagram Post / Carousel',
  yt_shorts: 'YouTube Shorts',
  yt_long: 'YouTube Long-Form',
  li_post: 'LinkedIn Post'
};

var PLATFORM_LABELS = {
  ig_reel: 'Instagram', ig_post: 'Instagram',
  yt_shorts: 'YouTube', yt_long: 'YouTube',
  li_post: 'LinkedIn'
};

/** ---------- ENTRY POINTS ---------- */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var id = payload.submissionId || Utilities.getUuid();
    var d = payload.data || {};

    var folder = getDriveFolder_();

    // Identity
    var player = d.player || {};
    var fullName = str_(player.fullName);
    var manager = str_(player.reportingManager);

    // Media
    var fmt = str_(d.platformFormat);
    var postUrl = str_(d.postUrl);
    var mediaId = mediaId_(postUrl, fmt);

    // Claimed analytics
    var claimed = toCount_(d.viewsImpressions);
    var mult = MULTIPLIERS.hasOwnProperty(fmt) ? MULTIPLIERS[fmt] : '';
    var projected = (claimed !== '' && mult !== '')
      ? Math.ceil(claimed * mult)            // rulebook: round fractions UP
      : '';

    // Screenshot → Drive
    var shot = fileAnswer_(d.analyticsScreenshot, folder, id);

    // Ledger state: is this Media ID already in the sheet? → UPDATE snapshot
    var prior = findMedia_(mediaId);
    var entryType = prior ? 'UPDATE' : 'NEW';
    var snapshotNo = prior ? prior.snapshot + 1 : 1;

    var row = {};
    row['Timestamp'] = new Date();
    row['Submission ID'] = id;
    row['Entry Type'] = entryType;
    row['Snapshot #'] = snapshotNo;
    row['Full Name'] = fullName;
    row['Reporting Manager'] = manager;
    row['Platform'] = PLATFORM_LABELS[fmt] || '';
    row['Format'] = FORMAT_LABELS[fmt] || fmt;
    row['Multiplier'] = mult;
    row['Post URL'] = postUrl;
    row['Media ID'] = mediaId;
    row['Weekly Challenge'] = str_(d.challengeWeek);
    row['Challenge URL'] = str_(d.challengeUrl);
    row['Notes'] = str_(d.additionalNotes);
    row['Claimed Views/Impressions'] = claimed;
    row['Projected Points'] = projected;
    row['Screenshot File'] = shot ? shot.name : 'REJECTED — over ' + MAX_FILE_MB + ' MB cap';
    row['Screenshot Link'] = shot ? shot.url : '';
    row['OCR Count'] = '';               // filled by the OCR pass
    row['Cross-Check'] = CHECK_PENDING;  // PENDING → MATCH / MISMATCH / BOOST?
    row['Verified Count'] = '';          // filled after cross-verification
    row['Verified Points'] = '';         // final leaderboard points
    row['Raw JSON'] = JSON.stringify(payload);

    var sheet = getSheet_();
    sheet.appendRow(HEADERS.map(function (h) { return row[h]; }));

    return json_({ ok: true, id: id, entryType: entryType, mediaId: mediaId });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    var total = Math.max(0, lastRow - 1);
    var unique = {};
    var last = null;
    if (total > 0) {
      var values = sheet.getRange(2, 1, total, HEADERS.length).getValues();
      values.forEach(function (r) {
        var mid = r[HEADERS.indexOf('Media ID')];
        if (mid) unique[mid] = true;
      });
      var v = values[values.length - 1][0];
      last = v instanceof Date ? v.toISOString() : String(v);
    }
    return json_({
      ok: true,
      totalSubmissions: total,
      uniqueMedia: Object.keys(unique).length,
      lastSubmissionAt: last
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** ---------- MEDIA ID (the dedup key) ---------- */

// One stable ID per physical post, pulled from its canonical URL:
//   IG reel/post → shortcode      YT → video ID      LI → activity ID
// Unknown shapes return '' → every submission counts as NEW (safe default).
function mediaId_(url, fmt) {
  url = String(url || '');
  var m;
  if (fmt.indexOf('ig_') === 0) {
    m = url.match(/instagram\.com\/(?:p|reel|reels)\/([\w-]+)/i);
    if (m) return 'ig_' + m[1];
  } else if (fmt === 'yt_shorts') {
    m = url.match(/youtube\.com\/shorts\/([\w-]+)/i);
    if (m) return 'yt_' + m[1];
  } else if (fmt === 'yt_long') {
    m = url.match(/[?&]v=([\w-]+)/i) || url.match(/youtu\.be\/([\w-]+)/i) ||
        url.match(/youtube\.com\/live\/([\w-]+)/i);
    if (m) return 'yt_' + m[1];
  } else if (fmt === 'li_post') {
    m = url.match(/linkedin\.com\/posts\/([^\/?#]+)/i) ||
        url.match(/activity[-:]?(\d{10,})/i);
    if (m) return 'li_' + m[1];
  }
  return '';
}

// Latest ledger state for a Media ID (null when new).
function findMedia_(mediaId) {
  if (!mediaId) return null;
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var colMid = HEADERS.indexOf('Media ID') + 1;
  var colSnap = HEADERS.indexOf('Snapshot #') + 1;
  var vals = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var found = null;
  vals.forEach(function (r, i) {
    if (String(r[colMid - 1]) === mediaId) {
      found = { row: i + 2, snapshot: Number(r[colSnap - 1]) || 1 };
    }
  });
  return found;
}

/** ---------- SHEET ---------- */

function getSpreadsheet_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet() ||
         SpreadsheetApp.create('Praper Contest League — Data');
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** ---------- ANSWER → DRIVE ---------- */

// Accepts a single SurveyJS file object OR an array of them; returns the
// first successfully stored file ({name, url}) or null.
function fileAnswer_(value, folder, submissionId) {
  var files = Array.isArray(value) ? value : (value ? [value] : []);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f && typeof f.content === 'string' && typeof f.name === 'string') {
      return saveFile_(f, folder, submissionId);
    }
  }
  return null;
}

function saveFile_(file, folder, submissionId) {
  var base64 = file.content.split(',')[1] || '';   // strip data-URL prefix
  var bytes = Utilities.base64Decode(base64);

  if (bytes.length > MAX_FILE_MB * 1024 * 1024) {
    return { name: 'REJECTED — over ' + MAX_FILE_MB + ' MB cap (' + file.name + ')', url: '' };
  }

  var safe = submissionId + '_screenshot_' +
             file.name.replace(/[^\w.\-]+/g, '_');
  var blob = Utilities.newBlob(bytes, file.type || 'application/octet-stream',
                               safe);
  var stored = folder.createFile(blob);
  try {
    stored.setSharing(DriveApp.Access.ANYONE_WITH_LINK,
                      DriveApp.Permission.VIEW);
  } catch (ignore) { /* domain policies may forbid — link still works for owner */ }
  return { name: file.name, url: stored.getUrl() };
}

function getDriveFolder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next()
                      : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/** ---------- HELPERS ---------- */

function str_(v) {
  return (v === null || v === undefined) ? '' : String(v);
}

function toCount_(v) {
  var n = Number(str_(v).replace(/[,\s]/g, ''));
  return (isNaN(n) || n < 0) ? '' : n;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
