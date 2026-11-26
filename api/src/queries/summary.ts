/** Run-wide figures: the overview, the map, and data quality. */
import { INDICATORS, REASONS, type Db } from './shared.js';

const HISTOGRAM_BINS = 20;

export async function overview(db: Db, runId: number) {
  const [totals, histogram, reasons, regions, entityTypes] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS contracts,
              count(*) FILTER (WHERE s.is_flagged)::int AS flagged,
              coalesce(sum(c.contract_amount), 0)::float8 AS "totalValue",
              coalesce(sum(c.contract_amount) FILTER (WHERE s.is_flagged), 0)::float8
                AS "flaggedValue",
              count(DISTINCT c.procuring_entity)::int AS entities,
              count(DISTINCT c.procuring_entity) FILTER (WHERE s.is_flagged)::int
                AS "entitiesWithFlag"
       FROM contract_scores s JOIN contracts c ON c.id = s.contract_id
       WHERE s.run_id = $1`,
      [runId],
    ),
    db.query(
      `SELECT least(floor(risk_score * ${HISTOGRAM_BINS}), ${HISTOGRAM_BINS - 1})::int AS bin,
              count(*)::int AS count
       FROM contract_scores WHERE run_id = $1 GROUP BY 1 ORDER BY 1`,
      [runId],
    ),
    db.query(
      `SELECT r.main_reason AS indicator, count(*)::int AS count
       FROM (${REASONS}) r
       JOIN contract_scores s ON s.contract_id = r.contract_id AND s.run_id = $1
       WHERE s.is_flagged GROUP BY r.main_reason`,
      [runId],
    ),
    db.query(
      `SELECT DISTINCT c.region FROM contracts c
       JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
       WHERE c.region IS NOT NULL ORDER BY 1`,
      [runId],
    ),
    db.query(
      `SELECT DISTINCT c.entity_type_group AS type FROM contracts c
       JOIN contract_scores s ON s.contract_id = c.id AND s.run_id = $1
       WHERE c.entity_type_group IS NOT NULL ORDER BY 1`,
      [runId],
    ),
  ]);

  const counts = new Map<number, number>(histogram.rows.map((row) => [row.bin, row.count]));
  const reasonCounts = new Map<string, number>(reasons.rows.map((r) => [r.indicator, r.count]));
  return {
    totals: totals.rows[0],
    histogram: Array.from({ length: HISTOGRAM_BINS }, (_, bin) => ({
      from: bin / HISTOGRAM_BINS,
      to: (bin + 1) / HISTOGRAM_BINS,
      count: counts.get(bin) ?? 0,
    })),
    mainReasons: INDICATORS.map((indicator) => ({
      indicator,
      count: reasonCounts.get(indicator) ?? 0,
    })),
    filters: {
      regions: regions.rows.map((row) => row.region as string),
      entityTypes: entityTypes.rows.map((row) => row.type as string),
    },
  };
}

// Fields a reviewer or an indicator depends on, in the order the page shows them.
// The third value completes "needed for ...". Procuring entity and awardee, which
// repeated winner and grouped small-value awards also need, are required when a
// contract is loaded, so they are never missing and are not listed.
const QUALITY_FIELDS = [
  ['contract_amount', 'Contract amount', 'High award-to-budget ratio'],
  [
    'approved_budget',
    'Approved budget',
    'High award-to-budget ratio and grouped small-value awards',
  ],
  ['region', 'Region', 'Comparable contracts'],
  ['bid_reference_no', 'Bid notice reference', 'Few document requests'],
  ['procurement_mode', 'Procurement mode', 'Few document requests and grouped small-value awards'],
  ['award_date', 'Award date', 'Grouped small-value awards and the timeline'],
  ['published_date', 'Notice published date', 'Timeline'],
  ['closing_date', 'Bidding closing date', 'Timeline'],
  ['notice_to_proceed_date', 'Notice to proceed date', 'Timeline'],
] as const;

/**
 * Contracts and flagged contracts per place, as PhilGEPS names it (where the
 * procuring entity is based). The dashboard matches the names to map shapes.
 */
export async function places(db: Db, runId: number) {
  const { rows } = await db.query(
    `SELECT c.region, c.province, c.city_municipality AS city,
            count(*)::int AS contracts,
            count(*) FILTER (WHERE s.is_flagged)::int AS flagged,
            coalesce(sum(c.contract_amount) FILTER (WHERE s.is_flagged), 0)::float8
              AS "flaggedValue"
     FROM contract_scores s JOIN contracts c ON c.id = s.contract_id
     WHERE s.run_id = $1
     GROUP BY 1, 2, 3`,
    [runId],
  );
  return rows;
}

export async function dataQuality(db: Db) {
  const [report, fields, checks, notices] = await Promise.all([
    db.query(
      `SELECT created_at AS "loadedAt", is_demo AS "isDemo", source_files AS "sourceFiles", intake
       FROM load_reports ORDER BY id DESC LIMIT 1`,
    ),
    db.query(
      `SELECT count(*)::int AS total,
              ${QUALITY_FIELDS.map(([column]) => `count(${column})::int AS ${column}`).join(', ')}
       FROM contracts`,
    ),
    db.query(
      `SELECT min(published_date)::text AS "firstPublished",
              max(published_date)::text AS "lastPublished",
              min(award_date)::text AS "firstAward", max(award_date)::text AS "lastAward",
              count(*) FILTER (WHERE award_date < published_date)::int AS "awardedBeforePublished",
              count(*) FILTER (WHERE contract_amount > approved_budget * 1.0001)::int
                AS "amountAboveBudget",
              count(*) FILTER (WHERE procurement_mode = 'Public Bidding')::int AS "publicBidding"
       FROM contracts`,
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE c.bid_reference_no IS NOT NULL)::int AS wanted,
              count(n.document_request_count)::int AS collected
       FROM contracts c
       LEFT JOIN bid_notices n
         ON n.source_series = c.source_series AND n.bid_reference_no = c.bid_reference_no
        AND n.fetch_status = 'ok'
       WHERE c.procurement_mode = 'Public Bidding'`,
    ),
  ]);
  const counts = fields.rows[0] ?? { total: 0 };
  return {
    load: report.rows[0] ?? null,
    contracts: counts.total as number,
    fields: QUALITY_FIELDS.map(([column, label, usedFor]) => ({
      field: column,
      label,
      usedFor,
      present: (counts[column] as number | undefined) ?? 0,
    })),
    ...checks.rows[0],
    documentRequests: notices.rows[0],
  };
}
