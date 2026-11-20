import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { Db } from '../queries.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { SESSION_COOKIE, WRITE_HEADER } from './routes.js';

let HASH = '';
beforeAll(async () => {
  HASH = await hashPassword('correct horse battery');
});

/** A fake database with one reviewer ("ana") and whatever sessions get stored. */
function fakeDb(account: Record<string, unknown> = {}) {
  const sessions = new Set<string>();
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM reviewers WHERE username')) {
      return params[0] === 'ana'
        ? {
            rows: [
              {
                id: 3,
                username: 'ana',
                displayName: 'Ana Reyes',
                hash: HASH,
                disabled: false,
                locked: false,
                ...account,
              },
            ],
          }
        : { rows: [] };
    }
    if (sql.includes('INSERT INTO reviewer_sessions')) sessions.add(params[0] as string);
    if (sql.includes('FROM reviewer_sessions s JOIN reviewers')) {
      return sessions.has(params[0] as string)
        ? { rows: [{ id: 3, username: 'ana', displayName: 'Ana Reyes' }] }
        : { rows: [] };
    }
    if (sql.includes('INSERT INTO contract_reviews')) {
      return { rows: params[0] === 404 ? [] : [{ id: 1, createdAt: '2026-11-20T00:00:00Z' }] };
    }
    return { rows: [] };
  });
  return { db: { query } as unknown as Db, query, sessions };
}

const signIn = (app: ReturnType<typeof createApp>, password = 'correct horse battery') =>
  request(app).post('/api/auth/login').set(WRITE_HEADER, '1').send({ username: 'Ana', password });

const cookieOf = (response: request.Response) =>
  String(response.headers['set-cookie']?.[0] ?? '').split(';')[0]!;

describe('reviewer passwords', () => {
  it('verify only the password they were made from', async () => {
    expect(await verifyPassword('correct horse battery', HASH)).toBe(true);
    expect(await verifyPassword('correct horse batterY', HASH)).toBe(false);
    expect(HASH).not.toContain('correct');
  });
});

describe('signing in', () => {
  it('sets an HttpOnly, same-site session cookie and stores only a hash of it', async () => {
    const { db, sessions } = fakeDb();

    const response = await signIn(createApp(db));

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe('Ana Reyes');
    const header = String(response.headers['set-cookie']?.[0]);
    expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    const token = cookieOf(response).split('=')[1]!;
    expect(sessions.size).toBe(1);
    expect(sessions.has(token)).toBe(false);
  });

  it('refuses a wrong password, and counts the failure', async () => {
    const { db, query } = fakeDb();

    const response = await signIn(createApp(db), 'wrong password here');

    expect(response.status).toBe(401);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(query.mock.calls.some(([sql]) => sql.includes('failed_logins + 1'))).toBe(true);
  });

  it('gives the same answer for an unknown username', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db))
      .post('/api/auth/login')
      .set(WRITE_HEADER, '1')
      .send({ username: 'nobody', password: 'whatever it is' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Username or password is not right');
  });

  it('refuses a locked account', async () => {
    const { db } = fakeDb({ locked: true });

    expect((await signIn(createApp(db))).status).toBe(429);
  });

  it('needs the request header, which a form on another site cannot send', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db))
      .post('/api/auth/login')
      .send({ username: 'ana', password: 'correct horse battery' });

    expect(response.status).toBe(403);
  });

  it('answers a malformed body with 400, not a server error', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db))
      .post('/api/auth/login')
      .set(WRITE_HEADER, '1')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(response.status).toBe(400);
  });
});

describe('writing a review', () => {
  it('needs a signed-in reviewer', async () => {
    const { db } = fakeDb();

    const response = await request(createApp(db))
      .post('/api/reviews')
      .set(WRITE_HEADER, '1')
      .send({ contractId: 5, status: 'explained' });

    expect(response.status).toBe(401);
  });

  it('stores the status and note under the signed-in reviewer', async () => {
    const { db, query } = fakeDb();
    const app = createApp(db);
    const cookie = cookieOf(await signIn(app));

    const response = await request(app)
      .post('/api/reviews')
      .set(WRITE_HEADER, '1')
      .set('Cookie', cookie)
      .send({
        contractId: 5,
        status: 'explained',
        note: '  Checked the notice; lots.  ',
        runId: 26,
      });

    expect(response.status).toBe(201);
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO contract_reviews'))!;
    expect(insert[1]).toEqual([5, 'explained', 'Checked the notice; lots.', 3, 26]);
  });

  it('refuses an unknown status or a note that is too long', async () => {
    const { db } = fakeDb();
    const app = createApp(db);
    const cookie = cookieOf(await signIn(app));
    const send = (body: object) =>
      request(app).post('/api/reviews').set(WRITE_HEADER, '1').set('Cookie', cookie).send(body);

    expect((await send({ contractId: 5, status: 'corrupt' })).status).toBe(400);
    expect(
      (await send({ contractId: 5, status: 'explained', note: 'x'.repeat(2001) })).status,
    ).toBe(400);
  });
});

describe('reading reviews', () => {
  it('is public, never cached, and ignores junk ids', async () => {
    const { db, query } = fakeDb();

    const response = await request(createApp(db))
      .get('/api/review-status')
      .query({ ids: `1,2,abc,-4,${Array.from({ length: 300 }, (_, i) => i + 10).join(',')}` });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const ids = query.mock.calls.find(([sql]) => sql.includes('FROM contract_reviews'))![1]![0];
    expect((ids as number[]).slice(0, 2)).toEqual([1, 2]);
    expect((ids as number[]).length).toBe(200);
  });
});
