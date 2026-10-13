"""Collect the document request count from public PhilGEPS bid notice pages.

Run with: python -m pipeline.notices            (next 100 notices not yet fetched)
          python -m pipeline.notices --all      (every remaining notice)
          python -m pipeline.notices --refs 11214813 11329838

PhilGEPS publishes no bidder count. Each legacy bid notice page shows how many
suppliers requested the bidding documents, which this project uses as a proxy
for competition (docs/data-source.md). One page is fetched per notice, slowly,
and every result is stored in bid_notices so no notice is ever fetched twice.
A run can be stopped and restarted at any point.
"""

import argparse
import re
import sys
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import requests

from pipeline import config
from pipeline.db import connect
from pipeline.inventory import NO_BID_NOTICE, read_rows
from pipeline.sources import LEGACY

NOTICE_URL = "https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx"
USER_AGENT = "ProcureGuard/0.1 (academic research on public procurement data)"
DEFAULT_DELAY_SECONDS = 2.0
DEFAULT_LIMIT = 100
# Stop instead of hammering the site when it keeps failing.
MAX_CONSECUTIVE_FAILURES = 5
BACKOFF_SECONDS = 30
# The site answers a missing notice and some of its own errors with the same page.
# A long unbroken run of "no page" results more likely means the site is failing.
MAX_CONSECUTIVE_NOT_FOUND = 10


@dataclass(frozen=True)
class Notice:
    fetch_status: str  # 'ok', 'not_found' or 'unreadable'
    document_request_count: int | None = None
    bid_supplement_count: int | None = None
    notice_status: str | None = None


def _field(html: str, element_id: str) -> str | None:
    match = re.search(rf'id="{element_id}"[^>]*>([^<]*)<', html)
    return match.group(1).strip() if match else None


def _count(text: str | None) -> int | None:
    return int(text) if text and text.isdigit() else None


def parse_notice(html: str) -> Notice:
    requests_text = _field(html, "lblDisplayDocReqList")
    if requests_text is None:
        # A real notice page always carries its reference number field.
        is_notice = _field(html, "lblDisplayReferenceNo") is not None
        return Notice("unreadable" if is_notice else "not_found")
    count = _count(requests_text)
    if count is None:
        return Notice("unreadable")
    return Notice(
        "ok",
        document_request_count=count,
        bid_supplement_count=_count(_field(html, "lblDisplayBidSupplements")),
        notice_status=_field(html, "lblDisplayStatus"),
    )


def targets(paths: Iterable[Path]) -> Iterator[str]:
    """Bid references of civil works notices procured by public bidding, each once."""
    seen = set()
    for path in paths:
        for row, malformed in read_rows(path):
            if malformed or row["Classification"].strip().lower() != config.CIVIL_WORKS:
                continue
            if row["Procurement Mode"].strip() != config.SCRAPE_PROCUREMENT_MODE:
                continue
            reference = row["Bid Reference No."].strip()
            if reference in NO_BID_NOTICE or reference in seen:
                continue
            seen.add(reference)
            yield reference


def fetch(reference: str, session) -> str:
    response = session.get(
        NOTICE_URL,
        params={"refID": reference},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def already_fetched(connection) -> set[str]:
    rows = connection.execute(
        "SELECT bid_reference_no FROM bid_notices WHERE source_series = %s", [LEGACY]
    )
    return {row[0] for row in rows}


def save(connection, reference: str, notice: Notice) -> None:
    with connection.transaction():
        connection.execute(
            "INSERT INTO bid_notices (source_series, bid_reference_no, fetch_status,"
            " document_request_count, bid_supplement_count, notice_status)"
            " VALUES (%s, %s, %s, %s, %s, %s)"
            " ON CONFLICT (source_series, bid_reference_no) DO NOTHING",
            [
                LEGACY,
                reference,
                notice.fetch_status,
                notice.document_request_count,
                notice.bid_supplement_count,
                notice.notice_status,
            ],
        )


def collect(
    connection,
    references: Iterable[str],
    session,
    *,
    limit: int | None = DEFAULT_LIMIT,
    delay: float = DEFAULT_DELAY_SECONDS,
    sleep=time.sleep,
) -> dict:
    """Fetch and store notices not yet in bid_notices. Returns counts by outcome."""
    done = already_fetched(connection)
    counts = {"ok": 0, "not_found": 0, "unreadable": 0, "failed": 0, "skipped": 0}
    failures = missing = 0
    for reference in references:
        if reference in done:
            counts["skipped"] += 1
            continue
        fetched = counts["ok"] + counts["not_found"] + counts["unreadable"]
        if limit is not None and fetched >= limit:
            break
        try:
            notice = parse_notice(fetch(reference, session))
        except requests.RequestException:
            counts["failed"] += 1
            failures += 1
            if failures >= MAX_CONSECUTIVE_FAILURES:
                counts["stopped_early"] = True
                break
            sleep(BACKOFF_SECONDS * failures)
            continue
        failures = 0
        save(connection, reference, notice)
        done.add(reference)
        counts[notice.fetch_status] += 1
        missing = missing + 1 if notice.fetch_status == "not_found" else 0
        if missing >= MAX_CONSECUTIVE_NOT_FOUND:
            counts["stopped_early"] = True
            break
        sleep(delay)
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refs", nargs="+", help="fetch these bid references only")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--all", action="store_true", help="fetch every remaining notice")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    args = parser.parse_args(argv)

    if args.refs:
        references = args.refs
    else:
        paths = sorted(config.RAW_DIR.glob(f"{LEGACY}_*.csv"))
        if not paths:
            print(f"No legacy CSV files in {config.RAW_DIR}. Run: python -m pipeline.download")
            return 1
        references = targets(paths)

    with connect() as connection:
        counts = collect(
            connection,
            references,
            requests.Session(),
            limit=None if args.all or args.refs else args.limit,
            delay=args.delay,
        )
    print(
        f"fetched ok {counts['ok']:,}, no page {counts['not_found']:,},"
        f" unreadable {counts['unreadable']:,}, failed {counts['failed']:,},"
        f" already stored {counts['skipped']:,}"
    )
    if counts.get("stopped_early"):
        print(
            "Stopped: the notice site failed or returned no page many times in a row."
            " Check the site, then run again to continue."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
