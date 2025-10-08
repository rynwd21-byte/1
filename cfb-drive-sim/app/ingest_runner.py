import os, asyncio
from .ingest import fetch_and_store_teams, fetch_and_store_games, init_db

def env(name, default=None):
    v = os.getenv(name)
    return v if v is not None and v != "" else default

async def main():
    init_db()
    n = await fetch_and_store_teams()
    print("[ingest] teams upserted:", n)
    seasons = [s.strip() for s in env("SEASONS", "").split(",") if s.strip()]
    if not seasons:
        # default: current year and previous year
        import datetime
        y = datetime.datetime.utcnow().year
        seasons = [str(y), str(y-1)]
    team = env("TEAM")
    week = env("WEEK")
    week = int(week) if week else None
    for s in seasons:
        n = await fetch_and_store_games(season=int(s), team=team, week=week)
        print(f"[ingest] games upserted for {s}: {n}")

if __name__ == "__main__":
    asyncio.run(main())
