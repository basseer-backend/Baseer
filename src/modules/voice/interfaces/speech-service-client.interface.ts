/**
 * Input request payload for Cloud Speech-to-Text operations.
 */
export interface AudioTranscriptionRequest {
  /**
   * Validated audio binary buffer (e.g. 16kHz mono Opus).
   */
  audioBuffer: Buffer;

  /**
   * Container MIME type (e.g. 'audio/ogg; codecs=opus' or 'audio/webm; codecs=opus').
   */
  mimeType: string;

  /**
   * Expected spoken language locale (defaults to 'ar-EG').
   */
  language?: string;

  /**
   * Audio duration in seconds, if known from container headers.
   */
  durationSeconds?: number;

  /**
   * Distributed tracing correlation ID for log propagation.
   */
  correlationId?: string;
}

/**
 * Normalized output result from Speech-to-Text transcription.
 */
export interface SpeechTranscriptionResult {
  /**
   * Recognized speech text.
   */
  transcript: string;

  /**
   * Calibrated confidence score (0.0 to 1.0). Zero fabrication.
   */
  confidence?: number;

  /**
   * Language detected or verified by the model.
   */
  detectedLanguage?: string;

  /**
   * Audio duration processed, in seconds.
   */
  durationSeconds?: number;
}

/**
 * Dependency injection token for the Speech Service Client.
 */
export const SPEECH_SERVICE_CLIENT = Symbol('SPEECH_SERVICE_CLIENT');

/**
 * Provider-independent interface for Cloud Speech-to-Text services.
 * Keeps vendor-specific schemas, protocols, and credentials completely decoupled
 * from Baseer domain logic.
 */
export interface ISpeechServiceClient {
  transcribe(
    request: AudioTranscriptionRequest,
  ): Promise<SpeechTranscriptionResult>;
}
