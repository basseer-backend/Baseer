/**
 * Voice Module Constants and Upload Constraints
 */

export const VOICE_AUDIO_MAX_BYTES =
  parseInt(process.env.VOICE_AUDIO_MAX_BYTES || '', 10) || 5 * 1024 * 1024; // 5 MB

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/webm',
  'audio/ogg',
] as const;

export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

export const DEFAULT_VOICE_LANGUAGE = 'ar-EG';
export const ALLOWED_VOICE_LANGUAGES = ['ar-EG', 'en-US'] as const;

export const DEFAULT_AI_VOICE_TRANSCRIBE_PATH = 'speech/transcribe';
export const DEFAULT_AI_VOICE_TRANSCRIBE_TIMEOUT_MS = 8000;

/**
 * Clean typed interface for uploaded audio files avoiding external namespace dependencies.
 */
export interface UploadedAudioFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
