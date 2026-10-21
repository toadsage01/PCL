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
 *            3. enforces LINK OWNERSHIP: a link already on file under
 *               ANOTHER player is rejected unless the collab pair checks
 *               out (either side tagged the other) — confirmed pairs get
 *               'Collab Status' = CONFIRMED and their points split 50:50
 *            4. saves the analytics screenshot (base64) to Drive
 *            5. appends one ledger row with claimed count, multiplier and
 *               projected points — leaving the OCR / cross-check / verified
 *               columns empty for the review pipeline to fill in
 *            6. replies {ok:true, id, posts:<count>}; a retried submissionId
 *               is recognised and answered WITHOUT appending twice
 *
 *   doGet  → metrics JSON: {ok, totalSubmissions, totalPosts, uniqueMedia,
 *            lastSubmissionAt, players:[…], weeks:{…}}
 *            `players` aggregates the ledger per candidate — submissions,
 *            post count, unique media, format ratio and projected points
 *            — so the league can see who uploaded how much and in what
 *            mix without ever double-counting (Media ID dedup holds).
 *            `weeks` carries the public leaderboard roll-up: per week,
 *            per player {posts, impressions, points} deduped the same
 *            way (latest snapshot per Media ID, first-snapshot week).
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
var PHOTO_FOLDER_NAME = 'PCL Player Photos';   // child of the uploads folder —
                                               // one photo per unique player
var MAX_FILE_MB = 5;                  // mirrors js/gas-endpoint.js

/** Season clock — week windows for the public leaderboard. Week 1 opens at
 *  SEASON_START_ISO (IST); every window is 7 days; posts submitted before
 *  the start (warm-up) count as Week 1; the counter caps at LEAGUE_WEEKS. */
var SEASON_START_ISO = '2026-10-19T11:00:00+05:30';
var LEAGUE_WEEKS = 10;

/** Public leaderboard fallback — Full Name → Designation (the job title shown
 *  in the board's Designation column). THE LEAGUE'S REAL ROSTER from the
 *  early-insight collection (60 participants): the board shows everyone's
 *  actual title even before their first submission; the ledger's
 *  'Player Designation' column (written by the form, verified in the Control
 *  Room) always wins over this fallback. Keys are normName_-normalized. */
var PLAYER_META = {
  'sehaj singh': 'Social Media Executive',
  'aryan': 'Junior Video Editor',
  'azkiya qamar': 'Content Creator Intern',
  'harshit': 'Video Editor',
  'japjot singh': 'Video Editor Intern',
  'dipika': 'Video Editor',
  'jaskirt singh': 'Assistant Team Lead',
  'robin': 'Video Editor',
  'bhakti arora': 'Content Creator',
  'arushi chawla': 'Content Creator',
  'sayan chakraborty': 'DI Colorist',
  'supriya singh': 'Content Creator',
  'harjappan singh': 'Jr. Motion Graphics Artist',
  'prerna jaiswani': 'Jr. Account Manager',
  'sakshi lakhmani': 'Long-Form Video Editor',
  'deepanshum srivastava': 'Team Lead',
  'rinky chauhan': 'Video Editor',
  'soyaf ikbal ghanchi': 'Junior Video Editor',
  'aryan maddeshiya': 'Video Editor',
  'hemant kataria': 'Jr. Video Editor',
  'ashutosh gupta': 'CBO',
  'archna kumari': 'Senior Executive Finance & Operations',
  'mayukh bhattacharjee': 'Executive Video Editor',
  'abhijeet singh': 'Executive Video Editor (Long Form)',
  'krish sharma': 'Video Editor Intern (Long Form)',
  'ankush sheokand': 'Assistant Team Lead',
  'vishal k': 'Video Editing Mentor',
  'harpreet singh': 'Assistant Team Lead',
  'mitali': 'HR',
  'muskan': 'Executive Video Editor',
  'deepti': 'Key Account Manager',
  'kanupriya srikoti': 'HR Associate',
  'sejal choudhary': 'HR Executive',
  'sonali dub': 'Executive Graphic Designer',
  'hiten khatri': 'Podcast Content Strategist',
  'ansh kumar': 'Senior Executive | Motion Graphics Artist',
  'kunal verma': 'Executive Video Editor',
  'harsh arora': 'Videographer Intern',
  'kartik shivam': 'Creative Video Editor',
  'shubham rai': 'Team Lead',
  'shreeraag varier': 'Video Editor',
  'rudra pratap singh': 'Video Editor',
  'shreyash rawat': 'Junior Video Editor',
  'nandini singh': 'Junior Video Editor',
  'gaurav rana': 'Junior Video Editor',
  'sumit singh': 'Executive Video Editor',
  'shreyangsu jana': 'Junior Motion Graphic Artist',
  'manas ranjan': 'System Engineer',
  'yashwant rawat': 'Executive Motion Graphic Designer',
  'dheeraj kumar': 'Video Editor',
  'shubham gusain': 'Video Editor',
  'isham grover': 'Junior Video Editor',
  'siddharth thakur': 'Junior Graphic Designer',
  'nitin sharma': 'Video Editor and Sound Designer',
  'adeeba qamar': 'Junior Video Editor',
  'vikram singh': 'Social Media Executive',
  'rohit toor': 'Executive Video Editor',
  'nikhil srivastava': 'Executive Video Editor',
  'hirday sarkar': 'Junior Video Editor'
};

/** Canonical ledger columns — order matters, created on first run.
 *  APPEND-ONLY: new columns go at the END so the review-column indexes
 *  (COL_OCR..COL_VPOINTS) stay stable for older sheets. */
var HEADERS = [
  'Timestamp', 'Submission ID', 'Entry Type', 'Snapshot #',
  'Full Name', 'Reporting Manager',
  'Content Type', 'Platform', 'Format', 'Multiplier', 'Post URL', 'Media ID',
  'Weekly Challenge', 'Challenge URL', 'Notes',
  'Claimed Views/Impressions', 'Projected Points',
  'Screenshot File', 'Screenshot Link',
  'OCR Count', 'Cross-Check', 'Verified Count', 'Verified Points',
  'Raw JSON',
  'Player Photo',
  'Collab With', 'Collab Status',
  'Player Designation', 'Player Verified'
];

/** Player identity (per PLAYER, not per post — the same value repeats on
 *  every row the player owns):
 *  Player Designation — the job title from the form's first-time designation
 *          field; auto-reused from the ledger when a resubmission omits it.
 *  Player Verified    — 'VERIFIED' once the Control Room confirms the
 *          player's photo + designation (insta-style tick everywhere); ''
 *          means unverified, and unverified players get NO badge at all. */

/** Collab-post lifecycle (rulebook §7, 50:50 split):
 *  ''        plain post — the link belongs to this player
 *  PENDING   the player tagged a partner; the partner's same-link entry has
 *            not landed yet (unconfirmed collabs still earn full points)
 *  CONFIRMED the partner's matching entry landed and the pair was verified
 *            — BOTH players' rows get 50% of the post's points. */
