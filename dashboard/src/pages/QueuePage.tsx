import { useEffect, useState } from 'react';
import { Link, Outlet, useMatch, useSearchParams } from 'react-router-dom';
import {
  contractsPath,
  PAGE_SIZE,
  useApi,
  type ContractList,
  type ListQuery,
  type Overview,
  type Sort,
} from '../api';
import { useOverview } from '../overview';
import { Icon } from '../components/Icon';
import { ReasonBars } from '../components/ReasonBars';
import { ScoreHistogram } from '../components/ScoreHistogram';
import { ScoreMeter } from '../components/ScoreMeter';
import {
  formatCount,
  formatDate,
  formatPercent,
  formatPeso,
  formatPesoCompact,
  plural,
  toPoints,
} from '../format';
import { INDICATOR_ORDER, INDICATORS } from '../indicators';

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
    // The queue opens on flagged contracts; "all" widens it.
    flaggedOnly: params.get('show') !== 'all',
    sort: sort === 'amount' || sort === 'recent' ? sort : 'rank',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** A headline number with a bar showing it as a share of its whole. */
function Tile(props: { label: string; value: string; note: string; share: number }) {
  return (
    <div className="card tile">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
      <p>{props.note}</p>
      <span className="tile-share" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, props.share * 100))}%` }} />
      </span>
    </div>
  );
}

function Summary({ overview }: { overview: Overview }) {
  const { totals, run } = overview;
  const share = totals.contracts ? totals.flagged / totals.contracts : 0;
  return (
    <section className="summary" aria-label="Summary of the latest screening run">
      <div className="card hero">
        <p className="eyebrow">Latest screening run</p>
        <p className="hero-figure">{formatCount(totals.flagged)}</p>
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
          note={`of ${formatPesoCompact(totals.totalValue)} screened`}
          share={totals.totalValue ? totals.flaggedValue / totals.totalValue : 0}
        />
        <Tile
          label="Procuring entities with a flagged contract"
          value={formatCount(totals.entitiesWithFlag)}
          note={`of ${formatCount(totals.entities)} entities screened`}
          share={totals.entities ? totals.entitiesWithFlag / totals.entities : 0}
        />
        <Tile
          label="Score needed to be flagged"
          value={run?.flagThreshold == null ? 'Not set' : String(toPoints(run.flagThreshold))}
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

export function QueuePage() {
  const overview = useOverview();
  const [params, setParams] = useSearchParams();
  const query = readQuery(params);
  const list = useApi<ContractList>(overview.data?.run ? contractsPath(query) : null);
  const openId = Number(useMatch('/contracts/:id')?.params.id) || null;
  const search = params.toString();

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

  if (overview.error) {
    return (
      <div className="card state">
        <h1>The dashboard could not reach the server</h1>
        <p>Check that the API and the database are running, then try again.</p>
        <button type="button" className="button" onClick={overview.reload}>
          Try again
        </button>
      </div>
    );
  }
  if (!overview.data) return <div className="card state skeleton" aria-busy="true" />;
  if (!overview.data.run) {
    return (
      <div className="card state">
        <h1>No contracts have been scored yet</h1>
        <p>
          Load PhilGEPS data and run the scoring step. The review queue appears here once a scoring
          run has been stored.
        </p>
      </div>
    );
  }

  const { run, histogram, mainReasons, filters } = overview.data;
  const filtersActive = Boolean(query.q || query.region || query.entityType || query.reason);

  return (
    <>
      <h1 className="visually-hidden">Review queue</h1>
      <Summary overview={overview.data} />

      <section className="charts">
        <div className="card">
          <h2>How the scores are spread</h2>
          <p className="card-note">
            Number of contracts in each score band. Darker bars are at or above the flagging score.
          </p>
          <ScoreHistogram bins={histogram} threshold={run.flagThreshold} />
        </div>
        <div className="card">
          <h2>Main reason, among flagged contracts</h2>
          <p className="card-note">
            The indicator that raised each flagged contract’s score the most. Select one to filter
            the queue.
          </p>
          <ReasonBars
            reasons={mainReasons}
            selected={query.reason}
            onSelect={(reason) => update({ reason })}
          />
        </div>
      </section>

      <section className="card queue" aria-labelledby="queue-title">
        <div className="queue-head">
          <div>
            <h2 id="queue-title">Contracts to review</h2>
            <p className="card-note" aria-live="polite">
              {list.data
                ? `${plural(list.data.total, 'contract')}${filtersActive ? ' match the filters' : ''}`
                : 'Loading contracts'}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Which contracts to show">
            <button
              type="button"
              aria-pressed={query.flaggedOnly}
              onClick={() => update({ show: '' })}
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

        <div className="filters">
          <label className="field field-search">
            <span className="visually-hidden">Search contracts</span>
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search title, entity, awardee or reference"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
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
          {filtersActive && (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setText('');
                update({ q: '', region: '', entityType: '', reason: '' });
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {list.error ? (
          <div className="state">
            <p>The contract list could not be loaded.</p>
            <button type="button" className="button" onClick={list.reload}>
              Try again
            </button>
          </div>
        ) : !list.data ? (
          <div className="state skeleton" aria-busy="true" />
        ) : list.data.items.length === 0 ? (
          <div className="state">
            <p>No contracts match these filters.</p>
          </div>
        ) : (
          <>
            <div className={`table-wrap ${list.loading ? 'is-loading' : ''}`}>
              <table className="queue-table">
                <thead>
                  <tr>
                    <th scope="col" className="col-rank">
                      Rank
                    </th>
                    <th scope="col">Contract</th>
                    <th scope="col" className="col-entity">
                      Procuring entity
                    </th>
                    <th scope="col" className="col-awardee">
                      Awardee
                    </th>
                    <th scope="col" className="col-amount">
                      Contract amount
                    </th>
                    <th scope="col" className="col-score">
                      Score
                    </th>
                    <th scope="col" className="col-reason">
                      Main reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr key={row.id} className={row.id === openId ? 'is-open' : ''}>
                      <td className="col-rank">{row.rank}</td>
                      <td className="col-contract">
                        <Link
                          to={{ pathname: `/contracts/${row.id}`, search }}
                          className="row-link"
                        >
                          {row.title}
                        </Link>
                        <span className="cell-sub">
                          {row.awardReference} · Awarded {formatDate(row.awardDate)}
                        </span>
                      </td>
                      <td className="col-entity">
                        {row.entity}
                        <span className="cell-sub">{row.region ?? 'Region not published'}</span>
                      </td>
                      <td className="col-awardee">{row.awardee}</td>
                      <td className="col-amount" title={formatPeso(row.amount)}>
                        {formatPeso(row.amount)}
                      </td>
                      <td className="col-score">
                        <span className="score-cell">
                          <span className="score-number">{toPoints(row.score)}</span>
                          <ScoreMeter score={row.score} threshold={run.flagThreshold} />
                        </span>
                      </td>
                      <td className="col-reason">
                        {row.mainReason && (
                          <span className="chip">
                            <Icon name={row.mainReason} size={14} />
                            {INDICATORS[row.mainReason].label}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data.total > PAGE_SIZE && (
              <Pagination list={list.data} onPage={(page) => update({ page: String(page) })} />
            )}
          </>
        )}
      </section>

      <Outlet context={overview} />
    </>
  );
}
