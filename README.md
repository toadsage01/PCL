# Praper Contest League — Submission Form + Control Room

A free, self-hostable contest submission form for a **views-first league**:
players paste **all** their post links at once, every link becomes a chip,
the platform + format + multiplier is auto-detected, and each post carries
its own **analytics screenshot**. Google Apps Script + Sheets/Drive track it
all in a duplicate-proof ledger — and an **admin console** (`admin.html`)
reviews, verifies and audits it.

No form framework — the engine is ~600 lines of dependency-free vanilla JS
(`js/app.js`) over a static skeleton (`index.html`), so every interaction is
exactly as specified.

**Pixel Arcade theme** — built from the PCL brand DNA: orange `#ed3b00`
(leaderboard bars) on a deep royal-blue family, pixel type (Press Start 2P,
Silkscreen, Pixelify Sans — all vendored in `fonts/`), square corners and
hard offset shadows everywhere, and **glow-driven light + dark modes**
("Sunset Cabinet" / "Midnight Arcade" — no bland black & white). The PCL
logo lives in the black arcade marquee header with the SEASON 2 tag above
the SUBMISSION TERMINAL kicker (`assets/brand/`, original inspo in
`assets/inspo/`).

## Features

- **Bulk link paste** — throw every URL in one box (spaces, commas,
  semicolons or new lines). Valid links become chips (hover → × to remove);
  bad ones become red chips with the reason on hover. Enter / `+ ADD`
  commits more links anytime.
- **Format auto-detection** — no manual dropdown: the URL decides
  IG Reel ×1.25 / IG Post ×1 / YT Shorts ×1.25 / YT Video ×2 / LinkedIn
  Post ×1. Accepts `https://…`, `www.…` or bare-domain shapes.
- **Post Details, two modes** — EDIT (compact columnar: link · format badge ·
  views · screenshot) and VIEW (confirmation rows + floating screenshot
  lightbox with details line, thumbnail strip and PREV/NEXT).
- **Honest error UX** — missing required field: red border + shadow + small
  "Required" below, navy restored on input. Link errors appear at commit
  time, never after the final submit. (Amber state reserved for a future
  link-liveness / privacy check.)
- **Official link formats only** — every pasteable shape of the three
  league platforms passes: Instagram `instagram.com` + `instagr.am` legacy
  domain (`/p/`, `/reel/`, `/reels/`, `/tv/`), YouTube `youtube.com`
  (+ `m.` / `music.` subdomains) + `youtu.be` + `youtube-nocookie.com`
  (`watch?v=`, `/shorts/`, `/live/`, `/embed/`, `/v/`), LinkedIn
  `linkedin.com` (`/posts/`, `/feed/update/`, `/pulse/`, any activity id)
  plus **`lnkd.in` — LinkedIn's own shortener**. Third-party shorteners
  (bit.ly, tinyurl, …) stay rejected.
- **Link ownership + 50:50 collabs** — a submitted link belongs to the
  player who posted it first: the same player re-submitting it saves an
  UPDATE snapshot, but ANOTHER player's identical link is rejected unless
  it is a confirmed collab. Tag a post as **COLLAB** in Post Details and
  name the partner; when the partner submits the same link (either side
  can tag first), the backend confirms the pair, marks both ledger rows
  CONFIRMED and their points split 50:50 at verification and on the
  leaderboard roll-up. Unconfirmed collab tags stay PENDING (full points).
- **Photo cropper** — the player photo opens a square cropper: drag to
  position, zoom (slider / buttons / wheel / pinch), **CROP & USE** exports
  a 512×512 JPEG (~100 KB) so the submit payload stays light and fast.
- **Self-healing submit** — `/api/submit` first (12 s guard), then a direct
  simple POST to the GAS `/exec` URL; backend rejections (duplicate link,
  unconfirmed collab, missing env var) surface as their real message —
  never a phantom "SAVE FAILED — CHECK CONNECTION" on a healthy line.
  Retried submissions are recognised by `submissionId` and never append
  twice.
- **Duplicate-proof ledger** — Media ID extracted per URL (`ig_<shortcode>`,
  `yt_<videoId>`, `li_<activityId>`); the same post re-submitted is an
  UPDATE snapshot, never double-counted views. One row per post rolls up
  per player — `doGet` returns per-player post counts, unique media,
  format ratio and projected points. A link on file under another player
  is rejected at submission time (except the confirmed-collab flow above).
