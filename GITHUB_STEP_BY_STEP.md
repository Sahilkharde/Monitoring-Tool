# GitHub: step by step (from basics)

This guide assumes your project folder is **Monitoring Tool** on your PC and you want the app on **GitHub** + **GitHub Pages** (frontend) and **Render** (backend API). Adjust names (repo name, URLs) to match yours.

---

## Part 1 — Account and new repository

### Step 1: GitHub account
1. Open **[https://github.com](https://github.com)**.
2. Sign up or sign in.

### Step 2: Create a new empty repository
1. Click the **+** (top right) → **New repository**.
2. **Repository name:** e.g. `OTT-Monitoring` (no spaces, or use hyphens).
3. Choose **Public** (free Pages is fine on public repos; private needs paid plan for some features).
4. **Do not** add README, .gitignore, or license if you already have code locally (avoids merge conflicts). Or add them if the folder is empty.
5. Click **Create repository**.

GitHub shows a page with commands like `git remote add origin ...` — keep that tab open for Part 3.

---

## Part 2 — Put your code on GitHub (from your PC)

### Step 3: Open terminal in your project folder
PowerShell:

```powershell
cd "c:\Monitoring Tool"
```

### Step 4: Check if Git is already initialized
```powershell
git status
```

- If you see **“not a git repository”**, run:
  ```powershell
  git init
  git add .
  git commit -m "Initial commit"
  ```
- If you already have commits, skip `git init` and only `git add` / `git commit` if you have new changes.

### Step 5: Connect this folder to your GitHub repo
Use the **HTTPS** URL GitHub shows (example):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

If `origin` already exists and is wrong:

```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### Step 6: Push your branch
See which branch you use:

```powershell
git branch
```

- If it says **`* master`**:
  ```powershell
  git push -u origin master
  ```
- If you prefer **`main`** (GitHub’s default name):
  ```powershell
  git branch -M main
  git push -u origin main
  ```

If GitHub asks for login, use a **Personal Access Token** as the password (not your GitHub password):  
**Settings → Developer settings → Personal access tokens** → generate with **repo** scope.

### Step 7: Refresh GitHub in the browser
Open `https://github.com/YOUR_USERNAME/YOUR_REPO` — you should see your files (`frontend`, `backend`, `netlify.toml`, etc.).

---

## Part 3 — Backend on Render (get a real API URL)

GitHub Pages only hosts the **website files**. Login needs a **Python API** somewhere public.

### Step 8: Render account and service
1. Go to **[https://render.com](https://render.com)** and sign up (you can use **Sign in with GitHub**).
2. **New** → **Blueprint** (or **Web Service** if you prefer manual).
3. Connect the **same GitHub repo**, select this repository.
4. If you use **Blueprint**, pick **`render.yaml`** in the repo root and deploy.  
   Otherwise create a **Web Service**, set **Root Directory** to `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. In the Render service **Environment**, add at least:
   - **`SECRET_KEY`** — long random string (any password generator).
   - Optional: **`GEMINI_API_KEY`**, **`DATABASE_URL`** (Postgres), etc.
6. Wait until deploy is **Live**. Copy the URL, e.g. `https://ott-monitoring-api.onrender.com`.

### Step 9: Test the API in the browser
Open:

`https://YOUR-SERVICE.onrender.com/api/ping`

You should see JSON like `{"ok":true,...}`.  
If that fails, fix Render before continuing.

---

## Part 4 — GitHub Pages (frontend) + secrets

### Step 10: Turn on GitHub Pages (Actions)
1. On GitHub, open your repo → **Settings** (tab).
2. Left menu → **Pages**.
3. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from a branch” for this project).

### Step 11: Add the API URL secret (required)
1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. **Name:** `VITE_API_BASE_URL`  
   **Value:** `https://YOUR-SERVICE.onrender.com/api`  
   - Use your **real** Render hostname.  
   - End with **`/api`** (no slash after `api`).
4. Save.

### Step 12: (Optional) Subpath on GitHub Pages only
Use this **only** if your site URL looks like:

`https://USERNAME.github.io/REPO-NAME/`  

(not `https://USERNAME.github.io/` at the root)

1. **New repository secret**  
   **Name:** `VITE_BASE_PATH`  
   **Value:** `/REPO-NAME/` (slash before and after the repo name, matching the URL path).

### Step 13: Run the deploy workflow
1. Repo → **Actions** tab.
2. Click **Deploy frontend to GitHub Pages** on the left.
3. **Run workflow** → branch **main** or **master** → **Run workflow**.

Wait until it turns **green**. If it fails, open the failed job and read the red error (often missing `VITE_API_BASE_URL`).

### Step 14: Open the live site
1. **Settings** → **Pages** — GitHub shows **“Your site is live at …”** (or check the workflow summary link).
2. Open that URL, go to **Login**.
3. Use **`amudha.kaliamoorthi@horizonind.org`** / **`Admin@2026`** (seeded when the API first starts; SQLite on Render may reset on free tier — if login fails with “invalid credentials”, trigger a new deploy or add Postgres).

---

## Part 5 — When you change code later

1. On your PC: `git add .` → `git commit -m "message"` → `git push`.
2. GitHub Actions rebuilds Pages automatically (if the workflow is set to run on push to `main`/`master` and paths include `frontend/`).
3. If you **only** changed the backend, push still helps; Render may auto-redeploy if connected to the repo.

---

## Quick checklist

| Step | Done? |
|------|--------|
| Repo exists on GitHub with your code | ☐ |
| Render API live, `/api/ping` works in browser | ☐ |
| Secret `VITE_API_BASE_URL` set exactly to `https://...onrender.com/api` | ☐ |
| Pages **Source** = **GitHub Actions** | ☐ |
| Workflow **Deploy frontend to GitHub Pages** succeeded | ☐ |
| Login works on the Pages URL | ☐ |

More detail: **[DEPLOY.md](./DEPLOY.md)**.
