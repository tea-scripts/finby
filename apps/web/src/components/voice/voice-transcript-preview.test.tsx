import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceTranscriptPreview } from './voice-transcript-preview';

describe('VoiceTranscriptPreview', () => {
  it('renders the transcript text', () => {
    render(
      <VoiceTranscriptPreview
        transcript="Add Maya wallet with 3000 pesos"
        onConfirm={() => {}}
        onEdit={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('Add Maya wallet with 3000 pesos')).toBeInTheDocument();
  });

  it('calls onConfirm when Send is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <VoiceTranscriptPreview
        transcript="test"
        onConfirm={onConfirm}
        onEdit={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit when Edit is clicked', () => {
    const onEdit = vi.fn();
    render(
      <VoiceTranscriptPreview
        transcript="test"
        onConfirm={() => {}}
        onEdit={onEdit}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the dismiss control is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <VoiceTranscriptPreview
        transcript="test"
        onConfirm={() => {}}
        onEdit={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss transcript'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
