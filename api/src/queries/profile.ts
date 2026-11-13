/** What one procuring entity awarded, or one awardee won. */
import type { Db } from './shared.js';

const PROFILE = {
  entity: {
    own: 'procuring_entity',
    ownName: 'procuring_entity_raw',
    other: 'awardee',
    otherName: 'awardee_raw',
  },
  awardee: {
    own: 'awardee',
    ownName: 'awardee_raw',
    other: 'procuring_entity',
    otherName: 'procuring_entity_raw',
  },
} as const;
export type ProfileKind = keyof typeof PROFILE;

/** Everything one procuring entity awarded, or everything one awardee won, in a run. */
export async function profile(db: Db, runId: number, kind: ProfileKind, name: string) {
  const { own, ownName, other, otherName } = PROFILE[kind];
  const summary = await db.query(
    `SELECT min(c.${ownName}) AS name, count(*)::int AS contracts,
            count(*) FILTER (WHERE s.is_flagged)::int AS flagged,
            coalesce(sum(c.contract_amount), 0)::float8 AS "totalValue",
            count(DISTINCT c.${other})::int AS counterparties,
            min(c.award_date)::text AS "firstAward", max(c.award_date)::text AS "lastAward",
            ${kind === 'entity' ? `min(c.region) AS region, min(c.entity_type) AS type` : `min(c.awardee_region) AS region, min(c.awardee_size) AS type`}
     FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
     WHERE c.${own} = $2`,
    [runId, name],
  );
  if (!summary.rows[0]?.contracts) return null;

  const counterparties = await db.query(
    `SELECT c.${other} AS key, min(c.${otherName}) AS name, count(*)::int AS contracts,
            count(*) FILTER (WHERE s.is_flagged)::int AS flagged,
            coalesce(sum(c.contract_amount), 0)::float8 AS value
     FROM contracts c JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
     WHERE c.${own} = $2
     GROUP BY c.${other}
     ORDER BY count(*) DESC, sum(c.contract_amount) DESC NULLS LAST
     LIMIT 12`,
    [runId, name],
  );
  return { kind, key: name, ...summary.rows[0], top: counterparties.rows };
}
