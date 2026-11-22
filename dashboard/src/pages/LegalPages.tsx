import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '22 November 2026';

function Legal({
  eyebrow,
  title,
  lede,
  sections,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <article className="legal-page">
      <header className="page-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        <p className="legal-updated">Last updated {UPDATED}</p>
      </header>
      <div className="legal" style={{ marginTop: 40 }}>
        <nav className="card legal-toc" aria-label="On this page">
          <p>On this page</p>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <div className="legal-body">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

export function TermsPage() {
  return (
    <Legal
      eyebrow="Terms of Use"
      title="Terms of Use"
      lede="ProcureGuard is a research prototype that screens published procurement records. These terms explain what it is for and how to use what it shows."
      sections={[
        {
          id: 'what-it-is',
          title: 'What ProcureGuard is',
          body: (
            <p>
              ProcureGuard is a capstone research prototype. It reads public infrastructure contract
              records published on the PhilGEPS Open Data Portal, measures each contract on four
              indicators, and ranks contracts by how statistically unusual they are. It exists to
              help reviewers decide where to look first. It does not decide anything.
            </p>
          ),
        },
        {
          id: 'flags',
          title: 'A flag is not an accusation',
          body: (
            <>
              <p>
                A flagged contract is statistically unusual compared with others in the data and
                warrants human review. A flag is not evidence of corruption, fraud, collusion, bid
                rigging or any other wrongdoing, and it says nothing about any person, official or
                company.
              </p>
              <p>By using ProcureGuard you agree that you will not:</p>
              <ul>
                <li>
                  Present a flag, score or ranking as a finding, an accusation or proof of
                  wrongdoing.
                </li>
                <li>
                  Publish or share a flag about a named organization or person without the note that
                  a flag is not evidence of wrongdoing.
                </li>
                <li>
                  Use ProcureGuard to harass, threaten or target any official, supplier or other
                  person.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'data',
          title: 'Where the data comes from',
          body: (
            <p>
              Contract records come from the PhilGEPS Open Data Portal and the public bid notice
              pages. They are published by procuring entities themselves and can be incomplete, late
              or entered incorrectly. ProcureGuard shows them as published and does not correct
              them. Check any figure against the source records before relying on it.
            </p>
          ),
        },
        {
          id: 'no-warranty',
          title: 'No warranty',
          body: (
            <p>
              ProcureGuard is provided as it is, for research and review. Scores depend on the data
              and on modelling choices described on the{' '}
              <Link to="/about#method" className="text-link">
                About page
              </Link>
              . We make no promise that it is complete, correct or available at any given time, and
              we are not responsible for decisions made using it.
            </p>
          ),
        },
        {
          id: 'accounts',
          title: 'Review team accounts',
          body: (
            <p>
              Viewing never needs an account. Accounts are given only to members of the review team,
              to record review outcomes and notes. Keep your password private, describe records and
              not people in notes, and add a reply from an organization only after confirming it
              came from that organization. Sign-in is rate-limited and locks for a while after
              repeated failed attempts.
            </p>
          ),
        },
        {
          id: 'fair-use',
          title: 'Fair use of the service',
          body: (
            <p>
              Do not try to overload the service, get around its rate limits, or reach parts of it
              you were not given access to. Exports are capped in size; narrow the filters to export
              more. Automated requests that degrade the service for others may be blocked.
            </p>
          ),
        },
        {
          id: 'responses',
          title: 'Responding to a flag',
          body: (
            <p>
              A procuring entity or supplier can send records or context about a flagged contract
              using “Respond to this flag” on the contract’s page. A reply is shown only after the
              team has confirmed it came from the organization.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to these terms',
          body: (
            <p>
              These terms may change as the prototype develops. The date at the top shows the latest
              version. See also the{' '}
              <Link to="/privacy" className="text-link">
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}

export function PrivacyPage() {
  return (
    <Legal
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      lede="ProcureGuard collects as little as it can. Visitors are not tracked, and viewing never needs an account."
      sections={[
        {
          id: 'summary',
          title: 'In short',
          body: (
            <ul>
              <li>No analytics, advertising or tracking scripts run on this site.</li>
              <li>Viewing contracts, scores and reviews needs no account.</li>
              <li>
                Your display settings stay in your own browser and are never sent to the server.
              </li>
              <li>Review team members have an account, used only to record reviews.</li>
            </ul>
          ),
        },
        {
          id: 'public-data',
          title: 'Names in the procurement data',
          body: (
            <p>
              The contract records shown, including the names of procuring entities and suppliers,
              are public records published on the PhilGEPS Open Data Portal. ProcureGuard shows them
              as published, to support review of public spending. A flag is a statistical prompt to
              review, not a statement about any person or organization.
            </p>
          ),
        },
        {
          id: 'browser',
          title: 'What is stored in your browser',
          body: (
            <>
              <p>ProcureGuard stores three things in your browser, and nothing else:</p>
              <ul>
                <li>Your light or dark theme choice (local storage).</li>
                <li>
                  Your list display settings: hidden columns, compact rows, grouping by notice
                  (local storage).
                </li>
                <li>The scoring run you picked, until you close the tab (session storage).</li>
              </ul>
              <p>Clearing your browser’s site data removes all three. None of it identifies you.</p>
            </>
          ),
        },
        {
          id: 'accounts',
          title: 'Review team accounts',
          body: (
            <p>
              A signed-in reviewer gets one session cookie. It is HttpOnly, sent only to this site,
              and expires after 12 hours or on sign-out. The server keeps each reviewer’s username,
              display name and a hashed password, and records the reviewer’s name and date with
              every review they write. Reviews and notes are public on purpose, so the review
              history stays visible.
            </p>
          ),
        },
        {
          id: 'server',
          title: 'What the server sees',
          body: (
            <p>
              Like any website, the server receives your IP address with each request. ProcureGuard
              uses it only to limit how often one address can sign in or write, and keeps those
              counts in memory for a few minutes. The hosting provider may keep standard access logs
              for operating and securing the service.
            </p>
          ),
        },
        {
          id: 'email',
          title: 'Emails you send us',
          body: (
            <p>
              “Respond to this flag” opens your own email app. What you send, and your email
              address, reach the team by email; they are used only to consider your response. A
              summary is published on the contract’s page only after the team has confirmed the
              reply came from the organization.
            </p>
          ),
        },
        {
          id: 'rights',
          title: 'Your rights',
          body: (
            <p>
              ProcureGuard aims to handle personal information in line with the Philippine Data
              Privacy Act of 2012 (Republic Act No. 10173). To ask about, correct or remove personal
              information held about you, contact the ProcureGuard team through the address given
              with “Respond to this flag”.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to this policy',
          body: (
            <p>
              This policy may change as the prototype develops. The date at the top shows the latest
              version. See also the{' '}
              <Link to="/terms" className="text-link">
                Terms of Use
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
