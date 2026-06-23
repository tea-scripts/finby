import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.config.*',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The service worker runs in ServiceWorkerGlobalScope, where `self`, `clients`,
    // `caches` and `registration` are valid globals unknown to the default parser.
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        clients: 'readonly',
        caches: 'readonly',
        registration: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    // @finby/core must stay platform-agnostic — shareable by web and a future
    // React Native app. The tsconfig's DOM lib (needed for fetch types) can't
    // enforce this, so fail lint if core source reaches for browser- or
    // Node-only globals or imports a platform framework. This guardrail
    // protects the entire mobile effort as more code lands in core.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '@finby/core must not use window — inject platform behavior.' },
        { name: 'document', message: '@finby/core must not use document.' },
        { name: 'localStorage', message: '@finby/core must not use localStorage — inject token storage.' },
        { name: 'sessionStorage', message: '@finby/core must not use sessionStorage.' },
        { name: 'navigator', message: '@finby/core must not use navigator.' },
        { name: 'location', message: '@finby/core must not use location.' },
        { name: 'process', message: '@finby/core must not read process/env — inject config.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['next', 'next/*', 'react', 'react-dom', 'react-native', 'react-native/*', 'zustand', 'zustand/*'] },
      ],
    },
  },
);
