"""Pipeline settings. Change the study's scope here, not in the code that uses it."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

# Contract years in scope. 2024 is the only recent year PhilGEPS publishes in full
# (docs/data-source.md).
YEARS = (2024,)


def is_civil_works(classification: str) -> bool:
    """Only infrastructure records are in scope.

    The legacy series says "Civil Works"; the modernized site labels the same
    class "Civil Works - Infra Project".
    """
    return classification.strip().lower().startswith("civil works")


# The document request count is collected only for competitively bid contracts.
SCRAPE_PROCUREMENT_MODE = "Public Bidding"
