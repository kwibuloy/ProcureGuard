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

## Rules that apply everywhere

1. **Never accuse.** A flag means "statistically unusual, warrants human review". It is not proof of corruption, fraud or bid rigging. This applies to UI copy, API fields, column names, comments, logs, commit messages and anything you tell the user. Suppliers and officials in the data are real.
2. **Unsupervised only.** No labeled cases of wrongdoing exist. No supervised classifiers, and no accuracy, precision or recall claims.
3. **Three indicators only:** single-bidder win, repeated-winner concentration, price deviation from comparable contracts. More would change the study's scope; ask first.
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

- Python: one `.venv` and `requirements.txt` at the repo root, shared by `pipeline/` and `ml/`. Ruff formats and lints; pytest tests in `pipeline/tests/` and `ml/tests/`.
- TypeScript: each of `api/` and `dashboard/` has its own `package.json`. ESLint and Prettier; Vitest, with `npm test` set to `vitest run`.
- The layers talk only through PostgreSQL: `pipeline/` writes contracts, `ml/` reads them and writes scores, `api/` reads both. The API never computes scores.

## Layout

```
pipeline/       ingest, clean, load
ml/             indicators, models, SHAP
api/            Express API
dashboard/      React UI
db/migrations/  schema, forward-only
data/raw/       PhilGEPS downloads (gitignored, protected)
data/processed/ derived files (gitignored)
docs/           manuscript and project documents
.claude/        agents, skills, hooks
```

Only `docs/` and `.claude/` exist so far. Create the other folders as each layer is built, and give each a `README.md` with its setup and run commands; the skills read those.

## Open decisions

Not settled. Ask the user; do not pick one.

- **Date range** of contracts. The paper gives "2024 to 2025" only as an example.
- **PhilGEPS portal mechanics.** Download is to be automated, but the real endpoints, file formats and column names have not been inspected.
- **Definition of "comparable contracts"** for the price deviation median.
- **Model.** Isolation Forest and a clustering-based scorer are both to be built and compared before one is chosen.
- **Flagging threshold** that separates flagged from unflagged contracts.
- **Ports and environment variable names.** Record them in `.env.example` when set.

When one is decided, move it out of this list into the relevant README.

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
