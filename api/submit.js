/**
 * Vercel serverless function (Node 18 runtime, zero dependencies).
 * Path in production: POST /api/submit
 *
 * Receives the form payload (same-origin → normal JSON, no CORS tricks)
 * and forwards it to the Google Apps Script Web App whose URL lives in
 * the GOOGLE_SCRIPT_WEBAPP_URL environment variable — so the GAS URL is
 * never exposed to the browser and you can swap backends without edits.
 *
 * Why maxDuration = 60: Hobby-plan functions default to a 10 s kill and
 * died mid-GAS while the sheet write was still running — the browser then
 * saw a plain-text gateway timeout. A submission (photo + screenshots →
 * Drive + Sheets) legitimately needs 5–25 s, so claim the full ceiling.
 *
 * Failure semantics the frontend relies on (js/app.js postJson):
 *   - JSON body with ok:false  → hard server rejection, chain STOPS.
 *   - Non-JSON body / network error → treated as a network drop, the
 *     transport chain falls through to the direct-GAS leg. That is why
 *     the catch block answers text/plain, never a JSON {ok:false}.
 *
 * Local development: `vercel dev` + .env.local with the same variable.
 * Frontend switch: js/gas-endpoint.js → submitViaApi: true
 */
module.exports.maxDuration = 60;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  const target = process.env.GOOGLE_SCRIPT_WEBAPP_URL;
  if (!target) {
    res.status(500).json({
      ok: false,
      error:
        "GOOGLE_SCRIPT_WEBAPP_URL is not set. Add it in Vercel → Settings → " +
        "Environment Variables (or .env.local for vercel dev)."
    });
    return;
  }

  /* Vercel's hard body ceiling is 4.5 MB — refuse earlier with a readable
     reason instead of a gateway error the player can't act on. The form
     downscales every screenshot to ≤1600px JPEG, so this only fires on
     pathological payloads (e.g. a stale pre-diet draft). */
  const len = Number(req.headers["content-length"] || 0);
  if (len > 4.4 * 1024 * 1024) {
    res.status(413).json({
      ok: false,
      error:
        "Payload too large (" + (len / 1048576).toFixed(1) +
        " MB) — remove and re-add the largest screenshot, then retry."
    });
    return;
  }

  /* Kill the upstream call BEFORE Vercel kills the function, and answer
     the abort in plain text: the frontend reads a non-JSON answer as a
     network drop and falls through to the direct-GAS leg, whereas a JSON
     {ok:false} would read as a hard rejection and wrongly stop the chain. */
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 55000);
  try {
    const upstream = await fetch(target, {
      method: "POST",
      // Apps Script happily accepts any content-type server-side; it only
      // reads e.postData.contents.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: ctrl.signal
    });
    clearTimeout(kill);
    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (err) {
    clearTimeout(kill);
    res.status(502).type("text/plain").send("upstream unreachable");
  }
};
