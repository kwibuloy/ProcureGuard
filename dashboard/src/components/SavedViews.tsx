import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from './Icon';
import { useToast } from './Toast';

const KEY = 'procureguard-saved-views';
const LIMIT = 12;

interface SavedView {
  name: string;
  /** The page address's query string: filters, sort and display settings. */
  search: string;
}

function load(): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

function store(views: SavedView[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // Storage can be unavailable (private windows); saving then lasts only this visit.
  }
}

/** Without the page number and phone tab, which are not part of a view. */
function viewSearch(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete('page');
  next.delete('tab');
  next.sort();
  return next.toString();
}

/** Named sets of filters, saved in this browser, to come back to a worklist in one step. */
export function SavedViews() {
  const [params, setParams] = useSearchParams();
  const [views, setViews] = useState<SavedView[]>(load);
  const [name, setName] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const toast = useToast();
  const current = viewSearch(params);
  const active = views.find((view) => view.search === current);

  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
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

  const save = (event: FormEvent) => {
    event.preventDefault();
    const label = name.trim().slice(0, 40);
    if (!label) return;
    const next = [
      { name: label, search: current },
      ...views.filter((view) => view.name !== label),
    ].slice(0, LIMIT);
    setViews(next);
    store(next);
    setName('');
    toast(`Saved “${label}”`, 'check');
  };

  const remove = (label: string) => {
    const next = views.filter((view) => view.name !== label);
    setViews(next);
    store(next);
  };

  return (
    <details className="menu saved-views" ref={menu}>
      <summary className="button" aria-label="Saved views">
        <Icon name="bookmark" />
        <span className="button-label">{active ? active.name : 'Saved views'}</span>
      </summary>
      <div className="menu-panel">
        <form onSubmit={save} className="saved-form">
          <label className="field field-block">
            <span>Save these filters as</span>
            <input
              value={name}
              maxLength={40}
              placeholder="For example: Region V, high scores"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" className="button button-primary" disabled={!name.trim()}>
            Save view
          </button>
        </form>
        {views.length > 0 ? (
          <ul className="saved-list">
            {views.map((view) => (
              <li key={view.name} className={view.search === current ? 'is-current' : ''}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setParams(new URLSearchParams(view.search), { replace: true });
                    if (menu.current) menu.current.open = false;
                    toast(`Showing “${view.name}”`, 'bookmark');
                  }}
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => remove(view.name)}
                  aria-label={`Delete the saved view ${view.name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="menu-note">Saved views stay in this browser only.</p>
        )}
      </div>
    </details>
  );
}
