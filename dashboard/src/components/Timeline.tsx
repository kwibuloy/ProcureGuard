import { daysBetween, formatDate } from '../format';

interface Props {
  steps: { label: string; date: string | null }[];
}

/** Key dates in order, with the days from each step to the next. */
export function Timeline({ steps }: Props) {
  return (
    <ol className="timeline">
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const gap = next ? daysBetween(step.date, next.date) : null;
        return (
          <li key={step.label} className={step.date ? '' : 'is-missing'}>
            <span className="timeline-dot" aria-hidden="true" />
            {gap !== null && (
              <span className="timeline-gap">
                {gap} {gap === 1 ? 'day' : 'days'}
                <span className="visually-hidden"> until the next step</span>
              </span>
            )}
            <span className="timeline-label">{step.label}</span>
            <span className="timeline-date">{formatDate(step.date)}</span>
          </li>
        );
      })}
    </ol>
  );
}
