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
| Backend | `gas/Code.gs` | Media-ID dedup, per-post ledger rows, Drive upload, metrics + per-player roll-up |
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
(`{"Instagram Reel": 3, "YouTube Video": 1, …}`) and projected points —
without double-counting, because unique media is keyed by Media ID.

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
