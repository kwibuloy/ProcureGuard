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
- **Document request scrape:** awarded civil works notices procured through Public Bidding only (`SCRAPE_PROCUREMENT_MODE`). A notice that was never awarded is skipped, because only awarded contracts are scored. For the 2024 files that is 80,422 notice pages, two to three days at one page every two seconds.

## Commands

Run from the repo root with the virtual environment's Python.

| Step | Command |
|---|---|
| Apply database migrations | `python -m pipeline.migrate` |
| Download the quarterly CSV files into `data/raw/` | `python -m pipeline.download` |
| Count what the files contain, before cleaning | `python -m pipeline.inventory` |
| Clean, standardize, collapse to contracts and load PostgreSQL | `python -m pipeline.load` |
| Report data quality from the database | `python -m pipeline.quality` |
| Collect document request counts from notice pages | `python -m pipeline.notices` |
| Load demonstration contracts for the dashboard | `python -m pipeline.demo` |

Order for real data: `migrate`, `download`, `load`, `notices`, then score (`ml/README.md`).

`download` never overwrites a file already in `data/raw/`, resumes an interrupted download, and records each file's size and SHA-256 in `data/raw/manifest.json`. About 1.4 GB for 2024. Google Drive throttles these downloads to a few KB/s after a short burst; the downloader then stops and keeps its `.part` file, so run it again later to continue.

`notices` fetches 100 notices per run by default, two seconds apart, and stores each result in `bid_notices`. Stored notices are skipped, so it can be stopped and restarted. `--all` fetches every remaining notice; `--refs` fetches named references. It stops by itself if the site fails repeatedly.

`load` keeps awarded civil works contracts only, one per award. Every row left out is counted by reason, and the counts are stored in `load_reports` for the dashboard's data quality page. Missing or unreadable values stay missing. It refuses to run while demonstration contracts are in the database.

`demo` writes generated contracts. Nothing in it describes a real organization. Score them with `python -m ml.score`. Run `python -m pipeline.demo --clear` before loading real data.

## What cleaning does

- **One contract per award.** A published row is a line item; contract fields repeat on each of an award's rows, so the first is kept and the rest counted.
- **Study period.** PhilGEPS groups its files by when the notice was published. A notice published in late 2024 can carry an award dated 2025; it is in scope. The period is set by which files are downloaded (`YEARS`).
- **Names.** Case, punctuation and common short forms (Corp., Inc., Const., &) are standardized so one organization is counted once. The published spelling is kept beside it.
- **Lots.** One notice can be awarded in several lots that share one approved budget. Each lot is its own contract; `ml/` sums them when comparing price to budget.
- **Line items.** `line_items` records the `Line Item No` values each award covers (legacy series; the 2.0 files have no line number). In 2024, 96 notices have more than one award notice for the same line item, always to the same awardee; `ml/` uses this to avoid adding them up. `load` fills `line_items` in for contracts stored before the column existed.

## Tests

```
.venv\Scripts\python -m pytest pipeline
```
