import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppErrorCode } from '../../common/constants/error-codes';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  ApiErrorExamples,
  ApiOkEnvelope,
} from '../../common/decorators/swagger.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TokenBucketRateLimitGuard } from '../../common/guards/token-bucket-rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { VoiceAudioMulterInterceptor } from './interceptors/voice-audio-multer.interceptor';
import { VoiceTranscribeDto } from './dto/voice-transcribe.dto';
import { VoiceTranscribeResultDto } from './dto/voice-transcribe-result.dto';
import { UploadedAudioFile, VOICE_AUDIO_MAX_BYTES } from './voice.constants';

@ApiTags('Voice Assistant')
@ApiBearerAuth('JWT')
@Controller('voice')
@UseGuards(JwtAuthGuard, TokenBucketRateLimitGuard)
export class VoiceTranscribeController {
  constructor(
    private readonly voiceTranscriptionService: VoiceTranscriptionService,
  ) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    capacity: 3,
    refillRate: 0.2,
    cost: 1,
    keyPrefix: 'voice_transcribe',
  })
  @ApiOperation({
    summary: 'Transcribe speech audio file to text',
    description:
      'Transcribes uploaded audio recordings to text via the AI speech service, enforcing user cloud AI consent and file size/format constraints.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Audio file to transcribe with optional language parameter',
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio recording file (WAV, MP3, MP4, M4A, WebM, OGG up to 5MB)',
        },
        language: {
          type: 'string',
          enum: ['ar-EG', 'en-US'],
          default: 'ar-EG',
          description: 'Spoken language/dialect locale',
        },
      },
    },
  })
  @ApiHeader({
    name: 'X-Correlation-ID',
    required: false,
    description: 'Unique trace identifier for end-to-end request tracking',
  })
  @ApiOkEnvelope(VoiceTranscribeResultDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.TOO_MANY_REQUESTS,
    AppErrorCode.CONSENT_REQUIRED,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.AUDIO_TOO_LARGE,
    AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
    AppErrorCode.NO_SPEECH_DETECTED,
    AppErrorCode.REQUEST_TIMEOUT,
    AppErrorCode.SERVICE_UNAVAILABLE,
  )
  @UseInterceptors(
    VoiceAudioMulterInterceptor,
    FileInterceptor('audio', {
      limits: { fileSize: VOICE_AUDIO_MAX_BYTES },
    }),
  )
  transcribe(
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Body() dto: VoiceTranscribeDto,
    @Headers('x-correlation-id') correlationId?: string,
    @CurrentUserId() userId?: string,
  ): Promise<VoiceTranscribeResultDto> {
    return this.voiceTranscriptionService.transcribeAudio(
      file,
      dto,
      userId!,
      correlationId,
    );
  }
}
