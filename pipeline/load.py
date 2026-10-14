"""Clean the downloaded PhilGEPS files and load the contracts into PostgreSQL.

Run with: python -m pipeline.load

Reads every CSV in data/raw/, keeps awarded civil works contracts, and inserts
the ones not already stored. Running it again adds only new contracts. Ends with
a data quality report; read it before scoring.
"""

import json
import sys
from collections import Counter
from dataclasses import astuple, fields
from pathlib import Path

from pipeline import config
from pipeline.clean import Contract, build_contracts, name_counts
from pipeline.db import connect
from pipeline.inventory import read_rows
from pipeline.quality import print_report, snapshot

COLUMNS = [field.name for field in fields(Contract)]
INSERT = (
    f"INSERT INTO contracts ({', '.join(COLUMNS)})"
    f" VALUES ({', '.join(['%s'] * len(COLUMNS))})"
    " ON CONFLICT (source_series, award_reference_no) DO NOTHING"
)
DEMO_SOURCE = "DEMO"


def clean_files(paths: list[Path]) -> tuple[list[Contract], Counter]:
    """Clean every file given.

    The study period is set by which files are downloaded (config.YEARS). PhilGEPS
    groups its files by when the notice was published, so a notice published late
    in the year can carry an award dated the following year. Those are in scope.
    """
    stats: Counter = Counter()
    contracts: dict[tuple[str, str], Contract] = {}
    for path in paths:
        series = path.name.split("_")[0]
        build_contracts(read_rows(path), series, path.name, stats, contracts)
    kept = list(contracts.values())
    stats["contracts"] = len(kept)
    stats.update(name_counts(kept))
    return kept, stats


def store(connection, contracts: list[Contract], stats: Counter, source_files: list[str]) -> int:
    """Insert contracts not already stored and record the load. Returns how many were new."""
    with connection.transaction():
        before = connection.execute("SELECT count(*) FROM contracts").fetchone()[0]
        with connection.cursor() as cursor:
            cursor.executemany(INSERT, [astuple(contract) for contract in contracts])
        after = connection.execute("SELECT count(*) FROM contracts").fetchone()[0]
        stats["contracts_new"] = after - before
        connection.execute(
            "INSERT INTO load_reports (source_files, intake) VALUES (%s, %s)",
            [json.dumps(source_files), json.dumps(dict(stats))],
        )
    # Refresh the planner's statistics; after a bulk load they describe an empty table.
    connection.execute("ANALYZE contracts")
    return after - before


def main() -> int:
    paths = sorted(config.RAW_DIR.glob("*.csv"))
    if not paths:
        print(f"No CSV files in {config.RAW_DIR}. Run: python -m pipeline.download")
        return 1
    with connect() as connection:
        demo = connection.execute(
            "SELECT count(*) FROM contracts WHERE source_file = %s", [DEMO_SOURCE]
        ).fetchone()[0]
        if demo:
            print(
                f"{demo:,} demonstration contracts are in the database. Real and generated"
                " contracts must not be mixed. Run: python -m pipeline.demo --clear"
            )
            return 1
        contracts, stats = clean_files(paths)
        new = store(connection, contracts, stats, [path.name for path in paths])
        print(f"Loaded {new:,} new contracts ({len(contracts):,} cleaned).\n")
        print_report(stats, snapshot(connection))
    return 0


if __name__ == "__main__":
    sys.exit(main())
