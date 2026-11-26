# ProcureGuard

A capstone prototype: a decision-support system that flags, ranks and explains statistically unusual public infrastructure procurement contracts in the Philippines, using PhilGEPS open data and unsupervised anomaly detection.

**A flag means "statistically unusual, warrants human review". It is not proof of wrongdoing.** The suppliers and officials in the data are real.

## How it works

```
PhilGEPS CSV files -> pipeline/ -> PostgreSQL -> ml/ -> PostgreSQL -> api/ -> dashboard/
```

| Layer | Folder | Does | Details |
|---|---|---|---|
| Ingestion and preprocessing | `pipeline/` | Downloads the quarterly files, cleans them, loads one row per awarded civil works contract, and loads the document request counts | [pipeline/README.md](pipeline/README.md) |
| Indicators, model, SHAP | `ml/` | Computes four indicators, scores every contract with an Isolation Forest, explains each score; ECOD is fitted only as a comparison check | [ml/README.md](ml/README.md) |
| API | `api/` | Serves contracts and scores; its only writes are the review team's sign-ins and reviews | [api/README.md](api/README.md) |
| Dashboard | `dashboard/` | Contracts list and map, contract detail, profiles, Patterns, About (questions, method, data quality), and Tanod the helper | [dashboard/README.md](dashboard/README.md) |

The layers talk only through PostgreSQL. What the PhilGEPS portal actually provides is recorded in [docs/data-source.md](docs/data-source.md).

## What you need

- Docker Desktop
- Node.js 22.12 or later (CI uses Node 24)
- Python 3.12

The commands below are for Windows PowerShell. On macOS or Linux, use `cp` instead of `Copy-Item` and `.venv/bin/python` instead of `.venv\Scripts\python`.

## First-time setup

From the repo root, in PowerShell:

```
Copy-Item .env.example .env
```

Open `.env` and set a password. If another PostgreSQL already uses port 5432, change `POSTGRES_PORT` too. Then:

```
docker compose up -d
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-lock.txt
.venv\Scripts\python -m pipeline.migrate
cd api; npm install; cd ..
cd dashboard; npm install; cd ..
```

`requirements-lock.txt` holds the exact package versions the stored scores were made with. Install it rather than `requirements.txt`, which only sets minimum versions: a different scikit-learn can change the Isolation Forest scores. The Node packages are pinned by each layer's `package-lock.json`.

## Load data

The database starts empty, and so does the dashboard. Pick one.

**Demonstration contracts** (generated, a few seconds):

```
.venv\Scripts\python -m pipeline.demo
.venv\Scripts\python -m ml.score
```

**Real 2024 contracts** (about 1.4 GB to download; Google Drive slows these downloads, so `download` may need several runs, and it continues where it stopped):

```
.venv\Scripts\python -m pipeline.download
.venv\Scripts\python -m pipeline.load
.venv\Scripts\python -m pipeline.notices --import data/notices/bid_notices_2024.csv
.venv\Scripts\python -m ml.score
```

Do not skip the `notices --import` step. It loads the document request counts behind the first indicator from the committed file. Without it every contract's count is missing and the scores come out completely different. The counts were collected from the notice pages by a scrape that takes two to three days; the committed file means nobody has to run it again (see [pipeline/README.md](pipeline/README.md) if a new quarter needs it).

Instead of downloading, a team member can copy their `data/raw/` folder to you. `data/raw/manifest.json` lists each file's size and SHA-256, so you can confirm the copies match.

Run `python -m pipeline.demo --clear` before loading real data if demonstration contracts are in the database.

**Check that your scores match.** With the real 2024 data and `requirements-lock.txt`, `ml.score` should report 90,204 contracts scored and 4,511 flagged, with the main reasons high award-to-budget ratio 2,031, repeated winner 1,545, grouped small-value awards 935 and few document requests 0. Your database holds 90,204 contracts; an older copy loaded before the study-period rule may hold 90,247, and the 43 extra pre-2024 awards are left out of scoring either way.

Optional: `python -m ml.compare_models` compares the Isolation Forest with ECOD, and `python -m ml.sensitivity` and `python -m ml.stability` run the robustness checks (`ml/README.md`). They write to `data/processed/` and change no stored scores.

**Review team sign-in** needs an account in your own database: `cd api; npm run reviewer:add -- <username> "<Display name>"` (see [api/README.md](api/README.md)). Everything else works without one.

## Run the app

Docker Desktop must be open.

```
docker compose up -d
cd api
npm run dev
```

In a second terminal:

```
cd dashboard
npm run dev
```

Open http://localhost:5173.

| Part | Address |
|---|---|
| Dashboard | http://localhost:5173 |
| API | http://127.0.0.1:3001 (try `/api/health`) |
| Database | `127.0.0.1:5432` |

## Stop

Press `Ctrl+C` in both terminals, then:

```
docker compose down
```

Never add `-v`. It deletes the database volume, and the contracts and scores with it.

## Tests

```
.venv\Scripts\python -m pytest
cd api; npm test
cd dashboard; npm test
```

`pytest` covers `pipeline/`, `ml/` and the end-to-end test in `tests/e2e/`, which runs one small dataset through every layer.
