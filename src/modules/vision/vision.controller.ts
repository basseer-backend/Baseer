import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImageInputDto } from '../../common/dto/image-input.dto.js';
import { SceneDescriptionDto } from './dto/scene-description.dto.js';
import { CurrencyResultDto } from './dto/currency-result.dto.js';
import { ColorResultDto } from './dto/color-result.dto.js';
import { TrafficSignResultDto } from './dto/traffic-sign-result.dto.js';
import { FaceExpressionResultDto } from './dto/face-expression-result.dto.js';
import { ObstacleResultDto, HapticPattern } from './dto/obstacle-result.dto.js';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator.js';
import { AppErrorCode } from '../../common/constants/error-codes.js';
import { validateImageInput } from '../../common/helpers/image-validation.helper.js';

@ApiTags('Computer Vision')
@Controller('vision')
export class VisionController {
  @Post('describe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Describe objects and general scene in front of user',
    description:
      'Provides full Arabic contextual description of surroundings. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(SceneDescriptionDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  describeScene(@Body() body: ImageInputDto): SceneDescriptionDto {
    validateImageInput(body.imageBase64);
    return {
      description:
        'أمامك طاولة خشبية عليها زجاجة ماء ومفتاح، وعلى يمينك مقعد فارغ',
      detectedObjects: ['table', 'bottle', 'key', 'chair'],
      confidence: 0.92,
    };
  }

  @Post('currency')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recognize Egyptian currency banknotes',
    description:
      'Identifies Egyptian banknotes with value and verbal announcement. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(CurrencyResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  recognizeCurrency(@Body() body: ImageInputDto): CurrencyResultDto {
    validateImageInput(body.imageBase64);
    return {
      denomination: 50,
      currency: 'EGP',
      spokenAnnouncement: 'خمسون جنيهاً مصرياً',
      condition: 'New Banknote',
      confidence: 0.98,
    };
  }

  @Post('color')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect dominant color of target object',
    description:
      'Extracts dominant color name in Arabic and English with confidence score. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(ColorResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  detectColor(@Body() body: ImageInputDto): ColorResultDto {
    validateImageInput(body.imageBase64);
    return {
      colorNameArabic: 'أزرق داكن',
      colorNameEnglish: 'Dark Blue',
      hexCode: '#002366',
      disclaimer: 'قد تتأثر دقة اللون بإضاءة الغرفة الحالية',
      confidence: 0.95,
    };
  }

  @Post('traffic-signs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recognize street traffic signs',
    description:
      'Identifies pedestrian and street traffic safety signs. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(TrafficSignResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  recognizeTrafficSign(@Body() body: ImageInputDto): TrafficSignResultDto {
    validateImageInput(body.imageBase64);
    return {
      signName: 'Pedestrian Crossing',
      spokenMeaning: 'إشارة عبور مشاة، يمكنك العبور بحذر',
      confidence: 0.91,
    };
  }

  @Post('face-expression')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect facial expressions of person in frame',
    description:
      'Detects emotions and facial expressions for social awareness. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(FaceExpressionResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  detectFaceExpression(@Body() body: ImageInputDto): FaceExpressionResultDto {
    validateImageInput(body.imageBase64);
    return {
      expression: 'Smiling / Happy',
      spokenDescription: 'الشخص الذي أمامك يبتسم ويبدو سعيداً',
      confidence: 0.88,
    };
  }

  @Post('obstacles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Real-time obstacle tracking and safety alert',
    description:
      'Warns of immediate physical dangers (stairs, holes, poles) with distance and haptic pattern. Fake test triggers: "blurry", "dark", "unsupported", "toolarge".',
  })
  @ApiOkEnvelope(ObstacleResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  detectObstacles(@Body() body: ImageInputDto): ObstacleResultDto {
    validateImageInput(body.imageBase64);
    return {
      hazardDetected: true,
      obstacleType: 'درج / سلم هابط',
      distanceMeters: 1.2,
      hapticAlertPattern: HapticPattern.STRONG_VIBRATION,
      spokenWarning: 'انتبه! أمامك درجات سلم على بعد خطوتين',
      confidence: 0.93,
    };
  }
}
