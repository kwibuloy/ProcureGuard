-- What happened each time contracts were loaded: how many rows were read and why
-- rows were left out. Field completeness is computed live from contracts.
CREATE TABLE load_reports (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- TRUE for generated demonstration data.
    is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
    source_files  JSONB NOT NULL DEFAULT '[]',
    -- Counts by outcome, for example {"rows_read": 1200000, "not_civil_works": 1050000}.
    intake        JSONB NOT NULL DEFAULT '{}'
);
