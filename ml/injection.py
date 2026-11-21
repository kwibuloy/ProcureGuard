"""Controlled anomaly test: does the model flag contracts that are unusual by construction?

Run with: python -m ml.injection

The Isolation Forest is fitted on the real 2024 contracts only. Synthetic test
contracts are then scored with that fitted model, without retraining, so they
cannot influence the model they test. Each synthetic contract keeps every
indicator at its median except the ones being tested, which are set to values
defined in procurement terms for each indicator's own distribution:

  indicator                 moderate   high    extreme
  document requests         2          1       1 (the lowest possible)
  repeated-winner share     50%        80%     100%
  award-to-budget ratio     +2%        +5%     +10% above the comparable median
  grouped small-value       3          8       17 notices

Percentiles would not work: 98% of contracts have no small-value group, so its
90th percentile is 0, and the 90th to 99.9th percentiles of document requests are
all one request. A control group has every indicator at its median.

The test reports how many synthetic contracts of each kind score at or above the
flagging score of the real data. It checks the model's behaviour on constructed
cases, not whether real flags matter. Writes data/processed/injection_test.json
and .csv.
"""

import argparse
import itertools
import json
import sys

import numpy as np
import pandas as pd

from ml.data import load_contracts
from ml.indicators import compute, model_features
from ml.score import fit_scores, rank_and_flag
from ml.settings import (
    CONTRACT_SPLITTING,
    INDICATORS,
    PRICE_DEVIATION,
    REPEATED_WINNER,
    SINGLE_REQUESTER,
    Settings,
)
from pipeline.config import PROCESSED_DIR
from pipeline.db import connect

MODEL = "isolation-forest"
LEVEL_NAMES = ("moderate", "high", "extreme")
# Model feature values for each level. Document requests enter the model as
# 1 / requests, so 2 requests is 0.5 and 1 request is 1.0.
LEVELS = {
    SINGLE_REQUESTER: (1 / 2, 1.0, 1.0),
    REPEATED_WINNER: (0.5, 0.8, 1.0),
    PRICE_DEVIATION: (0.02, 0.05, 0.10),
    CONTRACT_SPLITTING: (3.0, 8.0, 17.0),
}
PER_SCENARIO = 20


def scenarios() -> list[tuple[str, ...]]:
    """Each indicator alone, every pair, and all four together."""
    singles = [(name,) for name in INDICATORS]
    pairs = list(itertools.combinations(INDICATORS, 2))
    return [*singles, *pairs, tuple(INDICATORS)]


def planted_rows(features: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Synthetic rows labelled by scenario and level, plus a control group at the medians.

    The indicators not being tested stay at their medians, with a tiny jitter
    (0.1% of the column's spread) so the rows are not exact copies.
    """
    medians = features[list(INDICATORS)].median()
    spread = (features[list(INDICATORS)].max() - features[list(INDICATORS)].min()).replace(0, 1.0)

    def jittered() -> pd.Series:
        return medians + rng.normal(0, 0.001, len(medians)) * spread

    rows = []
    for index, level in enumerate(LEVEL_NAMES):
        for scenario in scenarios():
            for _ in range(PER_SCENARIO):
                row = jittered()
                for name in scenario:
                    row[name] = LEVELS[name][index]
                rows.append({**row.to_dict(), "scenario": " + ".join(scenario), "level": level})
    for _ in range(PER_SCENARIO * 3):
        rows.append({**jittered().to_dict(), "scenario": "control (all at median)", "level": "-"})
    return pd.DataFrame(rows)


def run_test(features: pd.DataFrame, settings: Settings, seed: int = 2024) -> pd.DataFrame:
    """Fit on the real contracts, score the planted ones with the fitted model."""
    model, _, real_scores = fit_scores(features, MODEL, settings)
    _, _, threshold = rank_and_flag(real_scores, settings.flag_share)
    planted = planted_rows(features, np.random.default_rng(seed))
    scores = model.score(planted[list(INDICATORS)].to_numpy(dtype=float))
    sorted_real = np.sort(real_scores)
    planted = planted.assign(
        flagged=scores >= threshold,
        # Share of real contracts scoring below it: 0.99 means it outranks 99% of them.
        percentile=np.searchsorted(sorted_real, scores, side="left") / len(sorted_real),
    )
    summary = (
        planted.groupby(["scenario", "level"], sort=False)
        .agg(
            planted=("flagged", "size"),
            flagged=("flagged", "sum"),
            median_percentile=("percentile", "median"),
        )
        .reset_index()
    )
    summary["flagged_share"] = summary["flagged"] / summary["planted"]
    return summary


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_args(argv)
    settings = Settings()
    with connect() as connection:
        contracts = load_contracts(connection)
    features = model_features(compute(contracts, settings), settings.missing_fill)
    summary = run_test(features, settings)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    summary.to_csv(PROCESSED_DIR / "injection_test.csv", index=False)
    (PROCESSED_DIR / "injection_test.json").write_text(
        json.dumps(
            {
                "real_contracts": len(features),
                "planted_per_scenario_and_level": PER_SCENARIO,
                "levels": {
                    name: dict(zip(LEVEL_NAMES, LEVELS[name], strict=True)) for name in LEVELS
                },
                "fitted_on": "real contracts only; planted contracts scored without retraining",
                "results": json.loads(summary.to_json(orient="records")),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    pd.set_option("display.width", 200)
    print(f"Fitted on {len(features):,} real contracts; {int(summary['planted'].sum()):,} planted")
    print(summary.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(
        "This tests the model's behaviour on constructed cases, not whether real flags are right."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
