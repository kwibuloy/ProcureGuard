import { useEffect, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  contractsPath,
  exportPath,
  MAX_PAGE_SIZE,
  PHONE_PAGE_SIZE,
  useApi,
  type ContractList,
  type Indicator,
  type ListQuery,
  type Overview,
  type Sort,
} from '../api';
import { listCount } from '../amounts';
import { BarList } from '../components/BarList';
import { CountUp } from '../components/CountUp';
import { ContractTable } from '../components/ContractTable';
import { PlaceMap } from '../components/PlaceMap';
import { Icon } from '../components/Icon';
import { ScoreHistogram } from '../components/ScoreHistogram';
import { ViewMenu } from '../components/ViewMenu';
import { Notice, SkeletonRows, Tile } from '../components/States';
import {
  formatCount,
  formatPercent,
  formatPesoCompact,
  plural,
  toPoints,
  wholeCount,
} from '../format';
import { INDICATOR_ORDER, INDICATORS } from '../indicators';
import { useOverview } from '../overview';
import { useReviewed } from '../reviewed';
import { PHONE, useMedia } from '../useMedia';
import {
  hasViewParams,
  loadSavedView,
  readView,
  saveView,
  viewParams,
  type ViewSettings,
} from '../view';

const SORT_LABELS: Record<Sort, string> = {
  rank: 'Highest score first',
  amount: 'Largest contract first',
  recent: 'Most recent award first',
};

function readQuery(params: URLSearchParams): ListQuery {
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

function Summary({ overview }: { overview: Overview }) {
  const { totals, run } = overview;
  const share = totals.contracts ? totals.flagged / totals.contracts : 0;
  return (
    <section className="summary" aria-label="Summary of the scoring run">
      <div className="card hero">
        <p className="eyebrow">{run?.modelName ?? 'Scoring run'}</p>
        <p className="hero-figure">
          <CountUp value={totals.flagged} format={wholeCount} />
        </p>
        <p className="hero-label">
          {totals.flagged === 1 ? 'contract' : 'contracts'} flagged for review
        </p>
        <p className="hero-note">
          {formatPercent(share, 1)} of the {formatCount(totals.contracts)} infrastructure contracts
          screened. A flag means a contract is statistically unusual and worth a closer look. It is
          not a finding of wrongdoing.
        </p>
      </div>
      <dl className="tiles">
        <Tile
          label="Value of flagged contracts"
          value={formatPesoCompact(totals.flaggedValue)}
          count={{ to: totals.flaggedValue, format: formatPesoCompact }}
          note={`of ${formatPesoCompact(totals.totalValue)} screened`}
          share={totals.totalValue ? totals.flaggedValue / totals.totalValue : 0}
        />
        <Tile
          label="Procuring entities with a flagged contract"
          value={formatCount(totals.entitiesWithFlag)}
          count={{ to: totals.entitiesWithFlag, format: wholeCount }}
          note={`of ${formatCount(totals.entities)} entities screened`}
          share={totals.entities ? totals.entitiesWithFlag / totals.entities : 0}
        />
        <Tile
          label="Score needed to be flagged"
          value={run?.flagThreshold == null ? 'Not set' : String(toPoints(run.flagThreshold))}
          count={
            run?.flagThreshold == null
              ? undefined
              : { to: toPoints(run.flagThreshold), format: wholeCount }
          }
          note="on a scale of 0 to 100"
          share={run?.flagThreshold ?? 0}
        />
      </dl>
    </section>
  );
}

/** The summary in one strip, for phones: the same four figures, without the cards. */
function SummaryStrip({ overview }: { overview: Overview }) {
  const { totals, run } = overview;
  const share = totals.contracts ? totals.flagged / totals.contracts : 0;
  return (
    <section className="summary-strip phone-only" aria-label="Summary of the scoring run">
      <dl>
        <div>
          <dt>Flagged</dt>
          <dd>{formatCount(totals.flagged)}</dd>
          <dd className="strip-note">{formatPercent(share, 1)} of all</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{formatPesoCompact(totals.flaggedValue)}</dd>
          <dd className="strip-note">of {formatPesoCompact(totals.totalValue)}</dd>
        </div>
        <div>
          <dt>Entities</dt>
          <dd>{formatCount(totals.entitiesWithFlag)}</dd>
          <dd className="strip-note">of {formatCount(totals.entities)}</dd>
        </div>
        <div>
          <dt>Cut-off</dt>
          <dd>{run?.flagThreshold == null ? '–' : `${toPoints(run.flagThreshold)}+`}</dd>
          <dd className="strip-note">of 100</dd>
        </div>
      </dl>
      <p className="strip-caution">
        A flag means statistically unusual and worth a look, not wrongdoing.
      </p>
    </section>
  );
}

type PhoneTab = 'list' | 'map' | 'charts';
const PHONE_TABS: { key: PhoneTab; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'map', label: 'Map' },
  { key: 'charts', label: 'Charts' },
];

