-- ProcureGuard initial schema.
-- pipeline/ writes contracts and bid_notices; ml/ writes scoring_runs,
-- contract_scores and contract_indicators; api/ only reads.

-- One row per awarded civil works contract (one PhilGEPS award notice).
CREATE TABLE contracts (
    id                      BIGSERIAL PRIMARY KEY,
    source_series           TEXT NOT NULL CHECK (source_series IN ('legacy', 'modern')),
    award_reference_no      TEXT NOT NULL,
    -- NULL when the award was made without a posted bid notice.
    bid_reference_no        TEXT,
    title                   TEXT NOT NULL,

    -- Standardized name is what indicators group by; raw is kept as published.
    procuring_entity        TEXT NOT NULL,
    procuring_entity_raw    TEXT NOT NULL,
    region                  TEXT,
    province                TEXT,
    city_municipality       TEXT,
    entity_type             TEXT,
    entity_type_group       TEXT,

    procurement_mode        TEXT,
    business_category       TEXT,
    funding_source          TEXT,

    approved_budget         NUMERIC(18, 2),
    contract_amount         NUMERIC(18, 2),

    published_date          DATE,
    closing_date            DATE,
    award_date              DATE,
    notice_to_proceed_date  DATE,

    awardee                 TEXT NOT NULL,
    awardee_raw             TEXT NOT NULL,
    awardee_region          TEXT,
    awardee_province        TEXT,
    awardee_size            TEXT,

    line_item_count         INTEGER NOT NULL DEFAULT 1,
    source_file             TEXT NOT NULL,
    loaded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source_series, award_reference_no)
);

CREATE INDEX contracts_entity_idx ON contracts (procuring_entity);
CREATE INDEX contracts_awardee_idx ON contracts (awardee);
CREATE INDEX contracts_bid_reference_idx ON contracts (source_series, bid_reference_no);

-- What the public bid notice page shows, one row per notice fetched.
-- document_request_count is the number of suppliers who requested the bidding
-- documents through PhilGEPS. It is a proxy for competition, not a count of bids.
CREATE TABLE bid_notices (
    source_series           TEXT NOT NULL CHECK (source_series IN ('legacy', 'modern')),
    bid_reference_no        TEXT NOT NULL,
    -- 'ok', 'not_found' (no page for this reference) or 'unreadable' (page without the field).
    fetch_status            TEXT NOT NULL CHECK (fetch_status IN ('ok', 'not_found', 'unreadable')),
    document_request_count  INTEGER,
    bid_supplement_count    INTEGER,
    notice_status           TEXT,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_series, bid_reference_no)
);

-- One row each time the model is run. Earlier runs are kept.
CREATE TABLE scoring_runs (
    id                  BIGSERIAL PRIMARY KEY,
    model_name          TEXT NOT NULL,
    parameters          JSONB NOT NULL DEFAULT '{}',
    random_seed         INTEGER,
    -- Score at or above which a contract is shown as flagged for review.
    flag_threshold      DOUBLE PRECISION,
    -- SHAP base value: the score a contract gets before any indicator contributes.
    base_value          DOUBLE PRECISION,
    -- TRUE for generated demonstration data that describes no real contract.
    is_demo             BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- risk_score runs from 0 to 1; higher means more statistically unusual.
-- It is not a probability and not a finding of wrongdoing.
CREATE TABLE contract_scores (
    run_id          BIGINT NOT NULL REFERENCES scoring_runs (id) ON DELETE CASCADE,
    contract_id     BIGINT NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    risk_score      DOUBLE PRECISION NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
    score_rank      INTEGER NOT NULL,
    is_flagged      BOOLEAN NOT NULL,
    PRIMARY KEY (run_id, contract_id)
);

CREATE INDEX contract_scores_rank_idx ON contract_scores (run_id, score_rank);

-- The three red-flag indicators behind each score.
--   single_requester  proxy for a single-bidder win: document requests on the notice
--   repeated_winner   how concentrated this entity's awards are on this awardee
--   price_deviation   contract amount relative to the median of comparable contracts
CREATE TABLE contract_indicators (
    run_id          BIGINT NOT NULL,
    contract_id     BIGINT NOT NULL,
    indicator       TEXT NOT NULL
                    CHECK (indicator IN ('single_requester', 'repeated_winner', 'price_deviation')),
    -- NULL when the indicator could not be computed for this contract.
    value           DOUBLE PRECISION,
    -- SHAP contribution of this indicator to the contract's score.
    contribution    DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- Figures a reviewer needs to check the value by hand, for example
    -- {"wins": 7, "entity_awards": 9} or {"comparable_median": 4950000, "comparable_count": 38}.
    context         JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (run_id, contract_id, indicator),
    FOREIGN KEY (run_id, contract_id) REFERENCES contract_scores (run_id, contract_id) ON DELETE CASCADE
);
