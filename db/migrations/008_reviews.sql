-- Human review of flagged contracts. Everyone can read reviews; only the
-- team's reviewer accounts can write them, through the API.
--
-- A review records what a reviewer checked, never a finding about a person:
-- "explained" means an ordinary reason was found, "needs_follow_up" means the
-- reviewer could not explain the pattern from the records available.

CREATE TABLE reviewers (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
    display_name    TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    -- scrypt, as "scrypt$N$r$p$salt$hash" (api/src/reviews/passwords.ts).
    password_hash   TEXT NOT NULL,
    failed_logins   INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    disabled        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only a SHA-256 of each session token is stored; the token itself lives in
-- the reviewer's cookie.
CREATE TABLE reviewer_sessions (
    token_hash      TEXT PRIMARY KEY,
    reviewer_id     BIGINT NOT NULL REFERENCES reviewers (id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reviewer_sessions_expiry_idx ON reviewer_sessions (expires_at);

-- Append-only: a change of status is a new row, so the history is the audit trail.
CREATE TABLE contract_reviews (
    id              BIGSERIAL PRIMARY KEY,
    contract_id     BIGINT NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    status          TEXT NOT NULL
                    CHECK (status IN ('not_reviewed', 'explained', 'needs_follow_up')),
    note            TEXT CHECK (length(note) <= 2000),
    reviewer_id     BIGINT NOT NULL REFERENCES reviewers (id),
    -- The scoring run the reviewer was looking at.
    run_id          BIGINT REFERENCES scoring_runs (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contract_reviews_contract_idx ON contract_reviews (contract_id, id DESC);

-- A reply from the procuring entity or the supplier, received by email and
-- checked by a reviewer before it is shown.
CREATE TABLE contract_responses (
    id              BIGSERIAL PRIMARY KEY,
    contract_id     BIGINT NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    organization    TEXT NOT NULL CHECK (length(organization) BETWEEN 1 AND 200),
    summary         TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
    received_on     DATE NOT NULL,
    verified_by     BIGINT NOT NULL REFERENCES reviewers (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contract_responses_contract_idx ON contract_responses (contract_id, id DESC);
