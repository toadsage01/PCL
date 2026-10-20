# PCL Metrics Autotracking — Research & Plan

**Goal:** every non-weekly-challenge PCL post's views tracked automatically, refreshed **at least daily**, for all 10 weeks — with zero risk to participants' accounts and **no single unstable dependency**.
**Date:** 20 Oct 2026 · **Scope:** YouTube (Shorts + long), Instagram (Reels + posts), LinkedIn.

---

## 0. The decision in one table

| Platform | Primary source (daily, automatic) | Fallback chain (auto-degrades) | Manual floor | Stability |
|---|---|---|---|---|
| **YouTube** (Shorts + long) | **Data API v3 `videos.list`** — official, free, no participant login | none needed (quota is a non-issue at PCL scale) | screenshot + OCR (already built) | ★★★★★ official |
| **Instagram Reels** | **Business Discovery API** — official, `view_count` confirmed in docs; participants only switch to a (free) Creator/Professional account — **no OAuth, no passwords** | 2. yt-dlp with a **league-owned** dummy account's cookies → 3. paid scraper vendor (Apify) → 4. OCR floor | screenshot + OCR | ★★★★ primary official; fallbacks ★★ |
| **Instagram posts/carousels** | Views are **not public on any route** (platform limitation, not strictness) | auto-track likes/comments; impressions via OCR | screenshot + OCR | n/a |
| **LinkedIn** | **Hybrid**: auto-track public reactions/comments/reposts daily; impressions stay **author-private** (official LinkedIn position) | public video-view counts where LinkedIn shows them (member-facing; pilot-verify) | weekly analytics screenshot + OCR (already built) | ★★★ (engagement) |

**The one rule that makes this "solid, not strict":** every metric has a *source tag* on every snapshot, the poller writes **append-only snapshots** (never overwrites history), a failing source degrades to the next leg automatically, and the stored value **never silently drops to zero** — it goes stale with a "needs attention" flag. Nothing depends on any single pipe.

---

## 1. Scale reality check (why this is easier than the AI drafts assumed)

PCL is an internal league. Working numbers: ~30–80 participants, ~3 posts each, 10 weeks → **≈ 900–1,500 tracked posts total**, not 2,000 active per day.

Daily refresh cost at the top end:

| Platform | Calls/day | Quota/cost |
|---|---|---|
| YouTube | 1,500 posts ÷ 50 per call = **30 calls** | 30 units of 10,000 free/day (`videos.list` = 1 unit, 50 IDs/call — official quota table) |
| Instagram (BD) | 1 call **per participant** (BD returns up to ~100 recent media *with `view_count`* in one request) | ≈ 40–80 Graph calls/day — free, far under throttles |
| LinkedIn | 1 fetch per post (guest page) | ≈ 100–150 fetches/day — trivial |

Neither the "$150–200 Apify" figure (Claude) nor a Celery/BullMQ/Cloud-Functions stack (Gemini) is warranted. The existing **Google Apps Script backend can host the whole poller** — it already has the Sheet, the Drive folder, the deploy, and UrlFetchApp (20,000 calls/day on consumer accounts, 100,000 on Workspace). No new infrastructure, no new bills.

---

## 2. YouTube — solved, officially

- `GET https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=<50 ids>&key=…` → `viewCount`, `likeCount`, `commentCount` in one unit. Shorts are plain videos; the ID from `/shorts/{id}` works identically.
- Default quota **10,000 units/day**; since the June 2026 quota update, `search.list`/`videos.insert` sit in their own buckets — irrelevant to us since we never search, we already hold IDs. Even hourly polling uses ~720 units/day. An API key is enough; **no participant OAuth, ever**.
- Pull `snippet.publishedAt` in the same call to reject pre-season uploads, and `status.privacyStatus`/`uploadStatus` to detect deleted/private (see §7 status handling).
- **Fairness caveats to write into the rules:**
  - Google's own Ads help page: *"Public view count is the total number of views (paid as ads, and viewed organically)"* — boosted views **do** land in the public counter. Mitigation is the velocity audit (§7.4), not the API.
  - YouTube began counting a view at first frame (2025/26 change) — same metric for everyone, just note it.
  - Public counters lag/cached — poll at fixed times, don't chase minute-level deltas.

