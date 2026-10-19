# Architecture — Praper Contest League Form (Season 2)

Small, free, zero-build architecture. Static front end (custom form engine, no
framework) + Google Apps Script backend + Google Sheets/Drive storage.
Nothing to pay for, nothing to patch.

## Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Browser — static site (this repo, root)                 │
│                                                          │
│  index.html                                              │
│   ├─ form markup (4 sections, static skeleton)           │
│   ├─ css/theme.css        ← pixel design system, tokens  │
│   ├─ js/gas-endpoint.js   ← CONFIG: GAS URL, max file MB │
│   └─ js/app.js            ← PCL form engine:             │
│        · URL engine — parses a paste of many links       │
│          (spaces / commas / semicolons / new lines),     │
│          auto-detects platform + format + multiplier,    │
│          extracts the Media ID client-side too           │
│        · link chips — every parsed link becomes a tag    │
│          in the box (× removes it; invalid links become  │
│          red chips with the reason on hover; amber       │
│          `.is-status` reserved for link-liveness later)  │
│        · Post Details — EDIT (columnar) / VIEW (compact  │
│          rows) modes + floating screenshot lightbox      │
│          with PREV/NEXT and a thumbnail strip            │
│        · validation — red border + "Required" under the  │
│          field, navy restored on input                   │
│        · CORS-safe POST / LOCAL fallback                 │
│                                                          │
│  Validations (client, instant):                          │
│   • name / manager required                              │
│   • ≥1 valid link; per-link platform+shape check at      │
│     commit time (paste / Enter / + ADD) — never on the   │
│     final submit                                         │
│   • per-post: views count + analytics screenshot         │
│     (PNG / JPG / WEBP, ≤5 MB)                            │
└───────────────┬──────────────────────────────────────────┘
                │  HTTPS POST — JSON body, simple request
                │  (text/plain content-type → no CORS preflight,
                │   which is exactly what Apps Script needs)
                ▼
