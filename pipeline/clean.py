"""Turn raw PhilGEPS rows into one clean record per awarded civil works contract.

A raw row is a line item. Everything that describes the contract is repeated on
each of an award's rows, so the first row is kept and the rest are counted.
Nothing is guessed: a value that is missing or unreadable stays missing and is
counted, because a filled-in price or date would create or hide a red flag.
"""

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pipeline import config
from pipeline.sources import LEGACY

MISSING = {"", "NULL"}
NO_BID_NOTICE = {"0", "", "NULL"}

# Columns that are named differently in the modernized (2.0) files.
MODERN_NAMES = {
    "Procuring Entity (PE)": "Procuring Entity",
    "Approved Budget of the Contract": "Approved Budget of the Contract (ABC)",
    "Funding Source": "Source of Funds",
}

# Spelled-out forms, so one organization written two ways is counted as one.
_WORD_FORMS = {
    "CORP": "CORPORATION",
    "INC": "INCORPORATED",
    "CO": "COMPANY",
    "ENT": "ENTERPRISES",
    "ENTERPRISE": "ENTERPRISES",
    "CONST": "CONSTRUCTION",
    "CONSTR": "CONSTRUCTION",
    "GEN": "GENERAL",
    "DEV": "DEVELOPMENT",
    "DEVT": "DEVELOPMENT",
    "ENGG": "ENGINEERING",
    "SVCS": "SERVICES",
    "MDSE": "MERCHANDISE",
    "MERCHANDIZING": "MERCHANDISING",
    "BLDRS": "BUILDERS",
    "MUN": "MUNICIPALITY",
    "DEPT": "DEPARTMENT",
    "GOVT": "GOVERNMENT",
    "PROV": "PROVINCE",
    "BRGY": "BARANGAY",
}


@dataclass
class Contract:
    source_series: str
    award_reference_no: str
    bid_reference_no: str | None
    title: str
    procuring_entity: str
    procuring_entity_raw: str
    region: str | None
    province: str | None
    city_municipality: str | None
    entity_type: str | None
    entity_type_group: str | None
    procurement_mode: str | None
    business_category: str | None
    funding_source: str | None
    approved_budget: Decimal | None
    contract_amount: Decimal | None
    published_date: date | None
    closing_date: date | None
    award_date: date | None
    notice_to_proceed_date: date | None
    awardee: str
    awardee_raw: str
    awardee_region: str | None
    awardee_province: str | None
    awardee_size: str | None
    line_item_count: int
    source_file: str
    # "Line Item No" of each line the award covers (legacy series only).
    line_items: list[str] = field(default_factory=list)
    # Sum of those lines' "Item Budget"; None when any is missing or not positive.
    item_budget: Decimal | None = None


def text(value: str | None) -> str | None:
    """Trimmed text, or None for an empty or NULL cell."""
    cleaned = " ".join((value or "").split())
    return None if cleaned in MISSING else cleaned


def standardize_name(raw: str) -> str:
    """One spelling for an organization name: case, punctuation and common short forms."""
    name = raw.upper().replace("&", " AND ")
    name = re.sub(r"[.,;:'\"`]", " ", name)
    name = re.sub(r"\s*-\s*", "-", name)
    words = [_WORD_FORMS.get(word, word) for word in name.split()]
    return " ".join(words)


def parse_amount(value: str | None) -> Decimal | None:
    """A positive peso amount, or None. Zero and negative amounts are not real prices."""
    cleaned = text(value)
    if cleaned is None:
        return None
    try:
        amount = Decimal(cleaned.replace(",", ""))
    except InvalidOperation:
        return None
    return amount if amount.is_finite() and amount > 0 else None


def parse_date(value: str | None) -> date | None:
    """Legacy files write DD/MM/YYYY; modernized files write YYYY-MM-DD."""
    cleaned = text(value)
    if cleaned is None:
        return None
    for pattern in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned[:10], pattern).date()
        except ValueError:
            continue
    return None


def _reader(row: dict, series: str):
    def get(column: str) -> str | None:
        name = column if series == LEGACY else MODERN_NAMES.get(column, column)
        return row.get(name)

    return get


