"""A check of the flags against procedural rules the model never sees.

Run with: python -m ml.independent
          python -m ml.independent --blind-sheet   (also write a blind review sheet)

The PCC check in Chapter 3 looks at the same patterns the indicators measure, so
it shows consistency, not independent support. This check uses two fields that
are not model inputs, the notice's publication and closing dates, and the
posting rules of the 2016 Revised IRR of RA 9184:

  short window  bids close before the Invitation to Bid could have been posted
                for the required period: 7 calendar days for public bidding
                (Section 21.2.1, Annex C), 3 calendar days for the request for
                quotation in Small Value Procurement above PHP 50,000 (Annex H)
  long window   public bidding whose period from the last day of posting to the
                bid deadline is longer than the maximum in Section 25.5: 50 days
                for budgets up to PHP 50 million, 65 days above. Posting runs on
                days 1 to 7 counting the publication date (Annex C), so the last
                day of posting is the publication date plus 6 days

Notices are compared, not contracts, so a notice awarded in lots counts once.
Flagged notices are compared with unflagged notices in the same procurement mode,
region and budget band (the unflagged rate is weighted to the flagged notices'
mix), so a difference is not just a difference in the kind of procurement.

A higher rate among flagged notices is red-flag enrichment on an independent
measure. It is not accuracy, and a short or long window can have an ordinary
explanation, including a date entered wrongly. Writes
data/processed/independent_check.json. Stored runs are not changed.
"""

import argparse
import json
import sys

import numpy as np
import pandas as pd

from ml.indicators import budget_band
from ml.settings import Settings
from pipeline.config import PROCESSED_DIR
from pipeline.db import connect

PUBLIC_BIDDING = "Public Bidding"
SMALL_VALUE = "Small Value Procurement"
POSTING_DAYS = {PUBLIC_BIDDING: 7, SMALL_VALUE: 3}
SMALL_VALUE_POSTING_FLOOR = 50_000  # Annex H: no posting required at or below this
LONG_WINDOW_LIMIT = 50_000_000
LONG_WINDOW_DAYS = (50, 65)  # Section 25.5, up to and above PHP 50 million

QUERY = """
WITH run AS (SELECT max(id) AS id FROM scoring_runs WHERE NOT is_demo),
ranked AS (
  SELECT COALESCE(c.source_series || ':' || c.bid_reference_no, 'award:' || c.id) AS notice,
         s.score_rank, s.is_flagged, c.procurement_mode, c.region,
         c.approved_budget::float8 AS budget, c.published_date, c.closing_date,
         c.bid_reference_no, c.procuring_entity_raw, c.title, c.award_date
  FROM contract_scores s JOIN contracts c ON c.id = s.contract_id
  WHERE s.run_id = (SELECT id FROM run)
)
SELECT DISTINCT ON (notice) * FROM ranked ORDER BY notice, score_rank
"""


def mode_group(mode: str | None) -> str:
    mode = mode or ""
    if mode == PUBLIC_BIDDING:
        return PUBLIC_BIDDING
    if SMALL_VALUE in mode:
        return SMALL_VALUE
    return "Other"


def assess(notices: pd.DataFrame) -> pd.DataFrame:
    """Add the two checks. Each is True, False, or missing when it cannot be assessed."""
    frame = notices.copy()
    frame["group"] = frame["procurement_mode"].map(mode_group)
    published = pd.to_datetime(frame["published_date"], errors="coerce")
    closing = pd.to_datetime(frame["closing_date"], errors="coerce")
    days = (closing - published).dt.days
    frame["window_days"] = days
    frame["dates_inconsistent"] = days < 0

    required = frame["group"].map(POSTING_DAYS)
    applies = required.notna() & days.notna() & (days >= 0)
    small_value_exempt = (frame["group"] == SMALL_VALUE) & (
        frame["budget"].fillna(0) <= SMALL_VALUE_POSTING_FLOOR
    )
    applies &= ~small_value_exempt
    frame["short_window"] = (days < required).where(applies)

    limit = np.where(frame["budget"].fillna(0) > LONG_WINDOW_LIMIT, *LONG_WINDOW_DAYS[::-1])
    public = (frame["group"] == PUBLIC_BIDDING) & days.notna() & (days >= 0)
    last_posting_day = POSTING_DAYS[PUBLIC_BIDDING] - 1
    frame["long_window"] = ((days - last_posting_day) > limit).where(public)
    return frame


