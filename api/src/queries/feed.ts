/** Newly flagged contracts, for the RSS feed. */
import { previousRunId, type Db } from './shared.js';

const FEED_SIZE = 50;

export async function feedItems(db: Db, runId: number, filters: { region?: string }) {
  const previous = await previousRunId(db, runId);
  const params: unknown[] = [runId];
  let regionClause = '';
  if (filters.region) {
    params.push(filters.region);
    regionClause = `AND c.region = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT c.id::int AS id, c.title, c.procuring_entity_raw AS "entityName",
            c.awardee_raw AS "awardeeName", c.region, s.risk_score AS score, s.score_rank AS rank
     FROM contract_scores s
     JOIN contracts c ON c.id = s.contract_id
     LEFT JOIN contract_scores prev
       ON prev.contract_id = c.id AND prev.run_id = ${Number.isInteger(previous) ? previous : 'NULL'}
     WHERE s.run_id = $1 AND s.is_flagged AND NOT COALESCE(prev.is_flagged, FALSE) ${regionClause}
     ORDER BY s.score_rank
     LIMIT ${FEED_SIZE}`,
    params,
  );
  return rows as Record<string, unknown>[];
}
