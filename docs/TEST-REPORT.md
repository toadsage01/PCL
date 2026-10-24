# PCL — FULL-SYSTEM TEST REPORT (Round 28 · 2026-10-23)

**Scope:** every portal, the sheet backend, the Vercel layer, the transport
chain, OCR, data lifecycle, security threats — from five perspectives:
participant · admin/review team · CEO · league engineer (you) · TL.
**Method:** full source re-audit of all 13.2k lines → fixes → 364 unit
assertions across 6 suites → 6 browser E2E suites → read-only live probes.
**Result: ALL GREEN.** Nothing here can corrupt or lose league data, and
every finding below is already fixed in the same commit.

---

## 0 · Verdict per portal

| Surface | Verdict | Proof |
|---|---|---|
| Form (index.html) | ✅ PASS | 121-assert backend harness, threat matrix, round27 + round28 E2E, save-chain E2E (3 wire shapes), OCR E2E |
| Admin (admin.html) | ✅ PASS | mock E2E (gate → award → FULL collab), harness admin groups, CSV/blur hardening tested |
| Leaderboard | ✅ PASS | 16 roll-up + 33 sanitize asserts, E2E: 5 rows, 0 badges, og font fixed |
| Screening Room (director.html) | ✅ PASS | round_e2e (gate/YT/IG/LI/keyboard), safeHref added |
| GAS backend (Code.gs) | ✅ PASS | 121-assert harness against a full GAS stub; hardening groups 25–29 |
| Vercel (api/submit.js) | ✅ PASS | save_e2e leg1/leg2/lost scenarios re-run green |
| Live production | ⚠️ 2 findings | see §4 (stale backend deploy, domain mapping) |

---

## 1 · What was audited, per perspective

**Participant** — every input field (name, manager, designation, links,
views, collab partner, challenge URL, notes), every URL shape the three
platforms emit (mobile/music/nocookie/instagr.am/lnkd.in/live/pulse/urn:),
screenshot pipeline (phone/tablet/PC resolutions, partial crops, dark mode,
oversize, wrong type, unreadable file), draft survival (localStorage +
IndexedDB, restore-on-reload, logo-revive after DONE), the 3-leg save chain
(leg1 → leg2+subcheck → honest failure), deadline-rush concurrency
(LockService), idempotent retries (submissionId dedupe).

**Admin / review team** — six-password gate (server-derived identity),
staged-edit dirty bar, SCAN (Drive OCR), VERIFY-ID tick flow, award GIVE,
audit log stamping, CSV export, filter/tab matrix, accidental-corruption
protections (batch save, whitelisted cross-check values, server-computed
verified points).

**CEO** — screening room passcode gate (deny + remember + empty states),
week filter (current week only), collab partner merge, embed parsers
(YT-nocookie / IG / LI fallback), keyboard nav.

**League engineer** — GAS deployment semantics (pinned versions), config
wiring (gas-endpoint.js), secrets posture, runbook accuracy, test
reproducibility (`node scripts/…`, `bash scripts/…`).

**TL** — deployment packaging findings (§4): what must move where before
internal rollout. (Docker/Terraform packaging itself stays OUT of this
repo per your call — separate clone, separate work.)

---