var COLLAB_PENDING = 'PENDING';
var COLLAB_CONFIRMED = 'CONFIRMED';

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
    if (payload && payload.action === 'adminPlayerVerify') return adminPlayerVerify_(payload);
    if (payload && payload.action === 'adminLogin') return adminLogin_(payload);
    if (payload && payload.action === 'syncNow') return syncNow_(payload);

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
    var who = normName_(fullName);
    var designation = str_(d.playerDesignation).trim();
      // first-time field — a returning player's entry may omit it; the
      // designation already on file for this name is picked up further down
      // (needs the ledger index, which is built right after this block)
    var week = str_(d.challengeWeek);
    var challengeUrl = str_(d.challengeUrl);
    var notes = str_(d.additionalNotes);

    var sheet = getSheet_();

    // One read pass over the ledger → everything the checks need:
    // media/URL ownership, snapshot counters and the retried-submission guard
    var index = ledgerIndex_(sheet);

    // designation fallback — reuse what's already on file for this player
    if (!designation && index.desigByName[who]) designation = index.desigByName[who];

    // Idempotency: a retry after a lost response must never append twice
    if (index.subIds[id]) {
      return json_({ ok: true, id: id, posts: 0, duplicate: true });
    }

    var raw = JSON.stringify(payload, function (k, v) {
      // keep the audit trail small — screenshots live in Drive
      return (k === 'content' && typeof v === 'string' &&
              v.slice(0, 5) === 'data:') ? '[saved to Drive]' : v;
    });

    // ---- VALIDATION PASS: every post must clear BEFORE anything is written
    //      (a submission is all-or-nothing, so a rejection mid-way can never
    //      leave half a submission in the ledger)
    var batch = [];
    var seenInBatch = {};
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      var fmt = str_(p.format);
      var postUrl = str_(p.link);
      var mediaId = mediaId_(postUrl, fmt);
      var claimed = toCount_(p.viewsImpressions);
      var mult = MULTIPLIERS.hasOwnProperty(fmt) ? MULTIPLIERS[fmt] : '';
      var projected = (claimed !== '' && mult !== '')
        ? Math.ceil(claimed * mult)          // rulebook: round fractions UP
        : '';
      var key = mediaId || urlKey_(postUrl);

      if (key && seenInBatch[key]) {
        return json_({ ok: false, error:
          'The same link appears twice in this submission — each post can ' +
          'only be entered once.' });
      }
      if (key) seenInBatch[key] = true;

      // Ledger state for this link: own rows → UPDATE; other players' rows →
      // collab check (a link belongs to the player who posted it first)
      var priorOwn = [], priorOthers = [];
      if (key) {
        (index.byKey[key] || []).forEach(function (r) {
          if (normName_(r.name) === who) priorOwn.push(r);
          else priorOthers.push(r);
        });
      }

      var partner = '';
      var status = '';
      if (priorOthers.length) {
        // confirm the collab: the partner tagged THIS player, or THIS player
        // tags the partner by their exact registered name
        var matched = null;
        priorOthers.forEach(function (r) {
          if (!matched && normName_(r.collabWith) === who) matched = r;
        });
        var pn = normName_(str_(p.collabWith));
        if (!matched && pn) {
          priorOthers.forEach(function (r) {
            if (!matched && normName_(r.name) === pn) matched = r;
          });
        }
        if (!matched) {
          return json_({ ok: false, error:
            'This link was already submitted by another player. If it is a ' +
            'collab post, tag it as COLLAB and enter the partner\u2019s full ' +
            'name exactly as they registered.' });
        }
        partner = matched.name;               // the ledger's canonical name
        status = COLLAB_CONFIRMED;
      } else {
        partner = str_(p.collabWith).trim();
        status = partner ? COLLAB_PENDING : '';
      }

      batch.push({
        p: p, fmt: fmt, postUrl: postUrl, mediaId: mediaId,
        claimed: claimed, mult: mult, projected: projected,
        priorOwn: priorOwn, priorOthers: priorOthers,
        partner: partner, status: status
      });
    }

    // ---- WRITE PASS
    var written = 0;

    // Player photo: save-or-reuse (exactly ONE photo per unique player lives
    // in Drive, named "<name>__<manager>"). Failure never blocks the entry.
    var photoUrl = savePlayerPhoto_(d, fullName, manager, folder);

    var colWith = HEADERS.indexOf('Collab With') + 1;
    var colStatus = HEADERS.indexOf('Collab Status') + 1;

    batch.forEach(function (b, i) {
      var shot = fileAnswer_(b.p.analyticsScreenshot, folder,
                             id + '-p' + (i + 1));

      var entryType = b.priorOwn.length ? 'UPDATE' : 'NEW';
      var snapshotNo = b.priorOwn.length
        ? b.priorOwn[b.priorOwn.length - 1].snapshot + 1 : 1;

      var row = {};
      row['Timestamp'] = new Date();
      row['Submission ID'] = id;
      row['Entry Type'] = entryType;
      row['Snapshot #'] = snapshotNo;
      row['Full Name'] = fullName;
      row['Reporting Manager'] = manager;
      // 50:50 balance rule (rulebook §6) — the form tags every post
      // PRAPER/PAVE or PERSONAL; the column was kept for exactly this revival
      row['Content Type'] = str_(b.p.contentType).toUpperCase() === 'PERSONAL'
        ? 'PERSONAL' : 'PRAPER';
      row['Platform'] = PLATFORM_LABELS[b.fmt] || '';
      row['Format'] = FORMAT_LABELS[b.fmt] || b.fmt;
      row['Multiplier'] = b.mult;
      row['Post URL'] = b.postUrl;
      row['Media ID'] = b.mediaId;
      row['Weekly Challenge'] = week;
      row['Challenge URL'] = challengeUrl;
      row['Notes'] = notes;
      row['Claimed Views/Impressions'] = b.claimed;
      row['Projected Points'] = b.projected;
      row['Screenshot File'] = shot ? shot.name
        : 'REJECTED — over ' + MAX_FILE_MB + ' MB cap';
      row['Screenshot Link'] = shot ? shot.url : '';
      // OCR Count: machine-read of the screenshot. The form's client-side
      // Tesseract pass fills it at ingest; the console's SCAN button can
      // re-read it server-side (Drive OCR) whenever the reviewer wants a
      // second opinion — a SCAN always overwrites the ingested value.
      row['OCR Count'] = numOrBlank_(b.p.ocrCount);
      row['Cross-Check'] = CHECK_PENDING;  // PENDING → MATCH / MISMATCH / BOOST?
      row['Verified Count'] = '';          // filled after cross-verification
      row['Verified Points'] = '';         // final leaderboard points
      row['Raw JSON'] = raw;
      row['Player Photo'] = photoUrl;
      row['Collab With'] = b.partner;
      row['Collab Status'] = b.status;
      row['Player Designation'] = designation;
      row['Player Verified'] = index.verifiedByName[who] ? 'VERIFIED' : '';
        // carry the player's existing verification onto new rows so a single
        // read pass always sees it (the Control Room can flip it any time)

      sheet.appendRow(HEADERS.map(function (h) { return row[h]; }));
      written++;

      // A confirmed pair also flips the PARTNER's prior rows to CONFIRMED
      // (their Collab With is filled in when blank) so both sides split.
      if (b.status === COLLAB_CONFIRMED) {
        var partnerWho = normName_(b.partner);
        b.priorOthers.forEach(function (r) {
          if (normName_(r.name) !== partnerWho) return;
          sheet.getRange(r.row, colStatus).setValue(COLLAB_CONFIRMED);
          if (!r.collabWith) {
            sheet.getRange(r.row, colWith).setValue(fullName);
          }
        });
      }
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
    if (p.action === 'subcheck') return subcheckEndpoint_(p);
    if (p.action === 'playerPhoto') return playerPhotoEndpoint_(p);
    return statsEndpoint_(p);
  } catch (err) {
    return reply_(p, { ok: false, error: String(err) });
  }
}

