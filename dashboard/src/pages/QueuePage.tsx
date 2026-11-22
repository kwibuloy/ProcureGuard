import { useEffect, useRef, useState } from 'react';
import { Outlet, useMatch, useSearchParams } from 'react-router-dom';
import {
  contractsPath,
  exportPath,
  MAX_PAGE_SIZE,
  PHONE_PAGE_SIZE,
  useApi,
  type ContractList,
} from '../api';
import { listCount } from '../amounts';
import { Icon } from '../components/Icon';
import { PlaceMap } from '../components/PlaceMap';
import { Notice, SkeletonQueuePage } from '../components/States';
import { useToast } from '../components/Toast';
import { ReviewProgress } from '../components/ReviewProgress';
import { SavedViews } from '../components/SavedViews';
import { Tour } from '../components/Tour';
import { ViewMenu } from '../components/ViewMenu';
import { formatCount } from '../format';
import { useOverview } from '../overview';
import { useReviewStatuses } from '../reviews';
import { PHONE, useMedia } from '../useMedia';
import {
  hasViewParams,
  loadSavedView,
  readView,
  saveView,
  viewParams,
  type ViewSettings,
} from '../view';
import { FilterBar } from './queue/FilterBar';
import { ListBody } from './queue/ListBody';
import { BackToTop } from './queue/Navigation';
import { QueueCharts } from './queue/QueueCharts';
import { CLEARED_FILTERS, exportShortfall, filterChips, readQuery } from './queue/query';
import { Summary, SummaryStrip, type Target } from './queue/Summary';
import { useListKeys } from './queue/useListKeys';

type PhoneTab = 'list' | 'map' | 'charts';
const PHONE_TABS: { key: PhoneTab; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'map', label: 'Map' },
  { key: 'charts', label: 'Charts' },
];

