# Host the app live (frontend + backend)

You can deploy the **UI** and **API** on the same domain (one server + reverse proxy) or on **two hosts** (static UI + API URL). This repo uses **`/api`** on the backend; the SPA calls **`/api/...`** (or a full `VITE_API_BASE_URL` in production).

---

## Before you deploy

1. **Secrets** — Never commit real keys. In the host’s dashboard, set at least:
   - `SECRET_KEY` — long random string (replace the dev default).
   - `GEMINI_API_KEY` or `GOOGLE_API_KEY` (and optionally `OPENAI_API_KEY`) for AI chat.
   - `DATABASE_URL` — for real production, prefer **Postgres** (Neon, Supabase, Railway). SQLite on ephemeral disks can reset when the container restarts.
2. **CORS** — Backend already allows `allow_origins=["*"]`. For stricter production, narrow this to your UI origin in `backend/app/main.py`.
3. **Default passwords** — Change seeded accounts or disable signup rules as needed.

---

## Path A — Same domain (recommended simplicity)

One machine or one PaaS “full stack” app serves:

- Static files from `frontend/dist` for `/`
- Reverse proxy: `/api` → uvicorn (FastAPI)

### 1) Build the frontend (on your PC or in CI)

```bash
cd frontend
npm ci
npm run build
```

If the API will **not** be on the same origin, set the API base **before** build:

```bash
# Example: API at https://api.yourdomain.com with routes under /api
set VITE_API_BASE_URL=https://api.yourdomain.com/api
npm run build
```

On Linux/macOS use `export VITE_API_BASE_URL=...` instead of `set`.

If UI and API share one origin and nginx proxies `/api` to the backend, **omit** `VITE_API_BASE_URL` (defaults to `/api`).

### 2) Run the backend

