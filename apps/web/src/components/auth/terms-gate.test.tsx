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
  it('opens the Terms (instead of ticking) when the checkbox is clicked before reading', async () => {
    const onChange = vi.fn();
    render(<TermsGate accepted={false} onAcceptedChange={onChange} />);

    expect(screen.getByText(/scroll to the end to continue/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));

    // the Terms modal opened…
    expect(await screen.findByRole('button', { name: /i've read the terms/i })).toBeInTheDocument();
    // …and the box was NOT ticked
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports an active tick once the Terms have been read', async () => {
    const onChange = vi.fn();
    render(<TermsGate accepted={false} onAcceptedChange={onChange} />);

    // open via the link (in jsdom the content has no scroll height, so it counts
    // as fully read on open — the real gate requires scrolling to the end)
    fireEvent.click(screen.getByRole('button', { name: /terms of service/i }));
    fireEvent.click(await screen.findByRole('button', { name: /i've read the terms/i }));

    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(screen.queryByText(/scroll to the end/i)).not.toBeInTheDocument());

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
