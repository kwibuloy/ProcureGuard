import { CountUp } from '../components/CountUp';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { amountFacts } from '../amounts';
import { useApi, withRun, type ContractDetail } from '../api';
import { ContributionChart } from '../components/ContributionChart';
import { PricePeers } from '../components/PricePeers';
import { ReviewSection } from '../components/ReviewSection';
import { Icon } from '../components/Icon';
import { ScoreDial } from '../components/ScoreDial';
import { ScoreBuild } from '../components/ScoreBuild';
import { CaseTabs } from '../components/CaseTabs';
import { Term } from '../components/Term';
import { pick, unpick, usePicked } from '../compare';
import { Notice, SkeletonPanel } from '../components/States';
import { useToast } from '../components/Toast';
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

const NOTICE_URL =
  'https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refID=';

const wholeNumber = (value: number) => String(Math.round(value));

/** Where replies to a flag go. Set VITE_RESPONSE_EMAIL when building the dashboard. */
const RESPONSE_EMAIL = (import.meta.env.VITE_RESPONSE_EMAIL as string | undefined)?.trim() ?? '';

export function responseLink(contract: { awardReference: string; title: string }, page: string) {
  if (!RESPONSE_EMAIL) return null;
  const subject = `Response to ProcureGuard flag: award ${contract.awardReference}`;
  const body = [
    `Contract: ${contract.title}`,
    `Award reference: ${contract.awardReference}`,
    `Page: ${page}`,
    '',
    'Organization:',
    'Your name and position:',
    'Your response (records or context that explain the pattern):',
  ].join('\n');
  return `mailto:${RESPONSE_EMAIL}?${new URLSearchParams({ subject, body }).toString().replaceAll('+', '%20')}`;
}

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
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
        ProcureGuard contract summary · scoring run {run?.id} ({run?.modelName},{' '}
        {formatDate(run?.createdAt ?? null)}) · printed {formatDate(new Date().toISOString())}
      </p>
      <p className="print-only print-disclaimer">
        A flag means this contract is statistically unusual and warrants human review. It is not
        evidence of corruption, fraud or bid rigging by any person or organization.
      </p>
      <p className="eyebrow">
        Rank {formatCount(contract.rank)} of {formatCount(contract.scoredContracts)}
      </p>
      <h2 id="panel-title">{contract.title}</h2>
      <p className="panel-meta">
        Award {contract.awardReference}
        {contract.bidReference && ` · Bid notice ${contract.bidReference}`}
      </p>

      <section className="score-block" aria-label="Risk score" id="case-score" data-case="Score">
        <div className="score-block-figure">
          <ScoreDial score={contract.score} threshold={threshold} />
          <span className="score-big">
            <CountUp value={toPoints(contract.score)} format={wholeNumber} />
          </span>
          <span className="score-of">
            <Term term="score">out of 100</Term>
          </span>
        </div>
        <div className="score-block-text">
          <span className={`status ${contract.flagged ? 'is-flagged' : ''}`}>
            {contract.flagged && <Icon name="flag" size={14} />}
            {contract.flagged ? 'Flagged for review' : 'Below the flagging score'}
          </span>
          {threshold !== null && (
            <p className="score-cutoff">
              <Term term="cutoff">Flagged at {toPoints(threshold)}</Term> and above
            </p>
          )}
          <p>
            {contract.rank === 1
              ? `The most statistically unusual of the ${formatCount(contract.scoredContracts)} contracts screened.`
              : `More statistically unusual than ${formatPercent(Math.min(percentile, 0.999), percentile > 0.99 ? 1 : 0)} of the ${formatCount(contract.scoredContracts)} contracts screened.`}
          </p>
        </div>
      </section>

      <section id="case-reasons" data-case="Reasons">
        <h3>Why it received this score</h3>
        <p className="section-note">
          Every contract starts from the same <Term term="startingLevel">starting level</Term>. Each
          indicator then moves the score up or down by the <Term term="points">points</Term> shown.
        </p>
        {run?.baseValue != null && (
          <ScoreBuild
            indicators={contract.indicators}
            baseValue={run.baseValue}
            score={contract.score}
          />
        )}
        <ContributionChart
          indicators={contract.indicators}
          baseValue={run?.baseValue ?? null}
          score={contract.score}
          fold={2}
        />
      </section>

      <PricePeers contractId={contract.id} runId={run?.id ?? null} />

      <ReviewSection contractId={contract.id} runId={run?.id ?? null} />

      <section id="case-contract" data-case="Contract">
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
          <Fact label="Scored in">
            Run {run?.id ?? '…'}
            <span className="fact-sub">
              {run ? `${run.modelName}, ${formatDate(run.createdAt)}` : ''}
            </span>
          </Fact>
          <Fact label={<Term term="documentRequests">Document requests</Term>}>
            {contract.documentRequests === null
              ? 'Not available'
              : plural(contract.documentRequests, 'supplier')}
            <span className="fact-sub">Suppliers who requested the bidding documents</span>
          </Fact>
        </dl>
      </section>

      <section id="case-timeline" data-case="Timeline">
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
  const closeButton = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const picked = usePicked();
  const [copied, setCopied] = useState(false);
  const toast = useToast();

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
      // Keep Tab inside the panel while it is open, as a dialog should.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = [
          ...panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex="0"]',
          ),
        ].filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
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
      toast('Link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Copying was blocked. Copy the address bar instead.', 'info');
    }
  };

  const data = contract.data && !contract.loading ? contract.data : null;
  const respond = data ? responseLink(data, window.location.href) : null;
  // Only real legacy notices have a public page; demonstration references do not.
  const noticeLink =
    data && !run?.isDemo && data.sourceSeries === 'legacy' && /^\d+$/.test(data.bidReference ?? '')
      ? `${NOTICE_URL}${data.bidReference}`
      : null;

  return (
    <div className="panel-layer">
      <div className="scrim" onClick={close} />
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        ref={panelRef}
      >
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

        <p className="panel-disclaimer">
          <Icon name="info" size={14} />
          Statistically unusual is not wrongdoing. Check the source records.
        </p>

        <div className="panel-body" key={contractId} ref={bodyRef}>
          {data && <CaseTabs body={bodyRef} />}
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
              <SkeletonPanel />
            </>
          ) : (
            <Detail contract={data} />
          )}
        </div>

        {data && (
          <div className="panel-foot">
            {picked.some((item) => item.id === data.id) ? (
              <button type="button" className="button" onClick={() => unpick(data.id)}>
                <Icon name="check" size={16} />
                Added to compare
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => {
                  pick({ id: data.id, title: data.title });
                  toast(
                    picked.length
                      ? 'Added. Open Compare at the bottom of the screen.'
                      : 'Added to compare. Pick one more contract.',
                    'columns',
                  );
                }}
              >
                <Icon name="columns" size={16} />
                Compare
              </button>
            )}
            {respond && (
              <a
                className="button"
                href={respond}
                title="For the procuring entity or the supplier: send records or context that explain this pattern"
              >
                Respond to this flag
              </a>
            )}
            {noticeLink && (
              <a className="button" href={noticeLink} target="_blank" rel="noreferrer">
                Bid notice on PhilGEPS <Icon name="external" size={14} />
              </a>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
