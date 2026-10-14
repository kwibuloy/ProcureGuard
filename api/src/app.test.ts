import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { Db } from './queries.js';

const RUN = { id: 7, modelName: 'test', isDemo: false };

/** A fake database that answers the latest-run query and records every other one. */
function fakeDb(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => ({
    rows: sql.includes('FROM scoring_runs') ? [RUN] : rows,
  }));
  return { db: { query } as unknown as Db, query };
}

const lastCall = (query: ReturnType<typeof fakeDb>['query']) => query.mock.calls.at(-1)!;

describe('GET /api/contracts', () => {
  it('returns items without the internal total column', async () => {
    const { db } = fakeDb([{ id: 1, title: 'Road', total: 42 }]);

    const response = await request(createApp(db)).get('/api/contracts');

    expect(response.body).toEqual({
      total: 42,
      page: 1,
      pageSize: 25,
      items: [{ id: 1, title: 'Road', indicators: [] }],
    });
  });

  it('passes search text as a parameter, never inside the SQL', async () => {
    const { db, query } = fakeDb();
    const attack = "'; DROP TABLE contracts; --";

    await request(createApp(db)).get('/api/contracts').query({ q: attack });

    const [sql, params] = lastCall(query);
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toContain(`%${attack}%`);
  });

  it('escapes wildcard characters in search text', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ q: '100%_done' });

    expect(lastCall(query)[1]).toContain('%100\\%\\_done%');
  });

  it('ignores an unknown sort or reason instead of putting it in the query', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db))
      .get('/api/contracts')
      .query({ sort: 'c.title; DELETE', reason: 'bribery' });

    const [sql, params] = lastCall(query);
    expect(sql).toContain('ORDER BY s.score_rank ASC');
    expect(sql).not.toContain('DELETE');
    expect(params).toEqual([RUN.id, 25, 0]);
  });

  it('caps the page size', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ pageSize: 100000, page: 3 });

    expect(lastCall(query)[1]).toEqual([RUN.id, 100, 200]);
  });

  it('answers with an empty list when nothing has been scored yet', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) } as unknown as Db;

    const response = await request(createApp(db)).get('/api/contracts');

    expect(response.body.items).toEqual([]);
  });
});

describe('GET /api/contracts/:id', () => {
  it('returns 404 for an id that is not a positive whole number', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db)).get('/api/contracts/abc');

    expect(response.status).toBe(404);
  });

  it('returns 404 when the contract is not in the latest run', async () => {
    const { db } = fakeDb([]);

    const response = await request(createApp(db)).get('/api/contracts/5');

    expect(response.status).toBe(404);
  });
});

describe('read-only API', () => {
  it('has no route that writes', async () => {
    const { db } = fakeDb();
    const app = createApp(db);

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app)[method]('/api/contracts/1');
      expect(response.status).toBe(404);
    }
  });
});
