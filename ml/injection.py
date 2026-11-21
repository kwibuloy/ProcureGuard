"""Controlled anomaly test: does the model flag contracts that are unusual by construction?

Run with: python -m ml.injection

Synthetic contracts are added to the real 2024 feature table with known values:
one indicator set to a chosen percentile of its observed values while the others
stay at their medians, then pairs of indicators, then all four. A control group
has every indicator at its median. The Isolation Forest is refitted on the real
and synthetic contracts together, and the test reports how many synthetic
contracts of each kind land in the flagged top 5%.

This checks the model's behaviour, not whether real flags matter: it shows which
kinds of unusualness the model picks up, at what strength, and that typical
contracts are not flagged. The synthetic rows are never stored. Writes
data/processed/injection_test.json and .csv.
"""

import argparse
import itertools
import json
import sys

import numpy as np
import pandas as pd

from ml.data import load_contracts
from ml.indicators import compute, model_features
from ml.robustness import scoring
from ml.settings import INDICATORS, Settings
from pipeline.config import PROCESSED_DIR
from pipeline.db import connect

MODEL = "isolation-forest"
LEVELS = (0.90, 0.99, 0.999)  # percentile of the observed values for the planted indicator
PER_SCENARIO = 20  # synthetic contracts per scenario and level


def scenarios() -> list[tuple[str, ...]]:
    """Each indicator alone, every pair, and all four together."""
    singles = [(name,) for name in INDICATORS]
    pairs = list(itertools.combinations(INDICATORS, 2))
    return [*singles, *pairs, tuple(INDICATORS)]


def planted_rows(features: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Synthetic rows, labelled by scenario and level, plus a control group at the medians.

    Values get a small jitter (0.1% of the column's spread) so planted rows are not
    exact copies of one another.
    """
    medians = features.median()
    spread = (features.max() - features.min()).replace(0, 1.0)
    rows = []
    for level in LEVELS:
        quantiles = features.quantile(level)
        for scenario in scenarios():
            for _ in range(PER_SCENARIO):
                row = medians.copy()
                for name in scenario:
                    row[name] = quantiles[name]
                row += rng.normal(0, 0.001, len(row)) * spread
                rows.append({**row.to_dict(), "scenario": " + ".join(scenario), "level": level})
    for _ in range(PER_SCENARIO * 3):
        row = medians + rng.normal(0, 0.001, len(medians)) * spread
        rows.append({**row.to_dict(), "scenario": "control (all at median)", "level": None})
    return pd.DataFrame(rows)


def run_test(features: pd.DataFrame, settings: Settings, seed: int = 2024) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    planted = planted_rows(features, rng)
    combined = pd.concat([features[list(INDICATORS)], planted[list(INDICATORS)]], ignore_index=True)
    result = scoring(combined, MODEL, settings)
    n_real = len(features)
    planted = planted.assign(
        flagged=result.flagged[n_real:],
        # Share of all contracts scored below it: 0.99 means it outranks 99% of contracts.
        percentile=1 - (result.ranks[n_real:] - 1) / len(combined),
    )
    summary = (
        planted.groupby(["scenario", "level"], dropna=False)
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
                "levels": list(LEVELS),
                "results": json.loads(summary.to_json(orient="records")),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    pd.set_option("display.width", 200)
    print(f"{len(features):,} real contracts plus {int(summary['planted'].sum()):,} planted")
    print(summary.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(
        "This tests the model's behaviour on constructed cases, not whether real flags are right."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