## 3. Instagram — a ladder, not a single rope

### 3.1 Business Discovery API — the primary (official, no participant auth)
- Meta's own Business Discovery docs list the media metrics you can read on **other** professional accounts: `comments_count`, `like_count`, **`view_count`**, `id`. This is the official way to get reel view counts without each participant connecting anything.
- Requirements: (a) a **league-owned** Meta app with `instagram_basic` (standard App Review — free, days); (b) the league's admin IG account converted to Professional and linked to a Facebook Page; (c) target accounts must be **public + Professional/Creator** (free 2-minute switch, no password sharing, revocable anytime) and not age-gated.
- **Efficiency win both AI drafts missed:** BD is queried per *username* and returns their recent media list in one call — so the daily IG job is ~1 call per participant, then permalink-match against submitted URLs in the Sheet.
- **Token stability win:** mint a **Page access token** from the league admin's long-lived user token — page tokens *don't expire*. One-time setup, no monthly re-auth treadmill.
- Caveats: `media_url` can be omitted for reels (copyright/Download-off) — irrelevant for us; `view_count` semantics = IG "views" (includes replays; paid+organic are consolidated on public surfaces) → same velocity-audit mitigation as YouTube. Age-gated accounts return nothing → those participants use the fallback legs.

### 3.2 Owner OAuth (opt-in, finalists only)
Participants who *want* to can connect via the IG Graph API once; their own `/{media}/insights` then yields `views` plus **`total_views`/`total_likes`/`total_comments` which explicitly include promoted/boosted engagement**, and `boost_ads_list` shows ads attached to the media. This is the verification weapon for flagged finalists — not the daily pipeline (it needs per-participant consent).

### 3.3 DIY unauthenticated scraping — **now proven unstable, keep only as an emergency leg**
Hard 2026 evidence, not opinion: Instagram's public GraphQL path **went down on 2026-06-29 and returned *null* view counts when it came back** — scrapers kept writing rows silently missing the number. `web_profile_info` 400s on a growing subset of public profiles even with sessions; datacenter IPs (which is what GAS/GitHub Actions egress from) are blocked on first contact; single residential IPs are capped ~200 req/hour. Verdict: never load-bearing; at most an emergency probe with **null/zero rejection** (§7.5).

### 3.4 yt-dlp with a league-owned account — the pragmatic fallback leg
Anonymous extraction mostly fails today; the working recipe is cookies from a logged-in account, and **the block risk lands on the cookie account**. So: create one **league dummy account** (a league asset, zero participant exposure), keep volume tiny (one daily pass, 2–5 s sleep), expect occasional breakage, and never ship it as the primary. Runs on a GitHub Actions cron (2,000 free min/month) or any always-on box — *not* on GAS (no Node runtime).

### 3.5 Vendor scrapers (Apify etc.) — pay-per-result insurance
Aug-2026 benchmark: Apify ≈ **$1.50–2.30 per 1,000 results** (views/likes/comments, no login). At PCL scale (~500 reels/day worst case) a full-season insurance policy is **≈ $50–100 one-time** — cheap, but grade it ★★: it inherits Instagram's silent-null failure mode, so every vendor value passes the same sanity gate.

### 3.6 The floor: screenshot + OCR (already built)
The form's screenshot upload + OCR column stays the universal fallback for any leg that's down — and the audit sample's proof-of-work.

### 3.7 Static posts & carousels
No public view count exists on **any** route (official or scraper). Auto-track likes/comments; impressions come from the participant's screenshot via OCR. Say it plainly in the rules rather than pretending.

## 4. LinkedIn — hybrid by physics, not by caution

