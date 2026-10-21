import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useApi, type DataQuality } from '../api';
import { BarList } from '../components/BarList';
import { Icon } from '../components/Icon';
import { Notice, Tile } from '../components/States';
import { formatCount, formatDate, formatPercent, wholeCount } from '../format';
import { INDICATOR_ORDER, INDICATORS } from '../indicators';

/** Rows left out on the way from published rows to contracts, in the order it happens. */
const EXCLUSIONS: [string, string][] = [
  ['not_civil_works', 'Not civil works (goods, consulting and other classes)'],
  ['malformed_rows', 'Wrong number of columns, so the row could not be read'],
  ['not_awarded', 'Civil works with no award recorded'],
  ['award_cancelled', 'Award was cancelled'],
  ['awarded_before_study_period', 'Award dated before the study period'],
  ['no_procuring_entity', 'No procuring entity named'],
  ['extra_line_item_rows', 'Further line items of an award already counted'],
  ['repeated_in_another_file', 'Award already seen in another file'],
];

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="faq-item">
      <summary>
        {title}
        <Icon name="chevronDown" />
      </summary>
      <div className="faq-answer">{children}</div>
    </details>
  );
}

/** Short answers to what reviewers ask first; the sections below give the detail. */
function Questions() {
  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="about-heading">
        Common questions
      </h2>
      <div className="card faq-list">
        <Question title="Is a flagged contract an accusation?">
          <p>
            No. A flag means a contract is statistically unusual compared with others in the data
            and is worth a closer look. It is not evidence of corruption, fraud, collusion or any
            other wrongdoing, and says nothing about any person or company.
          </p>
        </Question>
        <Question title="Why is the number of bidders not shown?">
          <p>
            PhilGEPS does not publish how many bids a tender received. ProcureGuard uses a proxy
            instead: how many suppliers requested the bidding documents, read from each public bid
            notice. It is labelled as document requests, never as bidders.
          </p>
        </Question>
        <Question title="Why does an indicator say “Not computed”?">
          <p>
            The figure it needs is missing or cannot be trusted for that contract: for example, the
            document request count has not been collected for its notice, or the entity awarded too
            few notices for a share to mean anything. The reason is always stated, and the indicator
            is treated as typical so it neither raises nor lowers the score.
          </p>
        </Question>
        <Question title="Where do the places on the map come from?">
          <p>
            From where the procuring entity is based. PhilGEPS does not publish project sites.
            Highly urbanized cities such as Iloilo City and Cebu City have no shape in the boundary
            files, so they are listed by name beside their province instead.
          </p>
        </Question>
        <Question title="What period does the data cover?">
          <p>
            Civil works notices that PhilGEPS published in 2024, the most recent full year it
            publishes. A notice published late in 2024 can carry an award dated early 2025. The load
            date is at the end of this page.
          </p>
        </Question>
        <Question title="Can I share what I am looking at?">
          <p>
            Yes. Filters, search, sort order and view settings are part of the page address, so a
            copied link opens the same view. “Mark as reviewed” is saved only in your browser.
          </p>
        </Question>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="method" className="prose about-section" aria-labelledby="method-title">
      <h2 id="method-title" className="about-heading">
        How ProcureGuard works
      </h2>

      <div className="pair">
        <div className="card">
          <h3>A flag is</h3>
          <ul>
            <li>A sign that a contract differs from the usual pattern in the data.</li>
            <li>A reason to read the source documents for that contract.</li>
            <li>Explained: every score shows which indicators moved it, and by how much.</li>
          </ul>
        </div>
        <div className="card">
          <h3>A flag is not</h3>
          <ul>
            <li>Evidence of corruption, fraud, collusion or any other wrongdoing.</li>
            <li>A statement about any person, official or company.</li>
            <li>A substitute for an audit, an investigation or independent reporting.</li>
          </ul>
        </div>
      </div>

      <section>
        <h3>The three indicators</h3>
        <p>
          Each contract is measured on three indicators that the procurement literature and the
          Philippine Competition Commission associate with weaker competition.
        </p>
        <div className="indicator-cards">
          {INDICATOR_ORDER.map((indicator) => (
            <div className="card" key={indicator}>
              <h4>
                <Icon name={indicator} size={18} />
                {INDICATORS[indicator].label}
              </h4>
              <p>{INDICATORS[indicator].measures}</p>
              <p className="limit">
                <strong>Limit.</strong> {INDICATORS[indicator].limit}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>How the score is produced</h3>
        <p>
          No list of confirmed cases of wrongdoing exists for these contracts, so no model here is
          trained to recognise wrongdoing. The score comes from an Isolation Forest, an unsupervised
          model that rates a contract by how easily it can be separated from the rest on the three
          indicators. Scores run from 0 to 100, and the highest-scoring 5 percent are flagged. A
          second, clustering-based model is scored alongside it so the study can compare the two;
          its runs can be chosen in the run picker at the top of the page.
        </p>
        <p>
          The explanation beside each score comes from SHAP values, which split a contract’s score
          into the part contributed by each indicator. Those parts add up to the score exactly, so
          nothing about it is hidden.
        </p>
        <p>
          A price is compared as a share of its budget: a bid notice’s awarded total against its
          approved budget, or against the budget of the line items awarded when only some were. That
          share is set against the median for contracts in the same region and budget band. Awards
          cannot exceed the approved budget, so only a price above that median raises a score. A
          notice with more than one award for the same line item, or an amount under 20 percent of
          its budget (most likely an entry error), is not compared on price.
        </p>
        <p>
          A repeated winner is counted by bid notice, so a notice awarded in several lots counts as
          one win. Where an indicator cannot be computed for a contract, it is shown as not computed
          and treated as typical.
        </p>
      </section>

      <section>
        <h3>Where the data comes from</h3>
        <p>
          Records come from the PhilGEPS Open Data Portal for 2024, limited to contracts classified
          as civil works. Only structured fields are used: procuring entity, approved budget,
          procurement mode, contract amount, dates and awardee. The number of suppliers who
          requested bidding documents is read from each public bid notice page; it has been
          collected for only part of the notices so far (see below), and where it is missing that
          indicator is not computed.
        </p>
      </section>

      <section>
        <h3>What the system cannot see</h3>
        <ul>
          <li>How many bids were actually submitted, or who the losing bidders were.</li>
          <li>Who owns or controls a company, or whether separate companies are related.</li>
          <li>Where a project is built; the map shows where the procuring entity is based.</li>
          <li>Subcontracting, offline communication, or anything in scanned documents.</li>
          <li>Whether a published record is complete, correct, or was posted late.</li>
        </ul>
        <p>
          Because of these limits, a contract with a low score is not cleared, and a contract with a
          high score is not accused. Findings have to be established from source records by the
          people responsible for doing so.
        </p>
      </section>
    </section>
  );
}

/** What the published data contained, what was left out, and what is missing. */
function AboutTheData() {
  const quality = useApi<DataQuality>('/api/data-quality');

  const heading = (
    <header className="about-section-head">
      <h2 id="data-title" className="about-heading">
        About the data
      </h2>
      <p className="lede">
        Every score depends on records that procuring entities publish themselves. This section
        shows how many rows were read, which were left out and why, and how complete the remaining
        fields are. Nothing missing is filled in.
      </p>
    </header>
  );

  let body: ReactNode;
  if (quality.error) {
    body = (
      <div className="card">
        <Notice
          title="The data quality figures could not be loaded"
          icon="info"
          action={{ label: 'Try again', onClick: quality.reload }}
        />
      </div>
    );
  } else if (!quality.data) {
    body = <div className="card skeleton skeleton-block" aria-busy="true" />;
  } else if (!quality.data.contracts) {
    body = (
      <div className="card">
        <Notice title="No contracts have been loaded yet">
          Download the PhilGEPS files and run the loading step.
        </Notice>
      </div>
    );
  } else {
    const data = quality.data;
    const intake = data.load?.intake ?? {};
    const rowsRead = intake.rows_read ?? 0;
    const requests = data.documentRequests;
    const collectedShare = requests.wanted ? requests.collected / requests.wanted : 0;
    // A small share rounds to "0%", which reads as "none collected"; keep a decimal.
    const shareFormat = (value: number) => formatPercent(value, collectedShare < 0.1 ? 1 : 0);
    const unreadable = Object.entries(intake).filter(([key]) => key.startsWith('unreadable'));
    const fields = [...data.fields].sort((first, second) => first.present - second.present);
    const names = [
      ['Procuring entities', intake.entity_names_published, intake.entity_names_standardized],
      ['Awardees', intake.awardee_names_published, intake.awardee_names_standardized],
    ] as const;
    body = (
      <>
        <dl className="tiles tiles-4">
          <Tile
            label="Contracts available for scoring"
            value={formatCount(data.contracts)}
            count={{ to: data.contracts, format: wholeCount }}
            note={rowsRead ? `from ${formatCount(rowsRead)} published rows` : undefined}
          />
          <Tile
            label="Notices published"
            value={data.firstPublished ? formatDate(data.firstPublished) : 'Not published'}
            note={data.lastPublished ? `to ${formatDate(data.lastPublished)}` : undefined}
          />
          <Tile
            label="Document request counts collected"
            value={shareFormat(collectedShare)}
            count={{ to: collectedShare, format: shareFormat }}
            note={`${formatCount(requests.collected)} of ${formatCount(requests.wanted)} public bidding contracts`}
            share={collectedShare}
          />
          <Tile
            label="Procured through public bidding"
            value={formatPercent(data.publicBidding / data.contracts)}
            count={{ to: data.publicBidding / data.contracts, format: formatPercent }}
            note={`${formatCount(data.publicBidding)} contracts`}
            share={data.publicBidding / data.contracts}
          />
        </dl>

        <div className="quality-grid">
          <div className="card">
            <h3>From published rows to contracts</h3>
            <p className="card-note">
              A published row is one line item, so a contract usually spans several rows. Only
              awarded civil works contracts are kept.
            </p>
            {rowsRead ? (
              <>
                <BarList
                  max={rowsRead}
                  items={[
                    {
                      key: 'read',
                      label: 'Rows read',
                      value: rowsRead,
                      display: formatCount(rowsRead),
                    },
                    {
                      key: 'civil',
                      label: 'Civil works rows',
                      value: intake.civil_works_rows ?? 0,
                      display: formatCount(intake.civil_works_rows ?? 0),
                    },
                    {
                      key: 'contracts',
                      label: 'Contracts kept',
                      value: intake.contracts ?? data.contracts,
                      display: formatCount(intake.contracts ?? data.contracts),
                    },
                  ]}
                />
                <h4 className="subhead">Rows left out</h4>
                <table className="plain-table">
                  <tbody>
                    {EXCLUSIONS.filter(([key]) => intake[key]).map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row">{label}</th>
                        <td>{formatCount(intake[key]!)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <Notice title="No load report is stored" />
            )}
          </div>

          <div className="card">
            <h3>How complete each field is</h3>
            <p className="card-note">
              Share of contracts where the field is published, least complete first. An indicator
              that needs a missing field is not computed for that contract.
            </p>
            <BarList
              max={data.contracts}
              items={fields.map((field) => ({
                key: field.field,
                label: field.label,
                value: field.present,
                display: formatPercent(field.present / data.contracts, 1),
                note: `${formatCount(data.contracts - field.present)} missing · needed for ${field.usedFor.toLowerCase()}`,
              }))}
            />
          </div>
        </div>

        <div className="quality-grid">
          <div className="card">
            <h3>Names written more than one way</h3>
            <p className="card-note">
              The same organization is often published under several spellings. Names are
              standardized so its contracts are counted together; the published spelling is kept.
            </p>
            <table className="plain-table">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Spellings published</th>
                  <th scope="col">After standardizing</th>
                </tr>
              </thead>
              <tbody>
                {names.map(([label, published, standardized]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{published === undefined ? 'n/a' : formatCount(published)}</td>
                    <td>{standardized === undefined ? 'n/a' : formatCount(standardized)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Values that cannot be right</h3>
            <p className="card-note">
              These are kept as published and counted here. They point to entry errors a reviewer
              should expect to meet.
            </p>
            <table className="plain-table">
              <tbody>
                <tr>
                  <th scope="row">Contracts awarded before the notice was published</th>
                  <td>{formatCount(data.awardedBeforePublished)}</td>
                </tr>
                <tr>
                  <th scope="row">Contract amount above the approved budget</th>
                  <td>{formatCount(data.amountAboveBudget)}</td>
                </tr>
                {unreadable.map(([key, count]) => (
                  <tr key={key}>
                    <th scope="row">Unreadable value in “{key.split(': ')[1]}”</th>
                    <td>{formatCount(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.load && (
          <p className="page-foot">
            Loaded {formatDate(data.load.loadedAt)} from {data.load.sourceFiles.join(', ')}.
          </p>
        )}
      </>
    );
  }

  return (
    <section id="data" className="about-section about-data" aria-labelledby="data-title">
      {heading}
      {body}
    </section>
  );
}

/**
 * What ProcureGuard is, how it scores contracts, and what the data contains, on one
 * page: common questions first, then the method, then the data quality figures.
 */
export function AboutPage() {
  const { hash } = useLocation();

  // Old /method and /data links arrive with a section in the hash. The layout scrolls a
  // new page to the top first, so this waits a frame before scrolling to the section.
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <article className="about">
      <header className="page-header">
        <p className="eyebrow">About</p>
        <h1>What a flag means, and what it does not</h1>
        <p className="lede">
          ProcureGuard screens published records of public infrastructure contracts and ranks them
          by how statistically unusual they are. It exists to help reviewers decide where to look
          first. It does not decide anything.
        </p>
        <nav className="about-jump" aria-label="On this page">
          <a href="#faq-title">Common questions</a>
          <a href="#method">How it works</a>
          <a href="#data">About the data</a>
        </nav>
      </header>
      <Questions />
      <HowItWorks />
      <AboutTheData />
    </article>
  );
}
