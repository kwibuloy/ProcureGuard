import pytest

from pipeline.download import NotPublicError, download
from pipeline.sources import LEGACY, Source

SOURCE = Source(LEGACY, 2024, 1, "file-id")
BODY = b"Procuring Entity (PE),Classification\nA,Civil Works\n"


class FakeResponse:
    def __init__(self, body, status=200, content_type="application/octet-stream", headers=None):
        self.body = body
        self.status_code = status
        self.headers = {"Content-Type": content_type, **(headers or {})}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size):
        yield self.body


class FakeSession:
    def __init__(self, respond):
        self.respond = respond
        self.requests = []

    def get(self, url, params=None, headers=None, **kwargs):
        self.requests.append(headers or {})
        return self.respond(headers or {})


def test_saves_file_and_describes_it(tmp_path):
    session = FakeSession(lambda h: FakeResponse(BODY, headers={"Content-Length": str(len(BODY))}))

    entry = download(SOURCE, tmp_path, session)

    assert (tmp_path / "legacy_2024_Q1.csv").read_bytes() == BODY
    assert entry["bytes"] == len(BODY)
    assert entry["file_id"] == "file-id"
    assert not (tmp_path / "legacy_2024_Q1.part").exists()


def test_existing_raw_file_is_never_touched(tmp_path):
    target = tmp_path / "legacy_2024_Q1.csv"
    target.write_bytes(b"original")
    session = FakeSession(lambda h: FakeResponse(BODY))

    assert download(SOURCE, tmp_path, session) is None
    assert target.read_bytes() == b"original"
    assert session.requests == []


def test_restricted_file_is_reported_not_saved(tmp_path):
    session = FakeSession(lambda h: FakeResponse(b"<html>Sign in</html>", content_type="text/html"))

    with pytest.raises(NotPublicError):
        download(SOURCE, tmp_path, session)
    assert not (tmp_path / "legacy_2024_Q1.csv").exists()


def test_interrupted_download_resumes_from_part_file(tmp_path):
    (tmp_path / "legacy_2024_Q1.part").write_bytes(BODY[:10])

    def respond(headers):
        assert headers["Range"] == "bytes=10-"
        return FakeResponse(
            BODY[10:],
            status=206,
            headers={"Content-Range": f"bytes 10-{len(BODY) - 1}/{len(BODY)}"},
        )

    download(SOURCE, tmp_path, FakeSession(respond))

    assert (tmp_path / "legacy_2024_Q1.csv").read_bytes() == BODY


def test_short_download_is_an_error(tmp_path):
    session = FakeSession(lambda h: FakeResponse(BODY[:5], headers={"Content-Length": "50"}))

    with pytest.raises(OSError):
        download(SOURCE, tmp_path, session)
    assert not (tmp_path / "legacy_2024_Q1.csv").exists()


def test_throttled_download_stops_and_keeps_partial_file(tmp_path, monkeypatch):
    from pipeline import download as module

    clock = iter(range(0, 10_000, 40))  # every look at the clock is 40 seconds later
    monkeypatch.setattr(module.time, "monotonic", lambda: next(clock))
    session = FakeSession(lambda h: FakeResponse(BODY, headers={"Content-Length": "999999"}))

    with pytest.raises(module.ThrottledError):
        download(SOURCE, tmp_path, session)
    assert (tmp_path / "legacy_2024_Q1.part").read_bytes() == BODY
    assert not (tmp_path / "legacy_2024_Q1.csv").exists()
