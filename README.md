# Monitoring-Tool

A full-stack monitoring tool that performs live security, performance, and code quality analysis on any website URL. Built with React + Python/FastAPI.

**Hosting live:** **[GITHUB_STEP_BY_STEP.md](./GITHUB_STEP_BY_STEP.md)** (GitHub + Pages + Render from zero). Technical detail: **[DEPLOY.md](./DEPLOY.md)**. Backend: root **`render.yaml`** on Render; frontend build needs **`VITE_API_BASE_URL`**.

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Scans use **Playwright Chromium** for real navigation, Core Web Vitals, and optional login flows. Without `playwright install chromium`, the API still runs but agents fall back to HTTP-only analysis. Set `USE_BROWSER_SCAN=false` in `backend/.env` to skip browser startup entirely.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser. The dev server proxies `/api` using **`frontend/.env.development`** (`VITE_API_PROXY`, default **`http://127.0.0.1:8001`**). Override that file or pass `VITE_API_PROXY=http://127.0.0.1:PORT npm run dev` so it matches your uvicorn `--port`.

SQLite data is stored at **`backend/vzy_agent.db`** (absolute path in config) so it does not depend on which folder you start the API from.

### Login shows “Not Found”

That message is almost always **HTTP 404**: the UI is **not talking to this app’s FastAPI** (wrong proxy port, backend stopped, or another program already on port 8000). Wrong email/password would be **401 / Invalid credentials**, not “Not Found”.

1. Start API: `cd backend` then `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001` (or **8000** if nothing else uses it).  
2. Set **`frontend/.env.development`** → `VITE_API_PROXY=http://127.0.0.1:PORT` using the **same PORT** as uvicorn (the repo defaults to **8001** to avoid clashes with other apps on 8000).  
3. In another terminal: `cd frontend` then `npm run dev` (restart Vite after changing `.env.development`).  
4. Open **http://localhost:5173** (not `file://`).  
5. Check **http://127.0.0.1:8001/api/ping** (same port as step 1) — you should see `{"ok":true,...}`.

### Default login (seeded on first backend start)

These accounts are created automatically if they do not already exist (see `backend/app/main.py`):

| Email | Password | Role |
|-------|----------|------|
| amudha.kaliamoorthi@horizonind.org | Admin@2026 | Admin |
| devops@vzy.com | DevOps@2026 | DevOps |
| dev@vzy.com | Dev@2026 | Developer |
| exec@vzy.com | Exec@2026 | Executive |

**Self‑serve sign up:** while `DEBUG=true` (default in `backend/app/config.py`) or `ALLOW_PUBLIC_REGISTRATION=true`, the login screen shows **Create an account** and `POST /api/auth/signup` registers a **developer** user. In production, set `DEBUG=false` and only enable `ALLOW_PUBLIC_REGISTRATION` if you intend open registration.

## Features

- **Security Analysis**: SSL checks, HTTP headers, OWASP Top 10, cookie/token auditing, API exposure, DRM detection
- **Performance Analysis**: Lighthouse-style scoring, Core Web Vitals (LCP, FCP, CLS, TTFB, TBT, INP), CDN analysis
- **Code Quality**: JS complexity analysis, dead code detection, memory leak patterns, anti-patterns, tech debt
- **Control Center**: Scan scheduling (cron), KPI thresholds, notification integrations
- **Reporting**: Overview, Management, Developer reports with PDF/PPTX export, Mind Map visualization
- **Competition**: Compare your site against competitor OTT platforms
- **AI Chat**: Google Gemini or OpenAI powered assistant (Developer / Management modes)
- **RBAC**: Admin, DevOps, Developer, Executive (view-only) roles

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS v4, Recharts, Framer Motion, Zustand
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite
- **AI**: Google Gemini (recommended) or OpenAI — keys in `backend/.env`, never committed

## Environment Variables

Create `backend/.env` (do **not** commit real keys). Restart the API after any change. The backend loads **`backend/.env` first** even when you start `uvicorn` from the repo root, so `GEMINI_API_KEY` is picked up reliably.

```
# AI Chat — Gemini (paste the full key from AI Studio or Cloud Console; see note below if it starts with AQ.)
GEMINI_API_KEY=your-google-ai-studio-key
# GOOGLE_API_KEY=your-key   # optional alternative env name (same value style as above)
GEMINI_MODEL=gemini-2.0-flash

# Optional fallback if GEMINI_API_KEY is unset
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o

USE_BROWSER_SCAN=true
PLAYWRIGHT_TIMEOUT_MS=45000
DEBUG=false
ALLOW_PUBLIC_REGISTRATION=false
```

Primary entry point: [Google AI Studio → API keys](https://aistudio.google.com/apikey).

### If AI Studio only shows keys starting with `AQ.`

Google’s UI is inconsistent: the **list** or **details** pane may show an **`AQ.`** identifier, while the HTTP Gemini API (`generativelanguage.googleapis.com`) still expects a key that works like the classic **`AIza…`** API keys for many accounts.

Try this order:

1. **Create API key** in AI Studio — when the **success dialog** appears, copy the key from that dialog immediately (scroll horizontally if needed). It may still be `AQ.` on newer rollouts; the app will try both header and query-string auth.
2. If requests still fail, create a key in **Google Cloud Console**:  
   [console.cloud.google.com](https://console.cloud.google.com/) → your project → **APIs & Services** → **Credentials** → **Create credentials** → **API key**.  
   Enable **Generative Language API** for that project. Restrict the key to **Generative Language API** when possible.  
   That flow still typically produces an **`AIza…`** string.

You can set either `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `backend/.env`. The backend tries `x-goog-api-key` first, then `?key=` as a fallback.

## Live scan data (per URL)

Each run is stored with its own `scan_id` and **normalized** `target_url` (adds `https://` if missing). The Overview page shows the **target** and **scan id** for the run you are viewing.

- If two sites **look** similar (same missing security headers, similar bundle heuristics), scores and findings can still **overlap** — that is normal. Compare **Target** and **scan_id** to confirm you opened the right run.
- For **real browser metrics**, run `playwright install chromium` on the machine hosting the API and keep `USE_BROWSER_SCAN=true`.
- The backend must reach the public internet to fetch Hotstar, Prime, etc. (no offline mock layer).

If you pasted an API key in chat or a ticket, **revoke it** in Google AI Studio and create a new one.
