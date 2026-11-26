"""The unsupervised model. It gives one number per contract: higher means more
statistically unusual. It is not trained on labels, because none exist."""

import numpy as np
from sklearn.ensemble import IsolationForest

from ml.settings import Settings


class IsolationForestModel:
    key = "isolation-forest"
    name = "Isolation Forest"

    def __init__(self, settings: Settings):
        self.parameters = {"n_estimators": settings.isolation_forest_trees}
        self._forest = IsolationForest(
            n_estimators=settings.isolation_forest_trees, random_state=settings.random_seed
        )

    def fit(self, features: np.ndarray) -> None:
        self._forest.fit(features)

    def raw_score(self, features: np.ndarray) -> np.ndarray:
        # score_samples is higher for ordinary rows; flip it.
        return -self._forest.score_samples(features)


class ECODModel:
    """Empirical cumulative distribution outlier detection (Li et al., 2023), one-sided.

    For each indicator, the tail probability P(X >= x) is read from that
    indicator's empirical distribution over all contracts, and the score is the
    sum of -log of those probabilities. It has no settings to tune and no random
    seed. It uses the upper tail only: every model input is oriented so that a
    higher value is further toward the red-flag pattern (document requests are
    inverted, price counts only above the comparable median), so a low value is
    not unusual in the sense this study looks for. The published ECOD also scores
    the lower tail.

    Used only as a comparison with the Isolation Forest (ml/compare_models.py);
    its scores are not stored for the dashboard.
    """

    key = "ecod"
    name = "ECOD"

    def __init__(self, settings: Settings):
        self.parameters = {"tail": "upper"}
        self._sorted: list[np.ndarray] = []

    def fit(self, features: np.ndarray) -> None:
        features = np.asarray(features, dtype=float)
        self._sorted = [np.sort(features[:, j]) for j in range(features.shape[1])]

    def tail_scores(self, features: np.ndarray) -> np.ndarray:
        """-log P(X >= x) per indicator: 0 at or below the lowest value, larger further out."""
        features = np.asarray(features, dtype=float)
        if not self._sorted:
            raise RuntimeError("ECOD is not fitted")
        columns = []
        for j, values in enumerate(self._sorted):
            n = len(values)
            at_or_above = n - np.searchsorted(values, features[:, j], side="left")
            # (k + 1) / (n + 1) keeps the probability above 0 for a value beyond the
            # largest one seen, so a new contract never scores infinity.
            columns.append(-np.log((at_or_above + 1) / (n + 1)))
        return np.column_stack(columns)

    def raw_score(self, features: np.ndarray) -> np.ndarray:
        return self.tail_scores(features).sum(axis=1)


# Models whose scores are stored and shown on the dashboard.
MODELS = {IsolationForestModel.key: IsolationForestModel}
# Models fitted only to compare with the stored model; never stored.
COMPARISON_MODELS = {ECODModel.key: ECODModel}
ALL_MODELS = {**MODELS, **COMPARISON_MODELS}


class ScaledModel:
    """A fitted model whose scores run from 0 (most ordinary) to 1 (most unusual).

    The scaling is linear, so SHAP contributions keep adding up to the score.
    """

    def __init__(self, model, features: np.ndarray):
        self.model = model
        model.fit(features)
        raw = model.raw_score(features)
        self._low = float(raw.min())
        self._span = float(raw.max() - raw.min()) or 1.0

    def score(self, features) -> np.ndarray:
        return (self.model.raw_score(np.asarray(features, dtype=float)) - self._low) / self._span
