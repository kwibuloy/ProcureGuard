import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, EXPORT_MAX_BYTES, EXPORT_ROW_LIMIT } from './app.js';
import { toCsvWithin } from './csv.js';
import { poolConfig, STATEMENT_TIMEOUT_MS } from './db.js';
import { CACHE_LATEST, CACHE_PINNED_RUN, rateLimit } from './http.js';
import type { Db } from './queries.js';

/** Runs 7 and 8 exist; 8 is the latest. Other queries answer with `rows`. */
function fakeDb(rows: Record<string, unknown>[] = [], version = '8.3.0') {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('AS version')) return { rows: [{ version }] };
    if (sql.includes('FROM scoring_runs WHERE id')) {
      const id = params?.[0] as number;
      return { rows: [7, 8].includes(id) ? [{ id, modelName: `model ${id}` }] : [] };
    }
    if (sql.includes('FROM scoring_runs')) return { rows: [{ id: 8, modelName: 'model 8' }] };
    return { rows };
  });
  return { db: { query } as unknown as Db, query };
}

describe('GET /api/health', () => {
  it('is 200 when the database answers', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('is 503 when the database does not', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(createApp(db as unknown as Db)).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unavailable');
    // The connection error stays in the server log.
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });
});

describe('security headers', () => {
  it('are on every response, errors included', async () => {
    const { db } = fakeDb();

    for (const path of ['/api/runs', '/api/contracts/0']) {
      const response = await request(createApp(db)).get(path);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('send HSTS only behind the HTTPS proxy', async () => {
    const { db } = fakeDb();

    const local = await request(createApp(db)).get('/api/runs');
    const hosted = await request(createApp(db, { behindProxy: true })).get('/api/runs');

    expect(local.headers['strict-transport-security']).toBeUndefined();
    expect(hosted.headers['strict-transport-security']).toContain('max-age=');
  });
});

describe('rate limits', () => {
  const tight = { limit: 2, windowMs: 60_000 };

  it('answer 429 with Retry-After once the list limit is used up', async () => {
    const { db } = fakeDb();
    const app = createApp(db, { limits: { list: tight } });

    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await request(app).get('/api/contracts')).status);
    const blocked = await request(app).get('/api/contracts');

    expect(statuses).toEqual([200, 200, 429]);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['ratelimit-remaining']).toBe('0');
  });

  it('count searches separately and more strictly than paging', async () => {
    const { db } = fakeDb();
    const app = createApp(db, { limits: { search: tight } });

    await request(app).get('/api/contracts').query({ q: 'road' });
    await request(app).get('/api/contracts').query({ q: 'road' });
    const search = await request(app).get('/api/contracts').query({ q: 'bridge' });
    const page = await request(app).get('/api/contracts');

    expect(search.status).toBe(429);
    expect(page.status).toBe(200);
  });

  it('limit the CSV export', async () => {
    const { db } = fakeDb();
    const app = createApp(db, { limits: { export: tight } });

    await request(app).get('/api/contracts.csv');
    await request(app).get('/api/contracts.csv');

    expect((await request(app).get('/api/contracts.csv')).status).toBe(429);
  });

  it('count each client address on its own, and start again after the window', () => {
    let time = 0;
    const limiter = rateLimit({ limit: 1, windowMs: 1_000 }, { trustProxy: true, now: () => time });
    const run = (address: string) => {
      const res = { set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      const req = { headers: { 'x-forwarded-for': `${address}, 10.0.0.1` }, socket: {} };
      limiter(req as never, res as never, next);
      return next.mock.calls.length ? 'passed' : 'blocked';
    };

    expect([run('203.0.113.1'), run('203.0.113.1'), run('203.0.113.2')]).toEqual([
      'passed',
      'blocked',
      'passed',
    ]);
    time = 1_000;
    expect(run('203.0.113.1')).toBe('passed');
  });

  it('ignore x-forwarded-for when not behind the proxy, so it cannot be spoofed', async () => {
    const { db } = fakeDb();
    const app = createApp(db, { limits: { list: { limit: 1, windowMs: 60_000 } } });

    await request(app).get('/api/contracts').set('x-forwarded-for', '203.0.113.1');
    const second = await request(app).get('/api/contracts').set('x-forwarded-for', '203.0.113.2');

    expect(second.status).toBe(429);
  });
});

describe('caching', () => {
  it('keeps responses for a run named in the URL, and latest-run responses briefly', async () => {
    const { db } = fakeDb();
    const app = createApp(db);

    const pinned = await request(app).get('/api/overview').query({ run: 7 });
    const latest = await request(app).get('/api/overview');
    const unknown = await request(app).get('/api/overview').query({ run: 999 });

    expect(pinned.headers['cache-control']).toBe(CACHE_PINNED_RUN);
    expect(latest.headers['cache-control']).toBe(CACHE_LATEST);
    // An unknown run falls back to the latest, so it must not be kept as if pinned.
    expect(unknown.headers['cache-control']).toBe(CACHE_LATEST);
    expect(pinned.headers.etag).toMatch(/^W\/"/);
  });

  it('answers 304 from the ETag without running the list query', async () => {
    const { db, query } = fakeDb();
    const app = createApp(db);
    const first = await request(app).get('/api/contracts').query({ run: 7, q: 'road' });
    query.mockClear();

    const again = await request(app)
      .get('/api/contracts')
      .query({ run: 7, q: 'road' })
      .set('If-None-Match', first.headers.etag!);

    expect(again.status).toBe(304);
    expect(query.mock.calls.some(([sql]) => sql.includes('lot_order'))).toBe(false);
  });

  it('gives a new ETag once the data changes, or for another URL', async () => {
    const one = await request(createApp(fakeDb([], '8.3.0').db)).get('/api/places?run=7');
    const reloaded = await request(createApp(fakeDb([], '9.3.0').db)).get('/api/places?run=7');
    const other = await request(createApp(fakeDb([], '8.3.0').db)).get('/api/places?run=8');

    expect(reloaded.headers.etag).not.toBe(one.headers.etag);
    expect(other.headers.etag).not.toBe(one.headers.etag);
  });

  it('never caches a server error', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS version')) return { rows: [{ version: '1' }] };
      if (sql.includes('FROM scoring_runs')) return { rows: [{ id: 7 }] };
      throw new Error('statement timeout');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(createApp({ query } as unknown as Db)).get(
      '/api/overview?run=7',
    );

    expect(response.status).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });
});

describe('CSV export size', () => {
  const row = (rank: number) => ({ rank, title: `Road ${rank}`, awardee: 'Builder' });

  it('stays within the row limit and says the file was cut short', async () => {
    const { db, query } = fakeDb(Array.from({ length: 4 }, (_, i) => row(i + 1)));

    const response = await request(createApp(db, { exportRowLimit: 3 })).get('/api/contracts.csv');

    const lines = response.text.trim().split('\r\n');
    expect(lines).toHaveLength(1 + 3);
    expect(response.headers['x-export-rows']).toBe('3');
    expect(response.headers['x-export-truncated']).toBe('true');
    expect(response.headers['content-disposition']).toContain('first-3');
    // It asks for one row more than the limit, to know whether there were more.
    const exportCall = query.mock.calls.find(([sql]) => sql.includes('points_unusual_price'))!;
    expect(exportCall[0]).toContain('LIMIT 4');
  });

  it('is not marked cut short when everything fits', async () => {
    const { db } = fakeDb([row(1), row(2)]);

    const response = await request(createApp(db, { exportRowLimit: 3 })).get('/api/contracts.csv');

    expect(response.headers['x-export-truncated']).toBe('false');
    expect(response.headers['x-export-rows']).toBe('2');
  });

  it('stops before the byte limit whatever the row limit', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ title: 'x'.repeat(100), rank: i }));

    const { csv, written } = toCsvWithin(rows, 1_000);

    expect(Buffer.byteLength(csv)).toBeLessThanOrEqual(1_000);
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(100);
  });

  it('keeps the default limits under the 4.5 MB Vercel response limit', () => {
    expect(EXPORT_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(EXPORT_ROW_LIMIT).toBeGreaterThan(0);
  });
});

