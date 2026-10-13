import express, { type NextFunction, type Request, type Response } from 'express';
import {
  contractDetail,
  INDICATORS,
  latestRun,
  listContracts,
  overview,
  SORTS,
  type Db,
  type Indicator,
  type Sort,
} from './queries.js';

const MAX_PAGE_SIZE = 100;

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined;

const positiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** The API only reads. Scores are computed by ml/ and stored in PostgreSQL. */
export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.get('/api/overview', async (_req, res) => {
    const run = await latestRun(db);
    if (!run) return res.json({ run: null });
    res.json({ run, ...(await overview(db, run.id)) });
  });

  app.get('/api/contracts', async (req, res) => {
    const run = await latestRun(db);
    if (!run) return res.json({ total: 0, page: 1, pageSize: 25, items: [] });
    const { query } = req;
    const reason = text(query.reason);
    const sort = text(query.sort);
    res.json(
      await listContracts(db, run.id, {
        q: text(query.q),
        region: text(query.region),
        entityType: text(query.entityType),
        reason: INDICATORS.includes(reason as Indicator) ? (reason as Indicator) : undefined,
        flaggedOnly: query.flagged === 'true',
        sort: sort && sort in SORTS ? (sort as Sort) : 'rank',
        page: positiveInt(query.page, 1),
        pageSize: Math.min(positiveInt(query.pageSize, 25), MAX_PAGE_SIZE),
      }),
    );
  });

  app.get('/api/contracts/:id', async (req, res) => {
    const id = positiveInt(req.params.id, 0);
    const run = await latestRun(db);
    const contract = id && run ? await contractDetail(db, run.id, id) : null;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'The server could not complete the request' });
  });

  return app;
}
