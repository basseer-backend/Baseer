import { Injectable, Logger } from '@nestjs/common';
import { VoiceIntent, MobileAction } from '../../common/enums';
import { AiIntentClassificationResult } from './clients/ai-agent.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';

export interface ActionMappingResult {
  detectedIntent: VoiceIntent;
  actionToTriggerOnMobile: MobileAction | null;
  spokenResponse: string;
}

@Injectable()
export class VoiceActionMapperService {
  private readonly logger = new Logger(VoiceActionMapperService.name);

  private readonly intentToActionMap: Readonly<Record<VoiceIntent, MobileAction>> = {
    [VoiceIntent.READ_DOCUMENT]: MobileAction.OPEN_CAMERA_OCR,
    [VoiceIntent.RECOGNIZE_CURRENCY]: MobileAction.OPEN_CAMERA_CURRENCY,
    [VoiceIntent.INDOOR_NAVIGATION]: MobileAction.OPEN_CAMERA_QR,
    [VoiceIntent.DESCRIBE_SCENE]: MobileAction.OPEN_CAMERA_DESCRIBE,
    [VoiceIntent.DETECT_COLOR]: MobileAction.OPEN_CAMERA_COLOR,
    [VoiceIntent.READ_TRAFFIC_SIGN]: MobileAction.OPEN_CAMERA_TRAFFIC_SIGN,
    [VoiceIntent.DETECT_OBSTACLE]: MobileAction.OPEN_CAMERA_OBSTACLE,
    [VoiceIntent.DETECT_EXPRESSION]: MobileAction.OPEN_CAMERA_EXPRESSION,
  };

  private readonly defaultSpokenResponses: Readonly<Record<VoiceIntent, string>> = {
    [VoiceIntent.READ_DOCUMENT]: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
    [VoiceIntent.RECOGNIZE_CURRENCY]: 'حاضر، وريني الفلوس في الكاميرا',
    [VoiceIntent.INDOOR_NAVIGATION]: 'تحت أمرك، امسح كود الـ QR اللي جنبك وقولي عايز تروح فين',
    [VoiceIntent.DESCRIBE_SCENE]: 'حاضر، سأصف لك المشهد المحيط بك الآن',
    [VoiceIntent.DETECT_COLOR]: 'وجه الكاميرا نحو العنصر لأخبرك بلونه',
    [VoiceIntent.READ_TRAFFIC_SIGN]: 'جاري فحص إشارات المرور أمامك',
    [VoiceIntent.DETECT_OBSTACLE]: 'سأراقب طريقك وأنبهك لأي عوائق',
    [VoiceIntent.DETECT_EXPRESSION]: 'وجه الكاميرا نحو الشخص لأخبرك بتعابير وجهه',
  };

  /**
   * Maps an AI classification result to the Baseer domain VoiceIntent and MobileAction.
   * Strictly enforces that unknown or unsupported intents are rejected and NEVER mapped to an action.
   */
  mapAiResultToAction(aiResult: AiIntentClassificationResult): ActionMappingResult {
    // 1. Validate if AI reported isSupported = false
    if (!aiResult.isSupported) {
      this.logger.warn(`AI classified intent as unsupported: "${aiResult.intent}"`);
      throw new AppException(AppErrorCode.INTENT_NOT_RECOGNIZED);
    }

    // 2. Strict enum check: Reject any intent not present in VoiceIntent enum
    const detectedIntent = this.parseVoiceIntent(aiResult.intent);
    if (!detectedIntent) {
      this.logger.warn(
        `Intent "${aiResult.intent}" is not recognized in Baseer VoiceIntent enum. Rejecting mapping.`,
      );
      throw new AppException(AppErrorCode.INTENT_NOT_RECOGNIZED);
    }

    // 3. Handle Clarification scenario (Case 3):
    // When the user command is ambiguous, NEVER trigger a camera action on mobile.
    if (aiResult.requiresClarification) {
      const clarificationResponse =
        aiResult.suggestedResponse ||
        'من فضلك، وضح طلبك أكتر عشان أقدر أساعدك';

      return {
        detectedIntent,
        actionToTriggerOnMobile: null,
        spokenResponse: clarificationResponse,
      };
    }

    // 4. Standard mapping for recognized, complete commands (Case 1):
    const actionToTriggerOnMobile = this.intentToActionMap[detectedIntent];
    if (!actionToTriggerOnMobile) {
      this.logger.error(
        `No MobileAction mapping found for valid VoiceIntent "${detectedIntent}"!`,
      );
      throw new AppException(AppErrorCode.INTENT_NOT_RECOGNIZED);
    }

    const spokenResponse =
      aiResult.suggestedResponse || this.defaultSpokenResponses[detectedIntent];

    return {
      detectedIntent,
      actionToTriggerOnMobile,
      spokenResponse,
    };
  }

  /**
   * Safe parser for VoiceIntent enum.
   */
  public parseVoiceIntent(intentString: string): VoiceIntent | null {
    if (!intentString || typeof intentString !== 'string') {
      return null;
    }
    const normalized = intentString.trim().toUpperCase();
    const values = Object.values(VoiceIntent) as string[];
    if (values.includes(normalized)) {
      return normalized as VoiceIntent;
    }
    return null;
  }
}
