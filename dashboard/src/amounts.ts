import { formatPercent, formatPeso, plural } from './format';

export interface AmountFacts {
  budgetLabel: string;
  budgetNote: string | null;
  amountLabel: string;
  amountNote: string | null;
}

interface Amounts {
  budget: number | null;
  amount: number | null;
  itemBudget: number | null;
  noticeAwards: number;
}

/**
 * Labels for the budget and amount on the contract card. When a notice was
 * awarded in lots, its approved budget covers all of them while the contract
 * amount is one lot, so both say which they are and the amount is compared
 * with its own lot's budget where that is published.
 */
export function amountFacts({ budget, amount, itemBudget, noticeAwards }: Amounts): AmountFacts {
  if (noticeAwards <= 1) {
    return {
      budgetLabel: 'Approved budget',
      budgetNote: null,
      amountLabel: 'Contract amount',
      amountNote:
        amount !== null && budget ? `${formatPercent(amount / budget, 1)} of budget` : null,
    };
  }
  let amountNote: string | null = null;
  if (amount !== null && itemBudget) {
    amountNote = `${formatPercent(amount / itemBudget, 1)} of its lot budget (${formatPeso(itemBudget)})`;
  } else if (amount !== null && budget) {
    amountNote = `${formatPercent(amount / budget, 1)} of the whole notice’s budget`;
  }
  return {
    budgetLabel: 'Approved budget, whole notice',
    budgetNote: `Shared by ${plural(noticeAwards, 'award')}`,
    amountLabel: 'Contract amount, this award',
    amountNote,
  };
}
