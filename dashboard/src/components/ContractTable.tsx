import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ContractRow } from '../api';
import { formatDate, formatPeso, toPoints } from '../format';
import { profileLink } from '../links';
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
  loading?: boolean;
}

/** The ranked list of contracts, used by the review queue and the profile pages. */
export function ContractTable({
  rows,
  threshold,
  contractLink,
  openId,
  cursorId,
  reviewed,
  hide,
  loading,
}: Props) {
  return (
    <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
      <table className="queue-table">
        <thead>
          <tr>
            <th scope="col" className="col-rank">
              Rank
            </th>
            <th scope="col">Contract</th>
            {hide !== 'entity' && (
              <th scope="col" className="col-entity">
                Procuring entity
              </th>
            )}
            {hide !== 'awardee' && (
              <th scope="col" className="col-awardee">
                Awardee
              </th>
            )}
            <th scope="col" className="col-amount">
              Contract amount
            </th>
            <th scope="col" className="col-score">
              Score
            </th>
            <th scope="col" className="col-reason">
              Why
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isReviewed = reviewed?.has(row.id) ?? false;
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
                <td className="col-contract">
                  <Link to={contractLink(row.id)} className="row-link">
                    {row.title}
                  </Link>
                  <span className="cell-sub">
                    {row.awardReference} · Awarded {formatDate(row.awardDate)}
                  </span>
                </td>
                {hide !== 'entity' && (
                  <td className="col-entity">
                    <Link to={profileLink('entity', row.entity)} className="cell-link">
                      {row.entityName}
                    </Link>
                    <span className="cell-sub">{row.region ?? 'Region not published'}</span>
                  </td>
                )}
                {hide !== 'awardee' && (
                  <td className="col-awardee">
                    <Link to={profileLink('awardee', row.awardee)} className="cell-link">
                      {row.awardeeName}
                    </Link>
                  </td>
                )}
                <td className="col-amount">{formatPeso(row.amount)}</td>
                <td className="col-score">
                  <span className="score-cell">
                    <span className="score-number">{toPoints(row.score)}</span>
                    <ScoreMeter score={row.score} threshold={threshold} />
                  </span>
                </td>
                <td className="col-reason">
                  <WhyCell row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
