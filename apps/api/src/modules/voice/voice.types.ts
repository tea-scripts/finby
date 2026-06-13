/** The uploaded audio clip as held in memory by multer (never written to disk). */
export interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
}

export interface TranscriptionResult {
  text: string;
  /** Wall-clock spent on the upstream transcription call, for observability. */
  durationMs: number;
}

/**
 * Pluggable speech-to-text backend. Phase 1 uses OpenAI Whisper; Phase 2/3 can
 * swap in ElevenLabs / a realtime provider by implementing this interface
 * without touching the controller or tier-gating logic.
 */
export interface ITranscriptionProvider {
  transcribe(audio: UploadedAudio): Promise<TranscriptionResult>;
}
