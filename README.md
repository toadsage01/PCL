# Praper Content League — Season 2 · The Complete System Guide

**This document explains everything that was built, how it fits together,
what it enforces, and how to run it for the next 10 weeks without losing
or corrupting a single data point.**

> Audience: Manas (league engineer) first, the reviewer team second, and
> anyone who has to maintain this after the season. Read sections 1–5 once
> and you understand the machine; sections 10–14 are the operations
> runbook you will actually live in.

---

## 1 · What this is — the 30-second version

A free, zero-dependency contest system for a **views-first content league**
(100+ Praper Media participants, 10 weeks, LinkedIn + Instagram + YouTube):

| Piece | Where | What it does |
|---|---|---|
| **Entry Form** | `index.html` + `js/app.js` | Players submit post links + analytics screenshots; OCR reads the screenshots; YouTube counts auto-fetch |
| **Control Room** | `admin.html` + `js/admin.js` | The 6-person review team verifies photos, designations and every claimed number |
| **Leaderboard** | `leaderboard.html` + `js/leaderboard.js` | The public board — rank, name, designation, impressions, points. **Nothing else.** |
| **The Ledger** | Google Apps Script (`gas/Code.gs`) + Google Sheets | Every submission, review write, snapshot and audit line lives in one spreadsheet |
| **Relay** | `api/submit.js` on Vercel | Same-origin proxy so the form never fights CORS |

No form framework, no paid service, no server to rent: the frontend is
static (GitHub → Vercel), the backend is one Apps Script file over
Sheets + Drive.

**Theme** — pixel arcade: orange `#ed3b00`, hard offset shadows, square
corners, Silkscreen / Press Start 2P accents (vendored in `fonts/`), SF Pro
for readability everywhere else, and a dark/light "arcade cabinet" toggle.

---

## 2 · How identity works — there is no signup

There is deliberately **no account system**. A participant IS the pair:

> **(Full Name, Reporting Manager)** — typed on the form, verified by
> a human on the first submission.

- **Full Name** — the form carries the 60-person roster (name → real job
  title). Picking/typing a name auto-fills the designation. As of the
  latest build, if the typed name *nearly* matches a roster or ledger name
  ("Manas" vs "Manas Ranjan"), an amber **SAME PERSON?** hint appears with
  a one-tap USE button — two spellings of one human would otherwise
  become two leaderboard entities and split their points forever.
- **Designation (Desg.)** — chosen from a dropdown of the league's real
  titles (or typed), rendered as a smart capsule before the name
  ("VE", "Sr. Exec | Motion Graphics", …). First submission writes it to
  the ledger; later submissions reuse it silently.
- **Reporting Manager** — autocomplete over the real manager list
  (tap-to-fill), used for identity disambiguation and nothing else.
- **Photo** — cropped in-browser to a 512×512 JPEG (~100 KB). The photo is
  reused from the ledger the next time the same name appears — nobody
  uploads twice.

### The verification badge — and where it may appear

The reviewer team (Control Room) manually confirms that a participant's
photo is really them (not a meme/vulgar image) and that the designation is
correct. That confirmation produces a **VERIFIED tick** — and league
policy is absolute:

- ✅ Form: the player's own designation seal.
- ✅ Control Room: review flows, participant cards, photo lightbox.
- ❌ **Leaderboard: NEVER.** The public stats endpoint strips verification
  at the source (`publicPlayer_` in Code.gs) *and* the board renderer has
  no code path that could draw it. Rank, name, designation, impressions,
  points — nothing else ever.

### Optional: Google employee sign-in (@praper.in)

The form carries an **Employee Sign-In** card (section 0) that is
*invisible until switched on* — with no OAuth client configured, the form
behaves exactly as described above (Full Name + Reporting Manager). To
turn it on:

1. Google Cloud Console → Credentials → **OAuth 2.0 Client ID (Web app)**;
   add the site origin under *Authorized JavaScript origins*.
