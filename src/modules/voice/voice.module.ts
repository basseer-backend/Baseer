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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TokenBucketRateLimitGuard } from '../../common/guards/token-bucket-rate-limit.guard';
import { SPEECH_SERVICE_CLIENT } from './interfaces/speech-service-client.interface';
import { UnconfiguredSpeechClient } from './clients/unconfigured-speech.client';
import { MockSpeechClient } from './clients/mock-speech.client';
import { AudioProcessorService } from './services/audio-processor.service';

@Module({
  imports: [PreferencesModule],
  controllers: [VoiceController, VoiceTranscribeController],
  providers: [
    VoiceAssistantService,
    VoiceTranscriptionService,
    VoiceActionMapperService,
    AudioProcessorService,
    VoiceAudioMulterInterceptor,
    HttpAiVoiceAgentClient,
    MockAiVoiceAgentClient,
    JwtAuthGuard,
    TokenBucketRateLimitGuard,
    UnconfiguredSpeechClient,
    MockSpeechClient,
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
    {
      provide: SPEECH_SERVICE_CLIENT,
      useFactory: (
        configService: ConfigService,
        unconfiguredClient: UnconfiguredSpeechClient,
        mockClient: MockSpeechClient,
      ) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const isMockEnabled =
          configService.get<string>('SPEECH_SERVICE_MOCK_ENABLED') === 'true';

        // Strict Production Protection: Never allow mock client in production
        if (isProduction && isMockEnabled) {
          throw new Error(
            'CRITICAL SECURITY ERROR: Mock Speech Service cannot be enabled in production!',
          );
        }

        if (!isProduction && isMockEnabled) {
          return mockClient;
        }

        return unconfiguredClient;
      },
      inject: [ConfigService, UnconfiguredSpeechClient, MockSpeechClient],
    },
  ],
  exports: [
    VoiceAssistantService,
    VoiceTranscriptionService,
    VoiceActionMapperService,
    AudioProcessorService,
    AI_VOICE_AGENT_CLIENT,
    SPEECH_SERVICE_CLIENT,
    TokenBucketRateLimitGuard,
  ],
})
export class VoiceModule {}
