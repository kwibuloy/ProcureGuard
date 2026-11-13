import pg from 'pg';

/** The longest any one query may run on the server before PostgreSQL cancels it. */
export const STATEMENT_TIMEOUT_MS = 15_000;

/** Neon's pooled address (PgBouncer in transaction mode) has "-pooler" in its host name. */
export const isPooler = (connectionString: string) => {
  try {
    return new URL(connectionString).hostname.includes('-pooler');
  } catch {
    return false;
  }
};

/**
 * Pool settings for where the API runs.
 *
 * On Vercel each function instance holds its own pool, and many instances can
 * run at once against one hosted database, so each keeps few connections and
 * lets idle ones go quickly. Locally there is one long-running process.
 */
export function poolConfig(env: NodeJS.ProcessEnv): pg.PoolConfig {
  const serverless = Boolean(env.VERCEL);
  const limits: pg.PoolConfig = {
    // Overview runs five queries at once; more than that only queues.
    max: serverless ? 5 : 10,
    // Close idle connections soon on serverless, so a paused instance does not
    // hold database connections it no longer uses.
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    // Fail fast when the database is unreachable instead of hanging the request.
    connectionTimeoutMillis: 5_000,
    // Server side: PostgreSQL cancels a query that runs longer.
    statement_timeout: STATEMENT_TIMEOUT_MS,
    // Client side: a backstop in case the server-side limit is not applied.
    query_timeout: STATEMENT_TIMEOUT_MS + 5_000,
    allowExitOnIdle: serverless,
  };
  // A hosted database (Vercel) is given as one DATABASE_URL; the local Docker
  // database uses the separate POSTGRES_* variables.
  if (env.DATABASE_URL) {
    if (!isPooler(env.DATABASE_URL)) return { ...limits, connectionString: env.DATABASE_URL };
    // PgBouncer refuses startup parameters it does not know, statement_timeout
    // among them. Set it on the database role instead (api/README.md); the
    // client-side query_timeout still applies.
    const { statement_timeout: _skipped, ...pooled } = limits;
    return { ...pooled, connectionString: env.DATABASE_URL };
  }
  return {
    ...limits,
    host: env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(env.POSTGRES_PORT ?? 5432),
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  };
}

export function createPool(env: NodeJS.ProcessEnv): pg.Pool {
  const pool = new pg.Pool(poolConfig(env));
  // An idle client that loses its connection must not crash the process.
  pool.on('error', (error) => console.error('Idle database connection failed', error.message));
  return pool;
}