- Official: impressions/members-reached and video views are **author-private analytics**; the public post surface exposes reactions, comments, reposts — and (since the late-2024 rollout) a **public view count on native videos** (member-facing; guest/logged-out visibility is inconsistent → 20-URL pilot will settle it).
- There is no member-post impressions API outside LinkedIn's partner program — applying costs nothing, but plan as if it never arrives.
- **Daily automation:** guest-fetch each post's public page server-side → reactions/comments/reposts (± video views where present) with null-rejection and UA/consent headers. Stability ★★★: LinkedIn ships HTML-embedded JSON; changes are usually parse-level, and the snapshot design absorbs them.
- **Impressions:** keep the proven weekly screenshot → OCR path (it's already in the ledger), and/or a weighted engagement score stated in the rules. Decision point for Praper: rank LinkedIn on (a) OCR impressions, (b) engagement score, or (c) both with a display split.
- LinkedIn is also where the *internal-company* angle helps most: participants are colleagues — a weekly 10-second screenshot habit is a trivial ask.

## 5. Fairness across platforms (write into the rulebook)

| Metric | Counts | Includes paid? |
|---|---|---|
| YouTube `viewCount` | watch-page views | **yes** (official) |
| IG `view_count` (BD/OAuth `views`) | reel views incl. replays | public surfaces consolidate paid+organic |
| LinkedIn "views" | native video, 2 s+ (MRC) | n/a (author metric) |
| LinkedIn impressions | feed impressions | n/a (author metric) |

Options: keep the existing multipliers as the normalizer (recommended — players already understand ×1.25/×1/×2), and/or show per-platform percentile ranks on the leaderboard. Collab 50:50 split and media-ID dedupe are untouched — the poller just feeds fresher numbers into the same verified-points engine.

---

## 6. Pipeline — implemented on the stack we already run (GAS)

```
GAS time trigger  09:00 & 21:00 IST  (+ "SYNC NOW" button in admin control room)
   ├─ collect target URLs from PCL-Data (media_id, platform, participant)
   ├─ YouTube  : videos.list batches of 50            → 1 unit / 50 posts
   ├─ Instagram: BD per participant (league page token) → 1 call / participant
   │              └─ on fail: mark source=bd_down, yt-dlp leg (GH Actions) or OCR floor
   ├─ LinkedIn : guest fetch per post                  → reactions/comments (± video views)
   └─ write PCL-Snapshots (append-only) + refresh PCL-Data latest columns + recompute verified points
```

### 6.1 Snapshot schema (`PCL-Snapshots` tab)
`ts · media_id · platform · views · likes · comments · source(api:yt|api:igbd|ytdlp|vendor|guest|ocr|manual) · status(ok|deleted|private|stale|flagged) · notes`
One row per poll per post: 1,500 posts × 2/day × 70 days ≈ **210k rows** — fine for Sheets (10M cells); end-of-season archive to Drive keeps the live tab lean.

### 6.2 Source-of-truth rules
- Latest good snapshot wins; `source=manual` (self-report) is **overridden by auto** within a tolerance window, but a manual value far *above* auto creates an audit flag, not a silent fight.
- A row whose last good snapshot is >48 h old shows **stale** on the admin dashboard — never zero, never dropped.
- Weekly-challenge posts keep their existing flow; this pipeline covers the regular PCL posts all 10 weeks.

### 6.3 Status handling
Deleted / went-private / age-gated / comments-off → `status=deleted|private|…` + "needs attention" queue in admin. Rules decide (e.g., counts frozen at last public value; N-day grace to re-publicize).

### 6.4 Velocity audit (the boost catcher)
Per post keep trailing 3-day daily Δviews; flag when Δviews > 5× trailing average **and** likes/comments ratio is an outlier (Δviews:Δlikes far off the post's own history). Review team checks only flagged + top-10 → asks for analytics screenshot (or OAuth `boost_ads_list` for opted-in IG finalists). YouTube Analytics traffic-source breakdown exists but requires participant OAuth — skip by default.

### 6.5 Health monitor
Per-source `last_success`; 2 consecutive failures → source marked down, next leg takes over automatically, admin emailed. Every snapshot carries its source so a bad leg's data is identifiable and re-derivable.

### 6.6 Secrets & quotas
YT API key + IG page token + optional Apify token live in **Script Properties** (never in git). Volume: <200 UrlFetch calls/day typical — two orders of magnitude under the 20k consumer cap (keep an eye on the documented-but-occasionally-flaky UrlFetch bandwidth throttle; batching already protects us).

---

## 7. Risk register — what can kill each leg, and the answer

| Risk | Hits | Mitigation |
|---|---|---|
| IG kills/changes BD fields | primary IG | snapshot history keeps scoring alive on last-good; fallback legs; rules already tolerate staleness |
| League dummy IG account actioned (yt-dlp leg) | fallback only | it's a league asset, not a participant account; volume-throttled; vendor leg behind it |
| Vendor returns null views (seen Jun 2026) | vendor leg | sanity gate: reject null/0/implausible vs own history; drop to next leg |
| LinkedIn changes guest HTML | LI engagement | parse-failure → status=stale + flag; OCR impressions unaffected |
| YT quota abuse by others / key leak | YT | key restricted to server IP + Sheet-only usage; 30 units/day means even 10% quota ≈ unaffected |
| Participant's account private/age-gated | IG BD | per-post fallback legs; onboarding checklist ("public + Creator for auto-tracking") |
| Boosting/fraud | all | velocity flags + top-10 reviews + rules: boosted views allowed (they're public), fake views = DQ |

## 8. Rollout

- **Phase 0 (you, ~1 hour):** ① Google Cloud project → enable YouTube Data API → API key. ② League IG account → Professional + link to a new Facebook Page → Meta app (business type) + `instagram_basic` review. ③ Decide LinkedIn scoring (impressions-OCR vs engagement score). ④ Optional: Apify trial for the insurance leg.
- **Phase 1 (me):** `gas/Metrics.gs` poller + `PCL-Snapshots` tab + YT leg live; admin "SYNC NOW" + source/stale badges. YT is same-day win.
- **Phase 2:** IG BD leg + participant Creator-account onboarding checklist; fallback legs wired + health monitor.
- **Phase 3:** LinkedIn guest leg + weekly OCR impressions sync; velocity flags + needs-attention queue in admin.
- **Pilot before each leg:** 20 real URLs compared against what the apps display (both AI drafts agree on this; it's also how the Jun-2026 null bug would have been caught on day one).

## 9. Where the two drafts were right / off

| Claim | Verdict |
|---|---|
| Claude: BD returns `view_count` for reels | ✅ confirmed by Meta docs — this is the golden IG path |
| Claude: BD needs your own Meta app + approval | ✅ but one-time, free, league-side only |
| Claude: Apify $150–200 for the season | ⚠️ right at 2k-post scale; PCL is ~10× smaller → $50–100 worst case |
| Claude: "restrict IG to Reels only" | ❌ unnecessary — BD + OCR floor covers posts fine |
| Gemini: yt-dlp reels without login | ❌ outdated — 2026 needs cookies; anonymous access mostly dead |
| Gemini: Celery/BullMQ/Cloud Functions | ❌ overkill — GAS triggers + UrlFetch run the whole thing free |
| Both: snapshot time-series + velocity flags + freeze | ✅ adopted wholesale — it's the spine of §6 |
| Both: LinkedIn impressions impossible by URL | ✅ official — hybrid is the engineering answer, not a cop-out |

## 10. Sources

- YouTube quota table & 10k/day default — developers.google.com/youtube/v3/determine_quota_cost (+ June-2026 bucket split, blotato.com/blog/youtube-api-pricing)
- YT public view count includes paid — support.google.com/google-ads/answer/2375431
- Business Discovery (fields incl. `view_count`, requirements, age-gated) — developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery (+ /instagram-graph-api/reference/ig-user/business_discovery)
- IG Media fields (`boost_ads_list`, public fields) — developers.facebook.com/documentation/instagram-platform/reference/instagram-media
- IG Media Insights (`views`, `total_views` incl. promoted) — developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights
- IG scraping instability 2026 (null view counts 2026-06-29, login walls, IP caps) — scrapfly.io/blog/posts/how-to-scrape-instagram
- yt-dlp Instagram cookie requirement + account-level blocks — ytdlp.org/guides/yt-dlp-for-instagram; github.com/yt-dlp/yt-dlp issues
- Apify pricing benchmark — scrapecreators.com/blog/apify-instagram-scraper-benchmark; apify.com store
- LinkedIn video analytics author-private — linkedin.com/help/linkedin/answer/a590236
- LinkedIn impressions vs views semantics — contentin.io/blog/linkedin-impressions-vs-views
- GAS quotas (UrlFetch 20k/100k per day, trigger runtime) — developers.google.com/apps-script/guides/services/quotas
