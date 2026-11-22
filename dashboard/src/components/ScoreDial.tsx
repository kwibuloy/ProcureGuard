import type { CSSProperties } from 'react';
import { toPoints } from '../format';

const R = 80;
const CX = 100;
const CY = 96;

/** A point on the dial's arc for a score from 0 to 1 (left to right over the top). */
function at(score: number, radius = R) {
  const angle = Math.PI * (1 - score);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

function arc(from: number, to: number) {
  const start = at(from);
  const end = at(to);
  return `M${start.x},${start.y} A${R},${R} 0 0 1 ${end.x},${end.y}`;
}

/**
 * The score as a chunky dial from 0 to 100, with a notch where flagging starts.
 * The needle swings to the score when the dial appears. Decorative: the score,
 * cut-off and status are written out beside it.
 */
export function ScoreDial({ score, threshold }: { score: number; threshold: number | null }) {
  const notchOuter = threshold === null ? null : at(threshold, R + 14);
  const notchInner = threshold === null ? null : at(threshold, R - 14);
  return (
    <svg className="score-dial" viewBox="0 0 200 116" aria-hidden="true">
      <path className="dial-track" d={arc(0, 1)} />
      {threshold !== null && <path className="dial-flag-zone" d={arc(threshold, 1)} />}
      <path className="dial-fill" d={arc(0, Math.max(0.001, score))} pathLength={1} />
      {notchOuter && notchInner && (
        <line
          className="dial-notch"
          x1={notchInner.x}
          y1={notchInner.y}
          x2={notchOuter.x}
          y2={notchOuter.y}
        />
      )}
      <g className="dial-needle" style={{ '--turn': `${score * 180 - 90}deg` } as CSSProperties}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + 6} />
        <circle cx={CX} cy={CY} r={9} />
      </g>
      <text className="dial-tick" x={at(0).x} y={CY + 16} textAnchor="middle">
        0
      </text>
      <text className="dial-tick" x={at(1).x} y={CY + 16} textAnchor="middle">
        100
      </text>
      {threshold !== null && notchOuter && (
        <text
          className="dial-tick"
          x={notchOuter.x + 4}
          y={notchOuter.y - 4}
          textAnchor={threshold > 0.5 ? 'start' : 'end'}
        >
          {toPoints(threshold)}
        </text>
      )}
    </svg>
  );
}