┌──────────────────────────────────────────────────────────┐
│  Google Apps Script Web App (gas/Code.gs)                │
│   Execute as: Me   ·   Access: Anyone                    │
│                                                          │
│   doPost (per post in the submission):                   │
│    1. parse payload {submissionId, submittedAt, data}    │
│    2. extract Media ID from the post URL (IG shortcode,  │
│       YT video ID, LI activity id) — the dedup key       │
│    3. same Media ID again → UPDATE snapshot (never       │
│       duplicate views); first time → NEW                 │
│    4. screenshot → base64-decode → Drive folder          │
│       (5 MB server-side guard)                           │
│    5. append one ledger row per post (schema below)      │
│                                                          │
│   doGet: metrics + per-player roll-up JSON               │
│    → {ok, totalSubmissions, totalPosts, uniqueMedia,     │
│       lastSubmissionAt, players:[{player, manager,       │
│       submissions, posts, uniqueMedia, formatRatio,      │
│       projectedPoints}], generatedAt}                    │
│                                                          │
│   ADMIN (key-gated via Script Properties ADMIN_KEY):     │
│    doGet ?action=ledger&key=…&callback=… → full rows     │
│      (newest first, Drive file ids + thumb urls) +       │
│      totals + players — JSONP, zero CORS config          │
│    doGet ?action=ocr&key=…&fileId=…      → Drive OCR     │
│      suggests the count closest to the claim             │
│    doPost {action:'adminVerify', updates:[…]}            │
│      → writes OCR/Cross-Check/Verified cols; Verified    │
│      Points always recomputed server-side                │
└───────────────┬──────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Google Sheets "Submissions" (the ledger)     Google Drive folder     │
│  Identity → Media → Claims → Review → Audit   "PCL Uploads"           │
│  (full column order in gas/Code.gs → HEADERS) screenshots             │
└──────────────────────────────────────────────────────────────────────┘
```

## Component map

| Piece | File | Role |
|---|---|---|
| Form page | `index.html` | Shell + static form skeleton (panels, chip box, rows, lightbox) |
| Theme | `css/theme.css` | Pixel design system: tokens, marquee, panels, chips, rows, lightbox, error states |
| Endpoint config | `js/gas-endpoint.js` | GAS URL, `maxFileMB`, accepted file types, Vercel switch |
| Form engine | `js/app.js` | URL engine, chips, EDIT/VIEW rows, screenshots, lightbox, validation, POST |
| Backend | `gas/Code.gs` | Media-ID dedup, per-post ledger rows, Drive upload, metrics + per-player roll-up, season-clock week roll-up, admin endpoints |
| Leaderboard | `leaderboard.html` + `css/leaderboard.css` + `js/leaderboard.js` | Public high-score board: 5 columns, week chips, ticker, JSONP over the public stats endpoint, mock mode |
| Admin console | `admin.html` + `css/admin.css` + `js/admin.js` | Key-gated Control Room: feed + filters, review modal, audit timelines, reports, CSV export |
| Data face | `fonts/VT323-Regular.ttf` | Vendored terminal-pixel font — the board's data cells stay readable where display faces don't |
| Local hosting | `serve.sh` | One command: `./serve.sh [port]` |

> SurveyJS was dropped in this iteration: the chips box, dual-view post
> details, lightbox and the custom error model were all custom-rendered, so
> the library owned almost nothing. The engine is ~600 lines of dependency-free
> JS (the old vendored files remain in git history if ever needed).

## Form structure (from the official Rulebook)

| # | Section | UI | Behaviour |
|---|---|---|---|
| 1 | Player Details | two inputs, required | roster identity on every submission |
| 2 | Post Links | chip box + `+ ADD` | paste ALL links at once — spaces, commas, semicolons or new lines; each becomes a chip (× on hover removes); bad links become red chips with the reason on hover |
| 3 | Post Details | EDIT / VIEW toggle | one compact row per link. **EDIT** (default): link + auto format badge + views/impressions + screenshot button. **VIEW**: compact rows (# · link · format · PHOTO/ADD SHOT) with a centered lightbox — image, one-line details below, thumbnail strip, PREV/NEXT arrows |
| 4 | Weekly Challenge | optional select + link + notes | all 10 rulebook weeks; link/notes reveal only when a week is picked |

**Format auto-detection** (replaces the old manual dropdown): the URL decides
the format and its rulebook §3 multiplier —
`instagram.com/reel|reels → IG Reel ×1.25`, `/p → IG Post ×1`,
`youtube.com/shorts → YT Shorts ×1.25`, `watch?v= | youtu.be | /live → YT Video ×2`,
`linkedin.com/posts|feed/update → LinkedIn Post ×1`. Every pasteable shape is
accepted (`https://…`, `www.…`, bare `instagram.com/…`). Duplicate content is
caught client-side too — same Media ID twice → red chip "Already added".

**Error model (per spec):**
- Missing required field → red border + shadow + small "Required" below the
  field; the navy well returns the moment data is entered.
- Link problems are surfaced when the links are committed (paste / Enter /
  `+ ADD`) as red chips with the reason on hover — never as a surprise after
  the final submit. `.is-status` (amber) is reserved for the future
  link-liveness check (private / followers-only posts).

## Ledger & the anti-double-count model

Every POST = one append-only ledger row; a submission with N posts writes N
rows sharing one Submission ID. The dedup key is the **Media ID** extracted
from the post URL (`ig_<shortcode>`, `yt_<videoId>`, `li_<activityId>`).
Re-submitting a post (fresh counts, days later, bulk at the end — any
pattern) produces an `UPDATE` row with `Snapshot #` incremented: counts are
**snapshotted, never summed**, so the same views can never be counted twice.
Points = latest count × multiplier (fractions rounded up), computed as
*projected* on submission and finalized by the review pipeline:

