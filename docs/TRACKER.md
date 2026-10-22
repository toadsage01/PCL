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
