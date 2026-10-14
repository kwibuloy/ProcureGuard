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
  entity?: string;
  awardee?: string;
  reason?: Indicator;
  scoreFrom?: number;
  scoreTo?: number;
  flaggedOnly: boolean;
  sort: Sort;
  page: number;
  pageSize: number;
}

const HISTOGRAM_BINS = 20;
const EXPORT_LIMIT = 50_000;
const COMPARE_POINTS = 2_500;

const RUN_COLUMNS = `id::int AS id, model_name AS "modelName", is_demo AS "isDemo",
  flag_threshold AS "flagThreshold", base_value AS "baseValue",
  created_at AS "createdAt", parameters, notes`;

// Per contract: every indicator's contribution, and the one that raised the score most.
const REASONS = `
  SELECT contract_id,
         (array_agg(indicator ORDER BY contribution DESC))[1] AS main_reason,
         jsonb_object_agg(indicator, contribution) AS contributions
  FROM contract_indicators
  WHERE run_id = $1
  GROUP BY contract_id`;

export async function listRuns(db: Db) {
  const { rows } = await db.query(
    `SELECT ${RUN_COLUMNS},
            (SELECT count(*)::int FROM contract_scores s WHERE s.run_id = r.id) AS contracts
     FROM scoring_runs r ORDER BY id DESC LIMIT 50`,
  );
  return rows;
}

