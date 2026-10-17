/**
 * ============================================================================
 * PRAPER CONTEST LEAGUE — Google Apps Script backend (Season 2)
 * ============================================================================
 * Receives submissions from the PCL form and maintains the league ledger:
 *
 *   doPost → for EVERY post in the submission (a submission carries many):
 *            1. extracts the MEDIA ID from the post URL (IG shortcode /
 *               YouTube video ID / LinkedIn activity ID) — the dedup key
 *            2. decides NEW vs UPDATE: the same Media ID submitted again is
 *               an UPDATE snapshot of that post's count, never extra views
 *            3. saves the analytics screenshot (base64) to Drive
 *            4. appends one ledger row with claimed count, multiplier and
 *               projected points — leaving the OCR / cross-check / verified
 *               columns empty for the review pipeline to fill in
 *            5. replies {ok:true, id, posts:<count>}
 *
 *   doGet  → metrics JSON: {ok, totalSubmissions, totalPosts, uniqueMedia,
 *            lastSubmissionAt, players:[…]}
 *            `players` aggregates the ledger per candidate — submissions,
 *            post count, unique media, format ratio and projected points
 *            — so the league can see who uploaded how much and in what
 *            mix without ever double-counting (Media ID dedup holds).
 *
 *   ADMIN CONSOLE (admin.html) — gated by a secret key stored in the
 *   script's Script Properties (set it once: run setAdminKey("secret")):
 *     doGet  ?action=ledger&key=…[&callback=…]  → every ledger row (newest
 *            first, incl. Drive file ids + thumbnail urls) + totals +
 *            per-player roll-up. JSONP when `callback` is given, so the
 *            static admin page can read it cross-origin with zero CORS
 *            configuration.
 *     doGet  ?action=ocr&key=…&fileId=…[&claimed=…] → semi-auto OCR: the
 *            analytics screenshot is OCR'd through Drive (free) and the
 *            count closest to the claimed number is suggested for the
 *            review pipeline. Needs "Drive API" enabled as an Advanced
 *            Service in the editor; without it the console simply asks
 *            the admin to type the number.
 *     doPost {action:'adminVerify', adminKey, updates:[…]} → writes the
 *            review columns (OCR Count / Cross-Check / Verified Count /
 *            Verified Points) for specific ledger rows. Verified Points
 *            are recomputed server-side from the row's multiplier.
 *            Cross-Check whitelist: PENDING OCR · MATCH · MISMATCH · BOOST?
 *
 * LEDGER LAYOUT ("Submissions" sheet) — one row PER POST; a submission
 * with 5 posts writes 5 rows sharing one Submission ID:
 *   Identity:   Timestamp · Submission ID · Entry Type · Snapshot # ·
 *               Full Name · Reporting Manager
 *   Media:      Content Type · Platform · Format · Multiplier · Post URL ·
 *               Media ID · Weekly Challenge · Challenge URL · Notes
 *   Claims:     Claimed Views/Impressions · Projected Points ·
 *               Screenshot File · Screenshot Link
 *   Review:     OCR Count · Cross-Check · Verified Count · Verified Points
 *   Audit:      Raw JSON (base64 stripped — screenshots live in Drive)
 *   (→ pipeline: Name/UID → per-post media + claimed data → OCR'd ×
 *    cross-verification → total analytics)
 * NOTE: the Content Type column is DEPRECATED (the form no longer tags
 * posts Praper/PAVE vs Personal) but stays in HEADERS so existing sheet
 * layouts keep their column order; new rows simply leave it blank.
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
var SHEET_ID = '1IMgfcg6nv_PM1Ntw3KmrIZDrldueIjteT6Mx_RteAFE';                    // '' = bound/new spreadsheet
var SHEET_NAME = 'PCL-Data';
var DRIVE_FOLDER_NAME = 'Praper Contest League Uploads';
var MAX_FILE_MB = 5;                  // mirrors js/gas-endpoint.js

/** Canonical ledger columns — order matters, created on first run. */
var HEADERS = [
  'Timestamp', 'Submission ID', 'Entry Type', 'Snapshot #',
  'Full Name', 'Reporting Manager',
  'Content Type', 'Platform', 'Format', 'Multiplier', 'Post URL', 'Media ID',
  'Weekly Challenge', 'Challenge URL', 'Notes',
  'Claimed Views/Impressions', 'Projected Points',
  'Screenshot File', 'Screenshot Link',
  'OCR Count', 'Cross-Check', 'Verified Count', 'Verified Points',
  'Raw JSON'
];

