"""Download the quarterly PhilGEPS CSV files into data/raw/.

Run with: python -m pipeline.download

Files already present are never downloaded again or overwritten. An interrupted
download resumes from its .part file on the next run.
"""

import argparse
import hashlib
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import requests

from pipeline import config
from pipeline.sources import SOURCES, Source

DOWNLOAD_URL = "https://drive.usercontent.google.com/download"
CHUNK_BYTES = 64 * 1024
ATTEMPTS = 5
# Google Drive sometimes throttles a connection to a few KB/s. Below this rate the
# download stops and keeps its .part file, so a later run can resume at full speed.
MIN_BYTES_PER_SECOND = 50_000
SPEED_WINDOW_SECONDS = 30
MANIFEST = "manifest.json"


class NotPublicError(RuntimeError):
    """The file is restricted: Google answered with a sign-in page, not the file."""


class ThrottledError(RuntimeError):
    """The server is sending too slowly to be worth waiting for."""


def _expected_size(response) -> int | None:
    content_range = response.headers.get("Content-Range", "")
    if "/" in content_range:
        total = content_range.rsplit("/", 1)[1]
        return int(total) if total.isdigit() else None
    length = response.headers.get("Content-Length")
    return int(length) if length and response.status_code == 200 else None


def _fetch(source: Source, part: Path, session) -> None:
    offset = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}
    params = {"id": source.file_id, "export": "download", "confirm": "t"}
    with session.get(
        DOWNLOAD_URL, params=params, headers=headers, stream=True, timeout=60
    ) as response:
        if response.status_code == 416:  # the .part file is already complete
            return
        if "text/html" in response.headers.get("Content-Type", ""):
            raise NotPublicError(f"{source.filename}: not publicly downloadable")
        response.raise_for_status()
        resumed = offset and response.status_code == 206
        expected = _expected_size(response)
        window_start, window_bytes = time.monotonic(), 0
        with open(part, "ab" if resumed else "wb") as out:
            for chunk in response.iter_content(CHUNK_BYTES):
                out.write(chunk)
                window_bytes += len(chunk)
                elapsed = time.monotonic() - window_start
                if elapsed >= SPEED_WINDOW_SECONDS:
                    if window_bytes / elapsed < MIN_BYTES_PER_SECOND:
                        raise ThrottledError(
                            f"{source.filename}: throttled to {window_bytes / elapsed:,.0f} B/s"
                        )
                    window_start, window_bytes = time.monotonic(), 0
    if expected is not None and part.stat().st_size != expected:
        raise OSError(f"{source.filename}: got {part.stat().st_size} of {expected} bytes")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def download(source: Source, raw_dir: Path, session) -> dict | None:
    """Download one file. Returns its manifest entry, or None if it was already there."""
    target = raw_dir / source.filename
    if target.exists():
        return None
    part = target.with_suffix(".part")
    for attempt in range(1, ATTEMPTS + 1):
        try:
            _fetch(source, part, session)
            break
        except (requests.RequestException, OSError):
            if attempt == ATTEMPTS:
                raise
    part.rename(target)
    return {
        "file": source.filename,
        "series": source.series,
        "year": source.year,
        "quarter": source.quarter,
        "file_id": source.file_id,
        "bytes": target.stat().st_size,
        "sha256": _sha256(target),
        "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def _record(raw_dir: Path, entries: list[dict]) -> None:
    manifest = raw_dir / MANIFEST
    existing = json.loads(manifest.read_text()) if manifest.exists() else []
    manifest.write_text(json.dumps(existing + entries, indent=2) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--years", type=int, nargs="+", default=list(config.YEARS))
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args(argv)

    sources = [s for s in SOURCES if s.year in args.years]
    if not sources:
        print(f"No public files are listed for {args.years}. See docs/data-source.md.")
        return 1
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)

    def run(source: Source):
        try:
            return source, download(source, config.RAW_DIR, requests.Session()), None
        except (requests.RequestException, OSError, NotPublicError, ThrottledError) as error:
            return source, None, error

    failed = False
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for source, entry, error in pool.map(run, sources):
            if error:
                failed = True
                print(f"FAILED   {source.filename}: {error}")
            elif entry is None:
                print(f"present  {source.filename}")
            else:
                _record(config.RAW_DIR, [entry])
                print(f"saved    {source.filename}  {entry['bytes']:,} bytes")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