2. Paste the client ID in **two places**: `googleClientId` in
   `js/gas-endpoint.js` AND `GOOGLE_OAUTH_CLIENT_ID` in `gas/Code.gs`.
   **The Client Secret is never needed and must never be pasted anywhere**
   — not in chat, not in the repo, not in the sheet. The sign-in uses
   Google Identity Services with a signed ID token (no code exchange), so
   the secret has no role; keep it inside the Google Cloud Console only.
3. Paste the active-employee emails into the **`PCL-Allowlist` tab** of the
   league sheet — one `@praper.in` email per row, from row 2 down. The tab
   auto-creates on first use; admins edit it directly, no redeploy.

Sign-in is then accepted only when ALL of these hold — every one checked
SERVER-SIDE (`employeeLogin_` in Code.gs): Google's tokeninfo endpoint
verifies the ID token, the email is verified, the address ends in
`@praper.in` **and** it is on the allowlist (case/space-tolerant). On
success the form prefills the exact roster identity (never overwriting
what a human typed) and shows a signed-in chip with SIGN OUT. A blank or
missing allowlist denies everyone — employees only, by design.

**Pop-up fix + work-email fallback.** Google's pop-up hands the signed
token back to the form with `window.postMessage`; some browsers (Brave
shields, aggressive Cross-Origin-Opener-Policy isolation) sever that
hand-over and the button spins forever. Two layers of defence:

* `vercel.json` serves every page with
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` — the
  Google-documented fix; it ships with the next Vercel deploy, no manual
  step.
* The sign-in card ALWAYS carries a work-email fallback under the Google
  button: type your `@praper.in` email, CONTINUE (or press Enter — it
  never submits the form). The backend applies the SAME two gates as the
  token path — company domain + allowlist (`employeeLogin_` email leg,
  `emailLogin_` in Code.gs) — and maps `first.last@praper.in` onto the
  roster identity when it can. If the GIS script itself cannot load
  (offline, shields), the Google button goes away and the fallback
  carries the card alone.

Add BOTH origins (`https://praper-contest-league.vercel.app` and
`https://pcl-form.prapermedia.in`) under *Authorized JavaScript origins*
— sign-in fails with an origin mismatch on any other origin.

---

## 3 · The rulebook → what the code enforces

| Rulebook rule | Where it lives |
|---|---|
| YT Long-form ×2 · YT Shorts ×1.25 · IG Reels ×1.25 · IG Posts/Carousels ×1 · LinkedIn ×1 | `MULTIPLIERS` in Code.gs; format auto-detected from the URL, never hand-picked |
| **Fractional points round UP** | every points write goes through `Math.ceil` (9,863 reel views → 12,329 pts, never 12,328) |
| **Collab = FULL points each** (§6 rule 2: *"Both employees will receive 1,250 leaderboard points each"*) | Both rows share one `Media ID`; each scores its own player the FULL `ceil(views × mult)`. There is **no halving anywhere** — the roll-up credits every CONFIRMED row to its own player explicitly |
| One Post, One Platform (§6 rule 4) | identical content on multiple platforms → admin reviews; the ledger keeps every link for the audit |
| No paid boosting (§6 rule 3) | the review pipeline (Cross-Check = BOOST?) flags suspected paid spikes before points are verified; the form's OCR now ALSO reads the screenshot itself and **hard-blocks Boosted / Sponsored / Promoted / Paid-partnership screenshots** at attach time |
| Redundant-URL protection (no self-duplicate point spikes) | every link is fingerprinted to a `Media ID`; the same player resubmitting the same link is an **UPDATE** (snapshot refresh, never a second score); a *different* player claiming the same link untagged is **REJECTED — with the uploader's name in the message**; tagged both ways it becomes a **CONFIRMED collab**. The form also asks the ledger WHO owns every link the moment it is committed (`checklink`), so a clash shows as a banner BEFORE submit: red "already uploaded by {name}" or green "collabed with you — confirm below" with a one-tap CONFIRM |
| 50:50 content balance (§5) | every post carries `Content Type` = PRAPER or PERSONAL (one-tap toggle on the form, admin-editable); the Control Room's PLAYERS tab shows per-platform balance chips (amber when off-balance) |
| ≥2 platforms, ≥20 posts, weekly challenge deadlines | tracked in the ledger; challenge entries ride the weekly fields |
| Weekly challenge rewards (§4: +6000…+12000) | `PCL-Awards` tab + the REPORTS tab's **GIVE** control; award points ride on top of post multipliers in season totals and weekly buckets |
| CBO/COO & notice-period players earn points but no prizes | organizational — the board scores everyone identically |

