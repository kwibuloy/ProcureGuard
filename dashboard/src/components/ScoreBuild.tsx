import type { CSSProperties } from 'react';
import type { IndicatorResult } from '../api';
import { formatContribution, toPoints } from '../format';
import { INDICATORS } from '../indicators';
import { Icon } from './Icon';

/**
 * The score built from blocks on one 0 to 100 track: the starting level, then
 * each indicator's points added (or taken away) in turn, ending at the score.
 * A key under the track names every block, including ones too narrow for an icon.
 */
export function ScoreBuild({
  indicators,
  baseValue,
  score,
}: {
  indicators: IndicatorResult[];
  baseValue: number;
  score: number;
}) {
  const moving = indicators.filter((item) => Math.abs(item.contribution) >= 0.0005);
  const steps = moving.map((item, index) => {
    const from = moving
      .slice(0, index)
      .reduce((sum, earlier) => sum + earlier.contribution, baseValue);
    return { item, from, to: from + item.contribution };
  });
  return (
    <figure
      className="score-build"
      aria-label={`Starting level ${toPoints(baseValue)}, ${steps
        .map(
          ({ item }) =>
            `${INDICATORS[item.indicator].label} ${formatContribution(item.contribution)}`,
        )
        .join(', ')}, score ${toPoints(score)}`}
    >
      <div className="build-track" aria-hidden="true">
        <span className="build-block is-base" style={{ left: 0, width: `${baseValue * 100}%` }}>
          <span className="build-label">Start {toPoints(baseValue)}</span>
        </span>
        {steps.map(({ item, from, to }, index) => {
          const left = Math.min(from, to) * 100;
          const width = Math.abs(to - from) * 100;
          return (
            <span
              key={item.indicator}
              className={`build-block ${item.contribution > 0 ? 'is-raising' : 'is-lowering'}`}
              style={{ left: `${left}%`, width: `${width}%`, '--i': index } as CSSProperties}
              title={`${INDICATORS[item.indicator].label}: ${formatContribution(item.contribution)} points`}
            >
              {width > 7 && <Icon name={item.indicator} size={14} />}
            </span>
          );
        })}
        <span className="build-marker" style={{ left: `${score * 100}%` }}>
          <span className="build-label">Score {toPoints(score)}</span>
        </span>
      </div>
      <div className="build-scale" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <figcaption>
        <ol className="build-key">
          <li>
            <span className="build-swatch is-base" aria-hidden="true" />
            <span className="build-key-name">Starting level</span>
            <span className="build-key-value">{toPoints(baseValue)}</span>
          </li>
          {steps.map(({ item }) => (
            <li key={item.indicator}>
              <span
                className={`build-swatch ${item.contribution > 0 ? 'is-raising' : 'is-lowering'}`}
                aria-hidden="true"
              />
              <span className="build-key-name">
                <Icon name={item.indicator} size={14} />
                {INDICATORS[item.indicator].label}
              </span>
              <span className="build-key-value">{formatContribution(item.contribution)}</span>
            </li>
          ))}
          <li className="build-key-total">
            <span className="build-swatch is-score" aria-hidden="true" />
            <span className="build-key-name">Score</span>
            <span className="build-key-value">{toPoints(score)}</span>
          </li>
        </ol>
      </figcaption>
    </figure>
  );
}
