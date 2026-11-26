"""Compare the Isolation Forest's ranking with ECOD's on the same contracts.

Run with: python -m ml.compare_models

ECOD (ml/models.py) has no settings and no random seed, so it is a fixed
reference point: if a different algorithm ranks the same contracts at the top,
the flagged set depends less on the choice of the Isolation Forest. Indicators
are computed once with the default settings; both models are fitted on them.
Writes data/processed/model_comparison.csv and .json. Stored runs are not changed.

Agreement between two unsupervised models says how much a result depends on the
algorithm. It does not say whether a flag is right: no labelled cases exist.
"""

import argparse
import sys
import time

import numpy as np
import pandas as pd

from ml.data import load_contracts
from ml.indicators import compute, model_features
from ml.models import ALL_MODELS, ECODModel
from ml.robustness import compare, print_table, scoring, write_outputs
from ml.settings import INDICATORS, ROBUSTNESS_TOP_N, Settings
from pipeline.db import connect

DEFAULT = "isolation-forest"
ALTERNATIVE = ECODModel.key


def ecod_main_reasons(features: pd.DataFrame, flagged: np.ndarray, settings: Settings) -> dict:
    """For contracts ECOD flags, the indicator with the largest tail score, counted."""
    model = ECODModel(settings)
    matrix = features[list(INDICATORS)].to_numpy(dtype=float)
    model.fit(matrix)
    tails = model.tail_scores(matrix[flagged])
    if not len(tails):
        return {name: 0 for name in INDICATORS}
    reasons = np.asarray(INDICATORS)[tails.argmax(axis=1)]
    return {name: int((reasons == name).sum()) for name in INDICATORS}


def compare_models(
    features: pd.DataFrame,
    settings: Settings,
    top_n: tuple[int, ...] = ROBUSTNESS_TOP_N,
) -> tuple[list[dict], dict]:
    """One row comparing ECOD with the Isolation Forest, and ECOD's main reasons."""
    default = scoring(features, DEFAULT, settings)
    alternative = scoring(features, ALTERNATIVE, settings)
    row = {
        "default": ALL_MODELS[DEFAULT].name,
        "alternative": ALL_MODELS[ALTERNATIVE].name,
        **compare(default, alternative, top_n),
    }
    extra = {
        "ecod_main_reasons": ecod_main_reasons(features, alternative.flagged, settings),
        "flagged_by_default_only": int(np.logical_and(default.flagged, ~alternative.flagged).sum()),
        "flagged_by_alternative_only": int(
            np.logical_and(~default.flagged, alternative.flagged).sum()
        ),
    }
    return [row], extra


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.parse_args(argv)
    settings = Settings()

    started = time.perf_counter()
    with connect() as connection:
        contracts = load_contracts(connection)
    if len(contracts) < 20:
        print(f"Only {len(contracts)} contracts are stored; too few to score.")
        return 1
    features = model_features(compute(contracts, settings), settings.missing_fill)
    rows, extra = compare_models(features, settings)
    elapsed = time.perf_counter() - started

    print(f"\nIsolation Forest against ECOD on {len(contracts):,} contracts")
    print_table(rows, "alternative")
    print(f"\nFlagged by the Isolation Forest only: {extra['flagged_by_default_only']:,}")
    print(f"Flagged by ECOD only:                 {extra['flagged_by_alternative_only']:,}")
    print("Main reason among ECOD's flagged contracts (largest tail score):")
    for name, count in extra["ecod_main_reasons"].items():
        print(f"  {name:18} {count:,}")
    csv_path, json_path = write_outputs(
        "model_comparison",
        rows,
        {
            "contracts": len(contracts),
            "settings": settings.as_dict(),
            "top_n": list(ROBUSTNESS_TOP_N),
            **extra,
            "seconds": round(elapsed, 1),
        },
    )
    print(f"\nWrote {csv_path} and {json_path} ({elapsed:.0f} s)")
    print(
        "These figures compare two unsupervised scorings of the same contracts. They say how"
        " much the flagged set depends on the algorithm, not whether any flag is correct."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
