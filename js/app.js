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
                                        EDIT = columnar (views + screenshot),
                                        VIEW = confirmation rows with a
                                        floating screenshot lightbox
                                        (PREV / NEXT + thumbnails).
     4. Weekly Challenge .............. optional week + link + notes

   Error model (per spec):
     · Missing required field  → red border + shadow + small "Required" text
       under the field; the navy well returns the moment data is entered.
     · Bad links are NEVER surfaced on final submit — they are flagged as red
       chips when the links are committed (paste / Enter / + ADD), with the
       reason on hover. `.is-status` (amber) is reserved for the future
       link-liveness check (private / followers-only posts).

   Submission strategy (CORS-safe, unchanged):
     - Google Apps Script cannot answer CORS preflights → simple fetch POST
       (no explicit Content-Type) carrying JSON; GAS parses e.postData.
     - submitViaApi → same-origin POST /api/submit (Vercel function).
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

  /* ---------- theme toggle (light = sunset cabinet, dark = midnight arcade) ---------- */
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
     ========================================================================== */
  var FORMATS = {
    ig_reel:   { label: "Instagram Reel", tag: "IG REEL",   mult: 1.25 },
    ig_post:   { label: "Instagram Post", tag: "IG POST",   mult: 1 },
    yt_shorts: { label: "YouTube Shorts", tag: "YT SHORTS", mult: 1.25 },
    yt_long:   { label: "YouTube Video",  tag: "YT VIDEO",  mult: 2 },
    li_post:   { label: "LinkedIn Post",  tag: "LI POST",   mult: 1 }
  };

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
      var im = path.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/i);
      if (!im) {
        return { ok: false,
          reason: "Instagram — only Reel or Post links count in the league." };
      }
      return {
        ok: true, url: tok,
        format: /^reel/i.test(im[1]) ? "ig_reel" : "ig_post",
        mediaId: "ig_" + im[2]
      };
    }

    if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be" ||
        /(^|\.)youtube-nocookie\.com$/.test(host)) {
      var sm = path.match(/\/shorts\/([A-Za-z0-9_-]+)/i);
      if (sm) return { ok: true, url: tok, format: "yt_shorts", mediaId: "yt_" + sm[1] };
      var vid = u.searchParams.get("v");
      var lm = !vid ? path.match(/\/(?:live|embed)\/([A-Za-z0-9_-]+)/i) : null;
      var bm = !vid && !lm && host === "youtu.be" ? path.match(/^\/([A-Za-z0-9_-]+)/) : null;
      var id = vid || (lm && lm[1]) || (bm && bm[1]);
      if (id) return { ok: true, url: tok, format: "yt_long", mediaId: "yt_" + id };
      return { ok: false,
        reason: "YouTube — only video or Shorts links count in the league." };
    }

    if (/(^|\.)linkedin\.com$/.test(host)) {
      var pm = path.match(/\/(?:posts|feed\/update|pulse)\/([^\/?#]+)/i) ||
               path.match(/activity[-:]?(\d{10,})/i);
      if (!pm) {
        return { ok: false,
          reason: "LinkedIn — only post links count in the league." };
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

  /* ============================================================================
     STATE
     ========================================================================== */
  var posts = [];        // { id(=mediaId), url, format, mediaId, views, shot, errViews, errShotMsg }
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
      '<span class="pcl-chip-label">' + esc(f.tag) + " · " + esc(chipTail(p.mediaId)) +
      '</span><button type="button" class="pcl-chip-x" data-act="del" data-i="' + i +
      '" aria-label="Remove ' + esc(f.tag) + " " + esc(chipTail(p.mediaId)) + '"></button></span>';
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
        views: "", shot: null, errViews: false, errShotMsg: ""
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
    if (ev.target === chipBox || ev.target.classList.contains("pcl-px-link")) {
      linkInput.focus();
    }
  });

  /* ============================================================================
     POST DETAILS — EDIT / VIEW rows
     ========================================================================== */
  function fmtHtml(fmt) {
    var f = FORMATS[fmt];
    return '<span class="pcl-fmt" title="' + esc(f.label + " — rulebook multiplier " +
      f.mult + "×") + '">' + esc(f.tag) + " <b>x" + f.mult + "</b></span>";
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
    return '<div class="pcl-post" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-post-num">' + n + "</span>" +
      '<div class="pcl-post-main"><a class="pcl-post-link" href="' + esc(p.url) +
      '" target="_blank" rel="noopener">' + esc(linkDisplay(p.url)) + "</a>" +
      fmtHtml(p.format) + "</div>" + cellViews + cellShot + "</div>";
  }

  function viewRowHtml(p, i) {
    var n = i + 1;
    var btn = p.shot
      ? '<button type="button" class="pcl-vshot is-set" data-act="photo" data-id="' +
        esc(p.id) + '" title="Open screenshot"><span class="pcl-px-photo" aria-hidden="true"></span>PHOTO</button>'
      : '<button type="button" class="pcl-vshot is-missing" data-act="shot" data-id="' +
        esc(p.id) + '" title="Attach analytics screenshot"><span class="pcl-px-photo" aria-hidden="true"></span>ADD SHOT</button>';
    return '<div class="pcl-vrow" data-id="' + esc(p.id) + '">' +
      '<span class="pcl-vnum">' + n + "</span>" +
      '<a class="pcl-vlink" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
      esc(linkDisplay(p.url)) + "</a>" + fmtHtml(p.format) + btn + "</div>";
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
    if (!input) return;
    var p = postById(input.getAttribute("data-id"));
    if (!p) return;
    p.views = input.value.replace(/[^\d,.\s]/g, "").slice(0, 18);
    if (p.views !== input.value) input.value = p.views;
    if (p.errViews) {
      p.errViews = false;
      var cell = input.closest(".pcl-cell");
      if (cell) cell.classList.remove("is-error");
    }
  });

  /* screenshot buttons */
  postRows.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    if (btn.getAttribute("data-act") === "photo") {
      Lightbox.openFor(id);
    } else if (btn.getAttribute("data-act") === "shot") {
      pendingShotFor = id;
      shotInput.click();
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
      var f = FORMATS[p.format];
      var bits = ["#" + (posts.indexOf(p) + 1),
                  "<b>" + esc(f.label) + " x" + f.mult + "</b>"];
      var n = Number(String(p.views).replace(/[^\d]/g, ""));
      if (n > 0) bits.push(Number(n).toLocaleString("en-US") + " views");
      bits.push('<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
                esc(linkDisplay(p.url)) + "</a>");
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
    if (!posts.length) bad("postLinks", "Paste at least one post link.");

    posts.forEach(function (p) {
      var viewsNum = Number(String(p.views).replace(/[^\d]/g, ""));
      p.errViews = !(viewsNum > 0);
      if (!p.shot && !p.errShotMsg) p.errShotMsg = "Required";
      if (!firstPostId && (p.errViews || p.errShotMsg)) firstPostId = p.id;
    });

    if (challengeUrl.value.trim() && !week.value) bad("challengeWeek");
    if (week.value && challengeUrl.value.trim() &&
        !looseUrlOk(challengeUrl.value.trim())) {
      bad("challengeUrl", "Enter a valid link.");
    }

    /* if anything post-level failed, make sure the editable view is on
       screen before marking rows (setMode/renderRows re-render) */
    var postBad = posts.some(function (p) { return p.errViews || p.errShotMsg; });
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
      postDetails: posts.map(function (p) {
        var n = Number(String(p.views).replace(/[^\d]/g, ""));
        return {
          link: p.url,
          format: p.format,
          viewsImpressions: n > 0 ? n : "",
          analyticsScreenshot: p.shot
            ? [{ name: p.shot.name, type: p.shot.type, content: p.shot.content }]
            : []
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

  function sendPayload(payload) {
    submitBtn.disabled = true;
    saveState.hidden = false;
    saveState.classList.remove("is-fail");
    saveState.textContent = "SAVING…";

    var done;
    if (cfg.submitViaApi) {
      done = fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error("API route responded HTTP " + res.status);
        return res.json().catch(function () { return { ok: true }; });
      }).then(function (out) {
        if (out && out.ok === false) {
          throw new Error(out.error || "API route rejected the submission");
        }
      });
    } else if (cfg.gasWebAppUrl) {
      done = fetch(cfg.gasWebAppUrl, {
        method: "POST",
        // no explicit Content-Type → simple request → no CORS preflight
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error("GAS responded HTTP " + res.status);
        return res.json().catch(function () { return { ok: true }; });
      }).then(function (out) {
        if (out && out.ok === false) {
          throw new Error(out.error || "GAS rejected the submission");
        }
      });
    } else {
      done = new Promise(function (resolve) {
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

    done.then(function () {
      form.hidden = true;
      doneScreen.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (err) {
      console.error("[PCL] submission failed:", err);
      saveState.classList.add("is-fail");
      saveState.textContent = "SAVE FAILED — CHECK CONNECTION";
    }).finally(function () {
      submitBtn.disabled = false;
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (linkInput.value.trim()) commitLinks();   // never lose typed links
    ["fullName", "reportingManager", "postLinks",
     "challengeWeek", "challengeUrl"].forEach(clearFieldErr);
    posts.forEach(function (p) { p.errViews = false; p.errShotMsg = ""; });

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
    classifyUrl: classifyUrl,
    commitLinks: commitLinks
  };
})();
