/* ============================================================================
   PCL ADMIN CONSOLE — dependency-free engine (plain ES5-ish, no framework).
   ----------------------------------------------------------------------------
   Talks to the SAME Google Apps Script Web App as the form:
     · READ   JSONP  ?action=ledger&key=…&callback=…   → rows+totals+players
     · READ   JSONP  ?action=ocr&key=…&fileId=…        → semi-auto OCR suggest
     · WRITE  POST   {action:'adminVerify', adminKey, updates:[…]}
              (same simple-request POST the form uses — no CORS preflight)

   Console model:
     · The FEED renders the ledger newest-first with filters.
     · Edits (verified count / status / OCR) are STAGED in memory — the
       sticky bar counts them and SAVE CHANGES writes them in one batch,
       then the ledger reloads so sheet row numbers stay fresh.
     · AUDIT rebuilds per-Media-ID snapshot timelines and flags hard
       claimed-count jumps (WATCH) with one-click BOOST? staging.
     · REPORTS computes season cards, weekly windows (Mon 11:00 IST
       deadline) and the per-player table. CSV export is client-side.

   Debug/demo: open admin.html?mock=1 → mock ledger, any key ≥ 4 chars
   unlocks, writes apply in-memory. window.PCL_ADMIN exposes state.
   ========================================================================== */