---

## 4 · How a submission travels — end to end

```
Player form (index.html)
  1. paste links            → chips, format auto-detected, duplicates flagged;
                              each committed link asks the ledger WHO owns it
                              (JSONP action=checklink) → instant banner:
                              red "ALREADY UPLOADED BY {name}" (submit blocked
                              until replaced or collab-tagged) / green
                              "COLLABED WITH YOU by {name} — confirm below"
  2. type views OR let the machine read them (see §8)
  3. attach screenshot      → downscaled to ≤1600px JPEG (~130KB, was ~2.7MB raw)
  4. SUBMIT                 → payload = identity + posts[] + screenshots + OCR reads
                             → one submissionId ("pcl-<time>-<rand>") stamps the whole batch
  5. transport chain:
       a. POST /api/submit (Vercel function, same-origin, 30s timeout)
            → forwards to the Apps Script /exec URL (secret env var)
            → relays GAS's JSON answer verbatim
       b. if that route is unreachable → direct simple POST to /exec
            (the 302 answer is CORS-unreadable BY DESIGN of Google's infra,
             so the form then CONFIRMS via JSONP action=subcheck, keyed on
             the submissionId; found → success, truly-absent → one auto
             retry → honest failure)
  6. GAS ingest (under a serialization LockService):
       - per post: ownership check → NEW / UPDATE / REJECT / collab CONFIRM
       - screenshots → Drive files; row(s) appended to PCL-Data
       - OCR Count written at ingest; Projected Points precomputed (ceil)
       - idempotent: a retried submissionId can never append twice
  7. form shows ENTRY LOGGED! / Points Queued — draft wiped
```

**Failure semantics (the SAVE-FAILED saga):** a non-JSON gateway answer is
*never* mistaken for success; a server rejection ("duplicate link",
"collab not confirmed") stops the chain and shows its real message; only
true network drops fall through to the next transport. The Vercel function
declares `maxDuration = 60` and answers upstream failures in plain text so
the frontend falls through instead of showing a phantom rejection.

---

## 5 · The Google Sheet — the single source of truth

One spreadsheet, four tabs (SIDEBAR: `SHEET_ID` in Code.gs):

### Tab `PCL-Data` — the ledger (29 columns, REVIEW-FIRST order)

Physical order = review priority. Every access in the code is **by header
name**, so the layout is presentation-only:

| # | Column | Meaning |
|---|---|---|
| 1 | Timestamp | row write time (IST) |
| 2–4 | Full Name · Reporting Manager · Player Designation | identity (repeats on every row the player owns) |
| 5 | Player Verified | `VERIFIED` once the Control Room confirms photo + designation — admin-facing only |
| 6 | Player Photo | Drive link to the 512px crop |
| 7 | Entry Type | `NEW` first claim of a media id · `UPDATE` same player refreshing the count |
| 8 | Weekly Challenge | which challenge this entry enters (blank = none) |
| 9–13 | Platform · Format · Multiplier · Post URL · Media ID | what the post is; Media ID = dedupe key |
| 14–16 | Collab With · Collab Status · Content Type | collab lifecycle + PRAPER/PERSONAL tag |
| 17–18 | Claimed Views/Impressions · OCR Count | what the player typed · what the machine read off the screenshot |
| 19 | Cross-Check | review state: `PENDING OCR` / `MATCH` / `MISMATCH` / `BOOST?` |
| 20–22 | Verified Count · Verified Points · Projected Points | the reviewer's final numbers and both point derivations |
| 23–24 | Screenshot File · Screenshot Link | Drive evidence |
| 25–26 | Challenge URL · Notes | weekly-challenge context |
| 27–29 | Submission ID · Snapshot # · Raw JSON | machine/audit tail |