```
Claimed Views/Impressions → OCR Count (from screenshot)
    → Cross-Check: PENDING OCR → MATCH / MISMATCH / BOOST?
    → Verified Count → Verified Points   (final leaderboard input)
```

The `Content Type` column (Praper/PAVE vs Personal) is deprecated — the form
no longer tags posts — but the column stays in `HEADERS` so existing sheet
layouts keep their column order; new rows leave it blank.

**Per-player roll-up (`doGet → players[]`)**: the league can see, per
candidate, submissions count, total posts, unique media, the format ratio
(`{"Instagram Reel": 3, "YouTube Video": 1, …}`) and points — without
double-counting, because unique media is keyed by Media ID.

**Leaderboard roll-up (`doGet → weeks` + `players[].impressions/points`)**:
UPDATE rows repeat the FULL count (they are snapshots, never deltas), so any
naive sum over rows double-counts. The roll-up therefore keeps, per Media
ID, only the **latest snapshot**: its effective views (verified count if
filled, else claimed) and points (verified points if filled, else
projected) are credited to that snapshot's player, and the media is
bucketed into the week of its **first** snapshot — when the post entered
the league. `players[].projectedPoints` / `verifiedPoints` switched from
row sums to these deduped sums (a quiet correctness fix for the admin
REPORTS tab too). The season clock (`SEASON_START_ISO`, 7-day windows,
warm-up → Week 1, cap 10) lives in `Code.gs`, mirroring the console's
client-side week engine.

Boost / gaming detection hooks built into this layout:
- **Snapshot timeline**: weekly snapshots per Media ID give views/day
  velocity — end-loaded bulk uploads are still auditable against the post's
  public counter.
- **Screenshot forensics**: OCR count vs claimed count mismatch, and
  "Sponsored/Boosted" markers on the insights screen, flip Cross-Check to a
  review state.
- **One Post, One Platform** (rulebook §6.4): media dedup exposes the same
  content cross-posted; the dashboard keeps only the higher-count platform.

Instagram **Trial Reels** note (researched): trial reels are shown only to
non-followers, get their own separate insights, and after ≥72 h can be shared
to the profile where the reel keeps accumulating normally. Because points come
from the post-URL's current insight count at snapshot time — one number per
Media ID — trial-phase views can't be double-counted alongside the published
reel; they're simply part of the reel's single lifetime counter when already
folded in, or predate the first snapshot when not.

## Storage recommendation (current + scale path)

Sheets is the master ledger up to ~50k rows (≈100 players × 20+ posts ×
10 weeks × updates is nowhere near that): zero infra, office-workspace
friendly, auditable by non-technical staff, and the dashboard can read it via
Sheets API or the GAS `doGet` JSON. Only if the dashboard later needs heavier
queries (velocity charts across every snapshot, OCR job state), mirror the
sheet into SQLite/Postgres as a read replica — the append-only, column-stable
schema above makes that a straight copy. Raw JSON is kept per row, so any
future re-parse never loses fidelity.

## Admin console (Control Room)

`admin.html` + `css/admin.css` + `js/admin.js` — a static page in the same
deploy, wearing the same pixel design system, gated by a **secret key** that
lives in the script's Script Properties (`setAdminKey("…")` once from the
editor; the page keeps it in `sessionStorage`, never `localStorage`).

Transport choices, deliberately boring:

- **Reads are JSONP** (`?action=ledger&key=…&callback=pclAdminCb12`): works
  from any static host with zero CORS configuration, no preflight, no
  credentials. Unique callback per request + a 60 s timeout guard.
- **Writes are the same simple POST the form uses**
  (`{action:'adminVerify', adminKey, updates:[{row, ocrCount, crossCheck,
  verifiedCount}, …]}`): text/plain body → no CORS preflight; the sheet row
  number is the write key. **Verified Points are always recomputed
  server-side** from the row's multiplier — the client never supplies them.
  A typed verified count promotes an untouched Cross-Check to MATCH; the
  reviewer can still override the status explicitly.
