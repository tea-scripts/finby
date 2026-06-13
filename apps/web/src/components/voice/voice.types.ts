export type RecorderState = 'idle' | 'recording' | 'error';

export interface VoiceMicButtonProps {
  recorderState: RecorderState;
  transcriptionLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}

export interface VoiceTranscriptPreviewProps {
  transcript: string;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}
