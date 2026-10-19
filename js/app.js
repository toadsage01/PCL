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
      String(document.documentElement.getAttribute("data-pcl-font") === "vt"));
    fontBtn.setAttribute("title", "Toggle pixel font (VT323)");
    fontBtn.setAttribute("aria-label", "Toggle pixel font (VT323)");
    fontBtn.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-pcl-font") === "vt"
          ? "sf" : "vt";
      document.documentElement.setAttribute("data-pcl-font", next);
      fontBtn.setAttribute("aria-pressed", String(next === "vt"));
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

  function classifyUrl(raw) {
    var tok = String(raw || "").trim().replace(/[)\]}>,.;]+$/, "");
    if (!tok) return null;
    if (!/^https?:\/\//i.test(tok)) {
      if (/^(www\.|[\w-]+\.[a-z]{2,})/i.test(tok)) tok = "https://" + tok;
      else if (/\./.test(tok) || /\//.test(tok)) {
        return { ok: false, reason: "Not a link — paste the full post URL." };
      } else return null; // stray word from a sentence — ignore silently
    }
    var u;
    try { u = new URL(tok); } catch (e) {
      return { ok: false, reason: "Not a link — paste the full post URL." };
    }
    if (!/\./.test(u.hostname)) {
      return { ok: false, reason: "Not a link — paste the full post URL." };
    }
    var host = u.hostname.replace(/^www\./i, "").toLowerCase();
    var path = u.pathname || "";

    if (/(^|\.)instagram\.com$/.test(host) || host === "instagr.am") {
      var im = path.match(/\/(reel|reels|tv|p)\/([A-Za-z0-9_-]+)/i);
      if (!im) {
        return { ok: false,
          reason: "Instagram — only Reel or Post links count in the league." };
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
      return { ok: false,
        reason: "YouTube — only video or Shorts links count in the league." };
    }

    if (/(^|\.)linkedin\.com$/.test(host) || host === "lnkd.in") {
      var pm = path.match(/\/(?:posts|feed\/update|pulse)\/([^\/?#]+)/i) ||
               path.match(/activity[-:]?(\d{10,})/i);
      if (!pm && host !== "lnkd.in") {
        return { ok: false,
          reason: "LinkedIn — only post links count in the league." };
      }
      if (!pm) pm = path.match(/^\/([A-Za-z0-9_-]+)/);   // lnkd.in/<token>
      if (!pm) {
        return { ok: false,
          reason: "LinkedIn — that lnkd.in link looks truncated." };
      }
      var am = tok.match(/activity[-:](\d{10,})/i);
      return { ok: true, url: tok, format: "li_post",
               mediaId: "li_" + (am ? am[1] : pm[1]) };
    }

    return { ok: false,
      reason: "Unsupported platform — Instagram, YouTube or LinkedIn only." };
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
    return '<span class="pcl-chip is-error" data-kind="err" data-reason="' +
      esc(e.reason) + '" title="' + esc(e.reason) + '">' +
      '<span class="pcl-chip-label">' + esc(shortToken(e.token)) + '</span>' +
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

  function renderDetailsHead() {
    postCount.textContent = posts.length + (posts.length === 1 ? " POST" : " POSTS");
    postCount.hidden = posts.length === 0;
    viewToggle.hidden = posts.length === 0;
    postEmpty.hidden = posts.length !== 0;
  }

  function commitLinks() {
    var raw = linkInput.value;
    chipErrors = [];
    var inBatch = {};
    var added = 0;
    String(raw || "").split(/[\s,;]+/).forEach(function (tok) {
      var c = classifyUrl(tok);
      if (!c) return;
      if (!c.ok) { chipErrors.push({ token: tok, reason: c.reason }); return; }
      if (inBatch[c.mediaId]) return;                 // same post twice in one paste
      if (posts.some(function (p) { return p.id === c.mediaId; })) {
        chipErrors.push({ token: tok, reason: "Already added — remove it first." });
        return;
      }
      inBatch[c.mediaId] = true;
      posts.push({
        id: c.mediaId, url: c.url, format: c.format, mediaId: c.mediaId,
        views: "", shot: null, errViews: false, errShotMsg: "",
        collab: false, collabWith: "", errCollab: false
      });
      added++;
    });
    linkInput.value = "";
    renderChips();
    renderRows();
    renderDetailsHead();
    if (added > 0 || chipErrors.length > 0) clearFieldErr("postLinks");
  }

  chipList.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var i = Number(btn.getAttribute("data-i"));
    if (act === "del") posts.splice(i, 1);
    else if (act === "delerr") chipErrors.splice(i, 1);
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
    setTimeout(commitLinks, 0);   // let the value land first
  });
  linkInput.addEventListener("input", function () {
    clearFieldErr("postLinks");   // typing → navy well returns
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
    var cellViews = '<div class="pcl-cell pcl-cell--views' +
      (p.errViews ? " is-error" : "") + '">' +
      '<input class="pcl-input pcl-views" data-id="' + esc(p.id) +
      '" type="text" inputmode="numeric" placeholder="Views / impressions"' +
      ' value="' + esc(p.views) + '" aria-label="Views or impressions — post ' + n +
      '" /><p class="pcl-err">Required</p></div>';
    var btn = p.shot
      ? '<button type="button" class="pcl-shotbtn is-set" data-act="shot" data-id="' +
        esc(p.id) + '" title="' + esc(p.shot.name) + '">' +
        '<img class="pcl-thumb" src="' + p.shot.content + '" alt="" />' + "SHOT</button>"
      : '<button type="button" class="pcl-shotbtn" data-act="shot" data-id="' +
        esc(p.id) + '"><span class="pcl-px-photo" aria-hidden="true"></span>+ SHOT</button>';
    var cellShot = '<div class="pcl-cell pcl-cell--shot' +
      (p.errShotMsg ? " is-error" : "") + '">' + btn +
      '<p class="pcl-err">' + esc(p.errShotMsg || "Required") + "</p></div>";
    var collab = '<div class="pcl-collabrow">' +
      '<button type="button" class="pcl-collab-toggle' + (p.collab ? " is-on" : "") +
      '" data-act="collab" data-id="' + esc(p.id) +
      '" aria-pressed="' + (p.collab ? "true" : "false") +
      '" title="Collab post — points split 50:50 once the partner submits the same link">' +
      "COLLAB</button>" +
      (p.collab
        ? '<input class="pcl-input pcl-collab-input' + (p.errCollab ? " is-error" : "") +
          '" data-act="collabname" data-id="' + esc(p.id) +
          '" type="text" placeholder="Partner\u2019s full name" value="' +
          esc(p.collabWith) + '" aria-label="Partner\u2019s full name — post ' + n + '" />' +
          '<span class="pcl-hint pcl-collab-hint">Same link uploaded by the partner ' +
          "splits this post\u2019s points 50:50.</span>" +
          (p.errCollab ? '<p class="pcl-err">Required</p>' : "")
        : "") +
      "</div>";
    return '<div class="pcl-post" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-post-num">' + n + "</span>" +
      '<div class="pcl-post-main"><a class="pcl-post-link" href="' + esc(p.url) +
      '" target="_blank" rel="noopener" title="' + esc(p.url) + '">#' +
      esc(postHash(p)) + "</a>" +
      fmtHtml(p.format) + "</div>" + cellViews + cellShot + collab + "</div>";
  }

  function viewRowHtml(p, i) {
    var n = i + 1;
    var btn = p.shot
      ? '<button type="button" class="pcl-vshot is-set" data-act="photo" data-id="' +
        esc(p.id) + '" title="Open screenshot"><span class="pcl-px-photo" aria-hidden="true"></span>PHOTO</button>'
      : '<button type="button" class="pcl-vshot is-missing" data-act="shot" data-id="' +
        esc(p.id) + '" title="Attach analytics screenshot"><span class="pcl-px-photo" aria-hidden="true"></span>ADD SHOT</button>';
    var collabTag = p.collab
      ? '<span class="pcl-collab-toggle is-on" aria-hidden="true">COLLAB' +
        (p.collabWith ? " · " + esc(p.collabWith) : "") + "</span>"
      : "";
    return '<div class="pcl-vrow" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-vnum">' + n + "</span>" +
      '<a class="pcl-vlink" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' +
      esc(p.url) + '">#' + esc(postHash(p)) + "</a>" + fmtHtml(p.format) + collabTag + btn + "</div>";
  }

  function renderRows() {
    if (!posts.length) { postRows.innerHTML = ""; return; }
    postRows.innerHTML = posts.map(viewMode === "edit" ? editRowHtml : viewRowHtml)
                              .join("");
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
    } else if (act === "shot") {
      pendingShotFor = id;
      shotInput.click();
    } else if (act === "collab") {
      var p = postById(id);
      if (!p) return;
      p.collab = !p.collab;
      p.errCollab = false;
      renderRows();
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
      lastFocus = document.activeElement;
      root.hidden = false;
      render();
      root.querySelector(".pcl-lb-close").focus();
    }
    function close() {
      root.hidden = true;
      idx = -1;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function step(d) {
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
      else if (ev.key === "ArrowLeft") step(-1);
      else if (ev.key === "ArrowRight") step(1);
    });

    return { openFor: openFor, close: close };
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

      '<span class="pcl-rb-h">6 · Mandatory Posting — 50:50 Rule</span>' +
      '<p class="pcl-rb-p">At least <b>50%</b> of your total posts must feature Praper ' +
      "Media or PAVE Academy (office culture, work experiences, behind-the-scenes, team " +
      "collabs). The rest can be personal content. The ratio is calculated over the " +
      "<b>entire challenge</b>, not weekly, and decimals round up.</p>" +
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
     PLAYER PHOTO — mandatory, one per player. The backend stores it as
     "<name>__<manager>" in a Drive folder; typing a name that already has a
     photo pulls it back up (JSONP) so nobody uploads twice.
     ========================================================================== */
  var photoState = { file: null, existing: null };   // file: {name,type,content}
  var photoBtn = $("photoBtn");
  var photoInput = $("photoInput");
  var photoThumb = $("photoThumb");
  var photoThumbImg = $("photoThumbImg");
  var photoBtnLabel = $("photoBtnLabel");
  var photoStateEl = $("photoState");

  function renderPhoto() {
    var src = photoState.file ? photoState.file.content
              : (photoState.existing ? photoState.existing.thumb : "");
    photoThumb.hidden = !src;
    if (src) photoThumbImg.src = src;
    if (photoState.file) {
      photoBtnLabel.textContent = "CHANGE PHOTO";
      photoStateEl.hidden = false;
      photoStateEl.textContent = "READY ✓";
    } else if (photoState.existing) {
      photoBtnLabel.textContent = "REPLACE PHOTO";
      photoStateEl.hidden = false;
      photoStateEl.textContent = "ON FILE ✓ — REUSED";
    } else {
      photoBtnLabel.textContent = "+ UPLOAD PHOTO";
      photoStateEl.hidden = true;
      photoStateEl.textContent = "";
    }
  }

  photoBtn.addEventListener("click", function () { photoInput.click(); });
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
      clearFieldErr("playerPhoto");
      close();
      renderPhoto();
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

  /* name typed → look up an existing photo (debounced; needs a backend) */
  var nameTimer = null;
  fullName.addEventListener("input", function () {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(lookupPhoto, 600);
  });
  function lookupPhoto() {
    var name = fullName.value.trim();
    if (name.length < 2 || !cfg.gasWebAppUrl) return;
    jsonpGet({ action: "playerPhoto", name: name })
      .then(function (out) {
        if (!out || out.ok !== true || !out.url) return;
        photoState.existing = { url: out.url, thumb: out.thumb || out.url };
        renderPhoto();
        clearFieldErr("playerPhoto");
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
      s.src = cfg.gasWebAppUrl + "?" + q + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  /* ---------- modal buttons + week clock ---------- */
  $("weekInfoBtn").addEventListener("click", openWeekInfo);
  $("pclRulebookBtn").addEventListener("click", openRulebook);
  buildWeekOptions();   // only the ONGOING week is selectable

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

  [fullName, manager, challengeUrl].forEach(function (inp) {
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
    if (!photoState.file && !photoState.existing) {
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
      playerPhoto: photoState.file
        ? [{ name: photoState.file.name, type: photoState.file.type,
            content: photoState.file.content }]
        : [],
      playerPhotoReused: !photoState.file && !!photoState.existing,
      postDetails: posts.map(function (p) {
        var n = Number(String(p.views).replace(/[^\d]/g, ""));
        return {
          link: p.url,
          format: p.format,
          viewsImpressions: n > 0 ? n : "",
          analyticsScreenshot: p.shot
            ? [{ name: p.shot.name, type: p.shot.type, content: p.shot.content }]
            : [],
          collabWith: p.collab ? p.collabWith.trim() : ""
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
    ["fullName", "reportingManager", "playerPhoto", "postLinks",
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
    Crop: Crop
  };
})();
