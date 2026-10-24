# PCL OPS MAP — where to look for what

The one-page brain of the whole system: what lives where, how it connects,
and which update path to use for which change. Read this top to bottom once
and you will always know where to fix, where to check, and what to redeploy.

---

## 1 · The three habitats of one project

The same code lives in three places. Everything you ever "deploy" is moving
a change between them:

```
 GitHub: toadsage01/Praper-Contest-League (main repo)      ← source of truth
     │  every push to main auto-deploys → Vercel (public site)
     │      pcl-form.prapermedia.in  ·  praper-contest-league.vercel.app
     │
 GitHub: toadsage01/PCL (the internal-hosting repo)        ← company portal
     │  cloned on the company host → docker compose up -d --build
     │      served on the internal network, DNS made live to everyone
     │
 Google Apps Script (script.google.com — pasted Code.gs)   ← the ledger brain
        every change needs: paste → save → Deploy → New version
        writes/reads the Google Sheet (PCL-Data tab) that IS the database
```

**Rule of thumb:**
- Changed a **.html / .css / .js** file? → push to main repo (Vercel picks it
  up in ~1 min) AND pull+rebuild the PCL Docker portal.
- Changed **gas/Code.gs**? → paste it into the Apps Script editor and deploy a
  **New version** (the sheet never updates from a git push — the script is
  pasted, not linked).

## 2 · File map — what to open for what

| I want to fix / change… | Open… | Then deploy via… |
|---|---|---|
| Entry form fields, validation, OCR engine, drafts | `index.html` + `js/app.js` (+ `css/theme.css`) | push main + rebuild PCL |
| The OCR parser (number extraction) | `js/app.js` → `parseCounts_` / `directedCrops_` / `pickCount_` (one block, unit-tested) | push main + rebuild PCL |
| Leaderboard look/logic/info pop-up | `leaderboard.html` + `js/leaderboard.js` + `css/leaderboard.css` | push main + rebuild PCL |
| Week names/criteria/rewards (the 10 weeks) | `js/gas-endpoint.js` → challenge config | push main + rebuild PCL |
| Admin console UI/flows | `admin.html` + `js/admin.js` + `css/admin.css` | push main + rebuild PCL |
| CEO screening room | `director.html` + `css/director.css` (+ `directorFeed_` in Code.gs) | push main + rebuild PCL **and** paste Code.gs if backend changed |
| Admin passwords (the 6) | Apps Script editor → Code.gs → `var ADMINS` (~line 1245) | paste + **New version** |
| CEO screening passcode | Apps Script editor → Project Settings → Script Properties → `CEO_CODE` | nothing else — live instantly |
| Ingest rules, dedupe, collab pairing, points math, YT lift, backups | `gas/Code.gs` | paste + **New version** |
| Submit forwarding + employee-domain gate (Vercel path) | `api/submit.js` | push main (Vercel) |
| The same gate on the Docker portal | `server.js` (PCL repo) — mirrors the contract | rebuild PCL |
| Docker / Terraform / internal hosting | PCL repo: `Dockerfile`, `docker-compose.yml`, `terraform/`, `server.js`, `INTERNAL-HOSTING.md` | rebuild |

## 3 · The data path (how everything connects)

```
Player (form)
  │  types @praper.in work email + posts + screenshots
  │  Tesseract.js reads the screenshots IN THE BROWSER (4 passes) → OCR count
  │  YouTube links self-fetch the official viewCount instead
  ▼
/api/submit  (Vercel function, or server.js inside Docker)
  │  gate: present-but-non-@praper.in email → 422, never forwarded
  ▼
Apps Script Web App  (the /exec URL — one per deployment version)
  │  Code.gs ingest: dedupe by Submission ID, pair collabs by email,
  │  write the row into the Google Sheet (PCL-Data, review-first columns)
  │  OCR Count lands here too  ·  Cross-Check starts as PENDING OCR
  ▼
Google Sheet = the single source of truth
  │  read by: admin console (jsonp), leaderboard rollup, YT snapshot sync
  ▼
Admin console (admin.html) → SCAN re-reads the screenshot server-side
  (Drive OCR + ocrParse_ twin + ocrBoost_ ad re-check) → reviewer types
  Verified Count → MATCH/MISMATCH/BOOST? → points verified → leaderboard
```

