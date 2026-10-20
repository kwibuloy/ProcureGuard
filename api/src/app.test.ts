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
  it('returns items without the internal grouping columns', async () => {
    const { db } = fakeDb([
      { id: 1, title: 'Road', total: 42, matchedContracts: 50, lot_order: 1, matched_in_notice: 2 },
    ]);

    const response = await request(createApp(db)).get('/api/contracts');

    expect(response.body).toEqual({
      total: 42,
      matchedContracts: 50,
      screenedMatches: null,
      closeMatches: [],
      page: 1,
      pageSize: 25,
      items: [{ id: 1, title: 'Road', indicators: [] }],
    });
  });

  it('passes search text as a parameter, never inside the SQL', async () => {
    const { db, query } = fakeDb();
    const attack = "'; DROP TABLE contracts; --";

    await request(createApp(db)).get('/api/contracts').query({ q: attack });

    for (const [sql] of query.mock.calls) expect(sql.toLowerCase()).not.toContain('drop table');
    const [, params] = lastCall(query);
    expect(params).toEqual(expect.arrayContaining(['%drop%', '%table%', "%';%"]));
  });

  it('needs every word to match, in any order', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ q: 'Road  IMUS road' });

    const [sql, params] = lastCall(query);
    expect(sql.match(/c\.search_text LIKE/g)).toHaveLength(2);
    expect(params).toEqual(expect.arrayContaining(['%road%', '%imus%']));
  });

  it('matches close spellings only for a word with no exact match anywhere', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM scoring_runs')) return { rows: [RUN] };
      // "road" exists exactly; "imuz" does not.
      if (sql.includes('WITH ORDINALITY')) {
        return {
          rows: [
            { i: 1, fuzzy: false },
            { i: 2, fuzzy: true },
          ],
        };
      }
      return { rows: [] };
    });

    const response = await request(createApp({ query } as unknown as Db))
      .get('/api/contracts')
      .query({ q: 'road imuz' });

    const listCall = query.mock.calls.find(([sql]) => sql.includes('lot_order'))!;
    expect(listCall[0]).toContain('<% c.search_text');
    expect(listCall[1]).toEqual(expect.arrayContaining(['%road%', 'imuz']));
    expect(response.body.closeMatches).toEqual(['imuz']);
  });

  it('counts screened matches when no flagged contract matches', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM scoring_runs')) return { rows: [RUN] };
      if (sql.includes('count(*)::int AS n')) return { rows: [{ n: 61 }] };
      return { rows: [] };
    });

    const response = await request(createApp({ query } as unknown as Db))
      .get('/api/contracts')
      .query({ q: 'imus', flagged: 'true' });

    expect(response.body.screenedMatches).toBe(61);
    const counted = query.mock.calls.find(([sql]) => sql.includes('count(*)::int AS n'))!;
    expect(counted[0]).not.toContain('s.is_flagged');
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
    expect(sql).toContain('ORDER BY rank ASC');
    expect(sql).not.toContain('DELETE');
    expect(params).toEqual([RUN.id, 25, 0]);
  });

  it('lists one row per contract unless grouping by notice is asked for', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts');
    expect(lastCall(query)[0]).toContain('WHERE TRUE');

    await request(createApp(db)).get('/api/contracts').query({ group: 'true' });
    const [sql] = lastCall(query);
    expect(sql).toContain('ORDER BY s.score_rank) AS lot_order');
    expect(sql).toContain('WHERE lot_order = 1');
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

  it('filters by province and city names, as parameters', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db))
      .get('/api/contracts')
      .query({ province: 'Masbate', city: 'Iloilo City|City of Iloilo' });

    const [sql, params] = lastCall(query);
    expect(sql).toContain('c.province = ANY(');
    expect(sql).toContain('c.city_municipality = ANY(');
    expect(params).toEqual(
      expect.arrayContaining([['Masbate'], ['Iloilo City', 'City of Iloilo']]),
    );
  });
});
