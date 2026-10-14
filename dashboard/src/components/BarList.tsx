import type { CSSProperties, ReactNode } from 'react';

export interface BarItem {
  key: string;
  label: ReactNode;
  /** Sets the bar length, as a share of `max`. */
  value: number;
  /** Text at the end of the row, e.g. "12" or "98.4%". */
  display: string;
  note?: string;
  muted?: boolean;
}

interface Props {
  items: BarItem[];
  /** The value a full-width bar stands for. Defaults to the largest item. */
  max?: number;
  selected?: string;
  onSelect?: (key: string) => void;
}

/** Horizontal bars sharing one scale, each with its label and value written out. */
export function BarList({ items, max, selected, onSelect }: Props) {
  const scale = max ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="bar-list">
      {items.map((item, index) => {
        const body = (
          <>
            <span className="bar-list-label">{item.label}</span>
            <span className="bar-list-track">
              <span
                className={`bar-list-fill ${item.muted ? 'is-muted' : ''}`}
                style={{ width: `${Math.min(100, (item.value / scale) * 100)}%` }}
              />
            </span>
            <span className="bar-list-value">{item.display}</span>
            {item.note && <span className="bar-list-note">{item.note}</span>}
          </>
        );
        return (
          <li key={item.key} style={{ '--i': index } as CSSProperties}>
            {onSelect ? (
              <button
                type="button"
                className={`bar-list-row is-button ${selected === item.key ? 'is-selected' : ''}`}
                aria-pressed={selected === item.key}
                onClick={() => onSelect(item.key)}
              >
                {body}
              </button>
            ) : (
              <div className="bar-list-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