/** Public metrics (feeds the form page + the public leaderboard). JSONP
 *  when `callback` is given — the static board reads it cross-origin with
 *  zero CORS configuration; plain JSON otherwise, shape unchanged. */
function statsEndpoint_(p) {
  var s = collect_();
  return reply_(p, {
    ok: true,
    totalSubmissions: s.totalSubmissions,
    totalPosts: s.totalPosts,
    uniqueMedia: s.uniqueMedia,
    lastSubmissionAt: s.lastSubmissionAt,
    players: s.players,
    weeks: s.weeks,
    generatedAt: new Date().toISOString()
  });
}

/** Admin: every ledger row (newest first) + totals + players, key-gated.
 *  Also carries the audit catalogue (AdminLog, newest first). */
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
    rows: s.rows,
    log: recentLog_(150)
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

/** Submission confirmation — the browser's direct /exec leg can never read
 *  the 302 answer (no CORS headers on googleusercontent), so after sending
 *  it confirms through this JSONP action instead. Keys on the same
 *  Submission ID doPost uses for dedupe, so found:true is proof the entry
 *  is safely in the ledger. Public but harmless: a yes/no for an
 *  unguessable id, nothing else is exposed. */
function subcheckEndpoint_(p) {
  var id = String(p.id || '').trim();
  if (!id) return reply_(p, { ok: true, found: false });
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var found = false;
  if (lastRow > 1) {
    // column 2 = Submission ID
    var ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (str_(ids[i][0]) === id) { found = true; break; }
    }
  }
  return reply_(p, { ok: true, found: found });
}

/** ---------- SEASON CLOCK ---------- */

var WEEK_MS_ = 7 * 24 * 60 * 60 * 1000;

/** Week number for a moment (ms epoch). Pre-season → 1, capped at 10. */
function weekOfMs_(ms) {
  var start = new Date(SEASON_START_ISO).getTime();
  if (!isFinite(ms) || ms < start) return 1;
  return Math.min(Math.floor((ms - start) / WEEK_MS_) + 1, LEAGUE_WEEKS);
}

/** The week that is live right now — 0 before the season starts. */
function currentWeek_() {
  return Date.now() < new Date(SEASON_START_ISO).getTime()
    ? 0 : weekOfMs_(Date.now());
}