(function () {
  "use strict";

  var cfg = window.PCL_CONFIG || {};
  var MOCK = /(^|[?&])mock=1(&|$)/.test(location.search);
  var KEY_STORE = "pcl_admin_key";
  var OP_STORE = "pcl_admin_op";

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    n = Number(n);
    return isNaN(n) ? "–" : n.toLocaleString("en-IN");
  }
  function fmtTS(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "–";
    try {
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: true
      });
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function fmtDay(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "–";
    try {
      return d.toLocaleDateString("en-IN",
        { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
    } catch (e) { return d.toISOString().slice(0, 10); }
  }
  function shortLink(url) {
    try {
      var u = new URL(url);
      var s = u.hostname.replace(/^www\./i, "") + u.pathname;
      return s.length > 34 ? s.slice(0, 34) + "…" : s;
    } catch (e) { return String(url || ""); }
  }
  function mediaTail(mediaId) {
    var t = String(mediaId || "").split("_").slice(1).join("_");
    return t.length > 12 ? t.slice(0, 12) + "…" : t;
  }
  function multOf(v) {
    var n = Number(v);
    return isNaN(n) ? "×1" : "×" + n;
  }
  function normCheck(v) {
    return String(v || "").toUpperCase().trim() || "PENDING OCR";
  }
  function digitsOf(v) {
    var s = String(v == null ? "" : v).replace(/[^\d]/g, "");
    return s === "" ? "" : Number(s);
  }

  var FORMAT_SHORT = {
    "Instagram Reel": "IG REEL",
    "Instagram Post / Carousel": "IG POST",
    "YouTube Shorts": "YT SHORTS",
    "YouTube Long-Form": "YT VIDEO",
    "LinkedIn Post": "LI POST"
  };
  function fmtShort(f) { return FORMAT_SHORT[f] || String(f || "?").toUpperCase(); }

  /* ---------- theme + reading-font toggles (shared behaviour/storage) ---------- */
  var toggleBtn = $("pclThemeToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-pcl-theme") === "dark"
        ? "light" : "dark";
      document.documentElement.setAttribute("data-pcl-theme", next);
      try { localStorage.setItem("pcl_theme", next); } catch (e) { /* ok */ }
    });
  }
  var fontBtn = $("pclFontToggle");
  if (fontBtn) {
    fontBtn.setAttribute("aria-pressed",
      String(document.documentElement.getAttribute("data-pcl-font") === "px"));
    fontBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-pcl-font") === "px"
        ? "vt" : "px";
      document.documentElement.setAttribute("data-pcl-font", next);
      fontBtn.setAttribute("aria-pressed", String(next === "px"));
      try { localStorage.setItem("pcl_font", next); } catch (e) { /* ok */ }
    });
  }
  var dateEl = $("pclDate");
  if (dateEl) {
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var nowD = new Date();
    dateEl.textContent = nowD.getDate() + " " + MO[nowD.getMonth()] + " " + nowD.getFullYear();
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, isError) {
    var el = $("pclToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "pclToast";
      el.className = "pcl-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2800);
  }

  /* ============================================================================
     WEEK WINDOWS — season opens Mon 2026-10-19, deadline Mondays 11:00 AM IST
     ========================================================================== */
  var WEEKS = 10;
  var SEASON_START_ISO = "2026-10-19T11:00:00+05:30";
  var SEASON_START = new Date(SEASON_START_ISO).getTime();
  var WEEK_THEMES = {
    1: "Best Original Content", 2: "Best Storytelling Debut", 3: "A Day in My Life",
    4: "Best Collaboration", 5: "Behind the Scenes at Praper",
    6: "Most Improved Creator", 7: "Consistency Reward", 8: "The One-Take Challenge",
    9: "The Trend Takeover", 10: "The Comment Magnet"
  };
  function weekOf(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return 0;
    if (t < SEASON_START) return 1;               // warm-up posts land in W1
    var k = Math.floor((t - SEASON_START) / (7 * 86400000)) + 1;
    return Math.min(WEEKS, k);
  }
  function weekWindow(w) {
    // always returns the window; "live" (not yet closed) is derived by caller
    return {
      a: new Date(SEASON_START + (w - 1) * 7 * 86400000),
      b: new Date(SEASON_START + w * 7 * 86400000)
    };
  }

  /* ============================================================================
     MOCK MODE — full offline demo of every surface (no backend touched)
     ========================================================================== */
  var mockEdits = {};   // sheet row → {ocrCount, crossCheck, verifiedCount}

  function mockSvg(seed, big) {
    // tiny pixel analytics placeholder — deterministic per seed
    var bars = "", i, h, x = 8;
    for (i = 0; i < 7; i++) {
      h = 6 + ((seed * (i + 3) * 7) % 22);
      bars += '<rect x="' + x + '" y="' + (38 - h) + '" width="7" height="' + h +
              '" fill="' + (i === 5 ? '#ff5a1f' : '#33409f') + '"/>';
      x += 11;
    }
    var label = (big ? "ANALYTICS " : "") + "#" + (1000 + seed);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96">' +
      '<rect width="160" height="96" fill="#0a0f3e"/>' +
      '<text x="8" y="14" font-family="monospace" font-size="9" fill="#aab4ff">' +
      label + "</text>" + bars + "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function mockRows() {
    var t = Date.now(), H = 3600000, D = 24 * H;
    function row(o) { return o; }
    var base = [
      row({ row: 2,  ts: new Date(t - 3 * H).toISOString(), id: "pcl-mock-a2", type: "NEW",
            snap: 1, name: "Priya Sharma", manager: "Rahul", platform: "Instagram",
            format: "Instagram Reel", mult: 1.25, url: "https://instagram.com/reel/Cx1mock01/",
            mediaId: "ig_Cx1mock01", week: "Week 2 — Best Storytelling Debut",
            claimed: 18400, projected: 23000, check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 3,  ts: new Date(t - 5 * H).toISOString(), id: "pcl-mock-a2", type: "NEW",
            snap: 1, name: "Priya Sharma", manager: "Rahul", platform: "YouTube",
            format: "YouTube Long-Form", mult: 2, url: "https://youtube.com/watch?v=mockYT01",
            mediaId: "yt_mockYT01", week: "", claimed: 9600, projected: 19200,
            check: "MATCH", ocr: 9612, verified: 9612 }),
      row({ row: 4,  ts: new Date(t - 8 * H).toISOString(), id: "pcl-mock-b7", type: "UPDATE",
            snap: 3, name: "Arjun Verma", manager: "Sneha", platform: "Instagram",
            format: "Instagram Reel", mult: 1.25, url: "https://instagram.com/reel/Cx2mock02/",
            mediaId: "ig_Cx2mock02", week: "", claimed: 61200, projected: 76500,
            check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 5,  ts: new Date(t - 34 * H).toISOString(), id: "pcl-mock-b7", type: "UPDATE",
            snap: 2, name: "Arjun Verma", manager: "Sneha", platform: "Instagram",
            format: "Instagram Reel", mult: 1.25, url: "https://instagram.com/reel/Cx2mock02/",
            mediaId: "ig_Cx2mock02", week: "", claimed: 19600, projected: 24500,
            check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 6,  ts: new Date(t - 60 * H).toISOString(), id: "pcl-mock-b7", type: "NEW",
            snap: 1, name: "Arjun Verma", manager: "Sneha", platform: "Instagram",
            format: "Instagram Reel", mult: 1.25, url: "https://instagram.com/reel/Cx2mock02/",
            mediaId: "ig_Cx2mock02", week: "", claimed: 18400, projected: 23000,
            check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 7,  ts: new Date(t - 9 * H).toISOString(), id: "pcl-mock-c4", type: "NEW",
            snap: 1, name: "Sneha Rao", manager: "Rahul", platform: "LinkedIn",
            format: "LinkedIn Post", mult: 1, url: "https://linkedin.com/posts/mock-li-99",
            mediaId: "li_mock-li-99", week: "Week 2 — Best Storytelling Debut",
            claimed: 4300, projected: 4300, check: "MISMATCH", ocr: 3120, verified: 3120 }),
      row({ row: 8,  ts: new Date(t - 12 * H).toISOString(), id: "pcl-mock-d1", type: "NEW",
            snap: 1, name: "Dev Patel", manager: "Sneha", platform: "YouTube",
            format: "YouTube Shorts", mult: 1.25, url: "https://youtube.com/shorts/mockS01",
            mediaId: "yt_mockS01", week: "", claimed: 12750, projected: 15938,
            check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 9,  ts: new Date(t - 26 * H).toISOString(), id: "pcl-mock-e9", type: "NEW",
            snap: 1, name: "Ishita Nair", manager: "Rahul", platform: "Instagram",
            format: "Instagram Post / Carousel", mult: 1, url: "https://instagram.com/p/Cx3mock03/",
            mediaId: "ig_Cx3mock03", week: "", claimed: 8100, projected: 8100,
            check: "BOOST?", ocr: "", verified: "" }),
      row({ row: 10, ts: new Date(t - 30 * H).toISOString(), id: "pcl-mock-f2", type: "NEW",
            snap: 1, name: "Arjun Verma", manager: "Sneha", platform: "YouTube",
            format: "YouTube Shorts", mult: 1.25, url: "https://youtube.com/shorts/mockS02",
            mediaId: "yt_mockS02", week: "Week 1 — Best Original Content",
            claimed: 22100, projected: 27625, check: "PENDING OCR", ocr: "", verified: "" }),
      row({ row: 11, ts: new Date(t - 50 * H).toISOString(), id: "pcl-mock-g5", type: "NEW",
            snap: 1, name: "Priya Sharma", manager: "Rahul", platform: "Instagram",
            format: "Instagram Reel", mult: 1.25, url: "https://instagram.com/reel/Cx4mock04/",
            mediaId: "ig_Cx4mock04", week: "", claimed: 5400, projected: 6750,
            check: "PENDING OCR", ocr: "", verified: "" })
    ];
    base.forEach(function (r, i) {
      r.manager = r.manager;
      r.shotName = "insights_" + (i + 1) + ".png";
      r.shotUrl = "https://drive.google.com/file/d/1MockFileId" + i + "xxxxxxxxxx/view";
      r.fileId = "1MockFileId" + i + "xxxxxxxxxx";
      r.thumb = mockSvg(i + 3);
      r.verifiedPoints = r.verified !== "" ? Math.ceil(Number(r.verified) * Number(r.mult)) : "";
      r.projected = Math.ceil(Number(r.claimed) * Number(r.mult));
    });
    return base;
  }

  var MOCK_PLAYERS = [
    { player: "Priya Sharma", manager: "Rahul", submissions: 2, posts: 3, uniqueMedia: 3,
      formatRatio: { "Instagram Reel": 2, "YouTube Long-Form": 1 }, projectedPoints: 48950, verifiedPoints: 9612 },
    { player: "Arjun Verma", manager: "Sneha", submissions: 2, posts: 4, uniqueMedia: 3,
      formatRatio: { "Instagram Reel": 3, "YouTube Shorts": 1 }, projectedPoints: 151625, verifiedPoints: 0 },
    { player: "Sneha Rao", manager: "Rahul", submissions: 1, posts: 1, uniqueMedia: 1,
      formatRatio: { "LinkedIn Post": 1 }, projectedPoints: 4300, verifiedPoints: 3120 },
    { player: "Dev Patel", manager: "Sneha", submissions: 1, posts: 1, uniqueMedia: 1,
      formatRatio: { "YouTube Shorts": 1 }, projectedPoints: 15938, verifiedPoints: 0 },
    { player: "Ishita Nair", manager: "Rahul", submissions: 1, posts: 1, uniqueMedia: 1,
      formatRatio: { "Instagram Post / Carousel": 1 }, projectedPoints: 8100, verifiedPoints: 0 }
  ];

  function mockNet(params) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (params.action === "ocr") {
          var claimed = Number(params.claimed) || 0;
          resolve({ ok: true, suggested: claimed ? claimed + 37 : 5000,
                    found: [claimed ? claimed + 37 : 5000],
                    text: "MOCK OCR · 5,037 views · 214 likes · 18 comments" });
          return;
        }
        // action=ledger — apply staged mock edits so saves stick
        var rows = mockRows();
        rows.forEach(function (r) {
          var e = mockEdits[r.row];
          if (!e) return;
          if (e.ocrCount !== undefined) r.ocr = e.ocrCount;
          if (e.crossCheck !== undefined) r.check = e.crossCheck;
          if (e.verifiedCount !== undefined) {
            r.verified = e.verifiedCount;
            r.verifiedPoints = e.verifiedCount !== ""
              ? Math.ceil(Number(e.verifiedCount) * Number(r.mult)) : "";
          }
        });
        resolve({
          ok: true, generatedAt: new Date().toISOString(),
          totals: { totalSubmissions: 7, totalPosts: rows.length, uniqueMedia: 9,
                    lastSubmissionAt: rows[0].ts },
          players: JSON.parse(JSON.stringify(MOCK_PLAYERS)),
          rows: rows,
          log: mockLog
        });
      }, 220);
    });
  }

  /* offline audit-catalogue fixture (mock mode only) */
  var mockLog = [
    { ts: "2026-10-19T09:12:00.000Z", operator: "Manas", action: "VERIFY",
      target: "row 4 · Manas",
      detail: "OCR: –→332234234 · CHECK: PENDING OCR→MATCH · VERIFIED: –→332234234 · VPTS: –→415292793" },
    { ts: "2026-10-19T09:02:00.000Z", operator: "Manas", action: "LOGIN",
      target: "Control Room", detail: "gate unlocked" },
    { ts: "2026-10-18T15:40:00.000Z", operator: "Sehaj", action: "VERIFY",
      target: "row 2 · Sehaj",
      detail: "OCR: –→8798 · CHECK: PENDING OCR→MATCH · VERIFIED: –→7980 · VPTS: –→9975" }
  ];

  /* ============================================================================
     DATA LAYER — JSONP reads (CORS-free) + simple POST writes (as the form)
     ========================================================================== */
  var cbSeq = 0;

  function jsonp(params) {
    if (MOCK) return mockNet(params);
    return new Promise(function (resolve, reject) {
      if (!cfg.gasWebAppUrl) {
        reject(new Error("Backend URL not configured — set gasWebAppUrl in js/gas-endpoint.js (or open with ?mock=1)"));
        return;
      }
      var cb = "pclAdminCb" + (++cbSeq);
      var s = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () {
        finish(new Error("Request timed out — is the Web App deployed?"));
      }, 60000);
      function finish(err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        err ? reject(err) : resolve(data);
      }
      window[cb] = function (data) { finish(null, data); };
      s.onerror = function () {
        finish(new Error("Network error — check the Web App URL and deployment access"));
      };
      var q = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      s.src = cfg.gasWebAppUrl + "?" + q + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  function gasPost(body) {
    if (MOCK) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (body.action === "adminLogin") {
            mockLog.unshift({ ts: new Date().toISOString(),
              operator: body.operator || "unnamed", action: "LOGIN",
              target: "Control Room", detail: "gate unlocked" });
            resolve({ ok: true });
            return;
          }
          (body.updates || []).forEach(function (u) {
            mockEdits[u.row] = {
              ocrCount: u.ocrCount, crossCheck: u.crossCheck,
              verifiedCount: u.verifiedCount
            };
          });
          mockLog.unshift({ ts: new Date().toISOString(),
            operator: body.operator || "unnamed", action: "VERIFY",
            target: (body.updates || []).length + " row(s)",
            detail: "staged review write" });
          resolve({ ok: true, updated: (body.updates || []).length });
        }, 300);
      });
    }
    return fetch(cfg.gasWebAppUrl, {
      method: "POST",
      // no explicit Content-Type → simple request → no CORS preflight
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error("GAS responded HTTP " + res.status);
      return res.json();
    });
  }

  /* ============================================================================
     STATE
     ========================================================================== */
  var state = {
    key: "",
    rows: [],
    players: [],
    totals: null,
    generatedAt: null,
    log: [],             // audit catalogue (newest first)
    pending: {},          // sheet row → {ocrCount?, crossCheck?, verifiedCount?}
    filters: { q: "", week: "all", format: "all", status: "all", type: "all" },
    tab: "feed"
  };

  function operatorName() {
    var el = $("gateOperator");
    return (el && el.value.trim()) || "unnamed";
  }

  function displayOf(r) {
    var p = state.pending[r.row] || {};
    return {
      ocr: p.ocrCount !== undefined ? p.ocrCount : (r.ocr === 0 ? "" : r.ocr),
      check: normCheck(p.crossCheck !== undefined ? p.crossCheck : r.check),
      verified: p.verifiedCount !== undefined ? p.verifiedCount
                : (r.verified === 0 ? "" : r.verified)
    };
  }
  function stage(r, patch) {
    var cur = state.pending[r.row] || {
      ocrCount: r.ocr === "" ? "" : r.ocr,
      crossCheck: normCheck(r.check),
      verifiedCount: r.verified === "" ? "" : r.verified
    };
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    // staged entry dissolves when it matches the ledger again (untouch)
    var unchanged =
      String(cur.ocrCount) === String(r.ocr === "" ? "" : r.ocr) &&
      normCheck(cur.crossCheck) === normCheck(r.check) &&
      String(cur.verifiedCount) === String(r.verified === "" ? "" : r.verified);
    if (unchanged) delete state.pending[r.row];
    else state.pending[r.row] = cur;
    syncDirtyBar();
    renderFeedRowState(r.row);
  }
  function pendingCount() { return Object.keys(state.pending).length; }

  /* ============================================================================
     GATE
     ========================================================================== */
  function gateError(msg) {
    var f = $("gateField");
    f.classList.add("is-error");
    $("gateErr").textContent = msg;
  }
  function gateBusy(on, msg) {
    var st = $("gateState");
    st.hidden = !on;
    st.textContent = msg || "";
    st.classList.toggle("is-fail", false);
    $("gateBtn").disabled = on;
  }

  function tryUnlock(key, silent) {
    if (!key) { if (!silent) gateError("Enter the access key."); return Promise.resolve(false); }
    if (MOCK && key.length < 4) {
      if (!silent) gateError("Mock mode: any key with 4+ characters unlocks.");
      return Promise.resolve(false);
    }
    gateBusy(true, "VERIFYING…");
    return jsonp({ action: "ledger", key: key })
      .then(function (out) {
        gateBusy(false);
        if (!out || out.ok === false) {
          if (!silent) gateError((out && out.error) || "Access denied.");
          return false;
        }
        unlockWith(key);
        ingest(out);
        announceLogin(key);
        return true;
      })
      .catch(function (err) {
        gateBusy(false);
        if (!silent) gateError(err.message || "Could not reach the backend.");
        return false;
      });
  }

  /* audit trail: every unlock is logged with the operator's name */
  function announceLogin(key) {
    var op = operatorName();
    try { sessionStorage.setItem(OP_STORE, op === "unnamed" ? "" : op); } catch (e) { /* ok */ }
    if (MOCK) {
      mockLog.unshift({ ts: new Date().toISOString(), operator: op,
        action: "LOGIN", target: "Control Room",
        detail: "gate unlocked (mock)" });
      renderLog();
      return;
    }
    gasPost({ action: "adminLogin", adminKey: key, operator: op })
      .catch(function () { /* log write is best-effort */ });
  }

  function unlockWith(key) {
    state.key = key;
    try { sessionStorage.setItem(KEY_STORE, key); } catch (e) { /* ok */ }
    $("gate").hidden = true;
    $("console").hidden = false;
  }

  /* ============================================================================
     INGEST + FULL RENDER
     ========================================================================== */
  function ingest(out) {
    state.rows = (out.rows || []).map(function (r) {
      r.check = normCheck(r.check);
      r.claimed = (r.claimed === "" || r.claimed == null) ? "" : Number(r.claimed);
      r.ocr = (r.ocr === "" || r.ocr == null) ? "" : Number(r.ocr);
      r.verified = (r.verified === "" || r.verified == null) ? "" : Number(r.verified);
      r.weekNum = weekOf(r.ts);
      return r;
    });
    state.players = out.players || [];
    state.totals = out.totals || null;
    state.generatedAt = out.generatedAt || null;
    if (Array.isArray(out.log)) state.log = out.log;
    else if (MOCK) state.log = mockLog;
    renderAll();
  }

  function loadAll(silent) {
    if (!silent) setSync("SYNCING…");
    return jsonp({ action: "ledger", key: state.key })
      .then(function (out) {
        if (!out || out.ok === false) {
          setSync("SYNC FAILED");
          toast((out && out.error) || "Ledger sync failed", true);
          return;
        }
        ingest(out);
        toast("Ledger synced");
      })
      .catch(function (err) {
        setSync("SYNC FAILED");
        toast(err.message || "Ledger sync failed", true);
      });
  }

  function setSync(text) {
    var el = $("syncInfo");
    var n = state.rows.length;
    el.textContent = text || (n + " ROWS · " + fmtTS(state.generatedAt));
  }

  function renderAll() {
    buildFilterOptions();
    renderFeed();
    renderAudit();
    renderReports();
    renderLog();
    syncDirtyBar();
    setSync();
  }

  /* ============================================================================
     FILTERS + FEED
     ========================================================================== */
  function filteredRows() {
    var q = state.filters.q.toLowerCase();
    return state.rows.filter(function (r) {
      if (state.filters.week !== "all" && String(r.weekNum) !== state.filters.week) return false;
      if (state.filters.format !== "all" && r.format !== state.filters.format) return false;
      if (state.filters.type !== "all" && r.type !== state.filters.type) return false;
      if (state.filters.status !== "all") {
        var d = displayOf(r);
        if (state.filters.status === "VERIFIED") {
          if (d.verified === "") return false;
        } else if (d.check !== state.filters.status) return false;
      }
      if (q) {
        var hay = (r.name + " " + r.url + " " + r.mediaId + " " + r.id).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function buildFilterOptions() {
    var wk = $("fWeek"), fm = $("fFormat"), st = $("fStatus"), ty = $("fType");
    var keepWk = state.filters.week, keepFm = state.filters.format;

    var wHtml = '<option value="all">ALL WEEKS</option>';
    for (var w = 1; w <= WEEKS; w++) {
      wHtml += '<option value="' + w + '">WEEK ' + w + "</option>";
    }
    wk.innerHTML = wHtml;

    var formats = [];
    state.rows.forEach(function (r) {
      if (r.format && formats.indexOf(r.format) < 0) formats.push(r.format);
    });
    formats.sort();
    fm.innerHTML = '<option value="all">ALL FORMATS</option>' + formats.map(function (f) {
      return '<option value="' + esc(f) + '">' + esc(fmtShort(f)) + "</option>";
    }).join("");

    st.innerHTML = ["all", "PENDING OCR", "MATCH", "MISMATCH", "BOOST?", "VERIFIED"]
      .map(function (s) {
        return '<option value="' + s + '">' +
          (s === "all" ? "ALL STATUS" : s) + "</option>";
      }).join("");
    ty.innerHTML = ["all", "NEW", "UPDATE"].map(function (s) {
      return '<option value="' + s + '">' +
        (s === "all" ? "ALL TYPES" : s) + "</option>";
    }).join("");

    wk.value = keepWk; fm.value = keepFm; st.value = state.filters.status;
    ty.value = state.filters.type;
  }

  function feedRowHtml(r, idx) {
    var d = displayOf(r);
    var dirty = !!state.pending[r.row];
    var thumb = r.thumb
      ? '<button type="button" class="pcl-thumbbox" data-act="open" data-i="' + idx +
        '" title="Open review"><img src="' + esc(r.thumb) + '" alt="Analytics screenshot" loading="lazy" /></button>'
      : '<button type="button" class="pcl-thumbbox is-missing" data-act="open" data-i="' + idx +
        '" title="Open review">NO SHOT</button>';
    var avatar = r.photoId
      ? '<img class="pcl-avatar" src="https://drive.google.com/thumbnail?id=' +
        encodeURIComponent(r.photoId) + '&sz=w80" alt="" loading="lazy" />'
      : "";
    var tags = '<span class="pcl-fr-tags">' +
      (r.type === "UPDATE" ? '<span class="pcl-tag pcl-tag--upd">UPD·S' + esc(r.snap) + "</span>"
                           : '<span class="pcl-tag pcl-tag--new">NEW</span>') +
      (dirty ? '<span class="pcl-tag pcl-tag--dirty">STAGED</span>' : "") +
      "</span>";
    return '<div class="pcl-feedrow' + (dirty ? " is-dirty" : "") + '" data-row="' + r.row + '">' +
      '<span class="fr-shot">' + thumb + "</span>" +
      '<span class="fr-who">' + avatar +
        '<span class="pcl-fr-whotext"><p class="pcl-fr-name">' + esc(r.name) + tags + "</p>" +
        '<p class="pcl-fr-sub">' + esc(fmtTS(r.ts)) + " IST · " + esc(r.manager || "–") + "</p></span>" +
      "</span>" +
      '<span class="fr-post">' +
        '<a class="pcl-fr-link" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
          esc(shortLink(r.url)) + "</a>" +
        '<span class="pcl-fr-fmt"><b>' + esc(fmtShort(r.format)) + "</b> " + esc(multOf(r.mult)) +
          ' <span class="pcl-fr-id">· ' + esc(mediaTail(r.mediaId)) + "</span>" +
          (r.weekNum ? ' <span class="pcl-fr-id">· W' + r.weekNum + "</span>" : "") +
        "</span>" +
      "</span>" +
      '<span class="fr-claimed"><small>CLAIMED</small>' + fmt(r.claimed) + "</span>" +
      '<span class="fr-ocr"><small>OCR</small>' + (d.ocr === "" ? "–" : fmt(d.ocr)) +
        '<span class="pcl-fr-mediaid">' + esc(r.mediaId || "") + "</span></span>" +
      '<span class="fr-verified"><input class="pcl-input" type="text" inputmode="numeric"' +
        ' data-edit="verified" data-row="' + r.row + '" value="' + esc(d.verified) +
        '" placeholder="–" aria-label="Verified count for row ' + r.row + '" /></span>' +
      '<span class="fr-status"><select class="pcl-input pcl-select" data-edit="status"' +
        ' data-row="' + r.row + '" data-v="' + esc(d.check) + '"' +
        ' aria-label="Cross-check status for row ' + r.row + '">' +
        ["PENDING OCR", "MATCH", "MISMATCH", "BOOST?"].map(function (s) {
          return '<option value="' + s + '"' + (s === d.check ? " selected" : "") + ">" + s + "</option>";
        }).join("") +
      "</select></span>" +
      "</div>";
  }

  function renderFeed() {
    var rows = filteredRows();
    var wrap = $("feedRows");
    wrap.innerHTML = rows.map(feedRowHtml).join("");
    $("feedEmpty").hidden = rows.length > 0;
    $("feedEmpty").textContent = state.rows.length
      ? "Nothing matches these filters."
      : "Ledger is empty — submissions will appear here.";
  }

  /* keep staged values / dirty markers without a full re-render */
  function renderFeedRowState(rowNo) {
    var el = document.querySelector('.pcl-feedrow[data-row="' + rowNo + '"]');
    var r = null;
    state.rows.forEach(function (x) { if (x.row === rowNo) r = x; });
    if (!el || !r) return;
    var d = displayOf(r);
    var dirty = !!state.pending[rowNo];
    el.classList.toggle("is-dirty", dirty);
    var tags = el.querySelector(".pcl-fr-tags");
    if (tags) {
      var html = r.type === "UPDATE"
        ? '<span class="pcl-tag pcl-tag--upd">UPD·S' + esc(r.snap) + "</span>"
        : '<span class="pcl-tag pcl-tag--new">NEW</span>';
      if (dirty) html += '<span class="pcl-tag pcl-tag--dirty">STAGED</span>';
      tags.innerHTML = html;
    }
    var sel = el.querySelector('[data-edit="status"]');
    if (sel && document.activeElement !== sel) {
      sel.value = d.check;
      sel.setAttribute("data-v", d.check);
    }
    var inp = el.querySelector('[data-edit="verified"]');
    if (inp && document.activeElement !== inp) inp.value = d.verified;
  }

  /* delegated inline edits */
  $("feedRows").addEventListener("input", function (ev) {
    var inp = ev.target.closest('[data-edit="verified"]');
    if (!inp) return;
    var rowNo = Number(inp.getAttribute("data-row"));
    var r = rowByNo(rowNo);
    if (r) stage(r, { verifiedCount: digitsOf(inp.value) });
  });
  $("feedRows").addEventListener("change", function (ev) {
    var sel = ev.target.closest('[data-edit="status"]');
    if (!sel) return;
    var rowNo = Number(sel.getAttribute("data-row"));
    var r = rowByNo(rowNo);
    if (r) stage(r, { crossCheck: sel.value });
  });
  $("feedRows").addEventListener("click", function (ev) {
    var btn = ev.target.closest('[data-act="open"]');
    if (!btn) return;
    openReview(Number(btn.getAttribute("data-i")));
  });

  function rowByNo(no) {
    for (var i = 0; i < state.rows.length; i++) {
      if (state.rows[i].row === no) return state.rows[i];
    }
    return null;
  }

  /* filter wiring */
  $("fSearch").addEventListener("input", function () {
    state.filters.q = this.value.trim();
    renderFeed();
  });
  $("fWeek").addEventListener("change", function () {
    state.filters.week = this.value; renderFeed();
  });
  $("fFormat").addEventListener("change", function () {
    state.filters.format = this.value; renderFeed();
  });
  $("fStatus").addEventListener("change", function () {
    state.filters.status = this.value; renderFeed();
  });
  $("fType").addEventListener("change", function () {
    state.filters.type = this.value; renderFeed();
  });

  /* ============================================================================
     DIRTY BAR — stage → save (one batched write) / discard
     ========================================================================== */
  function syncDirtyBar() {
    var n = pendingCount();
    $("dirtyBar").hidden = n === 0;
    $("dirtyText").textContent = n + " UNSAVED " + (n === 1 ? "ROW" : "ROWS");
    renderAudit();  // audit cards carry staged flags too
  }

  $("dirtyBar").addEventListener("click", function (ev) {
    var act = ev.target.closest("[id]");
    if (!act) return;
    if (act.id === "saveBtn") savePending();
    else if (act.id === "discardBtn") {
      state.pending = {};
      syncDirtyBar();
      renderFeed();
      toast("Staged changes discarded");
    }
  });

  function savePending() {
    var rows = Object.keys(state.pending).map(function (no) {
      var p = state.pending[no];   // always carries all three keys
      return {
        row: Number(no),
        ocrCount: p.ocrCount,
        crossCheck: p.crossCheck,
        verifiedCount: p.verifiedCount
      };
    });
    if (!rows.length) return;
    $("saveBtn").disabled = true;
    $("saveBtn").textContent = "SAVING…";
    gasPost({ action: "adminVerify", adminKey: state.key,
              operator: operatorName(), updates: rows })
      .then(function (out) {
        if (!out || out.ok === false) {
          throw new Error((out && (out.error || (out.errors && out.errors[0] &&
            out.errors[0].error))) || "Write failed");
        }
        state.pending = {};
        toast("Saved " + out.updated + " row" + (out.updated === 1 ? "" : "s") + " to the ledger");
        return loadAll(true);
      })
      .catch(function (err) {
        toast(err.message || "Save failed — nothing was written", true);
      })
      .finally(function () {
        $("saveBtn").disabled = false;
        $("saveBtn").textContent = "SAVE CHANGES";
      });
  }

  /* ============================================================================
     REVIEW MODAL — screenshot side-by-side verification
     ========================================================================== */
  var rvIdx = -1;

  function rvList() { return filteredRows(); }

  function openReview(idx) {
    var list = rvList();
    if (!list.length) return;
    rvIdx = ((idx % list.length) + list.length) % list.length;
    fillReview(list[rvIdx], rvIdx, list.length);
    $("reviewModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeReview() {
    $("reviewModal").hidden = true;
    document.body.style.overflow = "";
    rvIdx = -1;
  }
  function rvStep(dir) {
    var list = rvList();
    if (!list.length || rvIdx < 0) return;
    rvIdx = ((rvIdx + dir) % list.length + list.length) % list.length;
    fillReview(list[rvIdx], rvIdx, list.length);
  }

  function bigThumb(r) {
    if (MOCK) return r.thumb || "";   // mock: stay on the offline placeholder
    if (!r.fileId) return "";
    return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(r.fileId) + "&sz=w1600";
  }

  function fillReview(r, idx, total) {
    var d = displayOf(r);
    var img = $("rvImg");
    var src = bigThumb(r) || r.thumb || "";
    if (src) {
      img.classList.remove("is-missing");
      img.src = src;
      img.alt = "Analytics screenshot · " + r.name;
    } else {
      img.removeAttribute("src");
      img.classList.add("is-missing");
      img.alt = "No screenshot on file";
    }
    var link = $("rvShotLink");
    if (r.shotUrl) { link.href = r.shotUrl; link.style.display = ""; }
    else link.style.display = "none";

    $("rvNum").textContent = "#" + (idx + 1) + " / " + total + " · LEDGER ROW " + r.row;
    $("rvPlayer").textContent = r.name + " · " + (r.manager || "–");
    $("rvMeta").textContent = fmtShort(r.format) + " " + multOf(r.mult) +
      " · " + (r.type === "UPDATE" ? "UPDATE SNAPSHOT S" + r.snap : "FIRST REPORT") +
      " · " + fmtTS(r.ts) + " IST";
    var l = $("rvLink");
    l.href = r.url;
    l.textContent = shortLink(r.url) + " ↗";
    $("rvClaimed").textContent = fmt(r.claimed);
    $("rvSnap").textContent = "S" + r.snap;
    $("rvWeek").textContent = r.weekNum ? "W" + r.weekNum : "–";
    $("rvOcr").value = d.ocr === "" ? "" : d.ocr;
    $("rvVerified").value = d.verified === "" ? "" : d.verified;
    $("rvStatus").value = d.check;
    $("rvOcrNote").textContent = "";
    $("rvScanBtn").disabled = false;
  }

  $("reviewModal").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (act === "close") closeReview();
    else if (act === "prev") rvStep(-1);
    else if (act === "next") rvStep(1);
  });
  document.addEventListener("keydown", function (ev) {
    if ($("reviewModal").hidden) return;
    if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") {
      if (ev.key === "Escape") { ev.target.blur(); closeReview(); }
      return;
    }
    if (ev.key === "Escape") closeReview();
    else if (ev.key === "ArrowLeft") rvStep(-1);
    else if (ev.key === "ArrowRight") rvStep(1);
  });

  /* OCR scan (semi-auto) */
  $("rvScanBtn").addEventListener("click", function () {
    var list = rvList();
    if (rvIdx < 0 || !list[rvIdx]) return;
    var r = list[rvIdx];
    if (!r.fileId) {
      $("rvOcrNote").textContent = "This row has no screenshot on file.";
      return;
    }
    var btn = this;
    btn.disabled = true;
    $("rvOcrNote").textContent = "SCANNING…";
    jsonp({ action: "ocr", key: state.key, fileId: r.fileId,
            claimed: r.claimed === "" ? 0 : r.claimed })
      .then(function (out) {
        btn.disabled = false;
        if (!out || out.ok === false) {
          $("rvOcrNote").textContent = (out && out.error) || "OCR failed.";
          return;
        }
        if (out.suggested === "" || out.suggested == null) {
          $("rvOcrNote").textContent = "OCR ran but found no view/impression numbers — type it manually.";
          return;
        }
        $("rvOcr").value = out.suggested;
        var extra = (out.found || []).filter(function (n) { return n !== out.suggested; });
        $("rvOcrNote").textContent = "Suggested from the screenshot" +
          (extra.length ? " · also saw: " + extra.slice(0, 4).map(fmt).join(", ") : "") +
          " — confirm against the image before staging.";
      })
      .catch(function (err) {
        btn.disabled = false;
        $("rvOcrNote").textContent = err.message || "OCR failed.";
      });
  });

  /* stage from the modal */
  $("rvStageBtn").addEventListener("click", function () {
    var list = rvList();
    if (rvIdx < 0 || !list[rvIdx]) return;
    var r = list[rvIdx];
    stage(r, {
      ocrCount: digitsOf($("rvOcr").value),
      verifiedCount: digitsOf($("rvVerified").value),
      crossCheck: $("rvStatus").value
    });
    toast("Row staged — SAVE CHANGES writes it");
  });

  /* ============================================================================
     AUDIT — snapshot timelines per Media ID
     ========================================================================== */
  function auditGroups() {
    var byMedia = {};
    state.rows.forEach(function (r) {
      if (!r.mediaId) return;
      (byMedia[r.mediaId] = byMedia[r.mediaId] || []).push(r);
    });
    return Object.keys(byMedia)
      .map(function (mid) {
        var rows = byMedia[mid].slice().sort(function (a, b) {
          return String(a.ts).localeCompare(String(b.ts));
        });
        return { mediaId: mid, rows: rows };
      })
      .filter(function (g) { return g.rows.length > 1; })
      .sort(function (a, b) {
        return String(b.rows[b.rows.length - 1].ts)
          .localeCompare(String(a.rows[a.rows.length - 1].ts));
      });
  }

  function renderAudit() {
    var wrap = $("auditList");
    if (!wrap) return;
    var groups = auditGroups();
    $("auditEmpty").hidden = groups.length > 0;
    wrap.innerHTML = groups.map(function (g) {
      var first = g.rows[0], last = g.rows[g.rows.length - 1];
      var liftPct = first.claimed ? ((last.claimed - first.claimed) / first.claimed) * 100 : 0;
      var hours = (new Date(last.ts) - new Date(first.ts)) / 3600000;
      var hot = liftPct > 50 && hours < 72;
      var d = displayOf(last);
      var flagged = d.check === "BOOST?";

      var timeline = g.rows.map(function (r, i) {
        var html = '<div class="pcl-snap">' +
          '<p class="pcl-snap-label">S' + esc(r.snap) + " · " + esc(fmtTS(r.ts)) + "</p>" +
          '<p class="pcl-snap-count">' + fmt(r.claimed) + "</p>" +
          '<p class="pcl-snap-date">claimed · ' + esc(fmtShort(r.format)) + "</p></div>";
        if (i < g.rows.length - 1) {
          var nxt = g.rows[i + 1];
          var dpct = r.claimed
            ? ((nxt.claimed - r.claimed) / r.claimed) * 100 : 0;
          var dh = (new Date(nxt.ts) - new Date(r.ts)) / 3600000;
          var cls = dpct > 50 && dh < 72 ? "is-hot" : (dpct >= 0 ? "is-calm" : "");
          html += '<span class="pcl-delta ' + cls + '">' +
            (dpct >= 0 ? "+" : "") + Math.round(dpct) + "% · " + Math.round(dh) + "h</span>";
        }
        return html;
      }).join("");

      return '<div class="pcl-auditcard">' +
        '<div class="pcl-audit-head">' +
          '<p class="pcl-audit-id">' + esc(g.mediaId) + "</p>" +
          '<span class="pcl-fr-fmt"><b>' + esc(fmtShort(last.format)) + "</b> " + esc(multOf(last.mult)) + "</span>" +
          '<p class="pcl-audit-player">' + esc(first.name) + " · " + g.rows.length + " snapshots · lift " +
            (liftPct >= 0 ? "+" : "") + Math.round(liftPct) + "% over " + Math.round(hours) + "h</p>" +
          (hot && !flagged ? '<span class="pcl-watch">WATCH</span>' : "") +
          '<button type="button" class="pcl-abtn pcl-abtn--small" data-audit-flag="' +
            esc(g.mediaId) + '">' + (flagged ? "CLEAR FLAG" : "FLAG BOOST?") + "</button>" +
        "</div>" +
        '<div class="pcl-timeline">' + timeline + "</div>" +
        "</div>";
    }).join("");
  }

  $("auditList").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-audit-flag]");
    if (!btn) return;
    var mid = btn.getAttribute("data-audit-flag");
    var g = auditGroups().filter(function (x) { return x.mediaId === mid; })[0];
    if (!g) return;
    var last = g.rows[g.rows.length - 1];
    var flagged = displayOf(last).check === "BOOST?";
    stage(last, { crossCheck: flagged ? "PENDING OCR" : "BOOST?" });
    toast(flagged ? "Flag cleared (staged)" : "BOOST? staged on the latest snapshot");
  });

  /* ============================================================================
     REPORTS — season cards, weekly windows, player table
     ========================================================================== */
  function seasonTotals() {
    var proj = 0, ver = 0;
    state.rows.forEach(function (r) {
      proj += Number(r.projected) || 0;
      var d = displayOf(r);
      var vp = r.verifiedPoints;
      ver += (d.verified !== "" ? Math.ceil(d.verified * (Number(r.mult) || 1))
                                : (Number(vp) || 0));
    });
    return { proj: proj, ver: ver };
  }

  function renderReports() {
    var t = seasonTotals();
    var cards = [
      ["SUBMISSIONS", state.totals ? state.totals.totalSubmissions : 0, ""],
      ["POSTS", state.totals ? state.totals.totalPosts : 0, ""],
      ["UNIQUE MEDIA", state.totals ? state.totals.uniqueMedia : 0, ""],
      ["PROJECTED PTS", t.proj, ""],
      ["VERIFIED PTS", t.ver, ""]
    ];
    $("seasonCards").innerHTML = cards.map(function (c) {
      return '<div class="pcl-card"><p class="pcl-card-label">' + c[0] +
        '</p><p class="pcl-card-num">' + fmt(c[1]) + "</p></div>";
    }).join("");

    /* weekly windows */
    var byWeek = {};
    state.rows.forEach(function (r) {
      var w = r.weekNum || 0;
      if (!w) return;
      var bw = byWeek[w] = byWeek[w] || { posts: 0, pts: 0, ver: 0, players: {}, lead: null };
      bw.posts++;
      bw.pts += Number(r.projected) || 0;
      var d = displayOf(r);
      var vpts = d.verified !== "" ? Math.ceil(d.verified * (Number(r.mult) || 1))
                                   : (Number(r.verifiedPoints) || 0);
      bw.ver += vpts;
      var pts = vpts || (Number(r.projected) || 0);
      if (!bw.players[r.name]) bw.players[r.name] = 0;
      bw.players[r.name] += pts;
      if (!bw.lead || pts > bw.lead.pts) bw.lead = { name: r.name, pts: pts };
    });

    var wRows = "";
    for (var w = 1; w <= WEEKS; w++) {
      var win = weekWindow(w);
      var b = byWeek[w];
      var windowTxt = fmtDay(win.a.toISOString()) + " → " + fmtDay(win.b.toISOString());
      var live = win.b.getTime() > Date.now();
      wRows += "<tr" + (b && b.lead ? "" : ' class="pcl-muted-row"') + ">" +
        "<td>W" + w + " · " + esc(WEEK_THEMES[w]) + (live ? ' <span class="pcl-tag">LIVE</span>' : "") + "</td>" +
        '<td class="pcl-muted-cell">' + windowTxt + "</td>" +
        '<td class="num">' + (b ? b.posts : "–") + "</td>" +
        '<td class="num">' + (b ? Object.keys(b.players).length : "–") + "</td>" +
        '<td class="num">' + (b ? fmt(b.pts) : "–") + "</td>" +
        '<td class="num">' + (b ? fmt(b.ver) : "–") + "</td>" +
        "<td>" + (b && b.lead ? esc(b.lead.name) + ' <span class="pcl-muted-cell">(' + fmt(b.lead.pts) + ")</span>" : "–") + "</td>" +
        "</tr>";
    }
    $("weekTable").innerHTML = "<thead><tr>" +
      "<th>WEEK</th><th>WINDOW (IST)</th><th class='num'>POSTS</th><th class='num'>PLAYERS</th>" +
      "<th class='num'>PROJECTED</th><th class='num'>VERIFIED</th><th>LEADER</th>" +
      "</tr></thead><tbody>" + wRows + "</tbody>";

    /* player table — verified points lead, projected breaks ties */
    var players = state.players.slice().sort(function (a, b) {
      return (b.verifiedPoints - a.verifiedPoints) ||
             (b.projectedPoints - a.projectedPoints);
    });
    var pRows = players.map(function (p) {
      var mix = Object.keys(p.formatRatio || {}).map(function (f) {
        return "<b>" + p.formatRatio[f] + "×</b> " + esc(fmtShort(f));
      }).join(" · ") || "–";
      return "<tr><td>" + esc(p.player) +
        '<br /><span class="pcl-muted-cell">mgr ' + esc(p.manager || "–") + "</span></td>" +
        '<td class="num">' + p.submissions + "</td>" +
        '<td class="num">' + p.posts + "</td>" +
        '<td class="num">' + p.uniqueMedia + "</td>" +
        '<td class="pcl-fmtcell">' + mix + "</td>" +
        '<td class="num">' + fmt(p.projectedPoints) + "</td>" +
        '<td class="num">' + fmt(p.verifiedPoints) + "</td></tr>";
    }).join("");
    $("playerTable").innerHTML = "<thead><tr>" +
      "<th>PLAYER</th><th class='num'>SUBS</th><th class='num'>POSTS</th><th class='num'>UNIQUE</th>" +
      "<th>FORMAT MIX</th><th class='num'>PROJECTED</th><th class='num'>VERIFIED</th>" +
      "</tr></thead><tbody>" + (pRows || '<tr><td colspan="7" class="pcl-muted-cell">No players yet.</td></tr>') + "</tbody>";
  }

  /* ============================================================================
     CSV EXPORT — full ledger, client-side
     ========================================================================== */
  var CSV_COLS = [
    ["Timestamp (IST)", function (r) { return fmtTS(r.ts); }],
    ["Submission ID", function (r) { return r.id; }],
    ["Entry Type", function (r) { return r.type; }],
    ["Snapshot #", function (r) { return r.snap; }],
    ["Player", function (r) { return r.name; }],
    ["Manager", function (r) { return r.manager; }],
    ["Platform", function (r) { return r.platform; }],
    ["Format", function (r) { return r.format; }],
    ["Multiplier", function (r) { return r.mult; }],
    ["Post URL", function (r) { return r.url; }],
    ["Media ID", function (r) { return r.mediaId; }],
    ["Week (computed)", function (r) { return r.weekNum ? "W" + r.weekNum : ""; }],
    ["Weekly Challenge", function (r) { return r.week; }],
    ["Claimed", function (r) { return r.claimed; }],
    ["Projected Points", function (r) { return r.projected; }],
    ["OCR Count", function (r) { return displayOf(r).ocr; }],
    ["Cross-Check", function (r) { return displayOf(r).check; }],
    ["Verified Count", function (r) { return displayOf(r).verified; }],
    ["Verified Points", function (r) {
      var d = displayOf(r);
      return d.verified !== "" ? Math.ceil(d.verified * (Number(r.mult) || 1)) : r.verifiedPoints;
    }],
    ["Screenshot Link", function (r) { return r.shotUrl; }]
  ];

  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCsv() {
    if (!state.rows.length) { toast("Nothing to export yet", true); return; }
    var lines = [CSV_COLS.map(function (c) { return csvCell(c[0]); }).join(",")];
    state.rows.forEach(function (r) {
      lines.push(CSV_COLS.map(function (c) { return csvCell(c[1](r)); }).join(","));
    });
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")],
      { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    a.href = URL.createObjectURL(blob);
    a.download = "pcl-season2-ledger-" + d.getFullYear() + pad(d.getMonth() + 1) +
                 pad(d.getDate()) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("CSV exported — " + state.rows.length + " rows");
  }

  /* ============================================================================
     AUDIT CATALOGUE (LOG tab) — who entered, what changed
     ========================================================================== */
  function renderLog() {
    var tbl = $("logTable");
    if (!tbl) return;
    var log = state.log || [];
    var body = log.map(function (l) {
      var cls = l.action === "LOGIN" ? "pcl-logtag--login" : "pcl-logtag--verify";
      return "<tr>" +
        '<td class="pcl-muted-cell" style="white-space:nowrap">' + esc(fmtTS(l.ts)) + " IST</td>" +
        "<td><b>" + esc(l.operator || "unnamed") + "</b></td>" +
        '<td><span class="pcl-logtag ' + cls + '">' + esc(l.action || "") + "</span></td>" +
        "<td>" + esc(l.target || "") + "</td>" +
        '<td class="pcl-logdetail">' + esc(l.detail || "") + "</td>" +
        "</tr>";
    }).join("");
    tbl.innerHTML = "<thead><tr><th>WHEN (IST)</th><th>OPERATOR</th><th>ACTION</th>" +
      "<th>TARGET</th><th>WHAT CHANGED</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="5" class="pcl-muted-cell">No entries yet — ' +
        "unlocks and saved writes will appear here.</td></tr>") + "</tbody>";
  }

  /* ============================================================================
     TABS + TOOLBAR
     ========================================================================== */
  $("tabs").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".pcl-vbtn");
    if (!btn) return;
    var tab = btn.getAttribute("data-tab");
    state.tab = tab;
    Array.prototype.forEach.call(
      $("tabs").querySelectorAll(".pcl-vbtn"),
      function (b) { b.classList.toggle("is-active", b === btn); });
    ["feed", "audit", "reports", "log"].forEach(function (t) {
      $("tab" + t.charAt(0).toUpperCase() + t.slice(1)).hidden = t !== tab;
    });
  });
  $("refreshBtn").addEventListener("click", function () { loadAll(); });
  $("exportBtn").addEventListener("click", exportCsv);

  /* ============================================================================
     GATE WIRING + BOOT
     ========================================================================== */
  $("gateBtn").addEventListener("click", function () {
    var f = $("gateField");
    f.classList.remove("is-error");
    tryUnlock($("gateKey").value.trim(), false);
  });
  $("gateKey").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      $("gateField").classList.remove("is-error");
      tryUnlock(this.value.trim(), false);
    }
  });
  $("gateKey").addEventListener("input", function () {
    $("gateField").classList.remove("is-error");
  });

  (function boot() {
    var saved = "";
    try { saved = sessionStorage.getItem(KEY_STORE) || ""; } catch (e) { /* ok */ }
    try {
      var savedOp = sessionStorage.getItem(OP_STORE);
      if (savedOp && $("gateOperator")) $("gateOperator").value = savedOp;
    } catch (e) { /* ok */ }
    if (saved) {
      tryUnlock(saved, true).then(function (ok) {
        if (!ok) {
          try { sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ok */ }
          $("gate").hidden = false;
          $("console").hidden = true;
        }
      });
    }
    if (MOCK) {
      var note = document.querySelector(".pcl-gate-note");
      if (note) note.innerHTML = "<strong>MOCK MODE</strong> — demo ledger, no backend " +
        "calls. Any key with 4+ characters unlocks.";
    }
  })();

  /* debug / automation handle */
  window.PCL_ADMIN = {
    get state() { return state; },
    MOCK: MOCK,
    tryUnlock: tryUnlock,
    loadAll: loadAll,
    openReview: openReview,
    exportCsv: exportCsv,
    weekOf: weekOf
  };
})();