/** Review-pipeline values for the Cross-Check column. */
var CHECK_PENDING = 'PENDING OCR';
var CHECK_VALUES = ['PENDING OCR', 'MATCH', 'MISMATCH', 'BOOST?'];

/** Admin console — secret key lives in Script Properties, not in code. */
var ADMIN_KEY_PROP = 'ADMIN_KEY';

/** Column indexes (1-based) of the four review columns — consecutive. */
var COL_OCR = 20, COL_CHECK = 21, COL_VCOUNT = 22, COL_VPOINTS = 23;

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

    // Admin console write-back (key-gated) — everything else is a submission
    if (payload && payload.action === 'adminVerify') return adminVerify_(payload);

    var id = payload.submissionId || Utilities.getUuid();
    var d = payload.data || {};

    var posts = Array.isArray(d.postDetails) ? d.postDetails : [];
    if (!posts.length) {
      return json_({ ok: false, error: 'No posts in submission' });
    }

    var folder = getDriveFolder_();

    // Identity (shared by every post in this submission)
    var fullName = str_(d.fullName);
    var manager = str_(d.reportingManager);
    var week = str_(d.challengeWeek);
    var challengeUrl = str_(d.challengeUrl);
    var notes = str_(d.additionalNotes);
    var raw = JSON.stringify(payload, function (k, v) {
      // keep the audit trail small — screenshots live in Drive
      return (k === 'content' && typeof v === 'string' &&
              v.slice(0, 5) === 'data:') ? '[saved to Drive]' : v;
    });

    var sheet = getSheet_();
    var written = 0;

    posts.forEach(function (p, i) {
      var fmt = str_(p.format);
      var postUrl = str_(p.link);
      var mediaId = mediaId_(postUrl, fmt);
      var claimed = toCount_(p.viewsImpressions);
      var mult = MULTIPLIERS.hasOwnProperty(fmt) ? MULTIPLIERS[fmt] : '';
      var projected = (claimed !== '' && mult !== '')
        ? Math.ceil(claimed * mult)          // rulebook: round fractions UP
        : '';

      var shot = fileAnswer_(p.analyticsScreenshot, folder,
                             id + '-p' + (i + 1));

      // Ledger state: is this Media ID already in the sheet? → UPDATE
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
      row['Content Type'] = '';           // deprecated — column kept for layout
      row['Platform'] = PLATFORM_LABELS[fmt] || '';
      row['Format'] = FORMAT_LABELS[fmt] || fmt;
      row['Multiplier'] = mult;
      row['Post URL'] = postUrl;
      row['Media ID'] = mediaId;
      row['Weekly Challenge'] = week;
      row['Challenge URL'] = challengeUrl;
      row['Notes'] = notes;
      row['Claimed Views/Impressions'] = claimed;
      row['Projected Points'] = projected;
      row['Screenshot File'] = shot ? shot.name
        : 'REJECTED — over ' + MAX_FILE_MB + ' MB cap';
      row['Screenshot Link'] = shot ? shot.url : '';
      row['OCR Count'] = '';               // filled by the OCR pass
      row['Cross-Check'] = CHECK_PENDING;  // PENDING → MATCH / MISMATCH / BOOST?
      row['Verified Count'] = '';          // filled after cross-verification
      row['Verified Points'] = '';         // final leaderboard points
      row['Raw JSON'] = raw;

      sheet.appendRow(HEADERS.map(function (h) { return row[h]; }));
      written++;
    });

    return json_({ ok: true, id: id, posts: written });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ledger') return ledgerEndpoint_(p);
    if (p.action === 'ocr')    return ocrEndpoint_(p);
    return statsEndpoint_();
  } catch (err) {
    return reply_(p, { ok: false, error: String(err) });
  }
}

