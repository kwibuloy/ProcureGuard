-- A fourth indicator, and the clustering model removed (team decision, November 2026).
--
--   contract_splitting  Small Value Procurement awards from one entity to one
--                       supplier within 30 days whose approved budgets together
--                       exceed the Small Value ceiling (IRR of R.A. 9184, Sec. 54.1).

ALTER TABLE contract_indicators DROP CONSTRAINT contract_indicators_indicator_check;
ALTER TABLE contract_indicators ADD CONSTRAINT contract_indicators_indicator_check
    CHECK (indicator IN ('single_requester', 'repeated_winner', 'price_deviation',
                         'contract_splitting'));

-- Scores and indicators of these runs go with them (ON DELETE CASCADE).
DELETE FROM scoring_runs WHERE model_name = 'Clustering distance';
