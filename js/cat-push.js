/* ============================================================================
   PCL FORM CAT — the smug guardian of the submit button.
   ----------------------------------------------------------------------------
   One cat, two lives (posture follows the theme, like a real cat):
     · light mode  — asleep in a loaf, head resting on its front limbs,
                     smirking in its sleep. White fur, grey-brown tabby
                     saddle + striped tail, ginger patches, pink nose,
                     maroon collar with a gold bell (it's THEIR cat).
     · dark mode   — awake, sitting upright, turned 45° from the screen
                     plane toward the viewer; fur looks greyer in the dim
                     light and the amber eyes glow.

   THE EVENT (one event, gated by two conditions): the cursor moves onto
   the Complete/Send button WHILE some required field is still empty →
   the cat uncurls one paw and SHOVES the button a little more to the
   right — a random 2/3 to 2x of the button's own width — exactly ONCE
   per visit. Like a cat nudging something toward the table edge.
   After the shove: no alteration, no further visual events. The button
   rests in its new spot, fully clickable. If they click it anyway with
   fields still empty, the angry pointer from phase 2 takes over
   (js/finger-slam.js).

   Motion budget: transform-only (Web Animations API) + steps() easing for
   the chunky pixel shove — GPU-composited, zero reflow, snappy at any FPS.
   prefers-reduced-motion: the button lands in its shoved spot instantly.
   ========================================================================== */

