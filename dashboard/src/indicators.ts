import type { Indicator, IndicatorResult } from './api';
import { formatPercent, plural } from './format';

export interface IndicatorInfo {
  /** Short name used in chips, filters and chart labels. */
  label: string;
  /** What the indicator measures, for the method page and tooltips. */
  measures: string;
  /** What it cannot tell a reviewer. */
  limit: string;
}

export const INDICATOR_ORDER: Indicator[] = [
  'single_requester',
  'repeated_winner',
  'price_deviation',
];

export const INDICATORS: Record<Indicator, IndicatorInfo> = {
  single_requester: {
    label: 'Few document requests',
    measures:
      'How many suppliers requested the bidding documents for the notice. One request suggests the tender drew little competitive interest.',
    limit:
      'PhilGEPS does not publish how many bids were submitted, so this is a proxy. A supplier can request documents without bidding, and documents can also be obtained directly from the agency.',
  },
  repeated_winner: {
    label: 'Repeated winner',
    measures:
      'The share of a procuring entity’s awards in the period that went to the same awardee.',
    limit:
      'A high share can have ordinary causes, such as few qualified contractors in a remote area. It cannot show how the awardee came to win.',
  },
  price_deviation: {
    label: 'Unusual price',
    measures:
      'How far the awarded price sits from the median of comparable contracts, relative to the approved budget.',
    limit:
      'Comparable contracts are grouped from published fields only. Differences in scope or site conditions that are not in the data can explain a deviation.',
  },
};

/** One plain sentence stating the figures behind an indicator, for a reviewer to verify. */
export function explain({ indicator, value, context }: IndicatorResult): string {
  if (value === null) return 'This could not be computed for this contract.';
  switch (indicator) {
    case 'single_requester': {
      const typical = context.typical_requests;
      const requests = `${plural(value, 'supplier')} requested the bidding documents.`;
      return typical === undefined ? requests : `${requests} The typical notice had ${typical}.`;
    }
    case 'repeated_winner': {
      const { wins, entity_awards: awards } = context;
      if (wins === undefined || awards === undefined) {
        return `This awardee received ${formatPercent(value)} of the entity’s awards.`;
      }
      return `This awardee received ${wins} of the ${plural(awards, 'contract')} this entity awarded (${formatPercent(value)}).`;
    }
    case 'price_deviation': {
      const { amount_to_budget_ratio: ratio, comparable_median_ratio: median } = context;
      if (ratio === undefined || median === undefined) {
        return `The price is ${formatPercent(Math.abs(value), 1)} ${value >= 0 ? 'above' : 'below'} the median of comparable contracts.`;
      }
      const count = context.comparable_count;
      const comparables =
        count === undefined ? 'comparable contracts' : `${plural(count, 'comparable contract')}`;
      return `Awarded at ${formatPercent(ratio, 1)} of the approved budget. The median for ${comparables} was ${formatPercent(median, 1)}.`;
    }
  }
}
