'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { CameraIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useVoiceRecorder } from '@/components/voice/use-voice-recorder';
import { useVoiceTranscription } from '@/components/voice/use-voice-transcription';
import { VoiceMicButton } from '@/components/voice/voice-mic-button';
import { VoiceTranscriptPreview } from '@/components/voice/voice-transcript-preview';

/** Chat input. Enter sends, Shift+Enter inserts a newline.
 *  Typing the `/clear` command starts a fresh chat instead of sending.
 *  When `onScanReceipt` is provided, a camera button opens the receipt scanner.
 *  When `voice` is provided, a mic button records → transcribes → previews
 *  before sending. FREE workspaces see the mic but tapping it prompts upgrade
 *  rather than recording. */
export function Composer({
  disabled,
  onSend,
  onClearCommand,
  onScanReceipt,
  voice,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
  onClearCommand: () => void;
  onScanReceipt?: () => void;
  voice?: {
    /** PRO+ may record; FREE taps fire onUpgradeNeeded instead. */
    enabled: boolean;
    workspaceId: string;
    onUpgradeNeeded: () => void;
  };
}) {
  const [value, setValue] = useState('');
  const { state: recState, isSupported, start, stop } = useVoiceRecorder();
  const {
    state: txState,
    text: transcript,
    upgradeRequired,
    transcribe,
    reset: resetTranscription,
  } = useVoiceTranscription(voice?.workspaceId);

  function submit() {
    const content = value.trim();
    if (!content || disabled) return;
    // `/clear` is a client-side command — it never reaches the LLM.
    if (content.toLowerCase() === '/clear') {
      setValue('');
      onClearCommand();
      return;
    }
    onSend(content);
    setValue('');
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleMicStart() {
    // FREE tier: surface the upgrade prompt instead of starting a recording.
    if (!voice?.enabled) {
      voice?.onUpgradeNeeded();
      return;
    }
    void start();
  }

  async function handleMicStop() {
    const blob = await stop();
    const text = await transcribe(blob);
    // Defense in depth: if the server rejected a sub-PRO workspace, prompt upgrade.
    if (!text && upgradeRequired) voice?.onUpgradeNeeded();
  }

  return (
    <>
      {txState === 'done' && transcript && (
        <VoiceTranscriptPreview
          transcript={transcript}
          onConfirm={() => {
            onSend(transcript);
            resetTranscription();
          }}
          onEdit={() => {
            setValue(transcript);
            resetTranscription();
          }}
          onDismiss={resetTranscription}
        />
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 rounded-2xl border border-line bg-surface/80 p-2 shadow-card backdrop-blur"
      >
        {onScanReceipt && (
          <button
            type="button"
            aria-label="Scan a receipt"
            onClick={onScanReceipt}
            disabled={disabled}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <CameraIcon size={22} />
          </button>
        )}
        {voice && isSupported && (
          <VoiceMicButton
            recorderState={recState}
            transcriptionLoading={txState === 'loading'}
            onStart={handleMicStart}
            onStop={() => void handleMicStop()}
          />
        )}
        <textarea
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tell Finby what you spent…"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-faint md:text-sm"
        />
        <Button type="submit" loading={disabled} disabled={!value.trim()} className="shrink-0">
          Send
        </Button>
      </form>
    </>
  );
}
