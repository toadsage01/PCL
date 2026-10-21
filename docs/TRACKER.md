# PCL SEASON 2 — MASTER TRACKER
**The ultimate list: everything needed · everything done · everything still open.**
**Deadline: Wednesday 23 October 2026, 12:00 PM IST.** Owner split: 🔧 = built by the dev agent · 🧑 = needs Praper/user. Updated 22 Oct, late evening.

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

## C · OPEN — before the deadline (owner + cost)

| # | Item | Owner | Blocking? | Notes |
|---|---|---|---|---|
| C1 | **Paste updated `gas/Code.gs` + click New version** (Manage deployments → Edit → New version, same /exec URL). The sheet migration adds `Player Designation` + `Player Verified` columns automatically on first run. Then run `buildAdminGuide()` once in the editor for the START HERE tab. | 🧑 Praper | **YES — leaderboard + identity features are dead in the water until this** | This is the SAME click that resolves the SIGNAL LOST question. If the /exec URL ever changed (Case B), send the new URL and we patch `js/gas-endpoint.js`. |
| C2 | **Tell us Case A or Case B** for the current deployment (same URL re-versioned vs new URL) | 🧑 Praper | YES (pairs with C1) | 30 seconds |
| C3 | **YouTube Data API key** (console.cloud.google.com → enable YouTube Data API v3 → restricted key → paste to us) | 🧑 Praper | Blocks metrics Phase 1 (YT leg) | Free, ~10 min; key lives in Script Properties, never in git |
| C4 | **Meta app + league IG professional account + linked FB Page** → App ID + Secret after review (1–3 days — start today to beat the deadline window) | 🧑 Praper | Blocks IG leg (Phase 2) | We draft the review screencast script on request |
| C5 | **LinkedIn ranking decision**: (a) weekly screenshot OCR · (b) auto engagement score · (c) both ⭐ recommended | 🧑 Praper | Blocks LinkedIn leg (Phase 3) | 30 seconds |
| C6 | Optional Apify token (vendor insurance leg) | 🧑 Praper | No — fallback only | $0 until triggered; ~$50–100/season worst case |
| C7 | Verify the OG-font toggle + mobile cards on a real iPhone/Android (we only have the emulator) | 🧑 Praper | No | 2 minutes on your phone |
| C8 | Sheet hygiene: freeze row 1 + colour the two new columns if you want them to stand out (the START HERE tab documents them) | 🧑 Praper | No | Cosmetic |

### What lands the moment each key arrives (dev side, same day)
- **C3** → `gas/Metrics.gs`: YouTube leg (batch-50 `videos.list`, pre-season
  rejection), append-only `PCL-Snapshots` tab, 09:00 & 21:00 IST triggers,
  admin SYNC NOW, velocity flags. YT is the same-day win.
- **C4** → IG Business Discovery leg (1 call per participant, non-expiring
  Page token) + fallback ladder (yt-dlp league-cookies → vendor → OCR floor)
  + health monitor + per-source badges.
- **C5** → LinkedIn leg wired accordingly (guest engagement auto + weekly
  OCR impressions).
- Every leg lands behind the **fallback chain**: snapshot source tags,
  never-silently-zero staleness, 20-URL pilot before switching the leaderboard
  over. No single pipe can take the data down.

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