(function () {
  "use strict";
  if (window.PCL_CatPush) return;

  /* ---- palettes -----------------------------------------------------------
     light = daytime fur. dark = same cat at night: everything a notch
     greyer/dimmer, eyes switched to glowing amber. */
  var PALETTES = {
    light: {
      K: "#1b1238", W: "#f7f4ec", w: "#dbd3c8",
      B: "#9b7d5b", b: "#6b5138",
      G: "#eaa660", g: "#c97f3f",
      P: "#e58a95", E: "#d99b26",
      R: "#8c3040", Y: "#e8b000"
    },
    dark: {
      K: "#191625", W: "#c9c4c1", w: "#a39d9a",
      B: "#7a6f68", b: "#554b44",
      G: "#b98356", g: "#93603c",
      P: "#c47a83", E: "#ffb52e",
      R: "#6e2b38", Y: "#c79400"
    }
  };

  /* ---- pixel maps ---------------------------------------------------------
     Hand-authored (see scripts/cat_sprite_dev.py, iteration 5).
     LOAF: light mode, lying with head on front limbs, facing RIGHT toward
     the button. SIT: dark mode, upright, 45° toward the viewer.
     Both canvases are 34x23 cells; the loaf is bottom-aligned inside it,
     the sit map is pre-shifted 8 cells right so its extended paw reaches
     the same column as the loaf's. Columns beyond each pose's base outline
     stay transparent and are filled by the reach/push patch frames. */
  var CW = 34, CH = 23;               // canvas size in cells
  var LOAF_Y = 10;                    // loaf bottom-aligned in the canvas

  var LOAF = [
    ".....................KK...KK..",
    "....................KPPK.KGGK.",
    "..................KKKKKKKKKKKK",
    "......KKKKKKKKKK..KBbBbGGGgWWK",
    "....KBBBbBBBbBBBWWWGgBbGGGgWWK",
    "...KBBbBBBBbBBBWWWWWwWWWKKWWWK",
    "..KBBBbBBBbBBBWWWWWWWwWWWWwwPK",
    "..KBBBbBBBbBBBWWwWRRWWwWWWKKww",
    ".KBBBbBBBbBBBWwWWYYwWwwwwwwwwK",
    ".KBbBBBbBBBBbBWwWWWWwWwwwwwwww",
    ".KBbBBBbBBBBbBWwWWWWWwWwWwWwWK",
    "..KBbBbBbBbBbBbBbBbBbBbBwWwKK.",
    "...KKKKKKKKKKKKKKKKKKKKKKKK..."
  ];

  /* reach — one front paw UNCURLS from under the chin and lifts */
  var LOAF_REACH = [
    [8, 30, "K"], [8, 31, "K"],
    [9, 28, "W"], [9, 29, "K"], [9, 30, "W"], [9, 31, "W"], [9, 32, "K"],
    [10, 24, "w"], [10, 25, "w"], [10, 26, "w"], [10, 27, "w"], [10, 28, "w"],
    [10, 29, "K"], [10, 30, "W"], [10, 31, "w"], [10, 32, "K"]
  ];
  /* push — paw flat, shoving the button away along the ground */
  var LOAF_PUSH = [
    [9, 28, "W"], [9, 29, "K"], [9, 30, "W"], [9, 31, "W"], [9, 32, "K"],
    [10, 24, "W"], [10, 25, "w"], [10, 26, "W"], [10, 27, "w"], [10, 28, "W"],
    [10, 29, "K"], [10, 30, "W"], [10, 31, "w"], [10, 32, "K"],
    [11, 29, "K"], [11, 30, "K"], [11, 31, "K"]
  ];

  var SIT = [
    ".....KK.......KK........",
    "....KPPK.....KGGK.......",
    "...KKKKKKKKKKKKKKK......",
    "...KBbBbGGGgGBWwK.......",
    "..KWBbBbGGGgGBWwwK......",
    "..KWwEEWWPPWEEwWwK......",
    "..KWwEKWPPWKEwWwK.......",
    "..KWwWwWWwWWKKwWK.......",
    "..KWwwwwwwwwwwwwK.......",
    "...KwWwwwwwwwWwK........",
    "...KRRRRYYRRRRRK........",
    "..KWWwWWWWWWWWWwK.......",
    "..KBWWWWWWWWWWWWK.......",
    ".KBBWWWWWWWWWWWWWK......",
    ".KBbBWWWWWWWWWWWWK......",
    "KBbBbBWWWWWWWWWWWWK.....",
    "KBbBBbBWWWWWWWWWWwK.....",
    "KBbBbBbBWWWWWWWWWWK.....",
    "KBbBBbBBBWWWWWWWWWK.....",
    ".KBbBbBbBWWWWWWWWK......",
    ".KBbBbBbBbWwWwWwWK......",
    "..KBbBbBbBbBbBbBbK......",
    "...KKKKKKKKKKKKKK......."
  ].map(function (r) {                   // pre-shift 8 cells right
    return "........" + r;
  });

  var SIT_REACH = [
    [11, 19, "K"], [11, 20, "K"],
    [12, 18, "W"], [12, 19, "W"], [12, 20, "W"], [12, 21, "K"],
    [13, 19, "K"], [13, 20, "w"], [13, 21, "K"]
  ];
  var SIT_PUSH = [
    [11, 19, "K"], [11, 20, "K"], [11, 21, "K"],
    [12, 18, "W"], [12, 19, "W"], [12, 20, "W"], [12, 21, "K"],
    [13, 18, "W"], [13, 19, "W"], [13, 20, "W"], [13, 21, "w"], [13, 22, "W"],
    [13, 23, "K"],
    [14, 18, "W"], [14, 19, "K"], [14, 20, "W"], [14, 21, "w"], [14, 22, "W"],
    [14, 23, "w"], [14, 24, "K"],
    [15, 20, "K"], [15, 21, "K"], [15, 22, "K"], [15, 23, "K"], [15, 24, "K"]
  ];

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LEAN = 6;                       // px the cat leans in during the shove

  /* ---- sprite painting ---------------------------------------------------- */
  function padRow(r, width) {
    var out = r;
    while (out.length < width) out += ".";
    return out;
  }
  function buildRows(base, patches) {
    var grid = base.map(function (r) {
      return padRow(r, CW).split("");
    });
    (patches || []).forEach(function (p) {
      if (grid[p[0]]) grid[p[0]][p[1]] = p[2];
    });
    return grid;
  }
  function theme() {
    return document.documentElement.getAttribute("data-pcl-theme") === "dark"
      ? "dark" : "light";
  }
  function frames(kind) {
    var dark = theme() === "dark";
    if (dark) {
      return kind === "reach" ? { rows: buildRows(SIT, SIT_REACH), y: 0 }
           : kind === "push"  ? { rows: buildRows(SIT, SIT_PUSH), y: 0 }
           : { rows: buildRows(SIT), y: 0 };
    }
    return kind === "reach" ? { rows: buildRows(LOAF, LOAF_REACH), y: LOAF_Y }
         : kind === "push"  ? { rows: buildRows(LOAF, LOAF_PUSH), y: LOAF_Y }
         : { rows: buildRows(LOAF), y: LOAF_Y };
  }

  var host = null, canvas = null, ctx = null, cell = 3;
  function scaleFor() {
    return window.innerWidth < 420 ? 2 : 3;
  }
  function paint(kind) {
    if (!ctx) return;
    var f = frames(kind || "base");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pal = PALETTES[theme()];
    for (var r = 0; r < f.rows.length; r++) {
      var row = f.rows[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row[c];
        if (ch === ".") continue;
        ctx.fillStyle = pal[ch] || "#f0f";
        ctx.fillRect(c, r + f.y, 1, 1);
      }
    }
  }
  function rebuildCanvas() {
    if (!host) return;
    cell = scaleFor();
    var w = CW * cell, h = CH * cell;
    if (!canvas) {
      canvas = document.createElement("canvas");
      host.appendChild(canvas);
    }
    canvas.width = CW; canvas.height = CH;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paint("base");
  }

  /* ---- placement ----------------------------------------------------------
     The cat lives inside .sd-navigation, left of the Complete button,
     bottom-aligned with it. Anchored by rect math so it survives any
     offsetParent surprises; transform-shoving the button later never
     changes layout, so the anchor stays put. */
  function findNav() {
    var root = document.getElementById("surveyContainer");
    if (!root) return null;
    /* v3.2.1 renders the nav row as .sd-action-bar.sd-footer */
    return root.querySelector(".sd-footer") ||
           root.querySelector(".sd-navigation");
  }
  function findBtn(nav) {
    return nav && nav.querySelector(
      ".sd-navigation__complete-btn, .sd-navigation__next-btn");
  }
  function position() {
    if (!host || !host.isConnected) return;
    var nav = host.parentNode;
    var btn = findBtn(nav);
    if (!btn) return;
    var nr = nav.getBoundingClientRect();
    var br = btn.getBoundingClientRect();
    var gap = 4;
    /* may go negative — the cat hangs into the page floor left of the nav,
       which is correct when the button hugs the nav's left edge (v3.2.1) */
    host.style.left = (br.left - nr.left - gap - host.offsetWidth) + "px";
    host.style.bottom = Math.max(0, nr.bottom - br.bottom) + "px";
  }
  function attach() {
    var nav = findNav();
    if (!nav) return;
    if (host && host.isConnected) { position(); return; }
    var btn = findBtn(nav);
    if (!btn) return;                     // nav not painted yet
    host = document.createElement("div");
    host.id = "pclCat";
    host.setAttribute("aria-hidden", "true");
    nav.appendChild(host);
    rebuildCanvas();
    position();
  }

  /* ---- required-empty probe (NO validation side effects) ------------------- */
  function requiredEmpty(q) {
    if (q.getType && q.getType() === "multipletext") {
      var v = q.value || {};
      return (q.items || []).some(function (it) {
        return it.isRequired && !v[it.name];
      });
    }
    return q.isEmpty();
  }
  function hasUnfilledRequired() {
    var s = window.__pclSurvey;
    if (!s || !s.currentPage) return false;
    var bad = false;
    (function walk(els) {
      (els || []).forEach(function (el) {
        if (bad || !el) return;
        if (el.isQuestion) {
          if (!el.isVisible) return;
          var mt = el.getType && el.getType() === "multipletext";
          var req = el.isRequired || (mt && (el.items || []).some(function (it) {
            return it.isRequired;
          }));
          if (req && requiredEmpty(el)) bad = true;
        } else if (el.elements) {
          walk(el.elements);
        }
      });
    })(s.currentPage.elements || []);
    return bad;
  }

  /* ---- the shove ------------------------------------------------------------ */
  var pushed = false;                    // ONE push per page load — ever
  var busy = false;

  function computeD(btn) {
    var w = btn.offsetWidth || 120;
    var d = Math.round(w * (2 / 3 + Math.random() * (2 - 2 / 3)));
    var room = window.innerWidth - btn.getBoundingClientRect().right - 10;
    var cap = Math.max(12, room);
    return Math.max(12, Math.min(d, cap));   // always visible, never off-screen
  }
  function slideButton(btn, d) {
    var anim = btn.animate(
      [{ transform: "translateX(0px)" },
       { transform: "translateX(" + d + "px)" }],
      { duration: 260, easing: "steps(5, end)", fill: "forwards" });
    anim.finished.then(function () {
      btn.style.transform = "translateX(" + d + "px)";   // park it there
      anim.cancel();
    }).catch(function () {
      btn.style.transform = "translateX(" + d + "px)";
    });
  }
  function lean(dx, dur) {
    host.animate(
      [{ transform: "translateX(0px)" },
       { transform: "translateX(" + dx + "px)" }],
      { duration: dur, easing: "steps(2, end)", fill: "forwards" });
  }

  function runPush(btn) {
    busy = true;
    var d = computeD(btn);
    if (REDUCED) {                         // calm mode: land it, no theatrics
      btn.style.transform = "translateX(" + d + "px)";
      busy = false;
      return;
    }
    paint("reach");                        // the paw uncurls…
    setTimeout(function () {
      paint("push");                       // …and lands on the button
      if (host) lean(LEAN, 240);
      slideButton(btn, d);
      setTimeout(function () {
        paint("base");                     // paw retracts, smug as ever
        if (host) lean(0, 200);
        busy = false;
      }, 340);
    }, 110);
  }

  /* one event, two interactions: hover the submit button while a mandatory
     field (input or upload button) is still empty */
  document.addEventListener("pointerover", function (e) {
    if (pushed || busy || !host || !host.isConnected) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest(
      ".sd-navigation__complete-btn, .sd-navigation__next-btn");
    if (!btn) return;
    if (!hasUnfilledRequired()) return;    // everything mandatory is filled
    pushed = true;                         // claim the one-time shove now
    runPush(btn);
  }, true);                                // capture: SurveyJS guards its nav

  /* ---- lifecycle ------------------------------------------------------------ */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (host && !host.isConnected) { host = null; canvas = null; ctx = null; }
      attach();
    }).observe(document.getElementById("surveyContainer") ||
               document.documentElement,
      { childList: true, subtree: true });

    /* theme flip → swap the cat's posture/palette (unless mid-shove) */
    new MutationObserver(function () {
      if (!busy) { rebuildCanvas(); position(); }
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-pcl-theme"] });
  }
  window.addEventListener("resize", function () {
    if (host && host.isConnected) { rebuildCanvas(); position(); }
  });
  attach();
  setTimeout(attach, 300);               // after fonts/layout settle

  /* ---- debug handles -------------------------------------------------------- */
  window.PCL_CatPush = {
    debugSprite: function (kind, scale) {
      var d = document.createElement("div");
      d.style.cssText = "position:fixed;left:16px;top:16px;z-index:100000;" +
        "background:#888;padding:8px";
      var cv = document.createElement("canvas");
      var f = frames(kind || "base");
      var s = scale || 6;
      cv.width = CW; cv.height = CH;
      cv.style.width = CW * s + "px";
      cv.style.height = CH * s + "px";
      cv.style.imageRendering = "pixelated";
      var cx = cv.getContext("2d");
      var pal = PALETTES[theme()];
      for (var r = 0; r < f.rows.length; r++) {
        for (var c = 0; c < f.rows[r].length; c++) {
          if (f.rows[r][c] === ".") continue;
          cx.fillStyle = pal[f.rows[r][c]];
          cx.fillRect(c, r + f.y, 1, 1);
        }
      }
      d.appendChild(cv);
      document.body.appendChild(d);
      return d;
    },
    debugPush: function () {
      pushed = false;
      var btn = findBtn(findNav());
      if (btn) { pushed = true; runPush(btn); }
    },
    reset: function () { pushed = false; busy = false; },
    get pushed() { return pushed; }
  };
})();