### Tab `PCL-Snapshots`
Append-only metric snapshots (per Media ID: source, observed count, time)
written by the twice-daily trigger and SYNC NOW. The newest snapshot per
media rides every ledger row as an AUTO tag — the reviewer sees the
platform-observed number next to the claim without opening anything.

### Tab `AdminLog`
Every admin write: who (derived from the admin's password server-side — a
client can never mislabel it), what, old→new values. LOGIN entries add the
device fingerprint as context. The AUDIT and ADMIN LOG tabs render it. This
is the season's legal record.

### Tab `PCL-Awards`
Weekly-challenge rewards: Week · Player · Points · Note · Awarded By.
Folded into totals by the roll-up automatically.

---

## 6 · Scoring math — how points are derived

```
projected points (per row) = ceil(claimed views × format multiplier)
verified points (per row)  = ceil(verified count × format multiplier)   ← full points, collab or not
```

Player totals (deduped — only the **newest snapshot per Media ID** counts,
so UPDATEs never stack):

- **impressions** = Σ verified count where present, else claimed count
- **points** = Σ verified points where present, else projected — plus
  weekly-challenge awards
- weekly buckets credit each media to the week of its **first** snapshot
  (a post stays in the week it entered the league, no matter when the
  count was refreshed)

The leaderboard's points column = verified-where-filled, projected
otherwise — the honest "current best" number the rulebook wants.

---

## 7 · The review pipeline — from claim to verified

Each row walks: `PENDING OCR → MATCH / MISMATCH / BOOST? → Verified Count
filled → points verified`.

1. **The machine reads first.** OCR (Tesseract.js, client-side) extracts
   the number from every attached screenshot at attach time; YouTube links
   self-fetch the official `viewCount` via the Data API key. The form
   auto-fills under an `AUTO · OCR` / `AUTO · YOUTUBE` tag; if the player
   typed a different number, a tap-to-use `OCR READS x — USE` chip offers
   the machine read; a human edit always wins. Machine reads land in the
   **OCR Count** column at ingest.
2. **The reviewer compares.** The Control Room feed shows claimed · OCR ·
   tracked (platform snapshot) side by side. A typed verified count that
   matches promotes the row to MATCH automatically.
3. **The reviewer writes the final number** (Verified Count) — points
   derive and the row is done. SCAN (Drive-side OCR) and the review modal
   can overwrite anything; every write is logged old→new.

**The review modal is a screening view.** Built for the (non-technical)
HR review team, it pairs the media with everything needed to judge a row
without opening a second tab:

- **Left — the media stage**: the post plays in-page (YouTube /
  Instagram embed) exactly like the CEO's Screening Room; a
  **POST / SCREENSHOT** switch flips to the analytics screenshot (the
  only option for LinkedIn, which blocks in-page playback). A dead Drive
  thumbnail degrades to a note, never a broken-image icon.
- **Right — the verification rail**: participant card (photo with
  initials fallback · designation · manager), the season roll-up
  (**N videos · total views · season points**), a per-video list with
  views per post (the open row highlighted), claimed/snapshot/week
  stats, the prefilled OCR count, and a **live score preview** —
  `verified × multiplier, rounded up` updates as you type, so nobody on
  the review team does multiplication.
- The workflow is unchanged: type the verified count, cross-check,
  content type, STAGE THIS ROW → SAVE CHANGES. Every write logged.

---

## 8 · Metrics auto-tracking — what's automatic vs manual

| Platform | Automatic | Manual fallback |
|---|---|---|
| **YouTube** | official `viewCount` via Data API v3 (key health-tested; form reads it the moment a `yt_` link lands; server batch-syncs twice daily into PCL-Snapshots) | screenshot + OCR |
| **Instagram** | none possible without a reviewed Meta app (impressions are author-private) | screenshot + OCR; snapshot sync stub awaits the Meta app |
| **LinkedIn** | no public API at all (option (c) decision) | screenshot + OCR floor |

**Why "impressions" was never needed for YouTube:** the Data API's public
`viewCount` is the scored metric; Studio impressions are author-private
data (OAuth-locked). The research phase listed them as an ideal-to-have;
the working key made them moot — YT participants type and screenshot
nothing.

