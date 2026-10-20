import { CountUp } from '../components/CountUp';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { amountFacts } from '../amounts';
import { useApi, withRun, type ContractDetail } from '../api';
import { ContributionChart } from '../components/ContributionChart';
import { Icon } from '../components/Icon';
import { ScoreMeter } from '../components/ScoreMeter';
import { Notice } from '../components/States';
import { Timeline } from '../components/Timeline';
import {
  formatCount,
  formatDate,
  formatPercent,
  formatPeso,
  percentileFromRank,
  plural,
  toPoints,
} from '../format';
import { profileLink } from '../links';
import { useOverview } from '../overview';
import { useReviewed } from '../reviewed';

const NOTICE_URL =
  'https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refID=';

const wholeNumber = (value: number) => String(Math.round(value));

function Fact({ label, children }: { label: string; children: ReactNode }) {
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
  const amounts = amountFacts(contract);
  const place = [contract.cityMunicipality, contract.province, contract.region]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <p className="print-only print-header">
        ProcureGuard contract summary · {run?.modelName} · printed{' '}
        {formatDate(new Date().toISOString())}
      </p>
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
          <span className="score-big">
            <CountUp value={toPoints(contract.score)} format={wholeNumber} />
          </span>
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
          Every contract starts from the same level. Each indicator then moves the score up or down,
          by the number of points shown.
        </p>
        <ContributionChart
          indicators={contract.indicators}
          baseValue={run?.baseValue ?? null}
          score={contract.score}
        />
      </section>

      {contract.otherRuns.length > 0 && (
        <section>
          <h3>How the other model scored it</h3>
          <ul className="other-runs">
            {contract.otherRuns.map((other) => (
              <li key={other.runId}>
                <span className="other-run-name">{other.modelName}</span>
                <span className="other-run-score">{toPoints(other.score)}</span>
                <span className="other-run-note">
                  rank {formatCount(other.rank)}
                  {other.flagged ? ', flagged' : ', not flagged'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Contract</h3>
        <dl className="facts">
          <Fact label="Procuring entity">
            <Link to={profileLink('entity', contract.entity)} className="text-link">
              {contract.entityName}
            </Link>
            {contract.entityType && <span className="fact-sub">{contract.entityType}</span>}
            {place && <span className="fact-sub">{place}</span>}
          </Fact>
          <Fact label="Awardee">
            <Link to={profileLink('awardee', contract.awardee)} className="text-link">
              {contract.awardeeName}
            </Link>
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
          <Fact label={amounts.budgetLabel}>
            {formatPeso(contract.budget)}
            {amounts.budgetNote && <span className="fact-sub">{amounts.budgetNote}</span>}
          </Fact>
          <Fact label={amounts.amountLabel}>
            {formatPeso(contract.amount)}
            {amounts.amountNote && <span className="fact-sub">{amounts.amountNote}</span>}
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
          which can be incomplete or entered incorrectly. Check the figures above against the source
          records. An unusual pattern can have an ordinary explanation.
        </p>
      </aside>
    </>
  );
}

/** A side panel over the queue that explains one contract's score. */
export function ContractPanel() {
  const { id } = useParams();
  const contractId = Number(id);
  const navigate = useNavigate();
  const { search } = useLocation();
  const overview = useOverview();
  const run = overview.data?.run ?? null;
  const contract = useApi<ContractDetail>(run ? withRun(`/api/contracts/${id}`, run.id) : null);
  const { reviewed, toggle } = useReviewed();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  const ids = overview.listIds ?? [];
  const position = ids.indexOf(contractId);
  const go = (offset: number) => {
    const target = ids[position + offset];
    if (target) navigate({ pathname: `/contracts/${target}`, search }, { replace: true });
  };
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the address bar still holds the link.
    }
  };

  const data = contract.data && !contract.loading ? contract.data : null;
  const isReviewed = reviewed.has(contractId);
  // Only real legacy notices have a public page; demonstration references do not.
  const noticeLink =
    data && !run?.isDemo && data.sourceSeries === 'legacy' && /^\d+$/.test(data.bidReference ?? '')
      ? `${NOTICE_URL}${data.bidReference}`
      : null;

  return (
    <div className="panel-layer">
      <div className="scrim" onClick={close} />
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <div className="panel-head">
          <div className="panel-nav">
            <button
              type="button"
              className="icon-button"
              onClick={() => go(-1)}
              disabled={position <= 0}
              aria-label="Previous contract"
              title="Previous contract (K)"
            >
              <Icon name="chevronUp" size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => go(1)}
              disabled={position < 0 || position >= ids.length - 1}
              aria-label="Next contract"
              title="Next contract (J)"
            >
              <Icon name="chevronDown" size={18} />
            </button>
            {position >= 0 && (
              <span>
                {position + 1} of {ids.length} on this page
              </span>
            )}
          </div>
          <div className="panel-tools">
            <button type="button" className="icon-button" onClick={copyLink} title="Copy link">
              <Icon name={copied ? 'check' : 'link'} size={18} />
              <span className="visually-hidden">{copied ? 'Link copied' : 'Copy link'}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => window.print()}
              title="Print a one-page summary"
              aria-label="Print a one-page summary"
            >
              <Icon name="print" size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={close}
              ref={closeButton}
              aria-label="Close contract detail"
              title="Close (Esc)"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="panel-body" key={contractId}>
          {contract.error ? (
            <>
              <h2 id="panel-title" className="visually-hidden">
                Contract not available
              </h2>
              <Notice
                title="This contract could not be loaded"
                icon="info"
                action={{ label: 'Try again', onClick: contract.reload }}
              >
                It may not be part of the scoring run being shown.
              </Notice>
            </>
          ) : !data ? (
            <>
              <h2 id="panel-title" className="visually-hidden">
                Loading contract
              </h2>
              <div className="skeleton skeleton-block" aria-busy="true" />
            </>
          ) : (
            <Detail contract={data} />
          )}
        </div>

        {data && (
          <div className="panel-foot">
            <button
              type="button"
              className={`button ${isReviewed ? 'button-outline' : ''}`}
              onClick={() => toggle(contractId)}
              aria-pressed={isReviewed}
              title="Saved in this browser only"
            >
              <Icon name={isReviewed ? 'check' : 'circle'} />
              {isReviewed ? 'Reviewed' : 'Mark as reviewed'}
            </button>
            {noticeLink && (
              <a
                className="button button-outline"
                href={noticeLink}
                target="_blank"
                rel="noreferrer"
              >
                Bid notice on PhilGEPS <Icon name="external" size={14} />
              </a>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
