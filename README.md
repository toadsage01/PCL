# Praper Contest League — Submission Form

A free, self-hostable contest submission form with **dual/multiple input
fields under a single question**, URL validation, **size-capped image
uploads**, full design customizability, and **Google Apps Script**
tracking (Google Sheets + Drive) for data and metrics.

Built on the **SurveyJS Form Library** (MIT license — free): the engine
feature Google Forms lacked (two inputs inside one question) is native
here, and the whole form is a declarative JSON you can reshape anytime.

**Pixel Arcade theme** — built from the PCL brand DNA: orange `#ed3b00`
(leaderboard bars) on a deep royal-blue family, pixel type (Press Start 2P,
Silkscreen, Pixelify Sans — all vendored in `fonts/`), square corners and
hard offset shadows everywhere, and **glow-driven light + dark modes**
("Sunset Cabinet" / "Midnight Arcade" — no bland black & white). The PCL
logo lives in the black arcade marquee header (`assets/brand/`, original
inspo saved in `assets/inspo/`).

## Features

- One question, many inputs — panels + `multipletext` (see Q1/Q2)
- URL inputs with built-in URL validator (Q1, Q4)
- Image/screenshot uploads with a hard MB cap, previews, type filter
- Customizable: every question lives in `js/survey-config.js`; theme in
  `css/theme.css`; more question types documented inline (dropdown,
  rating, repeatable groups…)
- Backend: `gas/Code.gs` → Sheets row per submission + Drive attachments
- LOCAL mode out of the box — works with no backend at all

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
5. Done. Submissions now land in a "Submissions" sheet; uploads go to a
   "Praper Contest League Uploads" Drive folder. `GET` the `/exec` URL for
   `{totalSubmissions, lastSubmissionAt}` metrics.

> Edited `Code.gs` later? Deploy → Manage deployments → New version, or
> the `/exec` URL keeps serving the old code.

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
| Questions / labels / required flags | `js/survey-config.js` |
| Attachment cap + accepted types | `js/gas-endpoint.js` (`maxFileMB`, `fileTypes`) |
| Colors / dark & light palettes | `css/theme.css` (`:root` + `html[data-pcl-theme="dark"]` tokens) |
| Hero & success art | `assets/brand/` (swap the PNGs) |
| Backend sheet/folder names, server cap | `gas/Code.gs` (top CONFIG block) |
| Success message | `completedHtml` in `survey-config.js` |
| Submit mode (direct vs Vercel API) | `js/gas-endpoint.js` (`submitViaApi`) |

Placeholders from the scratchpad (Q2 "File Formats", Q3 "Something",
Q1 Input 3) are clearly marked — swap the text when the spec lands.

## Docs

Architecture, data flow and failure modes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
