# ProcureGuard

A capstone prototype: a decision-support system that flags, ranks and explains statistically unusual public infrastructure procurement contracts in the Philippines, using PhilGEPS open data and unsupervised anomaly detection.

This file points to where things are. It is not documentation; keep it under 200 lines. Put detail in the layer READMEs or `docs/`.

## Source of truth

`docs/BDC_CH1-CH2.pdf` is the approved manuscript (Chapters 1 and 2). When code and paper disagree, raise it with the user; do not quietly follow either one.

| Need | Pages |
|---|---|
| What the system is, the three layers | 2-3 |
| Problems and hypotheses (H1, H2) | 3-4 |
| Objectives 1-7 | 5 |
| Who the users are | 6 |
| Scope and limitations | 7 |
| PCC red-flag patterns, GPPB procedural rules | 10-11 |
| References and source URLs | 22-24 |

Chapter 3 (methodology) is not written yet.

`docs/data-source.md` records what the PhilGEPS portal actually provides: file locations, which quarters are public, columns, data quirks, and the document request count. Read it before touching `pipeline/`.

Two findings there contradict the paper and still need the adviser's agreement: the data has no bidder count, and the 2023 and 2025 files are not publicly downloadable.

## Rules that apply everywhere

1. **Never accuse.** A flag means "statistically unusual, warrants human review". It is not proof of corruption, fraud or bid rigging. This applies to UI copy, API fields, column names, comments, logs, commit messages and anything you tell the user. Suppliers and officials in the data are real.
2. **Unsupervised only.** No labeled cases of wrongdoing exist. No supervised classifiers, and no accuracy, precision or recall claims.
3. **Three indicators only:** single-bidder win, repeated-winner concentration, price deviation from comparable contracts. More would change the study's scope; ask first. PhilGEPS publishes no bidder count, so the single-bidder indicator uses a proxy: the notice's document request count (see `docs/data-source.md`). Always label it as a proxy for competition, never as "number of bidders".
4. **Infrastructure and civil works only.** No goods, consulting or common-use supplies.
5. **Structured fields only.** No OCR, text extraction or NLP on attachments.
6. **Raw data is read-only.** `data/raw/` stays exactly as downloaded.
7. **Every score is explainable.** A risk score is always shown with the indicators and SHAP contributions behind it.

## Stack

| Layer | Folder | Tools |
|---|---|---|
| Ingestion and preprocessing | `pipeline/` | Python, pandas |
| Indicators, model, SHAP | `ml/` | Python, scikit-learn, shap |
| API | `api/` | Node.js, Express, TypeScript, `pg` |
| Dashboard | `dashboard/` | React, TypeScript, Vite |
| Schema | `db/migrations/` | Numbered plain `.sql` files |
| Database | `docker-compose.yml` | PostgreSQL in Docker |

Local addresses: database `127.0.0.1:5432`, API `127.0.0.1:3001`, dashboard `localhost:5173`. Schema: `db/migrations/001_initial_schema.sql`.

- Python: one `.venv` and `requirements.txt` at the repo root, shared by `pipeline/` and `ml/`. Ruff formats and lints; pytest tests in `pipeline/tests/` and `ml/tests/`.
- TypeScript: each of `api/` and `dashboard/` has its own `package.json`. ESLint and Prettier; Vitest, with `npm test` set to `vitest run`.
- The layers talk only through PostgreSQL: `pipeline/` writes contracts, `ml/` reads them and writes scores, `api/` reads both. The API never computes scores.

## Layout

```
pipeline/       download, clean, load, notices, quality, demo data
ml/             indicators, two models, SHAP
api/            Express API
dashboard/      React UI
db/migrations/  schema, forward-only
data/raw/       PhilGEPS downloads (gitignored, protected)
data/processed/ derived files (gitignored)
docs/           manuscript and project documents
tests/e2e/      one dataset through every layer
.claude/        agents, skills, hooks
```

All four layers are built and the database holds the real 2024 contracts (90,247), scored without document request counts because the scrape has not run. Each layer's `README.md` holds its setup and run commands; the skills read those. `tests/e2e/` runs one small dataset through every layer.

## Open decisions

Not settled. Ask the user; do not pick one.

- **Which model to keep.** Isolation Forest and the clustering model are both built; the dashboard's compare page shows where they differ.
- **Study defaults in `ml/settings.py`** (comparable contracts, budget bands, share flagged, smallest entity for repeated winner). Claude chose them as defaults and listed the reasons in `ml/README.md`; the team has not confirmed them.
- **Whether to start the full document request scrape.**

When one is decided, move it out of this list into the relevant README. Decisions already made for the pipeline (2024 only, scrape Public Bidding civil works only) are in `pipeline/README.md`.

## Sub-agents

In `.claude/agents/`. Each owns one part of the repo.

| Agent | Owns |
|---|---|
| `pipeline-engineer` | `pipeline/`, `db/migrations/` |
| `ml-engineer` | `ml/` |
| `dashboard-developer` | `api/`, `dashboard/`, UI design |
| `reviewer` | Review, security checks, wording checks, tests. Edits test files only. |

## Skills

In `.claude/skills/`.

| Command | Does |
|---|---|
| `/ingest` | Download, clean, load, then report data quality. User-invoked only. |
| `/score` | Indicators, model, SHAP, write scores. User-invoked only. |
| `/validate-flags` | Check top flagged contracts against PCC patterns (Objective 7). Read-only. |
| `/run-app` | Start database, API and dashboard, and confirm they respond. |

## Hooks

Configured in `.claude/settings.json`, scripts in `.claude/hooks/`. They need Node.js on the PATH.

| Script | When | Effect |
|---|---|---|
| `protect-files.mjs` | Before an edit | Blocks `.env` files (not `.env.example`) and `data/raw/`. |
| `guard-commands.mjs` | Before a shell command | Asks for confirmation on `DROP`, `TRUNCATE`, `DELETE` without `WHERE`, and removal of Docker volumes. Blocks shell writes to `.env` and `data/raw/`. |
| `format-lint.mjs` | After an edit | Ruff on Python, Prettier and ESLint on TypeScript. |
| `run-tests.mjs` | When Claude stops | Runs pytest or `npm test` for the layers edited in the session. |

The format and test hooks do nothing for a layer until its tools are installed (`.venv` with ruff and pytest; `node_modules` with prettier, eslint and a `test` script).

## Working here

- Windows is the development platform; the team shares this setup through git. Personal settings go in `.claude/settings.local.json`, which is gitignored.
- Secrets go in `.env`, never in code or git. Change `.env.example` when a variable is added.
- Schema changes are a new numbered file in `db/migrations/`. Never edit a committed migration.
- Report results as measured. If a check was skipped or a test fails, say so.
