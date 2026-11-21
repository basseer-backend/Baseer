import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceActionMapperService } from './voice-action-mapper.service';
import { VoiceIntent, MobileAction } from './dto/voice-enums';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AiIntentClassificationResult } from './clients/ai-agent.interface';

describe('VoiceActionMapperService', () => {
  let service: VoiceActionMapperService;

  beforeEach(() => {
    service = new VoiceActionMapperService();
  });

  describe('Recognized Intent Mapping (Case 1)', () => {
    it('should map READ_DOCUMENT to OPEN_CAMERA_OCR with default response', () => {
      const input: AiIntentClassificationResult = {
        intent: 'READ_DOCUMENT',
        confidence: 0.95,
        entities: { target: 'document' },
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };

      const result = service.mapAiResultToAction(input);

      expect(result.detectedIntent).toBe(VoiceIntent.READ_DOCUMENT);
      expect(result.actionToTriggerOnMobile).toBe(MobileAction.OPEN_CAMERA_OCR);
      expect(result.spokenResponse).toContain('الورقة');
    });

    it('should preserve AI suggested response when provided', () => {
      const customResponse = 'حاضر هقرا الروشتة حالا';
      const input: AiIntentClassificationResult = {
        intent: 'READ_DOCUMENT',
        confidence: 0.98,
        entities: {},
        requiresClarification: false,
        suggestedResponse: customResponse,
        isSupported: true,
      };

      const result = service.mapAiResultToAction(input);
      expect(result.spokenResponse).toBe(customResponse);
    });

    it('should map all 8 supported intents correctly to their corresponding MobileActions', () => {
      const testCases: [string, MobileAction][] = [
        ['READ_DOCUMENT', MobileAction.OPEN_CAMERA_OCR],
        ['RECOGNIZE_CURRENCY', MobileAction.OPEN_CAMERA_CURRENCY],
        ['INDOOR_NAVIGATION', MobileAction.OPEN_CAMERA_QR],
        ['DESCRIBE_SCENE', MobileAction.OPEN_CAMERA_DESCRIBE],
        ['DETECT_COLOR', MobileAction.OPEN_CAMERA_COLOR],
        ['READ_TRAFFIC_SIGN', MobileAction.OPEN_CAMERA_TRAFFIC_SIGN],
        ['DETECT_OBSTACLE', MobileAction.OPEN_CAMERA_OBSTACLE],
        ['DETECT_EXPRESSION', MobileAction.OPEN_CAMERA_EXPRESSION],
      ];

      for (const [intentName, expectedAction] of testCases) {
        const result = service.mapAiResultToAction({
          intent: intentName,
          confidence: 0.9,
          entities: {},
          requiresClarification: false,
          suggestedResponse: null,
          isSupported: true,
        });

        expect(result.detectedIntent).toBe(intentName);
        expect(result.actionToTriggerOnMobile).toBe(expectedAction);
        expect(result.spokenResponse).toBeTruthy();
      }
    });
  });

  describe('Unsupported or Unknown Intent Rejection (Case 2)', () => {
    it('should reject when isSupported is false with INTENT_NOT_RECOGNIZED', () => {
      const input: AiIntentClassificationResult = {
        intent: 'ORDER_FOOD',
        confidence: 0.99,
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: false,
      };

      expect(() => service.mapAiResultToAction(input)).toThrowError(AppException);
      try {
        service.mapAiResultToAction(input);
      } catch (err: unknown) {
        expect((err as AppException).errorCode).toBe(AppErrorCode.INTENT_NOT_RECOGNIZED);
      }
    });

    it('should reject UNKNOWN intent and never map to any MobileAction', () => {
      const input: AiIntentClassificationResult = {
        intent: 'UNKNOWN',
        confidence: 0.2,
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };

      expect(() => service.mapAiResultToAction(input)).toThrowError(AppException);
    });

    it('should reject completely arbitrary unlisted intents', () => {
      const input: AiIntentClassificationResult = {
        intent: 'PLAY_MUSIC_SOMETHING',
        confidence: 0.95,
        entities: {},
        requiresClarification: false,
        suggestedResponse: null,
        isSupported: true,
      };

      expect(() => service.mapAiResultToAction(input)).toThrowError(AppException);
    });
  });

  describe('Clarification Handling (Case 3)', () => {
    it('should set actionToTriggerOnMobile to null when requiresClarification is true', () => {
      const input: AiIntentClassificationResult = {
        intent: 'INDOOR_NAVIGATION',
        confidence: 0.85,
        entities: { missing: ['destination'] },
        requiresClarification: true,
        suggestedResponse: 'تحب تروح فين؟',
        isSupported: true,
      };

      const result = service.mapAiResultToAction(input);

      expect(result.detectedIntent).toBe(VoiceIntent.INDOOR_NAVIGATION);
      expect(result.actionToTriggerOnMobile).toBeNull();
      expect(result.spokenResponse).toBe('تحب تروح فين؟');
    });

    it('should provide default clarification prompt if AI supplied none', () => {
      const input: AiIntentClassificationResult = {
        intent: 'DETECT_COLOR',
        confidence: 0.7,
        entities: {},
        requiresClarification: true,
        suggestedResponse: null,
        isSupported: true,
      };

      const result = service.mapAiResultToAction(input);
      expect(result.actionToTriggerOnMobile).toBeNull();
      expect(result.spokenResponse).toContain('وضح طلبك');
    });
  });
});
