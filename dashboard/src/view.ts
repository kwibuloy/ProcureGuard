/**
 * How the review list is shown: grouping, which columns, row density.
 *
 * Settings live in the page address so a shared link shows the same view, and
 * are saved in this browser so they come back on the next visit. A link that
 * carries settings wins over the saved ones.
 */

export const COLUMNS = ['rank', 'entity', 'awardee', 'amount', 'share', 'why'] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_LABELS: Record<Column, string> = {
  rank: 'Rank',
  entity: 'Procuring entity',
  awardee: 'Awardee',
  amount: 'Contract amount',
  share: '% of budget',
  why: 'Why',
};

export interface ViewSettings {
  grouped: boolean;
  hidden: ReadonlySet<Column>;
  compact: boolean;
}

/** The % of budget column is new, so it starts hidden. */
export const DEFAULT_VIEW: ViewSettings = {
  grouped: false,
  hidden: new Set<Column>(['share']),
  compact: false,
};

const KEYS = ['group', 'hide', 'compact'] as const;
const STORAGE_KEY = 'procureguard:view';

export const hasViewParams = (params: URLSearchParams) => KEYS.some((key) => params.has(key));

export function readView(params: URLSearchParams): ViewSettings {
  const hide = params.get('hide');
  return {
    grouped: params.get('group') === '1',
    hidden:
      hide === null
        ? DEFAULT_VIEW.hidden
        : new Set(hide.split(',').filter((name): name is Column => isColumn(name))),
    compact: params.get('compact') === '1',
  };
}

/** The address parameters for a view; a default value is left out of the link. */
export function viewParams(view: ViewSettings): Record<string, string> {
  const hidden = COLUMNS.filter((column) => view.hidden.has(column));
  const isDefaultHidden =
    hidden.length === DEFAULT_VIEW.hidden.size && hidden.every((c) => DEFAULT_VIEW.hidden.has(c));
  return {
    group: view.grouped ? '1' : '',
    // An empty "hide" means "show every column", which differs from leaving it out.
    hide: isDefaultHidden ? '' : hidden.join(',') || 'none',
    compact: view.compact ? '1' : '',
  };
}

function isColumn(name: string): name is Column {
  return (COLUMNS as readonly string[]).includes(name);
}

export function loadSavedView(): Record<string, string> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const entries = KEYS.flatMap((key) =>
      typeof saved[key] === 'string' && saved[key] ? [[key, saved[key] as string]] : [],
    );
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}

export function saveView(view: ViewSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(viewParams(view)));
  } catch {
    // Private windows and blocked storage: the view simply is not remembered.
  }
}
