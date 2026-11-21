import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceActionMapperService } from './voice-action-mapper.service';
import {
  IAiVoiceAgentClient,
  AiIntentClassificationResult,
} from './clients/ai-agent.interface';
import { VoiceIntent, MobileAction } from './dto/voice-enums';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';

describe('VoiceAssistantService', () => {
  let service: VoiceAssistantService;
  let mockAiClient: {
    classifyIntent: ReturnType<typeof vi.fn>;
  };
  let actionMapper: VoiceActionMapperService;

  beforeEach(() => {
    mockAiClient = {
      classifyIntent: vi.fn(),
    };
    actionMapper = new VoiceActionMapperService();

    service = new VoiceAssistantService(
      mockAiClient as unknown as IAiVoiceAgentClient,
      actionMapper,
    );
  });

  describe('Input Validation', () => {
    it('should throw VALIDATION_FAILED when userSpeech is empty or whitespace', async () => {
      await expect(
        service.processCommand({ userSpeech: '   ' }),
      ).rejects.toThrow(AppException);

      try {
        await service.processCommand({ userSpeech: '' });
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.VALIDATION_FAILED);
      }
    });
  });

  describe('Case 1: Recognized Intent', () => {
    it('should successfully orchestrate recognized command and map to MobileAction', async () => {
      const aiResult: AiIntentClassificationResult = {
        intent: 'READ_DOCUMENT',
        confidence: 0.954,
        entities: { target: 'document' },
        requiresClarification: false,
        suggestedResponse: 'سأقرأ الورقة لك حالاً',
        isSupported: true,
      };
      mockAiClient.classifyIntent.mockResolvedValue(aiResult);

      const result = await service.processCommand(
        { userSpeech: 'اقرأ لي الورقة دي', language: 'ar-EG' },
        'corr-456',
      );

      expect(mockAiClient.classifyIntent).toHaveBeenCalledWith(
        'اقرأ لي الورقة دي',
        'ar-EG',
        'corr-456',
      );
      expect(result.detectedIntent).toBe(VoiceIntent.READ_DOCUMENT);
      expect(result.actionToTriggerOnMobile).toBe(MobileAction.OPEN_CAMERA_OCR);
      expect(result.confidence).toBe(0.954);
      expect(result.spokenResponse).toBe('سأقرأ الورقة لك حالاً');
      expect(result.requiresClarification).toBe(false);
      expect(result.entities).toEqual({ target: 'document' });
    });

    it('should handle null confidence without fabricating synthetic scores', async () => {
      const aiResult: AiIntentClassificationResult = {
        intent: 'DETECT_COLOR',
        confidence: null, // Model provides no confidence
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };
      mockAiClient.classifyIntent.mockResolvedValue(aiResult);

      const result = await service.processCommand({ userSpeech: 'القميص ده لونه إيه' });

      expect(result.detectedIntent).toBe(VoiceIntent.DETECT_COLOR);
      expect(result.confidence).toBeNull();
      expect(result.actionToTriggerOnMobile).toBe(MobileAction.OPEN_CAMERA_COLOR);
    });
  });

  describe('Case 2: Unknown or Unsupported Intent', () => {
    it('should throw INTENT_NOT_RECOGNIZED when AI classifies command as unsupported', async () => {
      const aiResult: AiIntentClassificationResult = {
        intent: 'UNKNOWN',
        confidence: 0.12,
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: false,
      };
      mockAiClient.classifyIntent.mockResolvedValue(aiResult);

      await expect(
        service.processCommand({ userSpeech: 'كلمة عشوائية مش مفهومة' }),
      ).rejects.toThrow(AppException);

      try {
        await service.processCommand({ userSpeech: 'كلمة عشوائية مش مفهومة' });
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.INTENT_NOT_RECOGNIZED);
      }
    });

    it('should throw INTENT_NOT_RECOGNIZED when AI returns an unmapped intent string', async () => {
      const aiResult: AiIntentClassificationResult = {
        intent: 'ORDER_PIZZA',
        confidence: 0.99,
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };
      mockAiClient.classifyIntent.mockResolvedValue(aiResult);

      await expect(
        service.processCommand({ userSpeech: 'عايز اطلب بيتزا' }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('Case 3: Requires Clarification', () => {
    it('should return 200 OK with actionToTriggerOnMobile=null when clarification needed', async () => {
      const aiResult: AiIntentClassificationResult = {
        intent: 'INDOOR_NAVIGATION',
        confidence: 0.85,
        entities: { missing: ['destination'] },
        requiresClarification: true,
        suggestedResponse: 'تحب تروح فين؟ قولي اسم المكان',
        isSupported: true,
      };
      mockAiClient.classifyIntent.mockResolvedValue(aiResult);

      const result = await service.processCommand({ userSpeech: 'عايز أروح' });

      expect(result.detectedIntent).toBe(VoiceIntent.INDOOR_NAVIGATION);
      expect(result.requiresClarification).toBe(true);
      expect(result.actionToTriggerOnMobile).toBeNull(); // Never trigger camera when clarifying
      expect(result.spokenResponse).toBe('تحب تروح فين؟ قولي اسم المكان');
      expect(result.entities).toEqual({ missing: ['destination'] });
    });
  });

  describe('Case 4: Invalid AI Response', () => {
    it('should rethrow SERVICE_UNAVAILABLE when AI client throws validation error', async () => {
      mockAiClient.classifyIntent.mockRejectedValue(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'استجابة خادم الذكاء الاصطناعي غير متطابقة مع عقد التكامل',
        ),
      );

      await expect(
        service.processCommand({ userSpeech: 'اقرأ لي' }),
      ).rejects.toThrow(AppException);

      try {
        await service.processCommand({ userSpeech: 'اقرأ لي' });
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });
  });

  describe('Case 5: AI Service Unavailable or Timeout', () => {
    it('should throw SERVICE_UNAVAILABLE when external AI server times out or disconnects', async () => {
      mockAiClient.classifyIntent.mockRejectedValue(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'خدمة الذكاء الاصطناعي استغرقت وقتاً أطول من المسموح به، يرجى المحاولة لاحقاً',
        ),
      );

      await expect(
        service.processCommand({ userSpeech: 'في إيه قدامي' }),
      ).rejects.toThrow(AppException);

      try {
        await service.processCommand({ userSpeech: 'في إيه قدامي' });
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.SERVICE_UNAVAILABLE);
      }
    });
  });
});
