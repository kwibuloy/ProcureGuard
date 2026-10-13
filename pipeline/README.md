# pipeline

Data ingestion and preprocessing (Objective 1). Read `docs/data-source.md` first: it records what the PhilGEPS portal actually provides.

## Setup

From the repo root:

```
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Decisions

- **Years:** 2024 only, set in `config.py` (`YEARS`). It is the only recent year PhilGEPS publishes in full.
- **Scope:** `Classification = Civil Works`.
- **Document request scrape:** civil works notices procured through Public Bidding only (`SCRAPE_PROCUREMENT_MODE`).

## Commands

Run from the repo root with the virtual environment's Python.

| Step | Command | Status |
|---|---|---|
| Apply database migrations | `python -m pipeline.migrate` | Built |
| Download the quarterly CSV files into `data/raw/` | `python -m pipeline.download` | Built |
| Count what the files contain | `python -m pipeline.inventory` | Built |
| Collect document request counts from notice pages | `python -m pipeline.notices` | Built |
| Clean, standardize and collapse to contract level | | Not built |
| Load into PostgreSQL | | Not built |
| Data quality report | | Not built |
| Load demonstration data for the dashboard | `python -m pipeline.demo` | Built |

`download` never overwrites a file already in `data/raw/`, resumes an interrupted download, and records each file's size and SHA-256 in `data/raw/manifest.json`. About 1.4 GB for 2024. Google Drive throttles these downloads to a few KB/s after a short burst; the downloader then stops and keeps its `.part` file, so run it again later to continue.

`notices` fetches 100 notices per run by default, two seconds apart, and stores each result in `bid_notices`. Stored notices are skipped, so it can be stopped and restarted. `--all` fetches every remaining notice; `--refs` fetches named references. It stops by itself if the site fails repeatedly.

`demo` writes generated contracts and scores marked `is_demo`. Nothing in it describes a real organization. Run `python -m pipeline.demo --clear` before loading real data.

## Tests

```
.venv\Scripts\python -m pytest pipeline
```
