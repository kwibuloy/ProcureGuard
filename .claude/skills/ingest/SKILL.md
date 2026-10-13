---
name: ingest
description: Run the PhilGEPS ingestion workflow - download, clean, standardize, load into PostgreSQL - and report data quality and completeness.
disable-model-invocation: true
argument-hint: "[date range, e.g. 2024-01-01 2025-12-31]"
---

Run the data ingestion and preprocessing workflow for ProcureGuard and report whether the data is good enough for scoring. Arguments, if given: $ARGUMENTS

The exact commands live in `pipeline/README.md`. If `pipeline/` or that README does not exist yet, say the layer has not been built and stop; do not improvise a pipeline inside this skill.

## Steps

1. **Database up.** Check PostgreSQL is running (`docker compose ps`); start it if not. Apply any pending files in `db/migrations/`.
2. **Date range.** Use the range in the arguments if given, otherwise the configured one. If neither exists, ask the user; the range is an open decision in `CLAUDE.md`.
3. **Download** into `data/raw/`. Existing raw files are never overwritten or edited; a re-download goes to a new file.
4. **Clean and standardize** procuring entity, approved budget, number of bidders, procurement mode, award amount, dates and winning supplier. Keep infrastructure and civil works records only.
5. **Load** into PostgreSQL.
6. **Measure quality** by querying what was actually loaded, not by trusting the pipeline's own logs.

## Report

Give the numbers, then a verdict:

- Rows downloaded, rows loaded, rows excluded and the reason for each exclusion group.
- Missing values per field, as a count and a percentage.
- Duplicate contracts found and how they were handled.
- Dates covered against the range requested; months with unusually few records.
- Distinct procuring entity and supplier names before and after standardization.
- Values that cannot be right: negative or zero amounts, award dates before posting dates, bidder counts of zero on awarded contracts.

End with whether the data is ready for `/score`. If a field needed by an indicator is mostly missing, say so plainly: that is a finding the team must handle, not something to hide by filling values in.
