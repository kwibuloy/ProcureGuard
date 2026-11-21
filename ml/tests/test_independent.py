import pandas as pd

from ml.independent import assess, blind_sheet, enrichment

SVP = "Negotiated Procurement - Small Value Procurement (Sec. 53.9)"


def notices(rows):
    defaults = {
        "procurement_mode": "Public Bidding",
        "region": "Region I",
        "budget": 5_000_000.0,
        "is_flagged": False,
    }
    return pd.DataFrame([{**defaults, **row} for row in rows])


def test_public_bidding_must_stay_open_for_the_seven_day_posting():
    frame = assess(
        notices(
            [
                {"published_date": "2024-03-01", "closing_date": "2024-03-05"},  # 4 days
                {"published_date": "2024-03-01", "closing_date": "2024-03-15"},  # 14 days
            ]
        )
    )

    assert frame["short_window"].tolist() == [True, False]


def test_small_value_requests_need_three_days_above_fifty_thousand():
    frame = assess(
        notices(
            [
                {
                    "procurement_mode": SVP,
                    "budget": 200_000.0,
                    "published_date": "2024-03-01",
                    "closing_date": "2024-03-02",
                },
                {
                    "procurement_mode": SVP,
                    "budget": 40_000.0,
                    "published_date": "2024-03-01",
                    "closing_date": "2024-03-02",
                },
            ]
        )
    )

    assert frame["short_window"].iloc[0] == True  # noqa: E712
    assert pd.isna(frame["short_window"].iloc[1])  # no posting required at or below 50,000


def test_long_window_uses_the_section_25_5_maximum_by_budget():
    frame = assess(
        notices(
            [
                # Last day of posting Jan 7; deadline 51 days later (Feb 27): over the maximum.
                {"published_date": "2024-01-01", "closing_date": "2024-02-27"},
                # Same window, budget above 50 million: the maximum is 65 days.
                {
                    "budget": 60_000_000.0,
                    "published_date": "2024-01-01",
                    "closing_date": "2024-02-28",
                },
            ]
        )
    )

    assert frame["long_window"].tolist() == [True, False]
    # Exactly 50 days after the last day of posting is still within the maximum.
    edge = assess(notices([{"published_date": "2024-01-01", "closing_date": "2024-02-26"}]))
    assert edge["long_window"].tolist() == [False]


def test_closing_before_publication_is_left_out_as_inconsistent():
    frame = assess(notices([{"published_date": "2024-03-10", "closing_date": "2024-03-01"}]))

    assert frame["dates_inconsistent"].iloc[0]
    assert pd.isna(frame["short_window"].iloc[0])


def test_unflagged_rate_is_weighted_to_the_flagged_mix():
    frame = pd.DataFrame(
        {
            "is_flagged": [True, True, False, False, False, False],
            "stratum": ["a", "b", "a", "a", "b", "b"],
            "short_window": [True, False, True, False, False, False],
        }
    )

    row = enrichment(frame, "short_window", ["stratum"])

    assert row["flagged_rate"] == 0.5
    # Unflagged: 50% in stratum a, 0% in b; the flagged mix is half a, half b.
    assert row["unflagged_rate_matched"] == 0.25
    assert row["ratio_to_matched"] == 2.0


def test_blind_sheet_pairs_each_flagged_notice_and_hides_the_group():
    rows = []
    for n in range(4):
        rows.append(
            {
                "notice": f"f{n}",
                "is_flagged": True,
                "score_rank": n + 1,
                "group": "Public Bidding",
                "region": "Region I",
                "band": 1.0,
            }
        )
    for n in range(10):
        rows.append(
            {
                "notice": f"u{n}",
                "is_flagged": False,
                "score_rank": 100 + n,
                "group": "Public Bidding",
                "region": "Region I" if n < 6 else "Region II",
                "band": 1.0,
            }
        )
    frame = pd.DataFrame(rows)
    for column in (
        "bid_reference_no",
        "procuring_entity_raw",
        "title",
        "procurement_mode",
        "budget",
        "published_date",
        "closing_date",
        "award_date",
    ):
        frame[column] = frame["notice"]

    sheet, key = blind_sheet(frame)

    assert len(sheet) == 8
    assert (key["in_group"] == "flagged").sum() == 4
    assert "in_group" not in sheet.columns and "score_rank" not in sheet.columns
    comparison = key[key["in_group"] == "comparison"]["bid_reference_no"]
    assert set(comparison) <= {f"u{n}" for n in range(6)}  # same region first
