/** Types and SQL fragments shared by the query modules. */
import type { Pool } from 'pg';

/** The minimal part of pg's Pool the API uses, so tests can pass a fake. */
export type Db = Pick<Pool, 'query'>;

export const INDICATORS = [
  'single_requester',
  'repeated_winner',
  'price_deviation',
  'contract_splitting',
] as const;
export type Indicator = (typeof INDICATORS)[number];

export const SORTS = {
  rank: 's.score_rank ASC',
  amount: 'c.contract_amount DESC NULLS LAST, s.score_rank ASC',
  recent: 'c.award_date DESC NULLS LAST, s.score_rank ASC',
} as const;
export type Sort = keyof typeof SORTS;

// The same orders on the grouped list's output columns.
export const GROUPED_SORTS: Record<Sort, string> = {
  rank: 'rank ASC',
  amount: 'amount DESC NULLS LAST, rank ASC',
  recent: '"awardDate" DESC NULLS LAST, rank ASC',
};

// One key per bid notice; an award made without a notice is its own.
export const NOTICE_KEY = `COALESCE(c.source_series || ':' || c.bid_reference_no, 'award:' || c.id)`;

export interface ListFilters {
  q?: string;
  region?: string;
  /** Exact province names; several when one map shape stands for more than one spelling. */
  provinces?: string[];
  /** Exact city/municipality names, as for provinces. */
  cities?: string[];
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
  /** One row per bid notice instead of one per contract. */
  grouped: boolean;
}

export const RUN_COLUMNS = `id::int AS id, model_name AS "modelName", is_demo AS "isDemo",
  flag_threshold AS "flagThreshold", base_value AS "baseValue",
  created_at AS "createdAt", parameters, notes`;

// Per contract: every indicator's contribution, and the one that raised the score most.
export const REASONS = `
  SELECT contract_id,
         (array_agg(indicator ORDER BY contribution DESC))[1] AS main_reason,
         jsonb_object_agg(indicator, contribution) AS contributions
  FROM contract_indicators
  WHERE run_id = $1
  GROUP BY contract_id`;
