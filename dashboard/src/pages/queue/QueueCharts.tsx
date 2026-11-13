import type { ListQuery, Overview, Run } from '../../api';
import { BarList } from '../../components/BarList';
import { Icon } from '../../components/Icon';
import { ScoreHistogram } from '../../components/ScoreHistogram';
import { formatCount } from '../../format';
import { INDICATORS } from '../../indicators';

/** The score spread and the main reasons, each selectable to filter the list. */
export function QueueCharts({
  overview,
  run,
  query,
  active,
  update,
}: {
  overview: Overview;
  run: Run;
  query: ListQuery;
  /** Whether this is the phone tab being shown. */
  active: boolean;
  update: (changes: Record<string, string>) => void;
}) {
  return (
    <section className={`charts phone-section ${active ? 'is-active' : ''}`}>
      <div className="card">
        <h2>How the scores are spread</h2>
        <p className="card-note">
          Contracts in each score band. Darker bars are flagged. Select a bar to list the contracts
          in that band.
        </p>
        <ScoreHistogram
          bins={overview.histogram}
          threshold={run.flagThreshold}
          selectedFrom={query.scoreFrom ? Number(query.scoreFrom) : null}
          onSelect={(selected) =>
            update(
              selected
                ? {
                    scoreFrom: String(selected.from),
                    scoreTo: String(selected.to),
                    // A band below the flagging score has no flagged contracts to show.
                    show: 'all',
                  }
                : { scoreFrom: '', scoreTo: '' },
            )
          }
        />
      </div>
      <div className="card">
        <h2>Main reason, among flagged contracts</h2>
        <p className="card-note">
          The indicator that raised each flagged contract’s score the most. Select one to filter the
          queue.
        </p>
        <BarList
          items={overview.mainReasons.map(({ indicator, count }) => ({
            key: indicator,
            label: (
              <>
                <Icon name={indicator} />
                {INDICATORS[indicator].label}
              </>
            ),
            value: count,
            display: formatCount(count),
          }))}
          selected={query.reason}
          onSelect={(reason) => update({ reason: query.reason === reason ? '' : reason })}
        />
      </div>
    </section>
  );
}