/** One read pass over the ledger → rows as objects + totals + players +
 *  per-week public roll-ups for the leaderboard. */
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
          designation: '',
          verified: false,
          submissions: {},
          posts: 0,
          media: {},
          formats: {},
          projectedPoints: 0,
          verifiedPoints: 0
        };
      }
      var pl = players[name];
      // identity columns repeat on every row — last non-empty value wins
      var dg = c['Player Designation'] !== undefined ? str_(r[c['Player Designation']]) : '';
      if (dg) pl.designation = dg;
      var pv = c['Player Verified'] !== undefined ? str_(r[c['Player Verified']]) : '';
      if (pv) pl.verified = pv.toUpperCase() === 'VERIFIED';
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
      var photoUrl = c['Player Photo'] !== undefined ? str_(r[c['Player Photo']]) : '';
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
        photo: photoUrl,
        photoId: photoUrl ? driveFileId_(photoUrl) : '',
        ocr: r[c['OCR Count']],
        check: str_(r[c['Cross-Check']]) || CHECK_PENDING,
        verified: r[c['Verified Count']],
        verifiedPoints: r[c['Verified Points']],
        collabWith: c['Collab With'] !== undefined ? str_(r[c['Collab With']]) : '',
        collabStatus: c['Collab Status'] !== undefined
          ? str_(r[c['Collab Status']]) : '',
        ctype: c['Content Type'] !== undefined ? str_(r[c['Content Type']]) : ''
      });
    });
    var v = values[values.length - 1][0];
    last = v instanceof Date ? v.toISOString() : String(v);
  }
  // ---- Leaderboard roll-up --------------------------------------------
  // UPDATE rows repeat the FULL current count (never a delta), so summing
  // every row would double-count the same post. Per Media ID only the
  // newest snapshot is current: it wins the impressions/points, credited
  // to its player, and the media is bucketed in the week of its FIRST
  // snapshot (when the post entered the league). Verified cells win over
  // claimed/projected once the review pipeline fills them in. Confirmed
  // collab pairs split 50:50 — the review pipeline writes already-split
  // verified points, so only the projected/claimed fallback paths halve.
  var latestByMedia = {}, firstByMedia = {};
  rows.forEach(function (r) {
    var k = r.mediaId || 'row:' + r.row;
    if (!latestByMedia[k] ||
        String(r.ts).localeCompare(String(latestByMedia[k].ts)) > 0) {
      latestByMedia[k] = r;
    }
    if (!firstByMedia[k] ||
        String(r.ts).localeCompare(String(firstByMedia[k].ts)) < 0) {
      firstByMedia[k] = r;
    }
  });
  var dedup = {};                      // player → deduped season sums
  var wk = {};                         // week → player → weekly roll-up
  var desigLookup = {}, verLookup = {};   // identity for board buckets
  Object.keys(players).forEach(function (n) {
    desigLookup[n] = players[n].designation || PLAYER_META[n] || '';
    verLookup[n] = !!players[n].verified;
  });
  Object.keys(latestByMedia).forEach(function (k) {
    var r = latestByMedia[k];
    if (!players[r.name]) return;      // defensive — name keyed the roll-up
    var collabSplit = r.collabStatus === 'CONFIRMED';

    // Confirmed collab pairs share one Media ID, so the latest-snapshot rule
    // alone would erase the partner's half. Every CONFIRMED row of this
    // media credits its own player — the post's points split 50:50.
    var partners = [];
    if (collabSplit) {
      rows.forEach(function (x) {
        if ((x.mediaId || 'row:' + x.row) === k &&
            x.collabStatus === 'CONFIRMED' &&
            players[x.name] &&
            normName_(x.name) !== normName_(r.name)) {
          partners.push(x);
        }
      });
    }

    function credit(row, isSplit) {
      var views = numOrBlank_(row.verified);
      if (views === '') views = toCount_(row.claimed);
      if (views === '') views = 0;
      var pts = numOrBlank_(row.verifiedPoints);
      var ptsFromVerified = pts !== '';
      if (pts === '') pts = numOrBlank_(row.projected);
      if (pts === '' && views > 0 && row.mult !== '' && !isNaN(Number(row.mult))) {
        pts = Math.ceil(views * Number(row.mult));
      }
      if (pts === '') pts = 0;
      if (!ptsFromVerified && pts > 0 && isSplit) {
        pts = Math.ceil(Number(pts) / 2);
      }
      var d = dedup[row.name] ||
        (dedup[row.name] = { imp: 0, pts: 0, proj: 0, ver: 0 });
      d.imp += views;
      d.pts += pts;
      var proj = numOrBlank_(row.projected);
      if (proj !== '') d.proj += isSplit ? Math.ceil(proj / 2) : proj;
      var ver = numOrBlank_(row.verifiedPoints);
      if (ver !== '') d.ver += ver;
      var w = weekOfMs_(new Date(firstByMedia[k].ts).getTime());
      var bucket = wk[w] || (wk[w] = {});
      var wp = bucket[row.name] ||
        (bucket[row.name] = { player: row.name,
                              designation: desigLookup[row.name] || '',
                              verified: verLookup[row.name] || false,
                              posts: 0, impressions: 0, points: 0 });
      wp.posts++;
      wp.impressions += views;
      wp.points += pts;
    }

    credit(r, collabSplit);
    partners.forEach(function (x) { credit(x, true); });
  });
  var playerList = Object.keys(players).map(function (k) {
    var pl = players[k];
    var d = dedup[k] || { imp: 0, pts: 0, proj: 0, ver: 0 };
    return {
      player: pl.player,
      manager: pl.manager,
      designation: pl.designation || PLAYER_META[k] || '',
      verified: !!pl.verified,
      submissions: Object.keys(pl.submissions).length,
      posts: pl.posts,
      uniqueMedia: Object.keys(pl.media).length,
      formatRatio: pl.formats,
      impressions: d.imp,
      points: d.pts,
      projectedPoints: d.proj,         // deduped — latest snapshot per media
      verifiedPoints: d.ver
    };
  }).sort(function (a, b) { return b.posts - a.posts; });
  var byWeek = {};
  Object.keys(wk).map(Number)
    .sort(function (a, b) { return a - b; })
    .forEach(function (w) {
      byWeek[String(w)] = Object.keys(wk[w]).map(function (n) {
        return wk[w][n];
      }).sort(function (a, b) {
        return b.points - a.points || b.impressions - a.impressions ||
               a.player.localeCompare(b.player);
      });
    });
  rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  // Tracked metrics join — the latest PCL-Snapshots count per Media ID rides
  // every matching ledger row so the console shows it as an AUTO tag (a
  // platform-observed number the reviewer can compare against the claim).
  try {
    var snaps = latestSnapshots_();
    if (Object.keys(snaps).length) {
      rows.forEach(function (r) {
        var s = snaps[r.mediaId];
        if (s && s.views !== '' && s.views !== undefined) {
          r.tracked = true;
          r.trackedViews = s.views;
          r.trackedAt = s.ts;
        }
      });
    }
  } catch (ignore) { /* snapshots absent — rows stay untouched */ }
  return {
    totalSubmissions: Object.keys(subs).length,
    totalPosts: totalPosts,
    uniqueMedia: Object.keys(media).length,
    lastSubmissionAt: last,
    players: playerList,
    rows: rows,
    weeks: {
      seasonStart: SEASON_START_ISO,
      total: LEAGUE_WEEKS,
      current: currentWeek_(),
      byWeek: byWeek
    }
  };
}

/** ---------- MEDIA ID (the dedup key) + LINK OWNERSHIP ---------- */

