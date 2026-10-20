import type { CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, type Comparison, type Run } from '../api';
import { BarList } from '../components/BarList';
import { ScatterPlot } from '../components/ScatterPlot';
import { Notice, PageHeader, Tile } from '../components/States';
import { formatCount, formatDate, formatPercent, toPoints, wholeCount } from '../format';
import { useRuns } from '../run';

/** The two most recent runs made by different models, newest first. */
function defaultPair(runs: Run[]): [number, number] | null {
  const first = runs[0];
  const second = runs.find((run) => run.modelName !== first?.modelName) ?? runs[1];
  return first && second ? [second.id, first.id] : null;
}

const twoDecimals = (value: number) => value.toFixed(2);

function agreement(correlation: number | null): string {
  if (correlation === null) return 'Not enough contracts to tell';
  if (correlation >= 0.8) return 'The two rankings are close';
  if (correlation >= 0.5) return 'The two rankings broadly agree';
  if (correlation >= 0.2) return 'The two rankings agree only loosely';
  return 'The two rankings largely differ';
}

function RunSelect(props: {
  label: string;
  value: number;
  runs: Run[];
  onChange: (id: number) => void;
}) {
  return (
    <label className="field field-labelled">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(Number(event.target.value))}>
        {props.runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.modelName} · {formatDate(run.createdAt)} · run {run.id}
          </option>
        ))}
      </select>
    </label>
  );
}