/** Public metrics (unchanged shape — feeds the form page / future board). */
function statsEndpoint_() {
  var s = collect_();
  return json_({
    ok: true,
    totalSubmissions: s.totalSubmissions,
    totalPosts: s.totalPosts,
    uniqueMedia: s.uniqueMedia,
    lastSubmissionAt: s.lastSubmissionAt,
    players: s.players,
    generatedAt: new Date().toISOString()
  });
}

/** Admin: every ledger row (newest first) + totals + players, key-gated. */
function ledgerEndpoint_(p) {
  var err = checkAdmin_(p.key);
  if (err) return reply_(p, { ok: false, error: err });
  var s = collect_();
  return reply_(p, {
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      totalSubmissions: s.totalSubmissions,
      totalPosts: s.totalPosts,
      uniqueMedia: s.uniqueMedia,
      lastSubmissionAt: s.lastSubmissionAt
    },
    players: s.players,
    rows: s.rows
  });
}

/** Admin: semi-auto OCR for one screenshot — suggests the count closest
 *  to what the player claimed (falls back to the largest number seen). */
function ocrEndpoint_(p) {
  var err = checkAdmin_(p.key);
  if (err) return reply_(p, { ok: false, error: err });
  var claimed = Number(String(p.claimed || '').replace(/[^\d.]/g, '')) || 0;
  var out = ocrSuggest_(p.fileId, claimed);
  return reply_(p, out);
}