- **Image uploads** with a hard 5 MB cap, type filter, per-row thumbnails.
- **Player photo, one per player** — mandatory upload stored in Drive as
  `<name>__<manager>` inside a child folder; a re-submission replaces the old
  file (exactly one photo per unique player). Typing a name that already has
  a photo pulls it back into the form automatically (JSONP lookup), and the
  backend reuses it when no new file is picked.
- **Reading-font toggle** — the **Aa** button beside the theme switch flips
  the body face between **SF Pro / system sans** (the default on the form,
  leaderboard and Control Room) and **VT323**, the original terminal-pixel
  reading font. Titles keep the Silkscreen/Press Start 2P skeleton; the
  choice persists per browser.
- **Brand badges** — chips and post rows show a small platform logo
  (Instagram / YouTube / LinkedIn SVG) with the word Reel / Post / Short /
  Video tinted in the platform's brand colour — one readable item, not
  an acronym.
- **Weekly challenge, live week only** — the Week select offers just the
  week that is live right now (season clock: opens Mon 19 Oct 2026 11:00 AM
  IST, 7-day windows, warm-up counts as Week 1). The **i** button opens the
  full challenge calendar — every week's name, criteria, reward points and
  dates — so upcoming weeks can be planned.
- **Rulebook on a button** — the marquee's **RULEBOOK ▸** opens the official
  Season 2 rulebook (prizes, multipliers, 50:50 rule, participation rules)
  restyled to the theme, no PDF needed.
- **LOCAL mode** out of the box — works with no backend at all.

## Admin Console — `admin.html` (Control Room)

Same pixel design system, key-gated review surface over the ledger:

- **FEED** — every ledger row newest-first with filters (search, week,
  format, status, NEW/UPDATE). Edit **Verified Count** and **Cross-Check**
  (PENDING OCR / MATCH / MISMATCH / BOOST?) inline; edits are staged and
  written in one batch by the sticky **SAVE CHANGES** bar.
- **Review modal** — click any row thumbnail: the analytics screenshot sits
  side-by-side with the claim. **SCAN** runs the free Drive OCR pass and
  pre-fills a suggested count (you confirm). PREV/NEXT walks the filtered
  rows; Esc / ← → keys work.
- **AUDIT** — per-Media-ID snapshot timelines. Claimed-count jumps
  (>50% within <72h) get an automatic **WATCH** mark; one click stages a
  **BOOST?** flag on the latest snapshot.
- **REPORTS** — season cards (submissions / posts / unique media /
  projected + verified points), **weekly windows** (Mon 11:00 AM IST
  deadlines, per-week posts/points/leader), per-player table with format
  mix, and one-click **CSV export** of the full ledger.
