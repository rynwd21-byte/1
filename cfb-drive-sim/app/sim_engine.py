import random
import math
from dataclasses import dataclass
from typing import Dict
from .features import DriveContext, to_features

RESULTS = ["TD", "FG", "PUNT", "TO", "DOWNS", "ENDHALF"]

@dataclass
class TeamState:
    name: str
    off_rush: float
    off_pass: float
    def_rush: float
    def_pass: float
    st: float

@dataclass
class GameState:
    home: TeamState
    away: TeamState
    seconds_left: int = 3600
    score_home: int = 0
    score_away: int = 0
    possession: str = "home"
    ot_periods: int = 0

from .model_params import get_param

class DriveModel:
    def __init__(self):
        self.base_coef = [0.6, 0.1, -0.05, 0.25, 0.25, 0.05, 0.02, -0.02]
        self.coef_scale = get_param('coef_scale', 1.0)
        self._refresh()

    def _refresh(self):
        s = float(self.coef_scale or 1.0)
        self.coef = [c*s for c in self.base_coef]

    def probs(self, x):
        z = sum(c*v for c, v in zip(self.coef, x))
        base = {
            "TD": 0.18 + 0.20*z,
            "FG": 0.10 + 0.05*z,
            "PUNT": 0.52 - 0.30*z,
            "TO": 0.08 - 0.02*z,
            "DOWNS": 0.07 - 0.02*z,
            "ENDHALF": 0.05 - 0.01*z,
        }
        total = sum(max(0.001, v) for v in base.values())
        return {k: max(0.001, v)/total for k, v in base.items()}

    def sample(self, probs: Dict[str, float]):
        r = random.random()
        cum = 0.0
        for k in RESULTS:
            cum += probs[k]
            if r <= cum:
                return k
        return RESULTS[-1]

class Simulator:
    def __init__(self):
        self.model = DriveModel()

    def set_coef_scale(self, scale: float):
        self.model.coef_scale = scale
        self.model._refresh()

    def sim_game(self, gs: GameState, seed: int | None = None) -> GameState:
        if seed is not None:
            random.seed(seed)
        while gs.seconds_left > 0:
            offense = gs.home if gs.possession == "home" else gs.away
            defense = gs.away if gs.possession == "home" else gs.home
            ctx = DriveContext(
                yardline=75,
                seconds_left=gs.seconds_left,
                score_diff=(gs.score_home - gs.score_away) if gs.possession == "home" else (gs.score_away - gs.score_home),
                off_rush=offense.off_rush,
                off_pass=offense.off_pass,
                def_rush=defense.def_rush,
                def_pass=defense.def_pass,
                st=(offense.st + defense.st)/2,
                timeouts_off=3,
                timeouts_def=3,
            )
            x = to_features(ctx)
            probs = self.model.probs(x)
            res = self.model.sample(probs)
            if res == "TD":
                if gs.possession == "home":
                    gs.score_home += 7
                else:
                    gs.score_away += 7
                gs.seconds_left -= 180
            elif res == "FG":
                if gs.possession == "home":
                    gs.score_home += 3
                else:
                    gs.score_away += 3
                gs.seconds_left -= 150
            elif res == "PUNT":
                gs.seconds_left -= 120
            elif res in ("TO", "DOWNS"):
                gs.seconds_left -= 140
            else:  # ENDHALF
                gs.seconds_left = 0
            gs.possession = "away" if gs.possession == "home" else "home"

        if gs.score_home == gs.score_away:
            self._simulate_overtime(gs)
        return gs

    # --- Overtime helpers ---
    def _drive_from_25(self, offense: TeamState, defense: TeamState) -> tuple[int, bool]:
        ctx = DriveContext(
            yardline=25,
            seconds_left=0,
            score_diff=0,
            off_rush=offense.off_rush,
            off_pass=offense.off_pass,
            def_rush=defense.def_rush,
            def_pass=defense.def_pass,
            st=(offense.st + defense.st)/2,
            timeouts_off=1,
            timeouts_def=1,
        )
        probs = self.model.probs(to_features(ctx))
        probs["ENDHALF"] = 0.0
        total = sum(probs.values())
        probs = {k: v/total for k, v in probs.items()}
        res = self.model.sample(probs)
        if res == "TD":
            return 6, True
        if res == "FG":
            return 3, False
        return 0, False

    def _xp_good(self, st: float) -> bool:
        p = max(0.90, min(0.999, 0.98 + 0.0005 * (st/1.0)))
        return random.random() < p

    def _two_point_good(self, off: TeamState, deff: TeamState) -> bool:
        diff = (off.off_rush + off.off_pass) - (deff.def_rush + deff.def_pass)
        p = 0.45 + 0.0015 * diff
        p = max(0.30, min(0.70, p))
        return random.random() < p

    def _simulate_overtime(self, gs: GameState):
        ot = 0
        start = "home"
        while True:
            ot += 1
            gs.ot_periods += 1
            if ot <= 2:
                order = [start, "away" if start == "home" else "home"]
                delta_home = 0
                delta_away = 0
                for side in order:
                    offense = gs.home if side == "home" else gs.away
                    defense = gs.away if side == "home" else gs.home
                    pts, td = self._drive_from_25(offense, defense)
                    if side == "home":
                        delta_home += pts
                        if td:
                            if ot == 1:
                                delta_home += 1 if self._xp_good(offense.st) else 0
                            else:
                                delta_home += 2 if self._two_point_good(offense, defense) else 0
                    else:
                        delta_away += pts
                        if td:
                            if ot == 1:
                                delta_away += 1 if self._xp_good(offense.st) else 0
                            else:
                                delta_away += 2 if self._two_point_good(offense, defense) else 0
                gs.score_home += delta_home
                gs.score_away += delta_away
                if gs.score_home != gs.score_away:
                    break
                start = "away" if start == "home" else "home"
            else:
                while True:
                    h = self._two_point_good(gs.home, gs.away)
                    a = self._two_point_good(gs.away, gs.home)
                    if h != a:
                        if h:
                            gs.score_home += 2
                        else:
                            gs.score_away += 2
                        return
                    gs.ot_periods += 1
                    if gs.ot_periods > 20:
                        if random.random() < 0.5:
                            gs.score_home += 2
                        else:
                            gs.score_away += 2
                        return