/** How two models rank the same contracts: where they agree and where they part. */
export function ComparePage() {
  const { runs } = useRuns();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const fallback = defaultPair(runs);
  const a = Number(params.get('a')) || fallback?.[0] || 0;
  const b = Number(params.get('b')) || fallback?.[1] || 0;
  const comparison = useApi<Comparison>(a && b && a !== b ? `/api/compare?a=${a}&b=${b}` : null);

  const header = (
    <PageHeader eyebrow="Compare models" title="Do the two models point at the same contracts?">
      The study scores every contract with two unsupervised models. Where both flag a contract, the
      flag does not depend on the choice of model. Where they differ, the reason is worth
      understanding before one model is chosen.
    </PageHeader>
  );

  if (runs.length < 2) {
    return (
      <>
        {header}
        <div className="card">
          <Notice title="Two scoring runs are needed">
            Score the contracts with both models, then return here.
          </Notice>
        </div>
      </>
    );
  }

  const choose = (key: 'a' | 'b', id: number) =>
    setParams({ a: String(key === 'a' ? id : a), b: String(key === 'b' ? id : b) });
  const data = comparison.data;
  const flaggedA = data ? data.flaggedByBoth + data.onlyA : 0;

  return (
    <>
      {header}
      <div className="compare-pickers">
        <RunSelect
          label="Model A (across)"
          value={a}
          runs={runs}
          onChange={(id) => choose('a', id)}
        />
        <RunSelect label="Model B (up)" value={b} runs={runs} onChange={(id) => choose('b', id)} />
      </div>

      {a === b ? (
        <div className="card">
          <Notice title="Choose two different runs">A run always agrees with itself.</Notice>
        </div>
      ) : comparison.error ? (
        <div className="card">
          <Notice
            title="The comparison could not be loaded"
            icon="info"
            action={{ label: 'Try again', onClick: comparison.reload }}
          />
        </div>
      ) : !data ? (
        <div className="card skeleton skeleton-block" aria-busy="true" />
      ) : (
        <>
          <dl className="tiles tiles-4">
            <Tile
              label="Flagged by both models"
              value={formatCount(data.flaggedByBoth)}
              count={{ to: data.flaggedByBoth, format: wholeCount }}
              note={`${formatPercent(flaggedA ? data.flaggedByBoth / flaggedA : 0)} of ${data.a.modelName}’s flags`}
              share={flaggedA ? data.flaggedByBoth / flaggedA : 0}
            />
            <Tile
              label={`Only ${data.a.modelName}`}
              value={formatCount(data.onlyA)}
              count={{ to: data.onlyA, format: wholeCount }}
              note="flagged by model A alone"
            />
            <Tile
              label={`Only ${data.b.modelName}`}
              value={formatCount(data.onlyB)}
              count={{ to: data.onlyB, format: wholeCount }}
              note="flagged by model B alone"
            />
            <Tile
              label="Rank agreement"
              value={data.rankCorrelation === null ? 'n/a' : data.rankCorrelation.toFixed(2)}
              count={
                data.rankCorrelation === null
                  ? undefined
                  : { to: data.rankCorrelation, format: twoDecimals }
              }
              note={`${agreement(data.rankCorrelation)} (Spearman, −1 to 1)`}
              share={Math.max(0, data.rankCorrelation ?? 0)}
            />
          </dl>

          <section className="compare-grid">
            <div className="card">
              <h2>Every contract, by both scores</h2>
              <p className="card-note">
                A contract on the diagonal got the same score from both models. The straight lines
                mark each model’s flagging score. Select a point to open the contract.
              </p>
              <ul className="legend legend-row">
                <li>
                  <span className="dot dot-both" /> Flagged by both
                </li>
                <li>
                  <span className="dot dot-onlyA" /> Only {data.a.modelName}
                </li>
                <li>
                  <span className="dot dot-onlyB" /> Only {data.b.modelName}
                </li>
                <li>
                  <span className="dot dot-neither" /> Neither
                </li>
              </ul>
              <ScatterPlot
                points={data.points}
                nameA={data.a.modelName}
                nameB={data.b.modelName}
                thresholdA={data.a.flagThreshold}
                thresholdB={data.b.flagThreshold}
                onOpen={(id) => navigate(`/contracts/${id}`)}
              />
              {data.points.length < data.contracts && (
                <p className="card-note">
                  Showing every contract flagged by either model and a sample of the rest (
                  {formatCount(data.points.length)} of {formatCount(data.contracts)}).
                </p>
              )}
            </div>

            <div className="card">
              <h2>Agreement at the top of the list</h2>
              <p className="card-note">
                Of each model’s highest-ranked contracts, how many appear in both lists.
              </p>
              <BarList
                items={data.topOverlap.map(({ top, shared }) => ({
                  key: String(top),
                  label: `Top ${top}`,
                  value: shared / top,
                  display: `${shared} shared`,
                }))}
                max={1}
              />
              <p className="card-note compare-caveat">
                Two models agreeing does not show that a contract involves wrongdoing. It shows only
                that the contract is unusual under both ways of measuring.
              </p>
            </div>
          </section>

          <section className="card queue">
            <div className="queue-head">
              <div>
                <h2>Where the models disagree most</h2>
                <p className="card-note">
                  Contracts flagged by one model and not the other, largest gap in rank first.
                </p>
              </div>
            </div>
            {data.disagreements.length === 0 ? (
              <Notice title="The two models flag the same contracts" icon="check" />
            ) : (
              <div className="table-wrap">
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th scope="col">Contract</th>
                      <th scope="col" className="col-num">
                        {data.a.modelName}
                      </th>
                      <th scope="col" className="col-num">
                        {data.b.modelName}
                      </th>
                      <th scope="col">Flagged by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.disagreements.map((row, index) => (
                      <tr key={row.id} style={{ '--i': index } as CSSProperties}>
                        <td className="col-contract">
                          <Link to={`/contracts/${row.id}`} className="row-link">
                            {row.title}
                          </Link>
                          <span className="cell-sub">{row.entityName}</span>
                        </td>
                        <td className="col-num">
                          {toPoints(row.scoreA)}
                          <span className="cell-sub">rank {formatCount(row.rankA)}</span>
                        </td>
                        <td className="col-num">
                          {toPoints(row.scoreB)}
                          <span className="cell-sub">rank {formatCount(row.rankB)}</span>
                        </td>
                        <td>
                          <span className="chip">
                            <span className={`dot ${row.flaggedA ? 'dot-onlyA' : 'dot-onlyB'}`} />
                            {row.flaggedA ? data.a.modelName : data.b.modelName} only
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
