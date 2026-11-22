import { Link, useSearchParams } from 'react-router-dom';
import { amountFacts } from '../amounts';
import { useApi, withRun, type ContractDetail } from '../api';
import { clearPicked } from '../compare';
import { ContributionChart } from '../components/ContributionChart';
import { Icon } from '../components/Icon';
import { ScoreDial } from '../components/ScoreDial';
import { Notice, SkeletonCard } from '../components/States';
import { Term } from '../components/Term';
import { formatCount, formatDate, formatPeso, plural, toPoints } from '../format';
import { useOverview } from '../overview';

function Column({ id, runId }: { id: number; runId: number }) {
  const run = useOverview().data?.run ?? null;
  const contract = useApi<ContractDetail>(withRun(`/api/contracts/${id}`, runId));
  if (contract.error) {
    return (
      <div className="card">
        <Notice title="This contract could not be loaded" icon="info">
          It may not be part of the scoring run being shown.
        </Notice>
      </div>
    );
  }
  if (!contract.data) return <SkeletonCard lines={6} block />;
  const data = contract.data;
  const amounts = amountFacts(data);
  return (
    <article className="card compare-column">
      <p className="eyebrow">
        Rank {formatCount(data.rank)} of {formatCount(data.scoredContracts)}
      </p>
      <h2>
        <Link to={`/contracts/${data.id}`} className="text-link">
          {data.title}
        </Link>
      </h2>
      <div className="compare-score">
        <ScoreDial score={data.score} threshold={run?.flagThreshold ?? null} />
        <p>
          <span className="score-big">{toPoints(data.score)}</span>
          <span className="score-of">out of 100</span>
        </p>
        <span className={`status ${data.flagged ? 'is-flagged' : ''}`}>
          {data.flagged ? 'Flagged for review' : 'Below the flagging score'}
        </span>
      </div>
      <dl className="compare-facts">
        <div>
          <dt>Procuring entity</dt>
          <dd>{data.entityName}</dd>
        </div>
        <div>
          <dt>Awardee</dt>
          <dd>{data.awardeeName}</dd>
        </div>
        <div>
          <dt>{amounts.amountLabel}</dt>
          <dd>{formatPeso(data.amount)}</dd>
        </div>
        <div>
          <dt>{amounts.budgetLabel}</dt>
          <dd>{formatPeso(data.budget)}</dd>
        </div>
        <div>
          <dt>
            <Term term="documentRequests">Document requests</Term>
          </dt>
          <dd>
            {data.documentRequests === null
              ? 'Not available'
              : plural(data.documentRequests, 'supplier')}
          </dd>
        </div>
        <div>
          <dt>Awarded</dt>
          <dd>{formatDate(data.awardDate)}</dd>
        </div>
      </dl>
      <h3>Why each scored as it did</h3>
      <ContributionChart
        indicators={data.indicators}
        baseValue={run?.baseValue ?? null}
        score={data.score}
      />
    </article>
  );
}

/** Two contracts side by side: score, key facts and the reasons behind each score. */
export function ComparePage() {
  const [params] = useSearchParams();
  const run = useOverview().data?.run ?? null;
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 2);

  return (
    <>
      <header className="page-header">
        <Link to="/" className="back-link">
          <Icon name="arrowLeft" /> Contracts
        </Link>
        <h1>Compare two contracts</h1>
        <p className="lede">
          The same facts and reasons, side by side. Both were scored in the same run, so their
          scores and indicator points can be compared directly.
        </p>
      </header>
      {ids.length < 2 || !run ? (
        <div className="card">
          <Notice title="Pick two contracts to compare" icon="columns">
            Open a contract and choose Compare, then do the same for a second one.
          </Notice>
        </div>
      ) : (
        <>
          <div className="compare-grid">
            {ids.map((id) => (
              <Column key={id} id={id} runId={run.id} />
            ))}
          </div>
          <p>
            <button type="button" className="button button-quiet" onClick={clearPicked}>
              Clear the comparison
            </button>
          </p>
        </>
      )}
    </>
  );
}
