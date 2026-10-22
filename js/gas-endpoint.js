/* ============================================================================
   PCL CONFIG — the only file you edit to wire the backend, change limits,
   or toggle the fun extras on/off for a deployment.
   ========================================================================== */

window.PCL_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here (ends with /exec).
  // Leave "" to run in LOCAL mode: submissions are logged to the browser
  // console + localStorage so you can demo the form without any backend.
  gasWebAppUrl: "https://script.google.com/macros/s/AKfycbxdY0N312upmv3VgfmG2DiVrlHdGGylv7jUk6Psa42Yp1NJotKURlJOoVpiKtly5iwe/exec",

  // Set true on a Vercel deployment: submissions POST to /api/submit and the
  // serverless function forwards them to Google Apps Script using the
  // GOOGLE_SCRIPT_WEBAPP_URL environment variable (URL stays secret, no CORS
  // concerns). Keep false for pure static hosting (GitHub Pages / local).
  submitViaApi: true,

  // Hard cap per uploaded attachment, in MB.
  // Enforced client-side (SurveyJS maxSize) AND server-side (Code.gs guard).
  maxFileMB: 5,

  // Accepted upload types for the analytics screenshot input.
  fileTypes: "image/png, image/jpeg, image/webp",

  // YouTube Data API v3 key (public, unrestricted — same key the GAS sync
  // leg uses). Lets the form read the OFFICIAL view count the moment a
  // YouTube link lands, so YouTube posts need nothing typed at all.
  // Leave "" to disable the client-side auto-read.
  ytApiKey: "AIzaSyChPgXr6U4MICfIPtdobUFTQHp_uS9veog",

  // ---- EMPLOYEE SIGN-IN (Google) — optional, off until YOU turn it on ----
  // 1. Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web app).
  // 2. Add your site origin (e.g. https://praper-contest-league.vercel.app)
  //    under "Authorized JavaScript origins".
  // 3. Paste the client ID here AND in gas/Code.gs (GOOGLE_OAUTH_CLIENT_ID).
  // 4. Paste the active-employee emails into the PCL-Allowlist tab of the
  //    league sheet (one @praper.in email per row from row 2 down).
  // Sign-in is then accepted ONLY for @praper.in accounts that are on that
  // list — verified server-side against Google's tokeninfo endpoint.
  // Leave "" to hide the sign-in card completely (the form works exactly
  // as before — Full Name + Reporting Manager identity).
  googleClientId: "",

  // The only work domain accepted at sign-in. Must match EMPLOYEE_DOMAIN
  // in gas/Code.gs.
  employeeDomain: "praper.in"
};
