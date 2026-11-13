import type { ComponentProps } from 'react';
import {
  MAX_PAGE_SIZE,
  PHONE_PAGE_SIZE,
  type ContractList,
  type ListQuery,
  type Loaded,
} from '../../api';
import { ContractTable } from '../../components/ContractTable';
import { Notice, SkeletonRows } from '../../components/States';
import { formatCount, plural } from '../../format';
import { Pagination } from './Navigation';

/** The list itself: loading and empty states, the table, and paging. */
export function ListBody({
  list,
  query,
  hasChips,
  table,
  phone,
  phoneSize,
  onMore,
  update,
  clearAll,
}: {
  list: Loaded<ContractList>;
  query: ListQuery;
  hasChips: boolean;
  table: Omit<ComponentProps<typeof ContractTable>, 'rows' | 'loading'>;
  phone: boolean;
  /** Rows shown on a phone, which grows by PHONE_PAGE_SIZE on request. */
  phoneSize: number;
  onMore: () => void;
  update: (changes: Record<string, string>) => void;
  clearAll: () => void;
}) {
  const rows = list.data?.items;
  if (list.error) {
    return (
      <Notice
        title="The contract list could not be loaded"
        icon="info"
        action={{ label: 'Try again', onClick: list.reload }}
      />
    );
  }
  if (!rows) return <SkeletonRows />;
  if (rows.length === 0) {
    if (query.flaggedOnly && list.data?.screenedMatches) {
      const matches = list.data.screenedMatches;
      return (
        <Notice
          title="No flagged contract matches"
          action={{ label: 'Show them', onClick: () => update({ show: 'all' }) }}
        >
          {`${plural(matches, 'screened contract')} ${matches === 1 ? 'matches' : 'match'} these filters but ${matches === 1 ? 'is' : 'are'} not flagged.`}
        </Notice>
      );
    }
    return (
      <Notice
        title="No contracts match"
        action={hasChips ? { label: 'Clear filters', onClick: clearAll } : undefined}
      >
        {query.flaggedOnly
          ? 'No flagged contract matches these filters, and no screened contract does either.'
          : 'Nothing in this scoring run matches these filters.'}
      </Notice>
    );
  }
  const data = list.data!;
  return (
    <>
      <ContractTable rows={rows} loading={list.loading} {...table} />
      <div className="queue-foot">
        <p className="legend">
          <span className="legend-title">Why</span>
          <span className="swatch swatch-raises" /> points an indicator added to the score
        </p>
        <p className="keys" aria-hidden="true">
          <kbd>J</kbd>
          <kbd>K</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close
        </p>
      </div>
      {phone && rows.length < data.total && phoneSize < MAX_PAGE_SIZE ? (
        <div className="show-more">
          <button
            type="button"
            className="button button-outline"
            disabled={list.loading}
            onClick={onMore}
          >
            Show {Math.min(PHONE_PAGE_SIZE, data.total - rows.length)} more
          </button>
          <p className="card-note">
            {formatCount(rows.length)} of {formatCount(data.total)} shown
          </p>
        </div>
      ) : (
        data.total > data.pageSize && (
          <Pagination list={data} onPage={(page) => update({ page: String(page) })} />
        )
      )}
    </>
  );
}