- **Batched staging**: console edits live in memory (`state.pending` keyed
  by sheet row) until **SAVE CHANGES** commits them in one POST, then the
  ledger reloads so row numbers stay fresh. Discard wipes the stage.

The four review jobs map onto three tabs:

| Tab | Job | Mechanics |
|---|---|---|
| **FEED** | submissions feed + verify counts | newest-first rows; filters: search, week, format, status, NEW/UPDATE; inline Verified Count + Cross-Check per row; thumbnail opens the **review modal** (screenshot side-by-side, SCAN → Drive OCR suggestion closest to the claim, PREV/NEXT across the filtered list, Esc/← →) |
| **AUDIT** | boost audit | per-Media-ID snapshot timelines (S1 → S2 → … with % and hours deltas); jumps **>50% within <72h** auto-mark **WATCH**; one click stages `BOOST?` on the latest snapshot (or clears it) |
| **REPORTS** | export & reports | season cards (submissions/posts/unique media/projected/verified points), **weekly windows** (Mon 11:00 AM IST deadline — weeks computed client-side from `SEASON_START_ISO`, warm-up posts fall into W1), per-player table (verified points lead, projected breaks ties, format mix), one-click CSV export (full ledger incl. staged values, BOM for Excel) |

Semi-auto OCR: `?action=ocr` runs the screenshot through **Drive's free
OCR** (Advanced Drive Service: image → temp Google Doc → text → regex out
`<n> views|impressions|plays|…`), suggests the number closest to the claim
(falls back to the largest), returns the raw snippet for the admin to
sanity-check, then trashes the temp doc. If the advanced service is off,
SCAN explains that and the console stays fully usable by hand.

Cross-Check whitelist (`gas/Code.gs → CHECK_VALUES`): `PENDING OCR`,
`MATCH`, `MISMATCH`, `BOOST?`.

Mock/demo mode: `admin.html?mock=1` — a built-in 10-row ledger (incl. a
+212%-in-26h boost case) exercises every surface offline; any key ≥ 4 chars
unlocks; writes apply to the in-memory mock only.

## Leaderboard (public board)

`leaderboard.html` + `css/leaderboard.css` + `js/leaderboard.js` — the
public face of the league, styled after the official PCL leaderboard sheet
(royal-blue stage, orange score bars, white cell dividers) inside the pixel
design system. Exactly five columns — RANK · NAME · DESIGNATION · TOTAL
IMPRESSIONS · TOTAL POINTS — fed by the SAME public stats endpoint the
form page already uses, over JSONP (zero CORS config, no env var involved:
the board reads GAS directly even when submissions travel through Vercel's
`/api/submit`).

- **Week chips** render from the `weeks` block (`current` drives the LIVE
  pulse and which weeks stay locked). No `weeks` block (an older deployed
  `Code.gs`) → ALL-SEASON only, silently.
- **Old-shape tolerance**: if `players[]` lacks `impressions`/`points`
  (pre-roll-up deployment), points fall back to
  `verifiedPoints || projectedPoints`; impressions show an em dash until
  the new backend is deployed.
- **Designations** come from `PLAYER_META` (Full Name → title) in
  `Code.gs`; unlisted names render an em dash.
- **Weak-network behaviour**: no auto-polling — a manual REFRESH with a
  LAST SYNC stamp, a SIGNAL LOST state with RETRY, and a 60 s JSONP guard.
- **`?mock=1`**: full offline board (players, designations, two weeks of
  data) for demos and browser tests.
- Public-page hygiene: no dev talk anywhere on the page — operational
  notes live here and in the README only.

## Failure & fallback behaviour

- **No GAS URL configured** → LOCAL mode: payload logged to console +
  `localStorage["pcl_submissions"]`. Great for demos; zero setup.
- **GAS returns an error** → the form shows the save-failure state and logs
  the reason; the user can retry without retyping.
