import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, readView, viewParams } from './view';

describe('view settings', () => {
  it('opens ungrouped, with every column', () => {
    expect(readView(new URLSearchParams())).toEqual(DEFAULT_VIEW);
    expect(viewParams(DEFAULT_VIEW)).toEqual({ group: '', hide: '', compact: '' });
  });

  it('round-trips through the page address', () => {
    const view = { grouped: true, hidden: new Set(['entity', 'why'] as const), compact: true };
    const params = new URLSearchParams(viewParams(view));

    expect(readView(params)).toEqual(view);
  });

  it('still reads old links that hid the removed % of budget column', () => {
    expect(readView(new URLSearchParams({ hide: 'share' })).hidden.size).toBe(0);
    expect(readView(new URLSearchParams({ hide: 'none' })).hidden.size).toBe(0);
  });

  it('ignores unknown column names in a link', () => {
    expect([...readView(new URLSearchParams({ hide: 'why,<script>' })).hidden]).toEqual(['why']);
  });
});
