import type { IndicatorResult } from '../api';
import { formatContribution, toPoints } from '../format';
import { explain, INDICATORS } from '../indicators';
import { Icon } from './Icon';

interface Props {
  indicators: IndicatorResult[];
  baseValue: number | null;
  score: number;
}

/**
 * How each indicator moved this contract's score up or down from the starting
 * level. Bars share one scale, centred on zero.
 */
export function ContributionChart({ indicators, baseValue, score }: Props) {
  const largest = Math.max(...indicators.map((item) => Math.abs(item.contribution)), 0.01);

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
        {indicators.map((item) => {
          const raises = item.contribution > 0;
          const share = (Math.abs(item.contribution) / largest) * 50;
          return (
            <li key={item.indicator} className="contribution">
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
                      raises
                        ? { left: '50%', width: `${share}%` }
                        : { right: '50%', width: `${share}%` }
                    }
                  />
                )}
              </div>
              <p className="contribution-why">{explain(item)}</p>
            </li>
          );
        })}
      </ol>

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
