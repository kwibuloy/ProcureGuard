import { describe, expect, it } from 'vitest';
import { currentRunId } from './run';

describe('currentRunId', () => {
  it('picks the latest Isolation Forest run, as the API does', () => {
    const runs = [
      { id: 30, modelName: 'Clustering' },
      { id: 27, modelName: 'Isolation Forest' },
      { id: 26, modelName: 'Isolation Forest' },
    ];
    expect(currentRunId(runs)).toBe(27);
  });

  it('falls back to the latest run of any model, and to none when there are no runs', () => {
    expect(currentRunId([{ id: 5, modelName: 'Other' }])).toBe(5);
    expect(currentRunId([])).toBeNull();
  });
});
