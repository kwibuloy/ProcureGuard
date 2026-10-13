import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatContribution,
  formatDate,
  formatPeso,
  percentileFromRank,
  plural,
  toPoints,
} from './format';

describe('formatContribution', () => {
  it('shows points with a sign', () => {
    expect(formatContribution(0.27)).toBe('+27');
    expect(formatContribution(-0.045)).toBe('−4.5');
  });

  it('shows no sign for a contribution that rounds to nothing', () => {
    expect(formatContribution(0)).toBe('0');
    expect(formatContribution(-0.0001)).toBe('0');
  });
});

describe('scores and ranks', () => {
  it('shows a 0 to 1 score as whole points out of 100', () => {
    expect(toPoints(0.874)).toBe(87);
  });

  it('turns a rank into the share of contracts that are less unusual', () => {
    expect(percentileFromRank(1, 101)).toBe(1);
    expect(percentileFromRank(51, 101)).toBe(0.5);
    expect(percentileFromRank(1, 1)).toBe(0);
  });
});

describe('missing values', () => {
  it('says a value was not published instead of showing zero or a blank', () => {
    expect(formatPeso(null)).toBe('Not published');
    expect(formatDate(null)).toBe('Not published');
    expect(daysBetween('2024-01-01', null)).toBeNull();
  });
});

describe('dates and counts', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2024-04-21', '2024-05-12')).toBe(21);
  });

  it('formats a date without shifting it across time zones', () => {
    expect(formatDate('2024-05-31')).toContain('31');
    expect(formatDate('2024-05-31')).toContain('2024');
  });

  it('uses the singular for one', () => {
    expect(plural(1, 'supplier')).toBe('1 supplier');
    expect(plural(2, 'supplier')).toBe('2 suppliers');
  });
});
