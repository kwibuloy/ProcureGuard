import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ContractRow } from '../api';
import { BarList } from './BarList';
import { ContractTable } from './ContractTable';

const ROW: ContractRow = {
  id: 7,
  rank: 3,
  score: 0.87,
  flagged: true,
  title: 'Concreting of Farm-to-Market Road',
  awardReference: 'A-100',
  entity: 'MUNICIPALITY OF SAMPLE',
  entityName: 'Municipality of Sample',
  region: 'Region I',
  awardee: 'ABC CONSTRUCTION',
  awardeeName: 'ABC Construction',
  amount: 1_500_000,
  budget: 1_600_000,
  awardDate: '2024-03-05',
  mainReason: 'single_requester',
  contributions: { single_requester: 0.3, repeated_winner: -0.05, price_deviation: 0.04 },
  indicators: [
    {
      indicator: 'single_requester',
      value: 1,
      contribution: 0.3,
      context: { document_requests: 1, typical_requests: 6 },
    },
    {
      indicator: 'repeated_winner',
      value: 0.2,
      contribution: -0.05,
      context: { wins: 2, entity_awards: 10 },
    },
    {
      indicator: 'price_deviation',
      value: 0.03,
      contribution: 0.04,
      context: { amount_to_budget_ratio: 0.999, comparable_median_ratio: 0.97 },
    },
  ],
};

describe('ContractTable', () => {
  const table = (props: Partial<Parameters<typeof ContractTable>[0]> = {}) =>
    render(
      <MemoryRouter>
        <ContractTable
          rows={[ROW]}
          threshold={0.6}
          contractLink={(id) => ({ pathname: `/contracts/${id}` })}
          {...props}
        />
      </MemoryRouter>,
    );

  it('links the row to its contract and the names to their pages', () => {
    table();

    expect(screen.getByRole('link', { name: ROW.title })).toHaveAttribute('href', '/contracts/7');
    expect(screen.getByRole('link', { name: 'Municipality of Sample' })).toHaveAttribute(
      'href',
      '/profile/entity?name=MUNICIPALITY+OF+SAMPLE',
    );
    expect(screen.getByRole('link', { name: 'ABC Construction' })).toHaveAttribute(
      'href',
      '/profile/awardee?name=ABC+CONSTRUCTION',
    );
  });

  it('shows the score out of 100 and the published names', () => {
    table();

    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('Few document requests')).toBeInTheDocument();
  });

  it('says why in words, with the figures behind the main reason', () => {
    table();

    expect(
      screen.getByText('Only 1 supplier requested the bidding documents; a typical notice had 6.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Also raised the score: unusual price +4.0')).toBeInTheDocument();
  });

  it('says so when no indicator raised the score', () => {
    table({ rows: [{ ...ROW, indicators: [], contributions: {} }] });

    expect(screen.getByText('Nothing stands out')).toBeInTheDocument();
  });

  it('marks a contract the reviewer has already reviewed', () => {
    table({ reviewed: new Set([7]) });

    expect(screen.getByTitle('Marked as reviewed in this browser')).toBeInTheDocument();
  });

  it('leaves out the column that would repeat the page subject', () => {
    table({ hide: 'entity' });

    expect(screen.queryByRole('columnheader', { name: 'Procuring entity' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Awardee' })).toBeInTheDocument();
  });
});

describe('BarList', () => {
  const items = [
    { key: 'a', label: 'Top 10', value: 7, display: '7 shared' },
    { key: 'b', label: 'Top 25', value: 14, display: '14 shared' },
  ];

  it('sizes bars against the largest value', () => {
    const { container } = render(<BarList items={items} />);

    const fills = [...container.querySelectorAll<HTMLElement>('.bar-list-fill')];
    expect(fills.map((fill) => fill.style.width)).toEqual(['50%', '100%']);
  });

  it('reports which bar was chosen and shows the current choice', async () => {
    const onSelect = vi.fn();
    render(<BarList items={items} selected="b" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /Top 10/ }));

    expect(onSelect).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: /Top 25/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
