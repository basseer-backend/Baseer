import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoiceController } from './voice.controller';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceActionMapperService } from './voice-action-mapper.service';
import { HttpAiVoiceAgentClient } from './clients/http-ai-agent.client';
import { MockAiVoiceAgentClient } from './clients/mock-ai-agent.client';
import { AI_VOICE_AGENT_CLIENT } from './clients/ai-agent.interface';

@Module({
  controllers: [VoiceController],
  providers: [
    VoiceAssistantService,
    VoiceActionMapperService,
    HttpAiVoiceAgentClient,
    MockAiVoiceAgentClient,
    {
      provide: AI_VOICE_AGENT_CLIENT,
      useFactory: (
        configService: ConfigService,
        httpClient: HttpAiVoiceAgentClient,
        mockClient: MockAiVoiceAgentClient,
      ) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const isMockEnabled =
          configService.get<string>('AI_VOICE_AGENT_MOCK_ENABLED') === 'true' ||
          configService.get<string>('USE_MOCK_AI_AGENT') === 'true';

        // Strict Production Protection: Never allow mock client in production
        if (isProduction && isMockEnabled) {
          throw new Error(
            'CRITICAL SECURITY ERROR: Mock AI Agent cannot be enabled in production!',
          );
        }

        if (!isProduction && isMockEnabled) {
          return mockClient;
        }

        return httpClient;
      },
      inject: [ConfigService, HttpAiVoiceAgentClient, MockAiVoiceAgentClient],
    },
  ],
  exports: [
    VoiceAssistantService,
    VoiceActionMapperService,
    AI_VOICE_AGENT_CLIENT,
  ],
})
export class VoiceModule {}
