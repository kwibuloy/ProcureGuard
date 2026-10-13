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
  entity: string;
  region: string | null;
  awardee: string;
  amount: number | null;
  budget: number | null;
  awardDate: string | null;
  mainReason: Indicator | null;
}

export interface ContractList {
  total: number;
  page: number;
  pageSize: number;
  items: ContractRow[];
}

export interface IndicatorResult {
  indicator: Indicator;
  value: number | null;
  contribution: number;
  context: Record<string, number>;
}

export interface ContractDetail {
  id: number;
  title: string;
  awardReference: string;
  bidReference: string | null;
  sourceSeries: 'legacy' | 'modern';
  entity: string;
  region: string | null;
  province: string | null;
  cityMunicipality: string | null;
  entityType: string | null;
  procurementMode: string | null;
  businessCategory: string | null;
  budget: number | null;
  amount: number | null;
  publishedDate: string | null;
  closingDate: string | null;
  awardDate: string | null;
  noticeToProceedDate: string | null;
  awardee: string;
  awardeeRegion: string | null;
  awardeeSize: string | null;
  score: number;
  rank: number;
  flagged: boolean;
  scoredContracts: number;
  documentRequests: number | null;
  indicators: IndicatorResult[];
}

export interface ListQuery {
  q: string;
  region: string;
  entityType: string;
  reason: string;
  flaggedOnly: boolean;
  sort: Sort;
  page: number;
}

export const PAGE_SIZE = 25;

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Not found' : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function contractsPath(query: ListQuery): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(PAGE_SIZE) });
  if (query.q) params.set('q', query.q);
  if (query.region) params.set('region', query.region);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.reason) params.set('reason', query.reason);
  if (query.flaggedOnly) params.set('flagged', 'true');
  if (query.sort !== 'rank') params.set('sort', query.sort);
  return `/api/contracts?${params}`;
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
    get<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, path }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setState({ data: null, error: error.message, path });
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
