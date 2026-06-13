import { PencilSimpleIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import type { VoiceTranscriptPreviewProps } from './voice.types';

/** Shows what Finby heard above the composer so the user confirms (Send),
 *  corrects (Edit → drops text into the input), or discards (Dismiss) before
 *  anything reaches the chat pipeline. */
export function VoiceTranscriptPreview({
  transcript,
  onConfirm,
  onEdit,
  onDismiss,
}: VoiceTranscriptPreviewProps) {
  return (
    <div
      role="region"
      aria-label="Voice transcript preview"
      className="mb-2 rounded-xl border border-line bg-surface/80 p-3 shadow-card"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Finby heard</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss transcript"
          className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-ink"
        >
          <XIcon size={14} />
        </button>
      </div>

      <p className="text-sm text-ink">{transcript}</p>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onEdit} className="gap-1.5">
          <PencilSimpleIcon size={14} />
          Edit
        </Button>
        <Button onClick={onConfirm}>Send</Button>
      </div>
    </div>
  );
}
