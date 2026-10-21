import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { budgetShare, noticeSummary } from '../amounts';
import type { ContractRow } from '../api';
import { formatDate, formatPercent, formatPeso, toPoints } from '../format';
import { profileLink } from '../links';
import type { Column, ViewSettings } from '../view';
import { Icon } from './Icon';
import { ScoreMeter } from './ScoreMeter';
import { WhyCell } from './WhyCell';

interface Props {
  rows: ContractRow[];
  threshold: number | null;
  /** Where a row leads: the contract's detail view. */
  contractLink: (id: number) => { pathname: string; search?: string };
  openId?: number | null;
  /** Row highlighted by keyboard navigation. */
  cursorId?: number | null;
  reviewed?: ReadonlySet<number>;
  /** Hide a column when every row would say the same thing. */
  hide?: 'entity' | 'awardee';
  /** The reader's view settings; the profile pages use the defaults. */
  view?: ViewSettings;
  loading?: boolean;
}

/** The ranked list of contracts, used by the Contracts page and the profile pages. */
export function ContractTable({
  rows,
  threshold,
  contractLink,
  openId,
  cursorId,
  reviewed,
  hide,
  view,
  loading,
}: Props) {
  const shows = (column: Column) =>
    column === 'share' ? Boolean(view && !view.hidden.has('share')) : !view?.hidden.has(column);
  const grouped = view?.grouped ?? false;
  return (
    <div
      className={['table-wrap', loading && 'is-loading', view?.compact && 'is-compact']
        .filter(Boolean)
        .join(' ')}
    >
      <table className="queue-table">
        <thead>
          <tr>
            {shows('rank') && (
              <th scope="col" className="col-rank">
                Rank
              </th>
            )}
            <th scope="col">Contract</th>
            {hide !== 'entity' && shows('entity') && (
              <th scope="col" className="col-entity">
                Procuring entity
              </th>
            )}
            {hide !== 'awardee' && shows('awardee') && (
              <th scope="col" className="col-awardee">
                Awardee
              </th>
            )}
            {shows('amount') && (
              <th scope="col" className="col-amount">
                Contract amount
              </th>
            )}
            {shows('share') && (
              <th scope="col" className="col-share">
                % of budget
              </th>
            )}
            <th scope="col" className="col-score">
              Score
            </th>
            {shows('why') && (
              <th scope="col" className="col-reason">
                Why
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isReviewed = reviewed?.has(row.id) ?? false;
            const notice = grouped ? noticeSummary(row) : null;
            const share = budgetShare(row, grouped);
            const classes = [
              row.id === openId && 'is-open',
              row.id === cursorId && 'is-cursor',
              isReviewed && 'is-reviewed',
              !row.flagged && 'is-unflagged',
            ];
            return (
              <tr
                key={row.id}
                className={classes.filter(Boolean).join(' ')}
                data-row={row.id}
                style={{ '--i': index } as CSSProperties}
              >
                {shows('rank') && (
                  <td className="col-rank">
                    {isReviewed ? (
                      <span className="reviewed-mark" title="Marked as reviewed in this browser">
                        <Icon name="check" size={14} />
                        <span className="visually-hidden">Reviewed. Rank </span>
                        {row.rank}
                      </span>
                    ) : (
                      row.rank
                    )}
                  </td>
                )}
                <td className="col-contract">
                  <Link to={contractLink(row.id)} className="row-link">
                    {row.title}
                  </Link>
                  <span className="cell-sub">
                    {row.awardReference} · Awarded {formatDate(row.awardDate)}
                    {notice && ` · ${notice.others}`}
                  </span>
                </td>
                {hide !== 'entity' && shows('entity') && (
                  <td className="col-entity">
                    <Link to={profileLink('entity', row.entity)} className="cell-link">
                      {row.entityName}
                    </Link>
                    <span className="cell-sub">{row.region ?? 'Region not published'}</span>
                  </td>
                )}
                {hide !== 'awardee' && shows('awardee') && (
                  <td className="col-awardee">
                    <Link to={profileLink('awardee', row.awardee)} className="cell-link">
                      {row.awardeeName}
                    </Link>
                  </td>
                )}
                {shows('amount') && (
                  <td className="col-amount">
                    {formatPeso(row.amount)}
                    {notice && <span className="cell-sub">{notice.total}</span>}
                  </td>
                )}
                {shows('share') && (
                  <td className="col-share">
                    {share ? formatPercent(share.share, 1) : 'Not published'}
                    {share?.basis && <span className="cell-sub">{share.basis}</span>}
                  </td>
                )}
                <td className="col-score">
                  <span className="score-cell">
                    <span className="score-number">{toPoints(row.score)}</span>
                    <ScoreMeter score={row.score} threshold={threshold} />
                  </span>
                </td>
                {shows('why') && (
                  <td className="col-reason">
                    <WhyCell row={row} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
