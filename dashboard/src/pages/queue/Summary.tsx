import type { Overview } from '../../api';
import { CountUp } from '../../components/CountUp';
import { Tile } from '../../components/States';
import { formatCount, formatPercent, formatPesoCompact, toPoints, wholeCount } from '../../format';

export function Summary({ overview }: { overview: Overview }) {
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
          icon="flag"
          label="Value of flagged contracts"
          value={formatPesoCompact(totals.flaggedValue)}
          count={{ to: totals.flaggedValue, format: formatPesoCompact }}
          note={`of ${formatPesoCompact(totals.totalValue)} screened`}
          share={totals.totalValue ? totals.flaggedValue / totals.totalValue : 0}
        />
        <Tile
          icon="building"
          label="Procuring entities with a flagged contract"
          value={formatCount(totals.entitiesWithFlag)}
          count={{ to: totals.entitiesWithFlag, format: wholeCount }}
          note={`of ${formatCount(totals.entities)} entities screened`}
          share={totals.entities ? totals.entitiesWithFlag / totals.entities : 0}
        />
        <Tile
          icon="sliders"
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
export function SummaryStrip({ overview }: { overview: Overview }) {
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
