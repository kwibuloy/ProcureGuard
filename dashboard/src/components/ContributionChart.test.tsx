import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IndicatorResult } from '../api';
import { ContributionChart } from './ContributionChart';

const INDICATORS: IndicatorResult[] = [
  { indicator: 'single_requester', value: 1, contribution: 0.3, context: { typical_requests: 4 } },
  { indicator: 'repeated_winner', value: 0.1, contribution: -0.05, context: {} },
  { indicator: 'price_deviation', value: null, contribution: 0, context: {} },
];

describe('ContributionChart', () => {
  it('shows every indicator with its points and the reason in words', () => {
    render(<ContributionChart indicators={INDICATORS} baseValue={0.3} score={0.55} />);

    expect(screen.getByText('Few document requests')).toBeInTheDocument();
    expect(screen.getAllByText('+30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('−5.0').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 supplier requested the bidding documents/)).toBeInTheDocument();
    expect(screen.getByText(/Not computed for this contract/)).toBeInTheDocument();
  });

  it('draws bars by direction and none for a zero contribution', () => {
    const { container } = render(
      <ContributionChart indicators={INDICATORS} baseValue={0.3} score={0.55} />,
    );

    expect(container.querySelectorAll('.contribution-bar.is-raising')).toHaveLength(1);
    expect(container.querySelectorAll('.contribution-bar.is-lowering')).toHaveLength(1);
    expect(container.querySelectorAll('.contribution-bar')).toHaveLength(2);
  });

  it('shows how the starting level and contributions add up to the score', () => {
    render(<ContributionChart indicators={INDICATORS} baseValue={0.3} score={0.55} />);

    expect(screen.getByText('Starting level 30')).toBeInTheDocument();
    expect(screen.getByText('Score 55')).toBeInTheDocument();
  });
});
