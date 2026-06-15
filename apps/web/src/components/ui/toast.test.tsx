import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock sonner entirely — these tests exercise ToastCard, not the toast pipeline.
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { custom: vi.fn(), dismiss: vi.fn() },
}));

import { ToastCard, type ToastVariant } from './toast';

describe('ToastCard', () => {
  it('renders the title', () => {
    render(<ToastCard variant="success" title="Settings saved" />);
    expect(screen.getByText('Settings saved')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<ToastCard variant="info" title="Export ready" description="Your CSV is downloading" />);
    expect(screen.getByText('Your CSV is downloading')).toBeInTheDocument();
  });

  it('does NOT render a description when omitted', () => {
    render(<ToastCard variant="success" title="Saved" />);
    // Only the title paragraph should be present, no second line.
    expect(screen.queryByText('Your CSV is downloading')).not.toBeInTheDocument();
  });

  it('calls onDismiss when the × button is clicked', () => {
    const onDismiss = vi.fn();
    render(<ToastCard variant="error" title="Failed" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render a dismiss button when onDismiss is omitted', () => {
    render(<ToastCard variant="success" title="Saved" />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('renders the correct icon per variant', () => {
    const variants: ToastVariant[] = ['success', 'error', 'warning', 'info'];
    for (const variant of variants) {
      const { unmount } = render(<ToastCard variant={variant} title="x" />);
      expect(screen.getByTestId(`toast-icon-${variant}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('success variant uses text-success on the icon', () => {
    render(<ToastCard variant="success" title="Saved" />);
    expect(screen.getByTestId('toast-icon-success')).toHaveClass('text-success');
  });

  it('error variant uses text-danger on the icon', () => {
    render(<ToastCard variant="error" title="Failed" />);
    expect(screen.getByTestId('toast-icon-error')).toHaveClass('text-danger');
  });
});
