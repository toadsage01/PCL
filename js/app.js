/* ============================================================================
   PCL BOOTSTRAP — creates the survey, wires submission, renders the form.
   Submission strategy (CORS-safe):
     - Google Apps Script web apps cannot answer CORS preflights, so we send
       a SIMPLE fetch POST (default Content-Type: text/plain) carrying JSON.
       The GAS `doPost` parses e.postData.contents back into an object.
     - No GAS URL configured? LOCAL mode: payload logged to console and kept
       in localStorage (key: pcl_submissions) — perfect for offline demos.
   ========================================================================== */

(function () {
  var cfg = window.PCL_CONFIG;

  /* ---- theme toggle (light = praper brand, dark = night ride) ---- */
  var THEME_KEY = "pcl_theme";
  var toggleBtn = document.getElementById("pclThemeToggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var current =
        document.documentElement.getAttribute("data-pcl-theme") === "dark"
          ? "dark"
          : "light";
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-pcl-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ok */ }
    });
  }

  /* ---- footer: today's date (the only footer content per design) ---- */
  var dateEl = document.getElementById("pclDate");
  if (dateEl) {
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var now = new Date();
    dateEl.textContent = now.getDate() + " " + MONTHS[now.getMonth()] +
      " " + now.getFullYear();
  }

  /* ---- build the survey ---- */
  // Task-focused upload placeholder on every screenshot box (shorter than
  // the library default — one line instead of two).
  try {
    Survey.surveyLocalization.locales.en.filePlaceholder =
      "Drag & drop here, or use SELECT FILE.";
  } catch (e) { /* keep library default */ }

  var survey = new Survey.Model(window.PCL_FORM);

  /* Allow inline HTML in titles/descriptions — used for the styled
     required-star in the header sentence (<span class='pcl-req-star'>). */
  if (survey.onTextMarkdown) {
    survey.onTextMarkdown.add(function (s, options) {
      options.html = options.text;
    });
  }

  /* ---- bulk link parsing + row sync --------------------------------------
     "Post Links" accepts URLs separated by spaces, commas, semicolons or
     new lines. Every parsed link gets exactly one row in the "Post Details"
     dynamic panel; rows keep their format/screenshot when the list is
     re-pasted or edited (matched by link first, then by position). */
  var PCL_URL_RULES = {
    ig_reel:   { re: /instagram\.com\/(reel|reels)\/[\w-]+/i,
                 short: "an Instagram Reel link" },
    ig_post:   { re: /instagram\.com\/(p|reel|reels)\/[\w-]+/i,
                 short: "an Instagram post or carousel link" },
    yt_shorts: { re: /youtube\.com\/shorts\/[\w-]+/i,
                 short: "a YouTube Shorts link" },
    yt_long:   { re: /youtube\.com\/(watch\?v=[\w-]+|live\/[\w-]+)|youtu\.be\/[\w-]+/i,
                 short: "a YouTube video link" },
    li_post:   { re: /linkedin\.com\/(posts|feed\/update|pulse)\//i,
                 short: "a LinkedIn post link" }
  };

  function pclParseUrls(raw) {
    var out = [];
    String(raw || "").split(/[\s,;]+/).forEach(function (tok) {
      tok = tok.trim().replace(/[)\]}>,.;]+$/, "");
      if (!tok) return;
      if (!/^https?:\/\//i.test(tok)) {
        if (/^(www\.|[\w-]+\.[a-z]{2,})/i.test(tok)) tok = "https://" + tok;
        else return;
      }
      if (/^https?:\/\/[^\s]+\.[^\s]+/i.test(tok) && out.indexOf(tok) === -1) {
        out.push(tok);
      }
    });
    return out;
  }

  var FIELDS_TO_CARRY = ["format", "contentType",
                         "viewsImpressions", "analyticsScreenshot"];

  var pclSyncTimer = null;
  function pclScheduleSync() {
    clearTimeout(pclSyncTimer);
    pclSyncTimer = setTimeout(pclSyncPostPanels, 160);
  }

  function pclSyncPostPanels() {
    var pd = survey.getQuestionByName("postDetails");
    if (!pd) return;
    var urls = pclParseUrls(survey.getValue("postUrls"));

    // snapshot existing rows: keyed by link, plus in order for fallback
    var byLink = {}, byPos = [], consumed = [];
    pd.panels.forEach(function (p) {
      var snap = {};
      FIELDS_TO_CARRY.forEach(function (k) {
        snap[k] = p.getQuestionByName(k) && p.getQuestionByName(k).value;
      });
      var link = p.getQuestionByName("link").value;
      byPos.push(snap);
      if (link) byLink[link] = snap;
    });
    function take(snap) {
      if (!snap || consumed.indexOf(snap) !== -1) return null;
      consumed.push(snap);
      return snap;
    }

    pd.panelCount = urls.length;
    pd.panels.forEach(function (p, i) {
      p.getQuestionByName("link").value = urls[i];
      var snap = take(byLink[urls[i]]) || take(byPos[i]);
      if (!snap) return;
      FIELDS_TO_CARRY.forEach(function (k) {
        var q = p.getQuestionByName(k);
        var empty = q.value === undefined || q.value === null ||
                    q.value === "" ||
                    (Array.isArray(q.value) && !q.value.length);
        if (empty && snap[k] !== undefined && snap[k] !== null) {
          q.value = snap[k];
        }
      });
    });
  }

  survey.onValueChanged.add(function (s, options) {
    if (options.name === "postUrls") pclScheduleSync();
  });

  /* ---- validation ---------------------------------------------------------
     · link box  → at least one parseable URL
     · each row  → the link must match the format picked in that row
     (required flags, number bounds and file caps are SurveyJS-native). */
  survey.onValidateQuestion.add(function (s, options) {
    if (options.name === "postUrls") {
      if (pclParseUrls(options.value).length === 0) {
        options.error = "Paste at least one post link.";
      }
      return;
    }
    if (options.name === "link" && !s.isValueEmpty(options.value)) {
      var panel = options.question && options.question.parent;
      var fmtQ = panel && panel.getQuestionByName
        ? panel.getQuestionByName("format") : null;
      var rule = PCL_URL_RULES[fmtQ && fmtQ.value];
      if (rule && !rule.re.test(String(options.value))) {
        options.error = "This isn't " + rule.short + ".";
      }
    }
  });

  survey.onComplete.add(function (sender, options) {
    var payload = {
      submissionId: "pcl-" + Date.now().toString(36) +
        "-" + Math.random().toString(36).slice(2, 8),
      submittedAt: new Date().toISOString(),
      data: sender.data   // files arrive here as base64 data-URLs
    };

    if (options.showDataSaving) options.showDataSaving();

    var done;
    if (cfg.submitViaApi) {
      // Vercel mode: same-origin POST → /api/submit serverless function
      // forwards to GAS using process.env.GOOGLE_SCRIPT_WEBAPP_URL.
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
        // NOTE: no explicit Content-Type header → simple request → no
        // CORS preflight → Apps Script accepts it out of the box.
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
            var hist = JSON.parse(
              localStorage.getItem("pcl_submissions") || "[]"
            );
            hist.push(payload);
            localStorage.setItem("pcl_submissions", JSON.stringify(hist));
          } catch (e) { /* storage full/blocked — console log is enough */ }
          console.log("[PCL local mode] submission payload:", payload);
          resolve();
        }, 400); // brief pause so the saving indicator is perceivable
      });
    }

    done
      .then(function () {
        if (options.showDataSavingSuccess) options.showDataSavingSuccess();
        else if (options.showDataSavingClear) options.showDataSavingClear();
      })
      .catch(function (err) {
        console.error("[PCL] submission failed:", err);
        if (options.showDataSavingError) options.showDataSavingError();
      });
  });

  /* ---- file-input bridge -------------------------------------------------
     SurveyJS normally owns the file flow, but some browsers/automation
     paths set files on the visible input without SurveyJS's chooser ever
     seeing them. This bridge binds DIRECTLY to each file input (delegated
     container listeners miss non-bubbling change events) and fills the
     question only when its value is still empty — never double-processes. */
  function bindFileInputs(root) {
    var inputs = (root || document)
      .querySelectorAll("#surveyContainer input[type=file]");
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.__pclBound) return;
      input.__pclBound = true;
      input.addEventListener("change", pclFileChange);
    });
  }

  // Debug/power-user handle (also used by docs' advanced examples)
  window.__pclSurvey = survey;

  function pclFileChange(ev) {
    var input = ev.target || ev.currentTarget;
    console.log("[PCL bridge] change on", input);
    var holder = input.closest("[data-name]");
    if (!holder) return;
    var qName = holder.getAttribute("data-name");

    // Resolve the question instance. Inside the dynamic "Post Details"
    // rows the survey-level name lookup only reaches the template, so we
    // map the input's row (DOM order) to its panel instance.
    var q = null;
    var rowEl = input.closest(".sd-paneldynamic__panel-wrapper");
    if (rowEl) {
      var pd = survey.getQuestionByName("postDetails");
      var wrappers = document.querySelectorAll(
        "#surveyContainer .sd-paneldynamic__panel-wrapper");
      var idx = Array.prototype.indexOf.call(wrappers, rowEl);
      if (pd && pd.panels && pd.panels[idx]) {
        q = pd.panels[idx].getQuestionByName(qName);
      }
    } else {
      q = survey.getQuestionByName(qName);
    }
    if (!q || q.getType() !== "file") return;
    if (q.value && q.value.length) return; // SurveyJS flow already won

    var cap = (cfg.maxFileMB || 5) * 1024 * 1024;
    var accepted = (cfg.fileTypes || "")
      .split(",").map(function (s) { return s.trim(); })
      .filter(Boolean);
    var files = Array.prototype.slice.call(input.files || []);
    var pending = 0;
    var results = [];

    function flush() {
      if (pending === 0 && results.length) q.value = results;
    }

    files.forEach(function (file) {
      if (file.size > cap) {
        console.warn("[PCL bridge] rejected (over " +
          cfg.maxFileMB + " MB): " + file.name);
        try {
          q.errors.push(new Survey.Error(
            "File over " + cfg.maxFileMB + " MB cap: " + file.name));
        } catch (e) { /* non-fatal */ }
        return;
      }
      if (accepted.length && file.type &&
          accepted.indexOf(file.type) === -1) {
        console.warn("[PCL bridge] rejected type: " + file.name +
          " (" + file.type + ")");
        return;
      }
      pending++;
      var fr = new FileReader();
      fr.onload = function () {
        results.push({
          name: file.name,
          type: file.type,
          content: fr.result
        });
        pending--;
        flush();
      };
      fr.onerror = function () { pending--; flush(); };
      fr.readAsDataURL(file);
    });
  }

  // v3 render() expects an HTMLElement (not an id string)
  survey.render(document.getElementById("surveyContainer"));

  bindFileInputs();
  new MutationObserver(function () { bindFileInputs(); })
    .observe(document.getElementById("surveyContainer"),
             { childList: true, subtree: true });
})();
