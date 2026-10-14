import { describe, expect, it } from 'vitest';
import { explain } from './indicators';

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

    expect(sentence).toBe(
      'This awardee received 20 of the 25 contracts this entity awarded (80%).',
    );
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

  it('says why an indicator was not computed and how it was treated', () => {
    const sentence = explain({
      indicator: 'repeated_winner',
      value: null,
      contribution: 0,
      context: { why_missing: 'the entity awarded fewer than 5 contracts', entity_awards: 2 },
    });

    expect(sentence).toBe(
      'Not computed: the entity awarded fewer than 5 contracts. It was treated as typical when scoring.',
    );
  });
});