**OCR compliance reads (form-side, on every attached screenshot):** the
recognition now runs up to three passes — the plain image, an **inverted
retry for dark-mode screenshots** (white-on-black phones), and an
**upscaled PSM-6 retry for small region crops** (a phone crop of just the
stats strip, which carries no UI words at all). The extracted text is then
policed by two unit-tested detectors: `detectBoost_` (Boosted / Sponsored /
Promoted / Paid partnership / a standalone "Ad" badge → the row refuses to
submit: *"Boosted / sponsored content is not allowed"*) and
`platformCheck_` (another platform's unmistakable chrome on the wrong
link — "YouTube" on an IG upload — refuses the shot; chrome-less crops and
matching platforms always pass). Replacing the screenshot re-runs the
verdict; the reviewer's own server-side SCAN remains the final word.

---

## 9 · The Control Room — the reviewer team's console

- **Gate — one password per admin**: Pratham Jindal, Sejal Choudhary,
  Kanupriya Srikoti, Vikram Singh Mawari, Lagan Garg, Manas Ranjan — interim
  passwords follow `firstName@123` (e.g. `lagan@123`), held ONLY in the
  `ADMINS` roster inside `gas/Code.gs` (never client-side). **The password
  is the identity**: the backend derives the operator name from it and
  stamps every audit entry with that name — a client can never sign an
  action under somebody else's name, and there is no name picker to misuse.
  The browser fingerprint still rides along in the log as context, but it
  gates nothing — a new device just works. Rotate by editing the `ADMINS`
  list and deploying a new version.
- **FEED** — every row newest-first: brand badges, collab tags, content
  type, hashes, OCR/tracked AUTO tags, quick chips (ALL / NEEDS REVIEW /
  BOOST / MISMATCH / DONE) and instant filters. Staged edits save in one
  batch (SAVE CHANGES).
- **PLAYERS** — all participants: aggregated points/views, per-platform
  balance chips, app multi-select, photo + identity verification
  (**CONFIRM ID** = green tick; identity triple: name · manager ·
  designation), CONFIRM/CLEAR per media id.
- **REPORTS** — season cards + weekly windows (Mon 11:00 IST closes) +
  per-week **CHALLENGE AWARD** (pick a player, type points, GIVE — writes
  to PCL-Awards, appears in totals instantly).
- **AUDIT / ADMIN LOG** — the AdminLog catalogue.
- **CSV EXPORT** — full ledger client-side.

---

## 10 · The public leaderboard

- JSONP read of the stats endpoint with a cache-buster (Google's /exec CDN
  would otherwise serve stale numbers); 60s client guard, REFRESH button.
- ALL-SEASON + W1…W10 tabs; LAST SYNC stamp.
- **Shows**: RANK · NAME · DESIGNATION · TOTAL IMPRESSIONS · TOTAL POINTS.
- **Never shows**: verification status (stripped server-side), photos,
  manager names, collab details, OCR/machine values, admin anything.
- **Number pipeline, twice-hardened**: the backend coerces every count
  (`numOrBlank_`/`toCount_` — commas and spaces stripped, always numeric)
  and the client re-coerces before rendering (`toNum` + a self-defensive
  `fmt`), so a sheet string can never again reach the board as a raw
  string, `NaN` or `Infinity` — the "string as view" class of bug is dead
  at both layers (33-assertion sanitize suite proves it).

## 10.5 · The Screening Room — the Director's private theatre

`director.html` (not linked anywhere public; reachable from the Control
Room header) is a dark, cinematic, one-entry-at-a-time player. It exists
so the Director /CEO can screen entries in a premium experience:

- **Passcode-gated, nobody else.** The feed endpoint (`directorFeed_` in
  Code.gs) refuses every request that does not carry the screening
  passcode — wrong code leaks nothing. The passcode lives server-side:
  Script Property **`CEO_CODE`**, default `director@123` until you set
  the property. It is deliberately separate from the six admin passwords.
  The page offers "remember on this device" so the CEO types it once.
- **Two tabs.** **WEEKLY CHALLENGE** opens first — the live week's
  challenge entries only. **PCL SEASON 2 · ALL CONTENTS** is the whole
  season: every post, challenge or not, any week, tagged with its week
  number and the post's reported view count. Both lists are deduped per
  post (newest snapshot wins), collab partners merged onto one entry, in
  submission order.
