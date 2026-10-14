import { Icon } from '../components/Icon';
import { INDICATOR_ORDER, INDICATORS } from '../indicators';

export function MethodPage() {
  return (
    <article className="prose">
      <header>
        <p className="eyebrow">Method and limits</p>
        <h1>What a flag means, and what it does not</h1>
        <p className="lede">
          ProcureGuard screens published records of public infrastructure contracts and ranks them
          by how statistically unusual they are. It exists to help reviewers decide where to look
          first. It does not decide anything.
        </p>
      </header>

      <section className="pair">
        <div className="card">
          <h2>A flag is</h2>
          <ul>
            <li>A sign that a contract differs from the usual pattern in the data.</li>
            <li>A reason to read the source documents for that contract.</li>
            <li>Explained: every score shows which indicators moved it, and by how much.</li>
          </ul>
        </div>
        <div className="card">
          <h2>A flag is not</h2>
          <ul>
            <li>Evidence of corruption, fraud, collusion or any other wrongdoing.</li>
            <li>A statement about any person, official or company.</li>
            <li>A substitute for an audit, an investigation or independent reporting.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>The three indicators</h2>
        <p>
          Each contract is measured on three indicators that the procurement literature and the
          Philippine Competition Commission associate with weaker competition.
        </p>
        <div className="indicator-cards">
          {INDICATOR_ORDER.map((indicator) => (
            <div className="card" key={indicator}>
              <h3>
                <Icon name={indicator} size={18} />
                {INDICATORS[indicator].label}
              </h3>
              <p>{INDICATORS[indicator].measures}</p>
              <p className="limit">
                <strong>Limit.</strong> {INDICATORS[indicator].limit}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>How the score is produced</h2>
        <p>
          No list of confirmed cases of wrongdoing exists for these contracts, so no model here is
          trained to recognise wrongdoing. Two unsupervised models are compared. Isolation Forest
          scores a contract by how easily it can be separated from the rest. The clustering model
          groups ordinary contracts and scores each contract by its distance from the nearest large
          group. Both look only at the three indicators, and both give scores from 0 to 100. The
          share of contracts shown as flagged is fixed in advance, at the highest-scoring 5 percent.
        </p>
        <p>
          The explanation beside each score comes from SHAP values, which split a contract’s score
          into the part contributed by each indicator. Those parts add up to the score exactly, so
          nothing about it is hidden.
        </p>
        <p>
          Prices are compared as a share of the approved budget, against the median for contracts in
          the same region and budget band. Where an indicator cannot be computed for a contract, it
          is shown as not computed and treated as typical.
        </p>
      </section>

      <section>
        <h2>Where the data comes from</h2>
        <p>
          Records come from the PhilGEPS Open Data Portal, limited to contracts classified as civil
          works. Only structured fields are used: procuring entity, approved budget, procurement
          mode, contract amount, dates and awardee. The number of suppliers who requested bidding
          documents is read from each public bid notice page.
        </p>
      </section>

      <section>
        <h2>What the system cannot see</h2>
        <ul>
          <li>How many bids were actually submitted, or who the losing bidders were.</li>
          <li>Who owns or controls a company, or whether separate companies are related.</li>
          <li>Subcontracting, offline communication, or anything in scanned documents.</li>
          <li>Whether a published record is complete, correct, or was posted late.</li>
        </ul>
        <p>
          Because of these limits, a contract with a low score is not cleared, and a contract with a
          high score is not accused. Findings have to be established from source records by the
          people responsible for doing so.
        </p>
      </section>
    </article>
  );
}
