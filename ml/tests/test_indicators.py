import numpy as np
import pandas as pd
import pytest

from ml.indicators import (
    WHY_MISSING,
    budget_band,
    compute,
    model_features,
    price_deviation,
    repeated_winner,
    single_requester,
)
from ml.settings import PRICE_DEVIATION, REPEATED_WINNER, SINGLE_REQUESTER, Settings

SETTINGS = Settings(min_entity_awards=3, min_comparable_contracts=3)


def contracts(rows: list[dict]) -> pd.DataFrame:
    defaults = {
        "procuring_entity": "ENTITY A",
        "awardee": "BUILDER 1",
        "region": "Region I",
        "procurement_mode": "Public Bidding",
        "approved_budget": 2_000_000.0,
        "contract_amount": 1_900_000.0,
        "document_requests": 4.0,
        "source_file": "test",
    }
    filled = [{**defaults, **row} for row in rows]
    for row in filled:
        row.setdefault("notice_awarded_total", row["contract_amount"])
    frame = pd.DataFrame(filled)
    frame.insert(0, "id", range(1, len(frame) + 1))
    return frame


def test_document_requests_are_reported_as_counted():
    result = single_requester(contracts([{"document_requests": 1.0}, {}, {}]), SETTINGS)

    assert result["value"].tolist() == [1.0, 4.0, 4.0]
    assert result["context"][0] == {"document_requests": 1, "typical_requests": 4.0}


def test_document_requests_are_missing_outside_public_bidding_or_when_not_collected():
    frame = contracts(
        [{"procurement_mode": "Negotiated Procurement"}, {"document_requests": None}, {}]
    )

    result = single_requester(frame, SETTINGS)

    assert np.isnan(result["value"][0]) and np.isnan(result["value"][1])
    assert "public bidding" in result["context"][0][WHY_MISSING]
    assert "not available" in result["context"][1][WHY_MISSING]
    assert result["value"][2] == 4.0


def test_repeated_winner_is_the_share_of_an_entitys_awards():
    frame = contracts(
        [
            {"awardee": "BUILDER 1"},
            {"awardee": "BUILDER 1"},
            {"awardee": "BUILDER 1"},
            {"awardee": "BUILDER 2"},
        ]
    )

    result = repeated_winner(frame, SETTINGS)

    assert result["value"].tolist() == [0.75, 0.75, 0.75, 0.25]
    assert result["context"][0] == {"wins": 3, "entity_awards": 4}


def test_repeated_winner_is_not_computed_for_an_entity_with_few_awards():
    frame = contracts([{"procuring_entity": "SMALL ENTITY"}, {}, {}, {}])

    result = repeated_winner(frame, SETTINGS)

    assert np.isnan(result["value"][0])
    assert result["context"][0][WHY_MISSING] == "the entity awarded fewer than 3 contracts"
    assert result["value"][1] == 1.0


def test_budget_bands():
    bands = budget_band(pd.Series([500_000.0, 1_000_000.0, 4_999_999.0, 60_000_000.0, None]))

    assert bands[:4].tolist() == [0, 1, 1, 4]
    assert np.isnan(bands[4])


def test_price_deviation_is_measured_from_the_comparable_median():
    # Three comparable contracts awarded at 90%, 95% and 100% of budget: median 95%.
    frame = contracts(
        [
            {"contract_amount": 1_800_000.0},
            {"contract_amount": 1_900_000.0},
            {"contract_amount": 2_000_000.0},
        ]
    )

    result = price_deviation(frame, SETTINGS)

    assert result["value"].tolist() == pytest.approx([0.90 / 0.95 - 1, 0.0, 1.00 / 0.95 - 1])
    assert result["context"][0] == {
        "amount_to_budget_ratio": pytest.approx(0.9),
        "comparable_median_ratio": pytest.approx(0.95),
        "comparable_count": 3,
        "comparable_basis": "same region and budget band",
    }


def test_small_comparable_group_widens_to_the_budget_band():
    frame = contracts([{"region": "Region II"}, {}, {}, {}])

    result = price_deviation(frame, SETTINGS)

    assert result["context"][0]["comparable_basis"] == "same budget band"
    assert result["context"][0]["comparable_count"] == 4
    assert result["context"][1]["comparable_basis"] == "same region and budget band"


def test_price_uses_the_notice_total_when_a_notice_is_awarded_in_lots():
    # Two lots of 950,000 under one 2,000,000 budget: 95% of budget, not 47.5%.
    frame = contracts(
        [
            {"contract_amount": 950_000.0, "notice_awarded_total": 1_900_000.0},
            {"contract_amount": 950_000.0, "notice_awarded_total": 1_900_000.0},
            {},
        ]
    )

    result = price_deviation(frame, SETTINGS)

    assert result["context"][0]["amount_to_budget_ratio"] == pytest.approx(0.95)


def test_price_deviation_is_missing_without_a_budget_or_amount():
    frame = contracts(
        [{"approved_budget": None}, {"contract_amount": None, "notice_awarded_total": None}, {}, {}]
    )

    result = price_deviation(frame, SETTINGS)

    assert np.isnan(result["value"][0]) and np.isnan(result["value"][1])
    assert "not published" in result["context"][0][WHY_MISSING]
    assert not np.isnan(result["value"][2])


def test_model_features_invert_requests_and_fill_missing_with_the_typical_value():
    frame = contracts(
        [
            {"document_requests": 1.0},
            {"document_requests": 10.0},
            {"document_requests": 5.0},
            {"document_requests": None},
        ]
    )
    indicators = compute(frame, SETTINGS)

    features = model_features(indicators)

    assert features[SINGLE_REQUESTER].tolist() == pytest.approx([1.0, 0.1, 0.2, 0.2])
    assert not features.isna().any().any()
    # The stored indicator value stays missing.
    assert np.isnan(indicators[SINGLE_REQUESTER]["value"][3])
    assert set(features.columns) == {SINGLE_REQUESTER, REPEATED_WINNER, PRICE_DEVIATION}