def enrichment(frame: pd.DataFrame, check: str, strata: list[str]) -> dict:
    """Rate among flagged notices, and among unflagged ones weighted to the flagged mix."""
    usable = frame[frame[check].notna()].copy()
    usable[check] = usable[check].astype(bool)
    flagged = usable[usable["is_flagged"]]
    unflagged = usable[~usable["is_flagged"]]
    flagged_rate = float(flagged[check].mean()) if len(flagged) else None
    by_stratum = unflagged.groupby(strata)[check].mean()
    weights = flagged.groupby(strata).size()
    matched = weights.index.intersection(by_stratum.index)
    covered = int(weights.loc[matched].sum())
    standardized = (
        float((by_stratum.loc[matched] * weights.loc[matched]).sum() / covered) if covered else None
    )
    return {
        "check": check,
        "flagged_notices": int(len(flagged)),
        "flagged_shown": int(flagged[check].sum()),
        "flagged_rate": flagged_rate,
        "unflagged_notices": int(len(unflagged)),
        "unflagged_shown": int(unflagged[check].sum()),
        "unflagged_rate_raw": float(unflagged[check].mean()) if len(unflagged) else None,
        "unflagged_rate_matched": standardized,
        "flagged_notices_with_a_match": covered,
        "ratio_to_matched": (
            flagged_rate / standardized if flagged_rate is not None and standardized else None
        ),
    }


BLIND_SIZE = 20


def blind_sheet(frame: pd.DataFrame, seed: int = 2024) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The top flagged notices and as many unflagged ones from the same mode, region and band,
    shuffled under neutral IDs, for reviewers who must not know which group each one is in.
    Returns (sheet for reviewers, key kept apart from it)."""
    flagged = frame[frame["is_flagged"]].sort_values("score_rank").head(BLIND_SIZE)
    pool = frame[~frame["is_flagged"]]
    rng = np.random.default_rng(seed)
    picked = []
    for _, row in flagged.iterrows():
        same = pool[
            (pool["group"] == row["group"])
            & (pool["region"] == row["region"])
            & (pool["band"] == row["band"])
            & ~pool["notice"].isin(picked)
        ]
        if same.empty:
            same = pool[(pool["group"] == row["group"]) & ~pool["notice"].isin(picked)]
        picked.append(same.iloc[int(rng.integers(len(same)))]["notice"])
    both = pd.concat(
        [
            flagged.assign(in_group="flagged"),
            pool[pool["notice"].isin(picked)].assign(in_group="comparison"),
        ]
    )
    both = both.sample(frac=1, random_state=seed).reset_index(drop=True)
    both["review_id"] = [f"R{n:02d}" for n in range(1, len(both) + 1)]
    sheet = both[
        [
            "review_id",
            "bid_reference_no",
            "procuring_entity_raw",
            "title",
            "procurement_mode",
            "region",
            "budget",
            "published_date",
            "closing_date",
            "award_date",
        ]
    ].copy()
    # One outcome per notice, from the four defined in Section 3.13:
    # contract-specific observation, entity-level observation only,
    # no matching observation found, insufficient information.
    for column in ("outcome", "source_searched", "evidence_or_link", "notes"):
        sheet[column] = ""
    key = both[["review_id", "bid_reference_no", "in_group", "score_rank"]]
    return sheet, key


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--blind-sheet", action="store_true", help="also write a blind review sheet"
    )
    args = parser.parse_args(argv)
    with connect() as connection:
        notices = _read(connection)
    frame = assess(notices)
    frame["band"] = budget_band(frame["budget"], Settings().budget_bands)
    strata = ["group", "region", "band"]
    results = {
        "notices": int(len(frame)),
        "flagged_notices": int(frame["is_flagged"].sum()),
        "dates_inconsistent": int(frame["dates_inconsistent"].sum()),
        "checks": [],
    }
    for check in ("short_window", "long_window"):
        results["checks"].append(enrichment(frame, check, strata))
        for group in (PUBLIC_BIDDING, SMALL_VALUE):
            part = frame[frame["group"] == group]
            if part[check].notna().any():
                row = enrichment(part, check, strata)
                row["group"] = group
                results["checks"].append(row)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    path = PROCESSED_DIR / "independent_check.json"
    path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(
        f"{results['notices']:,} notices, {results['flagged_notices']:,} flagged;"
        f" {results['dates_inconsistent']:,} with closing before publication (left out)"
    )
    for row in results["checks"]:
        label = f"{row['check']:<13} {row.get('group', 'all modes'):<24}"
        print(
            f"{label} flagged {row['flagged_shown']:>5,}/{row['flagged_notices']:<6,}"
            f" = {_pct(row['flagged_rate'])}   unflagged {_pct(row['unflagged_rate_raw'])} raw,"
            f" {_pct(row['unflagged_rate_matched'])} matched"
        )
    print(f"Wrote {path}. Enrichment on an independent measure, not accuracy.")
    if args.blind_sheet:
        sheet, key = blind_sheet(frame)
        sheet_path = PROCESSED_DIR / "blind_review_sheet.csv"
        key_path = PROCESSED_DIR / "blind_review_key.csv"
        sheet.to_csv(sheet_path, index=False, encoding="utf-8-sig")
        key.to_csv(key_path, index=False, encoding="utf-8-sig")
        print(f"Wrote {sheet_path} for reviewers and {key_path}, to keep apart until they finish.")
    return 0


def _read(connection) -> pd.DataFrame:
    with connection.cursor() as cursor:
        cursor.execute(QUERY)
        columns = [column.name for column in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)


def _pct(value) -> str:
    return "  n/a" if value is None else f"{value:6.1%}"


if __name__ == "__main__":
    sys.exit(main())
