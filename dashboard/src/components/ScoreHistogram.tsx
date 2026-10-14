import { useState } from 'react';
import type { Overview } from '../api';
import { formatCount, plural, toPoints } from '../format';
import { useWidth } from './useWidth';

const HEIGHT = 228;
const MARGIN = { top: 30, right: 12, bottom: 30, left: 40 };
const BAR_GAP = 2;
const MAX_BAR_WIDTH = 24;

function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((step) => step * magnitude).find((step) => step >= value)!;
}

interface Props {
  bins: Overview['histogram'];
  threshold: number | null;
  /** Lower edge of the band the queue is filtered to, if any. */
  selectedFrom?: number | null;
  /** Called with a band to filter the queue to it, or null to clear. */
  onSelect?: (band: { from: number; to: number } | null) => void;
}

/** How many contracts fall in each score band, with the flagging score marked. */
export function ScoreHistogram({ bins, threshold, selectedFrom = null, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const top = niceCeiling(Math.max(...bins.map((bin) => bin.count), 1));
  const slot = plotWidth / bins.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot - BAR_GAP);
  const x = (score: number) => MARGIN.left + score * plotWidth;
  const y = (count: number) => MARGIN.top + plotHeight * (1 - count / top);
  const active = hovered === null ? null : bins[hovered];
  const isSelected = (from: number) =>
    selectedFrom !== null && Math.abs(from - selectedFrom) < 1e-9;
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  // Keep the annotation inside the plot when the flagging score is far right.
  const labelOnLeft = threshold !== null && threshold > 0.6;

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Histogram of risk scores for ${formatCount(total)} contracts`}
      >
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              className={fraction === 0 ? 'chart-baseline' : 'chart-grid'}
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y(top * fraction)}
              y2={y(top * fraction)}
            />
            <text
              className="chart-tick"
              x={MARGIN.left - 8}
              y={y(top * fraction) + 4}
              textAnchor="end"
            >
              {formatCount(top * fraction)}
            </text>
          </g>
        ))}

        {bins.map((bin, index) => {
          const flagged = threshold !== null && bin.to > threshold + 1e-9;
          const height = bin.count === 0 ? 0 : Math.max(3, plotHeight * (bin.count / top));
          const left = x(bin.from) + (slot - barWidth) / 2;
          const radius = Math.min(4, height);
          const bottom = MARGIN.top + plotHeight;
          const dimmed = selectedFrom !== null && !isSelected(bin.from);
          return (
            <g key={bin.from}>
              {hovered === index && (
                <rect
                  className="chart-column"
                  x={x(bin.from)}
                  y={MARGIN.top}
                  width={slot}
                  height={plotHeight}
                  rx={4}
                />
              )}
              {height > 0 && (
                <path
                  className={[
                    'bar',
                    flagged ? 'bar-accent' : 'bar-muted',
                    hovered === index && 'is-hovered',
                    dimmed && 'is-dimmed',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ animationDelay: `${index * 22}ms` }}
                  d={`M${left},${bottom} v${-(height - radius)} q0,${-radius} ${radius},${-radius} h${barWidth - 2 * radius} q${radius},0 ${radius},${radius} v${height - radius} z`}
                />
              )}
              <rect
                className={`chart-hit ${onSelect ? 'is-clickable' : ''}`}
                x={x(bin.from)}
                y={MARGIN.top}
                width={slot}
                height={plotHeight}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onClick={() =>
                  onSelect?.(isSelected(bin.from) ? null : { from: bin.from, to: bin.to })
                }
              />
            </g>
          );
        })}

        {threshold !== null && (
          <g>
            <line
              className="chart-threshold"
              x1={x(threshold)}
              x2={x(threshold)}
              y1={MARGIN.top - 10}
              y2={MARGIN.top + plotHeight}
            />
            <text
              className="chart-annotation"
              x={x(threshold) + (labelOnLeft ? -6 : 6)}
              y={MARGIN.top - 14}
              textAnchor={labelOnLeft ? 'end' : 'start'}
            >
              Flagged at {toPoints(threshold)} and above
            </text>
          </g>
        )}

        {[0, 0.25, 0.5, 0.75, 1].map((score) => (
          <text key={score} className="chart-tick" x={x(score)} y={HEIGHT - 8} textAnchor="middle">
            {toPoints(score)}
          </text>
        ))}
      </svg>

      {active && hovered !== null && (
        <div
          className="tooltip"
          style={{ left: x(active.from) + slot / 2, top: y(active.count) - 8 }}
          role="status"
        >
          <strong>{plural(active.count, 'contract')}</strong>
          <span>
            Score {toPoints(active.from)} to {toPoints(active.to)}
            {onSelect && (isSelected(active.from) ? ' · click to clear' : ' · click to filter')}
          </span>
        </div>
      )}

      <table className="visually-hidden">
        <caption>Contracts by risk score band</caption>
        <thead>
          <tr>
            <th scope="col">Score band</th>
            <th scope="col">Contracts</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((bin) => (
            <tr key={bin.from}>
              <td>
                {toPoints(bin.from)} to {toPoints(bin.to)}
              </td>
              <td>{bin.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
