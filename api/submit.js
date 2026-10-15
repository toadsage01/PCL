/**
 * Vercel serverless function (Node 18 runtime, zero dependencies).
 * Path in production: POST /api/submit
 *
 * Receives the form payload (same-origin → normal JSON, no CORS tricks)
 * and forwards it to the Google Apps Script Web App whose URL lives in
 * the GOOGLE_SCRIPT_WEBAPP_URL environment variable — so the GAS URL is
 * never exposed to the browser and you can swap backends without edits.
 *
 * Local development: `vercel dev` + .env.local with the same variable.
 * Frontend switch: js/gas-endpoint.js → submitViaApi: true
 */
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

  try {
    const payload = req.body; // Vercel parses JSON bodies automatically
    const upstream = await fetch(target, {
      method: "POST",
      // Apps Script happily accepts any content-type server-side; it only
      // reads e.postData.contents.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
};
