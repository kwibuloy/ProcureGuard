# api

Read-only Express API between PostgreSQL and the dashboard (Objective 5). It never computes or changes a score; `ml/` stores scores and this layer serves them.

## Run

PostgreSQL must be up (`docker compose up -d` from the repo root) and `.env` must exist at the repo root.

```
cd api
npm install
npm run dev
```

Listens on `http://127.0.0.1:3001` (`API_PORT` in `.env` changes the port). It accepts connections from this machine only.

## Endpoints

Each takes an optional `run` (a scoring run id) and otherwise serves the latest run.

| Endpoint                 | Returns                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`        | `{ "status": "ok" }` when the database answers                                                                                                                                                                                                 |
| `GET /api/runs`          | Stored scoring runs, newest first                                                                                                                                                                                                              |
| `GET /api/overview`      | Run details, totals, score histogram, main-reason counts, filter options                                                                                                                                                                       |
| `GET /api/contracts`     | A page of contracts, each with the figures behind its indicators. Query: `q`, `region`, `province`, `city` (names joined with `\|`), `entityType`, `entity`, `awardee`, `reason`, `scoreFrom`, `scoreTo`, `flagged=true`, `group=true` (one row per bid notice), `sort` (`rank`, `amount`, `recent`), `page`, `pageSize` (max 100) |
| `GET /api/contracts.csv` | Every contract matching the same filters, as a CSV download                                                                                                                                                                                    |
| `GET /api/contracts/:id` | One contract with its score, indicators, contributions, document request count and how other runs scored it                                                                                                                                    |
| `GET /api/profile`       | Totals and counterparties for one procuring entity or awardee. Query: `kind` (`entity` or `awardee`), `name`                                                                                                                                   |
| `GET /api/compare`       | How two runs rank the same contracts: overlap, rank correlation, points for a scatter plot, largest disagreements. Query: `a`, `b`                                                                                                             |
| `GET /api/places`       | Contracts, flagged contracts and flagged value per region, province and city as PhilGEPS names them (where the procuring entity is based), for the map |
| `GET /api/data-quality`  | The latest load report, field completeness, impossible values and document request coverage                                                                                                                                                    |

## Search

`q` is split into words; every word must match somewhere in the title, procuring entity, awardee, award or bid reference, city or province (`contracts.search_text`, migration 005). A word that appears nowhere in the data falls back to close spellings through the `pg_trgm` trigram index ("imuz" finds Imus); the response lists those words in `closeMatches`. Typo matching is not used for words that do match exactly, because it adds noise ("imus" would also find "various improvement"). When the flagged list is empty, `screenedMatches` says how many screened contracts match.

## Checks

```
npm test          # Vitest, uses a fake database
npm run lint
npm run typecheck
```

Request values only ever reach SQL as parameters. Sort order, the main-reason filter and the profile kind are chosen from fixed lists; a value outside the list is ignored. The CSV export prefixes any cell that starts with `=`, `+`, `-` or `@`, so published names cannot run as spreadsheet formulas.

The end-to-end test in `tests/e2e/` starts this API against a real test database.

## Deploy (Vercel)

`vercel.json` at the repo root deploys this API and the dashboard as one Vercel project: `/api/*` goes to this service, everything else to the dashboard. The service runs `src/server.ts`, which exports the app; it only opens a port when `VERCEL` is not set.

Vercel cannot reach the Docker database. Set `DATABASE_URL` in the Vercel project settings to a hosted PostgreSQL that holds the same schema and data; when it is set, it replaces the `POSTGRES_*` variables.

`vercel dev` does not work for this service yet: Vercel's local Node dev server cannot resolve the `./app.js` imports to `app.ts` files. Deployed builds compile to `.js` first and are unaffected. Develop locally with `npm run dev` here and in `dashboard/`.
