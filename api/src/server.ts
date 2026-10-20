import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createApp } from './app.js';

// One .env at the repo root is shared by every layer. On Vercel there is no
// .env file; variables come from the project settings instead.
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

// A hosted database (Vercel) is given as one DATABASE_URL; the local Docker
// database uses the separate POSTGRES_* variables.
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new pg.Pool({
      host: process.env.POSTGRES_HOST ?? '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    });

const app = createApp(pool);

// Vercel runs the exported app as a function; locally we listen on a port.
if (!process.env.VERCEL) {
  const port = Number(process.env.API_PORT ?? 3001);
  // Listen on this machine only; the dashboard reaches the API through its dev proxy.
  app.listen(port, '127.0.0.1', () => {
    console.log(`ProcureGuard API listening on http://127.0.0.1:${port}`);
  });
}

export default app;
