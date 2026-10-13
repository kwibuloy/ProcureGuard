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

All serve the latest scoring run.

| Endpoint                 | Returns                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`        | `{ "status": "ok" }` when the database answers                                                                                                       |
| `GET /api/overview`      | Run details, totals, score histogram, main-reason counts, filter options                                                                             |
| `GET /api/contracts`     | A page of contracts. Query: `q`, `region`, `entityType`, `reason`, `flagged=true`, `sort` (`rank`, `amount`, `recent`), `page`, `pageSize` (max 100) |
| `GET /api/contracts/:id` | One contract with its score, indicators, contributions and document request count                                                                    |

## Checks

```
npm test          # Vitest, uses a fake database
npm run lint
npm run typecheck
```

Request values only ever reach SQL as parameters. Sort order and the main-reason filter are chosen from fixed lists; a value outside the list is ignored.
