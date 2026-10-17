/* ============================================================================
   PCL CONFIG — the only file you edit to wire the backend, change limits,
   or toggle the fun extras on/off for a deployment.
   ========================================================================== */

window.PCL_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here (ends with /exec).
  // Leave "" to run in LOCAL mode: submissions are logged to the browser
  // console + localStorage so you can demo the form without any backend.
  gasWebAppUrl: "https://script.google.com/macros/s/AKfycbwo1u5E_InTvhjaw5XyhDQlJKt-QCFZRq-wSzlb6yNWdVN3WYXAeAMQHekvcaB3tnFN/exec",

  // Set true on a Vercel deployment: submissions POST to /api/submit and the
  // serverless function forwards them to Google Apps Script using the
  // GOOGLE_SCRIPT_WEBAPP_URL environment variable (URL stays secret, no CORS
  // concerns). Keep false for pure static hosting (GitHub Pages / local).
  submitViaApi: true,

  // Hard cap per uploaded attachment, in MB.
  // Enforced client-side (SurveyJS maxSize) AND server-side (Code.gs guard).
  maxFileMB: 5,

  // Accepted upload types for the analytics screenshot input.
  fileTypes: "image/png, image/jpeg, image/webp"
};