The three browser portals (form / admin / leaderboard+director) are pure
static files — they hold no data. Everything they show comes from the Sheet
through the Apps Script Web App. That is why a Code.gs change never reaches
anyone until "New version" is clicked.

## 4 · Update runbooks

### 4a · Change something in the repo (HTML/CSS/JS)
```
# on your machine, in the clone:
git pull                      # start from latest
# ...edit files...
git add -A && git commit -m "what changed"
git push                      # main repo → Vercel redeploys automatically
```
Then on the **company host** (the internal portal):
```
cd PCL && git pull
docker compose up -d --build  # rebuilds the image, restarts the container
# or, if you launched it with Terraform:
terraform apply
```
Verify: open the internal URL hard-refreshed (Ctrl+F5) and `curl <portal>/healthz`.

### 4b · Change Code.gs (backend)
1. Open `gas/Code.gs` from the repo, copy the WHOLE file.
2. script.google.com → open the PCL script project → select all in Code.gs → paste.
3. Save (Ctrl+S) → **Deploy → Manage deployments → ✏ → Version: New version → Deploy**.
4. Smoke test: submit one entry, watch it land in the Sheet.
   ⚠ Forgetting "New version" is the #1 "why isn't it working" cause — the
   old code keeps serving until you cut a new version.

### 4c · The GAS editor drifted from the repo (your current case)
Someone edited Code.gs directly in script.google.com, so the live script and
the repo copy have diverged. To make the repo match reality again:
1. Apps Script editor → Code.gs → Ctrl+A → Ctrl+C.
2. Paste over your local `gas/Code.gs` (or send it to me and I'll diff + merge it).
3. Commit + push as above. From then on, 4b is the only path — one source of truth.

### 4d · Rotate the admin passwords
Apps Script editor → Code.gs → `var ADMINS` → edit the `pass:` values (keep
each `name:` as is — the name is what gets stamped on audit entries) → save →
**New version**. CEO room passcode: Script Properties → `CEO_CODE` (instant).

## 5 · Where to look when something breaks

| Symptom | First place to look |
|---|---|
| Form won't submit | Browser console (F12) → `[PCL OCR]` log + network tab on `/api/submit`; then the 422 messages from the gate |
| OCR reads a wrong number | The screenshot's text is in the console `[PCL OCR]` dump — check which layout shape failed; `scripts/test_ocr_parse.js` reproduces parsers offline |
| SCAN button errors | The Drive API advanced service must be ON (editor → Services); the error text names it |
| New Code.gs changes invisible | You skipped **New version** (4b step 3) |
| Internal portal shows old UI | You forgot `docker compose up -d --build` after `git pull` |
| Public site old, internal fine (or vice versa) | The two repos diverged — sync per 4a/4c |
| Sign-in / identity weirdness | The Work email field is the identity now; legacy Google sign-in engine is dormant in app.js (restore the #gpanel HTML to re-enable) |
| Data scare | `PCL-Data-Backup-YYYYMMDD` tabs (14 kept, daily trigger) — never edit those |

## 6 · Tests — your safety net before every push

All in the sibling `scripts/` folder of your workspace (node, no browser):
```
node scripts/test_ocr_parse.js      # the form's OCR brain (real screenshot dumps)
node scripts/test_ocr_server.js     # the SCAN twin + ad-mark detector
node scripts/test_do_post_collab.js # ingest/dedupe/collab/points (~168)
node scripts/test_threat_matrix.js  # 107 security assertions
node scripts/test_leaderboard_rollup.js · test_leaderboard_sanitize.js
node scripts/test_submit_gate.js · test_url_diag.js
```
If a test fails after your edit, the test output names the exact behaviour
that broke. Never push red.