/** A button back to the top, shown on phones once the page has been scrolled a way. */
function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShown(window.scrollY > window.innerHeight * 1.5));
    };
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
    };
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="back-to-top phone-only"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      <Icon name="chevronUp" size={20} />
    </button>
  );
}

function Pagination({ list, onPage }: { list: ContractList; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const first = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.total, list.page * list.pageSize);
  return (
    <div className="pagination">
      <p>
        {first} to {last} of {formatCount(list.total)}
      </p>
      <div className="pagination-buttons">
        <button
          type="button"
          className="icon-button"
          disabled={list.page <= 1}
          onClick={() => onPage(list.page - 1)}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" />
        </button>
        <span>
          Page {list.page} of {pages}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={list.page >= pages}
          onClick={() => onPage(list.page + 1)}
          aria-label="Next page"
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openId = Number(useMatch('/contracts/:id')?.params.id) || null;
  const search = params.toString();
  const navigate = useNavigate();
  const { reviewed } = useReviewed();
  const searchBox = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

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

  const rows = list.data?.items;
  const ids = rows?.map((row) => row.id) ?? [];
  const idKey = ids.join(',');

  // Keyboard: J and K move through the list, Enter opens, slash jumps to search.
  useEffect(() => {
    const order = idKey ? idKey.split(',').map(Number) : [];
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        searchBox.current?.focus();
        return;
      }
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
      if (step && order.length) {
        event.preventDefault();
        const current = order.indexOf(openId ?? cursor ?? -1);
        const next = order[Math.min(order.length - 1, Math.max(0, current + step))]!;
        if (openId) navigate({ pathname: `/contracts/${next}`, search }, { replace: true });
        else setCursor(next);
        document
          .querySelector(`[data-row="${next}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (event.key === 'Enter' && cursor && !openId) {
        navigate({ pathname: `/contracts/${cursor}`, search });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [idKey, cursor, openId, search, navigate]);

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
  if (!overview.data) return <div className="card skeleton skeleton-block" aria-busy="true" />;
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

  const { histogram, mainReasons, filters } = overview.data;
  const band =
    query.scoreFrom && query.scoreTo
      ? `Score ${toPoints(Number(query.scoreFrom))} to ${toPoints(Number(query.scoreTo))}`
      : '';
  const chips: { label: string; clear: Record<string, string> }[] = [];
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

  const filterCount =
    [query.region, query.entityType, query.reason].filter(Boolean).length +
    (query.sort === 'rank' ? 0 : 1);

  const clearAll = () => {
    setText('');
    update({
      q: '',
      region: '',
      province: '',
      city: '',
      entityType: '',
      reason: '',
      scoreFrom: '',
      scoreTo: '',
    });
  };

  return (
    <>
      <h1 className="visually-hidden">Contracts</h1>
      <div className="wide-only-block">
        <Summary overview={overview.data} />
      </div>
      <SummaryStrip overview={overview.data} />

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

      <section className={`charts phone-section ${tab === 'charts' ? 'is-active' : ''}`}>
        <div className="card">
          <h2>How the scores are spread</h2>
          <p className="card-note">
            Contracts in each score band. Darker bars are flagged. Select a bar to list the
            contracts in that band.
          </p>
          <ScoreHistogram
            bins={histogram}
            threshold={run.flagThreshold}
            selectedFrom={query.scoreFrom ? Number(query.scoreFrom) : null}
            onSelect={(selected) =>
              update(
                selected
                  ? {
                      scoreFrom: String(selected.from),
                      scoreTo: String(selected.to),
                      // A band below the flagging score has no flagged contracts to show.
                      show: 'all',
                    }
                  : { scoreFrom: '', scoreTo: '' },
              )
            }
          />
        </div>
        <div className="card">
          <h2>Main reason, among flagged contracts</h2>
          <p className="card-note">
            The indicator that raised each flagged contract’s score the most. Select one to filter
            the queue.
          </p>
          <BarList
            items={mainReasons.map(({ indicator, count }) => ({
              key: indicator,
              label: (
                <>
                  <Icon name={indicator} />
                  {INDICATORS[indicator].label}
                </>
              ),
              value: count,
              display: formatCount(count),
            }))}
            selected={query.reason}
            onSelect={(reason) => update({ reason: query.reason === reason ? '' : reason })}
          />
        </div>
      </section>

      <div className={`phone-section ${tab === 'map' ? 'is-active' : ''}`}>
        <PlaceMap
          run={run.id}
          onFilter={(place) => {
            update({ region: place.region, province: place.province, city: place.city });
          }}
        />
        <button
          type="button"
          className="button phone-only map-to-list"
          onClick={() => update({ tab: '' })}
        >
          {list.data
            ? `Show ${listCount(list.data.total, list.data.matchedContracts)} in the list`
            : 'Show the list'}
        </button>
      </div>

      <section
        className={`card queue phone-section ${tab === 'list' ? 'is-active' : ''}`}
        aria-labelledby="queue-title"
      >
        <div className="queue-head">
          <div>
            <h2 id="queue-title" className="queue-title">
              Contracts to review
            </h2>
            <p className="card-note" aria-live="polite">
              {list.data
                ? `${listCount(list.data.total, list.data.matchedContracts)}${chips.length ? ' match the filters' : ''}`
                : 'Loading contracts'}
            </p>
            {list.data && list.data.closeMatches.length > 0 && (
              <p className="card-note search-note">
                No exact match for {list.data.closeMatches.map((word) => `“${word}”`).join(', ')};
                showing close spellings.
              </p>
            )}
          </div>
          <div className="queue-actions">
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
            <ViewMenu view={view} onChange={setView} />
            <a
              className="button button-outline button-export"
              href={exportPath(query, run.id)}
              download
              aria-label="Export CSV"
            >
              <Icon name="download" />
              <span className="button-label">Export CSV</span>
            </a>
            <div className="segmented" role="group" aria-label="Which contracts to show">
              <button
                type="button"
                aria-pressed={query.flaggedOnly}
                onClick={() => update({ show: '', scoreFrom: '', scoreTo: '' })}
              >
                Flagged
              </button>
              <button
                type="button"
                aria-pressed={!query.flaggedOnly}
                onClick={() => update({ show: 'all' })}
              >
                All screened
              </button>
            </div>
          </div>
        </div>

        <div className="filters">
          <label className="field field-search">
            <span className="visually-hidden">Search contracts</span>
            <Icon name="search" />
            <input
              ref={searchBox}
              type="search"
              placeholder="Search project, place or name"
              title="Search by project title, city or province, procuring entity, awardee, or reference number"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <button
            type="button"
            className="button button-outline filters-toggle phone-only"
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
            aria-controls="filter-fields"
          >
            <Icon name="sliders" />
            Filters{filterCount ? ` · ${filterCount}` : ''}
          </button>
          {filtersOpen && (
            <div
              className="sheet-scrim phone-only"
              onClick={() => setFiltersOpen(false)}
              aria-hidden="true"
            />
          )}
          <div
            id="filter-fields"
            className={`filter-fields ${filtersOpen ? 'is-open' : ''}`}
            onKeyDown={(event) => event.key === 'Escape' && setFiltersOpen(false)}
          >
            <div className="sheet-head phone-only">
              <h3>Filters</h3>
              <button type="button" className="button" onClick={() => setFiltersOpen(false)}>
                Done
              </button>
            </div>
            <label className="field">
              <span className="visually-hidden">Region</span>
              <select
                value={query.region}
                onChange={(event) => update({ region: event.target.value })}
              >
                <option value="">All regions</option>
                {filters.regions.map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="visually-hidden">Type of procuring entity</span>
              <select
                value={query.entityType}
                onChange={(event) => update({ entityType: event.target.value })}
              >
                <option value="">All entity types</option>
                {filters.entityTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="visually-hidden">Main reason</span>
              <select
                value={query.reason}
                onChange={(event) => update({ reason: event.target.value })}
              >
                <option value="">Any main reason</option>
                {INDICATOR_ORDER.map((indicator) => (
                  <option key={indicator} value={indicator}>
                    {INDICATORS[indicator].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-sort">
              <span className="visually-hidden">Sort order</span>
              <select
                value={query.sort === 'rank' ? '' : query.sort}
                onChange={(event) => update({ sort: event.target.value })}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value === 'rank' ? '' : value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="chips" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.label}>
                <button
                  type="button"
                  className="chip chip-removable"
                  onClick={() => {
                    if ('q' in chip.clear) setText('');
                    update(chip.clear);
                  }}
                >
                  {chip.label}
                  <Icon name="close" size={12} />
                  <span className="visually-hidden">Remove filter</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="button button-quiet" onClick={clearAll}>
                Clear all
              </button>
            </li>
          </ul>
        )}

        {list.error ? (
          <Notice
            title="The contract list could not be loaded"
            icon="info"
            action={{ label: 'Try again', onClick: list.reload }}
          />
        ) : !rows ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          query.flaggedOnly && list.data?.screenedMatches ? (
            <Notice
              title="No flagged contract matches"
              action={{ label: 'Show them', onClick: () => update({ show: 'all' }) }}
            >
              {`${plural(list.data.screenedMatches, 'screened contract')} ${
                list.data.screenedMatches === 1 ? 'matches' : 'match'
              } these filters but ${list.data.screenedMatches === 1 ? 'is' : 'are'} not flagged.`}
            </Notice>
          ) : (
            <Notice
              title="No contracts match"
              action={chips.length ? { label: 'Clear filters', onClick: clearAll } : undefined}
            >
              {query.flaggedOnly
                ? 'No flagged contract matches these filters, and no screened contract does either.'
                : 'Nothing in this scoring run matches these filters.'}
            </Notice>
          )
        ) : (
          <>
            <ContractTable
              rows={rows}
              threshold={run.flagThreshold}
              contractLink={(id) => ({ pathname: `/contracts/${id}`, search })}
              openId={openId}
              cursorId={cursor}
              reviewed={reviewed}
              view={view}
              loading={list.loading}
            />
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
            {phone && list.data && rows.length < list.data.total && phoneSize < MAX_PAGE_SIZE ? (
              <div className="show-more">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={list.loading}
                  onClick={() =>
                    setMore({
                      key: listKey,
                      size: Math.min(MAX_PAGE_SIZE, phoneSize + PHONE_PAGE_SIZE),
                    })
                  }
                >
                  Show {Math.min(PHONE_PAGE_SIZE, list.data.total - rows.length)} more
                </button>
                <p className="card-note">
                  {formatCount(rows.length)} of {formatCount(list.data.total)} shown
                </p>
              </div>
            ) : (
              list.data &&
              list.data.total > list.data.pageSize && (
                <Pagination list={list.data} onPage={(page) => update({ page: String(page) })} />
              )
            )}
          </>
        )}
      </section>

      <BackToTop />
      <Outlet context={{ ...overview, listIds: ids }} />
    </>
  );
}
