import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, readView, viewParams } from './view';

describe('view settings', () => {
  it('opens ungrouped, with every column but % of budget', () => {
    expect(readView(new URLSearchParams())).toEqual(DEFAULT_VIEW);
    expect(viewParams(DEFAULT_VIEW)).toEqual({ group: '', hide: '', compact: '' });
  });

  it('round-trips through the page address', () => {
    const view = { grouped: true, hidden: new Set(['entity', 'why'] as const), compact: true };
    const params = new URLSearchParams(viewParams(view));

    expect(readView(params)).toEqual(view);
  });

  it('tells "show every column" apart from the default', () => {
    const all = { ...DEFAULT_VIEW, hidden: new Set<never>() };

    expect(viewParams(all).hide).toBe('none');
    expect(readView(new URLSearchParams({ hide: 'none' })).hidden.size).toBe(0);
  });

  it('ignores unknown column names in a link', () => {
    expect([...readView(new URLSearchParams({ hide: 'why,<script>' })).hidden]).toEqual(['why']);
  });
});
