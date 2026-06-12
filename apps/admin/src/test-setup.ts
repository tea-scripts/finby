import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Only register RTL cleanup when running in a DOM environment (jsdom).
// node-env tests (*.test.ts) share this setupFile but have no window/document.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
