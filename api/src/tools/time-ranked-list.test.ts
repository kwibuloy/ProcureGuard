import { describe, expect, it } from 'vitest';
import { percentile, summarize } from './time-ranked-list.js';

describe('NFR-02 timing summary', () => {
  it('takes percentiles by nearest rank', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 100); // 100..2000 ms
    expect(percentile(sorted, 0.5)).toBe(1000);
    expect(percentile(sorted, 0.95)).toBe(1900);
    expect(percentile([], 0.95)).toBe(0);
  });

  it('passes when at least 95% finish within 3 seconds', () => {
    const times = [...Array(19).fill(500), 3500];
    expect(summarize(times, 0)).toMatchObject({ withinLimit: 19, share: 0.95, passed: true });
  });

  it('fails below 95%, or when any request fails', () => {
    expect(summarize([...Array(18).fill(500), 3500, 3500], 0).passed).toBe(false);
    // A failed request counts against the share and fails the run outright.
    expect(summarize(Array(19).fill(500), 1)).toMatchObject({ requests: 20, passed: false });
  });
});
