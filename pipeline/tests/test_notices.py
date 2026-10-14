from contextlib import nullcontext

import requests

from pipeline.notices import Notice, collect, parse_notice, targets

PAGE = """
<span id="lblDisplayReferenceNo" class="DisplayText5">11214813</span>
<span id="lblDisplayStatus" class="DisplayText5">Awarded</span>
<span id="lblDisplayBidSupplements" class="DisplayText5">2</span>
<span id="lblDisplayDocReqList" class="DisplayText5">4</span>
"""
ERROR_PAGE = "<html><title>Infomation Page</title></html>"


class FakeConnection:
    def __init__(self, stored=()):
        self.stored = {reference: None for reference in stored}

    def transaction(self):
        return nullcontext()

    def execute(self, sql, params=None):
        if sql.startswith("SELECT"):
            return [(reference,) for reference in self.stored]
        self.stored[params[1]] = params[2:]
        return []


class FakeResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


class FakeSession:
    def __init__(self, pages):
        self.pages = pages
        self.fetched = []

    def get(self, url, params=None, **kwargs):
        reference = params["refID"]
        self.fetched.append(reference)
        page = self.pages[reference]
        if isinstance(page, Exception):
            raise page
        return FakeResponse(page)


def no_sleep(seconds):
    pass


def test_reads_counts_from_a_notice_page():
    assert parse_notice(PAGE) == Notice("ok", 4, 2, "Awarded")


def test_error_page_means_the_notice_has_no_page():
    assert parse_notice(ERROR_PAGE) == Notice("not_found")


def test_notice_page_without_a_usable_count_is_unreadable():
    page = PAGE.replace(">4<", "><")
    assert parse_notice(page) == Notice("unreadable")
    assert parse_notice('<span id="lblDisplayReferenceNo">1</span>') == Notice("unreadable")


def test_targets_are_awarded_public_bidding_civil_works_notices_once_each(tmp_path):
    path = tmp_path / "legacy_2024_Q1.csv"
    lines = [
        "Bid Reference No.,Classification,Procurement Mode,Awardee Organization Name",
        "100,Civil Works,Public Bidding,Builder One",
        "100,Civil Works,Public Bidding,Builder One",
        "101,Civil Works,Negotiated Procurement,Builder One",
        "102,Goods,Public Bidding,Supplier",
        "0,Civil Works,Public Bidding,Builder One",
        "103,Civil Works,Public Bidding,Builder Two",
        # Never awarded, so its count would not be used.
        "104,Civil Works,Public Bidding,NULL",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")

    assert list(targets([path])) == ["100", "103"]


def test_stored_notices_are_not_fetched_again(tmp_path):
    connection = FakeConnection(stored=["100"])
    session = FakeSession({"101": PAGE})

    counts = collect(connection, ["100", "101"], session, sleep=no_sleep)

    assert session.fetched == ["101"]
    assert counts["ok"] == 1 and counts["skipped"] == 1
    assert connection.stored["101"] == ["ok", 4, 2, "Awarded"]


def test_limit_caps_pages_fetched_in_one_run():
    session = FakeSession({"1": PAGE, "2": PAGE, "3": PAGE})

    collect(FakeConnection(), ["1", "2", "3"], session, limit=2, sleep=no_sleep)

    assert session.fetched == ["1", "2"]


def test_failed_fetch_is_not_stored_so_it_is_retried_next_run():
    connection = FakeConnection()
    session = FakeSession({"1": requests.ConnectionError(), "2": PAGE})

    counts = collect(connection, ["1", "2"], session, sleep=no_sleep)

    assert counts["failed"] == 1 and counts["ok"] == 1
    assert "1" not in connection.stored


def test_stops_when_the_site_keeps_failing():
    pages = {str(n): requests.ConnectionError() for n in range(20)}
    session = FakeSession(pages)

    counts = collect(FakeConnection(), list(pages), session, sleep=no_sleep)

    assert counts["stopped_early"] is True
    assert len(session.fetched) == 5


def test_stops_on_a_long_run_of_missing_pages():
    pages = {str(n): ERROR_PAGE for n in range(30)}
    session = FakeSession(pages)

    counts = collect(FakeConnection(), list(pages), session, sleep=no_sleep)

    assert counts["stopped_early"] is True
    assert len(session.fetched) == 10
