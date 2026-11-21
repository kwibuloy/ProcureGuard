import numpy as np
import pandas as pd

from ml.injection import LEVELS, planted_rows, run_test, scenarios
from ml.settings import INDICATORS, Settings

FAST = Settings(isolation_forest_trees=60)


def features(rows: int = 600) -> pd.DataFrame:
    rng = np.random.default_rng(3)
    return pd.DataFrame({name: rng.normal(0.3, 0.05, rows) for name in INDICATORS})


def test_scenarios_cover_each_indicator_every_pair_and_all_four():
    found = scenarios()
    assert len(found) == 4 + 6 + 1
    assert tuple(INDICATORS) in found


def test_planted_rows_use_the_defined_values_and_keep_the_rest_at_the_median():
    frame = features()
    planted = planted_rows(frame, np.random.default_rng(0))
    one = planted[(planted["scenario"] == INDICATORS[3]) & (planted["level"] == "high")].iloc[0]

    assert one[INDICATORS[3]] == LEVELS[INDICATORS[3]][1]
    assert abs(one[INDICATORS[1]] - frame[INDICATORS[1]].median()) < 0.01


def test_every_planted_value_is_above_the_median_it_replaces():
    medians = {
        "single_requester": 1 / 3,
        "repeated_winner": 0.0952,
        "price_deviation": 0.0,
        "contract_splitting": 0.0,
    }
    for name, values in LEVELS.items():
        assert all(value > medians[name] for value in values), name


def test_strong_combined_anomalies_are_flagged_and_typical_rows_are_not():
    frame = features()
    for name, values in LEVELS.items():  # keep the defined levels inside a plausible range
        frame.loc[:5, name] = values[0]
    summary = run_test(frame, FAST)
    combined = summary[
        (summary["scenario"] == " + ".join(INDICATORS)) & (summary["level"] == "extreme")
    ]
    control = summary[summary["scenario"].str.startswith("control")]

    assert combined["flagged_share"].iloc[0] >= 0.9
    assert control["flagged_share"].iloc[0] == 0.0
