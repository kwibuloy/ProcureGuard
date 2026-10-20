import { describe, expect, it } from 'vitest';
import { amountFacts, budgetShare, listCount, noticeSummary } from './amounts';

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

describe('noticeSummary', () => {
  it('says how many other awards a notice row stands for and their total', () => {
    expect(noticeSummary({ noticeAwards: 10, noticeAmount: 24_962_081 })).toEqual({
      others: '+9 more awards in this notice',
      total: expect.stringMatching(/whole notice$/),
    });
    expect(noticeSummary({ noticeAwards: 1, noticeAmount: 900_000 })).toBeNull();
  });
});

describe('listCount', () => {
  it('names the notices only when lots were grouped', () => {
    expect(listCount(4_200, 4_511)).toBe('4,511 contracts in 4,200 bid notices');
    expect(listCount(12, 12)).toBe('12 contracts');
  });
});

describe('budgetShare', () => {
  const lot = {
    amount: 2_495_466,
    budget: 24_997_404,
    itemBudget: 2_499_947,
    noticeAwards: 10,
    noticeAmount: 24_962_081,
  };

  it('compares a lot with its own budget, and a grouped notice as a whole', () => {
    expect(budgetShare(lot, false)).toEqual({
      share: 2_495_466 / 2_499_947,
      basis: 'of lot budget',
    });
    expect(budgetShare(lot, true)).toEqual({
      share: 24_962_081 / 24_997_404,
      basis: 'notice total',
    });
  });

  it('uses the approved budget for a single award, and says when it is the whole notice', () => {
    expect(budgetShare({ ...lot, noticeAwards: 1 }, false)).toEqual({
      share: 2_495_466 / 24_997_404,
      basis: null,
    });
    expect(budgetShare({ ...lot, itemBudget: null }, false)?.basis).toBe('of whole notice');
  });
});
