import type { CSSProperties } from 'react';
import { contractsPath, useApi, type ContractList } from '../api';
import { useReviewStatuses } from '../reviews';
import { CLEARED_FILTERS } from '../pages/queue/query';

const TOP = 50;
const R = 22;
const LENGTH = 2 * Math.PI * R;

/**
 * How many of the run's 50 highest-ranked flagged contracts have a review, as a
 * ring that fills. Reviews are public, so everyone sees the same progress.
 */
export function ReviewProgress({ runId }: { runId: number }) {
  const top = useApi<ContractList>(
    contractsPath(
      {
        ...CLEARED_FILTERS,
        flaggedOnly: true,
        sort: 'rank',
        page: 1,
      },
      runId,
      TOP,
    ),
  );
  const ids = top.data?.items.map((row) => row.id) ?? [];
  const statuses = useReviewStatuses(ids);
  if (!ids.length) return null;
  const reviewed = ids.filter((id) => {
    const status = statuses.get(id);
    return status && status !== 'not_reviewed';
  }).length;
  const share = reviewed / ids.length;
  return (
    <div className="review-progress" title="Reviews are recorded by the ProcureGuard team">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle className="ring-track" cx="28" cy="28" r={R} />
        <circle
          className="ring-fill"
          cx="28"
          cy="28"
          r={R}
          style={
            { '--ring-length': LENGTH, '--ring-offset': LENGTH * (1 - share) } as CSSProperties
          }
        />
      </svg>
      <p>
        <strong>
          {reviewed} of {ids.length}
        </strong>
        <span>top flags reviewed</span>
      </p>
    </div>
  );
}
