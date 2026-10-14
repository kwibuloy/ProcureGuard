import { useState } from 'react';
import type { Comparison } from '../api';
import { toPoints } from '../format';
import { useWidth } from './useWidth';

const HEIGHT = 420;
const MARGIN = { top: 16, right: 20, bottom: 44, left: 52 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const HOVER_RADIUS = 14;

type Point = Comparison['points'][number];
type Group = 'both' | 'onlyA' | 'onlyB' | 'neither';

const groupOf = (point: Point): Group =>
  point.flaggedA && point.flaggedB
    ? 'both'
    : point.flaggedA
      ? 'onlyA'
      : point.flaggedB
        ? 'onlyB'
        : 'neither';

// Drawn back to front, so the flagged contracts sit on top of the ordinary ones.
const ORDER: Group[] = ['neither', 'onlyA', 'onlyB', 'both'];

interface Props {
  points: Point[];
  nameA: string;
  nameB: string;
  thresholdA: number | null;
  thresholdB: number | null;
  onOpen: (contractId: number) => void;
}

/** Each contract placed by the score the two models gave it. */
export function ScatterPlot({ points, nameA, nameB, thresholdA, thresholdB, onOpen }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hovered, setHovered] = useState<Point | null>(null);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (score: number) => MARGIN.left + score * plotWidth;
  const y = (score: number) => MARGIN.top + (1 - score) * plotHeight;

  const nearest = (event: React.MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best: Point | null = null;
    let bestDistance = HOVER_RADIUS ** 2;
    for (const point of points) {
      const distance = (x(point.a) - px) ** 2 + (y(point.b) - py) ** 2;
      // A flagged contract wins a tie with an ordinary one beneath it.
      if (distance < bestDistance || (distance === bestDistance && groupOf(point) !== 'neither')) {
        best = point;
        bestDistance = distance;
      }
    }
    return best;
  };

  return (
    <div className="chart scatter" ref={ref}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Scatter plot of ${points.length} contracts: score from ${nameA} across, score from ${nameB} up`}
      >
        {TICKS.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={x(tick)} x2={x(tick)} y1={y(0)} y2={y(1)} />
            <line className="chart-grid" x1={x(0)} x2={x(1)} y1={y(tick)} y2={y(tick)} />
            <text className="chart-tick" x={x(tick)} y={y(0) + 18} textAnchor="middle">
              {toPoints(tick)}
            </text>
            <text className="chart-tick" x={x(0) - 10} y={y(tick) + 4} textAnchor="end">
              {toPoints(tick)}
            </text>
          </g>
        ))}
        {/* Contracts on this line got the same score from both models. */}
        <line className="chart-diagonal" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
        {thresholdA !== null && (
          <line
            className="chart-threshold"
            x1={x(thresholdA)}
            x2={x(thresholdA)}
            y1={y(0)}
            y2={y(1)}
          />
        )}
        {thresholdB !== null && (
          <line
            className="chart-threshold"
            x1={x(0)}
            x2={x(1)}
            y1={y(thresholdB)}
            y2={y(thresholdB)}
          />
        )}

        {ORDER.map((group) => (
          <g key={group} className={`dots dots-${group}`}>
            {points
              .filter((point) => groupOf(point) === group)
              .map((point) => (
                <circle
                  key={point.id}
                  cx={x(point.a)}
                  cy={y(point.b)}
                  r={group === 'neither' ? 2.5 : 4.5}
                />
              ))}
          </g>
        ))}
        {hovered && <circle className="dot-hover" cx={x(hovered.a)} cy={y(hovered.b)} r={8} />}

        <text className="chart-axis-title" x={x(0.5)} y={HEIGHT - 6} textAnchor="middle">
          Score from {nameA}
        </text>
        <text
          className="chart-axis-title"
          transform={`translate(14 ${y(0.5)}) rotate(-90)`}
          textAnchor="middle"
        >
          Score from {nameB}
        </text>

        <rect
          className={`chart-hit ${hovered ? 'is-clickable' : ''}`}
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          onMouseMove={(event) => setHovered(nearest(event))}
          onMouseLeave={() => setHovered(null)}
          onClick={(event) => {
            const point = nearest(event);
            if (point) onOpen(point.id);
          }}
        />
      </svg>

      {hovered && (
        <div
          className="tooltip"
          style={{ left: x(hovered.a), top: y(hovered.b) - 12 }}
          role="status"
        >
          <strong>
            {nameA} {toPoints(hovered.a)} · {nameB} {toPoints(hovered.b)}
          </strong>
          <span>
            {
              {
                both: 'Flagged by both',
                onlyA: `Flagged only by ${nameA}`,
                onlyB: `Flagged only by ${nameB}`,
                neither: 'Flagged by neither',
              }[groupOf(hovered)]
            }{' '}
            · click to open
          </span>
        </div>
      )}
    </div>
  );
}
