"""Score every contract and store the results as a new scoring run.

Run with: python -m ml.score                          (both models)
          python -m ml.score --model isolation-forest
          python -m ml.score --model clustering

Computes the three indicators, fits the model, explains each score with SHAP,
and writes scores and contributions to PostgreSQL. Earlier runs are kept.
"""

import argparse
import json
import math
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ml.data import load_contracts
from ml.explain import contributions
from ml.indicators import compute, model_features
from ml.models import MODELS, ScaledModel
from ml.settings import INDICATORS, Settings
from pipeline.db import connect

DEMO_SOURCE = "DEMO"


@dataclass
class Result:
    model_name: str
    parameters: dict
    scores: np.ndarray
    ranks: np.ndarray
    flagged: np.ndarray
    threshold: float
    base_value: float
    contributions: np.ndarray  # contracts x indicators


def score_contracts(features: pd.DataFrame, model_key: str, settings: Settings) -> Result:
    matrix = features[list(INDICATORS)].to_numpy(dtype=float)
    model = ScaledModel(MODELS[model_key](settings), matrix)
    scores = model.score(matrix)
    shap_values, base_value = contributions(model.score, matrix, settings)

    order = np.argsort(-scores, kind="stable")
    ranks = np.empty(len(scores), dtype=int)
    ranks[order] = np.arange(1, len(scores) + 1)
    flagged_count = max(1, math.ceil(len(scores) * settings.flag_share))
    threshold = float(scores[order[flagged_count - 1]])
    return Result(
        model_name=model.model.name,
        parameters=model.model.parameters,
        scores=scores,
        ranks=ranks,
        flagged=scores >= threshold,
        threshold=threshold,
        base_value=base_value,
        contributions=shap_values,
    )


def _number(value) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def store(connection, contracts, indicators, result: Result, settings: Settings) -> int:
    is_demo = bool((contracts["source_file"] == DEMO_SOURCE).any())
    with connection.transaction():
        run_id = connection.execute(
            "INSERT INTO scoring_runs (model_name, parameters, random_seed, flag_threshold,"
            " base_value, is_demo, notes) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            [
                result.model_name,
                json.dumps({"model": result.parameters, "settings": settings.as_dict()}),
                settings.random_seed,
                result.threshold,
                result.base_value,
                is_demo,
                "Scored generated demonstration contracts." if is_demo else None,
            ],
        ).fetchone()[0]
        ids = contracts["id"].tolist()
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO contract_scores (run_id, contract_id, risk_score, score_rank,"
                " is_flagged) VALUES (%s, %s, %s, %s, %s)",
                [
                    (
                        run_id,
                        ids[i],
                        float(result.scores[i]),
                        int(result.ranks[i]),
                        bool(result.flagged[i]),
                    )
                    for i in range(len(ids))
                ],
            )
            rows = []
            for column, name in enumerate(INDICATORS):
                values = indicators[name]["value"].tolist()
                contexts = indicators[name]["context"].tolist()
                rows.extend(
                    (
                        run_id,
                        ids[i],
                        name,
                        _number(values[i]),
                        float(result.contributions[i, column]),
                        json.dumps(contexts[i]),
                    )
                    for i in range(len(ids))
                )
            cursor.executemany(
                "INSERT INTO contract_indicators (run_id, contract_id, indicator, value,"
                " contribution, context) VALUES (%s, %s, %s, %s, %s, %s)",
                rows,
            )
    # Refresh the planner's statistics. Without this the API's queries over a
    # newly stored run can take minutes instead of a fraction of a second.
    connection.execute("ANALYZE contract_scores")
    connection.execute("ANALYZE contract_indicators")
    return run_id


def report(run_id: int, contracts, indicators, result: Result) -> None:
    scores = result.scores
    print(f"\nRun {run_id}: {result.model_name}")
    print(f"  contracts scored      {len(scores):,}")
    print(
        f"  flagged for review    {int(result.flagged.sum()):,}"
        f" (score {result.threshold:.3f} and above)"
    )
    print(
        f"  score min / median / max   {scores.min():.3f} / {np.median(scores):.3f} /"
        f" {scores.max():.3f}"
    )
    for name in INDICATORS:
        missing = int(indicators[name]["value"].isna().sum())
        print(f"  {name:18} could not be computed for {missing:,} contracts")
    main_reason = np.asarray(INDICATORS)[result.contributions[result.flagged].argmax(axis=1)]
    for name in INDICATORS:
        print(f"  main reason {name:18} {int((main_reason == name).sum()):,} flagged contracts")
    error = np.abs(result.base_value + result.contributions.sum(axis=1) - scores).max()
    print(f"  largest gap between score and base + contributions   {error:.2e}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", choices=[*MODELS, "both"], default="both")
    args = parser.parse_args(argv)
    settings = Settings()

    with connect() as connection:
        contracts = load_contracts(connection)
        if len(contracts) < 20:
            print(f"Only {len(contracts)} contracts are stored; too few to score.")
            return 1
        indicators = compute(contracts, settings)
        features = model_features(indicators)
        for key in MODELS if args.model == "both" else [args.model]:
            result = score_contracts(features, key, settings)
            run_id = store(connection, contracts, indicators, result, settings)
            report(run_id, contracts, indicators, result)
    print(
        "\nA high score means a contract is statistically unusual on these indicators."
        " It is not evidence of wrongdoing."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
