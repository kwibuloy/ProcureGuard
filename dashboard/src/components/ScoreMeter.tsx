import { toPoints } from '../format';

interface Props {
  score: number;
  threshold: number | null;
  size?: 'small' | 'large';
}

/** A 0 to 100 bar for one score, with a tick where flagging starts. */
export function ScoreMeter({ score, threshold, size = 'small' }: Props) {
  return (
    <span className={`meter meter-${size}`} aria-hidden="true">
      <span className="meter-fill" style={{ width: `${toPoints(score)}%` }} />
      {threshold !== null && (
        <span className="meter-threshold" style={{ left: `${toPoints(threshold)}%` }} />
      )}
    </span>
  );
}
