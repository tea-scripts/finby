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
    // Vitest 2 idiom — NOT deprecated. No per-file pragma needed for W2–W4;
    // any file matching **/*.test.tsx automatically gets jsdom.
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],

    // setupFiles runs for every test file in every environment.
    // vitest.setup.ts guards the RTL cleanup behind `typeof window`
    // so it is safe in node-env *.test.ts files too.
    setupFiles: ['./vitest.setup.ts'],
  },
});
