from __future__ import annotations
import asyncio
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import SessionLocal, engine, Base
from .models import Team, Game
from .cfbd import get as cfbd_get

def init_db():
    # Create tables if not exist
    Base.metadata.create_all(bind=engine)

def upsert_team(sess: Session, name: str, conference: Optional[str] = None) -> Team:
    t = sess.execute(select(Team).where(Team.name == name)).scalar_one_or_none()
    if not t:
        t = Team(name=name, conference=conference or None)
        sess.add(t)
        sess.flush()
    else:
        # update conference if changed
        if conference and t.conference != conference:
            t.conference = conference
    return t

async def fetch_and_store_teams() -> int:
    init_db()
    data = await cfbd_get("/teams/fbs")
    count = 0
    with SessionLocal() as sess:
        for item in data:
            name = item.get("school")
            conf = item.get("conference")
            if not name:
                continue
            upsert_team(sess, name=name, conference=conf)
            count += 1
        sess.commit()
    return count

async def fetch_and_store_games(season: int, team: Optional[str] = None, week: Optional[int] = None) -> int:
    init_db()
    params = {"year": season}
    if week is not None:
        params["week"] = week
    if team:
        params["team"] = team
    data = await cfbd_get("/games", params=params)
    count = 0
    with SessionLocal() as sess:
        # Ensure teams exist
        for g in data:
            home = upsert_team(sess, g.get("home_team"))
            away = upsert_team(sess, g.get("away_team"))
            # Use CFBD game id if present, else let SQLite autoincrement
            # We'll match on (season, week, home_id, away_id)
            season_v = g.get("season")
            week_v = g.get("week")
            home_pts = g.get("home_points")
            away_pts = g.get("away_points")
            date_v = g.get("start_date") or g.get("start_time_tbd")
            neutral = 1 if g.get("neutral_site") else 0

            # See if exists:
            exists = sess.execute(
                select(Game).where(
                    Game.season == season_v,
                    Game.week == week_v,
                    Game.home_id == home.team_id,
                    Game.away_id == away.team_id
                )
            ).scalar_one_or_none()
            if exists:
                # update scores if now known
                changed = False
                if home_pts is not None and exists.home_pts != home_pts:
                    exists.home_pts = home_pts; changed = True
                if away_pts is not None and exists.away_pts != away_pts:
                    exists.away_pts = away_pts; changed = True
                if date_v and exists.date != date_v:
                    exists.date = date_v; changed = True
                if exists.neutral != neutral:
                    exists.neutral = neutral; changed = True
                if changed:
                    sess.add(exists)
            else:
                game = Game(season=season_v, week=week_v, date=str(date_v) if date_v else None,
                            neutral=neutral, home_id=home.team_id, away_id=away.team_id,
                            home_pts=home_pts, away_pts=away_pts)
                sess.add(game)
            count += 1
        sess.commit()
    return count
