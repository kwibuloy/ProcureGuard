import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { toCsv } from './csv.js';
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

const callsMatching = (query: ReturnType<typeof fakeDb>['query'], text: string) =>
  query.mock.calls.filter(([sql]) => sql.includes(text));

describe('choosing a scoring run', () => {
  it('uses the run asked for', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ run: 7 });

    expect(query.mock.calls.at(-1)![1]![0]).toBe(7);
  });

  it('falls back to the latest run when the one asked for does not exist', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ run: 999 });

    expect(query.mock.calls.at(-1)![1]![0]).toBe(8);
  });

  it('opens on the latest Isolation Forest run when no run is asked for', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts');

    const [sql, params] = callsMatching(query, 'FROM scoring_runs ORDER BY')[0]!;
    expect(sql).toContain('model_name = $1 DESC, id DESC');
    expect(params).toEqual(['Isolation Forest']);
  });
});

describe('contract filters', () => {
  it('filters by a score band, entity and awardee through parameters', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db))
      .get('/api/contracts')
      .query({ scoreFrom: '0.6', scoreTo: '0.65', entity: 'ENTITY A', awardee: 'BUILDER 1' });

    const [sql, params] = query.mock.calls.at(-1)!;
    expect(sql).toContain('s.risk_score >= $');
    expect(sql).toContain('s.risk_score < $');
    expect(params).toEqual([8, 'ENTITY A', 'BUILDER 1', 0.6, 0.65, 25, 0]);
  });

  it('ignores a score that is not between 0 and 1', async () => {
    const { db, query } = fakeDb();

    await request(createApp(db)).get('/api/contracts').query({ scoreFrom: '5', scoreTo: 'x' });

    expect(query.mock.calls.at(-1)![1]).toEqual([8, 25, 0]);
  });
});

describe('GET /api/contracts', () => {
  it('gives each row the figures behind its indicators, in a fixed order', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM scoring_runs')) return { rows: [{ id: 8 }] };
      if (sql.includes('ANY($2')) {
        return {
          rows: [
            { id: 5, indicator: 'price_deviation', value: 0.02, contribution: 0.1, context: {} },
            { id: 5, indicator: 'single_requester', value: 1, contribution: 0.3, context: {} },
          ],
        };
      }
      return {
        rows: [
          { id: 5, total: 2 },
          { id: 6, total: 2 },
        ],
      };
    });

    const response = await request(createApp({ query } as unknown as Db)).get('/api/contracts');

    const [first, second] = response.body.items;
    expect(first.indicators.map((result: { indicator: string }) => result.indicator)).toEqual([
      'single_requester',
      'price_deviation',
    ]);
    expect(second.indicators).toEqual([]);
    expect(query.mock.calls.at(-1)![1]).toEqual([8, [5, 6]]);
  });
});

describe('GET /api/contracts.csv', () => {
  it('sends the matching contracts as a CSV download', async () => {
    const { db } = fakeDb([{ rank: 1, title: 'Road, Phase 2', awardee: 'ABC "Best" Builders' }]);

    const response = await request(createApp(db)).get('/api/contracts.csv');

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('procureguard-run-8.csv');
    expect(response.text).toContain('rank,title,awardee');
    expect(response.text).toContain('1,"Road, Phase 2","ABC ""Best"" Builders"');
  });
});

describe('toCsv', () => {
  it('stops published text from running as a spreadsheet formula', () => {
    const csv = toCsv([{ awardee: '=HYPERLINK("http://example.test")', title: '+1 Road' }]);

    expect(csv).toContain(`"'=HYPERLINK(""http://example.test"")"`);
    expect(csv).toContain(`'+1 Road`);
  });

  it('leaves numbers alone, including negative ones', () => {
    expect(toCsv([{ points: -4.5, amount: 1000 }])).toContain('-4.5,1000');
  });

  it('writes nothing for missing values', () => {
    expect(toCsv([{ a: null, b: undefined, c: 'x' }])).toContain(',,x');
  });
});

describe('GET /api/profile', () => {
  it('returns 404 when the name has no contracts in the run', async () => {
    const { db } = fakeDb([{ contracts: 0 }]);

    const response = await request(createApp(db))
      .get('/api/profile')
      .query({ kind: 'entity', name: 'Nobody' });

    expect(response.status).toBe(404);
  });

  it('looks the name up as a parameter on the right column', async () => {
    const { db, query } = fakeDb([{ contracts: 3, name: 'Builder One' }]);

    await request(createApp(db))
      .get('/api/profile')
      .query({ kind: 'awardee', name: "O'Brien; DROP TABLE contracts" });

    const [sql, params] = callsMatching(query, 'counterparties')[0]!;
    expect(sql).toContain('WHERE c.awardee = $2');
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toEqual([8, "O'Brien; DROP TABLE contracts"]);
  });
});

describe('GET /api/compare', () => {
  it('needs two different runs that exist', async () => {
    const { db } = fakeDb();
    const app = createApp(db);

    expect((await request(app).get('/api/compare').query({ a: 7, b: 7 })).status).toBe(400);
    expect((await request(app).get('/api/compare').query({ a: 7 })).status).toBe(400);
    expect((await request(app).get('/api/compare').query({ a: 7, b: 999 })).status).toBe(400);
  });

  it('compares the two runs asked for', async () => {
    const { db, query } = fakeDb([{ contracts: 10 }]);

    const response = await request(createApp(db)).get('/api/compare').query({ a: 7, b: 8 });

    expect(response.status).toBe(200);
    expect(response.body.a.id).toBe(7);
    expect(response.body.b.id).toBe(8);
    expect(callsMatching(query, 'rankCorrelation')[0]![1]).toEqual([7, 8]);
  });
});
