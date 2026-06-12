import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    // Use the automatic React 17+ JSX runtime so *.test.tsx files don't
    // need `import React from 'react'`. Matches Next.js / React 19 behaviour.
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    // Default environment for *.test.ts (pure-logic) files.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],

    // Run *.test.tsx files in jsdom so React components can render.
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],

    // setupFiles runs for every test file in every environment.
    // test-setup.ts guards the RTL cleanup behind `typeof window`
    // so it is safe in node-env *.test.ts files too.
    setupFiles: ['./src/test-setup.ts'],
  },
});
