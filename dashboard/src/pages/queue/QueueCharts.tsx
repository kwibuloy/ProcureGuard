import type { ListQuery, Overview, Run } from '../../api';
import { BarList } from '../../components/BarList';
import { Icon } from '../../components/Icon';
import { ScoreHistogram } from '../../components/ScoreHistogram';
import { formatCount, toPoints } from '../../format';
import { INDICATORS } from '../../indicators';

/** The score spread and the main reasons, each selectable to filter the list. */
export function QueueCharts({
  overview,
  run,
  query,
  active,
  onFilter,
}: {
  overview: Overview;
  run: Run;
  query: ListQuery;
  /** Whether this is the phone tab being shown. */
  active: boolean;
  /** Filter the list, and say in a few words what it now shows. */
  onFilter: (changes: Record<string, string>, message: string) => void;
}) {
  return (
    <section className={`charts phone-section ${active ? 'is-active' : ''}`}>
      <div className="card">
        <h3 className="card-title">How the scores are spread</h3>
        <p className="card-note">
          Contracts in each score band. Ink bars are flagged. Select a bar to list the contracts in
          that band.
        </p>
        <ScoreHistogram
          bins={overview.histogram}
          threshold={run.flagThreshold}
          selectedFrom={query.scoreFrom ? Number(query.scoreFrom) : null}
          onSelect={(selected) =>
            selected
              ? onFilter(
                  {
                    scoreFrom: String(selected.from),
                    scoreTo: String(selected.to),
                    // A band below the flagging score has no flagged contracts to show.
                    show: 'all',
                  },
                  `Showing scores ${toPoints(selected.from)} to ${toPoints(selected.to)}`,
                )
              : onFilter({ scoreFrom: '', scoreTo: '' }, 'Score band filter removed')
          }
        />
      </div>
      <div className="card">
        <h3 className="card-title">Main reason for each flag</h3>
        <p className="card-note">
          The indicator that raised each flagged contract’s score the most. Select one to filter the
          list.
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
          onSelect={(reason) =>
            query.reason === reason
              ? onFilter({ reason: '' }, 'Main reason filter removed')
              : onFilter(
                  { reason },
                  `Showing ${INDICATORS[reason as keyof typeof INDICATORS].label.toLowerCase()} flags`,
                )
          }
        />
      </div>
    </section>
  );
}