## 2 · Findings and fixes (all shipped in this round)

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | **HIGH (security)** | The public ingest accepted ANY string as Post URL / Challenge URL. A direct API writer could store `javascript:alert(1)` in a ledger row — the Control Room renders those as clickable `<a href>` → **stored XSS in the most privileged surface**. | `safeUrl_()` in Code.gs: http(s) kept, scheme-less domains get `https://`, everything else (javascript:/data:/vbscript:/file:/blob:) **refused at ingest** with a readable error. Client-side `safeHref()` in admin.js + director.js degrades any non-http(s) href to inert `#` (defence in depth). |
| F2 | **HIGH (integrity)** | Sheets **formula injection**: a name/manager/note beginning with `= + - @` was written raw — `=IMPORTXML(...)` executed on sheet open can exfiltrate adjacent cells. | `cellSafe_()` guard on every participant-typed text field at ingest, on collab partner backfill, on awards, and on every AdminLog row; `csvCell()` gains the same guard so the CSV export can't smuggle formulas into Excel either. |
| F3 | **HIGH (data loss)** | No scheduled ledger backup existed — a bad manual edit or mass-paste had no rollback point for the 10-week season. | `dailyLedgerBackup_()`: full `PCL-Data-Backup-YYYYMMDD` tab every morning **inside the league sheet**, newest 14 retained, oldest auto-pruned. Trigger installs via `setupBackupTrigger()` and **self-heals on every SYNC NOW** and the daily metrics run; each backup is audit-logged. |
| F4 | MEDIUM (privacy) | Public `?action=stats` exposed each player's **reporting manager** (internal org data) alongside the public board fields. | `publicPlayer_()` now strips `manager` as well as `verified`. |
| F5 | MEDIUM (UX/deadlock) | OCR boost detector flagged the **bare word "boost"** — but the Boost *button* appears on every organic business post. A honest participant's insights screenshot would be submit-blocked, and replacing the screenshot can never clear it. | `detectBoost_` now flags only the **state**: `boosted / boosting / sponsored / promoted / paid partnership / paid promotion` + standalone Ad line. Bare "boost" and "Boost reel" CTAs never flag. |
| F6 | MEDIUM (UX) | Enter inside **Full Name / Challenge link** implicitly submitted the whole form (validation firestorm + finger slam). Same accident class as the collab field fixed in round 27. | Global form-level Enter guard: text-input Enter never submits; specialised handlers (links commit, picker choose, field blur) still win. E2E-proven. |
| F7 | MEDIUM (error truth) | On the direct-GAS leg, a readable server rejection (duplicate link, unconfirmed collab) was swallowed by the subcheck path and surfaced as "could not be confirmed". | `sendDirectWithVerify_` rethrows `err.server` untouched — real reasons always reach the player. |
| F8 | LOW (security) | Ingest stored **any file type** as an analytics screenshot (raw API callers bypass the picker). | `saveFile_` + photo path reject non-`image/*` with a REJECTED marker in the ledger (visible to reviewers). |
| F9 | LOW (consistency) | Mock console still **halved** collab points (½) and the review modal said "COLLAB ½" — contradicted the FULL-points rule and would mis-train reviewers. | Mock now computes FULL points; modal meta reads "COLLAB · FULL"; mock player card matches. |
| F10 | LOW (bug) | The leaderboard's OG-arcade **font toggle was dead** — its theme-init mapped stored "og" to a legacy "vt" value no CSS rule matches. | Init now maps any non-`sf` value to `og` (same contract as the other portals). E2E-proven: computed font = Press Start 2P. |
| F11 | INFO | Live probe: **`pcl-form.prapermedia.in` serves a GAS "Html Convert Error" page**, not the Vercel build — the OAuth origin is authorized for a broken page. | Deployment action D2 (§4) — domain/DNS fix, not a code change. |
| F12 | INFO | Live probe: the deployed GAS is an **intermediate version** (has weeks/awards, lacks subcheck/checklink/employeeLogin/directorFeed/hardening). | Deployment action D1 (§4) — the standing paste + New version. |

---

## 3 · The proof inventory (364 unit assertions + 6 E2E suites)

| Suite | Count | Covers |
|---|---|---|
| `test_do_post_collab.js` | 121 | ingest/ownership/collab-FULL/idempotency, six-password identity, subcheck, awards, screening feed, employee login (+ aud mismatch), checklink, **hardening 25–29** |
| `test_threat_matrix.js` (NEW) | 107 | JSONP callback charset (10 attack shapes), formula vectors, hostile schemes, IDN/userinfo/spoofed-subdomain URLs, esc() on 4 renderers, CSV + href guards, hostile number shapes |
| `test_ocr_parse.js` | 63 | layout parsing, K/M + Indian grouping, boost/platform compliance, crop/dark handling |
| `test_leaderboard_rollup.js` | 16 | dedupe-by-media, verified-over-claimed, weekly buckets, awards |
| `test_leaderboard_sanitize.js` | 33 | the board can never render a string/NaN as a number |
| `test_url_diag.js` | 24 | every accepted URL shape + typo diagnostics |
| `round28_e2e.sh` (NEW) | 8 checks | Enter guard ×2, links-Enter still commits, og font, mock FULL points, review meta, dark, 390px mobile |
| `round27_e2e.sh` | 6 | taken banner, collab banner + CONFIRM, Enter-field fix, logo revive, board |
| `final_e2e.sh` / `round_e2e.sh` | — | 3-portal sweeps: identity hint, admin award, board cleanliness, CEO theatre |
| `save_e2e.sh` | 3 | transport chain: healthy leg1 / GAS-302 + subcheck / honest failure |
| `ocr_e2e.sh` | 3 | YT auto-read, IG/LI OCR auto-fill + USE chip |
| `probe_live.sh` (NEW, read-only) | — | live GAS reads, wrong-password refusal, hostile-callback echo check, portals, YT key, GSI client |

