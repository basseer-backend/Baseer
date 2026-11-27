import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceCommandResultDto } from './dto/voice-command-result.dto';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TokenBucketRateLimitGuard } from '../../common/guards/token-bucket-rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('Voice Assistant')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TokenBucketRateLimitGuard)
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceAssistantService: VoiceAssistantService) {}

  @Post('command')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    capacity: 10,
    refillRate: 1,
    cost: 1,
    keyPrefix: 'voice_command',
  })
  @ApiOperation({
    summary: 'Process voice command transcript and return classified intent',
    description:
      'Coordinates with the AI Agent to identify intent, map mobile triggers, and generate Arabic spoken responses.',
  })
  @ApiHeader({
    name: 'X-Correlation-ID',
    required: false,
    description: 'Unique trace identifier for end-to-end request tracking',
  })
  @ApiOkEnvelope(VoiceCommandResultDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.TOO_MANY_REQUESTS,
    AppErrorCode.INTENT_NOT_RECOGNIZED,
    AppErrorCode.LOW_CONFIDENCE,
    AppErrorCode.REQUEST_TIMEOUT,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.SERVICE_UNAVAILABLE,
  )
  processCommand(
    @Body() body: VoiceCommandDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<VoiceCommandResultDto> {
    return this.voiceAssistantService.processCommand(body, correlationId);
  }
}
