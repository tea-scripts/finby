import { useAuth } from './store';

/**
 * Upload a recorded audio clip for transcription. The API holds the audio in
 * memory only (never persisted) and returns the transcript for the user to
 * confirm before it is sent through the chat pipeline. PRO+ only — FREE
 * workspaces get a 403 with `{ details: { upgradeRequired: true } }`.
 */
export function transcribeAudio(workspaceId: string, audio: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append('audio', audio, 'audio.webm');
  return useAuth.getState().authed<{ text: string }>(
    `/workspaces/${workspaceId}/voice/transcribe`,
    { method: 'POST', body: form },
  );
}
