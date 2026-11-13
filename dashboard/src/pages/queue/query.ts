import type { Indicator, ListQuery, Sort } from '../../api';
import { toPoints } from '../../format';
import { INDICATORS } from '../../indicators';

export const SORT_LABELS: Record<Sort, string> = {
  rank: 'Highest score first',
  amount: 'Largest contract first',
  recent: 'Most recent award first',
};

/** The list's filters, sort and page, as the URL holds them. */
export function readQuery(params: URLSearchParams): ListQuery {
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    region: params.get('region') ?? '',
    province: params.get('province') ?? '',
    city: params.get('city') ?? '',
    entityType: params.get('entityType') ?? '',
    reason: params.get('reason') ?? '',
    scoreFrom: params.get('scoreFrom') ?? '',
    scoreTo: params.get('scoreTo') ?? '',
    // The queue opens on flagged contracts; "all" widens it.
    flaggedOnly: params.get('show') !== 'all',
    sort: sort === 'amount' || sort === 'recent' ? sort : 'rank',
    page: Math.max(1, Number(params.get('page')) || 1),
    grouped: params.get('group') === '1',
  };
}

export interface Chip {
  label: string;
  /** URL parameters to clear when the chip is removed. */
  clear: Record<string, string>;
}

/** One removable chip per active filter, in the order the filter bar shows them. */
export function filterChips(query: ListQuery): Chip[] {
  const band =
    query.scoreFrom && query.scoreTo
      ? `Score ${toPoints(Number(query.scoreFrom))} to ${toPoints(Number(query.scoreTo))}`
      : '';
  const chips: Chip[] = [];
  if (query.q) chips.push({ label: `“${query.q}”`, clear: { q: '' } });
  if (query.region) chips.push({ label: query.region, clear: { region: '' } });
  // A map shape can stand for several spellings; the chip names the first.
  if (query.province && !query.city) {
    chips.push({ label: query.province.split('|')[0]!, clear: { province: '' } });
  }
  if (query.city) {
    chips.push({ label: query.city.split('|')[0]!, clear: { city: '', province: '' } });
  }
  if (query.entityType) chips.push({ label: query.entityType, clear: { entityType: '' } });
  if (query.reason) {
    const label = INDICATORS[query.reason as Indicator]?.label ?? query.reason;
    chips.push({ label: `Main reason: ${label}`, clear: { reason: '' } });
  }
  if (band) chips.push({ label: band, clear: { scoreFrom: '', scoreTo: '' } });
  return chips;
}

/** Filters tucked into the phone sheet that are set, for its button's count. */
export const sheetFilterCount = (query: ListQuery) =>
  [query.region, query.entityType, query.reason].filter(Boolean).length +
  (query.sort === 'rank' ? 0 : 1);

/** Every filter cleared, keeping the view, sort and which contracts are shown. */
export const CLEARED_FILTERS = {
  q: '',
  region: '',
  province: '',
  city: '',
  entityType: '',
  reason: '',
  scoreFrom: '',
  scoreTo: '',
};

/**
 * How many of the matching contracts an export leaves out, or 0 when it holds
 * them all. The export has one row per contract even when the list is grouped.
 */
export const exportShortfall = (matchedContracts: number, exportLimit: number | undefined) =>
  exportLimit && matchedContracts > exportLimit ? matchedContracts - exportLimit : 0;