- **Media that always shows.** YouTube plays inline (privacy-enhanced
  embed), Instagram Reels/posts embed in the stage, LinkedIn — which
  blocks in-page playback entirely — shows the participant's own
  analytics screenshot on the stage instead, and every entry with both a
  post and a screenshot gets a **POST / SCREENSHOT switch** so a blank
  embed never strands the viewer. If a Drive thumbnail ever refuses to
  load, the stage degrades to the calm link card automatically. Player
  chips carry the participant's **photo** (initials underneath as the
  fallback) and OPEN ORIGINAL POST / ANALYTICS SHOT chips stay.
- **Judging, not scoring**: the weekly tab shows content, not claimed
  counts — weekly challenges are judged on liking/disliking (see §3),
  and the reward itself is granted from the Control Room's REPORTS tab.
- Navigate with PREV/NEXT, the numbered squares, or the ← → keys.
- The Control Room's **review modal** (admins/HRs) uses the same media
  contract — embed + POST/SCREENSHOT switch — wrapped around the
  verification workflow (see §3).

---

## 11 · Data-integrity guarantees — the "no corruption, no loss" list

1. **Identity uniqueness** — Media-ID ownership: one link → one owner;
   second claimer rejected or collab-confirmed. Same player + same link →
   UPDATE (snapshot), never a duplicate score. Submission-ID idempotency:
   a retry can't double-append. Near-match name hint at the form catches
   "Manas" vs "Manas Ranjan" before it lands.
2. **No lost updates** — every ingest runs under `LockService` (30s wait):
   two participants submitting in the same instant serialize.
3. **No silent point inflation** — ceil everywhere, dedup by newest
   snapshot per media, UPDATE rows carry full current counts (never
   deltas), collab rows score full-but-independent.
4. **Absurd numbers get caught early** — the form raises a "VERY HIGH"
   lamp above 25,000,000; the OCR reader rejects >1e10; the reviewer makes
   the final call with OCR + tracked snapshots side by side.
5. **Nothing is destructive** — appends only; reviews overwrite specific
   cells with old→new audit lines; `reorganizeForReview_()` backs the whole
   tab up before touching a single column; CSV export is one click.
6. **Transport honesty** — no phantom successes (non-JSON answers fail),
   no phantom failures (the 302 is verified through subcheck).

## 12 · Deployment — what runs where

| Piece | Host | Notes |
|---|---|---|
| 3 portals | GitHub repo → Vercel (`praper-contest-league.vercel.app`) | auto-redeploys on push |
| `/api/submit` | Vercel function | needs env var `GOOGLE_SCRIPT_WEBAPP_URL` (set) |
| Backend | Apps Script bound to the Sheet | **pinned-version deploy: every Code.gs change = paste + New version** |
| Secrets | Script Properties | optional `YOUTUBE_API_KEY` override (admin passwords live in the `ADMINS` roster in Code.gs) |

**The one manual step (C1): paste `gas/Code.gs` into the Apps Script
editor → Deploy → Manage deployments → Edit → New version.** That single
paste installs: content-type persistence, the six-password admin roster,
the YouTube tracking leg + PCL-Snapshots, subcheck, LockService, collab
full-points, PCL-Awards, the review-first HEADERS, and the OCR-count ingest.

## 13 · Operations runbook — launch + the 10-week rhythm

**Before W1 opens (one-time, in the Apps Script editor):**
1. Paste Code.gs + New version (above).
2. Run `reorganizeForReview_()` once — physically reorders the existing
   PCL-Data columns to the review-first layout (auto-backup tab first).
3. **Clean the test mess**: the sheet currently holds test rows (61
   Jasmine rows, a 17,017,775,513 "Manas", manager typos like "Vikram" vs
   "Vikram Singh"). Select those rows in PCL-Data → delete. Do this BEFORE
   week 1 so the board starts clean. (The form-side guards now prevent
   every one of those mess classes; the old rows just need deleting.)
4. Optional: `buildAdminGuide()` prints an in-editor cheatsheet.

