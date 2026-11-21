"""How much the flagged set moves when a study decision or the random seed changes.

Shared by ml/sensitivity.py (alternative settings) and ml/stability.py (seeds).
Nothing here writes to the database: the dashboard's stored runs are unchanged.
Every figure compares two scorings of the same contracts; none says whether a
flag is right, because no labelled cases exist to say so.
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from ml.indicators import compute, model_features
from ml.score import fit_scores, rank_and_flag
from ml.settings import Settings
from pipeline.config import PROCESSED_DIR


@dataclass
class Scoring:
    scores: np.ndarray
    ranks: np.ndarray
    flagged: np.ndarray


def scoring(features: pd.DataFrame, model_key: str, settings: Settings) -> Scoring:
    """Scores, ranks and flags without SHAP values, which ranking does not need."""
    _, _, scores = fit_scores(features, model_key, settings)
    ranks, flagged, _ = rank_and_flag(scores, settings.flag_share)
    return Scoring(scores, ranks, flagged)


def score_with(contracts: pd.DataFrame, model_key: str, settings: Settings) -> Scoring:
    """Recompute the indicators under `settings`, then score."""
    features = model_features(compute(contracts, settings), settings.missing_fill)
    return scoring(features, model_key, settings)


def jaccard(a: np.ndarray, b: np.ndarray) -> float:
    """Shared members over all members of two boolean masks; 1.0 when both are empty."""
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 1.0


def top_overlap(ranks_a: np.ndarray, ranks_b: np.ndarray, n: int) -> float:
    """Share of the top n contracts under one scoring that are also in the top n of the other."""
    n = min(n, len(ranks_a))
    return float(np.logical_and(ranks_a <= n, ranks_b <= n).sum() / n) if n else 1.0


def compare(base: Scoring, other: Scoring, top_n: tuple[int, ...]) -> dict:
    """The figures reported for one alternative against the default."""
    rho = spearmanr(base.scores, other.scores).statistic
    row = {
        "flagged_default": int(base.flagged.sum()),
        "flagged_alternative": int(other.flagged.sum()),
        "flagged_shared": int(np.logical_and(base.flagged, other.flagged).sum()),
        "flagged_jaccard": round(jaccard(base.flagged, other.flagged), 4),
        # Among contracts the default flags, how many the alternative also flags.
        "default_flags_kept": round(
            float(np.logical_and(base.flagged, other.flagged).sum() / max(1, base.flagged.sum())),
            4,
        ),
        "spearman_all": round(float(rho), 4) if np.isfinite(rho) else None,
    }
    for n in top_n:
        row[f"top_{n}_overlap"] = round(top_overlap(base.ranks, other.ranks, n), 4)
    return row


def write_outputs(name: str, rows: list[dict], metadata: dict, directory: Path = PROCESSED_DIR):
    """`<name>.csv` (one row per comparison) and `<name>.json` (rows plus how they were made)."""
    directory.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(rows)
    csv_path = directory / f"{name}.csv"
    json_path = directory / f"{name}.json"
    frame.to_csv(csv_path, index=False)
    payload = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        **metadata,
        "results": rows,
    }
    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return csv_path, json_path


def print_table(rows: list[dict], first: str) -> None:
    frame = pd.DataFrame(rows).set_index(first)
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(frame.to_string())
