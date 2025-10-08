import random
from fastapi import FastAPI
from pydantic import BaseModel
from statistics import mean, pstdev
from .sim_engine import Simulator, TeamState, GameState

app = FastAPI(title="CFB Drive Sim API")
sim = Simulator()

# CORS for local React dev
try:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    pass

class TeamIn(BaseModel):
    name: str
    off_rush: float
    off_pass: float
    def_rush: float
    def_pass: float
    st: float = 0.0

class MatchupIn(BaseModel):
    home: TeamIn
    away: TeamIn
    seed: int | None = None

@app.post("/simulate-game")
def simulate_game(m: MatchupIn):
    gs = GameState(
        home=TeamState(**m.home.model_dump()),
        away=TeamState(**m.away.model_dump()),
    )
    result = sim.sim_game(gs, seed=m.seed)
    return {
        "home": result.home.name,
        "away": result.away.name,
        "score_home": result.score_home,
        "score_away": result.score_away,
        "ot_periods": result.ot_periods,
    }

class SeriesIn(BaseModel):
    home: TeamIn
    away: TeamIn
    n: int = 1000
    seed: int | None = None
    include_samples: bool = False

@app.post("/simulate-series")
def simulate_series(req: SeriesIn):
    rng = random.Random(req.seed)
    home_scores = []
    away_scores = []
    ot_games = 0
    home_wins = 0
    for i in range(req.n):
        s = rng.randrange(0, 10_000_000)
        gs = GameState(
            home=TeamState(**req.home.model_dump()),
            away=TeamState(**req.away.model_dump()),
        )
        out = sim.sim_game(gs, seed=s)
        home_scores.append(out.score_home)
        away_scores.append(out.score_away)
        if out.ot_periods > 0:
            ot_games += 1
        if out.score_home > out.score_away:
            home_wins += 1
    away_wins = req.n - home_wins

    def q(arr, pct):
        if not arr:
            return None
        srt = sorted(arr)
        k = max(0, min(len(srt)-1, int(round((pct/100.0)*(len(srt)-1)))))
        return srt[k]

    resp = {
        "samples": req.n,
        "home_win_pct": home_wins/req.n,
        "away_win_pct": away_wins/req.n,
        "ot_rate": ot_games/req.n,
        "mean_score_home": mean(home_scores),
        "mean_score_away": mean(away_scores),
        "stdev_score_home": pstdev(home_scores),
        "stdev_score_away": pstdev(away_scores),
        "quantiles": {
            "home": {"p05": q(home_scores,5), "p50": q(home_scores,50), "p95": q(home_scores,95)},
            "away": {"p05": q(away_scores,5), "p50": q(away_scores,50), "p95": q(away_scores,95)},
        },
    }
    if req.include_samples and req.n <= 2000:
        resp["samples_detail"] = {"home": home_scores, "away": away_scores}
    return resp
from fastapi import HTTPException, Query
from .cfbd import get as cfbd_get