// One stable ID per physical post, pulled from its canonical URL:
//   IG reel/post/IGTV → shortcode      YT → video ID      LI → activity ID
// Mirrors the form's classifyUrl: instagram.com + instagr.am, youtube.com
// (+ m./music./nocookie) + youtu.be, linkedin.com + lnkd.in (LinkedIn's own
// shortener). Unknown shapes return '' → the normalized URL becomes the
// ownership key instead (safe default).
function mediaId_(url, fmt) {
  url = String(url || '');
  var m;
  if (fmt.indexOf('ig_') === 0) {
    m = url.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\/([\w-]+)/i);
    if (m) return 'ig_' + m[1];
  } else if (fmt === 'yt_shorts') {
    m = url.match(/youtube(?:-nocookie)?\.com\/shorts\/([\w-]+)/i);
    if (m) return 'yt_' + m[1];
  } else if (fmt === 'yt_long') {
    m = url.match(/[?&]v=([\w-]+)/i) || url.match(/youtu\.be\/([\w-]+)/i) ||
        url.match(/youtube(?:-nocookie)?\.com\/(?:live|embed|v)\/([\w-]+)/i);
    if (m) return 'yt_' + m[1];
  } else if (fmt === 'li_post') {
    m = url.match(/linkedin\.com\/posts\/([^\/?#]+)/i) ||
        url.match(/activity[-:]?(\d{10,})/i) ||
        url.match(/linkedin\.com\/pulse\/([^\/?#]+)/i) ||
        url.match(/lnkd\.in\/([\w-]+)/i) ||
        url.match(/urn:li:(?:activity|ugcPost|share):(\w+)/i);
    if (m) return 'li_' + m[1];
  }
  return '';
}

/** Comparison form of a player's name — whitespace/case tolerant so
 *  "priya   sharma" matches "Priya Sharma" in collab + ownership checks. */
function normName_(s) {
  return str_(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Fallback ownership key when no Media ID could be extracted: the URL
 *  stripped of protocol, www, query string and trailing slashes. */
function urlKey_(url) {
  var s = str_(url).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  return s.split(/[?#]/)[0].replace(/\/+$/, '');
}

/** One read pass over the ledger for the submission checks:
 *  subIds — every Submission ID seen (retried-submission guard);
 *  byKey  — Media ID / URL → [{row, name, snapshot, collabWith, status}]. */
function ledgerIndex_(sheet) {
  var out = { byKey: {}, subIds: {}, desigByName: {}, verifiedByName: {} };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var vals = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var c = {};
  HEADERS.forEach(function (h, i) { c[h] = i; });
  vals.forEach(function (r, i) {
    var sid = str_(r[c['Submission ID']]);
    if (sid) out.subIds[sid] = true;
    // player identity roll-up (rows are oldest → newest, so the last
    // non-empty value wins = the player's CURRENT designation/verification)
    var who = normName_(r[c['Full Name']]);
    if (who) {
      var dg = c['Player Designation'] !== undefined ? str_(r[c['Player Designation']]) : '';
      if (dg) out.desigByName[who] = dg;
      var pv = c['Player Verified'] !== undefined ? str_(r[c['Player Verified']]) : '';
      if (pv) out.verifiedByName[who] = pv.toUpperCase() === 'VERIFIED';
    }
    var mid = str_(r[c['Media ID']]);
    var key = mid || urlKey_(r[c['Post URL']]);
    if (!key) return;
    (out.byKey[key] = out.byKey[key] || []).push({
      row: i + 2,
      name: str_(r[c['Full Name']]),
      snapshot: Number(r[c['Snapshot #']]) || 1,
      collabWith: c['Collab With'] !== undefined ? str_(r[c['Collab With']]) : '',
      status: c['Collab Status'] !== undefined ? str_(r[c['Collab Status']]) : ''
    });
  });
  return out;
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

// Admin write-back: {action:'adminVerify', adminKey, operator, updates:[
//   {row:<sheet row>, ocrCount:…, crossCheck:…, verifiedCount:…,
//    contentType:'PRAPER'|'PERSONAL'|''}, … ]}
// Verified Points are always recomputed here — the console never sends them.
// Every write is catalogued in the AdminLog sheet (operator + old→new values)
// so accidental/random edits in the Control Room are always traceable.
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
  var nameCol = HEADERS.indexOf('Full Name') + 1;
  var ctCol = HEADERS.indexOf('Content Type') + 1;

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

    // 50:50 balance tagging — only the two rulebook §6 values are legal
    var ctype = String(u.contentType || '').toUpperCase().trim();
    if (ctype && ctype !== 'PRAPER' && ctype !== 'PERSONAL') {
      errors.push({ row: row, error: 'Content Type must be PRAPER or PERSONAL' });
      return;
    }

    // Confirmed collab pairs split the post's points 50:50 — both players'
    // rows carry Collab Status = CONFIRMED, each keeps half the total.
    var collabStatus = str_(sheet.getRange(row, HEADERS.indexOf('Collab Status') + 1, 1, 1)
                              .getDisplayValue()).toUpperCase().trim();
    var split = collabStatus === COLLAB_CONFIRMED ? 2 : 1;
    var vpoints = (vcount !== '') ? Math.ceil(vcount * mult / split) : '';

    // capture the old review values BEFORE writing (for the audit log)
    var oldVals = sheet.getRange(row, COL_OCR, 1, 4).getDisplayValues()[0];
    var oldCt = str_(sheet.getRange(row, ctCol, 1, 1).getDisplayValue());
    var pname = sheet.getRange(row, nameCol, 1, 1).getDisplayValue();

    sheet.getRange(row, COL_OCR, 1, 4)
         .setValues([[ocr, check, vcount, vpoints]]);
    if (ctype) sheet.getRange(row, ctCol).setValue(ctype);
    updated++;

    logAdmin_(payload.operator, 'VERIFY', 'row ' + row + ' · ' + pname,
      'OCR: ' + oldVals[0] + '→' + (ocr === '' ? '—' : ocr) +
      ' · CHECK: ' + oldVals[1] + '→' + check +
      ' · VERIFIED: ' + oldVals[2] + '→' + (vcount === '' ? '—' : vcount) +
      ' · VPTS: ' + oldVals[3] + '→' + (vpoints === '' ? '—' : vpoints) +
      (ctype ? ' · CT: ' + (oldCt || '—') + '→' + ctype : '') +
      (split === 2 ? ' · COLLAB ½' : ''));
  });

  return json_({ ok: errors.length === 0, updated: updated,
                 errors: errors, error: errors.length
                   ? errors[0].error : undefined });
}

/** Admin IDENTITY verification — flips a PLAYER's verified tick (photo +
 *  designation confirmed by a human). {action:'adminPlayerVerify', adminKey,
 *  operator, players:[{name:'…', verified:true|false}]}. Writes the
 *  'Player Verified' column on EVERY row of that player (a single read pass
 *  then always carries the flag) and catalogues the change. */
function adminPlayerVerify_(payload) {
  var err = checkAdmin_(payload.adminKey);
  if (err) return json_({ ok: false, error: err });

  var list = Array.isArray(payload.players) ? payload.players : [];
  if (!list.length) return json_({ ok: false, error: 'No players in request' });

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ ok: false, error: 'Ledger is empty' });

  var nameCol = HEADERS.indexOf('Full Name') + 1;
  var verCol = HEADERS.indexOf('Player Verified') + 1;
  var vals = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();

  // bucket sheet rows per requested player (case/whitespace tolerant)
  var wanted = {};
  list.forEach(function (p) {
    var n = normName_(p.name);
    if (n) wanted[n] = { name: str_(p.name), verified: !!p.verified, rows: [] };
  });
  for (var i = 0; i < vals.length; i++) {
    var w = wanted[normName_(vals[i][0])];
    if (w) w.rows.push(i + 2);
  }

  var updated = 0, errors = [];
  Object.keys(wanted).forEach(function (n) {
    var w = wanted[n];
    if (!w.rows.length) {
      errors.push({ name: w.name, error: 'No ledger rows for this player yet' });
      return;
    }
    var val = w.verified ? 'VERIFIED' : '';
    w.rows.forEach(function (row) {
      sheet.getRange(row, verCol).setValue(val);
      updated++;
    });
    logAdmin_(payload.operator, w.verified ? 'VERIFY-ID' : 'UNVERIFY-ID',
      w.name + ' · ' + w.rows.length + ' row(s)',
      'identity ' + (w.verified ? 'VERIFIED (tick on)' : 'unverified (tick off)'));
  });

  return json_({ ok: errors.length === 0, updated: updated,
                 errors: errors, error: errors.length
                   ? errors[0].error : undefined });
}

/** Admin LOGIN trail + DEVICE BINDING — the console sends a browser
 *  fingerprint with every unlock. The FIRST device an operator unlocks
 *  from becomes theirs; the same name from a DIFFERENT device is refused
 *  (the audit catalogue records the denial), so nobody can sign in under
 *  somebody else's name. A legitimate new device is unlocked once by the
 *  league engineer: resetAdminDevice("Full Name") from the script editor. */
function adminLogin_(payload) {
  var err = checkAdmin_(payload.adminKey);
  if (err) return json_({ ok: false, error: err });
  var op = normName_(payload.operator);
  if (!op) return json_({ ok: false, error: 'Select your name before unlocking.' });
  var device = str_(payload.device) || 'unknown-device';
  var hash = device.split('·')[0];
  var devices = adminDevices_();
  var rec = devices[op];
  if (rec && rec.hash && rec.hash !== hash) {
    logAdmin_(payload.operator, 'LOGIN-DENIED', 'Control Room',
      'device mismatch — name is bound to device ' + rec.hash +
      ', this browser is ' + hash);
    return json_({ ok: false, error: '"' + str_(payload.operator) +
      '" is usually operated from another device. If this is really you, ask ' +
      'the league engineer to run resetAdminDevice("' + str_(payload.operator) +
      '") once in the Apps Script editor.' });
  }
  if (!rec) {
    devices[op] = { hash: hash, device: device, ts: new Date().toISOString() };
    setAdminDevices_(devices);
  }
  logAdmin_(payload.operator, 'LOGIN', 'Control Room',
    'gate unlocked · device ' + hash);
  return json_({ ok: true });
}

/** Device bindings live in Script Properties as JSON — never in the code. */
var ADMIN_DEVICES_PROP = 'ADMIN_DEVICES';
function adminDevices_() {
  try {
    var raw = PropertiesService.getScriptProperties()
      .getProperty(ADMIN_DEVICES_PROP);
    return raw ? JSON.parse(raw) : {};
  } catch (ignore) { return {}; }
}
function setAdminDevices_(map) {
  PropertiesService.getScriptProperties()
    .setProperty(ADMIN_DEVICES_PROP, JSON.stringify(map || {}));
}
/** Run from the script editor when an operator legitimately changes device:
 *  resetAdminDevice("Sejal Choudhary") — their next unlock re-binds. */
function resetAdminDevice(name) {
  var who = normName_(name);
  if (!who) throw new Error('Usage:  resetAdminDevice("Full Name")');
  var devices = adminDevices_();
  delete devices[who];
  setAdminDevices_(devices);
  logAdmin_(name, 'DEVICE-RESET', 'Control Room',
    'device binding cleared — next unlock re-binds');
  return 'Device binding cleared for ' + name + '.';
}
/** Nuclear option — clear every binding (e.g. after a team-wide migration). */
function resetAdminDevices() {
  setAdminDevices_({});
  logAdmin_('engineer', 'DEVICE-RESET', 'Control Room', 'all device bindings cleared');
  return 'All device bindings cleared.';
}

/** ---------- METRICS TRACKING (Phase 1) ----------
 *  The league's daily view-count pipeline (docs/METRICS-RESEARCH.md):
 *    · YouTube — LIVE. YouTube Data API v3 videos.list, 50 IDs per call
 *      (1 quota unit), fresh view/like/comment counts per unique yt_ post.
 *    · Instagram — AWAITS the Meta app review (Business Discovery needs the
 *      league IG token in Script Properties: META_IG_TOKEN + META_IG_USER_ID).
 *    · LinkedIn — decision (c): OCR impressions stay the source of truth via
 *      the existing SCAN pipeline; guest engagement fetches are attempted
 *      best-effort and only recorded when LinkedIn actually answers.
 *  Snapshots append to their own sheet ('PCL-Snapshots') — never silently
 *  zero, never rewriting history. collect_() joins the latest tracked count
 *  onto every ledger row so the console shows it as an AUTO tag.
 *  Runs twice daily (09:00 & 21:00 IST triggers, self-healing on every
 *  SYNC NOW) and on demand from the console's SYNC NOW button. */
var DEFAULT_YT_API_KEY = 'AIzaSyChPgXr6U4MICfIPtdobUFTQHp_uS9veog';
var SNAP_SHEET_NAME = 'PCL-Snapshots';
var SNAP_HEADERS = ['Timestamp', 'Media ID', 'Platform', 'Source',
                    'Views', 'Likes', 'Comments', 'Status', 'Note'];

function ytKey_() {
  var k = String(PropertiesService.getScriptProperties()
    .getProperty('YOUTUBE_API_KEY') || '');
  return k || DEFAULT_YT_API_KEY;
}

function getSnapSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SNAP_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SNAP_SHEET_NAME);
    sheet.appendRow(SNAP_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendSnapshot_(mediaId, platform, source, views, likes, comments,
                         status, note) {
  try {
    getSnapSheet_().appendRow([new Date(), mediaId, platform, source,
                               views === '' ? '' : Number(views),
                               likes === '' ? '' : Number(likes),
                               comments === '' ? '' : Number(comments),
                               status || 'OK', str_(note)]);
  } catch (ignore) { /* tracking must never break the ledger */ }
}

/** Latest snapshot per Media ID — one read, last write wins. */
function latestSnapshots_() {
  var out = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(SNAP_SHEET_NAME);
    if (!sh) return out;
    var last = sh.getLastRow();
    if (last < 2) return out;
    var vals = sh.getRange(2, 1, last - 1, SNAP_HEADERS.length).getValues();
    vals.forEach(function (r) {
      var mid = str_(r[1]);
      if (!mid) return;
      out[mid] = {
        views: r[4] === '' ? '' : Number(r[4]),
        ts: r[0] instanceof Date ? r[0].toISOString() : str_(r[0]),
        status: str_(r[7])
      };
    });
  } catch (ignore) { /* no snapshots yet */ }
  return out;
}

/** YouTube leg — batched videos.list over every unique yt_ post on the
 *  ledger. A count that hasn't moved since the last snapshot writes nothing
 *  (the sheet stays a real change-log, not a copy of YouTube). */
function syncYouTube_() {
  var out = { checked: 0, updated: 0, note: '' };
  try {
    var key = ytKey_();
    if (!key) { out.note = 'no API key'; return out; }
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { out.note = 'ledger empty'; return out; }
    var c = {};
    HEADERS.forEach(function (h, i) { c[h] = i; });
    var vals = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var seen = {};
    var ids = [];
    vals.forEach(function (r) {
      var mid = str_(r[c['Media ID']]);
      if (mid.indexOf('yt_') !== 0) return;
      var vid = mid.slice(3);
      if (vid && !seen[vid]) { seen[vid] = true; ids.push(vid); }
    });
    if (!ids.length) { out.note = 'no YT posts yet'; return out; }
    var latest = latestSnapshots_();
    for (var i = 0; i < ids.length; i += 50) {
      var chunk = ids.slice(i, i + 50);
      var url = 'https://www.googleapis.com/youtube/v3/videos' +
                '?part=statistics&id=' + chunk.join(',') + '&key=' + key;
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        out.note = 'YT API HTTP ' + res.getResponseCode() +
                   ' — check the key / quota';
        break;
      }
      var data = JSON.parse(res.getContentText());
      (data.items || []).forEach(function (item) {
        var st = item.statistics || {};
        if (st.viewCount === undefined) return;
        out.checked++;
        var mid = 'yt_' + item.id;
        var prev = latest[mid];
        if (prev && String(prev.views) === String(st.viewCount)) return;
        appendSnapshot_(mid, 'YouTube', 'YT_API', st.viewCount,
                        st.likeCount || '', st.commentCount || '', 'OK', '');
        out.updated++;
      });
    }
    if (!out.note) out.note = out.updated ? 'tracked' : 'no changes';
  } catch (err) {
    out.note = String(err).slice(0, 120);
  }
  return out;
}

/** Instagram leg — Business Discovery needs the league token (Meta app
 *  currently under review). Until META_IG_TOKEN + META_IG_USER_ID land in
 *  Script Properties this reports and exits — it never invents counts. */
function syncInstagram_() {
  var out = { checked: 0, updated: 0, note: 'awaiting Meta app token' };
  try {
    var token = String(PropertiesService.getScriptProperties()
      .getProperty('META_IG_TOKEN') || '');
    var userId = String(PropertiesService.getScriptProperties()
      .getProperty('META_IG_USER_ID') || '');
    if (!token || !userId) return out;
    out.note = 'token present — BD pass needs the IG username map';
    // Phase 2: per-participant Business Discovery + media.pull — built the
    // moment the league's IG usernames are registered in PLAYER_META.
  } catch (ignore) { /* defensive */ }
  return out;
}

/** LinkedIn leg — decision (c): OCR impressions stay the review floor; the
 *  auto leg is best-effort only and writes nothing unless LinkedIn itself
 *  answers (guest fetches usually meet the login wall — expected, never an
 *  error worth a junk snapshot row). */
function syncLinkedIn_() {
  return { checked: 0, updated: 0,
           note: 'option c — OCR floor + guest engagement best-effort' };
}

/** SYNC NOW — the console's button; also self-heals the daily triggers. */
function syncNow_(payload) {
  var err = checkAdmin_(payload.adminKey);
  if (err) return json_({ ok: false, error: err });
  var yt = syncYouTube_();
  var ig = syncInstagram_();
  var li = syncLinkedIn_();
  try { ensureMetricsTriggers_(); } catch (ignore) { /* best effort */ }
  logAdmin_(payload.operator || 'console', 'SYNC', 'metrics',
    'YT ' + yt.updated + '/' + yt.checked + (yt.note ? ' (' + yt.note + ')' : '') +
    (ig.note ? ' · IG ' + ig.note : '') +
    (li.note ? ' · LI ' + li.note : ''));
  return json_({ ok: true, yt: yt, ig: ig, li: li });
}

/** Twice-daily tracker — 09:00 & 21:00 IST-ish (script timezone governs;
 *  set the project timezone to Kolkata in the editor's settings). */
function metricsDaily_() {
  var yt = syncYouTube_();
  if (yt.note) logAdmin_('system', 'SYNC', 'metrics',
    'scheduled · YT ' + yt.updated + '/' + yt.checked + ' (' + yt.note + ')');
}
function ensureMetricsTriggers_() {
  var want = 'metricsDaily_';
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === want;
  });
  if (existing.length >= 2) return;
  existing.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(want).timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger(want).timeBased().everyDays(1).atHour(21).create();
}
/** Run ONCE from the editor if triggers should exist before the first SYNC NOW. */
function setupMetricsTriggers() {
  ensureMetricsTriggers_();
  return 'Daily tracking triggers installed (09:00 & 21:00).';
}

/** ---------- AUDIT LOG ("AdminLog" sheet) ---------- */

var LOG_SHEET_NAME = 'AdminLog';
var LOG_HEADERS = ['Timestamp', 'Operator', 'Action', 'Target', 'Detail'];

function getLogSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logAdmin_(operator, action, target, detail) {
  try {
    getLogSheet_().appendRow([new Date(), str_(operator) || 'unnamed',
                              action, target, detail]);
  } catch (ignore) { /* the ledger write must never fail because of the log */ }
}

function recentLog_(n) {
  try {
    var sh = getLogSheet_();
    var last = sh.getLastRow();
    if (last < 2) return [];
    var from = Math.max(2, last - n + 1);
    var vals = sh.getRange(from, 1, last - from + 1, LOG_HEADERS.length).getValues();
    var out = [];
    for (var i = vals.length - 1; i >= 0; i--) {
      var v = vals[i];
      out.push({
        ts: v[0] instanceof Date ? v[0].toISOString() : String(v[0]),
        operator: str_(v[1]),
        action: str_(v[2]),
        target: str_(v[3]),
        detail: str_(v[4])
      });
    }
    return out;
  } catch (ignore) { return []; }
}

/** ---------- PLAYER PHOTO (one per unique player) ---------- */

// Stored as "<slug(name)>__<slug(manager)>.<ext>" inside a child folder of the
// uploads folder. A re-submission with a new photo TRASHES the old file first,
// so exactly one photo per player exists. No new upload → the existing photo
// is reused and its URL lands in the ledger's Player Photo column.
function savePlayerPhoto_(data, fullName, manager, uploadsFolder) {
  try {
    var folder = getPhotoFolder_(uploadsFolder);
    var slug = slugify_(fullName);
    if (!slug) return '';
    var files = data.playerPhoto;
    if (Array.isArray(files) && files.length && files[0] &&
        typeof files[0].content === 'string' && files[0].content) {
      var file = files[0];
      var base64 = file.content.split(',')[1] || '';
      var bytes = Utilities.base64Decode(base64);
      if (bytes.length > MAX_FILE_MB * 1024 * 1024) return '';
      trashPhotos_(folder, slug);
      var extMatch = String(file.name || '').match(/\.(\w+)$/);
      var ext = extMatch ? extMatch[1].toLowerCase() : 'png';
      var blob = Utilities.newBlob(bytes, file.type || 'image/png',
                                   slug + '__' + slugify_(manager) + '.' + ext);
      var stored = folder.createFile(blob);
      try {
        stored.setSharing(DriveApp.Access.ANYONE_WITH_LINK,
                          DriveApp.Permission.VIEW);
      } catch (ignore) { /* domain policies — owner link still works */ }
      return stored.getUrl();
    }
    // no new upload → reuse the photo already on file for this player
    var found = findPhotoByPrefix_(folder, slug);
    return found ? found.getUrl() : '';
  } catch (ignore) { return ''; }   // photo problems never block a submission
}

function getPhotoFolder_(uploadsFolder) {
  var parent = uploadsFolder || DriveApp.getRootFolder();
  var it = parent.getFoldersByName(PHOTO_FOLDER_NAME);
  return it.hasNext() ? it.next() : parent.createFolder(PHOTO_FOLDER_NAME);
}

function findPhotoByPrefix_(folder, nameSlug) {
  var prefix = nameSlug + '__';
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (String(f.getName()).indexOf(prefix) === 0) return f;
  }
  return null;
}

