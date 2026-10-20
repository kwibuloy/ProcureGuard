import { describe, expect, it } from 'vitest';
import { amountFacts } from './amounts';

describe('amountFacts', () => {
  it('keeps plain labels for a notice with one award', () => {
    expect(
      amountFacts({ budget: 1_000_000, amount: 921_000, itemBudget: 1_000_000, noticeAwards: 1 }),
    ).toEqual({
      budgetLabel: 'Approved budget',
      budgetNote: null,
      amountLabel: 'Contract amount',
      amountNote: '92.1% of budget',
    });
  });

  it('says the budget covers the whole notice and compares the award with its lot', () => {
    const facts = amountFacts({
      budget: 24_997_404,
      amount: 2_495_466,
      itemBudget: 2_499_947,
      noticeAwards: 10,
    });

    expect(facts.budgetLabel).toBe('Approved budget, whole notice');
    expect(facts.budgetNote).toBe('Shared by 10 awards');
    expect(facts.amountLabel).toBe('Contract amount, this award');
    expect(facts.amountNote).toMatch(/^99\.8% of its lot budget \(₱2,499,947(\.00)?\)$/);
  });

  it('falls back to the whole notice budget when the lot budget is not published', () => {
    const facts = amountFacts({
      budget: 2_000_000,
      amount: 500_000,
      itemBudget: null,
      noticeAwards: 4,
    });

    expect(facts.amountNote).toBe('25.0% of the whole notice’s budget');
  });
});
