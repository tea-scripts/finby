import { useCallback, useRef, useState } from 'react';
import type { RecorderState } from './voice.types';

/**
 * Records a single audio clip via MediaRecorder. Feature-detects support so the
 * caller can hide the mic on browsers without MediaRecorder. A 250ms timeslice
 * is used so Phase 3 can switch from blob accumulation to WebSocket chunking
 * without changing how recording starts.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isSupported = typeof window !== 'undefined' && 'MediaRecorder' in window;

  const start = useCallback(async (): Promise<void> => {
    if (!isSupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setState('recording');
    } catch (err) {
      console.error('getUserMedia failed:', err);
      setState('error');
    }
  }, [isSupported]);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        // Release the mic so the browser stops showing the "recording" indicator.
        recorder.stream.getTracks().forEach((track) => track.stop());
        setState('idle');
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const resetError = useCallback(() => setState('idle'), []);

  return { state, isSupported, start, stop, resetError };
}
