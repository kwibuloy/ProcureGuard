/** Search suggestions as the reader types, and how two scoring runs rank the same contracts. */
import type { Db } from './shared.js';

const SUGGESTIONS_PER_GROUP = 4;

/** Escape LIKE wildcards so typed % and _ match themselves. */
const likeContains = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export interface Suggestions {
  contracts: { id: number; title: string; rank: number; flagged: boolean }[];
  entities: { key: string; name: string; contracts: number; flagged: number }[];
  awardees: { key: string; name: string; contracts: number; flagged: number }[];
  places: { name: string; kind: 'province' | 'city'; contracts: number; flagged: number }[];
}

/**
 * Up to four suggestions in each group for what the reader has typed so far.
 * Names and places are ordered by how many flagged contracts they have, then by
 * contracts; contracts by rank. Everything is limited to the run being shown.
 */
export async function suggest(db: Db, runId: number, text: string): Promise<Suggestions> {
  const pattern = likeContains(text);
  // search_text is the lower-cased, trigram-indexed text of every contract; matching it
  // first lets the index narrow the rows before the exact column is checked.
  const indexed = pattern.toLowerCase();
  const limit = SUGGESTIONS_PER_GROUP;
  const named = (key: string, name: string) =>
    db.query(
      `SELECT c.${key} AS key, min(c.${name}) AS name, count(*)::int AS contracts,
              count(*) FILTER (WHERE s.is_flagged)::int AS flagged
       FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
       WHERE c.search_text LIKE $3 AND c.${name} ILIKE $2
       GROUP BY c.${key}
       ORDER BY flagged DESC, contracts DESC
       LIMIT ${limit}`,
      [runId, pattern, indexed],
    );
  const [contracts, entities, awardees, places] = await Promise.all([
    db.query(
      `SELECT c.id::int AS id, c.title, s.score_rank AS rank, s.is_flagged AS flagged
       FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
       WHERE c.search_text LIKE $4
         AND (c.title ILIKE $2 OR c.award_reference_no = $3 OR c.bid_reference_no = $3)
       ORDER BY s.score_rank
       LIMIT ${limit}`,
      [runId, pattern, text, indexed],
    ),
    named('procuring_entity', 'procuring_entity_raw'),
    named('awardee', 'awardee_raw'),
    db.query(
      `SELECT name, kind, count(*)::int AS contracts,
              count(*) FILTER (WHERE flagged)::int AS flagged
       FROM (
         SELECT c.province AS name, 'province' AS kind, s.is_flagged AS flagged
         FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
         WHERE c.search_text LIKE $3 AND c.province ILIKE $2
         UNION ALL
         SELECT c.city_municipality, 'city', s.is_flagged
         FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
         WHERE c.search_text LIKE $3 AND c.city_municipality ILIKE $2
       ) found
       GROUP BY name, kind
       ORDER BY flagged DESC, contracts DESC
       LIMIT ${limit}`,
      [runId, pattern, indexed],
    ),
  ]);
  return {
    contracts: contracts.rows,
    entities: entities.rows,
    awardees: awardees.rows,
    places: places.rows,
  };
}

/**
 * The top contracts of one run with their rank in another, and how many
 * contracts each run flags, both flag, or only one flags. Used to show how
 * stable the ranking is between runs.
 */
export async function compareRuns(db: Db, fromRun: number, toRun: number, limit: number) {
  const [top, counts] = await Promise.all([
    db.query(
      `SELECT c.id::int AS id, c.title, b.score_rank AS "rankTo", a.score_rank AS "rankFrom",
              b.risk_score AS "scoreTo", a.risk_score AS "scoreFrom",
              b.is_flagged AS "flaggedTo", coalesce(a.is_flagged, false) AS "flaggedFrom"
       FROM contract_scores b
       JOIN contracts c ON c.id = b.contract_id
       LEFT JOIN contract_scores a ON a.contract_id = b.contract_id AND a.run_id = $1
       WHERE b.run_id = $2
       ORDER BY b.score_rank
       LIMIT $3`,
      [fromRun, toRun, limit],
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE a.is_flagged AND b.is_flagged)::int AS "flaggedInBoth",
              count(*) FILTER (WHERE a.is_flagged AND NOT coalesce(b.is_flagged, false))::int
                AS "flaggedOnlyBefore",
              count(*) FILTER (WHERE b.is_flagged AND NOT coalesce(a.is_flagged, false))::int
                AS "flaggedOnlyAfter"
       FROM (SELECT contract_id, is_flagged FROM contract_scores WHERE run_id = $1) a
       FULL JOIN (SELECT contract_id, is_flagged FROM contract_scores WHERE run_id = $2) b
         USING (contract_id)`,
      [fromRun, toRun],
    ),
  ]);
  return { fromRun, toRun, top: top.rows, ...counts.rows[0] };
}
