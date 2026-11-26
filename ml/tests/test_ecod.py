import numpy as np
import pandas as pd
import pytest

from ml.compare_models import compare_models
from ml.models import MODELS, ECODModel
from ml.settings import INDICATORS, Settings

SETTINGS = Settings(isolation_forest_trees=30)


def fitted(matrix) -> ECODModel:
    model = ECODModel(SETTINGS)
    model.fit(np.asarray(matrix, dtype=float))
    return model


def test_tail_scores_on_a_hand_worked_column():
    # Values 0, 0, 1, 2 (n = 4). P(X >= x) uses (k + 1) / (n + 1):
    # x = 0 -> k = 4 -> 5/5 -> 0;  x = 1 -> k = 2 -> 3/5;  x = 2 -> k = 1 -> 2/5.
    model = fitted([[0], [0], [1], [2]])
    tails = model.tail_scores(np.array([[0], [1], [2], [3]], dtype=float))[:, 0]

    assert tails == pytest.approx([0.0, -np.log(3 / 5), -np.log(2 / 5), -np.log(1 / 5)])


def test_the_score_is_the_sum_of_tail_scores():
    rng = np.random.default_rng(1)
    matrix = rng.random((50, 4))
    model = fitted(matrix)

    assert model.raw_score(matrix) == pytest.approx(model.tail_scores(matrix).sum(axis=1))


def test_only_the_upper_tail_counts():
    # A contract with the lowest value of every indicator is not unusual here:
    # every input is oriented so that higher is toward the red-flag pattern.
    matrix = np.vstack([np.full((20, 4), 0.5), [[0.0, 0.0, 0.0, 0.0]], [[1.0, 1.0, 1.0, 1.0]]])
    scores = fitted(matrix).raw_score(matrix)

    assert scores[20] == pytest.approx(0.0)
    assert scores.argmax() == 21


def test_a_value_beyond_the_largest_seen_stays_finite():
    model = fitted([[0.0], [1.0]])

    assert np.isfinite(model.raw_score(np.array([[1e9]])))


def test_ecod_needs_fitting_and_has_no_seed():
    with pytest.raises(RuntimeError):
        ECODModel(SETTINGS).raw_score(np.zeros((1, 4)))
    matrix = np.random.default_rng(2).random((30, 4))
    a = ECODModel(Settings(random_seed=1))
    b = ECODModel(Settings(random_seed=99))
    a.fit(matrix)
    b.fit(matrix)
    assert a.raw_score(matrix) == pytest.approx(b.raw_score(matrix))


def test_ecod_is_never_stored_for_the_dashboard():
    assert ECODModel.key not in MODELS


def test_the_comparison_agrees_on_a_clear_outlier():
    rng = np.random.default_rng(5)
    rows = 200
    frame = pd.DataFrame(
        {
            "single_requester": rng.uniform(0.1, 0.3, rows),
            "repeated_winner": rng.uniform(0.0, 0.2, rows),
            "price_deviation": rng.uniform(0.0, 0.01, rows),
            "contract_splitting": np.zeros(rows),
        }
    )
    frame.loc[0] = [1.0, 1.0, 0.2, 5.0]
    rows_out, extra = compare_models(frame[list(INDICATORS)], SETTINGS, top_n=(1, 10))
    row = rows_out[0]

    assert row["alternative"] == "ECOD"
    assert row["top_1_overlap"] == 1.0
    assert 0.0 <= row["flagged_jaccard"] <= 1.0
    assert sum(extra["ecod_main_reasons"].values()) == row["flagged_alternative"]
