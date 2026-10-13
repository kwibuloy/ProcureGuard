import type { Pool } from 'pg';

/** The minimal part of pg's Pool the API uses, so tests can pass a fake. */
export type Db = Pick<Pool, 'query'>;

export const INDICATORS = ['single_requester', 'repeated_winner', 'price_deviation'] as const;
export type Indicator = (typeof INDICATORS)[number];

export const SORTS = {
  rank: 's.score_rank ASC',
  amount: 'c.contract_amount DESC NULLS LAST, s.score_rank ASC',
  recent: 'c.award_date DESC NULLS LAST, s.score_rank ASC',
} as const;
export type Sort = keyof typeof SORTS;

export interface ListFilters {
  q?: string;
  region?: string;
  entityType?: string;
  reason?: Indicator;
  flaggedOnly: boolean;
  sort: Sort;
  page: number;
  pageSize: number;
}

const HISTOGRAM_BINS = 20;

// The indicator that pushed each contract's score up the most.
const MAIN_REASON = `
  SELECT DISTINCT ON (contract_id) contract_id, indicator
  FROM contract_indicators
  WHERE run_id = $1
  ORDER BY contract_id, contribution DESC`;

export async function latestRun(db: Db) {
  const { rows } = await db.query(
    `SELECT id::int AS id, model_name AS "modelName", is_demo AS "isDemo",
            flag_threshold AS "flagThreshold", base_value AS "baseValue",
            created_at AS "createdAt", notes
     FROM scoring_runs ORDER BY id DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

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
      `SELECT r.indicator, count(*)::int AS count
       FROM (${MAIN_REASON}) r
       JOIN contract_scores s ON s.contract_id = r.contract_id AND s.run_id = $1
       WHERE s.is_flagged GROUP BY r.indicator`,
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

export async function listContracts(db: Db, runId: number, filters: ListFilters) {
  const where = ['s.run_id = $1'];
  const params: unknown[] = [runId];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replaceAll('?', `$${params.length}`));
  };

  if (filters.q) {
    add(
      '(c.title ILIKE ? OR c.procuring_entity ILIKE ? OR c.awardee ILIKE ? OR c.award_reference_no ILIKE ?)',
      `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  if (filters.region) add('c.region = ?', filters.region);
  if (filters.entityType) add('c.entity_type_group = ?', filters.entityType);
  if (filters.reason) add('r.indicator = ?', filters.reason);
  if (filters.flaggedOnly) where.push('s.is_flagged');

  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await db.query(
    `SELECT c.id::int AS id, s.score_rank AS rank, s.risk_score AS score,
            s.is_flagged AS flagged, c.title, c.award_reference_no AS "awardReference",
            c.procuring_entity AS entity, c.region, c.awardee,
            c.contract_amount::float8 AS amount, c.approved_budget::float8 AS budget,
            c.award_date::text AS "awardDate", r.indicator AS "mainReason",
            count(*) OVER ()::int AS total
     FROM contract_scores s
     JOIN contracts c ON c.id = s.contract_id
     LEFT JOIN (${MAIN_REASON}) r ON r.contract_id = c.id
     WHERE ${where.join(' AND ')}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: (rows[0]?.total as number | undefined) ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    items: rows.map(({ total: _total, ...item }) => item),
  };
}

export async function contractDetail(db: Db, runId: number, contractId: number) {
  const { rows } = await db.query(
    `SELECT c.id::int AS id, c.title, c.award_reference_no AS "awardReference",
            c.bid_reference_no AS "bidReference", c.source_series AS "sourceSeries",
            c.procuring_entity AS entity, c.region, c.province,
            c.city_municipality AS "cityMunicipality", c.entity_type AS "entityType",
            c.procurement_mode AS "procurementMode", c.business_category AS "businessCategory",
            c.approved_budget::float8 AS budget, c.contract_amount::float8 AS amount,
            c.published_date::text AS "publishedDate", c.closing_date::text AS "closingDate",
            c.award_date::text AS "awardDate",
            c.notice_to_proceed_date::text AS "noticeToProceedDate",
            c.awardee, c.awardee_region AS "awardeeRegion", c.awardee_size AS "awardeeSize",
            s.risk_score AS score, s.score_rank AS rank, s.is_flagged AS flagged,
            (SELECT count(*)::int FROM contract_scores WHERE run_id = $1) AS "scoredContracts",
            n.document_request_count AS "documentRequests"
     FROM contract_scores s
     JOIN contracts c ON c.id = s.contract_id
     LEFT JOIN bid_notices n
       ON n.source_series = c.source_series AND n.bid_reference_no = c.bid_reference_no
     WHERE s.run_id = $1 AND c.id = $2`,
    [runId, contractId],
  );
  if (!rows[0]) return null;

  const indicators = await db.query(
    `SELECT indicator, value, contribution, context
     FROM contract_indicators WHERE run_id = $1 AND contract_id = $2`,
    [runId, contractId],
  );
  const byName = new Map(indicators.rows.map((row) => [row.indicator, row]));
  return {
    ...rows[0],
    indicators: INDICATORS.filter((name) => byName.has(name)).map((name) => byName.get(name)),
  };
}
