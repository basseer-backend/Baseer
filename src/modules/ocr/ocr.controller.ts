import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImageInputDto } from '../../common/dto/image-input.dto';
import { OcrResultDto } from './dto/ocr-result.dto';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import { validateImageInput } from '../../common/helpers/image-validation.helper';

@ApiTags('OCR & Documents')
@Controller('ocr')
export class OcrController {
  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read text from captured image (Prescription, Menu, Sign)',
    description:
      'Extracts text from Base64 image payload. Fake test triggers: pass imageBase64 as "blurry", "dark", "notext", "unsupported", or "toolarge".',
  })
  @ApiOkEnvelope(OcrResultDto)
  @ApiErrorExamples(
    AppErrorCode.IMAGE_BLURRY,
    AppErrorCode.IMAGE_TOO_DARK,
    AppErrorCode.NO_TEXT_DETECTED,
    AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.FILE_TOO_LARGE,
  )
  readDocument(@Body() body: ImageInputDto): OcrResultDto {
    validateImageInput(body.imageBase64, { allowNoTextTrigger: true });

    return {
      detectedLanguage: 'en',
      extractedText:
        'Panadol Extra 500mg - Take 2 tablets every 8 hours after meals.',
      arabicSimplifiedText:
        'بنادول إكسترا 500 مجم - قرصين كل 8 ساعات بعد الأكل',
      confidence: 0.96,
    };
  }
}
