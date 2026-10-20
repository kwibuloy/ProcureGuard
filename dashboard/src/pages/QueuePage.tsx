import { useEffect, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  contractsPath,
  exportPath,
  PAGE_SIZE,
  useApi,
  type ContractList,
  type Indicator,
  type ListQuery,
  type Overview,
  type Sort,
} from '../api';
import { BarList } from '../components/BarList';
import { CountUp } from '../components/CountUp';
import { ContractTable } from '../components/ContractTable';
import { Icon } from '../components/Icon';
import { ScoreHistogram } from '../components/ScoreHistogram';
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
    entityType: params.get('entityType') ?? '',
    reason: params.get('reason') ?? '',
    scoreFrom: params.get('scoreFrom') ?? '',
    scoreTo: params.get('scoreTo') ?? '',
    // The queue opens on flagged contracts; "all" widens it.
    flaggedOnly: params.get('show') !== 'all',
    sort: sort === 'amount' || sort === 'recent' ? sort : 'rank',
    page: Math.max(1, Number(params.get('page')) || 1),
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
  const query = readQuery(params);
  const list = useApi<ContractList>(run ? contractsPath(query, run.id) : null);
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
          Load PhilGEPS data and run the scoring step. The review queue appears here once a scoring
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
  if (query.entityType) chips.push({ label: query.entityType, clear: { entityType: '' } });
  if (query.reason) {
    const label = INDICATORS[query.reason as Indicator]?.label ?? query.reason;
    chips.push({ label: `Main reason: ${label}`, clear: { reason: '' } });
  }
  if (band) chips.push({ label: band, clear: { scoreFrom: '', scoreTo: '' } });

  const clearAll = () => {
    setText('');
    update({ q: '', region: '', entityType: '', reason: '', scoreFrom: '', scoreTo: '' });
  };

  return (
    <>
      <h1 className="visually-hidden">Review queue</h1>
      <Summary overview={overview.data} />

      <section className="charts">
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

      <section className="card queue" aria-labelledby="queue-title">
        <div className="queue-head">
          <div>
            <h2 id="queue-title">Contracts to review</h2>
            <p className="card-note" aria-live="polite">
              {list.data
                ? `${plural(list.data.total, 'contract')}${chips.length ? ' match the filters' : ''}`
                : 'Loading contracts'}
            </p>
          </div>
          <div className="queue-actions">
            <a className="button button-outline" href={exportPath(query, run.id)} download>
              <Icon name="download" />
              Export CSV
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
              placeholder="Search title, entity, awardee or reference"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
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
          <Notice
            title="No contracts match"
            action={chips.length ? { label: 'Clear filters', onClick: clearAll } : undefined}
          >
            {query.flaggedOnly
              ? 'No flagged contract matches these filters. Showing all screened contracts may find it.'
              : 'Nothing in this scoring run matches these filters.'}
          </Notice>
        ) : (
          <>
            <ContractTable
              rows={rows}
              threshold={run.flagThreshold}
              contractLink={(id) => ({ pathname: `/contracts/${id}`, search })}
              openId={openId}
              cursorId={cursor}
              reviewed={reviewed}
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
            {list.data && list.data.total > PAGE_SIZE && (
              <Pagination list={list.data} onPage={(page) => update({ page: String(page) })} />
            )}
          </>
        )}
      </section>

      <Outlet context={{ ...overview, listIds: ids }} />
    </>
  );
}
