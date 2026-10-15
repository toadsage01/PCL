# Architecture — Praper Contest League Form

Small, free, zero-build architecture. Static front end + Google Apps Script
backend + Google Sheets/Drive storage. Nothing to pay for, nothing to patch.

## Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Browser — static site (this repo, root)                 │
│                                                          │
│  index.html                                              │
│   ├─ SurveyJS Form Library (MIT, vendored 3.2.1)         │
│   ├─ css/theme.css        ← brand tokens → --sjs2-* vars │
│   ├─ js/gas-endpoint.js   ← CONFIG: GAS URL, max file MB │
│   ├─ js/survey-config.js  ← declarative form definition  │
│   └─ js/app.js            ← bootstrap + submit hook      │
│                                                          │
│  Validations (client, instant):                          │
│   • URL inputs  → inputType:url + urlvalidator           │
│   • Attachments → maxSize (bytes) + acceptedTypes        │
│   • Dual inputs → multipletext / panel grouping          │
└───────────────┬──────────────────────────────────────────┘
                │  HTTPS POST — JSON body, simple request
                │  (text/plain content-type → no CORS preflight,
                │   which is exactly what Apps Script needs)
                ▼
┌──────────────────────────────────────────────────────────┐
│  Google Apps Script Web App (gas/Code.gs)                │
│   Execute as: Me   ·   Access: Anyone                    │
│                                                          │
│   doPost:                                                │
│    1. parse payload {submissionId, submittedAt, data}    │
│    2. file answers → base64-decode → Drive folder        │
│       (skips anything over MAX_FILE_MB server-side)      │
│    3. flatten answers → append row to Sheet              │
│       (auto-extends columns when questions change)       │
│                                                          │
│   doGet: metrics JSON                                    │
│    → {ok, totalSubmissions, lastSubmissionAt}            │
└───────────────┬──────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────┐
│  Google Sheets "Submissions"        Google Drive folder  │
│  Timestamp | Submission ID | answers… | Raw JSON    "PCL Uploads"  │
│  → evaluation & metrics             → attachments        │
└──────────────────────────────────────────────────────────┘
```

## Component map

| Piece | File | Role |
|---|---|---|
| Form page | `index.html` | Shell; loads vendored SurveyJS (offline-ready) |
| Theme | `css/theme.css` | Brand tokens + SurveyJS `--sjs2-*` variable mapping |
| Form definition | `js/survey-config.js` | Questions, validators, size caps (declarative JSON) |
| Endpoint config | `js/gas-endpoint.js` | GAS URL, `maxFileMB`, accepted file types |
| Bootstrap | `js/app.js` | Renders survey; CORS-safe POST; LOCAL-mode fallback |
| Backend | `gas/Code.gs` | Sheet append + Drive upload + metrics |
| Local hosting | `serve.sh` | One command: `./serve.sh [port]` |

## Data flow

1. Contestant fills the form. URL fields validate as-you-blur; oversized
   attachments are rejected **before** upload starts (client cap).
2. On submit, `app.js` wraps answers as
   `{submissionId, submittedAt, data}`. `data` contains files as base64
   data-URLs (SurveyJS `storeDataAsText`).
3. The payload is POSTed to the GAS `/exec` URL as a simple request
   (no preflight → works with Apps Script without extra headers).
4. `doPost` decodes attachments into Drive (`PCL Uploads` folder, shareable
   links), then appends one spreadsheet row: timestamp, ID, every answer,
   plus the raw JSON for future re-parsing.
5. Metrics: `GET /exec` returns totals; the Sheet itself is the evaluation
   dataset (pivot/filter freely).

## Failure & fallback behaviour

- **No GAS URL configured** → LOCAL mode: payload logged to console +
  `localStorage["pcl_submissions"]`. Great for demos; zero setup.
- **GAS returns an error** → the form shows the save-failure state and logs
  the reason; the user can retry without retyping.
- **Attachment over cap** → blocked client-side; if a file sneaks through
  (e.g. client edited), `Code.gs` writes `REJECTED — over N MB cap` in the
  cell instead of polluting Drive.

## Scaling notes

- Apps Script quotas (free consumer account): ~20,000 URL-fetch calls/day,
  POST body up to ~50 MB — a weekly contest form is nowhere near these.
- Base64 inflates uploads by ~33%; that is why the default cap is 5 MB.
- Public hosting: enable **GitHub Pages** (branch `main`, root) — the site
  is already a static root `index.html`, so zero changes are needed.