def build_contracts(
    rows: Iterable[tuple[dict | None, bool]],
    series: str,
    source_file: str,
    stats: Counter,
    contracts: dict[tuple[str, str], Contract],
) -> None:
    """Add the awarded civil works contracts in `rows` to `contracts`, counting every outcome."""
    seen_here: set[tuple[str, str]] = set()
    # Awards with a line whose item budget is missing; their total stays unknown.
    budget_unknown: set[tuple[str, str]] = set()
    for row, malformed in rows:
        stats["rows_read"] += 1
        if malformed:
            stats["malformed_rows"] += 1
            continue
        get = _reader(row, series)
        if not config.is_civil_works(get("Classification") or ""):
            stats["not_civil_works"] += 1
            continue
        stats["civil_works_rows"] += 1
        award = text(get("Award Reference No."))
        awardee_raw = text(get("Awardee Organization Name"))
        if award is None or awardee_raw is None:
            stats["not_awarded"] += 1
            continue
        if (get("Award Notice Status") or "").strip().lower() == "cancelled":
            stats["award_cancelled"] += 1
            continue
        entity_raw = text(get("Procuring Entity (PE)"))
        if entity_raw is None:
            stats["no_procuring_entity"] += 1
            continue

        # Files are grouped by publish date, so a notice without one can carry an
        # award from before the study period.
        awarded = parse_date(get("Award Date"))
        if awarded is not None and awarded.year < min(config.YEARS):
            stats["awarded_before_study_period"] += 1
            continue

        key = (series, award)
        line = text(get("Line Item No"))
        item_budget = parse_amount(get("Item Budget")) if line is not None else None
        if key in contracts:
            if key in seen_here:
                contract = contracts[key]
                contract.line_item_count += 1
                if line is not None and line not in contract.line_items:
                    contract.line_items.append(line)
                    if item_budget is None:
                        budget_unknown.add(key)
                        contract.item_budget = None
                    elif key not in budget_unknown:
                        contract.item_budget += item_budget
                stats["extra_line_item_rows"] += 1
            else:
                stats["repeated_in_another_file"] += 1
            continue
        seen_here.add(key)

        amounts = {
            name: get(name) for name in ("Approved Budget of the Contract", "Contract Amount")
        }
        dates = {
            name: get(name)
            for name in ("Published Date", "Closing Date", "Award Date", "Notice to Proceed Date")
        }
        for name, value in {**amounts, **dates}.items():
            parsed = parse_amount(value) if name in amounts else parse_date(value)
            if parsed is None and text(value) is not None:
                stats[f"unreadable: {name}"] += 1

        bid = text(get("Bid Reference No."))
        contracts[key] = Contract(
            source_series=series,
            award_reference_no=award,
            bid_reference_no=None if bid is None or bid in NO_BID_NOTICE else bid,
            title=text(get("Award Title")) or text(get("Notice Title")) or "Untitled",
            procuring_entity=standardize_name(entity_raw),
            procuring_entity_raw=entity_raw,
            region=text(get("Region")),
            province=text(get("Province")),
            city_municipality=text(get("City/Municipality")),
            entity_type=text(get("PE Organization Type")),
            entity_type_group=text(get("PE Organization Type (Grouped)")),
            procurement_mode=text(get("Procurement Mode")),
            business_category=text(get("Business Category")),
            funding_source=text(get("Funding Source")),
            approved_budget=parse_amount(amounts["Approved Budget of the Contract"]),
            contract_amount=parse_amount(amounts["Contract Amount"]),
            published_date=parse_date(dates["Published Date"]),
            closing_date=parse_date(dates["Closing Date"]),
            award_date=parse_date(dates["Award Date"]),
            notice_to_proceed_date=parse_date(dates["Notice to Proceed Date"]),
            awardee=standardize_name(awardee_raw),
            awardee_raw=awardee_raw,
            awardee_region=text(get("Region of Awardee")),
            awardee_province=text(get("Province of Awardee")),
            awardee_size=text(get("Awardee Size")),
            line_item_count=1,
            source_file=source_file,
            line_items=[] if line is None else [line],
            item_budget=item_budget,
        )
        if item_budget is None:
            budget_unknown.add(key)


def name_counts(contracts: Iterable[Contract]) -> dict[str, int]:
    """How many distinct names standardization merged, for the quality report."""
    entities_raw, entities, awardees_raw, awardees = set(), set(), set(), set()
    for contract in contracts:
        entities_raw.add(contract.procuring_entity_raw)
        entities.add(contract.procuring_entity)
        awardees_raw.add(contract.awardee_raw)
        awardees.add(contract.awardee)
    return {
        "entity_names_published": len(entities_raw),
        "entity_names_standardized": len(entities),
        "awardee_names_published": len(awardees_raw),
        "awardee_names_standardized": len(awardees),
    }
