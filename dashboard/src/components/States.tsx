import type { ReactNode } from 'react';
import { CountUp } from './CountUp';
import { Icon, type IconName } from './Icon';

/** A message in place of content: nothing to show, or something went wrong. */
export function Notice(props: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon name={props.icon ?? 'empty'} size={22} />
      </span>
      <h2>{props.title}</h2>
      {props.children && <p>{props.children}</p>}
      {props.action && (
        <button type="button" className="button" onClick={props.action.onClick}>
          {props.action.label}
        </button>
      )}
    </div>
  );
}

/** Placeholder rows shown while a table loads, so the page does not jump. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="skeleton" />
      ))}
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
