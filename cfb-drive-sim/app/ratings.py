from dataclasses import dataclass
import math

@dataclass
class EloConfig:
    base: float = 1500
    k: float = 20.0
    mov_scale: float = 400.0
    hfa: float = 55.0

class UnitElo:
    def __init__(self, cfg: EloConfig):
        self.cfg = cfg

    def win_prob(self, elo_a: float, elo_b: float) -> float:
        return 1.0 / (1.0 + 10 ** (-(elo_a - elo_b) / 400.0))

    def update(self, elo_a: float, elo_b: float, score_a: int, score_b: int, home: int = 0):
        adj_a = elo_a + (self.cfg.hfa if home == 1 else 0)
        adj_b = elo_b + (self.cfg.hfa if home == -1 else 0)
        p_a = self.win_prob(adj_a, adj_b)
        outcome = 1.0 if score_a > score_b else (0.5 if score_a == score_b else 0.0)
        mov = abs(score_a - score_b)
        k = self.cfg.k * (1.0 + math.log1p(mov) / math.log(2 + self.cfg.mov_scale/400))
        delta = k * (outcome - p_a)
        return elo_a + delta, elo_b - delta