/** One read pass over the ledger → rows as objects + totals + players. */
function collect_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var totalPosts = Math.max(0, lastRow - 1);
  var media = {}, subs = {}, last = null;
  var players = {};                    // per-candidate roll-up
  var rows = [];
  if (totalPosts > 0) {
    var values = sheet.getRange(2, 1, totalPosts, HEADERS.length).getValues();
    var c = {};
    HEADERS.forEach(function (h, i) { c[h] = i; });
    values.forEach(function (r, i) {
      var mid = r[c['Media ID']];
      if (mid) media[mid] = true;
      var sid = r[c['Submission ID']];
      if (sid) subs[sid] = true;

      var name = str_(r[c['Full Name']]);
      if (!name) return;
      if (!players[name]) {
        players[name] = {
          player: name,
          manager: str_(r[c['Reporting Manager']]),
          submissions: {},
          posts: 0,
          media: {},
          formats: {},
          projectedPoints: 0,
          verifiedPoints: 0
        };
      }
      var pl = players[name];
      if (sid) pl.submissions[sid] = true;
      pl.posts++;
      if (mid) pl.media[mid] = true;   // unique media never double-counts
      var fmt = str_(r[c['Format']]);
      if (fmt) pl.formats[fmt] = (pl.formats[fmt] || 0) + 1;
      var pts = Number(r[c['Projected Points']]);
      if (!isNaN(pts)) pl.projectedPoints += pts;
      var vpts = Number(r[c['Verified Points']]);
      if (!isNaN(vpts) && str_(r[c['Verified Points']]) !== '') pl.verifiedPoints += vpts;

      var ts = r[c['Timestamp']];
      var shotUrl = str_(r[c['Screenshot Link']]);
      var fileId = driveFileId_(shotUrl);
      rows.push({
        row: i + 2,                            // sheet row → write-back target
        ts: ts instanceof Date ? ts.toISOString() : str_(ts),
        id: str_(r[c['Submission ID']]),
        type: str_(r[c['Entry Type']]),
        snap: str_(r[c['Snapshot #']]),
        name: name,
        manager: str_(r[c['Reporting Manager']]),
        platform: str_(r[c['Platform']]),
        format: str_(r[c['Format']]),
        mult: r[c['Multiplier']],
        url: str_(r[c['Post URL']]),
        mediaId: str_(mid),
        week: str_(r[c['Weekly Challenge']]),
        challengeUrl: str_(r[c['Challenge URL']]),
        claimed: r[c['Claimed Views/Impressions']],
        projected: r[c['Projected Points']],
        shotName: str_(r[c['Screenshot File']]),
        shotUrl: shotUrl,
        fileId: fileId,
        thumb: fileId ? ('https://drive.google.com/thumbnail?id=' +
                         fileId + '&sz=w400') : '',
        ocr: r[c['OCR Count']],
        check: str_(r[c['Cross-Check']]) || CHECK_PENDING,
        verified: r[c['Verified Count']],
        verifiedPoints: r[c['Verified Points']]
      });
    });
    var v = values[values.length - 1][0];
    last = v instanceof Date ? v.toISOString() : String(v);
  }
  var playerList = Object.keys(players).map(function (k) {
    var pl = players[k];
    return {
      player: pl.player,
      manager: pl.manager,
      submissions: Object.keys(pl.submissions).length,
      posts: pl.posts,
      uniqueMedia: Object.keys(pl.media).length,
      formatRatio: pl.formats,
      projectedPoints: pl.projectedPoints,
      verifiedPoints: pl.verifiedPoints
    };
  }).sort(function (a, b) { return b.posts - a.posts; });
  rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  return {
    totalSubmissions: Object.keys(subs).length,
    totalPosts: totalPosts,
    uniqueMedia: Object.keys(media).length,
    lastSubmissionAt: last,
    players: playerList,
    rows: rows
  };
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

/** ---------- ADMIN CONSOLE ---------- */

// Run this ONCE from the script editor:  setAdminKey("your-secret")
// The key is stored in Script Properties — never in the code or the repo.
function setAdminKey(key) {
  if (!key) throw new Error('Usage:  setAdminKey("your-secret")');
  PropertiesService.getScriptProperties()
    .setProperty(ADMIN_KEY_PROP, String(key));
  return 'ADMIN_KEY saved. The admin console can now unlock with it.';
}

function adminKey_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty(ADMIN_KEY_PROP) || '');
}

function checkAdmin_(key) {
  var want = adminKey_();
  if (!want) {
    return 'ADMIN_KEY is not set — open the script editor and run ' +
           'setAdminKey("your-secret") once.';
  }
  if (String(key || '') !== want) return 'Access denied — wrong admin key.';
  return '';
}

// Admin write-back: {action:'adminVerify', adminKey, updates:[
//   {row:<sheet row>, ocrCount:…, crossCheck:…, verifiedCount:…}, … ]}
// Verified Points are always recomputed here — the console never sends them.
function adminVerify_(payload) {
  var err = checkAdmin_(payload.adminKey);
  if (err) return json_({ ok: false, error: err });

  var updates = Array.isArray(payload.updates) ? payload.updates : [];
  if (!updates.length) {
    return json_({ ok: false, error: 'No updates in request' });
  }

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var updated = 0, errors = [];

  updates.forEach(function (u) {
    var row = Math.floor(Number(u.row));
    if (!row || row < 2 || row > lastRow) {
      errors.push({ row: u.row, error: 'Row out of range' });
      return;
    }
    var mult = Number(sheet.getRange(row, HEADERS.indexOf('Multiplier') + 1, 1, 1)
                       .getDisplayValue().replace(/[^\d.]/g, '')) || 1;

    var ocr = numOrBlank_(u.ocrCount);
    var vcount = numOrBlank_(u.verifiedCount);
    var check = String(u.crossCheck || '').toUpperCase().trim() || CHECK_PENDING;
    if (CHECK_VALUES.indexOf(check) < 0) {
      errors.push({ row: row, error: 'Cross-Check must be one of: ' +
                    CHECK_VALUES.join(', ') });
      return;
    }
    // A typed verified count promotes the row to MATCH (reviewer decision
    // can still override it by sending a different crossCheck).
    if (vcount !== '' && String(u.crossCheck || '').trim() === '') check = 'MATCH';
    var vpoints = (vcount !== '') ? Math.ceil(vcount * mult) : '';

    sheet.getRange(row, COL_OCR, 1, 4)
         .setValues([[ocr, check, vcount, vpoints]]);
    updated++;
  });

  return json_({ ok: errors.length === 0, updated: updated,
                 errors: errors, error: errors.length
                   ? errors[0].error : undefined });
}

