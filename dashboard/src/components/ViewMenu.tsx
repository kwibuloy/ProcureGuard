import { useEffect, useRef, useSyncExternalStore } from 'react';
import { COLUMN_LABELS, COLUMNS, type ViewSettings } from '../view';
import { Icon } from './Icon';

/** Columns that can be hidden; the contract and its score always stay. */
const HIDEABLE = COLUMNS;

/** Columns the layout drops on narrow screens (styles.css), whatever the setting. */
const NARROW_HIDDEN: Record<string, readonly string[]> = {
  '(max-width: 860px)': ['rank', 'entity', 'awardee'],
  '(max-width: 1180px)': ['awardee'],
};

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** The review list's "View" button: which columns show, and row density. */
export function ViewMenu({
  view,
  onChange,
}: {
  view: ViewSettings;
  onChange: (next: ViewSettings) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const phone = useMedia('(max-width: 860px)');
  const tablet = useMedia('(max-width: 1180px)');
  const narrowHidden = new Set(
    phone
      ? NARROW_HIDDEN['(max-width: 860px)']
      : tablet
        ? NARROW_HIDDEN['(max-width: 1180px)']
        : [],
  );

  // Close on a click outside or on Escape, like any other menu.
  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        element.open = false;
        element.querySelector('summary')?.focus();
      } else if (!element.contains(event.target as Node)) {
        element.open = false;
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close, true);
    };
  }, []);

  const toggleColumn = (column: (typeof COLUMNS)[number], shown: boolean) => {
    const hidden = new Set(view.hidden);
    if (shown) hidden.delete(column);
    else hidden.add(column);
    onChange({ ...view, hidden });
  };

  return (
    <details className="menu" ref={menu}>
      <summary className="button button-outline">
        <Icon name="sliders" />
        View
      </summary>
      <div className="menu-panel">
        <fieldset>
          <legend>Columns</legend>
          {HIDEABLE.map((column) => (
            <label key={column} className={`check ${narrowHidden.has(column) ? 'is-off' : ''}`}>
              <input
                type="checkbox"
                checked={!view.hidden.has(column) && !narrowHidden.has(column)}
                disabled={narrowHidden.has(column)}
                onChange={(event) => toggleColumn(column, event.target.checked)}
              />
              {COLUMN_LABELS[column]}
            </label>
          ))}
          <p className="menu-note">
            Contract and score always show.
            {narrowHidden.size > 0 && ' Greyed-out columns do not fit on this screen.'}
          </p>
        </fieldset>
        <fieldset>
          <legend>Rows</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={view.compact}
              onChange={(event) => onChange({ ...view, compact: event.target.checked })}
            />
            Compact rows
          </label>
        </fieldset>
      </div>
    </details>
  );
}
