/** Where one contract's price sits among the contracts it was compared with. */
import type { Db } from './shared.js';

// Awards cluster just under their budget, so the bars are one percentage point
// wide from 80% to 100%, with one bar for everything below 80% and one for
// anything above the budget.
const LOW = 0.8;
const HIGH = 1.0;
const INNER = 20;

export async function pricePeers(db: Db, runId: number, contractId: number) {
  const own = await db.query(
    `SELECT ci.context, c.region
     FROM contract_indicators ci JOIN contracts c ON c.id = ci.contract_id
     WHERE ci.run_id = $1 AND ci.contract_id = $2 AND ci.indicator = 'price_deviation'`,
    [runId, contractId],
  );
  const context = own.rows[0]?.context as Record<string, unknown> | undefined;
  const ratio = context?.amount_to_budget_ratio;
  if (typeof ratio !== 'number') return null;
  const basis = String(context?.comparable_basis ?? '');
  const band = typeof context?.comparable_band === 'number' ? context.comparable_band : null;
  const region =
    basis === 'same region and budget band' && typeof context?.comparable_region === 'string'
      ? context.comparable_region
      : null;

  const { rows } = await db.query(
    `WITH peers AS (
       SELECT (ci.context->>'amount_to_budget_ratio')::float8 AS ratio
       FROM contract_indicators ci JOIN contracts c ON c.id = ci.contract_id
       WHERE ci.run_id = $1 AND ci.indicator = 'price_deviation'
         AND ci.context ? 'amount_to_budget_ratio'
         AND ($2::int IS NULL OR (ci.context->>'comparable_band')::int = $2)
         AND ($3::text IS NULL OR c.region = $3)
     )
     SELECT CASE WHEN ratio < ${LOW} THEN 0
                 WHEN ratio >= ${HIGH} THEN ${INNER + 1}
                 ELSE floor((ratio - ${LOW}) * 100)::int + 1 END AS bin,
            count(*)::int AS count,
            sum(count(*)) OVER ()::int AS total,
            (SELECT count(*) FROM peers WHERE ratio < $4)::int AS below,
            (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) FROM peers)::float8 AS median
     FROM peers GROUP BY 1 ORDER BY 1`,
    [runId, band, region, ratio],
  );
  const counts = new Map(rows.map((row) => [row.bin as number, row.count as number]));
  const step = (HIGH - LOW) / INNER;
  const edge = (value: number) => Math.round(value * 1000) / 1000;
  return {
    basis,
    region,
    ratio,
    median: (rows[0]?.median as number | undefined) ?? null,
    peers: (rows[0]?.total as number | undefined) ?? 0,
    below: (rows[0]?.below as number | undefined) ?? 0,
    // Bin 0 is "below 80%" (from: null); the last is "100% or more" (to: null).
    bins: Array.from({ length: INNER + 2 }, (_, index) => ({
      from: index === 0 ? null : edge(LOW + (index - 1) * step),
      to: index === INNER + 1 ? null : edge(LOW + index * step),
      count: counts.get(index) ?? 0,
    })),
  };
}
