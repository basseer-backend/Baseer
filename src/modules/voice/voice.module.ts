import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PreferencesModule } from '../preferences/preferences.module';
import { VoiceController } from './voice.controller';
import { VoiceTranscribeController } from './voice-transcribe.controller';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { VoiceActionMapperService } from './voice-action-mapper.service';
import { VoiceAudioMulterInterceptor } from './interceptors/voice-audio-multer.interceptor';
import { HttpAiVoiceAgentClient } from './clients/http-ai-agent.client';
import { MockAiVoiceAgentClient } from './clients/mock-ai-agent.client';
import { AI_VOICE_AGENT_CLIENT } from './clients/ai-agent.interface';

@Module({
  imports: [PreferencesModule],
  controllers: [VoiceController, VoiceTranscribeController],
  providers: [
    VoiceAssistantService,
    VoiceTranscriptionService,
    VoiceActionMapperService,
    VoiceAudioMulterInterceptor,
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
    VoiceTranscriptionService,
    VoiceActionMapperService,
    AI_VOICE_AGENT_CLIENT,
  ],
})
export class VoiceModule {}
