import type { ContractRow } from '../api';
import { formatContribution } from '../format';
import { INDICATORS, NOTABLE, reason } from '../indicators';
import { Icon } from './Icon';

/**
 * Why a contract scored as it did, in words: the indicator that raised the score
 * most, the figures behind it, and any other indicator that also raised it.
 */
export function WhyCell({ row }: { row: ContractRow }) {
  const raised = (row.indicators ?? [])
    .filter((result) => result.contribution >= NOTABLE)
    .sort((a, b) => b.contribution - a.contribution);
  const [main, ...others] = raised;

  if (!main) {
    return (
      <div className="why">
        <p className="why-head">
          <span className="why-name">Nothing stands out</span>
        </p>
        <p className="why-text">No indicator raised this score by a notable amount.</p>
      </div>
    );
  }

  return (
    <div className="why">
      <p className="why-head">
        <span className="why-name">
          <Icon name={main.indicator} size={14} />
          {INDICATORS[main.indicator].label}
        </span>
        <span className="why-points">
          <span className="swatch swatch-raises" aria-hidden="true" />
          {formatContribution(main.contribution)}
          <span className="visually-hidden"> points</span>
        </span>
      </p>
      <p className="why-text">
        {reason(main) ?? 'Its figure is not available, so it was treated as typical.'}
      </p>
      {others.length > 0 && (
        <p className="why-also">
          Also raised the score:{' '}
          {others
            .map(
              (other) =>
                `${INDICATORS[other.indicator].label.toLowerCase()} ${formatContribution(other.contribution)}`,
            )
            .join(', ')}
        </p>
      )}
    </div>
  );
}
