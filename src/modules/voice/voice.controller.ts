import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceCommandResultDto } from './dto/voice-command-result.dto';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorator/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';

@ApiTags('Voice Assistant')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceAssistantService: VoiceAssistantService) {}

  @Post('command')
  @HttpCode(HttpStatus.OK)
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
    AppErrorCode.INTENT_NOT_RECOGNIZED,
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
