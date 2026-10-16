/* ============================================================================
   PCL FINGER SLAM — the angry plastic pointer.
   ----------------------------------------------------------------------------
   When someone hits Complete/Send while a required field is still empty
   (a text box OR the file upload button), a pixel-art pointer stick —
   plastic PCL-orange hand on a chrome shaft — flies in from the
   bottom-right edge of the screen and SLAMS on the missing field.

   - Slams are randomized 1..3 per poke (angry, but never sluggish).
   - Impact: pixel dust burst, hard shake + glow flash on the field,
     steam puffs off the hand, manga anger-mark baked into the sprite.
   - Multiple empty fields? Fingers take turns (sequential queue).
   - Motion is transform/opacity only (Web Animations API) → 60fps,
     and prefers-reduced-motion gets a calm glow flash instead.
   ========================================================================== */

(function () {
  "use strict";
  if (window.PCL_FingerSlam) return;
  var FEAT = window.PCL_CONFIG && window.PCL_CONFIG.features;
  if (FEAT && FEAT.fingerSlam === false) return;  // flag off → plain form

  /* ---- tunables ---------------------------------------------------------- */
  var GRID = 32;                       // sprite is a 32x32 cell pixel map
  var T = {                            // ms — tuned so 3 slams stay snappy
    flyIn: 380, anticipate: 130,
    wind: 80, strike: 70, squash: 55, recoil: 130, quiver: 80,
    flyOut: 300, gap: 40
  };
  var SLOW = 1;                        // debug: >1 stretches every motion
  var DUST_COLORS = ["#ed3b00", "#ff9d6b", "#ff3131", "#fff3dc", "#ffd21e"];

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- palette: reads the live theme so the finger complements both modes  */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
    return v || fallback;
  }
  var INK     = "#1b1238";             // constant dark outline (works both)
  var HILITE  = "#ff9d6b";             // plastic highlight
  var STEEL_L = "#eef1ff", STEEL_M = "#c9d1f5", STEEL_D = "#8e97cf";
  var GRIP_D  = "#1c2b8f";
  var RED     = "#ff3131", RED_D = "#c8102e";
  var EYE     = "#fff6ea";

  function palette() {
    return {
      K: INK,
      o: cssVar("--pcl-primary", "#ed3b00"),        // hand plastic
      O: cssVar("--pcl-primary-deep", "#a02800"),   // hand shade
      h: HILITE,
      w: STEEL_L, s: STEEL_M, S: STEEL_D,           // chrome shaft
      g: cssVar("--pcl-secondary", "#2440c8"),      // grip
      G: GRIP_D,
      y: cssVar("--pcl-gold", "#e8a200"),           // grip band
      r: RED, R: RED_D,                             // anger mark
      e: EYE
    };
  }

  /* ---- pixel map ----------------------------------------------------------
     One straight 45-degree anti-diagonal: fingertip (top-left) → fist →
     chrome shaft → navy grip (bottom-right, off toward the screen edge).
     Drawn programmatically, then auto-outlined, then the anger mark is
     stamped last so it floats free of the outline. */
  function buildMap() {
    var N = GRID, m = [], r, c, i;
    for (r = 0; r < N; r++) { m.push([]); for (c = 0; c < N; c++) m[r].push("."); }
    function put(rr, cc, ch) {
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) m[rr][cc] = ch;
    }

    /* 1. index finger — 3px diagonal band reaching up-left, the hero */
    for (i = 1; i <= 9; i++) {
      put(i, i, "h");        // lit top edge
      put(i, i + 1, "o");
      put(i + 1, i, "O");    // underside
    }

    /* 2. fist — rounded block, light from top-left */
    var spans = { 8: [11, 16], 9: [10, 17], 10: [9, 18], 11: [9, 18],
                  12: [9, 18], 13: [9, 18], 14: [10, 17], 15: [11, 16] };
    for (r = 8; r <= 15; r++) {
      for (c = spans[r][0]; c <= spans[r][1]; c++) put(r, c, "o");
    }
    for (c = 11; c <= 16; c++) put(8, c, "h");          // top light
    for (c = 10; c <= 17; c++) put(9, c, "h");
    for (r = 10; r <= 11; r++) put(r, 9, "h");          // upper-left light
    for (c = 11; c <= 16; c++) put(15, c, "O");         // bottom shade
    for (c = 10; c <= 17; c++) put(14, c, "O");
    for (r = 12; r <= 13; r++) { put(r, 17, "O"); put(r, 18, "O"); }
    put(11, 18, "O");

    /* 3. furious little face on the back of the hand */
    put(9, 11, "K"); put(10, 12, "K");                  // brows: angry V
    put(9, 16, "K"); put(10, 15, "K");
    put(11, 11, "e"); put(11, 12, "e");                 // eyes
    put(12, 11, "e"); put(12, 12, "e");
    put(11, 15, "e"); put(11, 16, "e");
    put(12, 15, "e"); put(12, 16, "e");
    put(12, 12, "K"); put(12, 15, "K");                 // pupils (inner)
    put(13, 13, "K"); put(13, 14, "K");                 // gritted mouth

    /* 4. chrome shaft — 3px diagonal with glints, hidden under the fist */
    for (i = 15; i <= 31; i++) {
      put(i, i, ((i % 5) === 0) ? "w" : "s");
      put(i, i + 1, "s");
      put(i + 1, i, "S");
    }

    /* 5. grip: gold collar ring + navy handle toward bottom-right */
    put(24, 24, "y"); put(24, 25, "y"); put(25, 24, "y");
    for (i = 25; i <= 31; i++) {
      put(i, i, "g"); put(i, i + 1, "g"); put(i + 1, i, "G");
    }
    put(31, 31, "G"); put(31, 30, "G");

    /* 6. wrist seam — dark ring where hand meets shaft */
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      var ch = m[r][c];
      if (ch !== "o" && ch !== "O" && ch !== "h") continue;
      if (near(m, r, c, ["s", "S", "w", "g", "G", "y"])) m[r][c] = "K";
    }

    /* 7. auto-outline — every empty cell hugging the figure becomes ink.
       Reads from a SNAPSHOT: outlining into the live map would chain-react
       into a flood fill (fresh K neighbours validating fresh K cells). */
    var snap = m.map(function (row) { return row.slice(); });
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (snap[r][c] === "." && near(snap, r, c, true)) m[r][c] = "K";
    }

    /* 8. manga anger-mark, stamped free of the outline (top-right) */
    var A = 2, B = 21;                                  // rows 2-6, cols 21-25
    var STAR = [[2, 0], [2, 1], [2, 3], [2, 4],
                [1, 1], [1, 2], [1, 3],
                [0, 2], [2, 2],
                [3, 1], [3, 2], [3, 3],
                [4, 0], [4, 1], [4, 3], [4, 4]];
    STAR.forEach(function (p) {
      put(A + p[0], B + p[1], p[0] === 0 || p[1] === 0 ||
        p[1] === 4 ? "R" : "r");
    });

    function near(src, rr, cc, chars) {
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr2 = rr + dr, cc2 = cc + dc;
        if (rr2 < 0 || rr2 >= N || cc2 < 0 || cc2 >= N) continue;
        var ch2 = src[rr2][cc2];
        if (chars === true ? ch2 !== "." : chars.indexOf(ch2) !== -1) return true;
      }
      return false;
    }
    return m;
  }

  /* ---- sprite canvas ------------------------------------------------------ */
  var PAL = palette();
  function paintCanvas(scale) {
    var cv = document.createElement("canvas");
    cv.width = GRID; cv.height = GRID;
    cv.className = "pcl-finger-sprite";
    cv.style.width = GRID * scale + "px";
    cv.style.height = GRID * scale + "px";
    cv.style.imageRendering = "pixelated";
    var ctx = cv.getContext("2d");
    var map = buildMap();
    for (var r = 0; r < GRID; r++) for (var c = 0; c < GRID; c++) {
      var ch = map[r][c];
      if (ch === ".") continue;
      ctx.fillStyle = PAL[ch] || "#f0f";
      ctx.fillRect(c, r, 1, 1);
    }
    return cv;
  }

  /* theme flip → repaint palette (hand orange stays, grip/gold shift) */
  new MutationObserver(function () { PAL = palette(); })
    .observe(document.documentElement, { attributes: true,
      attributeFilter: ["data-pcl-theme"] });

  /* ---- stage -------------------------------------------------------------- */
  var stage = null;
  function ensureStage() {
    if (stage) return stage;
    stage = document.createElement("div");
    stage.className = "pcl-finger-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML =
      "<style>" +
      ".pcl-finger-stage{position:fixed;inset:0;pointer-events:none;z-index:99999}" +
      ".pcl-finger{position:absolute;left:0;top:0;will-change:transform;" +
      "transform-origin:50% 50%;filter:drop-shadow(0 0 9px rgba(237,59,0,.5)) " +
      "drop-shadow(0 3px 0 rgba(27,18,56,.35))}" +
      ".pcl-finger canvas{display:block;image-rendering:pixelated}" +
      ".pcl-fx-dust{position:absolute;left:0;top:0;will-change:transform,opacity}" +
      "@keyframes pclSlamShake{0%,100%{transform:translate(0,0)}" +
      "18%{transform:translate(-4px,2px)}36%{transform:translate(4px,-2px)}" +
      "54%{transform:translate(-3px,1px)}72%{transform:translate(2px,0)}}" +
      "@keyframes pclSlamFlash{0%{box-shadow:0 0 0 0 rgba(237,59,0,0)}" +
      "25%{box-shadow:0 0 0 4px rgba(237,59,0,.55),0 0 18px 6px rgba(237,59,0,.4)}" +
      "100%{box-shadow:0 0 0 2px rgba(237,59,0,0)}}" +
      ".pcl-slam-hit{animation:pclSlamShake .24s steps(2,end) 1," +
      "pclSlamFlash .5s ease-out 1}" +
      "@media (prefers-reduced-motion:reduce){.pcl-slam-hit{" +
      "animation:pclSlamFlash .5s ease-out 1}}" +
      "</style>";
    (document.body || document.documentElement).appendChild(stage);
    return stage;
  }

  /* ---- helpers ------------------------------------------------------------ */
  function anim(el, frames, opts) {
    return el.animate(frames, opts).finished;
  }
  function tf(x, y, rot, sc) {
    var s = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    if (rot) s += " rotate(" + rot + "deg)";
    if (sc && sc !== 1) s += " scale(" + sc + ")";
    return s;
  }
  function pickScale() {
    var w = window.innerWidth;
    return w < 480 ? 3 : w < 900 ? 4 : 5;
  }
  function firstInput(root) {
    return root.querySelector('input:not([type=file]), textarea');
  }

  /* Find the element the finger should poke for a SurveyJS question:
     - file question → the visible choose-file button
     - text/comment  → its (aria-invalid) input, else the first input
     - anything else → the question root                                        */
  function resolveTarget(q) {
    var root = document.getElementById(q.id) ||
      document.querySelector('[data-name="' + q.name + '"]');
    if (!root) return null;
    var t = null;
    if (q.getType && q.getType() === "file") {
      t = root.querySelector(".sd-file__choose-btn");
    } else {
      t = root.querySelector(
        'input[aria-invalid="true"], textarea[aria-invalid="true"]');
      if (!t) t = firstInput(root);
    }
    if (!t || t.hidden) t = root;
    var rc = t.getBoundingClientRect();
    if (!rc.width && !rc.height) t = root;      // never poke an invisible node
    return t;
  }

  /* tip position: lands just inside the field's right end, mid-height */
  function tipFor(rect, scale) {
    var x = rect.right + 4 - Math.min(26, rect.width * 0.12);
    var y = rect.top + rect.height * 0.55;
    x = Math.min(x, window.innerWidth - GRID * scale * 0.55);
    x = Math.max(x, GRID * scale * 0.12);
    y = Math.max(70, Math.min(y, window.innerHeight - GRID * scale - 16));
    return { x: x, y: y };
  }

  /* ---- FX ------------------------------------------------------------------ */
  function spawnDust(x, y, scale, opts) {
    opts = opts || {};
    var n = opts.count || 8;
    for (var i = 0; i < n; i++) {
      var d = document.createElement("span");
      d.className = "pcl-fx-dust";
      var size = 3 + Math.round(Math.random() * (scale - 2));
      d.style.width = size + "px"; d.style.height = size + "px";
      d.style.background = opts.color ||
        DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0];
      ensureStage().appendChild(d);
      var ang, dist;
      if (opts.up) {                                   // steam puff
        ang = -90 + (Math.random() * 50 - 25);
        dist = 10 + Math.random() * 12;
      } else {                                         // splash fan, away hit
        ang = 180 + (Math.random() * 150 - 75);        // mostly leftwards
        dist = 14 + Math.random() * 26;
      }
      var rad = ang * Math.PI / 180;
      var dx = Math.cos(rad) * dist, dy = Math.sin(rad) * dist;
      d.style.transform = "translate(" + x + "px," + y + "px)";
      d.animate([
        { transform: "translate(" + x + "px," + y + "px) scale(1)",
          opacity: 1 },
        { transform: "translate(" + (x + dx) + "px," + (y + dy) +
          "px) scale(.35)", opacity: 0 }
      ], { duration: (opts.dur || 300) + Math.random() * 120,
           easing: "cubic-bezier(.2,.7,.4,1)" })
        .finished.then(function (el) { return function () { el.remove(); }; }(d))
        .catch(function () {});
    }
  }

  function impactFX(tip, target, scale) {
    /* field: hard shake + glow flash */
    var box = target.closest(".sd-formbox") || target;
    if (box && box.classList) {
      box.classList.remove("pcl-slam-hit");
      void box.offsetWidth;                       // restart the animation
      box.classList.add("pcl-slam-hit");
      setTimeout(function () { box.classList.remove("pcl-slam-hit"); }, 650);
    }
    spawnDust(tip.x - 2, tip.y + 2, scale, { count: 8 + ((Math.random() * 3) | 0) });
  }

  /* ---- the poke ------------------------------------------------------------ */
  function slamQuestion(q) {
    return new Promise(function (resolve) {
      var target = resolveTarget(q);
      if (!target) return resolve();

      if (REDUCED) {                              // calm mode: glow only
        var b = target.closest(".sd-formbox") || target;
        if (b && b.classList) {
          b.classList.add("pcl-slam-hit");
          setTimeout(function () { b.classList.remove("pcl-slam-hit"); }, 600);
        }
        return resolve();
      }

      var scale = pickScale();
      var size = GRID * scale;
      var rect = target.getBoundingClientRect();
      var tip = tipFor(rect, scale);
      var off = Math.max(window.innerWidth - tip.x, window.innerHeight - tip.y) +
        size + 40;
      var sx = tip.x + off, sy = tip.y + off;     // start: off bottom-right

      var wrap = document.createElement("div");
      wrap.className = "pcl-finger";
      wrap.style.width = size + "px";
      wrap.style.height = size + "px";
      wrap.appendChild(paintCanvas(scale));
      ensureStage().appendChild(wrap);

      function leave() { wrap.remove(); resolve(); }

      /* FLY IN — swoops along its own 45° axis from the bottom-right edge */
      anim(wrap, [
        { transform: tf(sx, sy, 7) },
        { transform: tf(tip.x, tip.y, -4), offset: 0.84 },
        { transform: tf(tip.x, tip.y, 0) }
      ], { duration: T.flyIn * SLOW, easing: "cubic-bezier(.22,.75,.3,1)",
           fill: "forwards" })

      /* ANGRY ANTICIPATION — tiny rise, like inhaling before a shout */
      .then(function () {
        return anim(wrap, [
          { transform: tf(tip.x, tip.y, 0) },
          { transform: tf(tip.x + 5, tip.y + 5, -3) },
          { transform: tf(tip.x, tip.y, 0) }
        ], { duration: T.anticipate * SLOW, easing: "ease-in-out",
             fill: "forwards" });
      })

      /* SLAMS — randomized 1..3, always quick */
      .then(function () {
        var n = 1 + ((Math.random() * 3) | 0);
        var seq = Promise.resolve();
        for (var i = 0; i < n; i++) (function (k) {
          seq = seq.then(function () {
            var back = 15 + k * 2;               // angrier each time
            var deep = 8 + k * 2;                // digs a bit deeper
            /* wind up + steam off the hand */
            spawnDust(tip.x + size * 0.34, tip.y + size * 0.28, scale,
              { up: true, count: 2, color: cssVar("--pcl-primary-hi", "#ff5a1f"),
                dur: 380 });
            return anim(wrap, [
              { transform: tf(tip.x, tip.y, 0) },
              { transform: tf(tip.x + back, tip.y + back, 3) }
            ], { duration: T.wind * SLOW, easing: "ease-out",
                 fill: "forwards" })
            /* strike: accelerate INTO the field */
            .then(function () {
              return anim(wrap, [
                { transform: tf(tip.x + back, tip.y + back, 3) },
                { transform: tf(tip.x - deep, tip.y - deep, -2), offset: 0.72 },
                { transform: tf(tip.x - deep, tip.y - deep, -2, 0.95) }
              ], { duration: (T.strike + T.squash) * SLOW,
                   easing: "cubic-bezier(.65,0,.9,.45)", fill: "forwards" });
            })
            .then(function () {
              impactFX({ x: tip.x - deep, y: tip.y - deep }, target, scale);
              /* recoil + furious quiver */
              var rBack = (k === n - 1) ? 22 : 10;
              return anim(wrap, [
                { transform: tf(tip.x - deep, tip.y - deep, -2, 0.95) },
                { transform: tf(tip.x + rBack - 2, tip.y + rBack - 2, 1),
                  offset: 0.55 },
                { transform: tf(tip.x + rBack, tip.y + rBack + 1, 2),
                  offset: 0.75 },
                { transform: tf(tip.x + rBack - 1, tip.y + rBack, 1) }
              ], { duration: (T.recoil + T.quiver) * SLOW,
                   easing: "cubic-bezier(.2,.8,.4,1)", fill: "forwards" });
            })
            .then(function () {
              if (k < n - 1) {
                return new Promise(function (res) {
                  setTimeout(res, T.gap * SLOW);
                });
              }
            });
          });
        })(i);
        return seq;
      })

      /* FLY OUT — storms off back to the bottom-right edge */
      .then(function () {
        return anim(wrap, [
          { transform: tf(tip.x + 22, tip.y + 22, 2) },
          { transform: tf(sx, sy, 8) }
        ], { duration: T.flyOut * SLOW, easing: "cubic-bezier(.5,0,.8,.4)",
             fill: "forwards" });
      })
      .then(leave)
      .catch(leave);
    });
  }

  /* ---- queue: fingers take turns, one active at a time --------------------- */
  var chain = Promise.resolve();
  var lastSlam = {};                              // per-question cooldown

  function enqueue(questions) {
    var now = Date.now();
    var list = (questions || []).filter(function (q) {
      return q && q.errors && q.errors.length &&
        (!lastSlam[q.name] || now - lastSlam[q.name] > 1500);
    }).slice(0, 4);                               // never flood the screen
    list.forEach(function (q) { lastSlam[q.name] = now; });
    list.forEach(function (q) {
      chain = chain.then(function () { return slamQuestion(q); })
        .catch(function () {});
    });
  }

  window.PCL_FingerSlam = {
    slam: enqueue,
    /* debug helpers (used during development) */
    debugSlow: function (f) { SLOW = f || 1; },
    debugSlamByName: function (name) {
      var s = window.__pclSurvey;
      var q = s && s.getQuestionByName(name);
      if (!q) return;
      if (!q.errors || !q.errors.length) q.hasErrors(true);
      enqueue([q]);
    },
    debugSprite: function (scale) {
      var d = document.createElement("div");
      d.style.cssText = "position:fixed;left:20px;top:20px;z-index:100000;" +
        "background:#888;padding:8px";
      d.appendChild(paintCanvas(scale || 8));
      document.body.appendChild(d);
      return d;
    }
  };
})();
