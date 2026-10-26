/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // `npm run build:extension` builds with hash routing for chrome-extension:// pages.
    'import.meta.env.VITE_ROUTER': JSON.stringify(mode === 'extension' ? 'hash' : 'browser'),
  },
  build: {
    target: 'es2021',
    outDir: mode === 'extension' ? 'dist-extension' : 'dist',
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
  },
}));
