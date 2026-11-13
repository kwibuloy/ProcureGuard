"""Re-score with alternative study settings and measure how far the flagged set moves.

Run with: python -m ml.sensitivity                    (Isolation Forest)
          python -m ml.sensitivity --model clustering

Each alternative in ml/settings.py (SENSITIVITY_VARIANTS) changes one decision:
budget bands, the share flagged, the smallest comparable group, or the smallest
entity for repeated winner. Indicators are recomputed and the model refitted
for each, then compared with the default settings. Writes
data/processed/sensitivity_<model>.csv and .json. Stored runs are not changed.
"""

import argparse
import sys
import time

import pandas as pd

from ml.data import load_contracts
from ml.models import MODELS
from ml.robustness import compare, print_table, score_with, write_outputs
from ml.settings import ROBUSTNESS_TOP_N, SENSITIVITY_VARIANTS, Settings, variant
from pipeline.db import connect


def sensitivity(
    contracts: pd.DataFrame,
    model_key: str,
    base: Settings,
    variants=SENSITIVITY_VARIANTS,
    top_n: tuple[int, ...] = ROBUSTNESS_TOP_N,
) -> list[dict]:
    default = score_with(contracts, model_key, base)
    rows = []
    for name, changes in variants:
        alternative = score_with(contracts, model_key, variant(base, changes))
        rows.append(
            {
                "variant": name,
                "changes": "; ".join(f"{key}={value}" for key, value in changes.items()),
                **compare(default, alternative, top_n),
            }
        )
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", choices=list(MODELS), default="isolation-forest")
    args = parser.parse_args(argv)
    base = Settings()

    started = time.perf_counter()
    with connect() as connection:
        contracts = load_contracts(connection)
    if len(contracts) < 20:
        print(f"Only {len(contracts)} contracts are stored; too few to score.")
        return 1
    rows = sensitivity(contracts, args.model, base)
    elapsed = time.perf_counter() - started

    print(f"\nSensitivity of {MODELS[args.model].name} on {len(contracts):,} contracts")
    print_table(rows, "variant")
    csv_path, json_path = write_outputs(
        f"sensitivity_{args.model}",
        rows,
        {
            "model": MODELS[args.model].name,
            "contracts": len(contracts),
            "default_settings": base.as_dict(),
            "top_n": list(ROBUSTNESS_TOP_N),
            "seconds": round(elapsed, 1),
        },
    )
    print(f"\nWrote {csv_path} and {json_path} ({elapsed:.0f} s)")
    print(
        "These figures compare two scorings of the same contracts. They say how stable the"
        " flagged set is, not whether any flag is correct."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
