/* ============================================================================
   PCL FORM ENGINE — custom UI, no framework.
   ----------------------------------------------------------------------------
   Flow (Season 2, views-first):
     1. Player details ................ full name + reporting manager
     2. Post Links .................... paste ALL post URLs (spaces, commas,
                                        semicolons or new lines). On paste /
                                        Enter / + ADD every link becomes a
                                        chip inside the box; invalid ones
                                        become red chips with the reason on
                                        hover. The format is AUTO-DETECTED
                                        from the link (rulebook §3 multiplier).
     3. Post Details .................. one compact row per chip.
                                        EDIT = columnar (views + screenshot +
                                        optional COLLAB tag), VIEW =
                                        confirmation rows with a floating
                                        screenshot lightbox (PREV / NEXT +
                                        thumbnails). Links render as #HASH
                                        (the media id, first 8 chars) — the
                                        brand badge already says the platform.
     4. Weekly Challenge .............. the ONGOING week only (season clock,
                                        warm-up counts as W1) + INFO popup with
                                        every week's challenge, criteria, reward
     5. Player photo .................. mandatory; uploaded through a square
                                        CROPPER (drag to position, zoom to
                                        frame, 512px JPEG out — small payload,
                                        fast submit). Saved per player on the
                                        backend (one photo per name — the next
                                        visit auto-shows it when the name is
                                        typed); reused server-side on re-submit

   Collab posts (rulebook §7): tag a post as COLLAB and name the partner.
   The backend only allows the same link twice when it can confirm the collab
   (the partner tagged this player, or this player tags the partner) — once
   confirmed, the post's points split 50:50 between the two players.

   Error model (per spec):
     · Missing required field  → red border + shadow + small "Required" text
       under the field; the navy well returns the moment data is entered.
     · Bad links are NEVER surfaced on final submit — they are flagged as red
       chips when the links are committed (paste / Enter / + ADD), with the
       reason on hover. `.is-status` (amber) is reserved for the future
       link-liveness check (private / followers-only posts).

   Submission strategy (CORS-safe, self-healing):
     - submitViaApi → same-origin POST /api/submit (Vercel function) first.
       Its JSON answer is read EVEN ON HTTP 4xx/5xx so real reasons
       (missing env var, duplicate link, collab not confirmed…) surface
       instead of a fake "check connection".
     - If the route is unreachable (network / deploy hiccup) → direct simple
       POST to the GAS /exec URL (no Content-Type header → no preflight;
       Apps Script answers with CORS-enabled JSON). Idempotent: the backend
       recognises a retried submissionId and never appends twice.
     - No backend configured → LOCAL mode: console + localStorage
       (key: pcl_submissions).
   ========================================================================== */

