"""The two unsupervised models being compared. Both give one number per contract:
higher means more statistically unusual. Neither is trained on labels."""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler

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


class ClusteringModel:
    """Distance from the nearest large cluster of ordinary contracts.

    K-means will happily form a tiny cluster around a few extreme contracts, which
    would put them at distance zero from "their" centre. So only the large
    clusters, which together hold most contracts, count as ordinary (the idea
    behind the cluster-based local outlier factor, CBLOF).
    """

    key = "clustering"
    name = "Clustering distance"
    # The largest clusters that together hold this share of contracts are "large".
    LARGE_CLUSTER_COVERAGE = 0.9

    def __init__(self, settings: Settings):
        self.parameters = {
            "n_clusters": settings.clusters,
            "scaling": "median and IQR",
            "large_cluster_coverage": self.LARGE_CLUSTER_COVERAGE,
        }
        self._scaler = RobustScaler()
        self._clusters = KMeans(
            n_clusters=settings.clusters, n_init=10, random_state=settings.random_seed
        )
        self._large_centres = np.empty((0, 0))

    def fit(self, features: np.ndarray) -> None:
        distinct = len(np.unique(features, axis=0))
        self._clusters.set_params(n_clusters=max(1, min(self._clusters.n_clusters, distinct)))
        labels = self._clusters.fit_predict(self._scaler.fit_transform(features))
        sizes = np.bincount(labels, minlength=self._clusters.n_clusters)
        by_size = np.argsort(-sizes, kind="stable")
        covered = np.cumsum(sizes[by_size]) / len(features)
        large = by_size[: int(np.searchsorted(covered, self.LARGE_CLUSTER_COVERAGE) + 1)]
        self._large_centres = self._clusters.cluster_centers_[large]

    def raw_score(self, features: np.ndarray) -> np.ndarray:
        scaled = self._scaler.transform(features)
        gaps = scaled[:, None, :] - self._large_centres[None, :, :]
        distances = np.sqrt((gaps**2).sum(axis=2)).min(axis=1)
        # Distances have a long tail; the log keeps one extreme contract from
        # flattening every other score.
        return np.log1p(distances)


MODELS = {model.key: model for model in (IsolationForestModel, ClusteringModel)}


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
