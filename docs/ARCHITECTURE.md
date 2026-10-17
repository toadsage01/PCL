# Architecture — Praper Contest League Form (Season 2)

Small, free, zero-build architecture. Static front end + Google Apps Script
backend + Google Sheets/Drive storage. Nothing to pay for, nothing to patch.

## Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Browser — static site (this repo, root)                 │
│                                                          │
│  index.html                                              │
│   ├─ SurveyJS Form Library (MIT, vendored 3.2.1)         │
│   ├─ css/theme.css        ← brand tokens → --sjs2-* vars │
│   ├─ js/gas-endpoint.js   ← CONFIG: GAS URL, max file MB │
│   ├─ js/survey-config.js  ← declarative form definition  │
│   └─ js/app.js            ← bootstrap + bulk-link parser  │
│                             + row sync + submit hook      │
│                                                          │
│  Validations (client, instant):                          │
│   • Post Links box → at least one parseable URL          │
│   • Each row's link → regex matched to the row's format  │
│     (IG reel/post, YT shorts/long, LinkedIn post — the   │
│     league's only 3 platforms)                           │
│   • Attachments → maxSize (bytes) + acceptedTypes        │
│   • Counts → numeric, min 0                              │
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
│   doGet: metrics JSON                                    │
│    → {ok, totalSubmissions, totalPosts, uniqueMedia,     │
│       lastSubmissionAt}                                  │
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
| Form page | `index.html` | Shell; loads vendored SurveyJS (offline-ready) |
| Theme | `css/theme.css` | Brand tokens + SurveyJS `--sjs2-*` variable mapping |
| Form definition | `js/survey-config.js` | 4 sections per the Rulebook (declarative JSON) |
| Endpoint config | `js/gas-endpoint.js` | GAS URL, `maxFileMB`, accepted file types |
| Bootstrap | `js/app.js` | Renders survey; bulk-link parsing + row sync + per-row validation; CORS-safe POST; LOCAL-mode fallback |
| Backend | `gas/Code.gs` | Media-ID dedup, ledger append, Drive upload, metrics |
| Local hosting | `serve.sh` | One command: `./serve.sh [port]` |

## Form structure (from the official Rulebook)

| # | Question | Type | Behaviour |
|---|---|---|---|
| 1 | Player Details | name + manager, side-by-side, required | roster identity on every submission |
| 2 | Post Links | multiline paste box, required | accepts URLs separated by spaces, commas, semicolons or new lines |
| 3 | Post Details | dynamic rows — one per parsed link | row: link (read-only) · format (5 rulebook formats) · content type (Praper / PAVE vs Personal) · views/impressions · screenshot (≤5 MB) |
| 4 | Weekly Challenge | optional panel: week + link + notes | all 10 rulebook weeks pre-listed |

Rows in "Post Details" are system-managed: `js/app.js` parses the link box
(debounced) and syncs the row count 1:1. Re-pasting or editing the list keeps
each row's format/screenshot — rows are matched by link first, then by
position, so a typo fix doesn't wipe entered data.

## Ledger & the anti-double-count model

Every POST = one append-only ledger row; a submission with N posts writes N
rows sharing one Submission ID (plus a per-row `Content Type` — Praper / PAVE
vs Personal — which feeds the rulebook's 50:50 ratio tracking; per-player
totals roll up by Full Name). The dedup key is the **Media ID** extracted
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

## Failure & fallback behaviour

- **No GAS URL configured** → LOCAL mode: payload logged to console +
  `localStorage["pcl_submissions"]`. Great for demos; zero setup.
- **GAS returns an error** → the form shows the save-failure state and logs
  the reason; the user can retry without retyping.
- **Attachment over cap** → blocked client-side; if a file sneaks through
  (e.g. client edited), `Code.gs` writes a `REJECTED — over N MB cap` marker
  in the Screenshot File cell instead of polluting Drive.

## Scaling notes

- Apps Script quotas (free consumer account): ~20,000 URL-fetch calls/day,
  POST body up to ~50 MB — a weekly contest form is nowhere near these.
- Base64 inflates uploads by ~33%; that is why the default cap is 5 MB.
- Public hosting: enable **GitHub Pages** (branch `main`, root) — the site
  is already a static root `index.html`, so zero changes are needed.
