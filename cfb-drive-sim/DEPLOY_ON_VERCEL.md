# Deploy the API to Vercel (Python Runtime)

Official docs: https://vercel.com/docs/frameworks/backend/fastapi

## Steps
1. Push this backend folder to a GitHub repo (or import directly via Vercel).
2. Ensure **entrypoint** is present: `index.py` with `from app.api import app` (done).
3. Keep `requirements.txt` minimal (done). Avoid heavy ML deps in runtime to stay under the 250MB function bundle limit.
4. In Vercel dashboard: **New Project → Import** your repo → deploy. Or via CLI:
   ```bash
   npm i -g vercel && vercel
   ```

### Local dev
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn index:app --port 8000 --reload
```

### Notes & Limits
- Vercel Functions bundle limit ~250MB (uncompressed). Keep runtime deps small.
- Cold starts are possible on low traffic. For heavier workloads or background jobs, consider Render/Railway/Fly.io.
- Static frontend (React/Vite) should be deployed as a separate project on Vercel and pointed to the API URL.
