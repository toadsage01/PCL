/**
 * PCL internal-portal server — zero-dependency Node (18+), Docker-native.
 *
 * This file exists ONLY in the PCL repo (the company-internal hosting
 * copy). The public repo keeps its Vercel deployment untouched: Vercel
 * runs api/submit.js as a serverless function, this server implements the
 * SAME contract as a plain long-running process so the browser code never
 * changes between the two hosts.
 *
 * Routes:
 *   GET  /healthz        → 200 "ok" (orchestrators / load balancers)
 *   POST /api/submit     → same semantics as api/submit.js:
 *       · body ceiling 4.4 MB          → 413 JSON {ok:false}
 *       · non-@praper.in work email    → 422 JSON {ok:false} (absent email
 *         still forwards — stale cached pages keep landing)
 *       · forwards to GOOGLE_SCRIPT_WEBAPP_URL; upstream unreachable → 502
 *         PLAIN TEXT (the frontend reads non-JSON as a network drop and
 *         falls through to the direct-GAS leg — never answer ok:false here)
 *   anything else        → static file from this repo's root
 *
 * Env:
 *   PORT                    default 3000
 *   GOOGLE_SCRIPT_WEBAPP_URL  required for /api/submit (Apps Script /exec)
 *   EMPLOYEE_DOMAIN         default praper.in
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DOMAIN = String(process.env.EMPLOYEE_DOMAIN || "praper.in")
  .toLowerCase();
const GAS_URL = String(process.env.GOOGLE_SCRIPT_WEBAPP_URL || "");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".gs": "text/plain; charset=utf-8"
};

function send(res, code, body, type, cache) {
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": cache || "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  });
  res.end(body);
}

function readBody(req, cap, cb) {
  let raw = "", size = 0, dead = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > cap) { dead = true; return cb(new Error("too large")); }
    raw += c;
  });
  req.on("end", () => { if (!dead) cb(null, raw); });
  req.on("error", () => { if (!dead) { dead = true; cb(new Error("read error")); } });
}

/* ---- /api/submit — mirrors api/submit.js failure semantics ------------- */
function handleSubmit(req, res) {
  readBody(req, 4.4 * 1024 * 1024, (err, raw) => {
    if (err) {
      return send(res, 413, JSON.stringify({ ok: false,
        error: "Payload too large — remove and re-add the largest " +
               "screenshot, then retry." }), "application/json; charset=utf-8");
    }
    if (!GAS_URL) {
      return send(res, 500, JSON.stringify({ ok: false,
        error: "GOOGLE_SCRIPT_WEBAPP_URL is not set — add it to the " +
               "container/compose/Terraform environment." }),
        "application/json; charset=utf-8");
    }
    let body = null;
    try { body = JSON.parse(raw || "{}"); } catch (e) { body = null; }
    const email = String((((body || {}).data || {}).email) || "")
      .trim().toLowerCase();
    if (email && !email.endsWith("@" + DOMAIN)) {
      return send(res, 422, JSON.stringify({ ok: false,
        error: "Entries must carry a @" + DOMAIN + " work email — fix the " +
               "Work email field in Participant Details and resubmit." }),
        "application/json; charset=utf-8");
    }
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), 55000);
    fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
      signal: ctrl.signal
    }).then((up) => {
      clearTimeout(kill);
      return up.text().then((txt) =>
        send(res, up.status, txt,
          up.headers.get("content-type") || "application/json; charset=utf-8",
          "no-store"));
    }).catch(() => {
      clearTimeout(kill);
      /* PLAIN TEXT on purpose — non-JSON = network drop for the browser,
         which then falls through to the direct-GAS transport leg */
      send(res, 502, "upstream unreachable", "text/plain; charset=utf-8",
        "no-store");
    });
  });
}

/* ---- static files ------------------------------------------------------ */
function serveStatic(res, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0]); }
  catch (e) { return send(res, 400, "bad path"); }
  if (p === "/" || p === "") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    return send(res, 403, "forbidden");
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "not found");
    const ext = path.extname(file).toLowerCase();
    const cache = ext === ".html" ? "no-cache"
      : /^(\.css|\.js|\.mjs|\.woff2?|\.ttf|\.png|\.jpg|\.jpeg|\.webp|\.svg|\.ico)$/.test(ext)
        ? "public, max-age=3600" : "no-cache";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.split("?")[0] === "/healthz") {
    return send(res, 200, "ok", "text/plain; charset=utf-8", "no-store");
  }
  if (req.method === "POST" && req.url.split("?")[0] === "/api/submit") {
    return handleSubmit(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(res, req.url);
  }
  send(res, 405, "method not allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[pcl-web] listening on 0.0.0.0:" + PORT +
    (GAS_URL ? " (GAS wired)" : " (NO GOOGLE_SCRIPT_WEBAPP_URL — /api/submit will 500)"));
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
