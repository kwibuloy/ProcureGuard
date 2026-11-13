/** Scoring runs: listing, choosing one, comparing two. */
import { RUN_COLUMNS, type Db } from './shared.js';

const COMPARE_POINTS = 2_500;

export async function listRuns(db: Db) {
  const { rows } = await db.query(
    `SELECT ${RUN_COLUMNS},
            (SELECT count(*)::int FROM contract_scores s WHERE s.run_id = r.id) AS contracts
     FROM scoring_runs r ORDER BY id DESC LIMIT 50`,
  );
  return rows;
}

// The model the dashboard opens on (team decision; see ml/README.md). The other
// model stays in the database for comparison.
export const PRIMARY_MODEL = 'Isolation Forest';

/**
 * The requested run, or when none (or an unknown one) is requested, the latest
 * run of the primary model, falling back to the latest run of any model.
 */
export async function findRun(db: Db, runId?: number) {
  if (runId) {
    const { rows } = await db.query(`SELECT ${RUN_COLUMNS} FROM scoring_runs WHERE id = $1`, [
      runId,
    ]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await db.query(
    `SELECT ${RUN_COLUMNS} FROM scoring_runs ORDER BY model_name = $1 DESC, id DESC LIMIT 1`,
    [PRIMARY_MODEL],
  );
  return rows[0] ?? null;
}

/**
 * Changes whenever something a cached response could show changes: a new
 * scoring run, a new contract load, or newly fetched document request counts.
 * Part of every ETag, so a browser's copy is only reused while it is current.
 */
export async function dataVersion(db: Db): Promise<string> {
  const { rows } = await db.query(
    `SELECT concat_ws('.',
              (SELECT max(id) FROM scoring_runs),
              (SELECT max(id) FROM load_reports),
              (SELECT extract(epoch FROM max(fetched_at))::bigint FROM bid_notices)) AS version`,
  );
  return String(rows[0]?.version ?? '');
}

/** How two scoring runs rank the contracts they both scored. */
export async function compareRuns(db: Db, runA: number, runB: number) {
  const joined = `
    FROM contract_scores a
    JOIN contract_scores b ON b.contract_id = a.contract_id AND b.run_id = $2
    WHERE a.run_id = $1`;
  const [summary, overlap, points, disagreements] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS contracts,
              count(*) FILTER (WHERE a.is_flagged AND b.is_flagged)::int AS "flaggedByBoth",
              count(*) FILTER (WHERE a.is_flagged AND NOT b.is_flagged)::int AS "onlyA",
              count(*) FILTER (WHERE b.is_flagged AND NOT a.is_flagged)::int AS "onlyB",
              corr(a.score_rank, b.score_rank)::float8 AS "rankCorrelation"
       ${joined}`,
      [runA, runB],
    ),
    db.query(
      `SELECT n::int AS top,
              (SELECT count(*)::int ${joined} AND a.score_rank <= n AND b.score_rank <= n) AS shared
       FROM unnest(ARRAY[10, 25, 50, 100]) AS n`,
      [runA, runB],
    ),
    // Every contract flagged by either run, plus an even sample of the rest.
    db.query(
      `SELECT a.contract_id::int AS id, a.risk_score AS a, b.risk_score AS b,
              a.is_flagged AS "flaggedA", b.is_flagged AS "flaggedB"
       ${joined}
       ORDER BY (a.is_flagged OR b.is_flagged) DESC, md5(a.contract_id::text)
       LIMIT ${COMPARE_POINTS}`,
      [runA, runB],
    ),
    db.query(
      `SELECT c.id::int AS id, c.title, c.procuring_entity_raw AS "entityName",
              a.score_rank AS "rankA", b.score_rank AS "rankB",
              a.risk_score AS "scoreA", b.risk_score AS "scoreB",
              a.is_flagged AS "flaggedA", b.is_flagged AS "flaggedB"
       ${joined.replace('WHERE', 'JOIN contracts c ON c.id = a.contract_id WHERE')}
         AND (a.is_flagged <> b.is_flagged)
       ORDER BY abs(a.score_rank - b.score_rank) DESC
       LIMIT 12`,
      [runA, runB],
    ),
  ]);
  return {
    ...summary.rows[0],
    topOverlap: overlap.rows,
    points: points.rows,
    disagreements: disagreements.rows,
  };
}
