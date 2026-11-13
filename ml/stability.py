"""Refit the Isolation Forest with other random seeds and measure how far the ranking moves.

Run with: python -m ml.stability

Indicators do not depend on the seed, so they are computed once. The forest is
refitted for each seed in ml/settings.py (STABILITY_SEEDS) and compared with
the default seed, and every pair of seeds is compared to give the spread.
Writes data/processed/seed_stability.csv and .json. Stored runs are not changed.
"""

import argparse
import sys
import time
from itertools import combinations

import pandas as pd

from ml.data import load_contracts
from ml.indicators import compute, model_features
from ml.robustness import compare, print_table, scoring, write_outputs
from ml.settings import ROBUSTNESS_TOP_N, STABILITY_SEEDS, Settings, variant
from pipeline.db import connect

MODEL = "isolation-forest"


def stability(
    features: pd.DataFrame,
    base: Settings,
    seeds: tuple[int, ...] = STABILITY_SEEDS,
    top_n: tuple[int, ...] = ROBUSTNESS_TOP_N,
) -> tuple[list[dict], dict]:
    """Rows comparing the default seed with each other seed, and the spread over all pairs."""
    scorings = {base.random_seed: scoring(features, MODEL, base)}
    for seed in seeds:
        if seed not in scorings:
            scorings[seed] = scoring(features, MODEL, variant(base, {"random_seed": seed}))
    rows = [
        {"seed": seed, **compare(scorings[base.random_seed], result, top_n)}
        for seed, result in scorings.items()
        if seed != base.random_seed
    ]
    pairs = pd.DataFrame(
        [compare(scorings[a], scorings[b], top_n) for a, b in combinations(scorings, 2)]
    )
    measures = ["flagged_jaccard", "spearman_all", *[f"top_{n}_overlap" for n in top_n]]
    spread = {
        "seeds": list(scorings),
        "pairs": len(pairs),
        **{
            measure: {
                "min": round(float(pairs[measure].min()), 4),
                "mean": round(float(pairs[measure].mean()), 4),
                "max": round(float(pairs[measure].max()), 4),
            }
            for measure in measures
        },
    }
    return rows, spread


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.parse_args(argv)
    base = Settings()

    started = time.perf_counter()
    with connect() as connection:
        contracts = load_contracts(connection)
    if len(contracts) < 20:
        print(f"Only {len(contracts)} contracts are stored; too few to score.")
        return 1
    features = model_features(compute(contracts, base))
    rows, spread = stability(features, base)
    elapsed = time.perf_counter() - started

    print(f"\nIsolation Forest seed stability on {len(contracts):,} contracts")
    print(f"Default seed {base.random_seed} against each other seed:")
    print_table(rows, "seed")
    print(f"\nOver all {spread['pairs']} pairs of {len(spread['seeds'])} seeds (min / mean / max):")
    for measure, values in spread.items():
        if isinstance(values, dict):
            print(
                f"  {measure:18} {values['min']:.4f} / {values['mean']:.4f} / {values['max']:.4f}"
            )
    csv_path, json_path = write_outputs(
        "seed_stability",
        rows,
        {
            "model": "Isolation Forest",
            "contracts": len(contracts),
            "default_settings": base.as_dict(),
            "top_n": list(ROBUSTNESS_TOP_N),
            "all_pairs": spread,
            "seconds": round(elapsed, 1),
        },
    )
    print(f"\nWrote {csv_path} and {json_path} ({elapsed:.0f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