- **Attachment over cap / wrong type** → blocked at pick time with a red
  "Over 5 MB" / "PNG / JPG / WEBP only" state on that row; if a file sneaks
  through (e.g. client edited), `Code.gs` writes a
  `REJECTED — over N MB cap` marker in the Screenshot File cell instead of
  polluting Drive.

## Scaling notes

- Apps Script quotas (free consumer account): ~20,000 URL-fetch calls/day,
  POST body up to ~50 MB — a weekly contest form is nowhere near these.
- Base64 inflates uploads by ~33%; that is why the default cap is 5 MB.
- Public hosting: enable **GitHub Pages** (branch `main`, root) — the site
  is already a static root `index.html`, so zero changes are needed.

## Round 13 — form iteration (font toggle, brand badges, photo, audit log)

- **Reading-font system**: `html[data-pcl-font="vt"|"px"]` token swap on
  `--pcl-font-body` (VT323 default, Pixelify Sans alternate), set pre-paint
  from `localStorage.pcl_font`. Toggle buttons (`#pclFontToggle`, Aa glyph)
  on index + admin, same storage key. VT mode steps body/inputs up to 19 px
  because VT323 runs narrow. Silkscreen/Press Start 2P headings untouched.
- **Brand badges** (`js/app.js BRAND_LOGO`): inline SVGs (IG gradient ring,
  YT red play, LI blue `in`) + word in brand colour via `[data-fmt]` CSS
  (IG word rides the gradient through `background-clip: text` with a solid
  fallback). Replaces the old `.pcl-fmt` text badge in chips, EDIT/VIEW rows
  and the lightbox meta line.
- **Season clock on the form**: `currentWeek()` mirrors Code.gs
  (`SEASON_START_ISO`, 7-day windows, warm-up → W1, cap 10).
  `buildWeekOptions()` renders ONLY the live week (canonical ledger value
  string "Week N — Title" preserved). `#weekInfoBtn` opens a themed modal
  (`Modal` IIFE, shared `#pclModal` shell) listing all 10 weeks from the
  rulebook with criteria + rewards + window dates.
- **Rulebook modal**: `openRulebook()` renders the official rulebook
  (sections 1–9) as themed HTML — no dev talk, public-safe copy.
- **Player photo**: form field `data-field=playerPhoto`, mandatory unless a
  photo is already on file. Debounced JSONP `?action=playerPhoto&name=…`
  on name input; backend stores `<slug(name)>__<slug(manager)>.<ext>` in the
  `PCL Player Photos` child folder, trashing the previous file first
  (exactly one photo per player) and reusing the stored one when the
  submission carries no new file. Ledger gains an append-only
  **Player Photo** column (index 24 — review-column indexes COL_OCR..23
  stay stable); `getSheet_()` tail-migrates older sheets. Photos never
  block a submission (all failures return '').
- **Audit catalogue**: new **AdminLog** sheet (`logAdmin_`). `adminLogin_`
  (POST after each gate unlock, with the operator name from the gate) and
  `adminVerify_` (per-row old→new review values) append entries;
  `ledgerEndpoint_` ships the last 150 as `log`. Console: gate gains the
  operator field (persisted in `sessionStorage.pcl_admin_op`), new **LOG**
  tab renders the catalogue, mock mode carries an in-memory log.
- **Layout fix**: ≤520 px the marquee text drops to its own full-width row
  (logo + two toggles on the first row) — the Aa button had squeezed it.

## Round 14 — SF Pro default, link ownership + collabs, cropper, self-healing submit

- **Reading font → SF Pro default**: `html[data-pcl-font="sf"]` (new
  default, `-apple-system / SF Pro Text / Segoe UI / Roboto` stack) with
  `vt` as the single alternate — the Aa button now means "pixel font
  (VT323)", stored value migrates (`px` → `vt`). Pre-paint snippet updated
  on index + admin + **leaderboard** (which also gained the Aa button);
  leaderboard board cells size per mode (19 px SF / 24 px VT). VT's 19 px
  compensations unchanged; Silkscreen / Press Start 2P headings untouched.
