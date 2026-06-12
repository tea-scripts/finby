import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Announcement } from '../../lib/announcements';
import { AnnouncementModal } from './announcement-modal';

// Stub the Lottie player so jsdom never loads the dotLottie/wasm runtime.
vi.mock('../ui/lottie', () => ({
  Lottie: ({ src }: { src: string }) => <div data-testid="lottie" data-src={src} />,
}));

const base: Announcement = {
  id: 'x',
  mode: 'simple',
  title: 'Streaks are here',
  body: 'Keep the flame alive.',
  emoji: '🔥',
  primary: { label: 'Got it', kind: 'dismiss' },
};

function renderModal(overrides: Partial<Announcement> = {}, props = {}) {
  const onPrimary = vi.fn();
  const onRemindLater = vi.fn();
  render(
    <AnnouncementModal
      announcement={{ ...base, ...overrides }}
      onPrimary={onPrimary}
      onRemindLater={onRemindLater}
      {...props}
    />,
  );
  return { onPrimary, onRemindLater };
}

describe('AnnouncementModal', () => {
  it('renders the title, body and primary label', () => {
    renderModal();
    expect(screen.getByText('Streaks are here')).toBeInTheDocument();
    expect(screen.getByText('Keep the flame alive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('calls onPrimary when the primary button is clicked', () => {
    const { onPrimary } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('calls onRemindLater from the "Remind me later" control', () => {
    const { onRemindLater } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /remind me later/i }));
    expect(onRemindLater).toHaveBeenCalledTimes(1);
  });

  it('renders the numbered steps in steps mode', () => {
    renderModal({
      mode: 'steps',
      steps: [
        { label: 'Step one', caption: 'first' },
        { label: 'Step two', caption: 'second' },
      ],
      primary: { label: 'Turn on notifications', kind: 'enable-push' },
    });
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('prefers the Lottie illustration when one is provided', () => {
    renderModal({ lottie: '/lottie/streak-flame.json' });
    expect(screen.getByTestId('lottie')).toHaveAttribute('data-src', '/lottie/streak-flame.json');
  });

  it('falls back to the emoji when there is no lottie or image', () => {
    renderModal({ lottie: undefined, image: undefined, emoji: '🔥' });
    expect(screen.queryByTestId('lottie')).not.toBeInTheDocument();
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('shows confetti only when the announcement opts in', () => {
    const { unmount } = (() => {
      renderModal({ confetti: true });
      return { unmount: () => undefined };
    })();
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
    unmount();
  });

  it('omits confetti by default', () => {
    renderModal({ confetti: false });
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
  });

  it('shows a working state and disables the primary button while busy', () => {
    renderModal({}, { busy: true });
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled();
  });
});