function trashPhotos_(folder, nameSlug) {
  var prefix = nameSlug + '__';
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (String(f.getName()).indexOf(prefix) === 0) {
      try { f.setTrash(true); } catch (ignore) { /* best effort */ }
    }
  }
}

function slugify_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
           .replace(/^-+|-+$/g, '');
}

/** Public lookup: the form types a name → JSONP returns the photo on file
 *  (if any) so the player sees it instead of re-uploading. Also carries the
 *  player's designation + verified tick so the form can prefill the
 *  first-time fields for returning players. No key needed — the leaderboard
 *  is public anyway. */
function playerPhotoEndpoint_(p) {
  var nameSlug = slugify_(p.name);
  if (!nameSlug) {
    return reply_(p, { ok: false, error: 'Type your full name first.' });
  }
  try {
    var profile = playerProfile_(p.name);   // designation + verified from ledger
    var folder = getPhotoFolder_(getDriveFolder_());
    var f = findPhotoByPrefix_(folder, nameSlug);
    if (!f && !profile.found) {
      return reply_(p, { ok: false, error: 'no photo on file' });
    }
    var out = {
      ok: true,
      designation: profile.designation,
      verified: profile.verified
    };
    if (f) {
      var id = f.getId();
      out.name = f.getName();
      out.url = f.getUrl();
      out.fileId = id;
      out.thumb = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400';
    }
    return reply_(p, out);
  } catch (err) {
    return reply_(p, { ok: false, error: String(err) });
  }
}

