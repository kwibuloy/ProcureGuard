/** Scoring runs: listing and choosing one. */
import { RUN_COLUMNS, type Db } from './shared.js';

export async function listRuns(db: Db) {
  const { rows } = await db.query(
    `SELECT ${RUN_COLUMNS},
            (SELECT count(*)::int FROM contract_scores s WHERE s.run_id = r.id) AS contracts
     FROM scoring_runs r ORDER BY id DESC LIMIT 50`,
  );
  return rows;
}

// The study's model (team decision; see ml/README.md).
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
