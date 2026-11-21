import numpy as np
import pandas as pd

from ml.injection import planted_rows, run_test, scenarios
from ml.settings import INDICATORS, Settings

FAST = Settings(isolation_forest_trees=60)


def features(rows: int = 600) -> pd.DataFrame:
    rng = np.random.default_rng(3)
    return pd.DataFrame({name: rng.normal(0.3, 0.05, rows) for name in INDICATORS})


def test_scenarios_cover_each_indicator_every_pair_and_all_four():
    found = scenarios()
    assert len(found) == 4 + 6 + 1
    assert tuple(INDICATORS) in found


def test_planted_rows_set_only_the_scenario_indicators_away_from_the_median():
    frame = features()
    planted = planted_rows(frame, np.random.default_rng(0))
    one = planted[(planted["scenario"] == INDICATORS[0]) & (planted["level"] == 0.999)].iloc[0]

    assert one[INDICATORS[0]] > frame[INDICATORS[0]].quantile(0.99)
    assert abs(one[INDICATORS[1]] - frame[INDICATORS[1]].median()) < 0.01


def test_strong_combined_anomalies_are_flagged_and_typical_rows_are_not():
    summary = run_test(features(), FAST)
    combined = summary[
        (summary["scenario"] == " + ".join(INDICATORS)) & (summary["level"] == 0.999)
    ]
    control = summary[summary["scenario"].str.startswith("control")]

    assert combined["flagged_share"].iloc[0] >= 0.9
    assert control["flagged_share"].iloc[0] == 0.0
