import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useApi, type Run } from '../api';
import { Icon } from '../components/Icon';
import { Notice, SkeletonCard } from '../components/States';
import { formatCount, formatDate } from '../format';
import { useRuns } from '../run';

interface Compared {
  fromRun: number;
  toRun: number;
  top: {
    id: number;
    title: string;
    rankTo: number;
    rankFrom: number | null;
    flaggedTo: boolean;
    flaggedFrom: boolean;
  }[];
  flaggedInBoth: number;
  flaggedOnlyBefore: number;
  flaggedOnlyAfter: number;
}

const ROW = 52;
const runLabel = (run: Run) => `Run ${run.id} · ${formatDate(run.createdAt)}`;

/**
 * How two scoring runs rank the same contracts. A slider moves the later run's
 * top contracts between the order the earlier run gave them and their own order,
 * so a stable ranking barely moves and a changed one visibly reshuffles.
 */
export function StabilityPage() {
  const { runs } = useRuns();
  const comparable = runs.filter((run) => !run.isDemo);
  const [chosen, setChosen] = useState<{ from: number; to: number } | null>(null);
  const to = chosen?.to ?? comparable[0]?.id ?? 0;
  const from = chosen?.from ?? comparable[1]?.id ?? 0;
  const [mix, setMix] = useState(1);
  const result = useApi<Compared>(
    from && to && from !== to ? `/api/run-compare?from=${from}&to=${to}&limit=20` : null,
  );

  const rows = result.data?.top ?? [];
  // Where each row sits in the earlier run's order, among these rows.
  const earlierOrder = [...rows]
    .sort((a, b) => (a.rankFrom ?? Infinity) - (b.rankFrom ?? Infinity))
    .map((row) => row.id);

  return (
    <article className="stability">
      <header className="page-header">
        <Link to="/about#method" className="back-link">
          <Icon name="arrowLeft" /> How scores work
        </Link>
        <h1>How stable is the ranking?</h1>
        <p className="lede">
          Compare two scoring runs. Drag the slider to move the later run’s top contracts from the
          order the earlier run gave them to their new order. Little movement means the ranking
          held.
        </p>
      </header>

      {comparable.length < 2 ? (
        <div className="card">
          <Notice title="Only one scoring run so far" art="checklist">
            A comparison needs at least two runs over the same data.
          </Notice>
        </div>
      ) : (
        <>
          <div className="card stability-controls">
            <label className="field field-block">
              <span>Earlier run</span>
              <select
                value={from}
                onChange={(event) => setChosen({ from: Number(event.target.value), to })}
              >
                {comparable.map((run) => (
                  <option key={run.id} value={run.id} disabled={run.id === to}>
                    {runLabel(run)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-block">
              <span>Later run</span>
              <select
                value={to}
                onChange={(event) => setChosen({ from, to: Number(event.target.value) })}
              >
                {comparable.map((run) => (
                  <option key={run.id} value={run.id} disabled={run.id === from}>
                    {runLabel(run)}
                  </option>
                ))}
              </select>
            </label>
            <label className="stability-slider">
              <span>
                Order shown: <strong>{mix < 0.5 ? `run ${from}` : `run ${to}`}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={mix}
                onChange={(event) => setMix(Number(event.target.value))}
                aria-valuetext={mix < 0.5 ? `Earlier run order` : `Later run order`}
              />
              <span className="slider-ends" aria-hidden="true">
                <span>Run {from}</span>
                <span>Run {to}</span>
              </span>
            </label>
          </div>

          {result.error ? (
            <div className="card">
              <Notice
                title="The comparison could not be loaded"
                art="unplugged"
                action={{ label: 'Try again', onClick: result.reload }}
              />
            </div>
          ) : !result.data ? (
            <SkeletonCard lines={8} />
          ) : (
            <>
              <dl className="tiles">
                <div className="card tile">
                  <dt>Flagged in both runs</dt>
                  <dd>{formatCount(result.data.flaggedInBoth)}</dd>
                </div>
                <div className="card tile">
                  <dt>Flagged only in run {from}</dt>
                  <dd>{formatCount(result.data.flaggedOnlyBefore)}</dd>
                </div>
                <div className="card tile">
                  <dt>Flagged only in run {to}</dt>
                  <dd>{formatCount(result.data.flaggedOnlyAfter)}</dd>
                </div>
              </dl>

              <section
                className="card stability-board"
                aria-label={`Top ${rows.length} contracts in run ${to}`}
              >
                <ol style={{ height: rows.length * ROW } as CSSProperties}>
                  {rows.map((row, index) => {
                    const before = earlierOrder.indexOf(row.id);
                    const y = (before + (index - before) * mix) * ROW;
                    const moved = row.rankFrom === null ? null : row.rankFrom - row.rankTo;
                    return (
                      <li key={row.id} style={{ transform: `translateY(${y}px)` }}>
                        <span className="board-rank">
                          {mix < 0.5 ? (row.rankFrom ?? 'n/a') : row.rankTo}
                        </span>
                        <Link to={`/contracts/${row.id}`} className="board-title">
                          {row.title}
                        </Link>
                        <span
                          className={`board-move ${moved === null ? '' : moved > 0 ? 'is-up' : moved < 0 ? 'is-down' : ''}`}
                        >
                          {moved === null
                            ? 'Not scored before'
                            : moved === 0
                              ? 'Same rank'
                              : moved > 0
                                ? `Up ${formatCount(moved)}`
                                : `Down ${formatCount(-moved)}`}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </>
          )}
        </>
      )}
    </article>
  );
}
