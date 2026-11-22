import type { IndicatorResult } from '../api';
import { formatContribution, toPoints } from '../format';
import { explain, INDICATORS } from '../indicators';
import { Icon } from './Icon';

interface Props {
  indicators: IndicatorResult[];
  baseValue: number | null;
  score: number;
  /**
   * Show only this many indicators, the ones that moved the score most, and fold
   * the rest under a button. Every indicator stays one click away.
   */
  fold?: number;
}

function Contribution({ item, largest }: { item: IndicatorResult; largest: number }) {
  const raises = item.contribution > 0;
  const share = (Math.abs(item.contribution) / largest) * 50;
  return (
    <li className="contribution">
      <div className="contribution-head">
        <span className="contribution-name">
          <Icon name={item.indicator} />
          {INDICATORS[item.indicator].label}
        </span>
        <span className="contribution-value">
          {formatContribution(item.contribution)}
          <span className="visually-hidden"> points</span>
        </span>
      </div>
      <div className="contribution-track" aria-hidden="true">
        <span className="contribution-zero" />
        {item.contribution !== 0 && (
          <span
            className={`contribution-bar ${raises ? 'is-raising' : 'is-lowering'}`}
            style={
              raises ? { left: '50%', width: `${share}%` } : { right: '50%', width: `${share}%` }
            }
          />
        )}
      </div>
      <p className="contribution-why">{explain(item)}</p>
    </li>
  );
}

/**
 * How each indicator moved this contract's score up or down from the starting
 * level. Bars share one scale, centred on zero.
 */
export function ContributionChart({ indicators, baseValue, score, fold }: Props) {
  const largest = Math.max(...indicators.map((item) => Math.abs(item.contribution)), 0.01);
  const ordered = fold
    ? [...indicators].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    : indicators;
  const shown = fold ? ordered.slice(0, fold) : ordered;
  const folded = fold ? ordered.slice(fold) : [];

  return (
    <div className="contributions">
      <ul className="contribution-legend" aria-hidden="true">
        <li>
          <span className="swatch swatch-lowers" /> Lowers the score
        </li>
        <li>
          <span className="swatch swatch-raises" /> Raises the score
        </li>
      </ul>

      <ol className="contribution-list">
        {shown.map((item) => (
          <Contribution key={item.indicator} item={item} largest={largest} />
        ))}
      </ol>

      {folded.length > 0 && (
        <details className="contribution-more">
          <summary>
            Show the other {folded.length} {folded.length === 1 ? 'indicator' : 'indicators'}
          </summary>
          <ol className="contribution-list">
            {folded.map((item) => (
              <Contribution key={item.indicator} item={item} largest={largest} />
            ))}
          </ol>
        </details>
      )}

      {baseValue !== null && (
        <p className="contribution-sum">
          <span>Starting level {toPoints(baseValue)}</span>
          {indicators.map((item) => (
            <span key={item.indicator}>{formatContribution(item.contribution)}</span>
          ))}
          <span className="contribution-total">Score {toPoints(score)}</span>
        </p>
      )}
    </div>
  );
}
