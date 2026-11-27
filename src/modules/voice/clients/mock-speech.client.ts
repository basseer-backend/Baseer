import { Injectable, Logger } from '@nestjs/common';
import {
  AudioTranscriptionRequest,
  ISpeechServiceClient,
  SpeechTranscriptionResult,
} from '../interfaces/speech-service-client.interface';
import { SpeechErrorMapperHelper } from '../helpers/speech-error-mapper.helper';

/**
 * Mock Speech Service Client for testing and local development.
 * Simulates transcription results and test failure triggers deterministically
 * without making external network calls.
 */
@Injectable()
export class MockSpeechClient implements ISpeechServiceClient {
  private readonly logger = new Logger(MockSpeechClient.name);

  private mockResponse: SpeechTranscriptionResult = {
    transcript: 'عايز أروح مكتب العميد',
    confidence: 0.96,
    detectedLanguage: 'ar-EG',
    durationSeconds: 3.2,
  };

  private simulatedError: any = null;

  /**
   * Configures a custom mock response for testing.
   */
  public setMockResponse(response: SpeechTranscriptionResult): void {
    this.mockResponse = response;
    this.simulatedError = null;
  }

  /**
   * Configures a simulated upstream error for testing error mapping.
   */
  public setSimulatedError(error: any): void {
    this.simulatedError = error;
  }

  /**
   * Resets the mock client to default success response.
   */
  public reset(): void {
    this.mockResponse = {
      transcript: 'عايز أروح مكتب العميد',
      confidence: 0.96,
      detectedLanguage: 'ar-EG',
      durationSeconds: 3.2,
    };
    this.simulatedError = null;
  }

  async transcribe(
    request: AudioTranscriptionRequest,
  ): Promise<SpeechTranscriptionResult> {
    this.logger.debug(
      `[MockSpeechClient] Simulating transcription for buffer size: ${request.audioBuffer?.length} bytes [correlationId: ${request.correlationId || 'none'}]`,
    );

    if (this.simulatedError) {
      SpeechErrorMapperHelper.mapUpstreamError(
        this.simulatedError,
        'MockSpeechClient',
        request.correlationId,
      );
    }

    return SpeechErrorMapperHelper.validateTranscriptionResult(
      this.mockResponse,
    );
  }
}
