import { CircleNotchIcon, MicrophoneIcon, StopIcon } from '@phosphor-icons/react';
import type { VoiceMicButtonProps } from './voice.types';

const BASE =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-50';

/** Mic control for the chat composer. Three visual states: idle (mic) →
 *  recording (stop) → transcribing (spinner). Matches the camera button's size. */
export function VoiceMicButton({
  recorderState,
  transcriptionLoading,
  onStart,
  onStop,
}: VoiceMicButtonProps) {
  if (transcriptionLoading) {
    return (
      <button type="button" disabled aria-label="Transcribing…" className={`${BASE} text-muted`}>
        <CircleNotchIcon size={20} className="animate-spin" />
      </button>
    );
  }

  if (recorderState === 'recording') {
    return (
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop recording"
        className={`${BASE} animate-pulse bg-danger/10 text-danger hover:bg-danger/20`}
      >
        <StopIcon size={18} weight="fill" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      aria-label="Start voice input"
      className={`${BASE} text-muted hover:bg-surface-2 hover:text-ink`}
    >
      <MicrophoneIcon size={20} />
    </button>
  );
}