(function () {
  "use strict";

  var cfg = window.PCL_CONFIG || {};
  var MAX_BYTES = (cfg.maxFileMB || 5) * 1024 * 1024;
  var MAX_MB = cfg.maxFileMB || 5;
  var ACCEPTED = (cfg.fileTypes || "image/png, image/jpeg, image/webp")
    .split(",").map(function (s) { return s.trim(); }).filter(Boolean);

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fieldOf(name) {
    return document.querySelector('.pcl-field[data-field="' + name + '"]');
  }

  /* ---------- theme + reading-font toggles ---------- */
  var THEME_KEY = "pcl_theme";
  var toggleBtn = $("pclThemeToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-pcl-theme") === "dark"
          ? "light" : "dark";
      document.documentElement.setAttribute("data-pcl-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ok */ }
    });
  }
  var FONT_KEY = "pcl_font";
  var fontBtn = $("pclFontToggle");
  if (fontBtn) {
    fontBtn.setAttribute("aria-pressed",
      String(document.documentElement.getAttribute("data-pcl-font") === "og"));
    fontBtn.setAttribute("title", "Toggle OG arcade font");
    fontBtn.setAttribute("aria-label", "Toggle OG arcade font");
    fontBtn.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-pcl-font") === "og"
          ? "sf" : "og";
      document.documentElement.setAttribute("data-pcl-font", next);
      fontBtn.setAttribute("aria-pressed", String(next === "og"));
      try { localStorage.setItem(FONT_KEY, next); } catch (e) { /* ok */ }
    });
  }

  /* ---------- footer date ---------- */
  var dateEl = $("pclDate");
  if (dateEl) {
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var now = new Date();
    dateEl.textContent = now.getDate() + " " + MONTHS[now.getMonth()] +
      " " + now.getFullYear();
  }

  /* ============================================================================
     URL ENGINE — format auto-detection (rulebook §3)
     Accepts every pasteable shape: https://…, www.…, bare instagram.com/… —
     anything that opens the content when dropped into a URL bar.
     ONLY the three league platforms' OFFICIAL hosts pass:
       · Instagram  instagram.com + instagr.am (Meta's legacy short domain)
         /p/ = post · /reel/ + /reels/ = reel · /tv/ = legacy IGTV → reel
       · YouTube    youtube.com (+ m./music. subdomains), youtu.be (official
         shortener), youtube-nocookie.com — /watch?v= · /shorts/ · /live/ ·
         /embed/ · /v/ · youtu.be/<id>
       · LinkedIn   linkedin.com — /posts/ · /feed/update/ · /pulse/ · any
         activity-id link — plus lnkd.in (LinkedIn's OWN official shortener,
         per LinkedIn Help "Short URLs in shared posts")
     Third-party shorteners (bit.ly, tinyurl, cutt.ly …) stay rejected.
     ========================================================================== */
  var FORMATS = {
    ig_reel:   { label: "Instagram Reel", word: "Reel",  mult: 1.25 },
    ig_post:   { label: "Instagram Post", word: "Post",  mult: 1 },
    yt_shorts: { label: "YouTube Shorts", word: "Short", mult: 1.25 },
    yt_long:   { label: "YouTube Video",  word: "Video", mult: 2 },
    li_post:   { label: "LinkedIn Post",  word: "Post",  mult: 1 }
  };

  /* platform logos — small inline SVGs; the format word next to them takes
     the platform's brand colour (see .pcl-fmtbrand in theme.css), so the
     logo and the word read as one item */
  var BRAND_LOGO = {
    ig: '<svg class="pcl-fmtlogo" viewBox="0 0 24 24" aria-hidden="true">' +
        '<defs><linearGradient id="pclIgGrad" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#feda75"/><stop offset=".28" stop-color="#fa7e1e"/>' +
        '<stop offset=".55" stop-color="#d62976"/><stop offset=".8" stop-color="#962fbf"/>' +
        '<stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs>' +
        '<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5.4" fill="none" ' +
        'stroke="url(#pclIgGrad)" stroke-width="2.7"/>' +
        '<circle cx="12" cy="12" r="4.5" fill="none" stroke="url(#pclIgGrad)" stroke-width="2.7"/>' +
        '<circle cx="17.3" cy="6.7" r="1.7" fill="url(#pclIgGrad)"/></svg>',
    yt: '<svg class="pcl-fmtlogo" viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="1.5" y="4.8" width="21" height="14.4" rx="4" fill="#FF0000"/>' +
        '<path d="M10 9l6 3-6 3z" fill="#fff"/></svg>',
    li: '<svg class="pcl-fmtlogo" viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="2" y="2" width="20" height="20" rx="3.2" fill="#0A66C2"/>' +
        '<rect x="5.4" y="9.9" width="2.9" height="8.8" fill="#fff"/>' +
        '<circle cx="6.85" cy="6.5" r="1.75" fill="#fff"/>' +
        '<path d="M11.4 9.9h2.8v1.25c.5-.8 1.55-1.55 3.1-1.55 2.5 0 3.85 1.6 3.85 4.45v4.65h-2.9v-4.2c0-1.45-.6-2.35-1.75-2.35-1.25 0-2.2.9-2.2 2.55v4h-2.9z" fill="#fff"/></svg>'
  };
  function logoSvg(fmt) {
    return BRAND_LOGO[String(fmt || "").split("_")[0]] || "";
  }
  function brandHtml(fmt, withMult) {
    var f = FORMATS[fmt];
    return '<span class="pcl-fmtbrand" data-fmt="' + fmt + '" title="' +
      esc(f.label + " — rulebook multiplier " + f.mult + "×") + '">' +
      logoSvg(fmt) + '<span class="pcl-fmtword">' + esc(f.word) + "</span>" +
      (withMult ? " <b>×" + f.mult + "</b>" : "") + "</span>";
  }

  /* Windows-style OPEN FOLDER — the one upload glyph everywhere (photo tile
     + SHOT wells). The old box-arrow / bucket glyphs read vague at 13px. */
  var FOLDER_SVG = '<svg class="pcl-folder-ico" viewBox="0 0 16 13" ' +
    'shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect x="1" y="0" width="6" height="2" fill="#e8a200"/>' +
    '<rect x="1" y="2" width="14" height="10" fill="#f5b81e"/>' +
    '<rect x="1" y="2" width="14" height="1" fill="#ffd76b"/>' +
    '<polygon points="4,5 15,5 13,11 2,11" fill="#fffdf6"/>' +
    '<polygon points="2,5 16,5 13.5,12 0,12" fill="#ffd042"/>' +
    '<polygon points="2,5 16,5 15.7,6.2 2.3,6.2" fill="#ffe28a"/></svg>';
  /* community-style PEOPLE icon — the collab button (WhatsApp/Teams vibe) */
  var GROUP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
    '<circle cx="8.7" cy="8.6" r="3.1"/>' +
    '<path d="M2.7 18.4c.5-3.3 3-5.2 6-5.2s5.5 1.9 6 5.2z"/>' +
    '<circle cx="16.8" cy="9.4" r="2.5" opacity="0.72"/>' +
    '<path d="M15.5 13.6c2.9-.2 5.4 1.6 6 4.8h-5c-.15-1.9-.9-3.6-2-4.8z" ' +
    'opacity="0.72"/></svg>';
  /* magnifier — the EXPAND affordance for any picture on file (pfp tile
     corner + attached-shot corner). Click = zoom, not replace. */
  var MAG_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<circle cx="6.8" cy="6.8" r="4.2"/>' +
    '<line x1="10.2" y1="10.2" x2="14" y2="14"/></svg>';
  /* admin-verified tick — insta-style circle in PCL colours (orange disc,
     white tick, thin inner ring). ONLY players the Control Room verified
     get it; unverified players get nothing at all. An inline SVG, not an
     emoji — it inherits the theme variables on every portal. */
  var TICK_SVG = '<svg class="pcl-vbadge" viewBox="0 0 24 24" role="img" ' +
    'aria-label="Admin verified">' +
    '<circle cx="12" cy="12" r="10.5" fill="var(--pcl-primary, #ed3b00)"/>' +
    '<circle cx="12" cy="12" r="10.5" fill="none" stroke="#fffdf6" stroke-width="1.4"/>' +
    '<circle cx="12" cy="12" r="7.7" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>' +
    '<path d="M7.6 12.3l3 3.1 5.9-6.3" fill="none" stroke="#fff" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TICK_SVG_SM = TICK_SVG.replace('pcl-vbadge"', 'pcl-vbadge pcl-vbadge--sm"');

  function classifyUrl(raw) {
    var tok = String(raw || "").trim().replace(/[)\]}>,.;]+$/, "");
    if (!tok) return null;
    var whole = { s: 0, e: tok.length };
    if (!/^https?:\/\//i.test(tok)) {
      if (/^(www\.|[\w-]+\.[a-z]{2,})/i.test(tok)) tok = "https://" + tok;
      else if (/\./.test(tok) || /\//.test(tok)) {
        return { ok: false, token: tok,
        reason: "Not a link — paste the full post URL.", bad: whole };
      } else return null; // stray word from a sentence — ignore silently
    }
    var u;
    try { u = new URL(tok); } catch (e) {
      return { ok: false, token: tok,
        reason: "Not a link — paste the full post URL.", bad: whole };
    }
    if (!/\./.test(u.hostname)) {
      return { ok: false, token: tok,
        reason: "Not a link — paste the full post URL.", bad: whole };
    }
    var host = u.hostname.replace(/^www\./i, "").toLowerCase();
    var path = u.pathname || "";
    /* the exact segment that is wrong — the error chip lights THIS part up
       and one click drops the link back into the input with it selected */
    var hostRange = rangeOf(tok, u.hostname) || whole;
    var pathRange = path ? rangeOf(tok, path) : null;

    if (/(^|\.)instagram\.com$/.test(host) || host === "instagr.am") {
      var im = path.match(/\/(reel|reels|tv|p)\/([A-Za-z0-9_-]+)/i);
      if (!im) {
        return { ok: false, token: tok,
          reason: "Instagram — only Reel or Post links count in the league.",
          bad: pathRange || hostRange };
      }
      return {
        ok: true, url: tok,
        format: /^(reel|reels|tv)$/i.test(im[1]) ? "ig_reel" : "ig_post",
        mediaId: "ig_" + im[2]
      };
    }

    if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be" ||
        /(^|\.)youtube-nocookie\.com$/.test(host)) {
      var sm = path.match(/\/shorts\/([A-Za-z0-9_-]+)/i);
      if (sm) return { ok: true, url: tok, format: "yt_shorts", mediaId: "yt_" + sm[1] };
      var vid = u.searchParams.get("v");
      var lm = !vid ? path.match(/\/(?:live|embed|v)\/([A-Za-z0-9_-]+)/i) : null;
      var bm = !vid && !lm && host === "youtu.be" ? path.match(/^\/([A-Za-z0-9_-]+)/) : null;
      var id = vid || (lm && lm[1]) || (bm && bm[1]);
      if (id) return { ok: true, url: tok, format: "yt_long", mediaId: "yt_" + id };
      return { ok: false, token: tok,
        reason: "YouTube — only video or Shorts links count in the league.",
        bad: pathRange || hostRange };
    }

    if (/(^|\.)linkedin\.com$/.test(host) || host === "lnkd.in") {
      var pm = path.match(/\/(?:posts|feed\/update|pulse)\/([^\/?#]+)/i) ||
               path.match(/activity[-:]?(\d{10,})/i);
      if (!pm && host !== "lnkd.in") {
        return { ok: false, token: tok,
          reason: "LinkedIn — only post links count in the league.",
          bad: pathRange || hostRange };
      }
      if (!pm) pm = path.match(/^\/([A-Za-z0-9_-]+)/);   // lnkd.in/<token>
      if (!pm) {
        return { ok: false, token: tok,
          reason: "LinkedIn — that lnkd.in link looks truncated.",
          bad: whole };
      }
      var am = tok.match(/activity[-:](\d{10,})/i);
      return { ok: true, url: tok, format: "li_post",
               mediaId: "li_" + (am ? am[1] : pm[1]) };
    }

    /* wrong domain: first guess the typo (youtube.cm → youtube.com), then
       flag the whole host as foreign — both ways, the chip shows WHERE it
       broke and one click loads it for editing with that part selected */
    var typo = hostTypo(host);
    if (typo) {
      return { ok: false, token: tok,
        reason: host + " looks mistyped — did you mean " + typo.dom + "?",
        bad: hostRange };
    }
    return { ok: false, token: tok,
      reason: "Unsupported platform — Instagram, YouTube or LinkedIn only.",
      bad: hostRange };
  }

  /* ---- typo + segment diagnostics for the URL engine ---------------------- */
  function editDist(a, b) {
    var m = a.length, n = b.length, i, j, t;
    var prev = [], cur = [];
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }
  var HOST_CANON = ["instagram.com", "instagr.am", "youtube.com", "youtu.be",
    "youtube-nocookie.com", "linkedin.com", "lnkd.in"];
  var HOST_FIX = {
    "instagram.com": "instagram.com", "instagr.am": "instagram.com",
    "youtube.com": "youtube.com", "youtu.be": "youtube.com",
    "youtube-nocookie.com": "youtube.com", "linkedin.com": "linkedin.com",
    "lnkd.in": "linkedin.com"
  };
  function hostTypo(host) {
    var h = String(host || "").replace(/^(www|m|music)\./i, "");
    var best = null;
    HOST_CANON.forEach(function (k) {
      var d = editDist(h, k);
      var tol = k.length >= 12 ? 3 : 2;
      if (d > 0 && d <= tol && (!best || d < best.dist)) {
        best = { dist: d, dom: k, fix: HOST_FIX[k] };
      }
    });
    return best;
  }
  function rangeOf(tok, needle) {
    var lo = String(tok).toLowerCase();
    var i = lo.indexOf(String(needle).toLowerCase());
    if (i < 0 || !needle) return null;
    return { s: i, e: i + String(needle).length };
  }

  function linkDisplay(url) {
    try {
      var u = new URL(url);
      var s = u.hostname.replace(/^www\./i, "") + u.pathname;
      if (s.length > 40) s = s.slice(0, 40) + "…";
      return s;
    } catch (e) { return url; }
  }
  function chipTail(mediaId) {
    var tail = String(mediaId || "").split("_").slice(1).join("_");
    if (tail.length > 14) tail = tail.slice(0, 14) + "…";
    return tail;
  }
  /* the tiny identity shown where a full URL would be redundant — the brand
     badge next to it already names the platform + format (user spec: show
     the hash, first few characters, just enough to be unique) */
  function postHash(p) {
    var tail = String(p && p.mediaId || "").split("_").slice(1).join("_");
    if (!tail) return linkDisplay(p && p.url || "");
    return tail.length > 8 ? tail.slice(0, 8) + "…" : tail;
  }

  /* ============================================================================
     STATE
     ========================================================================== */
  var posts = [];        // { id(=mediaId), url, format, mediaId, views, shot,
                         //   errViews, errShotMsg, collab, collabWith, errCollab }
  var chipErrors = [];   // { token, reason }
  var viewMode = "edit"; // "edit" | "view"
  var pendingShotFor = null;

  /* ---------- DOM refs ---------- */
  var form = $("pclForm");
  var fullName = $("fullName");
  var manager = $("reportingManager");
  var desig = $("playerDesig");
  var chipBox = $("chipBox");
  var chipList = $("chipList");
  var linkInput = $("linkInput");
  var addLinksBtn = $("addLinksBtn");
  var postRows = $("postRows");
  var postEmpty = $("postEmpty");
  var postCount = $("postCount");
  var viewToggle = $("viewToggle");
  var week = $("challengeWeek");
  var challengeUrl = $("challengeUrl");
  var notes = $("additionalNotes");
  var submitBtn = $("pclSubmit");
  var saveState = $("pclSaveState");
  var doneScreen = $("pclDone");
  var shotInput = $("shotInput");
  if (ACCEPTED.length) shotInput.setAttribute("accept", ACCEPTED.join(","));

  /* ============================================================================
     POST LINKS — chips
     ========================================================================== */
  function validChipHtml(p, i) {
    var f = FORMATS[p.format];
    return '<span class="pcl-chip" data-kind="post" title="' + esc(p.url) + '">' +
      '<span class="pcl-chip-label"><span class="pcl-chip-brand" data-fmt="' +
      p.format + '">' + logoSvg(p.format) +
      '<span class="pcl-fmtword">' + esc(f.word) + "</span></span> · " +
      esc(chipTail(p.mediaId)) +
      '</span><button type="button" class="pcl-chip-x" data-act="del" data-i="' + i +
      '" aria-label="Remove ' + esc(f.label) + " " + esc(chipTail(p.mediaId)) +
      '"></button></span>';
  }
  function errChipHtml(e, i) {
    var tok = String(e.token || "");
    var bad = (e.bad && e.bad.s >= 0 && e.bad.e > e.bad.s && e.bad.e <= tok.length)
      ? e.bad : null;
    var label;
    if (bad) {
      var head = tok.slice(0, bad.s);
      var mid = tok.slice(bad.s, bad.e);
      var tail = tok.slice(bad.e);
      label = (head.length > 20 ? head.slice(0, 18) + "…" : esc(head)) +
        '<span class="pcl-chip-bad">' +
        esc(mid.length > 24 ? mid.slice(0, 24) + "…" : mid) + "</span>" +
        esc(tail.length > 10 ? tail.slice(0, 10) + "…" : tail);
    } else {
      label = esc(shortToken(tok));
    }
    return '<span class="pcl-chip is-error" data-kind="err" data-act="fixerr" data-i="' +
      i + '" data-reason="' + esc(e.reason + " — tap the red part to edit.") +
      '" title="' + esc(e.reason) + '">' +
      '<span class="pcl-chip-label">' + label + '</span>' +
      '<button type="button" class="pcl-chip-x" data-act="delerr" data-i="' + i +
      '" aria-label="Remove invalid link"></button></span>';
  }
  function shortToken(t) {
    t = String(t || "");
    return t.length > 26 ? t.slice(0, 26) + "…" : t;
  }

  function renderChips() {
    var html = posts.map(validChipHtml).join("") +
               chipErrors.map(errChipHtml).join("");
    chipList.innerHTML = html;
  }

  /* duplicates are ALLOWED to land — the chip shows "duplicate, removing…"
     with a 3-second countdown bar, then removes itself (user spec) */
  function addDupChip(tok) {
    var el = document.createElement("span");
    el.className = "pcl-chip is-dup";
    el.setAttribute("data-kind", "dup");
    el.innerHTML = '<span class="pcl-chip-label">' + esc(shortToken(tok)) +
      " — duplicate, removing…</span>" +
      '<span class="pcl-dupbar" aria-hidden="true"></span>';
    chipList.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }, 3000);
  }

  function renderDetailsHead() {
    postCount.textContent = posts.length + (posts.length === 1 ? " POST" : " POSTS");
    postCount.hidden = posts.length === 0;
    viewToggle.hidden = posts.length === 0;
    postEmpty.hidden = posts.length !== 0;
  }

  /* ---------- undo / redo — the links section only (ctrl+z / ctrl+y) ----------
   Covers typing bursts, pastes, commits, chip deletions and error-chip
   edits. One step back = exactly what the section looked like before. */
  var undoStack = [];
  var redoStack = [];
  var lastBurstAt = 0;
  var lastInputSnap = null;
  function snapLinks() {
    return {
      input: linkInput.value,
      posts: posts.map(function (p) { return Object.assign({}, p); }),
      errs: chipErrors.map(function (e) { return Object.assign({}, e); })
    };
  }
  function pushUndo(snap) {
    undoStack.push(snap || snapLinks());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function applySnap(s) {
    linkInput.value = s.input;
    posts = s.posts.map(function (p) { return Object.assign({}, p); });
    chipErrors = s.errs.map(function (e) { return Object.assign({}, e); });
    renderChips(); renderRows(); renderDetailsHead();
    clearFieldErr("postLinks");
    lastInputSnap = snapLinks();
  }
  function undoLinks() {
    if (!undoStack.length) return false;
    redoStack.push(snapLinks());
    applySnap(undoStack.pop());
    return true;
  }
  function redoLinks() {
    if (!redoStack.length) return false;
    undoStack.push(snapLinks());
    applySnap(redoStack.pop());
    return true;
  }
  function undoKeys(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    var k = String(ev.key || "").toLowerCase();
    if (k === "z" && !ev.shiftKey) {
      ev.preventDefault();
      undoLinks();
    } else if ((k === "z" && ev.shiftKey) || k === "y") {
      ev.preventDefault();
      redoLinks();
    }
  }
  linkInput.addEventListener("keydown", undoKeys);

  function commitLinks() {
    var raw = linkInput.value;
    if (String(raw || "").trim()) pushUndo();
    chipErrors = [];
    var inBatch = {};
    var dups = [];
    var added = 0;
    String(raw || "").split(/[\s,;]+/).forEach(function (tok) {
      var c = classifyUrl(tok);
      if (!c) return;
      if (!c.ok) {
        chipErrors.push({ token: c.token || tok, reason: c.reason, bad: c.bad });
        return;
      }
      if (inBatch[c.mediaId] ||
          posts.some(function (p) { return p.id === c.mediaId; })) {
        dups.push(c.token || tok);          // “duplicate, removing…” chip
        return;
      }
      inBatch[c.mediaId] = true;
      posts.push({
        id: c.mediaId, url: c.url, format: c.format, mediaId: c.mediaId,
        views: "", shot: null, errViews: false, errShotMsg: "",
        collab: false, collabWith: "", errCollab: false,
        ctype: "PRAPER"
      });
      added++;
    });
    linkInput.value = "";
    renderChips();
    renderRows();
    renderDetailsHead();
    dups.forEach(addDupChip);
    lastInputSnap = snapLinks();
    if (added > 0 || chipErrors.length > 0) clearFieldErr("postLinks");
  }

  /* one click on an error chip → the link lands in the input with exactly
     the broken segment pre-selected, ready to retype */
  function fixErrChip(i) {
    var e = chipErrors[i];
    if (!e) return;
    pushUndo();
    chipErrors.splice(i, 1);
    linkInput.value = e.token;
    renderChips();
    renderDetailsHead();
    clearFieldErr("postLinks");
    lastInputSnap = snapLinks();
    linkInput.focus();
    var bad = (e.bad && e.bad.e <= e.token.length) ? e.bad
              : { s: 0, e: e.token.length };
    try { linkInput.setSelectionRange(bad.s, bad.e); } catch (err) { /* ok */ }
  }

  chipList.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var i = Number(btn.getAttribute("data-i"));
    if (act === "del") { pushUndo(); posts.splice(i, 1); }
    else if (act === "delerr") { pushUndo(); chipErrors.splice(i, 1); }
    else if (act === "fixerr") { fixErrChip(i); return; }
    renderChips();
    renderRows();
    renderDetailsHead();
  });

  linkInput.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      commitLinks();
    }
  });
  linkInput.addEventListener("paste", function () {
    pushUndo();                    // accidental mega-paste → one ctrl+z away
    setTimeout(commitLinks, 0);    // let the value land first
  });
  linkInput.addEventListener("input", function () {
    clearFieldErr("postLinks");   // typing → navy well returns
    var now = Date.now();
    if (now - lastBurstAt > 700 && lastInputSnap) pushUndo(lastInputSnap);
    lastBurstAt = now;
    clearTimeout(linkInput.__snapT);
    linkInput.__snapT = setTimeout(function () { lastInputSnap = snapLinks(); }, 250);
  });
  addLinksBtn.addEventListener("click", commitLinks);
  chipBox.addEventListener("click", function (ev) {
    if (ev.target === chipBox || ev.target.classList.contains("pcl-chips")) {
      linkInput.focus();
    }
  });

  /* ============================================================================
     POST DETAILS — EDIT / VIEW rows
     ========================================================================== */
  function fmtHtml(fmt) {
    return brandHtml(fmt, true);
  }

  function editRowHtml(p, i) {
    var n = i + 1;
    /* the 50:50 content balance (rulebook §6) — every post is tagged
       PRAPER/PAVE or PERSONAL; defaults to PRAPER so it never blocks */
    var ct = p.ctype === "PERSONAL" ? "PERSONAL" : "PRAPER";
    var ctToggle = '<span class="pcl-cttoggle" role="group" aria-label="Content type — post ' + n + '">' +
      '<button type="button" class="pcl-ct pcl-ct--praper' + (ct === "PRAPER" ? " is-on" : "") +
      '" data-act="ctype" data-ct="PRAPER" data-id="' + esc(p.id) + '" aria-pressed="' +
      (ct === "PRAPER") + '" title="Praper / PAVE content">PRAPER</button>' +
      '<button type="button" class="pcl-ct pcl-ct--personal' + (ct === "PERSONAL" ? " is-on" : "") +
      '" data-act="ctype" data-ct="PERSONAL" data-id="' + esc(p.id) + '" aria-pressed="' +
      (ct === "PERSONAL") + '" title="Personal content">PERSONAL</button>' +
      "</span>";
    var cellViews = '<div class="pcl-cell pcl-cell--views' +
      (p.errViews ? " is-error" : "") + '">' +
      '<input class="pcl-input pcl-views" data-id="' + esc(p.id) +
      '" type="text" inputmode="numeric" placeholder="Views / impressions"' +
      ' value="' + esc(p.views) + '" aria-label="Views or impressions — post ' + n +
      '" /><p class="pcl-err">Required</p></div>';
    var btn = p.shot
      ? '<button type="button" class="pcl-shotbtn is-set" data-act="shot" data-id="' +
        esc(p.id) + '" title="Screenshot attached — click to replace" ' +
        'aria-label="Screenshot attached — click to replace">' +
        '<img class="pcl-thumb" src="' + p.shot.content + '" alt="" /></button>'
      : '<button type="button" class="pcl-shotbtn" data-act="shot" data-id="' +
        esc(p.id) + '" title="Attach analytics screenshot" ' +
        'aria-label="Attach analytics screenshot">' + FOLDER_SVG +
        '<span class="pcl-shotbtn-label">ATTACH SCREENSHOT</span></button>';
    /* attached shots get their own EXPAND chip — the square stays
       replace-on-click, the corner magnifier zooms without conflict */
    var expand = p.shot
      ? '<button type="button" class="pcl-expand" data-act="expand" data-id="' +
        esc(p.id) + '" title="Expand screenshot" aria-label="Expand screenshot">' +
        MAG_SVG + "</button>"
      : "";
    var cellShot = '<div class="pcl-cell pcl-cell--shot' +
      (p.errShotMsg ? " is-error" : "") + '">' + btn + expand +
      '<p class="pcl-err">' + esc(p.errShotMsg || "Required") + "</p></div>";
    var collab = '<div class="pcl-collabrow">' +
      '<button type="button" class="pcl-collab-btn' + (p.collab ? " is-on" : "") +
      '" data-act="collab" data-id="' + esc(p.id) +
      '" aria-pressed="' + (p.collab ? "true" : "false") +
      '" aria-label="Collab post — add a partner (post ' + n + ')" ' +
      'title="Collab post — points split 50:50 once the partner submits the same link">' +
      GROUP_SVG +
      (p.collab ? '<span class="pcl-collab-half" aria-hidden="true">½</span>' : "") +
      "</button>" +
      (p.collab
        ? '<div class="pcl-collabpop">' +
          '<span class="pcl-collab-title">Collab · points split 50:50</span>' +
          '<input class="pcl-input pcl-collab-input' + (p.errCollab ? " is-error" : "") +
          '" data-act="collabname" data-id="' + esc(p.id) +
          '" type="text" placeholder="Partner\u2019s full name" value="' +
          esc(p.collabWith) + '" aria-label="Partner\u2019s full name — post ' + n + '" />' +
          '<span class="pcl-hint pcl-collab-hint">Your partner submits the same link — ' +
          "once the backend confirms the pair, this post\u2019s points split 50:50.</span>" +
          (p.errCollab ? '<p class="pcl-err">Add your partner\u2019s name.</p>' : "") +
          "</div>"
        : "") +
      "</div>";
    return '<div class="pcl-post" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-post-num">' + n + "</span>" +
      '<div class="pcl-post-main"><a class="pcl-post-link" href="' + esc(p.url) +
      '" target="_blank" rel="noopener" title="' + esc(p.url) + '">#' +
      esc(postHash(p)) + "</a>" +
      fmtHtml(p.format) + ctToggle + "</div>" + cellViews + cellShot + collab + "</div>";
  }

  function viewRowHtml(p, i) {
    var n = i + 1;
    var btn = p.shot
      ? '<button type="button" class="pcl-vshot is-set" data-act="photo" data-id="' +
        esc(p.id) + '" title="Open screenshot">' + FOLDER_SVG + "PHOTO</button>"
      : '<button type="button" class="pcl-vshot is-missing" data-act="shot" data-id="' +
        esc(p.id) + '" title="Attach analytics screenshot">' + FOLDER_SVG +
        "ADD SHOT</button>";
    var collabTag = p.collab
      ? '<span class="pcl-collab-toggle" aria-hidden="true">COLLAB' +
        (p.collabWith ? " · " + esc(p.collabWith) : "") + "</span>"
      : "";
    var ctTag = '<span class="pcl-cttag' + (p.ctype === "PERSONAL" ? " is-personal" : "") +
      '">' + (p.ctype === "PERSONAL" ? "PERSONAL" : "PRAPER") + "</span>";
    return '<div class="pcl-vrow" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-vnum">' + n + "</span>" +
      '<a class="pcl-vlink" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
      esc(p.url) + '">#' + esc(postHash(p)) + "</a>" + fmtHtml(p.format) + ctTag + collabTag + btn + "</div>";
  }

  /* collab partner names — managers + every roster participant, so the
     partner's name can be picked, not guessed (same engine as the manager
     field, including the tap-fills-immediately fix). Built LAZILY: MANAGERS
     and ROSTER are defined further down, so this must not run at parse. */
  function titleCase(s) {
    return String(s || "").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  var COLLAB_NAMES = null;
  function collabNames() {
    if (!COLLAB_NAMES) {
      COLLAB_NAMES = MANAGERS.concat(Object.keys(ROSTER).map(titleCase))
        .sort(function (a, b) { return a.localeCompare(b); });
    }
    return COLLAB_NAMES;
  }
  /* each renderRows() rebuilds the collab popovers — bind a fresh
     autocomplete to every partner input the first time it appears */
  function bindCollabAcs() {
    if (!postRows) return;
    var names = collabNames();
    Array.prototype.forEach.call(postRows.querySelectorAll(".pcl-collab-input"),
      function (inp) {
        if (inp.__acBound) return;
        inp.__acBound = true;
        var box = document.createElement("div");
        box.className = "pcl-ac";
        box.hidden = true;
        box.setAttribute("role", "listbox");
        inp.parentNode.appendChild(box);
        makeAutocomplete(inp, box, names,
          "No match — keep the name as typed.");
      });
  }

  function renderRows() {
    if (!posts.length) { postRows.innerHTML = ""; return; }
    postRows.innerHTML = posts.map(viewMode === "edit" ? editRowHtml : viewRowHtml)
                              .join("");
    bindCollabAcs();
    noteDraft();
  }

  function setMode(mode) {
    viewMode = mode === "view" ? "view" : "edit";
    Array.prototype.forEach.call(viewToggle.querySelectorAll(".pcl-vbtn"), function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-mode") === viewMode);
    });
    renderRows();
  }
  viewToggle.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-mode]");
    if (b) setMode(b.getAttribute("data-mode"));
  });

  /* views typed → state + navy restore (no re-render, keep the caret) */
  postRows.addEventListener("input", function (ev) {
    var input = ev.target.closest(".pcl-views");
    if (input) {
      var p = postById(input.getAttribute("data-id"));
      if (!p) return;
      p.views = input.value.replace(/[^\d,.\s]/g, "").slice(0, 18);
      if (p.views !== input.value) input.value = p.views;
      if (p.errViews) {
        p.errViews = false;
        var cell = input.closest(".pcl-cell");
        if (cell) cell.classList.remove("is-error");
      }
      return;
    }
    var cinp = ev.target.closest(".pcl-collab-input");
    if (cinp) {
      var cp = postById(cinp.getAttribute("data-id"));
      if (!cp) return;
      cp.collabWith = cinp.value.replace(/^\s+/, "").slice(0, 60);
      if (cp.errCollab) {
        cp.errCollab = false;
        cinp.classList.remove("is-error");
        var ce = cinp.parentNode.querySelector(".pcl-err");
        if (ce) ce.remove();
      }
    }
  });

  /* screenshot + collab buttons */
  postRows.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var id = btn.getAttribute("data-id");
    if (act === "photo") {
      Lightbox.openFor(id);
    } else if (act === "expand") {
      Lightbox.openFor(id);
    } else if (act === "shot") {
      pendingShotFor = id;
      shotInput.click();
    } else if (act === "collab") {
      var p = postById(id);
      if (!p) return;
      p.collab = !p.collab;
      p.errCollab = false;
      renderRows();
      if (p.collab) {
        var pop = postRows.querySelector('.pcl-post[data-id="' + id +
          '"] .pcl-collab-input');
        if (pop) pop.focus();
      }
    } else if (act === "ctype") {
      /* in-place flip — no re-render so the row keeps its scroll/caret */
      var cp = postById(id);
      if (!cp) return;
      cp.ctype = btn.getAttribute("data-ct") === "PERSONAL" ? "PERSONAL" : "PRAPER";
      var rowEl = btn.closest(".pcl-cttoggle");
      if (rowEl) {
        Array.prototype.forEach.call(rowEl.querySelectorAll(".pcl-ct"), function (b) {
          var on = b.getAttribute("data-ct") === cp.ctype;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", String(on));
        });
      }
      noteDraft();
    }
  });

  function postById(id) {
    for (var i = 0; i < posts.length; i++) if (posts[i].id === id) return posts[i];
    return null;
  }

  /* ============================================================================
     SCREENSHOTS — one shared file picker, per-post assignment
     ========================================================================== */
  shotInput.addEventListener("change", function () {
    var p = postById(pendingShotFor);
    var file = shotInput.files && shotInput.files[0];
    shotInput.value = "";          // allow re-picking the same file later
    pendingShotFor = null;
    if (!p) return;
    if (!file) return;

    if (ACCEPTED.length && file.type && ACCEPTED.indexOf(file.type) === -1) {
      flagShot(p, "PNG / JPG / WEBP only");
      return;
    }
    if (file.size > MAX_BYTES) {
      flagShot(p, "Over " + MAX_MB + " MB");
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      p.shot = { name: file.name, type: file.type, content: fr.result };
      p.errShotMsg = "";
      renderRows();
    };
    fr.onerror = function () { flagShot(p, "Could not read file"); };
    fr.readAsDataURL(file);
  });

  function flagShot(p, msg) {
    p.shot = null;
    p.errShotMsg = msg;
    renderRows();
  }

  /* ============================================================================
     LIGHTBOX — floating window · details line below · thumbnail strip beside
     PREV / NEXT arrows with text; wraps around; Esc / backdrop closes.
     ========================================================================== */
  var Lightbox = (function () {
    var root = $("pclLightbox");
    var img = $("pclLbImg");
    var line = $("pclLbLine");
    var strip = $("pclLbStrip");
    var idx = -1;
    var single = false;          // one-image mode (pfp expand) — no strip/arrows
    var lastFocus = null;

    function shots() {
      return posts.filter(function (p) { return p.shot; });
    }

    function metaLine(p) {
      var bits = ["#" + (posts.indexOf(p) + 1),
                  brandHtml(p.format, true)];
      var n = Number(String(p.views).replace(/[^\d]/g, ""));
      if (n > 0) bits.push(Number(n).toLocaleString("en-US") + " views");
      bits.push('<a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
                esc(p.url) + '">#' + esc(postHash(p)) + "</a>");
      return bits.join(" · ");
    }

    function render() {
      var list = shots();
      if (!list.length) { close(); return; }
      if (idx >= list.length) idx = list.length - 1;
      if (idx < 0) idx = 0;
      var p = list[idx];
      img.src = p.shot.content;
      img.alt = "Analytics screenshot — " + FORMATS[p.format].label;
      line.innerHTML = metaLine(p);
      strip.innerHTML = list.map(function (s, i) {
        return '<button type="button" class="pcl-lb-thumb' +
          (i === idx ? " is-active" : "") + '" data-act="thumb" data-i="' + i +
          '" title="Post #' + (posts.indexOf(s) + 1) + '">' +
          '<img src="' + s.shot.content + '" alt="" /></button>';
      }).join("");
    }

    function openFor(id) {
      var list = shots();
      var at = -1;
      list.forEach(function (p, i) { if (p.id === id) at = i; });
      if (at === -1) return;
      idx = at;
      single = false;
      root.classList.remove("is-single");
      lastFocus = document.activeElement;
      root.hidden = false;
      render();
      root.querySelector(".pcl-lb-close").focus();
    }
    /* single-image mode — used by the pfp expand chip: same floating window,
       but no thumbnail strip and no prev/next (nothing to step through) */
    function openSingle(src, alt) {
      if (!src) return;
      single = true;
      idx = -1;
      root.classList.add("is-single");
      lastFocus = document.activeElement;
      img.src = src;
      img.alt = alt || "Image";
      line.textContent = "";
      strip.innerHTML = "";
      root.hidden = false;
      root.querySelector(".pcl-lb-close").focus();
    }
    function close() {
      root.hidden = true;
      idx = -1;
      single = false;
      root.classList.remove("is-single");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function step(d) {
      if (single) return;
      var list = shots();
      if (!list.length) return;
      idx = (idx + d + list.length) % list.length;   // wrap both ways
      render();
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-act]");
      if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "close") close();
      else if (act === "prev") step(-1);
      else if (act === "next") step(1);
      else if (act === "thumb") { idx = Number(t.getAttribute("data-i")); render(); }
    });
    document.addEventListener("keydown", function (ev) {
      if (root.hidden) return;
      if (ev.key === "Escape") close();
      else if (!single && ev.key === "ArrowLeft") step(-1);
      else if (!single && ev.key === "ArrowRight") step(1);
    });

    return { openFor: openFor, openSingle: openSingle, close: close };
  })();

  /* ============================================================================
     SEASON CLOCK + WEEKLY CHALLENGES (rulebook §4) — the form only accepts the
     ONGOING week; the INFO button opens every week's challenge, criteria and
     reward so candidates can prepare upcoming posts.
     ========================================================================== */
  var SEASON_START_ISO = "2026-10-19T11:00:00+05:30";
  var SEASON_START = new Date(SEASON_START_ISO).getTime();
  var WEEK_TOTAL = 10;
  var CHALLENGES = [
    { name: "Best Original Content",
      crit: "Most original and creative content featuring Praper Media.",
      pts: 6000 },
    { name: "Best Storytelling Debut",
      crit: "Most engaging storytelling content mentioning Praper Media.",
      pts: 8000 },
    { name: "A Day in My Life",
      crit: "Give a glimpse into your daily life — routine, fun moments, work highlights.",
      pts: 8000 },
    { name: "Best Collaboration",
      crit: "Create content with at least one other Praper employee.",
      pts: 10000 },
    { name: "Behind the Scenes at Praper",
      crit: "Best emerging creator showcasing office culture and daily life.",
      pts: 6000 },
    { name: "Most Improved Creator",
      crit: "Highest improvement in profile visits, reach, engagement and follower growth during the challenge.",
      pts: 10000 },
    { name: "Consistency Reward",
      crit: "Publish at least 2 posts per week for seven consecutive weeks. Tie-break: total impressions and likes.",
      pts: 12000 },
    { name: "The One-Take Challenge",
      crit: "One continuous take of minimum 30 seconds, without cuts or edits.",
      pts: 8000 },
    { name: "The Trend Takeover",
      crit: "Give a popular trend or meme your own creative twist.",
      pts: 8000 },
    { name: "The Comment Magnet — Final Showdown",
      crit: "Create a post that sparks meaningful conversations and invites the audience to share opinions in the comments.",
      pts: 10000 }
  ];

  function currentWeek() {
    var t = Date.now();
    if (t < SEASON_START) return 1;   // warm-up posts land in Week 1
    return Math.min(WEEK_TOTAL, Math.floor((t - SEASON_START) / 604800000) + 1);
  }
  function weekWindow(w) {
    return {
      a: new Date(SEASON_START + (w - 1) * 604800000),
      b: new Date(SEASON_START + w * 604800000)
    };
  }
  function fmtDayShort(d) {
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + M[d.getMonth()];
  }
  /* the ONLY selectable challenge = the week that is live right now */
  function buildWeekOptions() {
    var cur = currentWeek();
    var c = CHALLENGES[cur - 1];
    week.innerHTML = '<option value="">Not entering</option>' +
      '<option value="Week ' + cur + " — " + esc(c.name) + '">Week ' + cur +
      " · " + esc(c.name) + "</option>";
  }

  /* ---------- generic themed modal (info popup + rulebook) ---------- */
  var Modal = (function () {
    var root = $("pclModal");
    var body = $("pclModalBody");
    function open(html) {
      body.innerHTML = html;
      root.hidden = false;
      document.body.style.overflow = "hidden";
      var btn = root.querySelector(".pcl-lb-close");
      if (btn) btn.focus();
    }
    function close() {
      root.hidden = true;
      document.body.style.overflow = "";
    }
    root.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-act='close']")) close();
    });
    document.addEventListener("keydown", function (ev) {
      if (!root.hidden && ev.key === "Escape") close();
    });
    return { open: open, close: close };
  })();

  function weekCardHtml(w, live) {
    var c = CHALLENGES[w - 1];
    var win = weekWindow(w);
    var tag = live ? '<span class="pcl-wk-tag">LIVE</span>'
                   : (w < currentWeek() ? '<span class="pcl-wk-tag pcl-wk-tag--past">CLOSED</span>' : "");
    return '<div class="pcl-wkcard' + (live ? " is-live" : "") + '">' +
      '<div class="pcl-wk-head">' +
        '<span class="pcl-wk-name">WEEK ' + w + " · " + esc(c.name) + "</span>" + tag +
        '<span class="pcl-wk-date">' + fmtDayShort(win.a) + " → " + fmtDayShort(win.b) + "</span>" +
      "</div>" +
      '<p class="pcl-wk-crit">' + esc(c.crit) + "</p>" +
      '<p class="pcl-wk-pts">Weekly Reward + ' + c.pts.toLocaleString("en-IN") +
        " LeaderBoard Points</p>" +
      "</div>";
  }

  function openWeekInfo() {
    var cur = currentWeek();
    var html = '<h3 class="pcl-modal-title">WEEKLY CHALLENGES</h3>' +
      '<p class="pcl-modal-sub">Season 2 · 10 weeks · a new challenge every Monday</p>' +
      '<p class="pcl-rb-p">Only the week that is live right now can be entered — ' +
      "this form accepts <b>Week " + cur + "</b> until " +
      fmtDayShort(weekWindow(cur).b) + ". Upcoming challenges are listed below so " +
      "you can plan and shoot ahead.</p>";
    for (var w = 1; w <= WEEK_TOTAL; w++) html += weekCardHtml(w, w === cur);
    html += '<p class="pcl-rb-note">Analytics are tracked Monday → Saturday. Submit ' +
      "each week's post analytics by <b>11:00 AM the following Monday</b> to be " +
      "considered. The winning post gets featured as a collab on Praper Media's " +
      "official pages.</p>";
    Modal.open(html);
  }

  /* ---------- RULEBOOK (official Season 2 rulebook, themed) ---------- */
  function openRulebook() {
    var rows = CHALLENGES.map(function (c, i) {
      return "<tr><td><b>W" + (i + 1) + "</b></td><td><b>" + esc(c.name) +
        "</b></td><td>" + esc(c.crit) + '</td><td class="num">+' +
        c.pts.toLocaleString("en-IN") + "</td></tr>";
    }).join("");
    Modal.open(
      '<h3 class="pcl-modal-title">OFFICIAL RULEBOOK</h3>' +
      '<p class="pcl-modal-sub">Praper Content League · Season 2</p>' +

      '<span class="pcl-rb-h">1 · Purpose of the Contest</span>' +
      '<p class="pcl-rb-p">Take your creativity beyond the workplace and into the ' +
      "spotlight. The <b>Praper Content League</b> is your opportunity to express " +
      "yourself, build your personal brand, and showcase the people, stories and " +
      "experiences that make Praper Media special. Over the next <b>10 weeks</b>, " +
      "challenge yourself, experiment with content, take on weekly challenges, and " +
      "climb the leaderboard with every post.</p>" +

      '<span class="pcl-rb-h">2 · Contest Duration</span>' +
      '<table class="pcl-rb-table"><tbody>' +
      "<tr><td><b>Start Date</b></td><td>19 October 2026 (Monday)</td></tr>" +
      "<tr><td><b>End Date</b></td><td>28 December 2026 (Monday)</td></tr>" +
      "<tr><td><b>Total Duration</b></td><td>10 Weeks</td></tr>" +
      "<tr><td><b>Eligible Platforms</b></td><td>LinkedIn, Instagram and YouTube</td></tr>" +
      "</tbody></table>" +

      '<span class="pcl-rb-h">3 · Grand Prizes</span>' +
      '<table class="pcl-rb-table"><tbody>' +
      "<tr><td><b>1st Place</b></td><td>Rs. 40,000</td></tr>" +
      "<tr><td><b>2nd Place</b></td><td>Rs. 25,000</td></tr>" +
      "<tr><td><b>3rd Place</b></td><td>Rs. 15,000</td></tr>" +
      "</tbody></table>" +

      '<span class="pcl-rb-h">4 · Platform-Wise Leaderboard Points</span>' +
      '<p class="pcl-rb-p">For every eligible post, total views or impressions are ' +
      "multiplied by the platform multiplier to calculate leaderboard points:</p>" +
      '<table class="pcl-rb-table"><thead><tr><th>Platform</th><th>Views / Impressions</th>' +
      '<th>Leaderboard Points</th></tr></thead><tbody>' +
      "<tr><td>YouTube (Long-form)</td><td>1 view</td><td>2 points</td></tr>" +
      "<tr><td>YouTube Shorts</td><td>1 view</td><td>1.25 points</td></tr>" +
      "<tr><td>Instagram Reels</td><td>1 view</td><td>1.25 points</td></tr>" +
      "<tr><td>Instagram Posts / Carousels</td><td>1 impression</td><td>1 point</td></tr>" +
      "<tr><td>LinkedIn Posts</td><td>1 impression</td><td>1 point</td></tr>" +
      "</tbody></table>" +
      '<p class="pcl-rb-formula">Leaderboard Points = Total Views / Impressions × Platform Multiplier</p>' +
      '<p class="pcl-rb-note">Any fractional points are rounded UP to the next whole ' +
      "number. All eligible points across the competition decide the final rankings " +
      "and Grand Prize winners.</p>" +

      '<span class="pcl-rb-h">5 · Weekly Challenges</span>' +
      '<table class="pcl-rb-table"><thead><tr><th>Wk</th><th>Challenge</th>' +
      "<th>Criteria</th><th>Reward</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      '<p class="pcl-rb-note">Impressions and analytics are tracked Monday → Saturday ' +
      "each week. Submit post analytics by <b>11:00 AM the following Monday</b>. The " +
      "winning post of each weekly challenge is featured as a collaborative post with " +
      "Praper Media's official pages.</p>" +

      '<span class="pcl-rb-h">6 · Mandatory Posting — the 50:50 Balance Rule</span>' +
      '<p class="pcl-rb-p">All participants are now required to post on ' +
      "<b>at least 2 social media platforms</b> and maintain a <b>50:50 content " +
      "balance on each platform individually</b> — 50% Praper/PAVE-related " +
      "content and 50% personal content.</p>" +
      '<p class="pcl-rb-p">For example:</p>' +
      '<ul class="pcl-rb-ul">' +
      "<li><b>Instagram:</b> 10 posts = 5 Praper/PAVE + 5 Personal</li>" +
      "<li><b>LinkedIn:</b> 10 posts = 5 Praper/PAVE + 5 Personal</li>" +
      "</ul>" +
      '<p class="pcl-rb-p"><b>You cannot post only Praper-related content on ' +
      "LinkedIn and only personal content on Instagram.</b> The 50:50 balance " +
      "must be maintained <b>separately on each platform</b>. Tag every post " +
      "PRAPER or PERSONAL when you submit it — the Control Room checks the " +
      "balance per platform and unbalanced profiles are flagged before " +
      "points are confirmed.</p>" +
      '<p class="pcl-rb-p"><b>Minimum posting requirement:</b> publish at least <b>20 ' +
      "eligible posts</b> across all platforms during the 10 weeks to qualify for the " +
      "Grand Prizes. Identical content on multiple platforms counts once.</p>" +

      '<span class="pcl-rb-h">7 · Participation Rules</span>' +
      '<ul class="pcl-rb-ul">' +
      "<li>Participate via LinkedIn, Instagram or YouTube — posts, carousels, Reels, Shorts or Long-Form.</li>" +
      "<li>Collab posts: tag the post as a collab and name your partner. When " +
      "both of you submit the same link and the backend confirms the pair, the " +
      "post\u2019s points are <b>split 50:50</b> between the collaborators.</li>" +
      "<li><b>No paid promotions or boosting</b> — only organic reach counts. Manipulated metrics are not permitted.</li>" +
      "<li><b>One Post, One Platform:</b> identical content on multiple platforms counts only on the platform with the highest impressions.</li>" +
      "<li>Every eligible entry must meaningfully mention or feature Praper Media; tag the official account wherever allowed.</li>" +
      "<li>Content must be original, respectful and public-safe — never disclose confidential client, employee or company information.</li>" +
      "<li>Entries must be published within the contest dates and stay accessible for verification.</li>" +
      "<li>Submit the public post link and a screenshot/export of platform analytics by the announced deadlines.</li>" +
      "<li>Ties are settled by a pre-announced tie-break rule before final results.</li>" +
      "</ul>" +

      '<span class="pcl-rb-h">8 · Who Can Participate</span>' +
      '<p class="pcl-rb-p">Open to employees across all departments of Praper Media — ' +
      "Administration, Content, HR, IT, Long-Form Video, QC &amp; YT Management, Shorts, " +
      "Graphics, and PAVE Tutors &amp; Content. CBO and COO are welcome to participate " +
      "and earn leaderboard points, but are <b>not eligible for weekly rewards or Grand " +
      "Prizes</b>. Employees serving their notice period may participate under the same " +
      "reward restriction.</p>" +

      '<span class="pcl-rb-h">9 · Participation Guidelines</span>' +
      '<ul class="pcl-rb-ul">' +
      "<li><b>Profile submission:</b> submit your Instagram, LinkedIn and/or YouTube profile links at the start of the contest for tracking.</li>" +
      "<li><b>Platform flexibility:</b> participate on any combination of the three platforms.</li>" +
      "</ul>" +
      '<p class="pcl-rb-formula">Let your creativity take the spotlight — make every post count and climb your way to the top of the leaderboard.</p>'
    );
  }

  /* ============================================================================
     PLAYER PHOTO + DESIGNATION — identity-gated. The backend stores one
     photo ("<name>__<manager>") + one designation per player; typing a name
     that is already on file pulls both back up (JSONP) so nobody uploads
     twice. THE SHARED-BROWSER RULE: the photo belongs to the identity it
     was uploaded/matched under — the moment the name or manager no longer
     matches (a second player clearing the fields on a borrowed machine),
     the photo FADES out instead of posing as theirs. It fades straight back
     in when the identity matches again, so entrants with no reporting
     manager are never penalised: only the NAME has to come back.
     ========================================================================== */
  var photoState = { file: null, existing: null,
                     fileOwner: "", matchedName: "", verified: false };
  var photoShown = false;              // visual gate — identity-checked
  var desigOwner = "";                 // normId(name) the designation belongs to
  var desigLocked = false;             // true = auto-filled from the ledger
  var photoBtn = $("photoBtn");
  var photoInput = $("photoInput");
  var photoThumb = $("photoThumb");
  var photoThumbImg = $("photoThumbImg");
  var photoStateEl = $("photoState");
  var photoFolderIcon = $("photoFolderIcon");
  var photoAlt = $("photoAlt");
  var PHOTO_ALT_REUSE = "Photo on file — reused for this entry.";
  /* the badge slot carries the seal markup once; renderPhoto only toggles it */
  var badgeSlot = $("photoVerifyBadge");
  if (badgeSlot && !badgeSlot.innerHTML) badgeSlot.innerHTML = TICK_SVG;

  function normId(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function setPhotoAlt(text) {
    photoAlt.textContent = text || "";
    photoAlt.hidden = !text;
  }

  function renderPhoto() {
    var src = photoShown && photoState.file ? photoState.file.content
              : (photoShown && photoState.existing ? photoState.existing.thumb : "");
    photoThumb.hidden = !src;
    if (src) {
      photoThumbImg.src = src;
      var who = fullName.value.trim();
      photoThumbImg.alt = who ? "Profile photo of " + who : "Profile photo";
    }
    photoFolderIcon.hidden = !!src;
    photoBtn.classList.toggle("is-set", !!src);
    /* the corner magnifier only exists while there is something to zoom */
    var px = $("photoExpand");
    if (px) px.hidden = !src;
    var badge = $("photoVerifyBadge");
    if (badge) badge.hidden = !(photoShown && photoState.verified);
    if (!src) {
      photoStateEl.hidden = true;
      photoStateEl.textContent = "";
      setPhotoAlt("");
    } else if (photoState.file) {
      photoStateEl.hidden = false;
      photoStateEl.textContent = "READY ✓";
      setPhotoAlt("");
    } else {
      photoStateEl.hidden = false;
      photoStateEl.textContent = "ON FILE ✓";
      setPhotoAlt(PHOTO_ALT_REUSE);
    }
    noteDraft();
  }

  /* the identity test: a photo on state is only WANTED while the typed name
     still matches who it belongs to (manager empty = faded too — clearing
     the manager is one of the fade events, and it returns on its own) */
  function photoWanted() {
    var n = normId(fullName.value);
    if (!n) return false;
    if (photoState.file) return photoState.fileOwner === n;
    if (photoState.existing) return photoState.matchedName === n;
    return false;
  }
  var fadeTimer = null;
  function refreshPhoto() {
    var want = photoWanted() && manager.value.trim() !== "";
    if (want === photoShown) return;
    clearTimeout(fadeTimer);
    if (want) {
      photoShown = true;
      photoBtn.classList.remove("is-fading");
      renderPhoto();
    } else {
      photoBtn.classList.add("is-fading");
      fadeTimer = setTimeout(function () {
        photoShown = false;
        photoBtn.classList.remove("is-fading");
        renderPhoto();
      }, 260);
    }
  }

  /* the designation rides the same identity: when the name settles on a
     DIFFERENT player, the field fades and releases what the previous
     player left (auto-filled or not) — no borrowed designations */
  var desigSettle = null;
  function desigIdentityCheck() {
    var n = normId(fullName.value);
    if (n === desigOwner) { clearTimeout(desigSettle); return; }
    clearTimeout(desigSettle);
    desigSettle = setTimeout(function () {
      if (normId(fullName.value) === desigOwner) return;   // settled back
      desig.classList.add("is-fading");
      setTimeout(function () {
        desig.classList.remove("is-fading");
        desig.value = "";
        desigOwner = normId(fullName.value);
        desigLocked = false;
        updateDesigCapsule();
      }, 240);
    }, 900);
  }

  photoBtn.addEventListener("click", function () { photoInput.click(); });
  /* pfp expand — the tile itself stays upload/replace; this corner chip zooms */
  var photoExpandBtn = $("photoExpand");
  if (photoExpandBtn) {
    photoExpandBtn.addEventListener("click", function () {
      var src = photoState.file ? photoState.file.content
                : (photoState.existing ? photoState.existing.thumb : "");
      if (src) Lightbox.openSingle(src, photoThumbImg.alt || "Player photo");
    });
  }
  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    photoInput.value = "";             // allow re-picking the same file
    if (!file) return;
    if (ACCEPTED.length && file.type && ACCEPTED.indexOf(file.type) === -1) {
      setFieldErr("playerPhoto", "PNG / JPG / WEBP only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFieldErr("playerPhoto", "Over " + MAX_MB + " MB");
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      // straight into the cropper — the user frames the shot, we export a
      // small square JPEG (512px, q0.85) so the submit payload stays light
      Crop.open(String(fr.result), file.name);
    };
    fr.onerror = function () { setFieldErr("playerPhoto", "Could not read file"); };
    fr.readAsDataURL(file);
  });

  /* ============================================================================
     PHOTO CROPPER — square viewport, drag to pan, slider / buttons / wheel /
     pinch to zoom, exports a 512×512 JPEG (~100 KB, not multi-MB originals —
     this is what keeps submissions from timing out on the wire).
     ============================================================================ */
  var Crop = (function () {
    var root = $("pclCrop");
    var stage = $("cropStage");
    var canvas = $("cropCanvas");
    var slider = $("cropZoom");
    var ctx = canvas.getContext("2d");
    var C = canvas.width;               // 640 internal, CSS-scaled square
    var img = null;
    var zoom = 1;                       // 1 = cover-fit, slider 100..400 → ÷100
    var ox = 0, oy = 0;                 // pan offset (css px at internal scale)
    var dragging = false, lx = 0, ly = 0;
    var points = new Map();             // pointerId → {x,y} for pinch
    var pinchDist = 0;
    var fileBase = "photo";
    var lastFocus = null;

    function coverScale() {
      return Math.max(C / img.naturalWidth, C / img.naturalHeight);
    }
    function drawSize() {
      var s = coverScale() * zoom;
      return { w: img.naturalWidth * s, h: img.naturalHeight * s };
    }
    function clampPan() {
      var d = drawSize();
      var mx = Math.max(0, (d.w - C) / 2);
      var my = Math.max(0, (d.h - C) / 2);
      ox = Math.max(-mx, Math.min(mx, ox));
      oy = Math.max(-my, Math.min(my, oy));
    }
    function draw() {
      if (!img) return;
      clampPan();
      var d = drawSize();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, C, C);
      ctx.drawImage(img, (C - d.w) / 2 + ox, (C - d.h) / 2 + oy, d.w, d.h);
    }
    function setZoom(z) {
      zoom = Math.max(1, Math.min(4, z));
      slider.value = String(Math.round(zoom * 100));
      draw();
    }
    function open(dataUrl, fileName) {
      fileBase = String(fileName || "photo").replace(/\.[^.]+$/, "") || "photo";
      var im = new Image();
      im.onload = function () {
        img = im;
        zoom = 1; ox = 0; oy = 0;
        slider.value = "100";
        draw();
        lastFocus = document.activeElement;
        root.hidden = false;
        document.body.style.overflow = "hidden";
      };
      im.onerror = function () { setFieldErr("playerPhoto", "Could not read image"); };
      im.src = dataUrl;
    }
    function close() {
      root.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function apply() {
      if (!img) return;
      var d = drawSize();
      var k = 512 / C;                  // export canvas = 512px square
      var out = document.createElement("canvas");
      out.width = 512; out.height = 512;
      var octx = out.getContext("2d");
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, 512, 512);
      octx.drawImage(img, ((C - d.w) / 2 + ox) * k, ((C - d.h) / 2 + oy) * k,
                     d.w * k, d.h * k);
      photoState.file = {
        name: fileBase.slice(0, 40) + "-square.jpg",
        type: "image/jpeg",
        content: out.toDataURL("image/jpeg", 0.85)
      };
      photoState.fileOwner = normId(fullName.value);
      clearFieldErr("playerPhoto");
      close();
      refreshPhoto();
      noteDraft();
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-act]");
      if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "cancel") close();
      else if (act === "apply") apply();
      else if (act === "zoomin") setZoom(zoom + 0.25);
      else if (act === "zoomout") setZoom(zoom - 0.25);
    });
    slider.addEventListener("input", function () {
      setZoom(Number(slider.value) / 100);
    });
    stage.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      setZoom(zoom * (ev.deltaY < 0 ? 1.08 : 0.93));
    }, { passive: false });
    stage.addEventListener("pointerdown", function (ev) {
      points.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (points.size === 1) {
        dragging = true; lx = ev.clientX; ly = ev.clientY;
        stage.classList.add("is-dragging");
      } else if (points.size === 2) {
        dragging = false;
        var ps = Array.from(points.values());
        pinchDist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      }
      if (stage.setPointerCapture) { try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ } }
    });
    stage.addEventListener("pointermove", function (ev) {
      if (!points.has(ev.pointerId)) return;
      points.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (points.size === 2) {
        var ps = Array.from(points.values());
        var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (pinchDist > 0) setZoom(zoom * (d / pinchDist));
        pinchDist = d;
        return;
      }
      if (!dragging) return;
      var scale = C / stage.getBoundingClientRect().width;
      ox += (ev.clientX - lx) * scale;
      oy += (ev.clientY - ly) * scale;
      lx = ev.clientX; ly = ev.clientY;
      draw();
    });
    function release(ev) {
      points.delete(ev.pointerId);
      if (points.size < 2) pinchDist = 0;
      if (points.size === 0) {
        dragging = false;
        stage.classList.remove("is-dragging");
      }
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    document.addEventListener("keydown", function (ev) {
      if (!root.hidden && ev.key === "Escape") close();
    });

    return { open: open, close: close };
  })();

  /* name typed → fade whatever no longer matches + look up the identity
     (debounced; needs a backend). Manager edits fade/clear the photo too. */
  var nameTimer = null;
  fullName.addEventListener("input", function () {
    refreshPhoto();
    desigIdentityCheck();
    clearTimeout(nameTimer);
    nameTimer = setTimeout(function () {
      rosterDesigFill();
      lookupPhoto();
    }, 600);
  });
  manager.addEventListener("input", refreshPhoto);
  desig.addEventListener("input", function () {
    desigLocked = false;
    desigOwner = normId(fullName.value);
    updateDesigCapsule();
  });
  function lookupPhoto() {
    var name = fullName.value.trim();
    if (name.length < 2 || !cfg.gasWebAppUrl) return;
    jsonpGet({ action: "playerPhoto", name: name })
      .then(function (out) {
        if (!out || out.ok !== true) return;
        if (normId(fullName.value) !== normId(name)) return;   // stale answer
        if (out.url) {
          photoState.existing = { url: out.url, thumb: out.thumb || out.url };
          photoState.matchedName = normId(name);
        }
        photoState.verified = !!out.verified;
        if (out.designation && (!desig.value.trim() || desigLocked)) {
          desig.value = out.designation;
          desigLocked = true;
          desigOwner = normId(name);
          updateDesigCapsule();
        }
        if (out.url) clearFieldErr("playerPhoto");
        refreshPhoto();
      })
      .catch(function () { /* no photo / offline — field stays as-is */ });
  }
  function jsonpGet(params) {
    return new Promise(function (resolve, reject) {
      var cb = "pclPhotoCb" + Date.now() + "_" + Math.floor(Math.random() * 1e5);
      var s = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () { finish(new Error("timeout")); }, 20000);
      function finish(err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        err ? reject(err) : resolve(data);
      }
      window[cb] = function (data) { finish(null, data); };
      s.onerror = function () { finish(new Error("network")); };
      var q = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      /* cache-buster — Google's /exec CDN caches GETs; a stale answer here
         would pose as the player's photo/designation after an update */
      s.src = cfg.gasWebAppUrl + "?" + q + "&_=" + Date.now() + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  /* ---------- modal buttons + week clock ---------- */
  $("weekInfoBtn").addEventListener("click", openWeekInfo);
  $("pclRulebookBtn").addEventListener("click", openRulebook);
  buildWeekOptions();   // only the ONGOING week is selectable

  /* ============================================================================
     DRAFT PERSISTENCE — accidental-reload insurance.
     Text fields + committed posts live in localStorage (key: pcl_draft_v1).
     MEDIA (cropped photo, per-post screenshots) lives in IndexedDB — data
     URLs are far too fat for the 5 MB localStorage budget. Everything is
     restored on load and wiped the moment a submission SUCCEEDS.
     ========================================================================== */
  var DRAFT_KEY = "pcl_draft_v1";
  var draftTimer = null;

  function idbReq(fn) {
    return new Promise(function (resolve) {
      try {
        var open = indexedDB.open("pcl-draft", 1);
        open.onupgradeneeded = function () {
          open.result.createObjectStore("kv");
        };
        open.onerror = function () { resolve(null); };
        open.onsuccess = function () {
          var db = open.result;
          try { fn(db, resolve); } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }
  function idbSet(key, val) {
    return idbReq(function (db, resolve) {
      var tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(val, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { resolve(null); };
      tx.onabort = function () { resolve(null); };
    });
  }
  function idbGet(key) {
    return idbReq(function (db, resolve) {
      var tx = db.transaction("kv", "readonly");
      var rq = tx.objectStore("kv").get(key);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { resolve(null); };
    });
  }
  function idbWipe() {
    return idbReq(function (db, resolve) {
      var tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").clear();
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { resolve(null); };
    });
  }

  function noteDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 350);
  }
  function saveDraft() {
    if (!doneScreen.hidden) return;              // submitted — nothing to keep
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        v: 1, at: Date.now(),
        fullName: fullName.value, manager: manager.value,
        desig: desig.value,
        links: linkInput.value,
        posts: posts.map(function (p) {
          return { id: p.id, url: p.url, format: p.format, mediaId: p.mediaId,
                   views: p.views, collab: p.collab, collabWith: p.collabWith,
                   ctype: p.ctype === "PERSONAL" ? "PERSONAL" : "PRAPER",
                   hasShot: !!p.shot,
                   shotMeta: p.shot ? { name: p.shot.name, type: p.shot.type } : null };
        }),
        week: week.value, challengeUrl: challengeUrl.value,
        notes: notes.value, mode: viewMode
      }));
    } catch (e) { /* storage blocked — media/text drafts unavailable */ }
    idbSet("photo", photoState.file || null);
    posts.forEach(function (p) { idbSet("shot:" + p.id, p.shot || null); });
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ok */ }
    idbWipe();
  }

  function restoreDraft() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); }
    catch (e) { return; }
    if (!raw || raw.v !== 1) return;
    var texty = [raw.fullName, raw.manager, raw.desig, raw.links, raw.week,
                 raw.challengeUrl, raw.notes].join("");
    if (!texty && !(raw.posts && raw.posts.length)) return;

    fullName.value = String(raw.fullName || "");
    manager.value = String(raw.manager || "");
    desig.value = String(raw.desig || "");
    desigOwner = normId(raw.fullName || "");
    desigLocked = !!desig.value.trim();   // draft text yields to a new identity
    updateDesigCapsule();
    linkInput.value = String(raw.links || "");
    var oldPosts = raw.posts || [];
    posts = oldPosts.map(function (p) {
      return { id: p.id, url: p.url, format: p.format, mediaId: p.mediaId,
               views: String(p.views || ""), shot: null, errViews: false,
               errShotMsg: "", collab: !!p.collab,
               collabWith: String(p.collabWith || ""), errCollab: false,
               ctype: p.ctype === "PERSONAL" ? "PERSONAL" : "PRAPER" };
    });
    if (raw.week) {   // only if that week is STILL open (options come from the clock)
      for (var i = 0; i < week.options.length; i++) {
        if (week.options[i].value === raw.week) {
          week.value = raw.week;
          fieldOf("challengeUrl").hidden = false;
          fieldOf("additionalNotes").hidden = false;
          break;
        }
      }
    }
    challengeUrl.value = String(raw.challengeUrl || "");
    notes.value = String(raw.notes || "");
    viewMode = raw.mode === "view" ? "view" : "edit";
    Array.prototype.forEach.call(viewToggle.querySelectorAll(".pcl-vbtn"),
      function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-mode") === viewMode);
      });
    renderChips();
    renderRows();
    renderDetailsHead();

    /* media comes back asynchronously from IndexedDB */
    idbGet("photo").then(function (f) {
      if (f && f.content) {
        photoState.file = f;
        photoState.fileOwner = normId(raw.fullName || "");
        refreshPhoto();
      }
    });
    oldPosts.forEach(function (p) {
      if (!p.hasShot && !p.shotMeta) return;
      idbGet("shot:" + p.id).then(function (s) {
        var pp = postById(p.id);
        if (pp && s && s.content) { pp.shot = s; renderRows(); }
      });
    });

    saveState.hidden = false;
    saveState.textContent = "DRAFT RESTORED ✓";
    setTimeout(function () {
      if (saveState.textContent === "DRAFT RESTORED ✓") {
        saveState.hidden = true;
        saveState.textContent = "";
      }
    }, 3200);
    if (fullName.value.trim().length >= 2) lookupPhoto();
    refreshPhoto();
  }
  /* every keystroke/change anywhere in the form queues a draft save */
  form.addEventListener("input", noteDraft, true);
  form.addEventListener("change", noteDraft, true);

  /* ============================================================================
     REPORTING MANAGER AUTOCOMPLETE — one letter is enough. Case doesn't lock:
     "vik", "VIK", "vikr" all surface Vikram Singh. Ranking: word-start matches
     first, then contains, then initials ("vs" → Vikram Singh). Free text stays
     allowed — the list only ASSISTS, it never locks the field.
     ========================================================================== */
  /* ============================================================================
     LEAGUE ROSTER — the early-insight designation collection (60 participants),
     used everywhere it can help:
       · typing a roster name auto-fills the Desg. field with their real title
       · the Desg. dropdown lists the league's actual titles (not guesses)
       · MANAGERS gains the real team leads / assistant team leads
       · Code.gs carries the same map as PLAYER_META so the public leaderboard
         shows designations even before a participant's first submission
     ========================================================================== */
  var ROSTER = {
    "sehaj singh": "Social Media Executive",
    "aryan": "Junior Video Editor",
    "azkiya qamar": "Content Creator Intern",
    "harshit": "Video Editor",
    "japjot singh": "Video Editor Intern",
    "dipika": "Video Editor",
    "jaskirt singh": "Assistant Team Lead",
    "robin": "Video Editor",
    "bhakti arora": "Content Creator",
    "arushi chawla": "Content Creator",
    "sayan chakraborty": "DI Colorist",
    "supriya singh": "Content Creator",
    "harjappan singh": "Jr. Motion Graphics Artist",
    "prerna jaiswani": "Jr. Account Manager",
    "sakshi lakhmani": "Long-Form Video Editor",
    "deepanshum srivastava": "Team Lead",
    "rinky chauhan": "Video Editor",
    "soyaf ikbal ghanchi": "Junior Video Editor",
    "aryan maddeshiya": "Video Editor",
    "hemant kataria": "Jr. Video Editor",
    "ashutosh gupta": "CBO",
    "archna kumari": "Senior Executive Finance & Operations",
    "mayukh bhattacharjee": "Executive Video Editor",
    "abhijeet singh": "Executive Video Editor (Long Form)",
    "krish sharma": "Video Editor Intern (Long Form)",
    "ankush sheokand": "Assistant Team Lead",
    "vishal k": "Video Editing Mentor",
    "harpreet singh": "Assistant Team Lead",
    "mitali": "HR",
    "muskan": "Executive Video Editor",
    "deepti": "Key Account Manager",
    "kanupriya srikoti": "HR Associate",
    "sejal choudhary": "HR Executive",
    "sonali dub": "Executive Graphic Designer",
    "hiten khatri": "Podcast Content Strategist",
    "ansh kumar": "Senior Executive | Motion Graphics Artist",
    "kunal verma": "Executive Video Editor",
    "harsh arora": "Videographer Intern",
    "kartik shivam": "Creative Video Editor",
    "shubham rai": "Team Lead",
    "shreeraag varier": "Video Editor",
    "rudra pratap singh": "Video Editor",
    "shreyash rawat": "Junior Video Editor",
    "nandini singh": "Junior Video Editor",
    "gaurav rana": "Junior Video Editor",
    "sumit singh": "Executive Video Editor",
    "shreyangsu jana": "Junior Motion Graphic Artist",
    "manas ranjan": "System Engineer",
    "yashwant rawat": "Executive Motion Graphic Designer",
    "dheeraj kumar": "Video Editor",
    "shubham gusain": "Video Editor",
    "isham grover": "Junior Video Editor",
    "siddharth thakur": "Junior Graphic Designer",
    "nitin sharma": "Video Editor and Sound Designer",
    "adeeba qamar": "Junior Video Editor",
    "vikram singh": "Social Media Executive",
    "rohit toor": "Executive Video Editor",
    "nikhil srivastava": "Executive Video Editor",
    "hirday sarkar": "Junior Video Editor"
  };

  /* the league's real titles, most common first — the first six are what the
     Desg. dropdown shows on an empty focus so selection works with ZERO typing */
  var DESIGNATIONS = [
    "Video Editor", "Junior Video Editor", "Executive Video Editor",
    "Content Creator", "Social Media Executive", "Motion Graphics Artist",
    "Long-Form Video Editor", "Content Creator Intern", "Video Editor Intern",
    "Assistant Team Lead", "Team Lead", "Jr. Video Editor",
    "Jr. Motion Graphics Artist", "Junior Motion Graphic Artist",
    "Executive Video Editor (Long Form)", "Video Editor Intern (Long Form)",
    "Creative Video Editor", "Executive Graphic Designer",
    "Junior Graphic Designer", "Video Editing Mentor",
    "Video Editor and Sound Designer", "DI Colorist",
    "Podcast Content Strategist", "Videographer Intern",
    "Jr. Account Manager", "Key Account Manager",
    "HR", "HR Associate", "HR Executive",
    "Senior Executive Finance & Operations",
    "Senior Executive | Motion Graphics Artist",
    "Executive Motion Graphic Designer", "System Engineer",
    "CBO", "COO"
  ];

  /* smart capsule shortener — plain initials where the title is generic,
     meaningful abbreviations where initials would be cryptic. Used for the
     capsule that sits inside the Full name field. */
  var DESIG_SHORT = {
    "video editor": "VE",
    "junior video editor": "Jr. VE",
    "jr. video editor": "Jr. VE",
    "executive video editor": "Exec. VE",
    "executive video editor (long form)": "Exec. VE (LF)",
    "long-form video editor": "LF VE",
    "video editor intern": "VE Intern",
    "video editor intern (long form)": "VE Intern (LF)",
    "video editing mentor": "VE Mentor",
    "video editor and sound designer": "VE + Sound",
    "creative video editor": "Creative VE",
    "content creator": "Creator",
    "content creator intern": "Creator Int.",
    "social media executive": "Social Media Exec.",
    "assistant team lead": "Asst. TL",
    "team lead": "TL",
    "di colorist": "DI Colorist",
    "jr. motion graphics artist": "Jr. Motion GFX",
    "junior motion graphic artist": "Jr. Motion GFX",
    "motion graphics artist": "Motion GFX",
    "senior executive | motion graphics artist": "Sr. Motion GFX",
    "executive motion graphic designer": "Exec. Motion GFX",
    "jr. account manager": "Jr. Acc. Mgr",
    "key account manager": "Key Acc. Mgr",
    "account manager": "Acc. Mgr",
    "cbo": "CBO", "coo": "COO", "hr": "HR",
    "hr associate": "HR Assoc.",
    "hr executive": "HR Exec.",
    "senior executive finance & operations": "Sr. Exec. Fin+Ops",
    "executive graphic designer": "Exec. GFX Des.",
    "junior graphic designer": "Jr. GFX Des.",
    "graphic designer": "GFX Des.",
    "podcast content strategist": "Podcast Strat.",
    "videographer intern": "Videographer Int.",
    "system engineer": "Sys. Engineer"
  };
  function shortDesig(d) {
    var key = String(d || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (DESIG_SHORT[key]) return DESIG_SHORT[key];
    var swapped = (" " + key + " ")
      .replace(/ junior /g, " Jr. ").replace(/ jr\. /g, " Jr. ")
      .replace(/ senior /g, " Sr. ")
      .replace(/ executive /g, " Exec. ")
      .replace(/ assistant /g, " Asst. ")
      .replace(/ associate /g, " Assoc. ")
      .replace(/ graphics /g, " GFX ")
      .replace(/ team lead/g, " TL").trim();
    if (swapped.length <= 16) return swapped;
    return key.split(/\s+/).map(function (w) { return w.charAt(0); })
              .join("").slice(0, 6).toUpperCase();
  }

  var MANAGERS = ["Pratham Jindal", "Divya", "Vikram Singh Mawari", "Jatin Gulati",
    "Lagan Garg", "Giriraj Godara", "Kartik Handa", "Aditya Verma",
    "Deepanshum Srivastava", "Tanishq Shukla", "Shubham Rai", "Vishal Chib",
    "Ashutosh Gupta", "Jaskirt Singh", "Ankush Sheokand", "Harpreet Singh"];

  /* ============================================================================
     AUTOCOMPLETE ENGINE — one factory, two boxes (reporting manager +
     designation). One letter is enough; case doesn't lock; word-start
     matches rank first, then contains, then initials ("vs" → Vikram Singh).
     THE TAP RULE (was a bug): clicking/tapping an option now fills the field
     IMMEDIATELY. The old flow dispatched a synthetic input event that
     re-ran update() and re-opened the list over the just-filled value — it
     looked like the tap did nothing until you clicked elsewhere. The
     suppress flag + a touchstart claim fix desktop and mobile alike.
     ============================================================================ */
  function makeAutocomplete(input, box, list, noneMsg, optsFocus) {
    if (!box || !input) return { close: function () {} };
    var openState = false;
    var sel = -1;
    var opts = [];
    var suppress = false;          // the synthetic input event must not re-open

    function score(name, q) {
      var n = name.toLowerCase();
      var i = n.indexOf(q);
      if (i >= 0) {
        if (i === 0) return 0;                       // starts with
        if (n.charAt(i - 1) === " ") return 5 + i;   // word start
        return 20 + i;                               // contains
      }
      var initials = n.split(/\s+/).map(function (w) {
        return w.charAt(0);
      }).join("");
      var j = initials.indexOf(q);
      return j >= 0 ? 60 + j : -1;                   // initials guess
    }
    function hl(name, q) {
      var i = name.toLowerCase().indexOf(q);
      if (i < 0) return esc(name);
      return esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + q.length)) +
        "</b>" + esc(name.slice(i + q.length));
    }
    function close() {
      openState = false; sel = -1; opts = [];
      box.hidden = true;
      box.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
    }
    function choose(name) {
      input.value = name;
      close();
      suppress = true;                 // fill FIRST, keep the list closed
      var f = input.closest(".pcl-field");
      if (f) f.classList.remove("is-error");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      suppress = false;
      input.focus();
    }
    function markSel() {
      Array.prototype.forEach.call(box.querySelectorAll(".pcl-ac-opt"),
        function (el, i) { el.classList.toggle("is-sel", i === sel); });
    }
    function update() {
      if (suppress) return;
      var q = input.value.trim().toLowerCase().replace(/\s+/g, " ");
      if (!q) { close(); return; }
      var matches = list.map(function (n) { return { name: n, s: score(n, q) }; })
        .filter(function (x) { return x.s >= 0; })
        .sort(function (a, b) { return a.s - b.s || a.name.length - b.name.length; })
        .slice(0, 6);
      input.setAttribute("aria-expanded", "true");
      if (!matches.length) {
        opts = [];
        box.innerHTML = '<div class="pcl-ac-none">' + esc(noneMsg) + "</div>";
        box.hidden = false;
        openState = true;
        sel = -1;
        return;
      }
      opts = matches.map(function (x) { return x.name; });
      box.innerHTML = matches.map(function (x, i) {
        return '<button type="button" class="pcl-ac-opt" role="option" id="pclAcOpt' +
          i + "-" + Math.floor(Math.random() * 1e5) + '" data-name="' + esc(x.name) +
          '">' + hl(x.name, q) + "</button>";
      }).join("") +
        '<div class="pcl-ac-none">' + esc(noneMsg) + "</div>";
      box.hidden = false;
      openState = true;
      sel = 0;          // top match pre-highlighted → Enter takes it (no typos)
      markSel();
    }

    /* the FIRST six curated titles — a fresh focus with nothing typed gets
       these so picking a designation needs zero typing */
    function openFocus() {
      if (input.value.trim()) return;
      if (!optsFocus || !optsFocus.length) return;
      opts = optsFocus.slice();
      box.innerHTML = opts.map(function (x, i) {
        return '<button type="button" class="pcl-ac-opt" role="option" data-name="' +
          esc(x) + '">' + esc(x) + "</button>";
      }).join("") +
        '<div class="pcl-ac-none">' + esc(noneMsg) + "</div>";
      box.hidden = false;
      openState = true;
      sel = 0;
      markSel();
    }

    input.addEventListener("input", update);
    input.addEventListener("focus", openFocus);
    input.addEventListener("keydown", function (ev) {
      if (!openState) return;
      if (ev.key === "ArrowDown" && opts.length) {
        ev.preventDefault();
        sel = Math.min(sel + 1, opts.length - 1);
        markSel();
      } else if (ev.key === "ArrowUp" && opts.length) {
        ev.preventDefault();
        sel = Math.max(sel - 1, 0);
        markSel();
      } else if (ev.key === "Enter") {
        ev.preventDefault();              // picker open → Enter never submits
        if (opts.length) choose(opts[Math.max(0, sel)]);
        else close();
      } else if (ev.key === "Escape") {
        close();
      }
    });
    function pickFromEvent(ev) {
      var b = ev.target.closest(".pcl-ac-opt");
      if (!b) return false;
      ev.preventDefault();                // claim the press BEFORE the blur
      choose(b.getAttribute("data-name"));
      return true;
    }
    box.addEventListener("mousedown", pickFromEvent);
    box.addEventListener("touchstart", pickFromEvent, { passive: false });
    input.addEventListener("blur", function () { setTimeout(close, 140); });
    return { close: close };
  }

  var ManagerAc = makeAutocomplete(manager, $("managerAc"), MANAGERS,
    "No match — keep the name as typed.");
  var DesigAc = makeAutocomplete(desig, $("desigAc"), DESIGNATIONS,
    "Free text is fine — keep it as typed.", DESIGNATIONS.slice(0, 6));

  /* ---------- Desg. capsule inside the Full name field -------------------
     The chosen designation renders as a small capsule BEFORE the name,
     smart-shortened (Jr. VE, Exec. GFX…) so the field still reads as a
     name field. Hover/click title carries the full title. */
  var nameWrap = $("nameWrap");
  var desigCapsule = $("desigCapsule");
  function updateDesigCapsule() {
    if (!desigCapsule) return;
    var d = desig.value.trim();
    if (!d) {
      desigCapsule.hidden = true;
      desigCapsule.textContent = "";
      if (nameWrap) nameWrap.classList.remove("has-capsule");
      return;
    }
    desigCapsule.textContent = shortDesig(d);
    desigCapsule.title = d;                     // full title on hover
    desigCapsule.hidden = false;
    if (nameWrap) nameWrap.classList.add("has-capsule");
  }

  /* roster names auto-fill the Desg. field with the participant's real
     title — one less box to worry about, and the data stays canonical */
  function rosterDesigFill() {
    var n = normId(fullName.value);
    if (!n) return;
    var t = ROSTER[n];
    if (!t) return;
    if (desig.value.trim()) return;               // a typed title always wins
    if (desigOwner === n && desigLocked) return;  // already filled for them
    desig.value = t;
    desigOwner = n;
    desigLocked = true;
    updateDesigCapsule();
  }

  /* ============================================================================
     VALIDATION — red well + "Required" below; navy restores on input.
     ========================================================================== */
  function setFieldErr(name, msg) {
    var f = fieldOf(name);
    if (!f) return;
    f.classList.add("is-error");
    var e = f.querySelector(".pcl-err");
    if (e) {
      if (!f.__defaultErr) f.__defaultErr = e.textContent;
      e.textContent = msg || f.__defaultErr || "Required";
    }
  }
  function clearFieldErr(name) {
    var f = fieldOf(name);
    if (!f) return;
    f.classList.remove("is-error");
    var e = f.querySelector(".pcl-err");
    if (e && f.__defaultErr) e.textContent = f.__defaultErr;
  }

  [fullName, manager, desig, challengeUrl].forEach(function (inp) {
    inp.addEventListener("input", function () {
      var f = inp.closest(".pcl-field");
      if (f) f.classList.remove("is-error");
    });
  });
  week.addEventListener("change", function () {
    clearFieldErr("challengeWeek");
    var entering = week.value !== "";
    fieldOf("challengeUrl").hidden = !entering;
    fieldOf("additionalNotes").hidden = !entering;
  });

  function looseUrlOk(v) {
    return /^https?:\/\//i.test(v) || (/^[\w-]+(\.[\w-]+)+/.test(v) && !/\s/.test(v));
  }

  function validate() {
    var first = null;          // element to scroll to (field el or post row el)
    var firstPostId = null;    // resolved after rows render
    function bad(name, msg) {
      setFieldErr(name, msg);
      if (!first) first = fieldOf(name);
    }

    if (!fullName.value.trim()) bad("fullName");
    if (!manager.value.trim()) bad("reportingManager");
    if (!desig.value.trim()) bad("playerDesig");
    if (!photoShown && !photoState.file) {
      bad("playerPhoto", "Upload your photo.");
    }
    if (!posts.length) bad("postLinks", "Paste at least one post link.");

    posts.forEach(function (p) {
      var viewsNum = Number(String(p.views).replace(/[^\d]/g, ""));
      p.errViews = !(viewsNum > 0);
      if (!p.shot && !p.errShotMsg) p.errShotMsg = "Required";
      p.errCollab = !!p.collab && !p.collabWith.trim();
      if (!firstPostId && (p.errViews || p.errShotMsg || p.errCollab)) {
        firstPostId = p.id;
      }
    });

    if (challengeUrl.value.trim() && !week.value) bad("challengeWeek");
    if (week.value && challengeUrl.value.trim() &&
        !looseUrlOk(challengeUrl.value.trim())) {
      bad("challengeUrl", "Enter a valid link.");
    }

    /* if anything post-level failed, make sure the editable view is on
       screen before marking rows (setMode/renderRows re-render) */
    var postBad = posts.some(function (p) {
      return p.errViews || p.errShotMsg || p.errCollab;
    });
    if (postBad && viewMode !== "edit") setMode("edit");
    else renderRows();

    if (!first && firstPostId) {
      first = postRows.querySelector('.pcl-post[data-id="' + firstPostId + '"]');
    }
    return first;
  }

  /* ============================================================================
     SUBMIT — payload identical in shape to the previous engine so the GAS
     ledger keeps working: data.postDetails[] with link/format/
     viewsImpressions/analyticsScreenshot, plus player + weekly fields.
     ========================================================================== */
  function buildPayload() {
    var data = {
      fullName: fullName.value.trim(),
      reportingManager: manager.value.trim(),
      playerDesignation: desig.value.trim(),
      playerPhoto: photoState.file
        ? [{ name: photoState.file.name, type: photoState.file.type,
            content: photoState.file.content }]
        : [],
      playerPhotoReused: !photoState.file && photoShown && !!photoState.existing,
      postDetails: posts.map(function (p) {
        var n = Number(String(p.views).replace(/[^\d]/g, ""));
        return {
          link: p.url,
          format: p.format,
          viewsImpressions: n > 0 ? n : "",
          analyticsScreenshot: p.shot
            ? [{ name: p.shot.name, type: p.shot.type, content: p.shot.content }]
            : [],
          collabWith: p.collab ? p.collabWith.trim() : "",
          contentType: p.ctype === "PERSONAL" ? "PERSONAL" : "PRAPER"
        };
      }),
      challengeWeek: week.value,
      challengeUrl: week.value ? challengeUrl.value.trim() : "",
      additionalNotes: week.value ? notes.value.trim() : ""
    };
    return {
      submissionId: "pcl-" + Date.now().toString(36) +
        "-" + Math.random().toString(36).slice(2, 8),
      submittedAt: new Date().toISOString(),
      data: data
    };
  }

  /* POST JSON with a timeout; the response body is parsed EVEN on HTTP 4xx/5xx
     so backend rejection reasons reach the player instead of a generic error.
     simple: true → no Content-Type header (GAS /exec is CORS-readable only
     for simple requests — the classic Apps Script workaround). */
  function postJson(url, payload, opts) {
    var o = opts || {};
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, o.timeoutMs || 30000);
    var init = { method: "POST", body: JSON.stringify(payload) };
    if (!o.simple && init.headers === undefined) init.headers = {};
    if (!o.simple) init.headers["Content-Type"] = "application/json";
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (txt) {
        var out = null;
        try { out = txt ? JSON.parse(txt) : null; } catch (e) { /* non-JSON */ }
        if (out && out.ok === false) {
          var err = new Error(String(out.error || "The server rejected this entry."));
          err.server = true;
          throw err;
        }
        return out || { ok: true };
      });
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function sendPayload(payload) {
    submitBtn.disabled = true;
    saveState.hidden = false;
    saveState.classList.remove("is-fail");
    saveState.textContent = "SAVING…";

    /* transport chain:
       1. /api/submit (Vercel) when configured — same-origin, URL stays secret.
          12s timeout: a healthy GAS round-trip (photo + screenshots included)
          lands well inside it; a hanging route falls through fast.
       2. direct simple POST to the GAS /exec URL — survives a missing env
          var, a sleeping function or a deploy hiccup, so a healthy Wi-Fi
          connection never shows a phantom "check connection"
       A server REJECTION (duplicate link, unconfirmed collab…) stops the
       chain and shows its real message; only true network failures fall
       through to the next transport. The backend keys on submissionId, so
       a retry after a lost response can never append the entry twice. */
    var chain;
    if (cfg.submitViaApi) {
      chain = postJson("/api/submit", payload, { timeoutMs: 12000 })
        .catch(function (err) {
          if (err && err.server) throw err;         // real reason — show it
          if (!cfg.gasWebAppUrl) throw err;         // nothing to fall back to
          return postJson(cfg.gasWebAppUrl, payload,
                          { simple: true, timeoutMs: 30000 });
        });
    } else if (cfg.gasWebAppUrl) {
      chain = postJson(cfg.gasWebAppUrl, payload,
                       { simple: true, timeoutMs: 30000 });
    } else {
      chain = new Promise(function (resolve) {
        setTimeout(function () {
          try {
            var hist = JSON.parse(localStorage.getItem("pcl_submissions") || "[]");
            hist.push(payload);
            localStorage.setItem("pcl_submissions", JSON.stringify(hist));
          } catch (e) { /* storage full/blocked — console log is enough */ }
          console.log("[PCL local mode] submission payload:", payload);
          resolve();
        }, 400);
      });
    }

    chain.then(function () {
      clearDraft();                       // a SAVED entry — no draft to keep
      form.hidden = true;
      doneScreen.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (err) {
      console.error("[PCL] submission failed:", err);
      saveState.classList.add("is-fail");
      saveState.textContent = (err && err.server)
        ? "⚠ " + String(err.message).slice(0, 120)
        : "SAVE FAILED — CHECK CONNECTION";
    }).finally(function () {
      submitBtn.disabled = false;
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (linkInput.value.trim()) commitLinks();   // never lose typed links
    ["fullName", "reportingManager", "playerDesig", "playerPhoto", "postLinks",
     "challengeWeek", "challengeUrl"].forEach(clearFieldErr);
    posts.forEach(function (p) {
      p.errViews = false; p.errShotMsg = ""; p.errCollab = false;
    });

    var firstBad = validate();
    if (firstBad) {
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      var inp = firstBad.querySelector ? firstBad.querySelector("input, select") : null;
      if (inp) inp.focus({ preventScroll: true });
      return;
    }
    sendPayload(buildPayload());
  });

  /* ---------- boot: bring back any surviving draft ---------- */
  restoreDraft();
  lastInputSnap = snapLinks();

  /* ---------- debug / automation handle ---------- */
  window.PCL = {
    get posts() { return posts; },
    get chipErrors() { return chipErrors; },
    get photoState() { return photoState; },
    classifyUrl: classifyUrl,
    commitLinks: commitLinks,
    currentWeek: currentWeek,
    CHALLENGES: CHALLENGES,
    postHash: postHash,
    Crop: Crop,
    undoLinks: undoLinks,
    redoLinks: redoLinks,
    MANAGERS: MANAGERS,
    DESIGNATIONS: DESIGNATIONS,
    saveDraft: saveDraft,
    restoreDraft: restoreDraft,
    clearDraft: clearDraft
  };
})();
