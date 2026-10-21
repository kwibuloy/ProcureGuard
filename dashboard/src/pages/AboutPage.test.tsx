import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutPage } from './AboutPage';

const QUALITY = {
  contracts: 90204,
  publicBidding: 80000,
  firstPublished: '2024-01-01',
  lastPublished: '2024-12-31',
  awardedBeforePublished: 3,
  amountAboveBudget: 15,
  documentRequests: { wanted: 80000, collected: 105 },
  fields: [
    { field: 'approved_budget', label: 'Approved budget', present: 90000, usedFor: 'Price' },
  ],
  load: {
    loadedAt: '2026-10-20T00:00:00Z',
    sourceFiles: ['legacy_2024_Q1.csv'],
    intake: {
      rows_read: 1898371,
      civil_works_rows: 228804,
      contracts: 90247,
      not_civil_works: 1669081,
    },
  },
};

function renderAbout() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(QUALITY), { status: 200 })),
  );
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AboutPage', () => {
  it('puts common questions, the method and the data on one page', async () => {
    renderAbout();

    expect(screen.getByRole('heading', { name: 'Common questions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How ProcureGuard works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About the data' })).toBeInTheDocument();
    expect(await screen.findByText('Contracts available for scoring')).toBeInTheDocument();
    expect(screen.getByText('105 of 80,000 public bidding contracts')).toBeInTheDocument();
  });

  it('answers that a flag is not an accusation', async () => {
    renderAbout();

    await userEvent.click(screen.getByText('Is a flagged contract an accusation?'));

    expect(screen.getByText(/It is not evidence of corruption/)).toBeVisible();
  });

  it('never calls document requests bids or bidders, except to say they are not', () => {
    renderAbout();

    const indicatorText = screen.getByRole('heading', { name: 'The three indicators' })
      .parentElement!.textContent!;
    expect(indicatorText).toContain('requested the bidding documents');
    expect(indicatorText).not.toMatch(/number of bidders/i);
  });
});
