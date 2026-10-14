import type { Indicator, IndicatorResult } from './api';
import { formatCount, formatPercent, plural } from './format';

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

const number = (value: number | string | undefined) =>
  typeof value === 'number' ? value : undefined;

/** A contribution smaller than this (half a point) is not worth naming as a reason. */
export const NOTABLE = 0.005;

/**
 * The figures behind an indicator in one short line, for the queue's Why column.
 * Returns null when the indicator could not be computed.
 */
export function reason({ indicator, value, context }: IndicatorResult): string | null {
  if (value === null) return null;
  switch (indicator) {
    case 'single_requester': {
      const typical = number(context.typical_requests);
      const who = value === 1 ? 'Only 1 supplier' : plural(value, 'supplier');
      const compared = typical === undefined ? '' : `; a typical notice had ${typical}`;
      return `${who} requested the bidding documents${compared}.`;
    }
    case 'repeated_winner': {
      const wins = number(context.wins);
      const awards = number(context.entity_awards);
      if (wins === undefined || awards === undefined) {
        return `This awardee won ${formatPercent(value)} of this entity’s contracts.`;
      }
      return `This awardee won ${formatCount(wins)} of this entity’s ${plural(awards, 'contract')} (${formatPercent(value)}).`;
    }
    case 'price_deviation': {
      const ratio = number(context.amount_to_budget_ratio);
      const median = number(context.comparable_median_ratio);
      if (ratio === undefined || median === undefined) {
        return `Priced ${formatPercent(Math.abs(value), 1)} ${value >= 0 ? 'above' : 'below'} comparable contracts.`;
      }
      return `Awarded at ${formatPercent(ratio, 1)} of the approved budget; comparable contracts were at ${formatPercent(median, 1)}.`;
    }
  }
}

/** One plain sentence stating the figures behind an indicator, for a reviewer to verify. */
export function explain({ indicator, value, context }: IndicatorResult): string {
  if (value === null) {
    const why = context.why_missing;
    const reason =
      typeof why === 'string' ? `Not computed: ${why}.` : 'Not computed for this contract.';
    return `${reason} It was treated as typical when scoring.`;
  }
  switch (indicator) {
    case 'single_requester': {
      const typical = number(context.typical_requests);
      const requests = `${plural(value, 'supplier')} requested the bidding documents.`;
      return typical === undefined ? requests : `${requests} The typical notice had ${typical}.`;
    }
    case 'repeated_winner': {
      const wins = number(context.wins);
      const awards = number(context.entity_awards);
      if (wins === undefined || awards === undefined) {
        return `This awardee received ${formatPercent(value)} of the entity’s awards.`;
      }
      return `This awardee received ${wins} of the ${plural(awards, 'contract')} this entity awarded (${formatPercent(value)}).`;
    }
    case 'price_deviation': {
      const ratio = number(context.amount_to_budget_ratio);
      const median = number(context.comparable_median_ratio);
      if (ratio === undefined || median === undefined) {
        return `The price is ${formatPercent(Math.abs(value), 1)} ${value >= 0 ? 'above' : 'below'} the median of comparable contracts.`;
      }
      const count = number(context.comparable_count);
      const basis =
        typeof context.comparable_basis === 'string' ? ` (${context.comparable_basis})` : '';
      const comparables =
        count === undefined ? 'comparable contracts' : plural(count, 'comparable contract');
      return `Awarded at ${formatPercent(ratio, 1)} of the approved budget. The median for ${comparables}${basis} was ${formatPercent(median, 1)}.`;
    }
  }
}
