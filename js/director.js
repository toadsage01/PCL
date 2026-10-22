/* ============================================================================
   PCL — SCREENING ROOM (director.html)
   The Director/CEO's private viewer for the CURRENT week's weekly-challenge
   uploads. Nothing renders until the screening passcode unlocks the backend
   feed (gas/Code.gs → directorFeed_, action=directorFeed) — the passcode is
   the ONLY key (CEO_CODE Script Property overrides the built-in default).
   Read-only, JSONP, zero CORS setup — same transport as every PCL portal.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- tiny DOM + safety helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- theme toggle (same contract as the other portals) ---------- */
  var themeToggle = $("pclThemeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-pcl-theme") === "dark"
        ? "light" : "dark";
      document.documentElement.setAttribute("data-pcl-theme", next);
      try { localStorage.setItem("pcl_theme", next); } catch (e) { /* ok */ }
    });
  }

  /* ---------- season clock (mirrors js/app.js + gas/Code.gs) ---------- */
  var SEASON_START_ISO = "2026-10-19T11:00:00+05:30";
  var SEASON_START = new Date(SEASON_START_ISO).getTime();
  var WEEK_TOTAL = 10;
  var CHALLENGES = [
    { name: "Best Original Content",
      crit: "Most original and creative content featuring Praper Media.", pts: 6000 },
    { name: "Best Storytelling Debut",
      crit: "Most engaging storytelling content mentioning Praper Media.", pts: 8000 },
    { name: "A Day in My Life",
      crit: "Give a glimpse into your daily life — routine, fun moments, work highlights.", pts: 8000 },
    { name: "Best Collaboration",
      crit: "Create content with at least one other Praper employee.", pts: 10000 },
    { name: "Behind the Scenes at Praper",
      crit: "Best emerging creator showcasing office culture and daily life.", pts: 6000 },
    { name: "Most Improved Creator",
      crit: "Highest improvement in profile visits, reach, engagement and follower growth during the challenge.", pts: 10000 },
    { name: "Consistency Reward",
      crit: "Publish at least 2 posts per week for seven consecutive weeks.", pts: 12000 },
    { name: "The One-Take Challenge",
      crit: "One continuous take of minimum 30 seconds, without cuts or edits.", pts: 8000 },
    { name: "The Trend Takeover",
      crit: "Give a popular trend or meme your own creative twist.", pts: 8000 },
    { name: "The Comment Magnet — Final Showdown",
      crit: "Create a post that sparks meaningful conversations and invites opinions.", pts: 10000 }
  ];
  function currentWeek() {
    var t = Date.now();
    if (t < SEASON_START) return 1;
    return Math.min(WEEK_TOTAL, Math.floor((t - SEASON_START) / 604800000) + 1);
  }

  /* ---------- JSONP (cache-busted, same pattern as js/app.js) ---------- */
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var cb = "dirCb" + Date.now() + "_" + Math.floor(Math.random() * 1e5);
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
      s.src = window.PCL_GAS_URL + "?" + q + "&_=" + Date.now() + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  /* The screening room is deployed with the same GAS URL as the other
     portals — it is inlined here so this page stays dependency-free. */
  window.PCL_GAS_URL =
    "https://script.google.com/macros/s/AKfycbxdY0N312upmv3VgfmG2DiVrlHdGGylv7jUk6Psa42Yp1NJotKURlJOoVpiKtly5iwe/exec";

  /* ---------- state ---------- */
  var state = { code: "", entries: [], idx: 0, loaded: false };
  var CODE_KEY = "pcl_dir_code";

  var gate = $("dirGate");
  var theatre = $("dirTheatre");
  var emptyBox = $("dirEmpty");

  function showGateErr(msg) {
    $("dirErr").textContent = msg || "";
  }
  function openTheatre() {
    gate.hidden = true;
    theatre.hidden = false;
  }
  function showEmpty(msg) {
    gate.hidden = true;
    emptyBox.hidden = false;
    $("dirEmptyMsg").textContent = msg;
  }

  /* ---------- embeds ---------- */
  function ytId(url) {
    var m = String(url || "").match(
      /(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : "";
  }
  function igParts(url) {
    var m = String(url || "").match(
      /instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/);
    if (!m) return null;
    return { kind: m[1] === "p" || m[1] === "tv" ? "p" : "reel", id: m[2] };
  }
  function stageHtml(e) {
    var yt = ytId(e.url);
    if (yt) {
      return '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(yt) +
        '" title="Weekly challenge entry" allow="accelerometer; autoplay; ' +
        'clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
        'allowfullscreen loading="lazy"></iframe>';
    }
    var ig = igParts(e.url);
    if (ig) {
      document.querySelector(".dir-stage").classList.add("dir-stage--ig");
      return '<iframe src="https://www.instagram.com/' + ig.kind + "/" +
        esc(ig.id) + '/embed" title="Weekly challenge entry" ' +
        'scrolling="no" loading="lazy"></iframe>';
    }
    /* no embeddable player (LinkedIn, odd links) — a calm link card */
    var word = String(e.platform || "LINK").toUpperCase();
    return '<div class="dir-fallback">' +
      '<span class="dir-fallback-word">' + esc(word) + "</span>" +
      '<span class="dir-fallback-sub">This platform does not allow in-page ' +
      "playback. Open the original post below — it opens in a new tab.</span>" +
      "</div>";
  }

  /* Only real web addresses become links — the feed is built from ledger
     rows, and a hostile direct-API write must never render a javascript:
     href inside the CEO's room. Non-http(s) values degrade to "#". */
  function safeHref(u) {
    var s = String(u || "").trim();
    return /^https?:\/\//i.test(s) ? s : "#";
  }

  /* ---------- render ---------- */
  function renderBanner() {
    var w = currentWeek();
    var ch = CHALLENGES[w - 1] || { name: "" };
    $("dirWeekTag").textContent = "WEEK " + w;
    $("dirWeekName").textContent = ch.name.toUpperCase();
  }
  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?").charAt(0) + (parts[1] ? parts[1].charAt(0) : ""))
      .toUpperCase();
  }
  function renderEntry() {
    var e = state.entries[state.idx];
    if (!e) return;
    var stage = $("dirStage");
    stage.className = "dir-stage";
    stage.innerHTML = stageHtml(e);

    var who = "";
    e.names.forEach(function (nm, i) {
      var role = (e.designations && e.designations[i]) || "";
      who += '<div class="dir-chip">' +
        '<span class="dir-disc" aria-hidden="true">' + esc(initials(nm)) + "</span>" +
        '<span class="dir-chip-id">' +
          '<span class="dir-chip-name">' + esc(nm) + "</span>" +
          (role ? '<span class="dir-chip-role">' + esc(role) + "</span>" : "") +
        "</span></div>";
    });
    who += '<div class="dir-chip dir-chip--plat">' +
      '<span class="dir-chip-id">' +
        '<span class="dir-chip-name">' + esc(String(e.platform || "").toUpperCase() +
          (e.format ? " · " + String(e.format).toUpperCase() : "")) + "</span>" +
        '<span class="dir-chip-role">entry ' + (state.idx + 1) + " of " +
          state.entries.length + "</span>" +
      "</span></div>";
    $("dirWho").innerHTML = who;

    var acts = "";
    if (e.url) {
      acts += '<a class="dir-act" href="' + esc(safeHref(e.url)) +
        '" target="_blank" rel="noopener">OPEN ORIGINAL POST &#8599;</a>';
    }
    if (e.screenshot) {
      acts += '<a class="dir-act" href="' + esc(safeHref(e.screenshot)) +
        '" target="_blank" rel="noopener">ANALYTICS SHOT &#8599;</a>';
    }
    $("dirActions").innerHTML = acts;

    $("dirCount").textContent =
      "ENTRY " + (state.idx + 1) + " / " + state.entries.length;

    var dots = "";
    state.entries.forEach(function (_, i) {
      dots += '<button type="button" class="dir-dot' + (i === state.idx ? " is-on" : "") +
        '" data-i="' + i + '" aria-label="Entry ' + (i + 1) + '"></button>';
    });
    $("dirDots").innerHTML = dots;
    $("dirPrev").disabled = state.idx === 0;
    $("dirNext").disabled = state.idx === state.entries.length - 1;
  }
  function go(delta) {
    var n = state.idx + delta;
    if (n < 0 || n >= state.entries.length) return;
    state.idx = n;
    renderEntry();
  }

  /* ---------- feed load ---------- */
  function loadFeed(code) {
    showGateErr("Checking…");
    return jsonp({ action: "directorFeed", code: code })
      .then(function (res) {
        if (!res || !res.ok) {
          try { localStorage.removeItem(CODE_KEY); } catch (e) { /* ok */ }
          state.code = "";
          showGateErr((res && res.error) || "Access denied.");
          return;
        }
        state.code = code;
        state.entries = Array.isArray(res.entries) ? res.entries : [];
        if (!state.entries.length) {
          showEmpty("No weekly-challenge entries for Week " + res.week +
            " yet. The room fills up as submissions land.");
          return;
        }
        renderBanner();
        state.idx = 0;
        renderEntry();
        openTheatre();
      })
      .catch(function (err) {
        showGateErr(err && err.message === "timeout"
          ? "The league server took too long to answer — try again."
          : "Could not reach the league server — check the connection.");
      });
  }

  /* ---------- gate wiring ---------- */
  $("dirGateForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var code = String($("dirCode").value || "").trim();
    if (!code) { showGateErr("Enter the screening passcode."); return; }
    if ($("dirRemember").checked) {
      try { localStorage.setItem(CODE_KEY, code); } catch (e) { /* ok */ }
    } else {
      try { localStorage.removeItem(CODE_KEY); } catch (e) { /* ok */ }
    }
    $("dirUnlock").disabled = true;
    loadFeed(code).then(function () { $("dirUnlock").disabled = false; });
  });

  /* auto-unlock with a remembered passcode */
  (function tryRemembered() {
    var saved = "";
    try { saved = String(localStorage.getItem(CODE_KEY) || ""); } catch (e) { /* ok */ }
    if (saved) {
      $("dirCode").value = saved;
      loadFeed(saved);
    }
  })();

  /* ---------- nav wiring ---------- */
  $("dirPrev").addEventListener("click", function () { go(-1); });
  $("dirNext").addEventListener("click", function () { go(1); });
  $("dirDots").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-i]");
    if (!b) return;
    state.idx = Number(b.getAttribute("data-i")) || 0;
    renderEntry();
  });
  document.addEventListener("keydown", function (ev) {
    if (theatre.hidden) return;
    if (ev.key === "ArrowLeft") go(-1);
    if (ev.key === "ArrowRight") go(1);
  });
})();
