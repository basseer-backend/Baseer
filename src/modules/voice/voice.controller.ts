import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceCommandResultDto } from './dto/voice-command-result.dto';
import { VoiceIntent, MobileAction } from './dto/voice-enums';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';

@ApiTags('Voice Assistant')
@Controller('voice')
export class VoiceController {
  @Post('command')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process colloquial Egyptian voice command and return intent',
    description:
      'Maps spoken text to system intents and mobile triggers. If the phrase is unrecognized, throws ERR_INTENT_NOT_RECOGNIZED.',
  })
  @ApiOkEnvelope(VoiceCommandResultDto)
  @ApiErrorExamples(
    AppErrorCode.INTENT_NOT_RECOGNIZED,
    AppErrorCode.VALIDATION_FAILED,
  )
  processCommand(@Body() body: VoiceCommandDto): VoiceCommandResultDto {
    const text = body.userSpeech.trim().toLowerCase();

    // Fake test trigger for unhandled intent
    if (text === 'unrecognized' || text === 'unknown') {
      throw new AppException(AppErrorCode.INTENT_NOT_RECOGNIZED);
    }

    // 1) DETECT_COLOR (لون / ألوان)
    if (
      text.includes('لون') ||
      text.includes('ألوان') ||
      text.includes('الوان')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.DETECT_COLOR,
        confidence: 0.96,
        spokenResponse: 'وجه الكاميرا نحو العنصر لأخبرك بلونه',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_COLOR,
      };
    }

    // 2) DETECT_OBSTACLE (عائق / عوائق / السلم / سلالم / الدرج / درجات / حفرة / عقبة / عقبات)
    if (
      text.includes('عائق') ||
      text.includes('عوائق') ||
      text.includes('السلم') ||
      text.includes('سلالم') ||
      text.includes('الدرج') ||
      text.includes('درجات') ||
      text.includes('حفرة') ||
      text.includes('عقبة') ||
      text.includes('عقبات')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.DETECT_OBSTACLE,
        confidence: 0.95,
        spokenResponse: 'سأراقب طريقك وأنبهك لأي عوائق',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_OBSTACLE,
      };
    }

    // 3) READ_TRAFFIC_SIGN (إشارة / مرور / علامة / يافطة)
    if (
      text.includes('إشارة') ||
      text.includes('اشارة') ||
      text.includes('مرور') ||
      text.includes('علامة') ||
      text.includes('يافطة')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.READ_TRAFFIC_SIGN,
        confidence: 0.93,
        spokenResponse: 'جاري فحص إشارات المرور أمامك',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_TRAFFIC_SIGN,
      };
    }

    // 4) DETECT_EXPRESSION (بيضحك / مبسوط / حزين / تعبير / فرحان / تكشيرة)
    if (
      text.includes('بيضحك') ||
      text.includes('مبسوط') ||
      text.includes('حزين') ||
      text.includes('تعبير') ||
      text.includes('فرحان') ||
      text.includes('تكشيرة')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.DETECT_EXPRESSION,
        confidence: 0.91,
        spokenResponse: 'وجه الكاميرا نحو الشخص لأخبرك بتعابير وجهه',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_EXPRESSION,
      };
    }

    // 5) RECOGNIZE_CURRENCY (فلوس / جنيه / عملة / بكام / كام الفلوس)
    if (
      text.includes('فلوس') ||
      text.includes('جنيه') ||
      text.includes('عملة') ||
      text.includes('بكام') ||
      text.includes('كام الفلوس')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.RECOGNIZE_CURRENCY,
        confidence: 0.96,
        spokenResponse: 'حاضر، وريني الفلوس في الكاميرا',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_CURRENCY,
      };
    }

    // 6) READ_DOCUMENT (اقرأ / اقرا / ورقة / روشتة / قراءة / مكتوب / كتاب)
    if (
      text.includes('اقرأ') ||
      text.includes('اقرا') ||
      text.includes('ورقة') ||
      text.includes('روشتة') ||
      text.includes('قراءة') ||
      text.includes('مكتوب') ||
      text.includes('كتاب')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.READ_DOCUMENT,
        confidence: 0.95,
        spokenResponse: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_OCR,
      };
    }

    // 7) DESCRIBE_SCENE (أنا فين / انا فين / قدامي / حولي / حوالي / وصف / شايف / شكله)
    if (
      text.includes('أنا فين') ||
      text.includes('انا فين') ||
      text.includes('قدامي') ||
      text.includes('حولي') ||
      text.includes('حوالي') ||
      text.includes('وصف') ||
      text.includes('شايف') ||
      text.includes('شكله')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.DESCRIBE_SCENE,
        confidence: 0.92,
        spokenResponse: 'حاضر، سأصف لك المشهد المحيط بك الآن',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_DESCRIBE,
      };
    }

    // 8) INDOOR_NAVIGATION (أروح / اروح / فين / مكان / طريق / وصلني / مكتب / معمل / حمام / مكتبة)
    if (
      text.includes('أروح') ||
      text.includes('اروح') ||
      text.includes('فين') ||
      text.includes('مكان') ||
      text.includes('طريق') ||
      text.includes('وصلني') ||
      text.includes('مكتب') ||
      text.includes('معمل') ||
      text.includes('حمام') ||
      text.includes('مكتبة')
    ) {
      return {
        userInput: body.userSpeech,
        detectedIntent: VoiceIntent.INDOOR_NAVIGATION,
        confidence: 0.94,
        spokenResponse:
          'تحت أمرك، امسح كود الـ QR اللي جنبك وقولي عايز تروح فين',
        actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_QR,
      };
    }

    // Default when no recognized intent matches
    throw new AppException(AppErrorCode.INTENT_NOT_RECOGNIZED);
  }
}
