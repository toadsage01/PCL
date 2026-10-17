# Praper Contest League — Submission Form

A free, self-hostable contest submission form for a **views-first league**:
players paste **all** their post links at once, every link becomes a chip,
the platform + format + multiplier is auto-detected, and each post carries
its own **analytics screenshot**. Google Apps Script + Sheets/Drive track it
all in a duplicate-proof ledger.

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
- **Duplicate-proof ledger** — Media ID extracted per URL (`ig_<shortcode>`,
  `yt_<videoId>`, `li_<activityId>`); the same post re-submitted is an
  UPDATE snapshot, never double-counted views. One row per post rolls up
  per player — `doGet` returns per-player post counts, unique media,
  format ratio and projected points.
- **Image uploads** with a hard 5 MB cap, type filter, per-row thumbnails.
- **LOCAL mode** out of the box — works with no backend at all.

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

## Docs

Architecture, data flow and failure modes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
