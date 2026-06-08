import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import TermsPage from './page';

describe('TermsPage', () => {
  it('renders the Terms with the key disclaimers', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /not financial advice/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /subscriptions & billing/i })).toBeInTheDocument();
    expect(screen.getByText(/support@finby\.app/i)).toBeInTheDocument();
  });
});
