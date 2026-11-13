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

| Endpoint                 | Returns                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`        | `{ "status": "ok" }` when the database answers; 503 with `{ "status": "unavailable" }` when it does not                                                                                                                                                                                                                            |
| `GET /api/runs`          | Stored scoring runs, newest first                                                                                                                                                                                                                                                                                                  |
| `GET /api/overview`      | Run details, totals, score histogram, main-reason counts, filter options                                                                                                                                                                                                                                                           |
| `GET /api/contracts`     | A page of contracts, each with the figures behind its indicators. Query: `q`, `region`, `province`, `city` (names joined with `\|`), `entityType`, `entity`, `awardee`, `reason`, `scoreFrom`, `scoreTo`, `flagged=true`, `group=true` (one row per bid notice), `sort` (`rank`, `amount`, `recent`), `page`, `pageSize` (max 100) |
| `GET /api/contracts.csv` | Contracts matching the same filters, as a CSV download, at most 12,000 (see below)                                                                                                                                                                                                                                                 |
| `GET /api/contracts/:id` | One contract with its score, indicators, contributions, document request count and how other runs scored it                                                                                                                                                                                                                        |
| `GET /api/profile`       | Totals and counterparties for one procuring entity or awardee. Query: `kind` (`entity` or `awardee`), `name`                                                                                                                                                                                                                       |
| `GET /api/compare`       | How two runs rank the same contracts: overlap, rank correlation, points for a scatter plot, largest disagreements. Query: `a`, `b`. Not used by the dashboard since its compare page was removed; kept for comparing the two models in the study                                                                                   |
| `GET /api/places`        | Contracts, flagged contracts and flagged value per region, province and city as PhilGEPS names them (where the procuring entity is based), for the map                                                                                                                                                                             |
| `GET /api/data-quality`  | The latest load report, field completeness, impossible values and document request coverage                                                                                                                                                                                                                                        |

## Search

`q` is split into words; every word must match somewhere in the title, procuring entity, awardee, award or bid reference, city or province (`contracts.search_text`, migration 005). A word that appears nowhere in the data falls back to close spellings through the `pg_trgm` trigram index ("imuz" finds Imus); the response lists those words in `closeMatches`. Typo matching is not used for words that do match exactly, because it adds noise ("imus" would also find "various improvement"). When the flagged list is empty, `screenedMatches` says how many screened contracts match.

## Query speed

Measured with `EXPLAIN ANALYZE` on run 24 (90,204 contracts, 16 runs stored), local Docker PostgreSQL 17, page 1 of 25 rows, median of three, after migration 006 (a covering index for each contract's main reason): flagged list 368 ms, grouped flagged list 421 ms, search "imus road" 142 ms, typo search "imuz" 300 ms, main-reason filter 449 ms. Without that index the same queries took 566, 586, 378, 533 and 619 ms. "All screened" (every contract, no filter) stays at about 1 s (1,015 ms ungrouped, 1,034 ms grouped): that time is the window functions sorting all 90,204 wide rows, which spills to disk at PostgreSQL's default `work_mem`, and an index cannot remove it. Narrowing the inner query to ids before joining the other columns would; not done yet.

## Checks

```
npm test          # Vitest, uses a fake database
npm run lint
npm run typecheck
```

Request values only ever reach SQL as parameters. Sort order, the main-reason filter and the profile kind are chosen from fixed lists; a value outside the list is ignored. The CSV export prefixes any cell that starts with `=`, `+`, `-` or `@`, so published names cannot run as spreadsheet formulas.

The end-to-end test in `tests/e2e/` starts this API against a real test database.

## Limits, caching and headers

**CSV export size.** Vercel refuses a function response over 4.5 MB. Measured on scoring run 24 (90,204 contracts of 2024): an export row is 236.5 bytes on average (median 233, 99th percentile 306, largest 532), and a full export of every screened contract is 21.3 MB. The 14,318 largest rows together fit in 4,000,000 bytes, so an export holds at most `EXPORT_ROW_LIMIT` = 12,000 rows, in the list's order, and stops early if it would pass `EXPORT_MAX_BYTES` = 4,000,000 bytes. The flagged list (4,511 contracts) always exports in full. A cut-short export is named `procureguard-run-<id>-first-<n>.csv` and carries `X-Export-Truncated: true` and `X-Export-Rows`; `GET /api/contracts` returns `exportLimit`, and the dashboard says above the list when an export would leave contracts out.

**Rate limits** (per client address, per minute, kept in memory per function instance, so on Vercel the real ceiling is this times the warm instances): any endpoint 300, `GET /api/contracts` 120, a request with search words (`q`) 60 more strictly, the CSV export 10. Over the limit the answer is 429 with `Retry-After` and `RateLimit-*` headers. Behind Vercel the client address is the first `x-forwarded-for` entry, which Vercel sets; locally that header is ignored, so it cannot be used to dodge the limit. For a hard limit across instances use a Vercel Firewall rule.

**Caching.** A response for a run named in the URL (`?run=24`) describes a stored run, which `ml/` never changes: `Cache-Control: public, max-age=600, s-maxage=86400, stale-while-revalidate=86400`. Without `run`, or for an unknown run (which falls back to the latest), the response follows "the latest run" and is kept 30 seconds. Every run response has an ETag built from the URL, the run and a data version (the newest scoring run, contract load and document request fetch), so a browser revalidating a current copy gets 304 before any list query runs. The CDN can keep a copy for up to a day after contracts or document request counts are reloaded; a redeploy clears it. Errors and `/api/health` are `no-store`.

**Security headers** on every response: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy` and `Cross-Origin-Opener-Policy: same-origin`, a closed `Permissions-Policy`, and on Vercel `Strict-Transport-Security`. These cover `/api/*` only; the dashboard's static files get Vercel's defaults.

**Database pool** (`src/db.ts`): on Vercel at most 5 connections per instance, idle ones closed after 10 s; locally 10 and 30 s. Connecting gives up after 5 s. Each query is cancelled by PostgreSQL after 15 s (`statement_timeout`), with a client-side 20 s backstop. Through Neon's pooled address (host name with `-pooler`, PgBouncer) `statement_timeout` cannot be sent when connecting, so set it on the role once: `ALTER ROLE <role> SET statement_timeout = '15s';`. Not tried against the hosted database yet.

## Deploy (Vercel)

`vercel.json` at the repo root deploys this API and the dashboard as one Vercel project: `/api/*` goes to this service, everything else to the dashboard. The service runs `src/server.ts`, which exports the app; it only opens a port when `VERCEL` is not set.

Vercel cannot reach the Docker database. Set `DATABASE_URL` in the Vercel project settings to a hosted PostgreSQL that holds the same schema and data; when it is set, it replaces the `POSTGRES_*` variables.

`vercel dev` does not work for this service yet: Vercel's local Node dev server cannot resolve the `./app.js` imports to `app.ts` files. Deployed builds compile to `.js` first and are unaffected. Develop locally with `npm run dev` here and in `dashboard/`.
