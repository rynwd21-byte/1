PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  team_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  conference TEXT,
  elo REAL DEFAULT 1500,
  off_rush REAL DEFAULT 0,
  off_pass REAL DEFAULT 0,
  def_rush REAL DEFAULT 0,
  def_pass REAL DEFAULT 0,
  st REAL DEFAULT 0,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS games (
  game_id INTEGER PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER,
  date TEXT,
  neutral INTEGER DEFAULT 0,
  home_id INTEGER NOT NULL,
  away_id INTEGER NOT NULL,
  home_pts INTEGER,
  away_pts INTEGER,
  ot_periods INTEGER DEFAULT 0,
  FOREIGN KEY(home_id) REFERENCES teams(team_id),
  FOREIGN KEY(away_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS drives (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  offense_id INTEGER NOT NULL,
  defense_id INTEGER NOT NULL,
  start_yardline INTEGER,
  result TEXT,
  points INTEGER DEFAULT 0,
  seconds INTEGER DEFAULT 0,
  ep_gain REAL,
  FOREIGN KEY(game_id) REFERENCES games(game_id),
  FOREIGN KEY(offense_id) REFERENCES teams(team_id),
  FOREIGN KEY(defense_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS ratings_history (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(team_id)
);
