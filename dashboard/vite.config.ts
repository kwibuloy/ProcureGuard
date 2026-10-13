/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser talks only to this dev server; it forwards /api to the Express API.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: false,
  },
});