/** ---------- OCR (free, via Drive) ---------- */

// Converts the screenshot with Drive OCR into a temp Doc, reads its text,
// extracts candidate counts and suggests the one closest to the claim.
// Needs "Drive API" enabled as an Advanced Service in the editor.
function ocrSuggest_(fileId, claimed) {
  if (!fileId) return { ok: false, error: 'This row has no screenshot on file.' };
  var advanced;
  try { advanced = Drive.Files; } catch (ignore) { /* not enabled */ }
  if (!advanced) {
    return { ok: false,
      error: 'Drive API advanced service is OFF — enable it in the script ' +
             'editor (Services → Drive API) or type the count manually.' };
  }
  var blob, docFile;
  try {
    blob = DriveApp.getFileById(fileId).getBlob();
    docFile = advanced.insert(
      { title: 'PCL OCR ' + fileId,
        mimeType: 'application/vnd.google-apps.document' },
      blob,
      { ocr: true, ocrLanguage: 'en' });
  } catch (err) {
    return { ok: false, error: 'OCR failed: ' + String(err) };
  }
  var text = '';
  try {
    text = DocumentApp.openById(docFile.getId()).getBody().getText();
  } finally {
    try { advanced.remove(docFile.getId()); } catch (ignore) { /* cleanup best effort */ }
  }
  var nums = [], m;
  var re = /([\d][\d,\.\s]*)\s*(?:views|impressions|plays|replays|accounts)/ig;
  while ((m = re.exec(text))) {
    var n = Number(String(m[1]).replace(/[^\d]/g, ''));
    if (n > 0 && n < 1e10) nums.push(n);
  }
  var suggested = '';
  if (nums.length) {
    suggested = claimed
      ? nums.reduce(function (a, b) {
          return Math.abs(b - claimed) < Math.abs(a - claimed) ? b : a; })
      : Math.max.apply(null, nums);
  }
  return { ok: true, suggested: suggested, found: nums,
           text: String(text).replace(/\s+/g, ' ').slice(0, 400) };
}

// Blank-safe numeric parse for the review columns: '' stays '' (blank cell),
// unlike toCount_ which maps '' to 0.
function numOrBlank_(v) {
  var s = str_(v).replace(/[,\s]/g, '');
  if (s === '') return '';
  var n = Number(s);
  return (isNaN(n) || n < 0) ? '' : n;
}

/** Extract the Drive file id from a stored share link. */
function driveFileId_(url) {
  var m = String(url || '').match(/\/d\/([\w-]{20,})/) ||
          String(url || '').match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : '';
}

/** JSON when fetched directly, JSONP when ?callback= is given (static-site
 *  friendly — no CORS setup anywhere). */
function reply_(p, obj) {
  var cb = str_(p && p.callback);
  var body = JSON.stringify(obj);
  if (cb && /^[A-Za-z_$][\w$.]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + body + ');')
                         .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
                       .setMimeType(ContentService.MimeType.JSON);
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
