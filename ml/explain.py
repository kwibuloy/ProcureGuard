"""SHAP values: how much each indicator moved each contract's score."""

from itertools import combinations
from math import factorial

import numpy as np

from ml.settings import Settings


def background_rows(features: np.ndarray, settings: Settings) -> np.ndarray:
    """The sample of contracts that stands for "typical" when an indicator is left out."""
    rng = np.random.default_rng(settings.random_seed)
    rows = min(settings.shap_background_rows, len(features))
    return features[rng.choice(len(features), size=rows, replace=False)]


def _coalition_values(score, features: np.ndarray, background: np.ndarray) -> dict:
    """Average score of every contract when only the indicators in a coalition are its own.

    The other indicators take each background contract's values in turn. Many
    contracts share the same values once some columns are replaced, so each
    distinct row is scored once.
    """
    count = features.shape[1]
    values = {(): np.full(len(features), float(score(background).mean()))}
    values[tuple(range(count))] = score(features)
    for size in range(1, count):
        for kept in combinations(range(count), size):
            own, inverse = np.unique(features[:, kept], axis=0, return_inverse=True)
            inverse = inverse.reshape(-1)
            total = np.zeros(len(own))
            for typical in background:
                rows = np.tile(typical, (len(own), 1))
                rows[:, kept] = own
                total += score(rows)
            values[kept] = (total / len(background))[inverse]
    return values


def contributions(score, features: np.ndarray, settings: Settings) -> tuple[np.ndarray, float]:
    """Return (one contribution per contract and indicator, the base value).

    With three indicators every combination can be evaluated, so the Shapley
    values are exact: base value + the contributions of a contract = its score.
    The base value is the average score of a sample of typical contracts.

    This gives the same values as shap's exact explainer with an independent
    masker (ml/tests/test_scoring.py checks that), computed for all contracts at
    once instead of one contract at a time.
    """
    count = features.shape[1]
    values = _coalition_values(score, features, background_rows(features, settings))
    result = np.zeros(features.shape)
    for indicator in range(count):
        others = [column for column in range(count) if column != indicator]
        for size in range(count):
            weight = factorial(size) * factorial(count - size - 1) / factorial(count)
            for without in combinations(others, size):
                with_it = tuple(sorted((*without, indicator)))
                result[:, indicator] += weight * (values[with_it] - values[without])
    return result, float(values[()][0])
