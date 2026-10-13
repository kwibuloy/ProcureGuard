import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApi, type ContractDetail } from '../api';
import { ContributionChart } from '../components/ContributionChart';
import { Icon } from '../components/Icon';
import { ScoreMeter } from '../components/ScoreMeter';
import { Timeline } from '../components/Timeline';
import {
  formatCount,
  formatPercent,
  formatPeso,
  percentileFromRank,
  plural,
  toPoints,
} from '../format';
import { useOverview } from '../overview';

const NOTICE_URL =
  'https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refID=';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detail({ contract }: { contract: ContractDetail }) {
  const run = useOverview().data?.run ?? null;
  const threshold = run?.flagThreshold ?? null;
  const percentile = percentileFromRank(contract.rank, contract.scoredContracts);
  const ofBudget =
    contract.amount !== null && contract.budget ? contract.amount / contract.budget : null;
  const place = [contract.cityMunicipality, contract.province, contract.region]
    .filter(Boolean)
    .join(', ');
  // Only real legacy notices have a public page; demonstration references do not.
  const hasNoticePage =
    !run?.isDemo && contract.sourceSeries === 'legacy' && /^\d+$/.test(contract.bidReference ?? '');

  return (
    <>
      <div className="panel-body">
        <p className="eyebrow">
          Rank {formatCount(contract.rank)} of {formatCount(contract.scoredContracts)}
        </p>
        <h2 id="panel-title">{contract.title}</h2>
        <p className="panel-meta">
          Award {contract.awardReference}
          {contract.bidReference && ` · Bid notice ${contract.bidReference}`}
        </p>

        <section className="score-block" aria-label="Risk score">
          <div className="score-block-figure">
            <span className="score-big">{toPoints(contract.score)}</span>
            <span className="score-of">out of 100</span>
          </div>
          <div className="score-block-text">
            <span className={`status ${contract.flagged ? 'is-flagged' : ''}`}>
              {contract.flagged && <Icon name="flag" size={14} />}
              {contract.flagged ? 'Flagged for review' : 'Below the flagging score'}
            </span>
            <ScoreMeter score={contract.score} threshold={threshold} size="large" />
            <p>
              {contract.rank === 1
                ? `The most statistically unusual of the ${formatCount(contract.scoredContracts)} contracts screened.`
                : `More statistically unusual than ${formatPercent(Math.min(percentile, 0.999), percentile > 0.99 ? 1 : 0)} of the ${formatCount(contract.scoredContracts)} contracts screened.`}
            </p>
          </div>
        </section>

        <section>
          <h3>Why it received this score</h3>
          <p className="section-note">
            Every contract starts from the same level. Each indicator then moves the score up or
            down, by the number of points shown.
          </p>
          <ContributionChart
            indicators={contract.indicators}
            baseValue={run?.baseValue ?? null}
            score={contract.score}
          />
        </section>

        <section>
          <h3>Contract</h3>
          <dl className="facts">
            <Fact label="Procuring entity">
              {contract.entity}
              {contract.entityType && <span className="fact-sub">{contract.entityType}</span>}
              {place && <span className="fact-sub">{place}</span>}
            </Fact>
            <Fact label="Awardee">
              {contract.awardee}
              {(contract.awardeeSize || contract.awardeeRegion) && (
                <span className="fact-sub">
                  {[
                    contract.awardeeSize && `${contract.awardeeSize} enterprise`,
                    contract.awardeeRegion,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </Fact>
            <Fact label="Approved budget">{formatPeso(contract.budget)}</Fact>
            <Fact label="Contract amount">
              {formatPeso(contract.amount)}
              {ofBudget !== null && (
                <span className="fact-sub">
                  {formatPercent(ofBudget, 1)} of the approved budget
                </span>
              )}
            </Fact>
            <Fact label="Procurement mode">{contract.procurementMode ?? 'Not published'}</Fact>
            <Fact label="Document requests">
              {contract.documentRequests === null
                ? 'Not available'
                : plural(contract.documentRequests, 'supplier')}
              <span className="fact-sub">Suppliers who requested the bidding documents</span>
            </Fact>
          </dl>
        </section>

        <section>
          <h3>Timeline</h3>
          <Timeline
            steps={[
              { label: 'Notice published', date: contract.publishedDate },
              { label: 'Bidding closed', date: contract.closingDate },
              { label: 'Contract awarded', date: contract.awardDate },
              { label: 'Notice to proceed', date: contract.noticeToProceedDate },
            ]}
          />
        </section>

        <aside className="caution">
          <Icon name="info" />
          <p>
            <strong>Before relying on this.</strong> The score reflects patterns in published data,
            which can be incomplete or entered incorrectly. Check the figures above against the
            source records. An unusual pattern can have an ordinary explanation.
          </p>
        </aside>
      </div>

      {hasNoticePage && (
        <div className="panel-foot">
          <a
            className="button"
            href={`${NOTICE_URL}${contract.bidReference}`}
            target="_blank"
            rel="noreferrer"
          >
            Open the bid notice on PhilGEPS <Icon name="external" size={14} />
          </a>
        </div>
      )}
    </>
  );
}

/** A side panel over the queue that explains one contract's score. */
export function ContractPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const contract = useApi<ContractDetail>(`/api/contracts/${id}`);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => navigate({ pathname: '/', search });

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate({ pathname: '/', search });
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('has-panel');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-panel');
    };
  }, [navigate, search]);

  return (
    <div className="panel-layer">
      <div className="scrim" onClick={close} />
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <div className="panel-head">
          <span>Contract detail</span>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            ref={closeButton}
            aria-label="Close contract detail"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {contract.error ? (
          <div className="panel-body state">
            <h2 id="panel-title">This contract could not be loaded</h2>
            <p>It may not be part of the latest screening run.</p>
            <button type="button" className="button" onClick={contract.reload}>
              Try again
            </button>
          </div>
        ) : !contract.data || contract.loading ? (
          <div className="panel-body">
            <h2 id="panel-title" className="visually-hidden">
              Loading contract
            </h2>
            <div className="skeleton skeleton-block" aria-busy="true" />
          </div>
        ) : (
          <Detail contract={contract.data} />
        )}
      </aside>
    </div>
  );
}
