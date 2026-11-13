import path from 'node:path';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createPool } from './db.js';

// One .env at the repo root is shared by every layer. On Vercel there is no
// .env file; variables come from the project settings instead.
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const pool = createPool(process.env);

const app = createApp(pool, { behindProxy: Boolean(process.env.VERCEL) });

// Vercel runs the exported app as a function; locally we listen on a port.
if (!process.env.VERCEL) {
  const port = Number(process.env.API_PORT ?? 3001);
  // Listen on this machine only; the dashboard reaches the API through its dev proxy.
  app.listen(port, '127.0.0.1', () => {
    console.log(`ProcureGuard API listening on http://127.0.0.1:${port}`);
  });
}

export default app;