/** The requested run, or the latest one when none (or an unknown one) is requested. */
export async function findRun(db: Db, runId?: number) {
  if (runId) {
    const { rows } = await db.query(`SELECT ${RUN_COLUMNS} FROM scoring_runs WHERE id = $1`, [
      runId,
    ]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await db.query(
    `SELECT ${RUN_COLUMNS} FROM scoring_runs ORDER BY id DESC LIMIT 1`,
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

type ContractFilters = Omit<ListFilters, 'sort' | 'page' | 'pageSize'>;

/** WHERE clause and parameters shared by the paged list and the CSV export. */
function contractFilter(runId: number, filters: ContractFilters) {
  const where = ['s.run_id = $1'];
  const params: unknown[] = [runId];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replaceAll('?', `$${params.length}`));
  };

  if (filters.q) {
    add(
      '(c.title ILIKE ? OR c.procuring_entity_raw ILIKE ? OR c.awardee_raw ILIKE ? OR c.award_reference_no ILIKE ?)',
      `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  if (filters.region) add('c.region = ?', filters.region);
  if (filters.entityType) add('c.entity_type_group = ?', filters.entityType);
  if (filters.entity) add('c.procuring_entity = ?', filters.entity);
  if (filters.awardee) add('c.awardee = ?', filters.awardee);
  if (filters.reason) add('r.main_reason = ?', filters.reason);
  if (filters.scoreFrom !== undefined) add('s.risk_score >= ?', filters.scoreFrom);
  // The top band includes a score of exactly 1.
  if (filters.scoreTo !== undefined && filters.scoreTo < 1)
    add('s.risk_score < ?', filters.scoreTo);
  if (filters.flaggedOnly) where.push('s.is_flagged');
  return { where: where.join(' AND '), params };
}

const LIST_FROM = `
  FROM contract_scores s
  JOIN contracts c ON c.id = s.contract_id
  LEFT JOIN (${REASONS}) r ON r.contract_id = c.id`;

export async function listContracts(db: Db, runId: number, filters: ListFilters) {
  const { where, params } = contractFilter(runId, filters);
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await db.query(
    `SELECT c.id::int AS id, s.score_rank AS rank, s.risk_score AS score,
            s.is_flagged AS flagged, c.title, c.award_reference_no AS "awardReference",
            c.procuring_entity AS entity, c.procuring_entity_raw AS "entityName", c.region,
            c.awardee, c.awardee_raw AS "awardeeName",
            c.contract_amount::float8 AS amount, c.approved_budget::float8 AS budget,
            c.award_date::text AS "awardDate", r.main_reason AS "mainReason",
            r.contributions,
            count(*) OVER ()::int AS total
     ${LIST_FROM}
     WHERE ${where}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  // The figures behind each indicator, for the rows on this page only.
  const ids = rows.map((row) => row.id as number);
  const details = ids.length
    ? await db.query(
        `SELECT contract_id::int AS id, indicator, value, contribution, context
         FROM contract_indicators WHERE run_id = $1 AND contract_id = ANY($2::bigint[])`,
        [runId, ids],
      )
    : { rows: [] };
  const byContract = new Map<number, Map<string, unknown>>();
  for (const { id, ...result } of details.rows) {
    if (!byContract.has(id)) byContract.set(id, new Map());
    byContract.get(id)!.set(result.indicator, result);
  }
  return {
    total: (rows[0]?.total as number | undefined) ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    items: rows.map(({ total: _total, ...item }) => {
      const found = byContract.get(item.id);
      return {
        ...item,
        indicators: found
          ? INDICATORS.filter((name) => found.has(name)).map((name) => found.get(name))
          : [],
      };
    }),
  };
}

/** Every contract matching the filters, for the CSV export. */
export async function exportContracts(
  db: Db,
  runId: number,
  filters: ContractFilters & { sort: Sort },
) {
  const { where, params } = contractFilter(runId, filters);
  const { rows } = await db.query(
    `SELECT s.score_rank AS rank, round((s.risk_score * 100)::numeric, 1)::float8 AS score,
            s.is_flagged AS flagged, r.main_reason AS main_reason,
            c.award_reference_no, c.bid_reference_no, c.title,
            c.procuring_entity_raw AS procuring_entity, c.region,
            c.awardee_raw AS awardee, c.procurement_mode,
            c.approved_budget::float8 AS approved_budget,
            c.contract_amount::float8 AS contract_amount,
            c.published_date::text AS published_date, c.award_date::text AS award_date,
            round(((r.contributions->>'single_requester')::numeric * 100), 2)::float8
              AS points_few_document_requests,
            round(((r.contributions->>'repeated_winner')::numeric * 100), 2)::float8
              AS points_repeated_winner,
            round(((r.contributions->>'price_deviation')::numeric * 100), 2)::float8
              AS points_unusual_price
     ${LIST_FROM}
     WHERE ${where}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT ${EXPORT_LIMIT}`,
    params,
  );
  return rows as Record<string, unknown>[];
}

export async function contractDetail(db: Db, runId: number, contractId: number) {
  const { rows } = await db.query(
    `SELECT c.id::int AS id, c.title, c.award_reference_no AS "awardReference",
            c.bid_reference_no AS "bidReference", c.source_series AS "sourceSeries",
            c.procuring_entity AS entity, c.procuring_entity_raw AS "entityName",
            c.region, c.province,
            c.city_municipality AS "cityMunicipality", c.entity_type AS "entityType",
            c.procurement_mode AS "procurementMode", c.business_category AS "businessCategory",
            c.approved_budget::float8 AS budget, c.contract_amount::float8 AS amount,
            c.published_date::text AS "publishedDate", c.closing_date::text AS "closingDate",
            c.award_date::text AS "awardDate",
            c.notice_to_proceed_date::text AS "noticeToProceedDate",
            c.awardee, c.awardee_raw AS "awardeeName", c.awardee_region AS "awardeeRegion",
            c.awardee_size AS "awardeeSize",
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

  const [indicators, otherRuns] = await Promise.all([
    db.query(
      `SELECT indicator, value, contribution, context
       FROM contract_indicators WHERE run_id = $1 AND contract_id = $2`,
      [runId, contractId],
    ),
    // How the other models scored the same contract.
    db.query(
      `SELECT r.id::int AS "runId", r.model_name AS "modelName", s.risk_score AS score,
              s.score_rank AS rank, s.is_flagged AS flagged
       FROM contract_scores s JOIN scoring_runs r ON r.id = s.run_id
       WHERE s.contract_id = $2 AND s.run_id <> $1
       ORDER BY r.id DESC LIMIT 5`,
      [runId, contractId],
    ),
  ]);
  const byName = new Map(indicators.rows.map((row) => [row.indicator, row]));
  return {
    ...rows[0],
    indicators: INDICATORS.filter((name) => byName.has(name)).map((name) => byName.get(name)),
    otherRuns: otherRuns.rows,
  };
}

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

// Fields a reviewer or an indicator depends on, in the order the page shows them.
const QUALITY_FIELDS = [
  ['contract_amount', 'Contract amount', 'Unusual price'],
  ['approved_budget', 'Approved budget', 'Unusual price'],
  ['region', 'Region', 'Comparable contracts'],
  ['bid_reference_no', 'Bid notice reference', 'Few document requests'],
  ['procurement_mode', 'Procurement mode', 'Few document requests'],
  ['published_date', 'Notice published date', 'Timeline'],
  ['closing_date', 'Bidding closing date', 'Timeline'],
  ['award_date', 'Award date', 'Timeline'],
  ['notice_to_proceed_date', 'Notice to proceed date', 'Timeline'],
] as const;

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
