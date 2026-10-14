import numpy as np
import pytest
import shap

from ml.explain import background_rows, contributions
from ml.settings import Settings

SETTINGS = Settings()


def score(rows: np.ndarray) -> np.ndarray:
    """A score with an interaction between indicators, so the order of removal matters."""
    return rows[:, 0] * rows[:, 1] + np.abs(rows[:, 2]) + 0.5 * rows[:, 0]


def features() -> np.ndarray:
    rng = np.random.default_rng(3)
    rows = rng.normal(size=(60, 3))
    # Repeated rows, as real contracts of one entity and awardee share values.
    rows[10:20] = rows[0]
    return rows


def test_matches_the_shap_library_exact_explainer():
    rows = features()
    background = background_rows(rows, SETTINGS)
    masker = shap.maskers.Independent(background, max_samples=len(background))
    expected = shap.Explainer(score, masker, algorithm="exact")(rows, silent=True)

    values, base = contributions(score, rows, SETTINGS)

    assert values == pytest.approx(np.asarray(expected.values), abs=1e-9)
    assert base == pytest.approx(float(np.mean(expected.base_values)))


def test_base_value_plus_contributions_is_the_score():
    rows = features()

    values, base = contributions(score, rows, SETTINGS)

    assert base + values.sum(axis=1) == pytest.approx(score(rows))
