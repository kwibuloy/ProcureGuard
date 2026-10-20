from collections import Counter
from datetime import date
from decimal import Decimal

from pipeline.clean import (
    build_contracts,
    parse_amount,
    parse_date,
    standardize_name,
)
from pipeline.load import clean_files

HEADER = (
    "Procuring Entity (PE),Region,Bid Reference No.,Notice Title,Classification,"
    "Procurement Mode,Approved Budget of the Contract,Published Date,Closing Date,"
    "Award Reference No.,Award Title,Award Date,Contract Amount,Award Notice Status,"
    "Notice to Proceed Date,Awardee Organization Name"
)


def row(**changes) -> str:
    values = {
        "entity": "Mun. of Sample",
        "region": "Region I",
        "bid": "100",
        "title": "Road",
        "classification": "Civil Works",
        "mode": "Public Bidding",
        "budget": "1000000.00",
        "published": "01/02/2024",
        "closing": "22/02/2024",
        "award": "900",
        "award_title": "Road",
        "award_date": "05/03/2024",
        "amount": "990000.00",
        "status": "Posted",
        "ntp": "NULL",
        "awardee": "ABC Const. & Supply",
    }
    values.update(changes)
    return ",".join(values.values())


def write(tmp_path, name, lines):
    path = tmp_path / name
    path.write_text("\n".join([HEADER, *lines]) + "\n", encoding="utf-8-sig")
    return path


def test_names_written_differently_become_one():
    assert standardize_name("ABC Const. & Supply") == "ABC CONSTRUCTION AND SUPPLY"
    assert standardize_name("abc  construction and supply") == "ABC CONSTRUCTION AND SUPPLY"
    assert standardize_name("XYZ Builders, Inc.") == standardize_name("XYZ BUILDERS INCORPORATED")
    assert standardize_name("J - K Corp") == "J-K CORPORATION"


def test_amounts_that_are_not_real_prices_are_missing():
    assert parse_amount("1,234,567.89") == Decimal("1234567.89")
    assert parse_amount("0.00") is None
    assert parse_amount("-5") is None
    assert parse_amount("NULL") is None
    assert parse_amount("Vehicle rental") is None


def test_dates_in_both_published_formats():
    assert parse_date("19/11/2024") == date(2024, 11, 19)
    assert parse_date("2024-11-19") == date(2024, 11, 19)
    assert parse_date("NULL") is None
    assert parse_date("31/02/2024") is None


def test_one_contract_per_award_and_every_other_row_is_counted(tmp_path):
    path = write(
        tmp_path,
        "legacy_2024_Q1.csv",
        [
            row(),
            row(),  # second line item of the same award
            row(award="NULL", awardee="NULL"),  # never awarded
            row(award="901", status="Cancelled"),
            row(award="902", classification="Goods"),
            row(award="903", award_date="05/03/2025"),  # published in 2024, awarded in 2025
            "broken,row",
        ],
    )

    contracts, stats = clean_files([path])

    assert [c.award_reference_no for c in contracts] == ["900", "903"]
    contract = contracts[0]
    assert contract.line_item_count == 2
    assert contract.awardee == "ABC CONSTRUCTION AND SUPPLY"
    assert contract.awardee_raw == "ABC Const. & Supply"
    assert contract.procuring_entity == "MUNICIPALITY OF SAMPLE"
    assert contract.contract_amount == Decimal("990000.00")
    assert contract.award_date == date(2024, 3, 5)
    assert contract.notice_to_proceed_date is None
    assert stats["rows_read"] == 7
    assert stats["malformed_rows"] == 1
    assert stats["not_civil_works"] == 1
    assert stats["not_awarded"] == 1
    assert stats["award_cancelled"] == 1
    assert stats["extra_line_item_rows"] == 1
    assert contracts[1].award_date == date(2025, 3, 5)


def test_missing_and_unreadable_values_stay_missing(tmp_path):
    path = write(
        tmp_path,
        "legacy_2024_Q1.csv",
        [row(bid="0", amount="NULL", budget="abc", published="NULL")],
    )

    contracts, stats = clean_files([path])

    contract = contracts[0]
    assert contract.bid_reference_no is None
    assert contract.contract_amount is None
    assert contract.approved_budget is None
    assert contract.published_date is None
    assert stats["unreadable: Approved Budget of the Contract"] == 1
    assert "unreadable: Contract Amount" not in stats  # NULL is missing, not unreadable


def test_award_repeated_in_a_later_file_is_kept_once(tmp_path):
    first = write(tmp_path, "legacy_2024_Q1.csv", [row()])
    second = write(tmp_path, "legacy_2024_Q2.csv", [row(amount="1.00")])

    contracts, stats = clean_files([first, second])

    assert len(contracts) == 1
    assert contracts[0].contract_amount == Decimal("990000.00")
    assert stats["repeated_in_another_file"] == 1


def test_modernized_files_use_their_own_column_names():
    stats, contracts = Counter(), {}
    modern = {
        "Procuring Entity": "Sample State College",
        "Classification": "Civil Works - Infra Project",
        "Approved Budget of the Contract (ABC)": "500000.00",
        "Contract Amount": "480000.00",
        "Award Reference No.": "410",
        "Awardee Organization Name": "Builder One",
        "Award Date": "2024-03-04",
        "Source of Funds": "Internally Generated Funds",
    }

    build_contracts([(modern, False)], "modern", "modern_2024_Q1.csv", stats, contracts)

    contract = contracts[("modern", "410")]
    assert contract.procuring_entity_raw == "Sample State College"
    assert contract.approved_budget == Decimal("500000.00")
    assert contract.funding_source == "Internally Generated Funds"
    assert contract.award_date == date(2024, 3, 4)


def test_line_items_each_award_covers_are_recorded(tmp_path):
    header = HEADER + ",Line Item No,Item Budget"
    path = tmp_path / "legacy_2024_Q1.csv"
    lines = [
        row() + ",1,400000.00",
        row() + ",2,600000.00",
        row() + ",2,600000.00",  # same line repeated
        row(award="901") + ",NULL,NULL",
        row(award="902") + ",1,400000.00",
        row(award="902") + ",2,-1",  # placeholder budget
    ]
    path.write_text("\n".join([header, *lines]) + "\n", encoding="utf-8-sig")

    contracts, _ = clean_files([path])

    assert [c.line_items for c in contracts] == [["1", "2"], [], ["1", "2"]]
    assert [c.item_budget for c in contracts] == [Decimal("1000000.00"), None, None]


def test_award_dated_before_the_study_period_is_left_out(tmp_path):
    path = write(tmp_path, "legacy_2024_Q1.csv", [row(award_date="09/11/2023"), row(award="901")])

    contracts, stats = clean_files([path])

    assert [c.award_reference_no for c in contracts] == ["901"]
    assert stats["awarded_before_study_period"] == 1
