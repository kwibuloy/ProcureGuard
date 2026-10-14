"""Count what the downloaded PhilGEPS files contain, before any cleaning.

Run with: python -m pipeline.inventory

Reports rows per file, then contract-level counts for civil works: how many bid
notices and awards there are, by procurement mode, and how many notice pages the
document request scrape would need to fetch.
"""

import csv
import sys
from collections import Counter
from pathlib import Path

from pipeline import config

csv.field_size_limit(2**31 - 1)

NO_BID_NOTICE = {"0", "", "NULL"}
MISSING = {"", "NULL"}


def read_rows(path: Path):
    """Yield (row dict, is_malformed). A malformed row has the wrong number of columns."""
    with open(path, encoding="utf-8-sig", errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        for values in reader:
            if len(values) != len(header):
                yield None, True
            else:
                yield dict(zip(header, values, strict=True)), False


def summarize(paths: list[Path]) -> dict:
    files = {}
    notices = {}  # bid reference -> {"mode", "awarded"}
    awards = set()
    awards_without_notice = set()
    entities, awardees = set(), set()

    for path in paths:
        counts = Counter()
        for row, malformed in read_rows(path):
            counts["rows"] += 1
            if malformed:
                counts["malformed"] += 1
                continue
            if not config.is_civil_works(row["Classification"]):
                continue
            counts["civil_works_rows"] += 1
            entities.add(row.get("Procuring Entity (PE)") or row.get("Procuring Entity"))
            award = row["Award Reference No."].strip()
            awardee = row["Awardee Organization Name"].strip()
            awarded = award not in MISSING and awardee not in MISSING
            if awarded:
                awards.add(award)
                awardees.add(awardee)
            bid = row["Bid Reference No."].strip()
            if bid in NO_BID_NOTICE:
                if awarded:
                    awards_without_notice.add(award)
                continue
            notice = notices.setdefault((path.name.split("_")[0], bid), {"awarded": False})
            notice["mode"] = row["Procurement Mode"].strip()
            notice["awarded"] = notice["awarded"] or awarded
        files[path.name] = dict(counts)

    by_mode = Counter(n["mode"] for n in notices.values())
    scrape = [n for n in notices.values() if n["mode"] == config.SCRAPE_PROCUREMENT_MODE]
    return {
        "files": files,
        "civil_works": {
            "bid_notices": len(notices),
            "bid_notices_awarded": sum(n["awarded"] for n in notices.values()),
            "awards": len(awards),
            "awards_without_bid_notice": len(awards_without_notice),
            "procuring_entities": len(entities),
            "awardees": len(awardees),
            "bid_notices_by_mode": dict(by_mode.most_common()),
        },
        "scrape": {
            "mode": config.SCRAPE_PROCUREMENT_MODE,
            "notices": len(scrape),
            "notices_awarded": sum(n["awarded"] for n in scrape),
        },
    }


def main() -> int:
    paths = sorted(config.RAW_DIR.glob("*.csv"))
    if not paths:
        print(f"No CSV files in {config.RAW_DIR}. Run: python -m pipeline.download")
        return 1
    result = summarize(paths)

    print("Per file")
    for name, counts in result["files"].items():
        print(
            f"  {name:22} rows {counts.get('rows', 0):>9,}"
            f"  malformed {counts.get('malformed', 0):>6,}"
            f"  civil works rows {counts.get('civil_works_rows', 0):>8,}"
        )
    civil = result["civil_works"]
    print("\nCivil works, contract level")
    print(f"  bid notices                 {civil['bid_notices']:>8,}")
    print(f"  bid notices with an award   {civil['bid_notices_awarded']:>8,}")
    print(f"  awards                      {civil['awards']:>8,}")
    print(f"  awards with no bid notice   {civil['awards_without_bid_notice']:>8,}")
    print(f"  procuring entities (raw)    {civil['procuring_entities']:>8,}")
    print(f"  awardees (raw names)        {civil['awardees']:>8,}")
    print("\nCivil works bid notices by procurement mode")
    for mode, count in civil["bid_notices_by_mode"].items():
        print(f"  {count:>8,}  {mode}")
    scrape = result["scrape"]
    print(f"\nDocument request scrape ({scrape['mode']} only)")
    print(f"  notice pages to fetch       {scrape['notices']:>8,}")
    print(f"  of which have an award      {scrape['notices_awarded']:>8,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
