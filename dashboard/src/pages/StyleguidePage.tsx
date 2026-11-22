import { useState, type ReactNode } from 'react';
import { Art } from '../components/Art';
import { Icon, type IconName } from '../components/Icon';
import { ScoreDial } from '../components/ScoreDial';
import { Notice, SkeletonCard, SkeletonRows, Tile } from '../components/States';
import { Term } from '../components/Term';
import { useToast } from '../components/Toast';

const SWATCHES: [string, string, string][] = [
  ['--paper', 'Paper', 'Page background'],
  ['--surface', 'Surface', 'Cards, panels, inputs'],
  ['--surface-2', 'Well', 'Table heads, tracks, inactive tabs'],
  ['--ink', 'Ink', 'Text, outlines, data marks'],
  ['--ink-2', 'Ink 2', 'Secondary text'],
  ['--accent', 'Accent', 'The action to take, selection, focus'],
  ['--accent-soft', 'Accent soft', 'Selected and open states'],
  ['--raises', 'Raises', 'An indicator raised a score (explanations only)'],
  ['--lowers', 'Lowers', 'An indicator lowered a score (explanations only)'],
  ['--note-bg', 'Note', 'Demonstration data, cautions'],
];

const ICONS: IconName[] = [
  'search',
  'flag',
  'info',
  'download',
  'columns',
  'bookmark',
  'link',
  'print',
  'external',
  'check',
  'close',
  'arrowRight',
  'single_requester',
  'repeated_winner',
  'price_deviation',
  'contract_splitting',
];

function Specimen({ title, rule, children }: { title: string; rule: string; children: ReactNode }) {
  return (
    <section className="specimen">
      <div className="specimen-head">
        <h2>{title}</h2>
        <p>{rule}</p>
      </div>
      <div className="specimen-body">{children}</div>
    </section>
  );
}

/**
 * Every building block of the dashboard on one page, with the rule for using it.
 * Not linked from the navigation; for the team keeping new screens consistent.
 */
export function StyleguidePage() {
  const toast = useToast();
  const [segment, setSegment] = useState('a');
  return (
    <article className="styleguide">
      <header className="page-header">
        <p className="eyebrow">For the team</p>
        <h1>ProcureGuard design system</h1>
        <p className="lede">
          The parts every screen is built from, and when to use each. Tokens live in
          src/styles/tokens.css; change a value there, never in a component.
        </p>
      </header>

      <Specimen
        title="Colour"
        rule="Ink on paper. Cyan only for the action, the selection and focus. Red and blue only in score explanations."
      >
        <ul className="swatches">
          {SWATCHES.map(([token, name, use]) => (
            <li key={token}>
              <span className="swatch-chip" style={{ background: `var(${token})` }} />
              <strong>{name}</strong>
              <code>{token}</code>
              <span>{use}</span>
            </li>
          ))}
        </ul>
      </Specimen>

      <Specimen
        title="Type"
        rule="Space Grotesk for headings and figures, Inter for text, mono only for keys and code. Nothing lighter than regular, nothing italic."
      >
        <div className="type-scale">
          <p className="type-hero">4,511</p>
          <h1>Page title</h1>
          <h2>Section heading</h2>
          <h3>Card heading</h3>
          <p>Body text at 15px, for sentences people read.</p>
          <p className="card-note">Notes and secondary text at 13px.</p>
        </div>
      </Specimen>

      <Specimen
        title="Buttons"
        rule="One primary button per view, for the action most people take next. Labels say what happens: a verb and an object."
      >
        <div className="specimen-row">
          <button type="button" className="button button-primary button-lg">
            Start reviewing <Icon name="arrowRight" size={20} />
          </button>
          <button type="button" className="button button-primary">
            Save review
          </button>
          <button type="button" className="button">
            <Icon name="download" /> Export CSV
          </button>
          <button type="button" className="button button-quiet">
            Clear filters
          </button>
          <button type="button" className="button button-primary" disabled>
            <span className="spinner" aria-hidden="true" /> Saving
          </button>
          <button type="button" className="icon-button" aria-label="Copy link">
            <Icon name="link" size={18} />
          </button>
        </div>
      </Specimen>

      <Specimen
        title="Choices"
        rule="Segmented control for two or three views of the same list; switch for a setting that applies at once; chips for active filters."
      >
        <div className="specimen-row">
          <div className="segmented" role="group" aria-label="Example">
            <button type="button" aria-pressed={segment === 'a'} onClick={() => setSegment('a')}>
              Flagged only
            </button>
            <button type="button" aria-pressed={segment === 'b'} onClick={() => setSegment('b')}>
              All contracts
            </button>
          </div>
          <label className="switch">
            <input type="checkbox" role="switch" defaultChecked />
            <span className="switch-track" aria-hidden="true" />
            <span>Group by notice</span>
          </label>
          <span className="chip">Region V</span>
          <span className="badge-new">New</span>
          <span className="status is-flagged">
            <Icon name="flag" size={14} /> Flagged for review
          </span>
        </div>
      </Specimen>

      <Specimen
        title="Fields"
        rule="Every field has a visible or screen-reader label. Placeholders give an example, never the label."
      >
        <div className="specimen-row">
          <label className="field field-search">
            <span className="visually-hidden">Search</span>
            <Icon name="search" />
            <input type="search" placeholder="Search project, place or name" />
          </label>
          <label className="field">
            <span className="visually-hidden">Region</span>
            <select defaultValue="">
              <option value="">All regions</option>
            </select>
          </label>
        </div>
      </Specimen>

      <Specimen
        title="Figures"
        rule="A number always comes with what it counts and what it is out of. Scores always come with their reasons."
      >
        <dl className="tiles">
          <Tile
            label="Value of flagged contracts"
            value="₱116.4B"
            note="of ₱1.6T screened"
            share={0.07}
          />
          <Tile label="Score needed to be flagged" value="62" note="out of 100" share={0.62} />
          <div className="card tile">
            <ScoreDial score={0.8} threshold={0.62} />
          </div>
        </dl>
      </Specimen>

      <Specimen
        title="Explaining a term"
        rule="Any word a newcomer might not know gets a tip, written in plain language."
      >
        <p>
          Each contract shows its <Term term="documentRequests">document requests</Term> and its{' '}
          <Term term="score">score</Term>.
        </p>
      </Specimen>

      <Specimen
        title="Feedback"
        rule="Confirm any action whose result is out of view with a toast. Loading shows skeletons shaped like the content."
      >
        <div className="specimen-row">
          <button type="button" className="button" onClick={() => toast('Link copied')}>
            Show a toast
          </button>
        </div>
        <div className="specimen-grid">
          <SkeletonCard lines={3} />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <SkeletonRows rows={2} />
          </div>
        </div>
      </Specimen>

      <Specimen
        title="Empty and error states"
        rule="Say what happened, then offer the most likely next step as a button."
      >
        <div className="specimen-grid">
          <div className="card">
            <Notice
              title="No contracts match"
              art="search"
              action={{ label: 'Clear filters', onClick: () => {} }}
            >
              Try fewer filters or a shorter search.
            </Notice>
          </div>
          <div className="card art-row">
            <Art name="folder" />
            <Art name="unplugged" />
            <Art name="checklist" />
          </div>
        </div>
      </Specimen>

      <Specimen
        title="Icons"
        rule="One outline set at a 2px stroke, always beside a label unless the button has an accessible name."
      >
        <ul className="icon-grid">
          {ICONS.map((name) => (
            <li key={name}>
              <Icon name={name} size={22} />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </Specimen>
    </article>
  );
}
