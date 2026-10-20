"""Measure the quality of the contracts stored in PostgreSQL.

Run with: python -m pipeline.quality

Counts come from querying the database, not from what the loader believes it did.
"""

import sys
from collections import Counter

from pipeline import config
from pipeline.db import connect

# Fields the three indicators depend on, with what each is needed for.
FIELDS = {
    "approved_budget": "price deviation",
    "contract_amount": "price deviation",
    "award_date": "timeline",
    "published_date": "timeline",
    "closing_date": "timeline",
    "bid_reference_no": "document requests",
    "region": "comparable contracts",
    "procurement_mode": "document requests",
}

INTAKE_LABELS = {
    "rows_read": "Rows read",
    "malformed_rows": "Rows with the wrong number of columns",
    "not_civil_works": "Rows that are not civil works",
    "civil_works_rows": "Civil works rows",
    "not_awarded": "Civil works rows with no award",
    "award_cancelled": "Rows of cancelled awards",
    "awarded_before_study_period": "Rows of awards dated before the study period",
    "no_procuring_entity": "Rows with no procuring entity",
    "extra_line_item_rows": "Extra line-item rows of the same award",
    "repeated_in_another_file": "Rows of an award already seen in another file",
    "contracts": "Contracts kept",
}


def snapshot(connection) -> dict:
    total = connection.execute("SELECT count(*) FROM contracts").fetchone()[0]
    present = connection.execute(
        "SELECT " + ", ".join(f"count({name})" for name in FIELDS) + " FROM contracts"
    ).fetchone()
    dates = connection.execute("SELECT min(award_date), max(award_date) FROM contracts").fetchone()
    impossible = connection.execute(
        "SELECT count(*) FILTER (WHERE award_date < published_date),"
        " count(*) FILTER (WHERE contract_amount > approved_budget * 1.0001)"
        " FROM contracts"
    ).fetchone()
    scrape = connection.execute(
        "SELECT count(DISTINCT (c.source_series, c.bid_reference_no)),"
        " count(DISTINCT (c.source_series, c.bid_reference_no))"
        "   FILTER (WHERE n.fetch_status = 'ok')"
        " FROM contracts c LEFT JOIN bid_notices n"
        "   ON n.source_series = c.source_series AND n.bid_reference_no = c.bid_reference_no"
        " WHERE c.bid_reference_no IS NOT NULL AND c.procurement_mode = %s",
        [config.SCRAPE_PROCUREMENT_MODE],
    ).fetchone()
    return {
        "contracts": total,
        "present": dict(zip(FIELDS, present, strict=True)),
        "award_dates": dates,
        "awarded_before_published": impossible[0],
        "amount_above_budget": impossible[1],
        "notices_to_fetch": scrape[0],
        "notices_fetched": scrape[1],
    }


def print_report(intake: Counter | dict, quality: dict) -> None:
    if intake:
        print("Intake")
        for key, label in INTAKE_LABELS.items():
            if key in intake:
                print(f"  {intake[key]:>10,}  {label}")
        for key, value in intake.items():
            if key.startswith("unreadable"):
                print(f"  {value:>10,}  Values that could not be read ({key.split(': ')[1]})")
        if "awardee_names_published" in intake:
            print(
                f"\nNames: {intake['entity_names_published']:,} entity spellings became"
                f" {intake['entity_names_standardized']:,};"
                f" {intake['awardee_names_published']:,} awardee spellings became"
                f" {intake['awardee_names_standardized']:,}."
            )
    total = quality["contracts"]
    print(f"\nStored contracts: {total:,}")
    if not total:
        return
    start, end = quality["award_dates"]
    print(f"Award dates: {start} to {end}")
    print("\nField completeness")
    for name, used_for in FIELDS.items():
        present = quality["present"][name]
        print(f"  {present / total:>6.1%}  {name}  (needed for {used_for})")
    print("\nValues that cannot be right")
    print(f"  {quality['awarded_before_published']:>10,}  awarded before the notice was published")
    print(f"  {quality['amount_above_budget']:>10,}  contract amount above the approved budget")
    print(
        f"\nDocument requests: {quality['notices_fetched']:,} of"
        f" {quality['notices_to_fetch']:,} public bidding notices fetched."
    )


def main() -> int:
    with connect() as connection:
        row = connection.execute(
            "SELECT intake FROM load_reports ORDER BY id DESC LIMIT 1"
        ).fetchone()
        print_report(row[0] if row else {}, snapshot(connection))
    return 0


if __name__ == "__main__":
    sys.exit(main())
