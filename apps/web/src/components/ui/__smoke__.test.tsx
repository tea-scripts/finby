import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Smoke test: verifies the jsdom + React Testing Library harness is wired correctly.
// This file matches **/*.test.tsx so vitest.config.ts routes it to jsdom automatically —
// no per-file pragma needed. W2–W4 component test files follow the same convention:
// name them *.test.tsx and they will run in jsdom without any extra annotation.
describe('render harness', () => {
  it('renders into jsdom', () => {
    render(<button>Hello</button>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
