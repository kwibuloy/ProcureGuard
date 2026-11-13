import json

import numpy as np
import pandas as pd
import pytest

from ml.indicators import compute, model_features
from ml.robustness import Scoring, compare, jaccard, top_overlap, write_outputs
from ml.score import rank_and_flag
from ml.sensitivity import sensitivity
from ml.settings import Settings
from ml.stability import stability

FAST = Settings(isolation_forest_trees=30, clusters=3, min_comparable_contracts=5)


def contracts(rows: int = 200) -> pd.DataFrame:
    """Contracts across entities, regions and budget sizes, a few of them unusual."""
    rng = np.random.default_rng(3)
    budget = rng.choice([800_000, 3_000_000, 12_000_000, 30_000_000, 80_000_000], rows)
    ratio = rng.normal(0.95, 0.02, rows).clip(0.5, 1.0)
    ratio[:5] = 1.0
    frame = pd.DataFrame(
        {
            "id": range(1, rows + 1),
            "source_series": "legacy",
            "bid_reference_no": [str(1000 + i) for i in range(rows)],
            "procuring_entity": [f"ENTITY {i % 12}" for i in range(rows)],
            "awardee": [f"BUILDER {rng.integers(0, 30)}" for _ in range(rows)],
            "region": [f"Region {i % 3}" for i in range(rows)],
            "procurement_mode": "Public Bidding",
            "approved_budget": budget.astype(float),
            "contract_amount": budget * ratio,
            "source_file": "test",
            "document_requests": rng.integers(1, 9, rows).astype(float),
        }
    )
    frame["notice_awarded_total"] = frame["contract_amount"]
    frame["notice_award_count"] = 1
    return frame


def test_jaccard_and_top_overlap_on_hand_worked_cases():
    a = np.array([True, True, False, False])
    b = np.array([True, False, True, False])

    assert jaccard(a, b) == pytest.approx(1 / 3)
    assert jaccard(a, a) == 1.0
    assert jaccard(np.zeros(3, bool), np.zeros(3, bool)) == 1.0
    # Ranks 1..4 against the order reversed: the top 2 share nothing, the top 4 everything.
    ranks, reversed_ranks = np.array([1, 2, 3, 4]), np.array([4, 3, 2, 1])
    assert top_overlap(ranks, reversed_ranks, 2) == 0.0
    assert top_overlap(ranks, reversed_ranks, 4) == 1.0


def test_identical_scorings_agree_completely():
    scores = np.linspace(0, 1, 50)
    ranks, flagged, _ = rank_and_flag(scores, 0.1)
    same = Scoring(scores, ranks, flagged)

    row = compare(same, same, (10,))

    assert row["flagged_jaccard"] == 1.0
    assert row["top_10_overlap"] == 1.0
    assert row["spearman_all"] == pytest.approx(1.0)
    assert row["flagged_default"] == row["flagged_shared"] == 5


def test_a_wider_flag_share_keeps_every_default_flag():
    rows = sensitivity(
        contracts(),
        "isolation-forest",
        FAST,
        variants=(("wider", {"flag_share": 0.10}),),
        top_n=(10,),
    )

    (row,) = rows
    assert row["flagged_default"] == 10
    assert row["flagged_alternative"] == 20
    # Only the cut-off moved, so the ranking is unchanged.
    assert row["default_flags_kept"] == 1.0
    assert row["spearman_all"] == pytest.approx(1.0)
    assert row["top_10_overlap"] == 1.0
    assert row["changes"] == "flag_share=0.1"


def test_alternative_settings_are_recomputed_into_the_indicators():
    rows = sensitivity(
        contracts(),
        "isolation-forest",
        FAST,
        variants=(("bands", {"budget_bands": (5_000_000,)}), ("entity", {"min_entity_awards": 50})),
        top_n=(10,),
    )

    for row in rows:
        assert 0.0 <= row["flagged_jaccard"] <= 1.0
    # With no entity reaching 50 notices, repeated winner is missing everywhere, which changes
    # the scores: the result must differ from the default somewhere.
    assert rows[1]["spearman_all"] < 1.0


def test_seed_stability_compares_each_seed_with_the_default_and_every_pair():
    features = model_features(compute(contracts(), FAST))

    rows, spread = stability(features, FAST, seeds=(1, 2, FAST.random_seed), top_n=(10,))

    assert [row["seed"] for row in rows] == [1, 2]
    assert spread["pairs"] == 3
    assert spread["seeds"] == [FAST.random_seed, 1, 2]
    for measure in ("flagged_jaccard", "spearman_all", "top_10_overlap"):
        assert spread[measure]["min"] <= spread[measure]["mean"] <= spread[measure]["max"]


def test_outputs_are_written_as_csv_and_json(tmp_path):
    csv_path, json_path = write_outputs(
        "check", [{"variant": "a", "flagged_jaccard": 0.5}], {"model": "m"}, directory=tmp_path
    )

    assert pd.read_csv(csv_path).to_dict("records") == [{"variant": "a", "flagged_jaccard": 0.5}]
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    assert payload["model"] == "m"
    assert payload["results"][0]["variant"] == "a"
    assert "generated_at" in payload


def test_budget_bands_are_a_setting_stored_with_the_run():
    assert Settings().as_dict()["budget_bands"] == [1_000_000, 5_000_000, 20_000_000, 50_000_000]
    assert Settings(budget_bands=(5,)).as_dict()["budget_bands"] == [5]
