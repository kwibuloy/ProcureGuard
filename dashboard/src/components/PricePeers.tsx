import { useApi, withRun } from '../api';
import { formatCount, formatPercent } from '../format';

export interface PricePeersData {
  basis: string;
  region: string | null;
  ratio: number;
  median: number | null;
  peers: number;
  below: number;
  /** `from` is null for the "below 80%" bar, `to` for the "100% or more" bar. */
  bins: { from: number | null; to: number | null; count: number }[];
}

/**
 * Where this contract's price (award as a share of budget) sits among the
 * contracts it was compared with. Awards cluster just under the budget, so each
 * bar is one percentage point from 80% to 100%, with one bar either side.
 */
export function PricePeers({ contractId, runId }: { contractId: number; runId: number | null }) {
  const peers = useApi<PricePeersData>(
    runId ? withRun(`/api/contracts/${contractId}/price-peers`, runId) : null,
  );
  const data = peers.data;
  if (peers.error || !data || data.peers < 2) return null;

  const highest = Math.max(...data.bins.map((bin) => bin.count), 1);
  const ownBin = data.bins.findIndex((bin) => bin.to === null || data.ratio < bin.to);
  const binLabel = (bin: PricePeersData['bins'][number] | undefined) =>
    !bin
      ? ''
      : bin.from === null
        ? `below ${formatPercent(bin.to ?? 0.8)}`
        : bin.to === null
          ? `${formatPercent(bin.from)} or more`
          : `${formatPercent(bin.from)} to ${formatPercent(bin.to)}`;
  const group =
    data.basis === 'same region and budget band' && data.region
      ? `contracts in ${data.region} with a similar budget`
      : data.basis === 'same budget band'
        ? 'contracts nationwide with a similar budget'
        : 'all scored contracts';
  const share = data.below / data.peers;

  return (
    <section className="price-peers" id="case-price" data-case="Price">
      <h3>Price compared with similar contracts</h3>
      <p className="section-note">
        Awarded at {formatPercent(data.ratio, 1)} of its budget. Among {formatCount(data.peers)}{' '}
        {group}, the median was{' '}
        {data.median === null ? 'not available' : formatPercent(data.median, 1)}, and{' '}
        {formatPercent(share, share > 0.99 || share < 0.01 ? 1 : 0)} were awarded at a lower share.
      </p>
      <div
        className="peer-bars"
        role="img"
        aria-label={`Distribution of ${formatCount(data.peers)} comparable contracts by award as a share of budget; this contract is in the bar for ${binLabel(data.bins[ownBin])} of budget.`}
      >
        {data.bins.map((bin, index) => (
          <span
            key={index}
            className={`peer-bar ${index === ownBin ? 'is-own' : ''}`}
            style={{ height: `${Math.max(2, (bin.count / highest) * 100)}%` }}
            title={`${binLabel(bin)} of budget: ${formatCount(bin.count)} contracts`}
          />
        ))}
      </div>
      <div className="peer-axis" aria-hidden="true">
        <span>below 80%</span>
        <span>90% of budget</span>
        <span>100%+</span>
      </div>
      <p className="peer-legend">
        <span className="peer-key is-own" /> This contract
        <span className="peer-key" /> Comparable contracts
      </p>
    </section>
  );
}
