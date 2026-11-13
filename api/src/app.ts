import express, { type NextFunction, type Request, type Response } from 'express';
import { toCsvWithin } from './csv.js';
import { cacheForRun, CACHE_LATEST, rateLimit, securityHeaders, type RateLimit } from './http.js';
import {
  compareRuns,
  contractDetail,
  dataQuality,
  dataVersion,
  places,
  exportContracts,
  findRun,
  INDICATORS,
  listContracts,
  listRuns,
  overview,
  profile,
  SORTS,
  type Db,
  type Indicator,
  type Sort,
} from './queries.js';

const MAX_PAGE_SIZE = 100;

/**
 * Most rows one CSV export holds. Vercel refuses a function response over
 * 4.5 MB. Measured on scoring run 24 (90,204 contracts of 2024): a row is
 * 236.5 bytes on average and 532 at most, the full export is 21.3 MB, and the
 * 14,318 largest rows together fit in EXPORT_MAX_BYTES. So any filter's first
 * 12,000 rows fit, with room for somewhat longer rows in future data.
 * EXPORT_MAX_BYTES is checked as well, in case rows grow beyond that.
 */
export const EXPORT_ROW_LIMIT = 12_000;
/** Kept below Vercel's 4.5 MB (4,718,592 bytes) response limit, with headroom for headers. */
export const EXPORT_MAX_BYTES = 4_000_000;

export interface AppOptions {
  /** Behind Vercel: trust x-forwarded-for and send HSTS. */
  behindProxy?: boolean;
  limits?: Partial<Record<'api' | 'list' | 'search' | 'export', RateLimit>>;
  exportRowLimit?: number;
  exportMaxBytes?: number;
}

const MINUTE = 60_000;
const DEFAULT_LIMITS: Record<'api' | 'list' | 'search' | 'export', RateLimit> = {
  // Every endpoint, per client address and function instance.
  api: { limit: 300, windowMs: MINUTE },
  // The contract list, which the dashboard asks for on every filter change.
  list: { limit: 120, windowMs: MINUTE },
  // A search runs trigram matching over every contract; it costs more than a page.
  search: { limit: 60, windowMs: MINUTE },
  // An export reads up to EXPORT_ROW_LIMIT rows.
  export: { limit: 10, windowMs: MINUTE },
};

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined;

/** Place names joined with "|" (a map shape can stand for several spellings). */
const names = (value: unknown) => {
  const list = (text(value)?.split('|') ?? []).map((name) => name.trim()).filter(Boolean);
  return list.length ? list.slice(0, 20) : undefined;
};

const positiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** A score between 0 and 1, or undefined when the value is absent or not one. */
const score = (value: unknown) => {
  const parsed = typeof value === 'string' && value !== '' ? Number(value) : NaN;
  return parsed >= 0 && parsed <= 1 ? parsed : undefined;
};

function contractFilters(query: Request['query']) {
  const reason = text(query.reason);
  const sort = text(query.sort);
  return {
    q: text(query.q),
    region: text(query.region),
    provinces: names(query.province),
    cities: names(query.city),
    entityType: text(query.entityType),
    entity: text(query.entity),
    awardee: text(query.awardee),
    reason: INDICATORS.includes(reason as Indicator) ? (reason as Indicator) : undefined,
    scoreFrom: score(query.scoreFrom),
    scoreTo: score(query.scoreTo),
    flaggedOnly: query.flagged === 'true',
    sort: (sort && sort in SORTS ? sort : 'rank') as Sort,
  };
}

