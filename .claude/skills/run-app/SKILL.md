---
name: run-app
description: Start ProcureGuard locally - PostgreSQL in Docker, the Express API and the React dashboard - and confirm each one responds. Use when asked to run, start, launch or look at the app, or to confirm a change works in the running app.
---

Start the ProcureGuard stack on this machine and confirm it works.

Ports, URLs and exact commands live in `.env.example`, `docker-compose.yml`, `api/README.md` and `dashboard/README.md`. Read them; do not guess ports. If a part has not been built yet, start what exists and say what is missing.

## Steps

1. **Docker.** Check Docker is running (`docker info`). If it is not, ask the user to start Docker Desktop; you cannot start it for them.
2. **Environment.** Check that `.env` exists by listing it, without printing its contents. If it is missing, ask the user to copy `.env.example` to `.env` and fill it in. A hook blocks you from writing `.env`.
3. **Database.** `docker compose up -d`, wait until PostgreSQL reports healthy, then apply pending files in `db/migrations/`.
4. **API.** Install dependencies if `api/node_modules` is missing, then start the dev server as a background command.
5. **Dashboard.** Same for `dashboard/`.
6. **Confirm.** Request the API's health endpoint and one data endpoint, and load the dashboard URL. For a UI change, open the page in the browser and look at it.

## Report

- The URLs for the API and the dashboard.
- What responded and what did not, with the real error output for anything that failed.
- Whether the database has contracts and scores. An empty dashboard usually means `/ingest` and `/score` have not been run, not that the app is broken.
- How to stop it: stop the two background dev servers, then `docker compose down`. Never add `-v` when stopping; it deletes the database volume.