```bash
cd backend
pip install -r requirements.txt
# Optional real browser scans (large); else keep USE_BROWSER_SCAN=false
# playwright install chromium
export SECRET_KEY="your-long-random-secret"
# Optional Postgres: pip install -r requirements-postgres.txt first, then e.g.
export DATABASE_URL="postgresql+psycopg://USER:PASS@HOST:5432/DBNAME"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3) Reverse proxy (example: Caddy)

Install [Caddy](https://caddyserver.com/), put `dist/` somewhere (e.g. `/var/www/ott-ui`), and use a `Caddyfile` like:

```caddy
yourdomain.com {
    root * /var/www/ott-ui
    encode gzip
    file_server
    try_files {path} /index.html

    handle_path /api/* {
        reverse_proxy localhost:8000
    }
}
```

Reload Caddy, open `https://yourdomain.com`, log in, run a scan.

**Nginx** is similar: `location /api/ { proxy_pass http://127.0.0.1:8000; }` and `location / { try_files $uri /index.html; }` for the SPA.

---

## Path B — Split hosting (static UI + API host)

### Backend (example: Fly.io, Render, Railway, Google Cloud Run)

#### Option B1 — Docker (Fly.io / Render / Cloud Run)

From the **repository root** (Dockerfile is under `backend/`):

```bash
cd backend
docker build -t ott-api .
docker run -p 8000:8000 -e SECRET_KEY=change-me -e GEMINI_API_KEY=... ott-api
```

On **Render**: New **Web Service** → connect repo → Root Directory `backend` → Dockerfile path `Dockerfile` → set env vars → deploy.

On **Fly.io**: `fly launch` from `backend/` (or set `Dockerfile` path), set secrets with `fly secrets set`, `fly deploy`.

**Port:** The Dockerfile uses `${PORT:-8000}`. Your platform may inject `PORT`; that is fine.

**Playwright in Docker:** The default image sets `USE_BROWSER_SCAN=false`. To enable Chromium in production, extend the Dockerfile with Playwright’s documented dependencies and `playwright install chromium`, and set `USE_BROWSER_SCAN=true` (expect a **much larger** image and more RAM).

#### Option B2 — No Docker (Render native Python)

- Root Directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set the same env vars as in `.env` (see README).

### Frontend (example: Cloudflare Pages, Netlify, Vercel)

1. Connect the Git repo to the platform.
2. **Project / root directory:** `frontend`
3. **Build command:** `npm ci && npm run build`
4. **Output directory:** `dist`
5. **Environment variables (build time):**

   | Name | Example |
   |------|--------|
   | `VITE_API_BASE_URL` | `https://your-api.onrender.com/api` |

   Use the **public HTTPS URL** of your API, including the **`/api`** suffix (same path prefix FastAPI uses).

6. Trigger a deploy. Open the Pages URL and test login + scans.

**SPA routing:** If the host serves static files, enable **“single-page app” / rewrite all routes to `index.html`** (Cloudflare: “SPA”; Netlify: `_redirects` with `/* /index.html 200`).

---

## Checklist after go-live

| Check | Action |
|-------|--------|
| API health | Open `https://YOUR-API-HOST/api/ping` → should return JSON with `"ok": true`. |
| UI → API | Log in; if errors mention 404, wrong `VITE_API_BASE_URL` or proxy. |
| HTTPS | Use HTTPS everywhere; set secure cookies if you add them later. |
| DB | Confirm `DATABASE_URL` points to a persistent Postgres for production. |
| AI | Confirm `GEMINI_API_KEY` / billing; optional `OPENAI_API_KEY` for fallback. |

---

## Quick reference

| Topic | Detail |
|-------|--------|
| Frontend build | `cd frontend && npm ci && npm run build` → output `frontend/dist` |
| Production API URL | Set `VITE_API_BASE_URL` at **build** time if UI and API differ |
| Backend run | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Docker | `backend/Dockerfile`; build context = `backend/` directory |

For provider-specific screenshots (Render env UI, Fly secrets, Cloudflare build vars), use that provider’s current docs; the flow above matches all of them.

---

## Netlify (frontend only)

Netlify hosts the **static React app** from `frontend/`. It does **not** run Python. Deploy your **FastAPI backend** first (Render, Fly.io, Railway, etc.), then point the UI at it.

### 1) Deploy the API somewhere

Get a public URL that serves your app, e.g. `https://ott-api.onrender.com`, with routes under **`/api`** (same as local). Confirm in a browser:

`https://YOUR-API-HOST/api/ping` → `{"ok":true,...}`

### 2) Create the Netlify site

1. Go to [https://app.netlify.com](https://app.netlify.com) and sign in.
2. **Add new site** → **Import an existing project** → connect **GitHub/GitLab/Bitbucket** and select this repo.  
   *Or* drag-and-drop the `frontend/dist` folder after a local `npm run build` (**Deploy manually** — then you must rebuild and upload whenever you change code; Git is easier.)
3. Netlify reads **`netlify.toml`** at the repo root:
   - **Base directory:** `frontend`
   - **Build command:** `npm ci && npm run build`
   - **Publish directory:** `dist` (relative to `frontend/`)

### 3) Set the API URL (required if API is not on the same domain)

**Site configuration → Environment variables → Add a variable**

| Key | Value (example) | Scope |
|-----|-------------------|--------|
| `VITE_API_BASE_URL` | `https://ott-api.onrender.com/api` | **Build** (and “Same value” for Deploy Previews if you want previews to work) |

Rules:

- Include **`https://`** and the **`/api`** suffix (no trailing slash after `api`).
- Vite inlines this at **build** time. After changing the variable, trigger **Deploys → Trigger deploy → Clear cache and deploy site**.

If you later put UI and API on the **same** domain behind a reverse proxy, you can remove `VITE_API_BASE_URL` and rebuild so the app uses relative **`/api`**.

### 4) Custom domain (optional)

**Domain management → Add domain**, follow DNS (CNAME to Netlify). HTTPS is automatic.

### 5) Verify

1. Open your Netlify URL (e.g. `https://random-name.netlify.app`).
2. Log in with a seeded user (or signup if enabled).
3. If login fails with a **404** or CORS error, recheck **`VITE_API_BASE_URL`** and that the backend allows your Netlify origin (this repo’s CORS is `*` by default).

### Netlify CLI (optional)

```bash
npm i -g netlify-cli
cd frontend
# Link once: netlify login && netlify init
export VITE_API_BASE_URL=https://your-api.example.com/api
npm run build
netlify deploy --prod --dir=dist
```

For a linked site, set `VITE_API_BASE_URL` in the Netlify UI and use Git pushes so Netlify runs the build in the cloud.

---

## GitHub Pages (frontend only)

If the site URL looks like **`https://YOURNAME.github.io/...`**, that is **static hosting only**. There is **no Python API** there. If you did **not** set **`VITE_API_BASE_URL`** when building, the app still calls **`/api/...` on `github.io`**, which cannot run login — you often see **`405 Method Not Allowed`** or **`404`**, not “wrong password”.

### Fix (pick one)

**A) Automated (recommended)** — this repo includes **`.github/workflows/github-pages.yml`**.

1. **GitHub repo** → **Settings** → **Secrets and variables** → **Actions** → **New repository secrets**  
   - **`VITE_API_BASE_URL`** (required) — e.g. **`https://YOUR-RENDER-SERVICE.onrender.com/api`** (no trailing slash after `api`).  
   - **`VITE_BASE_PATH`** (optional) — only if the site is **Project Pages** at `https://user.github.io/REPO-NAME/` → set to **`/REPO-NAME/`** (leading slash, trailing slash). Omit for user/organization sites at the domain root.
2. **Settings** → **Pages** → **Build and deployment** → **Source: GitHub Actions**
3. Push to **`main`** or **`master`**, or open **Actions** → run **Deploy frontend to GitHub Pages** manually.

Every deploy **rebuilds** the frontend so the Render URL is baked into the JS.

**B) Manual build on your PC**

```bash
cd frontend
# Windows PowerShell:
$env:VITE_API_BASE_URL="https://YOUR-RENDER-SERVICE.onrender.com/api"
npm run build
```

Upload the contents of **`frontend/dist`** to whatever powers your GitHub Pages branch (or commit `dist` if that is how you publish).

### Render backend checklist

- This repo includes **`render.yaml`** at the root: in Render use **New → Blueprint** and connect the repo to create the Python web service from `backend/` (then add **`SECRET_KEY`**, **`GEMINI_API_KEY`**, etc. in the dashboard).
- Open **`https://YOUR-SERVICE.onrender.com/api/ping`** in a browser — expect `{"ok":true,...}`.
- **SQLite on Render** without a persistent disk resets when the instance restarts; seeded users are recreated on startup if the DB is empty. Prefer **Postgres** (`DATABASE_URL`) for stable production users.
- CORS: this project allows **`*`** by default; if you tightened CORS, add your **`https://YOURNAME.github.io`** origin.
