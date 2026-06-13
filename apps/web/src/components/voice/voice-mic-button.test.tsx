import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceMicButton } from './voice-mic-button';

const noop = () => {};

describe('VoiceMicButton', () => {
  it('renders the mic control when idle', () => {
    render(
      <VoiceMicButton recorderState="idle" transcriptionLoading={false} onStart={noop} onStop={noop} />,
    );
    expect(screen.getByLabelText('Start voice input')).toBeInTheDocument();
  });

  it('renders the stop control when recording', () => {
    render(
      <VoiceMicButton
        recorderState="recording"
        transcriptionLoading={false}
        onStart={noop}
        onStop={noop}
      />,
    );
    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
  });

  it('renders a transcribing spinner when loading', () => {
    render(
      <VoiceMicButton recorderState="idle" transcriptionLoading onStart={noop} onStop={noop} />,
    );
    expect(screen.getByLabelText('Transcribing…')).toBeInTheDocument();
  });

  it('calls onStart when the idle mic is clicked', () => {
    const onStart = vi.fn();
    render(
      <VoiceMicButton
        recorderState="idle"
        transcriptionLoading={false}
        onStart={onStart}
        onStop={noop}
      />,
    );
    fireEvent.click(screen.getByLabelText('Start voice input'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when the stop control is clicked', () => {
    const onStop = vi.fn();
    render(
      <VoiceMicButton
        recorderState="recording"
        transcriptionLoading={false}
        onStart={noop}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getByLabelText('Stop recording'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
