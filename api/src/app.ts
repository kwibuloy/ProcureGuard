import express, { type NextFunction, type Request, type Response } from 'express';
import { toCsv } from './csv.js';
import {
  compareRuns,
  contractDetail,
  dataQuality,
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
export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');

  const runFor = (req: Request) => findRun(db, positiveInt(req.query.run, 0) || undefined);

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.get('/api/runs', async (_req, res) => {
    res.json(await listRuns(db));
  });

  app.get('/api/overview', async (req, res) => {
    const run = await runFor(req);
    if (!run) return res.json({ run: null });
    res.json({ run, ...(await overview(db, run.id)) });
  });

  app.get('/api/contracts', async (req, res) => {
    const run = await runFor(req);
    if (!run) return res.json({ total: 0, page: 1, pageSize: 25, items: [] });
    res.json(
      await listContracts(db, run.id, {
        ...contractFilters(req.query),
        page: positiveInt(req.query.page, 1),
        pageSize: Math.min(positiveInt(req.query.pageSize, 25), MAX_PAGE_SIZE),
        grouped: req.query.group === 'true',
      }),
    );
  });

  app.get('/api/contracts.csv', async (req, res) => {
    const run = await runFor(req);
    const rows = run ? await exportContracts(db, run.id, contractFilters(req.query)) : [];
    res
      .type('text/csv')
      .attachment(`procureguard-run-${run?.id ?? 'none'}.csv`)
      .send(toCsv(rows));
  });

  app.get('/api/contracts/:id', async (req, res) => {
    const id = positiveInt(req.params.id, 0);
    const run = await runFor(req);
    const contract = id && run ? await contractDetail(db, run.id, id) : null;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  });

  app.get('/api/profile', async (req, res) => {
    const kind = req.query.kind === 'awardee' ? 'awardee' : 'entity';
    const name = text(req.query.name);
    const run = await runFor(req);
    const found = name && run ? await profile(db, run.id, kind, name) : null;
    if (!found) return res.status(404).json({ error: 'Not found in this scoring run' });
    res.json(found);
  });

  app.get('/api/compare', async (req, res) => {
    const a = positiveInt(req.query.a, 0);
    const b = positiveInt(req.query.b, 0);
    const [runA, runB] = await Promise.all([findRun(db, a), findRun(db, b)]);
    if (!a || !b || a === b || runA?.id !== a || runB?.id !== b) {
      return res.status(400).json({ error: 'Choose two different scoring runs' });
    }
    res.json({ a: runA, b: runB, ...(await compareRuns(db, a, b)) });
  });

  app.get('/api/places', async (req, res) => {
    const run = await runFor(req);
    res.json(run ? await places(db, run.id) : []);
  });

  app.get('/api/data-quality', async (_req, res) => {
    res.json(await dataQuality(db));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'The server could not complete the request' });
  });

  return app;
}
