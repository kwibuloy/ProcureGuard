const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});
const pesoCompact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('en-PH');
const dayMonthYear = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const MISSING = 'Not published';

export const formatPeso = (value: number | null) => (value === null ? MISSING : peso.format(value));

export const formatPesoCompact = (value: number | null) =>
  value === null ? MISSING : pesoCompact.format(value);

export const formatCount = (value: number) => whole.format(value);

/** For a figure that counts up: every step on the way is shown as a whole number. */
export const wholeCount = (value: number) => formatCount(Math.round(value));

/** Scores are stored from 0 to 1 and shown from 0 to 100. */
export const toPoints = (score: number) => Math.round(score * 100);

/** A signed contribution in points, e.g. "+27" or "−4.5". */
export function formatContribution(contribution: number): string {
  const points = contribution * 100;
  const magnitude =
    Math.abs(points) >= 9.95 ? Math.abs(points).toFixed(0) : Math.abs(points).toFixed(1);
  if (Number(magnitude) === 0) return '0';
  return `${points > 0 ? '+' : '−'}${magnitude}`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return MISSING;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? MISSING : dayMonthYear.format(date);
}

export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const milliseconds = Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10));
  return Number.isNaN(milliseconds) ? null : Math.round(milliseconds / 86_400_000);
}

/** Share of scored contracts this one is more unusual than, from its rank. */
export function percentileFromRank(rank: number, total: number): number {
  return total <= 1 ? 0 : (total - rank) / (total - 1);
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