export function QueuePage() {
  const overview = useOverview();
  const run = overview.data?.run ?? null;
  const [params, setParams] = useSearchParams();
  const phone = useMedia(PHONE);
  const tabParam = params.get('tab');
  const tab: PhoneTab = tabParam === 'map' || tabParam === 'charts' ? tabParam : 'list';
  const query = readQuery(params);
  const view = readView(params);
  // Phones show 10 rows and add 10 more on request, starting over when the filters change.
  const listKey = contractsPath({ ...query, page: 1 }, run?.id ?? null);
  const [more, setMore] = useState({ key: '', size: PHONE_PAGE_SIZE });
  const phoneSize = more.key === listKey ? more.size : PHONE_PAGE_SIZE;
  const listPath = !run
    ? null
    : phone
      ? contractsPath(
          { ...query, page: phoneSize < MAX_PAGE_SIZE ? 1 : query.page },
          run.id,
          phoneSize,
        )
      : contractsPath(query, run.id);
  const list = useApi<ContractList>(listPath);
  const openId = Number(useMatch('/contracts/:id')?.params.id) || null;
  const search = params.toString();
  const statuses = useReviewStatuses(list.data?.items.map((row) => row.id) ?? []);
  const searchBox = useRef<HTMLInputElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const toast = useToast();

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // A link without view settings opens in this browser's saved view.
  useEffect(() => {
    if (hasViewParams(params)) return;
    const saved = loadSavedView();
    if (saved) update({ ...saved, page: params.get('page') ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = (next: ViewSettings) => {
    saveView(next);
    update(viewParams(next));
  };

  // Typing filters the queue after a short pause, not on every keystroke.
  const [text, setText] = useState(query.q);
  useEffect(() => {
    if (text === query.q) return;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const ids = list.data?.items.map((row) => row.id) ?? [];

  /** A chart or the map filtered the list: bring the list into view and say what changed. */
  const filterFrom = (changes: Record<string, string>, message: string) => {
    update(phone ? { ...changes, tab: '' } : changes);
    toast(message, 'flag');
    if (!phone) queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useListKeys({ idKey: ids.join(','), cursor, setCursor, openId, search, searchBox });

  if (overview.error) {
    return (
      <div className="card">
        <Notice
          title="The dashboard could not reach the server"
          icon="info"
          action={{ label: 'Try again', onClick: overview.reload }}
        >
          Check that the API and the database are running.
        </Notice>
      </div>
    );
  }
  if (!overview.data) return <SkeletonQueuePage />;
  if (!overview.data.run || !run) {
    return (
      <div className="card">
        <Notice title="No contracts have been scored yet">
          Load PhilGEPS data and run the scoring step. The contract list appears here once a scoring
          run has been stored.
        </Notice>
      </div>
    );
  }

  const chips = filterChips(query);
  const clearAll = () => {
    setText('');
    update(CLEARED_FILTERS);
  };
  const leftOut = list.data
    ? exportShortfall(list.data.matchedContracts, list.data.exportLimit)
    : 0;

  const first: Target = !list.data
    ? 'loading'
    : ids[0]
      ? { pathname: `/contracts/${ids[0]}`, search }
      : null;
  const count = list.data ? listCount(list.data.total, list.data.matchedContracts) : null;

  return (
    <>
      <h1 className="visually-hidden">Contracts</h1>
      <div className="wide-only-block">
        <Summary overview={overview.data} first={first} />
      </div>
      <SummaryStrip overview={overview.data} first={first} />

      <div className="phone-tabs phone-only" role="tablist" aria-label="Show">
        {PHONE_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() =>
              update({ tab: item.key === 'list' ? '' : item.key, page: params.get('page') ?? '' })
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <section
        ref={queueRef}
        className={`card queue phone-section ${tab === 'list' ? 'is-active' : ''}`}
        aria-labelledby="queue-title"
      >
        <div className="queue-head">
          <div>
            <h2 id="queue-title" className="queue-title">
              Contracts to review
            </h2>
            <p className="queue-count" aria-live="polite">
              {count ?? <span className="card-note">Loading contracts</span>}
              {count && chips.length > 0 && <span className="card-note"> match the filters</span>}
            </p>
          </div>
          <ReviewProgress runId={run.id} />
          <div className="queue-actions">
            <div className="segmented" role="group" aria-label="Which contracts to show">
              <button
                type="button"
                aria-pressed={query.flaggedOnly}
                onClick={() => update({ show: '', scoreFrom: '', scoreTo: '' })}
              >
                Flagged only
              </button>
              <button
                type="button"
                aria-pressed={!query.flaggedOnly}
                onClick={() => update({ show: 'all' })}
              >
                All contracts
              </button>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={view.grouped}
                onChange={(event) => setView({ ...view, grouped: event.target.checked })}
              />
              <span className="switch-track" aria-hidden="true" />
              <span>
                Group <span className="wide-only">lots </span>by notice
              </span>
            </label>
            <SavedViews />
            <ViewMenu view={view} onChange={setView} />
            <a
              className="button button-export"
              href={exportPath(query, run.id)}
              download
              aria-label={leftOut > 0 ? 'Export CSV (first contracts only)' : 'Export CSV'}
              onClick={() => toast('Your CSV download is starting', 'download')}
            >
              <Icon name="download" />
              <span className="button-label">Export CSV</span>
            </a>
          </div>
        </div>

        <div className="queue-toolbar">
          <FilterBar
            query={query}
            filters={overview.data.filters}
            phone={phone}
            text={text}
            setText={setText}
            searchBox={searchBox}
            chips={chips}
            update={update}
            clearAll={clearAll}
            runId={run.id}
          />
          <div className="queue-notes">
            {list.data && list.data.closeMatches.length > 0 && (
              <p className="card-note search-note">
                No exact match for {list.data.closeMatches.map((word) => `“${word}”`).join(', ')};
                showing close spellings.
              </p>
            )}
            {leftOut > 0 && (
              <p className="card-note export-note">
                Export CSV holds the first {formatCount(list.data!.exportLimit!)} contracts in this
                order; {formatCount(leftOut)} more match. Narrow the filters to export them.
              </p>
            )}
          </div>
        </div>

        <ListBody
          list={list}
          query={query}
          hasChips={chips.length > 0}
          table={{
            threshold: run.flagThreshold,
            contractLink: (id) => ({ pathname: `/contracts/${id}`, search }),
            openId,
            cursorId: cursor,
            statuses,
            view,
          }}
          phone={phone}
          phoneSize={phoneSize}
          onMore={() =>
            setMore({ key: listKey, size: Math.min(MAX_PAGE_SIZE, phoneSize + PHONE_PAGE_SIZE) })
          }
          update={update}
          clearAll={clearAll}
        />
      </section>

      <section className="explore" aria-labelledby="explore-title">
        <div className="section-head wide-only-block">
          <div>
            <h2 id="explore-title">Explore the patterns</h2>
            <p>
              Where the flagged contracts sit and why they were flagged. Select a bar or a place to
              filter the list above.
            </p>
          </div>
        </div>

        <QueueCharts
          overview={overview.data}
          run={run}
          query={query}
          active={tab === 'charts'}
          onFilter={filterFrom}
        />

        <div className={`phone-section ${tab === 'map' ? 'is-active' : ''}`}>
          <PlaceMap
            run={run.id}
            onFilter={(place) => {
              const name = place.city || place.province.split('|')[0] || place.region;
              filterFrom(
                { region: place.region, province: place.province, city: place.city },
                name ? `Showing contracts in ${name}` : 'Showing contracts in every place',
              );
            }}
          />
          <button
            type="button"
            className="button button-primary phone-only map-to-list"
            onClick={() => update({ tab: '' })}
          >
            {count ? `Show ${count} in the list` : 'Show the list'}
          </button>
        </div>
      </section>

      <BackToTop />
      <Tour ready={Boolean(list.data && ids.length > 0) && !openId} />
      <Outlet context={{ ...overview, listIds: ids }} />
    </>
  );
}
