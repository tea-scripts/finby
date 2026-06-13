import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecorder } from './use-voice-recorder';

/** Minimal MediaRecorder double — jsdom ships neither MediaRecorder nor getUserMedia. */
class FakeMediaRecorder {
  static isTypeSupported = (): boolean => true;
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly stream: { getTracks: () => { stop: () => void }[] };
  readonly mimeType: string;

  constructor(stream: { getTracks: () => { stop: () => void }[] }, opts?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = opts?.mimeType ?? 'audio/webm';
  }

  start(): void {
    this.state = 'recording';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) });
  }

  stop(): void {
    this.state = 'inactive';
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVoiceRecorder', () => {
  it('reports support and starts idle when MediaRecorder exists', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.state).toBe('idle');
  });

  it('transitions idle → recording on start()', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');
  });

  it('stop() resolves with a Blob and returns to idle', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    let blob: Blob | undefined;
    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(result.current.state).toBe('idle');
  });

  it('enters error state when microphone permission is denied', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('denied'),
    );
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
  });
});
