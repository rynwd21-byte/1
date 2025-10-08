# CFB Drive-Level Simulator (FastAPI)

This is a minimal, DB-backed college football simulator that runs drive-level sims with NCAA OT rules and a series endpoint.

## Features
- FastAPI endpoints:
  - `POST /simulate-game` – sim one game (includes OT if needed)
  - `POST /simulate-series` – run N simulations; return win% and score distribution
- Simple, pluggable drive model (replace with trained model later)
- SQLite schema (optional) and code structure for growth

## Local Dev
```bash
python -m venv .venv && source .venv/bin/activate  # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
uvicorn index:app --reload  # serves at http://localhost:8000
```

## Endpoints (examples)
```bash
curl -X POST http://localhost:8000/simulate-game   -H 'Content-Type: application/json'   -d '{
    "home": {"name":"Home U","off_rush":20,"off_pass":20,"def_rush":10,"def_pass":10,"st":0},
    "away": {"name":"Away Tech","off_rush":10,"off_pass":10,"def_rush":20,"def_pass":20,"st":0}
  }'

curl -X POST http://localhost:8000/simulate-series   -H 'Content-Type: application/json'   -d '{
    "n": 1000,
    "home": {"name":"Home U","off_rush":20,"off_pass":20,"def_rush":10,"def_pass":10,"st":0},
    "away": {"name":"Away Tech","off_rush":10,"off_pass":10,"def_rush":20,"def_pass":20,"st":0}
  }'
```

## Deploying
- **Vercel (backend)**: Supported via the Python runtime. This repo includes an `index.py` as the ASGI entrypoint and `requirements.txt` kept minimal so bundle size stays below limits.
- **Vercel (frontend)**: The `/cfb-drive-sim-ui` folder can be deployed separately as a static React app. Point it at your API URL.
- **Alternatives**: For a stateful API or heavier deps, consider Render, Railway, Fly.io.

See `/DEPLOY_ON_VERCEL.md`.


## CFBD Integration
Set your API key in the environment:

- Local:
  ```bash
  export CFBD_API_KEY=your_key_here
  uvicorn index:app --reload
  ```

- Vercel project settings → Environment Variables → `CFBD_API_KEY`

Endpoints (pass your key via env):
- `GET /cfbd/teams?fbs=true`
- `GET /cfbd/games?season=2024&team=Texas`


## Ingest data automatically from CFBD
Requires `CFBD_API_KEY` in env (or Vercel project variable).

```bash
# 1) Teams (FBS list)
curl -X POST https://<your-api>/ingest/teams

# 2) Games for a season (optionally filter by team/week)
curl -X POST "https://<your-api>/ingest/games?season=2024"
curl -X POST "https://<your-api>/ingest/games?season=2024&team=Texas"
```

## Simulate by team names from the DB
```bash
curl -X POST https://<your-api>/simulate-by-name   -H 'Content-Type: application/json'   -d '{"home_name":"Texas","away_name":"Oklahoma"}'
```


## Nightly ingest via GitHub Actions (Neon/Supabase/Postgres)
This repo includes `.github/workflows/nightly-ingest.yml` which runs nightly at 06:15 UTC (and can be run on-demand).

**Setup:**
1. Host a Postgres DB (e.g., Neon, Supabase). Copy its connection string as `DATABASE_URL`.

   - Example (Neon): `postgresql://USER:PASSWORD@HOST/dbname?sslmode=require`

2. In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

   - `CFBD_API_KEY` = your CollegeFootballData API key

   - `DATABASE_URL` = your Postgres connection string

3. (Optional) Manually run the workflow with custom inputs for seasons/team/week.


**What it does:**

- Creates tables if needed

- Upserts the FBS teams list

- Upserts games for the given seasons (default: current & previous)



## Seed ratings from last season's results
After you've ingested games for a season, run:
```bash
# Example: 2024 season, scale=10 (bigger scale => larger rating spread)
curl -X POST "https://<your-api>/ratings/seed?season=2024&scale=10"
```
This computes simple offense/defense ratings from points per game vs league average and writes them to `off_rush/off_pass` and `def_rush/def_pass`.


## Automation (Vercel Cron + optional bootstrap)
- **Vercel Cron** is configured in `vercel.json` to call `GET /cron/nightly` daily at 06:15 UTC.
- Protect your cron by setting `CRON_SECRET` env var in Vercel, then configure the Cron Job to pass a header `x-cron-secret: <value>` or `?token=<value>`.

### Optional: bootstrap on startup (local dev)
Set `AUTO_BOOTSTRAP=true` to auto-ingest teams and current season on app start (not recommended on Vercel due to cold starts).


## Model calibration
- **HTTP (on-demand):** `POST /model/calibrate?season=2024&samples=2000` → tunes `coef_scale` to match observed league PPG; stored in DB and applied immediately.
- **Params API:** `GET /model/params` / `POST /model/params?name=coef_scale&value=1.1`
- **Weekly Github Action:** `.github/workflows/weekly-calibration.yml` runs Mondays 05:00 UTC and persists params into your DB.


### Nightly calibration (Vercel Cron)
- `vercel.json` includes a second cron that calls `GET /cron/calibrate` at **06:30 UTC**, 15 minutes after ingest.
- Protect both crons by setting `CRON_SECRET` in Vercel and configuring the job to pass `x-cron-secret` or `?token=`.