/** The API only reads. Scores are computed by ml/ and stored in PostgreSQL. */
export function createApp(db: Db, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // ETags are set per run in cacheForRun; Express's own would hash every body.
  app.set('etag', false);

  const trustProxy = Boolean(options.behindProxy);
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const limiter = (name: keyof typeof limits) => rateLimit(limits[name], { trustProxy });
  const searchLimiter = limiter('search');
  const exportRowLimit = options.exportRowLimit ?? EXPORT_ROW_LIMIT;
  const exportMaxBytes = options.exportMaxBytes ?? EXPORT_MAX_BYTES;

  app.use(securityHeaders({ hsts: trustProxy }));
  app.use('/api', limiter('api'));

  /**
   * The run a request is for, and whether its URL names that run. Sets cache
   * headers and answers 304 when the browser's copy is current; then `run` is
   * undefined and the handler stops.
   */
  const servedRun = async (req: Request, res: Response) => {
    const requested = positiveInt(req.query.run, 0) || undefined;
    const [run, version] = await Promise.all([findRun(db, requested), dataVersion(db)]);
    const pinned = Boolean(requested && run?.id === requested);
    const notModified = cacheForRun(req, res, { pinned, version: `${run?.id ?? 0}:${version}` });
    return { run: notModified ? undefined : run, notModified };
  };

  // Searching costs more than paging, so a request with search words also counts against it.
  const searchLimit = (req: Request, res: Response, next: NextFunction) =>
    text(req.query.q) ? searchLimiter(req, res, next) : next();

  app.get('/api/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('Health check: database unavailable', (error as Error).message);
      res.status(503).json({ status: 'unavailable', error: 'The database is not reachable' });
    }
  });

  app.get('/api/runs', async (_req, res) => {
    res.set('Cache-Control', CACHE_LATEST);
    res.json(await listRuns(db));
  });

  app.get('/api/overview', async (req, res) => {
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    if (!run) return res.json({ run: null });
    res.json({ run, ...(await overview(db, run.id)) });
  });

  app.get('/api/contracts', limiter('list'), searchLimit, async (req, res) => {
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    if (!run) {
      return res.json({ total: 0, page: 1, pageSize: 25, items: [], exportLimit: exportRowLimit });
    }
    const list = await listContracts(db, run.id, {
      ...contractFilters(req.query),
      page: positiveInt(req.query.page, 1),
      pageSize: Math.min(positiveInt(req.query.pageSize, 25), MAX_PAGE_SIZE),
      grouped: req.query.group === 'true',
    });
    // The dashboard says when an export of this list would be cut short.
    res.json({ ...list, exportLimit: exportRowLimit });
  });

  app.get('/api/contracts.csv', limiter('export'), searchLimit, async (req, res) => {
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    // One row more than the limit says whether there were more to export.
    const rows = run
      ? await exportContracts(db, run.id, contractFilters(req.query), exportRowLimit + 1)
      : [];
    const { csv, written } = toCsvWithin(rows.slice(0, exportRowLimit), exportMaxBytes);
    const truncated = written < rows.length;
    res
      .set({
        'X-Export-Rows': String(written),
        'X-Export-Truncated': String(truncated),
        'X-Export-Limit': String(exportRowLimit),
      })
      .type('text/csv')
      .attachment(
        `procureguard-run-${run?.id ?? 'none'}${truncated ? '-first-' + written : ''}.csv`,
      )
      .send(csv);
  });

  app.get('/api/contracts/:id', async (req, res) => {
    const id = positiveInt(req.params.id, 0);
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    const contract = id && run ? await contractDetail(db, run.id, id) : null;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  });

  app.get('/api/profile', async (req, res) => {
    const kind = req.query.kind === 'awardee' ? 'awardee' : 'entity';
    const name = text(req.query.name);
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    const found = name && run ? await profile(db, run.id, kind, name) : null;
    if (!found) return res.status(404).json({ error: 'Not found in this scoring run' });
    res.json(found);
  });

  app.get('/api/compare', async (req, res) => {
    const a = positiveInt(req.query.a, 0);
    const b = positiveInt(req.query.b, 0);
    const [runA, runB, version] = await Promise.all([
      findRun(db, a),
      findRun(db, b),
      dataVersion(db),
    ]);
    if (!a || !b || a === b || runA?.id !== a || runB?.id !== b) {
      return res.status(400).json({ error: 'Choose two different scoring runs' });
    }
    // Both runs are named in the URL, so the comparison never changes.
    if (cacheForRun(req, res, { pinned: true, version: `${a}-${b}:${version}` })) return;
    res.json({ a: runA, b: runB, ...(await compareRuns(db, a, b)) });
  });

  app.get('/api/places', async (req, res) => {
    const { run, notModified } = await servedRun(req, res);
    if (notModified) return;
    res.json(run ? await places(db, run.id) : []);
  });

  app.get('/api/data-quality', async (_req, res) => {
    res.set('Cache-Control', CACHE_LATEST);
    res.json(await dataQuality(db));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    // Never cache an error, or a passing failure would be served for a day.
    res.set('Cache-Control', 'no-store');
    res.removeHeader('ETag');
    res.status(500).json({ error: 'The server could not complete the request' });
  });

  return app;
}
