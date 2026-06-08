import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { TermsGate } from './terms-gate';

beforeEach(() => vi.clearAllMocks());

describe('TermsGate', () => {
  it('keeps the agree checkbox disabled until the Terms have been opened/read', () => {
    render(<TermsGate accepted={false} onAcceptedChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/scroll the terms to the end/i)).toBeInTheDocument();
  });

  it('unlocks the checkbox after reading the Terms, then reports an active tick', async () => {
    const onChange = vi.fn();
    render(<TermsGate accepted={false} onAcceptedChange={onChange} />);

    // open the Terms modal (in jsdom the content has no scroll height, so it
    // counts as fully read on open — the real gate requires scrolling to the end)
    fireEvent.click(screen.getByRole('button', { name: /terms of service/i }));
    const doneBtn = await screen.findByRole('button', { name: /i've read the terms/i });
    expect(doneBtn).toBeEnabled();
    fireEvent.click(doneBtn);

    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
