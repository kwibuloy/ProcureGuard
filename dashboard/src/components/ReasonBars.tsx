import type { Indicator, Overview } from '../api';
import { formatCount } from '../format';
import { INDICATORS } from '../indicators';
import { Icon } from './Icon';

interface Props {
  reasons: Overview['mainReasons'];
  selected: string;
  onSelect: (indicator: Indicator | '') => void;
}

/** Which indicator contributed most, across flagged contracts. Each bar filters the queue. */
export function ReasonBars({ reasons, selected, onSelect }: Props) {
  const largest = Math.max(...reasons.map((reason) => reason.count), 1);
  return (
    <ul className="reason-bars">
      {reasons.map(({ indicator, count }) => {
        const isSelected = selected === indicator;
        return (
          <li key={indicator}>
            <button
              type="button"
              className={`reason-bar ${isSelected ? 'is-selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? '' : indicator)}
            >
              <span className="reason-bar-label">
                <Icon name={indicator} />
                {INDICATORS[indicator].label}
              </span>
              <span className="reason-bar-track">
                <span
                  className="reason-bar-fill"
                  style={{ width: `${(count / largest) * 100}%` }}
                />
              </span>
              <span className="reason-bar-value">{formatCount(count)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
