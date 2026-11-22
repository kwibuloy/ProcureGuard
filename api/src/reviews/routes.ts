/**
 * Review of flagged contracts: status, notes and verified replies.
 *
 * Reading is public, like the rest of the site. Writing needs a reviewer
 * account (created with `npm run reviewer:add`), signed in with a session
 * cookie. Every write is a new row, so the history is the audit trail.
 */
import { createHash, randomBytes } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { rateLimit, type RateLimit } from '../http.js';
import type { Db } from '../queries/shared.js';
import { hashPassword, needsRehash, spendDummyHash, verifyPassword } from './passwords.js';

export const REVIEW_STATUSES = ['not_reviewed', 'explained', 'needs_follow_up'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const SESSION_COOKIE = 'pg_review';
const SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MAX_NOTE = 2000;
const MAX_STATUS_IDS = 200;
/** Every write must carry this header; a cross-site form cannot set it. */
export const WRITE_HEADER = 'x-procureguard-request';

export interface Reviewer {
  id: number;
  username: string;
  displayName: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Text from a request body: trimmed, control characters removed, length-checked. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return text.length <= max ? text : null;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export interface ReviewOptions {
  secureCookie: boolean;
  trustProxy: boolean;
  loginLimit?: RateLimit;
  writeLimit?: RateLimit;
}

export function reviewRoutes(app: Express, db: Db, options: ReviewOptions) {
  const json = express.json({ limit: '16kb' });
  const loginLimiter = rateLimit(options.loginLimit ?? { limit: 10, windowMs: 60_000 }, {
    trustProxy: options.trustProxy,
  });
  const writeLimiter = rateLimit(options.writeLimit ?? { limit: 60, windowMs: 60_000 }, {
    trustProxy: options.trustProxy,
  });

  const cookie = (token: string, maxAgeSeconds: number) =>
    [
      `${SESSION_COOKIE}=${token}`,
      'Path=/api',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      ...(options.secureCookie ? ['Secure'] : []),
    ].join('; ');

  async function currentReviewer(req: Request): Promise<Reviewer | null> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token || token.length > 100) return null;
    const { rows } = await db.query(
      `SELECT r.id::int AS id, r.username, r.display_name AS "displayName"
       FROM reviewer_sessions s JOIN reviewers r ON r.id = s.reviewer_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT r.disabled`,
      [hashToken(token)],
    );
    return (rows[0] as Reviewer | undefined) ?? null;
  }

  /** Writes: same-site only (header + SameSite cookie), signed in, rate-limited. */
  const forWriting = [
    writeLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      res.set('Cache-Control', 'no-store');
      if (req.get(WRITE_HEADER) !== '1') {
        return res.status(403).json({ error: 'Missing request header' });
      }
      next();
    },
    json,
  ];

  const signedIn = async (req: Request, res: Response) => {
    const reviewer = await currentReviewer(req);
    if (!reviewer) res.status(401).json({ error: 'Sign in as a reviewer first' });
    return reviewer;
  };

  app.post('/api/auth/login', loginLimiter, ...forWriting, async (req, res) => {
    const username = cleanText(req.body?.username, 40)?.toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const refuse = () => res.status(401).json({ error: 'Username or password is not right' });
    if (!username || !password || password.length > 200) return refuse();

    const { rows } = await db.query(
      `SELECT id::int AS id, username, display_name AS "displayName", password_hash AS hash,
              disabled, locked_until > now() AS locked
       FROM reviewers WHERE username = $1`,
      [username],
    );
    const account = rows[0];
    if (!account) {
      await spendDummyHash(password);
      return refuse();
    }
    if (account.locked) {
      return res
        .status(429)
        .json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` });
    }
    const ok = !account.disabled && (await verifyPassword(password, account.hash));
    if (!ok) {
      await db.query(
        `UPDATE reviewers SET failed_logins = failed_logins + 1,
                locked_until = CASE WHEN failed_logins + 1 >= $2
                                    THEN now() + make_interval(mins => $3) END
         WHERE id = $1`,
        [account.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      return refuse();
    }
    const token = randomBytes(32).toString('base64url');
    await db.query(`UPDATE reviewers SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [
      account.id,
    ]);
    // Bring a hash made with older, cheaper settings up to the current ones.
    if (needsRehash(account.hash)) {
      await db.query(`UPDATE reviewers SET password_hash = $2 WHERE id = $1`, [
        account.id,
        await hashPassword(password),
      ]);
    }
    await db.query(`DELETE FROM reviewer_sessions WHERE expires_at < now()`);
    await db.query(
      `INSERT INTO reviewer_sessions (token_hash, reviewer_id, expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [hashToken(token), account.id, SESSION_HOURS],
    );
    res.set('Set-Cookie', cookie(token, SESSION_HOURS * 3600));
    res.json({ id: account.id, username: account.username, displayName: account.displayName });
  });

  app.post('/api/auth/logout', ...forWriting, async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token)
      await db.query(`DELETE FROM reviewer_sessions WHERE token_hash = $1`, [hashToken(token)]);
    res.set('Set-Cookie', cookie('', 0));
    res.json({ signedOut: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const reviewer = await currentReviewer(req);
    if (!reviewer) return res.status(401).json({ error: 'Not signed in' });
    res.json(reviewer);
  });

  app.get('/api/reviews/:contractId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.contractId);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: 'Unknown contract' });
    const [reviews, responses] = await Promise.all([
      db.query(
        `SELECT v.id::int AS id, v.status, v.note, r.display_name AS reviewer,
                v.run_id::int AS "runId", v.created_at AS "createdAt"
         FROM contract_reviews v JOIN reviewers r ON r.id = v.reviewer_id
         WHERE v.contract_id = $1 ORDER BY v.id DESC LIMIT 50`,
        [id],
      ),
      db.query(
        `SELECT p.id::int AS id, p.organization, p.summary, p.received_on::text AS "receivedOn",
                r.display_name AS "verifiedBy", p.created_at AS "createdAt"
         FROM contract_responses p JOIN reviewers r ON r.id = p.verified_by
         WHERE p.contract_id = $1 ORDER BY p.received_on DESC, p.id DESC LIMIT 20`,
        [id],
      ),
    ]);
    res.json({ reviews: reviews.rows, responses: responses.rows });
  });

  /** The latest status of each listed contract, for the list's review marks. */
  app.get('/api/review-status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, MAX_STATUS_IDS);
    if (!ids.length) return res.json({ statuses: {} });
    const { rows } = await db.query(
      `SELECT DISTINCT ON (contract_id) contract_id::int AS id, status
       FROM contract_reviews WHERE contract_id = ANY($1::bigint[])
       ORDER BY contract_id, id DESC`,
      [ids],
    );
    res.json({ statuses: Object.fromEntries(rows.map((row) => [row.id, row.status])) });
  });

  app.post('/api/reviews', ...forWriting, async (req, res) => {
    const reviewer = await signedIn(req, res);
    if (!reviewer) return;
    const contractId = Number(req.body?.contractId);
    const status = req.body?.status as ReviewStatus;
    const note = cleanText(req.body?.note ?? '', MAX_NOTE);
    const runId = Number(req.body?.runId);
    if (!Number.isInteger(contractId) || contractId <= 0 || !REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Choose a contract and a review status' });
    }
    if (note === null)
      return res.status(400).json({ error: `Keep the note under ${MAX_NOTE} characters` });
    const { rows } = await db.query(
      `INSERT INTO contract_reviews (contract_id, status, note, reviewer_id, run_id)
       SELECT c.id, $2, NULLIF($3, ''), $4,
              (SELECT id FROM scoring_runs WHERE id = $5)
       FROM contracts c WHERE c.id = $1
       RETURNING id::int AS id, created_at AS "createdAt"`,
      [contractId, status, note, reviewer.id, Number.isInteger(runId) ? runId : null],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contract not found' });
    res
      .status(201)
      .json({ ...rows[0], status, note: note || null, reviewer: reviewer.displayName });
  });

  app.post('/api/responses', ...forWriting, async (req, res) => {
    const reviewer = await signedIn(req, res);
    if (!reviewer) return;
    const contractId = Number(req.body?.contractId);
    const organization = cleanText(req.body?.organization, 200);
    const summary = cleanText(req.body?.summary, MAX_NOTE);
    const receivedOn = typeof req.body?.receivedOn === 'string' ? req.body.receivedOn : '';
    if (
      !Number.isInteger(contractId) ||
      contractId <= 0 ||
      !organization ||
      !summary ||
      !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)
    ) {
      return res
        .status(400)
        .json({ error: 'Give the organization, a summary of its reply and the date received' });
    }
    const { rows } = await db.query(
      `INSERT INTO contract_responses (contract_id, organization, summary, received_on, verified_by)
       SELECT c.id, $2, $3, $4::date, $5 FROM contracts c
       WHERE c.id = $1 AND $4::date <= current_date
       RETURNING id::int AS id`,
      [contractId, organization, summary, receivedOn, reviewer.id],
    );
    if (!rows[0])
      return res.status(400).json({ error: 'Unknown contract, or a date in the future' });
    res.status(201).json(rows[0]);
  });
}
