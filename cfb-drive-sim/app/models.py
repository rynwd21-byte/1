from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from .db import Base

class Team(Base):
    __tablename__ = "teams"
    team_id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    conference = Column(String)
    elo = Column(Float, default=1500)
    off_rush = Column(Float, default=0)
    off_pass = Column(Float, default=0)
    def_rush = Column(Float, default=0)
    def_pass = Column(Float, default=0)
    st = Column(Float, default=0)
    last_updated = Column(String)

class Game(Base):
    __tablename__ = "games"
    game_id = Column(Integer, primary_key=True)
    season = Column(Integer, nullable=False)
    week = Column(Integer)
    date = Column(String)
    neutral = Column(Integer, default=0)
    home_id = Column(Integer, ForeignKey("teams.team_id"), nullable=False)
    away_id = Column(Integer, ForeignKey("teams.team_id"), nullable=False)
    home_pts = Column(Integer)
    away_pts = Column(Integer)
    ot_periods = Column(Integer, default=0)
