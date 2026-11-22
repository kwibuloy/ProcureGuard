import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { Db } from './queries.js';

/** A fake database: scoring_runs lookups answer with the run asked for, the rest with `rows`. */
function fakeDb(rows: Record<string, unknown>[] = [], knownRuns = [7, 8]) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM scoring_runs WHERE id')) {
      const id = params?.[0] as number;
      return { rows: knownRuns.includes(id) ? [{ id, modelName: `model ${id}` }] : [] };
    }
    if (sql.includes('FROM scoring_runs')) return { rows: [{ id: 8, modelName: 'model 8' }] };
    return { rows };
  });
  return { db: { query } as unknown as Db, query };
}

describe('GET /api/suggest', () => {
  it('suggests nothing for fewer than two characters, without searching', async () => {
    const { db, query } = fakeDb();

    const response = await request(createApp(db)).get('/api/suggest').query({ q: 'a' });

    expect(response.body).toEqual({ contracts: [], entities: [], awardees: [], places: [] });
    expect(query.mock.calls.some(([sql]) => sql.includes('ILIKE'))).toBe(false);
  });

  it('passes typed wildcards as literal text, through parameters', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/suggest').query({ q: '50%_off' });

    const searches = query.mock.calls.filter(([sql]) => sql.includes('ILIKE'));
    expect(searches).toHaveLength(4);
    for (const [sql, params] of searches) {
      expect(sql).not.toContain('50%');
      expect(params).toContain(String.raw`%50\%\_off%`);
    }
  });
});

describe('GET /api/run-compare', () => {
  it('refuses the same run twice', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db)).get('/api/run-compare').query({ from: 7, to: 7 });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a run that does not exist', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db))
      .get('/api/run-compare')
      .query({ from: 7, to: 99 });

    expect(response.status).toBe(404);
  });

  it('caps the list at 100 contracts', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/run-compare').query({ from: 7, to: 8, limit: 5000 });

    const [, params] = query.mock.calls.find(([sql]) =>
      sql.includes('LEFT JOIN contract_scores a'),
    )!;
    expect(params).toEqual([7, 8, 100]);
  });
});
