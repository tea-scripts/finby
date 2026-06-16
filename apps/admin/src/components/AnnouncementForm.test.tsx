import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LottieAsset } from '@finby/shared';
import { AnnouncementForm } from './AnnouncementForm';

const assets: LottieAsset[] = [
  { key: 'streak-flame', label: 'Streak flame', path: '/lottie/streak-flame.json' },
];

describe('AnnouncementForm', () => {
  it('blocks submit until required key/title/body/primaryLabel are filled', () => {
    const onSubmit = vi.fn();
    render(<AnnouncementForm assets={assets} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/key is required/i)).toBeInTheDocument();
  });

  it('submits a well-formed payload with defaults', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnnouncementForm assets={assets} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'spring-sale-2026' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Spring sale' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Save big this spring' } });
    fireEvent.change(screen.getByLabelText('Primary button label'), {
      target: { value: 'See deals' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'spring-sale-2026',
        title: 'Spring sale',
        body: 'Save big this spring',
        primaryLabel: 'See deals',
        status: 'DRAFT',
        mode: 'SIMPLE',
        primaryKind: 'DISMISS',
        confetti: false,
        order: 0,
      }),
    );
  });
});
