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


MODELS = {IsolationForestModel.key: IsolationForestModel}


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