/** Latest non-empty designation + verified flag for one player, straight
 *  from the ledger (three columns, one read pass — cheap per keystroke). */
function playerProfile_(name) {
  var who = normName_(name);
  var out = { found: false, designation: '', verified: false };
  if (!who) return out;
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var nameCol = HEADERS.indexOf('Full Name') + 1;
  var desigCol = HEADERS.indexOf('Player Designation') + 1;
  var verCol = HEADERS.indexOf('Player Verified') + 1;
  var names = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  var rest = sheet.getRange(2, Math.min(desigCol, verCol), lastRow - 1,
                            Math.abs(verCol - desigCol) + 1).getValues();
  var dOff = desigCol - Math.min(desigCol, verCol);
  var vOff = verCol - Math.min(desigCol, verCol);
  for (var i = 0; i < names.length; i++) {
    if (normName_(names[i][0]) !== who) continue;
    out.found = true;
    var dg = str_(rest[i][dOff]);
    if (dg) out.designation = dg;
    var pv = str_(rest[i][vOff]);
    if (pv) out.verified = pv.toUpperCase() === 'VERIFIED';
  }
  return out;
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
    return sheet;
  }
  // migration: sheets created before a HEADERS change get the new tail columns
  if (sheet.getLastColumn() < HEADERS.length) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1,
                   HEADERS.length - sheet.getLastColumn())
         .setValues([HEADERS.slice(sheet.getLastColumn())]);
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

