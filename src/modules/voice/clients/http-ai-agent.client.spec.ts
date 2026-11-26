import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HttpAiVoiceAgentClient } from './http-ai-agent.client';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

describe('HttpAiVoiceAgentClient', () => {
  let client: HttpAiVoiceAgentClient;
  let configService: {
    get: ReturnType<typeof vi.fn>;
  };

  const mockConfig: Record<string, string> = {
    AI_VOICE_AGENT_URL: 'http://ai-service.local/api/v1',
    AI_VOICE_AGENT_API_KEY: 'test-secret-key',
    AI_VOICE_AGENT_TIMEOUT_MS: '2000',
    AI_VOICE_AGENT_CLASSIFY_PATH: 'intent/classify',
  };

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => mockConfig[key]),
    };
    client = new HttpAiVoiceAgentClient(configService as unknown as ConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Runtime Validation of AI Responses (Point 2 & 3)', () => {
    it('should successfully validate a well-formed AI response', () => {
      const raw = {
        intent: 'READ_DOCUMENT',
        confidence: 0.942,
        entities: { target: 'document', page: 1 },
        requiresClarification: false,
        suggestedResponse: 'سأقرأ الورقة حالاً',
        isSupported: true,
      };

      const validated = client.validateRuntimeResponse(raw);

      expect(validated.intent).toBe('READ_DOCUMENT');
      expect(validated.confidence).toBe(0.942);
      expect(validated.requiresClarification).toBe(false);
      expect(validated.suggestedResponse).toBe('سأقرأ الورقة حالاً');
      expect(validated.entities.target).toBe('document');
      expect(validated.isSupported).toBe(true);
    });

    it('should reject non-object payloads with ERR_SERVICE_UNAVAILABLE', () => {
      expect(() => client.validateRuntimeResponse(null)).toThrow(AppException);
      expect(() => client.validateRuntimeResponse('raw-string')).toThrow(AppException);
      expect(() => client.validateRuntimeResponse([1, 2, 3])).toThrow(AppException);
    });

    it('should reject responses with missing or empty intent string', () => {
      expect(() => client.validateRuntimeResponse({})).toThrow(AppException);
      expect(() => client.validateRuntimeResponse({ intent: '' })).toThrow(AppException);
      expect(() => client.validateRuntimeResponse({ intent: 123 })).toThrow(AppException);
      expect(() => client.validateRuntimeResponse({ intent: null })).toThrow(AppException);
    });

    it('should normalize non-numeric confidence to null without fabricating numbers', () => {
      const rawNonNumeric = {
        intent: 'DETECT_COLOR',
        confidence: 'high', // Invalid type from AI
        isSupported: true,
      };

      const validated = client.validateRuntimeResponse(rawNonNumeric);
      expect(validated.confidence).toBeNull();
    });

    it('should normalize out-of-range confidence to null', () => {
      const rawOutOfRange = {
        intent: 'DETECT_COLOR',
        confidence: 1.5, // Out of [0, 1] bounds
        isSupported: true,
      };

      const validated = client.validateRuntimeResponse(rawOutOfRange);
      expect(validated.confidence).toBeNull();
    });

    it('should safely extract only primitive entities and array of strings', () => {
      const rawWithEntities = {
        intent: 'INDOOR_NAVIGATION',
        entities: {
          destination: 'lab',
          floor: 2,
          isAccessible: true,
          nestedObject: { dangerous: true }, // Should be stripped
          tags: ['quiet', 'open'],
        },
        isSupported: true,
      };

      const validated = client.validateRuntimeResponse(rawWithEntities);
      expect(validated.entities.destination).toBe('lab');
      expect(validated.entities.floor).toBe(2);
      expect(validated.entities.isAccessible).toBe(true);
      expect(validated.entities.nestedObject).toBeUndefined();
      expect(validated.entities.tags).toEqual(['quiet', 'open']);
    });
  });

  describe('HTTP Communication & Timeout Handling (Point 4 & 5)', () => {
    it('should send headers and payload and return validated response on 200 OK', async () => {
      const mockResponseBody = {
        intent: 'RECOGNIZE_CURRENCY',
        confidence: 0.98,
        entities: { target: 'currency' },
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponseBody,
      });
      global.fetch = fetchMock;

      const result = await client.classifyIntent('معايا فلوس كام', 'ar-EG', 'corr-123');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe('http://ai-service.local/api/v1/intent/classify');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Authorization']).toBe('Bearer test-secret-key');
      expect(callArgs[1].headers['X-Correlation-ID']).toBe('corr-123');
      expect(result.intent).toBe('RECOGNIZE_CURRENCY');
    });

    it('should throw ERR_SERVICE_UNAVAILABLE on timeout without retrying (zero retries on timeout)', async () => {
      const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      const fetchMock = vi.fn().mockRejectedValue(timeoutError);
      global.fetch = fetchMock;

      await expect(client.classifyIntent('أمر صوتي')).rejects.toThrow(AppException);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Enforces zero retries
    });

    it('should throw ERR_SERVICE_UNAVAILABLE on connection refused without multiple slow retries', async () => {
      const connError = new TypeError('fetch failed: ECONNREFUSED');
      const fetchMock = vi.fn().mockRejectedValue(connError);
      global.fetch = fetchMock;

      await expect(client.classifyIntent('أمر صوتي')).rejects.toThrow(AppException);
      try {
        await client.classifyIntent('أمر صوتي');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });

    it('should throw ERR_SERVICE_UNAVAILABLE on HTTP 500 error from AI server', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error in Python Model',
      });
      global.fetch = fetchMock;

      await expect(client.classifyIntent('أمر صوتي')).rejects.toThrow(AppException);
    });

    it('should throw ERR_SERVICE_UNAVAILABLE when server returns non-JSON text', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });
      global.fetch = fetchMock;

      await expect(client.classifyIntent('أمر صوتي')).rejects.toThrow(AppException);
    });
  });

  describe('Multipart Audio Transcription (transcribeAudio)', () => {
    const mockAudio = {
      buffer: Buffer.from('audio-data'),
      mimeType: 'audio/wav',
      fileName: 'test.wav',
    };

    it('should send FormData to the right URL with Authorization and X-Correlation-ID', async () => {
      const mockResponseBody = {
        transcript: 'عايز أروح مكتب العميد',
        language: 'ar-EG',
        confidence: 0.95,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponseBody,
      });
      global.fetch = fetchMock;

      const result = await client.transcribeAudio(mockAudio, 'ar-EG', 'corr-456');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('http://ai-service.local/api/v1/speech/transcribe');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer test-secret-key');
      expect(options.headers['X-Correlation-ID']).toBe('corr-456');
      expect(options.body).toBeInstanceOf(FormData);
      expect(result).toEqual({
        transcript: 'عايز أروح مكتب العميد',
        language: 'ar-EG',
        confidence: 0.95,
      });
    });

    it('should throw ERR_REQUEST_TIMEOUT on timeout with exactly one fetch call (no retries)', async () => {
      const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      const fetchMock = vi.fn().mockRejectedValue(timeoutError);
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.REQUEST_TIMEOUT);
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should throw ERR_SERVICE_UNAVAILABLE on network failure', async () => {
      const networkError = new TypeError('fetch failed: ECONNRESET');
      const fetchMock = vi.fn().mockRejectedValue(networkError);
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });

    it('should throw ERR_SERVICE_UNAVAILABLE when server returns malformed non-JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });

    it('should throw ERR_SERVICE_UNAVAILABLE when AI returns invalid response shape (non-object or missing transcript)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ wrongField: 'no transcript' }),
      });
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });

    it('should pass through upstream error when AI service returns an AI-owned errorCode', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ errorCode: AppErrorCode.NO_SPEECH_DETECTED }),
      });
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.NO_SPEECH_DETECTED);
      }
    });

    it('should throw ERR_SERVICE_UNAVAILABLE when AI returns an unknown or non-ai-owned errorCode', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ errorCode: 'UNKNOWN_EXTERNAL_ERROR' }),
      });
      global.fetch = fetchMock;

      try {
        await client.transcribeAudio(mockAudio, 'ar-EG');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });
  });
});
