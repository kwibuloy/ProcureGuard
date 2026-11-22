import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PlaceMap } from '../components/PlaceMap';
import { Notice, SkeletonCard } from '../components/States';
import { useToast } from '../components/Toast';
import { formatCount } from '../format';
import { useOverview } from '../overview';
import { QueueCharts } from './queue/QueueCharts';
import { readQuery } from './queue/query';

/**
 * The year at a glance: how the scores are spread, the main reason for each flag,
 * and where the flagged contracts are. Selecting a bar or a place opens the
 * Contracts list with that filter, so this page stays short and the list stays
 * the place where reviewing happens.
 */
export function PatternsPage() {
  const overview = useOverview();
  const run = overview.data?.run ?? null;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = readQuery(params);

  /** Open the list with these filters on top of any already chosen. */
  const openList = (changes: Record<string, string>, message: string) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    navigate({ pathname: '/', search: next.toString() });
    toast(message, 'flag');
  };

  return (
    <article className="patterns">
      <header className="page-header patterns-header">
        <p className="eyebrow">The year at a glance</p>
        <h1>Patterns</h1>
        <p className="lede">
          Where the flagged contracts are and why they were flagged. Select a bar or a place to see
          those contracts in the list.
        </p>
        {overview.data?.totals && (
          <Link to={{ pathname: '/', search: params.toString() }} className="button">
            <Icon name="flag" />
            Back to {formatCount(overview.data.totals.flagged)} flagged contracts
          </Link>
        )}
      </header>

      {overview.error ? (
        <div className="card">
          <Notice
            title="The patterns could not be loaded"
            art="unplugged"
            action={{ label: 'Try again', onClick: overview.reload }}
          />
        </div>
      ) : !overview.data || !run ? (
        <div className="patterns-loading">
          <SkeletonCard lines={6} block />
          <SkeletonCard lines={6} block />
        </div>
      ) : (
        <>
          <QueueCharts
            overview={overview.data}
            run={run}
            query={query}
            active
            onFilter={openList}
          />
          <PlaceMap
            run={run.id}
            onFilter={(place) => {
              const name = place.city || place.province.split('|')[0] || place.region;
              openList(
                { region: place.region, province: place.province, city: place.city },
                name ? `Showing contracts in ${name}` : 'Showing contracts in every place',
              );
            }}
          />
        </>
      )}
    </article>
  );
}
