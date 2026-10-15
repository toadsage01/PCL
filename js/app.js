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

  /* ---- header/footer status widgets ---- */
  var maxMb = document.getElementById("pclMaxSize");
  if (maxMb) maxMb.textContent = String(cfg.maxFileMB);

  var mode = document.getElementById("pclMode");
  if (mode) {
    mode.textContent = cfg.submitViaApi
      ? "Mode: Vercel API → Google Apps Script (URL kept secret server-side)"
      : cfg.gasWebAppUrl
        ? "Mode: Google Apps Script connected"
        : "Mode: LOCAL — submissions logged to console + localStorage " +
          "(paste your GAS /exec URL into js/gas-endpoint.js)";
  }

  /* ---- build the survey ---- */
  var survey = new Survey.Model(window.PCL_FORM);

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
    var q = survey.getQuestionByName(holder.getAttribute("data-name"));
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