describe('database pool', () => {
  it('stays small and lets connections go quickly on Vercel', () => {
    const config = poolConfig({ VERCEL: '1', DATABASE_URL: 'postgres://example.test/db' });

    expect(config.max).toBeLessThanOrEqual(5);
    expect(config.idleTimeoutMillis).toBeLessThanOrEqual(10_000);
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(config.connectionString).toBe('postgres://example.test/db');
    expect(config.query_timeout).toBeGreaterThan(STATEMENT_TIMEOUT_MS);
  });

  it('sets statement_timeout, except as a startup parameter through a PgBouncer pooler', () => {
    const direct = poolConfig({ DATABASE_URL: 'postgres://u@ep-x.neon.tech/db' });
    const pooled = poolConfig({ DATABASE_URL: 'postgres://u@ep-x-pooler.neon.tech/db' });

    expect(direct.statement_timeout).toBe(STATEMENT_TIMEOUT_MS);
    expect(pooled.statement_timeout).toBeUndefined();
    expect(pooled.query_timeout).toBeGreaterThan(STATEMENT_TIMEOUT_MS);
  });

  it('uses the POSTGRES_* variables locally', () => {
    const config = poolConfig({ POSTGRES_PORT: '5433', POSTGRES_DB: 'procureguard' });

    expect(config.connectionString).toBeUndefined();
    expect(config.port).toBe(5433);
    expect(config.host).toBe('127.0.0.1');
    expect(config.database).toBe('procureguard');
  });
});
