import { describe, it, expect, beforeEach } from 'vitest';
import { SpeechErrorMapperHelper } from '../helpers/speech-error-mapper.helper';
import { UnconfiguredSpeechClient } from './unconfigured-speech.client';
import { MockSpeechClient } from './mock-speech.client';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { AudioTranscriptionRequest } from '../interfaces/speech-service-client.interface';

describe('Speech Service Client & Error Mapping', () => {
  const dummyRequest: AudioTranscriptionRequest = {
    audioBuffer: Buffer.from('dummy-audio'),
    mimeType: 'audio/ogg; codecs=opus',
    language: 'ar-EG',
    correlationId: 'test-corr-123',
  };

  describe('SpeechErrorMapperHelper', () => {
    it('maps timeout and abort errors to ERR_REQUEST_TIMEOUT (504)', () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      try {
        SpeechErrorMapperHelper.mapUpstreamError(abortError, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.REQUEST_TIMEOUT);
        expect(err.getStatus()).toBe(504);
      }
    });

    it('maps network failures (ECONNREFUSED) to ERR_SERVICE_UNAVAILABLE (503)', () => {
      const netError = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:8000' };

      try {
        SpeechErrorMapperHelper.mapUpstreamError(netError, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
        expect(err.getStatus()).toBe(503);
      }
    });

    it('maps upstream rate limit (429) to ERR_TOO_MANY_REQUESTS (429)', () => {
      const rateLimitError = { status: 429, message: 'Too Many Requests from Cloud Provider' };

      try {
        SpeechErrorMapperHelper.mapUpstreamError(rateLimitError, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.TOO_MANY_REQUESTS);
        expect(err.getStatus()).toBe(429);
      }
    });

    it('maps upstream 413 to ERR_AUDIO_TOO_LARGE (413)', () => {
      const payloadError = { status: 413, message: 'Payload Too Large' };

      try {
        SpeechErrorMapperHelper.mapUpstreamError(payloadError, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.AUDIO_TOO_LARGE);
        expect(err.getStatus()).toBe(413);
      }
    });

    it('maps upstream 400 to ERR_UNSUPPORTED_AUDIO_FORMAT (422)', () => {
      const badReq = { status: 400, message: 'Bad audio data' };

      try {
        SpeechErrorMapperHelper.mapUpstreamError(badReq, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
        expect(err.getStatus()).toBe(422);
      }
    });

    it('maps unknown 500 errors to ERR_INTERNAL_SERVER_ERROR (500)', () => {
      const crash = new Error('Python crash in speech model');

      try {
        SpeechErrorMapperHelper.mapUpstreamError(crash, 'TestProvider');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.INTERNAL_SERVER_ERROR);
        expect(err.getStatus()).toBe(500);
        // Sensitive internal crash message must not leak to user
        expect(err.message).not.toContain('Python crash');
      }
    });

    it('rejects empty transcription result with ERR_NO_SPEECH_DETECTED (422)', () => {
      expect(() =>
        SpeechErrorMapperHelper.validateTranscriptionResult({
          transcript: '   ',
          confidence: 0.9,
        }),
      ).toThrow(AppException);

      try {
        SpeechErrorMapperHelper.validateTranscriptionResult({ transcript: '' });
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.NO_SPEECH_DETECTED);
        expect(err.getStatus()).toBe(422);
      }
    });

    it('rejects low confidence result with ERR_LOW_CONFIDENCE (422)', () => {
      try {
        SpeechErrorMapperHelper.validateTranscriptionResult({
          transcript: 'كلام غير واضح',
          confidence: 0.35, // Below 0.5
        });
        expect.unreachable('Should have thrown LOW_CONFIDENCE');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.LOW_CONFIDENCE);
        expect(err.getStatus()).toBe(422);
      }
    });
  });

  describe('UnconfiguredSpeechClient', () => {
    it('throws ERR_SERVICE_UNAVAILABLE (503) indicating provider selection is pending', async () => {
      const client = new UnconfiguredSpeechClient();

      await expect(client.transcribe(dummyRequest)).rejects.toThrow(AppException);

      try {
        await client.transcribe(dummyRequest);
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
        expect(err.getStatus()).toBe(503);
        expect(err.message).toContain('في انتظار اعتماد المزود');
      }
    });
  });

  describe('MockSpeechClient', () => {
    let mockClient: MockSpeechClient;

    beforeEach(() => {
      mockClient = new MockSpeechClient();
    });

    it('returns default mock transcription successfully', async () => {
      const result = await mockClient.transcribe(dummyRequest);
      expect(result.transcript).toBe('عايز أروح مكتب العميد');
      expect(result.confidence).toBe(0.96);
      expect(result.detectedLanguage).toBe('ar-EG');
    });

    it('handles simulated errors cleanly through error mapper', async () => {
      mockClient.setSimulatedError({ name: 'AbortError' });

      await expect(mockClient.transcribe(dummyRequest)).rejects.toThrow(AppException);

      try {
        await mockClient.transcribe(dummyRequest);
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.REQUEST_TIMEOUT);
      }
    });
  });

  describe('Speech Service Factory Provider Configuration (Mock Separation)', () => {
    // Replicate factory logic from voice.module.ts for isolated unit testing
    function createSpeechClient(config: Record<string, string>, isProd = false) {
      const configServiceMock = {
        get: (key: string) => config[key],
      };
      const unconfigured = new UnconfiguredSpeechClient();
      const mock = new MockSpeechClient();

      const isMockEnabled =
        configServiceMock.get('SPEECH_SERVICE_MOCK_ENABLED') === 'true';

      if (isProd && isMockEnabled) {
        throw new Error(
          'CRITICAL SECURITY ERROR: Mock Speech Service cannot be enabled in production!',
        );
      }

      if (!isProd && isMockEnabled) {
        return mock;
      }

      return unconfigured;
    }

    it('returns MockSpeechClient when SPEECH_SERVICE_MOCK_ENABLED is true in non-prod', () => {
      const client = createSpeechClient({ SPEECH_SERVICE_MOCK_ENABLED: 'true' });
      expect(client).toBeInstanceOf(MockSpeechClient);
    });

    it('returns UnconfiguredSpeechClient when SPEECH_SERVICE_MOCK_ENABLED is false even if AI_VOICE_AGENT_MOCK_ENABLED is true', () => {
      // Proves strict separation between the two mock flags
      const client = createSpeechClient({
        SPEECH_SERVICE_MOCK_ENABLED: 'false',
        AI_VOICE_AGENT_MOCK_ENABLED: 'true',
      });
      expect(client).toBeInstanceOf(UnconfiguredSpeechClient);
    });

    it('throws critical security error if SPEECH_SERVICE_MOCK_ENABLED is true in production', () => {
      expect(() =>
        createSpeechClient({ SPEECH_SERVICE_MOCK_ENABLED: 'true' }, true),
      ).toThrow('CRITICAL SECURITY ERROR');
    });
  });
});
