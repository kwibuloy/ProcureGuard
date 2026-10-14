import numpy as np
import pandas as pd
import pytest

from ml.models import MODELS
from ml.score import score_contracts
from ml.settings import INDICATORS, Settings

SETTINGS = Settings(isolation_forest_trees=50, clusters=3, flag_share=0.05)


def features(rows: int = 120) -> pd.DataFrame:
    """Ordinary contracts in a tight cloud, plus one that is extreme on every indicator."""
    rng = np.random.default_rng(7)
    frame = pd.DataFrame(
        {
            "single_requester": rng.normal(0.25, 0.03, rows),
            "repeated_winner": rng.normal(0.15, 0.03, rows),
            "price_deviation": rng.normal(0.0, 0.01, rows),
        }
    )
    frame.loc[0] = [1.0, 0.95, -0.4]
    return frame[list(INDICATORS)]


@pytest.mark.parametrize("model", list(MODELS))
def test_the_extreme_contract_ranks_first(model):
    result = score_contracts(features(), model, SETTINGS)

    assert result.ranks[0] == 1
    assert result.scores[0] == pytest.approx(1.0)
    assert result.flagged[0]


@pytest.mark.parametrize("model", list(MODELS))
def test_scores_run_from_zero_to_one(model):
    result = score_contracts(features(), model, SETTINGS)

    assert result.scores.min() == pytest.approx(0.0)
    assert result.scores.max() == pytest.approx(1.0)
    assert sorted(result.ranks) == list(range(1, 121))


@pytest.mark.parametrize("model", list(MODELS))
def test_contributions_add_up_to_each_score(model):
    result = score_contracts(features(), model, SETTINGS)

    rebuilt = result.base_value + result.contributions.sum(axis=1)
    assert rebuilt == pytest.approx(result.scores, abs=1e-9)
    assert result.contributions.shape == (120, 3)


@pytest.mark.parametrize("model", list(MODELS))
def test_the_share_flagged_follows_the_setting(model):
    result = score_contracts(features(), model, SETTINGS)

    assert result.flagged.sum() == 6  # 5% of 120
    assert (result.scores[result.flagged] >= result.threshold).all()
    assert (result.scores[~result.flagged] < result.threshold).all()


@pytest.mark.parametrize("model", list(MODELS))
def test_same_seed_gives_the_same_scores(model):
    first = score_contracts(features(), model, SETTINGS)
    second = score_contracts(features(), model, SETTINGS)

    assert first.scores == pytest.approx(second.scores)
    assert first.contributions == pytest.approx(second.contributions)


def test_clustering_does_not_hide_outliers_in_their_own_cluster():
    # Five extreme contracts are enough for k-means to give them a cluster of their own.
    frame = features()
    frame.loc[:4] = [1.0, 0.95, -0.4]

    result = score_contracts(frame, "clustering", SETTINGS)

    assert set(np.argsort(-result.scores)[:5]) == {0, 1, 2, 3, 4}