- **Official URL formats** (`classifyUrl` + `mediaId_` mirrored): IG adds
  `/tv/` (legacy IGTV → reel) and `instagr.am`; YT adds `/v/` and
  `youtube-nocookie`; LI adds **`lnkd.in`** (LinkedIn's own shortener —
  LinkedIn Help "Short URLs in shared posts") with `li_<token>` media ids.
  Third-party shorteners still rejected by the host allowlist.
- **Hash display**: post rows / VIEW rows / lightbox links render
  `#<first-8-of-media-id>` (full URL moved to `title` + the link target) —
  the brand badge already names the platform + format.
- **Link ownership + collab 50:50** (Code.gs): HEADERS gains append-only
  `Collab With` + `Collab Status` ('' | PENDING | CONFIRMED). `doPost`
  became validate-then-write: one `ledgerIndex_()` read pass builds
  media/URL-key → rows + Submission-ID set. Rules: same player + same key
  → UPDATE (snapshot = prior max + 1); different player → reject unless
  the partner tagged this player OR this player tags the partner
  (name-compared via `normName_`); a confirmed pair flips the partner's
  prior rows to CONFIRMED and fills their `Collab With`. `adminVerify_`
  computes `ceil(verified × mult / 2)` on CONFIRMED rows (log notes
  "COLLAB ½"); the `collect_` roll-up credits every CONFIRMED row of a
  media to its own player at half points (already-split verified cells
  never halve twice) — collab pairs share one Media ID, so the
  latest-snapshot rule alone would erase the partner. Idempotency: a
  repeated `submissionId` answers `{ok:true, duplicate:true}` with no
  append, making transport retries safe.
- **Photo cropper** (`Crop` IIFE + `#pclCrop`): FileReader → square
  viewport (640 canvas, cover-fit, pointer-drag pan, slider/buttons/wheel/
  pinch zoom, pan clamped so the frame never shows background) → **CROP &
  USE** re-renders to a 512×512 JPEG q0.85 data-URL (~100 KB) into
  `photoState.file`. This is also the fix for oversized payloads: photos
  no longer ride the wire as multi-MB originals. The photo field became a
  single compact line (round thumb · label + one-sentence hint · UPLOAD
  button) with a rewritten, shorter description; name + manager fields
  untouched.
- **Self-healing submit** (`postJson` + transport chain): `/api/submit`
  (12 s abort guard) → on network-only failure a direct **simple POST**
  (no Content-Type header → no preflight, GAS answers CORS-readable) to
  `gasWebAppUrl` (30 s). Response bodies are parsed even on HTTP 4xx/5xx
  so `ok:false` reasons reach the player: `saveState` shows `⚠ <reason>`
  for server rejections and the generic "SAVE FAILED — CHECK CONNECTION"
  only for true network failures on both transports.
- **Console**: collab badges (`COLLAB · ½` solid blue / `COLLAB?` gold)
  next to player names (name row became flex-wrap so tags never clip),
  partner shown as `⇄ <name>` in the sub line, review-modal meta carries
  the collab state, CSV gains Collab Status/With columns, mock ledger
  includes a confirmed pair (Rohit ⇄ Priya) with the halved verified
  points for demo truthfulness.
- **Tests**: `scripts/test_do_post_collab.js` (GAS env stub: sheet +
  DriveApp + PropertiesService + ContentService) covers ownership,
  collab confirm both directions, rejection texts, idempotency, lnkd.in
  ids and the verify split; `scripts/test_leaderboard_rollup.js` copied
  the new roll-up block verbatim + 5 collab cases (16 assertions);
  fixture_form.js gained the /exec fallback target + dup/route-down
  simulators for the browser E2E.
