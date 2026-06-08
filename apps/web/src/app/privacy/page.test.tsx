import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// next/link → plain anchor for the test renderer
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import PrivacyPage from './page';

describe('PrivacyPage', () => {
  it('renders the policy with key sections and the AI-processing disclosure', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /information we collect/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /service providers/i })).toBeInTheDocument();
    expect(screen.getByText(/processed by our AI provider/i)).toBeInTheDocument();
    expect(screen.getByText(/support@finby\.app/i)).toBeInTheDocument();
  });
});
