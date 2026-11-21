import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_VOICE_AGENT_CLIENT,
  IAiVoiceAgentClient,
} from './clients/ai-agent.interface';
import { VoiceActionMapperService } from './voice-action-mapper.service';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceCommandResultDto } from './dto/voice-command-result.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';

@Injectable()
export class VoiceAssistantService {
  private readonly logger = new Logger(VoiceAssistantService.name);

  constructor(
    @Inject(AI_VOICE_AGENT_CLIENT)
    private readonly aiAgentClient: IAiVoiceAgentClient,
    private readonly actionMapper: VoiceActionMapperService,
  ) {}

  /**
   * Orchestrates the voice command workflow:
   * 1. Calls the AI Agent client to classify the intent semantically.
   * 2. Handles confidence scores realistically (zero fabrication).
   * 3. Maps recognized intents to Baseer MobileAction triggers.
   * 4. Handles clarification and unsupported intent states.
   */
  async processCommand(
    dto: VoiceCommandDto,
    correlationId?: string,
  ): Promise<VoiceCommandResultDto> {
    const speechText = dto.userSpeech.trim();
    if (!speechText) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'النص الصوتي مطلوب ولا يمكن أن يكون فارغاً',
      );
    }

    this.logger.debug(
      `[VoiceAssistantService] Processing voice query: "${speechText.slice(0, 50)}..."`,
    );

    // 1. Delegate intent classification to the AI Agent integration client
    const aiResult = await this.aiAgentClient.classifyIntent(
      speechText,
      dto.language || 'ar-EG',
      correlationId,
    );

    // 2. Strict mapping to Baseer domain actions and spoken responses
    const mapping = this.actionMapper.mapAiResultToAction(aiResult);

    // 3. Assemble backward-compatible result DTO
    return {
      userInput: speechText,
      detectedIntent: mapping.detectedIntent,
      confidence: aiResult.confidence,
      spokenResponse: mapping.spokenResponse,
      actionToTriggerOnMobile: mapping.actionToTriggerOnMobile,
      requiresClarification: aiResult.requiresClarification,
      entities: Object.keys(aiResult.entities).length > 0 ? aiResult.entities : undefined,
    };
  }
}
