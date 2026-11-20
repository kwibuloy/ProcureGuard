/** The contract list, the CSV export and one contract's detail. */
import { contractFilter, resolveSearch, type ContractFilters } from './filter.js';
import {
  GROUPED_SORTS,
  INDICATORS,
  NOTICE_KEY,
  previousRunId,
  REASONS,
  SORTS,
  type Db,
  type ListFilters,
  type Sort,
} from './shared.js';

/** `previous` is a run id read from the database (an integer), or null for none. */
const listFrom = (previous: number | null) => `
  FROM contract_scores s
  JOIN contracts c ON c.id = s.contract_id
  LEFT JOIN (${REASONS}) r ON r.contract_id = c.id
  LEFT JOIN contract_scores prev
    ON prev.contract_id = c.id AND prev.run_id = ${Number.isInteger(previous) ? previous : 'NULL'}`;

/** Flagged in this run, and not flagged (or not yet scored) in the previous one. */
const IS_NEW = `(s.is_flagged AND NOT COALESCE(prev.is_flagged, FALSE))`;

/**
 * One row per contract, or when `grouped`, one row per bid notice: a notice
 * awarded in lots then shows its highest-ranked matching award, with how many
 * awards the notice has and their total, so ten lots do not fill ten rows.
 */
export async function listContracts(db: Db, runId: number, filters: ListFilters) {
  const previous = await previousRunId(db, runId);
  const LIST_FROM = listFrom(previous);
  const terms = await resolveSearch(db, filters.q);
  const { where, params } = contractFilter(runId, filters, terms);
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await db.query(
    `SELECT page.*,
            COALESCE(n.awards, 1)::int AS "noticeAwards",
            COALESCE(n.amount, page.amount)::float8 AS "noticeAmount"
     FROM (
       SELECT *, count(*) OVER ()::int AS total,
              ${filters.grouped ? 'sum(matched_in_notice) OVER ()' : 'count(*) OVER ()'}::int
                AS "matchedContracts"
       FROM (
         SELECT c.id::int AS id, s.score_rank AS rank, s.risk_score AS score,
                s.is_flagged AS flagged, ${IS_NEW} AS "isNew",
                c.title, c.award_reference_no AS "awardReference",
                c.procuring_entity AS entity, c.procuring_entity_raw AS "entityName", c.region,
                c.awardee, c.awardee_raw AS "awardeeName",
                c.contract_amount::float8 AS amount, c.approved_budget::float8 AS budget,
                c.item_budget::float8 AS "itemBudget",
                c.award_date::text AS "awardDate", r.main_reason AS "mainReason",
                r.contributions,
                c.source_series AS notice_series, c.bid_reference_no AS notice_reference,
                row_number() OVER (PARTITION BY ${NOTICE_KEY} ORDER BY s.score_rank) AS lot_order,
                count(*) OVER (PARTITION BY ${NOTICE_KEY}) AS matched_in_notice
         ${LIST_FROM}
         WHERE ${where}
       ) grouped
       WHERE ${filters.grouped ? 'lot_order = 1' : 'TRUE'}
       ORDER BY ${GROUPED_SORTS[filters.sort]}
       LIMIT $${params.length - 1} OFFSET $${params.length}
     ) page
     -- How many awards each row's notice has, for the rows on this page only.
     LEFT JOIN LATERAL (
       SELECT count(*) AS awards, sum(x.contract_amount) AS amount
       FROM contracts x
       WHERE x.source_series = page.notice_series AND x.bid_reference_no = page.notice_reference
     ) n ON page.notice_reference IS NOT NULL
     ORDER BY ${GROUPED_SORTS[filters.sort]}`,
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
  // Nothing flagged matches: say how many screened contracts do, so the reader
  // can widen the list instead of concluding the search found nothing.
  let screenedMatches: number | null = null;
  if (!rows.length && filters.flaggedOnly && filters.page === 1) {
    const wider = contractFilter(runId, { ...filters, flaggedOnly: false }, terms);
    const { rows: counted } = await db.query(
      `SELECT count(*)::int AS n ${LIST_FROM} WHERE ${wider.where}`,
      wider.params,
    );
    screenedMatches = (counted[0]?.n as number | undefined) ?? 0;
  }
  const byContract = new Map<number, Map<string, unknown>>();
  for (const { id, ...result } of details.rows) {
    if (!byContract.has(id)) byContract.set(id, new Map());
    byContract.get(id)!.set(result.indicator, result);
  }
  return {
    total: (rows[0]?.total as number | undefined) ?? 0,
    matchedContracts: (rows[0]?.matchedContracts as number | undefined) ?? 0,
    screenedMatches,
    // Words with no exact match anywhere, matched by close spelling instead.
    closeMatches: terms.filter((term) => term.fuzzy).map((term) => term.word),
    page: filters.page,
    pageSize: filters.pageSize,
    items: rows.map(
      ({
        total: _total,
        matchedContracts: _matched,
        lot_order: _order,
        matched_in_notice: _inNotice,
        notice_series: _series,
        notice_reference: _reference,
        ...item
      }) => {
        const found = byContract.get(item.id);
        return {
          ...item,
          indicators: found
            ? INDICATORS.filter((name) => found.has(name)).map((name) => found.get(name))
            : [],
        };
      },
    ),
  };
}

/** Contracts matching the filters, in the list's order, for the CSV export (at most `limit`). */
export async function exportContracts(
  db: Db,
  runId: number,
  filters: ContractFilters & { sort: Sort },
  limit: number,
) {
  const LIST_FROM = listFrom(await previousRunId(db, runId));
  const { where, params } = contractFilter(runId, filters, await resolveSearch(db, filters.q));
  const { rows } = await db.query(
    `SELECT s.score_rank AS rank, round((s.risk_score * 100)::numeric, 1)::float8 AS score,
            s.is_flagged AS flagged, ${IS_NEW} AS newly_flagged, r.main_reason AS main_reason,
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
              AS points_unusual_price,
            round(((r.contributions->>'contract_splitting')::numeric * 100), 2)::float8
              AS points_small_value_awards_grouped
     ${LIST_FROM}
     WHERE ${where}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT ${Math.max(0, Math.floor(limit))}`,
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
            c.item_budget::float8 AS "itemBudget",
            -- Awards sharing this notice's approved budget (its lots).
            CASE WHEN c.bid_reference_no IS NULL THEN 1 ELSE
              (SELECT count(*)::int FROM contracts x
               WHERE x.source_series = c.source_series
                 AND x.bid_reference_no = c.bid_reference_no)
            END AS "noticeAwards",
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