Re-run everything:
```bash
for t in test_do_post_collab test_threat_matrix test_ocr_parse \
         test_leaderboard_rollup test_leaderboard_sanitize test_url_diag; do
  node scripts/$t.js; done
bash scripts/round28_e2e.sh && bash scripts/round27_e2e.sh && \
bash scripts/final_e2e.sh && bash scripts/round_e2e.sh && \
bash scripts/save_e2e.sh && bash scripts/ocr_e2e.sh
```

---

## 4 · Deployment action list (nothing code-side blocks on these)

| # | Action | Who | Why |
|---|---|---|---|
| **D1** | Paste the new `gas/Code.gs` → **Deploy → New version** (or the edit turns on nothing). Then run `setupBackupTrigger()` once from the editor. | you | Activates: subcheck, checklink, named rejections, six passwords, screening room, employee sign-in, cellSafe/safeUrl hardening, daily backups. Until then the live backend answers stats only (proven by probes). |
| **D2** | Point `pcl-form.prapermedia.in` at the Vercel project (Vercel → Settings → Domains → add + DNS), or fix the GAS Html binding that currently owns it. | you + TL | The origin currently serves "Html Convert Error". Google sign-in is authorized for an origin that isn't serving the form. |
| **D3** | Google Cloud → OAuth consent → test users / internal mode for @praper.in; keep the **Client Secret** in Google Cloud only (never in chat/repo/this codebase — nothing here consumes it). | you | Sign-in flow hygiene. |
| **D4** | Paste active-employee emails into the **PCL-Allowlist** tab (row 2+, one per line). Blank list denies everyone by design. | you/admins | Employee sign-in gating. |
| **D5** | Optional rotation now that gates are live: set Script Properties `CEO_CODE` (screening room) and edit `ADMINS` for real passwords. | you | The interim `firstName@123` / `director@123` are guessable by design. |
| **D6** | Docker/Terraform internal-network packaging for index+admin (leaderboard stays public) — **separate cloned repo, as agreed**; this repo stays untouched by it. | TL + you | The packaging request; deliberately out of this working tree. |

---

## 5 · Threat model summary (what an attacker could try → what happens)

| Attack | Outcome |
|---|---|
| `javascript:` URL via direct POST to the public ingest | refused at ingest (F1); even if stored by an older deploy, renders as inert `#` in admin/director (F1 client half) |
| Formula cell (`=IMPORTXML/GOOGLEFINANCE`) in name/manager/notes/collab/awards/log | stored as inert text (F2), never executes |
| JSONP `?callback=alert(1)` | charset-validated; the hostile name is never echoed (probed live) |
| Wrong admin password on ledger/ocr/write/award/sync | refused server-side; every attempt shape unit-tested |
| Hostile ID token (wrong aud / unverified email / wrong domain / not on allowlist) | refused at four sequential gates in employeeLogin_ |
| Wrong screening passcode | feed leaks nothing but the denial |
| 17-billion-view typo / fabricated counts | sanity lamp at typing, >1e10 rejected by OCR pipeline, reviewer SCAN + Cross-Check is the human gate |
| Boosted/sponsored content | Boosted-state text blocks submission at the form; BOOST? cross-check value + AUDIT WATCH lift-flags for reviewers |
| Same link by two players | red/green ownership banners pre-submit; ingest names the uploader; collab requires mutual tags |
| Duplicate submission (retry storm) | submissionId dedupe — `posts:0, duplicate:true` ack, never double rows |
| CSV export opened in Excel | formula-prefixed cells neutralised (F2/`csvCell`) |
| 4.5MB+ payload | Vercel 413 with a readable message before the gateway eats it |
| Public payload sniffing | verified + manager stripped at source; names/designations/points are the intended public surface |
