import { useEffect, useState } from 'react';

export type Indicator = 'single_requester' | 'repeated_winner' | 'price_deviation';
export type Sort = 'rank' | 'amount' | 'recent';

export interface Run {
  id: number;
  modelName: string;
  isDemo: boolean;
  flagThreshold: number | null;
  baseValue: number | null;
  createdAt: string;
  notes: string | null;
  contracts?: number;
}

export interface Overview {
  run: Run | null;
  totals: {
    contracts: number;
    flagged: number;
    totalValue: number;
    flaggedValue: number;
    entities: number;
    entitiesWithFlag: number;
  };
  histogram: { from: number; to: number; count: number }[];
  mainReasons: { indicator: Indicator; count: number }[];
  filters: { regions: string[]; entityTypes: string[] };
}

export interface ContractRow {
  id: number;
  rank: number;
  score: number;
  flagged: boolean;
  title: string;
  awardReference: string;
  /** Standardized name, used as the key for the entity's page. */
  entity: string;
  /** Name as published, for display. */
  entityName: string;
  region: string | null;
  awardee: string;
  awardeeName: string;
  amount: number | null;
  budget: number | null;
  awardDate: string | null;
  /** Item budget of the line items this award covers; null when not published. */
  itemBudget: number | null;
  /** Awards in this row's bid notice. */
  noticeAwards: number;
  /** Total awarded across the notice's awards. */
  noticeAmount: number | null;
  mainReason: Indicator | null;
  contributions: Partial<Record<Indicator, number>> | null;
  /** The figures behind each indicator, so the list can say why in words. */
  indicators: IndicatorResult[];
}

export interface ContractList {
  /** Rows: one per contract, or one per bid notice when grouped. */
  total: number;
  /** Contracts behind those rows. */
  matchedContracts: number;
  /** When no flagged contract matches: how many screened contracts do. */
  screenedMatches: number | null;
  /** Search words with no exact match anywhere, matched by close spelling. */
  closeMatches: string[];
  page: number;
  pageSize: number;
  items: ContractRow[];
}

export interface IndicatorResult {
  indicator: Indicator;
  value: number | null;
  contribution: number;
  context: Record<string, number | string>;
}

export interface OtherRunScore {
  runId: number;
  modelName: string;
  score: number;
  rank: number;
  flagged: boolean;
}

export interface ContractDetail {
  id: number;
  title: string;
  awardReference: string;
  bidReference: string | null;
  sourceSeries: 'legacy' | 'modern';
  entity: string;
  entityName: string;
  region: string | null;
  province: string | null;
  cityMunicipality: string | null;
  entityType: string | null;
  procurementMode: string | null;
  businessCategory: string | null;
  budget: number | null;
  amount: number | null;
  /** Item budget of the line items this award covers; null when not published. */
  itemBudget: number | null;
  /** Awards that share the notice's approved budget (1 unless awarded in lots). */
  noticeAwards: number;
  publishedDate: string | null;
  closingDate: string | null;
  awardDate: string | null;
  noticeToProceedDate: string | null;
  awardee: string;
  awardeeName: string;
  awardeeRegion: string | null;
  awardeeSize: string | null;
  score: number;
  rank: number;
  flagged: boolean;
  scoredContracts: number;
  documentRequests: number | null;
  indicators: IndicatorResult[];
  otherRuns: OtherRunScore[];
}

export type ProfileKind = 'entity' | 'awardee';

export interface Profile {
  kind: ProfileKind;
  key: string;
  name: string;
  contracts: number;
  flagged: number;
  totalValue: number;
  counterparties: number;
  firstAward: string | null;
  lastAward: string | null;
  region: string | null;
  type: string | null;
  top: { key: string; name: string; contracts: number; flagged: number; value: number }[];
}

export interface Comparison {
  a: Run;
  b: Run;
  contracts: number;
  flaggedByBoth: number;
  onlyA: number;
  onlyB: number;
  rankCorrelation: number | null;
  topOverlap: { top: number; shared: number }[];
  points: { id: number; a: number; b: number; flaggedA: boolean; flaggedB: boolean }[];
  disagreements: {
    id: number;
    title: string;
    entityName: string;
    rankA: number;
    rankB: number;
    scoreA: number;
    scoreB: number;
    flaggedA: boolean;
    flaggedB: boolean;
  }[];
}

export interface DataQuality {
  load: {
    loadedAt: string;
    isDemo: boolean;
    sourceFiles: string[];
    intake: Record<string, number>;
  } | null;
  contracts: number;
  fields: { field: string; label: string; usedFor: string; present: number }[];
  firstPublished: string | null;
  lastPublished: string | null;
  firstAward: string | null;
  lastAward: string | null;
  awardedBeforePublished: number;
  amountAboveBudget: number;
  publicBidding: number;
  documentRequests: { wanted: number; collected: number };
}

export interface ListQuery {
  q: string;
  region: string;
  /** Province names joined with "|", set by the map. */
  province?: string;
  /** City/municipality names joined with "|", set by the map. */
  city?: string;
  entityType: string;
  reason: string;
  /** Lower edge of a score band, as text ("0.6"), or empty. */
  scoreFrom: string;
  scoreTo: string;
  flaggedOnly: boolean;
  sort: Sort;
  page: number;
  entity?: string;
  awardee?: string;
  /** One row per bid notice. */
  grouped?: boolean;
}

export const PAGE_SIZE = 25;

function listParams(query: ListQuery, run: number | null): URLSearchParams {
  const params = new URLSearchParams();
  if (run) params.set('run', String(run));
  if (query.q) params.set('q', query.q);
  if (query.region) params.set('region', query.region);
  if (query.province) params.set('province', query.province);
  if (query.city) params.set('city', query.city);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.reason) params.set('reason', query.reason);
  if (query.scoreFrom) params.set('scoreFrom', query.scoreFrom);
  if (query.scoreTo) params.set('scoreTo', query.scoreTo);
  if (query.entity) params.set('entity', query.entity);
  if (query.awardee) params.set('awardee', query.awardee);
  if (query.flaggedOnly) params.set('flagged', 'true');
  if (query.sort !== 'rank') params.set('sort', query.sort);
  return params;
}

export function contractsPath(query: ListQuery, run: number | null): string {
  const params = listParams(query, run);
  params.set('page', String(query.page));
  params.set('pageSize', String(PAGE_SIZE));
  if (query.grouped) params.set('group', 'true');
  return `/api/contracts?${params}`;
}

/** Download link for every contract matching the filters, not only the page shown. */
export const exportPath = (query: ListQuery, run: number | null) =>
  `/api/contracts.csv?${listParams(query, run)}`;

export const withRun = (path: string, run: number | null) =>
  run ? `${path}${path.includes('?') ? '&' : '?'}run=${run}` : path;

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Not found' : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch JSON for a path, keeping the previous data on screen while the next loads. */
export function useApi<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; path: string | null }>(
    { data: null, error: null, path: null },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    // A response for a path the reader has already left must not overwrite the
    // newer one: a slow earlier request can finish after a fast later one.
    get<T>(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, path });
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setState({ data: null, error: error.message, path });
        }
      });
    return () => controller.abort();
  }, [path, attempt]);

  return {
    data: path ? state.data : null,
    error: state.path === path ? state.error : null,
    loading: path !== null && state.path !== path,
    reload: () => {
      setState((current) => ({ ...current, path: null }));
      setAttempt((count) => count + 1);
    },
  };
}
