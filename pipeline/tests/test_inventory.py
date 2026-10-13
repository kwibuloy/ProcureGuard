from pipeline.inventory import summarize

HEADER = (
    "Procuring Entity (PE),Bid Reference No.,Classification,Procurement Mode,"
    "Award Reference No.,Awardee Organization Name"
)


def write(tmp_path, name, lines):
    path = tmp_path / name
    path.write_text("\n".join([HEADER, *lines]) + "\n", encoding="utf-8-sig")
    return path


def test_counts_contracts_not_line_items(tmp_path):
    path = write(
        tmp_path,
        "legacy_2024_Q1.csv",
        [
            # One awarded public bidding notice spread over two line items.
            "DPWH A,100,Civil Works,Public Bidding,900,BUILDER ONE",
            "DPWH A,100,Civil Works,Public Bidding,900,BUILDER ONE",
            # A public bidding notice that was never awarded.
            "DPWH A,101,Civil Works,Public Bidding,NULL,NULL",
            # A negotiated notice: counted, but not a scrape target.
            "LGU B,102,Civil Works,Negotiated Procurement,901,BUILDER TWO",
            # An award made without a posted bid notice.
            "LGU B,0,Civil Works,Negotiated Procurement,902,BUILDER TWO",
            # Out of scope.
            "LGU B,103,Goods,Public Bidding,903,SUPPLIER",
            # Wrong number of columns.
            "broken,row",
        ],
    )

    result = summarize([path])

    assert result["files"]["legacy_2024_Q1.csv"] == {
        "rows": 7,
        "malformed": 1,
        "civil_works_rows": 5,
    }
    civil = result["civil_works"]
    assert civil["bid_notices"] == 3
    assert civil["bid_notices_awarded"] == 2
    assert civil["awards"] == 3
    assert civil["awards_without_bid_notice"] == 1
    assert civil["procuring_entities"] == 2
    assert civil["awardees"] == 2
    assert result["scrape"] == {"mode": "Public Bidding", "notices": 2, "notices_awarded": 1}


def test_same_reference_in_both_series_is_two_notices(tmp_path):
    line = "DPWH A,100,Civil Works,Public Bidding,900,BUILDER ONE"
    legacy = write(tmp_path, "legacy_2024_Q1.csv", [line])
    modern = write(tmp_path, "modern_2024_Q1.csv", [line])

    assert summarize([legacy, modern])["civil_works"]["bid_notices"] == 2
