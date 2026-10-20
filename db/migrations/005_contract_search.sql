-- Search for the review list: every word of a query must match somewhere in a
-- contract's title, procuring entity, awardee, reference numbers or location,
-- allowing small typos ("Imuss" finds Imus).
--
-- pg_trgm ships with PostgreSQL (and is available on Neon). Its trigram index
-- serves both the substring match and the typo-tolerant match.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- One lower-case text per contract holding everything search looks at.
-- Generated, so it can never drift from the columns it is built from.
ALTER TABLE contracts ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
    lower(
        coalesce(title, '') || ' ' ||
        coalesce(procuring_entity_raw, '') || ' ' ||
        coalesce(awardee_raw, '') || ' ' ||
        coalesce(award_reference_no, '') || ' ' ||
        coalesce(bid_reference_no, '') || ' ' ||
        coalesce(city_municipality, '') || ' ' ||
        coalesce(province, '')
    )
) STORED;

CREATE INDEX contracts_search_trgm_idx ON contracts USING gin (search_text gin_trgm_ops);
