import { describe, expect, it } from 'vitest';
import { explain, reason } from './indicators';

describe('explain', () => {
  it('states the document request count beside the typical count', () => {
    const sentence = explain({
      indicator: 'single_requester',
      value: 1,
      contribution: 0.3,
      context: { document_requests: 1, typical_requests: 4 },
    });

    expect(sentence).toBe('1 supplier requested the bidding documents. The typical notice had 4.');
  });

  it('never calls document requests bids or bidders', () => {
    const sentence = explain({
      indicator: 'single_requester',
      value: 1,
      contribution: 0.3,
      context: {},
    });

    expect(sentence).not.toMatch(/\bbid(s|der|ders)?\b/i);
  });

  it('gives the counts behind a repeated-winner share', () => {
    const sentence = explain({
      indicator: 'repeated_winner',
      value: 0.8,
      contribution: 0.22,
      context: { wins: 20, entity_awards: 25 },
    });

    expect(sentence).toBe('This awardee won 20 of the 25 bid notices this entity awarded (80%).');
  });

  it('compares the price with comparable contracts', () => {
    const sentence = explain({
      indicator: 'price_deviation',
      value: -0.32,
      contribution: 0.39,
      context: {
        amount_to_budget_ratio: 0.662,
        comparable_median_ratio: 0.977,
        comparable_count: 81,
        comparable_basis: 'same region and budget band',
      },
    });

    expect(sentence).toBe(
      'Awarded at 66.2% of the approved budget. The median for 81 comparable contracts (same region and budget band) was 97.7%.',
    );
  });

  it('names the line items budget when only some lines of a notice were awarded', () => {
    const result = {
      indicator: 'price_deviation' as const,
      value: 0.0,
      contribution: 0.01,
      context: {
        amount_to_budget_ratio: 0.99,
        comparable_median_ratio: 0.99,
        comparable_count: 728,
        comparable_basis: 'same region and budget band',
        budget_compared: 'budget of the awarded line items',
      },
    };

    expect(explain(result)).toBe(
      'Awarded at 99.0% of the budget of the awarded line items. The median for 728 comparable contracts (same region and budget band) was 99.0%.',
    );
    expect(reason(result)).toBe(
      'Awarded at 99.0% of the budget of the awarded line items; comparable contracts were at 99.0%.',
    );
  });

  it('says the price is for the whole notice when it was awarded in several lots', () => {
    const sentence = explain({
      indicator: 'price_deviation',
      value: 0.0,
      contribution: 0.01,
      context: {
        amount_to_budget_ratio: 0.95,
        comparable_median_ratio: 0.95,
        comparable_count: 30,
        comparable_basis: 'same budget band',
        budget_compared: 'approved budget',
        notice_award_count: 2,
      },
    });

    expect(sentence).toBe(
      'This notice’s 2 awards together came to 95.0% of the approved budget. The median for 30 comparable contracts (same budget band) was 95.0%.',
    );
  });

  it('says why a price was left out when a line item has several award notices', () => {
    const sentence = explain({
      indicator: 'price_deviation',
      value: null,
      contribution: 0,
      context: {
        why_missing:
          'its notice has more than one award notice for the same line item, so the awarded total is not known',
      },
    });

    expect(sentence).toBe(
      'Not computed: its notice has more than one award notice for the same line item, so the awarded total is not known. It was treated as typical when scoring.',
    );
  });

  it('says why an indicator was not computed and how it was treated', () => {
    const sentence = explain({
      indicator: 'repeated_winner',
      value: null,
      contribution: 0,
      context: { why_missing: 'the entity awarded fewer than 5 bid notices', entity_awards: 2 },
    });

    expect(sentence).toBe(
      'Not computed: the entity awarded fewer than 5 bid notices. It was treated as typical when scoring.',
    );
  });
});