@app.get("/cfbd/teams")
async def cfbd_teams(fbs: bool = True):
    try:
        path = "/teams/fbs" if fbs else "/teams"
        return await cfbd_get(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/cfbd/games")
async def cfbd_games(season: int = Query(..., ge=1869, le=2100), week: int | None = None, team: str | None = None):
    try:
        params = {"year": season}
        if week is not None:
            params["week"] = week
        if team:
            params["team"] = team
        return await cfbd_get("/games", params=params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
from fastapi import HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import SessionLocal, Base, engine
from .models import Team
from .ingest import fetch_and_store_teams, fetch_and_store_games, init_db

@app.post("/ingest/teams")
async def ingest_teams():
    try:
        n = await fetch_and_store_teams()
        return {"inserted_or_updated": n}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/ingest/games")
async def ingest_games(season: int = Query(..., ge=1869, le=2100), team: str | None = None, week: int | None = None):
    try:
        n = await fetch_and_store_games(season=season, team=team, week=week)
        return {"inserted_or_updated": n}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class NamesIn(BaseModel):
    home_name: str
    away_name: str
    seed: int | None = None

@app.post("/simulate-by-name")
def simulate_by_name(names: NamesIn):
    init_db()
    with SessionLocal() as sess:
        home = sess.execute(select(Team).where(Team.name == names.home_name)).scalar_one_or_none()
        away = sess.execute(select(Team).where(Team.name == names.away_name)).scalar_one_or_none()
        if not home or not away:
            raise HTTPException(status_code=404, detail="Team not found in DB. Run /ingest/teams first or check names.")
        # Map DB team to TeamState; use stored unit ratings if present else 0.
        home_state = TeamState(name=home.name, off_rush=home.off_rush or 0, off_pass=home.off_pass or 0,
                               def_rush=home.def_rush or 0, def_pass=home.def_pass or 0, st=home.st or 0)
        away_state = TeamState(name=away.name, off_rush=away.off_rush or 0, off_pass=away.off_pass or 0,
                               def_rush=away.def_rush or 0, def_pass=away.def_pass or 0, st=away.st or 0)
        gs = GameState(home=home_state, away=away_state)
        out = sim.sim_game(gs, seed=names.seed)
        return {
            "home": out.home.name, "away": out.away.name,
            "score_home": out.score_home, "score_away": out.score_away,
            "ot_periods": out.ot_periods
        }


from typing import List
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import Team, Game
from .db import SessionLocal

@app.get("/teams/search")
def teams_search(q: str = "") -> List[dict]:
    q = q.strip()
    with SessionLocal() as sess:
        stmt = select(Team).order_by(Team.name.asc())
        if q:
            like = f"%{q}%"
            stmt = select(Team).where(Team.name.ilike(like)).order_by(Team.name.asc())
        rows = sess.execute(stmt).scalars().all()
        return [{"team_id": t.team_id, "name": t.name, "conference": t.conference} for t in rows]

@app.post("/ratings/seed")
def ratings_seed(season: int, scale: float = 10.0) -> dict:
    """Seed unit ratings from last season's points-for/against.
    - Off rating ~ (PF/G - league_avg_PF/G) * scale
    - Def rating ~ (league_avg_PA/G - PA/G) * scale   (so lower PA => higher rating)
    Both off_rush/off_pass set to Off rating; def_rush/def_pass set to Def rating.
    """
    with SessionLocal() as sess:
        # Aggregate PF/PA per team for the season
        teams = {t.team_id: {"obj": t, "pf": 0, "pa": 0, "g": 0} for t in sess.execute(select(Team)).scalars().all()}
        games = sess.execute(select(Game).where(Game.season == season)).scalars().all()
        for g in games:
            if g.home_pts is None or g.away_pts is None:
                continue
            # home
            if g.home_id in teams:
                teams[g.home_id]["pf"] += g.home_pts
                teams[g.home_id]["pa"] += g.away_pts
                teams[g.home_id]["g"]  += 1
            # away
            if g.away_id in teams:
                teams[g.away_id]["pf"] += g.away_pts
                teams[g.away_id]["pa"] += g.home_pts
                teams[g.away_id]["g"]  += 1
        # compute per-game and league averages
        per_game = []
        for tid, d in teams.items():
            if d["g"] > 0:
                pfg = d["pf"]/d["g"]
                pag = d["pa"]/d["g"]
                per_game.append((tid, pfg, pag))
        if not per_game:
            return {"updated": 0, "note": "No completed games found for that season. Run /ingest/games first."}
        avg_pf = sum(pfg for _, pfg, _ in per_game) / len(per_game)
        avg_pa = sum(pag for _, _, pag in per_game) / len(per_game)
        updated = 0
        now = datetime.utcnow().isoformat()
        for tid, pfg, pag in per_game:
            off_rating = (pfg - avg_pf) * scale
            def_rating = (avg_pa - pag) * scale
            t = teams[tid]["obj"]
            t.off_rush = off_rating
            t.off_pass = off_rating
            t.def_rush = def_rating
            t.def_pass = def_rating
            t.last_updated = now
            sess.add(t)
            updated += 1
        sess.commit()
        return {"updated": updated, "avg_pf": avg_pf, "avg_pa": avg_pa, "scale": scale}


from fastapi import Request
import os, asyncio, datetime as _dt

def _env_true(name: str, default: bool=False) -> bool:
    v = os.getenv(name)
    if v is None: return default
    return v.lower() in ("1", "true", "yes", "on")

@app.on_event("startup")
async def _bootstrap_on_startup():
    # For local dev or long-lived hosts only (Vercel will cold start per request)
    if _env_true("AUTO_BOOTSTRAP", False):
        try:
            await fetch_and_store_teams()
            year = _dt.datetime.utcnow().year
            await fetch_and_store_games(season=year)
        except Exception as e:
            # swallow errors to avoid crashing startup
            print("[bootstrap] skipped:", e)

@app.get("/cron/nightly")
async def cron_nightly(request: Request, seasons: str | None = None):
    # Protect with CRON_SECRET if provided
    secret = os.getenv("CRON_SECRET")
    if secret:
        token = request.headers.get("x-cron-secret") or request.query_params.get("token")
        if token != secret:
            return {"ok": False, "error": "unauthorized"}
    # Only accept vercel-cron UA if no secret set
    ua = request.headers.get("user-agent", "")
    if not secret and "vercel-cron" not in ua.lower():
        return {"ok": False, "note": "ignored: not vercel-cron and no token provided"}

    # Determine seasons (default: current & previous)
    years = []
    if seasons:
        years = [int(s.strip()) for s in seasons.split(",") if s.strip()]
    else:
        y = _dt.datetime.utcnow().year
        years = [y, y-1]

    # Ingest teams first
    await fetch_and_store_teams()

    # Ingest games for seasons
    total_games = 0
    for y in years:
        n = await fetch_and_store_games(season=y)
        total_games += n

    # Seed ratings for the most recently *completed* season (previous year)
    try:
        _ = ratings_seed(season=years[-1] if years[-1] < _dt.datetime.utcnow().year else years[-2], scale=10)
    except Exception as e:
        print("[cron] ratings seed skipped:", e)

    return {"ok": True, "teams": "upserted", "games_upserted": total_games, "seeded": True}

class SeriesByNameIn(BaseModel):
    home_name: str
    away_name: str
    n: int = 1000
    seed: int | None = None

@app.post("/simulate-series-by-name")
def simulate_series_by_name(req: SeriesByNameIn):
    init_db()
    with SessionLocal() as sess:
        home = sess.execute(select(Team).where(Team.name == req.home_name)).scalar_one_or_none()
        away = sess.execute(select(Team).where(Team.name == req.away_name)).scalar_one_or_none()
        if not home or not away:
            raise HTTPException(status_code=404, detail="Team not found in DB. Run /ingest/teams first or check names.")
        home_state = TeamState(name=home.name, off_rush=home.off_rush or 0, off_pass=home.off_pass or 0,
                               def_rush=home.def_rush or 0, def_pass=home.def_pass or 0, st=home.st or 0)
        away_state = TeamState(name=away.name, off_rush=away.off_rush or 0, off_pass=away.off_pass or 0,
                               def_rush=away.def_rush or 0, def_pass=away.def_pass or 0, st=away.st or 0)
    # run series using same core loop (no DB in loop)
    import random as _rnd
    rng = _rnd.Random(req.seed)
    home_wins = 0
    ot_games = 0
    home_scores, away_scores = [], []
    for i in range(req.n):
        s = rng.randrange(0, 10_000_000)
        gs = GameState(home=home_state, away=away_state)
        out = sim.sim_game(gs, seed=s)
        home_scores.append(out.score_home)
        away_scores.append(out.score_away)
        if out.ot_periods > 0: ot_games += 1
        if out.score_home > out.score_away: home_wins += 1
    from statistics import mean, pstdev
    def q(arr, pct):
        if not arr: return None
        srt = sorted(arr)
        k = max(0, min(len(srt)-1, int(round((pct/100.0)*(len(srt)-1)))))
        return srt[k]
    resp = {
        "samples": req.n,
        "home": req.home_name,
        "away": req.away_name,
        "home_win_pct": home_wins/req.n,
        "away_win_pct": 1 - (home_wins/req.n),
        "ot_rate": ot_games/req.n,
        "mean_score_home": mean(home_scores),
        "mean_score_away": mean(away_scores),
        "stdev_score_home": pstdev(home_scores),
        "stdev_score_away": pstdev(away_scores),
        "quantiles": {
            "home": {"p05": q(home_scores,5), "p50": q(home_scores,50), "p95": q(home_scores,95)},
            "away": {"p05": q(away_scores,5), "p50": q(away_scores,50), "p95": q(away_scores,95)},
        },
    }
    if req.include_samples and req.n <= 2000:
        resp["samples_detail"] = {"home": home_scores, "away": away_scores}
    return resp


from .model_params import get_params, set_param
from .calibrate import run as calibrate_run

@app.get("/model/params")
def model_params():
    return get_params()

@app.post("/model/params")
def set_model_param(name: str, value: float):
    set_param(name, float(value))
    # reinit simulator coefficients
    sim.set_coef_scale(get_params().get("coef_scale", 1.0))
    return {"ok": True, "params": get_params()}

@app.post("/model/calibrate")
def model_calibrate(season: int, samples: int = 2000, seed: int | None = None):
    out = calibrate_run(season=season, samples=samples, seed=seed)
    # refresh simulator
    sim.set_coef_scale(get_params().get("coef_scale", 1.0))
    return out


@app.get("/cron/calibrate")
def cron_calibrate(request: Request, season: int | None = None, samples: int = 2000):
    # Auth via CRON_SECRET (same as /cron/nightly)
    secret = os.getenv("CRON_SECRET")
    if secret:
        token = request.headers.get("x-cron-secret") or request.query_params.get("token")
        if token != secret:
            return {"ok": False, "error": "unauthorized"}
    # Default season: last completed year (UTC)
    import datetime as _dt
    if season is None:
        y = _dt.datetime.utcnow().year - 1
        season = y
    out = calibrate_run(season=season, samples=samples)
    # refresh live sim params
    sim.set_coef_scale(get_params().get("coef_scale", 1.0))
    return {"ok": True, "season": season, "result": out}
