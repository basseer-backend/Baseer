import { Injectable, Logger } from '@nestjs/common';
import {
  AiIntentClassificationResult,
  IAiVoiceAgentClient,
} from './ai-agent.interface';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

/**
 * Isolated development & unit-testing mock client simulating AI Agent responses.
 * Strictly protected against execution in production environments.
 */
@Injectable()
export class MockAiVoiceAgentClient implements IAiVoiceAgentClient {
  private readonly logger = new Logger(MockAiVoiceAgentClient.name);

  constructor() {
    this.assertNotProduction();
  }

  /**
   * Enforces production protection: never allow mock client in production.
   */
  public assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY VIOLATION: MockAiVoiceAgentClient is strictly forbidden in production environments!',
      );
    }
  }

  async classifyIntent(
    text: string,
    _language = 'ar-EG',
    _correlationId?: string,
  ): Promise<AiIntentClassificationResult> {
    this.assertNotProduction();
    this.logger.debug(
      `[MOCK AI AGENT] Simulating intent classification (length: ${text.length}, correlationId: ${_correlationId || 'none'})`,
    );

    const normalized = text.trim().toLowerCase();

    // Fake test triggers for contracts and manual testing
    if (normalized === 'lowconfidence') {
      throw new AppException(AppErrorCode.LOW_CONFIDENCE);
    }
    if (normalized === 'timeout') {
      throw new AppException(AppErrorCode.REQUEST_TIMEOUT);
    }
    if (normalized === 'unavailable') {
      throw new AppException(AppErrorCode.SERVICE_UNAVAILABLE);
    }

    // Case 3: Requires Clarification simulation (User wants navigation but mentions no destination)
    if (
      normalized === 'عايز أروح' ||
      normalized === 'عايز اروح' ||
      normalized === 'وصلني'
    ) {
      return {
        intent: 'INDOOR_NAVIGATION',
        confidence: 0.88,
        entities: { missing: ['destination'] },
        requiresClarification: true,
        suggestedResponse: 'تحب تروح فين؟ قولي اسم المكان زي المكتبة أو المعمل',
        isSupported: true,
      };
    }

    // Case 1: Recognized intents simulations
    if (normalized.includes('ورقة') || normalized.includes('اقرأ') || normalized.includes('روشتة') || normalized.includes('كتاب')) {
      return {
        intent: 'READ_DOCUMENT',
        confidence: 0.95,
        entities: { target: 'document' },
        requiresClarification: false,
        suggestedResponse: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
        isSupported: true,
      };
    }

    if (normalized.includes('فلوس') || normalized.includes('جنيه') || normalized.includes('عملة') || normalized.includes('بكام')) {
      return {
        intent: 'RECOGNIZE_CURRENCY',
        confidence: 0.96,
        entities: { target: 'currency' },
        requiresClarification: false,
        suggestedResponse: 'حاضر، وريني الفلوس في الكاميرا',
        isSupported: true,
      };
    }

    if (normalized.includes('عائق') || normalized.includes('سلم') || normalized.includes('درج') || normalized.includes('حفرة')) {
      return {
        intent: 'DETECT_OBSTACLE',
        confidence: 0.94,
        entities: { target: 'obstacle' },
        requiresClarification: false,
        suggestedResponse: 'سأراقب طريقك وأنبهك لأي عوائق',
        isSupported: true,
      };
    }

    if (normalized.includes('لون') || normalized.includes('ألوان') || normalized.includes('الوان')) {
      return {
        intent: 'DETECT_COLOR',
        confidence: 0.93,
        entities: { target: 'color' },
        requiresClarification: false,
        suggestedResponse: 'وجه الكاميرا نحو العنصر لأخبرك بلونه',
        isSupported: true,
      };
    }

    if (normalized.includes('إشارة') || normalized.includes('اشارة') || normalized.includes('مرور') || normalized.includes('يافطة')) {
      return {
        intent: 'READ_TRAFFIC_SIGN',
        confidence: 0.91,
        entities: { target: 'traffic_sign' },
        requiresClarification: false,
        suggestedResponse: 'جاري فحص إشارات المرور أمامك',
        isSupported: true,
      };
    }

    if (normalized.includes('بيضحك') || normalized.includes('مبسوط') || normalized.includes('حزين') || normalized.includes('تعبير')) {
      return {
        intent: 'DETECT_EXPRESSION',
        confidence: 0.92,
        entities: { target: 'face' },
        requiresClarification: false,
        suggestedResponse: 'وجه الكاميرا نحو الشخص لأخبرك بتعابير وجهه',
        isSupported: true,
      };
    }

    if (normalized.includes('شايف') || normalized.includes('أنا فين') || normalized.includes('وصف') || normalized.includes('قدامي')) {
      return {
        intent: 'DESCRIBE_SCENE',
        confidence: 0.93,
        entities: { target: 'scene' },
        requiresClarification: false,
        suggestedResponse: 'حاضر، سأصف لك المشهد المحيط بك الآن',
        isSupported: true,
      };
    }

    if (normalized.includes('مكتب') || normalized.includes('معمل') || normalized.includes('حمام') || normalized.includes('مكتبة')) {
      return {
        intent: 'INDOOR_NAVIGATION',
        confidence: 0.94,
        entities: {},
        requiresClarification: false,
        suggestedResponse: 'تحت أمرك، امسح كود الـ QR اللي جنبك وقولي عايز تروح فين',
        isSupported: true,
      };
    }

    // Case 2: Unknown / unsupported
    return {
      intent: 'UNKNOWN',
      confidence: 0.2,
      entities: {},
      requiresClarification: false,
      suggestedResponse: null,
      isSupported: false,
    };
  }
}
