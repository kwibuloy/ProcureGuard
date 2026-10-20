import { formatCount, formatPercent, formatPeso, formatPesoCompact, plural } from './format';

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

/**
 * For a list row standing for a notice awarded in lots: how many other awards
 * it stands for, and the notice's total. Null for a notice with one award.
 */
export function noticeSummary(row: { noticeAwards: number; noticeAmount: number | null }) {
  if (row.noticeAwards <= 1) return null;
  const others = row.noticeAwards - 1;
  return {
    others: `+${plural(others, 'more award')} in this notice`,
    total: `${formatPesoCompact(row.noticeAmount)} whole notice`,
  };
}

/** The queue's count line: contracts, and the notices they are grouped into. */
export function listCount(total: number, matchedContracts: number): string {
  return matchedContracts > total
    ? `${plural(matchedContracts, 'contract')} in ${formatCount(total)} bid notices`
    : plural(total, 'contract');
}

/**
 * The list's % of budget for a row: the award against its own lot budget when
 * the notice has lots and one is published, otherwise against the approved
 * budget; a grouped row is the notice's total against the approved budget.
 */
export function budgetShare(
  row: {
    amount: number | null;
    budget: number | null;
    itemBudget: number | null;
    noticeAwards: number;
    noticeAmount: number | null;
  },
  grouped: boolean,
): { share: number; basis: string | null } | null {
  if (grouped && row.noticeAwards > 1) {
    return row.noticeAmount !== null && row.budget
      ? { share: row.noticeAmount / row.budget, basis: 'notice total' }
      : null;
  }
  if (row.amount === null) return null;
  if (row.noticeAwards > 1 && row.itemBudget) {
    return { share: row.amount / row.itemBudget, basis: 'of lot budget' };
  }
  if (!row.budget) return null;
  return { share: row.amount / row.budget, basis: row.noticeAwards > 1 ? 'of whole notice' : null };
}