**Weekly rhythm (reviewer team):**
- **Mon 11:00 IST** — the week closes (rulebook). FEED → review every
  PENDING OCR row: compare claimed vs OCR vs tracked → type Verified
  Count → SAVE CHANGES. DONE chip = check MATCH or verified filled.
- **Verify identities** — PLAYERS tab: photo real? designation right?
  → CONFIRM ID. Unverified is invisible to the public board by design.
- **Award the week** — REPORTS → CHALLENGE AWARD → GIVE.
- **Watch the SYNC stamp** — YT syncs twice daily (09:00/21:00 trigger);
  SYNC NOW forces a pass. IG/LI stay manual (screenshots).
- **Mondays are the rush** — submissions serialize behind the lock;
  the form retries and verifies on its own; nobody needs to babysit.

**If something looks wrong:** AUDIT tab shows who-wrote-what; the backup
tabs (`PCL-Data-Backup-*`) are pristine copies; the sheet's File → Version
history covers the rest. Nothing in this system deletes.

## 14 · The test suite — what's proven and how to re-run it

| Suite | Proves | Run |
|---|---|---|
| `scripts/test_do_post_collab.js` | ~141 assertions: ownership/dedupe/collab (FULL points, rulebook example), idempotency, OCR ingest, six-password roster + server-derived audit stamps, subcheck, awards math, public-stats strip (verified **and manager**), review-first reorder with data survival, CEO screening feed (current-week entries **+ season ALL list**, per-person photo/view arrays, newest-snapshot OCR wins, comma-cell parsing), employee sign-in (tokeninfo stub incl. **aud mismatch**, + work-email fallback legs 23j–23n2), checklink pre-check, **hardening groups 25–29: cellSafe_ formula defusal, safeUrl_ scheme rejection, javascript:-link ingest refusal, non-image screenshot REJECTED, daily backup naming/dedupe/prune** | `node scripts/test_do_post_collab.js` |
| `scripts/test_threat_matrix.js` | 107 adversarial assertions: JSONP callback charset (10 injection shapes), formula-injection vectors, hostile URL schemes (javascript/data/vbscript/file/blob, IDN homoglyphs, userinfo tricks, spoofed subdomains), esc() coverage on all four renderers, csvCell CSV-injection guard, safeHref in admin + director, hostile number shapes (Indian grouping, dot-thousands, >1e10) | `node scripts/test_threat_matrix.js` |
| `scripts/test_ocr_parse.js` | 63 assertions: real screenshot layouts, K/M suffixes, caption-bleed guards, >1e10 rejection, **boost/sponsored/ad-badged text flags** (bare "boost" = the universal button → never flags; only the Boosted/Sponsored/Promoted STATE does), and **platform fingerprints** (wrong-platform chrome refused, chrome-less region crops never blocked) | `node scripts/test_ocr_parse.js` |
| `scripts/test_leaderboard_rollup.js` | 16: dedup-by-media, verified-over-claimed, weekly buckets | `node scripts/test_leaderboard_rollup.js` |
| `scripts/test_url_diag.js` | 24: every accepted URL shape | `node scripts/test_url_diag.js` |
| `scripts/test_leaderboard_sanitize.js` | 33: the board can never render a raw string/NaN/Infinity as a view count (comma strings, NBSP, garbage, old payload shapes) | `node scripts/test_leaderboard_sanitize.js` |
| `scripts/save_e2e.sh` + `fixture_save.js` | browser E2E of the transport chain against the REAL wire shapes (Vercel-healthy / GAS-302 / dead-route) | `bash scripts/save_e2e.sh` |
| `scripts/round27_e2e.sh` + `fixture_form.js` | browser E2E of the ownership banners (taken + collab-for + one-tap CONFIRM), the collab Enter field-confirm fix (picker-open Enter still chooses), and logo→form with content after the DONE screen | `bash scripts/round27_e2e.sh` |
| `scripts/round28_e2e.sh` + `fixture_form.js` | browser E2E of the hardening round: Enter-in-name/challenge never submits (links Enter still commits chips), leaderboard og-font mapping, admin mock FULL collab points + review-modal meta, dark theme + 390px mobile no-h-scroll | `bash scripts/round28_e2e.sh` |
| `scripts/round_e2e.sh` + `fixture_director.js` | browser E2E of the Screening Room round: gate deny/open, YT embed + pfp disc + hint-text removal, POST/SCREENSHOT switch, IG collab merge, LinkedIn shot stage, WEEKLY → ALL CONTENTS tabs (regular post tagged with views, no week), weekly restore, keyboard nav | `bash scripts/round_e2e.sh` |
| `scripts/round29_admin_e2e.sh` + `fixture_form.js` | browser E2E of the admin screening view: embed stage + switch inside the review modal, participant card, per-video list with the open row highlighted, live score preview (verified × multiplier, rounded up), arrow-key stepping | `bash scripts/round29_admin_e2e.sh` |
| `scripts/round30_e2e.sh` + `fixture_form.js` (PCL_FIXTURE_CLIENT_ID=1) | browser E2E of the sign-in card: fallback visible alongside the Google button, Enter checks the email and never submits, format + roster guards with the backend's verbatim refusal, allowlisted `@praper.in` email signs in + prefills the roster identity, SIGN OUT restores the fallback | `bash scripts/round30_e2e.sh` |
| `scripts/probe_live.sh` | READ-ONLY live probes (GAS stats/subcheck/checklink JSONP, wrong-password refusal, hostile-callback echo check, the four portals, YT key, GSI client) — zero sheet writes by design | `bash scripts/probe_live.sh` |
| `scripts/ocr_e2e.sh`, `save_e2e.sh`, prior rounds | agent-browser E2E across all 3 portals (form flows, admin gate/tabs/awards, leaderboard) | see scripts/ |