/** ---------- NON-TECHNICAL GUIDE ("START HERE" tab) ----------
 *  Run ONCE from the script editor (or after any HEADERS change):
 *  buildAdminGuide() — creates/refreshes a plain-language tab in the league
 *  spreadsheet so a non-technical panellist can find anything without
 *  reading code: what every column means, who writes it, what to do next. */
function buildAdminGuide() {
  var GUIDE = [
    ['COLUMN', 'WHO FILLS IT', 'WHAT IT MEANS / WHAT TO DO'],
    ['Timestamp', 'Form (automatic)', 'When the entry landed. Newest first in the Control Room feed.'],
    ['Submission ID', 'Form (automatic)', 'One ID per submission — a retried entry never appends twice.'],
    ['Entry Type', 'Form (automatic)', 'NEW = first report of this post · UPDATE = a newer count for the same post.'],
    ['Snapshot #', 'Form (automatic)', 'Which report this is for the post (S1 = first, S2 = second…).'],
    ['Full Name', 'Player', 'The player as they typed it — the key for photos, designation, points.'],
    ['Reporting Manager', 'Player', 'Who they report to — used for identity checks.'],
    ['Content Type', 'Player (per post) + admin', 'PRAPER = Praper/PAVE content · PERSONAL = personal content. The 50:50 balance rule is checked PER PLATFORM on the PLAYERS tab (IG 5:5 = balanced).'],
    ['Platform / Format / Multiplier', 'Form (automatic)', 'Detected from the link itself. Multiplier: YT video ×2, Reels/Shorts ×1.25, IG/LI posts ×1.'],
    ['Post URL / Media ID', 'Form (automatic)', 'The post link and its unique fingerprint — the dedup key.'],
    ['Weekly Challenge / Challenge URL / Notes', 'Player (optional)', 'Filled only when entering the weekly challenge.'],
    ['Claimed Views/Impressions', 'Player', 'The number the player typed. Points = this × multiplier (rounded up).'],
    ['Projected Points', 'Form (automatic)', 'Claimed × multiplier. Becomes official only after verification.'],
    ['Screenshot File / Screenshot Link', 'Form (automatic)', 'The analytics screenshot in Drive — click the link to open it.'],
    ['OCR Count', 'SCAN button / admin', 'Machine-read number from the screenshot. Start here when verifying.'],
    ['Cross-Check', 'Admin', 'PENDING OCR → MATCH / MISMATCH / BOOST? (BOOST? = suspected fake views).'],
    ['Verified Count', 'Admin', 'What the screenshot REALLY shows. This is the number the league trusts.'],
    ['Verified Points', 'Form→admin (automatic)', 'Verified Count × multiplier — written for you, never edit by hand.'],
    ['Player Photo', 'Form (automatic)', 'One photo per player, reused on every entry.'],
    ['Collab With / Collab Status', 'Form (automatic)', 'COLLAB pairs. CONFIRMED = both players submitted the same link → points split 50:50.'],
    ['Player Designation', 'Player (first time)', 'Job title shown on the leaderboard. Reused automatically afterwards.'],
    ['Player Verified', 'Admin', 'VERIFIED = photo + designation checked against name · manager · designation (PLAYERS tab → CONFIRM ID). Green tick shows everywhere. Empty = no badge.'],
    ['PCL-Snapshots tab', 'Automatic (YouTube tracking)', 'The SYNC NOW pipeline appends every platform-observed count here: Timestamp · Media ID · Source · Views. Ledger rows show the latest as an AUTO tag in the feed.'],
    ['Admin devices', 'Automatic', 'Each operator\'s first unlock binds their browser. A different device under the same name is refused (LOGIN-DENIED in the log). Fix: resetAdminDevice("Full Name") in the editor.'],
    ['', '', ''],
    ['DAILY FLOW', '', '1. FEED tab: newest entries.  2. SCAN + compare screenshot.  3. Type Verified Count.'],
    ['', '', '4. Set Cross-Check.  5. SAVE CHANGES (sticky bar).  6. REPORTS → Players → VERIFY ID for new players.'],
    ['', '', 'Tie-break order: Verified Points > Projected Points. Suspicious jumps → AUDIT tab → FLAG BOOST?']
  ];
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName('START HERE');
  if (!sh) sh = ss.insertSheet('START HERE', 0);
  sh.clear();
  sh.getRange(1, 1, GUIDE.length, 3).setValues(GUIDE);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 230);
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 620);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#ed3b00').setFontColor('#ffffff');
  return 'START HERE tab created/refreshed.';
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
