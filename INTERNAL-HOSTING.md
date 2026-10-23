# Internal portal hosting (PCL repo only)

This copy of the league exists for **company-internal hosting**. The public
repo (`Praper-Contest-League`) stays on Vercel and is untouched; code syncs
one-way from it, and everything Docker/Terraform lives **here**.

```
Praper-Contest-League (public, Vercel)  ──sync──▶  PCL (this repo, internal)
                                                        │
                                          docker / docker compose / terraform
```

## What the container runs

A single zero-dependency Node 20 process (`server.js`) that does two jobs:

1. **Serves the static portals** — `index.html` (submit form),
   `leaderboard.html`, `admin.html`, `director.html` plus `css/ js/ fonts/
   assets/`.
2. **`POST /api/submit`** — replaces the Vercel serverless function with the
   exact same contract, so the browser code never changes between hosts:
   - 4.4 MB body ceiling → 413 with a readable message
   - present-but-non-`@praper.in` work email → 422 (absent email still
     forwards so stale cached pages keep landing)
   - forwards to the Apps Script `/exec` URL; if upstream is unreachable it
     answers **502 plain text** on purpose (the frontend reads non-JSON as a
     network drop and falls through to the direct-GAS transport leg)
3. `GET /healthz` → `ok` (health checks / load balancers)

## Quickstart — Docker Compose

```bash
cp .env.example .env          # paste the real /exec URL into .env
docker compose up -d --build
curl http://localhost:3000/healthz
```

## Quickstart — Terraform (docker provider)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill gas_web_app_url
terraform init
terraform apply
```

Terraform builds the image from the repo `Dockerfile` and runs container
`pcl-web` on `var.host_port` (default 3000) with the env wired. Re-run
`terraform apply` after every sync to roll the new build out.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Listen port inside the container | `3000` |
| `GOOGLE_SCRIPT_WEBAPP_URL` | Apps Script `/exec` URL (same value as Vercel's env var) | **required** |
| `EMPLOYEE_DOMAIN` | Work-email domain accepted at `/api/submit` | `praper.in` |

## Updating

```bash
git pull                      # or: git fetch upstream && git merge upstream/main
docker compose up -d --build  # rebuild + replace in one command
```

Sync flow: `git remote add upstream
https://github.com/toadsage01/Praper-Contest-League.git` then
`git fetch upstream && git merge upstream/main`. Nothing flows back — the
public repo never receives infra files from here.

## Notes

- The GAS URL is injected at **runtime** via env — never baked into the
  image, so the image is safe to share/push anywhere.
- Reverse-proxy the portal (nginx/traefik) if you want it on a hostname or
  behind SSO; terminate TLS there and proxy to `127.0.0.1:3000`.
- `.env` and `terraform/terraform.tfvars` are git-ignored patterns — keep
  real values out of commits.
