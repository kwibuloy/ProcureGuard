/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The response headers Vercel sends with the dashboard's pages (vercel.json),
 * reused by `vite preview` so the built site can be checked locally under the
 * same Content-Security-Policy. The dev server leaves them off: Vite's hot
 * reload injects inline scripts that the policy would block.
 */
function deployedHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers?: { headers: { key: string; value: string }[] }[];
  };
  const rule = config.headers?.[0];
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]));
}

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser talks only to this dev server; it forwards /api to the Express API.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
    headers: deployedHeaders(),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: false,
  },
});
