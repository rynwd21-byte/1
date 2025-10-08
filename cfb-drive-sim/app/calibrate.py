from __future__ import annotations
import math, random
from statistics import mean
from typing import Optional
from sqlalchemy import select
from .db import SessionLocal
from .models import Game, Team
from .sim_engine import Simulator, TeamState, GameState
from .model_params import set_param

def league_ppg(season: int) -> Optional[float]:
    # Compute average points per team per game from DB games table
    with SessionLocal() as sess:
        rows = sess.execute(select(Game).where(Game.season == season)).scalars().all()
        pts = []
        for g in rows:
            if g.home_pts is not None and g.away_pts is not None:
                pts.append(g.home_pts)
                pts.append(g.away_pts)
        if not pts:
            return None
        return mean(pts)

def sample_random_matchups(k: int) -> list[tuple[TeamState, TeamState]]:
    with SessionLocal() as sess:
        teams = sess.execute(select(Team)).scalars().all()
        if len(teams) < 2:
            return []
        out = []
        for _ in range(k):
            a, b = random.sample(teams, 2)
            a_state = TeamState(name=a.name, off_rush=a.off_rush or 0, off_pass=a.off_pass or 0,
                                def_rush=a.def_rush or 0, def_pass=a.def_pass or 0, st=a.st or 0)
            b_state = TeamState(name=b.name, off_rush=b.off_rush or 0, off_pass=b.off_pass or 0,
                                def_rush=b.def_rush or 0, def_pass=b.def_pass or 0, st=b.st or 0)
            out.append((a_state, b_state))
        return out

def calibrate_coef_scale(target_ppg: float, season_for_matchups: int, samples: int = 2000, seed: int | None = None) -> float:
    # We tune a scalar 'coef_scale' that multiplies the drive model's coefficients inside Simulator.
    rng = random.Random(seed)
    sim = Simulator()
    # Helper: evaluate PPG given coef_scale
    def eval_scale(scale: float, trials: int = 300) -> float:
        sim.set_coef_scale(scale)
        # couple hundred random matchups
        m = sample_random_matchups(min(trials, samples))
        if not m:
            return 0.0
        pts = []
        for i, (h, a) in enumerate(m):
            s = rng.randrange(0, 10_000_000)
            gs = GameState(home=h, away=a)
            out = sim.sim_game(gs, seed=s)
            pts.append(out.score_home); pts.append(out.score_away)
        return (sum(pts) / len(pts)) if pts else 0.0

    # Coarse to fine search
    lo, hi = 0.5, 2.0
    best_scale = 1.0
    best_err = float('inf')
    for _ in range(12):
        mid = (lo + hi) / 2
        ppg = eval_scale(mid, trials=400)
        err = abs(ppg - target_ppg)
        if err < best_err:
            best_err, best_scale = err, mid
        if ppg < target_ppg:
            lo = mid
        else:
            hi = mid
    # Save
    set_param("coef_scale", float(best_scale))
    return float(best_scale)

def run(season: int, samples: int = 2000, seed: int | None = None) -> dict:
    target = league_ppg(season)
    if target is None:
        return {"ok": False, "error": "No completed games in DB for that season."}
    scale = calibrate_coef_scale(target_ppg=target, season_for_matchups=season, samples=samples, seed=seed)
    return {"ok": True, "target_ppg": target, "coef_scale": scale}
