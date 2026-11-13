-- Covering index for the "main reason" of each contract in a run.
--
-- The API's contract list, grouped list, search and CSV export all aggregate
-- contract_indicators per contract for one run, ordered by contribution, to find
-- the indicator that raised the score most. The primary key (run_id,
-- contract_id, indicator) does not hold contribution, so PostgreSQL scanned the
-- whole table, every run's rows, and sorted on disk.
--
-- Measured on the 2024 data (run 24, 90,204 contracts, 16 runs stored), median
-- of three EXPLAIN ANALYZE runs, page 1 of 25 rows:
--   flagged list            566 ms -> 379 ms
--   grouped flagged list    586 ms -> 398 ms
--   search "imus road"      378 ms -> 126 ms
--   search "imuz" (typo)    533 ms -> 310 ms
-- With this index the aggregate reads an index-only scan in group order and needs no sort.
CREATE INDEX contract_indicators_run_reason_idx
    ON contract_indicators (run_id, contract_id, contribution DESC)
    INCLUDE (indicator);
