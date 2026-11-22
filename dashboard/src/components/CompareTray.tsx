import { Link, useLocation } from 'react-router-dom';
import { clearPicked, COMPARE_LIMIT, unpick, usePicked } from '../compare';
import { Icon } from './Icon';

/** A tray at the bottom of the screen with the contracts picked to compare. */
export function CompareTray() {
  const picked = usePicked();
  const { pathname } = useLocation();
  if (!picked.length || pathname === '/compare') return null;
  const ready = picked.length === COMPARE_LIMIT;
  return (
    <aside className="compare-tray" aria-label="Contracts to compare">
      <p className="compare-tray-title">
        <Icon name="columns" size={18} />
        Compare
      </p>
      <ul>
        {picked.map((item) => (
          <li key={item.id}>
            <span className="compare-tray-name">{item.title}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => unpick(item.id)}
              aria-label={`Remove ${item.title} from the comparison`}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
        {!ready && <li className="compare-tray-empty">Pick one more contract</li>}
      </ul>
      <div className="compare-tray-actions">
        <button type="button" className="button button-quiet" onClick={clearPicked}>
          Clear
        </button>
        {ready ? (
          <Link
            to={{ pathname: '/compare', search: `?ids=${picked.map((item) => item.id).join(',')}` }}
            className="button button-primary"
          >
            Compare side by side
            <Icon name="arrowRight" size={16} />
          </Link>
        ) : (
          <span className="button button-primary" aria-disabled="true">
            Compare side by side
          </span>
        )}
      </div>
    </aside>
  );
}
