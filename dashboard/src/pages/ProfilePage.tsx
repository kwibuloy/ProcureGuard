import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  contractsPath,
  PAGE_SIZE,
  useApi,
  withRun,
  type ContractList,
  type Profile,
  type ProfileKind,
} from '../api';
import { BarList } from '../components/BarList';
import { ContractTable } from '../components/ContractTable';
import { Icon } from '../components/Icon';
import { Notice, SkeletonRows, Tile } from '../components/States';
import { formatCount, formatDate, formatPercent, formatPesoCompact, plural } from '../format';
import { profileLink } from '../links';
import { useOverview } from '../overview';

const WORDS = {
  entity: {
    eyebrow: 'Procuring entity',
    counterpart: 'awardee',
    counterparts: 'awardees',
    verb: 'awarded',
    barsTitle: 'Who its contracts went to',
    barsNote:
      'Share of this entity’s contracts by awardee. One awardee holding most of them is what the repeated-winner indicator measures.',
    listTitle: 'Contracts it awarded',
  },
  awardee: {
    eyebrow: 'Awardee',
    counterpart: 'procuring entity',
    counterparts: 'procuring entities',
    verb: 'won',
    barsTitle: 'Who it won contracts from',
    barsNote: 'Share of this awardee’s contracts by procuring entity.',
    listTitle: 'Contracts it won',
  },
} as const;

/** Everything one procuring entity awarded, or one awardee won, in the shown run. */
export function ProfilePage() {
  const kind: ProfileKind = useParams().kind === 'awardee' ? 'awardee' : 'entity';
  const [params, setParams] = useSearchParams();
  const name = params.get('name') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const run = useOverview().data?.run ?? null;
  const words = WORDS[kind];
  const other: ProfileKind = kind === 'entity' ? 'awardee' : 'entity';

  const profile = useApi<Profile>(
    run && name ? withRun(`/api/profile?${new URLSearchParams({ kind, name })}`, run.id) : null,
  );
  const list = useApi<ContractList>(
    run && name
      ? contractsPath(
          {
            q: '',
            region: '',
            entityType: '',
            reason: '',
            scoreFrom: '',
            scoreTo: '',
            flaggedOnly: false,
            sort: 'rank',
            page,
            [kind]: name,
          },
          run.id,
        )
      : null,
  );

  if (profile.error || !name) {
    return (
      <div className="card">
        <Notice title="Nothing found under this name" icon="building">
          It has no contracts in the scoring run being shown.
        </Notice>
      </div>
    );
  }
  if (!profile.data || !run)
    return <div className="card skeleton skeleton-block" aria-busy="true" />;

  const data = profile.data;
  const leader = data.top[0];
  const pages = list.data ? Math.ceil(list.data.total / PAGE_SIZE) : 1;

  return (
    <>
      <header className="page-header">
        <Link to="/" className="back-link">
          <Icon name="arrowLeft" /> Review queue
        </Link>
        <p className="eyebrow">{words.eyebrow}</p>
        <h1>{data.name}</h1>
        <p className="lede">
          {[data.type, data.region].filter(Boolean).join(' · ') || 'Details not published'}
          {data.firstAward &&
            ` · awards from ${formatDate(data.firstAward)} to ${formatDate(data.lastAward)}`}
        </p>
      </header>

      <dl className="tiles tiles-4">
        <Tile
          label={`Contracts ${words.verb}`}
          value={formatCount(data.contracts)}
          note="in this scoring run"
        />
        <Tile
          label="Flagged for review"
          value={formatCount(data.flagged)}
          note={`${formatPercent(data.contracts ? data.flagged / data.contracts : 0)} of its contracts`}
          share={data.contracts ? data.flagged / data.contracts : 0}
        />
        <Tile label="Total contract value" value={formatPesoCompact(data.totalValue)} />
        <Tile
          label={`Different ${words.counterparts}`}
          value={formatCount(data.counterparties)}
          note={
            leader
              ? `largest holds ${formatPercent(leader.contracts / data.contracts)} of contracts`
              : undefined
          }
        />
      </dl>

      <section className="card">
        <h2>{words.barsTitle}</h2>
        <p className="card-note">{words.barsNote}</p>
        <BarList
          max={data.contracts}
          items={data.top.map((item) => ({
            key: item.key,
            label: (
              <Link to={profileLink(other, item.key)} className="text-link">
                {item.name}
              </Link>
            ),
            value: item.contracts,
            display: formatPercent(item.contracts / data.contracts),
            note: `${plural(item.contracts, 'contract')} · ${formatPesoCompact(item.value)}${item.flagged ? ` · ${item.flagged} flagged` : ''}`,
          }))}
        />
        {data.counterparties > data.top.length && (
          <p className="card-note">
            Showing the {data.top.length} largest of {formatCount(data.counterparties)}{' '}
            {words.counterparts}.
          </p>
        )}
      </section>

      <section className="card queue" aria-labelledby="profile-list">
        <div className="queue-head">
          <div>
            <h2 id="profile-list">{words.listTitle}</h2>
            <p className="card-note">
              {plural(data.contracts, 'contract')}, most unusual first. Flagged contracts are in
              full ink.
            </p>
          </div>
        </div>
        {!list.data ? (
          <SkeletonRows />
        ) : (
          <>
            <ContractTable
              rows={list.data.items}
              threshold={run.flagThreshold}
              contractLink={(id) => ({ pathname: `/contracts/${id}` })}
              hide={kind}
              loading={list.loading}
            />
            {pages > 1 && (
              <div className="pagination">
                <p>
                  Page {page} of {pages}
                </p>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={page <= 1}
                    aria-label="Previous page"
                    onClick={() => setParams({ name, page: String(page - 1) })}
                  >
                    <Icon name="chevronLeft" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={page >= pages}
                    aria-label="Next page"
                    onClick={() => setParams({ name, page: String(page + 1) })}
                  >
                    <Icon name="chevronRight" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
