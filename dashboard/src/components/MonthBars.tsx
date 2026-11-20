import { formatCount, plural } from '../format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthLabel = (month: string) => {
  const [year, index] = month.split('-');
  return `${MONTHS[Number(index) - 1] ?? index} ${year}`;
};

/** Every month from the first to the last, with empty months filled in, so bars are evenly spaced in time. */
export function fillMonths<T extends { month: string; contracts: number; flagged: number }>(
  months: T[],
): { month: string; contracts: number; flagged: number }[] {
  if (!months.length) return [];
  const found = new Map(months.map((month) => [month.month, month]));
  const [startYear, startMonth] = months[0]!.month.split('-').map(Number) as [number, number];
  const [endYear, endMonth] = months.at(-1)!.month.split('-').map(Number) as [number, number];
  const filled = [];
  for (
    let year = startYear, month = startMonth;
    year < endYear || (year === endYear && month <= endMonth);
  ) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    filled.push(found.get(key) ?? { month: key, contracts: 0, flagged: 0 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (filled.length > 120) break;
  }
  return filled;
}

/** Contracts per award month, with the flagged share of each bar in ink. */
export function MonthBars({
  months,
}: {
  months: { month: string; contracts: number; flagged: number }[];
}) {
  months = fillMonths(months);
  if (months.length < 2) return null;
  const highest = Math.max(...months.map((month) => month.contracts), 1);
  return (
    <>
      <div
        className="month-bars"
        role="img"
        aria-label={months
          .map(
            (month) =>
              `${monthLabel(month.month)}: ${plural(month.contracts, 'contract')}, ${formatCount(month.flagged)} flagged`,
          )
          .join('; ')}
      >
        {months.map((month) => (
          <span
            key={month.month}
            className="month-bar"
            style={{ height: `${Math.max(3, (month.contracts / highest) * 100)}%` }}
            title={`${monthLabel(month.month)}: ${plural(month.contracts, 'contract')}, ${formatCount(month.flagged)} flagged`}
          >
            <span
              className="month-bar-flagged"
              style={{
                height: `${month.contracts ? (month.flagged / month.contracts) * 100 : 0}%`,
              }}
            />
          </span>
        ))}
      </div>
      <div className="peer-axis" aria-hidden="true">
        <span>{monthLabel(months[0]!.month)}</span>
        <span>{monthLabel(months.at(-1)!.month)}</span>
      </div>
      <p className="peer-legend">
        <span className="peer-key is-own" /> Flagged
        <span className="peer-key" /> Not flagged
      </p>
    </>
  );
}
