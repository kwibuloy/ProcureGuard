import type { ReactNode } from 'react';
import { Art, type ArtName } from './Art';
import { CountUp } from './CountUp';
import { Icon, type IconName } from './Icon';

/** A message in place of content: nothing to show, or something went wrong. */
export function Notice(props: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  /** A drawing instead of the icon, for the larger empty states. */
  art?: ArtName;
  action?: { label: string; onClick: () => void };
  /** A second, quieter way forward. */
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="state">
      {props.art ? (
        <Art name={props.art} />
      ) : (
        <span className="state-icon">
          <Icon name={props.icon ?? 'empty'} size={22} />
        </span>
      )}
      <h2>{props.title}</h2>
      {props.children && <p>{props.children}</p>}
      {(props.action || props.secondary) && (
        <div className="state-actions">
          {props.action && (
            <button type="button" className="button button-primary" onClick={props.action.onClick}>
              {props.action.label}
            </button>
          )}
          {props.secondary && (
            <button type="button" className="button" onClick={props.secondary.onClick}>
              {props.secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Placeholder rows shaped like the contract list, so the page does not jump. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-busy="true" aria-label="Loading contracts">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-line" />
          <span className="skeleton-stack">
            <span
              className="skeleton skeleton-line"
              style={{ width: `${88 - (index % 3) * 14}%` }}
            />
            <span className="skeleton skeleton-line" style={{ width: '46%', height: 9 }} />
          </span>
          <span className="skeleton skeleton-line" style={{ width: '70%' }} />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line" style={{ height: 28, borderRadius: 8 }} />
          <span className="skeleton-stack">
            <span className="skeleton skeleton-line" style={{ width: '60%' }} />
            <span className="skeleton skeleton-line" style={{ width: '90%', height: 9 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A card-sized placeholder: a title, a few lines, and an optional block for a chart. */
export function SkeletonCard({ lines = 3, block = false }: { lines?: number; block?: boolean }) {
  return (
    <div className="card skeleton-stack" aria-busy="true" aria-label="Loading">
      <span className="skeleton skeleton-line is-title" style={{ width: '45%' }} />
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="skeleton skeleton-line"
          style={{ width: `${92 - index * 17}%` }}
        />
      ))}
      {block && <span className="skeleton skeleton-block" />}
    </div>
  );
}

/** The Contracts page while its figures load: the hero, then the list. */
export function SkeletonQueuePage() {
  return (
    <>
      <div className="wide-only-block">
        <div className="hero" aria-busy="true" aria-label="Loading the summary">
          <div className="card hero-main skeleton-stack">
            <span className="skeleton skeleton-line is-figure" />
            <span className="skeleton skeleton-line is-title" style={{ width: '70%' }} />
            <span className="skeleton skeleton-line" style={{ width: '80%' }} />
            <span className="skeleton skeleton-line" style={{ width: '64%' }} />
            <span className="skeleton" style={{ width: 240, height: 54, borderRadius: 12 }} />
          </div>
          <div className="hero-stats">
            {[0, 1, 2].map((index) => (
              <div key={index} className="card tile skeleton-stack">
                <span className="skeleton skeleton-line" style={{ width: '60%' }} />
                <span className="skeleton skeleton-line is-title" style={{ width: '40%' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card queue" aria-busy="true" aria-label="Loading contracts">
        <div className="queue-head skeleton-stack" style={{ width: '100%' }}>
          <span className="skeleton skeleton-line is-title" style={{ width: 260 }} />
          <span className="skeleton skeleton-line" style={{ width: 180 }} />
        </div>
        <SkeletonRows rows={8} />
      </div>
    </>
  );
}

/** The contract panel while a contract loads. */
export function SkeletonPanel() {
  return (
    <div className="panel-skeleton" aria-busy="true" aria-label="Loading contract">
      <span className="skeleton skeleton-line" style={{ width: '30%' }} />
      <span className="skeleton skeleton-line is-title" style={{ width: '92%' }} />
      <span className="skeleton skeleton-line is-title" style={{ width: '64%' }} />
      <span className="skeleton skeleton-line" style={{ width: '50%' }} />
      <span className="skeleton skeleton-score" />
      <span className="skeleton skeleton-line is-title" style={{ width: '48%', marginTop: 24 }} />
      <div className="skeleton-bars">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="skeleton-stack">
            <span className="skeleton skeleton-line" style={{ width: '40%' }} />
            <span className="skeleton skeleton-line" style={{ height: 16 }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Title block at the top of a page. */
export function PageHeader(props: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <p className="eyebrow">{props.eyebrow}</p>
      <h1>{props.title}</h1>
      {props.children && <p className="lede">{props.children}</p>}
    </header>
  );
}

/** A headline number with a label, a note, and optionally its share of a whole. */
export function Tile(props: {
  label: string;
  value: string;
  /** Give the number and how to write it, and the figure counts up to it. */
  count?: { to: number; format: (value: number) => string };
  note?: string;
  share?: number;
}) {
  return (
    <div className="card tile">
      <dt>{props.label}</dt>
      <dd>
        {props.count ? <CountUp value={props.count.to} format={props.count.format} /> : props.value}
      </dd>
      {props.note && <p>{props.note}</p>}
      {props.share !== undefined && (
        <span className="tile-share" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, props.share * 100))}%` }} />
        </span>
      )}
    </div>
  );
}
