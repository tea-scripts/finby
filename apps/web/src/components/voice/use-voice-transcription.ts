import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { transcribeAudio } from '@/lib/voice-api';

export type TranscriptionState = 'idle' | 'loading' | 'done' | 'error';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // mirrors the API's 10MB cap

/**
 * Sends a recorded clip to the transcription endpoint and tracks the result.
 * `upgradeRequired` flips true when the API rejects a sub-PRO workspace, so the
 * caller can surface the upgrade prompt instead of a generic error.
 */
export function useVoiceTranscription(workspaceId: string | undefined) {
  const [state, setState] = useState<TranscriptionState>('idle');
  const [text, setText] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const transcribe = useCallback(
    async (blob: Blob): Promise<string | null> => {
      if (!workspaceId || blob.size === 0 || blob.size > MAX_AUDIO_BYTES) {
        setState('error');
        return null;
      }
      setState('loading');
      setText('');
      setUpgradeRequired(false);
      try {
        const { text: out } = await transcribeAudio(workspaceId, blob);
        if (!out) {
          setState('error');
          return null;
        }
        setText(out);
        setState('done');
        return out;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          const detail = err.details as { upgradeRequired?: boolean } | undefined;
          if (detail?.upgradeRequired) setUpgradeRequired(true);
        }
        setState('error');
        return null;
      }
    },
    [workspaceId],
  );

  const reset = useCallback(() => {
    setState('idle');
    setText('');
    setUpgradeRequired(false);
  }, []);

  return { state, text, upgradeRequired, transcribe, reset };
}