## 15 · Known limits & gotchas

- **GAS is pinned-version**: a paste without "New version" changes nothing.
  If the console and sheet ever disagree, suspect a stale deployment.
- **Google's /exec CDN caches GETs** — all reads carry `&_=<ms>`; don't
  remove the cache-busters.
- **The direct /exec leg can never read its own answer** (302 + no CORS
  headers — Google's infrastructure, not a bug). subcheck exists for that
  reason; keep it deployed.
- **Vercel Hobby body ceiling 4.5MB** — the payload diet (≤1600px shots)
  keeps submissions ~130–400KB; the 413 guard has a readable message.
- **The YT API key is public by design** (front-end auto-read); restrict
  it by referrer in Google Cloud if you ever want belt-and-suspenders.
- **Identity is spelling-sensitive by nature** — the hint chip + roster
  autofill prevent most; the reviewer's PLAYERS tab is the final net.
- **Screening passcode** — `director@123` works only until a `CEO_CODE`
  Script Property is set; set it to rotate. Until the C1 paste, the OLD
  deployed backend does not know `directorFeed`/`employeeLogin` at all.
- **The sign-in card is invisible until a client ID is pasted** — that is
  deliberate; the form never depends on Google being reachable.
- **The OAuth client ID is now wired** in `js/gas-endpoint.js` and
  `gas/Code.gs` (GOOGLE_OAUTH_CLIENT_ID). Sign-in only works when the page
  is served from an Authorized JavaScript origin — currently
  `https://pcl-form.prapermedia.in`. The CLIENT SECRET never goes into any
  file in this repo — it stays in Google Cloud; nothing here needs it.
- **pcl-form.prapermedia.in currently serves a GAS "Html Convert Error"
  page, not this Vercel build** (found by the live probes). Point the
  domain at the Vercel deployment (Vercel → Settings → Domains → add
  `pcl-form.prapermedia.in`, then fix DNS at the registrar) — until then
  Google sign-in is authorized for an origin that isn't serving the form.
- **The daily ledger backup installs itself** on the first SYNC NOW (or
  run `setupBackupTrigger()` once from the editor): a full
  `PCL-Data-Backup-YYYYMMDD` tab every morning, newest 14 kept.

*Everything else — every chip, badge, tab and number — is described
inline in the code where it happens; `docs/ARCHITECTURE.md` carries the
round-by-round build history and `docs/TRACKER.md` the decision log.*