- **LOG** — the audit catalogue: who unlocked the Control Room (the gate
  asks for the operator's name) and every saved write with old → new
  values. Stored in an **AdminLog** sheet, so accidental or random edits
  are always traceable. Feed rows also show the player's photo as an
  avatar when one is on file.

### Turn the console on (2 minutes)

1. Re-paste the new `gas/Code.gs` into your Apps Script project and create a
   **new deployment version**.
2. In the editor run once: `setAdminKey("your-secret")` — the key is stored
   in **Script Properties**, never in the repo.
3. Open `/admin.html`, unlock with the key (kept in `sessionStorage`).
4. Optional semi-auto OCR: in the editor **Services (+) → Drive API** add the
   advanced service. Without it the SCAN button explains itself and you type
   the count manually — everything else works.

> Demo without a backend: open `admin.html?mock=1` — a built-in mock ledger
> exercises every surface (any key with 4+ characters unlocks).

## Leaderboard — `leaderboard.html` (public)

The league's public high-score board, styled after the official PCL
leaderboard sheet (royal-blue stage, orange score bars, white dividers) in
the pixel design system, with a data face (VT323) chosen for readability.
Exactly five columns: **RANK · NAME · DESIGNATION · TOTAL IMPRESSIONS ·
TOTAL POINTS**.

- **Week chips** — ALL-SEASON + Week 1..10 once the backend reports season
  weeks; the live week pulses, future weeks are locked. A pre-weeks backend
  simply shows the ALL-SEASON board (no error).
- **Dedup math** — impressions/points are computed server-side: per Media ID
  only the newest snapshot counts (UPDATE rows repeat the full count), a
  post sits in the week of its first snapshot, and verified cells win over
  claimed/projected once the review fills them in. This also fixed
  `players[].projectedPoints`, which previously summed every snapshot row.
- **Resilience** — manual REFRESH + LAST SYNC stamp (weak-network friendly),
  SIGNAL LOST retry state, `?mock=1` offline demo board.
- **Designations** — fill `PLAYER_META` in `gas/Code.gs`
  (`'Full Name': 'Designation'`); unlisted names show an em dash.

### Turn the weekly tabs on (1 minute)

Re-paste `gas/Code.gs` into the Apps Script project and create a **new
deployment version** — the board picks up the `weeks` roll-up and
designations automatically. No frontend config, no other changes; the
season clock lives in `SEASON_START_ISO` / `LEAGUE_WEEKS` at the top of
`Code.gs`.

## Run locally

```bash
./serve.sh            # → http://localhost:8080
# or: python3 -m http.server 8080
```

No GAS URL configured yet? You are in LOCAL mode — submissions print to
the browser console and are kept in `localStorage` (`pcl_submissions`).

## Connect Google Apps Script (5 min)

1. Open <https://script.google.com> → **New project**
2. Paste `gas/Code.gs` into the editor, save
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the `/exec` URL into `js/gas-endpoint.js` → `gasWebAppUrl`
5. Done. Submissions land in a "Submissions" sheet (one row per post);
   uploads go to a "Praper Contest League Uploads" Drive folder. `GET` the
   `/exec` URL for `{totalSubmissions, totalPosts, uniqueMedia, players[], …}`
   metrics.

> Already deployed an earlier version? Re-paste `Code.gs` and create a NEW
> deployment version so `/exec` picks it up. The `Content Type` column is
> deprecated but kept in `HEADERS` — existing sheets keep working.

## Go public (free)

**Option A — GitHub Pages** (pure static, GAS URL visible in client config):

Settings → Pages → Deploy from branch → `main` / `(root)` → Save

**Option B — Vercel** (free tier, keeps the GAS URL secret server-side):

1. Push this repo, then in Vercel: **Add New → Project → Import** the repo
2. Framework preset: **Other** (it's a static site + one serverless fn)
3. Settings → Environment Variables → add
   `GOOGLE_SCRIPT_WEBAPP_URL` = your `/exec` URL
4. Deploy. Then flip `submitViaApi: true` in `js/gas-endpoint.js` so
   submissions route through `/api/submit` (the serverless forwarder in
   `api/submit.js`) instead of hitting GAS directly from the browser.

**Local dev like Vercel prod** (`vercel dev`):

```bash
npm i -g vercel        # once
vercel link            # follow prompts
cp .env.example .env.local   # then paste your GAS /exec URL inside
vercel dev             # → http://localhost:3000
```

> Scale notes: the form page is static → effectively unlimited concurrent
> viewers; the real bottleneck is Google Apps Script itself (fine for a
> weekly contest; for massive spikes, queue submissions before GAS).

## Customize

| What | Where |
|---|---|
| Section copy / week list | `index.html` (form skeleton) |
| URL → format rules, multipliers | `js/app.js` (`FORMATS`, `classifyUrl`) |
| Attachment cap + accepted types | `js/gas-endpoint.js` (`maxFileMB`, `fileTypes`) |
| Colors / dark & light palettes | `css/theme.css` (`:root` + `html[data-pcl-theme="dark"]` tokens) |
| Success screen | `#pclDone` markup in `index.html` |
| Backend sheet/folder names, server cap | `gas/Code.gs` (top CONFIG block) |
| Submit mode (direct vs Vercel API) | `js/gas-endpoint.js` (`submitViaApi`) |
| Admin season dates / week count | `js/admin.js` (`SEASON_START_ISO`, `WEEKS`) |
| Admin statuses / audit jump rule | `gas/Code.gs` (`CHECK_VALUES`) · `js/admin.js` (`renderAudit`) |

## Docs

Architecture, data flow and failure modes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
