import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

describe('Modal', () => {
  it('renders title + children when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit thing">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit thing' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Edit thing">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('calls onClose on the close button, backdrop click, and Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Edit thing">
        <p>Body content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
