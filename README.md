# ProcureGuard

A capstone prototype: a decision-support system that flags, ranks and explains statistically unusual public infrastructure procurement contracts in the Philippines, using PhilGEPS open data and unsupervised anomaly detection.

**A flag means "statistically unusual, warrants human review". It is not proof of wrongdoing.** The suppliers and officials in the data are real.

## How it works

```
PhilGEPS CSV files -> pipeline/ -> PostgreSQL -> ml/ -> PostgreSQL -> api/ -> dashboard/
```

| Layer | Folder | Does | Details |
|---|---|---|---|
| Ingestion and preprocessing | `pipeline/` | Downloads the quarterly files, cleans them, loads one row per awarded civil works contract | [pipeline/README.md](pipeline/README.md) |
| Indicators, model, SHAP | `ml/` | Computes three indicators, scores every contract, explains each score | [ml/README.md](ml/README.md) |
| API | `api/` | Serves contracts and scores, read-only | [api/README.md](api/README.md) |
| Dashboard | `dashboard/` | Contracts list and map, contract detail, profiles, About (questions, method, data quality) | [dashboard/README.md](dashboard/README.md) |

The layers talk only through PostgreSQL. What the PhilGEPS portal actually provides is recorded in [docs/data-source.md](docs/data-source.md).

## What you need

- Docker Desktop
- Node.js
- Python 3.12

## First-time setup

From the repo root, in PowerShell:

```
Copy-Item .env.example .env
```

Open `.env` and set a password. Then:

```
docker compose up -d
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pipeline.migrate
cd api; npm install; cd ..
cd dashboard; npm install; cd ..
```

## Load data

The database starts empty, and so does the dashboard. Pick one.

**Demonstration contracts** (generated, a few seconds):

```
.venv\Scripts\python -m pipeline.demo
.venv\Scripts\python -m ml.score
```

**Real 2024 contracts** (about 1.4 GB to download; Google Drive slows these downloads, so `download` may need several runs):

```
.venv\Scripts\python -m pipeline.download
.venv\Scripts\python -m pipeline.load
.venv\Scripts\python -m ml.score
```

Run `python -m pipeline.demo --clear` before loading real data if demonstration contracts are in the database.

Document request counts, the proxy behind the first indicator, come from a separate slow scrape (`python -m pipeline.notices`). Read [pipeline/README.md](pipeline/README.md) before starting it.

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
