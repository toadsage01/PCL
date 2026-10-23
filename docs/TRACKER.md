# PCL SEASON 2 — MASTER TRACKER
**The ultimate list: everything needed · everything done · everything still open.**
**Deadline: Wednesday 23 October 2026, 12:00 PM IST.** Owner split: 🔧 = built by the dev agent · 🧑 = needs Praper/user. Updated 22 Oct late night (review round B — ledger tabs, designation capsule, 50:50, device binding, YT tracking — in).

---

## 0 · How to read this
The league went live 19 Oct (Week 1). Everything on the critical path to a
**fallback-chained, self-healing deployment** is tracked here in four buckets:
A) shipped this cycle · B) shipped earlier (context) · C) open before the
deadline (with owner) · D) post-deadline / continuous ops. If an item has a
🧑, the machine is BLOCKED on it — nothing on our side can move it further.

---

## A · DONE — deadline batch (22 Oct, commit `s2-*`)

### Item 0 + 9 · SF Pro everywhere + OG arcade toggle 🔧
- All three portals (index / admin / leaderboard) default to the **SF Pro
  stack** — titles, headers, labels, body, everything (`-apple-system →
  SF Pro on Apple devices, Segoe UI / Roboto siblings elsewhere; zero font
  downloads, SF Pro itself is Apple-licensed and cannot be bundled).
- The **Aa toggle** now flips to the **OG arcade faces** — Press Start 2P
  (display) + Silkscreen (titles/labels) — across all sections. VT323 is
  fully retired (toggle is *not* VT323, per spec); legacy stored prefs
  (`vt`/`px`) auto-migrate to `og`.
- In OG mode, hard-to-read data (names, numbers, body copy, inputs) keeps
  the **simple basic sans** — pixel identity on the skeleton, readability
  on the metrics.
- New **SF readability pass**: every pixel-tuned micro size (7.5–13px) and
  wide letter-spacing remapped for the sans, guarded by
  `html:not([data-pcl-font="og"])` so the OG mode restores the original
  values automatically. Weight 500 + soft solid shadow blend the sans into
  the pixel design system.

### Item 1 · First-time Designation field 🔧
- New required **Designation** input in Player Details (sits under Full
  Name, spans two columns on desktop; stacked on mobile with a
  "First time only" hint).
- Autocomplete suggestions (`makeAutocomplete` factory — same engine as the
  manager picker): Content, Video/Shorts/Long-Form Editor, Graphics
  Designer, QC & YT Management, PAVE Tutor/Content, Social Media, Marketing,
  HR, Administration, IT, CBO, COO. Free text always allowed.
- Same lifecycle as the photo: typed once → stored in the ledger →
  JSONP-prefilled on every future entry (name-normalized) → server reuses
  the on-file value if a resubmission omits it.
- Feeds the leaderboard's Designation column for real (the old static
  `PLAYER_META` map is now only a fallback).

### Item 2 · Mobile Post Details redesigned 🔧
- Each post is now a **3-line card** on phones: ① # + link + brand badge +
  collab circle ② full-width views input (**16px font — iOS won't zoom**)
  ③ full-width 54px **ATTACH SCREENSHOT** dashed well (folder glyph + real
  text label, 110px tall thumbnail when set). No more cramped one-line
  squeeze at 390px.

### Item 3 + 8 · Admin console for non-technical panellists 🔧
- **Quick status chips** above the feed: `ALL n · NEEDS REVIEW n ·
  BOOST SUSPECT n · MISMATCH n · DONE n` — live counts, one-tap filtering,
  hot cases ring red. The 5-second answer to "what needs me?"
- **Players table (REPORTS)** gained DESIGNATION (with tick) and IDENTITY
  columns with one-click **VERIFY ID / CLEAR TICK** buttons.
- **START HERE tab** for the spreadsheet: run `buildAdminGuide()` once in
  the Apps Script editor → a plain-language map of every column (who fills
  it, what it means, the daily flow) lands as the first tab of PCL-Data.
- SF Pro + spacing polish across the whole console (item 8).

### Item 4 · Photo caption 🔧
- "Only for the first time — until the admin approves it." is **gone**.
  The caption span is empty/hidden by default; the image carries proper
  alt text ("Profile photo of ⟨name⟩"). `READY ✓` stays as-is (approved by
  you); `ON FILE ✓` keeps its reuse note.

### Item 5 · Insta-style verified tick 🔧
- Inline-SVG seal (orange disc, white tick, inner ring — **not an emoji**,
  theme-variable driven), rendered ONLY for players the Control Room has
  verified: bottom-right of the form avatar, next to feed names in the
  admin console, next to names on the public leaderboard (flips to the
  navy disc there so it pops on the orange bars). Unverified = **nothing**.
- Designation display (5b): below the name everywhere it exists — form
  hint line, admin feed sub-line, Players table column, leaderboard column.
- Backend: new `adminPlayerVerify` action stamps `Player Verified` on every
  row of that player; `collect_()` rolls it up into `players` + `weeks`
  so the public board picks it up with zero extra calls.

### Item 6 · Photo identity gate (shared-browser rule) 🔧
- The photo now belongs to an identity: **name + manager must match** who
  the photo was uploaded/matched under. Clear or change either → the photo
  **fades out** (260ms step animation) instead of posing as the second
  player; fill the identity back → fades right in. Designation follows the
  same gate (settles 900ms so typing your own name doesn't nuke it).
- Entrants with no reporting manager aren't penalised: only the NAME has
  to re-match for the photo to return.

### Item 7 · Manager dropdown tap-fill bug 🔧 FIXED
- Root cause: choosing an option dispatched a synthetic `input` event that
  re-ran `update()` and **re-opened the list over the just-filled value** —
  it looked like the tap did nothing until you clicked elsewhere.
- Fix: suppress flag around the synthetic event + a `touchstart` claim so
  desktop clicks and mobile taps fill the field **immediately** and the
  list stays closed. E2E-verified (value filled, list hidden).

### Tests + verification 🔧
- `node --check` clean on app.js / admin.js / leaderboard.js.
- GAS harnesses: **doPost 19/19** (incl. new: designation write, on-file
  reuse, VERIFY-ID stamp-all, unverify, unknown-player rejection),
  **leaderboard roll-up 16/16**, **URL diagnostics 24/24**.
- agent-browser E2E: desktop playergrid (SF), designation AC open→choose→
  filled, photo fade cycle, mobile post cards (SF + OG), admin feed chips +
  ticks, admin Players verify table, leaderboard SF + OG. 10 screenshots in
  `/download/s2-*.png`.

---

## A2 · DONE — review round (22 Oct night, `s3-*`)

### Common · pictures 🔧
- **Round pfp everywhere, no exceptions**: feed avatars now `border-radius
  50%` (were square), participants-tab avatars round, photo lightbox zooms
  round at every size, letter-fallback avatars round.
- **Every picture is expandable** — and not all through the same popup:
  attached analytics shots open the existing shots lightbox (strip +
  PREV/NEXT) or the review modal in admin; pfps open a dedicated round
  image viewer (`PhotoLb` in admin, single-mode `pclLightbox` on the
  form). New **magnifier corner chip** on the pfp tile and on set shot
  squares — the tile keeps upload/replace, the corner chip zooms.

### Admin console 🔧
- **Saved-rows capsule vs footer**: footer is now a SOLID island (opaque
  `--pcl-bg-3` + solid top border, own z-lane) and the body grows 96px of
  extra scroll space while the capsule is open — the two can never
  overlap again, at any scroll position.
- **Shot next to the URL**: the evidence thumbnail moved INSIDE the post
  cell, immediately left of the media link (header renamed `POST + SHOT`).
  Feed row is a 6-column grid; mobile areas remapped.
- **`UPD·S2` badge removed** (it marked an UPDATE row's snapshot number —
  confusing to non-panellists; snapshot info stays in the review modal).
- **Tab 2 = ALL PARTICIPANTS list view** (was Boost Audit; audit moved to
  slot 4, intact). Two filters, reusable pattern:
  - **POINTS** — first click ranks highest-first, re-click flips to
    lowest-first. Toggleable sub-metrics: **POINTS / VIEWS / APPS**
    (views = latest claimed per unique post — no update double-count;
    apps = submissions).
  - **A–Z** — first click A→Z, re-click Z→A.
  - BOTH direction arrows always visible on both filters; the live
    direction lights up (glow) so the active side is never a guess.
  - Cards show rank, round avatar (expandable), name + verified tick,
    designation · manager · format mix, big stat blocks (VERIFIED PTS
    orange lead / PROJECTED / VIEWS / POSTS / APPS), latest-post link
    chip, one-click VERIFY ID / CLEAR TICK. Search box on top.
- **LOG tab renamed ADMIN LOG** (panel title too).
- **Feed polish**: full-row hover highlight, redundant raw mediaId under
  OCR removed (tail stays in the post line, full ID moved to the review
  modal's meta line).
- REPORTS slimmed to season cards + weekly windows (the roster lives in
  tab 2 now — no duplicate tables).

### Form 🔧
- pfp expand chip + single-mode lightbox (round 420px zoom, no strip/
  arrows, Esc closes); attached-shot corner chip opens the shots
  lightbox on that exact shot; draft auto-save keeps it all across
  reloads (re-verified).

### Tests + verification 🔧
- node --check 3/3; doPost 19/19 · rollup 16/16 · url diag 24/24.
- agent-browser E2E (`/download/s3-*.png`): feed shot+url pairing, zero
  UPD badges, round avatars, PLAYERS sort toggles (points desc→asc,
  views, apps, A–Z both ways), search, photo lightbox (round, caption),
  dirty-bar/footer zero-overlap at scroll bottom, discard toast, mobile
  feed + players cards, dark + OG passes, reports/audit render, form pfp
  + shot expand chips, single-mode round zoom, leaderboard clean load.
  Zero console errors.

---

## B · DONE — earlier this season (context)
| Thing | Where |
|---|---|
| Static pixel frontend, 3 portals, light/dark | repo root |
| JSONP leaderboard + 60s guard + week chips | leaderboard.html/js |
| Form engine: chips, auto-format, undo/redo, dup 3s, crop, collab, drafts (localStorage + IndexedDB) | index.html + app.js |
| GAS ledger: media-ID dedup, collab 50:50, verified-points recompute, OCR via Drive, audit log, admin gate | gas/Code.gs |
| Single-line post row + circular avatar + collab popover (quick fix `de5e648`) | theme.css |
| Metrics research: daily view tracking, fallback chains, snapshot schema (`9830293`) | docs/METRICS-RESEARCH.md |

---

## A2 · DONE — review round B (22 Oct late night)

### Ledger trust fixes 🔧
- **DONE tab semantics**: a row is done when the review FINISHED —
  cross-check **MATCH** or a filled verified count. Before, MATCH-only rows
  never appeared, which read as "the done tab never updates". Chip counters
  use the same rule.
- **Cache-buster on every JSONP read** (admin + form + board): Google's
  /exec CDN was serving stale GET responses, so REFRESH could show old
  numbers even after a write. Every read is now a unique URL.

### Header + identity 🔧
- **Marquee rebuilt on all three portals**: neutral graphite band (the blue
  was rejected), logo is a LINK back to the form, **SEASON 2 mini-tag
  (7.5px Silkscreen) right under the logo**, "Submission Terminal" and the
  kicker/insert texts removed, LEADERBOARD chip (renamed from VIEW
  LEADERBOARD) stacked top-right, CONTROL ROOM chip on admin.
- **"Participant Details"**: section 1 renamed; completion screen now reads
  **ENTRY LOGGED! · Points Queued · see you next time** (LEVEL CLEARED and
  +100 XP retired).
- **Desg. field moved before Full name** (label "Desg."), dropdown opens on
  focus with the league's six most common titles, fed by the **real 60-person
  roster**; roster names auto-fill their designation.
- **Designation capsule inside the Full name field**: smart-shortened
  (Jr. VE · Exec. GFX · Asst. TL …) with the full title on hover; admin
  sees the full text in the feed, the review modal and the players tab.
- **Collab partner input** now uses the same autocomplete as the manager
  field (tap fills immediately — the "click elsewhere first" bug is dead
  there too), suggesting managers + every roster participant.

### 50:50 balance rule (rulebook §6 rewrite + verification) 🔧
- Rulebook §6 now carries the exact new wording: at least 2 platforms,
  50:50 maintained **separately per platform**.
- Every post row has a **PRAPER / PERSONAL toggle** (default PRAPER, never
  blocks). Stored in the ledger's revived Content Type column; the admin can
  retag per row in the review modal.
- PLAYERS tab shows each participant's per-platform balance chips
  (e.g. `IG 5:5` green, `IG 7:3` amber) computed from those tags.

### Admin console 🔧
- **Access Terminal**: name is a **dropdown of the six league operators**;
  each operator's first unlock **binds their browser fingerprint** — the
  same name from another device is refused before the console opens and
  logged as LOGIN-DENIED. Reset: `resetAdminDevice("Full Name")`.
- **App icons everywhere**: feed rows, players cards and the review modal
  use the IG/YT/LI logos with the format word in the platform's own
  colour/gradient; the post URL is the same #hash logic as the form.
- **Platform multi-select** (replaces the APPS sub-filter): a dropdown with
  the three app icons; pick IG+YT → only participants present on both.
- Players tab: avatar ring shadow removed, designation fully visible,
  CONFIRM ID button (photo + designation against name · manager ·
  designation) with the **green verified circle**.
- **SYNC NOW** button + AUTO tags (below).

### Metrics tracker — Phase 1 LIVE 🔧
- **YouTube leg shipped inside gas/Code.gs** (single paste): batch-50
  videos.list against the provided key, append-only **PCL-Snapshots** tab
  (Timestamp · Media ID · Source · Views · Likes · Comments · Status),
  09:00 & 21:00 daily triggers (self-healing on every SYNC NOW).
- Ledger rows carry the latest tracked count as an **AUTO tag** in the feed
  (a platform-observed number beside the claim).
- IG leg stubbed until the Meta app lands; LinkedIn runs decision (c) —
  OCR stays the floor.
- `PLAYER_META` is now the **real 60-person roster**, so the public board
  shows correct designations before a player's first submission.


---

## A3 · DONE — OCR + YouTube auto-read (23 Oct morning)

The form now **reads the numbers itself** so participants don't have to:

- **YouTube auto-read (client)**: the moment a `yt_` link lands, the form
  calls the YouTube Data API v3 (public league key, `gas-endpoint.js →
  ytApiKey`) and auto-fills the official view count with a green
  **AUTO · YOUTUBE** tag. A YouTube post needs nothing typed and nothing
  screenshotted. The key was health-tested against `videos.list` /
  `channels.list` (HTTP 200, live counts) — see `scripts/yt_api_test.sh`.
- **OCR on every screenshot (client)**: attaching an analytics screenshot
  lazy-loads **Tesseract.js v5** from CDN, downscales to ≤2000px and reads
  the text. Number extraction understands the three real layouts — inline
  ("12,345 views"), label-above-number ("Accounts reached ⏎ 9K"), and
  number-above-label (IG/Studio hero "8,741 ⏎ Plays") — plus K/M suffixes
  and dot-thousands, with guards against caption bleed ("7-day window").
  Solid reads auto-fill under a green **AUTO · OCR** tag; uncertain reads
  show a tap-to-use **"OCR READS x — USE"** chip; a human edit always wins
  (the tag flips to ✓ MATCHES or a USE chip, never overwrites).
- **Ledger integration**: the machine read travels in the payload
  (`postDetails[].ocrCount`) and lands in the **OCR Count** column at
  ingest — the console sees a machine-read on every row before touching
  SCAN; the reviewer's SCAN (Drive OCR server-side) still overwrites.
- Tests: `scripts/test_ocr_parse.js` (34 assertions, real Tesseract output
  shapes), doPost harness 16/16b (ingest + garbage-tolerant), browser E2E
  (`scripts/ocr_e2e.sh`): YT 445,681,251 auto-filled live · IG screenshot
  → 8,741 · LI screenshot → 1,204 · USE chip round-trip — zero console
  errors (`/download/ocr-e2e-*.png`).


---

## A4 · DONE — SAVE FAILED root-cause fix (23 Oct morning)

The "SAVE FAILED — CHECK CONNECTION" screenshots had **three stacked
causes**, none of which were the user's Wi-Fi:

1. **Payload bomb**: per-post screenshots went into the JSON payload as
   RAW base64 (a phone screenshot = 2–3 MB → the wire saw ~800 KB+). The
   /api/submit leg aborted client-side at **12 s** while GAS was still
   writing Drive blobs. Fix: every screenshot is now canvas-shrunk to
   ≤1600px JPEG q0.85 **on attach** (and again on old-draft restore) —
   E2E-verified 1.65 MB PNG → 130 KB JPEG, full payload 133 KB. The pfp
   was already diet-safe (512px cropper export).
2. **Vercel function ceiling**: Hobby functions default to a 10 s kill —
   `api/submit.js` now declares `maxDuration = 60`, guards >4.4 MB with a
   readable 413, and answers an upstream failure in **plain text** so the
   frontend treats it as a network drop and falls through the chain
   (a JSON `{ok:false}` would read as a hard rejection and stop it).
3. **The GAS 302 trap (the big one)**: a direct POST to `/exec` always
   ends in a 302 to googleusercontent that carries **no CORS headers** —
   the browser can never read the answer even when the save landed, so
   every direct send looked like a failure. Fix: the form no longer
   trusts the throw — after any direct-leg failure it **verifies through
   a new JSONP `action=subcheck`** (keys on the same Submission ID the
   backend dedupes with): found → ENTRY LOGGED; really-not-found → one
   automatic retry, then an honest SAVE FAILED. `postJson` also stopped
   treating non-JSON bodies (gateway 504 text, HTML 404) as success.
   Leg-1 timeout raised 12 s → 30 s.

- Tests: doPost harness 17–17d (subcheck found/absent/empty/fallthrough),
  `scripts/save_e2e.sh` + `scripts/fixture_save.js` browser E2E against a
  fixture that reproduces the REAL wire per port — leg1 healthy → ENTRY
  LOGGED, leg2 302+CORS → ENTRY LOGGED via subcheck (exactly one send, no
  duplicate), leg2 connection-destroyed → honest SAVE FAILED
  (`/download/save-e2e-1..3.png`).
- **Deployment note**: `subcheck` lives in `gas/Code.gs` and goes live
  with the same **C1 paste + New version** that carries everything else —
  no extra step. Until then the Vercel leg already works alone (probed
  2.4 s round-trip), and backend dedupe makes any manual retry safe.

---

| # | Item | Owner | Blocking? | Notes |
|---|---|---|---|---|
| C1 | **Paste updated `gas/Code.gs` + click New version** (Manage deployments → Edit → New version, same /exec URL). This paste ALSO installs the YouTube tracking leg + PCL-Snapshots tab + SYNC NOW — no extra file. Then optionally run `buildAdminGuide()` once in the editor. | 🧑 Praper | **YES — content-type persistence, device binding, YT tracking and the designation roster are dead until this** | User reports MATCH writes now land (re-pasted an earlier build); THIS paste brings the 22 Oct night build |
| C2 | **Tell us Case A or Case B** for the current deployment (same URL re-versioned vs new URL) | 🧑 Praper | YES (pairs with C1) | 30 seconds |
| ~~C3~~ | ~~YouTube Data API key~~ **DONE — key received 22 Oct night, embedded as the default `DEFAULT_YT_API_KEY` in Code.gs (Script Property `YOUTUBE_API_KEY` overrides it). YT leg + snapshots + triggers SHIP with the C1 paste.** | ✅ resolved | — | Key was explicitly flagged non-sensitive (public/restricted); rotate any time via `setYouTubeKey()` |
| C4 | **Meta app + league IG professional account + linked FB Page** → App ID + Secret after review (1–3 days — started 22 Oct) | 🧑 Praper | Blocks IG leg (Phase 2) | Leg already stubbed (`syncInstagram_` reports 'awaiting Meta app token' — never invents counts) |
| ~~C5~~ | ~~LinkedIn ranking decision~~ **DONE — user chose (c): OCR impressions stay the review floor + guest engagement best-effort. Shipped as `syncLinkedIn_`.** | ✅ resolved | — | Guest fetches usually meet LinkedIn's login wall; OCR (SCAN button) remains LI's source of truth |
| C6 | Optional Apify token (vendor insurance leg) | 🧑 Praper | No — fallback only | $0 until triggered; ~$50–100/season worst case |
| C7 | Verify the OG-font toggle + mobile cards on a real iPhone/Android (we only have the emulator) | 🧑 Praper | No | 2 minutes on your phone |
| C8 | Sheet hygiene: freeze row 1 + colour the two new columns if you want them to stand out (the START HERE tab documents them) | 🧑 Praper | No | Cosmetic |

### What lands the moment each key arrives (dev side, same day)
- **C3 (RESOLVED 22 Oct)** → shipped inside `gas/Code.gs` (single file to
  paste): YouTube leg (batch-50 `videos.list`), append-only
  `PCL-Snapshots` tab, 09:00 & 21:00 triggers, admin SYNC NOW, AUTO tags
  on feed rows.
- **C4** → IG Business Discovery leg (1 call per participant, non-expiring
  Page token) + fallback ladder (yt-dlp league-cookies → vendor → OCR floor)
  + health monitor + per-source badges.
- **C5** → LinkedIn leg wired accordingly (guest engagement auto + weekly
  OCR impressions).
- Every leg lands behind the **fallback chain**: snapshot source tags,
  never-silently-zero staleness, 20-URL pilot before switching the leaderboard
  over. No single pipe can take the data down.

## A5 · DONE — leaderboard string-view kill + six-password admin access (22 Oct, user report round)

**User report 1 — "leaderboard was showing some sort of string as the view."**
- Live probe: the stats endpoint now answers in the NEW shape (weeks + awards
  blocks) and the board is empty (`players: []`) — the sighting came from the
  OLD pinned deployment whose roll-up let sheet strings ride through into
  `impressions`/`points`.
- Fix is two layers deep so this class of bug is dead even if a future
  backend regresses:
  - `js/leaderboard.js`: new `toNum()` coerces every payload number (number,
    `"12,345"`, NBSP-padded, garbage→0, absent→null/"—"); `normalize()` and
    the weekly-bucket mapping route ALL numbers through it; `fmt()` is
    self-defensive (strips commas itself, renders NaN/Infinity/garbage as "0",
    never echoes a raw string).
  - Backend `numOrBlank_`/`toCount_` already numeric-tight (verified).
- New suite `scripts/test_leaderboard_sanitize.js` — 33 assertions feeding
  dirty payloads (comma strings, NBSP, "seventeen billion", NaN, Infinity,
  legacy shapes) through the EXTRACTED shipped functions. ALL PASS.

**User report 2 — "remove the admin access, create 6 passwords … admin firstName@123."**
- The single ADMIN_KEY (Script Properties) + operator-name dropdown + device
  binding are GONE. New model: **the password is the identity.**
- `gas/Code.gs`: `ADMINS` roster (pratham@123/sejal@123/kanupriya@123/
  vikram@123/lagan@123/manas@123 → full names), `adminByPass_()`,
  `operatorOf_()` (accepts POST `adminKey` and JSONP `key`), `checkAdmin_()`
  rewritten; `adminLogin_` returns `{ok, operator}` derived SERVER-SIDE and
  logs LOGIN with the fingerprint as context only (no lock, no resetAdminDevice);
  every write action (adminVerify / adminPlayerVerify / awardChallenge /
  syncNow) stamps the AdminLog + PCL-Awards "Awarded By" with the DERIVED
  name — a client-supplied operator is never trusted; `ledgerEndpoint_`
  returns `operator` for the console chip.
- `admin.html`: single "Admin password" field (no name picker), operator chip
  in the toolbar; `js/admin.js`: no dropdown, no client-declared operator,
  mock mode = any password ≥ 4 chars as "Demo Admin"; session restore keeps
  working. CSS: `.pcl-tag--operator`.
- Harness: test 15 rewritten (password identity, new device just works,
  whitespace tolerated, wrong/empty refused) + test 21 (all six passwords map
  to the right names; AdminLog/Awarded-By stamps prove the client operator
  string is ignored) — ~65 assertions ALL PASS. 3-portal browser E2E green:
  dropdown gone, short password refused, lagan@123 unlocks as OPERATOR ·
  Demo Admin, awards flow intact, board clean, zero console errors.

**Deploy note:** rides the SAME C1 paste + New version as A2–A4. Until the
paste lands, the console still runs the OLD backend — the six passwords will
be refused there ("wrong admin password") because the old check compares
against the retired ADMIN_KEY property. After the paste, the old ADMIN_KEY
stops mattering entirely.

---

## A6 · DONE — rulebook additions, collab shared-points wording, CEO Screening Room, employee Google sign-in (23 Oct, deadline day)

**User directive (5 items):** ① confidentiality clause into the RULEBOOK ②
weekly-challenge judging clarification into the RULEBOOK ③ a CEO-only
featured view of the current week's challenge uploads with a great UI ④
collab flow fix — scores SHARED between collaborated players, never
distributed in portions ⑤ Google login restricted to the @praper.in
company domain, with an active-employee email allowlist.

**What shipped:**
- **RULEBOOK (form modal, js/app.js):** ① new mandatory **Client
  confidentiality** bullet in §7 (no client names / faces / project
  timelines on any platform, review before posting — user's exact policy);
  ② new paragraph under §5: weekly challenges are topic/theme-based,
  judged by a judge or a small panel rating entries on liking/disliking,
  clearly separate from the views-first league, content is NOT spread
  around the ten challenges — but weekly-challenge views still count in
  the main league with the standard multipliers.
- **Collab wording (item 4):** the backend has credited FULL points to
  each partner since A4 (no halving anywhere); this round killed the last
  "split 50:50" copy: form popover title/hint, ½ badge → **FULL** badge,
  admin feed tag → "COLLAB · FULL", rulebook bullet + header comment now
  say "shared, never divided (1,000 × 1.25 = 1,250 to EACH)". Partner
  input stays a NAME with roster autocomplete (no mail id anywhere).
- **CEO Screening Room (item 3):** NEW `director.html` + `js/director.js`
  + `css/director.css` — dark cinematic theatre, one entry at a time,
  WEEK banner with LIVE tag, YT privacy-enhanced embed / IG embed /
  LinkedIn link-card fallback, participant chips (disc initials + name +
  designation), OPEN ORIGINAL POST + ANALYTICS SHOT chips, PREV/NEXT +
  numbered squares + arrow keys, "remember on this device". Backend: NEW
  `directorFeed_` GET action (doGet routed) — passcode-gated
  (`CEO_CODE` Script Property, default `director@123`), returns ONLY the
  current week's weekly-challenge rows, deduped per Media ID (newest
  snapshot wins), collab partners merged, submission order. Discreet
  SCREENING ROOM link added to the Control Room header; not linked
  publicly. E2E: gate deny → unlock → 3-embed theatre → nav → screenshots.
- **Employee sign-in (item 5):** GIS button in a new form section 0 that
  stays INVISIBLE until `googleClientId` is set in js/gas-endpoint.js
  (zero risk before setup). NEW `employeeLogin_` GET action verifies the
  ID token SERVER-SIDE via Google tokeninfo, then gates on the @praper.in
  domain AND the NEW **`PCL-Allowlist`** sheet tab (auto-created; one
  email per row; blank list denies everyone; case/space-tolerant). On
  success: signed-in chip + roster prefill (matchedName, only when the
  name field is empty). Setup steps live in README §2 and in the
  gas-endpoint.js comments; `GOOGLE_OAUTH_CLIENT_ID` in Code.gs holds the
  same client ID for the audience check.
- **Guide:** buildAdminGuide rows added for PCL-Allowlist + Screening
  Room; README §2 (sign-in setup), §10.5 (Screening Room), §14, §15;
  this A6 section.

**Tests:** harness +9 assertions — group 22 directorFeed (wrong code
denied, current-week-only + dedupe + collab merge + submission order +
trimmed passcode) and group 23 employeeLogin (missing token, Google-400,
unverified email, non-@praper.in, blank allowlist deny, tab auto-create,
allowlisted OK + roster name mapping, gmail refused, case-insensitive
membership) — ALL PASS; rollup 16 / sanitize 33 / OCR 34 / URL 24 green;
node --check on all five JS files + Code.gs. Browser E2E
(scripts/round_e2e.sh + scripts/fixture_director.js): sign-in card hidden
with no client id, rulebook contains all three new texts and zero
"split 50:50", collab popover FULL copy, gate deny → unlock → YT/IG/LI
entries → keyboard nav, board 5 rows 0 badges. Found + fixed via E2E:
body's flex column shrank .dir-main to content width (added width:100%).

**Deploy note:** directorFeed/employeeLogin/PCL-Allowlist ride the SAME
pending C1 paste + New version as A2–A5. Until that paste: the screening
room and sign-in verify against the OLD backend — the room will refuse
every code ("wrong screening passcode" → actually action unknown falls
through to stats) and sign-ins cannot verify. The Screening Room page
itself deploys the moment Vercel redeploys the static site. Email allowlist
goes in the sheet tab — no redeploy needed after the first paste.

---

## A7 · DONE — link-ownership banners, collab Enter fix, logo-home, OCR compliance reads (23 Oct, user round 6)

**User items shipped:**
1. **Duplicate-URL ownership messaging** — NEW backend JSONP action
   `checklink` (read-only, keyed on the same Media ID/urlKey the ingest
   dedupes with): taken+uploader / collabFor / mine. The form fires it for
   every committed link (and re-fires all when the Full Name commits or a
   draft restores). Verdicts render as full-width row banners + a red chip:
   RED "This video is ALREADY UPLOADED BY {name} — replace this link…"
   (submit blocked while untagged; the hint explains the collab escape),
   GREEN "This video was COLLABED WITH YOU by {name} — confirm below" with
   a one-tap CONFIRM that tags the collab with the LEDGER's canonical name
   (ingest then stamps CONFIRMED; FULL points each). The ingest rejection
   message now also NAMES the uploader(s). Priority semantics: an asker's
   OWN rows always answer mine (their resubmission is an UPDATE — no
   banner), then collabFor beats taken.
2. **Collab Enter fix** — Enter inside the partner input confirms ONLY
   that field: preventDefault + stopPropagation + blur + re-render (the
   ✓ SET tick is render-derived). Same class fix for the manager +
   designation autocompletes. Picker-open Enter still chooses the
   highlighted suggestion (regression-tested).
3. **Logo → home with content** — from other portals the header already
   linked to index.html + draft restore; ON the form page the logo now
   also revives the filled form when the DONE screen was up (form unhidden,
   values intact, re-drafted, "YOUR ENTRY — EDIT OR RESUBMIT" status).
   Resubmitting own links is safe — the ledger treats them as UPDATEs.
4. **Google OAuth guidance** — client secret never leaves the Cloud
   Console (GIS ID-token flow needs no secret); client ID goes in
   js/gas-endpoint.js `googleClientId` (+ optional GOOGLE_OAUTH_CLIENT_ID
   Script Property); origin https://pcl-form.prapermedia.in must match the
   serving URL exactly; employee emails → PCL-Allowlist tab.
5. **OCR hardening** — `prepOcr_` scales BOTH ways (≤2000px cap AND a
   ≥1400px floor for tiny region crops); up to three passes: plain →
   inverted (dark-mode shots via a mean-luminance probe) → PSM-6 upscale
   for crops. NEW pure detectors (unit-tested): `detectBoost_` (boosted/
   boost/boosting/sponsored/promoted/paid partnership + standalone "Ad"
   line, with "add"/names safe) → hard block "Boosted / sponsored content
   is not allowed"; `platformCheck_` — strong/weak platform fingerprints
   (ig/yt/li) — blocks ONLY on another platform's STRONG mark with zero
   own strong marks (chrome-less crops never block) → "doesn't look like
   {Platform}". Both land in errShotMsg (submit-blocking), cleared on
   replace, re-judged on the new read.

**Tests:** harness group 24 (13 checklink assertions + rejection-message
assert updated to expect the uploader's name) — ALL PASS; OCR suite +27
(13 boost + 14 platform) — ALL PASS; rollup 16 / sanitize 33 / URL 24
green; node --check all JS. Browser E2E (scripts/round27_e2e.sh +
fixture_form.js now serving canned checklink + its own PCL_CONFIG): red
banner + error chip, green banner + CONFIRM → collab on + partner filled
+ ✓ SET, Enter-in-field blurs without submitting (errCells 0) and the
picker-open Enter still chooses, logo revives the form with 3 posts +
name intact after the DONE screen. Found + fixed via E2E: the ✓ SET tick
needed an explicit renderRows() on the Enter-confirm.

**Deploy note:** checklink + the named rejection ride the SAME pending
Code.gs paste + New version as A2–A6. Until the paste, the form's
checklink calls hit the OLD backend → "unknown action" → the catch path
leaves banners silent (ingest re-checks at submit, exactly as before) —
no breakage, just no early banners.

---

## D · POST-DEADLINE / CONTINUOUS OPS (tracked, not urgent)
1. **Metrics Phases 1–3** roll-out + pilots (the METRICS-RESEARCH.md plan —
   this is the "PCL views" ultimate fix; the fallback chains make it
   survive any single source dying).
2. Link-liveness amber check (`.is-status` hooks already reserved in CSS).
3. Leaderboard: per-platform percentile view (fairness, rulebook §5).
4. Weekly PCL-Snapshots archive to Drive once the poller runs.
5. Header STRUCTURE redesign (deferred from earlier batch).
6. Excel/CSVscheduled exports beyond the client-side button.
7. OG-font fine pass: audit any remaining Silkscreen micro-labels against
   real screenshots on 375px width.

---

## The one-line status
**Frontend Season-2 batch: DONE and E2E-proven · Backend code: DONE, waiting
on ONE paste + New version click · Metrics tracker: research committed,
blocked on the three Phase-0 keys — the clock on those starts today.**

---

## A8 · Round 28 — full-system test sweep + hardening (2026-10-23)

User directive: "full in detail, no time restrained, or capability limited,
testing of all the pages, sheet, app script, vercel, possible threats…
test all and fix all. we don't [want] anything to break in these 2 months."

- OAuth Client ID wired into gas-endpoint.js + Code.gs (aud check live).
  Secret stays in Google Cloud only. Harness gained the aud-mismatch case.
- SECURITY: safeUrl_ scheme guard at ingest (javascript:/data: refused,
  scheme-less domains upgraded) — kills the stored-XSS-in-Control-Room
  vector; safeHref client halves in admin.js + director.js.
- INTEGRITY: cellSafe_ formula-injection guard on every participant-typed
  sheet cell + AdminLog + awards; csvCell guard on CSV export.
- DATA LOSS: dailyLedgerBackup_ — full PCL-Data-Backup-YYYYMMDD tab daily,
  keep 14, self-healing trigger (setupBackupTrigger / SYNC NOW / metrics).
- PRIVACY: publicPlayer_ strips manager (as well as verified).
- UX: OCR boost false-positive deadlock fixed (bare "boost" = button ≠
  Boosted state); global Enter guard on the form (name/challenge never
  implicitly submit); leg-2 server rejections surface verbatim.
- CONSISTENCY: mock console FULL collab points + "COLLAB · FULL" modal
  meta; leaderboard og-font init fixed; non-image screenshots REJECTED.
- NEW SUITES: test_threat_matrix.js (107), harness groups 25-29 (121
  total), round28_e2e.sh (8 browser checks), probe_live.sh (read-only).
  364 unit assertions + 6 E2E suites ALL GREEN.
- LIVE FINDINGS: deployed GAS is an intermediate version (D1 paste still
  pending); pcl-form.prapermedia.in serves a GAS HtmlService error, not
  the Vercel build (D2 domain fix). Both documented in docs/TEST-REPORT.md.

---

## A9 · Round 29 — Screening-Room media + tabs + admin screening view (2026-10-23)

**Ask:** remove the arrow-keys hint · LinkedIn/Instagram must SHOW like
YouTube (stable way) · CEO room keeps weekly challenge as the opening tab
but also sees ALL Season-2 content · same simple view for the admin panel
with analytics + participant details + per-video views, minimum manual OCR
· pfp was not visible in the room.

🔧 SHIPPED:
- CEO ROOM: hint text gone. Two tabs — **WEEKLY CHALLENGE** (default,
  unchanged behaviour) + **PCL SEASON 2 · ALL CONTENTS** (every post,
  challenge or not, any week; regular posts tagged by week + reported
  views; same dedupe/merge/submission-order rules).
- STABLE MEDIA: YouTube + Instagram embed in-page; **LinkedIn shows the
  participant's analytics screenshot on the stage** (LinkedIn blocks
  in-page playback entirely — no API-free embed exists); every entry with
  post + screenshot gets a **POST / SCREENSHOT switch**; a dead Drive
  thumbnail degrades to the calm card, never a broken-image icon.
- PFP: directorFeed_ now ships per-person **photo + OCR views**; chips
  render the photo disc with initials underneath as fallback.
- Code.gs directorFeed_: adds `regular[]` (whole season) + parallel
  photos[]/views[]/weekNum/isChallenge; newest-snapshot OCR wins per
  person; comma-grouped cells parse.
- ADMIN: the review modal is now a **screening view** — same media stage
  + POST/SCREENSHOT switch on the left; on the right a participant card
  (pfp · designation · manager), season roll-up (videos · total views ·
  season points), **per-video list with views per post** (open row
  highlighted), and a **live score preview** (verified × multiplier,
  rounded up, updates as you type). Workflow unchanged (stage → save,
  all writes logged). HRs no longer need to open the sheet or do math.
- TESTS: harness 22i–22n (6 new directorFeed asserts — per-person views,
  photos, season list, non-challenge flag, other-week isolation, comma
  parse); round_e2e.sh extended (tabs, switch, LI shot stage, regular
  post views, hint removal, pfp disc); NEW round29_admin_e2e.sh (admin
  screening view + score preview). All unit suites + 4 E2E suites green;
  node --check on all five JS.

🧑 STILL ON THE USER (unchanged): **D1 paste Code.gs + New version** (this
round's directorFeed_ rides the same paste) · D2 domain fix · D4
allowlist emails. D6 packaging stays on the cloned repo.

## A10 · Round 30 — OAuth pop-up fix + work-email fallback (2026-10-23)

**Report:** `Cross-Origin-Opener-Policy policy would block the
window.postMessage call` on the sign-in button — the Google pop-up signs
the employee in but the credential hand-over to the form is severed
(Brave shields / COOP isolation in the pop-up chain), so the button spins
forever. Live-verified flow: GIS popup → GeneralOAuthFlow → hand-over
blocked.

- **ROOT FIX**: new `vercel.json` serves every route with
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` — the
  Google-documented remedy; ships automatically with the next Vercel
  deploy, nothing to paste.
- **FALLBACK (interim until OAuth is trusted everywhere)**: the sign-in
  card always carries a **work-email row** under the Google button — type
  `you@praper.in` → CONTINUE or Enter (Enter checks, never submits; the
  round-28 form-level Enter guard is explicitly bypassed for this field
  only). Backend: `employeeLogin_` now routes `email=` to a new
  `emailLogin_` leg with the SAME two gates as the token path — company
  domain + `PCL-Allowlist` roster — and `rosterEmailToName_` maps
  `first.last@praper.in` onto the exact roster identity for the Full
  Name prefill. No token, no client-side trust; a non-employee address
  gets the verbatim allowlist refusal.
- **GRACEFUL GIS FAILURE**: if the GIS script cannot load (offline /
  shields), the Google button goes away but the card STAYS with an
  explanatory note — the fallback never depended on Google being
  reachable.
- SESSION UNCHANGED: same `pcl_google` chip, same SIGN OUT cycle, same
  prefill rule (a human-typed name always wins).
- TESTS: harness 23j–23n2 (6 new asserts — blank/malformed/gmail/
  ghost-email refusals, allowlisted acceptance, first.last roster map);
  NEW round30_e2e.sh (8 checks: card renders, Enter-never-submits,
  roster + format guards, email sign-in + prefill, sign-out cycle) with
  the fixture now able to serve a client id (PCL_FIXTURE_CLIENT_ID=1) +
  canned employeeLogin roster. All unit suites + round27/round28
  regressions green; vercel.json schema-validated.

🧑 STILL ON THE USER: **D1 paste Code.gs + New version** (emailLogin_
rides the same paste — until then the live backend refuses the email
fallback) · add BOTH origins in Google Cloud → Authorized JavaScript
origins (`https://praper-contest-league.vercel.app` +
`https://pcl-form.prapermedia.in`) · D4 allowlist emails. Trust model
note: the email fallback is roster-gated (same people the Google path
accepts) but does not prove possession of the mailbox — flip it off
anytime by hiding the card section once the pop-up flow is confirmed
stable for everyone.

## A11 · Round 31 — leaderboard polish + YT freshness + Director's desk + email collab (2026-10-23)

Six user items, all shipped:

- **Leaderboard**: footer "PLAY — SUBMIT YOUR RUN" link REMOVED (header's
  SUBMIT ENTRY is the one path back); the refresh button's stray pixel
  glyph REMOVED (clean REFRESH text); NEW **ⓘ chip right of W10** (same
  chip dimensions) opens the challenge guide — all ten weeks with name,
  criteria, reward and date window, LIVE/CLOSED tags; **every W chip
  shows its week's challenge on hover** (title attribute). Challenge
  names live in `js/gas-endpoint.js` (`challenges` + `seasonStartIso`).
- **YouTube freshness**: the existing twice-daily sync (09:00 & 21:00,
  self-healing, also on SYNC NOW) already wrote platform viewCounts into
  PCL-Snapshots — the missing piece was the PUBLIC board. The rollup now
  **lifts every `yt_` post to the snapshot count when it outruns the
  ledger**, and points follow (lifted × multiplier, ceil). Admin-set
  verified points resume whenever HR re-verifies higher. Instagram and
  LinkedIn stay MANUAL (OCR) — snapshots never touch them; HRs check
  those on whatever rhythm they keep.
- **Director's Desk** (Screening Room): a **★ PICK THIS ENTRY** toggle per
  post + a **note pad** scoped WEEK n / SEASON by tab. Writes ride the
  passcode-gated `directorNote` action into the new **Director-Log** tab
  (append-only, latest-wins, cellSafe_-guarded, audit-logged); the feed
  returns `picks[]`, `noteWeeks`, `noteSeason` + per-entry `mediaId`, so
  his marks survive reloads and season ends.
- **Collab = emails, multi, short banners**: the collab list is now
  comma-separated WORK EMAILS with a chip UI (ADD button + Enter commits
  a chip — never submits; non-`@praper.in` refused; × removes; legacy
  name rows still pair). The ledger grows a **Player Email** column
  (col 30, appended last — no reader shifts). Ingest pairs rows d1
  (their list has my email) / d2 (my chips have their Player Email) /
  legacy name fallback; the partner backfill writes the acceptor's
  email. checklink returns `collabForEmail`/`uploaderEmail`/`mine`, so
  the form shows: "Uploaded by you" (mine) · "Video uploaded by
  {firstName}." + tiny hint (taken) · "Collab invite for you — ACCEPT"
  (ONLY the invited session email). The long red submit rejection is
  now one short line. The name-picker autocomplete is gone from the
  collab field (managers/designations keep theirs).
- **Tests**: harness groups 30–33 (27 new asserts → ~168 total: email
  pairing d1/d2 + case tolerance, Player Email column, short rejection,
  checklink email legs, YT lift with/without snapshots + IG isolation,
  director desk writes/reads/gates); NEW round31_e2e.sh (9 checks:
  board trio + guide + tooltips, desk render/pick/note/reload/scope);
  round27_e2e.sh rewritten for the email flow; round28/29/30 + CEO-room
  + final + save + ocr E2E all green; all six unit suites green;
  node --check on every touched JS.
- Fixture upgrades: canned checklink now email-keyed (invite only for
  priya@praper.in), director fixture speaks directorNote + picks/notes
  + mediaId, form fixture serves the season config (challenges +
  seasonStartIso) for the board E2E.

🧑 STILL ON THE USER: **D1 paste Code.gs + New version** (email collab,
Player Email column, YT lift, directorNote all ride the pending paste) ·
run **setupMetricsTriggers()** once from the editor (or press SYNC NOW
once after the paste) so the twice-daily YT refresh is scheduled · fill
the **PCL-Allowlist** tab so sign-in (and therefore session emails for
collab invites) works for everyone.
