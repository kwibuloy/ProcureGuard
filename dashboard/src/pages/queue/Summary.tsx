import { Link } from 'react-router-dom';
import type { Overview } from '../../api';
import { CountUp } from '../../components/CountUp';
import { Icon } from '../../components/Icon';
import { Tile } from '../../components/States';
import {
  formatCount,
  formatDate,
  formatPercent,
  formatPesoCompact,
  toPoints,
  wholeCount,
} from '../../format';
import { Term } from '../../components/Term';

/** The first contract in the list; 'loading' while the list loads, null when it is empty. */
export type Target = { pathname: string; search?: string } | 'loading' | null;

/** Opens the first contract in the list, the one the reader should look at first. */
function StartButton({ to, large = false }: { to: Target; large?: boolean }) {
  const className = `button button-primary ${large ? 'button-lg' : ''}`;
  if (to === null) return null;
  if (to === 'loading') {
    return (
      <span className={`${className} is-busy`} aria-disabled="true">
        <span className="spinner" aria-hidden="true" />
        Loading the list
      </span>
    );
  }
  return (
    <Link to={to} className={className}>
      Start reviewing
      <Icon name="arrowRight" size={20} />
    </Link>
  );
}

/** Where the figures come from and how fresh they are, so nobody reads stale data as current. */
function Freshness({ run }: { run: Overview['run'] }) {
  if (!run) return null;
  return (
    <p className="freshness">
      <span className="freshness-dot" aria-hidden="true" />
      PhilGEPS 2024 civil works · scored {formatDate(run.createdAt)} ·{' '}
      <Term term="scoringRun">run {run.id}</Term>
    </p>
  );
}

/** The headline of the Contracts page: how many contracts are flagged, and where to start. */
export function Summary({ overview, first }: { overview: Overview; first: Target }) {
  const { totals, run } = overview;
  const share = totals.contracts ? totals.flagged / totals.contracts : 0;
  return (
    <section className="hero" aria-label="Summary of the scoring run">
      <div className="card hero-main">
        <div>
          <Freshness run={run} />
          <h2 className="hero-title">
            <span className="hero-figure">
              <span className="highlight">
                <CountUp value={totals.flagged} format={wholeCount} />
              </span>
            </span>
            {totals.flagged === 1 ? 'contract' : 'contracts'} flagged for review
          </h2>
          <p className="hero-note">
            <strong>
              {formatPercent(share, 1)} of the {formatCount(totals.contracts)} infrastructure
              contracts screened.
            </strong>{' '}
            A <Term term="flagged">flag</Term> means a contract is statistically unusual and worth a
            closer look. It is not a finding of wrongdoing.
          </p>
        </div>
        {first !== null && (
          <div className="hero-actions">
            <StartButton to={first} large />
            <p className="hero-hint">
              Opens the first contract in the list. Then <kbd>J</kbd> next, <kbd>K</kbd> previous.
            </p>
          </div>
        )}
      </div>
      <dl className="hero-stats">
        <Tile
          label="Value of flagged contracts"
          value={formatPesoCompact(totals.flaggedValue)}
          count={{ to: totals.flaggedValue, format: formatPesoCompact }}
          note={`of ${formatPesoCompact(totals.totalValue)} screened`}
          share={totals.totalValue ? totals.flaggedValue / totals.totalValue : 0}
        />
        <Tile
          label="Procuring entities with a flag"
          value={formatCount(totals.entitiesWithFlag)}
          count={{ to: totals.entitiesWithFlag, format: wholeCount }}
          note={`of ${formatCount(totals.entities)} screened`}
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
          note="out of 100"
          share={run?.flagThreshold ?? 0}
        />
      </dl>
    </section>
  );
}

/** The summary in one strip, for phones: the same four figures, without the cards. */
export function SummaryStrip({ overview, first }: { overview: Overview; first: Target }) {
  const { totals, run } = overview;
  const share = totals.contracts ? totals.flagged / totals.contracts : 0;
  return (
    <section className="card summary-strip phone-only" aria-label="Summary of the scoring run">
      <Freshness run={run} />
      <dl>
        <div className="strip-lead">
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
          <dt>Flagged at</dt>
          <dd>{run?.flagThreshold == null ? 'Not set' : `${toPoints(run.flagThreshold)}+`}</dd>
          <dd className="strip-note">out of 100</dd>
        </div>
      </dl>
      <p className="strip-caution">
        A flag means statistically unusual and worth a look, not wrongdoing.
      </p>
      <div className="strip-actions">
        <StartButton to={first} />
      </div>
    </section>
  );
}
