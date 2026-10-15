/* ============================================================================
   PCL CONFIG — the only file you edit to wire the backend or change limits
   ========================================================================== */

window.PCL_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here (ends with /exec).
  // Leave "" to run in LOCAL mode: submissions are logged to the browser
  // console + localStorage so you can demo the form without any backend.
  gasWebAppUrl: "",

  // Hard cap per uploaded attachment, in MB.
  // Enforced client-side (SurveyJS maxSize) AND server-side (Code.gs guard).
  maxFileMB: 5,

  // Accepted upload types for the analytics screenshot input.
  fileTypes: "image/png, image/jpeg, image/webp"
};
